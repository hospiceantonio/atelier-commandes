/* =========================================================
   Vue Produits (administrateur) — la vitrine de l'atelier :
   réalisations avec nom, code, catégorie, prix (visible ou
   non du public) et jusqu'à 4 photos. Publiées dans la
   boutique publique tant que l'abonnement est à jour.
   ========================================================= */
const VueProduits = (() => {
  const e = Utils.echapper;
  const MAX_PHOTOS = 4;

  /** Miniature de couverture recalculée depuis la première photo. */
  /* ---------- Liste des réalisations de l'atelier ---------- */

  async function liste(vue) {
    const produits = await Api.listerPar("produits", "atelier_id", Api.atelierId(), "cree_le", false);

    UI.entete({
      titre: "Vitrine",
      sous: produits.length + " réalisation" + (produits.length > 1 ? "s" : "") + " publiée" + (produits.length > 1 ? "s" : ""),
      actions:
        (Api.estAdmin()
          ? '<a class="btn-ic" href="#/stock" aria-label="Gestion de stock">' +
              UI.icone("boutique") + "</a>"
          : "") +
        '<a class="btn-ic" href="#/produit-gere/nouveau" aria-label="Nouvelle réalisation">' + UI.icone("plus") + "</a>",
    });

    if (!produits.length) {
      vue.innerHTML = UI.vide("image", "Aucune réalisation",
        "Publiez vos créations : elles apparaîtront dans la boutique publique de l'application, " +
        "avec un bouton de commande WhatsApp.",
        '<a class="btn" href="#/produit-gere/nouveau">' + UI.icone("plus", "ic-sm") + "Ajouter une réalisation</a>");
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
                  (p.en_avant ? " · À la une" : "") + "</span>" +
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
      '<p class="pied-note">Vos réalisations sont visibles du public tant que votre abonnement est à jour.</p>';
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

    UI.entete({
      titre: produit ? "Modifier la réalisation" : "Nouvelle réalisation",
      sous: produit ? produit.nom : "Publiée dans la boutique publique",
      retour: true,
    });

    vue.innerHTML =
      '<form id="form-produit" novalidate>' +
        '<div class="carte">' +
          '<div class="carte-titre">' + UI.icone("camera", "ic-sm") + "Photos (" + MAX_PHOTOS + " maximum)</div>" +
          '<div class="photos" id="zone-photos-produit"></div>' +
          '<input type="file" id="prod-photo" accept="image/*" capture="environment" multiple hidden>' +
          '<div class="aide">La première photo sert de couverture dans la boutique.</div>' +
        "</div>" +

        '<div class="carte">' +
          '<div class="carte-titre">' + UI.icone("crayon", "ic-sm") + "Détails</div>" +
          '<div class="champ"><label for="prod-nom">Nom de la réalisation <span class="obligatoire">*</span></label>' +
            '<input id="prod-nom" autocomplete="off" autocapitalize="sentences" value="' + e(produit ? produit.nom : "") + '"></div>' +
          '<div class="champ-duo">' +
            '<div class="champ"><label for="prod-code">Code</label>' +
              '<input id="prod-code" autocomplete="off" placeholder="ex. RB-001" value="' + e(produit ? produit.code : "") + '"></div>' +
            '<div class="champ"><label for="prod-categorie">Catégorie</label>' +
              '<input id="prod-categorie" autocomplete="off" list="prod-categories" placeholder="ex. Robes" value="' +
                e(produit ? produit.categorie : "") + '">' +
              '<datalist id="prod-categories">' +
                categories.map((c) => '<option value="' + e(c) + '">').join("") +
              "</datalist></div>" +
          "</div>" +
          UI.champMontant({ id: "prod-prix", label: "Prix", valeur: produit ? produit.prix : "", obligatoire: true }) +
          '<label class="interrupteur" style="display:flex">' +
            '<input type="checkbox" id="prod-prix-visible"' +
              (!produit || produit.prix_visible ? " checked" : "") + ">" +
            "<span>Afficher le prix dans la boutique publique (sinon : « Prix sur demande »)</span>" +
          "</label>" +
          '<label class="interrupteur" style="display:flex">' +
            '<input type="checkbox" id="prod-avant"' + (produit && produit.en_avant ? " checked" : "") + ">" +
            "<span>Mettre en avant : la réalisation ouvre l'accueil de la boutique, " +
              "dans le carrousel <strong>À la une</strong></span>" +
          "</label>" +
          '<div class="champ" style="margin-top:14px"><label for="prod-stock">Stock disponible</label>' +
            '<input id="prod-stock" inputmode="numeric" autocomplete="off" value="' +
              e(String(produit ? produit.stock : 0)) + '">' +
            '<div class="aide">Visible de vous seul. Chaque facture émise depuis « Nouvelle vente » ' +
              "retire automatiquement les articles vendus.</div></div>" +
        "</div>" +

        '<button type="submit" class="btn btn-bloc" id="prod-enregistrer">' +
          UI.icone("check", "ic-sm") + (produit ? "Enregistrer les modifications" : "Publier la réalisation") + "</button>" +
      "</form>" +
      (produit
        ? '<button type="button" class="btn btn-danger btn-bloc" id="prod-supprimer" style="margin-top:10px">' +
            UI.icone("poubelle", "ic-sm") + "Retirer cette réalisation</button>"
        : "");

    /* Photos */
    const prise = UI.$("#prod-photo");
    function afficherPhotos() {
      UI.$("#zone-photos-produit").innerHTML =
        photos.map((p, i) =>
          '<span class="photo"><img src="' + p.apercu + '" alt="Photo ' + (i + 1) + '">' +
            '<button type="button" class="photo-suppr" data-retire="' + i + '" aria-label="Retirer la photo">' +
            UI.icone("fermer", "ic-sm") + "</button></span>"
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
          const { dataUrl } = await Utils.compresserImage(fichier);
          photos.push({ apercu: dataUrl, fichier });
        } catch (_) {
          UI.toast("Image illisible", "erreur");
        }
      }
      afficherPhotos();
    });

    /* Enregistrement */
    UI.$("#form-produit").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const nom = UI.$("#prod-nom").value.trim();
      const prix = Utils.lireNombre(UI.$("#prod-prix").value);
      if (!nom) { UI.toast("Indiquez le nom de la réalisation", "erreur"); return; }
      if (prix <= 0) { UI.toast("Indiquez le prix", "erreur"); return; }

      const bouton = UI.$("#prod-enregistrer");
      bouton.disabled = true;
      try {
        /* Les nouvelles photos partent dans le bucket ; celles déjà
           enregistrées gardent leur valeur, quelle qu'en soit la forme. */
        bouton.textContent = "Envoi des photos…";
        const gardees = [];
        for (const ph of photos) {
          gardees.push(ph.fichier
            ? await Stockage.deposerImage(ph.fichier, Stockage.VITRINE, "produits")
            : ph.valeur);
        }

        /* La couverture est une version réduite : la grille affiche des
           vignettes, inutile d'y servir l'image pleine. Si la première
           photo était déjà enregistrée, on garde la couverture existante
           — la régénérer demanderait de retélécharger le fichier. */
        let couverture = "";
        if (photos.length) {
          couverture = photos[0].fichier
            ? await Stockage.deposerImage(photos[0].fichier, Stockage.VITRINE, "couvertures",
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
          categorie: UI.$("#prod-categorie").value.trim() || "Autres",
          prix,
          prix_visible: UI.$("#prod-prix-visible").checked,
          en_avant: UI.$("#prod-avant").checked,
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
        UI.toast(produit ? "Réalisation mise à jour" : "Réalisation publiée", "ok");
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
          titre: "Retirer la réalisation",
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
        UI.toast("Réalisation retirée", "ok");
        location.hash = "#/produits";
      };
    }
  }

  return { liste, formulaire };
})();
