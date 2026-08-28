/* =========================================================
   Vue Produits (administrateur) — la vitrine de l'atelier :
   produits avec nom, code, catégorie, prix (visible ou
   non du public) et jusqu'à 4 photos. Publiées dans la
   boutique publique tant que l'abonnement est à jour.
   ========================================================= */
const VueProduits = (() => {
  const e = Utils.echapper;
  const MAX_PHOTOS = 4;

  /* ---------- Trois briques du formulaire ---------- */

  /** Un interrupteur, avec sa raison d'être en dessous. Le libellé entier
      est cliquable : sur un téléphone, viser une case de 20 px est une
      épreuve. */
  const bascule = (id, actif, titre, aide) =>
    '<label class="bascule" for="' + id + '">' +
      '<input type="checkbox" id="' + id + '"' + (actif ? " checked" : "") + ">" +
      '<span class="piste"></span>' +
      '<span class="texte">' + e(titre) + "<small>" + e(aide) + "</small></span>" +
    "</label>";

  /** Une puce de choix — un seul parmi plusieurs (sexe, âge). */
  const choix = (attribut, valeur, nom, actif) =>
    '<button type="button" class="puce' + (actif ? " actif" : "") + '" ' +
      attribut + '="' + e(valeur) + '" aria-pressed="' + (actif ? "true" : "false") + '">' +
      e(nom) + "</button>";

  /** Le champ replié derrière « + Autre ». Les listes de couleurs et de
      tissus ne peuvent pas être complètes : celle-ci s'ouvre à la
      demande, plutôt que d'imposer une saisie libre à tout le monde. */
  const champAjout = (quoi, place) =>
    '<button type="button" class="voir-plus" data-plus="' + quoi + '" hidden></button>' +
    '<div class="ajout-libre" data-ajout="' + quoi + '">' +
      '<input type="text" autocomplete="off" autocapitalize="words" placeholder="' + e(place) + '">' +
      '<button type="button" class="btn btn-clair btn-sm">Ajouter</button>' +
    "</div>";

  /** Miniature de couverture recalculée depuis la première photo. */
  /* ---------- Liste des produits de l'atelier ---------- */

  async function liste(vue) {
    const produits = await Api.listerPar("produits", "atelier_id", Api.atelierId(), "cree_le", false);

    UI.entete({
      titre: "Vitrine",
      sous: produits.length + " produit" + (produits.length > 1 ? "s" : "") + " publié" + (produits.length > 1 ? "s" : ""),
      actions:
        (Api.aDroitStock()
          ? '<a class="btn-ic" href="#/stock" aria-label="Gestion de stock">' +
              UI.icone("boutique") + "</a>"
          : "") +
        '<a class="btn-ic" href="#/produit-gere/nouveau" aria-label="Nouveau produit">' + UI.icone("plus") + "</a>",
    });

    if (!produits.length) {
      vue.innerHTML = UI.vide("image", "Aucun produit",
        "Publiez vos créations : elles apparaîtront dans la boutique publique de l'application, " +
        "avec un bouton de commande WhatsApp.",
        '<a class="btn" href="#/produit-gere/nouveau">' + UI.icone("plus", "ic-sm") + "Ajouter un produit</a>");
      return;
    }

    const categories = {};
    for (const p of produits) {
      const cat = p.categorie || "Autres";
      (categories[cat] = categories[cat] || []).push(p);
    }

    vue.innerHTML =
      Object.keys(categories).sort((a, b) => a.localeCompare(b, "fr")).map((cat) =>
        '<div class="titre-categorie">' + e(cat) + "</div>" +
        '<div class="liste">' +
          categories[cat].map((p) =>
            '<button type="button" class="ligne" data-nav="#/produit-gere/' + p.id + '">' +
              (p.couverture
                ? '<span class="pastille"><img src="' + Stockage.src(p.couverture) + '" alt=""></span>'
                : '<span class="pastille">' + UI.icone("image", "ic-sm") + "</span>") +
              '<span class="ligne-corps">' +
                '<span class="ligne-titre">' + (p.en_avant ? "★ " : "") + e(p.nom) + "</span>" +
                '<span class="ligne-sous">' + (p.code ? e(p.code) : "Sans code") +
                  (p.en_avant ? " · À la une" : "") +
                  (p.tendance ? " · Tendance" : "") +
                  (p.sur_mesure ? " · Sur mesure" : "") + "</span>" +
                /* Ce qu'un client demande avant tout : pour qui, quelle
                   taille. Rien ne s'affiche si rien n'a été renseigné. */
                (Mode.resume(p)
                  ? '<span class="ligne-sous">' + e(Mode.resume(p)) + "</span>"
                  : "") +
              "</span>" +
              '<span class="ligne-fin">' +
                (p.stock > 0
                  ? '<span class="badge badge-fait">' + p.stock + " en stock</span>"
                  : '<span class="badge badge-danger">Épuisé</span>') +
                '<span class="ligne-montant">' + Utils.fmtMontant(p.prix, Store.lireReglages().devise) + "</span>" +
              "</span>" +
            "</button>"
          ).join("") +
        "</div>"
      ).join("") +
      '<p class="pied-note">Vos produits sont visibles du public tant que votre abonnement est à jour.</p>';
  }

  /* ---------- Création / modification ---------- */

  async function formulaire(vue, id) {
    let produit = null;
    /* Chaque entrée porte de quoi s'afficher tout de suite (« apercu »)
       et de quoi être enregistrée : soit un fichier à déposer, soit la
       valeur déjà en base — chemin de bucket ou data-url héritée. */
    let photos = [];
    if (id) {
      produit = await Api.lireLigne("produits", id);
      if (!produit) { location.hash = "#/produits"; return; }
      photos = (await Api.listerPar("photos_produits", "produit_id", id, "position", true))
        .map((p) => ({ apercu: Stockage.src(p.data_url), valeur: p.data_url }));
    }

    const tous = await Api.listerPar("produits", "atelier_id", Api.atelierId());
    const categories = Array.from(new Set(tous.map((p) => p.categorie).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, "fr"));

    /* Ce que l'atelier a déjà employé rejoint les suggestions : une
       matière ajoutée une fois n'est plus à retaper la fois suivante. */
    const dejaVus = (champ, base) => {
      const vus = new Set(base);
      for (const p of tous) for (const v of (p[champ] || [])) vus.add(v);
      return Array.from(vus);
    };

    UI.entete({
      titre: produit ? "Modifier le produit" : "Nouveau produit",
      sous: produit ? produit.nom : "Publié dans la boutique publique",
      retour: true,
    });

    vue.innerHTML =
      '<form id="form-produit" novalidate>' +
        '<div class="carte">' +
          '<div class="carte-titre">' + UI.icone("camera", "ic-sm") + "Photos</div>" +
          '<div class="carte-aide">Jusqu\'à ' + MAX_PHOTOS +
            " photos. La première fait la vignette de la boutique.</div>" +
          '<div class="photos" id="zone-photos-produit"></div>' +
          '<input type="file" id="prod-photo" accept="image/*" capture="environment" multiple hidden>' +
        "</div>" +

        '<div class="carte">' +
          '<div class="carte-titre">' + UI.icone("crayon", "ic-sm") + "L'essentiel</div>" +
          '<div class="champ"><label for="prod-nom">Nom du produit <span class="obligatoire">*</span></label>' +
            '<input id="prod-nom" autocomplete="off" autocapitalize="sentences" value="' + e(produit ? produit.nom : "") + '"></div>' +
          '<div class="champ"><label for="prod-code">Code</label>' +
            '<input id="prod-code" autocomplete="off" placeholder="ex. RB-001" value="' +
              e(produit ? produit.code : "") + '"></div>' +
          '<div class="champ"><label>Catégorie</label>' +
            '<div class="puces puces-grille" id="prod-categorie"></div>' +
            champAjout("categorie", "Nom de la catégorie") + "</div>" +
          UI.champMontant({ id: "prod-prix", label: "Prix", valeur: produit ? produit.prix : "", obligatoire: true }) +
          bascule("prod-prix-visible", !produit || produit.prix_visible,
            "Afficher le prix", "Sinon la boutique affiche « Prix sur demande »") +
        "</div>" +

        /* ---------- Mode ----------
           Pour qui d'abord : ces deux réponses commandent la grille de
           tailles juste en dessous. */
        '<div class="carte">' +
          '<div class="carte-titre">' + UI.icone("etiquette", "ic-sm") + "Mode</div>" +
          '<div class="carte-aide">Ce qu\'un client demande avant d\'écrire. ' +
            "Tout est facultatif — ce qui reste vide ne s'affiche pas.</div>" +

          '<div class="champ"><label>Pour qui</label>' +
            '<div class="puces puces-grille" id="prod-sexe">' +
              Mode.SEXES.map((s) => choix("data-sexe", s.code, s.nom,
                (produit ? produit.sexe : "") === s.code)).join("") +
            "</div></div>" +

          '<div class="champ"><label>Tranche d\'âge</label>' +
            '<div class="puces puces-grille" id="prod-age">' +
              Mode.AGES.map((a) => choix("data-age", a.code, a.nom,
                (produit ? produit.tranche_age : "") === a.code)).join("") +
            "</div></div>" +

          '<div class="champ"><label>Tailles disponibles</label>' +
            '<div class="carte-aide">Norme européenne. La grille suit vos deux réponses ' +
              "ci-dessus ; pour les enfants, l'âge est suivi de la stature en centimètres.</div>" +
            '<div id="prod-tailles"></div></div>' +

          '<div class="champ"><label>Couleurs</label>' +
            '<div class="puces puces-grille" id="prod-couleurs"></div>' +
            champAjout("couleur", "Nom de la couleur") + "</div>" +

          '<div class="champ"><label>Tissus</label>' +
            '<div class="puces puces-grille" id="prod-tissus"></div>' +
            champAjout("tissu", "Nom du tissu") + "</div>" +
        "</div>" +

        '<div class="carte">' +
          '<div class="carte-titre">' + UI.icone("boutique", "ic-sm") + "Vente</div>" +
          bascule("prod-sur-mesure", !!(produit && produit.sur_mesure),
            "Sur mesure", "Le modèle est confectionné aux mesures du client") +
          bascule("prod-tendance", !!(produit && produit.tendance),
            "Tendance", "Un badge le signale dans la boutique") +
          '<div class="champ" style="margin:14px 0 0"><label for="prod-stock">Stock disponible</label>' +
            '<input id="prod-stock" inputmode="numeric" autocomplete="off" value="' +
              e(String(produit ? produit.stock : 0)) + '">' +
            '<div class="aide">Visible de vous seul. Chaque facture émise depuis « Nouvelle vente » ' +
              "retire automatiquement les articles vendus.</div></div>" +
        "</div>" +

        '<button type="submit" class="btn btn-bloc" id="prod-enregistrer">' +
          UI.icone("check", "ic-sm") + (produit ? "Enregistrer les modifications" : "Publier le produit") + "</button>" +
      "</form>" +
      (produit
        ? '<button type="button" class="btn btn-danger btn-bloc" id="prod-supprimer" style="margin-top:10px">' +
            UI.icone("poubelle", "ic-sm") + "Retirer ce produit</button>"
        : "");

    /* Photos */
    const prise = UI.$("#prod-photo");
    function afficherPhotos() {
      UI.$("#zone-photos-produit").innerHTML =
        photos.map((p, i) =>
          '<span class="photo"><img src="' + p.apercu + '" alt="Photo ' + (i + 1) + '">' +
            '<button type="button" class="photo-suppr" data-retire="' + i + '" aria-label="Retirer la photo">' +
            UI.icone("fermer", "ic-sm") + "</button>" +
            (i === 0 ? '<span class="photo-tag">Couverture</span>' : "") + "</span>"
        ).join("") +
        (photos.length < MAX_PHOTOS
          ? '<button type="button" class="photo-ajout" id="ajout-photo-produit">' + UI.icone("camera") +
              (photos.length ? "Autre photo" : "Prendre une photo") + "</button>"
          : "");
      const ajout = UI.$("#ajout-photo-produit");
      if (ajout) ajout.onclick = () => prise.click();
    }
    afficherPhotos();

    UI.$("#zone-photos-produit").addEventListener("click", (ev) => {
      const bouton = ev.target.closest("[data-retire]");
      if (!bouton) return;
      photos.splice(Number(bouton.dataset.retire), 1);
      afficherPhotos();
    });

    prise.addEventListener("change", async () => {
      const fichiers = Array.from(prise.files || []);
      prise.value = "";
      for (const fichier of fichiers) {
        if (photos.length >= MAX_PHOTOS) { UI.toast(MAX_PHOTOS + " photos maximum", "erreur"); break; }
        try {
          /* Une seule lecture : l'aperçu ET le fichier à déposer sortent
             du même passage. Relire plus tard le fichier d'Android
             échouait — voir Utils.preparerImage. */
          const { dataUrl, blob } = await Utils.preparerImage(fichier);
          photos.push({ apercu: dataUrl, blob });
        } catch (_) {
          UI.toast("Image illisible", "erreur");
        }
      }
      afficherPhotos();
    });

    /* ---------- Mode : ce qui se choisit à la puce ----------
       Tout se touche du doigt. Les menus déroulants ont disparu : sur
       Android, la liste de suggestions d'un champ de saisie ne s'ouvre
       pas dans la WebView — le champ « tissu » y était muet. */
    let categorie = (produit && produit.categorie) || "";
    let sexe = (produit && produit.sexe) || "";
    let age = (produit && produit.tranche_age) || "";
    let tailles = (produit && produit.tailles) ? produit.tailles.slice() : [];
    let couleurs = (produit && produit.couleurs) ? produit.couleurs.slice() : [];
    let tissus = (produit && produit.tissus) ? produit.tissus.slice() : [];

    const puce = (valeur, choisi, attribut, dedans) =>
      '<button type="button" class="puce' + (choisi ? " actif" : "") + '" ' +
        attribut + '="' + e(valeur) + '" aria-pressed="' + (choisi ? "true" : "false") + '">' +
        dedans + "</button>";

    /* La puce qui ouvre le champ libre, en queue de liste. */
    const puceAjout = (quoi) =>
      '<button type="button" class="puce puce-ajout" data-ouvrir="' + quoi + '">+ Autre</button>';

    /* Ce qui est retenu passe devant. Le tri est stable : à l'intérieur
       de chaque moitié, l'ordre d'origine tient. Replié, on voit donc
       toujours ses propres choix. */
    const devant = (liste, retenu) =>
      liste.slice().sort((a, b) => (retenu(b) ? 1 : 0) - (retenu(a) ? 1 : 0));

    /* Au-delà de cette longueur, la liste se replie derrière un bouton :
       vingt puces déroulées font une carte qu'on ne finit pas de faire
       défiler. */
    const SEUIL_REPLI = 12;
    const deplie = {};
    function majRepli(quoi) {
      const zone = UI.$('[data-plus="' + quoi + '"]').previousElementSibling;
      const bouton = UI.$('[data-plus="' + quoi + '"]');
      /* « + Autre » ne compte pas : c'est une commande, pas un choix.
         Sans cette nuance, une liste de douze replie treize puces. */
      const total = zone.querySelectorAll(".puce:not(.puce-ajout)").length;
      const aReplier = total > SEUIL_REPLI && !deplie[quoi];
      zone.classList.toggle("puces-repliees", aReplier);
      bouton.hidden = total <= SEUIL_REPLI;
      bouton.textContent = aReplier ? "Tout afficher" : "Replier";
    }

    function rendreTailles() {
      const groupes = Mode.grilles(sexe, age);
      /* Changer de grille ne doit pas effacer en douce ce qui était déjà
         coché : ce qui n'entre dans aucun groupe reste montré à part. */
      const connues = new Set();
      for (const g of groupes) for (const t of g.tailles) connues.add(t);
      const gardees = tailles.filter((t) => !connues.has(t));
      if (gardees.length) groupes.push({ titre: "Autres tailles retenues", tailles: gardees });

      UI.$("#prod-tailles").innerHTML = groupes.length
        ? groupes.map((g) =>
            '<div class="sous-titre-champ">' + e(g.titre) + "</div>" +
            '<div class="puces puces-grille">' +
              g.tailles.map((t) => puce(t, tailles.indexOf(t) >= 0, "data-taille", e(t))).join("") +
            "</div>").join("")
        : '<div class="aide">Choisissez la tranche d\'âge : la grille des tailles s\'y adapte.</div>';
    }

    /* Ce qui est proposé : la liste de départ, plus tout ce que l'atelier
       a déjà employé ailleurs, plus ce que cette fiche porte déjà. */
    function rendreCouleurs() {
      const toutes = new Set(dejaVus("couleurs", Mode.COULEURS.map((c) => c.nom)).concat(couleurs));
      UI.$("#prod-couleurs").innerHTML =
        devant(Array.from(toutes), (n) => couleurs.indexOf(n) >= 0).map((nom) => {
          const ton = Mode.tonDe(nom);
          const pastille = '<span class="pastille-ton' + (ton ? "" : " multi") + '"' +
            (ton ? ' style="background:' + e(ton) + '"' : "") + "></span>";
          return puce(nom, couleurs.indexOf(nom) >= 0, "data-couleur",
            pastille + "<span>" + e(nom) + "</span>");
        }).join("") + puceAjout("couleur");
      majRepli("couleur");
    }

    function rendreTissus() {
      const toutes = new Set(dejaVus("tissus", Mode.TISSUS).concat(tissus));
      UI.$("#prod-tissus").innerHTML =
        devant(Array.from(toutes), (n) => tissus.indexOf(n) >= 0).map((nom) =>
          puce(nom, tissus.indexOf(nom) >= 0, "data-tissu", e(nom))).join("") +
        puceAjout("tissu");
      majRepli("tissu");
    }

    function basculer(liste, valeur) {
      const i = liste.indexOf(valeur);
      if (i >= 0) liste.splice(i, 1); else liste.push(valeur);
    }

    /* La catégorie se choisit aussi à la puce : c'était le second champ à
       liste de suggestions, muet lui aussi dans la WebView d'Android. Un
       seul rayon par produit — mais la liste s'ouvre. */
    function rendreCategorie() {
      const toutes = new Set(Mode.CATEGORIES.concat(categories).concat(categorie ? [categorie] : []));
      UI.$("#prod-categorie").innerHTML =
        devant(Array.from(toutes), (n) => n === categorie).map((nom) =>
          puce(nom, categorie === nom, "data-categorie", e(nom))).join("") +
        puceAjout("categorie");
      majRepli("categorie");
    }

    rendreCategorie();
    rendreTailles();
    rendreCouleurs();
    rendreTissus();

    /* Choix unique : la puce touchée devient la seule active. Se dédire
       ne demande pas de geste particulier — « Non précisé » est une puce
       comme les autres. */
    const choisirUnique = (zone, attribut, poser) => {
      UI.$(zone).addEventListener("click", (ev) => {
        const b = ev.target.closest("[" + attribut + "]");
        if (!b) return;
        poser(b.getAttribute(attribut));
        for (const autre of UI.$$(zone + " [" + attribut + "]")) {
          autre.classList.toggle("actif", autre === b);
          autre.setAttribute("aria-pressed", autre === b ? "true" : "false");
        }
        rendreTailles();
      });
    };
    choisirUnique("#prod-sexe", "data-sexe", (v) => { sexe = v; });
    choisirUnique("#prod-age", "data-age", (v) => { age = v; });

    UI.$("#prod-tailles").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-taille]");
      if (!b) return;
      basculer(tailles, b.dataset.taille);
      rendreTailles();
    });

    /* Les trois listes ouvertes fonctionnent pareil : toucher une puce,
       ou ouvrir le champ libre pour ajouter ce que la liste ignore.
       « appliquer » dit ce que vaut un choix — une de plus pour les
       couleurs et les tissus, la seule pour la catégorie. */
    const listeOuverte = (zone, attribut, quoi, appliquer, rendre) => {
      const bloc = UI.$('[data-ajout="' + quoi + '"]');
      const saisie = UI.$("input", bloc);
      const ajouter = () => {
        const valeur = saisie.value.trim();
        if (!valeur) return;
        appliquer(valeur, true);
        saisie.value = "";
        bloc.classList.remove("ouvert");
        rendre();
      };
      UI.$(zone).addEventListener("click", (ev) => {
        if (ev.target.closest("[data-ouvrir]")) {
          bloc.classList.add("ouvert");
          saisie.focus();
          return;
        }
        const b = ev.target.closest("[" + attribut + "]");
        if (!b) return;
        appliquer(b.getAttribute(attribut), false);
        rendre();
      });
      UI.$('[data-plus="' + quoi + '"]').onclick = () => {
        deplie[quoi] = !deplie[quoi];
        majRepli(quoi);
      };
      UI.$("button", bloc).onclick = ajouter;
      saisie.addEventListener("keydown", (ev) => {
        /* Entrée ajoute la valeur — et n'envoie surtout pas le
           formulaire, qui serait alors publié à moitié rempli. */
        if (ev.key !== "Enter") return;
        ev.preventDefault();
        ajouter();
      });
    };

    /* Une valeur ajoutée à la main est retenue d'office : on ne la tape
       pas pour ensuite devoir la cocher. */
    const dansLaListe = (liste) => (valeur, ajoutee) => {
      if (ajoutee) { if (liste.indexOf(valeur) < 0) liste.push(valeur); }
      else basculer(liste, valeur);
    };

    listeOuverte("#prod-categorie", "data-categorie", "categorie",
      (valeur) => { categorie = valeur; }, rendreCategorie);
    listeOuverte("#prod-couleurs", "data-couleur", "couleur",
      dansLaListe(couleurs), rendreCouleurs);
    listeOuverte("#prod-tissus", "data-tissu", "tissu",
      dansLaListe(tissus), rendreTissus);

    /* Enregistrement */
    UI.$("#form-produit").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const nom = UI.$("#prod-nom").value.trim();
      const prix = Utils.lireNombre(UI.$("#prod-prix").value);
      if (!nom) { UI.toast("Indiquez le nom du produit", "erreur"); return; }
      if (prix <= 0) { UI.toast("Indiquez le prix", "erreur"); return; }

      const bouton = UI.$("#prod-enregistrer");
      bouton.disabled = true;
      try {
        /* Les nouvelles photos partent dans le bucket ; celles déjà
           enregistrées gardent leur valeur, quelle qu'en soit la forme. */
        bouton.textContent = "Envoi des photos…";
        const gardees = [];
        for (const ph of photos) {
          gardees.push(ph.blob
            ? await Stockage.deposerImage(ph.blob, Stockage.VITRINE, "produits",
                { dejaPrete: true })
            : ph.valeur);
        }

        /* La couverture est une version réduite : la grille affiche des
           vignettes, inutile d'y servir l'image pleine. Si la première
           photo était déjà enregistrée, on garde la couverture existante
           — la régénérer demanderait de retélécharger le fichier. */
        let couverture = "";
        if (photos.length) {
          /* La couverture se recalcule depuis le Blob déjà en mémoire :
             une vignette plus petite, sans retoucher au fichier d'origine. */
          couverture = photos[0].blob
            ? await Stockage.deposerImage(photos[0].blob, Stockage.VITRINE, "couvertures",
                { coteMax: 420, qualite: 0.7 })
            : ((produit && produit.couverture) || gardees[0] || "");
        }

        /* Le stock ne fait PAS partie des valeurs écrites ici. Toute
           variation passe par le journal (supabase/stock.sql) : à la
           création on approvisionne, à la modification on inventorie.
           Sans cela, ce formulaire serait le seul chemin par lequel le
           stock bougerait sans laisser de trace. */
        const stockVoulu = Math.max(0, Math.round(Utils.lireNombre(UI.$("#prod-stock").value)));
        const valeurs = {
          nom,
          code: UI.$("#prod-code").value.trim(),
          categorie: categorie || "Autres",
          prix,
          prix_visible: UI.$("#prod-prix-visible").checked,
          sexe: sexe,
          tranche_age: age,
          tailles: tailles.slice(),
          couleurs: couleurs.slice(),
          tissus: tissus.slice(),
          sur_mesure: UI.$("#prod-sur-mesure").checked,
          tendance: UI.$("#prod-tendance").checked,
          couverture,
          modifie_le: new Date().toISOString(),
        };
        let enregistre;
        if (produit) {
          enregistre = await Api.mettreAJour("produits", produit.id, valeurs);
          // Ordre des photos garanti : on remplace tout le jeu.
          const anciennes = await Api.listerPar("photos_produits", "produit_id", produit.id);
          for (const ph of anciennes) await Api.supprimerLigne("photos_produits", ph.id);
          /* Les fichiers que plus aucune ligne ne référence sont retirés
             du bucket : sans cela, chaque modification en laisserait. */
          await Stockage.retirer(
            anciennes.map((ph) => ph.data_url).filter((v) => gardees.indexOf(v) < 0),
            Stockage.VITRINE);
        } else {
          enregistre = await Api.inserer("produits",
            { atelier_id: Api.atelierId(), ...valeurs, stock: 0 });
        }

        if (stockVoulu !== (enregistre.stock || 0)) {
          const apres = produit
            ? await Api.inventorierStock([{ produit_id: enregistre.id, compte: stockVoulu,
                motif: "Correction depuis la fiche" }])
            : await Api.approvisionnerStock(enregistre.id, stockVoulu, "Stock initial");
          /* inventorierStock ne rend qu'un résumé : on relit la ligne
             pour que la suite parle du stock réellement enregistré. */
          enregistre = apres && apres.id ? apres : await Api.lireLigne("produits", enregistre.id);
        }
        for (let i = 0; i < photos.length; i++) {
          await Api.inserer("photos_produits", {
            atelier_id: Api.atelierId(),
            produit_id: enregistre.id,
            data_url: gardees[i],
            position: i,
          });
        }
        UI.toast(produit ? "Produit mis à jour" : "Produit publié", "ok");
        location.hash = "#/produits";
      } catch (err) {
        UI.toast(err.message || "Enregistrement impossible", "erreur");
        bouton.disabled = false;
      }
    });

    const supprimer = UI.$("#prod-supprimer");
    if (supprimer) {
      supprimer.onclick = async () => {
        const ok = await UI.confirmer({
          titre: "Retirer le produit",
          texte: "« " + produit.nom + " » et ses photos seront retirées de la boutique publique.",
          bouton: "Retirer", danger: true,
        });
        if (!ok) return;
        /* La cascade SQL efface les lignes, pas les fichiers : on relève
           les chemins avant de supprimer, sinon ils resteraient orphelins
           dans le bucket. */
        const aRetirer = (await Api.listerPar("photos_produits", "produit_id", produit.id))
          .map((ph) => ph.data_url)
          .concat([produit.couverture]);
        await Api.supprimerLigne("produits", produit.id);
        await Stockage.retirer(aRetirer, Stockage.VITRINE);
        UI.toast("Produit retiré", "ok");
        location.hash = "#/produits";
      };
    }
  }

  return { liste, formulaire };
})();
