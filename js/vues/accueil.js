/* =========================================================
   Vue Accueil — l'essentiel de la journée en un coup d'œil :
   recettes du mois, livraisons à venir, retards, raccourcis.
   ========================================================= */
const VueAccueil = (() => {
  const e = Utils.echapper;

  async function afficher(vue) {
    const r = Store.lireReglages();
    const aujourdhui = Utils.aujourdhui();
    const debutMois = aujourdhui.slice(0, 8) + "01";

    const [commandes, clients, stats] = await Promise.all([
      Store.listerCommandes(),
      Store.listerClients(),
      Store.statsPeriode(debutMois, aujourdhui),
    ]);
    const parId = new Map(clients.map((c) => [c.id, c]));

    const ouvertes = commandes.filter((c) => c.statut !== "livree");
    const enRetard = ouvertes.filter(Store.estEnRetard);
    const duJour = ouvertes.filter((c) => c.dateLivraison === aujourdhui && !Store.estEnRetard(c));
    const aVenir = ouvertes
      .filter((c) => Utils.ecartJours(aujourdhui, c.dateLivraison) > 0)
      .sort((a, b) => a.dateLivraison.localeCompare(b.dateLivraison))
      .slice(0, 5);
    const soldesOuverts = ouvertes.reduce((somme, c) => somme + Store.soldeRestant(c), 0);

    UI.entete({
      titre: r.nomAtelier,
      sous: r.slogan || Utils.fmtJourDate(aujourdhui),
      actions:
        (Api.estAdmin()
          ? '<a class="btn-ic" href="#/reglages" aria-label="Réglages">' + UI.icone("reglages") + "</a>"
          : ""),
    });

    let html =
      Store.bandeauAbonnement() +
      '<section class="heros">' +
        '<div class="heros-label">Recettes de ' + e(Utils.MOIS[new Date().getMonth()]) + "</div>" +
        '<div class="heros-valeur">' + Utils.fmtMontant(stats.recettes, r.devise) + "</div>" +
        '<div class="heros-pied">' +
          '<div><div class="v">' + ouvertes.length + '</div><div class="l">commande' + (ouvertes.length > 1 ? "s" : "") + " en cours</div></div>" +
          '<div><div class="v">' + Utils.fmtMontant(soldesOuverts, r.devise) + '</div><div class="l">à encaisser</div></div>' +
        "</div>" +
      "</section>";

    if (enRetard.length) {
      html +=
        '<section><div class="section-titre" style="color:var(--rouge)">' + UI.icone("alerte", "ic-sm") +
          "En retard (" + enRetard.length + ")</div>" +
        '<div class="liste">' +
          enRetard
            .slice()
            .sort((a, b) => a.dateLivraison.localeCompare(b.dateLivraison))
            .map((c) => UI.ligneCommande(c, parId.get(c.clientId)))
            .join("") +
        "</div></section>";
    }

    if (duJour.length) {
      html +=
        '<section><div class="section-titre">' + UI.icone("horloge", "ic-sm") +
          "À livrer aujourd'hui (" + duJour.length + ")</div>" +
        '<div class="liste">' + duJour.map((c) => UI.ligneCommande(c, parId.get(c.clientId))).join("") + "</div></section>";
    }

    html +=
      '<section><div class="section-titre">' + UI.icone("calendrier", "ic-sm") + "Prochaines livraisons" +
        '<a class="lien" href="#/commandes">Tout voir</a></div>';
    if (aVenir.length) {
      html += '<div class="liste">' + aVenir.map((c) => UI.ligneCommande(c, parId.get(c.clientId))).join("") + "</div>";
    } else {
      html += UI.vide(
        "commandes",
        ouvertes.length ? "Rien à livrer prochainement" : "Aucune commande en cours",
        "Créez une commande avec le bouton +",
        '<a class="btn" href="#/commande/nouvelle">' + UI.icone("plus", "ic-sm") + "Nouvelle commande</a>"
      );
    }
    html += "</section>";

    if (!clients.length) {
      html +=
        '<div class="alerte">' + UI.icone("clients") +
          "<div><strong>Bienvenue !</strong> Commencez par enregistrer vos clients avec leurs mesures : " +
          "elles seront gardées pour toutes leurs prochaines commandes.<br>" +
          '<a href="#/client/nouveau" style="font-weight:700;text-decoration:underline">Ajouter un premier client</a></div>' +
        "</div>";
    }

    vue.innerHTML = html;
  }

  return { afficher };
})();
