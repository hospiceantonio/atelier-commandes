/* =========================================================
   Vue Boutique — vitrine publique, accessible sans compte.
   - accueil : réalisations de tous les ateliers actifs
   - produit : fiche avec photos en slider + « Commander »
   - ateliers : liste des ateliers avec recherche
   - atelier  : réalisations d'un atelier, par catégorie
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

  function carteProduit(p, atelier) {
    return (
      '<a class="carte-produit" href="#/produit/' + p.id + '">' +
        (p.couverture
          ? '<img class="produit-photo" src="' + p.couverture + '" alt="" loading="lazy">'
          : '<span class="produit-photo produit-photo-vide">' + UI.icone("image") + "</span>") +
        '<span class="produit-infos">' +
          '<span class="produit-nom">' + e(p.nom) + "</span>" +
          (atelier ? '<span class="produit-atelier">' + e(atelier.nom) + "</span>" : "") +
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

  /* ---------- Accueil public : toutes les réalisations ---------- */

  /** Grande carte du carrousel « À la une ». */
  function carteAvant(p, atelier) {
    return (
      '<a class="carte-avant" href="#/produit/' + p.id + '">' +
        (p.couverture
          ? '<img src="' + p.couverture + '" alt="" loading="lazy">'
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
        '<img src="' + b.image + '" alt="' + e(b.titre) + '" loading="lazy">' +
        (b.titre
          ? '<span class="carte-avant-voile"><span class="produit-nom">' + e(b.titre) + "</span></span>"
          : "") +
      "</" + (b.lien ? "button" : "span") + ">"
    );
  }

  async function accueil(vue) {
    const { produits, parId } = await chargerCatalogue();
    let bannieres = [];
    try {
      bannieres = (await Api.lister("bannieres", "position", true)).filter((b) => b.active);
    } catch (_) { /* base pas encore à jour : pas de bannière */ }

    UI.entete({ titre: "Atelier", sous: "Les réalisations de nos ateliers de couture" });

    if (!produits.length && !bannieres.length) {
      vue.innerHTML = UI.vide("image", "Aucune réalisation publiée",
        "Les ateliers ajouteront bientôt leurs créations — revenez vite !");
      return;
    }

    const enAvant = produits.filter((p) => p.en_avant);
    const carrousel = bannieres.map(carteBanniere)
      .concat(enAvant.map((p) => carteAvant(p, parId[p.atelier_id])));

    vue.innerHTML =
      (carrousel.length
        ? '<div class="titre-categorie" style="margin-top:0">★ À la une</div>' +
          '<div class="carrousel" id="carrousel-avant">' + carrousel.join("") + "</div>" +
          (carrousel.length > 1
            ? '<div class="carrousel-points" id="carrousel-points" aria-hidden="true">' +
                carrousel.map(() => '<span class="carrousel-point"></span>').join("") +
              "</div>"
            : "") +
          (produits.length ? '<div class="titre-categorie">Toutes les réalisations</div>' : "")
        : "") +
      (produits.length
        ? '<div class="grille-produits">' +
            produits.map((p) => carteProduit(p, parId[p.atelier_id])).join("") +
          "</div>"
        : "");

    /* Le lien s'ouvre dans le navigateur (window.open passe par le pont
       Android, qui le confie au système). */
    const zone = UI.$("#carrousel-avant");
    if (zone) {
      zone.addEventListener("click", (ev) => {
        const banniere = ev.target.closest("[data-lien]");
        if (banniere) window.open(banniere.dataset.lien, "_blank");
      });
      lancerDefilement(zone, UI.$("#carrousel-points"));
    }
  }

  /* ---------- Fiche produit ---------- */

  async function produit(vue, id) {
    const p = await Api.lireLigne("produits", id);
    if (!p) { location.hash = "#/"; return; }
    const [photos, atelier] = await Promise.all([
      Api.listerPar("photos_produits", "produit_id", id, "position", true),
      Api.lireLigne("ateliers_publics", p.atelier_id),
    ]);
    const images = photos.length ? photos.map((ph) => ph.data_url)
      : (p.couverture ? [p.couverture] : []);

    UI.entete({ titre: p.nom, sous: atelier ? atelier.nom : "", retour: true });

    const numero = atelier ? (atelier.tel_whatsapp || atelier.tel_appel) : "";
    let message = "";
    if (atelier) {
      message = "Bonjour " + atelier.nom + " 👋\n" +
        "Je suis intéressé(e) par votre réalisation « " + p.nom + " »" +
        (p.code ? " (code " + p.code + ")" : "") +
        (p.prix_visible ? " à " + fmtPrix(p, atelier) : "") +
        ", vue sur l'application Atelier.\nEst-elle disponible ?";
    }

    vue.innerHTML =
      (images.length
        ? '<div class="slider" id="slider-produit">' +
            images.map((src, i) => '<img src="' + src + '" alt="Photo ' + (i + 1) + '" data-voir="' + i + '">').join("") +
          "</div>" +
          (images.length > 1
            ? '<div class="aide" style="text-align:center;margin-top:6px">' + images.length +
              " photos — faites glisser, touchez pour agrandir</div>"
            : '<div class="aide" style="text-align:center;margin-top:6px">Touchez la photo pour l\'agrandir</div>')
        : '<div class="produit-photo produit-photo-vide" style="border-radius:var(--r)">' + UI.icone("image") + "</div>") +

      '<div class="carte" style="margin-top:12px">' +
        '<div class="paires">' +
          '<div class="paire"><span class="l">Réalisation</span><span class="v">' + e(p.nom) + "</span></div>" +
          (p.code ? '<div class="paire"><span class="l">Code</span><span class="v">' + e(p.code) + "</span></div>" : "") +
          '<div class="paire"><span class="l">Catégorie</span><span class="v">' + e(p.categorie || "Autres") + "</span></div>" +
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
              ? '<img src="' + atelier.logo + '" alt="" class="logo-apercu">'
              : '<span class="pastille">' + e((atelier.nom || "?")[0].toUpperCase()) + "</span>") +
            '<span style="flex:1;min-width:0">' +
              '<span class="ligne-titre">' + e(atelier.nom) + "</span>" +
              '<span class="ligne-sous">' + e(atelier.slogan || "Voir toutes ses réalisations") + "</span>" +
            "</span>" +
            UI.icone("retour", "ic-sm") +
          "</button>"
        : "");

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
          ? '<span class="pastille"><img src="' + a.logo + '" alt=""></span>'
          : '<span class="pastille">' + e((a.nom || "?")[0].toUpperCase()) + "</span>") +
        '<span class="ligne-corps">' +
          '<span class="ligne-titre">' + e(a.nom) + "</span>" +
          '<span class="ligne-sous">' + e(a.slogan || "Atelier de couture") + "</span>" +
        "</span>" +
        '<span class="ligne-fin"><span class="badge badge-fait">' +
          (nbProduits[a.id] || 0) + " réalisation" + ((nbProduits[a.id] || 0) > 1 ? "s" : "") +
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
          ? '<img src="' + a.logo + '" alt="" class="logo-apercu">'
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
          : UI.vide("image", "Aucune réalisation publiée", "Cet atelier ajoutera bientôt ses créations.")) +
      "</div>";
  }

  return { accueil, produit, ateliers, atelier };
})();
