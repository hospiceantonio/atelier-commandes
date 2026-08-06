/* =========================================================
   Base locale (IndexedDB) — tout reste sur le téléphone.
   Les photos vivent dans leur propre magasin : les listes
   restent légères, les images ne sont lues qu'à l'ouverture
   d'une commande.
   ========================================================= */
const DB = (() => {
  const NOM = "atelier-db";
  const VERSION = 1;

  let promesse = null;

  function ouvrir() {
    if (promesse) return promesse;
    promesse = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("Ce navigateur ne permet pas d'enregistrer les données hors ligne."));
        return;
      }
      const req = indexedDB.open(NOM, VERSION);

      req.onupgradeneeded = (e) => {
        const db = req.result;

        if (!db.objectStoreNames.contains("clients")) {
          const s = db.createObjectStore("clients", { keyPath: "id" });
          s.createIndex("nom", "nom");
          s.createIndex("creeLe", "creeLe");
        }

        if (!db.objectStoreNames.contains("commandes")) {
          const s = db.createObjectStore("commandes", { keyPath: "id" });
          s.createIndex("clientId", "clientId");
          s.createIndex("dateLivraison", "dateLivraison");
          s.createIndex("creeLe", "creeLe");
          s.createIndex("statut", "statut");
        }

        if (!db.objectStoreNames.contains("photos")) {
          const s = db.createObjectStore("photos", { keyPath: "id" });
          s.createIndex("commandeId", "commandeId");
        }

        if (!db.objectStoreNames.contains("reglages")) {
          db.createObjectStore("reglages", { keyPath: "cle" });
        }
        void e;
      };

      req.onsuccess = () => {
        req.result.onversionchange = () => req.result.close();
        resolve(req.result);
      };
      req.onerror = () => reject(req.error || new Error("Ouverture de la base impossible"));
      req.onblocked = () => reject(new Error("Une autre fenêtre de l'application bloque la mise à jour."));
    });
    return promesse;
  }

  function transaction(magasins, mode, action) {
    return ouvrir().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(magasins, mode);
      let resultat;
      tx.oncomplete = () => resolve(resultat);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Enregistrement interrompu (mémoire insuffisante ?)"));
      Promise.resolve(action(tx)).then((v) => { resultat = v; }).catch((err) => {
        try { tx.abort(); } catch (_) { /* déjà terminée */ }
        reject(err);
      });
    }));
  }

  function attendre(requete) {
    return new Promise((resolve, reject) => {
      requete.onsuccess = () => resolve(requete.result);
      requete.onerror = () => reject(requete.error);
    });
  }

  /* ---------- Opérations de base ---------- */

  const lire = (magasin, cle) =>
    transaction(magasin, "readonly", (tx) => attendre(tx.objectStore(magasin).get(cle)));

  const lireTout = (magasin) =>
    transaction(magasin, "readonly", (tx) => attendre(tx.objectStore(magasin).getAll()));

  const lireParIndex = (magasin, index, valeur) =>
    transaction(magasin, "readonly", (tx) =>
      attendre(tx.objectStore(magasin).index(index).getAll(valeur)));

  const ecrire = (magasin, objet) =>
    transaction(magasin, "readwrite", (tx) => attendre(tx.objectStore(magasin).put(objet)).then(() => objet));

  const ecrireLot = (magasin, objets) =>
    transaction(magasin, "readwrite", (tx) => {
      const s = tx.objectStore(magasin);
      return Promise.all(objets.map((o) => attendre(s.put(o))));
    });

  const supprimer = (magasin, cle) =>
    transaction(magasin, "readwrite", (tx) => attendre(tx.objectStore(magasin).delete(cle)));

  const vider = (magasin) =>
    transaction(magasin, "readwrite", (tx) => attendre(tx.objectStore(magasin).clear()));

  const compter = (magasin) =>
    transaction(magasin, "readonly", (tx) => attendre(tx.objectStore(magasin).count()));

  /** Supprime toutes les entrées d'un index (ex. les photos d'une commande). */
  const supprimerParIndex = (magasin, index, valeur) =>
    transaction(magasin, "readwrite", (tx) => new Promise((resolve, reject) => {
      const req = tx.objectStore(magasin).index(index).openCursor(IDBKeyRange.only(valeur));
      let n = 0;
      req.onsuccess = () => {
        const curseur = req.result;
        if (!curseur) { resolve(n); return; }
        curseur.delete();
        n++;
        curseur.continue();
      };
      req.onerror = () => reject(req.error);
    }));

  /** Espace occupé / disponible, quand le navigateur veut bien le dire. */
  async function espace() {
    if (!navigator.storage || !navigator.storage.estimate) return null;
    try {
      const { usage, quota } = await navigator.storage.estimate();
      return { utilise: usage || 0, quota: quota || 0 };
    } catch (_) {
      return null;
    }
  }

  /** Demande au navigateur de ne pas effacer les données en cas de manque de place. */
  async function rendrePersistant() {
    if (!navigator.storage || !navigator.storage.persist) return false;
    try {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    } catch (_) {
      return false;
    }
  }

  return {
    ouvrir, transaction, attendre,
    lire, lireTout, lireParIndex, ecrire, ecrireLot,
    supprimer, supprimerParIndex, vider, compter,
    espace, rendrePersistant,
  };
})();
