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

## Double facteur : code envoyé par email

Une fois activé, toute connexion — superadministrateur, administrateur
d'atelier ou modérateur — demande le mot de passe **puis** un code à
6 chiffres reçu par email.

Les deux facteurs sont vérifiés par le serveur, pas seulement à l'écran :
une session qui n'a passé qu'un seul des deux ne lit aucune donnée, même
si l'application est court-circuitée.

### Avant d'activer — deux réglages Supabase indispensables

1. **Un SMTP personnalisé.** *Project Settings → Authentication → SMTP
   Settings*. Sans lui, Supabase n'envoie que 2 à 3 emails par heure pour
   l'ensemble du projet : vos ateliers ne pourraient pas se connecter.
   N'importe quel fournisseur convient (Brevo, Resend, Mailgun, le SMTP
   de votre hébergeur).

2. **Le code dans le modèle d'email.** *Authentication → Emails → Magic
   Link*. Par défaut ce modèle n'envoie qu'un lien. Ajoutez-y le code :

   ```html
   <p>Votre code de connexion : <strong>{{ .Token }}</strong></p>
   <p>Il expire dans une heure.</p>
   ```

   Sans `{{ .Token }}`, l'email part mais ne contient aucun code.

### Activer

*Compte superadministrateur → Double facteur à la connexion.*

1. **Tester la compatibilité.** Le verrou serveur repose sur la méthode
   d'authentification inscrite dans le jeton. Le test le vérifie sur
   votre projet ; l'interrupteur reste refusé tant qu'il n'est pas passé.
2. Basculer l'interrupteur et confirmer.
3. Vous êtes déconnecté aussitôt : votre session n'avait qu'un facteur.
   Reconnectez-vous avec le code reçu par email.

Faites l'essai sur **votre** compte avant de l'imposer aux ateliers.

### En cas de blocage

Emails qui n'arrivent plus, adresse inaccessible, SMTP en panne : cette
ligne dans **SQL Editor** rouvre l'accès à tout le monde.

```sql
update public.parametres set double_facteur = false;
```

L'éditeur SQL ne passe pas par les règles d'accès : elle fonctionne même
si plus personne ne peut se connecter.

### Ce que le serveur exige exactement

- le mot de passe validé il y a moins de 20 minutes ;
- la session en cours ouverte par un code reçu par email.

Le mot de passe seul ne donne rien ; l'accès à la boîte mail seul non
plus. Les deux conditions sont contrôlées dans `role_courant()` et
`atelier_courant()`, par lesquelles passent toutes les règles d'accès.
