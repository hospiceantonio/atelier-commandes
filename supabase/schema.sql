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
    '• Modèle : {description}' || E'\n' ||
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
  role         text not null default 'admin' check (role in ('superadmin', 'admin', 'moderateur')),
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

-- Vrai pour l'administrateur d'un atelier : lui seul modifie et supprime.
-- Un modérateur crée et consulte, mais ne défait rien.
create or replace function public.est_admin()
returns boolean language sql stable security definer set search_path = public as
$$ select coalesce(public.role_courant() = 'admin', false) $$;

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
declare
  r text;
begin
  -- auth.uid() est nul hors application (éditeur SQL, service_role) :
  -- ces contextes de confiance ne sont pas bridés.
  if auth.uid() is null then
    return new;
  end if;
  r := public.role_courant();
  if r = 'superadmin' then
    return new;
  end if;

  -- Un administrateur gère les modérateurs de SON atelier, et rien d'autre :
  -- il ne peut créer ni promouvoir un administrateur, ni toucher un compte
  -- déjà rattaché à un autre atelier, ni se modifier lui-même.
  if r = 'admin'
     and old.id <> auth.uid()
     and new.role = 'moderateur'
     and new.atelier_id = public.atelier_courant()
     and (old.atelier_id = public.atelier_courant()
          or (old.atelier_id is null and old.cree_le > now() - interval '1 hour')) then
    return new;
  end if;

  new.role := old.role;
  new.atelier_id := old.atelier_id;
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
  -- Les fonctions de crédit d'abonnement (code, paiement) posent ce
  -- drapeau le temps de leur transaction ; il n'est pas atteignable
  -- depuis l'application.
  if coalesce(current_setting('app.abonnement_interne', true), '') = 'on' then
    return new;
  end if;
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
  using (public.role_courant() = 'superadmin'
         or id = auth.uid()
         or (public.est_admin() and atelier_id = public.atelier_courant()));

drop policy if exists profils_modification on public.profils;
create policy profils_modification on public.profils for update to authenticated
  using (public.role_courant() = 'superadmin'
         or id = auth.uid()
         or (public.est_admin()
             and (atelier_id = public.atelier_courant()
                  -- compte tout juste créé par l'administrateur, pas encore rattaché
                  or (atelier_id is null and cree_le > now() - interval '1 hour'))));

drop policy if exists profils_suppression on public.profils;
create policy profils_suppression on public.profils for delete to authenticated
  using (public.role_courant() = 'superadmin'
         or (public.est_admin() and atelier_id = public.atelier_courant() and role = 'moderateur'));

-- Données métier : chaque atelier ne voit et ne touche que les siennes.
-- Dans un atelier, le modérateur crée et consulte ; seul l'administrateur
-- modifie et supprime. Ces règles sont posées côté serveur : masquer les
-- boutons dans l'application ne suffirait pas.

drop policy if exists clients_par_atelier on public.clients;
drop policy if exists clients_lecture on public.clients;
create policy clients_lecture on public.clients for select to authenticated
  using (atelier_id = public.atelier_courant());
drop policy if exists clients_creation on public.clients;
create policy clients_creation on public.clients for insert to authenticated
  with check (atelier_id = public.atelier_courant());
drop policy if exists clients_modification on public.clients;
create policy clients_modification on public.clients for update to authenticated
  using (atelier_id = public.atelier_courant())
  with check (atelier_id = public.atelier_courant());
drop policy if exists clients_suppression on public.clients;
create policy clients_suppression on public.clients for delete to authenticated
  using (atelier_id = public.atelier_courant() and public.est_admin());

drop policy if exists commandes_par_atelier on public.commandes;
drop policy if exists commandes_lecture on public.commandes;
create policy commandes_lecture on public.commandes for select to authenticated
  using (atelier_id = public.atelier_courant());
drop policy if exists commandes_creation on public.commandes;
create policy commandes_creation on public.commandes for insert to authenticated
  with check (atelier_id = public.atelier_courant());
drop policy if exists commandes_modification on public.commandes;
create policy commandes_modification on public.commandes for update to authenticated
  using (atelier_id = public.atelier_courant() and public.est_admin())
  with check (atelier_id = public.atelier_courant());
drop policy if exists commandes_suppression on public.commandes;
create policy commandes_suppression on public.commandes for delete to authenticated
  using (atelier_id = public.atelier_courant() and public.est_admin());

