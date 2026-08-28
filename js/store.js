/* =========================================================
   Store — logique métier au-dessus de Supabase (via Api).
   Les vues gardent les mêmes appels qu'avant : le Store
   traduit les colonnes de la base (snake_case) vers les
   objets de l'application (camelCase).
   ========================================================= */
const Store = (() => {

  const STATUTS = {
    en_cours: { label: "En cours", badge: "badge-info" },
    pret: { label: "Prête", badge: "badge-ok" },
    livree: { label: "Livrée", badge: "badge-fait" },
  };

  const DEFAUTS = {
    nomAtelier: "Atelier",
    devise: "FCFA",
    indicatif: "229",
    modeleWhatsApp:
      "Bonjour {prenom} 👋\n" +
      "Votre commande {numero} chez {atelier} :\n" +
      "• Modèle : {description}\n" +
      "• Livraison prévue : {livraison}\n" +
      "• Montant : {montant}\n" +
      "• Acompte reçu : {acompte}\n" +
      "• Reste à payer : {solde}\n" +
      "Merci pour votre confiance !",
    modeleWhatsAppPret:
      "Bonjour {prenom} 👋\n" +
      "Bonne nouvelle : votre commande {numero} est prête ! " +
      "Vous pouvez passer la récupérer chez {atelier}.\n" +
      "Reste à payer : {solde}.",
  };

  /* ---------- Réglages = atelier du compte connecté ---------- */

  function lireReglages() {
    const a = Api.lireAtelier();
    if (!a) {
      return {
        ...DEFAUTS, slogan: "", logo: "", telWhatsAppAtelier: "", telAppelAtelier: "",
        abonnementMensuel: 0, abonnementFin: null,
      };
    }
    return {
      nomAtelier: a.nom || DEFAUTS.nomAtelier,
      slogan: a.slogan || "",
      logo: a.logo || "",
      devise: a.devise || DEFAUTS.devise,
      indicatif: a.indicatif || DEFAUTS.indicatif,
      telWhatsAppAtelier: a.tel_whatsapp || "",
      telAppelAtelier: a.tel_appel || "",
      modeleWhatsApp: a.modele_whatsapp || DEFAUTS.modeleWhatsApp,
      modeleWhatsAppPret: a.modele_whatsapp_pret || DEFAUTS.modeleWhatsAppPret,
      abonnementMensuel: Number(a.abonnement_mensuel) || 0,
      abonnementFin: a.abonnement_fin || null,
      formule: a.formule || "atelier_vitrine",
    };
  }

  /* ---------- Formules ----------
     Les noms et les tarifs viennent de la base : le superadministrateur
     les règle sans qu'on touche au code. Ces libellés de secours ne
     servent que si la table n'a pas encore été créée. */

  const FORMULES_SECOURS = {
    atelier: "Atelier",
    vitrine: "Vitrine",
    atelier_vitrine: "Atelier + Vitrine",
  };

  const listerFormules = () => Api.listerFormules();

  const libelleFormule = (code, formules) => {
    const trouvee = (formules || []).find((f) => f.code === code);
    return (trouvee && trouvee.nom) || FORMULES_SECOURS[code] || code || "—";
  };

  /** Ce que la formule ouvre — même découpage que module_atelier /
      module_vitrine côté serveur, qui seul fait foi. */
  const formuleOuvreAtelier = (code) => ["atelier", "atelier_vitrine"].indexOf(code) >= 0;
  const formuleOuvreVitrine = (code) => ["vitrine", "atelier_vitrine"].indexOf(code) >= 0;

  function resumeFormule(code) {
    const a = formuleOuvreAtelier(code);
    const v = formuleOuvreVitrine(code);
    if (a && v) return "Commandes sur mesure et boutique publique";
    if (a) return "Commandes, clients, mesures et recettes — sans boutique publique";
    if (v) return "Boutique publique, stock et ventes au comptoir";
    return "";
  }

  /** Champs de l'atelier modifiables par son administrateur. */
  async function majReglages(maj) {
    const objet = {};
    if (maj.slogan !== undefined) objet.slogan = maj.slogan;
    if (maj.logo !== undefined) objet.logo = maj.logo;
    if (maj.telWhatsAppAtelier !== undefined) objet.tel_whatsapp = maj.telWhatsAppAtelier;
    if (maj.telAppelAtelier !== undefined) objet.tel_appel = maj.telAppelAtelier;
    if (maj.modeleWhatsApp !== undefined) objet.modele_whatsapp = maj.modeleWhatsApp;
    if (maj.modeleWhatsAppPret !== undefined) objet.modele_whatsapp_pret = maj.modeleWhatsAppPret;
    if (!Object.keys(objet).length) return lireReglages();
    await Api.mettreAJour("ateliers", Api.atelierId(), objet);
    await Api.rafraichirAtelier();
    return lireReglages();
  }

  /** Renouvellement par code : le serveur valide, consomme et prolonge. */
  const utiliserCode = (code) => Api.rpc("utiliser_code", { p_code: code });

  /** Bandeau d'alerte quand la fin d'abonnement approche (≤ 5 jours). */
  function bandeauAbonnement() {
    const r = lireReglages();
    if (!r.abonnementFin) return "";
    const jours = Math.ceil((new Date(r.abonnementFin).getTime() - Date.now()) / 86400000);
    if (jours > 5 || jours < 0) return "";
    const n = Math.max(1, jours);
    return (
      '<div class="alerte">' + UI.icone("horloge") +
      "<div><strong>Abonnement : " + n + " jour" + (n > 1 ? "s" : "") + " restant" + (n > 1 ? "s" : "") +
      ".</strong> Contactez votre fournisseur pour renouveler et éviter la coupure.</div></div>"
    );
  }

  /* ---------- Traduction base <-> application ---------- */

  const clientVersApp = (l) => l && {
    id: l.id, prenom: l.prenom || "", nom: l.nom || "", tel: l.tel || "",
    telWhatsApp: l.tel_whatsapp || "", note: l.note || "", mesures: l.mesures || {},
    creeLe: l.cree_le, modifieLe: l.modifie_le,
  };

  const commandeVersApp = (l) => l && {
    id: l.id, numero: l.numero, clientId: l.client_id, description: l.description || "",
    commentaire: l.commentaire || "",
    statut: l.statut, dateLivraison: l.date_livraison, montant: Number(l.montant) || 0,
    paiements: l.paiements || [], livreLe: l.livre_le, creeLe: l.cree_le, modifieLe: l.modifie_le,
  };

  /* `valeur` est ce que la base garde : une data-url héritée ou un chemin
     dans le bucket privé. `src` est ce qu'on affiche — rempli par
     photosDeCommande, qui signe les chemins avant de rendre la main. */
  const photoVersApp = (l) => l && {
    id: l.id, commandeId: l.commande_id, valeur: l.data_url, src: "", creeLe: l.cree_le,
  };

  const depenseVersApp = (l) => l && {
    id: l.id, libelle: l.libelle, montant: Number(l.montant) || 0,
    dateDepense: l.date_depense, note: l.note || "", creeLe: l.cree_le,
  };

  /* ---------- Clients ---------- */

  async function listerClients() {
    const clients = (await Api.lister("clients")).map(clientVersApp);
    clients.sort((a, b) =>
      Utils.sansAccent(Utils.nomComplet(a)).localeCompare(Utils.sansAccent(Utils.nomComplet(b)), "fr"));
    return clients;
  }

  const lireClient = async (id) => clientVersApp(await Api.lireLigne("clients", id));

  async function sauverClient(donnees) {
    const prenom = (donnees.prenom || "").trim();
    const nom = (donnees.nom || "").trim();
    if (!prenom && !nom) throw new Error("Le nom du client est obligatoire.");
    const objet = {
      prenom, nom,
      tel: (donnees.tel || "").trim(),
      tel_whatsapp: (donnees.telWhatsApp || "").trim(),
      note: (donnees.note || "").trim(),
    };
    if (donnees.mesures !== undefined) objet.mesures = Mesures.nettoyer(donnees.mesures);
    if (donnees.id) {
      objet.modifie_le = new Date().toISOString();
      return clientVersApp(await Api.mettreAJour("clients", donnees.id, objet));
    }
    objet.atelier_id = Api.atelierId();
    if (objet.mesures === undefined) objet.mesures = {};
    return clientVersApp(await Api.inserer("clients", objet));
  }

  /**
   * La base supprime en cascade les commandes et photos du client — mais
   * la cascade ne connaît que des lignes. Les fichiers du bucket ne
   * partent que si on les nomme, et après la suppression leurs chemins
   * sont introuvables : on les relève donc avant.
   */
  async function supprimerClient(id) {
    const commandes = await commandesDuClient(id);
    const fichiers = [];
    for (const commande of commandes) {
      for (const photo of await lignesPhotos(commande.id)) fichiers.push(photo.valeur);
    }
    await Api.supprimerLigne("clients", id);
    await Stockage.retirer(fichiers, Stockage.COMMANDES);
  }

  function chercherClients(clients, terme) {
    const t = Utils.sansAccent(terme).trim();
    if (!t) return clients;
    return clients.filter((c) => {
      const texte = Utils.sansAccent(
        Utils.nomComplet(c) + " " + (c.tel || "") + " " + (c.telWhatsApp || ""));
      return t.split(/\s+/).every((mot) => texte.includes(mot));
    });
  }

  /* ---------- Commandes ---------- */

  async function listerCommandes() {
    return (await Api.lister("commandes", "cree_le", false)).map(commandeVersApp);
  }

  const lireCommande = async (id) => commandeVersApp(await Api.lireLigne("commandes", id));

  const commandesDuClient = async (clientId) =>
    (await Api.listerPar("commandes", "client_id", clientId)).map(commandeVersApp);

  async function sauverCommande(donnees) {
    if (!donnees.clientId) throw new Error("Choisissez un client pour la commande.");
    const montant = Math.max(0, Utils.lireNombre(donnees.montant));

    if (donnees.id) {
      const existante = await lireCommande(donnees.id);
      if (!existante) throw new Error("Commande introuvable.");
      const statut = donnees.statut || existante.statut;
      return commandeVersApp(await Api.mettreAJour("commandes", donnees.id, {
        description: (donnees.description || "").trim(),
        commentaire: (donnees.commentaire !== undefined
          ? donnees.commentaire : existante.commentaire).trim(),
        date_livraison: donnees.dateLivraison || existante.dateLivraison,
        montant,
        statut,
        livre_le: statut === "livree" ? (existante.livreLe || new Date().toISOString()) : null,
        modifie_le: new Date().toISOString(),
      }));
    }

    const numero = await Api.rpc("numero_commande_suivant");
    const paiements = [];
    const acompte = Math.max(0, Utils.lireNombre(donnees.acompte));
    if (acompte > 0) {
      paiements.push({
        id: Utils.uid("pay"),
        montant: Math.min(acompte, montant || acompte),
        date: Date.now(),
        note: "Acompte",
      });
    }
    return commandeVersApp(await Api.inserer("commandes", {
      atelier_id: Api.atelierId(),
      numero,
      client_id: donnees.clientId,
      description: (donnees.description || "").trim(),
      commentaire: (donnees.commentaire || "").trim(),
      statut: "en_cours",
      date_livraison: donnees.dateLivraison || Utils.aujourdhui(),
      montant,
      paiements,
    }));
  }

  async function changerStatut(id, statut) {
    const commande = await lireCommande(id);
    if (!commande) throw new Error("Commande introuvable.");
    return commandeVersApp(await Api.mettreAJour("commandes", id, {
      statut,
      livre_le: statut === "livree" ? (commande.livreLe || new Date().toISOString()) : null,
      modifie_le: new Date().toISOString(),
    }));
  }

  async function ajouterPaiement(id, montant, note) {
    const commande = await lireCommande(id);
    if (!commande) throw new Error("Commande introuvable.");
    const v = Utils.lireNombre(montant);
    if (v <= 0) throw new Error("Le montant doit être supérieur à zéro.");
    const solde = soldeRestant(commande);
    if (v > solde) {
      throw new Error("Ce paiement dépasse le solde restant (" +
        Utils.fmtMontant(solde, lireReglages().devise) + ").");
    }
    const paiements = commande.paiements.concat([{
      id: Utils.uid("pay"),
      montant: v,
      date: Date.now(),
      note: (note || "").trim() || (commande.paiements.length ? "Versement" : "Acompte"),
    }]);
    return commandeVersApp(await Api.mettreAJour("commandes", id, {
      paiements, modifie_le: new Date().toISOString(),
    }));
  }

  async function retirerPaiement(idCommande, idPaiement) {
    const commande = await lireCommande(idCommande);
    if (!commande) throw new Error("Commande introuvable.");
    return commandeVersApp(await Api.mettreAJour("commandes", idCommande, {
      paiements: commande.paiements.filter((p) => p.id !== idPaiement),
      modifie_le: new Date().toISOString(),
    }));
  }

  /** Même remarque que pour le client : les chemins d'abord, la ligne ensuite. */
  async function supprimerCommande(id) {
    const fichiers = (await lignesPhotos(id)).map((photo) => photo.valeur);
    await Api.supprimerLigne("commandes", id);
    await Stockage.retirer(fichiers, Stockage.COMMANDES);
  }

  /* ---------- Calculs ---------- */

  const totalPaye = (commande) =>
    (commande.paiements || []).reduce((somme, p) => somme + (Number(p.montant) || 0), 0);

  const acompteVerse = (commande) =>
    commande.paiements && commande.paiements.length ? Number(commande.paiements[0].montant) || 0 : 0;

  const soldeRestant = (commande) =>
    Math.max(0, (Number(commande.montant) || 0) - totalPaye(commande));

  const estEnRetard = (commande) =>
    commande.statut !== "livree" && Utils.ecartJours(Utils.aujourdhui(), commande.dateLivraison) < 0;

  /* ---------- Photos ---------- */

  const lignesPhotos = async (commandeId) =>
    (await Api.listerPar("photos", "commande_id", commandeId, "cree_le", true)).map(photoVersApp);

  /**
   * Les photos de tissus vivent dans un bucket privé : leur URL est
   * signée et expire. On les signe toutes ici, d'un coup, pour que la
   * vue reste synchrone une fois la liste reçue.
   */
  async function photosDeCommande(commandeId) {
    const photos = await lignesPhotos(commandeId);
    const urls = await Stockage.srcPriveesEnLot(photos.map((p) => p.valeur));
    photos.forEach((photo, i) => { photo.src = urls[i]; });
    return photos;
  }

  /** `valeur` : le chemin renvoyé par le dépôt (ou une data-url héritée). */
  const ajouterPhoto = async (commandeId, valeur) =>
    photoVersApp(await Api.inserer("photos", {
      atelier_id: Api.atelierId(), commande_id: commandeId, data_url: valeur,
    }));

  async function supprimerPhoto(id, valeur) {
    await Api.supprimerLigne("photos", id);
    await Stockage.retirer([valeur], Stockage.COMMANDES);
  }

  /* ---------- Dépenses ---------- */

  async function listerDepenses() {
    return (await Api.lister("depenses", "date_depense", false)).map(depenseVersApp);
  }

  async function ajouterDepense(donnees) {
    const libelle = (donnees.libelle || "").trim();
    const montant = Utils.lireNombre(donnees.montant);
    if (!libelle) throw new Error("Indiquez le libellé de la dépense.");
    if (montant <= 0) throw new Error("Le montant doit être supérieur à zéro.");
    return depenseVersApp(await Api.inserer("depenses", {
      atelier_id: Api.atelierId(),
      libelle,
      montant,
      date_depense: donnees.dateDepense || Utils.aujourdhui(),
      note: (donnees.note || "").trim(),
    }));
  }

  const supprimerDepense = (id) => Api.supprimerLigne("depenses", id);

  /* ---------- Ventes en boutique (factures) ---------- */

  const venteVersApp = (l) => l && {
    id: l.id, numero: l.numero, client: l.client || "", clientWhatsApp: l.client_whatsapp || "",
    lignes: l.lignes || [],
    total: Number(l.total) || 0, paye: Number(l.paye) || 0, note: l.note || "", creeLe: l.cree_le,
  };

  async function listerVentes() {
    return (await Api.lister("ventes", "cree_le", false)).map(venteVersApp);
  }

  const lireVente = async (id) => venteVersApp(await Api.lireLigne("ventes", id));

  /** Le serveur vérifie le stock, le décrémente et numérote la facture. */
  async function enregistrerVente({ client, clientWhatsApp, lignes, paye, note }) {
    if (!lignes || !lignes.length) throw new Error("Ajoutez au moins un article à la vente.");
    return venteVersApp(await Api.rpc("enregistrer_vente", {
      p_client: (client || "").trim(),
      p_client_whatsapp: (clientWhatsApp || "").trim(),
      p_lignes: lignes.map((l) => ({ produit_id: l.produitId, quantite: l.quantite })),
      p_paye: Math.max(0, Utils.lireNombre(paye)),
      p_note: (note || "").trim(),
    }));
  }

  /* ---------- Facture : message WhatsApp et document A4 ---------- */

  function messageVente(vente) {
    const r = lireReglages();
    const solde = Math.max(0, vente.total - vente.paye);
    return (
      "Bonjour " + (vente.client || "") + " 👋\n" +
      "Merci pour votre achat chez " + r.nomAtelier + " !\n" +
      "Facture " + vente.numero + " du " + Utils.fmtDate(Utils.isoJour(new Date(vente.creeLe))) + "\n\n" +
      vente.lignes.map((l) =>
        "• " + l.nom + " × " + l.quantite + " — " + Utils.fmtMontant(l.prix * l.quantite, r.devise)
      ).join("\n") + "\n\n" +
      "Total : " + Utils.fmtMontant(vente.total, r.devise) + "\n" +
      "Payé : " + Utils.fmtMontant(vente.paye, r.devise) +
      (solde > 0 ? "\nReste à payer : " + Utils.fmtMontant(solde, r.devise) : "") +
      "\n\nÀ très bientôt !"
    );
  }

  const lienWhatsAppVente = (vente) =>
    Utils.lienWhatsApp(vente.clientWhatsApp, messageVente(vente), lireReglages().indicatif);

  /** Facture A4 imprimable (ou « Enregistrer en PDF »). */
  function factureA4(vente) {
    const r = lireReglages();
    const e = Utils.echapper;
    const solde = Math.max(0, vente.total - vente.paye);
    const contacts = [r.telAppelAtelier, r.telWhatsAppAtelier].filter(Boolean).join(" · ");
    return (
      "<!DOCTYPE html><html lang='fr'><head><meta charset='utf-8'>" +
      "<title>" + e(vente.numero) + "</title><style>" +
      "@page{size:A4;margin:16mm}" +
      "*{box-sizing:border-box}" +
      "body{margin:0;font-family:'Helvetica Neue',Arial,sans-serif;color:#141636;font-size:12pt;line-height:1.5}" +
      ".entete{display:flex;align-items:flex-start;gap:14mm;border-bottom:2px solid #2E3192;padding-bottom:6mm}" +
      ".logo{width:26mm;height:26mm;object-fit:cover;border-radius:3mm}" +
      ".atelier{flex:1}" +
      ".atelier h1{margin:0;font-size:20pt;color:#2E3192}" +
      ".atelier p{margin:1mm 0;font-size:10.5pt;color:#5b5f7d}" +
      ".titre{text-align:right}" +
      ".titre h2{margin:0;font-size:16pt;letter-spacing:1px}" +
      ".titre p{margin:1mm 0;font-size:10.5pt;color:#5b5f7d}" +
      ".client{margin:8mm 0 6mm;padding:4mm;background:#f4f5fb;border-radius:2mm}" +
      ".client strong{display:block;font-size:9.5pt;text-transform:uppercase;letter-spacing:1px;color:#5b5f7d}" +
      "table{width:100%;border-collapse:collapse;margin-top:4mm}" +
      "th{text-align:left;font-size:9.5pt;text-transform:uppercase;letter-spacing:.6px;color:#5b5f7d;" +
        "border-bottom:1.5px solid #2E3192;padding:2.5mm 2mm}" +
      "td{padding:2.5mm 2mm;border-bottom:1px solid #e3e5f0}" +
      ".num{text-align:right;white-space:nowrap}" +
      ".totaux{margin-left:auto;margin-top:5mm;width:75mm}" +
      ".totaux div{display:flex;justify-content:space-between;padding:1.5mm 0}" +
      ".totaux .grand{border-top:2px solid #2E3192;margin-top:1mm;padding-top:2.5mm;font-size:14pt;font-weight:700;color:#2E3192}" +
      ".reste{color:#c0392b;font-weight:700}" +
      ".pied{margin-top:14mm;border-top:1px solid #e3e5f0;padding-top:4mm;font-size:10pt;color:#5b5f7d;text-align:center}" +
      "</style></head><body>" +

      "<div class='entete'>" +
        (r.logo ? "<img class='logo' src='" + Stockage.src(r.logo) + "' alt=''>" : "") +
        "<div class='atelier'><h1>" + e(r.nomAtelier) + "</h1>" +
          (r.slogan ? "<p>" + e(r.slogan) + "</p>" : "") +
          (contacts ? "<p>" + e(contacts) + "</p>" : "") +
        "</div>" +
        "<div class='titre'><h2>FACTURE</h2>" +
          "<p>" + e(vente.numero) + "</p>" +
          "<p>" + e(Utils.fmtDate(Utils.isoJour(new Date(vente.creeLe)))) + "</p>" +
        "</div>" +
      "</div>" +

      "<div class='client'><strong>Client</strong>" +
        e(vente.client || "Client au comptoir") +
        (vente.clientWhatsApp ? "<br>" + e(Utils.fmtTel(vente.clientWhatsApp)) : "") +
      "</div>" +

      "<table><thead><tr><th>Article</th><th class='num'>Prix unitaire</th>" +
        "<th class='num'>Qté</th><th class='num'>Montant</th></tr></thead><tbody>" +
        vente.lignes.map((l) =>
          "<tr><td>" + e(l.nom) + (l.code ? " <span style='color:#8b8fa8'>(" + e(l.code) + ")</span>" : "") + "</td>" +
            "<td class='num'>" + Utils.fmtMontant(l.prix, r.devise) + "</td>" +
            "<td class='num'>" + l.quantite + "</td>" +
            "<td class='num'>" + Utils.fmtMontant(l.prix * l.quantite, r.devise) + "</td></tr>"
        ).join("") +
      "</tbody></table>" +

      "<div class='totaux'>" +
        "<div class='grand'><span>Total</span><span>" + Utils.fmtMontant(vente.total, r.devise) + "</span></div>" +
        "<div><span>Payé</span><span>" + Utils.fmtMontant(vente.paye, r.devise) + "</span></div>" +
        (solde > 0
          ? "<div class='reste'><span>Reste à payer</span><span>" + Utils.fmtMontant(solde, r.devise) + "</span></div>"
          : "") +
      "</div>" +

      (vente.note ? "<p style='margin-top:8mm;font-size:10.5pt'><em>" + e(vente.note) + "</em></p>" : "") +
      "<div class='pied'>Merci de votre confiance — " + e(r.nomAtelier) + "</div>" +
      "</body></html>"
    );
  }

  const imprimerFacture = (vente) => Utils.imprimerA4(vente.numero, factureA4(vente));

  /** Point A4 des recettes et dépenses d'une période. */
  function rapportA4(stats, bornes, libelle) {
    const r = lireReglages();
    const e = Utils.echapper;
    const m = (v) => Utils.fmtMontant(v, r.devise);
    const contacts = [r.telAppelAtelier, r.telWhatsAppAtelier].filter(Boolean).join(" · ");
    const ligne = (date, libelleLigne, detail, montant, couleur) =>
      "<tr><td class='date'>" + e(date) + "</td><td>" + e(libelleLigne) +
      (detail ? " <span style='color:#8b8fa8'>" + e(detail) + "</span>" : "") +
      "</td><td class='num' style='color:" + couleur + "'>" + m(montant) + "</td></tr>";

    return (
      "<!DOCTYPE html><html lang='fr'><head><meta charset='utf-8'>" +
      "<title>Récapitulatif " + e(libelle) + "</title><style>" +
      "@page{size:A4;margin:15mm}" +
      "*{box-sizing:border-box}" +
      "body{margin:0;font-family:'Helvetica Neue',Arial,sans-serif;color:#141636;font-size:11pt;line-height:1.45}" +
      ".entete{display:flex;align-items:flex-start;gap:12mm;border-bottom:2px solid #2E3192;padding-bottom:5mm}" +
      ".logo{width:22mm;height:22mm;object-fit:cover;border-radius:3mm}" +
      ".atelier{flex:1}.atelier h1{margin:0;font-size:18pt;color:#2E3192}" +
      ".atelier p{margin:1mm 0;font-size:10pt;color:#5b5f7d}" +
      ".titre{text-align:right}.titre h2{margin:0;font-size:14pt;letter-spacing:1px}" +
      ".titre p{margin:1mm 0;font-size:10pt;color:#5b5f7d}" +
      ".resume{display:flex;gap:3.5mm;margin:6mm 0 0}" +
      ".resume.petit .v{font-size:12.5pt}" +
      ".case{flex:1;border:1px solid #e3e5f0;border-radius:2mm;padding:3.5mm}" +
      ".case .l{font-size:9pt;text-transform:uppercase;letter-spacing:.8px;color:#5b5f7d}" +
      ".case .v{font-size:15pt;font-weight:750;margin-top:1mm}" +
      ".case .n{font-size:8.5pt;color:#8b8fa8;margin-top:.5mm}" +
      "h3{margin:8mm 0 2mm;font-size:11pt;color:#2E3192;text-transform:uppercase;letter-spacing:.8px}" +
      "table{width:100%;border-collapse:collapse}" +
      "th{text-align:left;font-size:9pt;text-transform:uppercase;letter-spacing:.5px;color:#5b5f7d;" +
        "border-bottom:1.5px solid #2E3192;padding:2mm}" +
      "td{padding:2mm;border-bottom:1px solid #e9eaf3;font-size:10.5pt}" +
      "td.date{white-space:nowrap;color:#5b5f7d;width:32mm}" +
      "td.num,th.num{text-align:right;white-space:nowrap}" +
      "tr.total td{border-top:1.5px solid #2E3192;border-bottom:0;font-weight:700;padding-top:2.5mm}" +
      ".pied{margin-top:10mm;border-top:1px solid #e3e5f0;padding-top:3mm;font-size:9.5pt;" +
        "color:#5b5f7d;display:flex;justify-content:space-between}" +
      ".vide{color:#8b8fa8;font-size:10pt;margin:2mm 0}" +
      "</style></head><body>" +

      "<div class='entete'>" +
        (r.logo ? "<img class='logo' src='" + Stockage.src(r.logo) + "' alt=''>" : "") +
        "<div class='atelier'><h1>" + e(r.nomAtelier) + "</h1>" +
          (r.slogan ? "<p>" + e(r.slogan) + "</p>" : "") +
          (contacts ? "<p>" + e(contacts) + "</p>" : "") + "</div>" +
        "<div class='titre'><h2>RÉCAPITULATIF DE PÉRIODE</h2>" +
          "<p>" + e(libelle) + "</p>" +
          "<p>Édité le " + e(Utils.fmtDate(Utils.aujourdhui())) + "</p></div>" +
      "</div>" +

      "<div class='resume'>" +
        "<div class='case'><div class='l'>Recettes</div><div class='v' style='color:#0F9D58'>" +
          m(stats.recettes) + "</div><div class='n'>" + stats.nbPaiements + " versement" +
          (stats.nbPaiements > 1 ? "s" : "") + "</div></div>" +
        "<div class='case'><div class='l'>Dépenses</div><div class='v' style='color:#D33A2C'>" +
          m(stats.totalDepenses) + "</div><div class='n'>" + stats.depenses.length + " dépense" +
          (stats.depenses.length > 1 ? "s" : "") + "</div></div>" +
        "<div class='case'><div class='l'>Bénéfice</div><div class='v' style='color:" +
          (stats.benefice >= 0 ? "#0F9D58" : "#D33A2C") + "'>" + m(stats.benefice) +
          "</div><div class='n'>recettes − dépenses</div></div>" +
      "</div>" +

      "<div class='resume petit'>" +
        "<div class='case'><div class='l'>Commandes créées</div><div class='v'>" +
          stats.commandesCreees + "</div><div class='n'>" + m(stats.montantCommandes) + " au total</div></div>" +
        "<div class='case'><div class='l'>Commandes livrées</div><div class='v'>" +
          stats.commandesLivrees + "</div><div class='n'>sur la période</div></div>" +
        "<div class='case'><div class='l'>Ventes boutique</div><div class='v'>" +
          m(stats.totalVentes) + "</div><div class='n'>" + stats.ventes.length + " facture" +
          (stats.ventes.length > 1 ? "s" : "") + " · " + stats.articlesVendus + " article" +
          (stats.articlesVendus > 1 ? "s" : "") + "</div></div>" +
        "<div class='case'><div class='l'>Reste à encaisser</div><div class='v' style='color:#D33A2C'>" +
          m(stats.soldesOuverts) + "</div><div class='n'>commandes et ventes non soldées</div></div>" +
      "</div>" +

      "<h3>Encaissements (" + stats.paiements.length + ")</h3>" +
      (stats.paiements.length
        ? "<table><thead><tr><th>Date</th><th>Origine</th><th class='num'>Montant</th></tr></thead><tbody>" +
          stats.paiements.map((p) => ligne(
            Utils.fmtDate(Utils.isoJour(new Date(p.date))),
            p.vente ? (p.vente.client || "Client au comptoir") : (p.commande ? p.commande.numero : ""),
            p.note || "", p.montant, "#0F9D58")).join("") +
          "<tr class='total'><td></td><td>Total des recettes</td><td class='num'>" +
            m(stats.recettes) + "</td></tr>" +
          "</tbody></table>"
        : "<p class='vide'>Aucun encaissement sur la période.</p>") +

      "<h3>Dépenses (" + stats.depenses.length + ")</h3>" +
      (stats.depenses.length
        ? "<table><thead><tr><th>Date</th><th>Libellé</th><th class='num'>Montant</th></tr></thead><tbody>" +
          stats.depenses.map((d) => ligne(
            Utils.fmtDate(d.dateDepense), d.libelle, d.note || "", d.montant, "#D33A2C")).join("") +
          "<tr class='total'><td></td><td>Total des dépenses</td><td class='num'>" +
            m(stats.totalDepenses) + "</td></tr>" +
          "</tbody></table>"
        : "<p class='vide'>Aucune dépense sur la période.</p>") +

      "<div class='pied'><span>" + e(r.nomAtelier) + " — récapitulatif de période</span>" +
        "<span>Bénéfice de la période : <b>" + m(stats.benefice) + "</b></span></div>" +
      "</body></html>"
    );
  }

  const imprimerRapport = (stats, bornes, libelle) =>
    Utils.imprimerA4("Récapitulatif de période", rapportA4(stats, bornes, libelle));

  /** Journal A4 de tous les versements de la période, du plus récent au plus ancien. */
  function journalA4(stats, libelle, nomParClient) {
    const r = lireReglages();
    const e = Utils.echapper;
    const m = (v) => Utils.fmtMontant(v, r.devise);
    const contacts = [r.telAppelAtelier, r.telWhatsAppAtelier].filter(Boolean).join(" · ");

    return (
      "<!DOCTYPE html><html lang='fr'><head><meta charset='utf-8'>" +
      "<title>Journal des versements</title><style>" +
      "@page{size:A4;margin:15mm}" +
      "*{box-sizing:border-box}" +
      "body{margin:0;font-family:'Helvetica Neue',Arial,sans-serif;color:#141636;font-size:11pt;line-height:1.45}" +
      ".entete{display:flex;align-items:flex-start;gap:12mm;border-bottom:2px solid #2E3192;padding-bottom:5mm}" +
      ".logo{width:22mm;height:22mm;object-fit:cover;border-radius:3mm}" +
      ".atelier{flex:1}.atelier h1{margin:0;font-size:18pt;color:#2E3192}" +
      ".atelier p{margin:1mm 0;font-size:10pt;color:#5b5f7d}" +
      ".titre{text-align:right}.titre h2{margin:0;font-size:14pt;letter-spacing:1px}" +
      ".titre p{margin:1mm 0;font-size:10pt;color:#5b5f7d}" +
      "table{width:100%;border-collapse:collapse;margin-top:7mm}" +
      "thead{display:table-header-group}" +   /* l'en-tête se répète à chaque page */
      "th{text-align:left;font-size:9pt;text-transform:uppercase;letter-spacing:.5px;color:#5b5f7d;" +
        "border-bottom:1.5px solid #2E3192;padding:2mm}" +
      "td{padding:2mm;border-bottom:1px solid #e9eaf3;font-size:10.5pt}" +
      "tr{page-break-inside:avoid}" +
      "td.date{white-space:nowrap;color:#5b5f7d;width:34mm}" +
      "td.num,th.num{text-align:right;white-space:nowrap}" +
      "tr.total td{border-top:1.5px solid #2E3192;border-bottom:0;font-weight:700;padding-top:2.5mm;font-size:12pt}" +
      ".vide{color:#8b8fa8;font-size:10pt;margin:4mm 0}" +
      ".pied{margin-top:8mm;border-top:1px solid #e3e5f0;padding-top:3mm;font-size:9.5pt;color:#5b5f7d}" +
      "</style></head><body>" +

      "<div class='entete'>" +
        (r.logo ? "<img class='logo' src='" + Stockage.src(r.logo) + "' alt=''>" : "") +
        "<div class='atelier'><h1>" + e(r.nomAtelier) + "</h1>" +
          (r.slogan ? "<p>" + e(r.slogan) + "</p>" : "") +
          (contacts ? "<p>" + e(contacts) + "</p>" : "") + "</div>" +
        "<div class='titre'><h2>JOURNAL DES VERSEMENTS</h2>" +
          "<p>" + e(libelle) + "</p>" +
          "<p>Édité le " + e(Utils.fmtDate(Utils.aujourdhui())) + "</p></div>" +
      "</div>" +

      (stats.paiements.length
        ? "<table><thead><tr><th>Date</th><th>Client</th><th>Référence</th>" +
            "<th>Nature</th><th class='num'>Montant</th></tr></thead><tbody>" +
          stats.paiements.map((p) => {
            const client = p.vente
              ? (p.vente.client || "Client au comptoir")
              : ((nomParClient && nomParClient[p.commande.clientId]) || "");
            const reference = p.vente ? p.vente.numero : p.commande.numero;
            return "<tr><td class='date'>" + e(Utils.fmtDateHeure(p.date)) + "</td>" +
              "<td>" + e(client) + "</td><td>" + e(reference) + "</td>" +
              "<td>" + e(p.vente ? "Vente boutique" : (p.note || "Versement")) + "</td>" +
              "<td class='num' style='color:#0F9D58'>" + m(p.montant) + "</td></tr>";
          }).join("") +
          "<tr class='total'><td colspan='4'>Total des versements (" + stats.paiements.length + ")</td>" +
            "<td class='num'>" + m(stats.recettes) + "</td></tr>" +
          "</tbody></table>"
        : "<p class='vide'>Aucun versement sur la période.</p>") +

      "<div class='pied'>" + e(r.nomAtelier) + " — journal des versements</div>" +
      "</body></html>"
    );
  }

  const imprimerJournal = (stats, libelle, nomParClient) =>
    Utils.imprimerA4("Journal des versements", journalA4(stats, libelle, nomParClient));

  /** Annuler une facture remet les articles en stock. */
  /**
   * Annuler une facture : remise en stock, trace au journal et
   * suppression, en une seule transaction côté serveur. L'application
   * faisait les trois séparément — rien ne garantissait qu'elles
   * aboutissent toutes, et la remise en stock ne laissait aucune trace.
   */
  const supprimerVente = (id) => Api.annulerVente(id);

  /* ---------- Stock ---------- */

  const listerMouvements = async (limite) => {
    const lignes = await Api.lister("mouvements_stock", "cree_le", false);
    return limite ? lignes.slice(0, limite) : lignes;
  };

  const LIBELLES_MOUVEMENT = {
    entree: "Approvisionnement",
    sortie: "Sortie",
    inventaire: "Inventaire",
    vente: "Vente",
    retour_vente: "Facture annulée",
  };

  const libelleMouvement = (type) => LIBELLES_MOUVEMENT[type] || type;

  const articlesVendus = (vente) =>
    (vente.lignes || []).reduce((somme, l) => somme + (Number(l.quantite) || 0), 0);

  /* ---------- Statistiques (recettes et dépenses) ---------- */

  async function paiementsSurPeriode(isoDebut, isoFin) {
    const commandes = await listerCommandes();
    const debut = Utils.versDate(isoDebut);
    const fin = Utils.versDate(isoFin);
    if (fin) fin.setHours(23, 59, 59, 999);
    const liste = [];
    for (const c of commandes) {
      for (const p of c.paiements || []) {
        const d = new Date(p.date);
        if (debut && d < debut) continue;
        if (fin && d > fin) continue;
        liste.push({ ...p, commande: c });
      }
    }
    liste.sort((a, b) => new Date(b.date) - new Date(a.date));
    return liste;
  }

  async function statsPeriode(isoDebut, isoFin) {
    const [commandes, toutesDepenses, toutesVentes] = await Promise.all([
      listerCommandes(), listerDepenses(), listerVentes(),
    ]);

    const debut = Utils.versDate(isoDebut);
    const fin = Utils.versDate(isoFin);
    if (fin) fin.setHours(23, 59, 59, 999);
    const dansPeriode = (t) => {
      const d = new Date(t);
      return (!debut || d >= debut) && (!fin || d <= fin);
    };

    const paiements = [];
    for (const c of commandes) {
      for (const p of c.paiements || []) {
        if (dansPeriode(p.date)) paiements.push({ ...p, commande: c });
      }
    }
    /* Les ventes en boutique comptent comme des encaissements du jour. */
    const ventes = toutesVentes.filter((v) => dansPeriode(v.creeLe));
    for (const v of ventes) {
      if (v.paye > 0) {
        paiements.push({
          id: v.id, montant: v.paye, date: new Date(v.creeLe).getTime(),
          note: "Vente " + v.numero, vente: v,
        });
      }
    }
    paiements.sort((a, b) => new Date(b.date) - new Date(a.date));

    const commandesCreees = commandes.filter((c) => dansPeriode(c.creeLe));
    const commandesLivrees = commandes.filter((c) => c.livreLe && dansPeriode(c.livreLe));
    const depenses = toutesDepenses.filter((d) =>
      (!isoDebut || d.dateDepense >= isoDebut) && (!isoFin || d.dateDepense <= isoFin));

    const recettes = paiements.reduce((somme, p) => somme + (Number(p.montant) || 0), 0);
    const totalDepenses = depenses.reduce((somme, d) => somme + d.montant, 0);
    const montantCommandes = commandesCreees.reduce((somme, c) => somme + (Number(c.montant) || 0), 0);
    const soldesOuverts = commandes
      .filter((c) => c.statut !== "livree" || soldeRestant(c) > 0)
      .reduce((somme, c) => somme + soldeRestant(c), 0) +
      toutesVentes.reduce((somme, v) => somme + Math.max(0, v.total - v.paye), 0);
    const totalVentes = ventes.reduce((somme, v) => somme + v.total, 0);

    const parJour = {};
    for (const p of paiements) {
      const jour = Utils.isoJour(new Date(p.date));
      parJour[jour] = (parJour[jour] || 0) + (Number(p.montant) || 0);
    }

    return {
      recettes,
      nbPaiements: paiements.length,
      paiements,
      depenses,
      totalDepenses,
      benefice: recettes - totalDepenses,
      commandesCreees: commandesCreees.length,
      commandesLivrees: commandesLivrees.length,
      montantCommandes,
      soldesOuverts,
      ventes,
      totalVentes,
      articlesVendus: ventes.reduce((somme, v) => somme + articlesVendus(v), 0),
      parJour,
    };
  }

  /* ---------- Messages WhatsApp ---------- */

  function messageCommande(commande, client, modele) {
    const r = lireReglages();
    return Utils.remplirModele(modele || r.modeleWhatsApp, {
      prenom: client && client.prenom ? client.prenom : Utils.nomComplet(client),
      nom: Utils.nomComplet(client),
      numero: commande.numero,
      description: commande.description || "à préciser",
      commentaire: commande.commentaire || "",
      atelier: r.nomAtelier,
      livraison: Utils.fmtDate(commande.dateLivraison),
      montant: Utils.fmtMontant(commande.montant, r.devise),
      acompte: Utils.fmtMontant(acompteVerse(commande), r.devise),
      paye: Utils.fmtMontant(totalPaye(commande), r.devise),
      solde: Utils.fmtMontant(soldeRestant(commande), r.devise),
    });
  }

  /* ---------- Export (copie de secours lisible) ---------- */

  async function exporter() {
    const [clients, commandes, depenses] = await Promise.all([
      listerClients(), listerCommandes(), listerDepenses(),
    ]);
    return {
      application: "atelier",
      version: 2,
      exporteLe: new Date().toISOString(),
      atelier: lireReglages(),
      clients, commandes, depenses,
    };
  }

  return {
    STATUTS, lireReglages, majReglages, bandeauAbonnement, utiliserCode,
    listerFormules, libelleFormule, resumeFormule,
    formuleOuvreAtelier, formuleOuvreVitrine,
    listerClients, lireClient, sauverClient, supprimerClient, chercherClients,
    listerCommandes, lireCommande, commandesDuClient, sauverCommande,
    changerStatut, ajouterPaiement, retirerPaiement, supprimerCommande,
    totalPaye, acompteVerse, soldeRestant, estEnRetard,
    photosDeCommande, ajouterPhoto, supprimerPhoto,
    listerDepenses, ajouterDepense, supprimerDepense,
    listerVentes, lireVente, enregistrerVente, supprimerVente, articlesVendus,
    listerMouvements, libelleMouvement,
    messageVente, lienWhatsAppVente, factureA4, imprimerFacture,
    rapportA4, imprimerRapport, journalA4, imprimerJournal,
    paiementsSurPeriode, statsPeriode, messageCommande, exporter,
  };
})();
