-- =========================================================
-- Rattachement d'un compte à son atelier — par fonction
-- À coller dans : Supabase -> SQL Editor -> Run
-- =========================================================
--
-- L'application rattachait un compte fraîchement créé en écrivant
-- directement dans « profils », puis en relisant la ligne pour savoir si
-- ça avait marché. Cette relecture est le problème : elle passe par
-- profils_lecture, qui ne voit pas les mêmes lignes que
-- profils_modification. Selon l'ordre des choses, l'écriture aboutissait
-- et l'écran annonçait un échec.
--
-- Deux fonctions remplacent ce bricolage. Étant SECURITY DEFINER, elles
-- ne dépendent d'aucune règle de lecture : elles vérifient elles-mêmes
-- qui appelle et ce qu'il vise, écrivent, et renvoient la ligne. Ce
-- qu'elles répondent est donc VRAI, et leurs messages disent ce qui
-- s'est réellement passé plutôt que d'énumérer des hypothèses.
--
-- ORDRE D'EXÉCUTION : après schema.sql, formules.sql et droits.sql.
-- Le script est rejouable sans danger.


-- ---------- 1. Un administrateur rattache son modérateur ----------

create or replace function public.rattacher_moderateur(p_utilisateur uuid)
returns public.profils language plpgsql security definer set search_path = public as
$$
declare
  a     uuid := public.atelier_courant();
  cible public.profils%rowtype;
begin
  if a is null or not public.est_admin() then
    raise exception 'Réservé à l''administrateur de l''atelier.';
  end if;

  select * into cible from public.profils where id = p_utilisateur for update;
  if not found then
    -- Le compte existe côté connexion, mais son profil n'est pas encore
    -- là. L'application réessaie ; si le message remonte, c'est que le
    -- déclencheur qui crée les profils n'a pas fonctionné.
    raise exception 'PROFIL_ABSENT';
  end if;

  if cible.role = 'superadmin' then
    raise exception 'Ce compte est celui du fournisseur : il ne peut pas devenir modérateur.';
  end if;
  if cible.atelier_id is not null and cible.atelier_id <> a then
    raise exception 'Cette adresse appartient déjà à un autre atelier.';
  end if;

  -- garde_profil ramènerait rôle et atelier à leur valeur d'avant : ce
  -- drapeau, local à la transaction, lui dit que le rattachement vient
  -- d'ici, après vérification.
  perform set_config('app.inscription_interne', 'on', true);
  update public.profils
     set role = 'moderateur', atelier_id = a
   where id = cible.id
   returning * into cible;
  perform set_config('app.inscription_interne', 'off', true);

  -- Un déclencheur peut défaire une écriture SANS lever d'erreur : c'est
  -- ainsi que le rattachement échouait en silence. On relit donc ce qu'on
  -- vient d'écrire, et on refuse de répondre « c'est fait » si ça ne l'est
  -- pas.
  if cible.atelier_id is distinct from a or cible.role <> 'moderateur' then
    raise exception 'Le rattachement a été annulé par le garde des profils. Exécutez droits.sql, puis ce script.';
  end if;

  return cible;
end
$$;

revoke all on function public.rattacher_moderateur(uuid) from public;
grant execute on function public.rattacher_moderateur(uuid) to authenticated;


-- ---------- 2. Le superadministrateur rattache un administrateur ----------

create or replace function public.rattacher_admin(p_utilisateur uuid, p_atelier uuid)
returns public.profils language plpgsql security definer set search_path = public as
$$
declare
  cible public.profils%rowtype;
begin
  if public.role_courant() is distinct from 'superadmin' then
    raise exception 'Réservé au superadministrateur.';
  end if;
  if not exists (select 1 from public.ateliers where id = p_atelier) then
    raise exception 'Atelier introuvable.';
  end if;

  select * into cible from public.profils where id = p_utilisateur for update;
  if not found then
    raise exception 'PROFIL_ABSENT';
  end if;
  if cible.atelier_id is not null and cible.atelier_id <> p_atelier then
    raise exception 'Cette adresse appartient déjà à un autre atelier.';
  end if;

  perform set_config('app.inscription_interne', 'on', true);
  update public.profils
     set role = 'admin', atelier_id = p_atelier
   where id = cible.id
   returning * into cible;
  perform set_config('app.inscription_interne', 'off', true);

  if cible.atelier_id is distinct from p_atelier or cible.role <> 'admin' then
    raise exception 'Le rattachement a été annulé par le garde des profils. Exécutez droits.sql, puis ce script.';
  end if;

  return cible;
end
$$;

revoke all on function public.rattacher_admin(uuid, uuid) from public;
grant execute on function public.rattacher_admin(uuid, uuid) to authenticated;


-- ---------- Contrôle après exécution ----------
--
-- Les comptes sans atelier. Après une création qui a échoué, un compte
-- peut être resté ici, en « admin sans atelier » : il est inerte et sans
-- danger, mais il occupe son adresse email.

select p.email, p.nom_complet, p.role, p.cree_le
from public.profils p
where p.atelier_id is null and p.role <> 'superadmin'
order by p.cree_le desc;

-- Pour rattacher à la main l'un d'eux comme modérateur d'un atelier :
--
--   update public.profils
--      set role = 'moderateur',
--          atelier_id = (select id from public.ateliers where nom = 'Chez FAGLA')
--    where email = 'adresse@exemple.com';
--
-- (Depuis l'éditeur SQL, auth.uid() est nul : le garde ne s'applique pas.)
--
-- Pour libérer une adresse restée inutilisable, supprimez le compte dans
-- Authentication -> Users : le profil suit en cascade.


-- ---------- Ce qu'il faut savoir ----------
--
-- • « PROFIL_ABSENT » est un message technique, jamais montré tel quel :
--   l'application le reconnaît, patiente et réessaie une fois. S'il vous
--   parvient malgré tout, c'est que le déclencheur gerer_nouvel_utilisateur
--   ne crée plus les profils — à vérifier dans Database -> Triggers.
--
-- • Ces fonctions ne créent aucun compte : la création reste du ressort
--   de Supabase Auth, côté application. Elles ne font que rattacher un
--   compte existant, après avoir vérifié qui le demande.
