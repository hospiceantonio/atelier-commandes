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
    };
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
    statut: l.statut, dateLivraison: l.date_livraison, montant: Number(l.montant) || 0,
    paiements: l.paiements || [], livreLe: l.livre_le, creeLe: l.cree_le, modifieLe: l.modifie_le,
  };

  const photoVersApp = (l) => l && {
    id: l.id, commandeId: l.commande_id, dataUrl: l.data_url, creeLe: l.cree_le,
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

  /** La base supprime en cascade les commandes et photos du client. */
  const supprimerClient = (id) => Api.supprimerLigne("clients", id);

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

  const supprimerCommande = (id) => Api.supprimerLigne("commandes", id);

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

  const photosDeCommande = async (commandeId) =>
    (await Api.listerPar("photos", "commande_id", commandeId, "cree_le", true)).map(photoVersApp);

  const ajouterPhoto = async (commandeId, dataUrl) =>
    photoVersApp(await Api.inserer("photos", {
      atelier_id: Api.atelierId(), commande_id: commandeId, data_url: dataUrl,
    }));

  const supprimerPhoto = (id) => Api.supprimerLigne("photos", id);

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
    id: l.id, numero: l.numero, client: l.client || "", lignes: l.lignes || [],
    total: Number(l.total) || 0, paye: Number(l.paye) || 0, note: l.note || "", creeLe: l.cree_le,
  };

  async function listerVentes() {
    return (await Api.lister("ventes", "cree_le", false)).map(venteVersApp);
  }

  const lireVente = async (id) => venteVersApp(await Api.lireLigne("ventes", id));

  /** Le serveur vérifie le stock, le décrémente et numérote la facture. */
  async function enregistrerVente({ client, lignes, paye, note }) {
    if (!lignes || !lignes.length) throw new Error("Ajoutez au moins un article à la vente.");
    return venteVersApp(await Api.rpc("enregistrer_vente", {
      p_client: (client || "").trim(),
      p_lignes: lignes.map((l) => ({ produit_id: l.produitId, quantite: l.quantite })),
      p_paye: Math.max(0, Utils.lireNombre(paye)),
      p_note: (note || "").trim(),
    }));
  }

  /** Annuler une facture remet les articles en stock. */
  async function supprimerVente(id) {
    const vente = await lireVente(id);
    if (!vente) throw new Error("Facture introuvable.");
    for (const ligne of vente.lignes) {
      const produit = await Api.lireLigne("produits", ligne.produit_id);
      if (produit) {
        await Api.mettreAJour("produits", produit.id, {
          stock: (Number(produit.stock) || 0) + (Number(ligne.quantite) || 0),
          modifie_le: new Date().toISOString(),
        });
      }
    }
    await Api.supprimerLigne("ventes", id);
  }

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
    STATUTS, lireReglages, majReglages, bandeauAbonnement,
    listerClients, lireClient, sauverClient, supprimerClient, chercherClients,
    listerCommandes, lireCommande, commandesDuClient, sauverCommande,
    changerStatut, ajouterPaiement, retirerPaiement, supprimerCommande,
    totalPaye, acompteVerse, soldeRestant, estEnRetard,
    photosDeCommande, ajouterPhoto, supprimerPhoto,
    listerDepenses, ajouterDepense, supprimerDepense,
    listerVentes, lireVente, enregistrerVente, supprimerVente, articlesVendus,
    paiementsSurPeriode, statsPeriode, messageCommande, exporter,
  };
})();
