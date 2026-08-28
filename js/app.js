/* =========================================================
   App — démarrage, routeur par ancre (#/...), rôles.
   - superadmin : gestion des ateliers clients
   - admin      : l'application de son atelier
   Gardes : connexion obligatoire, compte relié à un atelier,
   abonnement à jour.
   ========================================================= */
(() => {

  /* `module` : la formule qui ouvre cet écran. Sans marque, l'écran est
     ouvert à toutes les formules (accueil, réglages, recettes). */
  const ROUTES_ADMIN = [
    { motif: /^\/$/, vue: (v) => VueAccueil.afficher(v), onglet: "/" },
    { motif: /^\/clients$/, vue: (v) => VueClients.liste(v), onglet: "/clients", module: "atelier" },
    { motif: /^\/client\/nouveau$/, vue: (v) => VueClients.formulaire(v), module: "atelier" },
    { motif: /^\/client\/([^/]+)\/modifier$/, vue: (v, m) => VueClients.formulaire(v, m[1]), module: "atelier" },
    { motif: /^\/client\/([^/]+)$/, vue: (v, m) => VueClients.fiche(v, m[1]), module: "atelier" },
    { motif: /^\/commandes$/, vue: (v) => VueCommandes.liste(v), onglet: "/commandes", module: "atelier" },
    { motif: /^\/commande\/nouvelle$/, vue: (v, m, p) => VueCommandes.nouvelle(v, p), module: "atelier" },
    { motif: /^\/commande\/([^/]+)\/modifier$/, vue: (v, m) => VueCommandes.modifier(v, m[1]), module: "atelier" },
    { motif: /^\/commande\/([^/]+)$/, vue: (v, m) => VueCommandes.detail(v, m[1]), module: "atelier" },
    { motif: /^\/statistiques$/, vue: (v) => VueStats.afficher(v), onglet: "/statistiques" },
    { motif: /^\/reglages$/, vue: (v) => VueReglages.afficher(v) },
    { motif: /^\/produits$/, vue: (v) => VueProduits.liste(v), onglet: "/produits", module: "vitrine" },
    { motif: /^\/nouveau$/, vue: () => { location.hash = "#/"; menuNouveau(); } },
    { motif: /^\/ventes$/, vue: (v) => VueVentes.liste(v), module: "vitrine" },
    { motif: /^\/vente-nouvelle$/, vue: (v) => VueVentes.nouvelle(v), module: "vitrine" },
    { motif: /^\/vente\/([^/]+)$/, vue: (v, m) => VueVentes.detail(v, m[1]), module: "vitrine" },
    { motif: /^\/produit-gere\/nouveau$/, vue: (v) => VueProduits.formulaire(v), module: "vitrine" },
    { motif: /^\/produit-gere\/([^/]+)$/, vue: (v, m) => VueProduits.formulaire(v, m[1]), module: "vitrine" },
  ];

  const ROUTES_SUPERADMIN = [
    { motif: /^\/$/, vue: (v) => VueSuperAdmin.liste(v) },
    { motif: /^\/atelier-nouveau$/, vue: (v) => VueSuperAdmin.formulaire(v) },
    { motif: /^\/atelier-gere\/([^/]+)$/, vue: (v, m) => VueSuperAdmin.fiche(v, m[1]) },
    { motif: /^\/reglages$/, vue: (v) => VueSuperAdmin.compte(v) },
    { motif: /^\/paiements$/, vue: (v) => VueSuperAdmin.paiements(v) },
    { motif: /^\/codes$/, vue: (v) => VueSuperAdmin.codes(v) },
    { motif: /^\/formules$/, vue: (v) => VueSuperAdmin.formules(v) },
    { motif: /^\/bannieres$/, vue: (v) => VueSuperAdmin.bannieres(v) },
    { motif: /^\/banniere\/nouvelle$/, vue: (v) => VueSuperAdmin.formulaireBanniere(v) },
    { motif: /^\/banniere\/([^/]+)$/, vue: (v, m) => VueSuperAdmin.formulaireBanniere(v, m[1]) },
  ];

  /* Modérateur : ce qu'il peut faire dépend des droits que son
     administrateur lui a cochés (voir supabase/droits.sql). Les réglages
     et l'équipe lui restent fermés en toutes circonstances.
     Le serveur applique les mêmes limites (RLS) : ce routage n'est que
     le confort de navigation. */
  const ROUTES_MODERATEUR = [
    { motif: /^\/$/, vue: (v) => VueAccueil.afficher(v), onglet: "/" },
    { motif: /^\/clients$/, vue: (v) => VueClients.liste(v), onglet: "/clients", module: "atelier" },
    { motif: /^\/client\/nouveau$/, vue: (v) => VueClients.formulaire(v), module: "atelier" },
    // Les mesures restent modifiables : elles se prennent au moment de la commande.
    { motif: /^\/client\/([^/]+)\/modifier$/, vue: (v, m) => VueClients.formulaire(v, m[1]), module: "atelier" },
    { motif: /^\/client\/([^/]+)$/, vue: (v, m) => VueClients.fiche(v, m[1]), module: "atelier" },
    { motif: /^\/commandes$/, vue: (v) => VueCommandes.liste(v), onglet: "/commandes", module: "atelier" },
    { motif: /^\/commande\/nouvelle$/, vue: (v, m, p) => VueCommandes.nouvelle(v, p), module: "atelier", droit: "commande_creer" },
    { motif: /^\/commande\/([^/]+)$/, vue: (v, m) => VueCommandes.detail(v, m[1]), module: "atelier" },
    { motif: /^\/statistiques$/, vue: (v) => VueStats.afficher(v), onglet: "/statistiques", droit: "recettes_voir" },
    { motif: /^\/compte$/, vue: (v) => VueReglages.compte(v) },
    { motif: /^\/nouveau$/, vue: () => { location.hash = "#/"; menuNouveau(); } },
    { motif: /^\/ventes$/, vue: (v) => VueVentes.liste(v), onglet: "/ventes", module: "vitrine" },
    { motif: /^\/vente-nouvelle$/, vue: (v) => VueVentes.nouvelle(v), module: "vitrine", droit: "vente_creer" },
    { motif: /^\/vente\/([^/]+)$/, vue: (v, m) => VueVentes.detail(v, m[1]), module: "vitrine" },
  ];

  /* Boutique publique : visible sans compte. */
  const ROUTES_PUBLIQUES = [
    { motif: /^\/$/, vue: (v) => VueBoutique.accueil(v), onglet: "/" },
    { motif: /^\/produit\/([^/]+)$/, vue: (v, m) => VueBoutique.produit(v, m[1]) },
    { motif: /^\/ateliers$/, vue: (v) => VueBoutique.ateliers(v), onglet: "/ateliers" },
    { motif: /^\/atelier\/([^/]+)$/, vue: (v, m) => VueBoutique.atelier(v, m[1]) },
    { motif: /^\/inscription$/, vue: (v) => VueInscription.afficher(v) },
  ];

  /* ---------- Ce que la formule ouvre ----------
     Les écrans d'une maison dépendent de sa formule. Ce filtrage n'est
     que du confort de navigation : le serveur applique les mêmes limites
     (module_atelier / module_vitrine dans supabase/formules.sql), et
     c'est lui qui fait foi. */

  /* Chaque route et chaque onglet porte le module qu'il demande, écrit
     noir sur blanc : « module: "vitrine" ». Sans marque, l'écran est
     ouvert à toutes les formules. */

  const ouvert = (module) =>
    !module ||
    (module === "atelier" ? Api.aModuleAtelier() : Api.aModuleVitrine());

  /* Deux filtres en un : la formule de l'atelier, et les droits du compte.
     Un écran s'affiche si la formule le porte ET si le compte y a droit. */
  const filtrerParFormule = (liste) =>
    liste.filter((x) => ouvert(x.module) && (!x.droit || Api.aDroit(x.droit)));

  /* Onglets selon le contexte. Le superadmin n'en a pas (tabbar cachée). */
  const ONGLETS_PUBLICS = [
    { href: "#/", tab: "/", icone: "boutique", label: "Accueil" },
    { href: "#/ateliers", tab: "/ateliers", icone: "clients", label: "Ateliers" },
    { href: "#/connexion", tab: "/connexion", icone: "connexion", label: "Se connecter" },
  ];

  const ONGLETS_MODERATEUR = [
    { href: "#/", tab: "/", icone: "accueil", label: "Accueil" },
    { href: "#/commandes", tab: "/commandes", icone: "commandes", label: "Commandes", module: "atelier" },
    { href: "#/nouveau", cta: true, label: "Nouveau" },
    { href: "#/ventes", tab: "/ventes", icone: "argent", label: "Ventes", module: "vitrine" },
    { href: "#/clients", tab: "/clients", icone: "clients", label: "Clients", module: "atelier" },
    { href: "#/statistiques", tab: "/statistiques", icone: "stats", label: "Recettes",
      droit: "recettes_voir" },
  ];

  const ONGLETS_ADMIN = [
    { href: "#/", tab: "/", icone: "accueil", label: "Accueil" },
    { href: "#/commandes", tab: "/commandes", icone: "commandes", label: "Commandes", module: "atelier" },
    { href: "#/nouveau", cta: true, label: "Nouveau" },
    { href: "#/produits", tab: "/produits", icone: "boutique", label: "Vitrine", module: "vitrine" },
    { href: "#/clients", tab: "/clients", icone: "clients", label: "Clients", module: "atelier" },
    { href: "#/statistiques", tab: "/statistiques", icone: "stats", label: "Recettes" },
  ];

  let ongletsRendus = null;

  function rendreTabbar(onglets, cle) {
    if (ongletsRendus === cle) return;
    ongletsRendus = cle;
    document.getElementById("tabbar").innerHTML = onglets.map((o) =>
      o.cta
        ? '<a href="' + o.href + '" class="tab-cta" data-menu-nouveau aria-label="' + Utils.echapper(o.label) + '">' +
            '<span class="tab-cta-rond">' + UI.icone("plus") + "</span></a>"
        : '<a href="' + o.href + '" data-tab="' + o.tab + '">' + UI.icone(o.icone) +
            "<span>" + Utils.echapper(o.label) + "</span></a>"
    ).join("");
  }

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

  /* Le compte existe côté connexion mais n'a pas de profil : le
     déclencheur qui le crée n'a pas tourné. Une maison sans atelier,
     elle, part vers l'inscription — ce n'est pas la même situation. */
  function ecranCompteNonRelie() {
    afficherVoile(boiteVoile(
      "Compte incomplet",
      "Ce compte n'a pas de profil dans l'application. Contactez-nous, nous le rétablirons.",
      '<button type="button" class="btn btn-bloc" id="voile-deconnexion">Retour à la boutique</button>'
    ));
    document.getElementById("voile-deconnexion").onclick = async () => {
      await Api.deconnexion();
      location.hash = "#/";
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
      location.hash = "#/";
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

    const { chemin: cheminDemande } = lireHash();

    /* Visiteur : boutique publique, et connexion à la demande. */
    if (!Api.connecte()) {
      document.body.classList.remove("mode-superadmin");
      rendreTabbar(ONGLETS_PUBLICS, "public");
      if (cheminDemande === "/connexion") {
        vue.innerHTML = "";
        marquerOnglet("/connexion");
        // Ne pas re-rendre si le formulaire est déjà affiché : un second
        // rendu (hash + appel direct) effacerait la saisie en cours.
        if (!document.getElementById("form-connexion")) VueConnexion.afficher();
        return;
      }
      masquerVoile();
      await rendreRoute(ROUTES_PUBLIQUES, vue, "#/");
      return;
    }

    const role = Api.role();
    const superadmin = role === "superadmin";
    const moderateur = role === "moderateur";
    document.body.classList.toggle("mode-superadmin", superadmin);

    if (!superadmin) {
      /* Compte sans maison : c'est l'inscription qui reprend la main. On
         y arrive aussi bien juste après la création du compte qu'en
         revenant trois jours plus tard — l'état est en base, pas ici. */
      if (!Api.lireProfil()) {
        ecranCompteNonRelie();
        return;
      }
      if (!Api.atelierId() || !Api.lireAtelier()) {
        document.getElementById("tabbar").innerHTML = "";
        ongletsRendus = null;
        masquerVoile();
        await VueInscription.ouvrirMaison(vue);
        /* rendreRoute() n'est pas passé par là : sans cela, l'écran
           s'ouvre au défilement de la vue précédente. */
        vue.scrollTop = 0;
        window.scrollTo(0, 0);
        return;
      }
      /* Les onglets dépendent de la formule : la clé de cache la porte,
         sinon un changement de formule laisserait les anciens onglets. */
      /* La clé porte le rôle, la formule ET les droits : sans eux, un
         modérateur dont l'administrateur vient de changer les droits
         garderait ses anciens onglets. */
      const cle = (moderateur ? "moderateur" : "admin") + ":" + Api.formuleCourante() +
        ":" + Api.DROITS.map((d) => (Api.aDroit(d.cle) ? "1" : "0")).join("");
      rendreTabbar(filtrerParFormule(moderateur ? ONGLETS_MODERATEUR : ONGLETS_ADMIN), cle);

      if (abonnementExpire()) {
        ecranAbonnementExpire();
        return;
      }
    }
    masquerVoile();

    await rendreRoute(
      superadmin
        ? ROUTES_SUPERADMIN
        : filtrerParFormule(moderateur ? ROUTES_MODERATEUR : ROUTES_ADMIN),
      vue, "#/");
  }

  function marquerOnglet(onglet) {
    for (const lien of document.querySelectorAll("#tabbar [data-tab]")) {
      lien.classList.toggle("actif", lien.dataset.tab === (onglet || ""));
    }
  }

  async function rendreRoute(routes, vue, secours) {
    const { chemin, params } = lireHash();
    const route = routes.find((r) => r.motif.test(chemin));
    if (!route) {
      location.hash = secours;
      return;
    }

    marquerOnglet(route.onglet);

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

  /* Le bouton « + » propose commande ou vente, selon la formule. */
  function menuNouveau() {
    const ligne = (href, icone, titre, sous, premiere) =>
      '<button type="button" class="ligne"' + (premiere ? "" : ' style="margin-top:10px"') +
        ' data-aller="' + href + '">' +
        '<span class="pastille">' + UI.icone(icone, "ic-sm") + "</span>" +
        '<span class="ligne-corps"><span class="ligne-titre">' + titre + "</span>" +
          '<span class="ligne-sous">' + sous + "</span></span>" +
      "</button>";

    const choix = [];
    if (Api.aModuleAtelier() && Api.aDroit("commande_creer")) {
      choix.push(["#/commande/nouvelle", "commandes", "Nouvelle commande",
        "Vêtement sur mesure pour un client"]);
    }
    if (Api.aModuleVitrine()) {
      if (Api.aDroit("vente_creer")) {
        choix.push(["#/vente-nouvelle", "argent", "Nouvelle vente",
          "Facture sur les articles en stock"]);
      }
      choix.push(["#/ventes", "stats", "Mes ventes", "Historique des factures"]);
    }
    const corps = UI.ouvrirFeuille("Que voulez-vous créer ?",
      choix.map((c, i) => ligne(c[0], c[1], c[2], c[3], i === 0)).join(""));
    corps.addEventListener("click", (ev) => {
      const choix = ev.target.closest("[data-aller]");
      if (!choix) return;
      UI.fermerFeuille();
      location.hash = choix.dataset.aller;
    });
  }

  document.addEventListener("click", (ev) => {
    const nouveau = ev.target.closest("[data-menu-nouveau]");
    if (nouveau) {
      ev.preventDefault();
      menuNouveau();
      return;
    }
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
