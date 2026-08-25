-- =========================================================
-- Atelier SaaS — schéma Supabase complet
-- À coller tel quel dans : Supabase -> SQL Editor -> Run
-- =========================================================

create extension if not exists pgcrypto;

-- ---------- Tables ----------

create table if not exists public.ateliers (
  id                   uuid primary key default gen_random_uuid(),
  nom                  text not null,
  slogan               text not null default '',
  logo                 text not null default '',   -- image en data-url, compressée par l'application
  tel_whatsapp         text not null default '',
  tel_appel            text not null default '',
  devise               text not null default 'FCFA',
  indicatif            text not null default '229',
  abonnement_mensuel   numeric not null default 5000,
  abonnement_fin       timestamptz not null default now() + interval '14 days',
  modele_whatsapp      text not null default 'Bonjour {prenom} 👋' || E'\n' ||
    'Votre commande {numero} chez {atelier} :' || E'\n' ||
    '• Livraison prévue : {livraison}' || E'\n' ||
    '• Montant : {montant}' || E'\n' ||
    '• Acompte reçu : {acompte}' || E'\n' ||
    '• Reste à payer : {solde}' || E'\n' ||
    'Merci pour votre confiance !',
  modele_whatsapp_pret text not null default 'Bonjour {prenom} 👋' || E'\n' ||
    'Bonne nouvelle : votre commande {numero} est prête ! ' ||
    'Vous pouvez passer la récupérer chez {atelier}.' || E'\n' ||
    'Reste à payer : {solde}.',
  cree_le              timestamptz not null default now()
);

create table if not exists public.profils (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null default '',
  role         text not null default 'admin' check (role in ('superadmin', 'admin')),
  atelier_id   uuid references public.ateliers (id) on delete set null,
  nom_complet  text not null default '',
  telephone    text not null default '',
  cree_le      timestamptz not null default now()
);

create table if not exists public.clients (
  id           uuid primary key default gen_random_uuid(),
  atelier_id   uuid not null references public.ateliers (id) on delete cascade,
  prenom       text not null default '',
  nom          text not null default '',
  tel          text not null default '',
  tel_whatsapp text not null default '',
  note         text not null default '',
  mesures      jsonb not null default '{}',
  cree_le      timestamptz not null default now(),
  modifie_le   timestamptz not null default now()
);

create table if not exists public.commandes (
  id             uuid primary key default gen_random_uuid(),
  atelier_id     uuid not null references public.ateliers (id) on delete cascade,
  numero         text not null,
  client_id      uuid not null references public.clients (id) on delete cascade,
  description    text not null default '',
  statut         text not null default 'en_cours' check (statut in ('en_cours', 'pret', 'livree')),
  date_livraison date not null,
  montant        numeric not null default 0,
  paiements      jsonb not null default '[]',
  livre_le       timestamptz,
  cree_le        timestamptz not null default now(),
  modifie_le     timestamptz not null default now()
);

create table if not exists public.photos (
  id          uuid primary key default gen_random_uuid(),
  atelier_id  uuid not null references public.ateliers (id) on delete cascade,
  commande_id uuid not null references public.commandes (id) on delete cascade,
  data_url    text not null,
  cree_le     timestamptz not null default now()
);

create table if not exists public.depenses (
  id           uuid primary key default gen_random_uuid(),
  atelier_id   uuid not null references public.ateliers (id) on delete cascade,
  libelle      text not null,
  montant      numeric not null,
  date_depense date not null default current_date,
  note         text not null default '',
  cree_le      timestamptz not null default now()
);

-- Compteur de numéros de commande par atelier.
-- RLS activée SANS règle : la table est inaccessible aux clients,
-- seule la fonction numero_commande_suivant() y touche.
create table if not exists public.compteurs (
  atelier_id uuid primary key references public.ateliers (id) on delete cascade,
  prochain   integer not null default 1
);

create index if not exists clients_par_atelier on public.clients (atelier_id);
create index if not exists commandes_par_atelier on public.commandes (atelier_id);
create index if not exists commandes_par_client on public.commandes (client_id);
create index if not exists photos_par_commande on public.photos (commande_id);
create index if not exists depenses_par_atelier on public.depenses (atelier_id);
create index if not exists profils_par_atelier on public.profils (atelier_id);

-- ---------- Fonctions d'identité ----------

create or replace function public.role_courant()
returns text language sql stable security definer set search_path = public as
$$ select role from public.profils where id = auth.uid() $$;

create or replace function public.atelier_courant()
returns uuid language sql stable security definer set search_path = public as
$$ select atelier_id from public.profils where id = auth.uid() $$;

-- ---------- Nouveaux comptes : profil créé automatiquement ----------
-- Tout compte auto-inscrit naît « admin sans atelier » : inutilisable tant
-- que le superadmin ne l'a pas relié à un atelier.

create or replace function public.gerer_nouvel_utilisateur()
returns trigger language plpgsql security definer set search_path = public as
$$
begin
  insert into public.profils (id, email, role, nom_complet, telephone)
  values (
    new.id,
    coalesce(new.email, ''),
    'admin',
    coalesce(new.raw_user_meta_data ->> 'nom_complet', ''),
    coalesce(new.raw_user_meta_data ->> 'telephone', '')
  );
  return new;
