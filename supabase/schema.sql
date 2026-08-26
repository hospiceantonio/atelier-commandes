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

-- =========================================================
-- Paiement de l'abonnement par KKiaPay
-- =========================================================

-- Réglages de paiement (une seule ligne) : la clé publique KKiaPay est
-- faite pour être côté client ; la ranger en base permet de passer du
-- bac à sable à la production sans reconstruire le site ni l'APK.
create table if not exists public.parametres (
  id                   integer primary key default 1 check (id = 1),
  kkiapay_cle_publique text not null default '',
  kkiapay_sandbox      boolean not null default true,
  modifie_le           timestamptz not null default now()
);

insert into public.parametres (id) values (1) on conflict (id) do nothing;

alter table public.parametres enable row level security;

drop policy if exists parametres_lecture on public.parametres;
create policy parametres_lecture on public.parametres for select to authenticated
  using (true);

drop policy if exists parametres_modification on public.parametres;
create policy parametres_modification on public.parametres for update to authenticated
  using (public.role_courant() = 'superadmin')
  with check (public.role_courant() = 'superadmin');

-- Journal des paiements reçus. Aucune règle d'écriture : seule la
-- fonction appelée par le webhook (service_role) y insère.
create table if not exists public.paiements_abonnement (
  id         uuid primary key default gen_random_uuid(),
  atelier_id uuid not null references public.ateliers (id) on delete cascade,
  reference  text not null,     -- 'kkiapay:<transactionId>' : l'unicité rend le crédit idempotent
  montant    numeric not null,
  mois       integer not null,
  fin_avant  timestamptz,
  fin_apres  timestamptz,
  cree_le    timestamptz not null default now()
);

create unique index if not exists paiements_reference_unique on public.paiements_abonnement (reference);
create index if not exists paiements_par_atelier on public.paiements_abonnement (atelier_id);

alter table public.paiements_abonnement enable row level security;

drop policy if exists paiements_lecture on public.paiements_abonnement;
create policy paiements_lecture on public.paiements_abonnement for select to authenticated
  using (public.role_courant() = 'superadmin' or atelier_id = public.atelier_courant());

