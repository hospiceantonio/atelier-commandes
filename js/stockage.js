/* =========================================================
   Stockage des médias — dépôt dans les buckets et lecture.

   Les images étaient rangées en base sous forme de data-url
   (base64) : chaque ligne lue transportait sa photo entière.
   Elles vont désormais dans les buckets de supabase/stockage.sql,
   et la base ne garde qu'un chemin.

   RIEN N'EST CASSÉ POUR AUTANT. Une colonne peut contenir :
     • une data-url  — l'ancien format, affiché tel quel ;
     • une URL http  — déjà résolue ;
     • un chemin     — le nouveau format, résolu ici.
   Les photos déjà en base continuent donc de s'afficher, sans
   migration ni interruption. Seuls les nouveaux envois vont
   dans les buckets.
   ========================================================= */
const Stockage = (() => {

  const VITRINE = "vitrine";
  const COMMANDES = "commandes";
  const BANNIERES = "bannieres";

  const estHerite = (v) => typeof v === "string" && v.indexOf("data:") === 0;
  const estUrl = (v) => typeof v === "string" && /^https?:\/\//.test(v);
  const estChemin = (v) => !!v && !estHerite(v) && !estUrl(v);

  /**
   * Source affichable d'une image publique. Accepte les trois formats :
   * une valeur héritée revient inchangée, un chemin devient une URL.
   */
  function src(valeur, bucket) {
    if (!valeur) return "";
    if (estHerite(valeur) || estUrl(valeur)) return valeur;
    try {
      return Api.urlPublique(bucket || VITRINE, valeur);
    } catch (_) {
      /* Client pas encore prêt : mieux vaut une image absente qu'une
         vue qui ne s'affiche pas du tout. */
      return "";
    }
  }

  /** Idem pour le bucket privé : une URL signée, donc asynchrone. */
  async function srcPrivee(valeur, secondes) {
    if (!valeur) return "";
    if (estHerite(valeur) || estUrl(valeur)) return valeur;
    try {
      return await Api.urlSignee(COMMANDES, valeur, secondes || 3600);
    } catch (_) {
      return "";
    }
  }

  /** Plusieurs URL signées d'un coup, dans l'ordre reçu. */
  function srcPriveesEnLot(valeurs, secondes) {
    return Promise.all((valeurs || []).map((v) => srcPrivee(v, secondes)));
  }

  /* ---------- Dépôt ---------- */

  /* Un suffixe aléatoire par fichier : deux envois successifs ne
     partagent jamais le même chemin, donc aucun cache à invalider. */
  const jeton = () =>
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);

  /* Le superadmin n'a pas d'atelier : quand il pose le logo d'un atelier
     qu'il vient de créer, il en passe l'identifiant explicitement. */
  const cheminAtelier = (force) => String(force || Api.atelierId() || "commun");

  /**
   * Compresse puis dépose. Renvoie le chemin à ranger en base.
   * `sousDossier` est relatif à l'atelier : « produits/<id> », « logo »…
   *
   * `source` est le fichier choisi, ou — et c'est ce qu'il faut préférer
   * — le Blob déjà préparé à la prise de vue par Utils.preparerImage,
   * signalé par `options.dejaPrete`. Le fichier rendu par Android n'est
   * lisible qu'un temps : le relire ICI échouait sur une photo pourtant
   * visible à l'écran. Un Blob, lui, vit en mémoire.
   */
  async function deposerImage(source, bucket, sousDossier, options) {
    const o = options || {};
    const blob = (o.dejaPrete && source instanceof Blob)
      ? source
      : (await Utils.compresserVersBlob(source, o.coteMax || 1100, o.qualite || 0.72)).blob;
    const dossier = bucket === BANNIERES ? "" : cheminAtelier(o.atelierId) + "/";
    const chemin = dossier + (sousDossier ? sousDossier + "/" : "") + jeton() + ".jpg";
    await Api.deposerFichier(bucket, chemin, blob, "image/jpeg");
    return chemin;
  }

  /** Retire les fichiers d'un lot ; les valeurs héritées sont ignorées. */
  async function retirer(valeurs, bucket) {
    const chemins = (valeurs || []).filter(estChemin);
    if (!chemins.length) return;
    try {
      await Api.supprimerFichiers(bucket || VITRINE, chemins);
    } catch (_) {
      /* Un fichier orphelin coûte quelques kilo-octets ; échouer ici
         empêcherait l'utilisateur de supprimer son produit. */
    }
  }

  return {
    VITRINE, COMMANDES, BANNIERES,
    estHerite, estChemin,
    src, srcPrivee, srcPriveesEnLot,
    deposerImage, retirer,
  };
})();