end
$$;

drop trigger if exists sur_nouvel_utilisateur on auth.users;
create trigger sur_nouvel_utilisateur
  after insert on auth.users
  for each row execute function public.gerer_nouvel_utilisateur();

-- ---------- Garde-fous ----------
-- Un admin ne peut ni changer son rôle ni se rattacher lui-même à un atelier.

create or replace function public.proteger_profil()
returns trigger language plpgsql security definer set search_path = public as
$$
begin
  -- auth.uid() est nul hors application (éditeur SQL, service_role) :
  -- ces contextes de confiance ne sont pas bridés.
  if auth.uid() is not null and public.role_courant() is distinct from 'superadmin' then
    new.role := old.role;
    new.atelier_id := old.atelier_id;
  end if;
  return new;
end
$$;

drop trigger if exists garde_profil on public.profils;
create trigger garde_profil
  before update on public.profils
  for each row execute function public.proteger_profil();

-- Un admin ne peut pas modifier l'identité ni l'abonnement de son atelier.

create or replace function public.proteger_atelier()
returns trigger language plpgsql security definer set search_path = public as
$$
begin
  if auth.uid() is not null and public.role_courant() is distinct from 'superadmin' then
    new.nom := old.nom;
    new.devise := old.devise;
    new.indicatif := old.indicatif;
    new.abonnement_mensuel := old.abonnement_mensuel;
    new.abonnement_fin := old.abonnement_fin;
  end if;
  return new;
end
$$;

drop trigger if exists garde_atelier on public.ateliers;
create trigger garde_atelier
  before update on public.ateliers
  for each row execute function public.proteger_atelier();

-- Chaque atelier reçoit son compteur de commandes à la création.

create or replace function public.creer_compteur_atelier()
returns trigger language plpgsql security definer set search_path = public as
$$
begin
  insert into public.compteurs (atelier_id) values (new.id)
  on conflict (atelier_id) do nothing;
  return new;
end
$$;

drop trigger if exists compteur_apres_atelier on public.ateliers;
create trigger compteur_apres_atelier
  after insert on public.ateliers
  for each row execute function public.creer_compteur_atelier();

-- ---------- Numérotation des commandes ----------

create or replace function public.numero_commande_suivant()
returns text language plpgsql security definer set search_path = public as
$$
declare
  a uuid;
  n integer;
begin
  select atelier_id into a from public.profils where id = auth.uid();
  if a is null then
    raise exception 'Aucun atelier associé à ce compte';
  end if;
  update public.compteurs set prochain = prochain + 1
  where atelier_id = a
  returning prochain - 1 into n;
  return 'CMD-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 4, '0');
end
$$;

grant execute on function public.numero_commande_suivant() to authenticated;

-- ---------- Règles d'accès (RLS) ----------

alter table public.ateliers  enable row level security;
alter table public.profils   enable row level security;
alter table public.clients   enable row level security;
alter table public.commandes enable row level security;
alter table public.photos    enable row level security;
alter table public.depenses  enable row level security;
alter table public.compteurs enable row level security;  -- aucune règle : accès direct interdit

drop policy if exists ateliers_lecture on public.ateliers;
create policy ateliers_lecture on public.ateliers for select to authenticated
  using (public.role_courant() = 'superadmin' or id = public.atelier_courant());

drop policy if exists ateliers_creation on public.ateliers;
create policy ateliers_creation on public.ateliers for insert to authenticated
  with check (public.role_courant() = 'superadmin');

drop policy if exists ateliers_modification on public.ateliers;
create policy ateliers_modification on public.ateliers for update to authenticated
  using (public.role_courant() = 'superadmin' or id = public.atelier_courant());

drop policy if exists ateliers_suppression on public.ateliers;
create policy ateliers_suppression on public.ateliers for delete to authenticated
  using (public.role_courant() = 'superadmin');

drop policy if exists profils_lecture on public.profils;
create policy profils_lecture on public.profils for select to authenticated
  using (public.role_courant() = 'superadmin' or id = auth.uid());

drop policy if exists profils_modification on public.profils;
create policy profils_modification on public.profils for update to authenticated
  using (public.role_courant() = 'superadmin' or id = auth.uid());

drop policy if exists profils_suppression on public.profils;
create policy profils_suppression on public.profils for delete to authenticated
  using (public.role_courant() = 'superadmin');

-- Données métier : chaque atelier ne voit et ne touche que les siennes.

drop policy if exists clients_par_atelier on public.clients;
create policy clients_par_atelier on public.clients for all to authenticated
  using (atelier_id = public.atelier_courant())
  with check (atelier_id = public.atelier_courant());

drop policy if exists commandes_par_atelier on public.commandes;
create policy commandes_par_atelier on public.commandes for all to authenticated
  using (atelier_id = public.atelier_courant())
  with check (atelier_id = public.atelier_courant());

drop policy if exists photos_par_atelier on public.photos;
create policy photos_par_atelier on public.photos for all to authenticated
  using (atelier_id = public.atelier_courant())
  with check (atelier_id = public.atelier_courant());

drop policy if exists depenses_par_atelier on public.depenses;
create policy depenses_par_atelier on public.depenses for all to authenticated
  using (atelier_id = public.atelier_courant())
  with check (atelier_id = public.atelier_courant());
