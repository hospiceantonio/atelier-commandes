-- =========================================================
-- Formules d'abonnement et inscription libre des maisons
-- À coller dans : Supabase -> SQL Editor -> Run
-- =========================================================
--
-- Jusqu'ici, seul le superadministrateur créait un atelier et fixait son
-- tarif à la main. Désormais :
--
--   • une maison ouvre son compte elle-même depuis la boutique ;
--   • elle choisit sa formule — Atelier, Vitrine, ou les deux ;
--   • LE TARIF VIENT DE LA FORMULE, jamais du navigateur. C'est le point
--     qui compte : sans cela, n'importe qui s'abonnerait à zéro franc.
--
-- Le superadministrateur ne crée plus les comptes ; il définit les règles
-- (les formules et leur prix) et garde la création manuelle en secours.
--
-- Le script est rejouable sans danger. Il ne réécrit jamais un tarif que
-- vous auriez modifié : les formules sont insérées « on conflict do
-- nothing ».
--
-- ORDRE D'EXÉCUTION : ce script suppose schema.sql déjà passé, y compris
-- son bloc double facteur (il appelle double_facteur_exige et
-- double_facteur_ok). Si ces fonctions manquent, exécutez d'abord
-- schema.sql en entier.
--
-- CE QUI NE CHANGE PAS POUR L'EXISTANT : tous les ateliers déjà en base
-- reçoivent la formule « Atelier + Vitrine ». Ils gardent donc exactement
-- les mêmes écrans et le même tarif qu'aujourd'hui.


-- ---------- 1. Les formules ----------

create table if not exists public.formules (
  code         text primary key,
  nom          text not null,
  description  text not null default '',
  prix_mensuel numeric not null default 0 check (prix_mensuel >= 0),
  ordre        integer not null default 0,
  active       boolean not null default true,   -- décochée : plus proposée à l'inscription
  modifie_le   timestamptz not null default now()
);

-- Les trois formules. Les prix ci-dessous ne sont qu'un point de départ :
-- vous les réglez ensuite dans Superadmin -> Formules et tarifs.
insert into public.formules (code, nom, description, prix_mensuel, ordre) values
  ('atelier', 'Atelier',
   'Commandes sur mesure, fiches clients, mesures, versements et recettes. '
   'Votre gestion reste privée : la maison n''apparaît pas dans la boutique publique.',
   5000, 1),
  ('vitrine', 'Vitrine',
   'Vos réalisations publiées dans la boutique, votre fiche maison, '
   'la vente au comptoir avec stock et factures.',
   3000, 2),
  ('atelier_vitrine', 'Atelier + Vitrine',
   'Tout : la gestion des commandes sur mesure et la boutique publique.',
   7000, 3)
on conflict (code) do nothing;

alter table public.formules enable row level security;

drop policy if exists formules_lecture on public.formules;
-- Lisibles sans compte : l'écran d'inscription affiche les tarifs avant
-- que la personne n'ait un compte.
create policy formules_lecture on public.formules for select to anon, authenticated
  using (true);

drop policy if exists formules_gestion on public.formules;
create policy formules_gestion on public.formules for all to authenticated
  using (public.role_courant() = 'superadmin')
  with check (public.role_courant() = 'superadmin');


-- ---------- 2. La formule de chaque atelier ----------

alter table public.ateliers
  add column if not exists formule text not null default 'atelier_vitrine';

-- La clé étrangère est posée à part : sur une base déjà migrée, la
-- recréer échouerait et arrêterait tout le script.
do $$
begin
  alter table public.ateliers
    add constraint ateliers_formule_fk foreign key (formule)
    references public.formules(code);
exception
  when duplicate_object then null;
  when duplicate_table then null;
end
$$;

create index if not exists ateliers_par_formule on public.ateliers (formule);


