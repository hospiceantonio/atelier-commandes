/* =========================================================
   Vues Clients — liste, fiche (mesures + historique), formulaire.
   ========================================================= */
const VueClients = (() => {
  const e = Utils.echapper;

  /* ---------- Liste ---------- */

  async function liste(vue) {
    const clients = await Store.listerClients();
    const commandes = await Store.listerCommandes();
    const nbParClient = {};
    for (const c of commandes) nbParClient[c.clientId] = (nbParClient[c.clientId] || 0) + 1;

    UI.entete({
      titre: "Clients",
      sous: clients.length + " client" + (clients.length > 1 ? "s" : "") + " enregistré" + (clients.length > 1 ? "s" : ""),
      actions: '<a class="btn-ic" href="#/client/nouveau" aria-label="Nouveau client">' + UI.icone("plus") + "</a>",
    });

    vue.innerHTML =
      '<div class="recherche">' + UI.icone("recherche") +
        '<input id="q-clients" type="search" placeholder="Nom ou téléphone…" autocomplete="off">' +
      "</div>" +
      '<div class="liste" id="liste-clients"></div>';

    const zone = UI.$("#liste-clients");

    function rendre(terme) {
      const visibles = Store.chercherClients(clients, terme || "");
      if (!visibles.length) {
        zone.innerHTML = UI.vide(
          "clients",
          terme ? "Aucun client trouvé" : "Aucun client",
          terme ? "Essayez une autre orthographe." : "Le nom, le téléphone et les mesures ne se saisissent qu'une fois.",
          terme ? "" : '<a class="btn" href="#/client/nouveau">' + UI.icone("plus", "ic-sm") + "Ajouter un client</a>"
        );
        return;
      }
      zone.innerHTML = visibles.map((c) => {
        const nb = nbParClient[c.id] || 0;
        const nbMes = Mesures.nombre(c.mesures);
        return (
          '<button type="button" class="ligne" data-nav="#/client/' + c.id + '">' +
            UI.pastilleClient(c) +
            '<span class="ligne-corps">' +
              '<span class="ligne-titre entier">' + e(Utils.nomComplet(c)) + "</span>" +
              '<span class="ligne-sous">' +
                (Utils.telAppel(c)
                  ? "<span>" + UI.icone("tel", "ic-sm") + " " + e(Utils.fmtTel(Utils.telAppel(c))) + "</span>"
                  : "<span>Sans téléphone</span>") +
              "</span>" +
            "</span>" +
            '<span class="ligne-fin">' +
              '<span class="badge badge-neutre">' + nb + " cde" + (nb > 1 ? "s" : "") + "</span>" +
              '<span style="font-size:11.5px;color:var(--encre-tres-douce)">' +
                (nbMes ? nbMes + " mesures" : "mesures à prendre") +
              "</span>" +
            "</span>" +
          "</button>"
        );
      }).join("");
    }

    rendre("");
    UI.$("#q-clients").addEventListener("input", Utils.tempo((ev) => rendre(ev.target.value), 160));
  }

  /* ---------- Fiche client ---------- */

  async function fiche(vue, id) {
    const client = await Store.lireClient(id);
    if (!client) {
      location.hash = "#/clients";
      return;
    }
    const r = Store.lireReglages();
    const telAppel = Utils.telAppel(client);
    const telWa = Utils.telWhatsApp(client);
    const commandes = (await Store.commandesDuClient(id)).sort((a, b) => b.creeLe - a.creeLe);
    const ouvertes = commandes.filter((c) => c.statut !== "livree");
    const totalSolde = ouvertes.reduce((somme, c) => somme + Store.soldeRestant(c), 0);

    UI.entete({
      titre: Utils.nomComplet(client),
      sous: !telAppel && !telWa
        ? "Sans téléphone"
        : (telAppel === telWa
          ? Utils.fmtTel(telAppel)
          : "Appel " + Utils.fmtTel(telAppel) + " · WhatsApp " + Utils.fmtTel(telWa)),
      retour: true,
      actions: Api.estAdmin()
        ? '<a class="btn-ic" href="#/client/' + id + '/modifier" aria-label="Modifier">' + UI.icone("crayon") + "</a>"
        : "",
    });

    let html = "";

    if (telAppel || telWa) {
      html +=
        '<div class="btn-rangee">' +
          (telWa
            ? '<a class="btn btn-wa" href="' + e(Utils.lienWhatsApp(telWa, "", r.indicatif)) + '" target="_blank" rel="noopener">' +
              UI.icone("whatsapp", "ic-sm") + "WhatsApp</a>"
            : "") +
          (telAppel
            ? '<a class="btn btn-clair" href="' + e(Utils.lienTel(telAppel, r.indicatif)) + '">' +
              UI.icone("tel", "ic-sm") + "Appeler</a>"
            : "") +
        "</div>";
    }

    if (totalSolde > 0) {
      html +=
        '<div class="alerte">' + UI.icone("argent") +
        "<div>Ce client doit encore <strong>" + Utils.fmtMontant(totalSolde, r.devise) + "</strong> sur " +
        ouvertes.length + " commande" + (ouvertes.length > 1 ? "s" : "") + " en cours.</div></div>";
    }

    html +=
      '<div class="carte">' +
        '<div class="carte-titre">' + UI.icone("mesure", "ic-sm") + "Mesures (gardées pour chaque commande)" +
          '<a class="lien" href="#/client/' + id + '/modifier">Modifier</a>' +
        "</div>" +
        UI.lectureMesures(client.mesures) +
      "</div>";

    if (client.note) {
      html +=
        '<div class="carte"><div class="carte-titre">Note</div>' +
        '<p style="margin:0;font-size:14px;line-height:1.5;white-space:pre-wrap">' + e(client.note) + "</p></div>";
    }

    html +=
      '<div class="section-titre">' + UI.icone("commandes", "ic-sm") + "Commandes (" + commandes.length + ")" +
        '<a class="lien" href="#/commande/nouvelle?client=' + id + '">+ Nouvelle</a>' +
      "</div>";
    html += commandes.length
      ? '<div class="liste">' +
        commandes.map((c) => UI.ligneCommande(c, client, { titre: c.description || c.numero })).join("") +
        "</div>"
      : UI.vide("commandes", "Pas encore de commande",
          "Ses mesures sont prêtes : créez sa première commande.",
          '<a class="btn" href="#/commande/nouvelle?client=' + id + '">' + UI.icone("plus", "ic-sm") + "Créer une commande</a>");

    html +=
      '<div style="margin-top:20px"><button type="button" class="btn btn-danger btn-bloc" id="suppr-client">' +
        UI.icone("poubelle", "ic-sm") + "Supprimer ce client</button></div>" +
      '<p class="pied-note">Client depuis le ' + Utils.fmtDate(Utils.isoJour(new Date(client.creeLe))) + "</p>";

    vue.innerHTML = html;

    UI.$("#suppr-client").onclick = async () => {
      const ok = await UI.confirmer({
        titre: "Supprimer le client",
        texte: "Supprimer " + Utils.nomComplet(client) + " effacera aussi ses " + commandes.length +
          " commande" + (commandes.length > 1 ? "s" : "") + " et leurs photos. Cette action est définitive.",
        bouton: "Supprimer",
        danger: true,
      });
      if (!ok) return;
      await Store.supprimerClient(id);
      UI.toast("Client supprimé", "ok");
      location.hash = "#/clients";
    };
  }

  /* ---------- Formulaire (création / modification) ---------- */

  async function formulaire(vue, id) {
    const client = id ? await Store.lireClient(id) : null;
    if (id && !client) {
      location.hash = "#/clients";
      return;
    }

    UI.entete({
      titre: client ? "Modifier le client" : "Nouveau client",
      sous: client ? Utils.nomComplet(client) : "Nom, téléphone et mesures : une seule fois",
      retour: true,
    });

    vue.innerHTML =
      '<form id="form-client" novalidate>' +
        '<div class="carte">' +
          '<div class="carte-titre">' + UI.icone("clients", "ic-sm") + "Identité</div>" +
          '<div class="champ-duo">' +
            '<div class="champ"><label for="cli-prenom">Prénom <span class="obligatoire">*</span></label>' +
              '<input id="cli-prenom" autocomplete="off" autocapitalize="words" value="' + e(client ? client.prenom : "") + '"></div>' +
            '<div class="champ"><label for="cli-nom">Nom</label>' +
              '<input id="cli-nom" autocomplete="off" autocapitalize="words" value="' + e(client ? client.nom : "") + '"></div>' +
          "</div>" +
          '<div class="champ"><label for="cli-tel">Téléphone (appels)</label>' +
            '<input id="cli-tel" type="tel" inputmode="tel" autocomplete="off" placeholder="97 00 00 00" value="' + e(client ? client.tel : "") + '">' +
            '<div class="aide">Le numéro à composer pour joindre le client.</div></div>' +
          '<div class="champ"><label for="cli-tel-wa">Numéro WhatsApp</label>' +
            '<input id="cli-tel-wa" type="tel" inputmode="tel" autocomplete="off" placeholder="97 00 00 00" value="' + e(client ? client.telWhatsApp || "" : "") + '">' +
            "<div class=\"aide\">À remplir seulement s'il est différent du numéro d'appel.</div></div>" +
          '<div class="champ"><label for="cli-note">Note (habitudes, préférences…)</label>' +
            '<textarea id="cli-note">' + e(client ? client.note : "") + "</textarea></div>" +
        "</div>" +
        '<div class="section-titre">' + UI.icone("mesure", "ic-sm") + "Mesures (en cm)</div>" +
        '<p style="margin:-4px 0 10px;font-size:12.5px;color:var(--encre-tres-douce)">' +
          "Remplissez seulement les mesures utiles : elles resteront enregistrées pour toutes les prochaines commandes.</p>" +
        UI.grilleMesures(client && client.mesures) +
        '<div style="margin-top:16px"><button type="submit" class="btn btn-bloc">' +
          UI.icone("check", "ic-sm") + (client ? "Enregistrer les modifications" : "Enregistrer le client") + "</button></div>" +
      "</form>";

    UI.$("#form-client").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const prenom = UI.$("#cli-prenom").value.trim();
      const nom = UI.$("#cli-nom").value.trim();
      if (!prenom && !nom) {
        UI.toast("Indiquez au moins le prénom ou le nom", "erreur");
        UI.$("#cli-prenom").focus();
        return;
      }
      try {
        const enregistre = await Store.sauverClient({
          id: id || undefined,
          prenom, nom,
          tel: UI.$("#cli-tel").value,
          telWhatsApp: UI.$("#cli-tel-wa").value,
          note: UI.$("#cli-note").value,
          mesures: UI.lireGrilleMesures(vue),
        });
        UI.toast(client ? "Client mis à jour" : "Client enregistré", "ok");
        location.hash = "#/client/" + enregistre.id;
      } catch (err) {
        UI.toast(err.message || "Enregistrement impossible", "erreur");
      }
    });
  }

  return { liste, fiche, formulaire };
})();
