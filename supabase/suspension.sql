-- =========================================================
-- Suspension réelle d'un atelier dont l'abonnement a expiré
-- À coller dans : Supabase -> SQL Editor -> Run
-- =========================================================
--
-- Jusqu'ici, l'abonnement expiré n'était qu'un ÉCRAN. L'application
-- posait un voile plein écran, mais aucune règle de la base ne testait
-- l'échéance pour les données de l'atelier : depuis la console du
-- navigateur, un atelier suspendu créait encore des clients et des
-- commandes. Vérifié, et c'est ce que ce script referme.
--
-- LA RÈGLE : les ÉCRITURES s'arrêtent, les LECTURES restent ouvertes.
--
-- Pourquoi laisser lire. L'écran de suspension promet « vos données sont
-- intactes » — il faut que ce soit vrai et vérifiable. Un atelier
-- suspendu doit pouvoir relire ses commandes, retrouver le numéro d'un
-- client, et surtout TÉLÉCHARGER SA COPIE depuis les réglages. Fermer la
-- lecture reviendrait à prendre ses données en otage ; ce n'est pas le
-- but, et ce serait un mauvais argument de vente.
--
-- Ce qui reste possible, et doit le rester : renouveler. utiliser_code
-- et demander_changement_formule sont SECURITY DEFINER, elles ne passent
-- pas par ces règles — un atelier suspendu peut donc toujours payer.
--
-- ORDRE D'EXÉCUTION : après schema.sql, formules.sql, droits.sql et
-- changement-formule.sql, dont ce script reprend toutes les conditions.
-- Le script est rejouable sans danger.


-- ---------- 1. L'abonnement de la session est-il à jour ? ----------
--
-- atelier_actif() existe déjà et prend un atelier en paramètre. Cette
-- fonction-ci l'applique à la session courante, pour que les règles
-- ci-dessous se lisent d'un coup d'œil.
--
-- Elle passe par atelier_courant(), qui exige les deux facteurs quand
-- ils sont activés : une session incomplète n'écrit donc rien non plus.

create or replace function public.abonnement_actif()
returns boolean language sql stable security definer set search_path = public as
$$ select public.atelier_actif(public.atelier_courant()) $$;


-- ---------- 2. Clients ----------

drop policy if exists clients_creation on public.clients;
create policy clients_creation on public.clients for insert to authenticated
  with check (atelier_id = public.atelier_courant()
              and public.module_atelier()
              and public.abonnement_actif());

drop policy if exists clients_modification on public.clients;
create policy clients_modification on public.clients for update to authenticated
  using (atelier_id = public.atelier_courant()
         and public.module_atelier()
         and public.abonnement_actif())
  with check (atelier_id = public.atelier_courant()
              and public.module_atelier()
              and public.abonnement_actif());

drop policy if exists clients_suppression on public.clients;
create policy clients_suppression on public.clients for delete to authenticated
  using (atelier_id = public.atelier_courant()
         and public.est_admin()
         and public.abonnement_actif());


-- ---------- 3. Commandes et photos de tissus ----------

drop policy if exists commandes_creation on public.commandes;
create policy commandes_creation on public.commandes for insert to authenticated
  with check (atelier_id = public.atelier_courant()
              and public.module_atelier()
              and public.a_droit('commande_creer')
              and public.abonnement_actif());

drop policy if exists commandes_modification on public.commandes;
create policy commandes_modification on public.commandes for update to authenticated
  using (atelier_id = public.atelier_courant()
         and public.module_atelier()
         and public.a_droit('commande_modifier')
         and public.abonnement_actif())
  with check (atelier_id = public.atelier_courant()
              and public.module_atelier()
              and public.a_droit('commande_modifier')
              and public.abonnement_actif());

drop policy if exists commandes_suppression on public.commandes;
create policy commandes_suppression on public.commandes for delete to authenticated
  using (atelier_id = public.atelier_courant()
         and public.a_droit('commande_supprimer')
         and public.abonnement_actif());

drop policy if exists photos_creation on public.photos;
create policy photos_creation on public.photos for insert to authenticated
  with check (atelier_id = public.atelier_courant()
              and public.module_atelier()
              and (public.a_droit('commande_creer') or public.a_droit('commande_modifier'))
              and public.abonnement_actif());

drop policy if exists photos_suppression on public.photos;
create policy photos_suppression on public.photos for delete to authenticated
  using (atelier_id = public.atelier_courant()
         and public.a_droit('commande_modifier')
         and public.abonnement_actif());


-- ---------- 4. Réalisations et stock ----------
--
-- produits_gestion couvrait « for all » : lecture comprise. La découper
-- est indispensable ici, sinon fermer l'écriture fermerait aussi la
-- lecture de sa propre vitrine.
--
-- La lecture reste assurée par produits_lecture_publique, qui contient
-- déjà « or atelier_id = atelier_courant() » : un atelier voit ses
-- réalisations quoi qu'il arrive.

drop policy if exists produits_gestion on public.produits;

