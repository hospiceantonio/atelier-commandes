/* =========================================================
   Vue Réglages — atelier, devise, modèles WhatsApp,
   sauvegarde / restauration des données.
   ========================================================= */
const VueReglages = (() => {
  const e = Utils.echapper;

  async function afficher(vue) {
    const r = Store.lireReglages();
    const [nbClients, nbCommandes, nbPhotos, espace] = await Promise.all([
      DB.compter("clients"), DB.compter("commandes"), DB.compter("photos"), DB.espace(),
    ]);

    UI.entete({ titre: "Réglages", retour: true });

    vue.innerHTML =
      '<form id="form-reglages" novalidate>' +
        '<div class="carte">' +
          '<div class="carte-titre">' + UI.icone("reglages", "ic-sm") + "Atelier</div>" +
          '<div class="champ"><label for="reg-nom">Nom de l\'atelier</label>' +
            '<input id="reg-nom" autocomplete="off" value="' + e(r.nomAtelier) + '">' +
            '<div class="aide">Apparaît sur l\'accueil et dans les messages WhatsApp.</div></div>' +
          '<div class="champ-duo">' +
            '<div class="champ"><label for="reg-devise">Devise</label>' +
              '<input id="reg-devise" autocomplete="off" value="' + e(r.devise) + '"></div>' +
            '<div class="champ"><label for="reg-indicatif">Indicatif pays</label>' +
              '<input id="reg-indicatif" inputmode="numeric" autocomplete="off" value="' + e(r.indicatif) + '">' +
              '<div class="aide">Ex. : 229 (Bénin), 228 (Togo), 225 (Côte d\'Ivoire).</div></div>' +
          "</div>" +
        "</div>" +

        '<div class="carte">' +
          '<div class="carte-titre">' + UI.icone("whatsapp", "ic-sm") + "Modèles de message WhatsApp</div>" +
          '<div class="champ"><label for="reg-modele">Récapitulatif de commande</label>' +
            '<textarea id="reg-modele" style="min-height:150px">' + e(r.modeleWhatsApp) + "</textarea></div>" +
          '<div class="champ"><label for="reg-modele-pret">Commande prête</label>' +
            '<textarea id="reg-modele-pret" style="min-height:110px">' + e(r.modeleWhatsAppPret) + "</textarea></div>" +
          '<div class="aide">Mots remplacés automatiquement : {prenom} {nom} {numero} {atelier} {livraison} {montant} {acompte} {paye} {solde}</div>' +
        "</div>" +

        '<button type="submit" class="btn btn-bloc">' + UI.icone("check", "ic-sm") + "Enregistrer les réglages</button>" +
      "</form>" +

      '<div class="carte" style="margin-top:14px">' +
        '<div class="carte-titre">' + UI.icone("telecharger", "ic-sm") + "Sauvegarde</div>" +
        '<p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:var(--encre-douce)">' +
          nbClients + " client" + (nbClients > 1 ? "s" : "") + ", " +
          nbCommandes + " commande" + (nbCommandes > 1 ? "s" : "") + ", " +
          nbPhotos + " photo" + (nbPhotos > 1 ? "s" : "") +
          (espace && espace.utilise ? " — " + Utils.tailleLisible(espace.utilise) + " utilisés" : "") +
          ". Les données restent sur ce téléphone : pensez à exporter une sauvegarde régulièrement " +
          "(à garder sur WhatsApp, un e-mail ou une carte mémoire)." +
        "</p>" +
        '<div class="btn-rangee">' +
          '<button type="button" class="btn btn-or" id="btn-exporter">' + UI.icone("telecharger", "ic-sm") + "Exporter</button>" +
          '<button type="button" class="btn btn-contour" id="btn-importer">' + UI.icone("televerser", "ic-sm") + "Restaurer</button>" +
        "</div>" +
        '<input type="file" id="fichier-import" accept=".json,application/json" hidden>' +
      "</div>" +

      '<p class="pied-note">Atelier — application hors ligne. Vos données ne quittent jamais ce téléphone.</p>';

    UI.$("#form-reglages").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      await Store.majReglages({
        nomAtelier: UI.$("#reg-nom").value.trim() || "Mon atelier",
        devise: UI.$("#reg-devise").value.trim() || "FCFA",
        indicatif: UI.$("#reg-indicatif").value.replace(/\D/g, ""),
        modeleWhatsApp: UI.$("#reg-modele").value,
        modeleWhatsAppPret: UI.$("#reg-modele-pret").value,
      });
      UI.toast("Réglages enregistrés", "ok");
    });

    UI.$("#btn-exporter").onclick = async () => {
      try {
        const donnees = await Store.exporter();
        Utils.telecharger(
          "atelier-sauvegarde-" + Utils.aujourdhui() + ".json",
          JSON.stringify(donnees)
        );
        UI.toast("Sauvegarde exportée", "ok");
      } catch (err) {
        UI.toast(err.message || "Export impossible", "erreur");
      }
    };

    const fichier = UI.$("#fichier-import");
    UI.$("#btn-importer").onclick = () => fichier.click();
    fichier.addEventListener("change", async () => {
      const f = fichier.files && fichier.files[0];
      fichier.value = "";
      if (!f) return;
      const ok = await UI.confirmer({
        titre: "Restaurer une sauvegarde",
        texte: "Les données actuelles (" + nbClients + " clients, " + nbCommandes +
          " commandes) seront remplacées par celles du fichier. Continuer ?",
        bouton: "Restaurer", danger: true,
      });
      if (!ok) return;
      try {
        const texte = await f.text();
        const resultat = await Store.importer(JSON.parse(texte));
        UI.toast("Restauré : " + resultat.clients + " clients, " + resultat.commandes + " commandes", "ok");
        setTimeout(() => location.reload(), 900);
      } catch (err) {
        UI.toast(err.message || "Fichier de sauvegarde illisible", "erreur");
      }
    });
  }

  return { afficher };
})();
