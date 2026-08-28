-- =========================================================
-- La fiche « mode » d'une réalisation
-- À coller dans : Supabase -> SQL Editor -> Run
-- =========================================================
--
-- Une réalisation ne disait jusqu'ici que son nom, son code, sa
-- catégorie et son prix. Pour la vitrine, il manque ce qu'un client
-- demande toujours avant d'écrire : pour qui, en quelle taille, en
-- quelle couleur, dans quel tissu.
--
-- CE QUI EST STOCKÉ, ET SOUS QUELLE FORME.
--
-- • sexe et tranche_age sont des mots d'un vocabulaire fermé : une
--   contrainte les tient. Ils commandent la grille de tailles proposée
--   dans l'application — un pantalon d'enfant ne se mesure pas comme
--   une robe de femme.
--
-- • tailles et couleurs sont des LISTES : un même modèle se décline.
--   D'où des tableaux, et non des colonnes séparées qu'il faudrait
--   ajouter à chaque nouvelle taille.
--
-- • Les tailles sont enregistrées TELLES QU'AFFICHÉES (« 38 »,
--   « 6 ans (116) », « L »). La norme européenne EN 13402 mesure les
--   enfants en centimètres de stature : la grille de l'application
--   porte donc l'âge ET le centimètre, et c'est cette étiquette-là qui
--   est gardée — celle que la cliente lit sur l'ourlet.
--
-- • tissu reste un texte libre avec des suggestions. Le wax, le bazin
--   et le kente ne figurent dans aucune nomenclature européenne, et
--   une couturière de Cotonou en connaît d'autres que moi.
--
-- • sur_mesure et tendance sont deux drapeaux distincts de « en_avant » :
--   « à la une » est un choix de vitrine, « tendance » un fait de mode,
--   « sur mesure » une façon de travailler.
--
-- ORDRE D'EXÉCUTION : après schema.sql. Rejouable sans danger.
-- Aucune réalisation existante n'est modifiée : tout part vide.


-- ---------- 1. Les colonnes ----------

alter table public.produits add column if not exists sexe         text not null default '';
alter table public.produits add column if not exists tranche_age  text not null default '';
alter table public.produits add column if not exists tailles      text[] not null default '{}';
alter table public.produits add column if not exists couleurs     text[] not null default '{}';
alter table public.produits add column if not exists tissu        text not null default '';
alter table public.produits add column if not exists sur_mesure   boolean not null default false;
alter table public.produits add column if not exists tendance     boolean not null default false;


-- ---------- 2. Le vocabulaire ----------
--
-- Posées à part et nommées, comme le veut la règle apprise avec
-- profils_role_check : une contrainte écrite dans un « create table if
-- not exists » ne suit pas les bases déjà installées. Celles-ci se
-- reposent à chaque exécution.
--
-- La chaîne vide vaut « non précisé » : c'est l'état de toutes les
-- réalisations déjà publiées, et il doit rester permis.

alter table public.produits drop constraint if exists produits_sexe_check;
alter table public.produits add constraint produits_sexe_check
  check (sexe in ('', 'femme', 'homme', 'mixte'));

alter table public.produits drop constraint if exists produits_tranche_age_check;
alter table public.produits add constraint produits_tranche_age_check
  check (tranche_age in ('', 'bebe', 'enfant', 'ado', 'adulte'));

-- Une liste sans trous ni doublons : sans quoi la vitrine afficherait
-- des étiquettes vides, et un même choix compterait deux fois.
--
-- Le dédoublonnage demande de parcourir le tableau, et une contrainte
-- n'accepte pas de sous-requête. Il passe donc par une fonction — la
-- même pour les deux listes, plutôt que deux règles à garder d'accord.
create or replace function public.liste_propre(p text[], p_max integer)
returns boolean language sql immutable as
$$
  select p is null
      or (array_position(p, null) is null
          and cardinality(p) <= p_max
          and cardinality(p) = (select count(distinct x) from unnest(p) as x))
$$;

alter table public.produits drop constraint if exists produits_tailles_check;
alter table public.produits add constraint produits_tailles_check
  check (public.liste_propre(tailles, 40));

alter table public.produits drop constraint if exists produits_couleurs_check;
alter table public.produits add constraint produits_couleurs_check
  check (public.liste_propre(couleurs, 20));


-- ---------- 3. Retrouver vite ce qui est de saison ----------
--
-- Index partiels : ils ne portent que sur les lignes marquées, donc
-- restent minuscules même quand la vitrine grandit.

create index if not exists produits_tendance
  on public.produits (atelier_id) where tendance;

create index if not exists produits_sur_mesure
  on public.produits (atelier_id) where sur_mesure;


-- ---------- Contrôle après exécution ----------

select 'Colonnes de mode' as "Ce qui est attendu",
       case when (select count(*) from information_schema.columns
                   where table_schema = 'public' and table_name = 'produits'
                     and column_name in ('sexe', 'tranche_age', 'tailles',
                                         'couleurs', 'tissu', 'sur_mesure', 'tendance')) = 7
            then 'OK' else 'MANQUE' end as "État";
