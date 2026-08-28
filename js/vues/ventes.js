/* =========================================================
   Vues Ventes — factures de vente directe sur les articles
   en stock. Chaque facture retire les articles vendus du
   stock (opération atomique côté serveur) et son encaissement
   entre dans les recettes.
   ========================================================= */
const VueVentes = (() => {
  const e = Utils.echapper;

  /* ---------- Nouvelle facture ---------- */

  async function nouvelle(vue) {
    const produits = (await Api.listerPar("produits", "atelier_id", Api.atelierId(), "nom", true))
      .filter((p) => p.stock > 0);
    const devise = Store.lireReglages().devise;
    const panier = new Map(); // produit_id -> quantité

    UI.entete({ titre: "Nouvelle vente", sous: "Facture sur les articles en stock", retour: true });

    if (!produits.length) {
      vue.innerHTML = UI.vide("boutique", "Aucun article en stock",
        "Ajoutez du stock à vos réalisations depuis l'onglet Vitrine pour pouvoir les vendre.",
        '<a class="btn" href="#/produits">' + UI.icone("boutique", "ic-sm") + "Aller à la vitrine</a>");
      return;
    }

    vue.innerHTML =
      '<div class="carte">' +
        '<div class="carte-titre">' + UI.icone("boutique", "ic-sm") + "Articles vendus</div>" +
        '<div class="mini-liste" id="liste-articles">' +
          produits.map((p) =>
            '<div class="mini" style="align-items:center">' +
              '<span class="l"><strong>' + e(p.nom) + "</strong>" +
                (p.code ? " · " + e(p.code) : "") +
                '<br><span style="color:var(--encre-tres-douce);font-size:12px">' +
                  Utils.fmtMontant(p.prix, devise) + " · " + p.stock + " en stock</span></span>" +
              '<span class="v" style="display:flex;align-items:center;gap:8px">' +
                '<button type="button" class="btn-ic btn-sm" data-moins="' + p.id + '" aria-label="Retirer">−</button>' +
                '<span data-qte="' + p.id + '" style="min-width:18px;text-align:center;font-weight:750">0</span>' +
                '<button type="button" class="btn-ic btn-sm" data-plus="' + p.id + '" aria-label="Ajouter">+</button>' +
              "</span>" +
            "</div>"
          ).join("") +
        "</div>" +
      "</div>" +

      '<div class="carte">' +
        '<div class="carte-titre">' + UI.icone("clients", "ic-sm") + "Client et paiement</div>" +
        '<div class="champ"><label for="vte-client">Nom du client (facultatif)</label>' +
          '<input id="vte-client" autocomplete="off" autocapitalize="words" placeholder="Client au comptoir"></div>' +
        '<div class="champ"><label for="vte-whatsapp">N° WhatsApp du client (facultatif)</label>' +
          '<input id="vte-whatsapp" type="tel" inputmode="tel" autocomplete="off" placeholder="97 00 00 00"></div>' +
        '<label class="interrupteur" style="display:flex">' +
          '<input type="checkbox" id="vte-envoyer" checked>' +
          "<span>Envoyer la facture au client par <strong>WhatsApp</strong> après l'enregistrement</span>" +
        "</label>" +
        '<div class="paires">' +
          '<div class="paire"><span class="l">Total de la vente</span>' +
            '<span class="v gros" id="vte-total">' + Utils.fmtMontant(0, devise) + "</span></div>" +
        "</div>" +
        UI.champMontant({ id: "vte-paye", label: "Montant encaissé", valeur: "",
          aide: "Laissez vide pour encaisser la totalité." }) +
        '<div class="champ"><label for="vte-note">Note (facultatif)</label>' +
          '<input id="vte-note" autocomplete="off"></div>' +
      "</div>" +

      '<button type="button" class="btn btn-bloc" id="vte-enregistrer">' +
        UI.icone("check", "ic-sm") + "Enregistrer la vente</button>";

    const parId = new Map(produits.map((p) => [p.id, p]));

    function total() {
      let somme = 0;
      for (const [id, q] of panier) somme += (parId.get(id).prix || 0) * q;
      return somme;
    }

    function rafraichir() {
      for (const p of produits) {
        UI.$('[data-qte="' + p.id + '"]').textContent = String(panier.get(p.id) || 0);
      }
      UI.$("#vte-total").textContent = Utils.fmtMontant(total(), devise);
    }

    UI.$("#liste-articles").addEventListener("click", (ev) => {
      const plus = ev.target.closest("[data-plus]");
      const moins = ev.target.closest("[data-moins]");
      if (plus) {
        const p = parId.get(plus.dataset.plus);
        const q = (panier.get(p.id) || 0) + 1;
        if (q > p.stock) { UI.toast("Stock disponible : " + p.stock, "erreur"); return; }
        panier.set(p.id, q);
      } else if (moins) {
        const id = moins.dataset.moins;
        const q = (panier.get(id) || 0) - 1;
        if (q > 0) panier.set(id, q); else panier.delete(id);
      } else return;
      rafraichir();
    });

    UI.$("#vte-enregistrer").onclick = async () => {
      if (!panier.size) { UI.toast("Ajoutez au moins un article", "erreur"); return; }
      const bouton = UI.$("#vte-enregistrer");
      bouton.disabled = true;
      try {
        const saisiePaye = UI.$("#vte-paye").value.trim();
        const numeroWa = UI.$("#vte-whatsapp").value.trim();
        const vente = await Store.enregistrerVente({
          client: UI.$("#vte-client").value,
          clientWhatsApp: numeroWa,
          lignes: Array.from(panier, ([produitId, quantite]) => ({ produitId, quantite })),
          paye: saisiePaye === "" ? total() : Utils.lireNombre(saisiePaye),
          note: UI.$("#vte-note").value,
        });
        UI.toast("Vente " + vente.numero + " enregistrée", "ok");
        if (numeroWa && UI.$("#vte-envoyer").checked) {
          window.open(Store.lienWhatsAppVente(vente), "_blank");
        }
        location.hash = "#/vente/" + vente.id;
      } catch (err) {
        UI.toast(err.message || "Vente impossible", "erreur");
        bouton.disabled = false;
      }
    };
  }

  /* ---------- Liste des factures ---------- */

  async function liste(vue) {
    const ventes = await Store.listerVentes();
    const devise = Store.lireReglages().devise;

    UI.entete({
      titre: "Ventes",
      sous: ventes.length + " facture" + (ventes.length > 1 ? "s" : ""),
      retour: true,
      actions: '<a class="btn-ic" href="#/vente-nouvelle" aria-label="Nouvelle vente">' + UI.icone("plus") + "</a>",
    });

    if (!ventes.length) {
      vue.innerHTML = UI.vide("argent", "Aucune vente",
        "Vendez vos articles en stock : chaque facture retire les articles vendus et entre dans vos recettes.",
        '<a class="btn" href="#/vente-nouvelle">' + UI.icone("plus", "ic-sm") + "Nouvelle vente</a>");
      return;
    }

    vue.innerHTML =
      '<div class="liste">' +
      ventes.map((v) => {
        const solde = Math.max(0, v.total - v.paye);
        return (
          '<button type="button" class="ligne" data-nav="#/vente/' + v.id + '">' +
            '<span class="pastille">' + UI.icone("argent", "ic-sm") + "</span>" +
            '<span class="ligne-corps">' +
              '<span class="ligne-titre">' + e(v.client || "Client au comptoir") + "</span>" +
              '<span class="ligne-sous"><span>' + e(v.numero) + "</span><span>·</span><span>" +
                Store.articlesVendus(v) + " article" + (Store.articlesVendus(v) > 1 ? "s" : "") + "</span></span>" +
            "</span>" +
            '<span class="ligne-fin">' +
              (solde > 0
                ? '<span class="badge badge-retard">Reste ' + Utils.fmtMontant(solde, devise) + "</span>"
                : '<span class="badge badge-fait">Payée</span>') +
              '<span class="ligne-montant">' + Utils.fmtMontant(v.total, devise) + "</span>" +
            "</span>" +
          "</button>"
        );
      }).join("") +
      "</div>";
  }

  /* ---------- Détail d'une facture ---------- */

  async function detail(vue, id) {
    const vente = await Store.lireVente(id);
    if (!vente) { location.hash = "#/ventes"; return; }
    const r = Store.lireReglages();
    const solde = Math.max(0, vente.total - vente.paye);

    UI.entete({ titre: vente.numero, sous: Utils.fmtDateHeure(vente.creeLe), retour: true });

    vue.innerHTML =
      '<div class="carte">' +
        '<div class="carte-titre">' + UI.icone("boutique", "ic-sm") + "Articles</div>" +
        '<div class="mini-liste">' +
          vente.lignes.map((l) =>
            '<div class="mini"><span class="l"><strong>' + e(l.nom) + "</strong>" +
              (l.code ? " · " + e(l.code) : "") +
              '<br><span style="color:var(--encre-tres-douce);font-size:12px">' +
                l.quantite + " × " + Utils.fmtMontant(l.prix, r.devise) + "</span></span>" +
              '<span class="v">' + Utils.fmtMontant(l.prix * l.quantite, r.devise) + "</span></div>"
          ).join("") +
        "</div>" +
        '<div class="paires" style="margin-top:10px">' +
          '<div class="paire"><span class="l">Client</span><span class="v">' +
            e(vente.client || "Client au comptoir") + "</span></div>" +
          (vente.note ? '<div class="paire"><span class="l">Note</span><span class="v">' + e(vente.note) + "</span></div>" : "") +
          '<div class="paire"><span class="l">Total</span><span class="v gros">' +
            Utils.fmtMontant(vente.total, r.devise) + "</span></div>" +
          '<div class="paire"><span class="l">Encaissé</span><span class="v vert">' +
            Utils.fmtMontant(vente.paye, r.devise) + "</span></div>" +
          (solde > 0
            ? '<div class="paire"><span class="l">Reste à payer</span><span class="v rouge">' +
                Utils.fmtMontant(solde, r.devise) + "</span></div>"
            : "") +
        "</div>" +
      "</div>" +

      '<div class="btn-rangee" style="margin-top:12px">' +
        (vente.clientWhatsApp
          ? '<a class="btn btn-or" id="vte-whatsapp" target="_blank" rel="noopener" href="' +
              Store.lienWhatsAppVente(vente) + '">' + UI.icone("whatsapp", "ic-sm") + "Envoyer au client</a>"
          : "") +
        '<button type="button" class="btn btn-clair" id="vte-imprimer">' +
          UI.icone("telecharger", "ic-sm") + "Facture A4</button>" +
      "</div>" +

      (Api.aDroit("vente_supprimer")
        ? '<button type="button" class="btn btn-danger btn-bloc" id="vte-annuler" style="margin-top:12px">' +
            UI.icone("poubelle", "ic-sm") + "Annuler cette vente</button>" +
          '<p class="pied-note">Annuler une vente remet les articles en stock.</p>'
        : '<p class="pied-note">Vous n\'avez pas le droit d\'annuler une facture.</p>');

    UI.$("#vte-imprimer").onclick = () => {
      Store.imprimerFacture(vente);
      UI.toast("Facture A4 : choisissez « Enregistrer au format PDF »", "ok");
    };

    const boutonAnnuler = UI.$("#vte-annuler");
    if (!boutonAnnuler) return;
    boutonAnnuler.onclick = async () => {
      const ok = await UI.confirmer({
        titre: "Annuler la vente",
        texte: "La facture " + vente.numero + " sera supprimée et les articles vendus " +
          "reviendront en stock.",
        bouton: "Annuler la vente", danger: true,
      });
      if (!ok) return;
      try {
        await Store.supprimerVente(id);
        UI.toast("Vente annulée, stock rétabli", "ok");
        location.hash = "#/ventes";
      } catch (err) {
        UI.toast(err.message || "Annulation impossible", "erreur");
      }
    };
  }

  return { nouvelle, liste, detail };
})();
