# Atelier — Gestion des commandes pour tailleurs

Application mobile (PWA) de gestion d'un atelier de couture : clients et
mesures, commandes avec photos des tissus, acomptes et soldes, messages
WhatsApp, statistiques des recettes par période.

**100 % hors ligne** : toutes les données restent sur le téléphone
(IndexedDB). Aucun serveur, aucun compte, aucune connexion requise après
l'installation.

## Fonctionnalités

### Clients
- Nom, prénom, téléphone (WhatsApp), note libre.
- **Mesures enregistrées une fois pour toutes** (épaule, poitrine, taille,
  manches, pantalon… en cm) et réutilisées à chaque nouvelle commande.
- Recherche par nom ou téléphone, insensible aux accents.

### Commandes
- **Numéro automatique** (`CMD-2026-0001`), date et heure de création.
- **Photos du ou des tissus prises avec la caméra du téléphone**
  (compressées automatiquement à ~100 Ko pour ne pas remplir la mémoire).
- Date de livraison avec suivi des retards, montant, **acompte versé,
  solde restant**, versements successifs jusqu'au solde.
- Statuts : en cours → prête → livrée.
- **Message WhatsApp en un geste** : récapitulatif de commande ou
  « votre commande est prête », modèles personnalisables avec variables
  (`{prenom}`, `{numero}`, `{montant}`, `{solde}`…).

### Recettes
- Statistiques par période : aujourd'hui, 7 jours, mois, année ou
  **période libre** (du… au…).
- Chaque versement compte le jour où l'argent est reçu.
- Graphique des encaissements par jour (ou par mois sur les longues
  périodes), commandes créées/livrées, reste à encaisser, journal des
  versements.

### Divers
- Sauvegarde/restauration : export d'un fichier JSON (photos comprises)
  à garder sur WhatsApp, e-mail ou carte mémoire.
- Réglages : nom de l'atelier, devise (FCFA par défaut), indicatif pays
  pour WhatsApp (229 par défaut), modèles de messages.

## Installation sur téléphone

Le dépôt se déploie tout seul sur GitHub Pages à chaque push sur `main`
(workflow `.github/workflows/pages.yml`). L'application est alors
disponible sur :

**https://hospiceantonio.github.io/atelier-commandes/**

Sur le téléphone, ouvrir cette adresse puis :

- **Android (Chrome)** : menu ⋮ → « Ajouter à l'écran d'accueil » /
  « Installer l'application ».
- **iPhone (Safari)** : Partager → « Sur l'écran d'accueil ».

Une fois installée, l'application s'ouvre plein écran et fonctionne sans
connexion. Le HTTPS de GitHub Pages est indispensable à la caméra et au
mode hors ligne.

> Si le premier déploiement échoue, vérifier une fois dans
> `Settings → Pages` que la source est « GitHub Actions ».

## Test local

```powershell
./serve.ps1        # http://localhost:5174
```

ou n'importe quel serveur statique (`npx serve`, `python -m http.server`…)
à la racine du dépôt.

## Structure

```
atelier-commandes/
├── index.html            # Coquille : barres, feuille modale, visionneuse
├── styles.css            # Thème mobile (indigo/or), composants
├── manifest.webmanifest  # Manifeste PWA (icônes, raccourcis)
├── sw.js                 # Service worker : cache hors ligne
├── icons/                # Icônes générées (aiguille + fil)
├── tools/make-icons.js   # Générateur d'icônes (node tools/make-icons.js)
└── js/
    ├── utils.js          # Dates, montants, WhatsApp, compression photo
    ├── db.js             # IndexedDB (clients, commandes, photos, réglages)
    ├── mesures.js        # Référentiel des mesures de couture
    ├── store.js          # Logique métier : numérotation, paiements, stats
    ├── ui.js             # Composants : entête, toasts, feuille, mesures
    ├── app.js            # Routeur #/… et démarrage
    └── vues/             # Accueil, clients, commandes, statistiques, réglages
```

Aucune dépendance, aucun build : du HTML/CSS/JS brut, modifiable avec un
simple éditeur de texte.