drop policy if exists photos_par_atelier on public.photos;
drop policy if exists photos_lecture on public.photos;
create policy photos_lecture on public.photos for select to authenticated
  using (atelier_id = public.atelier_courant());
drop policy if exists photos_creation on public.photos;
create policy photos_creation on public.photos for insert to authenticated
  with check (atelier_id = public.atelier_courant());
drop policy if exists photos_suppression on public.photos;
create policy photos_suppression on public.photos for delete to authenticated
  using (atelier_id = public.atelier_courant() and public.est_admin());

-- Les dépenses relèvent de la gestion : administrateur seulement.
drop policy if exists depenses_par_atelier on public.depenses;
create policy depenses_par_atelier on public.depenses for all to authenticated
  using (atelier_id = public.atelier_courant() and public.est_admin())
  with check (atelier_id = public.atelier_courant() and public.est_admin());

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

-- Le superadmin inscrit lui-même les renouvellements encaissés hors
-- ligne (espèces, virement) : l'historique reste ainsi complet.
drop policy if exists paiements_creation on public.paiements_abonnement;
create policy paiements_creation on public.paiements_abonnement for insert to authenticated
  with check (public.role_courant() = 'superadmin');

drop policy if exists paiements_suppression on public.paiements_abonnement;
create policy paiements_suppression on public.paiements_abonnement for delete to authenticated
  using (public.role_courant() = 'superadmin');

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

-- La vitrine (et donc le stock) est tenue par l'administrateur.
drop policy if exists produits_gestion on public.produits;
create policy produits_gestion on public.produits for all to authenticated
  using (atelier_id = public.atelier_courant() and public.est_admin())
  with check (atelier_id = public.atelier_courant() and public.est_admin());

drop policy if exists photos_produits_lecture_publique on public.photos_produits;
create policy photos_produits_lecture_publique on public.photos_produits for select to anon, authenticated
  using (public.atelier_actif(atelier_id)
         or atelier_id = public.atelier_courant()
         or public.role_courant() = 'superadmin');

drop policy if exists photos_produits_gestion on public.photos_produits;
create policy photos_produits_gestion on public.photos_produits for all to authenticated
  using (atelier_id = public.atelier_courant() and public.est_admin())
  with check (atelier_id = public.atelier_courant() and public.est_admin());

