/* =========================================================
   Vue Connexion — plein écran (réutilise le voile indigo).
   Une maison ouvre son compte elle-même : le lien ci-dessous mène à
   l'inscription. Le superadministrateur garde la création manuelle
   en secours, mais elle n'est plus le chemin normal.
   ========================================================= */
const VueConnexion = (() => {

  /* Invitation à rejoindre la plateforme. */
  function invitationEnregistrement() {
    return (
      '<p class="voile-contact" style="margin-top:18px">Vous êtes un atelier ou un styliste ?<br>' +
        '<a href="#" id="cx-inscription" ' +
          'style="font-weight:700;color:var(--vert);text-decoration:underline">' +
          "Cliquez ici pour ouvrir votre compte en quelques minutes</a>" +
      "</p>"
    );
  }

  function afficher() {
    const voile = document.getElementById("voile-licence");
    document.body.classList.remove("mode-superadmin");
    UI.entete({ titre: "Atelier" });

    voile.innerHTML =
      '<div class="voile-boite">' +
        '<img src="icons/icon-192.png" alt="" class="voile-logo">' +
        "<h1>Atelier</h1>" +
        '<p class="voile-texte">Gestion des commandes pour ateliers de couture</p>' +
        '<form id="form-connexion" style="text-align:left;margin-top:18px">' +
          '<div class="champ"><label for="cx-email">Email</label>' +
            '<input id="cx-email" type="email" autocomplete="email" inputmode="email" required></div>' +
          '<div class="champ"><label for="cx-mdp">Mot de passe</label>' +
            '<input id="cx-mdp" type="password" autocomplete="current-password" required></div>' +
          '<button type="submit" class="btn btn-bloc" id="cx-bouton">Se connecter</button>' +
        "</form>" +
        invitationEnregistrement() +
        '<p class="voile-contact"><a href="#" id="cx-retour-boutique" style="text-decoration:underline">← Retour à la boutique</a></p>' +
      "</div>";
    voile.hidden = false;
    document.body.style.overflow = "hidden";

    const bouton = document.getElementById("cx-bouton");
    document.getElementById("form-connexion").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      bouton.disabled = true;
      try {
        const suite = await Api.connexion(
          document.getElementById("cx-email").value.trim(),
          document.getElementById("cx-mdp").value
        );
        if (suite && suite.termine === false) {
          demanderCode(suite.email);
          return;
        }
        entrer();
      } catch (err) {
        UI.toast(err.message || "Connexion impossible", "erreur");
        bouton.disabled = false;
      }
    });

    document.getElementById("cx-retour-boutique").addEventListener("click", (ev) => {
      ev.preventDefault();
      masquer();
      location.hash = "#/";
      window.AppNaviguer();
    });

    document.getElementById("cx-inscription").addEventListener("click", (ev) => {
      ev.preventDefault();
      masquer();
      location.hash = "#/inscription";
      window.AppNaviguer();
    });
  }

  function entrer() {
    masquer();
    location.hash = "#/";
    window.AppNaviguer();
  }

  /* Second écran : le code reçu par email. Le mot de passe
     est déjà validé côté serveur, mais la session ne donne encore accès
     à rien tant que ce code n'est pas confirmé. */
  function demanderCode(email, apres) {
    /* `apres` : ce qu'il faut faire une fois le code accepté. L'inscription
       s'en sert pour enchaîner sur le choix de la formule plutôt que
       d'entrer directement dans l'application. */
    const suite = apres || entrer;
    const voile = document.getElementById("voile-licence");
    /* Le voile peut être fermé si la connexion n'est pas partie de cet
       écran : on le rouvre, sinon le formulaire resterait invisible. */
    voile.hidden = false;
    document.body.style.overflow = "hidden";
    voile.innerHTML =
      '<div class="voile-boite">' +
        '<img src="icons/icon-192.png" alt="" class="voile-logo">' +
        "<h1>Vérification</h1>" +
        '<p class="voile-texte">Un code de connexion vient d\'être envoyé à<br>' +
          "<strong>" + Utils.echapper(email) + "</strong></p>" +
        '<form id="form-code" style="text-align:left;margin-top:18px">' +
          '<div class="champ"><label for="cx-code">Code reçu par email</label>' +
            '<input id="cx-code" inputmode="numeric" autocomplete="one-time-code" ' +
              'pattern="[0-9]*" maxlength="10" required ' +
              'style="letter-spacing:6px;text-align:center;font-size:22px;font-weight:700"></div>' +
          '<button type="submit" class="btn btn-bloc" id="cx-valider">Valider le code</button>' +
        "</form>" +
        '<p class="voile-contact" style="margin-top:16px">' +
          "Rien reçu ? Pensez aux indésirables.<br>" +
          '<a href="#" id="cx-renvoyer" style="text-decoration:underline">Renvoyer un code</a>' +
        "</p>" +
        '<p class="voile-contact"><a href="#" id="cx-annuler" style="text-decoration:underline">' +
          "← Recommencer la connexion</a></p>" +
      "</div>";

    const valider = document.getElementById("cx-valider");
    const champ = document.getElementById("cx-code");
    champ.focus();

    document.getElementById("form-code").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      valider.disabled = true;
      try {
        await Api.verifierCode(email, champ.value);
        suite();
      } catch (err) {
        UI.toast(err.message || "Code refusé", "erreur");
        valider.disabled = false;
        champ.value = "";
        champ.focus();
      }
    });

    document.getElementById("cx-renvoyer").addEventListener("click", async (ev) => {
      ev.preventDefault();
      try {
        await Api.renvoyerCode(email);
        UI.toast("Nouveau code envoyé", "ok");
      } catch (err) {
        UI.toast(err.message || "Envoi impossible", "erreur");
      }
    });

    document.getElementById("cx-annuler").addEventListener("click", async (ev) => {
      ev.preventDefault();
      await Api.deconnexion();
      afficher();
    });
  }

  function masquer() {
    const voile = document.getElementById("voile-licence");
    voile.hidden = true;
    voile.innerHTML = "";
    document.body.style.overflow = "";
  }

  return { afficher, masquer, demanderCode };
})();