-- ---------- 3. Un admin ne s'offre pas une formule ----------
--
-- proteger_atelier() ramène déjà le nom, la devise et l'abonnement à leur
-- valeur d'avant quand la modification ne vient pas du superadmin. La
-- formule rejoint cette liste : sans cela, l'administrateur d'un atelier
-- passerait de « Vitrine » à « Atelier + Vitrine » d'une seule requête.

create or replace function public.proteger_atelier()
returns trigger language plpgsql security definer set search_path = public as
$$
begin
  if coalesce(current_setting('app.abonnement_interne', true), '') = 'on' then
    return new;
  end if;
  if auth.uid() is not null and public.role_courant() is distinct from 'superadmin' then
    new.nom := old.nom;
    new.devise := old.devise;
    new.indicatif := old.indicatif;
    new.formule := old.formule;
    new.abonnement_mensuel := old.abonnement_mensuel;
    new.abonnement_fin := old.abonnement_fin;
  end if;
  return new;
end
$$;


-- ---------- 4. Ce que la formule ouvre ----------
--
-- Deux modules, et une formule qui en accorde un ou les deux :
--
--   Atelier   -> commandes, clients, mesures, photos de tissus
--   Vitrine   -> réalisations publiées, stock, ventes au comptoir
--
-- Les recettes et les dépenses restent ouvertes aux deux : une maison
-- tient ses comptes quelle que soit sa formule.
--
-- Ces fonctions passent par atelier_courant(), qui exige les deux
-- facteurs quand ils sont activés. Une session incomplète n'ouvre donc
-- aucun module.

create or replace function public.module_atelier()
returns boolean language sql stable security definer set search_path = public as
$$
  select coalesce((select formule in ('atelier', 'atelier_vitrine')
                   from public.ateliers where id = public.atelier_courant()), false)
$$;

create or replace function public.module_vitrine()
returns boolean language sql stable security definer set search_path = public as
$$
  select coalesce((select formule in ('vitrine', 'atelier_vitrine')
                   from public.ateliers where id = public.atelier_courant()), false)
$$;

-- Pour la lecture publique : cet atelier-là montre-t-il une vitrine ?
create or replace function public.atelier_a_vitrine(p_atelier uuid)
returns boolean language sql stable security definer set search_path = public as
$$
  select exists (select 1 from public.ateliers
                  where id = p_atelier and formule in ('vitrine', 'atelier_vitrine'))
$$;


-- ---------- 5. Le module gouverne l'écriture ----------
--
-- Choix assumé : les LECTURES restent ouvertes, les ÉCRITURES sont
-- bornées. Une maison qui repasse de « Atelier + Vitrine » à « Atelier »
-- garde sous les yeux ses anciennes factures et ses anciennes
-- réalisations ; elle ne peut simplement plus en créer. Rétrograder ne
-- doit pas effacer un historique.

-- Commandes, clients, mesures : module Atelier.

drop policy if exists clients_creation on public.clients;
create policy clients_creation on public.clients for insert to authenticated
  with check (atelier_id = public.atelier_courant() and public.module_atelier());

drop policy if exists clients_modification on public.clients;
create policy clients_modification on public.clients for update to authenticated
  using (atelier_id = public.atelier_courant() and public.module_atelier())
  with check (atelier_id = public.atelier_courant() and public.module_atelier());

drop policy if exists commandes_creation on public.commandes;
create policy commandes_creation on public.commandes for insert to authenticated
  with check (atelier_id = public.atelier_courant() and public.module_atelier());

drop policy if exists commandes_modification on public.commandes;
create policy commandes_modification on public.commandes for update to authenticated
  using (atelier_id = public.atelier_courant() and public.est_admin()
         and public.module_atelier())
  with check (atelier_id = public.atelier_courant() and public.module_atelier());

drop policy if exists photos_creation on public.photos;
create policy photos_creation on public.photos for insert to authenticated
  with check (atelier_id = public.atelier_courant() and public.module_atelier());

-- Réalisations et stock : module Vitrine.

