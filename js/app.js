/* =========================================================
   App — démarrage, routeur par ancre (#/...), rôles.
   - superadmin : gestion des ateliers clients
   - admin      : l'application de son atelier
   Gardes : connexion obligatoire, compte relié à un atelier,
   abonnement à jour.
   ========================================================= */
(() => {

  const ROUTES_ADMIN = [
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

  const ROUTES_SUPERADMIN = [
    { motif: /^\/$/, vue: (v) => VueSuperAdmin.liste(v) },
    { motif: /^\/atelier-nouveau$/, vue: (v) => VueSuperAdmin.formulaire(v) },
    { motif: /^\/atelier-gere\/([^/]+)$/, vue: (v, m) => VueSuperAdmin.fiche(v, m[1]) },
    { motif: /^\/reglages$/, vue: (v) => VueSuperAdmin.compte(v) },
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

  /* ---------- Écrans pleine page (voile) ---------- */

  function afficherVoile(html) {
    const voile = document.getElementById("voile-licence");
    voile.innerHTML = html;
    voile.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function masquerVoile() {
    const voile = document.getElementById("voile-licence");
    if (voile.hidden) return;
    voile.hidden = true;
    voile.innerHTML = "";
    document.body.style.overflow = "";
  }

  function boiteVoile(titre, texte, boutons) {
    return (
      '<div class="voile-boite">' +
        '<img src="icons/icon-192.png" alt="" class="voile-logo">' +
        "<h1>Atelier</h1>" +
        '<p class="voile-titre">' + Utils.echapper(titre) + "</p>" +
        '<p class="voile-texte">' + texte + "</p>" +
        (boutons || "") +
      "</div>"
    );
  }

  function ecranCompteNonRelie() {
    afficherVoile(boiteVoile(
      "Compte non activé",
      "Ce compte n'est relié à aucun atelier. Contactez votre fournisseur pour l'activer.",
      '<button type="button" class="btn btn-bloc" id="voile-deconnexion">Se déconnecter</button>'
    ));
    document.getElementById("voile-deconnexion").onclick = async () => {
      await Api.deconnexion();
      naviguer();
    };
  }

  function ecranAbonnementExpire() {
    const r = Store.lireReglages();
    const paiementPossible = typeof Paiement !== "undefined" && Paiement.disponible();
    afficherVoile(boiteVoile(
      "Abonnement expiré",
      "L'accès à <strong>" + Utils.echapper(r.nomAtelier) + "</strong> est suspendu. " +
        "Réglez l'abonnement de " +
        "<strong>" + Utils.fmtMontant(r.abonnementMensuel, r.devise) + " / mois</strong> " +
        (paiementPossible ? "pour rouvrir l'application. " : "auprès de votre fournisseur pour rouvrir l'application. ") +
        "Vos données sont intactes.",
      (paiementPossible
        ? '<button type="button" class="btn btn-or btn-bloc" id="voile-payer" style="margin-top:6px">' +
            "Payer " + Utils.fmtMontant(r.abonnementMensuel, r.devise) + " par Mobile Money / carte</button>"
        : "") +
      '<div class="btn-rangee" style="margin-top:10px">' +
        '<button type="button" class="btn btn-clair" id="voile-verifier">Vérifier à nouveau</button>' +
        '<button type="button" class="btn" id="voile-deconnexion">Se déconnecter</button>' +
      "</div>"
    ));
    const boutonPayer = document.getElementById("voile-payer");
    if (boutonPayer) boutonPayer.onclick = () => Paiement.payer();
    document.getElementById("voile-verifier").onclick = async () => {
      await Api.rafraichirAtelier();
      naviguer();
    };
    document.getElementById("voile-deconnexion").onclick = async () => {
      await Api.deconnexion();
      naviguer();
    };
  }

  function abonnementExpire() {
    const a = Api.lireAtelier();
    return !!(a && a.abonnement_fin && new Date(a.abonnement_fin).getTime() < Date.now());
  }

  /* ---------- Navigation ---------- */

  async function naviguer() {
    const vue = document.getElementById("vue");
    UI.fermerFeuille();
    UI.fermerVisionneuse();

    if (!Api.connecte()) {
      document.body.classList.remove("mode-superadmin");
      vue.innerHTML = "";
      VueConnexion.afficher();
      return;
    }

    const superadmin = Api.role() === "superadmin";
    document.body.classList.toggle("mode-superadmin", superadmin);

    if (!superadmin) {
      if (!Api.lireProfil() || !Api.atelierId() || !Api.lireAtelier()) {
        ecranCompteNonRelie();
        return;
      }
      if (abonnementExpire()) {
        ecranAbonnementExpire();
        return;
      }
    }
    masquerVoile();

    const routes = superadmin ? ROUTES_SUPERADMIN : ROUTES_ADMIN;
    const { chemin, params } = lireHash();
    const route = routes.find((r) => r.motif.test(chemin));
    if (!route) {
      location.hash = "#/";
      return;
    }

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

  window.AppNaviguer = naviguer;

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

  function ecranErreurDemarrage(titre, texte, boutonRecharger) {
    document.getElementById("vue").innerHTML =
      '<div class="carte"><div class="carte-titre">' + Utils.echapper(titre) + "</div>" +
      '<p style="margin:0;font-size:13.5px;line-height:1.55;color:var(--encre-douce)">' + texte + "</p>" +
      (boutonRecharger
        ? '<button type="button" class="btn btn-clair" style="margin-top:12px" onclick="location.reload()">Réessayer</button>'
        : "") +
      "</div>";
  }

  async function demarrer() {
    if (!Api.configOk()) {
      UI.entete({ titre: "Atelier" });
      ecranErreurDemarrage("Configuration requise",
        "Renseignez l'adresse du projet Supabase et sa clé publique dans <code>js/config.js</code>, " +
        "puis rechargez l'application.");
      return;
    }
    if (!Api.bibliothequeOk()) {
      UI.entete({ titre: "Atelier" });
      ecranErreurDemarrage("Connexion Internet requise",
        "Atelier est une application en ligne : connectez-vous à Internet puis réessayez.", true);
      return;
    }

    try {
      await Api.init();
    } catch (err) {
      UI.entete({ titre: "Atelier" });
      ecranErreurDemarrage("Démarrage impossible",
        Utils.echapper(err.message || "Erreur de connexion au serveur."), true);
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
