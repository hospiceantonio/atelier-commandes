/* =========================================================
   Vues SuperAdmin — liste des ateliers clients, création
   d'un compte administrateur relié à son atelier, fiche
   de gestion (abonnement, coordonnées, suppression).
   ========================================================= */
const VueSuperAdmin = (() => {
  const e = Utils.echapper;

  const finAbonnement = (a) => (a.abonnement_fin ? new Date(a.abonnement_fin).getTime() : 0);
  const actif = (a) => finAbonnement(a) > Date.now();

  function badgeAbonnement(a) {
    if (actif(a)) {
      const jours = Math.ceil((finAbonnement(a) - Date.now()) / 86400000);
      return '<span class="badge ' + (jours <= 5 ? "badge-ok" : "badge-fait") + '">' +
        (jours <= 5 ? jours + " j restants" : "Actif") + "</span>";
    }
    return '<span class="badge badge-danger">Expiré</span>';
  }

  /* ---------- Rappels d'échéance (message WhatsApp prêt à envoyer) ---------- */

  const RELANCE_AVANT_JOURS = 5;   // à relancer dès J-5…
  const RELANCE_APRES_JOURS = 45;  // …et jusqu'à 45 jours après l'expiration

  function messageRelance(a) {
    const jours = Math.ceil((finAbonnement(a) - Date.now()) / 86400000);
    const date = Utils.fmtDate(Utils.isoJour(new Date(a.abonnement_fin)));
    const montant = Utils.fmtMontant(a.abonnement_mensuel, a.devise) + " / mois";
    if (jours > 0) {
      return "Bonjour " + a.nom + " 👋\n" +
        "Votre abonnement à l'application Atelier expire le " + date +
        " (dans " + jours + " jour" + (jours > 1 ? "s" : "") + ").\n" +
        "Pour continuer sans interruption, renouvelez directement dans l'application : " +
        "Réglages → « Renouveler » — Mobile Money (MTN/Moov) ou carte (" + montant + ").\n" +
        "Merci pour votre confiance !";
    }
    return "Bonjour " + a.nom + " 👋\n" +
      "Votre abonnement à l'application Atelier a expiré le " + date +
      " : l'accès est suspendu, mais toutes vos données sont intactes.\n" +
      "Pour rouvrir l'application, payez directement sur l'écran affiché à la connexion — " +
      "Mobile Money (MTN/Moov) ou carte (" + montant + ").\n" +
      "Merci pour votre confiance !";
  }

  function carteRelances(ateliers, adminParAtelier) {
    const maintenant = Date.now();
    const aRelancer = ateliers
      .filter((a) => {
        const reste = finAbonnement(a) - maintenant;
        return reste < RELANCE_AVANT_JOURS * 86400000 && reste > -RELANCE_APRES_JOURS * 86400000;
      })
      .sort((x, y) => finAbonnement(x) - finAbonnement(y));
    if (!aRelancer.length) return "";

    return (
      '<div class="carte" id="carte-relances">' +
        '<div class="carte-titre">' + UI.icone("alerte", "ic-sm") + "À relancer</div>" +
        aRelancer.map((a, i) => {
          const admin = adminParAtelier[a.id];
          const jours = Math.ceil((finAbonnement(a) - maintenant) / 86400000);
          const statut = jours > 0
            ? "Expire dans " + jours + " jour" + (jours > 1 ? "s" : "")
            : (jours === 0 ? "Expire aujourd'hui" : "Expiré depuis " + (-jours) + " jour" + (jours < -1 ? "s" : ""));
          const numero = a.tel_whatsapp || a.tel_appel || (admin && admin.telephone) || "";
          return (
            '<div style="display:flex;align-items:center;gap:10px;padding:9px 0' +
              (i ? ";border-top:1px solid var(--trait)" : "") + '">' +
              '<div style="flex:1;min-width:0;cursor:pointer" data-nav="#/atelier-gere/' + a.id + '">' +
                '<div class="ligne-titre">' + e(a.nom) + "</div>" +
                '<div class="ligne-sous" style="color:' + (jours > 0 ? "var(--or-fonce)" : "var(--rouge)") + '">' +
                  statut + "</div>" +
              "</div>" +
              (numero
                ? '<a class="btn btn-sm btn-or" target="_blank" rel="noopener" data-relance href="' +
                    Utils.lienWhatsApp(numero, messageRelance(a), a.indicatif) + '">' +
                    UI.icone("whatsapp", "ic-sm") + "Relancer</a>"
                : '<span style="font-size:12px;color:var(--encre-tres-douce)">Sans n° WhatsApp</span>') +
            "</div>"
          );
        }).join("") +
        '<div class="aide" style="margin-top:8px">Un appui ouvre WhatsApp avec le message de rappel déjà écrit ' +
          "— il ne reste qu'à l'envoyer.</div>" +
      "</div>"
    );
  }

  /* ---------- Liste des ateliers ---------- */

  async function liste(vue) {
    const [ateliers, profils] = await Promise.all([
      Api.lister("ateliers", "cree_le", false),
      Api.lister("profils"),
    ]);
    const adminParAtelier = {};
    for (const p of profils) {
      if (p.atelier_id && !adminParAtelier[p.atelier_id]) adminParAtelier[p.atelier_id] = p;
    }

    UI.entete({
      titre: "Ateliers",
      sous: ateliers.length + " atelier" + (ateliers.length > 1 ? "s" : "") + " client" + (ateliers.length > 1 ? "s" : ""),
      actions:
        '<a class="btn-ic" href="#/atelier-nouveau" aria-label="Nouvel atelier">' + UI.icone("plus") + "</a>" +
        '<a class="btn-ic" href="#/reglages" aria-label="Compte">' + UI.icone("reglages") + "</a>",
    });

    if (!ateliers.length) {
      vue.innerHTML = UI.vide("clients", "Aucun atelier client",
        "Créez le premier compte administrateur relié à son atelier.",
        '<a class="btn" href="#/atelier-nouveau">' + UI.icone("plus", "ic-sm") + "Nouvel atelier</a>");
      return;
    }

    vue.innerHTML =
      carteRelances(ateliers, adminParAtelier) +
      '<div class="liste">' +
      ateliers.map((a) => {
        const admin = adminParAtelier[a.id];
        return (
          '<button type="button" class="ligne" data-nav="#/atelier-gere/' + a.id + '">' +
            (a.logo
              ? '<span class="pastille"><img src="' + a.logo + '" alt=""></span>'
              : '<span class="pastille">' + e((a.nom || "?")[0].toUpperCase()) + "</span>") +
            '<span class="ligne-corps">' +
              '<span class="ligne-titre">' + e(a.nom) + "</span>" +
              '<span class="ligne-sous">' +
                (admin ? e(admin.nom_complet || admin.email) : "Sans administrateur") +
              "</span>" +
            "</span>" +
            '<span class="ligne-fin">' +
              badgeAbonnement(a) +
              '<span style="font-size:11.5px;color:var(--encre-tres-douce)">' +
                Utils.fmtMontant(a.abonnement_mensuel, a.devise) + " / mois</span>" +
            "</span>" +
          "</button>"
        );
      }).join("") +
      "</div>";
  }

  /* ---------- Création d'un atelier + son administrateur ---------- */

  async function formulaire(vue) {
    UI.entete({ titre: "Nouvel atelier", sous: "Compte administrateur + atelier", retour: true });

    let logoDataUrl = "";

    vue.innerHTML =
      '<form id="form-atelier" novalidate>' +
        '<div class="carte">' +
          '<div class="carte-titre">' + UI.icone("clients", "ic-sm") + "Administrateur</div>" +
          '<div class="champ"><label for="na-nom">Prénom(s) et nom <span class="obligatoire">*</span></label>' +
            '<input id="na-nom" autocomplete="off" autocapitalize="words"></div>' +
          '<div class="champ"><label for="na-tel">Numéro de téléphone</label>' +
            '<input id="na-tel" type="tel" inputmode="tel" autocomplete="off"></div>' +
          '<div class="champ"><label for="na-email">Email (identifiant de connexion) <span class="obligatoire">*</span></label>' +
            '<input id="na-email" type="email" inputmode="email" autocomplete="off"></div>' +
          '<div class="champ"><label for="na-mdp">Mot de passe <span class="obligatoire">*</span></label>' +
            '<input id="na-mdp" type="text" autocomplete="off" placeholder="6 caractères minimum">' +
            '<div class="aide">À transmettre à l\'administrateur ; il pourra le changer plus tard.</div></div>' +
        "</div>" +

        '<div class="carte">' +
          '<div class="carte-titre">' + UI.icone("commandes", "ic-sm") + "Atelier</div>" +
          '<div class="champ"><label for="na-atelier">Nom de l\'atelier <span class="obligatoire">*</span></label>' +
            '<input id="na-atelier" autocomplete="off" autocapitalize="words"></div>' +
          '<div class="champ"><label for="na-slogan">Slogan</label>' +
            '<input id="na-slogan" autocomplete="off"></div>' +
          '<div class="champ"><label>Logo</label>' +
            '<div style="display:flex;align-items:center;gap:12px">' +
              '<img id="na-logo-apercu" class="logo-apercu" alt="" hidden>' +
              '<button type="button" class="btn btn-clair btn-sm" id="na-logo-choisir">Choisir une image</button>' +
              '<button type="button" class="btn btn-danger btn-sm" id="na-logo-retirer" hidden>Retirer</button>' +
            "</div>" +
            '<input type="file" id="na-logo" accept="image/*" hidden></div>' +
          '<div class="champ-duo">' +
            '<div class="champ"><label for="na-wa">N° WhatsApp de l\'atelier</label>' +
              '<input id="na-wa" type="tel" inputmode="tel" autocomplete="off"></div>' +
            '<div class="champ"><label for="na-appel">N° d\'appel de l\'atelier</label>' +
              '<input id="na-appel" type="tel" inputmode="tel" autocomplete="off"></div>' +
          "</div>" +
          '<div class="champ-duo">' +
            '<div class="champ"><label for="na-devise">Devise</label>' +
              '<input id="na-devise" autocomplete="off" value="FCFA"></div>' +
            '<div class="champ"><label for="na-indicatif">Indicatif pays</label>' +
              '<input id="na-indicatif" inputmode="numeric" autocomplete="off" value="229"></div>' +
          "</div>" +
          UI.champMontant({ id: "na-abonnement", label: "Abonnement mensuel", valeur: 5000, obligatoire: true,
            aide: "L'atelier démarre avec 14 jours offerts ; prolongez ensuite depuis sa fiche." }) +
        "</div>" +

        '<button type="submit" class="btn btn-bloc" id="na-creer">' +
          UI.icone("check", "ic-sm") + "Créer l'atelier et son administrateur</button>" +
      "</form>";

    /* Logo */
    const champLogo = UI.$("#na-logo");
    const apercu = UI.$("#na-logo-apercu");
    const retirer = UI.$("#na-logo-retirer");
    UI.$("#na-logo-choisir").onclick = () => champLogo.click();
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

    /* Création */
    UI.$("#form-atelier").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const nomAdmin = UI.$("#na-nom").value.trim();
      const email = UI.$("#na-email").value.trim();
      const motDePasse = UI.$("#na-mdp").value;
      const nomAtelier = UI.$("#na-atelier").value.trim();
      const abonnement = Utils.lireNombre(UI.$("#na-abonnement").value);

      if (!nomAdmin) { UI.toast("Indiquez le nom de l'administrateur", "erreur"); return; }
      if (!email || !email.includes("@")) { UI.toast("Indiquez un email valide", "erreur"); return; }
      if (motDePasse.length < 6) { UI.toast("Mot de passe : 6 caractères minimum", "erreur"); return; }
      if (!nomAtelier) { UI.toast("Indiquez le nom de l'atelier", "erreur"); return; }
      if (abonnement <= 0) { UI.toast("Indiquez le montant de l'abonnement mensuel", "erreur"); return; }

      const bouton = UI.$("#na-creer");
      bouton.disabled = true;
      let atelier = null;
      try {
        atelier = await Api.inserer("ateliers", {
          nom: nomAtelier,
          slogan: UI.$("#na-slogan").value.trim(),
          logo: logoDataUrl,
          tel_whatsapp: UI.$("#na-wa").value.trim(),
          tel_appel: UI.$("#na-appel").value.trim(),
          devise: UI.$("#na-devise").value.trim() || "FCFA",
          indicatif: UI.$("#na-indicatif").value.replace(/\D/g, "") || "229",
          abonnement_mensuel: abonnement,
        });
        const utilisateur = await Api.creerCompteAdmin(email, motDePasse,
          nomAdmin, UI.$("#na-tel").value.trim());
        await Api.mettreAJour("profils", utilisateur.id, { atelier_id: atelier.id });
        UI.toast("Atelier « " + nomAtelier + " » créé", "ok");
        location.hash = "#/atelier-gere/" + atelier.id;
      } catch (err) {
        // Le compte n'a pas pu être créé : on retire l'atelier orphelin.
        if (atelier) { try { await Api.supprimerLigne("ateliers", atelier.id); } catch (_) { /* déjà signalé */ } }
        UI.toast(err.message || "Création impossible", "erreur");
        bouton.disabled = false;
      }
    });
  }

  /* ---------- Fiche d'un atelier client ---------- */

  async function fiche(vue, id) {
    const atelier = await Api.lireLigne("ateliers", id);
    if (!atelier) { location.hash = "#/"; return; }
    const admins = await Api.listerPar("profils", "atelier_id", id);
    const admin = admins[0] || null;
    let paiements = [];
    try {
      paiements = await Api.listerPar("paiements_abonnement", "atelier_id", id, "cree_le", false);
    } catch (_) { /* base pas encore à jour : pas de journal */ }

    UI.entete({
      titre: atelier.nom,
      sous: admin ? (admin.nom_complet || admin.email) : "Sans administrateur",
      retour: true,
    });

    vue.innerHTML =
      '<div class="carte">' +
        '<div style="display:flex;align-items:center;gap:12px">' +
          (atelier.logo
            ? '<img src="' + atelier.logo + '" alt="" class="logo-apercu">'
            : '<span class="pastille">' + e((atelier.nom || "?")[0].toUpperCase()) + "</span>") +
          '<div style="flex:1;min-width:0">' +
            '<div class="ligne-titre">' + e(atelier.nom) + "</div>" +
            '<div class="ligne-sous">' + e(atelier.slogan || "Sans slogan") + "</div>" +
          "</div>" +
          badgeAbonnement(atelier) +
        "</div>" +
      "</div>" +

      '<div class="carte">' +
        '<div class="carte-titre">' + UI.icone("check", "ic-sm") + "Abonnement</div>" +
        '<div class="paires">' +
          '<div class="paire"><span class="l">Montant mensuel</span><span class="v gros">' +
            Utils.fmtMontant(atelier.abonnement_mensuel, atelier.devise) + "</span></div>" +
          '<div class="paire"><span class="l">Actif jusqu\'au</span><span class="v ' +
            (actif(atelier) ? "vert" : "rouge") + '">' +
            Utils.fmtDate(Utils.isoJour(new Date(atelier.abonnement_fin))) + "</span></div>" +
        "</div>" +
        '<div class="btn-rangee" style="margin-top:12px">' +
          '<button type="button" class="btn btn-or" id="fa-prolonger">+ 1 mois</button>' +
          '<button type="button" class="btn btn-clair" id="fa-suspendre">Suspendre maintenant</button>' +
        "</div>" +
      "</div>" +

      (paiements.length
        ? '<div class="carte">' +
            '<div class="carte-titre">' + UI.icone("stats", "ic-sm") + "Paiements Mobile Money reçus</div>" +
            '<div class="paires">' +
            paiements.map((p) =>
              '<div class="paire"><span class="l">' +
                Utils.fmtDate(Utils.isoJour(new Date(p.cree_le))) +
                " · " + p.mois + " mois</span><span class='v vert'>" +
                Utils.fmtMontant(p.montant, atelier.devise) + "</span></div>"
            ).join("") +
            "</div>" +
          "</div>"
        : "") +

      '<div class="carte">' +
        '<div class="carte-titre">' + UI.icone("clients", "ic-sm") + "Administrateur</div>" +
        '<div class="paires">' +
          '<div class="paire"><span class="l">Nom</span><span class="v">' + e(admin ? admin.nom_complet || "—" : "—") + "</span></div>" +
          '<div class="paire"><span class="l">Email</span><span class="v">' + e(admin ? admin.email : "—") + "</span></div>" +
          '<div class="paire"><span class="l">Téléphone</span><span class="v">' + e(admin ? Utils.fmtTel(admin.telephone) : "—") + "</span></div>" +
        "</div>" +
      "</div>" +

      '<form id="form-fiche">' +
        '<div class="carte">' +
          '<div class="carte-titre">' + UI.icone("crayon", "ic-sm") + "Modifier l'atelier</div>" +
          '<div class="champ"><label for="fa-nom">Nom de l\'atelier</label>' +
            '<input id="fa-nom" autocomplete="off" value="' + e(atelier.nom) + '"></div>' +
          '<div class="champ"><label for="fa-slogan">Slogan</label>' +
            '<input id="fa-slogan" autocomplete="off" value="' + e(atelier.slogan) + '"></div>' +
          '<div class="champ-duo">' +
            '<div class="champ"><label for="fa-devise">Devise</label>' +
              '<input id="fa-devise" autocomplete="off" value="' + e(atelier.devise) + '"></div>' +
            '<div class="champ"><label for="fa-indicatif">Indicatif</label>' +
              '<input id="fa-indicatif" inputmode="numeric" autocomplete="off" value="' + e(atelier.indicatif) + '"></div>' +
          "</div>" +
          UI.champMontant({ id: "fa-abonnement", label: "Abonnement mensuel", valeur: atelier.abonnement_mensuel }) +
          '<button type="submit" class="btn btn-bloc">' + UI.icone("check", "ic-sm") + "Enregistrer</button>" +
        "</div>" +
      "</form>" +

      '<button type="button" class="btn btn-danger btn-bloc" id="fa-supprimer" style="margin-top:6px">' +
        UI.icone("poubelle", "ic-sm") + "Supprimer cet atelier</button>";

    const recharger = () => fiche(vue, id);

    UI.$("#fa-prolonger").onclick = async () => {
      const base = Math.max(Date.now(), finAbonnement(atelier));
      await Api.mettreAJour("ateliers", id, {
        abonnement_fin: new Date(base + 31 * 86400000).toISOString(),
      });
      UI.toast("Abonnement prolongé d'un mois", "ok");
      recharger();
    };

    UI.$("#fa-suspendre").onclick = async () => {
      const ok = await UI.confirmer({
        titre: "Suspendre l'abonnement",
        texte: "L'atelier « " + atelier.nom + " » sera bloqué immédiatement (ses données sont conservées).",
        bouton: "Suspendre", danger: true,
      });
      if (!ok) return;
      await Api.mettreAJour("ateliers", id, { abonnement_fin: new Date(Date.now() - 1000).toISOString() });
      UI.toast("Abonnement suspendu", "ok");
      recharger();
    };

    UI.$("#form-fiche").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try {
        await Api.mettreAJour("ateliers", id, {
          nom: UI.$("#fa-nom").value.trim() || atelier.nom,
          slogan: UI.$("#fa-slogan").value.trim(),
          devise: UI.$("#fa-devise").value.trim() || "FCFA",
          indicatif: UI.$("#fa-indicatif").value.replace(/\D/g, "") || "229",
          abonnement_mensuel: Utils.lireNombre(UI.$("#fa-abonnement").value) || atelier.abonnement_mensuel,
        });
        UI.toast("Atelier mis à jour", "ok");
        recharger();
      } catch (err) {
        UI.toast(err.message || "Enregistrement impossible", "erreur");
      }
    });

    UI.$("#fa-supprimer").onclick = async () => {
      const ok = await UI.confirmer({
        titre: "Supprimer l'atelier",
        texte: "Toutes les données de « " + atelier.nom + " » (clients, commandes, photos, dépenses) " +
          "seront définitivement effacées. Le compte administrateur restera mais sans atelier.",
        bouton: "Supprimer définitivement", danger: true,
      });
      if (!ok) return;
      await Api.supprimerLigne("ateliers", id);
      UI.toast("Atelier supprimé", "ok");
      location.hash = "#/";
    };
  }

  /* ---------- Compte superadmin ---------- */

  async function compte(vue) {
    const profil = Api.lireProfil();
    const prm = Api.lireParametres();
    UI.entete({ titre: "Mon compte", sous: "Superadministrateur", retour: true });
    vue.innerHTML =
      '<div class="carte">' +
        '<div class="paires">' +
          '<div class="paire"><span class="l">Nom</span><span class="v">' + e(profil.nom_complet || "—") + "</span></div>" +
          '<div class="paire"><span class="l">Email</span><span class="v">' + e(profil.email) + "</span></div>" +
          '<div class="paire"><span class="l">Rôle</span><span class="v">Superadministrateur</span></div>' +
        "</div>" +
      "</div>" +

      (prm
        ? '<form id="form-kkiapay">' +
            '<div class="carte">' +
              '<div class="carte-titre">' + UI.icone("check", "ic-sm") + "Paiement en ligne (KKiaPay)</div>" +
              '<div class="champ"><label for="sa-kkiapay-cle">Clé publique KKiaPay</label>' +
                '<input id="sa-kkiapay-cle" autocomplete="off" spellcheck="false" value="' + e(prm.kkiapay_cle_publique) + '">' +
                '<div class="aide">Laissez vide pour désactiver le paiement en ligne : les administrateurs ' +
                  "verront alors seulement « contactez votre fournisseur ».</div></div>" +
              '<label class="interrupteur" style="display:flex">' +
                '<input type="checkbox" id="sa-kkiapay-sandbox"' + (prm.kkiapay_sandbox ? " checked" : "") + ">" +
                "<span>Mode <strong>bac à sable</strong> (paiements de test — clé publique sandbox, " +
                  "numéro de test 97000000)</span>" +
              "</label>" +
              '<div class="aide" style="margin-top:8px">La clé, le webhook et le mode (bac à sable ou réel) ' +
                "doivent être du même côté dans le tableau de bord KKiaPay.</div>" +
              '<button type="submit" class="btn btn-bloc" style="margin-top:12px">' +
                UI.icone("check", "ic-sm") + "Enregistrer</button>" +
            "</div>" +
          "</form>"
        : '<div class="carte">' +
            '<div class="carte-titre">Paiement en ligne (KKiaPay)</div>' +
            '<p style="margin:0;font-size:13px;line-height:1.5;color:var(--encre-douce)">' +
              "Mettez la base à jour (exécutez <code>supabase/schema.sql</code> dans l'éditeur SQL " +
              "de Supabase) puis reconnectez-vous pour configurer le paiement en ligne.</p>" +
          "</div>") +

      '<button type="button" class="btn btn-danger btn-bloc" id="sa-deconnexion">Se déconnecter</button>';

    const formulaireKkiapay = UI.$("#form-kkiapay");
    if (formulaireKkiapay) {
      formulaireKkiapay.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        try {
          await Api.majParametres({
            kkiapay_cle_publique: UI.$("#sa-kkiapay-cle").value.trim(),
            kkiapay_sandbox: UI.$("#sa-kkiapay-sandbox").checked,
          });
          UI.toast("Réglages de paiement enregistrés", "ok");
        } catch (err) {
          UI.toast(err.message || "Enregistrement impossible", "erreur");
        }
      });
    }

    UI.$("#sa-deconnexion").onclick = async () => {
      await Api.deconnexion();
      location.hash = "#/";
      window.AppNaviguer();
    };
  }

  return { liste, formulaire, fiche, compte };
})();
