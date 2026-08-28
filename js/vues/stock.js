/* =========================================================
   Gestion de stock — approvisionnement, inventaire, sortie.

   Réservée à la formule Vitrine : c'est elle qui porte les
   produits et la vente au comptoir.

   Aucune de ces vues n'écrit la colonne « stock ». Elles appellent les
   fonctions de supabase/stock.sql, qui bougent le stock et écrivent le
   journal dans la même transaction. Une variation sans trace serait une
   variation sans explication.
   ========================================================= */
const VueStock = (() => {
  const e = Utils.echapper;

  const parNom = (a, b) => Utils.sansAccent(a.nom).localeCompare(Utils.sansAccent(b.nom), "fr");

  const lireProduits = async () =>
    (await Api.listerPar("produits", "atelier_id", Api.atelierId())).sort(parNom);

  /* ---------- Le menu ---------- */

  async function menu(vue) {
    const [produits, mouvements] = await Promise.all([
      lireProduits(),
      Store.listerMouvements(15).catch(() => []),
    ]);
    const total = produits.reduce((s, p) => s + (Number(p.stock) || 0), 0);
    const ruptures = produits.filter((p) => (Number(p.stock) || 0) === 0);
    const parId = new Map(produits.map((p) => [p.id, p]));

    UI.entete({
      titre: "Gestion de stock",
      sous: produits.length + " référence" + (produits.length > 1 ? "s" : "") +
        " · " + total + " article" + (total > 1 ? "s" : ""),
      retour: true,
    });

    const entree = (href, icone, titre, sous) =>
      '<button type="button" class="carte" style="width:100%;text-align:left;display:flex;' +
          'align-items:center;gap:12px;border:0;font:inherit;cursor:pointer" data-nav="' + href + '">' +
        '<span class="pastille">' + UI.icone(icone, "ic-sm") + "</span>" +
        '<span style="flex:1;min-width:0">' +
          '<span class="ligne-titre">' + titre + "</span>" +
          '<span class="ligne-sous">' + sous + "</span>" +
        "</span>" + UI.icone("retour", "ic-sm") +
      "</button>";

    vue.innerHTML =
      (ruptures.length
        ? '<div class="alerte">' + UI.icone("alerte") +
            "<div><strong>" + ruptures.length + " référence" + (ruptures.length > 1 ? "s" : "") +
            " à zéro.</strong> " +
            e(ruptures.slice(0, 3).map((p) => p.nom).join(", ")) +
            (ruptures.length > 3 ? "…" : "") + "</div></div>"
        : "") +

      /* Chaque opération a son droit : un modérateur ne voit que ce que
         son administrateur lui a coché. */
      (Api.aDroit("stock_approvisionner")
        ? entree("#/stock/entree", "televerser", "Approvisionner",
            "Ajouter des articles au stock existant") : "") +
      (Api.aDroit("stock_sortie")
        ? entree("#/stock/sortie", "telecharger", "Sortie de produit",
            "Casse, perte, cadeau, article repris") : "") +
      (Api.aDroit("stock_inventaire")
        ? entree("#/stock/inventaire", "check", "Inventaire",
            "Compter les rayons et corriger les écarts") : "") +

      '<div class="carte" style="margin-top:14px">' +
        '<div class="carte-titre">' + UI.icone("horloge", "ic-sm") + "Derniers mouvements</div>" +
        (mouvements.length
          ? '<div class="mini-liste">' +
              mouvements.map((m) => {
                const p = parId.get(m.produit_id);
                const signe = m.quantite > 0 ? "+" : "";
                return '<div class="mini"><span class="l"><strong>' +
                    e(p ? p.nom : "Produit retiré") + "</strong>" +
                    '<br><span style="color:var(--encre-tres-douce);font-size:12px">' +
                      e(Store.libelleMouvement(m.type)) +
                      (m.motif ? " · " + e(m.motif) : "") +
                      (m.reference ? " · " + e(m.reference) : "") +
                      " · " + e(Utils.fmtDateHeure(m.cree_le)) +
                    "</span></span>" +
                    '<span class="v" style="color:' +
                      (m.quantite > 0 ? "var(--vert)" : "var(--rouge)") + '">' +
                      signe + m.quantite + "</span>" +
                  "</div>";
              }).join("") +
            "</div>"
          : '<p class="aide" style="margin:0">Aucun mouvement pour le moment. ' +
              "Le journal se remplit dès le premier approvisionnement.</p>") +
      "</div>";
  }

  /* ---------- Approvisionnement et sortie ----------
     Même écran, deux sens. Les séparer aurait doublé le code pour une
     différence qui tient dans un signe et un mot. */

  async function mouvement(vue, sens) {
    const entree = sens === "entree";
    const produits = await lireProduits();

    UI.entete({
      titre: entree ? "Approvisionner" : "Sortie de produit",
      sous: entree ? "Ajouter au stock" : "Retirer du stock",
      retour: true,
    });

    if (!produits.length) {
      vue.innerHTML = UI.vide("boutique", "Aucun produit",
        "Publiez d'abord un produit dans votre vitrine.",
        '<a class="btn" href="#/produits">' + UI.icone("boutique", "ic-sm") + "Aller à la vitrine</a>");
      return;
    }

    let choisi = null;

    vue.innerHTML =
      '<div class="carte">' +
        '<div class="carte-titre">' + UI.icone("boutique", "ic-sm") + "Produit</div>" +
        '<div class="recherche" style="margin-bottom:10px">' + UI.icone("recherche") +
          '<input id="q-stock" type="search" placeholder="Nom ou code…" autocomplete="off">' +
        "</div>" +
        '<div class="mini-liste" id="liste-stock"></div>' +
      "</div>" +

      '<form id="form-mouvement">' +
        '<div class="carte">' +
          '<div class="carte-titre">' + UI.icone("argent", "ic-sm") +
            (entree ? "Quantité reçue" : "Quantité sortie") + "</div>" +
          '<div class="champ"><label for="mv-quantite">Combien ' +
            '<span class="obligatoire">*</span></label>' +
            '<input id="mv-quantite" inputmode="numeric" autocomplete="off" value="1">' +
            '<div class="aide" id="mv-apercu"></div></div>' +
          '<div class="champ"><label for="mv-motif">Motif' +
            (entree ? "" : ' <span class="obligatoire">*</span>') + "</label>" +
            '<input id="mv-motif" autocomplete="off" placeholder="' +
              (entree ? "Ex. : livraison fournisseur, retour d\'atelier"
                      : "Ex. : casse, perte, cadeau, repris pour retouche") + '">' +
            '<div class="aide">' +
              (entree
                ? "Facultatif, mais utile pour se souvenir d'où viennent les articles."
                : "Obligatoire : c'est la seule chose qui rendra l'écart compréhensible " +
                  "dans six mois.") + "</div></div>" +
        "</div>" +
        '<div style="margin-top:16px"><button type="submit" class="btn btn-bloc" id="mv-valider" disabled>' +
          UI.icone("check", "ic-sm") +
          (entree ? "Ajouter au stock" : "Sortir du stock") + "</button></div>" +
      "</form>";

    function rendreListe() {
      const t = Utils.sansAccent(UI.$("#q-stock").value).trim();
      const visibles = t
        ? produits.filter((p) =>
            Utils.sansAccent(p.nom + " " + (p.code || "")).includes(t))
        : produits;
      UI.$("#liste-stock").innerHTML = visibles.length
        ? visibles.map((p) =>
            '<button type="button" class="mini" style="width:100%;text-align:left;border:0;' +
                'background:' + (choisi === p.id ? "var(--indigo-50)" : "transparent") +
                ';border-radius:10px;padding:8px" data-produit="' + p.id + '">' +
              '<span class="l"><strong>' + e(p.nom) + "</strong>" +
                (p.code ? " · " + e(p.code) : "") + "</span>" +
              '<span class="v">' + (Number(p.stock) || 0) + " en stock</span>" +
            "</button>"
          ).join("")
        : '<p class="aide" style="margin:0">Aucun produit ne correspond.</p>';
    }
    rendreListe();

    function majApercu() {
      const p = produits.find((x) => x.id === choisi);
      const bouton = UI.$("#mv-valider");
      if (!p) {
        UI.$("#mv-apercu").textContent = "Choisissez d'abord un produit.";
        bouton.disabled = true;
        return;
      }
      const q = Math.max(0, Math.round(Utils.lireNombre(UI.$("#mv-quantite").value)));
      const stock = Number(p.stock) || 0;
      const apres = entree ? stock + q : stock - q;
      if (q < 1) {
        UI.$("#mv-apercu").textContent = "Indiquez une quantité d'au moins 1.";
        bouton.disabled = true;
        return;
      }
      if (apres < 0) {
        UI.$("#mv-apercu").textContent =
          "Stock insuffisant : il ne reste que " + stock + " article" + (stock > 1 ? "s" : "") + ".";
        bouton.disabled = true;
        return;
      }
      UI.$("#mv-apercu").textContent =
        e(p.nom) + " : " + stock + " → " + apres + " article" + (apres > 1 ? "s" : "");
      bouton.disabled = false;
    }
    majApercu();

    UI.$("#liste-stock").addEventListener("click", (ev) => {
      const bouton = ev.target.closest("[data-produit]");
      if (!bouton) return;
      choisi = bouton.dataset.produit;
      rendreListe();
      majApercu();
    });
    UI.$("#q-stock").addEventListener("input", Utils.tempo(() => { rendreListe(); }, 160));
    UI.$("#mv-quantite").addEventListener("input", majApercu);

    UI.$("#form-mouvement").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const quantite = Math.max(0, Math.round(Utils.lireNombre(UI.$("#mv-quantite").value)));
      const motif = UI.$("#mv-motif").value.trim();
      if (!entree && !motif) {
        UI.toast("Indiquez le motif de la sortie", "erreur");
        UI.$("#mv-motif").focus();
        return;
      }
      const bouton = UI.$("#mv-valider");
      bouton.disabled = true;
      try {
        const apres = entree
          ? await Api.approvisionnerStock(choisi, quantite, motif)
          : await Api.sortirStock(choisi, quantite, motif);
        UI.toast((entree ? "Stock approvisionné : " : "Sortie enregistrée : ") +
          apres.nom + " → " + apres.stock, "ok");
        location.hash = "#/stock";
      } catch (err) {
        UI.toast(err.message || "Opération impossible", "erreur");
        bouton.disabled = false;
      }
    });
  }

  /* ---------- Inventaire ----------
     On saisit CE QU'ON A COMPTÉ, pas l'écart : moins d'arithmétique
     mentale devant l'étagère, et pas d'erreur de signe. Le serveur
     calcule la différence et n'inscrit au journal que les écarts. */

  async function inventaire(vue) {
    const produits = await lireProduits();

    UI.entete({
      titre: "Inventaire",
      sous: produits.length + " référence" + (produits.length > 1 ? "s" : "") + " à compter",
      retour: true,
    });

    if (!produits.length) {
      vue.innerHTML = UI.vide("boutique", "Aucun produit",
        "Publiez d'abord un produit dans votre vitrine.",
        '<a class="btn" href="#/produits">' + UI.icone("boutique", "ic-sm") + "Aller à la vitrine</a>");
      return;
    }

    vue.innerHTML =
      '<div class="carte carte-accroche">' +
        '<p style="margin:0;font-size:13.5px;line-height:1.6">' +
          "Comptez vos rayons et saisissez ce que vous trouvez. " +
          "<strong>Les lignes justes ne laissent aucune trace</strong> — " +
          "seuls les écarts sont consignés." +
        "</p>" +
      "</div>" +

      '<form id="form-inventaire">' +
        '<div class="carte">' +
          '<div class="carte-titre">' + UI.icone("check", "ic-sm") + "Comptage</div>" +
          '<div class="inventaire">' +
            '<div class="inv-tete"><span>Produit</span><span>Théorique</span><span>Compté</span></div>' +
            produits.map((p) =>
              '<div class="inv-ligne" data-ligne="' + p.id + '">' +
                '<span class="inv-nom"><strong>' + e(p.nom) + "</strong>" +
                  (p.code ? '<br><span style="color:var(--encre-tres-douce);font-size:12px">' +
                    e(p.code) + "</span>" : "") + "</span>" +
                '<span class="inv-theorique">' + (Number(p.stock) || 0) + "</span>" +
                '<input class="inv-compte" inputmode="numeric" data-compte="' + p.id + '" ' +
                  'value="' + (Number(p.stock) || 0) + '" aria-label="Compté pour ' + e(p.nom) + '">' +
              "</div>"
            ).join("") +
          "</div>" +
          '<div class="aide" id="inv-resume" style="margin-top:12px"></div>' +
        "</div>" +
        '<div style="margin-top:16px"><button type="submit" class="btn btn-bloc" id="inv-valider">' +
          UI.icone("check", "ic-sm") + "Valider l'inventaire</button></div>" +
      "</form>";

    const ecarts = () => produits
      .map((p) => {
        const champ = UI.$('[data-compte="' + p.id + '"]');
        const compte = Math.max(0, Math.round(Utils.lireNombre(champ.value)));
        return { produit: p, compte, ecart: compte - (Number(p.stock) || 0) };
      })
      .filter((l) => l.ecart !== 0);

    function majResume() {
      const liste = ecarts();
      for (const p of produits) {
        const ligne = UI.$('[data-ligne="' + p.id + '"]');
        const trouve = liste.find((l) => l.produit.id === p.id);
        ligne.classList.toggle("ecart", !!trouve);
      }
      UI.$("#inv-resume").textContent = liste.length
        ? liste.length + " écart" + (liste.length > 1 ? "s" : "") + " à corriger : " +
          liste.map((l) => l.produit.nom + " " + (l.ecart > 0 ? "+" : "") + l.ecart).join(", ")
        : "Aucun écart : rien ne sera écrit au journal.";
    }
    majResume();

    for (const champ of document.querySelectorAll("[data-compte]")) {
      champ.addEventListener("input", Utils.tempo(majResume, 200));
    }

    UI.$("#form-inventaire").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const liste = ecarts();
      if (!liste.length) {
        UI.toast("Aucun écart à corriger", "ok");
        location.hash = "#/stock";
        return;
      }
      const ok = await UI.confirmer({
        titre: "Valider l'inventaire",
        texte: liste.length + " écart" + (liste.length > 1 ? "s" : "") + " " +
          (liste.length > 1 ? "seront corrigés" : "sera corrigé") +
          " et " + (liste.length > 1 ? "consignés" : "consigné") + " au journal. " +
          "Le stock deviendra celui que vous avez compté.",
        bouton: "Valider",
      });
      if (!ok) return;

      const bouton = UI.$("#inv-valider");
      bouton.disabled = true;
      try {
        const bilan = await Api.inventorierStock(liste.map((l) => ({
          produit_id: l.produit.id, compte: l.compte, motif: "Inventaire",
        })));
        UI.toast(bilan.corriges + " référence" + (bilan.corriges > 1 ? "s" : "") +
          " corrigée" + (bilan.corriges > 1 ? "s" : "") +
          " (" + (bilan.ecart > 0 ? "+" : "") + bilan.ecart + ")", "ok");
        location.hash = "#/stock";
      } catch (err) {
        UI.toast(err.message || "Inventaire impossible", "erreur");
        bouton.disabled = false;
      }
    });
  }

  return {
    menu,
    entree: (vue) => mouvement(vue, "entree"),
    sortie: (vue) => mouvement(vue, "sortie"),
    inventaire,
  };
})();
