/* =========================================================
   Vues Commandes — liste filtrée, création avec photos des
   tissus (caméra), détail : paiements, statut, WhatsApp.
   ========================================================= */
const VueCommandes = (() => {
  const e = Utils.echapper;

  /* ---------- Liste ---------- */

  const FILTRES = [
    { id: "ouvertes", label: "En cours" },
    { id: "retard", label: "En retard" },
    { id: "pret", label: "Prêtes" },
    { id: "impayees", label: "Avec solde" },
    { id: "livree", label: "Livrées" },
    { id: "toutes", label: "Toutes" },
  ];

  let filtreActif = "ouvertes";

  async function liste(vue) {
    const [commandes, clients] = await Promise.all([Store.listerCommandes(), Store.listerClients()]);
    const parId = new Map(clients.map((c) => [c.id, c]));

    UI.entete({
      titre: "Commandes",
      sous: commandes.length + " au total",
      actions: Api.aDroit("commande_creer")
        ? '<a class="btn-ic" href="#/commande/nouvelle" aria-label="Nouvelle commande">' + UI.icone("plus") + "</a>"
        : "",
    });

    const compte = (idFiltre) => appliquer(commandes, idFiltre, "").length;

    vue.innerHTML =
      '<div class="recherche">' + UI.icone("recherche") +
        '<input id="q-cmd" type="search" placeholder="Client, numéro, description…" autocomplete="off">' +
      "</div>" +
      '<div class="puces" id="puces-cmd">' +
        FILTRES.map((f) =>
          '<button type="button" class="puce' + (f.id === filtreActif ? " actif" : "") + '" data-filtre="' + f.id + '">' +
            e(f.label) + '<span class="compte">' + compte(f.id) + "</span></button>"
        ).join("") +
      "</div>" +
      '<div class="liste" id="liste-cmd"></div>';

    function appliquer(toutes, idFiltre, terme) {
      let visibles = toutes;
      if (idFiltre === "ouvertes") visibles = visibles.filter((c) => c.statut !== "livree");
      else if (idFiltre === "retard") visibles = visibles.filter(Store.estEnRetard);
      else if (idFiltre === "pret") visibles = visibles.filter((c) => c.statut === "pret");
      else if (idFiltre === "impayees") visibles = visibles.filter((c) => Store.soldeRestant(c) > 0);
      else if (idFiltre === "livree") visibles = visibles.filter((c) => c.statut === "livree");

      const t = Utils.sansAccent(terme).trim();
      if (t) {
        visibles = visibles.filter((c) => {
          const client = parId.get(c.clientId);
          const texte = Utils.sansAccent(
            c.numero + " " + (c.description || "") + " " + Utils.nomComplet(client) + " " + (client ? client.tel || "" : ""));
          return t.split(/\s+/).every((mot) => texte.includes(mot));
        });
      }

      if (idFiltre === "livree" || idFiltre === "toutes") return visibles; // déjà du plus récent au plus ancien
      return visibles.slice().sort((a, b) => a.dateLivraison.localeCompare(b.dateLivraison));
    }

    function rendre() {
      const terme = UI.$("#q-cmd").value;
      const visibles = appliquer(commandes, filtreActif, terme);
      const zone = UI.$("#liste-cmd");
      if (!visibles.length) {
        zone.innerHTML = UI.vide(
          "commandes",
          terme ? "Aucune commande trouvée" : "Aucune commande ici",
          terme ? "Essayez un autre mot."
                : (Api.aDroit("commande_creer")
                    ? "Le bouton + crée une commande en quelques secondes."
                    : "Vous n'avez pas le droit de créer une commande."),
          terme || !Api.aDroit("commande_creer")
            ? ""
            : '<a class="btn" href="#/commande/nouvelle">' + UI.icone("plus", "ic-sm") + "Nouvelle commande</a>"
        );
        return;
      }
      zone.innerHTML = visibles.map((c) => {
        const client = parId.get(c.clientId);
        return UI.ligneCommande(c, client, {
          titre: Utils.nomComplet(client) + (c.description ? " — " + c.description : ""),
        });
      }).join("");
    }

    UI.$("#puces-cmd").addEventListener("click", (ev) => {
      const bouton = ev.target.closest("[data-filtre]");
      if (!bouton) return;
      filtreActif = bouton.dataset.filtre;
      UI.$$("#puces-cmd .puce").forEach((p) => p.classList.toggle("actif", p === bouton));
      rendre();
    });
    UI.$("#q-cmd").addEventListener("input", Utils.tempo(rendre, 160));
    rendre();
  }

  /* ---------- Nouvelle commande ---------- */

  async function nouvelle(vue, params) {
    const r = Store.lireReglages();
    const clients = await Store.listerClients();
    let clientChoisi = params.client ? clients.find((c) => c.id === params.client) || null : null;
    /* { apercu, fichier } : la commande n'existe pas encore, et le chemin
       du fichier contient son identifiant. Les photos partent donc dans
       le bucket une fois la commande enregistrée. */
    const photos = [];

    UI.entete({ titre: "Nouvelle commande", sous: "N° attribué à l'enregistrement", retour: true });

    vue.innerHTML =
      '<form id="form-cmd" novalidate>' +

        '<div class="carte">' +
          '<div class="carte-titre">' + UI.icone("clients", "ic-sm") + 'Client <span class="obligatoire">*</span></div>' +
          '<div id="zone-client"></div>' +
        "</div>" +

        '<div class="carte">' +
          '<div class="carte-titre">' + UI.icone("camera", "ic-sm") + "Photos du tissu</div>" +
          '<div class="photos" id="zone-photos"></div>' +
          '<input type="file" id="prise-photo" accept="image/*" capture="environment" multiple hidden>' +
          '<div class="aide" style="margin-top:8px;font-size:12px;color:var(--encre-tres-douce)">' +
            "Prenez le ou les tissus du client : la photo reste attachée à la commande.</div>" +
        "</div>" +

        '<div class="carte">' +
          '<div class="carte-titre">' + UI.icone("commandes", "ic-sm") + "Détails</div>" +
          '<div class="champ"><label for="cmd-desc">Modèle / description</label>' +
            '<input id="cmd-desc" autocomplete="off" placeholder="Ex. : boubou brodé, chemise pagne…"></div>' +
          '<div class="champ"><label for="cmd-livraison">Date de livraison <span class="obligatoire">*</span></label>' +
            '<input id="cmd-livraison" type="date" min="' + Utils.aujourdhui() + '" value="' + Utils.ajouterJours(Utils.aujourdhui(), 7) + '">' +
            '<div class="aide" id="aide-livraison"></div></div>' +
          '<div class="champ"><label for="cmd-commentaire">Commentaire</label>' +
            '<textarea id="cmd-commentaire" style="min-height:80px" ' +
              'placeholder="Précisions du client, retouches convenues, particularité du tissu…"></textarea>' +
            '<div class="aide">Noté sur la commande, pour vous et votre équipe.</div></div>' +
        "</div>" +

        '<div class="carte">' +
          '<div class="carte-titre">' + UI.icone("argent", "ic-sm") + "Paiement</div>" +
          UI.champMontant({ id: "cmd-montant", label: "Montant de la commande", obligatoire: true }) +
          UI.champMontant({ id: "cmd-acompte", label: "Acompte versé aujourd'hui", aide: "Laissez vide si rien n'est versé." }) +
          '<div class="paires" id="apercu-solde" hidden>' +
            '<div class="paire"><span class="l">Solde restant</span><span class="v gros" id="apercu-solde-v"></span></div>' +
          "</div>" +
        "</div>" +

        '<label class="interrupteur carte" style="display:flex">' +
          '<input type="checkbox" id="cmd-wa" ' + "checked" + ">" +
          "<span>Envoyer le récapitulatif au client par <strong>WhatsApp</strong> après l'enregistrement</span>" +
        "</label>" +

        '<div style="margin-top:16px"><button type="submit" class="btn btn-bloc" id="btn-creer">' +
          UI.icone("check", "ic-sm") + "Enregistrer la commande</button></div>" +
      "</form>";

    /* --- Choix du client --- */

    function rendreZoneClient() {
      const zone = UI.$("#zone-client");
      if (clientChoisi) {
        const nbMes = Mesures.nombre(clientChoisi.mesures);
        zone.innerHTML =
          '<div class="suggestion" style="border-color:var(--indigo-500)">' +
            UI.pastilleClient(clientChoisi) +
            '<span style="flex:1;min-width:0"><span class="nom">' + e(Utils.nomComplet(clientChoisi)) + "</span>" +
              '<div class="tel">' + e(Utils.fmtTel(Utils.telAppel(clientChoisi))) + " · " +
                (nbMes ? nbMes + " mesures en fiche" : "aucune mesure en fiche") + "</div></span>" +
            '<button type="button" class="btn btn-clair btn-sm" id="changer-client">Changer</button>' +
          "</div>" +
          (!nbMes
            ? '<div class="aide" style="margin-top:6px">Astuce : ajoutez ses mesures depuis sa fiche, elles serviront à chaque commande.</div>'
            : "");
        UI.$("#changer-client").onclick = () => { clientChoisi = null; rendreZoneClient(); };
        return;
      }

      zone.innerHTML =
        '<div class="recherche" style="box-shadow:none">' + UI.icone("recherche") +
          '<input id="q-choix-client" placeholder="Chercher un client…" autocomplete="off" style="box-shadow:inset 0 0 0 1.5px var(--trait)">' +
        "</div>" +
        '<div class="suggestions" id="suggestions-client"></div>' +
        '<button type="button" class="btn btn-contour btn-bloc" id="creer-client" style="margin-top:8px">' +
          UI.icone("plus", "ic-sm") + "Nouveau client</button>";

      const champ = UI.$("#q-choix-client");
      const suggestions = UI.$("#suggestions-client");

      function rendreSuggestions() {
        const visibles = Store.chercherClients(clients, champ.value).slice(0, 6);
        suggestions.innerHTML = visibles.length
          ? visibles.map((c) =>
              '<button type="button" class="suggestion" data-id="' + c.id + '">' +
                UI.pastilleClient(c) +
                '<span><span class="nom">' + e(Utils.nomComplet(c)) + '</span><div class="tel">' + e(Utils.fmtTel(Utils.telAppel(c))) + "</div></span>" +
              "</button>"
            ).join("")
          : '<p style="margin:4px 0;font-size:13px;color:var(--encre-tres-douce)">' +
            (clients.length ? "Aucun client ne correspond." : "Aucun client enregistré pour l'instant.") + "</p>";
      }

      suggestions.addEventListener("click", (ev) => {
        const bouton = ev.target.closest("[data-id]");
        if (!bouton) return;
        clientChoisi = clients.find((c) => c.id === bouton.dataset.id) || null;
        rendreZoneClient();
      });
      champ.addEventListener("input", Utils.tempo(rendreSuggestions, 120));
      UI.$("#creer-client").onclick = () => ouvrirMiniFormClient();
      rendreSuggestions();
    }

    /** Création rapide d'un client sans quitter la commande. */
    function ouvrirMiniFormClient() {
      const corps = UI.ouvrirFeuille("Nouveau client",
        '<div class="carte">' +
          '<div class="champ-duo">' +
            '<div class="champ"><label for="mini-prenom">Prénom <span class="obligatoire">*</span></label>' +
              '<input id="mini-prenom" autocapitalize="words" autocomplete="off"></div>' +
            '<div class="champ"><label for="mini-nom">Nom</label>' +
              '<input id="mini-nom" autocapitalize="words" autocomplete="off"></div>' +
          "</div>" +
          '<div class="champ"><label for="mini-tel">Téléphone (appels)</label>' +
            '<input id="mini-tel" type="tel" inputmode="tel" autocomplete="off" placeholder="97 00 00 00"></div>' +
          "<div class=\"champ\"><label for=\"mini-tel-wa\">Numéro WhatsApp (si différent)</label>" +
            '<input id="mini-tel-wa" type="tel" inputmode="tel" autocomplete="off" placeholder="97 00 00 00"></div>' +
          '<p style="font-size:12px;color:var(--encre-tres-douce);margin:0 0 12px">' +
            "Vous pourrez saisir ses mesures depuis sa fiche.</p>" +
          '<button type="button" class="btn btn-bloc" id="mini-ok">' + UI.icone("check", "ic-sm") + "Créer le client</button>" +
        "</div>");
      UI.$("#mini-prenom", corps).focus();
      UI.$("#mini-ok", corps).onclick = async () => {
        try {
          const nouveau = await Store.sauverClient({
            prenom: UI.$("#mini-prenom", corps).value,
            nom: UI.$("#mini-nom", corps).value,
            tel: UI.$("#mini-tel", corps).value,
            telWhatsApp: UI.$("#mini-tel-wa", corps).value,
          });
          clients.push(nouveau);
          clients.sort((a, b) => Utils.sansAccent(Utils.nomComplet(a)).localeCompare(Utils.sansAccent(Utils.nomComplet(b)), "fr"));
          clientChoisi = nouveau;
          UI.fermerFeuille();
          rendreZoneClient();
          UI.toast("Client créé", "ok");
        } catch (err) {
          UI.toast(err.message || "Création impossible", "erreur");
        }
      };
    }

    /* --- Photos --- */

    const prise = UI.$("#prise-photo");

    function rendrePhotos() {
      const zone = UI.$("#zone-photos");
      zone.innerHTML =
        photos.map((p, i) =>
          '<span class="photo"><img src="' + p.apercu + '" alt="Tissu ' + (i + 1) + '">' +
            '<button type="button" class="photo-suppr" data-retire="' + i + '" aria-label="Retirer la photo">' +
              UI.icone("fermer") + "</button></span>"
        ).join("") +
        '<button type="button" class="photo-ajout" id="ajout-photo">' + UI.icone("camera") +
          (photos.length ? "Autre tissu" : "Prendre le tissu") + "</button>";
      UI.$("#ajout-photo").onclick = () => prise.click();
    }

    UI.$("#zone-photos").addEventListener("click", (ev) => {
      const bouton = ev.target.closest("[data-retire]");
      if (!bouton) return;
      photos.splice(Number(bouton.dataset.retire), 1);
      rendrePhotos();
    });

    prise.addEventListener("change", async () => {
      const fichiers = Array.from(prise.files || []);
      prise.value = "";
      for (const fichier of fichiers) {
        try {
          /* Un aperçu tout de suite, et le Blob gardé pour l'envoi : une
             seule lecture du fichier, qui n'est plus lisible ensuite sur
             Android (voir Utils.preparerImage). */
          const { dataUrl, blob } = await Utils.preparerImage(fichier);
          photos.push({ apercu: dataUrl, blob });
        } catch (_) {
          UI.toast("Photo illisible, réessayez", "erreur");
        }
      }
      rendrePhotos();
    });

    /* --- Aperçu du solde + délai --- */

    function majApercu() {
      const montant = Utils.lireNombre(UI.$("#cmd-montant").value);
      const acompte = Utils.lireNombre(UI.$("#cmd-acompte").value);
      const apercu = UI.$("#apercu-solde");
      if (montant > 0) {
        apercu.hidden = false;
        const solde = Math.max(0, montant - acompte);
        const v = UI.$("#apercu-solde-v");
        v.textContent = Utils.fmtMontant(solde, r.devise);
        v.className = "v gros " + (solde > 0 ? "rouge" : "vert");
      } else {
        apercu.hidden = true;
      }
      const livraison = UI.$("#cmd-livraison").value;
      UI.$("#aide-livraison").textContent = livraison ? "Livraison " + Utils.delai(livraison) + "." : "";
    }
    ["cmd-montant", "cmd-acompte", "cmd-livraison"].forEach((idChamp) =>
      UI.$("#" + idChamp).addEventListener("input", majApercu));
    majApercu();

    /* --- Enregistrement --- */

    UI.$("#form-cmd").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (!clientChoisi) {
        UI.toast("Choisissez d'abord le client", "erreur");
        return;
      }
      const montant = Utils.lireNombre(UI.$("#cmd-montant").value);
      if (montant <= 0) {
        UI.toast("Indiquez le montant de la commande", "erreur");
        UI.$("#cmd-montant").focus();
        return;
      }
      const acompte = Utils.lireNombre(UI.$("#cmd-acompte").value);
      if (acompte > montant) {
        UI.toast("L'acompte dépasse le montant de la commande", "erreur");
        UI.$("#cmd-acompte").focus();
        return;
      }
      const livraison = UI.$("#cmd-livraison").value;
      if (!livraison) {
        UI.toast("Choisissez la date de livraison", "erreur");
        return;
      }

      const bouton = UI.$("#btn-creer");
      bouton.disabled = true;
      try {
        const commande = await Store.sauverCommande({
          clientId: clientChoisi.id,
          description: UI.$("#cmd-desc").value,
          commentaire: UI.$("#cmd-commentaire").value,
          dateLivraison: livraison,
          montant, acompte,
        });
        if (photos.length) {
          bouton.textContent = "Envoi des photos…";
          try {
            for (const ph of photos) {
              const chemin = await Stockage.deposerImage(
                ph.blob, Stockage.COMMANDES, commande.id, { dejaPrete: true });
              await Store.ajouterPhoto(commande.id, chemin);
            }
          } catch (_) {
            /* La commande est enregistrée : la refaire créerait un doublon.
               On le dit, et l'écran de détail permet de reprendre la photo. */
            UI.toast("Commande enregistrée, mais l'envoi des photos a échoué", "erreur");
          }
        }

        UI.toast("Commande " + commande.numero + " enregistrée", "ok");

        const numeroWa = Utils.telWhatsApp(clientChoisi);
        if (UI.$("#cmd-wa").checked && numeroWa) {
          const message = Store.messageCommande(commande, clientChoisi);
          window.open(Utils.lienWhatsApp(numeroWa, message, r.indicatif), "_blank");
        } else if (UI.$("#cmd-wa").checked && !numeroWa) {
          UI.toast("Pas de téléphone en fiche : message WhatsApp non envoyé");
        }
        location.hash = "#/commande/" + commande.id;
      } catch (err) {
        bouton.disabled = false;
        UI.toast(err.message || "Enregistrement impossible", "erreur");
      }
    });

    rendreZoneClient();
    rendrePhotos();
  }

  /* ---------- Détail d'une commande ---------- */

  async function detail(vue, id) {
    const commande = await Store.lireCommande(id);
    if (!commande) {
      location.hash = "#/commandes";
      return;
    }
    const r = Store.lireReglages();
    const [client, photos] = await Promise.all([
      Store.lireClient(commande.clientId),
      Store.photosDeCommande(id),
    ]);

    const paye = Store.totalPaye(commande);
    const solde = Store.soldeRestant(commande);
    const acompte = Store.acompteVerse(commande);
    const pct = commande.montant > 0 ? Math.min(100, Math.round((paye / commande.montant) * 100)) : 0;

    UI.entete({
      titre: commande.numero,
      sous: "Créée le " + Utils.fmtDateHeure(commande.creeLe),
      retour: true,
      actions: Api.aDroit("commande_modifier")
        ? '<a class="btn-ic" href="#/commande/' + id + '/modifier" aria-label="Modifier">' + UI.icone("crayon") + "</a>"
        : "",
    });

    let html =
      '<div class="carte">' +
        '<div style="display:flex;align-items:center;gap:12px">' +
          UI.pastilleClient(client) +
          '<div style="flex:1;min-width:0">' +
            '<div class="ligne-titre">' + e(Utils.nomComplet(client)) + "</div>" +
            '<div class="ligne-sous">' + (commande.description ? e(commande.description) : "Sans description") + "</div>" +
          "</div>" +
          UI.badgeStatut(commande) +
        "</div>" +
        (client
          ? '<div class="btn-rangee" style="margin-top:12px">' +
              '<a class="btn btn-clair btn-sm" href="#/client/' + client.id + '">Voir la fiche</a>' +
              (Utils.telAppel(client)
                ? '<a class="btn btn-clair btn-sm" href="' + e(Utils.lienTel(Utils.telAppel(client), r.indicatif)) + '">' + UI.icone("tel", "ic-sm") + "Appeler</a>"
                : "") +
            "</div>"
          : "") +
      "</div>";

    /* Photos des tissus */
    html +=
      '<div class="carte">' +
        '<div class="carte-titre">' + UI.icone("image", "ic-sm") + "Tissus (" + photos.length + ")</div>" +
        '<div class="photos" id="photos-detail">' +
          photos.map((p) =>
            '<span class="photo"><img src="' + p.src + '" alt="Tissu" data-voir="' + p.id + '">' +
              '<button type="button" class="photo-suppr" data-suppr-photo="' + p.id + '" aria-label="Supprimer la photo">' +
                UI.icone("fermer") + "</button></span>"
          ).join("") +
          '<button type="button" class="photo-ajout" id="ajout-photo-detail">' + UI.icone("camera") + "Ajouter</button>" +
        "</div>" +
        '<input type="file" id="prise-photo-detail" accept="image/*" capture="environment" multiple hidden>' +
      "</div>";

    /* Commentaire de la commande */
    if (commande.commentaire) {
      html +=
        '<div class="carte">' +
          '<div class="carte-titre">' + UI.icone("crayon", "ic-sm") + "Commentaire</div>" +
          '<p style="margin:0;font-size:14px;line-height:1.55;white-space:pre-wrap">' +
            e(commande.commentaire) + "</p>" +
        "</div>";
    }

    /* Livraison */
    const enRetard = Store.estEnRetard(commande);
    html +=
      '<div class="carte">' +
        '<div class="carte-titre">' + UI.icone("calendrier", "ic-sm") + "Livraison</div>" +
        '<div class="paires">' +
          '<div class="paire"><span class="l">Date prévue</span><span class="v">' + Utils.fmtDate(commande.dateLivraison) + "</span></div>" +
          '<div class="paire"><span class="l">Délai</span><span class="v' + (enRetard ? " rouge" : "") + '">' +
            (commande.statut === "livree"
              ? "Livrée le " + Utils.fmtDateHeure(commande.livreLe)
              : e(Utils.delai(commande.dateLivraison))) + "</span></div>" +
        "</div>" +
      "</div>";

    /* Paiement */
    html +=
      '<div class="carte">' +
        '<div class="carte-titre">' + UI.icone("argent", "ic-sm") + "Paiement" +
          (solde > 0 && Api.aDroit("commande_modifier")
            ? '<a class="lien" id="ouvrir-paiement" style="cursor:pointer">+ Encaisser</a>' : "") +
        "</div>" +
        '<div class="paires">' +
          '<div class="paire"><span class="l">Montant de la commande</span><span class="v gros">' + Utils.fmtMontant(commande.montant, r.devise) + "</span></div>" +
          '<div class="paire"><span class="l">Acompte versé</span><span class="v">' + Utils.fmtMontant(acompte, r.devise) + "</span></div>" +
          '<div class="paire"><span class="l">Total payé</span><span class="v">' + Utils.fmtMontant(paye, r.devise) + "</span></div>" +
          '<div class="paire"><span class="l">Solde restant</span><span class="v gros ' + (solde > 0 ? "rouge" : "vert") + '">' +
            Utils.fmtMontant(solde, r.devise) + "</span></div>" +
        "</div>" +
        '<div class="jauge"><i style="width:' + pct + '%"></i></div>' +
        '<div style="font-size:11.5px;color:var(--encre-tres-douce);margin-top:5px">' + pct + " % encaissé</div>" +
        (commande.paiements.length
          ? '<details class="bloc" style="box-shadow:none;background:var(--indigo-50);margin-top:10px"><summary style="font-size:13.5px">Historique des versements (' + commande.paiements.length + ")</summary>" +
            '<div class="contenu"><div class="mini-liste">' +
              commande.paiements.map((p) =>
                '<div class="mini">' +
                  '<span class="l">' + e(p.note || "Versement") + " · " + Utils.fmtDateHeure(p.date) + "</span>" +
                  '<span class="v">' + Utils.fmtMontant(p.montant, r.devise) + "</span>" +
                  (Api.aDroit("commande_modifier")
                    ? '<button type="button" class="btn-ic" style="width:30px;height:30px;background:var(--rouge-clair);color:var(--rouge)" data-suppr-paiement="' + p.id + '" aria-label="Annuler ce versement">' +
                      UI.icone("poubelle", "ic-sm") + "</button>"
                    : "") +
                "</div>"
              ).join("") +
            "</div></div></details>"
          : "") +
      "</div>";

    /* Statut : seul l'administrateur le change ; le modérateur le lit. */
    html +=
      '<div class="carte">' +
        '<div class="carte-titre">' + UI.icone("check", "ic-sm") + "Statut</div>" +
        (Api.aDroit("commande_modifier")
          ? '<div class="btn-rangee">' +
              Object.entries(Store.STATUTS).map(([code, s]) =>
                '<button type="button" class="btn btn-sm ' + (commande.statut === code ? "" : "btn-clair") + '" data-statut="' + code + '">' +
                  e(s.label) + "</button>"
              ).join("") +
            "</div>"
          : UI.badgeStatut(commande)) +
        (commande.statut === "pret" && solde > 0
          ? '<div class="aide" style="margin-top:8px">Astuce : prévenez le client par WhatsApp que sa commande est prête.</div>'
          : "") +
      "</div>";

    /* WhatsApp */
    if (client && Utils.telWhatsApp(client)) {
      html +=
        '<div class="carte">' +
          '<div class="carte-titre">' + UI.icone("whatsapp", "ic-sm") + "Message WhatsApp</div>" +
          '<div class="btn-rangee">' +
            (Api.aDroit("commande_recap")
              ? '<button type="button" class="btn btn-wa" id="wa-recap">' +
                  UI.icone("whatsapp", "ic-sm") + "Récapitulatif</button>"
              : "") +
            '<button type="button" class="btn btn-wa" id="wa-pret">' + UI.icone("whatsapp", "ic-sm") + "Commande prête</button>" +
          "</div>" +
          "<div class=\"aide\" style=\"margin-top:8px\">Le message s'ouvre dans WhatsApp : vous pouvez le relire avant l'envoi.</div>" +
        "</div>";
    }

    if (Api.aDroit("commande_supprimer")) {
      html +=
        '<div style="margin-top:6px"><button type="button" class="btn btn-danger btn-bloc" id="suppr-cmd">' +
          UI.icone("poubelle", "ic-sm") + "Supprimer la commande</button></div>";
    }

    vue.innerHTML = html;

    /* --- Interactions --- */

    const recharger = () => detail(vue, id);

    UI.$("#photos-detail").addEventListener("click", async (ev) => {
      const suppr = ev.target.closest("[data-suppr-photo]");
      if (suppr) {
        const ok = await UI.confirmer({
          titre: "Supprimer la photo",
          texte: "Retirer cette photo de tissu de la commande ?",
          bouton: "Supprimer", danger: true,
        });
        if (ok) {
          /* La ligne porte le chemin du fichier : sans lui, le fichier
             resterait dans le bucket sans plus rien pour le désigner. */
          const photo = photos.find((p) => p.id === suppr.dataset.supprPhoto);
          await Store.supprimerPhoto(suppr.dataset.supprPhoto, photo && photo.valeur);
          recharger();
        }
        return;
      }
      const voir = ev.target.closest("[data-voir]");
      if (voir) UI.ouvrirVisionneuse(voir.src);
    });

    const priseDetail = UI.$("#prise-photo-detail");
    UI.$("#ajout-photo-detail").onclick = () => priseDetail.click();
    priseDetail.addEventListener("change", async () => {
      const fichiers = Array.from(priseDetail.files || []);
      priseDetail.value = "";
      let envoyees = 0;
      for (const fichier of fichiers) {
        try {
          const chemin = await Stockage.deposerImage(fichier, Stockage.COMMANDES, id);
          await Store.ajouterPhoto(id, chemin);
          envoyees++;
        } catch (err) {
          UI.toast(err.message || "Envoi de la photo impossible", "erreur");
        }
      }
      if (envoyees) { UI.toast("Photo ajoutée", "ok"); recharger(); }
    });

    const boutonPaiement = UI.$("#ouvrir-paiement");
    if (boutonPaiement) boutonPaiement.onclick = () => {
      const corps = UI.ouvrirFeuille("Encaisser un versement",
        '<div class="carte">' +
          '<div class="paires" style="margin-bottom:12px">' +
            '<div class="paire"><span class="l">Solde restant</span><span class="v gros rouge">' + Utils.fmtMontant(solde, r.devise) + "</span></div>" +
          "</div>" +
          UI.champMontant({ id: "pay-montant", label: "Montant reçu", obligatoire: true }) +
          '<div class="champ"><label for="pay-note">Note (facultatif)</label>' +
            '<input id="pay-note" autocomplete="off" placeholder="Ex. : à la livraison, mobile money…"></div>' +
          '<div class="btn-rangee">' +
            '<button type="button" class="btn btn-clair" id="pay-tout">Tout le solde</button>' +
            '<button type="button" class="btn" id="pay-ok">' + UI.icone("check", "ic-sm") + "Encaisser</button>" +
          "</div>" +
        "</div>");
      UI.$("#pay-tout", corps).onclick = () => {
        UI.$("#pay-montant", corps).value = Utils.fmtNombre(solde);
      };
      UI.$("#pay-ok", corps).onclick = async () => {
        try {
          await Store.ajouterPaiement(id, UI.$("#pay-montant", corps).value, UI.$("#pay-note", corps).value);
          UI.fermerFeuille();
          UI.toast("Versement encaissé", "ok");
          recharger();
        } catch (err) {
          UI.toast(err.message || "Encaissement impossible", "erreur");
        }
      };
      UI.$("#pay-montant", corps).focus();
    };

    for (const bouton of UI.$$("[data-suppr-paiement]", vue)) {
      bouton.onclick = async () => {
        const ok = await UI.confirmer({
          titre: "Annuler le versement",
          texte: "Ce versement sera retiré de la commande et des recettes.",
          bouton: "Annuler le versement", danger: true,
        });
        if (ok) { await Store.retirerPaiement(id, bouton.dataset.supprPaiement); recharger(); }
      };
    }

    for (const bouton of UI.$$("[data-statut]", vue)) {
      bouton.onclick = async () => {
        if (bouton.dataset.statut === commande.statut) return;
        await Store.changerStatut(id, bouton.dataset.statut);
        if (bouton.dataset.statut === "livree" && solde > 0) {
          UI.toast("Commande livrée — solde restant à encaisser");
        } else {
          UI.toast("Statut : " + Store.STATUTS[bouton.dataset.statut].label, "ok");
        }
        recharger();
      };
    }

    const waRecap = UI.$("#wa-recap");
    if (waRecap) waRecap.onclick = () => {
      const message = Store.messageCommande(commande, client);
      window.open(Utils.lienWhatsApp(Utils.telWhatsApp(client), message, r.indicatif), "_blank");
    };
    const waPret = UI.$("#wa-pret");
    if (waPret) waPret.onclick = () => {
      const message = Store.messageCommande(commande, client, r.modeleWhatsAppPret);
      window.open(Utils.lienWhatsApp(Utils.telWhatsApp(client), message, r.indicatif), "_blank");
    };

    const supprCmd = UI.$("#suppr-cmd");
    if (supprCmd) supprCmd.onclick = async () => {
      const ok = await UI.confirmer({
        titre: "Supprimer la commande",
        texte: "La commande " + commande.numero + ", ses photos et ses versements seront définitivement effacés.",
        bouton: "Supprimer", danger: true,
      });
      if (!ok) return;
      await Store.supprimerCommande(id);
      UI.toast("Commande supprimée", "ok");
      location.hash = "#/commandes";
    };
  }

  /* ---------- Modifier une commande ---------- */

  async function modifier(vue, id) {
    const commande = await Store.lireCommande(id);
    if (!commande) {
      location.hash = "#/commandes";
      return;
    }
    const r = Store.lireReglages();

    UI.entete({ titre: "Modifier " + commande.numero, retour: true });

    vue.innerHTML =
      '<form id="form-modif" novalidate>' +
        '<div class="carte">' +
          '<div class="champ"><label for="mod-desc">Modèle / description</label>' +
            '<input id="mod-desc" autocomplete="off" value="' + e(commande.description) + '"></div>' +
          '<div class="champ"><label for="mod-livraison">Date de livraison</label>' +
            '<input id="mod-livraison" type="date" value="' + e(commande.dateLivraison) + '"></div>' +
          '<div class="champ"><label for="mod-commentaire">Commentaire</label>' +
            '<textarea id="mod-commentaire" style="min-height:80px">' + e(commande.commentaire) + "</textarea></div>" +
          UI.champMontant({ id: "mod-montant", label: "Montant de la commande", valeur: commande.montant, obligatoire: true,
            aide: "Déjà payé : " + Utils.fmtMontant(Store.totalPaye(commande), r.devise) + "." }) +
          '<button type="submit" class="btn btn-bloc" style="margin-top:4px">' + UI.icone("check", "ic-sm") + "Enregistrer</button>" +
        "</div>" +
      "</form>";

    UI.$("#form-modif").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const montant = Utils.lireNombre(UI.$("#mod-montant").value);
      if (montant <= 0) {
        UI.toast("Indiquez le montant de la commande", "erreur");
        return;
      }
      if (montant < Store.totalPaye(commande)) {
        UI.toast("Le montant ne peut pas être inférieur au total déjà payé", "erreur");
        return;
      }
      try {
        await Store.sauverCommande({
          id, clientId: commande.clientId,
          description: UI.$("#mod-desc").value,
          commentaire: UI.$("#mod-commentaire").value,
          dateLivraison: UI.$("#mod-livraison").value || commande.dateLivraison,
          montant, statut: commande.statut,
        });
        UI.toast("Commande mise à jour", "ok");
        location.hash = "#/commande/" + id;
      } catch (err) {
        UI.toast(err.message || "Enregistrement impossible", "erreur");
      }
    });
  }

  return { liste, nouvelle, detail, modifier };
})();
