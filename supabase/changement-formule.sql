-- =========================================================
-- Changement de formule par l'administrateur de l'atelier
-- À coller dans : Supabase -> SQL Editor -> Run
-- =========================================================
--
-- Jusqu'ici, seul le superadministrateur pouvait changer la formule d'un
-- atelier. Son administrateur peut désormais le faire lui-même, en
-- payant le premier mois de la nouvelle formule.
--
-- LA RÈGLE, telle qu'elle a été demandée : le changement annule
-- l'abonnement en cours. Le mois payé court à partir du jour du
-- changement, et les jours restants de l'ancienne formule sont perdus.
-- L'écran le dit avant de demander confirmation.
--
-- POURQUOI EN DEUX TEMPS. Le crédit d'abonnement vient du webhook
-- KKiaPay, qui n'a que trois informations : l'atelier, une référence et
-- un montant. Il déduit le nombre de mois en divisant le montant par le
-- tarif de l'atelier — l'ANCIEN tarif, tant que rien n'a changé. Un
-- administrateur qui passe de 7 000 à 3 000 paierait 3 000 pour un
-- abonnement encore facturé 7 000 : floor(3000/7000) = 0, paiement
-- refusé.
--
-- L'intention est donc enregistrée AVANT le paiement. Le webhook la lit,
-- calcule sur le bon tarif, applique la formule et repart d'aujourd'hui.
--
-- ORDRE D'EXÉCUTION : après schema.sql, formules.sql et droits.sql.
-- Le script est rejouable sans danger.


-- ---------- 1. L'intention, en attente de son paiement ----------

alter table public.ateliers
  add column if not exists formule_demandee    text,
  add column if not exists formule_demandee_le timestamptz;

comment on column public.ateliers.formule_demandee is
  'Formule choisie par l''administrateur, appliquée à la réception du paiement.';


-- ---------- 2. Un administrateur demande le changement ----------
--
-- La fonction ne change RIEN à l'abonnement : elle note l'intention et
-- renvoie le prix à payer. C'est le paiement qui décide, pas l'écran.

create or replace function public.demander_changement_formule(p_formule text)
returns jsonb language plpgsql security definer set search_path = public as
$$
declare
  a public.ateliers%rowtype;
  f public.formules%rowtype;
begin
  if public.atelier_courant() is null or not public.est_admin() then
    raise exception 'Réservé à l''administrateur de l''atelier.';
  end if;

  select * into a from public.ateliers where id = public.atelier_courant();
  if not found then
    raise exception 'Atelier introuvable.';
  end if;

  select * into f from public.formules where code = p_formule and active;
  if not found then
    raise exception 'Formule inconnue ou fermée.';
  end if;
  if f.code = a.formule then
    raise exception 'Vous êtes déjà sur cette formule.';
  end if;

  update public.ateliers
     set formule_demandee = f.code, formule_demandee_le = now()
   where id = a.id;

  -- Le prix vient de la table, jamais du navigateur.
  return jsonb_build_object(
    'formule', f.code, 'nom', f.nom, 'prix', f.prix_mensuel,
    'formule_actuelle', a.formule, 'fin_actuelle', a.abonnement_fin);
end
$$;

revoke all on function public.demander_changement_formule(text) from public;
grant execute on function public.demander_changement_formule(text) to authenticated;

-- Renoncer avant d'avoir payé.
create or replace function public.annuler_changement_formule()
returns void language plpgsql security definer set search_path = public as
$$
begin
  if public.atelier_courant() is null or not public.est_admin() then
    raise exception 'Réservé à l''administrateur de l''atelier.';
  end if;
  update public.ateliers
     set formule_demandee = null, formule_demandee_le = null
   where id = public.atelier_courant();
end
$$;

revoke all on function public.annuler_changement_formule() from public;
grant execute on function public.annuler_changement_formule() to authenticated;

