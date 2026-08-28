/* =========================================================
   Api — session et accès aux données Supabase.
   Garde en mémoire le profil connecté et son atelier ;
   toutes les vues passent par le Store, qui passe par ici.
   ========================================================= */
const Api = (() => {

  let client = null;
  let session = null;
  let profil = null;
  let atelier = null;
  let parametres = null;

  const ERREURS = {
    "Invalid login credentials": "Email ou mot de passe incorrect.",
    "User already registered": "Un compte existe déjà avec cet email.",
    "Email not confirmed": "Email non confirmé — désactivez « Confirm email » dans Supabase (Authentication → Providers → Email).",
    "Password should be at least 6 characters": "Le mot de passe doit faire au moins 6 caractères.",
    "Failed to fetch": "Connexion impossible — vérifiez Internet et la configuration Supabase.",
    /* PostgREST quand .single() ne reçoit aucune ligne : l'écriture n'a
       rien touché, en général parce que le RLS a écarté la ligne visée. */
    "Cannot coerce the result to a single JSON object":
      "Aucune ligne correspondante — l'élément n'existe pas ou ne vous est pas accessible.",
  };

  function traduire(erreur) {
    if (!erreur) return "Erreur inconnue";
    const message = erreur.message || String(erreur);
    for (const [cle, fr] of Object.entries(ERREURS)) {
      if (message.includes(cle)) return fr;
    }
    return message;
  }

  const configOk = () =>
    !!(window.ATELIER_CONFIG && ATELIER_CONFIG.supabaseUrl && ATELIER_CONFIG.supabaseAnonKey);
  const bibliothequeOk = () => !!(window.supabase && window.supabase.createClient);

  async function init() {
    client = window.supabase.createClient(ATELIER_CONFIG.supabaseUrl, ATELIER_CONFIG.supabaseAnonKey);
    const { data } = await client.auth.getSession();
    session = (data && data.session) || null;
    if (session) await chargerContexte();
    else await chargerParametres();
  }

  /** Les paramètres sont publics (clé KKiaPay, contact) : lisibles sans compte. */
  async function chargerParametres() {
    const { data: prm } = await client.from("parametres").select("*").eq("id", 1).single();
    parametres = prm || null;
  }

  async function chargerContexte() {
    profil = null;
    atelier = null;
    if (!session) return;
    await chargerParametres();
    const { data: p } = await client.from("profils").select("*").eq("id", session.user.id).single();
    if (!p) return;
    profil = p;
    if (p.atelier_id) {
      const { data: a } = await client.from("ateliers").select("*").eq("id", p.atelier_id).single();
      atelier = a || null;
    }
  }

  const connecte = () => !!session;
  const role = () => (profil ? profil.role : null);
  const lireProfil = () => profil;
  const lireAtelier = () => atelier;
  const atelierId = () => (profil ? profil.atelier_id : null);
  const lireParametres = () => parametres;
  /** Administrateur de l'atelier : lui seul touche aux réglages. */
  const estAdmin = () => !!profil && profil.role === "admin";

  /* ---------- Droits d'un modérateur ----------
     Réglés un par un par l'administrateur (voir supabase/droits.sql).
     Le serveur applique les mêmes règles : ceci n'est que le confort de
     navigation — masquer un bouton n'a jamais fermé une porte. */

  /* Ce qu'un modérateur pouvait faire avant que les droits existent.
     Sert de repli quand la colonne n'est pas encore en base. */
  const DROITS_HISTORIQUES = {
    commande_creer: true, vente_creer: true, commande_recap: true,
  };

  const DROITS = [
    { cle: "commande_creer", libelle: "Créer une commande" },
    { cle: "commande_modifier", libelle: "Modifier une commande",
      aide: "Inclut le changement de statut et les encaissements." },
    { cle: "commande_supprimer", libelle: "Supprimer une commande" },
    { cle: "commande_recap", libelle: "Envoyer le récapitulatif WhatsApp" },
    { cle: "vente_creer", libelle: "Établir une facture" },
    { cle: "vente_supprimer", libelle: "Annuler une facture",
      aide: "Les articles retournent en stock." },
    { cle: "recettes_voir", libelle: "Consulter les recettes",
      aide: "Ouvre l'onglet Recettes et la lecture des dépenses." },
    { cle: "depense_ajouter", libelle: "Ajouter une dépense" },
    { cle: "recettes_recap", libelle: "Imprimer le Récap A4",
      aide: "Demande aussi « Consulter les recettes »." },
    { cle: "stock_approvisionner", libelle: "Approvisionner le stock" },
    { cle: "stock_sortie", libelle: "Sortir du stock",
      aide: "Casse, perte, cadeau — le motif reste obligatoire." },
    { cle: "stock_inventaire", libelle: "Faire l'inventaire",
      aide: "Cale le stock sur ce qui est compté." },
  ];

  /* Le menu de stock ne s'affiche que si l'un des trois est accordé. */
  const aDroitStock = () =>
    aDroit("stock_approvisionner") || aDroit("stock_sortie") || aDroit("stock_inventaire");

  function aDroit(cle) {
    if (!profil) return false;
    if (profil.role === "admin" || profil.role === "superadmin") return true;
    if (profil.role !== "moderateur") return false;
    const d = profil.droits || DROITS_HISTORIQUES;
    return d[cle] === true;
  }

  /** Droits d'un membre de l'équipe, complétés des clés absentes. */
  function lireDroits(membre) {
    const source = (membre && membre.droits) || DROITS_HISTORIQUES;
    const complet = {};
    for (const d of DROITS) complet[d.cle] = source[d.cle] === true;
    return complet;
  }

  async function majParametres(objet) {
    parametres = await mettreAJour("parametres", 1, { ...objet, modifie_le: new Date().toISOString() });
    return parametres;
  }

  /* ---------- Connexion ----------
     Sans double facteur, le mot de passe suffit. Avec, la connexion se
     fait en deux temps : le mot de passe d'abord, puis un code reçu par
     email. Le serveur exige les deux (voir double_facteur_ok dans
     supabase/schema.sql) : sauter l'écran du code ne donne accès à rien. */

  const doubleFacteurExige = () => !!(parametres && parametres.double_facteur);

  /**
   * Premier facteur. Renvoie { termine: true } si la session est utilisable
   * telle quelle, ou { termine: false, email } s'il reste le code à saisir.
   */
  async function connexion(email, motDePasse) {
    const { data, error } = await client.auth.signInWithPassword({ email, password: motDePasse });
    if (error) throw new Error(traduire(error));
    session = data.session;

    /* Les paramètres sont publics : ils ont pu être lus avant la connexion. */
    if (!parametres) await chargerParametres();
    if (!doubleFacteurExige()) {
      await chargerContexte();
      return { termine: true };
    }

    /* Le serveur note que le mot de passe vient d'être donné, puis un code
       part par email. La session ouverte ici ne lit encore rien. */
    const { error: eNote } = await client.rpc("enregistrer_mot_de_passe");
    if (eNote) throw new Error(traduire(eNote));

    const { error: eCode } = await client.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    if (eCode) throw new Error(traduire(eCode));

    return { termine: false, email };
  }

  /** Second facteur : le code reçu par email (6 à 10 chiffres selon
      le réglage « Email OTP Length » du projet Supabase). */
  async function verifierCode(email, code) {
    const { data, error } = await client.auth.verifyOtp({
      email,
      token: String(code || "").trim(),
      type: "email",
    });
    if (error) throw new Error(traduire(error));
    session = (data && data.session) || null;
    if (!session) throw new Error("Code accepté mais session absente — réessayez.");
    await chargerContexte();
    if (!profil) {
      /* Le serveur refuse encore la session : inutile de laisser croire
         que tout va bien, le reste de l'application serait vide. */
      throw new Error("Second facteur refusé par le serveur. Reprenez la connexion.");
    }
    return true;
  }

  /** Renvoie un nouveau code à la même adresse. */
  async function renvoyerCode(email) {
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    if (error) throw new Error(traduire(error));
  }

  /** Contenu du jeton : sert au superadmin à vérifier avant d'activer. */
  async function diagnosticJeton() {
    const { data, error } = await client.rpc("diagnostic_jeton");
    if (error) throw new Error(traduire(error));
    return data;
  }

  /* ---------- Formules et inscription libre ---------- */

  /** Les formules sont lisibles sans compte : l'écran d'inscription
      affiche les tarifs avant que la personne n'ait ouvert de session. */
  async function listerFormules() {
    const { data, error } = await client.from("formules").select("*").order("ordre");
    if (error) throw new Error(traduire(error));
    return data || [];
  }

  /**
   * Ouvre la maison du compte connecté. Le tarif n'est PAS envoyé : le
   * serveur le lit dans la formule choisie (creer_mon_atelier, dans
   * supabase/formules.sql). Sans cela, on s'abonnerait à zéro franc.
   */
  async function creerMonAtelier({ nom, formule, slogan, telWhatsApp, telAppel }) {
    const cree = await rpc("creer_mon_atelier", {
      p_nom: nom,
      p_formule: formule,
      p_slogan: slogan || "",
      p_tel_whatsapp: telWhatsApp || "",
      p_tel_appel: telAppel || "",
    });
    /* Le profil vient de recevoir son atelier : sans ce rechargement, le
       reste de l'application croirait le compte encore sans maison. */
    await chargerContexte();
    return cree;
  }

  /**
   * Demande de changement de formule. Ne change rien à l'abonnement :
   * note l'intention et renvoie le prix à payer, lu dans la table.
   * C'est le paiement qui applique le changement, pas cet appel.
   */
  const demanderChangementFormule = (formule) =>
    rpc("demander_changement_formule", { p_formule: formule });

  const annulerChangementFormule = () => rpc("annuler_changement_formule");

  /* ---------- Stock ----------
     Toute variation passe par le serveur : il bouge le stock et écrit
     le journal dans la même transaction (supabase/stock.sql). Le client
     n'écrit jamais la colonne « stock » en direct. */

  const approvisionnerStock = (produit, quantite, motif) =>
    rpc("approvisionner_stock", { p_produit: produit, p_quantite: quantite, p_motif: motif || "" });

  const sortirStock = (produit, quantite, motif) =>
    rpc("sortir_stock", { p_produit: produit, p_quantite: quantite, p_motif: motif });

  /** `lignes` : [{ produit_id, compte }] — ce qu'on a compté, pas l'écart. */
  const inventorierStock = (lignes) =>
    rpc("inventorier_stock", { p_lignes: lignes });

  const annulerVente = (vente) => rpc("annuler_vente", { p_vente: vente });

  /* Modules ouverts par la formule. Le serveur applique les mêmes règles
     (module_atelier / module_vitrine) : ceci n'est que le confort. */
  const formuleCourante = () => (atelier && atelier.formule) || "atelier_vitrine";
  const aModuleAtelier = () => ["atelier", "atelier_vitrine"].indexOf(formuleCourante()) >= 0;
  const aModuleVitrine = () => ["vitrine", "atelier_vitrine"].indexOf(formuleCourante()) >= 0;

  /** Auto-inscription (compte inerte tant qu'aucun atelier n'y est relié). */
  async function creerCompte(email, motDePasse, nomComplet, telephone) {
    const { data, error } = await client.auth.signUp({
      email,
      password: motDePasse,
      options: { data: { nom_complet: nomComplet || "", telephone: telephone || "" } },
    });
    if (error) throw new Error(traduire(error));
    return data.user;
  }

  async function deconnexion() {
    try { await client.auth.signOut(); } catch (_) { /* session déjà close */ }
    session = null;
    profil = null;
    atelier = null;
  }

  /**
   * Création d'un compte administrateur par le superadmin, via un client
   * séparé pour ne pas remplacer sa propre session.
   */
  async function creerCompteAdmin(email, motDePasse, nomComplet, telephone) {
    const secondaire = window.supabase.createClient(
      ATELIER_CONFIG.supabaseUrl, ATELIER_CONFIG.supabaseAnonKey,
      { auth: { storageKey: "atelier-creation-compte", persistSession: false, autoRefreshToken: false } }
    );
    const { data, error } = await secondaire.auth.signUp({
      email,
      password: motDePasse,
      options: { data: { nom_complet: nomComplet || "", telephone: telephone || "" } },
    });
    if (error) throw new Error(traduire(error));
    if (!data.user) throw new Error("Création du compte impossible.");
    /* Quand « Confirm email » est actif, Supabase ne dit PAS que l'adresse
       est déjà prise : pour ne pas révéler qui possède un compte, il
       renvoie un utilisateur factice, sans identité rattachée. Sans ce
       contrôle, l'échec ne surgissait qu'au rattachement du profil, sous
       la forme « Cannot coerce the result to a single JSON object ». */
    if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error("Un compte existe déjà avec cet email.");
    }
    return data.user;
  }

  /**
   * Rattache un compte à un atelier : un modérateur ajouté par son
   * administrateur, ou l'administrateur d'un atelier créé par le
   * superadmin.
   *
   * EN DEUX TEMPS, ET C'EST LE POINT DÉLICAT. On n'utilise pas
   * « update().select() », parce que PostgreSQL applique la règle de
   * LECTURE aux lignes qu'un UPDATE ... RETURNING doit rendre — et la
   * ligne visée, à cet instant, n'est pas encore rattachée à l'atelier :
   * profils_modification laisse l'administrateur l'écrire,
   * profils_lecture ne le laisse pas la lire. L'écriture passait donc,
   * et ne renvoyait rien : l'écran annonçait un échec sur une opération
   * réussie.
   *
   * On écrit d'abord, on relit ensuite. Après l'écriture, la ligne porte
   * l'atelier : elle est lisible, et sa présence prouve que ça a marché.
   */
  async function rattacherProfil(id, objet) {
    const { error } = await client.from("profils").update(objet).eq("id", id);
    if (error) throw new Error(traduire(error));

    const { data, error: eLecture } = await client.from("profils")
      .select("*").eq("id", id);
    if (eLecture) throw new Error(traduire(eLecture));
    if (!data || !data.length) {
      /* Rien à relire : l'écriture n'a rien touché. Deux causes, et on ne
         peut pas les distinguer d'ici — autant nommer les deux. */
      throw new Error(
        "Compte non rattaché : cette adresse est peut-être déjà utilisée " +
        "ailleurs. Essayez une autre adresse.");
    }
    return data[0];
  }

  /* ---------- Fichiers (buckets de supabase/stockage.sql) ----------
     Les règles d'accès sont posées côté serveur : elles comparent le
     premier dossier du chemin à l'atelier de la session. Ici on ne fait
     que transmettre. */

  async function deposerFichier(bucket, chemin, blob, typeMime) {
    const { error } = await client.storage.from(bucket).upload(chemin, blob, {
      contentType: typeMime || (blob && blob.type) || "image/jpeg",
      upsert: true,
      cacheControl: "31536000",   /* une année : le chemin change à chaque version */
    });
    if (error) throw new Error(traduire(error));
    return chemin;
  }

  function urlPublique(bucket, chemin) {
    const { data } = client.storage.from(bucket).getPublicUrl(chemin);
    return (data && data.publicUrl) || "";
  }

  /** Bucket privé : une URL valable un temps limité. */
  async function urlSignee(bucket, chemin, secondes) {
    const { data, error } = await client.storage.from(bucket)
      .createSignedUrl(chemin, secondes || 3600);
    if (error) throw new Error(traduire(error));
    return (data && data.signedUrl) || "";
  }

  async function supprimerFichiers(bucket, chemins) {
    if (!chemins || !chemins.length) return;
    const { error } = await client.storage.from(bucket).remove(chemins);
    if (error) throw new Error(traduire(error));
  }

  /* ---------- Accès aux tables (le RLS borne chaque atelier) ---------- */

  function verifier({ data, error }) {
    if (error) throw new Error(traduire(error));
    return data;
  }

  async function lister(table, colonneOrdre, ascendant) {
    let requete = client.from(table).select("*");
    if (colonneOrdre) requete = requete.order(colonneOrdre, { ascending: !!ascendant });
    return verifier(await requete) || [];
  }

  /**
   * Une tranche de lignes seulement (bornes incluses). La vitrine s'en
   * sert pour ne pas rapatrier tout le catalogue — et ses photos — au
   * premier écran.
   */
  async function listerTranche(table, colonneOrdre, ascendant, debut, fin) {
    let requete = client.from(table).select("*");
    if (colonneOrdre) requete = requete.order(colonneOrdre, { ascending: !!ascendant });
    return verifier(await requete.range(debut, fin)) || [];
  }

  async function listerPar(table, colonne, valeur, colonneOrdre, ascendant) {
    let requete = client.from(table).select("*").eq(colonne, valeur);
    if (colonneOrdre) requete = requete.order(colonneOrdre, { ascending: !!ascendant });
    return verifier(await requete) || [];
  }

  async function lireLigne(table, id) {
    const { data } = await client.from(table).select("*").eq("id", id).single();
    return data || null;
  }

  async function inserer(table, objet) {
    return verifier(await client.from(table).insert(objet).select("*").single());
  }

  async function mettreAJour(table, id, objet) {
    return verifier(await client.from(table).update(objet).eq("id", id).select("*").single());
  }

  /** Même chose pour une table dont la clé n'est pas « id » — les
      formules sont identifiées par leur code. */
  async function mettreAJourPar(table, colonne, valeur, objet) {
    return verifier(await client.from(table).update(objet).eq(colonne, valeur).select("*").single());
  }

  async function supprimerLigne(table, id) {
    const { error } = await client.from(table).delete().eq("id", id);
    if (error) throw new Error(traduire(error));
  }

  async function rpc(nom, params) {
    return verifier(await client.rpc(nom, params || {}));
  }

  async function rafraichirAtelier() {
    if (profil && profil.atelier_id) atelier = await lireLigne("ateliers", profil.atelier_id);
    return atelier;
  }

  return {
    configOk, bibliothequeOk, init, chargerContexte,
    connecte, role, lireProfil, lireAtelier, atelierId, rafraichirAtelier,
    lireParametres, majParametres, estAdmin, aDroit, aDroitStock, lireDroits, DROITS,
    connexion, verifierCode, renvoyerCode, doubleFacteurExige, diagnosticJeton,
    creerCompte, creerCompteAdmin, rattacherProfil, deconnexion,
    listerFormules, creerMonAtelier, formuleCourante, aModuleAtelier, aModuleVitrine,
    demanderChangementFormule, annulerChangementFormule,
    approvisionnerStock, sortirStock, inventorierStock, annulerVente,
    lister, listerTranche, listerPar, lireLigne, inserer, mettreAJour, mettreAJourPar,
    supprimerLigne, rpc,
    deposerFichier, urlPublique, urlSignee, supprimerFichiers,
  };
})();
