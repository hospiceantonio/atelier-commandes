-- =========================================================
-- Gestion de stock — approvisionnement, inventaire, sortie
-- À coller dans : Supabase -> SQL Editor -> Run
-- =========================================================
--
-- Le stock existait déjà : une colonne sur la réalisation, décrémentée
-- par la vente au comptoir. Elle disait COMBIEN il reste, jamais
-- POURQUOI. Un écart constaté n'avait aucune explication à offrir.
--
-- Ce script ajoute le journal qui manquait. Chaque variation y laisse
-- une ligne : ce qui entre, ce qui sort, ce que l'inventaire corrige,
-- et ce que la vente prend. Le stock reste sur la réalisation — il s'y
-- lit d'un coup — mais il n'y bouge plus sans laisser de trace.
--
-- LE MODULE VITRINE PORTE CE STOCK. Une maison sur la formule
-- « Atelier » n'a ni réalisations ni ventes : elle n'a pas de stock non
-- plus. Les trois fonctions le vérifient.
--
-- ORDRE D'EXÉCUTION : après schema.sql, formules.sql, droits.sql,
-- changement-formule.sql et suspension.sql, dont ce script reprend les
-- gardes (module, abonnement, double facteur).
--
-- Le script est rejouable sans danger.


-- ---------- 1. Le journal ----------

create table if not exists public.mouvements_stock (
  id          uuid primary key default gen_random_uuid(),
  atelier_id  uuid not null references public.ateliers (id) on delete cascade,
  produit_id  uuid not null references public.produits (id) on delete cascade,
  type        text not null check (type in
                ('entree', 'sortie', 'inventaire', 'vente', 'retour_vente')),
  -- Signée : +5 pour une entrée, -3 pour une sortie. Les sommes se font
  -- alors sans distinguer les cas.
  quantite    integer not null,
  stock_avant integer not null,
  stock_apres integer not null,
  motif       text not null default '',
  reference   text not null default '',   -- numéro de facture, pour une vente
  auteur      uuid references public.profils (id) on delete set null,
  cree_le     timestamptz not null default now()
);

create index if not exists mouvements_par_atelier
  on public.mouvements_stock (atelier_id, cree_le desc);
create index if not exists mouvements_par_produit
  on public.mouvements_stock (produit_id, cree_le desc);

alter table public.mouvements_stock enable row level security;

drop policy if exists mouvements_lecture on public.mouvements_stock;
-- Lecture ouverte à l'atelier, abonnement expiré compris : c'est son
-- historique, et la suspension ne prend pas les données en otage.
create policy mouvements_lecture on public.mouvements_stock for select to authenticated
  using (atelier_id = public.atelier_courant());

-- Aucune règle d'écriture : le journal ne se remplit QUE par les
-- fonctions ci-dessous, qui bougent le stock dans le même mouvement.
-- Une ligne écrite à la main pourrait mentir sur le stock réel.


-- ---------- 2. Le socle commun aux trois opérations ----------
--
-- Tout passe par ici : les gardes, le verrou sur la ligne, l'écriture du
-- stock et celle du journal. Les trois fonctions publiques ne font que
-- calculer le nouveau stock et appeler celle-ci.

create or replace function public.bouger_stock(
  p_produit uuid, p_nouveau integer, p_type text, p_motif text, p_reference text
) returns public.produits language plpgsql security definer set search_path = public as
$$
declare
  a uuid := public.atelier_courant();
  p public.produits%rowtype;
begin
  if a is null then
    raise exception 'Aucun atelier associé à ce compte';
  end if;
  if not public.abonnement_actif() then
    raise exception 'Abonnement expiré : renouvelez pour modifier le stock.';
  end if;
  if not public.module_vitrine() then
    raise exception 'La gestion de stock demande la formule Vitrine.';
  end if;
  if not public.est_admin() then
    raise exception 'Réservé à l''administrateur de l''atelier.';
  end if;
  if p_nouveau < 0 then
    raise exception 'Le stock ne peut pas devenir négatif.';
  end if;

  -- Le verrou évite qu'une vente simultanée parte du même stock.
  select * into p from public.produits
   where id = p_produit and atelier_id = a for update;
  if not found then
    raise exception 'Réalisation introuvable dans votre vitrine.';
  end if;

  if p_nouveau = p.stock then
    return p;   -- rien à écrire, et surtout rien à journaliser
  end if;

  update public.produits set stock = p_nouveau, modifie_le = now()
   where id = p.id;

  insert into public.mouvements_stock
    (atelier_id, produit_id, type, quantite, stock_avant, stock_apres,
     motif, reference, auteur)
  values
    (a, p.id, p_type, p_nouveau - p.stock, p.stock, p_nouveau,
     btrim(coalesce(p_motif, '')), coalesce(p_reference, ''), auth.uid());

  select * into p from public.produits where id = p.id;
  return p;
