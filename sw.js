/* =========================================================
   Service worker — l'application fonctionne entièrement
   hors ligne une fois installée sur le téléphone.
   Incrémenter VERSION à chaque mise à jour des fichiers.
   ========================================================= */
const VERSION = "atelier-v30";

const FICHIERS = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./js/config.js",
  "./js/utils.js",
  "./js/pont-android.js",
  "./js/api.js",
  "./js/mesures.js",
  "./js/store.js",
  "./js/ui.js",
  "./js/paiement.js",
  "./js/vues/connexion.js",
  "./js/vues/superadmin.js",
  "./js/vues/accueil.js",
  "./js/vues/clients.js",
  "./js/vues/commandes.js",
  "./js/vues/statistiques.js",
  "./js/vues/reglages.js",
  "./js/vues/produits.js",
  "./js/vues/boutique.js",
  "./js/vues/ventes.js",
  "./js/app.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (ev) => {
  ev.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(FICHIERS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((c) => c !== VERSION).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

/* Cache d'abord (application locale), réseau en secours,
   et mise à jour silencieuse du cache quand le réseau répond. */
self.addEventListener("fetch", (ev) => {
  const requete = ev.request;
  if (requete.method !== "GET") return;
  const url = new URL(requete.url);
  if (url.origin !== location.origin) return;

  ev.respondWith(
    caches.match(requete, { ignoreSearch: true }).then((enCache) => {
      const depuisReseau = fetch(requete)
        .then((reponse) => {
          if (reponse && reponse.ok) {
            const copie = reponse.clone();
            caches.open(VERSION).then((cache) => cache.put(requete, copie));
          }
          return reponse;
        })
        .catch(() => enCache);
      return enCache || depuisReseau;
    })
  );
});
