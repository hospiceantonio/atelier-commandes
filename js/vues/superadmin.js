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
        '<a class="btn-ic" href="#/reglages" aria-label="Tableau de bord">' + UI.icone("stats") + "</a>",
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
              ? '<span class="pastille"><img src="' + Stockage.src(a.logo) + '" alt=""></span>'
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
    UI.entete({ titre: "Nouvel atelier", sous: "Création manuelle, en secours", retour: true });

    let logoDataUrl = "";
    let logoFichier = null;   /* déposé seulement à la création */

    /* Les maisons s'inscrivent seules ; cet écran reste pour dépanner.
       La formule y remplit le tarif comme à l'inscription — saisir un
       prix différent des formules serait une source d'écarts. */
    let listeFormules = [];
    try {
      listeFormules = await Store.listerFormules();
    } catch (_) {
      /* formules.sql pas encore exécuté : on retombe sur la saisie libre. */
    }

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
          (listeFormules.length
            ? '<div class="champ"><label for="na-formule">Formule <span class="obligatoire">*</span></label>' +
                '<select id="na-formule">' +
                  listeFormules.map((f) =>
                    '<option value="' + e(f.code) + '"' +
                      (f.code === "atelier_vitrine" ? " selected" : "") + ">" +
                      e(f.nom) + " — " + Utils.fmtMontant(Number(f.prix_mensuel) || 0, "FCFA") +
                      " / mois</option>"
                  ).join("") +
                "</select>" +
                '<div class="aide" id="na-formule-aide"></div></div>'
            : "") +
          UI.champMontant({ id: "na-abonnement", label: "Abonnement mensuel", valeur: 5000, obligatoire: true,
            aide: "L'atelier démarre avec 14 jours offerts ; prolongez ensuite depuis sa fiche." }) +
        "</div>" +

        '<button type="submit" class="btn btn-bloc" id="na-creer">' +
          UI.icone("check", "ic-sm") + "Créer l'atelier et son administrateur</button>" +
      "</form>";

    /* La formule remplit le tarif. Le champ reste modifiable : un tarif
       négocié doit rester possible, et le superadministrateur est le seul
       à pouvoir le faire. */
    const champFormule = UI.$("#na-formule");
    if (champFormule) {
      const suivreFormule = () => {
        const f = listeFormules.find((x) => x.code === champFormule.value);
        if (!f) return;
        UI.$("#na-abonnement").value = String(Number(f.prix_mensuel) || 0);
        UI.$("#na-formule-aide").textContent = Store.resumeFormule(f.code) +
          (f.active ? "" : " — formule fermée aux inscriptions.");
      };
      champFormule.addEventListener("change", suivreFormule);
      suivreFormule();
    }

    /* Logo */
    const champLogo = UI.$("#na-logo");
    const apercu = UI.$("#na-logo-apercu");
    const retirer = UI.$("#na-logo-retirer");
    UI.$("#na-logo-choisir").onclick = () => champLogo.click();
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
        logoFichier = fichier;
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
          logo: "",
          tel_whatsapp: UI.$("#na-wa").value.trim(),
          tel_appel: UI.$("#na-appel").value.trim(),
          devise: UI.$("#na-devise").value.trim() || "FCFA",
          indicatif: UI.$("#na-indicatif").value.replace(/\D/g, "") || "229",
          abonnement_mensuel: abonnement,
          ...(champFormule ? { formule: champFormule.value } : {}),
        });
        /* Le chemin du logo contient l'identifiant de l'atelier, qui
           n'existe qu'une fois la ligne créée : d'où ce second temps. */
        if (logoFichier) {
          const chemin = await Stockage.deposerImage(logoFichier, Stockage.VITRINE,
            "logo", { coteMax: 400, qualite: 0.82, atelierId: atelier.id });
          atelier = await Api.mettreAJour("ateliers", atelier.id, { logo: chemin });
        }

        const utilisateur = await Api.creerCompteAdmin(email, motDePasse,
          nomAdmin, UI.$("#na-tel").value.trim());
        await Api.rattacherAdmin(utilisateur.id, atelier.id);
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
    let formulesFiche = [];
    try {
      formulesFiche = await Store.listerFormules();
    } catch (_) { /* formules.sql pas encore exécuté */ }

    UI.entete({
      titre: atelier.nom,
      sous: admin ? (admin.nom_complet || admin.email) : "Sans administrateur",
      retour: true,
    });

    vue.innerHTML =
      '<div class="carte">' +
        '<div style="display:flex;align-items:center;gap:12px">' +
          (atelier.logo
            ? '<img src="' + Stockage.src(atelier.logo) + '" alt="" class="logo-apercu">'
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
          '<div class="paire"><span class="l">Formule</span><span class="v">' +
            e(Store.libelleFormule(atelier.formule, formulesFiche)) + "</span></div>" +
          '<div class="paire"><span class="l">Montant mensuel</span><span class="v gros">' +
            Utils.fmtMontant(atelier.abonnement_mensuel, atelier.devise) + "</span></div>" +
          '<div class="paire"><span class="l">Actif jusqu\'au</span><span class="v ' +
            (actif(atelier) ? "vert" : "rouge") + '">' +
            Utils.fmtDate(Utils.isoJour(new Date(atelier.abonnement_fin))) + "</span></div>" +
        "</div>" +
        '<div class="aide" style="margin-top:8px">' +
          e(Store.resumeFormule(atelier.formule || "atelier_vitrine")) + "</div>" +
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
          (formulesFiche.length
            ? '<div class="champ"><label for="fa-formule">Formule</label>' +
                '<select id="fa-formule">' +
                  formulesFiche.map((f) =>
                    '<option value="' + e(f.code) + '"' +
                      (f.code === (atelier.formule || "atelier_vitrine") ? " selected" : "") + ">" +
                      e(f.nom) + " — " + Utils.fmtMontant(Number(f.prix_mensuel) || 0, atelier.devise) +
                      " / mois</option>"
                  ).join("") +
                "</select>" +
                '<div class="aide" id="fa-formule-aide"></div></div>'
            : "") +
          UI.champMontant({ id: "fa-abonnement", label: "Abonnement mensuel", valeur: atelier.abonnement_mensuel }) +
          '<button type="submit" class="btn btn-bloc">' + UI.icone("check", "ic-sm") + "Enregistrer</button>" +
        "</div>" +
      "</form>" +

      '<button type="button" class="btn btn-danger btn-bloc" id="fa-supprimer" style="margin-top:6px">' +
        UI.icone("poubelle", "ic-sm") + "Supprimer cet atelier</button>";

    const recharger = () => fiche(vue, id);

    UI.$("#fa-prolonger").onclick = async () => {
      const base = Math.max(Date.now(), finAbonnement(atelier));
      const nouvelleFin = new Date(base + 31 * 86400000).toISOString();
      await Api.mettreAJour("ateliers", id, { abonnement_fin: nouvelleFin });
      // Trace du renouvellement encaissé hors ligne, pour l'historique.
      try {
        await Api.inserer("paiements_abonnement", {
          atelier_id: id,
          reference: "manuel:" + Utils.uid("r"),
          montant: atelier.abonnement_mensuel,
          mois: 1,
          fin_avant: atelier.abonnement_fin,
          fin_apres: nouvelleFin,
        });
      } catch (_) { /* base pas encore à jour : l'abonnement est prolongé malgré tout */ }
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

    /* Changer la formule change le tarif : c'est la seule occasion où un
       abonnement déjà ouvert est re-tarifé, et elle est explicite. */
    const formuleFiche = UI.$("#fa-formule");
    if (formuleFiche) {
      const suivre = () => {
        const f = formulesFiche.find((x) => x.code === formuleFiche.value);
        if (!f) return;
        const change = f.code !== (atelier.formule || "atelier_vitrine");
        if (change) UI.$("#fa-abonnement").value = String(Number(f.prix_mensuel) || 0);
        UI.$("#fa-formule-aide").textContent = Store.resumeFormule(f.code) +
          (change ? " — le tarif passe à " +
            Utils.fmtMontant(Number(f.prix_mensuel) || 0, atelier.devise) + "." : "");
      };
      formuleFiche.addEventListener("change", suivre);
      suivre();
    }

    UI.$("#form-fiche").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try {
        await Api.mettreAJour("ateliers", id, {
          nom: UI.$("#fa-nom").value.trim() || atelier.nom,
          slogan: UI.$("#fa-slogan").value.trim(),
          devise: UI.$("#fa-devise").value.trim() || "FCFA",
          indicatif: UI.$("#fa-indicatif").value.replace(/\D/g, "") || "229",
          abonnement_mensuel: Utils.lireNombre(UI.$("#fa-abonnement").value) || atelier.abonnement_mensuel,
          ...(formuleFiche ? { formule: formuleFiche.value } : {}),
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

  /* ---------- Historique des renouvellements ---------- */

  const estMobileMoney = (p) => String(p.reference || "").startsWith("kkiapay:");
  const estCode = (p) => String(p.reference || "").startsWith("code:");
  /* Même libellé à l'écran et sur le document A4. */
  const modeRenouvellement = (p) =>
    estMobileMoney(p) ? "Mobile Money / carte"
      : estCode(p) ? "Par code"
      : "Encaissé par vous";

  /* Le choix de période survit aux réaffichages des deux vues. */
  const periodePaiements = { actif: "annee", libre: { debut: null, fin: null } };
  const periodeBord = { actif: "annee", libre: { debut: null, fin: null } };

  /** Garde les enregistrements dont `champ` tombe dans [debut, fin], jours inclus. */
  function surPeriode(liste, bornes, champ) {
    const debut = new Date(bornes.debut + "T00:00:00");
    const fin = new Date(bornes.fin + "T00:00:00");
    fin.setDate(fin.getDate() + 1);
    return liste.filter((l) => {
      const valeur = l[champ || "cree_le"];
      if (!valeur) return false;
      const t = new Date(valeur);
      return t >= debut && t < fin;
    });
  }

  async function paiements(vue) {
    const profil = Api.lireProfil();
    const [toutes, ateliers] = await Promise.all([
      Api.lister("paiements_abonnement", "cree_le", false),
      Api.lister("ateliers"),
    ]);
    const parId = {};
    for (const a of ateliers) parId[a.id] = a;

    const devise = (ateliers[0] && ateliers[0].devise) || "FCFA";
    const total = toutes.reduce((s, p) => s + (Number(p.montant) || 0), 0);

    UI.entete({
      titre: "Renouvellements",
      sous: toutes.length + " paiement" + (toutes.length > 1 ? "s" : "") + " enregistré" + (toutes.length > 1 ? "s" : ""),
      retour: true,
      actions: toutes.length
        ? '<button type="button" class="btn-ic" id="rn-imprimer" aria-label="Imprimer les renouvellements">' +
            UI.icone("telecharger") + "</button>"
        : "",
    });

    if (!toutes.length) {
      vue.innerHTML = UI.vide("argent", "Aucun renouvellement",
        "Les paiements Mobile Money de vos ateliers et vos renouvellements « + 1 mois » " +
        "apparaîtront ici, avec les totaux.");
      return;
    }

    vue.innerHTML = UI.gabaritPeriode(periodePaiements, "rn") + '<div id="rn-zone"></div>';
    UI.brancherPeriode(periodePaiements, () => rendre(), "rn");
    rendre();

    function rendre() {
      const b = UI.bornesPeriode(periodePaiements.actif, periodePaiements.libre);
      const libelle = UI.libellePeriode(periodePaiements.actif, b);
      const liste = surPeriode(toutes, b);
      const somme = (t) => t.reduce((s, p) => s + (Number(p.montant) || 0), 0);
      const enLigne = liste.filter(estMobileMoney);

      /* Regroupement par mois, du plus récent au plus ancien. */
      const parMois = {};
      for (const p of liste) {
        const d = new Date(p.cree_le);
        const cle = d.getFullYear() + "-" + Utils.pad(d.getMonth() + 1);
        (parMois[cle] = parMois[cle] || []).push(p);
      }

      UI.$("#rn-zone").innerHTML =
        '<p style="margin:2px 0 0;font-size:12.5px;color:var(--encre-tres-douce)">' +
          e(libelle) + "</p>" +

        '<div class="tuiles">' +
          '<div class="tuile tuile-vert"><div class="tuile-label">' + UI.icone("argent", "ic-sm") + "Sur la période</div>" +
            '<div class="tuile-valeur">' + Utils.fmtMontant(somme(liste), devise) + "</div>" +
            '<div class="tuile-note">' + liste.length + " renouvellement" + (liste.length > 1 ? "s" : "") + "</div></div>" +
          '<div class="tuile"><div class="tuile-label">' + UI.icone("stats", "ic-sm") + "Total encaissé</div>" +
            '<div class="tuile-valeur">' + Utils.fmtMontant(total, devise) + "</div>" +
            '<div class="tuile-note">depuis le début</div></div>' +
          '<div class="tuile"><div class="tuile-label">' + UI.icone("tel", "ic-sm") + "Mobile Money</div>" +
            '<div class="tuile-valeur">' + enLigne.length + "</div>" +
            '<div class="tuile-note">sur ' + liste.length + " paiement" + (liste.length > 1 ? "s" : "") + "</div></div>" +
          '<div class="tuile"><div class="tuile-label">' + UI.icone("clients", "ic-sm") + "Ateliers payants</div>" +
            '<div class="tuile-valeur">' + new Set(liste.map((p) => p.atelier_id)).size + "</div>" +
            '<div class="tuile-note">ont renouvelé sur la période</div></div>' +
        "</div>" +

        (liste.length
          ? Object.keys(parMois).sort().reverse().map((cle) => {
              const [annee, mois] = cle.split("-");
              return (
                '<div class="section-titre">' +
                  e(Utils.MOIS[Number(mois) - 1] + " " + annee) +
                  '<span class="lien">' + Utils.fmtMontant(somme(parMois[cle]), devise) + "</span>" +
                "</div>" +
                '<div class="carte"><div class="mini-liste">' +
                parMois[cle].map((p) => {
                  const atelier = parId[p.atelier_id];
                  return (
                    '<div class="mini">' +
                      '<span class="l"><strong>' + e(atelier ? atelier.nom : "Atelier supprimé") + "</strong>" +
                        '<br><span style="color:var(--encre-tres-douce);font-size:12px">' +
                          Utils.fmtDateHeure(p.cree_le) + " · " +
                          modeRenouvellement(p) +
                          (p.mois > 1 ? " · " + p.mois + " mois" : "") +
                        "</span></span>" +
                      '<span class="v" style="color:var(--vert)">+' +
                        Utils.fmtMontant(p.montant, (atelier && atelier.devise) || devise) + "</span>" +
                    "</div>"
                  );
                }).join("") +
                "</div></div>"
              );
            }).join("")
          : UI.vide("argent", "Aucun renouvellement sur cette période",
              "Choisissez une autre période pour voir les paiements concernés.")) +

        '<p class="pied-note">Les paiements Mobile Money sont inscrits par le serveur ; ' +
          "les renouvellements « + 1 mois » sont ceux que vous encaissez vous-même.</p>";

      const boutonImprimer = UI.$("#rn-imprimer");
      if (boutonImprimer) {
        boutonImprimer.onclick = () => {
          UI.choisirImpression("Renouvellements — " + libelle,
            () => Utils.imprimerA4("Renouvellements Atelier",
              renouvellementsA4(liste, ateliers, devise, profil, libelle, total)));
        };
      }
    }
  }

  /** Journal des renouvellements au format A4 : totaux, détail par mois,
      puis récapitulatif par atelier. `liste` ne contient que la période
      demandée ; `totalGeneral` rappelle le cumul depuis le début. */
  function renouvellementsA4(liste, ateliers, devise, profil, libellePeriode, totalGeneral) {
    const m = (v) => Utils.fmtMontant(v, devise);
    const parId = {};
    for (const a of ateliers) parId[a.id] = a;
    const nom = (p) => (parId[p.atelier_id] ? parId[p.atelier_id].nom : "Atelier supprimé");
    const montant = (p) => Number(p.montant) || 0;
    const somme = (t) => t.reduce((s, p) => s + montant(p), 0);

    const total = somme(liste);
    const cumul = totalGeneral === undefined ? total : totalGeneral;
    const enLigne = liste.filter(estMobileMoney);
    const codes = liste.filter(estCode);

    /* Du plus récent au plus ancien, comme à l'écran. */
    const parMois = {};
    for (const p of liste) {
      const d = new Date(p.cree_le);
      const cle = d.getFullYear() + "-" + Utils.pad(d.getMonth() + 1);
      (parMois[cle] = parMois[cle] || []).push(p);
    }
    const mois = Object.keys(parMois).sort().reverse();

    /* Un atelier par ligne, le plus gros contributeur en tête. */
    const parAtelier = {};
    for (const p of liste) {
      const cle = p.atelier_id || "?";
      const f = (parAtelier[cle] = parAtelier[cle] || { nom: nom(p), nb: 0, total: 0, dernier: 0 });
      f.nb += 1;
      f.total += montant(p);
      f.dernier = Math.max(f.dernier, new Date(p.cree_le).getTime());
    }
    const ateliersTries = Object.values(parAtelier).sort((x, y) => y.total - x.total);

    const bloc = (l, v, n, couleur) =>
      "<div class='case'><div class='l'>" + e(l) + "</div>" +
      "<div class='v'" + (couleur ? " style='color:" + couleur + "'" : "") + ">" + v + "</div>" +
      "<div class='n'>" + e(n) + "</div></div>";

    return (
      "<!DOCTYPE html><html lang='fr'><head><meta charset='utf-8'>" +
      "<title>Renouvellements Atelier</title><style>" +
      "@page{size:A4;margin:15mm}" +
      "*{box-sizing:border-box}" +
      "body{margin:0;font-family:'Helvetica Neue',Arial,sans-serif;color:#141636;font-size:11pt;line-height:1.45}" +
      ".entete{display:flex;align-items:flex-end;border-bottom:2px solid #2E3192;padding-bottom:5mm}" +
      ".marque{flex:1}.marque h1{margin:0;font-size:20pt;color:#2E3192;letter-spacing:-.5px}" +
      ".marque p{margin:1mm 0 0;font-size:10pt;color:#5b5f7d}" +
      ".titre{text-align:right}.titre h2{margin:0;font-size:13pt;letter-spacing:1px}" +
      ".titre p{margin:1mm 0 0;font-size:10pt;color:#5b5f7d}" +
      ".resume{display:flex;gap:3.5mm;margin:6mm 0 0}" +
      ".case{flex:1;border:1px solid #e3e5f0;border-radius:2mm;padding:3.5mm}" +
      ".case .l{font-size:9pt;text-transform:uppercase;letter-spacing:.8px;color:#5b5f7d}" +
      ".case .v{font-size:15pt;font-weight:750;margin-top:1mm}" +
      ".case .n{font-size:8.5pt;color:#8b8fa8;margin-top:.5mm}" +
      /* Un titre ne doit jamais rester seul en bas de page. */
      "h3{margin:8mm 0 2mm;font-size:11pt;color:#2E3192;text-transform:uppercase;letter-spacing:.8px;" +
        "page-break-after:avoid;break-after:avoid}" +
      "h4{margin:5mm 0 1.5mm;font-size:10pt;color:#141636;display:flex;justify-content:space-between;" +
        "border-bottom:1px solid #e3e5f0;padding-bottom:1mm;page-break-after:avoid;break-after:avoid}" +
      "h4 span{color:#0F9D58;font-weight:750}" +
      "table{width:100%;border-collapse:collapse}" +
      "thead{display:table-header-group}" +
      "th{text-align:left;font-size:9pt;text-transform:uppercase;letter-spacing:.5px;color:#5b5f7d;" +
        "border-bottom:1.5px solid #2E3192;padding:2mm}" +
      "td{padding:2mm;border-bottom:1px solid #e9eaf3;font-size:10.5pt}" +
      "tr{page-break-inside:avoid}" +
      "td.num,th.num{text-align:right;white-space:nowrap}" +
      "td.date{white-space:nowrap;color:#5b5f7d}" +
      "td.mode{font-size:9.5pt;color:#5b5f7d}" +
      "tfoot td{font-weight:750;border-top:1.5px solid #2E3192;border-bottom:0}" +
      ".bloc-mois{page-break-inside:avoid}" +
      ".pied{margin-top:8mm;border-top:1px solid #e3e5f0;padding-top:3mm;font-size:9.5pt;" +
        "color:#5b5f7d;display:flex;justify-content:space-between}" +
      "</style></head><body>" +

      "<div class='entete'>" +
        "<div class='marque'><h1>Atelier</h1>" +
          "<p>Plateforme de gestion pour ateliers de couture</p></div>" +
        "<div class='titre'><h2>RENOUVELLEMENTS</h2>" +
          (libellePeriode ? "<p><strong>" + e(libellePeriode) + "</strong></p>" : "") +
          "<p>Édité le " + e(Utils.fmtDate(Utils.aujourdhui())) + "</p>" +
          "<p>" + e(profil ? (profil.nom_complet || profil.email) : "") + "</p></div>" +
      "</div>" +

      "<div class='resume'>" +
        bloc("Sur la période", m(total),
          liste.length + " renouvellement" + (liste.length > 1 ? "s" : ""), "#0F9D58") +
        bloc("Total encaissé", m(cumul), "depuis le début", "#0F9D58") +
        bloc("Mobile Money", enLigne.length,
          m(somme(enLigne)) + " en ligne", "") +
        bloc("Ateliers payants", ateliersTries.length,
          "ont renouvelé sur la période", "") +
      "</div>" +

      mois.map((cle) => {
        const [annee, numero] = cle.split("-");
        const lignes = parMois[cle];
        return (
          "<div class='bloc-mois'>" +
          "<h4>" + e(Utils.MOIS[Number(numero) - 1] + " " + annee) +
            "<span>" + m(somme(lignes)) + "</span></h4>" +
          "<table><thead><tr><th>Date</th><th>Atelier</th><th>Mode</th>" +
            "<th class='num'>Durée</th><th class='num'>Montant</th></tr></thead><tbody>" +
          lignes.map((p) =>
            "<tr><td class='date'>" + e(Utils.fmtDateHeure(p.cree_le)) + "</td>" +
              "<td>" + e(nom(p)) + "</td>" +
              "<td class='mode'>" + e(modeRenouvellement(p)) + "</td>" +
              "<td class='num'>" + (Number(p.mois) || 1) + " mois</td>" +
              "<td class='num'>" + m(montant(p)) + "</td></tr>"
          ).join("") +
          "</tbody><tfoot><tr><td colspan='4'>Total du mois</td>" +
            "<td class='num'>" + m(somme(lignes)) + "</td></tr></tfoot></table></div>"
        );
      }).join("") +

      "<h3>Récapitulatif par atelier (" + ateliersTries.length + ")</h3>" +
      (ateliersTries.length
        ? "<table><thead><tr><th>Atelier</th><th class='num'>Renouvellements</th>" +
            "<th class='num'>Dernier</th><th class='num'>Total versé</th></tr></thead><tbody>" +
          ateliersTries.map((f) =>
            "<tr><td>" + e(f.nom) + "</td>" +
              "<td class='num'>" + f.nb + "</td>" +
              "<td class='num'>" + e(Utils.fmtDate(Utils.isoJour(new Date(f.dernier)))) + "</td>" +
              "<td class='num'>" + m(f.total) + "</td></tr>"
          ).join("") +
          "</tbody><tfoot><tr><td colspan='3'>Total de la période</td>" +
            "<td class='num'>" + m(total) + "</td></tr></tfoot></table>"
        : "<p style='color:#8b8fa8'>Aucun renouvellement sur cette période.</p>") +

      "<div class='pied'><span>Atelier — journal des renouvellements d'abonnement</span>" +
        "<span>" + enLigne.length + " Mobile Money · " + codes.length + " par code · " +
        (liste.length - enLigne.length - codes.length) + " encaissés directement</span></div>" +
      "</body></html>"
    );
  }

  /** Tableau de bord au format A4 : indicateurs puis état des ateliers.
      `libellePeriode` décrit la période couverte par les compteurs. */
  function tableauBordA4(stats, ateliers, devise, profil, libellePeriode) {
    const m = (v) => Utils.fmtMontant(v, devise);
    const jourFin = (a) => Utils.fmtDate(Utils.isoJour(new Date(a.abonnement_fin)));
    const tries = ateliers.slice().sort((x, y) => finAbonnement(y) - finAbonnement(x));
    const actifs = tries.filter(actif);
    /* Repli sur les totaux si la base n'expose pas encore la période. */
    const p = (cle, secours) => (stats[cle] === undefined ? stats[secours] : stats[cle]);

    const bloc = (l, v, n, couleur) =>
      "<div class='case'><div class='l'>" + e(l) + "</div>" +
      "<div class='v'" + (couleur ? " style='color:" + couleur + "'" : "") + ">" + v + "</div>" +
      "<div class='n'>" + e(n) + "</div></div>";

    return (
      "<!DOCTYPE html><html lang='fr'><head><meta charset='utf-8'>" +
      "<title>Tableau de bord Atelier</title><style>" +
      "@page{size:A4;margin:15mm}" +
      "*{box-sizing:border-box}" +
      "body{margin:0;font-family:'Helvetica Neue',Arial,sans-serif;color:#141636;font-size:11pt;line-height:1.45}" +
      ".entete{display:flex;align-items:flex-end;border-bottom:2px solid #2E3192;padding-bottom:5mm}" +
      ".marque{flex:1}.marque h1{margin:0;font-size:20pt;color:#2E3192;letter-spacing:-.5px}" +
      ".marque p{margin:1mm 0 0;font-size:10pt;color:#5b5f7d}" +
      ".titre{text-align:right}.titre h2{margin:0;font-size:13pt;letter-spacing:1px}" +
      ".titre p{margin:1mm 0 0;font-size:10pt;color:#5b5f7d}" +
      ".resume{display:flex;gap:3.5mm;margin:6mm 0 0}" +
      ".resume.petit .v{font-size:12.5pt}" +
      ".case{flex:1;border:1px solid #e3e5f0;border-radius:2mm;padding:3.5mm}" +
      ".case .l{font-size:9pt;text-transform:uppercase;letter-spacing:.8px;color:#5b5f7d}" +
      ".case .v{font-size:15pt;font-weight:750;margin-top:1mm}" +
      ".case .n{font-size:8.5pt;color:#8b8fa8;margin-top:.5mm}" +
      "h3{margin:8mm 0 2mm;font-size:11pt;color:#2E3192;text-transform:uppercase;letter-spacing:.8px}" +
      "table{width:100%;border-collapse:collapse}" +
      "thead{display:table-header-group}" +
      "th{text-align:left;font-size:9pt;text-transform:uppercase;letter-spacing:.5px;color:#5b5f7d;" +
        "border-bottom:1.5px solid #2E3192;padding:2mm}" +
      "td{padding:2mm;border-bottom:1px solid #e9eaf3;font-size:10.5pt}" +
      "tr{page-break-inside:avoid}" +
      "td.num,th.num{text-align:right;white-space:nowrap}" +
      "td.etat{white-space:nowrap;font-weight:700}" +
      ".pied{margin-top:8mm;border-top:1px solid #e3e5f0;padding-top:3mm;font-size:9.5pt;" +
        "color:#5b5f7d;display:flex;justify-content:space-between}" +
      "</style></head><body>" +

      "<div class='entete'>" +
        "<div class='marque'><h1>Atelier</h1>" +
          "<p>Plateforme de gestion pour ateliers de couture</p></div>" +
        "<div class='titre'><h2>TABLEAU DE BORD</h2>" +
          (libellePeriode ? "<p><strong>" + e(libellePeriode) + "</strong></p>" : "") +
          "<p>Édité le " + e(Utils.fmtDate(Utils.aujourdhui())) + "</p>" +
          "<p>" + e(profil ? (profil.nom_complet || profil.email) : "") + "</p></div>" +
      "</div>" +

      "<div class='resume'>" +
        bloc("Ateliers", stats.ateliers,
          stats.ateliers_actifs + " actif" + (stats.ateliers_actifs > 1 ? "s" : "") +
          (p("ateliers_periode", "ateliers_mois")
            ? " · " + p("ateliers_periode", "ateliers_mois") + " sur la période" : ""), "") +
        bloc("Encaissé sur la période", m(p("encaisse_periode", "encaisse_mois")),
          p("renouvellements_periode", "renouvellements") + " renouvellement" +
          (p("renouvellements_periode", "renouvellements") > 1 ? "s" : ""), "#0F9D58") +
        bloc("Total encaissé", m(stats.encaisse_total),
          "depuis le début · " + stats.renouvellements + " au total", "#0F9D58") +
      "</div>" +

      "<div class='resume petit'>" +
        bloc("Réalisations postées", p("realisations_periode", "realisations"),
          stats.realisations + " au total", "") +
        bloc("Commandes livrées", p("commandes_livrees_periode", "commandes_livrees"),
          p("commandes_periode", "commandes") + " créée" +
          (p("commandes_periode", "commandes") > 1 ? "s" : "") + " sur la période", "") +
        bloc("Factures éditées", p("factures_periode", "factures"),
          m(p("factures_montant_periode", "factures_montant")) + " vendus", "") +
        bloc("Nouveaux clients", p("clients_periode", "clients"),
          stats.clients + " suivis au total", "") +
      "</div>" +

      "<div class='resume petit'>" +
        bloc("Comptes", stats.administrateurs + stats.moderateurs,
          stats.administrateurs + " admin · " + stats.moderateurs + " modérateur" +
          (stats.moderateurs > 1 ? "s" : ""), "") +
        bloc("Codes disponibles", stats.codes_disponibles || 0,
          (stats.codes_utilises || 0) + " déjà utilisés", "") +
        bloc("Bannières actives", stats.bannieres || 0, "sur l'accueil public", "") +
        bloc("Revenu mensuel attendu", m(actifs.reduce((t, a) => t + (Number(a.abonnement_mensuel) || 0), 0)),
          "si tous les actifs renouvellent", "#2E3192") +
      "</div>" +

      "<h3>Ateliers (" + tries.length + ")</h3>" +
      (tries.length
        ? "<table><thead><tr><th>Atelier</th><th class='num'>Abonnement</th>" +
            "<th class='num'>Échéance</th><th class='num'>État</th></tr></thead><tbody>" +
          tries.map((a) => {
            const enCours = actif(a);
            const jours = Math.ceil((finAbonnement(a) - Date.now()) / 86400000);
            return "<tr><td>" + e(a.nom) + "</td>" +
              "<td class='num'>" + Utils.fmtMontant(a.abonnement_mensuel, a.devise) + " / mois</td>" +
              "<td class='num'>" + e(jourFin(a)) + "</td>" +
              "<td class='etat num' style='color:" + (enCours ? "#0F9D58" : "#D33A2C") + "'>" +
                (enCours ? (jours <= 5 ? jours + " j restants" : "Actif") : "Expiré") + "</td></tr>";
          }).join("") +
          "</tbody></table>"
        : "<p style='color:#8b8fa8'>Aucun atelier enregistré.</p>") +

      "<div class='pied'><span>Atelier — tableau de bord de la plateforme</span>" +
        "<span>" + stats.ateliers_actifs + " atelier" + (stats.ateliers_actifs > 1 ? "s" : "") +
        " en activité</span></div>" +
      "</body></html>"
    );
  }

  /* ---------- Codes de renouvellement ---------- */

  async function codes(vue) {
    const liste = await Api.lister("codes_abonnement", "cree_le", false);
    const ateliers = await Api.lister("ateliers");
    const nomAtelier = {};
    for (const a of ateliers) nomAtelier[a.id] = a.nom;

    const libres = liste.filter((c) => !c.utilise_le);
    const utilises = liste.filter((c) => c.utilise_le);

    UI.entete({
      titre: "Codes",
      sous: libres.length + " disponible" + (libres.length > 1 ? "s" : "") +
        " · " + utilises.length + " utilisé" + (utilises.length > 1 ? "s" : ""),
      retour: true,
      actions: '<button type="button" class="btn-ic" id="cd-nouveau" aria-label="Générer des codes">' +
        UI.icone("plus") + "</button>",
    });

    vue.innerHTML =
      '<div class="carte">' +
        '<div class="carte-titre">' + UI.icone("check", "ic-sm") + "Comment ça marche</div>" +
        '<p style="margin:0;font-size:13px;line-height:1.55;color:var(--encre-douce)">' +
          "Vous générez des codes, vous les vendez. L'atelier saisit le sien dans ses réglages " +
          "et son abonnement est prolongé d'un mois. <strong>Chaque code ne sert qu'une fois</strong> : " +
          "une fois utilisé, il ne fonctionne plus nulle part." +
        "</p>" +
        '<button type="button" class="btn btn-bloc" id="cd-generer" style="margin-top:12px">' +
          UI.icone("plus", "ic-sm") + "Générer des codes</button>" +
      "</div>" +

      (libres.length
        ? '<div class="section-titre">' + UI.icone("argent", "ic-sm") + "Disponibles (" + libres.length + ")" +
            '<a class="lien" id="cd-copier" style="cursor:pointer">Tout copier</a></div>' +
          '<div class="carte"><div class="mini-liste">' +
          libres.map((c) =>
            '<div class="mini"><span class="l">' +
              '<span style="font-family:ui-monospace,monospace;font-size:16px;letter-spacing:1.5px;' +
                'font-weight:700;white-space:nowrap;user-select:all">' + e(c.code) + "</span>" +
              '<br><span style="color:var(--encre-tres-douce);font-size:12px">' +
                (c.lot ? e(c.lot) + " · " : "") + Utils.fmtDate(Utils.isoJour(new Date(c.cree_le))) + "</span></span>" +
              '<button type="button" class="btn-ic" style="width:30px;height:30px;' +
                'background:var(--rouge-clair);color:var(--rouge)" data-suppr-code="' + c.id + '" ' +
                'aria-label="Supprimer ce code">' + UI.icone("poubelle", "ic-sm") + "</button>" +
            "</div>").join("") +
          "</div></div>"
        : UI.vide("argent", "Aucun code disponible",
            "Générez un lot de codes à vendre à vos ateliers.")) +

      (utilises.length
        ? '<div class="section-titre">' + UI.icone("check", "ic-sm") + "Utilisés (" + utilises.length + ")</div>" +
          '<div class="carte"><div class="mini-liste">' +
          utilises.slice(0, 60).map((c) =>
            '<div class="mini"><span class="l"><span style="font-family:monospace;letter-spacing:.5px">' +
              e(c.code) + "</span>" +
              '<br><span style="color:var(--encre-tres-douce);font-size:12px">' +
                e(nomAtelier[c.utilise_par] || "Atelier supprimé") + " · " +
                Utils.fmtDateHeure(c.utilise_le) + "</span></span>" +
              '<span class="v" style="color:var(--vert);font-size:12px">Consommé</span>' +
            "</div>").join("") +
          (utilises.length > 60
            ? '<p style="margin:6px 0 0;font-size:12px;color:var(--encre-tres-douce);text-align:center">' +
              (utilises.length - 60) + " plus anciens non affichés</p>"
            : "") +
          "</div></div>"
        : "");

    /* Génération d'un lot */
    const ouvrirGeneration = () => {
      const corps = UI.ouvrirFeuille("Générer des codes",
        '<div class="carte">' +
          '<div class="champ"><label for="cd-nombre">Combien de codes ?</label>' +
            '<input id="cd-nombre" inputmode="numeric" autocomplete="off" value="10">' +
            '<div class="aide">Entre 1 et 200. Chaque code vaut un mois d\'abonnement.</div></div>' +
          '<div class="champ"><label for="cd-lot">Étiquette du lot (facultatif)</label>' +
            '<input id="cd-lot" autocomplete="off" placeholder="ex. Commercial Awa, septembre">' +
            '<div class="aide">Pour retrouver plus tard à qui vous avez confié ces codes.</div></div>' +
          '<button type="button" class="btn btn-bloc" id="cd-ok">' +
            UI.icone("check", "ic-sm") + "Générer</button>" +
        "</div>");

      UI.$("#cd-ok", corps).onclick = async () => {
        const bouton = UI.$("#cd-ok", corps);
        const nombre = Math.round(Utils.lireNombre(UI.$("#cd-nombre", corps).value));
        if (nombre < 1 || nombre > 200) {
          UI.toast("Indiquez un nombre entre 1 et 200", "erreur");
          return;
        }
        bouton.disabled = true;
        try {
          const nouveaux = await Api.rpc("generer_codes", {
            p_nombre: nombre,
            p_lot: UI.$("#cd-lot", corps).value.trim(),
          });
          UI.feuilleSansRappel();
          UI.fermerFeuille();
          UI.toast(nouveaux.length + " code" + (nouveaux.length > 1 ? "s" : "") + " généré" +
            (nouveaux.length > 1 ? "s" : ""), "ok");
          codes(vue);
        } catch (err) {
          UI.toast(err.message || "Génération impossible", "erreur");
          bouton.disabled = false;
        }
      };
    };
    UI.$("#cd-generer").onclick = ouvrirGeneration;
    UI.$("#cd-nouveau").onclick = ouvrirGeneration;

    /* Copie de tous les codes disponibles */
    const boutonCopier = UI.$("#cd-copier");
    if (boutonCopier) {
      boutonCopier.onclick = async () => {
        const texte = libres.map((c) => c.code).join("\n");
        try {
          await navigator.clipboard.writeText(texte);
          UI.toast(libres.length + " codes copiés", "ok");
        } catch (_) {
          Utils.telecharger("codes-atelier.txt", texte);
          UI.toast("Codes téléchargés", "ok");
        }
      };
    }

    /* Suppression d'un code non utilisé */
    vue.addEventListener("click", async (ev) => {
      const bouton = ev.target.closest("[data-suppr-code]");
      if (!bouton) return;
      const ok = await UI.confirmer({
        titre: "Supprimer le code",
        texte: "Ce code ne pourra plus être utilisé par personne.",
        bouton: "Supprimer", danger: true,
      });
      if (!ok) return;
      await Api.supprimerLigne("codes_abonnement", bouton.dataset.supprCode);
      UI.toast("Code supprimé", "ok");
      codes(vue);
    });
  }

  /* ---------- Bannières du carrousel d\'accueil ---------- */

  /** Complète une adresse saisie sans protocole. */
  function normaliserLien(lien) {
    const l = (lien || "").trim();
    if (!l) return "";
    if (/^https?:\/\//i.test(l)) return l;
    return "https://" + l.replace(/^\/+/, "");
  }

  async function bannieres(vue) {
    const liste = await Api.lister("bannieres", "position", true);

    UI.entete({
      titre: "Bannières",
      sous: liste.length + " bannière" + (liste.length > 1 ? "s" : "") + " sur l'accueil",
      retour: true,
      actions: '<a class="btn-ic" href="#/banniere/nouvelle" aria-label="Nouvelle bannière">' + UI.icone("plus") + "</a>",
    });

    if (!liste.length) {
      vue.innerHTML = UI.vide("image", "Aucune bannière",
        "Ajoutez une image cliquable en tête du carrousel de l'accueil : publicité, " +
        "annonce, promotion d'un atelier…",
        '<a class="btn" href="#/banniere/nouvelle">' + UI.icone("plus", "ic-sm") + "Nouvelle bannière</a>");
      return;
    }

    vue.innerHTML =
      '<div class="liste">' +
      liste.map((b) =>
        '<button type="button" class="ligne" data-nav="#/banniere/' + b.id + '">' +
          '<span class="pastille"><img src="' + Stockage.src(b.image, Stockage.BANNIERES) + '" alt=""></span>' +
          '<span class="ligne-corps">' +
            '<span class="ligne-titre">' + e(b.titre || "Sans titre") + "</span>" +
            '<span class="ligne-sous">' + e(b.lien || "Sans lien") + "</span>" +
          "</span>" +
          '<span class="ligne-fin">' +
            (b.active
              ? '<span class="badge badge-fait">Visible</span>'
              : '<span class="badge badge-danger">Masquée</span>') +
            '<span style="font-size:11.5px;color:var(--encre-tres-douce)">Position ' + b.position + "</span>" +
          "</span>" +
        "</button>"
      ).join("") +
      "</div>" +
      '<p class="pied-note">Les bannières ouvrent le carrousel « À la une », avant les réalisations.</p>';
  }

  async function formulaireBanniere(vue, id) {
    let banniere = null;
    if (id) {
      banniere = await Api.lireLigne("bannieres", id);
      if (!banniere) { location.hash = "#/bannieres"; return; }
    }
    let imageDataUrl = banniere ? banniere.image : "";
    let imageFichier = null;  /* déposé seulement à l'enregistrement */

    UI.entete({
      titre: banniere ? "Modifier la bannière" : "Nouvelle bannière",
      sous: "Carrousel de l'accueil",
      retour: true,
    });

    vue.innerHTML =
      '<form id="form-banniere" novalidate>' +
        '<div class="carte">' +
          '<div class="carte-titre">' + UI.icone("image", "ic-sm") + "Image</div>" +
          '<img id="ban-apercu" alt="" style="width:100%;aspect-ratio:4/3;object-fit:cover;' +
            'border-radius:var(--r);background:var(--bleu-clair)"' +
            (imageDataUrl ? ' src="' + Stockage.src(imageDataUrl, Stockage.BANNIERES) + '"' : " hidden") + ">" +
          '<div class="btn-rangee" style="margin-top:10px">' +
            '<button type="button" class="btn btn-clair" id="ban-choisir">' +
              UI.icone("image", "ic-sm") + (imageDataUrl ? "Changer l'image" : "Choisir une image") + "</button>" +
          "</div>" +
          '<input type="file" id="ban-fichier" accept="image/*" hidden>' +
          '<div class="aide">Format conseillé : paysage (4:3). L\'image est réduite automatiquement.</div>' +
        "</div>" +

        '<div class="carte">' +
          '<div class="champ"><label for="ban-titre">Titre affiché</label>' +
            '<input id="ban-titre" autocomplete="off" value="' + e(banniere ? banniere.titre : "") + '"></div>' +
          '<div class="champ"><label for="ban-lien">Lien ouvert au clic</label>' +
            '<input id="ban-lien" type="url" inputmode="url" autocomplete="off" spellcheck="false" ' +
              'placeholder="https://exemple.com" value="' + e(banniere ? banniere.lien : "") + '">' +
            '<div class="aide">Page web, lien WhatsApp (wa.me), réseau social… ' +
              "Laissez vide pour une bannière sans clic.</div></div>" +
          '<div class="champ"><label for="ban-position">Position</label>' +
            '<input id="ban-position" inputmode="numeric" autocomplete="off" value="' +
              e(String(banniere ? banniere.position : 0)) + '">' +
            '<div class="aide">Les plus petits nombres passent en premier.</div></div>' +
          '<label class="interrupteur" style="display:flex">' +
            '<input type="checkbox" id="ban-active"' + (!banniere || banniere.active ? " checked" : "") + ">" +
            "<span>Visible sur l'accueil</span>" +
          "</label>" +
        "</div>" +

        '<button type="submit" class="btn btn-bloc" id="ban-enregistrer">' +
          UI.icone("check", "ic-sm") + (banniere ? "Enregistrer" : "Publier la bannière") + "</button>" +
      "</form>" +
      (banniere
        ? '<button type="button" class="btn btn-danger btn-bloc" id="ban-supprimer" style="margin-top:10px">' +
            UI.icone("poubelle", "ic-sm") + "Supprimer cette bannière</button>"
        : "");

    const champ = UI.$("#ban-fichier");
    const apercu = UI.$("#ban-apercu");
    UI.$("#ban-choisir").onclick = () => champ.click();
    champ.addEventListener("change", async () => {
      const fichier = champ.files && champ.files[0];
      champ.value = "";
      if (!fichier) return;
      try {
        const { dataUrl } = await Utils.compresserImage(fichier, 1000, 0.82);
        imageFichier = fichier;
        imageDataUrl = dataUrl;
        apercu.src = dataUrl;
        apercu.hidden = false;
      } catch (_) {
        UI.toast("Image illisible", "erreur");
      }
    });

    UI.$("#form-banniere").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (!imageDataUrl) { UI.toast("Choisissez une image", "erreur"); return; }
      const bouton = UI.$("#ban-enregistrer");
      bouton.disabled = true;
      try {
        const valeurs = {
          titre: UI.$("#ban-titre").value.trim(),
          image: imageDataUrl,
          lien: normaliserLien(UI.$("#ban-lien").value),
          position: Math.round(Utils.lireNombre(UI.$("#ban-position").value)),
          active: UI.$("#ban-active").checked,
        };
        if (imageFichier) {
          valeurs.image = await Stockage.deposerImage(imageFichier, Stockage.BANNIERES,
            null, { coteMax: 1000, qualite: 0.82 });
        }
        if (banniere) {
          await Api.mettreAJour("bannieres", banniere.id, valeurs);
          /* L'image remplacée n'a plus de référence : on la retire. */
          if (imageFichier && banniere.image !== valeurs.image) {
            await Stockage.retirer([banniere.image], Stockage.BANNIERES);
          }
        } else {
          await Api.inserer("bannieres", valeurs);
        }
        UI.toast(banniere ? "Bannière mise à jour" : "Bannière publiée", "ok");
        location.hash = "#/bannieres";
      } catch (err) {
        UI.toast(err.message || "Enregistrement impossible", "erreur");
        bouton.disabled = false;
      }
    });

    const supprimer = UI.$("#ban-supprimer");
    if (supprimer) {
      supprimer.onclick = async () => {
        const ok = await UI.confirmer({
          titre: "Supprimer la bannière",
          texte: "Elle disparaîtra du carrousel de l'accueil.",
          bouton: "Supprimer", danger: true,
        });
        if (!ok) return;
        await Api.supprimerLigne("bannieres", banniere.id);
        await Stockage.retirer([banniere.image], Stockage.BANNIERES);
        UI.toast("Bannière supprimée", "ok");
        location.hash = "#/bannieres";
      };
    }
  }

  /* ---------- Compte superadmin ---------- */

  /** Tuiles du tableau de bord, à partir des compteurs du serveur. */
  function tuilesTableauBord(s, devise) {
    const tuile = (classe, icone, label, valeur, note) =>
      '<div class="tuile' + (classe ? " " + classe : "") + '">' +
        '<div class="tuile-label">' + UI.icone(icone, "ic-sm") + e(label) + "</div>" +
        '<div class="tuile-valeur">' + valeur + "</div>" +
        '<div class="tuile-note">' + note + "</div></div>";

    /* Les compteurs « _periode » manquent tant que la base n'est pas à jour :
       on retombe alors sur les totaux depuis le début. */
    const p = (cle, secours) => (s[cle] === undefined ? s[secours] : s[cle]);

    return (
      '<div class="tuiles">' +
        tuile("", "clients", "Ateliers", s.ateliers,
          s.ateliers_actifs + " actif" + (s.ateliers_actifs > 1 ? "s" : "") +
          (p("ateliers_periode", "ateliers_mois") ?
            " · " + p("ateliers_periode", "ateliers_mois") + " sur la période" : "")) +
        tuile("tuile-vert", "argent", "Encaissé sur la période",
          Utils.fmtMontant(p("encaisse_periode", "encaisse_mois"), devise),
          p("renouvellements_periode", "renouvellements") + " renouvellement" +
          (p("renouvellements_periode", "renouvellements") > 1 ? "s" : "")) +
        tuile("tuile-vert", "stats", "Total encaissé", Utils.fmtMontant(s.encaisse_total, devise),
          "depuis le début · " + s.renouvellements + " au total") +
        tuile("", "boutique", "Réalisations postées", p("realisations_periode", "realisations"),
          s.realisations + " au total · " + s.realisations_en_avant + " à la une") +
        tuile("", "check", "Commandes livrées", p("commandes_livrees_periode", "commandes_livrees"),
          p("commandes_periode", "commandes") + " créée" +
          (p("commandes_periode", "commandes") > 1 ? "s" : "") + " sur la période") +
        tuile("", "argent", "Factures éditées", p("factures_periode", "factures"),
          Utils.fmtMontant(p("factures_montant_periode", "factures_montant"), devise) +
          " de ventes en boutique") +
        tuile("", "clients", "Nouveaux clients", p("clients_periode", "clients"),
          s.clients + " suivis au total") +
        tuile("", "connexion", "Comptes", s.administrateurs + s.moderateurs,
          s.administrateurs + " admin · " + s.moderateurs + " modérateur" + (s.moderateurs > 1 ? "s" : "")) +
      "</div>"
    );
  }

  async function compte(vue) {
    const profil = Api.lireProfil();
    const prm = Api.lireParametres();
    const ateliers = await Api.lister("ateliers");
    const devise = (ateliers[0] && ateliers[0].devise) || "FCFA";
    /* L'ancienne fonction SQL n'accepte pas de période : on retombe dessus
       tant que la base n'est pas à jour, plutôt que de vider l'écran. */
    const lireStats = async (b) => {
      try {
        return await Api.rpc("statistiques_plateforme", { p_debut: b.debut, p_fin: b.fin });
      } catch (_) {
        return await Api.rpc("statistiques_plateforme");
      }
    };

    const bornes0 = UI.bornesPeriode(periodeBord.actif, periodeBord.libre);
    let stats = null;
    try {
      stats = await lireStats(bornes0);
    } catch (_) { /* base pas encore à jour : le tableau de bord attend */ }

    UI.entete({
      titre: "Tableau de bord",
      sous: "Superadministrateur",
      retour: true,
      actions: stats
        ? '<button type="button" class="btn-ic" id="tb-imprimer" aria-label="Imprimer le tableau de bord">' +
            UI.icone("telecharger") + "</button>"
        : "",
    });
    vue.innerHTML =
      (stats
        ? UI.gabaritPeriode(periodeBord, "tb") + '<div id="tb-zone"></div>'
        : '<div class="carte"><div class="carte-titre">Tableau de bord</div>' +
            '<p style="margin:0;font-size:13px;line-height:1.5;color:var(--encre-douce)">' +
            "Mettez la base à jour (exécutez <code>supabase/schema.sql</code> dans l'éditeur SQL " +
            "de Supabase) puis rechargez : les chiffres de la plateforme s'afficheront ici.</p></div>") +

      '<div class="carte">' +
        '<div class="carte-titre">' + UI.icone("clients", "ic-sm") + "Mon compte</div>" +
        '<div class="paires">' +
          '<div class="paire"><span class="l">Nom</span><span class="v">' + e(profil.nom_complet || "—") + "</span></div>" +
          '<div class="paire"><span class="l">Email</span><span class="v">' + e(profil.email) + "</span></div>" +
          '<div class="paire"><span class="l">Rôle</span><span class="v">Superadministrateur</span></div>' +
        "</div>" +
      "</div>" +

      '<button type="button" class="carte" style="width:100%;text-align:left;display:flex;align-items:center;' +
          'gap:12px;border:0;font:inherit;cursor:pointer" data-nav="#/paiements">' +
        '<span class="pastille">' + UI.icone("argent", "ic-sm") + "</span>" +
        '<span style="flex:1;min-width:0">' +
          '<span class="ligne-titre">Renouvellements</span>' +
          '<span class="ligne-sous">Historique des paiements de vos ateliers</span>' +
        "</span>" +
        UI.icone("retour", "ic-sm") +
      "</button>" +

      '<button type="button" class="carte" style="width:100%;text-align:left;display:flex;align-items:center;' +
          'gap:12px;border:0;font:inherit;cursor:pointer" data-nav="#/codes">' +
        '<span class="pastille">' + UI.icone("check", "ic-sm") + "</span>" +
        '<span style="flex:1;min-width:0">' +
          '<span class="ligne-titre">Codes de renouvellement</span>' +
          '<span class="ligne-sous">' +
            (stats ? stats.codes_disponibles + " disponibles · " + stats.codes_utilises + " utilisés"
                   : "À vendre aux ateliers") + "</span>" +
        "</span>" +
        UI.icone("retour", "ic-sm") +
      "</button>" +

      '<button type="button" class="carte" style="width:100%;text-align:left;display:flex;align-items:center;' +
          'gap:12px;border:0;font:inherit;cursor:pointer" data-nav="#/formules">' +
        '<span class="pastille">' + UI.icone("argent", "ic-sm") + "</span>" +
        '<span style="flex:1;min-width:0">' +
          '<span class="ligne-titre">Formules et tarifs</span>' +
          '<span class="ligne-sous">Ce que chaque maison choisit en s\'inscrivant</span>' +
        "</span>" +
        UI.icone("retour", "ic-sm") +
      "</button>" +

      '<button type="button" class="carte" style="width:100%;text-align:left;display:flex;align-items:center;' +
          'gap:12px;border:0;font:inherit;cursor:pointer" data-nav="#/bannieres">' +
        '<span class="pastille">' + UI.icone("image", "ic-sm") + "</span>" +
        '<span style="flex:1;min-width:0">' +
          '<span class="ligne-titre">Bannières de l\'accueil</span>' +
          '<span class="ligne-sous">Images cliquables en tête du carrousel</span>' +
        "</span>" +
        UI.icone("retour", "ic-sm") +
      "</button>" +

      (prm
        ? '<div class="carte">' +
            '<div class="carte-titre">' + UI.icone("connexion", "ic-sm") + "Double facteur à la connexion</div>" +
            '<p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:var(--encre-douce)">' +
              "Une fois activé, chaque connexion — superadministrateur, administrateur " +
              "ou modérateur — demande le mot de passe <em>puis</em> un code " +
              "envoyé par email. Le serveur exige les deux : le mot de passe seul ne " +
              "donne plus accès à rien.</p>" +
            '<div class="alerte" style="margin-bottom:12px">' + UI.icone("alerte", "ic-sm") +
              "<span>À faire <strong>avant</strong> d'activer : dans Supabase, régler un " +
              "SMTP personnalisé (sinon 2 à 3 emails par heure seulement) et ajouter " +
              "<code>{{ .Token }}</code> au modèle d'email « Magic Link ». " +
              "Puis lancer le test ci-dessous.</span></div>" +
            '<button type="button" class="btn btn-clair btn-bloc" id="sa-2fa-test">' +
              UI.icone("check", "ic-sm") + "1. Tester la compatibilité</button>" +
            '<div id="sa-2fa-resultat" style="margin-top:10px"></div>' +
            '<button type="button" class="btn btn-clair btn-bloc" id="sa-2fa-email" style="margin-top:10px">' +
              UI.icone("connexion", "ic-sm") + "2. Recevoir un code de test</button>" +
            '<div class="aide" style="margin-top:6px">Envoie un code à ' +
              e(profil.email || "votre adresse") + ". Vérifiez qu'il arrive <strong>et " +
              "qu'il contient bien le code</strong> : c'est ce qui manque le plus " +
              "souvent quand <code>{{ .Token }}</code> n'a pas été ajouté au modèle " +
              "d'email. Le code reçu ici ne sert qu'à ce contrôle.</div>" +
            '<label class="interrupteur" style="display:flex;margin-top:12px">' +
              '<input type="checkbox" id="sa-2fa"' + (prm.double_facteur ? " checked" : "") + ">" +
              "<span>Exiger le code par email à chaque connexion</span>" +
            "</label>" +
            '<div class="aide" style="margin-top:10px">En cas de blocage, cette ligne dans ' +
              "l'éditeur SQL de Supabase rouvre l'accès à tout le monde :<br>" +
              '<code style="user-select:all">update public.parametres set double_facteur = false;</code></div>' +
          "</div>" +

          '<form id="form-kkiapay">' +
            '<div class="carte">' +
              '<div class="carte-titre">' + UI.icone("whatsapp", "ic-sm") + "Contact affiché au public</div>" +
              '<div class="champ"><label for="sa-contact">Votre numéro WhatsApp</label>' +
                '<input id="sa-contact" type="tel" inputmode="tel" autocomplete="off" value="' +
                  e(prm.contact_whatsapp || "") + '">' +
                '<div class="aide">Affiché sur la page de connexion : « Vous êtes un atelier ou un ' +
                  "styliste ? Enregistrez-vous dès maintenant ». Laissez vide pour ne pas l'afficher.</div></div>" +
            "</div>" +
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

    if (stats) {
      UI.brancherPeriode(periodeBord, () => rendreBord(), "tb");
      rendreBord();
    }

    /** Recharge les compteurs du serveur pour la période choisie. */
    async function rendreBord() {
      const b = UI.bornesPeriode(periodeBord.actif, periodeBord.libre);
      const libelle = UI.libellePeriode(periodeBord.actif, b);
      const zone = UI.$("#tb-zone");
      try {
        stats = await lireStats(b);
      } catch (err) {
        UI.toast("Chiffres indisponibles : " + err.message, "erreur");
        return;
      }
      if (!UI.$("#tb-zone")) return; /* la vue a changé entre-temps */
      /* Sans les compteurs de période, le sélecteur n'aurait aucun effet :
         mieux vaut le dire que laisser croire à un filtre qui fonctionne. */
      const filtreActif = stats.encaisse_periode !== undefined;
      zone.innerHTML =
        '<p style="margin:2px 0 0;font-size:12.5px;color:var(--encre-tres-douce)">' +
          (filtreActif
            ? e(libelle)
            : "Chiffres depuis le début — exécutez <code>supabase/schema.sql</code> " +
              "pour filtrer par période.") +
        "</p>" +
        tuilesTableauBord(stats, devise);

      const boutonImprimer = UI.$("#tb-imprimer");
      if (boutonImprimer) {
        boutonImprimer.onclick = () => {
          UI.choisirImpression("Tableau de bord — " + libelle,
            () => Utils.imprimerA4("Tableau de bord Atelier",
              tableauBordA4(stats, ateliers, devise, profil, libelle)));
        };
      }
    }

    /* ---------- Double facteur ---------- */

    /* Le verrou serveur repose sur la méthode d'authentification inscrite
       dans le jeton. Si ce projet Supabase ne la renseigne pas, activer le
       double facteur enfermerait tout le monde dehors : on le vérifie
       avant, et le test conditionne l'activation. */
    let compatible = null;
    const boutonTest = UI.$("#sa-2fa-test");
    const zoneTest = UI.$("#sa-2fa-resultat");

    async function tester() {
      zoneTest.innerHTML = '<div class="aide">Test en cours…</div>';
      try {
        const d = await Api.diagnosticJeton();
        const methodes = (d && d.methodes) || [];
        compatible = methodes.length > 0;
        zoneTest.innerHTML = compatible
          ? '<div class="alerte" style="background:var(--vert-clair);color:#0B6B3D">' +
              UI.icone("check", "ic-sm") + "<span>Compatible. Méthode(s) vue(s) dans le jeton : <strong>" +
              e(methodes.join(", ")) + "</strong>. Vous pouvez activer.</span></div>"
          : '<div class="alerte alerte-danger">' + UI.icone("alerte", "ic-sm") +
              "<span>Ce projet Supabase n'inscrit pas la méthode d'authentification " +
              "dans le jeton. Activer le double facteur bloquerait toutes les " +
              "connexions : l'interrupteur reste donc refusé.</span></div>";
      } catch (err) {
        compatible = false;
        zoneTest.innerHTML = '<div class="alerte alerte-danger">' + UI.icone("alerte", "ic-sm") +
          "<span>Test impossible : " + e(err.message || "erreur") +
          ". Exécutez <code>supabase/schema.sql</code> puis reconnectez-vous.</span></div>";
      }
    }

    if (boutonTest) boutonTest.onclick = tester;

    /* Le test ci-dessus prouve que le verrou serveur fonctionnera ; il ne
       dit rien de l'acheminement des emails. Ce bouton-là s'en charge. */
    const boutonEmail = UI.$("#sa-2fa-email");
    if (boutonEmail) {
      boutonEmail.onclick = async () => {
        boutonEmail.disabled = true;
        try {
          await Api.renvoyerCode(profil.email);
          UI.toast("Code envoyé à " + profil.email, "ok");
        } catch (err) {
          UI.toast(err.message || "Envoi impossible", "erreur");
        }
        boutonEmail.disabled = false;
      };
    }

    const interrupteur2fa = UI.$("#sa-2fa");
    if (interrupteur2fa) {
      interrupteur2fa.addEventListener("change", async () => {
        const activer = interrupteur2fa.checked;

        if (activer && compatible !== true) {
          interrupteur2fa.checked = false;
          UI.toast("Lancez d'abord « Tester la compatibilité »", "erreur");
          return;
        }
        if (activer) {
          const ok = await UI.confirmer({
            titre: "Activer le double facteur ?",
            texte: "À la prochaine connexion, vous devrez saisir un code reçu à " +
              (profil.email || "votre adresse") + ". Si les emails n'arrivent pas, " +
              "plus personne ne pourra se connecter — la ligne SQL indiquée sous " +
              "l'interrupteur rouvrira l'accès.",
            bouton: "Activer",
          });
          if (!ok) { interrupteur2fa.checked = false; return; }
        }

        try {
          await Api.majParametres({ double_facteur: activer });
        } catch (err) {
          interrupteur2fa.checked = !activer;
          UI.toast(err.message || "Enregistrement impossible", "erreur");
          return;
        }

        if (!activer) {
          UI.toast("Double facteur désactivé", "ok");
          return;
        }

        /* La session en cours n'a passé qu'un facteur : dès l'activation,
           le serveur cesse de lui répondre. Sans cette reconnexion, les
           écrans se videraient sans explication. */
        UI.toast("Double facteur activé — reconnectez-vous", "ok");
        await Api.deconnexion();
        location.hash = "#/connexion";
        window.AppNaviguer();
      });
    }

    const formulaireKkiapay = UI.$("#form-kkiapay");
    if (formulaireKkiapay) {
      formulaireKkiapay.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        try {
          await Api.majParametres({
            kkiapay_cle_publique: UI.$("#sa-kkiapay-cle").value.trim(),
            kkiapay_sandbox: UI.$("#sa-kkiapay-sandbox").checked,
            contact_whatsapp: UI.$("#sa-contact").value.trim(),
          });
          UI.toast("Réglages enregistrés", "ok");
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

  /* ---------- Formules et tarifs ----------
     C'est ici que se décide ce qu'une maison paie. Le tarif saisi ne
     touche que les inscriptions à venir : les abonnements déjà ouverts
     gardent le prix auquel ils ont souscrit. */

  async function formules(vue) {
    let liste = [];
    let erreur = "";
    try {
      liste = await Store.listerFormules();
    } catch (err) {
      erreur = err.message || "Formules illisibles";
    }

    const ateliers = await Api.lister("ateliers", "nom", true);
    const comptes = {};
    for (const a of ateliers) {
      const code = a.formule || "atelier_vitrine";
      comptes[code] = (comptes[code] || 0) + 1;
    }

    UI.entete({ titre: "Formules et tarifs", sous: "Règles d'inscription", retour: true });

    if (!liste.length) {
      vue.innerHTML =
        '<div class="carte"><div class="carte-titre">' + UI.icone("alerte", "ic-sm") +
          "Formules absentes</div>" +
        '<p style="margin:0;font-size:13.5px;line-height:1.55;color:var(--encre-douce)">' +
          (erreur ? e(erreur) + "<br><br>" : "") +
          "Exécutez <code>supabase/formules.sql</code> dans le SQL Editor de Supabase, " +
          "puis revenez sur cet écran.</p></div>";
      return;
    }

    vue.innerHTML =
      '<div class="carte carte-accroche">' +
        '<p style="margin:0;font-size:13.5px;line-height:1.6">' +
          "Une maison choisit sa formule en s'inscrivant, et son tarif est fixé " +
          "à ce moment-là. <strong>Changer un prix ici ne touche aucun abonnement " +
          "en cours</strong> — seulement les inscriptions suivantes.</p>" +
      "</div>" +

      '<form id="form-formules">' +
        liste.map((f) =>
          '<div class="carte" data-formule="' + e(f.code) + '">' +
            '<div class="carte-titre">' + UI.icone("argent", "ic-sm") + e(f.nom) +
              '<span class="badge ' + (f.active ? "badge-ok" : "badge-fait") + '" ' +
                'style="margin-left:auto">' + (f.active ? "Proposée" : "Fermée") + "</span>" +
            "</div>" +
            '<div class="champ"><label for="f-nom-' + e(f.code) + '">Nom affiché</label>' +
              '<input id="f-nom-' + e(f.code) + '" value="' + e(f.nom) + '"></div>' +
            '<div class="champ"><label for="f-desc-' + e(f.code) + '">Description</label>' +
              '<textarea id="f-desc-' + e(f.code) + '" style="min-height:70px">' +
                e(f.description || "") + "</textarea>" +
              '<div class="aide">' + e(Store.resumeFormule(f.code)) + "</div></div>" +
            UI.champMontant({
              id: "f-prix-" + f.code, label: "Tarif mensuel",
              valeur: Number(f.prix_mensuel) || 0, obligatoire: true,
            }) +
            '<label class="interrupteur" style="display:flex;margin-top:4px">' +
              '<input type="checkbox" id="f-active-' + e(f.code) + '"' +
              (f.active ? " checked" : "") + ">" +
              "<span>Proposée à l'inscription</span></label>" +
            '<div class="aide" style="margin-top:8px">' +
              (comptes[f.code] || 0) + " maison" + ((comptes[f.code] || 0) > 1 ? "s" : "") +
              " sur cette formule aujourd'hui.</div>" +
          "</div>"
        ).join("") +
        '<div style="margin-top:16px"><button type="submit" class="btn btn-bloc" id="f-enregistrer">' +
          UI.icone("check", "ic-sm") + "Enregistrer les tarifs</button></div>" +
      "</form>";

    UI.$("#form-formules").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const bouton = UI.$("#f-enregistrer");
      bouton.disabled = true;
      try {
        for (const f of liste) {
          const nom = UI.$("#f-nom-" + f.code).value.trim();
          if (!nom) throw new Error("Chaque formule doit garder un nom.");
          await Api.mettreAJourPar("formules", "code", f.code, {
            nom,
            description: UI.$("#f-desc-" + f.code).value.trim(),
            prix_mensuel: Math.max(0, Utils.lireNombre(UI.$("#f-prix-" + f.code).value)),
            active: UI.$("#f-active-" + f.code).checked,
            modifie_le: new Date().toISOString(),
          });
        }
        UI.toast("Tarifs enregistrés", "ok");
        formules(vue);
      } catch (err) {
        UI.toast(err.message || "Enregistrement impossible", "erreur");
        bouton.disabled = false;
      }
    });
  }

  return { liste, formulaire, fiche, compte, paiements, codes, bannieres, formulaireBanniere,
           formules, tableauBordA4, renouvellementsA4 };
})();