end
$$;

revoke all on function public.bouger_stock(uuid, integer, text, text, text)
  from public, anon, authenticated;
-- Inappelable depuis l'application : elle accepte n'importe quel type de
-- mouvement, y compris « vente ». Les trois portes publiques sont
-- ci-dessous, chacune avec son propre sens.


-- ---------- 3. Approvisionner ----------

create or replace function public.approvisionner_stock(
  p_produit uuid, p_quantite integer, p_motif text default ''
) returns public.produits language plpgsql security definer set search_path = public as
$$
declare
  p public.produits%rowtype;
begin
  if p_quantite is null or p_quantite < 1 then
    raise exception 'Indiquez une quantité d''au moins 1.';
  end if;
  select * into p from public.produits
   where id = p_produit and atelier_id = public.atelier_courant();
  if not found then
    raise exception 'Réalisation introuvable dans votre vitrine.';
  end if;
  return public.bouger_stock(p_produit, p.stock + p_quantite, 'entree', p_motif, '');
end
$$;

revoke all on function public.approvisionner_stock(uuid, integer, text) from public;
grant execute on function public.approvisionner_stock(uuid, integer, text) to authenticated;


-- ---------- 4. Sortir du stock ----------
--
-- Une casse, une perte, un cadeau, un article repris pour retouche. Le
-- motif n'est pas décoratif : c'est la seule chose qui rendra l'écart
-- compréhensible dans six mois. Il est donc exigé.

create or replace function public.sortir_stock(
  p_produit uuid, p_quantite integer, p_motif text
) returns public.produits language plpgsql security definer set search_path = public as
$$
declare
  p public.produits%rowtype;
begin
  if p_quantite is null or p_quantite < 1 then
    raise exception 'Indiquez une quantité d''au moins 1.';
  end if;
  if length(btrim(coalesce(p_motif, ''))) = 0 then
    raise exception 'Indiquez le motif de la sortie.';
  end if;
  select * into p from public.produits
   where id = p_produit and atelier_id = public.atelier_courant();
  if not found then
    raise exception 'Réalisation introuvable dans votre vitrine.';
  end if;
  if p.stock < p_quantite then
    raise exception 'Stock insuffisant pour « % » (reste %).', p.nom, p.stock;
  end if;
  return public.bouger_stock(p_produit, p.stock - p_quantite, 'sortie', p_motif, '');
end
$$;

revoke all on function public.sortir_stock(uuid, integer, text) from public;
grant execute on function public.sortir_stock(uuid, integer, text) to authenticated;


-- ---------- 5. Inventaire ----------
--
-- On ne saisit pas un écart, on saisit CE QU'ON A COMPTÉ. La différence
-- est calculée ici : c'est moins d'arithmétique mentale devant l'étagère,
-- et moins d'erreurs de signe.
--
-- Les lignes conformes ne produisent aucun mouvement — un inventaire
-- juste ne doit pas noircir le journal.

create or replace function public.inventorier_stock(p_lignes jsonb)
returns jsonb language plpgsql security definer set search_path = public as
$$
declare
  ligne    jsonb;
  p        public.produits%rowtype;
  compte   integer;
  corriges integer := 0;
  ecart    integer := 0;
begin
  if p_lignes is null or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Aucune ligne à inventorier.';
  end if;

  for ligne in select * from jsonb_array_elements(p_lignes) loop
    compte := coalesce((ligne ->> 'compte')::integer, -1);
    if compte < 0 then
      raise exception 'Quantité comptée invalide.';
    end if;
    select * into p from public.produits
     where id = (ligne ->> 'produit_id')::uuid
       and atelier_id = public.atelier_courant();
    if not found then
      raise exception 'Réalisation introuvable dans votre vitrine.';
    end if;
    if compte <> p.stock then
      perform public.bouger_stock(p.id, compte, 'inventaire',
        coalesce(ligne ->> 'motif', 'Inventaire'), '');
      corriges := corriges + 1;
      ecart := ecart + (compte - p.stock);
    end if;
  end loop;

  return jsonb_build_object('corriges', corriges, 'ecart', ecart);
end
$$;

revoke all on function public.inventorier_stock(jsonb) from public;
grant execute on function public.inventorier_stock(jsonb) to authenticated;


