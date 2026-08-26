/* =========================================================
   Vue Connexion — plein écran (réutilise le voile indigo).
   Les comptes sont créés par le superadministrateur ; le lien
   « créer un compte » ne sert qu'à la toute première
   installation (le compte créé reste inactif tant qu'il n'est
   pas promu ou relié à un atelier).
   ========================================================= */
const VueConnexion = (() => {

  /* Invitation à rejoindre la plateforme : renvoie vers le WhatsApp du
     superadministrateur, réglé dans « Mon compte ». */
  function invitationEnregistrement() {
    const prm = Api.lireParametres();
    const numero = prm && prm.contact_whatsapp ? prm.contact_whatsapp : "";
    const texte = "Vous êtes un atelier ou un styliste ?";
    if (!numero) {
      return '<p class="voile-contact">' + texte + " Contactez-nous pour ouvrir votre compte.</p>";
    }
    const message = "Bonjour 👋 Je suis un atelier / styliste et je souhaite " +
      "enregistrer mon atelier sur l'application Atelier.";
    return (
      '<p class="voile-contact" style="margin-top:18px">' + texte + "<br>" +
        '<a href="' + Utils.lienWhatsApp(numero, message, "229") + '" target="_blank" rel="noopener" ' +
          'style="font-weight:700;color:var(--vert);text-decoration:underline">' +
          "Enregistrez-vous dès maintenant</a>" +
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
        await Api.connexion(
          document.getElementById("cx-email").value.trim(),
          document.getElementById("cx-mdp").value
        );
        masquer();
        location.hash = "#/";
        window.AppNaviguer();
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
  }

  function masquer() {
    const voile = document.getElementById("voile-licence");
    voile.hidden = true;
    voile.innerHTML = "";
    document.body.style.overflow = "";
  }

  return { afficher, masquer };
})();