drop policy if exists produits_gestion on public.produits;
create policy produits_gestion on public.produits for all to authenticated
  using (atelier_id = public.atelier_courant() and public.est_admin())
  with check (atelier_id = public.atelier_courant() and public.est_admin()
              and public.module_vitrine());

drop policy if exists photos_produits_gestion on public.photos_produits;
create policy photos_produits_gestion on public.photos_produits for all to authenticated
  using (atelier_id = public.atelier_courant() and public.est_admin())
  with check (atelier_id = public.atelier_courant() and public.est_admin()
              and public.module_vitrine());

-- La boutique publique ne montre que les maisons qui ont la vitrine.

drop policy if exists produits_lecture_publique on public.produits;
create policy produits_lecture_publique on public.produits for select to anon, authenticated
  using ((public.atelier_actif(atelier_id) and public.atelier_a_vitrine(atelier_id))
         or atelier_id = public.atelier_courant()
         or public.role_courant() = 'superadmin');

drop policy if exists photos_produits_lecture_publique on public.photos_produits;
create policy photos_produits_lecture_publique on public.photos_produits for select to anon, authenticated
  using ((public.atelier_actif(atelier_id) and public.atelier_a_vitrine(atelier_id))
         or atelier_id = public.atelier_courant()
         or public.role_courant() = 'superadmin');

create or replace view public.ateliers_publics as
  select id, nom, slogan, logo, tel_whatsapp, tel_appel, devise, indicatif
  from public.ateliers
  where abonnement_fin > now()
    and formule in ('vitrine', 'atelier_vitrine');

grant select on public.ateliers_publics to anon, authenticated;


-- ---------- 6. L'inscription libre ----------
--
-- Le compte est créé par Supabase Auth (le déclencheur en fait un « admin
-- sans atelier »). C'est cette fonction qui lui donne sa maison.
--
-- Elle est le point de passage obligé, et elle vérifie tout ce qui compte :
--   • une session, et les deux facteurs si vous les exigez ;
--   • un compte qui n'a pas déjà une maison — on n'en ouvre qu'une ;
--   • une formule qui existe et qui est ouverte aux inscriptions ;
--   • le tarif lu DANS LA TABLE, pas reçu du navigateur.
--
-- L'essai de 14 jours vient de la valeur par défaut de abonnement_fin.

create or replace function public.creer_mon_atelier(
  p_nom          text,
  p_formule      text,
  p_slogan       text default '',
  p_tel_whatsapp text default '',
  p_tel_appel    text default ''
)
returns public.ateliers
language plpgsql security definer set search_path = public as
$$
declare
  v_role      text;
  v_atelier_id uuid;
  v_formule   public.formules;
  v_atelier   public.ateliers;
begin
  if auth.uid() is null then
    raise exception 'Connectez-vous pour ouvrir votre maison.';
  end if;

  -- Le double facteur vaut ici comme partout ailleurs : une session à
  -- moitié ouverte ne crée pas de maison.
  if public.double_facteur_exige() and not public.double_facteur_ok() then
    raise exception 'Terminez la connexion avant d''ouvrir votre maison.';
  end if;

  select role, atelier_id into v_role, v_atelier_id
    from public.profils where id = auth.uid();

  if v_role is null then
    raise exception 'Profil introuvable pour ce compte.';
  end if;
  if v_role = 'superadmin' then
    raise exception 'Le superadministrateur n''ouvre pas de maison.';
  end if;
  if v_atelier_id is not null then
    raise exception 'Ce compte est déjà relié à une maison.';
  end if;

  select * into v_formule from public.formules
   where code = p_formule and active;
  if v_formule.code is null then
    raise exception 'Formule inconnue ou fermée aux inscriptions.';
  end if;

  if length(btrim(coalesce(p_nom, ''))) < 2 then
    raise exception 'Indiquez le nom de votre maison.';
  end if;

  insert into public.ateliers
    (nom, slogan, tel_whatsapp, tel_appel, formule, abonnement_mensuel)
  values
    (btrim(p_nom), btrim(coalesce(p_slogan, '')),
     btrim(coalesce(p_tel_whatsapp, '')), btrim(coalesce(p_tel_appel, '')),
     v_formule.code, v_formule.prix_mensuel)
  returning * into v_atelier;

  -- garde_profil() ramènerait atelier_id et role à leur valeur d'avant :
  -- ce drapeau, posé le temps de la transaction, lui dit que le
  -- rattachement vient d'ici et non d'une requête forgée.
  perform set_config('app.inscription_interne', 'on', true);
  update public.profils
     set atelier_id = v_atelier.id, role = 'admin'
   where id = auth.uid();
  perform set_config('app.inscription_interne', 'off', true);

  return v_atelier;
