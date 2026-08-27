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
    let logoFichier = null;      /* déposé seulement à l'enregistrement */
    let logoEnBase = r.logo || "";  /* pour retirer l'ancien fichier du bucket */

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

      '<div class="carte">' +
        '<div class="carte-titre">' + UI.icone("check", "ic-sm") + "Renouveler avec un code</div>" +
        '<p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:var(--encre-douce)">' +
          "Vous avez acheté un code auprès de votre fournisseur ? Saisissez-le ici : " +
          "il prolonge votre abonnement d'un mois." +
        "</p>" +
        '<div class="champ"><label for="code-abo">Code de renouvellement</label>' +
          '<input id="code-abo" autocomplete="off" autocapitalize="characters" spellcheck="false" ' +
            'placeholder="ABCD-EFGH-JKLM" maxlength="14"></div>' +
        '<button type="button" class="btn btn-bloc" id="btn-code">' +
          UI.icone("check", "ic-sm") + "Valider le code</button>" +
        '<div class="aide" style="margin-top:8px">Chaque code ne sert qu\'une seule fois.</div>' +
      "</div>" +

      '<form id="form-perso">' +
        '<div class="carte">' +
          '<div class="carte-titre">' + UI.icone("crayon", "ic-sm") + "Personnalisation</div>" +
          '<div class="champ"><label>Logo de l\'atelier</label>' +
            '<div style="display:flex;align-items:center;gap:12px">' +
              '<img id="perso-logo-apercu" class="logo-apercu" alt=""' +
                (logoDataUrl ? ' src="' + Stockage.src(logoDataUrl) + '"' : " hidden") + ">" +
              '<button type="button" class="btn btn-clair btn-sm" id="perso-logo-choisir">Choisir</button>' +
              '<button type="button" class="btn btn-danger btn-sm" id="perso-logo-retirer"' + (logoDataUrl ? "" : " hidden") + ">Retirer</button>" +
            "</div>" +
            '<input type="file" id="perso-logo" accept="image/*" hidden></div>' +
          '<div class="champ"><label for="perso-slogan">Slogan</label>' +
            '<input id="perso-slogan" autocomplete="off" value="' + e(r.slogan) + '"></div>' +
          '<div class="champ-duo">' +
            '<div class="champ"><label for="perso-wa">N° WhatsApp</label>' +
              '<input id="perso-wa" type="tel" inputmode="tel" autocomplete="off" value="' + e(r.telWhatsAppAtelier) + '"></div>' +
            '<div class="champ"><label for="perso-appel">N° d\'appel</label>' +
              '<input id="perso-appel" type="tel" inputmode="tel" autocomplete="off" value="' + e(r.telAppelAtelier) + '"></div>' +
          "</div>" +
        "</div>" +

        '<div class="carte">' +
          '<div class="carte-titre">' + UI.icone("whatsapp", "ic-sm") + "Modèles de message WhatsApp</div>" +
          '<div class="champ"><label for="perso-modele">Récapitulatif de commande</label>' +
            '<textarea id="perso-modele" style="min-height:150px">' + e(r.modeleWhatsApp) + "</textarea></div>" +
          '<div class="champ"><label for="perso-modele-pret">Commande prête</label>' +
            '<textarea id="perso-modele-pret" style="min-height:110px">' + e(r.modeleWhatsAppPret) + "</textarea></div>" +
          '<div class="aide">Mots remplacés automatiquement : {prenom} {nom} {numero} {description} ' +
            "{commentaire} {atelier} {livraison} {montant} {acompte} {paye} {solde}</div>" +
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
        '<div class="carte-titre">' + UI.icone("clients", "ic-sm") + "Équipe</div>" +
        '<div id="zone-equipe"><p style="margin:0;font-size:13px;color:var(--encre-tres-douce)">Chargement…</p></div>' +
        '<button type="button" class="btn btn-clair btn-bloc" id="btn-moderateur" style="margin-top:12px">' +
          UI.icone("plus", "ic-sm") + "Ajouter un modérateur</button>" +
        '<div class="aide" style="margin-top:8px">Un modérateur enregistre les commandes et les ventes ' +
          "de l'atelier. Il ne peut ni modifier ni supprimer, ni voir ces réglages.</div>" +
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
      logoFichier = null;
      apercu.hidden = true;
      retirer.hidden = true;
    };
    champLogo.addEventListener("change", async () => {
      const fichier = champLogo.files && champLogo.files[0];
      champLogo.value = "";
      if (!fichier) return;
      try {
        const { dataUrl } = await Utils.compresserImage(fichier, 400, 0.82);
        /* L'aperçu est immédiat ; le dépôt n'a lieu qu'à l'enregistrement,
           pour ne rien laisser dans le bucket si l'on renonce. */
        logoFichier = fichier;
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
        let logo = logoDataUrl;
        if (logoFichier) {
          logo = await Stockage.deposerImage(logoFichier, Stockage.VITRINE, "logo",
            { coteMax: 400, qualite: 0.82 });
          /* Déposé : le formulaire porte désormais le chemin, pas l'aperçu.
             Sans cela, un second enregistrement réécrirait la data-url. */
          logoFichier = null;
          logoDataUrl = logo;
        }
        /* Un logo remplacé ou retiré n'a plus rien qui le désigne : sans
           cela chaque changement en laisserait un dans le bucket. */
        if (logoEnBase && logoEnBase !== logo) {
          await Stockage.retirer([logoEnBase], Stockage.VITRINE);
        }
        logoEnBase = logo;
        await Store.majReglages({
          logo,
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

    /* Renouvellement par code */
    const champCode = UI.$("#code-abo");
    champCode.addEventListener("input", () => {
      // Mise en forme au fil de la frappe : ABCD-EFGH-JKLM
      const brut = champCode.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
      champCode.value = (brut.match(/.{1,4}/g) || []).join("-");
    });

    UI.$("#btn-code").onclick = async () => {
      const bouton = UI.$("#btn-code");
      const saisi = champCode.value.trim();
      if (saisi.replace(/[^A-Z0-9]/gi, "").length !== 12) {
        UI.toast("Un code compte 12 caractères", "erreur");
        return;
      }
      bouton.disabled = true;
      try {
        const reponse = await Store.utiliserCode(saisi);
        if (reponse.statut === "ok") {
          UI.toast("Abonnement prolongé d'un mois", "ok");
          await Api.rafraichirAtelier();
          afficher(vue);
          return;
        }
        UI.toast(reponse.statut === "deja_utilise"
          ? "Ce code a déjà été utilisé."
          : "Code inconnu — vérifiez la saisie.", "erreur");
      } catch (err) {
        UI.toast(err.message || "Vérification impossible", "erreur");
      }
      bouton.disabled = false;
    };

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

    /* ---------- Équipe : modérateurs de l'atelier ---------- */

    async function rendreEquipe() {
      const zone = UI.$("#zone-equipe");
      const membres = (await Api.listerPar("profils", "atelier_id", Api.atelierId()))
        .filter((m) => m.role === "moderateur");
      if (!membres.length) {
        zone.innerHTML = '<p style="margin:0;font-size:13px;color:var(--encre-tres-douce)">' +
          "Aucun modérateur. Vous êtes seul à gérer cet atelier.</p>";
        return;
      }
      zone.innerHTML = '<div class="mini-liste">' +
        membres.map((m) =>
          '<div class="mini"><span class="l"><strong>' + e(m.nom_complet || m.email) + "</strong>" +
            '<br><span style="color:var(--encre-tres-douce);font-size:12px">' + e(m.email) +
            (m.telephone ? " · " + e(Utils.fmtTel(m.telephone)) : "") + "</span></span>" +
            '<button type="button" class="btn btn-danger btn-sm" data-retirer="' + m.id + '">Retirer</button>' +
          "</div>"
        ).join("") + "</div>";

      /* onclick (et non addEventListener) : la zone est re-rendue à chaque
         retrait, les écouteurs s'empileraient sinon. */
      zone.onclick = async (ev) => {
        const bouton = ev.target.closest("[data-retirer]");
        if (!bouton) return;
        const membre = membres.find((m) => m.id === bouton.dataset.retirer);
        const ok = await UI.confirmer({
          titre: "Retirer le modérateur",
          texte: (membre.nom_complet || membre.email) + " n'aura plus accès à l'atelier. " +
            "Les commandes et ventes qu'il a enregistrées sont conservées.",
          bouton: "Retirer l'accès", danger: true,
        });
        if (!ok) return;
        try {
          await Api.supprimerLigne("profils", membre.id);
          UI.toast("Accès retiré", "ok");
          rendreEquipe();
        } catch (err) {
          UI.toast(err.message || "Retrait impossible", "erreur");
        }
      };
    }
    rendreEquipe();

    UI.$("#btn-moderateur").onclick = () => {
      const corps = UI.ouvrirFeuille("Nouveau modérateur",
        '<div class="carte">' +
          '<div class="champ"><label for="mod-nom">Prénom(s) et nom <span class="obligatoire">*</span></label>' +
            '<input id="mod-nom" autocomplete="off" autocapitalize="words"></div>' +
          '<div class="champ"><label for="mod-tel">Téléphone</label>' +
            '<input id="mod-tel" type="tel" inputmode="tel" autocomplete="off"></div>' +
          '<div class="champ"><label for="mod-email">Email (identifiant) <span class="obligatoire">*</span></label>' +
            '<input id="mod-email" type="email" inputmode="email" autocomplete="off"></div>' +
          '<div class="champ"><label for="mod-mdp">Mot de passe <span class="obligatoire">*</span></label>' +
            '<input id="mod-mdp" type="text" autocomplete="off" placeholder="6 caractères minimum">' +
            '<div class="aide">À transmettre au modérateur.</div></div>' +
          '<button type="button" class="btn btn-bloc" id="mod-creer">' +
            UI.icone("check", "ic-sm") + "Créer le compte</button>" +
        "</div>");

      UI.$("#mod-creer", corps).onclick = async () => {
        const nom = UI.$("#mod-nom", corps).value.trim();
        const email = UI.$("#mod-email", corps).value.trim();
        const motDePasse = UI.$("#mod-mdp", corps).value;
        if (!nom) { UI.toast("Indiquez le nom du modérateur", "erreur"); return; }
        if (!email || !email.includes("@")) { UI.toast("Indiquez un email valide", "erreur"); return; }
        if (motDePasse.length < 6) { UI.toast("Mot de passe : 6 caractères minimum", "erreur"); return; }

        const bouton = UI.$("#mod-creer", corps);
        bouton.disabled = true;
        try {
          const utilisateur = await Api.creerCompteAdmin(email, motDePasse, nom,
            UI.$("#mod-tel", corps).value.trim());
          await Api.mettreAJour("profils", utilisateur.id, {
            role: "moderateur", atelier_id: Api.atelierId(),
          });
          UI.feuilleSansRappel();
          UI.fermerFeuille();
          UI.toast("Modérateur ajouté", "ok");
          rendreEquipe();
        } catch (err) {
          UI.toast(err.message || "Création impossible", "erreur");
          bouton.disabled = false;
        }
      };
    };
  }

  return { afficher };
})();