drop policy if exists produits_creation on public.produits;
create policy produits_creation on public.produits for insert to authenticated
  with check (atelier_id = public.atelier_courant()
              and public.est_admin()
              and public.module_vitrine()
              and public.abonnement_actif());

drop policy if exists produits_modification on public.produits;
create policy produits_modification on public.produits for update to authenticated
  using (atelier_id = public.atelier_courant()
         and public.est_admin()
         and public.abonnement_actif())
  with check (atelier_id = public.atelier_courant()
              and public.est_admin()
              and public.module_vitrine()
              and public.abonnement_actif());

drop policy if exists produits_suppression on public.produits;
create policy produits_suppression on public.produits for delete to authenticated
  using (atelier_id = public.atelier_courant()
         and public.est_admin()
         and public.abonnement_actif());

drop policy if exists photos_produits_gestion on public.photos_produits;

drop policy if exists photos_produits_creation on public.photos_produits;
create policy photos_produits_creation on public.photos_produits for insert to authenticated
  with check (atelier_id = public.atelier_courant()
              and public.est_admin()
              and public.module_vitrine()
              and public.abonnement_actif());

drop policy if exists photos_produits_modification on public.photos_produits;
create policy photos_produits_modification on public.photos_produits for update to authenticated
  using (atelier_id = public.atelier_courant()
         and public.est_admin()
         and public.abonnement_actif())
  with check (atelier_id = public.atelier_courant()
              and public.est_admin()
              and public.module_vitrine()
              and public.abonnement_actif());

drop policy if exists photos_produits_suppression on public.photos_produits;
create policy photos_produits_suppression on public.photos_produits for delete to authenticated
  using (atelier_id = public.atelier_courant()
         and public.est_admin()
         and public.abonnement_actif());


-- ---------- 5. Factures et dépenses ----------

drop policy if exists ventes_suppression on public.ventes;
create policy ventes_suppression on public.ventes for delete to authenticated
  using (atelier_id = public.atelier_courant()
         and public.a_droit('vente_supprimer')
         and public.abonnement_actif());

drop policy if exists depenses_creation on public.depenses;
create policy depenses_creation on public.depenses for insert to authenticated
  with check (atelier_id = public.atelier_courant()
              and public.a_droit('depense_ajouter')
              and public.abonnement_actif());

drop policy if exists depenses_gestion on public.depenses;
create policy depenses_gestion on public.depenses for update to authenticated
  using (atelier_id = public.atelier_courant() and public.est_admin()
         and public.abonnement_actif())
  with check (atelier_id = public.atelier_courant() and public.est_admin()
              and public.abonnement_actif());

drop policy if exists depenses_effacement on public.depenses;
create policy depenses_effacement on public.depenses for delete to authenticated
  using (atelier_id = public.atelier_courant() and public.est_admin()
         and public.abonnement_actif());

-- depenses_lecture n'est PAS touchée : lire ses dépenses reste possible,
-- comme lire ses commandes.


-- ---------- 6. La vente au comptoir ----------
--
-- enregistrer_vente ne passe pas par le RLS : le contrôle s'écrit dans
-- son corps. Signature reprise à l'identique, pour ne pas créer une
-- seconde fonction à côté de l'ancienne.

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
  if not public.abonnement_actif() then
    raise exception 'Abonnement expiré : renouvelez pour établir des factures.';
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
-- Les règles d'écriture doivent toutes mentionner abonnement_actif.

select tablename, policyname, cmd,
       case when coalesce(qual, '') || coalesce(with_check, '') like '%abonnement_actif%'
            then 'oui' else 'non' end as suspend_a_l_echeance
from pg_policies
where schemaname = 'public'
  and tablename in ('clients', 'commandes', 'photos', 'produits',
                    'photos_produits', 'ventes', 'depenses')
order by tablename, cmd, policyname;

-- Attendu : « oui » sur tout ce qui est INSERT, UPDATE ou DELETE,
-- « non » sur les SELECT — la lecture reste ouverte.


-- ---------- Ce qu'il faut savoir ----------
--
-- • CE QUI RESTE POSSIBLE, ABONNEMENT EXPIRÉ : lire toutes ses données,
--   télécharger sa copie depuis les réglages, renouveler par Mobile
--   Money ou par code, changer de formule. Rien de ce qui permet de
--   payer n'est fermé.
--
-- • CE QUI S'ARRÊTE : créer ou modifier un client, une commande, une
--   photo, une réalisation, une facture, une dépense. Le message parle
--   de « row-level security » — l'application, elle, affiche déjà son
--   voile bien avant qu'on y arrive.
--
-- • CE QUI N'EST PAS FERMÉ, ET POURQUOI : les réglages de l'atelier
--   (slogan, logo, numéros, modèles de message) et la gestion de
--   l'équipe. Ce ne sont pas des usages métier, et les fermer ferait
--   courir un risque au parcours de renouvellement pour un gain nul.
--
-- • La vitrine publique disparaissait déjà à l'échéance : ateliers_publics
--   et produits_lecture_publique testent l'abonnement depuis le début.