end
$$;

revoke all on function public.creer_mon_atelier(text, text, text, text, text) from public;
grant execute on function public.creer_mon_atelier(text, text, text, text, text) to authenticated;

-- Le drapeau ci-dessus n'a d'effet que si garde_profil sait le lire.

create or replace function public.proteger_profil()
returns trigger language plpgsql security definer set search_path = public as
$$
declare
  r text;
begin
  -- Rattachement posé par creer_mon_atelier, le temps de sa transaction.
  -- Inatteignable depuis l'application : seul un set_config local le pose.
  if coalesce(current_setting('app.inscription_interne', true), '') = 'on' then
    return new;
  end if;
  if auth.uid() is null then
    return new;
  end if;
  r := public.role_courant();
  if r = 'superadmin' then
    return new;
  end if;

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


-- ---------- 7. La vente au comptoir suit la formule ----------
--
-- enregistrer_vente est SECURITY DEFINER : elle ne passe pas par le RLS
-- des produits. Le contrôle doit donc être écrit ici, explicitement.

-- La signature est reprise à l'identique de schema.sql : la changer
-- créerait une seconde fonction à côté de l'ancienne, et c'est l'ancienne
-- — sans contrôle — que PostgREST continuerait d'appeler.
--
-- Seules deux lignes du corps changent, marquées ci-dessous.

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
  -- CHANGEMENT 1 : atelier_courant() au lieu d'une lecture directe du
  -- profil. La fonction est SECURITY DEFINER, elle lisait donc l'atelier
  -- même quand le second facteur manquait — la seule porte du genre qui
  -- restait ouverte. Elle se referme ici.
  a := public.atelier_courant();
  if a is null then
    raise exception 'Aucun atelier associé à ce compte';
  end if;
  -- CHANGEMENT 2 : la vente au comptoir appartient au module Vitrine.
  if not public.module_vitrine() then
    raise exception 'La vente au comptoir demande la formule Vitrine.';
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


-- ---------- Contrôle après exécution ----------
--
-- Les trois formules et leur tarif :

select code, nom, prix_mensuel, active, ordre
from public.formules
order by ordre;

-- Tous vos ateliers existants doivent être en « atelier_vitrine » :
-- rien ne change pour eux.

select formule, count(*) as nombre
from public.ateliers
group by formule
order by formule;

-- ---------- Ce qu'il faut savoir ----------
--
-- • Le tarif est figé À LA CRÉATION. Changer le prix d'une formule ne
--   touche aucun abonnement déjà ouvert — vos clients actuels gardent
--   celui qu'ils ont signé. Le nouveau prix s'applique aux inscriptions
--   suivantes, et aux ateliers dont vous changez la formule.
--
-- • Décocher « active » sur une formule la retire de l'écran
--   d'inscription sans toucher aux maisons qui l'ont déjà.
--
-- • L'essai est de 14 jours, par la valeur par défaut de
--   ateliers.abonnement_fin. Pour le changer :
--       alter table public.ateliers
--         alter column abonnement_fin set default now() + interval '30 days';
--
-- • Rien n'empêche quelqu'un de rouvrir un compte avec une autre adresse
--   pour enchaîner les essais. C'est le prix d'un essai sans carte ; si
--   cela devient un problème, dites-le et nous fermerons la porte
--   (validation manuelle, ou paiement dès l'inscription).
