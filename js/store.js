/* =========================================================
   Store — logique métier au-dessus de la base locale.

   Client   : { id, prenom, nom, tel, note, mesures{}, creeLe, modifieLe }
   Commande : { id, numero, clientId, description, statut,
                creeLe, dateLivraison, montant, paiements[],
                livreLe, modifieLe }
   Paiement : { id, montant, date, note }   (le 1er = acompte)
   Photo    : { id, commandeId, dataUrl, creeLe }
   ========================================================= */
const Store = (() => {

  const STATUTS = {
    en_cours: { label: "En cours", badge: "badge-info" },
    pret: { label: "Prête", badge: "badge-ok" },
    livree: { label: "Livrée", badge: "badge-fait" },
  };

  const REGLAGES_DEFAUT = {
    cle: "general",
    nomAtelier: "Mon atelier",
    devise: "FCFA",
    indicatif: "229",
    prochainNumero: 1,
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

  let reglages = { ...REGLAGES_DEFAUT };

  async function init() {
    const enregistres = await DB.lire("reglages", "general");
    if (enregistres) reglages = { ...REGLAGES_DEFAUT, ...enregistres };
    else await DB.ecrire("reglages", reglages);
    DB.rendrePersistant();
  }

  function lireReglages() {
    return { ...reglages };
  }

  async function majReglages(maj) {
    reglages = { ...reglages, ...maj, cle: "general" };
    await DB.ecrire("reglages", reglages);
    return lireReglages();
  }

  /* ---------- Clients ---------- */

  async function listerClients() {
    const clients = await DB.lireTout("clients");
    clients.sort((a, b) =>
      Utils.sansAccent(Utils.nomComplet(a)).localeCompare(Utils.sansAccent(Utils.nomComplet(b)), "fr"));
    return clients;
  }

  const lireClient = (id) => DB.lire("clients", id);

  async function sauverClient(donnees) {
    const maintenant = Date.now();
    const existant = donnees.id ? await DB.lire("clients", donnees.id) : null;
    const client = {
      id: donnees.id || Utils.uid("cli"),
      prenom: (donnees.prenom || "").trim(),
      nom: (donnees.nom || "").trim(),
      tel: (donnees.tel || "").trim(),
      note: (donnees.note || "").trim(),
      mesures: Mesures.nettoyer(donnees.mesures !== undefined ? donnees.mesures : (existant && existant.mesures)),
      creeLe: existant ? existant.creeLe : maintenant,
      modifieLe: maintenant,
    };
    if (!client.prenom && !client.nom) throw new Error("Le nom du client est obligatoire.");
    await DB.ecrire("clients", client);
    return client;
  }

  /** Supprime le client ET ses commandes (photos comprises). */
  async function supprimerClient(id) {
    const commandes = await DB.lireParIndex("commandes", "clientId", id);
    for (const c of commandes) await supprimerCommande(c.id);
    await DB.supprimer("clients", id);
  }

  function chercherClients(clients, terme) {
    const t = Utils.sansAccent(terme).trim();
    if (!t) return clients;
    return clients.filter((c) => {
      const texte = Utils.sansAccent(Utils.nomComplet(c) + " " + (c.tel || ""));
      return t.split(/\s+/).every((mot) => texte.includes(mot));
    });
  }

  /* ---------- Numérotation des commandes ---------- */

  /** "CMD-2026-0042" : lisible au téléphone comme sur un reçu. */
  function formaterNumero(n, annee) {
    return "CMD-" + annee + "-" + Utils.pad(n, 4);
  }

  async function reserverNumero() {
    const n = reglages.prochainNumero || 1;
    await majReglages({ prochainNumero: n + 1 });
    return formaterNumero(n, new Date().getFullYear());
  }

  /* ---------- Commandes ---------- */

  async function listerCommandes() {
    const commandes = await DB.lireTout("commandes");
    commandes.sort((a, b) => b.creeLe - a.creeLe);
    return commandes;
  }

  const lireCommande = (id) => DB.lire("commandes", id);
  const commandesDuClient = (clientId) => DB.lireParIndex("commandes", "clientId", clientId);

  /**
   * Crée ou met à jour une commande.
   * `donnees.acompte` n'est utilisé qu'à la création (premier paiement).
   */
  async function sauverCommande(donnees) {
    const maintenant = Date.now();
    const existante = donnees.id ? await DB.lire("commandes", donnees.id) : null;

    if (!donnees.clientId) throw new Error("Choisissez un client pour la commande.");
    const montant = Math.max(0, Utils.lireNombre(donnees.montant));

    const commande = {
      id: existante ? existante.id : Utils.uid("cmd"),
      numero: existante ? existante.numero : await reserverNumero(),
      clientId: donnees.clientId,
      description: (donnees.description || "").trim(),
      statut: donnees.statut || (existante ? existante.statut : "en_cours"),
      creeLe: existante ? existante.creeLe : maintenant,
      dateLivraison: donnees.dateLivraison || Utils.aujourdhui(),
      montant,
      paiements: existante ? existante.paiements.slice() : [],
      livreLe: existante ? existante.livreLe : null,
      modifieLe: maintenant,
    };

    if (!existante) {
      const acompte = Math.max(0, Utils.lireNombre(donnees.acompte));
      if (acompte > 0) {
        commande.paiements.push({
          id: Utils.uid("pay"),
          montant: Math.min(acompte, montant || acompte),
          date: maintenant,
          note: "Acompte",
        });
      }
    }

    majStatutLivraison(commande);
    await DB.ecrire("commandes", commande);
    return commande;
  }

  function majStatutLivraison(commande) {
    if (commande.statut === "livree" && !commande.livreLe) commande.livreLe = Date.now();
    if (commande.statut !== "livree") commande.livreLe = null;
  }

  async function changerStatut(id, statut) {
    const commande = await DB.lire("commandes", id);
    if (!commande) throw new Error("Commande introuvable.");
    commande.statut = statut;
    commande.modifieLe = Date.now();
    majStatutLivraison(commande);
    await DB.ecrire("commandes", commande);
    return commande;
  }

  async function ajouterPaiement(id, montant, note) {
    const commande = await DB.lire("commandes", id);
    if (!commande) throw new Error("Commande introuvable.");
    const v = Utils.lireNombre(montant);
    if (v <= 0) throw new Error("Le montant doit être supérieur à zéro.");
    const solde = soldeRestant(commande);
    if (v > solde) throw new Error("Ce paiement dépasse le solde restant (" + Utils.fmtMontant(solde, reglages.devise) + ").");
    commande.paiements.push({
      id: Utils.uid("pay"),
      montant: v,
      date: Date.now(),
      note: (note || "").trim() || (commande.paiements.length ? "Versement" : "Acompte"),
    });
    commande.modifieLe = Date.now();
    await DB.ecrire("commandes", commande);
    return commande;
  }

  async function retirerPaiement(idCommande, idPaiement) {
    const commande = await DB.lire("commandes", idCommande);
    if (!commande) throw new Error("Commande introuvable.");
    commande.paiements = commande.paiements.filter((p) => p.id !== idPaiement);
    commande.modifieLe = Date.now();
    await DB.ecrire("commandes", commande);
    return commande;
  }

  async function supprimerCommande(id) {
    await DB.supprimerParIndex("photos", "commandeId", id);
    await DB.supprimer("commandes", id);
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

  const photosDeCommande = async (commandeId) => {
    const photos = await DB.lireParIndex("photos", "commandeId", commandeId);
    photos.sort((a, b) => a.creeLe - b.creeLe);
    return photos;
  };

  async function ajouterPhoto(commandeId, dataUrl) {
    const photo = { id: Utils.uid("pho"), commandeId, dataUrl, creeLe: Date.now() };
    await DB.ecrire("photos", photo);
    return photo;
  }

  const supprimerPhoto = (id) => DB.supprimer("photos", id);

  async function nombrePhotosParCommande() {
    const photos = await DB.lireTout("photos");
    const table = {};
    for (const p of photos) table[p.commandeId] = (table[p.commandeId] || 0) + 1;
    return table;
  }

  /* ---------- Statistiques de recettes ----------
     Une recette = un paiement encaissé (acompte ou versement),
     compté le jour où l'argent est reçu. */

  async function paiementsSurPeriode(isoDebut, isoFin) {
    const commandes = await DB.lireTout("commandes");
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
    liste.sort((a, b) => b.date - a.date);
    return liste;
  }

  async function statsPeriode(isoDebut, isoFin) {
    const paiements = await paiementsSurPeriode(isoDebut, isoFin);
    const commandes = await DB.lireTout("commandes");

    const debut = Utils.versDate(isoDebut);
    const fin = Utils.versDate(isoFin);
    if (fin) fin.setHours(23, 59, 59, 999);
    const dansPeriode = (t) => {
      const d = new Date(t);
      return (!debut || d >= debut) && (!fin || d <= fin);
    };

    const commandesCreees = commandes.filter((c) => dansPeriode(c.creeLe));
    const commandesLivrees = commandes.filter((c) => c.livreLe && dansPeriode(c.livreLe));

    const recettes = paiements.reduce((somme, p) => somme + (Number(p.montant) || 0), 0);
    const montantCommandes = commandesCreees.reduce((somme, c) => somme + (Number(c.montant) || 0), 0);
    const soldesOuverts = commandes
      .filter((c) => c.statut !== "livree" || soldeRestant(c) > 0)
      .reduce((somme, c) => somme + soldeRestant(c), 0);

    /* Recettes regroupées par jour pour le graphique. */
    const parJour = {};
    for (const p of paiements) {
      const jour = Utils.isoJour(new Date(p.date));
      parJour[jour] = (parJour[jour] || 0) + (Number(p.montant) || 0);
    }

    return {
      recettes,
      nbPaiements: paiements.length,
      paiements,
      commandesCreees: commandesCreees.length,
      commandesLivrees: commandesLivrees.length,
      montantCommandes,
      soldesOuverts,
      parJour,
    };
  }

  /* ---------- Messages WhatsApp ---------- */

  function messageCommande(commande, client, modele) {
    const r = reglages;
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

  /* ---------- Sauvegarde / restauration ---------- */

  async function exporter() {
    const [clients, commandes, photos] = await Promise.all([
      DB.lireTout("clients"), DB.lireTout("commandes"), DB.lireTout("photos"),
    ]);
    return {
      application: "atelier",
      version: 1,
      exporteLe: new Date().toISOString(),
      reglages: lireReglages(),
      clients, commandes, photos,
    };
  }

  async function importer(donnees) {
    if (!donnees || donnees.application !== "atelier" || !Array.isArray(donnees.clients)) {
      throw new Error("Ce fichier n'est pas une sauvegarde de l'application.");
    }
    await Promise.all([DB.vider("clients"), DB.vider("commandes"), DB.vider("photos")]);
    await DB.ecrireLot("clients", donnees.clients);
    await DB.ecrireLot("commandes", donnees.commandes || []);
    // Les photos une par une : un lot trop gros peut dépasser la mémoire d'une transaction.
    for (const photo of donnees.photos || []) await DB.ecrire("photos", photo);
    if (donnees.reglages) await majReglages({ ...donnees.reglages, cle: "general" });
    return {
      clients: donnees.clients.length,
      commandes: (donnees.commandes || []).length,
      photos: (donnees.photos || []).length,
    };
  }

  return {
    STATUTS, init, lireReglages, majReglages,
    listerClients, lireClient, sauverClient, supprimerClient, chercherClients,
    listerCommandes, lireCommande, commandesDuClient, sauverCommande,
    changerStatut, ajouterPaiement, retirerPaiement, supprimerCommande,
    totalPaye, acompteVerse, soldeRestant, estEnRetard,
    photosDeCommande, ajouterPhoto, supprimerPhoto, nombrePhotosParCommande,
    paiementsSurPeriode, statsPeriode, messageCommande,
    exporter, importer, formaterNumero,
  };
})();
