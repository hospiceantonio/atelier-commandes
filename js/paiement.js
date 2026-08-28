/* =========================================================
   Paiement de l'abonnement par KKiaPay (Mobile Money / carte).
   L'application ne crédite jamais rien : elle ouvre le widget
   avec la clé publique, puis attend que le serveur (webhook
   KKiaPay -> fonction Edge -> base) prolonge l'abonnement.
   ========================================================= */
const Paiement = (() => {

  let chargement = null;        // promesse de chargement du script k.js
  let ecouteurPose = false;
  let finAvantPaiement = null;  // abonnement_fin au moment d'ouvrir le widget
  let formuleAttendue = null;   // renseignée pour un changement de formule

  function config() {
    const p = Api.lireParametres();
    return p && p.kkiapay_cle_publique ? p : null;
  }

  /* Bouton affiché seulement si la clé publique est configurée
     et que le compte est bien celui d'un atelier. */
  const disponible = () => !!(config() && Api.lireAtelier());

  function chargerWidget() {
    if (window.openKkiapayWidget) return Promise.resolve();
    if (chargement) return chargement;
    chargement = new Promise((resoudre, rejeter) => {
      const script = document.createElement("script");
      script.src = "https://cdn.kkiapay.me/k.js";
      script.onload = () => resoudre();
      script.onerror = () => {
        chargement = null;
        rejeter(new Error("Paiement indisponible — vérifiez votre connexion Internet."));
      };
      document.head.appendChild(script);
    });
    return chargement;
  }

  function brancherEcouteur() {
    if (ecouteurPose) return;
    if (typeof window.addSuccessListener === "function") {
      window.addSuccessListener(surSucces);
      ecouteurPose = true;
    } else if (typeof window.addKkiapayListener === "function") {
      window.addKkiapayListener("success", surSucces);
      ecouteurPose = true;
    }
  }

  function surSucces() {
    attendreActivation();
  }

  const pause = (ms) => new Promise((r) => setTimeout(r, ms));

  /* Le crédit arrive par le webhook, quelques secondes après le
     paiement : on scrute l'abonnement au lieu de l'annoncer.

     Un changement de formule ne se reconnaît PAS à une date qui avance :
     le mois repart d'aujourd'hui, donc l'échéance peut reculer. C'est la
     formule elle-même qu'on guette dans ce cas. */
  async function attendreActivation() {
    UI.toast("Paiement reçu — activation en cours…", "ok");
    const avant = finAvantPaiement ? new Date(finAvantPaiement).getTime() : 0;
    const vise = formuleAttendue;
    const applique = (a) => vise
      ? a.formule === vise
      : !!(a.abonnement_fin && new Date(a.abonnement_fin).getTime() > avant);
    for (let essai = 0; essai < 40; essai++) {
      await pause(3000);
      let atelier = null;
      try { atelier = await Api.rafraichirAtelier(); } catch (_) { continue; }
      if (atelier && applique(atelier)) {
        UI.toast(vise ? "Nouvelle formule active — merci !" : "Abonnement prolongé — merci !", "ok");
        formuleAttendue = null;
        window.AppNaviguer();
        return;
      }
    }
    UI.toast("Paiement enregistré — l'activation peut prendre quelques minutes. " +
      "Réessayez « Vérifier à nouveau » un peu plus tard.", "erreur");
  }

  /**
   * Ouvre le widget de paiement.
   * `options.montant`  : à payer (par défaut, l'abonnement en cours) ;
   * `options.formule`  : code de la formule visée, pour un changement.
   */
  async function payer(options) {
    const o = options || {};
    const prm = config();
    const atelier = Api.lireAtelier();
    if (!prm || !atelier) {
      UI.toast("Paiement en ligne non configuré — contactez votre fournisseur.", "erreur");
      return;
    }
    try {
      await chargerWidget();
    } catch (err) {
      UI.toast(err.message, "erreur");
      return;
    }
    brancherEcouteur();
    finAvantPaiement = atelier.abonnement_fin;
    formuleAttendue = o.formule || null;
    /* Pas de numéro pré-rempli : en bac à sable seuls les numéros de
       test passent, et un champ facultatif vide casse le widget. */
    window.openKkiapayWidget({
      amount: Math.round(o.montant != null ? o.montant : atelier.abonnement_mensuel),
      key: prm.kkiapay_cle_publique,
      sandbox: !!prm.kkiapay_sandbox,
      position: "center",
      data: JSON.stringify({ atelier_id: atelier.id }),
    });
  }

  return { disponible, payer };
})();
