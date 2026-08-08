/* =========================================================
   App — routeur par ancre (#/...), démarrage, service worker.
   ========================================================= */
(() => {

  const ROUTES = [
    { motif: /^\/$/, vue: (v) => VueAccueil.afficher(v), onglet: "/" },
    { motif: /^\/clients$/, vue: (v) => VueClients.liste(v), onglet: "/clients" },
    { motif: /^\/client\/nouveau$/, vue: (v) => VueClients.formulaire(v) },
    { motif: /^\/client\/([^/]+)\/modifier$/, vue: (v, m) => VueClients.formulaire(v, m[1]) },
    { motif: /^\/client\/([^/]+)$/, vue: (v, m) => VueClients.fiche(v, m[1]) },
    { motif: /^\/commandes$/, vue: (v) => VueCommandes.liste(v), onglet: "/commandes" },
    { motif: /^\/commande\/nouvelle$/, vue: (v, m, p) => VueCommandes.nouvelle(v, p) },
    { motif: /^\/commande\/([^/]+)\/modifier$/, vue: (v, m) => VueCommandes.modifier(v, m[1]) },
    { motif: /^\/commande\/([^/]+)$/, vue: (v, m) => VueCommandes.detail(v, m[1]) },
    { motif: /^\/statistiques$/, vue: (v) => VueStats.afficher(v), onglet: "/statistiques" },
    { motif: /^\/reglages$/, vue: (v) => VueReglages.afficher(v) },
  ];

  function lireHash() {
    const brut = location.hash.replace(/^#/, "") || "/";
    const [chemin, requete] = brut.split("?");
    const params = {};
    if (requete) {
      for (const morceau of requete.split("&")) {
        const [cle, valeur] = morceau.split("=");
        if (cle) params[decodeURIComponent(cle)] = decodeURIComponent(valeur || "");
      }
    }
    return { chemin: chemin || "/", params };
  }

  async function naviguer() {
    if (!Licence.actif()) {
      Licence.afficherVoile();
      return;
    }
    const { chemin, params } = lireHash();
    const vue = document.getElementById("vue");
    UI.fermerFeuille();
    UI.fermerVisionneuse();

    const route = ROUTES.find((r) => r.motif.test(chemin));
    if (!route) {
      location.hash = "#/";
      return;
    }

    /* Onglet actif dans la barre du bas */
    for (const lien of document.querySelectorAll("#tabbar [data-tab]")) {
      lien.classList.toggle("actif", lien.dataset.tab === (route.onglet || ""));
    }

    try {
      await route.vue(vue, chemin.match(route.motif), params);
    } catch (err) {
      console.error(err);
      vue.innerHTML =
        '<div class="carte"><div class="carte-titre">Un problème est survenu</div>' +
        '<p style="margin:0 0 12px;font-size:13.5px;color:var(--encre-douce)">' +
        Utils.echapper(err && err.message ? err.message : "Erreur inattendue.") + "</p>" +
        '<button type="button" class="btn btn-clair" onclick="location.reload()">Recharger l\'application</button></div>';
    }
    vue.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  /* ---------- Délégation des interactions globales ---------- */

  document.addEventListener("click", (ev) => {
    const nav = ev.target.closest("[data-nav]");
    if (nav) {
      location.hash = nav.dataset.nav;
      return;
    }
    const action = ev.target.closest("[data-action]");
    if (!action) return;
    if (action.dataset.action === "retour") {
      if (history.length > 1) history.back();
      else location.hash = "#/";
    }
    if (action.dataset.action === "fermer-feuille") UI.fermerFeuille();
    if (action.dataset.action === "fermer-visionneuse") UI.fermerVisionneuse();
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      UI.fermerVisionneuse();
      UI.fermerFeuille();
    }
  });

  /* ---------- Démarrage ---------- */

  async function demarrer() {
    try {
      await Store.init();
      await Licence.init();
    } catch (err) {
      document.getElementById("vue").innerHTML =
        '<div class="carte"><div class="carte-titre">Stockage indisponible</div>' +
        '<p style="margin:0;font-size:13.5px;color:var(--encre-douce)">' +
        Utils.echapper(err.message || "Impossible d'ouvrir la base locale.") +
        " Vérifiez que la navigation privée est désactivée.</p></div>";
      return;
    }
    window.addEventListener("hashchange", naviguer);
    naviguer();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => { /* hors ligne au premier chargement */ });
    }
  }

  demarrer();
})();