-- L'administrateur ne pose que l'intention, jamais la formule elle-même :
-- proteger_atelier ramène formule et abonnement_mensuel à leur valeur
-- d'avant pour tout ce qui ne vient pas du superadministrateur. La
-- colonne formule_demandee, elle, n'ouvre aucun droit — elle n'est
-- écrite que par la fonction ci-dessus, qui vérifie tout.


-- ---------- 3. Le paiement applique le changement ----------
--
-- Signature reprise à l'identique : la fonction Edge appelée par le
-- webhook KKiaPay l'appelle ainsi, et n'a pas à être retouchée.

create or replace function public.prolonger_abonnement_kkiapay(
  p_atelier uuid, p_reference text, p_montant numeric
) returns jsonb language plpgsql security definer set search_path = public as
$$
declare
  a public.ateliers%rowtype;
  f public.formules%rowtype;
  prix numeric;
  changement boolean := false;
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

  /* Un changement de formule attend-il son paiement ? On lui laisse deux
     heures : au-delà, l'intention est oubliée et le versement prolonge
     simplement la formule en cours. Mieux vaut prolonger que refuser. */
  if a.formule_demandee is not null
     and a.formule_demandee_le is not null
     and a.formule_demandee_le > now() - interval '2 hours' then
    select * into f from public.formules where code = a.formule_demandee and active;
    if found then
      prix := f.prix_mensuel;
      changement := true;
    end if;
  end if;
  if not changement then
    prix := a.abonnement_mensuel;
  end if;

  n_mois := floor(p_montant / nullif(prix, 0))::integer;
  if n_mois is null or n_mois < 1 then
    return jsonb_build_object('statut', 'montant_insuffisant');
  end if;
  n_mois := least(n_mois, 12);

  /* Le drapeau n'est utile que si la fonction est un jour appelée avec
     un jeton d'utilisateur : depuis le webhook, auth.uid() est nul et le
     garde ne s'applique pas. Le poser ne coûte rien et ferme le cas. */
  perform set_config('app.abonnement_interne', 'on', true);

  if changement then
    /* L'abonnement en cours est annulé : le mois part d'aujourd'hui, et
       les jours restants de l'ancienne formule sont perdus. */
    nouvelle_fin := now() + make_interval(days => 31 * n_mois);
    update public.ateliers
       set formule = f.code,
           abonnement_mensuel = f.prix_mensuel,
           abonnement_fin = nouvelle_fin,
           formule_demandee = null,
           formule_demandee_le = null
     where id = a.id;
  else
    nouvelle_fin := greatest(a.abonnement_fin, now()) + make_interval(days => 31 * n_mois);
    update public.ateliers set abonnement_fin = nouvelle_fin where id = a.id;
  end if;

  perform set_config('app.abonnement_interne', 'off', true);

  insert into public.paiements_abonnement (atelier_id, reference, montant, mois, fin_avant, fin_apres)
  values (a.id, p_reference, p_montant, n_mois, a.abonnement_fin, nouvelle_fin);

  return jsonb_build_object('statut', 'ok', 'mois', n_mois, 'fin', nouvelle_fin,
                            'formule', case when changement then f.code else a.formule end);
exception when unique_violation then
  return jsonb_build_object('statut', 'deja_traite');
end
$$;

revoke all on function public.prolonger_abonnement_kkiapay(uuid, text, numeric)
  from public, anon, authenticated;
grant execute on function public.prolonger_abonnement_kkiapay(uuid, text, numeric) to service_role;


-- ---------- 4. Le code de renouvellement suit la formule en attente ----
--
-- Un atelier peut aussi payer par code. Le code prolonge d'un mois au
-- tarif en cours ; s'il y a un changement en attente, il l'applique de
-- la même façon — sans quoi les deux moyens de paiement ne diraient pas
-- la même chose.

