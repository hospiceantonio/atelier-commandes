/* =========================================================
   Vue Réglages (administrateur d'atelier) — informations de
   l'atelier, personnalisation (logo, slogan, numéros, modèles
   WhatsApp), export des données, déconnexion.
   ========================================================= */
const VueReglages = (() => {
  const e = Utils.echapper;

  async function afficher(vue) {
    const r = Store.lireReglages();
    const profil = Api.lireProfil();
    let logoDataUrl = r.logo || "";

    UI.entete({ titre: "Réglages", sous: r.nomAtelier, retour: true });

    vue.innerHTML =
      '<div class="carte">' +
        '<div class="carte-titre">' + UI.icone("commandes", "ic-sm") + "Mon atelier</div>" +
        '<div class="paires">' +
          '<div class="paire"><span class="l">Nom</span><span class="v">' + e(r.nomAtelier) + "</span></div>" +
          '<div class="paire"><span class="l">Devise</span><span class="v">' + e(r.devise) + "</span></div>" +
          '<div class="paire"><span class="l">Indicatif pays</span><span class="v">' + e(r.indicatif) + "</span></div>" +
          '<div class="paire"><span class="l">Abonnement</span><span class="v">' +
            Utils.fmtMontant(r.abonnementMensuel, r.devise) + " / mois</span></div>" +
          '<div class="paire"><span class="l">Actif jusqu\'au</span><span class="v vert">' +
            (r.abonnementFin ? Utils.fmtDate(Utils.isoJour(new Date(r.abonnementFin))) : "—") + "</span></div>" +
        "</div>" +
        (Paiement.disponible()
          ? '<button type="button" class="btn btn-or btn-bloc" id="btn-renouveler" style="margin-top:12px">' +
              "Renouveler : " + Utils.fmtMontant(r.abonnementMensuel, r.devise) + " par Mobile Money / carte</button>"
          : "") +
        '<div class="aide" style="margin-top:8px">Ces informations sont gérées par votre fournisseur.</div>' +
      "</div>" +

      '<form id="form-perso">' +
        '<div class="carte">' +
          '<div class="carte-titre">' + UI.icone("crayon", "ic-sm") + "Personnalisation</div>" +
          '<div class="champ"><label>Logo de l\'atelier</label>' +
            '<div style="display:flex;align-items:center;gap:12px">' +
              '<img id="perso-logo-apercu" class="logo-apercu" alt=""' + (logoDataUrl ? ' src="' + logoDataUrl + '"' : " hidden") + ">" +
              '<button type="button" class="btn btn-clair btn-sm" id="perso-logo-choisir">Choisir</button>' +
              '<button type="button" class="btn btn-danger btn-sm" id="perso-logo-retirer"' + (logoDataUrl ? "" : " hidden") + ">Retirer</button>" +
            "</div>" +
            '<input type="file" id="perso-logo" accept="image/*" hidden></div>' +
          '<div class="champ"><label for="perso-slogan">Slogan</label>' +
            '<input id="perso-slogan" autocomplete="off" value="' + e(r.slogan) + '"></div>' +
          '<div class="champ-duo">' +
            '<div class="champ"><label for="perso-wa">N° WhatsApp de l\'atelier</label>' +
              '<input id="perso-wa" type="tel" inputmode="tel" autocomplete="off" value="' + e(r.telWhatsAppAtelier) + '"></div>' +
            '<div class="champ"><label for="perso-appel">N° d\'appel de l\'atelier</label>' +
              '<input id="perso-appel" type="tel" inputmode="tel" autocomplete="off" value="' + e(r.telAppelAtelier) + '"></div>' +
          "</div>" +
        "</div>" +

        '<div class="carte">' +
          '<div class="carte-titre">' + UI.icone("whatsapp", "ic-sm") + "Modèles de message WhatsApp</div>" +
          '<div class="champ"><label for="perso-modele">Récapitulatif de commande</label>' +
            '<textarea id="perso-modele" style="min-height:150px">' + e(r.modeleWhatsApp) + "</textarea></div>" +
          '<div class="champ"><label for="perso-modele-pret">Commande prête</label>' +
            '<textarea id="perso-modele-pret" style="min-height:110px">' + e(r.modeleWhatsAppPret) + "</textarea></div>" +
          '<div class="aide">Mots remplacés automatiquement : {prenom} {nom} {numero} {atelier} {livraison} {montant} {acompte} {paye} {solde}</div>' +
        "</div>" +

        '<button type="submit" class="btn btn-bloc">' + UI.icone("check", "ic-sm") + "Enregistrer</button>" +
      "</form>" +

      '<div class="carte" style="margin-top:14px">' +
        '<div class="carte-titre">' + UI.icone("telecharger", "ic-sm") + "Copie des données</div>" +
        '<p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:var(--encre-douce)">' +
          "Vos données sont hébergées en ligne et sauvegardées par le serveur. " +
          "Vous pouvez tout de même télécharger une copie lisible (clients, commandes, dépenses)." +
        "</p>" +
        '<button type="button" class="btn btn-or" id="btn-exporter">' + UI.icone("telecharger", "ic-sm") + "Télécharger une copie</button>" +
      "</div>" +

      '<div class="carte" style="margin-top:14px">' +
        '<div class="carte-titre">' + UI.icone("clients", "ic-sm") + "Compte</div>" +
        '<div class="paires">' +
          '<div class="paire"><span class="l">Connecté en tant que</span><span class="v">' +
            e(profil ? (profil.nom_complet || profil.email) : "—") + "</span></div>" +
          '<div class="paire"><span class="l">Email</span><span class="v">' + e(profil ? profil.email : "—") + "</span></div>" +
        "</div>" +
        '<button type="button" class="btn btn-danger btn-bloc" id="btn-deconnexion" style="margin-top:12px">Se déconnecter</button>' +
      "</div>" +

      '<p class="pied-note">Atelier — vos données sont accessibles partout, à tout moment.</p>';

    /* Logo */
    const champLogo = UI.$("#perso-logo");
    const apercu = UI.$("#perso-logo-apercu");
    const retirer = UI.$("#perso-logo-retirer");
    UI.$("#perso-logo-choisir").onclick = () => champLogo.click();
    retirer.onclick = () => {
      logoDataUrl = "";
      apercu.hidden = true;
      retirer.hidden = true;
    };
    champLogo.addEventListener("change", async () => {
      const fichier = champLogo.files && champLogo.files[0];
      champLogo.value = "";
      if (!fichier) return;
      try {
        const { dataUrl } = await Utils.compresserImage(fichier, 400, 0.82);
        logoDataUrl = dataUrl;
        apercu.src = dataUrl;
        apercu.hidden = false;
        retirer.hidden = false;
      } catch (_) {
        UI.toast("Image illisible", "erreur");
      }
    });

    UI.$("#form-perso").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try {
        await Store.majReglages({
          logo: logoDataUrl,
          slogan: UI.$("#perso-slogan").value.trim(),
          telWhatsAppAtelier: UI.$("#perso-wa").value.trim(),
          telAppelAtelier: UI.$("#perso-appel").value.trim(),
          modeleWhatsApp: UI.$("#perso-modele").value,
          modeleWhatsAppPret: UI.$("#perso-modele-pret").value,
        });
        UI.toast("Réglages enregistrés", "ok");
      } catch (err) {
        UI.toast(err.message || "Enregistrement impossible", "erreur");
      }
    });

    const boutonRenouveler = UI.$("#btn-renouveler");
    if (boutonRenouveler) boutonRenouveler.onclick = () => Paiement.payer();

    UI.$("#btn-exporter").onclick = async () => {
      try {
        const donnees = await Store.exporter();
        Utils.telecharger("atelier-copie-" + Utils.aujourdhui() + ".json", JSON.stringify(donnees));
        UI.toast("Copie téléchargée", "ok");
      } catch (err) {
        UI.toast(err.message || "Export impossible", "erreur");
      }
    };

    UI.$("#btn-deconnexion").onclick = async () => {
      await Api.deconnexion();
      location.hash = "#/";
      window.AppNaviguer();
    };
  }

  return { afficher };
})();