-- Vue publique des ateliers actifs : uniquement les colonnes vitrines
-- (jamais l'abonnement). La vue appartient à postgres et ignore le RLS
-- de la table : c'est voulu, elle borne elle-même ce qu'elle expose.
create or replace view public.ateliers_publics as
  select id, nom, slogan, logo, tel_whatsapp, tel_appel, devise, indicatif
  from public.ateliers
  where abonnement_fin > now();

grant select on public.ateliers_publics to anon, authenticated;

-- Commentaire libre saisi à la prise de commande (précisions du client,
-- retouches convenues, particularités du tissu…).
alter table public.commandes add column if not exists commentaire text not null default '';

-- Les ateliers qui n'ont pas personnalisé leur modèle reçoivent la ligne
-- « Modèle » ; ceux qui l'ont modifié ne sont pas touchés.
update public.ateliers
   set modele_whatsapp = replace(modele_whatsapp,
         '• Livraison prévue :',
         '• Modèle : {description}' || E'\n' || '• Livraison prévue :')
 where modele_whatsapp like '%• Livraison prévue :%'
   and modele_whatsapp not like '%{description}%';


-- =========================================================
-- Codes de renouvellement d'abonnement (à usage unique)
-- =========================================================

create table if not exists public.codes_abonnement (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  lot         text not null default '',
  cree_le     timestamptz not null default now(),
  utilise_le  timestamptz,
  utilise_par uuid references public.ateliers (id) on delete set null
);

create index if not exists codes_par_lot on public.codes_abonnement (lot);

alter table public.codes_abonnement enable row level security;

-- Seul le superadministrateur voit et gère les codes. Un atelier ne
-- doit jamais pouvoir lire la table : il lirait tous les codes en vente.
drop policy if exists codes_superadmin on public.codes_abonnement;
create policy codes_superadmin on public.codes_abonnement for all to authenticated
  using (public.role_courant() = 'superadmin')
  with check (public.role_courant() = 'superadmin');

-- Génération d'un lot. Chaque code vaut un mois. Alphabet sans
-- caractères ambigus (ni 0/O ni 1/I), tirage cryptographique,
-- format ABCD-EFGH-JKLM.
-- search_path inclut « extensions » : Supabase y installe pgcrypto,
-- d'où vient gen_random_bytes. Sans cela la fonction est introuvable.
create or replace function public.generer_codes(
  p_nombre integer, p_lot text default ''
) returns setof public.codes_abonnement
language plpgsql security definer set search_path = public, extensions as
$$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i integer; j integer; brut text; complet text;
  nouveau public.codes_abonnement;
begin
  if public.role_courant() is distinct from 'superadmin' then
    raise exception 'Réservé au superadministrateur';
  end if;
  if p_nombre is null or p_nombre < 1 or p_nombre > 200 then
    raise exception 'Indiquez un nombre de codes entre 1 et 200';
  end if;

  for i in 1..p_nombre loop
    loop
      brut := '';
      for j in 1..12 loop
        brut := brut || substr(alphabet,
          1 + (get_byte(gen_random_bytes(1), 0) % length(alphabet)), 1);
      end loop;
      complet := substr(brut,1,4) || '-' || substr(brut,5,4) || '-' || substr(brut,9,4);
      begin
        insert into public.codes_abonnement (code, lot)
        values (complet, coalesce(p_lot, ''))
        returning * into nouveau;
        exit;
      exception when unique_violation then
        -- collision très improbable : on retire un code
      end;
    end loop;
    return next nouveau;
  end loop;
end
$$;

revoke all on function public.generer_codes(integer, text) from public, anon;
grant execute on function public.generer_codes(integer, text) to authenticated;

-- Utilisation d'un code par l'administrateur d'un atelier. Le verrou
-- « for update » interdit qu'un même code serve deux fois, même saisi
-- au même instant sur deux téléphones.
create or replace function public.utiliser_code(p_code text)
returns jsonb language plpgsql security definer set search_path = public as
$$
declare
  a public.ateliers%rowtype;
  ligne public.codes_abonnement%rowtype;
  nettoye text;
  nouvelle_fin timestamptz;
begin
  if public.role_courant() is distinct from 'admin' then
    raise exception 'Réservé à l''administrateur de l''atelier';
  end if;
  select * into a from public.ateliers where id = public.atelier_courant();
  if not found then
    raise exception 'Aucun atelier associé à ce compte';
  end if;

  nettoye := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if length(nettoye) <> 12 then
    return jsonb_build_object('statut', 'invalide');
  end if;
  nettoye := substr(nettoye,1,4) || '-' || substr(nettoye,5,4) || '-' || substr(nettoye,9,4);

  select * into ligne from public.codes_abonnement where code = nettoye for update;
  if not found then
    return jsonb_build_object('statut', 'invalide');
  end if;
  if ligne.utilise_le is not null then
    return jsonb_build_object('statut', 'deja_utilise');
  end if;

  -- Un code prolonge d'un mois, pas davantage.
  perform set_config('app.abonnement_interne', 'on', true);
  nouvelle_fin := greatest(a.abonnement_fin, now()) + interval '31 days';
  update public.ateliers set abonnement_fin = nouvelle_fin where id = a.id;
  update public.codes_abonnement
     set utilise_le = now(), utilise_par = a.id
   where id = ligne.id;
  insert into public.paiements_abonnement (atelier_id, reference, montant, mois, fin_avant, fin_apres)
  values (a.id, 'code:' || ligne.code, a.abonnement_mensuel, 1, a.abonnement_fin, nouvelle_fin);
  perform set_config('app.abonnement_interne', 'off', true);

  return jsonb_build_object('statut', 'ok', 'fin', nouvelle_fin);
end
$$;

revoke all on function public.utiliser_code(text) from public, anon;
grant execute on function public.utiliser_code(text) to authenticated;

-- L'insertion au journal des paiements vient aussi des codes.
drop policy if exists paiements_creation on public.paiements_abonnement;
create policy paiements_creation on public.paiements_abonnement for insert to authenticated
  with check (public.role_courant() = 'superadmin');

-- =========================================================
-- Tableau de bord du superadministrateur
-- =========================================================

-- Renvoie des compteurs, jamais des données d'atelier : le
-- superadministrateur voit l'activité de la plateforme sans accéder aux
-- clients, aux mesures ni aux commandes de ses ateliers abonnés.
-- La version sans période est remplacée par celle qui en accepte une :
-- sans le drop, un appel sans argument deviendrait ambigu entre les deux.
drop function if exists public.statistiques_plateforme();

-- p_debut / p_fin sont des jours (bornes incluses). Laissés à null,
-- seuls les totaux depuis le début sont renseignés.
create or replace function public.statistiques_plateforme(
  p_debut date default null, p_fin date default null
) returns jsonb language plpgsql stable security definer set search_path = public as
$$
declare
  d timestamptz;
  f timestamptz;
begin
  if public.role_courant() is distinct from 'superadmin' then
    raise exception 'Réservé au superadministrateur';
  end if;

  -- Bornes incluses : tout le jour de fin compte, d'où le + 1 jour.
  d := coalesce(p_debut, '-infinity'::date)::timestamptz;
  f := case when p_fin is null then 'infinity'::timestamptz
            else (p_fin + 1)::timestamptz end;

  return jsonb_build_object(
    -- État actuel de la plateforme : indépendant de la période.
    'ateliers',             (select count(*) from public.ateliers),
    'ateliers_actifs',      (select count(*) from public.ateliers where abonnement_fin > now()),
    'administrateurs',      (select count(*) from public.profils where role = 'admin' and atelier_id is not null),
    'moderateurs',          (select count(*) from public.profils where role = 'moderateur'),
    'bannieres',            (select count(*) from public.bannieres where active),
    'codes_disponibles',    (select count(*) from public.codes_abonnement where utilise_le is null),

    -- Totaux depuis le début.
    'encaisse_total',       (select coalesce(sum(montant), 0) from public.paiements_abonnement),
    'renouvellements',      (select count(*) from public.paiements_abonnement),
    'realisations',         (select count(*) from public.produits),
    'realisations_en_avant',(select count(*) from public.produits where en_avant),
    'clients',              (select count(*) from public.clients),
    'commandes',            (select count(*) from public.commandes),
    'commandes_livrees',    (select count(*) from public.commandes where statut = 'livree'),
    'factures',             (select count(*) from public.ventes),
    'factures_montant',     (select coalesce(sum(total), 0) from public.ventes),
    'codes_utilises',       (select count(*) from public.codes_abonnement where utilise_le is not null),

    -- Activité de la période demandée.
    'ateliers_periode',     (select count(*) from public.ateliers
                             where cree_le >= d and cree_le < f),
    'encaisse_periode',     (select coalesce(sum(montant), 0) from public.paiements_abonnement
                             where cree_le >= d and cree_le < f),
    'renouvellements_periode', (select count(*) from public.paiements_abonnement
                             where cree_le >= d and cree_le < f),
    'realisations_periode', (select count(*) from public.produits
                             where cree_le >= d and cree_le < f),
    'clients_periode',      (select count(*) from public.clients
                             where cree_le >= d and cree_le < f),
    'commandes_periode',    (select count(*) from public.commandes
                             where cree_le >= d and cree_le < f),
    -- Une commande compte le jour où elle est livrée, pas celui de sa création.
    'commandes_livrees_periode', (select count(*) from public.commandes
                             where livre_le is not null and livre_le >= d and livre_le < f),
    'factures_periode',     (select count(*) from public.ventes
                             where cree_le >= d and cree_le < f),
    'factures_montant_periode', (select coalesce(sum(total), 0) from public.ventes
                             where cree_le >= d and cree_le < f),
    'codes_utilises_periode', (select count(*) from public.codes_abonnement
                             where utilise_le is not null and utilise_le >= d and utilise_le < f)
  );
end
$$;

revoke all on function public.statistiques_plateforme(date, date) from public, anon;
grant execute on function public.statistiques_plateforme(date, date) to authenticated;

-- =========================================================
-- Bannières du carrousel d'accueil (superadministrateur)
-- =========================================================

create table if not exists public.bannieres (
  id       uuid primary key default gen_random_uuid(),
  titre    text not null default '',
  image    text not null,              -- image en data-url, compressée par l'application
  lien     text not null default '',   -- ouvert au clic (http/https)
  position integer not null default 0,
  active   boolean not null default true,
  cree_le  timestamptz not null default now()
);

alter table public.bannieres enable row level security;

-- Le carrousel s'affiche sans compte : lecture publique des seules
-- bannières actives.
drop policy if exists bannieres_lecture on public.bannieres;
create policy bannieres_lecture on public.bannieres for select to anon, authenticated
  using (active or public.role_courant() = 'superadmin');

drop policy if exists bannieres_gestion on public.bannieres;
create policy bannieres_gestion on public.bannieres for all to authenticated
  using (public.role_courant() = 'superadmin')
  with check (public.role_courant() = 'superadmin');

-- =========================================================
-- Stock et ventes en boutique (factures)
-- =========================================================

-- Le stock ne concerne que l'atelier : il n'est jamais affiché au public.
alter table public.produits add column if not exists stock integer not null default 0;

-- Mise en avant : ces réalisations ouvrent l'accueil de la boutique.
alter table public.produits add column if not exists en_avant boolean not null default false;

alter table public.compteurs add column if not exists prochaine_facture integer not null default 1;
alter table public.ventes add column if not exists client_whatsapp text not null default '';

create table if not exists public.ventes (
  id         uuid primary key default gen_random_uuid(),
  atelier_id uuid not null references public.ateliers (id) on delete cascade,
  numero     text not null,
  client     text not null default '',
  client_whatsapp text not null default '',
  lignes     jsonb not null default '[]',  -- [{produit_id, nom, code, prix, quantite}]
  total      numeric not null default 0,
  paye       numeric not null default 0,
  note       text not null default '',
  cree_le    timestamptz not null default now()
);

create index if not exists ventes_par_atelier on public.ventes (atelier_id);

alter table public.ventes enable row level security;

-- Les ventes sont créées par la fonction enregistrer_vente (security
-- definer) : administrateur comme modérateur peuvent vendre. Mais seul
-- l'administrateur annule une vente.
drop policy if exists ventes_par_atelier on public.ventes;
drop policy if exists ventes_lecture on public.ventes;
create policy ventes_lecture on public.ventes for select to authenticated
  using (atelier_id = public.atelier_courant());
drop policy if exists ventes_suppression on public.ventes;
create policy ventes_suppression on public.ventes for delete to authenticated
  using (atelier_id = public.atelier_courant() and public.est_admin());

-- Vente atomique : vérifie le stock, décrémente, numérote et facture.
-- Tout se fait dans une seule transaction : deux ventes simultanées ne
-- peuvent pas vendre deux fois le dernier article (verrou for update).
drop function if exists public.enregistrer_vente(text, jsonb, numeric, text);
create or replace function public.enregistrer_vente(
  p_client text, p_lignes jsonb, p_paye numeric, p_note text default '',
  p_client_whatsapp text default ''
) returns public.ventes language plpgsql security definer set search_path = public as
$$
declare
  a uuid;
  n integer;
  ligne jsonb;
  produit public.produits%rowtype;
  quantite integer;
  total numeric := 0;
  lignes_completes jsonb := '[]'::jsonb;
  vente public.ventes%rowtype;
begin
  select atelier_id into a from public.profils where id = auth.uid();
  if a is null then
    raise exception 'Aucun atelier associé à ce compte';
  end if;
  if p_lignes is null or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Aucun article dans la vente';
  end if;

  for ligne in select * from jsonb_array_elements(p_lignes) loop
    quantite := coalesce((ligne ->> 'quantite')::integer, 0);
    if quantite < 1 then
      raise exception 'Quantité invalide';
    end if;
    select * into produit from public.produits
      where id = (ligne ->> 'produit_id')::uuid and atelier_id = a
      for update;
    if not found then
      raise exception 'Article introuvable dans votre vitrine';
    end if;
    if produit.stock < quantite then
      raise exception 'Stock insuffisant pour « % » (reste %)', produit.nom, produit.stock;
    end if;
    update public.produits
      set stock = stock - quantite, modifie_le = now()
      where id = produit.id;
    total := total + produit.prix * quantite;
    lignes_completes := lignes_completes || jsonb_build_object(
      'produit_id', produit.id, 'nom', produit.nom, 'code', produit.code,
      'prix', produit.prix, 'quantite', quantite);
  end loop;

  update public.compteurs set prochaine_facture = prochaine_facture + 1
    where atelier_id = a
    returning prochaine_facture - 1 into n;
  if n is null then
    insert into public.compteurs (atelier_id, prochaine_facture) values (a, 2)
      on conflict (atelier_id) do update set prochaine_facture = public.compteurs.prochaine_facture + 1;
    n := 1;
  end if;

  insert into public.ventes (atelier_id, numero, client, client_whatsapp, lignes, total, paye, note)
  values (
    a,
    'FAC-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 4, '0'),
    coalesce(p_client, ''),
    coalesce(p_client_whatsapp, ''),
    lignes_completes,
    total,
    least(greatest(coalesce(p_paye, 0), 0), total),
    coalesce(p_note, '')
  )
  returning * into vente;
  return vente;
end
$$;

grant execute on function public.enregistrer_vente(text, jsonb, numeric, text, text) to authenticated;
