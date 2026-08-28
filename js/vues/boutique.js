/* =========================================================
   Vue Boutique — vitrine publique, accessible sans compte.
   - accueil : produits de tous les ateliers actifs
   - produit : fiche avec photos en slider + « Commander »
   - ateliers : liste des ateliers avec recherche
   - atelier  : produits d'un atelier, par catégorie
   Seuls les ateliers à jour d'abonnement apparaissent (règle
   garantie côté serveur : RLS + vue ateliers_publics).
   ========================================================= */
const VueBoutique = (() => {
  const e = Utils.echapper;

  const DELAI_CARROUSEL = 4500;   // pause entre deux images
  const PAUSE_APRES_GESTE = 8000; // le geste du visiteur reprend la main
  let minuterieCarrousel = null;

  /**
   * Fait défiler le carrousel tout seul, et revient à la première image
   * après la dernière. Toute manipulation du visiteur suspend le
   * défilement quelques secondes : il n'est jamais bousculé.
   */
  function lancerDefilement(zone, points) {
    if (minuterieCarrousel) clearInterval(minuterieCarrousel);
    minuterieCarrousel = null;

    const total = zone.children.length;
    const majPoints = (index) => {
      if (!points) return;
      for (let i = 0; i < points.children.length; i++) {
        points.children[i].classList.toggle("actif", i === index);
      }
    };
    const pas = () => (total > 1
      ? zone.children[1].offsetLeft - zone.children[0].offsetLeft
      : zone.clientWidth) || zone.clientWidth;
    const indexCourant = () => Math.round(zone.scrollLeft / pas());

    zone.addEventListener("scroll", () => majPoints(indexCourant()), { passive: true });
    majPoints(0);

    if (total < 2) return;
    // Respecte le réglage système « animations réduites ».
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let reprise = 0;
    const suspendre = () => { reprise = Date.now() + PAUSE_APRES_GESTE; };
    for (const geste of ["pointerdown", "touchstart", "wheel"]) {
      zone.addEventListener(geste, suspendre, { passive: true });
    }

    minuterieCarrousel = setInterval(() => {
      // La vue a changé : la minuterie n'a plus lieu d'être.
      if (!document.body.contains(zone)) {
        clearInterval(minuterieCarrousel);
        minuterieCarrousel = null;
        return;
      }
      if (document.hidden || Date.now() < reprise) return;
      const suivant = (indexCourant() + 1) % total;
      zone.scrollTo({ left: suivant * pas(), behavior: "smooth" });
      majPoints(suivant);
    }, DELAI_CARROUSEL);
  }

  const fmtPrix = (p, atelier) =>
    Utils.fmtMontant(p.prix, (atelier && atelier.devise) || "FCFA");

  function carteProduit(p, atelier, vedette) {
    return (
      '<a class="carte-produit' + (vedette ? " vedette" : "") + '" href="#/produit/' + p.id + '">' +
        (p.couverture
          ? '<img class="produit-photo" src="' + Stockage.src(p.couverture) + '" alt="" ' +
            'loading="lazy" decoding="async">'
          : '<span class="produit-photo produit-photo-vide">' + UI.icone("image") + "</span>") +
        '<span class="produit-infos">' +
          '<span class="produit-nom">' + e(p.nom) + "</span>" +
          (atelier ? '<span class="produit-atelier">' + e(atelier.nom) + "</span>" : "") +
          /* Deux repères qui font choisir : ce qui est de saison, et ce
             qui se taille à la demande. */
          (p.tendance || p.sur_mesure
            ? '<span class="produit-atelier">' +
                (p.tendance ? '<span class="badge badge-ok">Tendance</span>' : "") +
                (p.sur_mesure ? '<span class="badge badge-neutre">Sur mesure</span>' : "") +
              "</span>"
            : "") +
          (p.prix_visible
            ? '<span class="produit-prix">' + fmtPrix(p, atelier) + "</span>"
            : '<span class="produit-prix-demande">Prix sur demande</span>') +
        "</span>" +
      "</a>"
    );
  }

  function grilleParCategorie(produits, parId) {
    const categories = {};
    for (const p of produits) {
      const cat = p.categorie || "Autres";
      (categories[cat] = categories[cat] || []).push(p);
    }
    return Object.keys(categories).sort((a, b) => a.localeCompare(b, "fr")).map((cat) =>
      '<div class="titre-categorie">' + e(cat) + "</div>" +
      '<div class="grille-produits">' +
        categories[cat].map((p) => carteProduit(p, parId ? parId[p.atelier_id] : null)).join("") +
      "</div>"
    ).join("");
  }

  async function chargerCatalogue() {
    const [produits, ateliers] = await Promise.all([
      Api.lister("produits", "cree_le", false),
      Api.lister("ateliers_publics", "nom", true),
    ]);
    const parId = {};
    for (const a of ateliers) parId[a.id] = a;
    return { produits: produits.filter((p) => parId[p.atelier_id]), ateliers, parId };
  }

  /* ---------- Accueil public : tous les produits ---------- */

  /** Grande carte du carrousel « À la une ». */
  function carteAvant(p, atelier) {
    return (
      '<a class="carte-avant" href="#/produit/' + p.id + '">' +
        (p.couverture
          ? '<img src="' + Stockage.src(p.couverture) + '" alt="" loading="lazy">'
          : '<span class="produit-photo-vide">' + UI.icone("image") + "</span>") +
        '<span class="carte-avant-voile">' +
          '<span class="produit-nom">' + e(p.nom) + "</span>" +
          (atelier ? '<span class="carte-avant-atelier">' + e(atelier.nom) + "</span>" : "") +
          '<span class="carte-avant-prix">' +
            (p.prix_visible ? fmtPrix(p, atelier) : "Prix sur demande") + "</span>" +
        "</span>" +
      "</a>"
    );
  }

  /** Bannière du carrousel : image cliquable posée par le superadmin. */
  function carteBanniere(b) {
    return (
      '<' + (b.lien ? "button type=\"button\"" : "span") +
        ' class="carte-avant carte-banniere"' +
        (b.lien ? ' data-lien="' + e(b.lien) + '"' : "") + ">" +
        '<img src="' + Stockage.src(b.image, Stockage.BANNIERES) + '" alt="' + e(b.titre) + '" loading="lazy">' +
        (b.titre
          ? '<span class="carte-avant-voile"><span class="produit-nom">' + e(b.titre) + "</span></span>"
          : "") +
      "</" + (b.lien ? "button" : "span") + ">"
    );
  }

  /* ---------- Accueil : carrousel, galerie infinie, invitations ----------

     Le catalogue n'est plus rapatrié d'un bloc : les produits
     arrivent par lots à mesure que le visiteur descend, et leurs photos
     ne sont décodées qu'à l'approche. Avec des centaines de modèles et
     des photos en base64, tout charger d'un coup coûtait cher pour un
     premier écran que personne ne dépasse forcément. */

  const PAR_LOT = 12;

  /* Les invitations ne sont pas une bande à part : ce sont des tuiles de
     la galerie, rencontrées au fil du défilement. */
  const INVITATIONS = [
    { chapeau: "Vous cousez déjà", titre: "Votre maison mérite cette vitrine",
      texte: "Publiez vos modèles, recevez les commandes sur WhatsApp, suivez vos mesures." },
    { chapeau: "Essai libre", titre: "Quatorze jours pour vous décider",
      texte: "Aucun engagement. Vous publiez, vous voyez ce que ça donne." },
    { chapeau: "Déjà des maisons à Cotonou", titre: "Rejoignez-les",
      texte: "Les ateliers d'ici reçoivent leurs commandes sur cette page chaque semaine." },
  ];

  /* Une maison ouvre son compte elle-même : le bouton mène droit à
     l'inscription, plus au WhatsApp du superadministrateur. */
  const lienInscription = () => "#/inscription";

  function carteInvitation(n) {
    const inv = INVITATIONS[n % INVITATIONS.length];
    const lien = lienInscription();
    const externe = lien.indexOf("#/") !== 0;
    return (
      '<div class="carte-invite">' +
        '<span class="invite-chapeau">' + e(inv.chapeau) + "</span>" +
        '<span class="invite-titre">' + e(inv.titre) + "</span>" +
        '<span class="invite-texte">' + e(inv.texte) + "</span>" +
        '<a class="invite-bouton" href="' + e(lien) + '"' +
          (externe ? ' target="_blank" rel="noopener"' : "") + ">Ouvrir ma maison</a>" +
      "</div>"
    );
  }

  function blocFinal(nbAteliers, nbProduits) {
    const lien = lienInscription();
    const externe = lien.indexOf("#/") !== 0;
    return (
      '<section class="cloture">' +
        '<span class="invite-chapeau">Vous êtes une maison de mode</span>' +
        "<h2>Vos modèles méritent mieux qu'un fil WhatsApp</h2>" +
        "<p>Publiez vos produits, recevez les commandes, suivez vos mesures " +
          "et vos recettes. Vos clients vous trouvent ici ; vous gardez la main " +
          "sur tout le reste.</p>" +
        '<div class="chiffres">' +
          '<div><div class="chiffre-valeur">' + nbAteliers + "</div>" +
            '<div class="chiffre-libelle">Maison' + (nbAteliers > 1 ? "s" : "") + "</div></div>" +
          '<div><div class="chiffre-valeur">' + nbProduits + "</div>" +
            '<div class="chiffre-libelle">Modèle' + (nbProduits > 1 ? "s" : "") + " publié" +
              (nbProduits > 1 ? "s" : "") + "</div></div>" +
        "</div>" +
        '<a class="btn btn-or" href="' + e(lien) + '"' +
          (externe ? ' target="_blank" rel="noopener"' : "") + ">Ouvrir ma maison</a>" +
      "</section>"
    );
  }

  /* ---------- Chercher : les critères, et leur mise en mots ----------
     Un même objet sert à interroger le serveur et à dessiner les puces
     qu'on retire d'un doigt : ce qui est affiché ne peut donc pas mentir
     sur ce qui est demandé. */

  const TRIS = [
    { cle: "recent", nom: "Nouveautés" },
    { cle: "prix_croissant", nom: "Prix croissant" },
    { cle: "prix_decroissant", nom: "Prix décroissant" },
    { cle: "nom", nom: "Nom" },
  ];

  function etiquettesCriteres(c, devise) {
    const bouts = [];
    if (c.texte) bouts.push({ cle: "texte", texte: "« " + c.texte + " »" });
    if (c.categorie) bouts.push({ cle: "categorie", texte: c.categorie });
    if (c.sexe) bouts.push({ cle: "sexe", texte: Mode.etiquetteSexe(c.sexe) });
    if (c.age) bouts.push({ cle: "age", texte: Mode.etiquetteAge(c.age) });
    if (c.taille) bouts.push({ cle: "taille", texte: "Taille " + c.taille });
    if (c.couleur) bouts.push({ cle: "couleur", texte: c.couleur });
    if (c.tissu) bouts.push({ cle: "tissu", texte: c.tissu });
    if (c.prixMax) bouts.push({ cle: "prixMax", texte: "≤ " + Utils.fmtMontant(c.prixMax, devise) });
    if (c.tendance) bouts.push({ cle: "tendance", texte: "Tendance" });
    if (c.surMesure) bouts.push({ cle: "surMesure", texte: "Sur mesure" });
    if (c.tri && c.tri !== "recent") {
      bouts.push({ cle: "tri", texte: (TRIS.find((t) => t.cle === c.tri) || {}).nom });
    }
    return bouts;
  }

  const compterCriteres = (c) => etiquettesCriteres(c, "").length;

  async function accueil(vue) {
    const ateliers = await Api.lister("ateliers_publics", "nom", true);
    const parId = {};
    for (const a of ateliers) parId[a.id] = a;
    const devise = (ateliers[0] && ateliers[0].devise) || "FCFA";

    /* Le vocabulaire des filtres vient du serveur, en un aller-retour :
       on ne propose que des valeurs qui mènent quelque part, sans avoir
       à télécharger le catalogue pour les déduire. */
    let vocabulaire = { categories: [], tailles: [], couleurs: [], tissus: [], prix_max: 0 };
    try {
      Object.assign(vocabulaire, await Api.vocabulaireBoutique());
    } catch (_) { /* recherche.sql pas encore exécuté : filtres réduits */ }

    let bannieres = [];
    try {
      bannieres = (await Api.lister("bannieres", "position", true)).filter((b) => b.active);
    } catch (_) { /* base pas encore à jour : pas de bannière */ }

    UI.entete({ titre: "Atelier", sous: "Les produits de nos ateliers de couture" });

    const criteres = {};
    const visibles = (liste) => liste.filter((p) => parId[p.atelier_id]);

    vue.innerHTML =
      '<div class="recherche">' + UI.icone("recherche") +
        '<input id="rech-produits" type="search" autocomplete="off" ' +
          'placeholder="Chercher un modèle, un code, un rayon…">' +
      "</div>" +
      '<div class="barre-filtres">' +
        '<button type="button" class="btn btn-clair btn-sm" id="btn-filtres">' +
          UI.icone("reglages", "ic-sm") + "Filtrer" +
          '<span class="compte-filtres" id="compte-filtres" hidden></span></button>' +
        '<div class="puces" id="criteres-actifs"></div>' +
      "</div>" +
      '<div id="zone-avant"></div>' +
      '<div id="zone-galerie"></div>';

    const zoneAvant = UI.$("#zone-avant");
    const zoneGalerie = UI.$("#zone-galerie");
    let observateur = null;

    /* ---------- La galerie, refaite à chaque changement ---------- */

    async function montrerGalerie() {
      if (observateur) { observateur.disconnect(); observateur = null; }
      const filtre = compterCriteres(criteres) > 0;

      zoneGalerie.innerHTML =
        '<div class="galerie-attente"><span class="rondelle"></span><span>Recherche…</span></div>';

      let premier;
      try {
        premier = await Api.chercherProduits(criteres, 0, PAR_LOT - 1);
      } catch (err) {
        zoneGalerie.innerHTML = UI.vide("alerte", "Recherche impossible",
          err.message || "Réessayez dans un instant.");
        return;
      }

      /* Le carrousel n'a de sens que sur la boutique entière : dès qu'on
         cherche, il ferait diversion. */
      zoneAvant.innerHTML = "";
      if (!filtre) {
        const enAvant = visibles(premier).filter((p) => p.en_avant);
        const carrousel = bannieres.map(carteBanniere)
          .concat(enAvant.map((p) => carteAvant(p, parId[p.atelier_id])));
        if (carrousel.length) {
          zoneAvant.innerHTML =
            '<div class="titre-categorie" style="margin-top:0">★ À la une</div>' +
            '<div class="carrousel" id="carrousel-avant">' + carrousel.join("") + "</div>" +
            (carrousel.length > 1
              ? '<div class="carrousel-points" id="carrousel-points" aria-hidden="true">' +
                  carrousel.map(() => '<span class="carrousel-point"></span>').join("") +
                "</div>"
              : "");
          brancherCarrousel();
        }
      }

      if (!visibles(premier).length) {
        zoneGalerie.innerHTML = filtre
          ? UI.vide("recherche", "Aucun modèle ne correspond",
              "Élargissez la recherche : retirez un filtre ci-dessus.",
              '<button type="button" class="btn btn-clair" id="vider-filtres">' +
                "Effacer les filtres</button>")
          : UI.vide("image", "Aucun produit publié",
              "Les maisons ajouteront bientôt leurs créations — revenez vite !");
        const vider = UI.$("#vider-filtres");
        if (vider) vider.onclick = () => { effacerTout(); };
        if (!filtre) zoneGalerie.insertAdjacentHTML("beforeend", blocFinal(ateliers.length, 0));
        return;
      }

      zoneGalerie.innerHTML =
        '<div class="titre-categorie">' +
          (filtre ? "Résultats" : "Tous les produits") + "</div>" +
        '<div class="grille-produits" id="galerie"></div>' +
        '<div id="sentinelle" style="height:1px"></div>' +
        '<div class="galerie-attente" id="attente" hidden>' +
          '<span class="rondelle"></span><span>Chargement des modèles…</span></div>' +
        '<div id="galerie-fin"></div>';

      const galerie = UI.$("#galerie");
      const attente = UI.$("#attente");
      const fin = UI.$("#galerie-fin");
      const sentinelle = UI.$("#sentinelle");

      let poses = 0;
      let lots = 0;
      let demandes = premier.length;
      let epuise = false;
      let enCours = false;

      function ajouter(liste) {
        const html = [];
        for (const p of liste) {
          html.push(carteProduit(p, parId[p.atelier_id], poses % 7 === 3));
          poses++;
        }
        /* Une invitation tous les deux lots — mais jamais au milieu de
           résultats de recherche : on cherche un modèle, pas une offre. */
        if (!filtre && lots % 2 === 1) html.push(carteInvitation(Math.floor(lots / 2)));
        galerie.insertAdjacentHTML("beforeend", html.join(""));
        lots++;
      }

      ajouter(visibles(premier));
      if (premier.length < PAR_LOT) epuise = true;

      function terminer() {
        epuise = true;
        if (observateur) observateur.disconnect();
        attente.hidden = true;
        if (!fin.innerHTML && !filtre) fin.innerHTML = blocFinal(ateliers.length, poses);
      }

      async function lotSuivant() {
        /* On demande à partir du nombre de lignes déjà demandées, pas
           posées : les produits d'ateliers expirés sont écartés à
           l'affichage mais comptent dans la pagination du serveur. */
        const tranche = await Api.chercherProduits(criteres, demandes, demandes + PAR_LOT - 1);
        demandes += tranche.length;
        if (!tranche.length) { terminer(); return; }
        ajouter(visibles(tranche));
        if (tranche.length < PAR_LOT) terminer();
      }

      observateur = new IntersectionObserver(async (entrees) => {
        if (!entrees[0].isIntersecting || enCours) return;
        if (epuise) { terminer(); return; }
        enCours = true;
        attente.hidden = false;
        try {
          await lotSuivant();
        } catch (err) {
          UI.toast(err.message || "Chargement impossible", "erreur");
          terminer();
        }
        enCours = false;
        if (epuise) return;
        attente.hidden = true;
        /* La sentinelle peut rester visible d'un lot au suivant : un
           observateur ne signale que les changements, il ne redirait donc
           rien et le défilement s'arrêterait là. On réarme. */
        observateur.unobserve(sentinelle);
        observateur.observe(sentinelle);
      }, { rootMargin: "600px 0px" });

      if (epuise) terminer();
      else observateur.observe(sentinelle);
    }

    /* ---------- Les critères en cours, retirables un à un ---------- */

    function montrerCriteres() {
      const bouts = etiquettesCriteres(criteres, devise);
      UI.$("#criteres-actifs").innerHTML = bouts.map((b) =>
        '<button type="button" class="puce actif" data-retirer="' + e(b.cle) + '">' +
          e(b.texte) + UI.icone("fermer", "ic-sm") + "</button>").join("") +
        (bouts.length > 1
          ? '<button type="button" class="puce" data-retirer="tout">Tout effacer</button>'
          : "");
      const compte = UI.$("#compte-filtres");
      compte.hidden = !bouts.length;
      compte.textContent = bouts.length;
    }

    function effacerTout() {
      for (const cle of Object.keys(criteres)) delete criteres[cle];
      UI.$("#rech-produits").value = "";
      montrerCriteres();
      montrerGalerie();
    }

    UI.$("#criteres-actifs").addEventListener("click", (ev) => {
      const bouton = ev.target.closest("[data-retirer]");
      if (!bouton) return;
      if (bouton.dataset.retirer === "tout") { effacerTout(); return; }
      delete criteres[bouton.dataset.retirer];
      if (bouton.dataset.retirer === "texte") UI.$("#rech-produits").value = "";
      montrerCriteres();
      montrerGalerie();
    });

    /* La frappe ne part pas au serveur lettre par lettre : on attend que
       le doigt s'arrête. Sur un réseau lent, c'est la différence entre
       une recherche et une avalanche. */
    let minuterie = null;
    UI.$("#rech-produits").addEventListener("input", (ev) => {
      const terme = ev.target.value.trim();
      clearTimeout(minuterie);
      minuterie = setTimeout(() => {
        if (terme) criteres.texte = terme; else delete criteres.texte;
        montrerCriteres();
        montrerGalerie();
      }, 350);
    });

    UI.$("#btn-filtres").onclick = () => ouvrirFiltres(criteres, vocabulaire, devise, () => {
      montrerCriteres();
      montrerGalerie();
    });

    montrerCriteres();
    await montrerGalerie();

    /* Le lien s'ouvre dans le navigateur (window.open passe par le pont
       Android, qui le confie au système). */
    function brancherCarrousel() {
      const zone = UI.$("#carrousel-avant");
      if (!zone) return;
      zone.addEventListener("click", (ev) => {
        const banniere = ev.target.closest("[data-lien]");
        if (banniere) window.open(banniere.dataset.lien, "_blank");
      });
      lancerDefilement(zone, UI.$("#carrousel-points"));
    }
  }

  /* ---------- La feuille des filtres ----------
     Une seule valeur par critère : deux tailles à la fois ne veulent
     rien dire pour qui cherche à s'habiller, et la requête reste simple
     — donc rapide. */

  function ouvrirFiltres(criteres, vocabulaire, devise, apres) {
    const groupe = (titre, cle, valeurs, etiquette) => {
      if (!valeurs.length) return "";
      return '<div class="champ"><label>' + e(titre) + "</label>" +
        '<div class="puces puces-grille" data-groupe="' + e(cle) + '">' +
          valeurs.map((v) => {
            const code = typeof v === "string" ? v : v.code;
            const nom = typeof v === "string" ? v : v.nom;
            return '<button type="button" class="puce' +
              (criteres[cle] === code ? " actif" : "") + '" data-valeur="' + e(code) + '">' +
              e(etiquette ? etiquette(nom) : nom) + "</button>";
          }).join("") +
        "</div></div>";
    };

    const paliers = [];
    const max = Number(vocabulaire.prix_max) || 0;
    if (max > 0) {
      for (const part of [0.25, 0.5, 0.75]) {
        const seuil = Math.ceil((max * part) / 1000) * 1000;
        if (seuil > 0 && paliers.indexOf(seuil) < 0) paliers.push(seuil);
      }
    }

    const corps = UI.ouvrirFeuille("Filtrer les produits",
      '<div class="carte">' +
        groupe("Trier par", "tri", TRIS.map((t) => ({ code: t.cle, nom: t.nom }))) +
        groupe("Catégorie", "categorie", vocabulaire.categories || []) +
        groupe("Pour qui", "sexe", Mode.SEXES.filter((s) => s.code)) +
        groupe("Tranche d'âge", "age", Mode.AGES.filter((a) => a.code)) +
        groupe("Taille", "taille", vocabulaire.tailles || []) +
        groupe("Couleur", "couleur", vocabulaire.couleurs || []) +
        groupe("Tissu", "tissu", vocabulaire.tissus || []) +
        groupe("Prix maximum", "prixMax",
          paliers.map((p) => ({ code: String(p), nom: Utils.fmtMontant(p, devise) }))) +
        '<div class="champ"><label>Repères</label>' +
          '<div class="puces puces-grille" data-groupe="marques">' +
            '<button type="button" class="puce' + (criteres.tendance ? " actif" : "") +
              '" data-valeur="tendance">Tendance</button>' +
            '<button type="button" class="puce' + (criteres.surMesure ? " actif" : "") +
              '" data-valeur="surMesure">Sur mesure</button>' +
          "</div></div>" +
        '<div class="btn-rangee" style="margin-top:6px">' +
          '<button type="button" class="btn btn-clair" id="fl-effacer">Tout effacer</button>' +
          '<button type="button" class="btn" id="fl-voir">Voir les résultats</button>' +
        "</div>" +
      "</div>");

    corps.addEventListener("click", (ev) => {
      const bouton = ev.target.closest("[data-valeur]");
      if (!bouton) return;
      const zone = bouton.closest("[data-groupe]");
      const cle = zone.dataset.groupe;
      const valeur = bouton.dataset.valeur;

      if (cle === "marques") {
        if (criteres[valeur]) delete criteres[valeur]; else criteres[valeur] = true;
        bouton.classList.toggle("actif");
        bouton.setAttribute("aria-pressed", criteres[valeur] ? "true" : "false");
        return;
      }
      /* Retoucher la valeur active la retire : c'est le seul moyen de
         revenir en arrière sans quitter la feuille. */
      const meme = criteres[cle] === valeur ||
        (cle === "prixMax" && String(criteres.prixMax) === valeur);
      if (meme) delete criteres[cle];
      else criteres[cle] = cle === "prixMax" ? Number(valeur) : valeur;
      for (const autre of zone.querySelectorAll("[data-valeur]")) {
        autre.classList.toggle("actif", !meme && autre === bouton);
      }
    });

    UI.$("#fl-effacer", corps).onclick = () => {
      for (const cle of Object.keys(criteres)) if (cle !== "texte") delete criteres[cle];
      UI.fermerFeuille();
      apres();
    };
    UI.$("#fl-voir", corps).onclick = () => {
      UI.fermerFeuille();
      apres();
    };
  }

  /* ---------- Fiche produit ---------- */

  async function produit(vue, id) {
    const p = await Api.lireLigne("produits", id);
    if (!p) { location.hash = "#/"; return; }
    const [photos, atelier] = await Promise.all([
      Api.listerPar("photos_produits", "produit_id", id, "position", true),
      Api.lireLigne("ateliers_publics", p.atelier_id),
    ]);
    const images = (photos.length ? photos.map((ph) => ph.data_url)
      : (p.couverture ? [p.couverture] : [])).map((v) => Stockage.src(v));

    UI.entete({ titre: p.nom, sous: atelier ? atelier.nom : "", retour: true });

    const numero = atelier ? (atelier.tel_whatsapp || atelier.tel_appel) : "";
    let message = "";
    if (atelier) {
      message = "Bonjour " + atelier.nom + " 👋\n" +
        "Je suis intéressé(e) par votre produit « " + p.nom + " »" +
        (p.code ? " (code " + p.code + ")" : "") +
        (p.prix_visible ? " à " + fmtPrix(p, atelier) : "") +
        ", vue sur l'application Atelier.\nEst-elle disponible ?";
    }

    /* Une seule colonne sur téléphone. Sur grand écran, .fiche-produit
       met la photo à gauche et le prix + le bouton à droite, tout de
       suite visibles (voir styles.css). */
    vue.innerHTML =
      '<div class="fiche-produit">' +

      '<div class="fiche-media">' +
      (images.length
        ? '<div class="slider" id="slider-produit">' +
            images.map((src, i) => '<img src="' + src + '" alt="Photo ' + (i + 1) + '" data-voir="' + i + '">').join("") +
          "</div>" +
          (images.length > 1
            ? '<div class="aide" style="text-align:center;margin-top:6px">' + images.length +
              " photos — faites glisser, touchez pour agrandir</div>"
            : '<div class="aide" style="text-align:center;margin-top:6px">Touchez la photo pour l\'agrandir</div>')
        : '<div class="produit-photo produit-photo-vide" style="border-radius:var(--r)">' + UI.icone("image") + "</div>") +
      "</div>" +

      '<div class="fiche-infos">' +
      '<div class="carte">' +
        '<div class="paires">' +
          '<div class="paire"><span class="l">Produit</span><span class="v">' + e(p.nom) + "</span></div>" +
          (p.code ? '<div class="paire"><span class="l">Code</span><span class="v">' + e(p.code) + "</span></div>" : "") +
          '<div class="paire"><span class="l">Catégorie</span><span class="v">' + e(p.categorie || "Autres") + "</span></div>" +
          /* La fiche mode : chaque ligne n'apparaît que si elle a
             quelque chose à dire. Une suite de « non précisé » n'aide
             personne à choisir. */
          (p.sexe || p.tranche_age
            ? '<div class="paire"><span class="l">Pour</span><span class="v">' +
                e([p.sexe ? Mode.etiquetteSexe(p.sexe) : "",
                   p.tranche_age ? Mode.etiquetteAge(p.tranche_age) : ""]
                  .filter(Boolean).join(" · ")) + "</span></div>"
            : "") +
          (p.tailles && p.tailles.length
            ? '<div class="paire"><span class="l">Tailles</span><span class="v">' +
                e(p.tailles.join(", ")) + "</span></div>"
            : "") +
          (p.couleurs && p.couleurs.length
            ? '<div class="paire"><span class="l">Couleurs</span><span class="v liste">' +
                p.couleurs.map((c) => {
                  const ton = Mode.tonDe(c);
                  return '<span class="badge badge-neutre">' +
                    '<span class="pastille-ton' + (ton ? "" : " multi") + '"' +
                      (ton ? ' style="background:' + e(ton) + '"' : "") + "></span>" +
                    e(c) + "</span>";
                }).join(" ") + "</span></div>"
            : "") +
          (p.tissus && p.tissus.length
            ? '<div class="paire"><span class="l">Tissu' + (p.tissus.length > 1 ? "s" : "") +
                '</span><span class="v">' + e(p.tissus.join(", ")) + "</span></div>"
            : "") +
          (p.sur_mesure
            ? '<div class="paire"><span class="l">Confection</span><span class="v">' +
                "Sur mesure — taillé à vos mesures</span></div>"
            : "") +
          '<div class="paire"><span class="l">Prix</span><span class="v gros">' +
            (p.prix_visible ? fmtPrix(p, atelier) : "Sur demande") + "</span></div>" +
        "</div>" +
        (numero
          ? '<a class="btn btn-or btn-bloc" style="margin-top:12px" id="btn-commander" target="_blank" rel="noopener" href="' +
              Utils.lienWhatsApp(numero, message, atelier.indicatif) + '">' +
              UI.icone("whatsapp", "ic-sm") + "Commander maintenant</a>"
          : "") +
      "</div>" +

      (atelier
        ? '<button type="button" class="carte" style="width:100%;text-align:left;margin-top:12px;display:flex;align-items:center;gap:12px;border:0;font:inherit;cursor:pointer" data-nav="#/atelier/' + atelier.id + '">' +
            (atelier.logo
              ? '<img src="' + Stockage.src(atelier.logo) + '" alt="" class="logo-apercu">'
              : '<span class="pastille">' + e((atelier.nom || "?")[0].toUpperCase()) + "</span>") +
            '<span style="flex:1;min-width:0">' +
              '<span class="ligne-titre">' + e(atelier.nom) + "</span>" +
              '<span class="ligne-sous">' + e(atelier.slogan || "Voir tous ses produits") + "</span>" +
            "</span>" +
            UI.icone("retour", "ic-sm") +
          "</button>"
        : "") +
      "</div>" +

      "</div>";

    const slider = UI.$("#slider-produit");
    if (slider) {
      slider.addEventListener("click", (ev) => {
        const img = ev.target.closest("[data-voir]");
        if (img) UI.ouvrirVisionneuse(img.src);
      });
    }
  }

  /* ---------- Liste des ateliers + recherche ---------- */

  async function ateliers(vue) {
    const { produits, ateliers: liste } = await chargerCatalogue();
    const nbProduits = {};
    for (const p of produits) nbProduits[p.atelier_id] = (nbProduits[p.atelier_id] || 0) + 1;

    UI.entete({
      titre: "Ateliers",
      sous: liste.length + " atelier" + (liste.length > 1 ? "s" : "") + " de couture",
    });

    if (!liste.length) {
      vue.innerHTML = UI.vide("clients", "Aucun atelier pour le moment",
        "Les premiers ateliers arrivent bientôt.");
      return;
    }

    const ligne = (a) =>
      '<button type="button" class="ligne" data-nav="#/atelier/' + a.id + '">' +
        (a.logo
          ? '<span class="pastille"><img src="' + Stockage.src(a.logo) + '" alt=""></span>'
          : '<span class="pastille">' + e((a.nom || "?")[0].toUpperCase()) + "</span>") +
        '<span class="ligne-corps">' +
          '<span class="ligne-titre">' + e(a.nom) + "</span>" +
          '<span class="ligne-sous">' + e(a.slogan || "Atelier de couture") + "</span>" +
        "</span>" +
        '<span class="ligne-fin"><span class="badge badge-fait">' +
          (nbProduits[a.id] || 0) + " produit" + ((nbProduits[a.id] || 0) > 1 ? "s" : "") +
        "</span></span>" +
      "</button>";

    vue.innerHTML =
      '<div class="recherche">' + UI.icone("recherche") +
        '<input id="rech-ateliers" type="search" placeholder="Rechercher un atelier…" autocomplete="off">' +
      "</div>" +
      '<div class="liste" id="liste-ateliers" style="margin-top:12px">' + liste.map(ligne).join("") + "</div>";

    UI.$("#rech-ateliers").addEventListener("input", (ev) => {
      const terme = Utils.sansAccent(ev.target.value.trim().toLowerCase());
      const visibles = terme
        ? liste.filter((a) => Utils.sansAccent((a.nom + " " + a.slogan).toLowerCase()).includes(terme))
        : liste;
      UI.$("#liste-ateliers").innerHTML = visibles.length
        ? visibles.map(ligne).join("")
        : UI.vide("recherche", "Aucun atelier trouvé", "Essayez un autre nom.");
    });
  }

  /* ---------- Vitrine d'un atelier ---------- */

  async function atelier(vue, id) {
    const a = await Api.lireLigne("ateliers_publics", id);
    if (!a) { location.hash = "#/ateliers"; return; }
    const produits = await Api.listerPar("produits", "atelier_id", id, "cree_le", false);

    UI.entete({ titre: a.nom, sous: a.slogan || "Atelier de couture", retour: true });

    const numero = a.tel_whatsapp || a.tel_appel;
    vue.innerHTML =
      '<div class="carte" style="display:flex;align-items:center;gap:12px">' +
        (a.logo
          ? '<img src="' + Stockage.src(a.logo) + '" alt="" class="logo-apercu">'
          : '<span class="pastille">' + e((a.nom || "?")[0].toUpperCase()) + "</span>") +
        '<div style="flex:1;min-width:0">' +
          '<div class="ligne-titre">' + e(a.nom) + "</div>" +
          '<div class="ligne-sous">' + e(a.slogan || "") + "</div>" +
        "</div>" +
        (numero
          ? '<a class="btn btn-sm btn-or" target="_blank" rel="noopener" href="' +
              Utils.lienWhatsApp(numero,
                "Bonjour " + a.nom + " 👋 Je vous contacte depuis l'application Atelier.", a.indicatif) + '">' +
              UI.icone("whatsapp", "ic-sm") + "Contacter</a>"
          : "") +
      "</div>" +
      '<div style="margin-top:14px">' +
        (produits.length
          ? grilleParCategorie(produits, { [a.id]: a })
          : UI.vide("image", "Aucun produit publié", "Cet atelier ajoutera bientôt ses créations.")) +
      "</div>";
  }

  return { accueil, produit, ateliers, atelier };
})();
