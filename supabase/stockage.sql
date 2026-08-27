-- =========================================================
-- Stockage des médias — création des buckets et de leurs règles
-- À coller dans : Supabase -> SQL Editor -> Run
-- =========================================================
--
-- Aujourd'hui, toutes les images de l'application sont rangées en base
-- sous forme de data-url (base64) : logos, couvertures, photos de
-- réalisations, photos de commandes, bannières. C'est simple, mais ça
-- alourdit chaque ligne lue et gonfle la base — la vitrine paie ce prix
-- à chaque écran.
--
-- Ces trois buckets préparent le passage au stockage de fichiers. Le
-- script ne migre rien et ne casse rien : il crée les contenants et
-- leurs règles d'accès. L'application continue de fonctionner comme
-- avant tant qu'elle n'y écrit pas.
--
-- Le script est rejouable sans danger.
--
-- ---------- CONVENTION DE CHEMIN — elle porte la sécurité ----------
--
-- Chaque fichier est rangé sous l'identifiant de son atelier :
--
--     vitrine/{atelier_id}/produits/{produit_id}/{fichier}.webp
--     vitrine/{atelier_id}/logo.webp
--     commandes/{atelier_id}/{commande_id}/{fichier}.webp
--     bannieres/{banniere_id}.webp
--
-- Les règles ci-dessous lisent le PREMIER dossier du chemin et le
-- comparent à l'atelier de la session. Un atelier ne peut donc ni
-- écrire ni supprimer chez un autre, même en forgeant la requête.
-- Si la convention change, les règles doivent changer avec elle.

-- ---------- Les trois buckets ----------
--
-- vitrine    public  — ce que le monde doit voir : logos, couvertures,
--                      photos de réalisations.
-- bannieres  public  — les images du carrousel, posées par vous seul.
-- commandes  PRIVÉ   — les photos attachées aux commandes des clients.
--                      Tissus, modèles, essayages : cela n'appartient
--                      qu'à l'atelier concerné et ne doit jamais être
--                      lisible par une URL devinée.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('vitrine',   'vitrine',   true,  5242880,
   array['image/jpeg', 'image/png', 'image/webp']),
  ('bannieres', 'bannieres', true,  5242880,
   array['image/jpeg', 'image/png', 'image/webp']),
  ('commandes', 'commandes', false, 5242880,
   array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 5 Mo par fichier : large pour une photo de téléphone compressée,
-- assez bas pour qu'un envoi accidentel de photo brute soit refusé
-- plutôt que de remplir le quota.

-- ---------- Règles d'accès ----------
-- storage.objects a déjà ses règles activées par Supabase : on y ajoute
-- les nôtres, en repartant à zéro à chaque exécution.

-- ---------- vitrine ----------

drop policy if exists vitrine_lecture on storage.objects;
-- Le bucket est public : les images sont servies sans compte, comme la
-- vitrine elle-même. Cette règle ne concerne que l'accès par l'API.
create policy vitrine_lecture on storage.objects for select to anon, authenticated
  using (bucket_id = 'vitrine');

drop policy if exists vitrine_depot on storage.objects;
-- Déposer : les membres de l'atelier, chacun dans son dossier.
-- Un modérateur publie des réalisations, comme il crée des commandes.
create policy vitrine_depot on storage.objects for insert to authenticated
  with check (
    bucket_id = 'vitrine'
    and (storage.foldername(name))[1] = public.atelier_courant()::text
  );

drop policy if exists vitrine_remplacement on storage.objects;
create policy vitrine_remplacement on storage.objects for update to authenticated
  using (
    bucket_id = 'vitrine'
    and (storage.foldername(name))[1] = public.atelier_courant()::text
  )
  with check (
    bucket_id = 'vitrine'
    and (storage.foldername(name))[1] = public.atelier_courant()::text
  );

drop policy if exists vitrine_suppression on storage.objects;
-- Supprimer reste à l'administrateur, comme partout ailleurs dans
-- l'application : un modérateur ajoute, il ne défait pas.
create policy vitrine_suppression on storage.objects for delete to authenticated
  using (
    bucket_id = 'vitrine'
    and (storage.foldername(name))[1] = public.atelier_courant()::text
    and public.est_admin()
  );

-- ---------- commandes (privé) ----------

drop policy if exists commandes_lecture on storage.objects;
-- Aucune lecture anonyme : seul l'atelier propriétaire voit ses photos.
create policy commandes_lecture on storage.objects for select to authenticated
  using (
    bucket_id = 'commandes'
    and (storage.foldername(name))[1] = public.atelier_courant()::text
  );

drop policy if exists commandes_depot on storage.objects;
create policy commandes_depot on storage.objects for insert to authenticated
  with check (
    bucket_id = 'commandes'
    and (storage.foldername(name))[1] = public.atelier_courant()::text
  );

drop policy if exists commandes_suppression on storage.objects;
create policy commandes_suppression on storage.objects for delete to authenticated
  using (
    bucket_id = 'commandes'
    and (storage.foldername(name))[1] = public.atelier_courant()::text
    and public.est_admin()
  );

-- ---------- bannieres ----------

drop policy if exists bannieres_lecture_fichiers on storage.objects;
create policy bannieres_lecture_fichiers on storage.objects for select to anon, authenticated
  using (bucket_id = 'bannieres');

drop policy if exists bannieres_gestion_fichiers on storage.objects;
-- Le carrousel n'appartient qu'au superadministrateur.
create policy bannieres_gestion_fichiers on storage.objects for all to authenticated
  using (bucket_id = 'bannieres' and public.role_courant() = 'superadmin')
  with check (bucket_id = 'bannieres' and public.role_courant() = 'superadmin');

-- ---------- Contrôle après exécution ----------
--
-- Les trois buckets doivent apparaître, « commandes » avec public = false.

select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('vitrine', 'bannieres', 'commandes')
order by id;

-- Et les règles posées ci-dessus :

select policyname, cmd
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like any (array['vitrine_%', 'commandes_%', 'bannieres_%'])
order by policyname;

-- ---------- Ce qu'il faut savoir ----------
--
-- • Le double facteur agit aussi ici. atelier_courant() et
--   role_courant() exigent les deux facteurs quand il est activé : une
--   session incomplète ne dépose ni ne lit aucun fichier.
--
-- • Un bucket public est servi sans authentification. Les images d'un
--   atelier dont l'abonnement a expiré disparaissent des listes, mais
--   restent atteignables par leur URL directe si on la connaît. Pour la
--   vitrine c'est sans conséquence ; c'est pourquoi les photos de
--   commandes, elles, sont dans un bucket privé.
--
-- • Le quota gratuit de Supabase est de 1 Go. À 200 Ko par photo
--   compressée, cela laisse environ 5 000 images — largement de quoi
--   voir venir, mais cela se surveille dans Storage -> Usage.
