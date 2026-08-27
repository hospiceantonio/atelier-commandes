/* =========================================================
   Inscription libre d'une maison.

   Deux écrans, et l'état vit sur le serveur, pas ici :

     1. « Ouvrir ma maison » — création du compte. À la fin, la personne
        est connectée mais son profil n'a pas encore d'atelier.
     2. « Votre formule » — choix de la formule et nom de la maison ;
        c'est creer_mon_atelier qui pose l'atelier et le tarif.

   Séparer les deux n'est pas une coquetterie : quelqu'un peut fermer
   l'application entre les deux. À la connexion suivante, son compte est
   toujours sans atelier, et l'application le ramène exactement là où il
   s'était arrêté — l'écran 2. Rien à mémoriser côté navigateur.

   LE TARIF NE PASSE JAMAIS PAR ICI. Le navigateur envoie le code de la
   formule ; le serveur lit le prix dans la table. C'est ce qui empêche
   de s'abonner à zéro franc.
   ========================================================= */
const VueInscription = (() => {

  const e = Utils.echapper;

  /* ---------- Écran 1 : créer son compte ---------- */

  async function afficher(vue) {
    let formules = [];
    try {
      formules = (await Store.listerFormules()).filter((f) => f.active);
    } catch (_) {
      /* La table n'existe pas encore : on n'arrête pas l'inscription
         pour autant, les tarifs seront simplement absents. */
    }

    UI.entete({ titre: "Ouvrir ma maison", sous: "Quelques minutes suffisent", retour: true });

    vue.innerHTML =
      '<div class="carte carte-accroche">' +
        '<div class="carte-titre">' + UI.icone("boutique", "ic-sm") + "Bienvenue</div>" +
        '<p style="margin:0;font-size:14px;line-height:1.6">' +
          "Créez votre compte, puis choisissez votre formule. " +
          "<strong>Les 14 premiers jours sont offerts</strong> — vous ne réglez rien aujourd'hui." +
        "</p>" +
      "</div>" +

      (formules.length
        ? '<div class="carte">' +
            '<div class="carte-titre">' + UI.icone("argent", "ic-sm") + "Nos formules</div>" +
            '<div class="paires">' +
              formules.map((f) =>
                '<div class="paire"><span class="l">' + e(f.nom) + "</span>" +
                  '<span class="v">' + Utils.fmtMontant(Number(f.prix_mensuel) || 0, "FCFA") +
                  " / mois</span></div>"
              ).join("") +
            "</div>" +
            '<div class="aide" style="margin-top:8px">Vous choisirez la vôtre juste après.</div>' +
          "</div>"
        : "") +

      '<form id="form-inscription">' +
        '<div class="carte">' +
          '<div class="carte-titre">' + UI.icone("connexion", "ic-sm") + "Votre compte</div>" +
          '<div class="champ"><label for="ins-nom">Votre nom <span class="obligatoire">*</span></label>' +
            '<input id="ins-nom" autocomplete="name" autocapitalize="words" ' +
              'placeholder="Ex. : Awa KONE"></div>' +
          '<div class="champ"><label for="ins-tel">Téléphone</label>' +
            '<input id="ins-tel" type="tel" inputmode="tel" autocomplete="tel" ' +
              'placeholder="97 00 00 00"></div>' +
          '<div class="champ"><label for="ins-email">Email <span class="obligatoire">*</span></label>' +
            '<input id="ins-email" type="email" inputmode="email" autocomplete="email" ' +
              'spellcheck="false" placeholder="vous@exemple.com"></div>' +
          '<div class="champ"><label for="ins-mdp">Mot de passe <span class="obligatoire">*</span></label>' +
            '<input id="ins-mdp" type="password" autocomplete="new-password">' +
            '<div class="aide">6 caractères au minimum.</div></div>' +
        "</div>" +
        '<div style="margin-top:16px"><button type="submit" class="btn btn-bloc" id="ins-creer">' +
          UI.icone("check", "ic-sm") + "Créer mon compte</button></div>" +
      "</form>" +

      '<p class="pied-note">Vous avez déjà un compte ? ' +
        '<a href="#/connexion" style="font-weight:700;text-decoration:underline">Se connecter</a></p>';

    UI.$("#form-inscription").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const nom = UI.$("#ins-nom").value.trim();
      const email = UI.$("#ins-email").value.trim();
      const mdp = UI.$("#ins-mdp").value;
      const tel = UI.$("#ins-tel").value.trim();

      if (!nom) { UI.toast("Indiquez votre nom", "erreur"); UI.$("#ins-nom").focus(); return; }
      if (!email) { UI.toast("Indiquez votre email", "erreur"); UI.$("#ins-email").focus(); return; }
      if (mdp.length < 6) {
        UI.toast("Le mot de passe doit faire au moins 6 caractères", "erreur");
        UI.$("#ins-mdp").focus();
        return;
      }

      const bouton = UI.$("#ins-creer");
      bouton.disabled = true;
      try {
        await Api.creerCompte(email, mdp, nom, tel);
        /* On repasse par la connexion normale : c'est elle qui sait
           enchaîner le second facteur quand il est exigé. */
        const suite = await Api.connexion(email, mdp);
        if (suite && suite.termine === false) {
          VueConnexion.demanderCode(suite.email, reprendre);
          return;
        }
        reprendre();
      } catch (err) {
        UI.toast(err.message || "Création impossible", "erreur");
        bouton.disabled = false;
      }
    });
  }

  /* Le compte existe et la session est complète : l'application se
     charge de la suite — elle verra un profil sans atelier et affichera
     l'écran 2. */
  function reprendre() {
    VueConnexion.masquer();
    location.hash = "#/";
    window.AppNaviguer();
  }

  /* ---------- Écran 2 : choisir sa formule ---------- */

  /**
   * Affiché à tout compte connecté qui n'a pas encore d'atelier — qu'il
   * vienne de s'inscrire ou qu'il revienne trois jours plus tard.
   */
  async function ouvrirMaison(vue) {
    let formules = [];
    let erreurFormules = "";
    try {
      formules = (await Store.listerFormules()).filter((f) => f.active);
    } catch (err) {
      erreurFormules = err.message || "Formules indisponibles";
    }

    const profil = Api.lireProfil();
    UI.entete({
      titre: "Votre formule",
      sous: profil && profil.nom_complet ? "Bienvenue " + profil.nom_complet : "Dernière étape",
    });

    if (!formules.length) {
      vue.innerHTML =
        '<div class="carte"><div class="carte-titre">' + UI.icone("alerte", "ic-sm") +
          "Aucune formule disponible</div>" +
        '<p style="margin:0 0 12px;font-size:13.5px;line-height:1.55;color:var(--encre-douce)">' +
          (erreurFormules
            ? "Les formules n'ont pas pu être chargées : " + e(erreurFormules)
            : "Aucune formule n'est ouverte aux inscriptions pour le moment.") +
          " Contactez-nous, nous ouvrirons votre maison à la main.</p>" +
        '<button type="button" class="btn btn-clair btn-bloc" id="fm-deconnexion">Se déconnecter</button>' +
        "</div>";
      UI.$("#fm-deconnexion").onclick = deconnecter;
      return;
    }

    /* La première formule est présélectionnée : un choix par défaut vaut
       mieux qu'un formulaire qu'on croit rempli et qui refuse. */
    let choisie = formules[0].code;

    const carteFormule = (f) =>
      '<button type="button" class="ligne carte-formule" data-formule="' + e(f.code) + '">' +
        '<span class="pastille">' + UI.icone(
          Store.formuleOuvreVitrine(f.code) && !Store.formuleOuvreAtelier(f.code) ? "boutique"
            : Store.formuleOuvreVitrine(f.code) ? "check" : "commandes", "ic-sm") + "</span>" +
        '<span class="ligne-corps">' +
          '<span class="ligne-titre">' + e(f.nom) + "</span>" +
          '<span class="ligne-sous">' + e(f.description || Store.resumeFormule(f.code)) + "</span>" +
        "</span>" +
        '<span class="ligne-fin"><strong>' +
          Utils.fmtMontant(Number(f.prix_mensuel) || 0, "FCFA") + "</strong>" +
          '<span class="ligne-sous">par mois</span></span>' +
      "</button>";

    vue.innerHTML =
      '<div class="carte carte-accroche">' +
        '<p style="margin:0;font-size:14px;line-height:1.6">' +
          "Choisissez ce dont votre maison a besoin. " +
          "<strong>Les 14 premiers jours sont offerts</strong>, et vous pourrez changer de " +
          "formule ensuite en nous écrivant.</p>" +
      "</div>" +

      '<form id="form-maison">' +
        '<div class="carte">' +
          '<div class="carte-titre">' + UI.icone("argent", "ic-sm") + "Formule</div>" +
          '<div id="liste-formules">' + formules.map(carteFormule).join("") + "</div>" +
        "</div>" +

        '<div class="carte">' +
          '<div class="carte-titre">' + UI.icone("commandes", "ic-sm") + "Votre maison</div>" +
          '<div class="champ"><label for="fm-nom">Nom de la maison <span class="obligatoire">*</span></label>' +
            '<input id="fm-nom" autocapitalize="words" autocomplete="organization" ' +
              'placeholder="Ex. : Chic Couture"></div>' +
          '<div class="champ"><label for="fm-slogan">Slogan</label>' +
            '<input id="fm-slogan" autocapitalize="sentences" ' +
              'placeholder="Ex. : L\'élégance sur mesure"></div>' +
          '<div class="champ-duo">' +
            '<div class="champ"><label for="fm-wa">WhatsApp</label>' +
              '<input id="fm-wa" type="tel" inputmode="tel" placeholder="96 00 00 00"></div>' +
            '<div class="champ"><label for="fm-appel">Téléphone</label>' +
              '<input id="fm-appel" type="tel" inputmode="tel" placeholder="97 00 00 00"></div>' +
          "</div>" +
        "</div>" +

        '<div style="margin-top:16px"><button type="submit" class="btn btn-bloc" id="fm-ouvrir">' +
          UI.icone("check", "ic-sm") + "Ouvrir ma maison</button></div>" +
      "</form>" +

      '<p class="pied-note"><a href="#" id="fm-quitter" style="text-decoration:underline">' +
        "Se déconnecter</a></p>";

    function marquerChoix() {
      for (const bouton of document.querySelectorAll("[data-formule]")) {
        bouton.classList.toggle("choisie", bouton.dataset.formule === choisie);
      }
      const f = formules.find((x) => x.code === choisie);
      UI.$("#fm-ouvrir").textContent = "Ouvrir ma maison — " +
        Utils.fmtMontant(Number(f.prix_mensuel) || 0, "FCFA") + " / mois";
    }
    marquerChoix();

    UI.$("#liste-formules").addEventListener("click", (ev) => {
      const bouton = ev.target.closest("[data-formule]");
      if (!bouton) return;
      choisie = bouton.dataset.formule;
      marquerChoix();
    });

    UI.$("#fm-quitter").addEventListener("click", (ev) => {
      ev.preventDefault();
      deconnecter();
    });

    UI.$("#form-maison").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const nom = UI.$("#fm-nom").value.trim();
      if (nom.length < 2) {
        UI.toast("Indiquez le nom de votre maison", "erreur");
        UI.$("#fm-nom").focus();
        return;
      }
      const bouton = UI.$("#fm-ouvrir");
      bouton.disabled = true;
      try {
        await Api.creerMonAtelier({
          nom,
          formule: choisie,
          slogan: UI.$("#fm-slogan").value.trim(),
          telWhatsApp: UI.$("#fm-wa").value.trim(),
          telAppel: UI.$("#fm-appel").value.trim(),
        });
        UI.toast("Bienvenue ! Votre maison est ouverte", "ok");
        location.hash = "#/";
        window.AppNaviguer();
      } catch (err) {
        UI.toast(err.message || "Ouverture impossible", "erreur");
        bouton.disabled = false;
      }
    });
  }

  async function deconnecter() {
    await Api.deconnexion();
    location.hash = "#/";
    window.AppNaviguer();
  }

  return { afficher, ouvrirMaison };
})();
