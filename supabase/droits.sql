-- =========================================================
-- Droits des modérateurs — réglés un par un par l'administrateur
-- À coller dans : Supabase -> SQL Editor -> Run
-- =========================================================
--
-- Jusqu'ici, « modérateur » était un bloc : il créait commandes et
-- factures, envoyait le récapitulatif, et rien d'autre. Un atelier qui
-- voulait confier les encaissements à quelqu'un devait en faire un
-- administrateur — donc lui ouvrir aussi les réglages, l'équipe et
-- l'abonnement.
--
-- Chaque modérateur porte désormais ses propres droits, que son
-- administrateur coche dans Réglages -> Équipe.
--
-- CE QUI NE CHANGE PAS POUR L'EXISTANT : les modérateurs déjà en place
-- reçoivent exactement ce qu'ils avaient — créer une commande, établir
-- une facture, envoyer le récapitulatif. Rien de plus, rien de moins.
--
-- ORDRE D'EXÉCUTION : après schema.sql et formules.sql, dont ce script
-- reprend les gardes (module_atelier, double facteur).
--
-- Le script est rejouable sans danger.


-- ---------- 1. La colonne ----------
--
-- La valeur par défaut EST le comportement d'aujourd'hui. PostgreSQL
-- l'applique aussi aux lignes déjà présentes : aucun modérateur ne perd
-- ni ne gagne quoi que ce soit à l'exécution de ce script.

alter table public.profils
  add column if not exists droits jsonb not null
  default '{"commande_creer": true, "vente_creer": true, "commande_recap": true}'::jsonb;


-- ---------- 2. Lire un droit ----------
--
-- L'administrateur et le superadministrateur les ont tous : inutile de
-- leur cocher quoi que ce soit. Pour les autres, la réponse est dans la
-- colonne — et une clé absente vaut « non ».
--
-- La fonction passe par role_courant(), qui exige les deux facteurs
-- quand ils sont activés : une session incomplète n'a donc aucun droit.

create or replace function public.a_droit(p_droit text)
returns boolean language sql stable security definer set search_path = public as
$$
  select case
    when public.role_courant() in ('admin', 'superadmin') then true
    when public.role_courant() = 'moderateur' then
      coalesce((select (droits ->> p_droit)::boolean
                from public.profils where id = auth.uid()), false)
    else false
  end
$$;


-- ---------- 3. Un modérateur ne s'accorde pas de droits ----------
--
-- C'EST LE POINT QUI COMPTE. profils_modification laisse chacun modifier
-- SA PROPRE ligne — c'est ainsi qu'on change son nom ou son téléphone.
-- Sans la ligne ajoutée ci-dessous, un modérateur s'accorderait tous les
-- droits d'une seule requête, sans passer par l'application.
--
-- proteger_profil ramenait déjà le rôle et l'atelier à leur valeur
-- d'avant ; la colonne des droits les rejoint.

create or replace function public.proteger_profil()
returns trigger language plpgsql security definer set search_path = public as
$$
declare
  r text;
begin
  -- Rattachement posé par creer_mon_atelier, le temps de sa transaction.
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

  -- Un administrateur gère les modérateurs de SON atelier : il les
  -- rattache, et il règle leurs droits. C'est la seule branche qui laisse
  -- passer une écriture sur droits.
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
  new.droits := old.droits;   -- personne ne s'augmente soi-même
  return new;
end
$$;


-- ---------- 4. Les droits gouvernent les écritures ----------
--
-- a_droit() répond « oui » à tout administrateur : les règles ci-dessous
-- n'ont donc pas besoin de le mentionner à part.
--
-- Le module de la formule reste en tête de chaque règle : un droit coché
-- n'ouvre rien si la formule ne porte pas le module.

-- Commandes

drop policy if exists commandes_creation on public.commandes;
create policy commandes_creation on public.commandes for insert to authenticated
  with check (atelier_id = public.atelier_courant()
              and public.module_atelier()
              and public.a_droit('commande_creer'));

drop policy if exists commandes_modification on public.commandes;
-- Modifier une commande, c'est aussi changer son statut et encaisser un
-- versement : tout passe par un update de la ligne.
create policy commandes_modification on public.commandes for update to authenticated
  using (atelier_id = public.atelier_courant()
         and public.module_atelier()
         and public.a_droit('commande_modifier'))
  with check (atelier_id = public.atelier_courant()
              and public.module_atelier()
              and public.a_droit('commande_modifier'));

