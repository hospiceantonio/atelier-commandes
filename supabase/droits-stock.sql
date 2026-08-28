-- =========================================================
-- Droits de stock pour les modérateurs
-- À coller dans : Supabase -> SQL Editor -> Run
-- =========================================================
--
-- La gestion de stock était réservée à l'administrateur. Ses trois
-- opérations deviennent trois droits, cochés un par un dans
-- Réglages -> Équipe, comme les neuf autres.
--
--   stock_approvisionner  ajouter au stock
--   stock_sortie          en retirer (casse, perte, cadeau)
--   stock_inventaire      caler le stock sur un comptage
--
-- Les séparer n'est pas un caprice : approvisionner est anodin, tandis
-- que sortir et inventorier sont précisément les deux gestes par
-- lesquels un manque se dissimule. Un atelier peut vouloir confier le
-- premier sans les seconds.
--
-- AUCUN MODÉRATEUR N'EN HÉRITE. Les trois clés sont absentes de la
-- valeur par défaut de la colonne, et a_droit() traite une clé absente
-- comme un « non » : personne ne gagne un accès qu'il n'avait pas.
--
-- ORDRE D'EXÉCUTION : après stock.sql.
-- Le script est rejouable sans danger.


-- ---------- 1. Le socle n'exige plus d'être administrateur ----------
--
-- bouger_stock reste inappelable depuis l'application (les privilèges
-- lui sont retirés plus bas). Le droit se vérifie dans chacune des trois
-- portes publiques, qui savent, elles, de quel geste il s'agit.

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
  if p_nouveau < 0 then
    raise exception 'Le stock ne peut pas devenir négatif.';
  end if;

  select * into p from public.produits
   where id = p_produit and atelier_id = a for update;
  if not found then
    raise exception 'Réalisation introuvable dans votre vitrine.';
  end if;

  if p_nouveau = p.stock then
    return p;
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


-- ---------- 2. Les trois portes, chacune avec son droit ----------

create or replace function public.approvisionner_stock(
  p_produit uuid, p_quantite integer, p_motif text default ''
) returns public.produits language plpgsql security definer set search_path = public as
$$
declare
  p public.produits%rowtype;
begin
  if not public.a_droit('stock_approvisionner') then
    raise exception 'Vous n''avez pas le droit d''approvisionner le stock.';
  end if;
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


create or replace function public.sortir_stock(
  p_produit uuid, p_quantite integer, p_motif text
) returns public.produits language plpgsql security definer set search_path = public as
$$
declare
  p public.produits%rowtype;
begin
  if not public.a_droit('stock_sortie') then
    raise exception 'Vous n''avez pas le droit de sortir du stock.';
  end if;
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
  if not public.a_droit('stock_inventaire') then
    raise exception 'Vous n''avez pas le droit de faire l''inventaire.';
  end if;
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


-- ---------- Contrôle après exécution ----------
--
-- Aucun modérateur ne doit porter de droit de stock : ces clés viennent
-- d'apparaître, et elles ne s'accordent qu'à la main.

select p.email, p.nom_complet,
       coalesce((p.droits ->> 'stock_approvisionner')::boolean, false) as approvisionner,
       coalesce((p.droits ->> 'stock_sortie')::boolean, false)          as sortie,
       coalesce((p.droits ->> 'stock_inventaire')::boolean, false)      as inventaire
from public.profils p
where p.role = 'moderateur'
order by p.email;


-- ---------- Ce qu'il faut savoir ----------
--
-- • L'administrateur garde les trois, sans rien cocher : a_droit()
--   répond « oui » à tout administrateur.
--
-- • La fiche de réalisation reste réservée à l'administrateur — c'est
--   produits_gestion qui l'exige, et ce script n'y touche pas. Un
--   modérateur qui approvisionne passe donc par le module de stock, pas
--   par le champ du formulaire.
--
-- • Le module reste fermé à la formule « Atelier » et à un abonnement
--   expiré : un droit coché n'ouvre rien que la formule ne porte.