-- ---------- 6. La vente entre au journal ----------
--
-- Sans cela le journal aurait des trous, et « pourquoi le stock a-t-il
-- baissé ? » resterait sans réponse. La vente écrit sa ligne elle-même :
-- bouger_stock exige est_admin(), or un modérateur peut vendre.
--
-- Signature reprise à l'identique, gardes de suspension.sql conservées.

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
  numero text;
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

  update public.compteurs set prochaine_facture = prochaine_facture + 1
    where atelier_id = a
    returning prochaine_facture - 1 into n;
  if n is null then
    insert into public.compteurs (atelier_id, prochaine_facture) values (a, 2)
      on conflict (atelier_id) do update set prochaine_facture = public.compteurs.prochaine_facture + 1;
    n := 1;
  end if;
  numero := 'FAC-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 4, '0');

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
    insert into public.mouvements_stock
      (atelier_id, produit_id, type, quantite, stock_avant, stock_apres,
       motif, reference, auteur)
    values
      (a, produit.id, 'vente', -quantite, produit.stock, produit.stock - quantite,
       'Vente au comptoir', numero, auth.uid());
    total := total + produit.prix * quantite;
    lignes_completes := lignes_completes || jsonb_build_object(
      'produit_id', produit.id, 'nom', produit.nom, 'code', produit.code,
      'prix', produit.prix, 'quantite', quantite);
  end loop;

  insert into public.ventes (atelier_id, numero, client, client_whatsapp, lignes, total, paye, note)
  values (
    a, numero,
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


-- ---------- 7. L'annulation d'une facture ----------
--
-- L'application remettait les articles en stock ligne par ligne, puis
-- effaçait la facture : trois écritures séparées, sans trace, et rien
-- ne garantissait qu'elles aboutissent toutes. Le tout tient désormais
-- dans une transaction, et laisse sa trace au journal.

create or replace function public.annuler_vente(p_vente uuid)
returns void language plpgsql security definer set search_path = public as
$$
declare
  a uuid := public.atelier_courant();
  v public.ventes%rowtype;
  ligne jsonb;
  produit public.produits%rowtype;
  quantite integer;
begin
  if a is null then
    raise exception 'Aucun atelier associé à ce compte';
  end if;
  if not public.abonnement_actif() then
    raise exception 'Abonnement expiré : renouvelez pour annuler une facture.';
  end if;
  if not public.a_droit('vente_supprimer') then
    raise exception 'Vous n''avez pas le droit d''annuler une facture.';
  end if;

  select * into v from public.ventes where id = p_vente and atelier_id = a for update;
  if not found then
    raise exception 'Facture introuvable.';
  end if;

  for ligne in select * from jsonb_array_elements(coalesce(v.lignes, '[]'::jsonb)) loop
    quantite := coalesce((ligne ->> 'quantite')::integer, 0);
    if quantite > 0 then
      select * into produit from public.produits
       where id = (ligne ->> 'produit_id')::uuid and atelier_id = a for update;
      -- La réalisation a pu être supprimée depuis : on annule quand même
      -- la facture, on ne remet simplement rien en stock.
      if found then
        update public.produits
           set stock = produit.stock + quantite, modifie_le = now()
         where id = produit.id;
        insert into public.mouvements_stock
          (atelier_id, produit_id, type, quantite, stock_avant, stock_apres,
           motif, reference, auteur)
        values
          (a, produit.id, 'retour_vente', quantite,
           produit.stock, produit.stock + quantite,
           'Facture annulée', v.numero, auth.uid());
      end if;
    end if;
  end loop;

  delete from public.ventes where id = v.id;
end
$$;

revoke all on function public.annuler_vente(uuid) from public;
grant execute on function public.annuler_vente(uuid) to authenticated;


-- ---------- Contrôle après exécution ----------

select type, count(*) as mouvements
from public.mouvements_stock
group by type
order by type;

-- Le journal est vide au sortir de ce script : il ne consigne que ce qui
-- se passera à partir de maintenant. Les stocks actuels restent tels
-- quels, sans mouvement d'ouverture — les inventer serait mentir sur des
-- dates. Le premier inventaire posera la référence.

select nom, stock from public.produits order by nom;


-- ---------- Ce qu'il faut savoir ----------
--
-- • Le journal ne s'écrit QUE par ces fonctions. Aucune règle d'écriture
--   n'existe sur la table : une ligne posée à la main pourrait mentir
--   sur le stock réel, et la trace vaut ce qu'elle promet.
--
-- • L'inventaire ne consigne QUE les écarts. Compter juste ne laisse
--   aucune ligne : le journal reste lisible.
--
-- • TOUTE variation passe par le journal, sans exception. Le champ
--   « stock » de la fiche de réalisation reste là — il est commode — mais
--   l'application ne l'écrit plus en direct : à la création elle
--   approvisionne, à la modification elle inventorie. Le stock affiché et
--   le journal ne peuvent donc pas diverger.
--
-- • L'annulation d'une facture passe par annuler_vente : remise en stock,
--   trace, et suppression dans une seule transaction. L'application
--   faisait les trois séparément, sans garantie qu'elles aboutissent
--   toutes.
