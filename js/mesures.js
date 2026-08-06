/* =========================================================
   Référentiel des mesures de couture.
   Chaque client garde un objet { code: valeur_en_cm } —
   saisi une fois, réutilisé à chaque nouvelle commande.
   ========================================================= */
const Mesures = (() => {

  const GROUPES = [
    {
      id: "haut",
      titre: "Haut du corps",
      champs: [
        { code: "epaule", label: "Épaule" },
        { code: "poitrine", label: "Tour de poitrine" },
        { code: "taille", label: "Tour de taille" },
        { code: "bassin", label: "Tour de bassin" },
        { code: "longueur_haut", label: "Longueur haut / chemise" },
        { code: "longueur_robe", label: "Longueur robe / boubou" },
        { code: "manche_longue", label: "Manche longue" },
        { code: "manche_courte", label: "Manche courte" },
        { code: "tour_bras", label: "Tour de bras" },
        { code: "poignet", label: "Poignet" },
        { code: "cou", label: "Tour de cou" },
        { code: "carrure_dos", label: "Carrure dos" },
      ],
    },
    {
      id: "bas",
      titre: "Bas du corps",
      champs: [
        { code: "ceinture", label: "Tour de ceinture" },
        { code: "longueur_pantalon", label: "Longueur pantalon" },
        { code: "longueur_jupe", label: "Longueur jupe" },
        { code: "cuisse", label: "Tour de cuisse" },
        { code: "genou", label: "Tour de genou" },
        { code: "bas_pantalon", label: "Bas de pantalon" },
        { code: "fourche", label: "Fourche / montant" },
        { code: "hanche", label: "Tour de hanche" },
      ],
    },
  ];

  const LABELS = (() => {
    const table = {};
    for (const g of GROUPES) for (const c of g.champs) table[c.code] = c.label;
    return table;
  })();

  function label(code) {
    return LABELS[code] || code.replace(/_/g, " ");
  }

  /** Ne garde que les valeurs réellement saisies (> 0). */
  function nettoyer(brutes) {
    const propres = {};
    for (const [code, valeur] of Object.entries(brutes || {})) {
      const n = Utils.lireNombre(valeur);
      if (n > 0) propres[code] = n;
    }
    return propres;
  }

  function nombre(mesures) {
    return Object.keys(mesures || {}).length;
  }

  /** Liste [ {code, label, valeur} ] ordonnée comme le référentiel, extras à la fin. */
  function lister(mesures) {
    const m = mesures || {};
    const vus = new Set();
    const liste = [];
    for (const g of GROUPES) {
      for (const c of g.champs) {
        if (m[c.code] !== undefined) {
          liste.push({ code: c.code, label: c.label, valeur: m[c.code] });
          vus.add(c.code);
        }
      }
    }
    for (const [code, valeur] of Object.entries(m)) {
      if (!vus.has(code)) liste.push({ code, label: label(code), valeur });
    }
    return liste;
  }

  /** Résumé texte pour WhatsApp ou impression : "Épaule : 44 cm — ...". */
  function resume(mesures) {
    return lister(mesures).map((m) => m.label + " : " + m.valeur + " cm").join("\n");
  }

  return { GROUPES, label, nettoyer, nombre, lister, resume };
})();
