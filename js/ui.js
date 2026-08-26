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

  function ouvrirFeuille(titre, html, auFermer) {
    const feuille = $("#feuille");
    $("#feuille-titre").textContent = titre;
    $("#feuille-corps").innerHTML = html;
    feuille.hidden = false;
    document.body.style.overflow = "hidden";
    feuilleAuFermer = auFermer || null;
    return $("#feuille-corps");
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
    ouvrirFeuille, fermerFeuille, feuilleSansRappel, confirmer,
    ouvrirVisionneuse, fermerVisionneuse,
    badgeStatut, pastilleClient, ligneCommande, vide,
    champMontant, grilleMesures, lireGrilleMesures, lectureMesures,
  };
})();
