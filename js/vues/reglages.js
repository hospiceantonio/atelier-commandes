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
          '<div class="paire"><span class="l">Formule</span><span class="v">' +
            e(Store.libelleFormule(r.formule)) + "</span></div>" +
          '<div class="paire"><span class="l">Abonnement</span><span class="v">' +
            Utils.fmtMontant(r.abonnementMensuel, r.devise) + " / mois</span></div>" +
          '<div class="paire"><span class="l">Actif jusqu\'au</span><span class="v vert">' +
            (r.abonnementFin ? Utils.fmtDate(Utils.isoJour(new Date(r.abonnementFin))) : "—") + "</span></div>" +
        "</div>" +
        (Paiement.disponible()
          ? '<button type="button" class="btn btn-or btn-bloc" id="btn-renouveler" style="margin-top:12px">' +
              "Renouveler ou changer de formule</button>"
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
        '<div class="aide" style="margin-top:8px">Chaque modérateur a ses propres droits, ' +
          'que vous réglez avec le bouton « Droits ». Les réglages de l\'atelier et ' +
          "l'équipe lui restent fermés dans tous les cas.</div>" +
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
    if (boutonRenouveler) boutonRenouveler.onclick = () => ouvrirRenouvellement(r);

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
      const compteDroits = (m) => {
        const d = Api.lireDroits(m);
        return Api.DROITS.filter((x) => d[x.cle]).length;
      };

      zone.innerHTML = '<div class="mini-liste">' +
        membres.map((m) =>
          '<div class="mini"><span class="l"><strong>' + e(m.nom_complet || m.email) + "</strong>" +
            '<br><span style="color:var(--encre-tres-douce);font-size:12px">' + e(m.email) +
            (m.telephone ? " · " + e(Utils.fmtTel(m.telephone)) : "") + "<br>" +
            compteDroits(m) + " droit" + (compteDroits(m) > 1 ? "s" : "") +
            " sur " + Api.DROITS.length + "</span></span>" +
            '<span class="btn-rangee" style="flex:none;gap:6px">' +
              '<button type="button" class="btn btn-clair btn-sm" data-droits="' + m.id + '">Droits</button>' +
              '<button type="button" class="btn btn-danger btn-sm" data-retirer="' + m.id + '">Retirer</button>' +
            "</span>" +
          "</div>"
        ).join("") + "</div>";

      /* onclick (et non addEventListener) : la zone est re-rendue à chaque
         retrait, les écouteurs s'empileraient sinon. */
      zone.onclick = async (ev) => {
        const boutonDroits = ev.target.closest("[data-droits]");
        if (boutonDroits) {
          ouvrirDroits(membres.find((m) => m.id === boutonDroits.dataset.droits), rendreEquipe);
          return;
        }
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
          await Api.rattacherProfil(utilisateur.id, {
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

  /* ---------- Renouveler, ou changer de formule ----------
     Deux gestes très différents sous un même bouton :
       reconduire — le mois s'ajoute à l'échéance en cours ;
       changer    — l'abonnement en cours est ANNULÉ, le mois repart
                    d'aujourd'hui, et les jours restants sont perdus.
     Le second se paie de la même façon, mais il se dit avant. */

  async function ouvrirRenouvellement(r) {
    let formules = [];
    try {
      formules = (await Store.listerFormules()).filter((f) => f.active);
    } catch (_) { /* formules.sql pas encore exécuté : reconduction seule */ }

    const autres = formules.filter((f) => f.code !== r.formule);
    const joursRestants = r.abonnementFin
      ? Math.ceil((new Date(r.abonnementFin).getTime() - Date.now()) / 86400000)
      : 0;

    const corps = UI.ouvrirFeuille("Renouveler l'abonnement",
      '<button type="button" class="ligne ligne-abonnement" data-choix="reconduire">' +
        '<span class="pastille">' + UI.icone("check", "ic-sm") + "</span>" +
        '<span class="ligne-corps">' +
          '<span class="ligne-titre">Reconduire ' +
            e(Store.libelleFormule(r.formule, formules)) + "</span>" +
          '<span class="ligne-sous">Un mois de plus, ajouté à votre échéance</span>' +
        "</span>" +
        '<span class="ligne-fin"><strong>' +
          Utils.fmtMontant(r.abonnementMensuel, r.devise) + "</strong></span>" +
      "</button>" +
      (autres.length
        ? '<div class="section-titre" style="margin-top:14px">Changer de formule</div>' +
          autres.map((f) =>
            '<button type="button" class="ligne ligne-abonnement" style="margin-top:8px" ' +
                'data-choix="changer" data-formule="' + e(f.code) + '">' +
              '<span class="pastille">' + UI.icone("argent", "ic-sm") + "</span>" +
              '<span class="ligne-corps">' +
                '<span class="ligne-titre">' + e(f.nom) + "</span>" +
                '<span class="ligne-sous">' + e(Store.resumeFormule(f.code)) + "</span>" +
              "</span>" +
              '<span class="ligne-fin"><strong>' +
                Utils.fmtMontant(Number(f.prix_mensuel) || 0, r.devise) + "</strong></span>" +
            "</button>"
          ).join("") +
          '<div class="aide" style="margin-top:10px">Changer de formule annule ' +
            "l'abonnement en cours : le mois payé repart d'aujourd'hui." +
            (joursRestants > 0
              ? " Vos <strong>" + joursRestants + " jour" + (joursRestants > 1 ? "s" : "") +
                " restant" + (joursRestants > 1 ? "s" : "") + "</strong> seraient perdus."
              : "") +
          "</div>"
        : ""));

    corps.addEventListener("click", async (ev) => {
      const bouton = ev.target.closest("[data-choix]");
      if (!bouton) return;

      if (bouton.dataset.choix === "reconduire") {
        UI.feuilleSansRappel();
        UI.fermerFeuille();
        Paiement.payer();
        return;
      }

      const f = autres.find((x) => x.code === bouton.dataset.formule);
      const prix = Number(f.prix_mensuel) || 0;
      UI.feuilleSansRappel();
      UI.fermerFeuille();

      const ok = await UI.confirmer({
        titre: "Passer à « " + f.nom + " » ?",
        texte: "Vous réglez " + Utils.fmtMontant(prix, r.devise) + " maintenant, et le mois " +
          "court à partir d'aujourd'hui. " +
          (joursRestants > 0
            ? "Les " + joursRestants + " jour" + (joursRestants > 1 ? "s" : "") +
              " restant" + (joursRestants > 1 ? "s" : "") + " de votre abonnement actuel sont perdus."
            : "Votre abonnement actuel est remplacé."),
        bouton: "Payer " + Utils.fmtMontant(prix, r.devise),
      });
      if (!ok) return;

      try {
        /* Le serveur note l'intention et renvoie SON prix : le montant
           présenté au paiement ne vient pas de cet écran. */
        const demande = await Api.demanderChangementFormule(f.code);
        Paiement.payer({ montant: demande.prix, formule: demande.formule });
      } catch (err) {
        UI.toast(err.message || "Changement impossible", "erreur");
      }
    });
  }

  /* ---------- Mon compte (modérateur) ----------
     Les réglages de l'atelier ne lui sont pas ouverts, et c'est là que
     vit le bouton de déconnexion : il n'avait donc aucun moyen de
     quitter sa session. Cet écran lui donne le sien, et lui montre au
     passage ce qu'il a le droit de faire — la réponse à « pourquoi ce
     bouton n'est-il pas là ? ». */

  async function compte(vue) {
    const r = Store.lireReglages();
    const profil = Api.lireProfil();
    const droits = Api.lireDroits(profil);
    const accordes = Api.DROITS.filter((d) => droits[d.cle]);

    UI.entete({ titre: "Mon compte", sous: r.nomAtelier, retour: true });

    vue.innerHTML =
      '<div class="carte">' +
        '<div class="carte-titre">' + UI.icone("connexion", "ic-sm") + "Vous</div>" +
        '<div class="paires">' +
          '<div class="paire"><span class="l">Nom</span><span class="v">' +
            e(profil ? (profil.nom_complet || "—") : "—") + "</span></div>" +
          '<div class="paire"><span class="l">Email</span><span class="v">' +
            e(profil ? profil.email : "—") + "</span></div>" +
          (profil && profil.telephone
            ? '<div class="paire"><span class="l">Téléphone</span><span class="v">' +
                e(Utils.fmtTel(profil.telephone)) + "</span></div>"
            : "") +
          '<div class="paire"><span class="l">Atelier</span><span class="v">' +
            e(r.nomAtelier) + "</span></div>" +
        "</div>" +
      "</div>" +

      '<div class="carte">' +
        '<div class="carte-titre">' + UI.icone("check", "ic-sm") + "Ce que vous pouvez faire</div>" +
        (accordes.length
          ? '<div class="mini-liste">' +
              accordes.map((d) =>
                '<div class="mini"><span class="l">' + e(d.libelle) + "</span>" +
                  '<span class="v vert">' + UI.icone("check", "ic-sm") + "</span></div>"
              ).join("") +
            "</div>"
          : '<p style="margin:0;font-size:13px;color:var(--encre-tres-douce)">' +
              "Aucun droit ne vous est encore accordé.</p>") +
        '<div class="aide" style="margin-top:8px">Ces droits sont réglés par ' +
          "l'administrateur de l'atelier.</div>" +
      "</div>" +

      '<div class="carte">' +
        '<button type="button" class="btn btn-danger btn-bloc" id="compte-deconnexion">' +
          "Se déconnecter</button>" +
      "</div>";

    UI.$("#compte-deconnexion").onclick = async () => {
      await Api.deconnexion();
      location.hash = "#/";
      window.AppNaviguer();
    };
  }

  /* ---------- Droits d'un modérateur ----------
     Ce que l'administrateur coche ici, le serveur l'applique (a_droit,
     dans supabase/droits.sql). Décocher une case ne fait donc pas que
     masquer un bouton : la requête correspondante est refusée. */

  function ouvrirDroits(membre, apres) {
    const droits = Api.lireDroits(membre);

    const corps = UI.ouvrirFeuille("Droits de " + (membre.nom_complet || membre.email),
      '<div class="carte">' +
        '<p style="margin:0 0 14px;font-size:13px;line-height:1.5;color:var(--encre-douce)">' +
          "Ce compte ne verra que ce que vous cochez ici. Les réglages de " +
          "l'atelier et l'équipe lui restent fermés dans tous les cas.</p>" +
        Api.DROITS.map((d) =>
          '<label class="interrupteur" style="display:flex;margin-bottom:10px">' +
            '<input type="checkbox" data-droit="' + e(d.cle) + '"' +
              (droits[d.cle] ? " checked" : "") + ">" +
            "<span>" + e(d.libelle) +
              (d.aide
                ? '<br><span style="color:var(--encre-tres-douce);font-size:12px">' +
                    e(d.aide) + "</span>"
                : "") +
            "</span>" +
          "</label>"
        ).join("") +
        '<button type="button" class="btn btn-bloc" id="droits-ok" style="margin-top:4px">' +
          UI.icone("check", "ic-sm") + "Enregistrer les droits</button>" +
      "</div>");

    const casePour = (cle) => UI.$('[data-droit="' + cle + '"]', corps);

    /* Imprimer les recettes suppose de pouvoir les consulter : on lie les
       deux cases plutôt que de laisser cocher un droit sans effet. */
    const voir = casePour("recettes_voir");
    const imprimer = casePour("recettes_recap");
    imprimer.addEventListener("change", () => {
      if (imprimer.checked) voir.checked = true;
    });
    voir.addEventListener("change", () => {
      if (!voir.checked) imprimer.checked = false;
    });

    UI.$("#droits-ok", corps).onclick = async () => {
      const bouton = UI.$("#droits-ok", corps);
      bouton.disabled = true;
      const nouveaux = {};
      for (const d of Api.DROITS) nouveaux[d.cle] = casePour(d.cle).checked;
      try {
        await Api.mettreAJour("profils", membre.id, { droits: nouveaux });
        UI.feuilleSansRappel();
        UI.fermerFeuille();
        UI.toast("Droits enregistrés", "ok");
        if (apres) apres();
      } catch (err) {
        UI.toast(err.message || "Enregistrement impossible", "erreur");
        bouton.disabled = false;
      }
    };
  }

  return { afficher, compte };
})();
