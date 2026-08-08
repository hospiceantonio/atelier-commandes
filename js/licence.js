/* =========================================================
   Licence — essai gratuit, abonnement mensuel via KKiaPay,
   ou code de déblocage définitif.

   Sans serveur : la vérification se fait dans l'application.
   Les codes ne sont stockés qu'en empreintes SHA-256 (illisibles) ;
   les codes en clair restent chez le vendeur.
   Pour générer de nouveaux codes : node tools/generer-codes.js
   ========================================================= */
const Licence = (() => {

  const CONFIG = {
    prixMensuel: 5000,          // FCFA par mois
    joursEssai: 14,             // essai gratuit à la première installation
    joursParPaiement: 31,       // durée ajoutée par paiement KKiaPay
    // Clé PUBLIQUE KKiaPay du vendeur (https://kkiapay.me, tableau de bord
    // -> Développeurs). Tant qu'elle est vide, seul le code de déblocage
    // est proposé sur l'écran de paiement.
    cleKkiapayPublique: "",
    kkiapaySandbox: false,      // true = paiements de test KKiaPay
    contactVendeur: "",         // ex. "+229 97 00 00 00" (affiché aux clients)
    // Empreintes SHA-256 des codes de déblocage définitif.
    empreintesCodes: [
    "c69c9c9c15d110bfd57e079efd91f0fcea623d7d80d10ccf7091b8a42bb6a58d",
    "5f8421daf4b080e381eb73bbb3567bf84dafde20ee025b60844a7038d68fec12",
    "201b8fb803e6b9024ece1782f683577213e94fac9eda84e84dc88b0d16e0d071",
    "f918e46d15ab7d18cea944715f2a6433247a27be55d8bc4b97acc048db8aca5f",
    "120f6c25bb67a56d50f2c1915e25122057e4a5bfdb1086589a2482befcaa5f73",
    "2e5d22aa8cf45326477dcca4c2474a1cf8598d9189b43cead6fca2d8bd651a9f",
    "c84443cb5532c79578431fd5ee447390a27f978a41cc5c4ab7e327e1d586ed89",
    "997b31736a63805ce39fd3dea0a0f0058302250f52becbd16ac9188fd8b95067",
    "1d2d780058f9981706e878d971257401a8fbd299234477958672e9ea82f819cc",
    "1d3a4b39e01385a67add9038dc4e7029512d6cfff46f17c6a885907f257c9d5c",
    "9dc168e86830a1439b443a96df72b7e02b76fc8dfe45dd42eb8d01391510d7a2",
    "a28a6cd0ebeaffffbcf202e4474dc70d05c3de5bd97b5a0162e032d00ada550a",
    "391395623181aadbb83ac8a693d4ef344e08285290955b03a236fec50c3f6e10",
    "0d3ae01342c7a8d21469997e2e69d28569412fd3be702966b8450738012c3f8f",
    "cf11a8d5605fe22eb57b5b8811b63ac4082e4cfe8ca66ad573e4b570062964a9",
    "d88179095b1a031738b79a174c40b2880e1aca7acc5ef0ea38e9e10b70072964",
    "4ace9ee49a5a892b45d9869799770de8c2e116f616b0bc7e72b10e4deeb4e0f0",
    "64d97835f967ceea73e785cd0d542eef950255d27de71ab7075af6fe4c4f274a",
    "8757a201ced72b1bc2f62b33cf68ba2594ab0cd979353c3ae7e89da5740f163c",
    "41ee26567b88b479060b34b5d412d791d92d0ae6301bddea2b504a80974b87c8",
    "c1a3e64d1e25418fb5118e3980b935785b4c51642553abe45cb0b801f6c0a5ae",
    "ad49fdc5e330cdda982c496a75c4b9a6d23b02bf45f611131e835615209d8088",
    "eaddd7ccc6c3bbf31eb5949c89920e93c3c1e10b2ee65bf5359115ecf012b61c",
    "a8b0be23abe7044536ee3854a6ddd8107f69dd8b964d18c22c01d75029c04740",
    "26c567253f70889f86c01cb1c18fa3e61dbe300b19e791df7eba6d780c9589ac",
    "b9f78d3deb2601a703044f96d348bca1712235eed3f5d5f962597b6d696b8337",
    "74c83577bac19d35b236079acdc72fcee0b17870480c1ef64b59717c79230797",
    "46a8302fe26611aec4fc146499cf4f4b3a20083d118dce66b742bafde4518e65",
    "02170c75b26ef36b7907cffe67d46ba6517d567f19176be7d89873f788b28d3c",
    "c66a3713443da59d611b3b360c860895baf8a6d7d99e54578b84e9c851ef2542",
    ],
  };

  const JOUR = 86400000;
  let etat = null; // enregistrement "licence" de la base

  /* ---------- Base ---------- */

  async function init() {
    etat = await DB.lire("reglages", "licence");
    const maintenant = Date.now();
    if (!etat) {
      etat = {
        cle: "licence",
        installeLe: maintenant,
        finAbonnement: null,
        complet: false,
        codeUtilise: null,
        transactions: [],
        dernierUsage: maintenant,
      };
      await DB.ecrire("reglages", etat);
      return;
    }
    // Garde-fou : une horloge reculée de plus d'un jour fige l'abonnement.
    if (maintenant < (etat.dernierUsage || 0) - JOUR) {
      etat.horlogeSuspecte = true;
    } else {
      etat.horlogeSuspecte = false;
      etat.dernierUsage = Math.max(etat.dernierUsage || 0, maintenant);
    }
    await DB.ecrire("reglages", etat);
  }

  function statut() {
    if (!etat) return { code: "expire", joursRestants: 0 };
    const maintenant = Date.now();
    if (etat.complet) return { code: "complet", joursRestants: Infinity };
    if (!etat.horlogeSuspecte && etat.finAbonnement && maintenant <= etat.finAbonnement) {
      return {
        code: "abonnement",
        joursRestants: Math.max(1, Math.ceil((etat.finAbonnement - maintenant) / JOUR)),
        fin: etat.finAbonnement,
      };
    }
    const finEssai = (etat.installeLe || 0) + CONFIG.joursEssai * JOUR;
    if (!etat.horlogeSuspecte && maintenant <= finEssai) {
      return {
        code: "essai",
        joursRestants: Math.max(1, Math.ceil((finEssai - maintenant) / JOUR)),
        fin: finEssai,
      };
    }
    return { code: "expire", joursRestants: 0 };
  }

  const actif = () => statut().code !== "expire";

  /* ---------- Codes de déblocage ---------- */

  async function empreinte(texte) {
    const donnees = new TextEncoder().encode(texte);
    const h = await crypto.subtle.digest("SHA-256", donnees);
    return Array.from(new Uint8Array(h)).map((o) => o.toString(16).padStart(2, "0")).join("");
  }

  /** Essaie un code saisi ; renvoie true si l'application est débloquée. */
  async function essayerCode(saisie) {
    const canonique = String(saisie || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (canonique.length < 8) return false;
    const h = await empreinte(canonique);
    if (!CONFIG.empreintesCodes.includes(h)) return false;
    etat.complet = true;
    etat.codeUtilise = h;
    etat.horlogeSuspecte = false;
    await DB.ecrire("reglages", etat);
    return true;
  }

  /* ---------- Paiement KKiaPay ---------- */

  function chargerKkiapay() {
    return new Promise((resoudre, rejeter) => {
      if (window.openKkiapayWidget) { resoudre(); return; }
      const script = document.createElement("script");
      script.src = "https://cdn.kkiapay.me/k.js";
      script.onload = () => resoudre();
      script.onerror = () => rejeter(new Error("Impossible de charger le paiement. Vérifiez la connexion Internet."));
      document.head.appendChild(script);
    });
  }

  let ecouteurPose = false;

  async function payer() {
    if (!CONFIG.cleKkiapayPublique) throw new Error("Le paiement mobile n'est pas encore configuré. Utilisez un code de déblocage.");
    await chargerKkiapay();
    if (!ecouteurPose && window.addKkiapayListener) {
      ecouteurPose = true;
      window.addKkiapayListener("SUCCESS", async (reponse) => {
        const base = Math.max(Date.now(), etat.finAbonnement || 0);
        etat.finAbonnement = base + CONFIG.joursParPaiement * JOUR;
        etat.horlogeSuspecte = false;
        etat.dernierUsage = Date.now();
        etat.transactions = (etat.transactions || []).slice(-24);
        etat.transactions.push({
          id: reponse && reponse.transactionId ? reponse.transactionId : "inconnu",
          montant: CONFIG.prixMensuel,
          date: Date.now(),
        });
        await DB.ecrire("reglages", etat);
        masquerVoile();
        UI.toast("Paiement reçu — abonnement prolongé d'un mois. Merci !", "ok");
        if (typeof window.kkiapayCloseWidget === "function") window.kkiapayCloseWidget();
        location.hash = "#/";
      });
    }
    window.openKkiapayWidget({
      amount: CONFIG.prixMensuel,
      api_key: CONFIG.cleKkiapayPublique,
      sandbox: CONFIG.kkiapaySandbox,
      currency: "XOF",
      reason: "Abonnement mensuel — application Atelier",
    });
  }

  /* ---------- Écran de blocage ---------- */

  function afficherVoile() {
    const voile = document.getElementById("voile-licence");
    const s = statut();
    const e = Utils.echapper;
    const titre = s.code === "expire" && etat && etat.finAbonnement
      ? "Abonnement expiré"
      : "Période d'essai terminée";

    voile.innerHTML =
      '<div class="voile-boite">' +
        '<img src="icons/icon-192.png" alt="" class="voile-logo">' +
        '<h1>Atelier</h1>' +
        '<p class="voile-titre">' + e(titre) + "</p>" +
        '<p class="voile-texte">Pour continuer à utiliser l\'application, réglez l\'abonnement ou entrez votre code de déblocage. ' +
          "Vos clients, commandes et photos sont intacts : tout revient dès le déblocage.</p>" +
        '<div class="voile-prix">' + Utils.fmtNombre(CONFIG.prixMensuel) + ' FCFA <span>/ mois</span></div>' +
        (CONFIG.cleKkiapayPublique
          ? '<button type="button" class="btn btn-or btn-bloc" id="voile-payer">Payer avec Mobile Money / carte</button>' +
            '<div class="voile-ou">— ou —</div>'
          : "") +
        '<div class="champ" style="margin-bottom:10px;text-align:left">' +
          '<label for="voile-code">Code de déblocage définitif</label>' +
          '<input id="voile-code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ATEL-XXXXX-XXXXX">' +
        "</div>" +
        '<button type="button" class="btn btn-bloc" id="voile-debloquer">Débloquer l\'application</button>' +
        (CONFIG.contactVendeur
          ? '<p class="voile-contact">Pour obtenir un code ou de l\'aide : <strong>' + e(CONFIG.contactVendeur) + "</strong></p>"
          : '<p class="voile-contact">Contactez votre installateur pour obtenir un code.</p>') +
      "</div>";

    voile.hidden = false;
    document.body.style.overflow = "hidden";

    const boutonPayer = document.getElementById("voile-payer");
    if (boutonPayer) boutonPayer.onclick = async () => {
      boutonPayer.disabled = true;
      try { await payer(); }
      catch (err) { UI.toast(err.message || "Paiement indisponible", "erreur"); }
      boutonPayer.disabled = false;
    };

    const champ = document.getElementById("voile-code");
    const valider = async () => {
      const ok = await essayerCode(champ.value);
      if (ok) {
        masquerVoile();
        UI.toast("Application débloquée définitivement. Merci !", "ok");
        location.hash = "#/";
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      } else {
        UI.toast("Code invalide — vérifiez et réessayez", "erreur");
        champ.focus();
      }
    };
    document.getElementById("voile-debloquer").onclick = valider;
    champ.addEventListener("keydown", (ev) => { if (ev.key === "Enter") valider(); });
  }

  function masquerVoile() {
    const voile = document.getElementById("voile-licence");
    voile.hidden = true;
    voile.innerHTML = "";
    document.body.style.overflow = "";
  }

  /** Bandeau discret quand la fin approche (accueil). */
  function bandeauHtml() {
    const s = statut();
    if (s.code === "complet" || s.joursRestants > 5) return "";
    const libelle = s.code === "essai" ? "Essai gratuit" : "Abonnement";
    return (
      '<div class="alerte">' + UI.icone("horloge") +
      "<div><strong>" + libelle + " : " + s.joursRestants + " jour" + (s.joursRestants > 1 ? "s" : "") +
      ' restant' + (s.joursRestants > 1 ? "s" : "") + ".</strong> " +
      'Pensez à régler l\'abonnement ou à entrer votre code dans ' +
      '<a href="#/reglages" style="font-weight:700;text-decoration:underline">Réglages</a>.</div></div>'
    );
  }

  /** Résumé lisible pour l'écran Réglages. */
  function resume() {
    const s = statut();
    if (s.code === "complet") return "Application débloquée définitivement.";
    if (s.code === "abonnement") return "Abonnement actif jusqu'au " + Utils.fmtDate(Utils.isoJour(new Date(s.fin))) + ".";
    if (s.code === "essai") return "Essai gratuit : " + s.joursRestants + " jour" + (s.joursRestants > 1 ? "s" : "") + " restant" + (s.joursRestants > 1 ? "s" : "") + ".";
    return "Licence expirée : l'application est bloquée.";
  }

  return { CONFIG, init, statut, actif, essayerCode, payer, afficherVoile, masquerVoile, bandeauHtml, resume };
})();
