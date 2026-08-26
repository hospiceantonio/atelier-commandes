/* =========================================================
   Vue Recettes & Dépenses — statistiques par période :
   aujourd'hui / semaine / mois / année / période libre,
   graphique des encaissements, gestion des dépenses,
   bénéfice, journal des versements.
   ========================================================= */
const VueStats = (() => {
  const e = Utils.echapper;

  const PERIODES = [
    { id: "jour", label: "Aujourd'hui" },
    { id: "semaine", label: "7 jours" },
    { id: "mois", label: "Ce mois" },
    { id: "annee", label: "Cette année" },
    { id: "libre", label: "Choisir…" },
  ];

  let periodeActive = "mois";
  let libre = { debut: null, fin: null };

  function bornes(id) {
    const auj = Utils.aujourdhui();
    if (id === "jour") return { debut: auj, fin: auj };
    if (id === "semaine") return { debut: Utils.ajouterJours(auj, -6), fin: auj };
    if (id === "mois") return { debut: auj.slice(0, 8) + "01", fin: auj };
    if (id === "annee") return { debut: auj.slice(0, 5) + "01-01", fin: auj };
    return {
      debut: libre.debut || auj.slice(0, 8) + "01",
      fin: libre.fin || auj,
    };
  }

  function libellePeriode(id, b) {
    if (id === "jour") return Utils.fmtDate(b.debut);
    return "Du " + Utils.fmtDate(b.debut) + " au " + Utils.fmtDate(b.fin);
  }

  /** Propose l'impression directe ou l'export PDF, puis lance le document. */
  function choisirImpression(titre, lancer) {
    const corps = UI.ouvrirFeuille(titre,
      '<button type="button" class="ligne" data-sortie="imprimer">' +
        '<span class="pastille">' + UI.icone("telecharger", "ic-sm") + "</span>" +
        '<span class="ligne-corps"><span class="ligne-titre">Imprimer directement</span>' +
          '<span class="ligne-sous">Vers une imprimante connectée</span></span>' +
      "</button>" +
      '<button type="button" class="ligne" style="margin-top:10px" data-sortie="pdf">' +
        '<span class="pastille">' + UI.icone("commandes", "ic-sm") + "</span>" +
        '<span class="ligne-corps"><span class="ligne-titre">Exporter en PDF</span>' +
          '<span class="ligne-sous">Pour l\'envoyer ou l\'archiver</span></span>' +
      "</button>");

    corps.addEventListener("click", (ev) => {
      const choix = ev.target.closest("[data-sortie]");
      if (!choix) return;
      UI.feuilleSansRappel();
      UI.fermerFeuille();
      lancer();
      if (choix.dataset.sortie === "pdf") {
        UI.toast("Choisissez « Enregistrer au format PDF » comme destination", "ok");
      }
    });
  }

  async function afficher(vue) {
    UI.entete({ titre: "Recettes & Dépenses", sous: "Chaque versement compte le jour où il est reçu" });

    vue.innerHTML =
      '<div class="puces" id="puces-periode">' +
        PERIODES.map((p) =>
          '<button type="button" class="puce' + (p.id === periodeActive ? " actif" : "") + '" data-periode="' + p.id + '">' +
            e(p.label) + "</button>"
        ).join("") +
      "</div>" +
      '<div id="zone-libre" hidden><div class="carte"><div class="champ-duo" style="margin:0">' +
        '<div class="champ" style="margin:0"><label for="periode-debut">Du</label><input type="date" id="periode-debut"></div>' +
        '<div class="champ" style="margin:0"><label for="periode-fin">Au</label><input type="date" id="periode-fin"></div>' +
      "</div></div></div>" +
      '<div id="zone-stats"></div>';

    UI.$("#puces-periode").addEventListener("click", (ev) => {
      const bouton = ev.target.closest("[data-periode]");
      if (!bouton) return;
      periodeActive = bouton.dataset.periode;
      UI.$$("#puces-periode .puce").forEach((p) => p.classList.toggle("actif", p === bouton));
      UI.$("#zone-libre").hidden = periodeActive !== "libre";
      rendre();
    });

    const b0 = bornes("libre");
    UI.$("#periode-debut").value = b0.debut;
    UI.$("#periode-fin").value = b0.fin;
    for (const idChamp of ["periode-debut", "periode-fin"]) {
      UI.$("#" + idChamp).addEventListener("change", () => {
        libre.debut = UI.$("#periode-debut").value || libre.debut;
        libre.fin = UI.$("#periode-fin").value || libre.fin;
        if (libre.debut && libre.fin && libre.debut > libre.fin) {
          [libre.debut, libre.fin] = [libre.fin, libre.debut];
          UI.$("#periode-debut").value = libre.debut;
          UI.$("#periode-fin").value = libre.fin;
        }
        rendre();
      });
    }

    UI.$("#zone-libre").hidden = periodeActive !== "libre";

    async function rendre() {
      const r = Store.lireReglages();
      const b = bornes(periodeActive);
      const stats = await Store.statsPeriode(b.debut, b.fin);
      const clients = await Store.listerClients();
      const parId = new Map(clients.map((c) => [c.id, c]));

      let html =
        '<div style="display:flex;align-items:center;gap:10px;margin:2px 0 0">' +
          '<p style="margin:0;flex:1;font-size:12.5px;color:var(--encre-tres-douce)">' +
            e(libellePeriode(periodeActive, b)) + "</p>" +
          '<button type="button" class="btn btn-clair btn-sm" id="btn-point">' +
            UI.icone("telecharger", "ic-sm") + "Récap A4</button>" +
        "</div>" +

        '<div class="tuiles">' +
          '<div class="tuile tuile-vert"><div class="tuile-label">' + UI.icone("argent", "ic-sm") + 'Recettes</div>' +
            '<div class="tuile-valeur">' + Utils.fmtMontant(stats.recettes, r.devise) + "</div>" +
            '<div class="tuile-note">' + stats.nbPaiements + " versement" + (stats.nbPaiements > 1 ? "s" : "") + "</div></div>" +
          '<div class="tuile tuile-rouge"><div class="tuile-label">' + UI.icone("telecharger", "ic-sm") + 'Dépenses</div>' +
            '<div class="tuile-valeur">' + Utils.fmtMontant(stats.totalDepenses, r.devise) + "</div>" +
            '<div class="tuile-note">' + stats.depenses.length + " dépense" + (stats.depenses.length > 1 ? "s" : "") + "</div></div>" +
          '<div class="tuile ' + (stats.benefice >= 0 ? "tuile-vert" : "tuile-rouge") + '"><div class="tuile-label">' +
            UI.icone("stats", "ic-sm") + 'Bénéfice</div>' +
            '<div class="tuile-valeur">' + Utils.fmtMontant(stats.benefice, r.devise) + "</div>" +
            '<div class="tuile-note">recettes − dépenses</div></div>' +
          '<div class="tuile"><div class="tuile-label">' + UI.icone("commandes", "ic-sm") + 'Commandes créées</div>' +
            '<div class="tuile-valeur">' + stats.commandesCreees + "</div>" +
            '<div class="tuile-note">' + Utils.fmtMontant(stats.montantCommandes, r.devise) + " au total</div></div>" +
          '<div class="tuile"><div class="tuile-label">' + UI.icone("check", "ic-sm") + 'Livrées</div>' +
            '<div class="tuile-valeur">' + stats.commandesLivrees + "</div>" +
            '<div class="tuile-note">sur la période</div></div>' +
          '<div class="tuile"><div class="tuile-label">' + UI.icone("boutique", "ic-sm") + 'Ventes boutique</div>' +
            '<div class="tuile-valeur">' + Utils.fmtMontant(stats.totalVentes, r.devise) + "</div>" +
            '<div class="tuile-note">' + stats.ventes.length + " facture" + (stats.ventes.length > 1 ? "s" : "") +
              " · " + stats.articlesVendus + " article" + (stats.articlesVendus > 1 ? "s" : "") + "</div></div>" +
          '<div class="tuile tuile-rouge"><div class="tuile-label">' + UI.icone("horloge", "ic-sm") + 'Reste à encaisser</div>' +
            '<div class="tuile-valeur">' + Utils.fmtMontant(stats.soldesOuverts, r.devise) + "</div>" +
            '<div class="tuile-note">commandes non soldées</div></div>' +
        "</div>";

      html +=
        '<div class="carte"><div class="carte-titre">' + UI.icone("stats", "ic-sm") + "Encaissements par " +
          (Utils.ecartJours(b.debut, b.fin) > 62 ? "mois" : "jour") + "</div>" +
          graphique(b, stats) +
        "</div>";

      /* Dépenses de la période */
      html +=
        '<div class="section-titre">' + UI.icone("telecharger", "ic-sm") + "Dépenses (" + stats.depenses.length + ")" +
          '<a class="lien" id="ajouter-depense" style="cursor:pointer">+ Dépense</a></div>';
      if (stats.depenses.length) {
        html += '<div class="carte"><div class="mini-liste">' +
          stats.depenses.map((d) =>
            '<div class="mini">' +
              '<span class="l"><strong>' + e(d.libelle) + "</strong>" +
                (d.note ? " · " + e(d.note) : "") +
                '<br><span style="color:var(--encre-tres-douce);font-size:12px">' + Utils.fmtDate(d.dateDepense) + "</span></span>" +
              '<span class="v" style="color:var(--rouge)">−' + Utils.fmtMontant(d.montant, r.devise) + "</span>" +
              '<button type="button" class="btn-ic" style="width:30px;height:30px;background:var(--rouge-clair);color:var(--rouge)" data-suppr-depense="' + d.id + '" aria-label="Supprimer la dépense">' +
                UI.icone("poubelle", "ic-sm") + "</button>" +
            "</div>"
          ).join("") +
        "</div></div>";
      } else {
        html += '<div class="carte"><p style="margin:0;font-size:13px;color:var(--encre-tres-douce)">' +
          "Aucune dépense sur la période. Enregistrez ici les achats de fournitures, loyer, salaires…</p></div>";
      }

      /* Journal des versements */
      html += '<div class="section-titre">' + UI.icone("argent", "ic-sm") + "Journal des versements" +
        (stats.paiements.length
          ? '<a class="lien" id="btn-journal" style="cursor:pointer">Imprimer A4</a>'
          : "") + "</div>";
      if (stats.paiements.length) {
        html += '<div class="carte"><div class="mini-liste">' +
          stats.paiements.slice(0, 60).map((p) => {
            /* Une entrée provient soit d'une commande, soit d'une vente boutique. */
            const titre = p.vente
              ? (p.vente.client || "Client au comptoir")
              : Utils.nomComplet(parId.get(p.commande.clientId));
            const reference = p.vente ? p.vente.numero : p.commande.numero;
            return (
              '<div class="mini">' +
                '<span class="l"><strong>' + e(titre) + "</strong> · " + e(reference) +
                  '<br><span style="color:var(--encre-tres-douce);font-size:12px">' + e(p.note || "Versement") + " — " + Utils.fmtDateHeure(p.date) + "</span></span>" +
                '<span class="v" style="color:var(--vert)">+' + Utils.fmtMontant(p.montant, r.devise) + "</span>" +
              "</div>"
            );
          }).join("") +
          (stats.paiements.length > 60
            ? '<p style="margin:6px 0 0;font-size:12px;color:var(--encre-tres-douce);text-align:center">' +
              (stats.paiements.length - 60) + " versements plus anciens non affichés — " +
              "la version A4 les contient tous.</p>"
            : "") +
        "</div></div>";
      } else {
        html += UI.vide("argent", "Aucun encaissement sur la période",
          "Les acomptes et versements apparaîtront ici.");
      }

      UI.$("#zone-stats").innerHTML = html;

      /* Ajout d'une dépense */
      UI.$("#btn-point").onclick = () => {
        choisirImpression("Récapitulatif — " + libellePeriode(periodeActive, b),
          () => Store.imprimerRapport(stats, b, libellePeriode(periodeActive, b)));
      };

      const boutonJournal = UI.$("#btn-journal");
      if (boutonJournal) {
        boutonJournal.onclick = () => {
          const nomParClient = {};
          for (const [id, c] of parId) nomParClient[id] = Utils.nomComplet(c);
          choisirImpression("Journal des versements — " + libellePeriode(periodeActive, b),
            () => Store.imprimerJournal(stats, libellePeriode(periodeActive, b), nomParClient));
        };
      }

      UI.$("#ajouter-depense").onclick = () => {
        const corps = UI.ouvrirFeuille("Nouvelle dépense",
          '<div class="carte">' +
            '<div class="champ"><label for="dep-libelle">Libellé <span class="obligatoire">*</span></label>' +
              '<input id="dep-libelle" autocomplete="off" placeholder="Ex. : tissu doublure, fil, loyer…"></div>' +
            UI.champMontant({ id: "dep-montant", label: "Montant", obligatoire: true }) +
            '<div class="champ"><label for="dep-date">Date</label>' +
              '<input id="dep-date" type="date" value="' + Utils.aujourdhui() + '"></div>' +
            '<div class="champ"><label for="dep-note">Note (facultatif)</label>' +
              '<input id="dep-note" autocomplete="off"></div>' +
            '<button type="button" class="btn btn-bloc" id="dep-ok">' + UI.icone("check", "ic-sm") + "Enregistrer la dépense</button>" +
          "</div>");
        UI.$("#dep-libelle", corps).focus();
        UI.$("#dep-ok", corps).onclick = async () => {
          try {
            await Store.ajouterDepense({
              libelle: UI.$("#dep-libelle", corps).value,
              montant: UI.$("#dep-montant", corps).value,
              dateDepense: UI.$("#dep-date", corps).value,
              note: UI.$("#dep-note", corps).value,
            });
            UI.fermerFeuille();
            UI.toast("Dépense enregistrée", "ok");
            rendre();
          } catch (err) {
            UI.toast(err.message || "Enregistrement impossible", "erreur");
          }
        };
      };

      /* Suppression d'une dépense */
      for (const bouton of UI.$$("[data-suppr-depense]", vue)) {
        bouton.onclick = async () => {
          const ok = await UI.confirmer({
            titre: "Supprimer la dépense",
            texte: "Cette dépense sera retirée des statistiques.",
            bouton: "Supprimer", danger: true,
          });
          if (!ok) return;
          await Store.supprimerDepense(bouton.dataset.supprDepense);
          rendre();
        };
      }
    }

    rendre();
  }

  /* ---------- Graphique en barres (SVG, sans dépendance) ---------- */

  function graphique(b, stats) {
    const nbJours = Utils.ecartJours(b.debut, b.fin) + 1;
    const parMois = nbJours > 62;

    const seaux = [];
    if (parMois) {
      const table = {};
      for (const [jour, montant] of Object.entries(stats.parJour)) {
        const cle = jour.slice(0, 7);
        table[cle] = (table[cle] || 0) + montant;
      }
      let d = Utils.versDate(b.debut.slice(0, 8) + "01");
      const fin = Utils.versDate(b.fin);
      while (d <= fin) {
        const cle = d.getFullYear() + "-" + Utils.pad(d.getMonth() + 1);
        seaux.push({ label: Utils.MOIS_COURT[d.getMonth()], montant: table[cle] || 0 });
        d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      }
    } else {
      for (let i = 0; i < nbJours; i++) {
        const jour = Utils.ajouterJours(b.debut, i);
        const dte = Utils.versDate(jour);
        seaux.push({
          label: nbJours <= 7 ? ["D", "L", "M", "M", "J", "V", "S"][dte.getDay()] + " " + dte.getDate() : String(dte.getDate()),
          montant: stats.parJour[jour] || 0,
        });
      }
    }

    if (!seaux.length || seaux.every((s) => !s.montant)) {
      return '<p style="margin:0;font-size:13px;color:var(--encre-tres-douce)">Rien à tracer pour l\'instant.</p>';
    }

    const L = 320, H = 150, basY = 128;
    const max = Math.max(...seaux.map((s) => s.montant));
    const pas = L / seaux.length;
    const largeurBarre = Math.min(26, Math.max(3, pas - 4));
    const montrerLabels = seaux.length <= 16;
    const pasLabel = montrerLabels ? 1 : Math.ceil(seaux.length / 8);

    let barres = "";
    seaux.forEach((seau, i) => {
      const h = seau.montant ? Math.max(3, (seau.montant / max) * (basY - 26)) : 2;
      const x = i * pas + (pas - largeurBarre) / 2;
      const y = basY - h;
      barres +=
        '<rect class="barre' + (seau.montant ? "" : " barre-vide") + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) +
          '" width="' + largeurBarre.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="2.5"></rect>';
      if (seau.montant && seau.montant === max) {
        barres += '<text class="val" x="' + (x + largeurBarre / 2).toFixed(1) + '" y="' + (y - 5).toFixed(1) +
          '" text-anchor="middle">' + Utils.fmtNombre(seau.montant) + "</text>";
      }
      if (i % pasLabel === 0) {
        barres += '<text x="' + (x + largeurBarre / 2).toFixed(1) + '" y="' + (basY + 13) +
          '" text-anchor="middle">' + e(seau.label) + "</text>";
      }
    });

    return (
      '<svg class="graph" viewBox="0 0 ' + L + " " + H + '" preserveAspectRatio="none" role="img" aria-label="Encaissements sur la période">' +
        '<line class="axe" x1="0" y1="' + basY + '" x2="' + L + '" y2="' + basY + '"></line>' +
        barres +
      "</svg>"
    );
  }

  return { afficher };
})();
