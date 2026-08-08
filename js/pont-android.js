/* =========================================================
   Pont vers l'enveloppe Android (APK) : les liens externes
   (WhatsApp, téléphone) et l'export de sauvegarde passent
   par le système. Sans effet dans un navigateur : le pont
   window.AndroidAtelier n'y existe pas.
   ========================================================= */
(() => {
  if (!window.AndroidAtelier) return;

  window.open = (url) => {
    if (url) window.AndroidAtelier.ouvrirLien(String(url));
    return null;
  };

  const telechargerWeb = Utils.telecharger;
  Utils.telecharger = (nomFichier, contenu, type) => {
    if (typeof contenu === "string") window.AndroidAtelier.enregistrerFichier(nomFichier, contenu);
    else telechargerWeb(nomFichier, contenu, type);
  };
})();
