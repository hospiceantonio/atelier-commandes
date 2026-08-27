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
  /** Administrateur de l'atelier : lui seul modifie et supprime. */
  const estAdmin = () => !!profil && profil.role === "admin";

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
    return data.user;
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
    lireParametres, majParametres, estAdmin,
    connexion, verifierCode, renvoyerCode, doubleFacteurExige, diagnosticJeton,
    creerCompte, creerCompteAdmin, deconnexion,
    lister, listerTranche, listerPar, lireLigne, inserer, mettreAJour, supprimerLigne, rpc,
  };
})();