drop policy if exists commandes_suppression on public.commandes;
create policy commandes_suppression on public.commandes for delete to authenticated
  using (atelier_id = public.atelier_courant()
         and public.a_droit('commande_supprimer'));

-- Photos de tissus : elles suivent la commande qu'elles accompagnent.

drop policy if exists photos_creation on public.photos;
create policy photos_creation on public.photos for insert to authenticated
  with check (atelier_id = public.atelier_courant()
              and public.module_atelier()
              and (public.a_droit('commande_creer') or public.a_droit('commande_modifier')));

drop policy if exists photos_suppression on public.photos;
create policy photos_suppression on public.photos for delete to authenticated
  using (atelier_id = public.atelier_courant()
         and public.a_droit('commande_modifier'));

-- Factures

drop policy if exists ventes_suppression on public.ventes;
create policy ventes_suppression on public.ventes for delete to authenticated
  using (atelier_id = public.atelier_courant()
         and public.a_droit('vente_supprimer'));

-- Dépenses — la règle unique « réservé à l'administrateur » se découpe :
-- consulter les recettes suppose de voir les dépenses, les ajouter est un
-- droit à part, les corriger et les effacer restent à l'administrateur.

drop policy if exists depenses_par_atelier on public.depenses;
drop policy if exists depenses_lecture on public.depenses;
create policy depenses_lecture on public.depenses for select to authenticated
  using (atelier_id = public.atelier_courant()
         and (public.a_droit('recettes_voir') or public.a_droit('depense_ajouter')));

drop policy if exists depenses_creation on public.depenses;
create policy depenses_creation on public.depenses for insert to authenticated
  with check (atelier_id = public.atelier_courant()
              and public.a_droit('depense_ajouter'));

drop policy if exists depenses_gestion on public.depenses;
create policy depenses_gestion on public.depenses for update to authenticated
  using (atelier_id = public.atelier_courant() and public.est_admin())
  with check (atelier_id = public.atelier_courant() and public.est_admin());

drop policy if exists depenses_effacement on public.depenses;
create policy depenses_effacement on public.depenses for delete to authenticated
  using (atelier_id = public.atelier_courant() and public.est_admin());


-- ---------- 5. Établir une facture ----------
--
-- enregistrer_vente est SECURITY DEFINER : elle ne passe pas par le RLS.
-- Le contrôle s'écrit donc dans son corps. Signature reprise à
-- l'identique — la changer créerait une seconde fonction à côté de
-- l'ancienne, et c'est l'ancienne que PostgREST continuerait d'appeler.

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
  a := public.atelier_courant();
  if a is null then
    raise exception 'Aucun atelier associé à ce compte';
  end if;
  if not public.module_vitrine() then
    raise exception 'La vente au comptoir demande la formule Vitrine.';
  end if;
  if not public.a_droit('vente_creer') then
    raise exception 'Vous n''avez pas le droit d''établir une facture.';
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
-- Vos modérateurs et leurs droits. Ils doivent tous montrer les trois
-- mêmes clés à true, et rien d'autre — c'est-à-dire ce qu'ils avaient
-- déjà avant ce script.

select p.email, p.nom_complet, a.nom as atelier, p.droits
from public.profils p
left join public.ateliers a on a.id = p.atelier_id
where p.role = 'moderateur'
order by a.nom, p.email;

-- Les règles reposées :

select policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('commandes', 'photos', 'ventes', 'depenses')
order by tablename, policyname;


-- ---------- Ce qu'il faut savoir ----------
--
-- • « Consultation de recette » est surtout un réglage d'affichage. Les
--   montants des commandes et des factures sont, par nature, visibles de
--   qui les enregistre : un modérateur qui crée une commande en connaît
--   le montant. Ce que le droit ferme vraiment, c'est l'écran des
--   recettes, le total de la période, et la lecture des DÉPENSES — que
--   la règle ci-dessus verrouille pour de bon.
--
-- • Il n'existe pas d'écran de modification de facture : une facture
--   s'établit, s'imprime et s'annule. Il n'y a donc pas de droit
--   « modifier une facture » — il ne correspondrait à rien.
--
-- • Retirer un droit prend effet à la prochaine navigation du
--   modérateur ; sa session en cours garde les écrans déjà affichés,
--   mais le serveur, lui, refuse immédiatement.
