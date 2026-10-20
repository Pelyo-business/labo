/* Console Pelyo — porte d'entrée.
   Sans connexion : la démo (demo.js, tout est fictif). Connecté avec le
   compte fondateur : les vrais comptes, lus dans la base par
   console_fondateur() (lecture seule), rafraîchis toutes les 30 secondes.
   La boîte mail, les avis Google Business Profile et l'assistant sont réels
   dès que leurs migrations et fonctions sont déployées. */
(function () {
  "use strict";
  /* Adresse et clé PUBLIQUE de la base de développement (même valeur que
     maquette/src/pelyo-config.js). La clé publique n'ouvre que ce que les
     règles de la base autorisent : ici, rien sans compte fondateur. */
  var CONFIG = window.PELYO_CONFIG && window.PELYO_CONFIG.supabaseUrl ? window.PELYO_CONFIG : {
    supabaseUrl: "https://nusevswiifovftwojwgi.supabase.co",
    supabaseCle: "sb_publishable_kdnLi023Qu5aaJvX-oEx6g_yYTwkoSx"
  };
  var CODES = { payg: "payg", basic: "basic", pro: "pro", business: "biz", big_business: "big" };
  var NIVEAUX = { normal: "Normal", rush: "Rush", charge: "Très chargé", stop: "Pause" };
  var cleParis = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });
  var heureParis = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
  var client = null;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };

  function charger(src, cb) {
    var s = document.createElement("script");
    s.src = src; s.onload = cb; s.onerror = function () { cb(new Error("chargement")); };
    document.body.appendChild(s);
  }
  function lancerConsole() { charger("console.js?v=17", function () {}); }

  /* ----------------------------- porte ----------------------------- */
  function porte(message) {
    var p = $("porte");
    p.hidden = false;
    p.innerHTML =
      '<form class="c-porte-carte" id="porte-form">' +
        '<img src="logo.png" alt="" width="44" height="44"><h1>Console Pelyo</h1>' +
        '<p>Connecte-toi avec ton compte fondateur pour voir les vrais comptes.</p>' +
        (message ? '<p class="c-porte-msg" role="alert">' + esc(message) + '</p>' : '') +
        '<label>E-mail<input type="email" id="porte-email" autocomplete="username" required></label>' +
        '<label>Mot de passe<input type="password" id="porte-mdp" autocomplete="current-password" required></label>' +
        '<button type="submit" id="porte-ok">Se connecter</button>' +
        '<button type="button" class="c-porte-demo" id="porte-demo">Voir la démo</button>' +
      '</form>';
    $("porte-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!client) return porte("Connexion impossible : la base n’est pas joignable.");
      $("porte-ok").disabled = true; $("porte-ok").textContent = "Connexion…";
      client.auth.signInWithPassword({ email: $("porte-email").value.trim(), password: $("porte-mdp").value }).then(function (r) {
        if (r.error) return porte("E-mail ou mot de passe incorrect.");
        entrer();
      }, function () { porte("Connexion impossible pour le moment."); });
    });
    $("porte-demo").addEventListener("click", function () {
      try { sessionStorage.setItem("pelyo:console:demo", "1"); } catch (e) {}
      p.hidden = true; lancerConsole();
    });
  }

  /* -------------------- base → modèle de la console -------------------- */
  function versConsole(x) {
    var etats = {};
    var comptes = (x.comptes || []).map(function (r) {
      var jours = {}, sept = 0, d = new Date();
      Object.keys(r.jours || {}).forEach(function (k) { jours[k] = (+r.jours[k] || 0) / 60; });
      for (var i = 1; i <= 7; i++) sept += jours[cleParis.format(new Date(d.getTime() - i * 864e5))] || 0;
      var cree = new Date(r.cree), statut = r.abo_statut === "impaye" || r.abo_statut === "suspendu" ? "impaye" : r.abo_statut === "actif" ? "actif" : "essai";
      var alerte = null;
      if (r.numero_statut === "erreur") alerte = "Numéro Pelyo : l’achat automatique a échoué" + (r.numero_erreur ? " (" + r.numero_erreur + ")" : "") + ".";
      else if (r.charge === "stop") alerte = "Service en pause : les appels ne prennent plus de commandes.";
      else if (!r.appareils) alerte = "Aucune tablette cuisine reliée : les commandes ne s’affichent nulle part.";
      else if (statut === "impaye") alerte = "Paiement de l’abonnement en échec.";
      else if (!r.forfait) alerte = "Pas encore d’abonnement.";
      etats[r.id] = {
        service: r.charge === "stop" ? "Pause" + (r.reprise ? " · reprise " + heureParis.format(new Date(r.reprise)).replace(":", " h ") : "") : (NIVEAUX[r.charge] || "Normal") + " · " + (r.delai || 15) + " min",
        ouvert: r.charge !== "stop", commandes: r.commandes_jour || 0, ca: r.ca_jour || 0,
        ruptures: r.ruptures || [], appareils: r.appareils || 0, alerte: alerte,
        numero: r.numero || null, numeroStatut: r.numero_statut || "aucun"
      };
      return {
        id: r.id, code: String(r.nom || "?").normalize("NFD").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 5) || "PELYO",
        nom: r.nom, ville: r.ville || "—", forfait: CODES[r.forfait] || "payg", statut: statut,
        depuis: ("0" + cree.getDate()).slice(-2) + "/" + ("0" + (cree.getMonth() + 1)).slice(-2),
        debut: cleParis.format(cree), commercial: r.commercial || null,
        parJour: Math.round(sept / 7 * 10) / 10, jours: jours, enCours: r.en_cours || 0
      };
    });
    return {
      comptes: comptes, etats: etats,
      appels: (x.appels || []).map(function (a) {
        return { id: a.id, compte: a.restaurant, heure: heureParis.format(new Date(a.at)), duree: a.duree || 0,
          issue: a.issue === "commande" ? "Commande" : a.issue === "transfert" ? "Transfert" : a.issue === "en_cours" ? "En cours" : "Question",
          montant: a.montant || 0 };
      })
    };
  }
  /* Boîte mail réelle (table « mails », remplie par le serveur courriel). */
  var jourParis = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short" });
  function lireMails(cb) {
    Promise.all([
      client.from("mails").select("id,recu_at,de_nom,de_adresse,sujet,texte,categorie,urgence,resume,action,brouillon,restaurant_id,traite_at")
        .neq("categorie", "pub").order("recu_at", { ascending: false }).limit(200),
      client.from("mails").select("id", { count: "exact", head: true }).eq("categorie", "pub")
    ]).then(function (r) {
      if (r[0].error) return cb(r[0].error.message);
      var ajd = cleParis.format(new Date());
      cb(null, {
        masques: r[1].count || 0,
        mails: (r[0].data || []).map(function (m) {
          var d = new Date(m.recu_at);
          return { id: m.id, de: m.de_nom || m.de_adresse, adresse: m.de_adresse, sujet: m.sujet || "(sans objet)",
            heure: cleParis.format(d) === ajd ? heureParis.format(d) : jourParis.format(d), cat: m.categorie, urgence: m.urgence,
            compte: m.restaurant_id, texte: m.texte || "", resume: m.resume || "", action: m.action || "", brouillon: m.brouillon || "",
            traite: !!m.traite_at };
        })
      });
    }, function () { cb("Base injoignable."); });
  }
  function traiter(id, oui, cb) {
    client.from("mails").update({ traite_at: oui ? new Date().toISOString() : null }).eq("id", id)
      .then(function (r) { cb(r.error ? r.error.message : null); }, function () { cb("Base injoignable."); });
  }
  function depuis(date) {
    var d = new Date(date), jours = Math.max(0, Math.floor((Date.now() - d.getTime()) / 864e5));
    if (jours === 0) return "Aujourd’hui";
    if (jours === 1) return "Hier";
    if (jours < 30) return "Il y a " + jours + " j";
    return jourParis.format(d);
  }
  function lireAvis(cb) {
    Promise.all([
      client.from("avis_google")
        .select("id,fiche,auteur,auteur_photo_url,note,texte,ton,publie_at,reponse_google,reponse_url,reponse_proposee,premier_scan_at,vu_at")
        .order("publie_at", { ascending: false }).limit(200),
      client.from("avis_google_scans").select("termine_at,statut,avis_lus,erreur")
        .order("commence_at", { ascending: false }).limit(1).maybeSingle()
    ]).then(function (r) {
      if (r[0].error) return cb(r[0].error.message);
      var scan = r[1].data || null;
      cb(null, {
        scan: "07:00", sources: 1,
        derniereAnalyse: scan && scan.termine_at ? depuis(scan.termine_at) + " à " + heureParis.format(new Date(scan.termine_at)) : null,
        erreur: scan && scan.statut === "echec" ? scan.erreur || "Le dernier scan a échoué." : null,
        liste: (r[0].data || []).map(function (a) {
          return {
            id: a.id, source: "Google", ou: a.fiche, note: a.note, auteur: a.auteur,
            photo: a.auteur_photo_url, quand: depuis(a.publie_at), nouveau: !a.vu_at,
            ton: a.ton, texte: a.texte || "Avis sans commentaire.", reponse: a.reponse_proposee || "",
            reponseGoogle: a.reponse_google || "", lien: a.reponse_url || ""
          };
        })
      });
    }, function () { cb("Base injoignable."); });
  }
  /* Plantages des applis (table erreurs_appli, 7 derniers jours, non vus). */
  function lireErreurs(cb) {
    client.rpc("erreurs_recentes").then(function (r) { cb(r.error ? r.error.message : null, r.data || []); }, function () { cb("Base injoignable."); });
  }
  function erreurVue(id, cb) {
    client.rpc("marquer_erreur_vue", { p_id: id }).then(function (r) { cb(r.error ? r.error.message : null); }, function () { cb("Base injoignable."); });
  }
  function relancerNumero(id, cb) {
    client.rpc("relancer_numero", { p_restaurant: id }).then(function (r) { cb(r.error ? r.error.message : null); }, function () { cb("Base injoignable."); });
  }
  function voirAvis(id, oui, cb) {
    client.from("avis_google").update({ vu_at: oui ? new Date().toISOString() : null }).eq("id", id)
      .then(function (r) { cb(r.error ? r.error.message : null); }, function () { cb("Base injoignable."); });
  }
  function assistant(corps, cb) {
    client.functions.invoke("console-assistant", { body: corps }).then(function (r) {
      if (r.error) return cb(r.error.message || "Assistant indisponible.");
      if (r.data && r.data.erreur) return cb(r.data.erreur);
      cb(null, r.data || {});
    }, function () { cb("Assistant indisponible."); });
  }
  function lire(cb) {
    client.rpc("console_fondateur").then(function (r) {
      if (r.error) return cb(r.error.message || "Erreur");
      cb(null, r.data || {});
    }, function () { cb("Base injoignable."); });
  }
  /* Relecture pour la console déjà affichée : nouveaux chiffres, même forme. */
  function relire(cb) {
    lire(function (e, x) {
      if (e) return cb(e);
      var r = versConsole(x);
      var attente = 3;
      function fini() { if (--attente === 0) cb(null, r); }
      lireMails(function (em, b) { if (!em) r.boite = b; fini(); });
      lireAvis(function (ea, a) { if (!ea) r.avis = a; fini(); });
      lireErreurs(function (ee, l) { if (!ee) r.erreurs = l; fini(); });
    });
  }
  function entrer() {
    lire(function (e, x) {
      if (e) {
        if (/fondateur/i.test(e)) { client.auth.signOut(); return porte("Ce compte n’est pas un compte fondateur."); }
        return porte("Lecture impossible : " + e);
      }
      var r = versConsole(x);
      var D = window.DEMO;
      D.comptes = r.comptes; D.etats = r.etats;
      /* Les suggestions de l'assistant gardent seulement leur texte. */
      (D.ia || []).forEach(function (q) { q.action = null; });
      var attente = 3;
      function finir() {
        if (--attente) return;
        window.PELYO_REEL = {
          appels: r.appels, relire: relire, traiter: traiter, voirAvis: voirAvis, assistant: assistant, relancerNumero: relancerNumero, erreurVue: erreurVue,
          deconnecter: function () { client.auth.signOut().then(function () { location.reload(); }); }
        };
        $("porte").hidden = true;
        lancerConsole();
      }
      lireMails(function (em, b) {
        if (!em) { D.mails = b.mails; D.mailsMasques = b.masques; D.mailsReels = true; }
        else (D.mails || []).forEach(function (m) { m.compte = null; });
        finir();
      });
      lireErreurs(function (ee, l) { D.erreurs = ee ? [] : l; finir(); });
      lireAvis(function (ea, a) {
        if (!ea) { D.avis = a; D.avisReels = true; }
        else ((D.avis && D.avis.liste) || []).forEach(function (avis) { avis.compte = null; });
        finir();
      });
    });
  }

  /* ----------------------------- départ ----------------------------- */
  var demo = false;
  try { demo = sessionStorage.getItem("pelyo:console:demo") === "1" || /(^|[#&?])demo\b/.test(location.hash + location.search); } catch (e) {}
  if (window.supabase && CONFIG.supabaseUrl) {
    client = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseCle, { auth: { storageKey: "pelyo-console" } });
  }
  if (demo || !client) { lancerConsole(); return; }
  client.auth.getSession().then(function (r) {
    if (r.data && r.data.session) entrer(); else porte();
  }, function () { porte(); });
})();
