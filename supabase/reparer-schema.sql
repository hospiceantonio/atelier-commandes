-- =========================================================
-- Remise à niveau d'une base installée avant certaines
-- évolutions — et état des lieux
-- À coller dans : Supabase -> SQL Editor -> Run
-- =========================================================
--
-- POURQUOI CE SCRIPT EXISTE.
--
-- schema.sql crée ses tables avec « create table if not exists ». Sur une
-- base neuve, tout est posé. Sur une base DÉJÀ INSTALLÉE, cette formule
-- ne touche à rien : ni à une colonne ajoutée depuis, ni à une contrainte
-- élargie. Le fichier disait donc une chose, la base en appliquait une
-- autre, et rien ne le signalait.
--
-- C'est ce décalage qui a produit une longue série d'erreurs à la
-- création d'un modérateur. Le rôle « moderateur » est arrivé après la
-- première version de schema.sql ; les bases plus anciennes gardaient une
-- contrainte qui ne connaissait que « superadmin » et « admin ». Le
-- rattachement d'un modérateur y était donc impossible — et longtemps
-- INVISIBLE : le garde des profils ramenait le rôle en arrière avant que
-- la contrainte n'ait son mot à dire, l'écriture ne touchait plus rien,
-- et l'écran accusait l'adresse email. Une fois le garde franchi comme il
-- devait l'être, la vraie cause a enfin parlé :
--
--   new row for relation "profils" violates check constraint
--   "profils_role_check"
--
-- Ce script repose ce que « create table if not exists » a laissé de
-- côté, puis dresse l'état des lieux. Il est rejouable sans danger et ne
-- touche à aucune donnée.
--
-- ORDRE D'EXÉCUTION : après tous les autres scripts. À relancer après
-- chaque mise à jour, ne serait-ce que pour lire son tableau final.


-- ---------- 1. Le rôle « moderateur » ----------

alter table public.profils drop constraint if exists profils_role_check;
alter table public.profils add constraint profils_role_check
  check (role in ('superadmin', 'admin', 'moderateur'));


-- ---------- 2. Le numéro WhatsApp sur les factures ----------

alter table public.ventes add column if not exists client_whatsapp text not null default '';


-- ---------- 3. La ligne « Modèle » du message type ----------
--
-- N'affecte que les ateliers créés après coup : les messages déjà
-- personnalisés ne sont pas touchés.

alter table public.ateliers alter column modele_whatsapp set default
  'Bonjour {prenom} 👋' || E'\n' ||
  'Votre commande {numero} chez {atelier} :' || E'\n' ||
  '• Modèle : {description}' || E'\n' ||
  '• Livraison prévue : {livraison}' || E'\n' ||
  '• Montant : {montant}' || E'\n' ||
  '• Acompte reçu : {acompte}' || E'\n' ||
  '• Reste à payer : {solde}' || E'\n' ||
  'Merci pour votre confiance !';


-- ---------- 4. État des lieux ----------
--
-- Une ligne par chose dont l'application a besoin. « MANQUE » nomme le
-- fichier à exécuter. C'est ce tableau qu'il faut lire après chaque mise
-- à jour : un écart y apparaît ici, en clair, au lieu de ressortir un
-- jour sous la forme d'un message incompréhensible à l'écran.

with attendu(rang, quoi, present, fichier) as (
  values
    (1, 'Rôle « moderateur » accepté',
        exists (select 1 from pg_constraint
                 where conrelid = 'public.profils'::regclass
                   and conname = 'profils_role_check'
                   and pg_get_constraintdef(oid) like '%moderateur%'),
        'reparer-schema.sql'),
    (2, 'Colonne ventes.client_whatsapp',
        exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'ventes'
                   and column_name = 'client_whatsapp'),
        'reparer-schema.sql'),
    (3, 'Table des formules',
        to_regclass('public.formules') is not null, 'formules.sql'),
    (4, 'Colonne ateliers.formule',
        exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'ateliers'
                   and column_name = 'formule'), 'formules.sql'),
    (5, 'Inscription libre (creer_mon_atelier)',
        to_regprocedure('public.creer_mon_atelier(text,text,text,text,text)') is not null,
        'formules.sql'),
    (6, 'Changement de formule',
        to_regprocedure('public.demander_changement_formule(text)') is not null,
        'changement-formule.sql'),
    (7, 'Droits des modérateurs (colonne)',
        exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'profils'
                   and column_name = 'droits'), 'droits.sql'),
    (8, 'Droits des modérateurs (a_droit)',
        to_regprocedure('public.a_droit(text)') is not null, 'droits.sql'),
    (9, 'Abonnement expiré : écritures fermées',
        to_regprocedure('public.abonnement_actif()') is not null, 'suspension.sql'),
    (10, 'Journal de stock',
        to_regclass('public.mouvements_stock') is not null, 'stock.sql'),
    (11, 'Mouvements de stock (bouger_stock)',
        to_regprocedure('public.bouger_stock(uuid,integer,text,text,text)') is not null,
        'stock.sql'),
    (12, 'Rattachement d''un modérateur',
        to_regprocedure('public.rattacher_moderateur(uuid)') is not null, 'equipe.sql'),
    (13, 'Rattrapage par adresse email',
        to_regprocedure('public.rattacher_moderateur_par_email(text)') is not null,
        'equipe.sql'),
    (14, 'Rattachement d''un administrateur',
        to_regprocedure('public.rattacher_admin(uuid,uuid)') is not null, 'equipe.sql'),
    (15, 'Fiche mode des réalisations',
        (select count(*) from information_schema.columns
          where table_schema = 'public' and table_name = 'produits'
            and column_name in ('sexe', 'tranche_age', 'tailles', 'couleurs',
                                'tissu', 'sur_mesure', 'tendance')) = 7,
        'mode.sql')
)
select quoi as "Ce qui est attendu",
       case when present then 'OK' else 'MANQUE' end as "État",
       case when present then '' else fichier end as "À exécuter"
from attendu order by rang;


-- ---------- 5. Les comptes restés sans atelier ----------
--
-- Chaque échec de rattachement a pu laisser un compte ici : il est inerte,
-- mais il occupe son adresse email. Depuis l'application, réessayer avec
-- la même adresse le rattrape désormais — dans l'heure qui suit sa
-- création. Passé ce délai, deux issues : le rattacher à la main
-- ci-dessous, ou libérer l'adresse en supprimant le compte dans
-- Authentication -> Users (le profil suit en cascade).

select p.email, p.nom_complet, p.role, p.cree_le
from public.profils p
where p.atelier_id is null and p.role <> 'superadmin'
order by p.cree_le desc;

--   update public.profils
--      set role = 'moderateur',
--          atelier_id = (select id from public.ateliers where nom = 'Chez FAGLA')
--    where lower(email) = lower('adresse@exemple.com');
--
-- (Depuis l'éditeur SQL, auth.uid() est nul : le garde ne s'applique pas.)