create or replace function public.utiliser_code(p_code text)
returns jsonb language plpgsql security definer set search_path = public as
$$
declare
  a public.ateliers%rowtype;
  f public.formules%rowtype;
  c public.codes_abonnement%rowtype;
  nettoye text;
  complet text;
  changement boolean := false;
  nouvelle_fin timestamptz;
begin
  if public.atelier_courant() is null or not public.est_admin() then
    raise exception 'Réservé à l''administrateur de l''atelier.';
  end if;

  nettoye := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if length(nettoye) <> 12 then
    return jsonb_build_object('statut', 'invalide');
  end if;
  complet := substr(nettoye, 1, 4) || '-' || substr(nettoye, 5, 4) || '-' || substr(nettoye, 9, 4);

  select * into c from public.codes_abonnement where code = complet for update;
  if not found then
    return jsonb_build_object('statut', 'invalide');
  end if;
  if c.utilise_le is not null then
    return jsonb_build_object('statut', 'deja_utilise');
  end if;

  select * into a from public.ateliers where id = public.atelier_courant() for update;

  if a.formule_demandee is not null
     and a.formule_demandee_le is not null
     and a.formule_demandee_le > now() - interval '2 hours' then
    select * into f from public.formules where code = a.formule_demandee and active;
    if found then changement := true; end if;
  end if;

  perform set_config('app.abonnement_interne', 'on', true);

  if changement then
    nouvelle_fin := now() + interval '31 days';
    update public.ateliers
       set formule = f.code,
           abonnement_mensuel = f.prix_mensuel,
           abonnement_fin = nouvelle_fin,
           formule_demandee = null,
           formule_demandee_le = null
     where id = a.id;
  else
    nouvelle_fin := greatest(a.abonnement_fin, now()) + interval '31 days';
    update public.ateliers set abonnement_fin = nouvelle_fin where id = a.id;
  end if;

  update public.codes_abonnement
     set utilise_le = now(), utilise_par = a.id
   where code = complet;

  insert into public.paiements_abonnement
    (atelier_id, reference, montant, mois, fin_avant, fin_apres)
  values (a.id, 'code:' || complet,
          case when changement then f.prix_mensuel else a.abonnement_mensuel end,
          1, a.abonnement_fin, nouvelle_fin);

  perform set_config('app.abonnement_interne', 'off', true);

  return jsonb_build_object('statut', 'ok', 'fin', nouvelle_fin,
                            'formule', case when changement then f.code else a.formule end);
end
$$;

revoke all on function public.utiliser_code(text) from public;
grant execute on function public.utiliser_code(text) to authenticated;


-- ---------- Contrôle après exécution ----------

select id, nom, formule, abonnement_mensuel, abonnement_fin,
       formule_demandee, formule_demandee_le
from public.ateliers
order by nom;

-- Aucun atelier ne doit avoir de formule_demandee au sortir de ce
-- script : la colonne vient d'être créée.


-- ---------- Ce qu'il faut savoir ----------
--
-- • CHANGER DE FORMULE COÛTE UN MOIS PLEIN, et fait perdre les jours
--   restants. Un atelier à 25 jours de son échéance qui descend de
--   « Atelier + Vitrine » à « Atelier » perd ces 25 jours et paie
--   5 000 F. C'est la règle demandée ; l'écran l'affiche noir sur blanc
--   avant de demander confirmation. Si vous préférez que le changement
--   ne prenne effet qu'à l'échéance, dites-le : c'est une autre
--   fonction, plus douce pour vos clients.
--
-- • L'intention expire au bout de deux heures. Un paiement qui arrive
--   après ce délai prolonge simplement la formule en cours, au lieu
--   d'être refusé.
--
-- • Un atelier qui descend vers une formule sans le module Vitrine
--   garde ses réalisations et ses factures en base : elles cessent
--   d'être publiées et modifiables, elles ne sont pas effacées. Remonter
--   de formule les remet en ligne telles quelles.
--
-- • Le superadministrateur garde sa main sur la fiche de l'atelier : il
--   y change la formule sans paiement, comme avant.