-- Crédit idempotent : appelée uniquement par le webhook, avec le montant
-- annoncé par KKiaPay (jamais celui demandé par l'application). KKiaPay
-- rejoue sa notification jusqu'à 5 fois : la référence unique garantit
-- qu'un même paiement ne prolonge qu'une seule fois.
create or replace function public.prolonger_abonnement_kkiapay(
  p_atelier uuid, p_reference text, p_montant numeric
) returns jsonb language plpgsql security definer set search_path = public as
$$
declare
  a public.ateliers%rowtype;
  n_mois integer;
  nouvelle_fin timestamptz;
begin
  if exists (select 1 from public.paiements_abonnement where reference = p_reference) then
    return jsonb_build_object('statut', 'deja_traite');
  end if;
  select * into a from public.ateliers where id = p_atelier for update;
  if not found then
    return jsonb_build_object('statut', 'atelier_inconnu');
  end if;
  n_mois := floor(p_montant / nullif(a.abonnement_mensuel, 0))::integer;
  if n_mois is null or n_mois < 1 then
    return jsonb_build_object('statut', 'montant_insuffisant');
  end if;
  n_mois := least(n_mois, 12);
  nouvelle_fin := greatest(a.abonnement_fin, now()) + make_interval(days => 31 * n_mois);
  update public.ateliers set abonnement_fin = nouvelle_fin where id = a.id;
  insert into public.paiements_abonnement (atelier_id, reference, montant, mois, fin_avant, fin_apres)
  values (a.id, p_reference, p_montant, n_mois, a.abonnement_fin, nouvelle_fin);
  return jsonb_build_object('statut', 'ok', 'mois', n_mois, 'fin', nouvelle_fin);
exception when unique_violation then
  return jsonb_build_object('statut', 'deja_traite');
end
$$;

-- La fonction ignore RLS : elle doit être inappelable depuis les
-- applications. Les privilèges par défaut de Supabase donnent EXECUTE à
-- anon et authenticated : les révoquer explicitement est indispensable.
revoke all on function public.prolonger_abonnement_kkiapay(uuid, text, numeric)
  from public, anon, authenticated;
grant execute on function public.prolonger_abonnement_kkiapay(uuid, text, numeric) to service_role;

-- =========================================================
-- Vitrine publique : réalisations (produits) des ateliers
-- =========================================================

-- Numéro WhatsApp du superadministrateur, affiché sur la page de
-- connexion (« Vous êtes un atelier ou un styliste ? Enregistrez-vous »).
alter table public.parametres add column if not exists contact_whatsapp text not null default '';

-- La page publique (visiteurs non connectés) lit les paramètres :
-- ils ne contiennent que des valeurs publiques par conception.
drop policy if exists parametres_lecture on public.parametres;
create policy parametres_lecture on public.parametres for select to anon, authenticated
  using (true);

create table if not exists public.produits (
  id           uuid primary key default gen_random_uuid(),
  atelier_id   uuid not null references public.ateliers (id) on delete cascade,
  nom          text not null,
  code         text not null default '',
  categorie    text not null default 'Autres',
  prix         numeric not null default 0,
  prix_visible boolean not null default true,
  couverture   text not null default '',  -- miniature (data-url) pour les listes
  cree_le      timestamptz not null default now(),
  modifie_le   timestamptz not null default now()
);

create table if not exists public.photos_produits (
  id         uuid primary key default gen_random_uuid(),
  atelier_id uuid not null references public.ateliers (id) on delete cascade,
  produit_id uuid not null references public.produits (id) on delete cascade,
  data_url   text not null,
  position   integer not null default 0,
  cree_le    timestamptz not null default now()
);

create index if not exists produits_par_atelier on public.produits (atelier_id);
create index if not exists photos_produits_par_produit on public.photos_produits (produit_id);

-- Un atelier est « actif » quand son abonnement est à jour : seules les
-- vitrines des ateliers actifs sont visibles du public.
create or replace function public.atelier_actif(p_atelier uuid)
returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.ateliers where id = p_atelier and abonnement_fin > now()) $$;

alter table public.produits enable row level security;
alter table public.photos_produits enable row level security;

drop policy if exists produits_lecture_publique on public.produits;
create policy produits_lecture_publique on public.produits for select to anon, authenticated
  using (public.atelier_actif(atelier_id)
         or atelier_id = public.atelier_courant()
         or public.role_courant() = 'superadmin');

drop policy if exists produits_gestion on public.produits;
create policy produits_gestion on public.produits for all to authenticated
  using (atelier_id = public.atelier_courant())
  with check (atelier_id = public.atelier_courant());

drop policy if exists photos_produits_lecture_publique on public.photos_produits;
create policy photos_produits_lecture_publique on public.photos_produits for select to anon, authenticated
  using (public.atelier_actif(atelier_id)
         or atelier_id = public.atelier_courant()
         or public.role_courant() = 'superadmin');

drop policy if exists photos_produits_gestion on public.photos_produits;
create policy photos_produits_gestion on public.photos_produits for all to authenticated
  using (atelier_id = public.atelier_courant())
  with check (atelier_id = public.atelier_courant());

-- Vue publique des ateliers actifs : uniquement les colonnes vitrines
-- (jamais l'abonnement). La vue appartient à postgres et ignore le RLS
-- de la table : c'est voulu, elle borne elle-même ce qu'elle expose.
create or replace view public.ateliers_publics as
  select id, nom, slogan, logo, tel_whatsapp, tel_appel, devise, indicatif
  from public.ateliers
  where abonnement_fin > now();

grant select on public.ateliers_publics to anon, authenticated;
