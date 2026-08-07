/* =========================================================
   Utilitaires : dates, montants, téléphone, photos
   ========================================================= */
const Utils = (() => {

  const MOIS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
  const MOIS_COURT = ["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
  const JOURS = ["dimanche","lundi","mardi","mercredi","jeudi","vendredi","samedi"];

  const pad = (n, len = 2) => String(n).padStart(len, "0");

  function uid(prefixe = "id") {
    return prefixe + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function echapper(valeur) {
    return String(valeur === null || valeur === undefined ? "" : valeur)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* ---------- Montants ---------- */

  /** "12 500" — espaces insécables fines pour rester lisible sur petit écran. */
  function fmtNombre(n) {
    const v = Math.round(Number(n) || 0);
    return String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }

  function fmtMontant(n, devise) {
    const v = Math.round(Number(n) || 0);
    const signe = v < 0 ? "-" : "";
    return signe + fmtNombre(v) + (devise ? " " + devise : "");
  }

  /** Accepte "12 500", "12.500", "12,5" et renvoie un nombre. */
  function lireNombre(valeur) {
    if (typeof valeur === "number") return isFinite(valeur) ? valeur : 0;
    if (!valeur) return 0;
    let s = String(valeur).trim().replace(/\s/g, "");
    // "12.500" = séparateur de milliers en usage local, "12,5" = décimale
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    s = s.replace(",", ".").replace(/[^\d.-]/g, "");
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  /* ---------- Dates ---------- */

  /** Date locale -> "AAAA-MM-JJ" (jamais de décalage UTC). */
  function isoJour(d = new Date()) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  /** "AAAA-MM-JJ" -> Date locale à minuit. */
  function versDate(iso) {
    if (!iso) return null;
    const m = String(iso).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) {
      const d = new Date(iso);
      return isNaN(d) ? null : d;
    }
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  function aujourdhui() { return isoJour(new Date()); }

  function ajouterJours(iso, n) {
    const d = versDate(iso) || new Date();
    d.setDate(d.getDate() + n);
    return isoJour(d);
  }

  function fmtDate(iso) {
    const d = versDate(iso);
    if (!d) return "—";
    return d.getDate() + " " + MOIS[d.getMonth()] + " " + d.getFullYear();
  }

  function fmtDateCourte(iso) {
    const d = versDate(iso);
    if (!d) return "—";
    return d.getDate() + " " + MOIS_COURT[d.getMonth()];
  }

  function fmtJourDate(iso) {
    const d = versDate(iso);
    if (!d) return "—";
    return JOURS[d.getDay()] + " " + d.getDate() + " " + MOIS[d.getMonth()];
  }

  /** Horodatage complet -> "6 août 2026 à 14:05". */
  function fmtDateHeure(horodatage) {
    if (!horodatage) return "—";
    const d = new Date(horodatage);
    if (isNaN(d)) return "—";
    return d.getDate() + " " + MOIS[d.getMonth()] + " " + d.getFullYear() +
      " à " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function fmtHeure(horodatage) {
    const d = new Date(horodatage);
    if (isNaN(d)) return "";
    return pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  /** Nombre de jours entiers entre deux jours (b - a). */
  function ecartJours(isoA, isoB) {
    const a = versDate(isoA), b = versDate(isoB);
    if (!a || !b) return 0;
    return Math.round((b - a) / 86400000);
  }

  /** "aujourd'hui", "dans 3 jours", "en retard de 2 jours". */
  function delai(isoLivraison) {
    const n = ecartJours(aujourdhui(), isoLivraison);
    if (n === 0) return "aujourd'hui";
    if (n === 1) return "demain";
    if (n === -1) return "en retard d'1 jour";
    if (n > 1) return "dans " + n + " jours";
    return "en retard de " + Math.abs(n) + " jours";
  }

  /* ---------- Téléphone & WhatsApp ---------- */

  /** Renvoie le numéro au format international sans "+" (ex. 22997000000). */
  function normaliserTel(tel, indicatif) {
    let s = String(tel || "").trim();
    const plus = s.startsWith("+") || s.startsWith("00");
    s = s.replace(/\D/g, "");
    if (s.startsWith("00")) s = s.slice(2);
    if (!s) return "";
    const ind = String(indicatif || "").replace(/\D/g, "");
    if (plus) return s;
    if (ind && s.startsWith(ind) && s.length > ind.length + 5) return s;
    // Numéros notés avec un 0 initial (usage local) : on le retire.
    if (ind && s.startsWith("0")) s = s.replace(/^0+/, "");
    return ind ? ind + s : s;
  }

  function lienWhatsApp(tel, message, indicatif) {
    const num = normaliserTel(tel, indicatif);
    const base = num ? "https://wa.me/" + num : "https://wa.me/";
    return base + (message ? "?text=" + encodeURIComponent(message) : "");
  }

  function lienTel(tel, indicatif) {
    const num = normaliserTel(tel, indicatif);
    return num ? "tel:+" + num : "";
  }

  function fmtTel(tel) {
    const s = String(tel || "").replace(/\s+/g, " ").trim();
    return s || "—";
  }

  /* ---------- Divers ---------- */

  function initiales(prenom, nom) {
    const a = (prenom || "").trim()[0] || "";
    const b = (nom || "").trim()[0] || "";
    return (a + b).toUpperCase() || "?";
  }

  function nomComplet(client) {
    if (!client) return "Client supprimé";
    return [client.prenom, client.nom].filter(Boolean).join(" ").trim() || "Sans nom";
  }

  /** Numéro à composer pour un appel (repli sur le numéro WhatsApp). */
  function telAppel(client) {
    if (!client) return "";
    return String(client.tel || client.telWhatsApp || "").trim();
  }

  /** Numéro à utiliser pour WhatsApp (repli sur le numéro d'appel). */
  function telWhatsApp(client) {
    if (!client) return "";
    return String(client.telWhatsApp || client.tel || "").trim();
  }

  /** Comparaison insensible aux accents et à la casse, pour la recherche. */
  function sansAccent(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function tempo(fn, ms = 220) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  /** Remplace {cle} par les valeurs fournies dans un modèle de message. */
  function remplirModele(modele, valeurs) {
    return String(modele || "").replace(/\{(\w+)\}/g, (tout, cle) =>
      valeurs[cle] !== undefined && valeurs[cle] !== null ? String(valeurs[cle]) : tout
    );
  }

  function telecharger(nomFichier, contenu, type = "application/json") {
    const blob = contenu instanceof Blob ? contenu : new Blob([contenu], { type: type + ";charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomFichier;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /* ---------- Photos ---------- */

  /**
   * Réduit et compresse une photo prise à l'appareil (souvent 3–8 Mo)
   * en JPEG d'environ 100 Ko, stockable durablement sur le téléphone.
   */
  async function compresserImage(fichier, coteMax = 1100, qualite = 0.72) {
    const source = await chargerImage(fichier);
    const l = source.width, h = source.height;
    const ratio = Math.min(1, coteMax / Math.max(l, h));
    const cl = Math.max(1, Math.round(l * ratio));
    const ch = Math.max(1, Math.round(h * ratio));

    const toile = document.createElement("canvas");
    toile.width = cl;
    toile.height = ch;
    const ctx = toile.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, cl, ch);
    if (source.close) source.close();

    return { dataUrl: toile.toDataURL("image/jpeg", qualite), largeur: cl, hauteur: ch };
  }

  function chargerImage(fichier) {
    // createImageBitmap redresse la photo selon l'orientation EXIF du téléphone.
    if (typeof createImageBitmap === "function") {
      return createImageBitmap(fichier, { imageOrientation: "from-image" }).catch(() => viaBalise(fichier));
    }
    return viaBalise(fichier);
  }

  function viaBalise(fichier) {
    return new Promise((resolve, reject) => {
      const lecteur = new FileReader();
      lecteur.onerror = () => reject(new Error("Lecture de l'image impossible"));
      lecteur.onload = () => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Image illisible"));
        img.src = lecteur.result;
      };
      lecteur.readAsDataURL(fichier);
    });
  }

  function tailleLisible(octets) {
    if (!octets) return "0 Ko";
    if (octets < 1024 * 1024) return Math.round(octets / 1024) + " Ko";
    return (octets / (1024 * 1024)).toFixed(1) + " Mo";
  }

  return {
    pad, uid, echapper,
    fmtNombre, fmtMontant, lireNombre,
    isoJour, versDate, aujourdhui, ajouterJours, fmtDate, fmtDateCourte, fmtJourDate,
    fmtDateHeure, fmtHeure, ecartJours, delai, MOIS, MOIS_COURT,
    normaliserTel, lienWhatsApp, lienTel, fmtTel, telAppel, telWhatsApp,
    initiales, nomComplet, sansAccent, tempo, remplirModele, telecharger,
    compresserImage, tailleLisible,
  };
})();
