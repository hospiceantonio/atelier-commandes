-- =========================================================
-- Chercher dans la boutique — côté serveur
-- À coller dans : Supabase -> SQL Editor -> Run
-- =========================================================
--
-- CE QUI COMPTE ICI N'EST PAS LA LISTE DES FILTRES, MAIS OÙ ILS
-- S'APPLIQUENT.
--
-- Filtrer dans le téléphone suppose d'avoir d'abord tout téléchargé :
-- des centaines de modèles et leurs vignettes, pour en garder trois.
-- C'est lent, c'est cher en données — et sur un forfait béninois, ça se
-- paie. Les filtres partent donc au serveur : il ne renvoie que la page
-- demandée, déjà triée.
--
-- Encore faut-il qu'il sache la trouver sans relire toute la table.
-- D'où les index ci-dessous, un par forme de question posée :
--
--   « robe »          -> index trigramme, pour un ILIKE '%robe%'
--   « taille 40 »     -> index GIN, pour un « le tableau contient 40 »
--   « moins de 20 000 » -> index B-tree sur le prix
--
-- ORDRE D'EXÉCUTION : après mode.sql. Rejouable sans danger.


-- ---------- 1. Recherche par le texte ----------
--
-- pg_trgm découpe les mots en groupes de trois lettres, ce qui rend un
-- « contient » indexable — un LIKE '%robe%' ne l'est pas autrement. Il
-- tolère aussi les fautes de frappe, ce qui compte quand on cherche au
-- pouce sur un téléphone.

create extension if not exists pg_trgm with schema extensions;

create index if not exists produits_nom_trgm
  on public.produits using gin (nom extensions.gin_trgm_ops);
create index if not exists produits_code_trgm
  on public.produits using gin (code extensions.gin_trgm_ops);
create index if not exists produits_categorie_trgm
  on public.produits using gin (categorie extensions.gin_trgm_ops);


-- ---------- 2. Recherche dans les listes ----------
--
-- « Quels modèles existent en 40 ? » se pose au tableau des tailles.
-- Un index GIN répond sans parcourir la table.

create index if not exists produits_tailles_gin  on public.produits using gin (tailles);
create index if not exists produits_couleurs_gin on public.produits using gin (couleurs);
create index if not exists produits_tissus_gin   on public.produits using gin (tissus);


-- ---------- 3. Filtres simples et tri ----------

create index if not exists produits_categorie on public.produits (categorie);
create index if not exists produits_sexe_age  on public.produits (sexe, tranche_age);
create index if not exists produits_prix      on public.produits (prix);
-- La galerie s'ouvre sur les plus récents : le tri par défaut mérite
-- son index, sinon chaque page recommence par un tri complet.
create index if not exists produits_recents   on public.produits (cree_le desc);


-- ---------- 4. Le vocabulaire réellement présent en boutique ----------
--
-- Les filtres ne doivent proposer que ce qui existe : une couleur qu'
-- aucune maison ne coud ne mène qu'à une page vide. Cette fonction rend
-- les valeurs distinctes, en UN aller-retour et quelques centaines
-- d'octets — au lieu de déduire la même chose en téléchargeant le
-- catalogue.
--
-- Elle ne regarde que ce que le public peut voir : maisons à jour
-- d'abonnement, et pourvues de la vitrine.

create or replace function public.vocabulaire_boutique()
returns jsonb language sql stable security definer set search_path = public as
$$
  with visibles as (
    select p.categorie, p.tailles, p.couleurs, p.tissus, p.prix
    from public.produits p
    where public.atelier_actif(p.atelier_id)
      and public.atelier_a_vitrine(p.atelier_id)
  )
  select jsonb_build_object(
    'categories', (select coalesce(jsonb_agg(v order by v), '[]'::jsonb)
                   from (select distinct categorie as v from visibles
                          where coalesce(categorie, '') <> '') x),
    'tailles',    (select coalesce(jsonb_agg(v order by v), '[]'::jsonb)
                   from (select distinct unnest(tailles) as v from visibles) x),
    'couleurs',   (select coalesce(jsonb_agg(v order by v), '[]'::jsonb)
                   from (select distinct unnest(couleurs) as v from visibles) x),
    'tissus',     (select coalesce(jsonb_agg(v order by v), '[]'::jsonb)
                   from (select distinct unnest(tissus) as v from visibles) x),
    'prix_max',   (select coalesce(max(prix), 0) from visibles),
    'total',      (select count(*) from visibles)
  )
$$;

revoke all on function public.vocabulaire_boutique() from public;
-- La boutique se visite sans compte : anon doit pouvoir l'appeler.
grant execute on function public.vocabulaire_boutique() to anon, authenticated;


-- ---------- Contrôle après exécution ----------

select 'Index de recherche' as "Ce qui est attendu",
       case when (select count(*) from pg_indexes
                   where schemaname = 'public'
                     and indexname in ('produits_nom_trgm', 'produits_tailles_gin',
                                       'produits_couleurs_gin', 'produits_tissus_gin',
                                       'produits_prix')) = 5
            then 'OK' else 'MANQUE' end as "État"
union all
select 'Vocabulaire de la boutique',
       case when to_regprocedure('public.vocabulaire_boutique()') is not null
            then 'OK' else 'MANQUE' end;
