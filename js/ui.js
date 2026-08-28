/* =========================================================
   UI — briques d'interface communes : rendu, feuille modale,
   toasts, visionneuse, composants HTML réutilisés.
   ========================================================= */
const UI = (() => {

  const $ = (sel, base) => (base || document).querySelector(sel);
  const $$ = (sel, base) => Array.from((base || document).querySelectorAll(sel));
  const e = Utils.echapper;

  /* ---------- Barre supérieure ---------- */

  function entete({ titre, sous, retour, actions }) {
    const zone = $("#topbar");
    zone.innerHTML =
      '<div class="topbar-ligne">' +
        (retour
          ? '<button type="button" class="btn-ic" data-action="retour" aria-label="Retour">' + icone("retour") + "</button>"
          : "") +
        "<div style='flex:1;min-width:0'>" +
          "<h1>" + e(titre) + "</h1>" +
          (sous ? '<div class="sous">' + e(sous) + "</div>" : "") +
        "</div>" +
        '<div class="topbar-actions">' + (actions || "") + "</div>" +
      "</div>";
  }

  function icone(nom, classe) {
    return '<svg class="ic' + (classe ? " " + classe : "") + '" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-' + nom + '"/></svg>';
  }

  /* ---------- Toasts ---------- */

  function toast(message, type) {
    const zone = $("#toasts");
    zone.innerHTML = ""; // un seul toast à la fois : le dernier remplace le précédent
    const el = document.createElement("div");
    el.className = "toast" + (type ? " toast-" + type : "");
    el.textContent = message;
    zone.appendChild(el);
    setTimeout(() => {
      el.style.transition = "opacity .25s";
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 260);
    }, 2600);
  }

  /* ---------- Feuille modale ---------- */

  let feuilleAuFermer = null;

  /**
   * Ouvre le tiroir et rend le conteneur de son contenu.
   *
   * CE CONTENEUR EST NEUF À CHAQUE OUVERTURE. On se contentait avant de
   * remplacer le contenu de #feuille-corps, qui restait le même élément :
   * un écouteur posé dessus survivait donc à la fermeture et s'ajoutait à
   * celui de la feuille suivante. Au deuxième passage, le même geste
   * était traité DEUX FOIS — et un choix qui s'active puis se désactive
   * ne laisse aucune trace, ce qui rend le défaut très difficile à voir.
   * On remplace donc le nœud : ses écouteurs partent avec lui.
   */
  function ouvrirFeuille(titre, html, auFermer) {
    const feuille = $("#feuille");
    $("#feuille-titre").textContent = titre;
    const ancien = $("#feuille-corps");
    const corps = ancien.cloneNode(false);   // mêmes attributs, aucun écouteur
    corps.innerHTML = html;
    ancien.replaceWith(corps);
    feuille.hidden = false;
    document.body.style.overflow = "hidden";
    feuilleAuFermer = auFermer || null;
    return corps;
  }

  function fermerFeuille() {
    const feuille = $("#feuille");
    if (feuille.hidden) return;
    feuille.hidden = true;
    $("#feuille-corps").innerHTML = "";
    document.body.style.overflow = "";
    if (feuilleAuFermer) { const fn = feuilleAuFermer; feuilleAuFermer = null; fn(); }
  }

  /* ---------- Visionneuse ---------- */

  function ouvrirVisionneuse(src) {
    $("#visionneuse-img").src = src;
    $("#visionneuse").hidden = false;
    document.body.style.overflow = "hidden";
  }

  function fermerVisionneuse() {
    $("#visionneuse").hidden = true;
    $("#visionneuse-img").src = "";
    if ($("#feuille").hidden) document.body.style.overflow = "";
  }

  /* ---------- Confirmation ---------- */

  function confirmer({ titre, texte, bouton, danger }) {
    return new Promise((resolve) => {
      const corps = ouvrirFeuille(titre,
        '<div class="carte"><p style="margin:0 0 16px;font-size:14.5px;line-height:1.55;color:var(--encre-douce)">' + e(texte) + "</p>" +
        '<div class="btn-rangee">' +
          '<button type="button" class="btn btn-clair" data-role="annuler">Annuler</button>' +
          '<button type="button" class="btn ' + (danger ? "btn-danger" : "") + '" data-role="ok">' + e(bouton || "Confirmer") + "</button>" +
        "</div></div>",
        () => resolve(false));
      $("[data-role=annuler]", corps).onclick = () => fermerFeuille();
      $("[data-role=ok]", corps).onclick = () => {
        feuilleSansRappel();
        fermerFeuille();
        resolve(true);
      };
    });
  }

  function feuilleSansRappel() { feuilleAuFermer = null; }

  /**
   * Propose d'imprimer ou d'exporter en PDF, puis lance le document.
   * Les deux passent par le même dialogue système : c'est là que la
   * destination se choisit. Le rappel guide vers « Enregistrer en PDF ».
   */
  function choisirImpression(titre, lancer) {
    const corps = ouvrirFeuille(titre,
      '<button type="button" class="ligne" data-sortie="imprimer">' +
        '<span class="pastille">' + icone("telecharger", "ic-sm") + "</span>" +
        '<span class="ligne-corps"><span class="ligne-titre">Imprimer directement</span>' +
          '<span class="ligne-sous">Vers une imprimante connectée</span></span>' +
      "</button>" +
      '<button type="button" class="ligne" style="margin-top:10px" data-sortie="pdf">' +
        '<span class="pastille">' + icone("commandes", "ic-sm") + "</span>" +
        '<span class="ligne-corps"><span class="ligne-titre">Exporter en PDF</span>' +
          "<span class=\"ligne-sous\">Pour l'envoyer ou l'archiver</span></span>" +
      "</button>");

    corps.addEventListener("click", (ev) => {
      const choix = ev.target.closest("[data-sortie]");
      if (!choix) return;
      feuilleSansRappel();
      fermerFeuille();
      lancer();
      if (choix.dataset.sortie === "pdf") {
        toast("Choisissez « Enregistrer au format PDF » comme destination", "ok");
      }
    });
  }

  /* ---------- Composants ---------- */

  function badgeStatut(commande) {
    if (Store.estEnRetard(commande)) {
      return '<span class="badge badge-retard">' + icone("alerte", "ic-sm") + "En retard</span>";
    }
    const s = Store.STATUTS[commande.statut] || Store.STATUTS.en_cours;
    return '<span class="badge ' + s.badge + '">' + e(s.label) + "</span>";
  }

  function pastilleClient(client, photoUrl) {
    if (photoUrl) return '<span class="pastille"><img src="' + photoUrl + '" alt=""></span>';
    return '<span class="pastille">' + e(Utils.initiales(client && client.prenom, client && client.nom)) + "</span>";
  }

  function ligneCommande(commande, client, options) {
    const o = options || {};
    const devise = Store.lireReglages().devise;
    const solde = Store.soldeRestant(commande);
    return (
      '<button type="button" class="ligne" data-nav="#/commande/' + commande.id + '">' +
        pastilleClient(client) +
        '<span class="ligne-corps">' +
          // Sans titre imposé, c'est le nom du client : il s'affiche en entier.
          // Un titre fourni (nom — description) reste tronqué s'il déborde.
          '<span class="ligne-titre' + (o.titre ? "" : " entier") + '">' +
            e(o.titre || Utils.nomComplet(client)) + "</span>" +
          '<span class="ligne-sous">' +
            "<span>" + e(commande.numero) + "</span>" +
            "<span>·</span>" +
            "<span>" + icone("calendrier", "ic-sm") + " " + e(Utils.fmtDateCourte(commande.dateLivraison)) + "</span>" +
          "</span>" +
        "</span>" +
        '<span class="ligne-fin">' +
          badgeStatut(commande) +
          '<span class="ligne-montant">' +
            (solde > 0
              ? '<span style="color:var(--rouge)">' + Utils.fmtMontant(solde, devise) + "</span>"
              : '<span style="color:var(--vert)">Soldée</span>') +
          "</span>" +
        "</span>" +
      "</button>"
    );
  }

  function vide(icon, titre, note, bouton) {
    return (
      '<div class="vide">' + icone(icon) +
        "<p>" + e(titre) + "</p>" +
        (note ? "<small>" + e(note) + "</small>" : "") +
        (bouton || "") +
      "</div>"
    );
  }

  /* ---------- Sélecteur de période ----------
     Partagé par les recettes de l'atelier, le tableau de bord du
     superadministrateur et l'historique des renouvellements. */

  const PERIODES = [
    { id: "jour", label: "Aujourd'hui" },
    { id: "semaine", label: "7 jours" },
    { id: "mois", label: "Ce mois" },
    { id: "annee", label: "Cette année" },
    { id: "libre", label: "Choisir…" },
  ];

  /** Bornes ISO (aaaa-mm-jj) d'une période, bornes incluses. */
  function bornesPeriode(id, libre) {
    const auj = Utils.aujourdhui();
    const l = libre || {};
    if (id === "jour") return { debut: auj, fin: auj };
    if (id === "semaine") return { debut: Utils.ajouterJours(auj, -6), fin: auj };
    if (id === "mois") return { debut: auj.slice(0, 8) + "01", fin: auj };
    if (id === "annee") return { debut: auj.slice(0, 5) + "01-01", fin: auj };
    return { debut: l.debut || auj.slice(0, 8) + "01", fin: l.fin || auj };
  }

  function libellePeriode(id, b) {
    if (id === "jour") return Utils.fmtDate(b.debut);
    return "Du " + Utils.fmtDate(b.debut) + " au " + Utils.fmtDate(b.fin);
  }

  /** Le gabarit du sélecteur, à insérer là où il doit apparaître.
      `prefixe` distingue plusieurs sélecteurs sur une même page. */
  function gabaritPeriode(etat, prefixe) {
    const p = prefixe || "periode";
    return (
      '<div class="puces" id="' + p + '-puces">' +
        PERIODES.map((x) =>
          '<button type="button" class="puce' + (x.id === etat.actif ? " actif" : "") + '"' +
            ' data-periode="' + x.id + '">' + e(x.label) + "</button>"
        ).join("") +
      "</div>" +
      '<div id="' + p + '-libre" hidden><div class="carte"><div class="champ-duo" style="margin:0">' +
        '<div class="champ" style="margin:0"><label for="' + p + '-debut">Du</label>' +
          '<input type="date" id="' + p + '-debut"></div>' +
        '<div class="champ" style="margin:0"><label for="' + p + '-fin">Au</label>' +
          '<input type="date" id="' + p + '-fin"></div>' +
      "</div></div></div>"
    );
  }

  /** Branche le sélecteur déjà inséré : `etat` ({actif, libre}) appartient
      à l'appelant pour que le choix survive aux réaffichages. */
  function brancherPeriode(etat, surChangement, prefixe) {
    const p = prefixe || "periode";
    const zoneLibre = $("#" + p + "-libre");
    const champDebut = $("#" + p + "-debut");
    const champFin = $("#" + p + "-fin");

    $("#" + p + "-puces").addEventListener("click", (ev) => {
      const bouton = ev.target.closest("[data-periode]");
      if (!bouton) return;
      etat.actif = bouton.dataset.periode;
      $$("#" + p + "-puces .puce").forEach((x) => x.classList.toggle("actif", x === bouton));
      zoneLibre.hidden = etat.actif !== "libre";
      surChangement();
    });

    const depart = bornesPeriode("libre", etat.libre);
    champDebut.value = depart.debut;
    champFin.value = depart.fin;

    for (const champ of [champDebut, champFin]) {
      champ.addEventListener("change", () => {
        etat.libre = etat.libre || {};
        etat.libre.debut = champDebut.value || etat.libre.debut;
        etat.libre.fin = champFin.value || etat.libre.fin;
        /* Deux dates à l'envers : on les remet dans l'ordre. */
        if (etat.libre.debut && etat.libre.fin && etat.libre.debut > etat.libre.fin) {
          const t = etat.libre.debut;
          etat.libre.debut = etat.libre.fin;
          etat.libre.fin = t;
          champDebut.value = etat.libre.debut;
          champFin.value = etat.libre.fin;
        }
        surChangement();
      });
    }

    zoneLibre.hidden = etat.actif !== "libre";
  }

  /** Champ montant avec suffixe devise. */
  function champMontant({ id, label, valeur, obligatoire, aide, placeholder }) {
    const devise = Store.lireReglages().devise;
    return (
      '<div class="champ">' +
        '<label for="' + id + '">' + e(label) + (obligatoire ? ' <span class="obligatoire">*</span>' : "") + "</label>" +
        '<div class="champ-montant">' +
          '<input id="' + id + '" inputmode="numeric" autocomplete="off" placeholder="' + e(placeholder || "0") + '"' +
            (valeur !== undefined && valeur !== null && valeur !== "" ? ' value="' + e(Utils.fmtNombre(valeur)) + '"' : "") + ">" +
          '<span class="devise">' + e(devise) + "</span>" +
        "</div>" +
        (aide ? '<div class="aide">' + e(aide) + "</div>" : "") +
      "</div>"
    );
  }

  /** Grille de saisie des mesures, pré-remplie avec celles du client. */
  function grilleMesures(mesures) {
    const m = mesures || {};
    return Mesures.GROUPES.map((groupe) =>
      '<details class="bloc" ' + (groupe.id === "haut" ? "open" : "") + ">" +
        "<summary>" + icone("mesure", "ic-sm") + e(groupe.titre) + "</summary>" +
        '<div class="contenu"><div class="mesures-grille">' +
          groupe.champs.map((c) =>
            '<div class="mesure-champ">' +
              '<label for="mes-' + c.code + '">' + e(c.label) + "</label>" +
              '<div class="boite">' +
                '<input id="mes-' + c.code + '" data-mesure="' + c.code + '" inputmode="decimal" autocomplete="off"' +
                  (m[c.code] !== undefined ? ' value="' + e(m[c.code]) + '"' : "") + ">" +
                '<span class="unite">cm</span>' +
              "</div>" +
            "</div>"
          ).join("") +
        "</div></div>" +
      "</details>"
    ).join("");
  }

  function lireGrilleMesures(base) {
    const mesures = {};
    for (const input of $$("[data-mesure]", base)) {
      const v = Utils.lireNombre(input.value);
      if (v > 0) mesures[input.dataset.mesure] = v;
    }
    return mesures;
  }

  function lectureMesures(mesures) {
    const liste = Mesures.lister(mesures);
    if (!liste.length) return '<p style="margin:0;font-size:13px;color:var(--encre-tres-douce)">Aucune mesure enregistrée.</p>';
    return '<div class="mesures-lecture">' +
      liste.map((m) =>
        '<div class="mesure-lue"><div class="l">' + e(m.label) + '</div><div class="v">' + e(m.valeur) + " cm</div></div>"
      ).join("") +
    "</div>";
  }

  return {
    $, $$, entete, icone, toast,
    ouvrirFeuille, fermerFeuille, feuilleSansRappel, confirmer, choisirImpression,
    ouvrirVisionneuse, fermerVisionneuse,
    badgeStatut, pastilleClient, ligneCommande, vide,
    PERIODES, bornesPeriode, libellePeriode, gabaritPeriode, brancherPeriode,
    champMontant, grilleMesures, lireGrilleMesures, lectureMesures,
  };
})();
