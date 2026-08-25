# Mise en service du serveur Supabase (10 minutes, une seule fois)

## 1. Créer le projet

1. Créez un compte (gratuit) sur https://supabase.com puis **New project**.
2. Choisissez un nom (ex. `atelier`), un mot de passe de base de données
   (gardez-le précieusement), une région proche (Europe Ouest).
3. Une fois le projet prêt : **Settings → API**. Notez :
   - **Project URL** (ex. `https://xxxx.supabase.co`)
   - la clé **anon / public**

## 2. Installer le schéma

1. Menu **SQL Editor → New query**.
2. Collez tout le contenu de `supabase/schema.sql` et cliquez **Run**.
   (Le script est rejouable sans danger.)

## 3. Régler l'authentification

1. **Authentication → Sign In / Up  → Email** :
   désactivez **Confirm email** (les comptes sont créés par le
   superadministrateur, pas par le public).

## 4. Brancher l'application

Dans `js/config.js`, renseignez `supabaseUrl` et `supabaseAnonKey`
avec les valeurs de l'étape 1, puis poussez sur `main` : le site et
l'APK se reconstruisent automatiquement.

## 5. Créer le compte superadministrateur

1. Ouvrez l'application → **« Première installation : créer un compte »** →
   créez votre compte (email + mot de passe).
2. Dans Supabase, **SQL Editor** :

   ```sql
   update public.profils set role = 'superadmin' where email = 'votre-email@exemple.com';
   ```

3. Reconnectez-vous dans l'application : vous arrivez sur le panneau
   **Ateliers** et pouvez créer vos ateliers clients.

## 6. Paiement de l'abonnement par KKiaPay (facultatif)

Une fois configuré, chaque administrateur peut renouveler son abonnement
lui-même (Mobile Money MTN/Moov ou carte) : le serveur prolonge
l'abonnement automatiquement à la confirmation du paiement.

1. **Fonction serveur** : Supabase → **Edge Functions → Deploy a new
   function** → nom `kkiapay-webhook`, collez le contenu de
   `supabase/functions/kkiapay-webhook/index.ts`, déployez, puis dans les
   réglages de la fonction **désactivez « Verify JWT »** (KKiaPay
   n'envoie pas de jeton Supabase — sans cela, tout paiement est rejeté
   avant d'être traité).
2. **Secret** : Supabase → **Edge Functions → Secrets** : ajoutez
   `KKIAPAY_WEBHOOK_SECRET` avec le secret affiché dans le tableau de
   bord KKiaPay (section Webhook).
3. **Côté KKiaPay** (⚠️ bac à sable et production ont chacun leurs clés
   ET leurs webhooks — les trois réglages basculent ensemble) : déclarez
   l'URL de webhook
   `https://<projet>.supabase.co/functions/v1/kkiapay-webhook`.
4. **Dans l'application** : compte superadmin → **Mon compte →
   Paiement en ligne (KKiaPay)** : collez la clé publique et cochez ou
   non le bac à sable.
5. **Test en bac à sable** : numéro MTN `97000000` (succès) — un vrai
   numéro est toujours refusé en bac à sable, c'est normal. Comptez 1 à
   2 minutes entre la validation et la prolongation.

## Notes

- Les comptes administrateurs sont créés uniquement depuis le panneau
  superadmin. Un inconnu qui s'auto-inscrirait obtiendrait un compte
  « non activé », sans aucun accès aux données.
- Chaque atelier ne voit que ses propres clients, commandes, photos et
  dépenses : c'est garanti par les règles RLS du schéma, côté serveur.
- À la création, un atelier reçoit 14 jours d'accès ; ensuite le bouton
  **+ 1 mois** de sa fiche prolonge l'abonnement.
