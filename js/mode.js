/* =========================================================
   Mode — le vocabulaire d'une réalisation : à qui elle
   s'adresse, en quelles tailles, en quelles couleurs, dans
   quel tissu.

   Les tailles suivent la norme européenne EN 13402. Adultes :
   la grille française, celle qui est cousue dans l'étiquette
   (36, 38, 40…), différente pour la femme et pour l'homme.
   Enfants : la norme mesure la STATURE en centimètres, pas
   l'âge — les deux sont donc affichés ensemble, « 6 ans
   (116) », parce que la cliente pense en âge et que le mètre
   tranche.

   Partagé par le formulaire de l'atelier et par la boutique
   publique : une seule liste, donc jamais deux listes qui
   divergent.
   ========================================================= */
const Mode = (() => {

  const SEXES = [
    { code: "", nom: "Non précisé" },
    { code: "femme", nom: "Femme" },
    { code: "homme", nom: "Homme" },
    { code: "mixte", nom: "Mixte" },
  ];

  const AGES = [
    { code: "", nom: "Non précisé" },
    { code: "bebe", nom: "Bébé (0-2 ans)" },
    { code: "enfant", nom: "Enfant (2-11 ans)" },
    { code: "ado", nom: "Adolescent (12-16 ans)" },
    { code: "adulte", nom: "Adulte" },
  ];

  /* Une grille par tranche d'âge ; pour l'adulte, une par sexe.
     « Taille unique » clôt chaque liste : beaucoup de modèles se
     portent ainsi, et sans elle il faudrait tout cocher. */
  const UNIQUE = "Taille unique";

  const GRILLES = {
    bebe: [
      "0-1 mois (50)", "1-3 mois (56)", "3-6 mois (62)", "6-9 mois (68)",
      "9-12 mois (74)", "12-18 mois (80)", "18-24 mois (86)",
    ],
    enfant: [
      "2 ans (92)", "3 ans (98)", "4 ans (104)", "5 ans (110)", "6 ans (116)",
      "7 ans (122)", "8 ans (128)", "9 ans (134)", "10 ans (140)", "11 ans (146)",
    ],
    ado: ["12 ans (152)", "13 ans (158)", "14 ans (164)", "15 ans (170)", "16 ans (176)"],
    adulte: {
      femme: ["32", "34", "36", "38", "40", "42", "44", "46", "48", "50", "52", "54", "56"],
      homme: ["38", "40", "42", "44", "46", "48", "50", "52", "54", "56", "58", "60", "62"],
      mixte: ["XS", "S", "M", "L", "XL", "XXL", "3XL"],
    },
  };

  const LETTRES = ["XS", "S", "M", "L", "XL", "XXL", "3XL"];

  /**
   * Les tailles à proposer, par groupes nommés — c'est le point où le
   * formulaire devient utile plutôt que bavard : on ne montre pas une
   * layette à qui habille une femme.
   * Rend [] tant que la tranche d'âge n'est pas choisie : sans elle,
   * aucune grille n'a de sens.
   */
  function grilles(sexe, age) {
    if (!age) return [];
    if (age !== "adulte") {
      return [{ titre: etiquetteAge(age), tailles: GRILLES[age].concat([UNIQUE]) }];
    }
    const groupes = [];
    if (sexe === "femme" || sexe === "homme") {
      groupes.push({
        titre: "Taille européenne — " + (sexe === "femme" ? "femme" : "homme"),
        tailles: GRILLES.adulte[sexe],
      });
    }
    groupes.push({ titre: "Taille lettrée", tailles: LETTRES.concat([UNIQUE]) });
    return groupes;
  }

  /* Palette d'atelier : des noms qu'on emploie en boutique, et le ton
     qui va avec pour la pastille. « Multicolore » n'a pas de ton
     unique — d'où son dégradé, traité à part à l'affichage. */
  const COULEURS = [
    { nom: "Noir", ton: "#111827" },
    { nom: "Blanc", ton: "#f8fafc" },
    { nom: "Écru", ton: "#ede4d3" },
    { nom: "Beige", ton: "#d8c3a5" },
    { nom: "Marron", ton: "#7c4a21" },
    { nom: "Gris", ton: "#9ca3af" },
    { nom: "Rouge", ton: "#dc2626" },
    { nom: "Bordeaux", ton: "#7f1d3a" },
    { nom: "Rose", ton: "#f472b6" },
    { nom: "Orange", ton: "#f97316" },
    { nom: "Jaune", ton: "#facc15" },
    { nom: "Or", ton: "#c9a227" },
    { nom: "Vert", ton: "#16a34a" },
    { nom: "Vert olive", ton: "#6b7d3a" },
    { nom: "Turquoise", ton: "#14b8a6" },
    { nom: "Bleu ciel", ton: "#7dd3fc" },
    { nom: "Bleu", ton: "#2563eb" },
    { nom: "Bleu marine", ton: "#1e3a5f" },
    { nom: "Violet", ton: "#7c3aed" },
    { nom: "Multicolore", ton: "" },
  ];

  const tonDe = (nom) => {
    const c = COULEURS.find((x) => x.nom.toLowerCase() === String(nom).toLowerCase());
    return c ? c.ton : "";
  };

  /* Suggestions de tissus : celles d'ici d'abord — le wax, le bazin et
     le kente ne figurent dans aucune nomenclature européenne — puis les
     matières courantes. La liste n'est qu'un point de départ : le
     formulaire y ajoute ce que l'atelier a déjà employé, et « + Autre »
     ouvre la porte au reste. */
  const TISSUS = [
    "Wax (pagne)", "Bazin riche", "Kente", "Basin brodé", "Tissu tissé",
    "Coton", "Lin", "Soie", "Satin", "Mousseline", "Dentelle", "Broderie anglaise",
    "Crêpe", "Jersey", "Velours", "Jean (denim)", "Laine", "Tulle", "Polyester",
    "Cuir", "Simili cuir",
  ];

  /* Rayons de départ d'une maison de couture. Comme les tissus, la liste
     s'enrichit de ce que l'atelier emploie : elle amorce, elle n'enferme
     pas. */
  const CATEGORIES = [
    "Robes", "Ensembles", "Boubous", "Chemises", "Pantalons", "Jupes",
    "Vestes", "Tailleurs", "Tenues traditionnelles", "Tenues d'enfant",
    "Accessoires", "Autres",
  ];

  const etiquetteSexe = (code) => (SEXES.find((s) => s.code === code) || SEXES[0]).nom;
  const etiquetteAge = (code) => (AGES.find((a) => a.code === code) || AGES[0]).nom;

  /** Une ligne lisible : « Femme · Adulte · 38, 40, 42 ». Vide si la
      réalisation ne dit rien de tout cela — mieux vaut rien qu'un
      chapelet de « non précisé ». */
  function resume(p) {
    const bouts = [];
    if (p.sexe) bouts.push(etiquetteSexe(p.sexe));
    if (p.tranche_age) bouts.push(etiquetteAge(p.tranche_age));
    if (p.tailles && p.tailles.length) bouts.push(p.tailles.join(", "));
    return bouts.join(" · ");
  }

  return {
    SEXES, AGES, COULEURS, TISSUS, CATEGORIES, UNIQUE,
    grilles, tonDe, etiquetteSexe, etiquetteAge, resume,
  };
})();
