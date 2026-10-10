/* =========================================================================
   Resto IA — runtime.
   Il fait quatre choses, et rien de plus : afficher l'écran de connexion
   (compte démo, vrai compte, tablette cuisine), afficher la liste des
   postes, ouvrir une application dans une scène vide, ranger ses minuteurs
   à la fermeture. Les comptes et la base : voir pelyo-donnees.js.

   Le runtime n'impose aucun chrome applicatif — pas de barre de titre, pas
   de barre d'onglets, pas de barre d'action communes. Chaque application
   dessine la totalité de son écran et charge sa propre feuille de style.
   C'est ce qui permet à la cuisine, au gérant et au commercial de ne
   partager aucun composant.

   Pas de maquette de téléphone à mettre à l'échelle : chaque écran remplit
   l'espace réel qu'on lui donne (voir base.css), donc pas de logique de
   redimensionnement ici non plus.
   ========================================================================= */
var RIA = (function(){
  "use strict";

  /* Le `?v=` de ce script lui-même (posé par outils/construire.sh, ou à la
     main en local — voir CONTRIBUER.md) sert aussi aux feuilles de style
     chargées dynamiquement par charger() : sans ça, elles échappaient au
     cache-buster et un navigateur pouvait en garder une version périmée
     indéfiniment. */
  var VERSION = (function(){
    var s = document.currentScript;
    var m = s && /[?&]v=([^&]+)/.exec(s.src);
    return m ? m[1] : "";
  })();

  var $ = function(i){ return document.getElementById(i); };
  var esc = function(s){ return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); };
  var eur = function(c){ return (c/100).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}) + " €"; };
  var eur0 = function(c){ return Math.round(c/100).toLocaleString('fr-FR') + " €"; };
  var dur = function(s){ return s < 60 ? s + " s" : Math.floor(s/60) + " min " + String(s%60).padStart(2,"0"); };
  var chrono = function(s){ return String(Math.floor(s/60)).padStart(2,"0") + ":" + String(Math.floor(s)%60).padStart(2,"0"); };
  var norm = function(s){ return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,""); };
  var vibrer = function(ms){ try { if (navigator.vibrate) navigator.vibrate(ms || 8); } catch(e){} };
  var reduit = function(){ return window.matchMedia('(prefers-reduced-motion: reduce)').matches; };

  var APPS = [], courante = null, timers = [], toastT = null;

  function register(a){ APPS.push(a); }
  function every(fn, ms){ var id = setInterval(fn, ms); timers.push(id); return id; }
  function after(fn, ms){ var id = setTimeout(fn, ms); timers.push(id); return id; }
  function clearTimers(){
    for (var i = 0; i < timers.length; i++){ clearInterval(timers[i]); clearTimeout(timers[i]); }
    timers = [];
  }

  /* ------------------------------ horloge ------------------------------ */
  /* Utilisée par les applications elles-mêmes (chacune affiche et met à
     jour sa propre horloge) — il n'y a plus d'horloge système partagée. */
  function heure(){
    var d = new Date();
    return String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0");
  }

  /* ----------------------- connexion / compte démo ----------------------- */
  /* Deux chemins : le compte démo (données fictives, rien ne sort du
     téléphone) et la vraie connexion, qui passe par PelyoDonnees. Tout ce
     qui touche aux comptes et à la base vit dans pelyo-donnees.js. */
  /* Appli séparée (cuisine.html, gerant.html) : un seul poste. index.html
     garde l'accueil complet avec la liste des postes. */
  var POSTE = window.PELYO_POSTE || null;
  /* demo.html : appli à part, restaurant fictif, jamais de connexion. */
  var DEMO = !!window.PELYO_DEMO;
  /* Appli gérant : le compte est redemandé à chaque ouverture (Face ID
     remplit l'e-mail et le mot de passe au toucher du champ). */
  var CONNEXION_A_CHAQUE_OUVERTURE = POSTE === "gerant" && !DEMO;
  /* « Compte démo » d'une appli séparée : ouvre son appli Labo à part. */
  var DEMO_A_PART = DEMO ? null : { gerant:"demo.html", cuisine:"demo-cuisine.html" }[POSTE] || null;
  var NOM_POSTE = { cuisine:"Cuisine", gerant:"Gérant" }[POSTE] || "";

  /* Vrai compte ouvert : la démo y ramène au lieu de déconnecter. */
  var sessionReelle = false;
  var oubliEnCours = false, apresOubli = null;
  var etapeAccueil = "connexion"; /* connexion | inscription | oubli | nouveau-mdp | tablette | attente | restaurant | choix | reel | confirme */

  /* Lien reçu par e-mail : Supabase revient sur la page avec
     #…&type=signup (confirmation), #…&type=recovery (mot de passe oublié),
     ou #error_code=otp_expired si le lien a expiré. On le lit ici, au
     chargement du script, avant que supabase-js ne nettoie l'adresse. */
  var retourEmail = (function(){
    var adresse = (window.location.hash || "") + "&" + (window.location.search || "");
    if (/error_code=otp_expired|error=access_denied/.test(adresse)) return "expire";
    if (/type=recovery/.test(adresse)) return "recuperation";
    if (/type=signup/.test(adresse)) return "confirme";
    return null;
  })();
  var arretAttente = null;
  var BRAND = '<div class="hbrand">' +
      '<img class="hlogo" src="assets/logo-pelyo.png" alt="Pelyo" width="112" height="112">' +
      '<span>' + (POSTE ? 'Pelyo ' + NOM_POSTE : 'Prise de commande par IA') + env() + '</span>' +
    '</div>';

  /* Champ mot de passe avec un œil pour vérifier ce qu'on a tapé. */
  var OEIL = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path class="hoeil-barre" d="M4 4l16 16"/></svg>';
  function champMdp(nom, texte, auto){
    return '<div class="hmdp"><input class="hchamp" type="password" name="' + nom + '" placeholder="' + texte + '" autocomplete="' + auto + '"' + (auto === "new-password" ? ' minlength="8"' : '') + ' required>' +
      '<button class="hoeil" type="button" data-oeil aria-label="Afficher le mot de passe" aria-pressed="false">' + OEIL + '</button></div>';
  }
  /* Après l'envoi d'un lien, Supabase refuse d'en renvoyer un pendant
     60 secondes : le bouton l'indique au lieu d'afficher une erreur. */
  var finAttenteLien = 0, minuteurLien = null;
  function majAttenteLien(){
    var b = $("home").querySelector("[data-form=oubli] .hbtn");
    var reste = Math.ceil((finAttenteLien - Date.now()) / 1000);
    if (!b || reste <= 0){
      clearInterval(minuteurLien); minuteurLien = null;
      if (b){ b.disabled = false; b.textContent = "Renvoyer le lien"; }
      return;
    }
    b.disabled = true; b.textContent = "Renvoyer dans " + reste + " s";
  }

  function message(m, ok){ return m ? '<p class="hmsg' + (ok ? ' hmsg-ok' : '') + '" role="' + (ok ? 'status' : 'alert') + '">' + esc(m) + '</p>' : ''; }

  function peindreConnexion(m, ok){
    etapeAccueil = "connexion";
    $("home").innerHTML = BRAND +
      '<form class="hform" data-form="connexion" novalidate>' +
        '<input class="hchamp" type="email" name="email" placeholder="Adresse e-mail" autocomplete="email" readonly data-au-toucher required>' +
        champMdp("mdp", "Mot de passe", "current-password").replace(" required>", " readonly data-au-toucher required>") +
        message(m, ok) +
        '<button class="hbtn" type="submit">Se connecter</button>' +
        '<button class="hbtn2" type="button" data-inscription>Créer un compte</button>' +
        '<button class="hlien" type="button" data-oubli>Mot de passe oublié ?</button>' +
      '</form>' +
      (POSTE === "gerant" ? '' : '<button class="hlien" type="button" data-tablette>Relier une tablette cuisine</button>') +
      '<button class="hdemo" type="button" data-demo>Compte démo</button>';
  }

  function peindreInscription(m){
    etapeAccueil = "inscription";
    $("home").innerHTML = BRAND +
      '<form class="hform" data-form="inscription" novalidate>' +
        '<p class="hinfo">Compte gérant : vous pourrez ensuite créer votre restaurant et relier les tablettes de la cuisine.</p>' +
        '<input class="hchamp" type="text" name="prenom" placeholder="Prénom" autocomplete="given-name" maxlength="60" required>' +
        '<input class="hchamp" type="email" name="email" placeholder="Adresse e-mail" autocomplete="email" required>' +
        champMdp("mdp", "Mot de passe (8 caractères au moins)", "new-password") +
        message(m) +
        '<button class="hbtn" type="submit">Créer mon compte</button>' +
        '<button class="hbtn2" type="button" data-retour>J’ai déjà un compte</button>' +
      '</form>';
  }

  /* Mot de passe oublié : on n'indique jamais si l'adresse a un compte,
     pour ne pas révéler qui est inscrit. */
  function peindreOubli(m, ok){
    etapeAccueil = "oubli";
    $("home").innerHTML = BRAND +
      '<form class="hform" data-form="oubli" novalidate>' +
        '<p class="hinfo">Saisissez l’adresse de votre compte Pelyo : nous vous envoyons un lien pour choisir un nouveau mot de passe. Il reste valable une heure.</p>' +
        '<input class="hchamp" type="email" name="email" placeholder="Adresse e-mail" autocomplete="email" required>' +
        message(m, ok) +
        '<button class="hbtn" type="submit">Recevoir le lien</button>' +
        '<button class="hbtn2" type="button" data-retour>Retour à la connexion</button>' +
      '</form>';
    if (finAttenteLien > Date.now()){ majAttenteLien(); if (!minuteurLien) minuteurLien = setInterval(majAttenteLien, 1000); }
  }

  /* Arrivée du lien « mot de passe oublié » : la session de récupération est
     ouverte par supabase-js ; il ne reste qu'à choisir le nouveau mot de passe. */
  function peindreNouveauMdp(m){
    etapeAccueil = "nouveau-mdp";
    $("home").innerHTML = BRAND +
      '<form class="hform" data-form="nouveau-mdp" novalidate>' +
        '<p class="hinfo">Choisissez votre nouveau mot de passe (8 caractères au moins). Les autres appareils connectés à votre compte seront déconnectés.</p>' +
        champMdp("mdp", "Nouveau mot de passe", "new-password") +
        champMdp("mdp2", "Le même, encore une fois", "new-password") +
        message(m) +
        '<button class="hbtn" type="submit">Enregistrer</button>' +
      '</form>';
  }

  function peindreTablette(m){
    etapeAccueil = "tablette";
    $("home").innerHTML = BRAND +
      '<form class="hform" data-form="tablette" novalidate>' +
        '<p class="hinfo">Saisissez le code cuisine du restaurant. Le gérant le trouve dans Gérant → Le restaurant → Accès de l’équipe cuisine, et devra autoriser cet appareil.</p>' +
        '<input class="hchamp hcode" type="text" name="code" placeholder="Code cuisine (ex. K7PM-3XQA)" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="12" required>' +
        '<input class="hchamp" type="text" name="nom" placeholder="Nom de cet appareil" value="Tablette cuisine" maxlength="60" required>' +
        message(m) +
        '<button class="hbtn" type="submit">Relier cette tablette</button>' +
        '<button class="hbtn2" type="button" data-retour>Retour</button>' +
      '</form>';
  }

  function peindreAttente(appareil){
    etapeAccueil = "attente";
    $("home").innerHTML = BRAND +
      '<div class="hform">' +
        '<p class="hattente"><b>Demande envoyée à ' + esc(appareil.restaurant_nom || "votre restaurant") + '</b>' +
        'Le gérant doit autoriser « ' + esc(appareil.nom) + ' » dans Gérant → Le restaurant → Accès de l’équipe cuisine. La cuisine s’ouvrira toute seule.</p>' +
        '<button class="hbtn2" type="button" data-oublier-tablette>Annuler la demande</button>' +
      '</div>';
    if (arretAttente) arretAttente();
    arretAttente = PelyoDonnees.attendreDecision(appareil.id, function(statut){
      arretAttente = null;
      if (statut === "autorise") return reprendreSession();
      peindreTablette(statut === "refuse" ? "Le gérant a refusé cette tablette." : "Cette tablette n’a plus accès.");
    });
  }

  var COCHE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  /* Page d'arrivée du lien de confirmation. Le lien s'ouvre dans le
     navigateur du téléphone, pas dans l'appli installée : on explique quoi
     faire, et on laisse continuer ici. */
  function peindreConfirmation(){
    etapeAccueil = "confirme";
    $("home").innerHTML =
      '<div class="hconf">' +
        '<div class="hconf-logo"><img src="assets/logo-toque.png" alt="Pelyo" width="58" height="58"><span class="hconf-ok">' + COCHE + '</span></div>' +
        '<p class="hconf-kicker">C’est tout bon</p>' +
        '<h1 class="hconf-titre">Adresse confirmée<span data-prenom></span>.</h1>' +
        '<p class="hconf-texte">Votre compte Pelyo est prêt. Bienvenue en cuisine !</p>' +
        '<div class="hconf-carte">' +
          '<b>Pelyo est installé sur votre écran d’accueil ?</b>' +
          '<ol><li>Fermez cette page.</li><li>Ouvrez l’appli Pelyo.</li><li>Connectez-vous avec votre e-mail et votre mot de passe.</li></ol>' +
        '</div>' +
        '<button class="hbtn" type="button" data-continuer>Continuer ici</button>' +
        '<p class="hconf-note">Vous pouvez aussi utiliser Pelyo directement dans ce navigateur.</p>' +
      '</div>';
    PelyoDonnees.session(function(e, s){
      var prenom = s && s.user && s.user.user_metadata ? s.user.user_metadata.prenom : "";
      var zone = $("home").querySelector("[data-prenom]");
      if (prenom && zone) zone.textContent = ", " + prenom;
    });
  }

  function peindreLienExpire(){
    etapeAccueil = "confirme";
    $("home").innerHTML =
      '<div class="hconf">' +
        '<div class="hconf-logo"><img src="assets/logo-toque.png" alt="Pelyo" width="58" height="58"></div>' +
        '<p class="hconf-kicker">Lien expiré</p>' +
        '<h1 class="hconf-titre">Ce lien ne fonctionne plus.</h1>' +
        '<p class="hconf-texte">Il a déjà servi, ou il est trop ancien. Essayez de vous connecter : si votre adresse est déjà confirmée, tout marchera. Pour un mot de passe oublié, redemandez un lien.</p>' +
        '<button class="hbtn" type="button" data-retour>Aller à la connexion</button>' +
        '<button class="hlien" type="button" data-oubli>Redemander un lien de mot de passe</button>' +
      '</div>';
  }

  function peindreRestaurant(m){
    etapeAccueil = "restaurant";
    $("home").innerHTML = BRAND +
      '<form class="hform" data-form="restaurant" novalidate>' +
        '<p class="hinfo">Dernière étape : le nom de votre restaurant, tel que vos clients le connaissent.</p>' +
        '<input class="hchamp" type="text" name="nom" placeholder="Nom du restaurant" maxlength="120" required>' +
        message(m) +
        '<button class="hbtn" type="submit">Créer mon restaurant</button>' +
      '</form>' +
      '<button class="hdeco" type="button" data-deconnexion>Se déconnecter</button>';
  }

  function listePostes(ids){
    return APPS.filter(function(a){ return !ids || ids.indexOf(a.id) !== -1; }).map(function(a){
      return '<button class="hposte" data-app="' + a.id + '">' +
        '<span class="ic" style="background:' + a.fond + ';color:' + (a.encre || "#fff") + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + a.glyph + '</svg>' +
          (a.badge ? '<span class="bdg">' + esc(a.badge) + '</span>' : '') +
        '</span>' +
        '<span class="tx"><b>' + esc(a.nom) + '</b><small>Ouvrir</small></span>' +
      '</button>';
    }).join("");
  }

  function peindreChoix(){
    etapeAccueil = "choix";
    $("home").innerHTML =
      '<div class="hbrand hbrand-sm"><b>Pelyo' + (POSTE ? ' ' + NOM_POSTE : '') + '</b><span>Compte démo — ' + esc(D.resto.nom) + '</span></div>' +
      '<div class="hliste">' + listePostes(POSTE ? [POSTE] : null) + '</div>' +
      (DEMO ? '' : '<button class="hdeco" data-deconnexion-demo>' + (sessionReelle ? 'Revenir à mon compte' : 'Se déconnecter') + '</button>');
  }

  /* Compte réel : les postes dépendent du rôle. Le gérant ouvre aussi la
     cuisine de son restaurant ; une tablette n'ouvre que la cuisine. Le
     commercial ouvre ses zones de prospection. */
  function peindreChoixReel(ctx){
    etapeAccueil = "reel"; sessionReelle = true;
    var r = PelyoDonnees.restaurant();
    var ids = ctx.role === "cuisine" ? ["cuisine"] : ctx.role === "commercial" ? ["commercial"]
            : ctx.role === "fondateur" ? null : ["gerant", "cuisine"];
    /* Appli séparée : seulement son poste, s'il est permis à ce compte. */
    var permis = !POSTE || !ids || ids.indexOf(POSTE) !== -1;
    if (POSTE) ids = permis ? [POSTE] : [];
    $("home").innerHTML =
      '<div class="hbrand hbrand-sm"><b>Pelyo</b><span>' + esc(r ? r.nom : "Compte connecté") + '</span></div>' +
      '<div class="hliste">' + (ids.length ? listePostes(ids) : '<p class="hinfo">Ce compte n’a pas accès à Pelyo ' + esc(NOM_POSTE) + '.</p>') + '</div>' +
      '<button class="hdeco" data-deconnexion>' + (ctx.role === "cuisine" ? "Déconnecter cette tablette" : "Se déconnecter") + '</button>';
  }

  /* Session retrouvée (réouverture de l'appli, retour du lien de
     confirmation) ou juste ouverte : on demande à la base qui l'on est. */
  function reprendreSession(){
    PelyoDonnees.chargerContexte(function(e, ctx){
      if (e) return peindreConnexion(e);
      if (ctx.role === "cuisine"){
        var a = ctx.appareil;
        if (a && a.statut === "autorise"){
          PelyoDonnees.ouvrirRestaurant({ id:a.restaurant_id, nom:a.restaurant_nom, acces:"cuisine" });
          peindreChoixReel(ctx);
          return ouvrir("cuisine");
        }
        if (a && a.statut === "demande") return peindreAttente(a);
        return peindreTablette("Cette tablette n’a plus accès. Saisissez à nouveau le code du restaurant.");
      }
      if (!ctx.role) return peindreConnexion("Compte introuvable. Reconnectez-vous.");
      if (ctx.role === "commercial" || ctx.role === "fondateur") PelyoDonnees.ouvrirCommercial();
      if (ctx.restaurants.length) PelyoDonnees.ouvrirRestaurant(ctx.restaurants[0]);
      else if (ctx.role === "gerant") return peindreRestaurant();
      peindreChoixReel(ctx);
      /* Appli séparée : on entre directement dans le poste. */
      if (POSTE && etapeAccueil === "reel" && document.querySelector('[data-app="' + POSTE + '"]')) ouvrir(POSTE);
    });
  }

  function champs(form){
    var v = {};
    Array.prototype.forEach.call(form.elements, function(el){ if (el.name) v[el.name] = el.value.trim(); });
    return v;
  }

  function occupe(form, oui){
    Array.prototype.forEach.call(form.querySelectorAll("button"), function(b){ b.disabled = oui; });
  }

  function soumettre(form){
    var type = form.getAttribute("data-form"), v = champs(form);
    function fin(e, suite){ occupe(form, false); if (e) return rafraichir(e); suite(); }
    function rafraichir(e){
      if (type === "connexion") peindreConnexion(e);
      else if (type === "inscription") peindreInscription(e);
      else if (type === "tablette") peindreTablette(e);
      else if (type === "oubli") peindreOubli(e);
      else if (type === "nouveau-mdp") peindreNouveauMdp(e);
      else peindreRestaurant(e);
      /* Le formulaire est redessiné avec le message : on remet ce qui avait
         été saisi, sauf le mot de passe. */
      var f = $("home").querySelector("form");
      if (f) Array.prototype.forEach.call(f.elements, function(el){ if (el.name && el.type !== "password" && v[el.name]) el.value = v[el.name]; });
    }
    if (type === "connexion"){
      if (!v.email || !v.mdp) return rafraichir("Renseignez votre e-mail et votre mot de passe.");
      occupe(form, true);
      /* Ne pas se connecter avant que l'ancienne session soit oubliée :
         elle effacerait la nouvelle. */
      var seConnecter = function(){ PelyoDonnees.connexion(v.email, v.mdp, function(e){ fin(e, reprendreSession); }); };
      if (oubliEnCours) apresOubli = seConnecter; else seConnecter();
    } else if (type === "inscription"){
      if (!v.prenom || !v.email) return rafraichir("Renseignez votre prénom et votre e-mail.");
      if (v.mdp.length < 8) return rafraichir("Mot de passe trop court : 8 caractères au moins.");
      occupe(form, true);
      PelyoDonnees.inscription(v.email, v.mdp, v.prenom, function(e, res){
        fin(e, function(){
          if (res.aConfirmer) peindreConnexion("Compte créé. Ouvrez le lien reçu par e-mail pour le confirmer, puis connectez-vous.", true);
          else reprendreSession();
        });
      });
    } else if (type === "tablette"){
      if (!v.code) return rafraichir("Saisissez le code cuisine.");
      occupe(form, true);
      PelyoDonnees.relierTablette(v.code, v.nom || "Tablette cuisine", function(e){ fin(e, reprendreSession); });
    } else if (type === "oubli"){
      if (!v.email) return rafraichir("Renseignez votre adresse e-mail.");
      if (finAttenteLien > Date.now()) return;
      occupe(form, true);
      PelyoDonnees.motDePasseOublie(v.email, function(e){
        fin(e, function(){
          finAttenteLien = Date.now() + 60000;
          peindreOubli("Si un compte existe avec cette adresse, un e-mail vient de partir. Ouvrez le lien qu’il contient (pensez aux spams).", true);
          var champ = $("home").querySelector("[name=email]"); if (champ) champ.value = v.email;
        });
      });
    } else if (type === "nouveau-mdp"){
      if (v.mdp.length < 8) return rafraichir("Mot de passe trop court : 8 caractères au moins.");
      if (v.mdp !== v.mdp2) return rafraichir("Les deux mots de passe ne sont pas identiques.");
      occupe(form, true);
      PelyoDonnees.changerMotDePasse(v.mdp, function(e){
        fin(e, function(){
          if (window.history.replaceState) window.history.replaceState(null, "", window.location.pathname);
          toast("Mot de passe changé. Vous êtes connecté.");
          reprendreSession();
        });
      });
    } else if (type === "restaurant"){
      if (!v.nom) return rafraichir("Indiquez le nom du restaurant.");
      occupe(form, true);
      PelyoDonnees.creerRestaurant(v.nom, function(e){ fin(e, reprendreSession); });
    }
  }

  /* ----------------------- ouverture d'une application ----------------------- */
  var cssCharge = {};   /* id → true (chargée) ou liste des fonctions en attente */
  function charger(app, pret){
    if (!app.css || cssCharge[app.id] === true) return pret();
    if (cssCharge[app.id]) return cssCharge[app.id].push(pret);
    var attente = cssCharge[app.id] = [pret];
    var fin = function(){ cssCharge[app.id] = true; attente.forEach(function(f){ f(); }); };
    var l = document.createElement("link");
    l.rel = "stylesheet"; l.href = "src/" + app.css + (VERSION ? "?v=" + VERSION : "");
    l.onload = fin; l.onerror = fin;
    document.head.appendChild(l);
  }

  function ouvrir(id){
    var app = APPS.filter(function(a){ return a.id === id; })[0];
    if (!app || courante) return;
    vibrer(10);
    charger(app, function(){
      courante = app;
      document.documentElement.dataset.app = id;

      var scene = document.createElement("div");
      scene.className = "scene";
      scene.id = "scene";
      scene.dataset.app = id;
      $("glass").insertBefore(scene, $("homebar"));
      $("home").classList.add("away");

      try { app.demonter = app.monter(scene, api(app)) || null; }
      catch(e){
        console.error("[" + id + "]", e);
        scene.innerHTML = '<div style="padding:26px;color:#fff;font:14px/1.6 Inter,sans-serif">' +
          "Cette application n'a pas pu se charger.<br><span style=\"opacity:.6\">" + esc(e.message) + "</span></div>";
      }
    });
  }

  function fermer(){
    if (!courante) return;
    aideFermer();
    clearTimers();
    try { if (typeof courante.demonter === "function") courante.demonter(); } catch(e){ console.error(e); }
    courante.demonter = null;
    courante = null;
    delete document.documentElement.dataset.app;
    var s = $("scene");
    if (s) s.remove();
    $("home").classList.remove("away");
    vibrer(6);
  }

  /* --------------------------- toast système --------------------------- */
  function toast(msg, ms){
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("on");
    clearTimeout(toastT);
    toastT = setTimeout(function(){ t.classList.remove("on"); }, ms || 2600);
  }

  /* ------------------ ce qu'une application reçoit ------------------ */
  function api(app){
    return {
      data:D, esc:esc, eur:eur, eur0:eur0, dur:dur, chrono:chrono, norm:norm, heure:heure,
      toast:toast, fermer:fermer, vibrer:vibrer, reduit:reduit,
      every:every, after:after,
      badge:function(n){
        app.badge = n;
        var b = document.querySelector('[data-app="' + app.id + '"] .bdg');
        if (n && b) b.textContent = n;
        else if (n && !b){
          var ic = document.querySelector('[data-app="' + app.id + '"] .ic');
          if (ic) ic.insertAdjacentHTML("beforeend", '<span class="bdg">' + esc(n) + '</span>');
        } else if (!n && b) b.remove();
      },
      ouvrir:function(autre){ fermer(); setTimeout(function(){ ouvrir(autre); }, 260); }
    };
  }

  /* -------------------------- écran de chargement -------------------------- */
  /* Visible dès la première image (posé dans le HTML). Pendant ce temps,
     l'écran de connexion est dessiné derrière, les polices et la feuille de
     l'appli se chargent : quand il s'efface, tout est déjà prêt. */
  var DEBUT = Date.now(), DUREE_SPLASH = 2600;
  function splash(){
    var el = $("splash");
    if (!el) return;
    var etat = $("splash-etat"), etapes = POSTE === "gerant"
      ? ["Ouverture de votre restaurant…", "Chargement des chiffres du soir…", "Presque prêt…"]
      : ["Préparation de la cuisine…", "Chargement de la carte et des ruptures…", "Presque prêt…"];
    var i = 0, minuterie = setInterval(function(){ i++; if (etat && etapes[i]) etat.textContent = etapes[i]; }, 850);
    var app = APPS.filter(function(a){ return a.id === POSTE; })[0];
    var pretCss = false, pretPolices = false;
    if (app) charger(app, function(){ pretCss = true; finir(); }); else pretCss = true;
    var polices = document.fonts && document.fonts.ready ? document.fonts.ready : null;
    if (polices) polices.then(function(){ pretPolices = true; finir(); }, function(){ pretPolices = true; finir(); });
    else pretPolices = true;
    /* Filet de sécurité : jamais plus de 6 secondes, même hors connexion. */
    setTimeout(function(){ pretCss = pretPolices = true; finir(); }, 6000);
    setTimeout(finir, DUREE_SPLASH);
    var fini = false;
    function finir(){
      if (fini || !pretCss || !pretPolices || Date.now() - DEBUT < DUREE_SPLASH) return;
      fini = true;
      clearInterval(minuterie);
      if (etat) etat.textContent = "Prêt";
      el.classList.add("splash-fin");
      setTimeout(function(){ el.remove(); }, 650);
    }
  }

  /* ------------------------------ démarrage ------------------------------ */
  function boot(){
    /* Avec un compte déjà ouvert, ne pas dessiner le formulaire derrière
       l'écran de chargement : l'iPhone proposerait aussitôt le mot de passe
       enregistré (Face ID) alors que la session va être reprise. */
    var verifier = !DEMO && !CONNEXION_A_CHAQUE_OUVERTURE && window.PelyoDonnees && PelyoDonnees.disponible() && !retourEmail && window.location.hash !== '#cuisine';
    if (DEMO){
      if (window.PelyoDonnees) PelyoDonnees.modeDemo();
      peindreChoix();
    }
    else if (verifier) $("home").innerHTML = BRAND; else peindreConnexion();
    splash();
    if (DEMO) ouvrir(POSTE);
    /* Direct preview link; this opens demo data, never an authenticated account. */
    if (window.location.hash === '#cuisine') ouvrir('cuisine');
    else if (retourEmail === "confirme" && PelyoDonnees.disponible()) peindreConfirmation();
    else if (retourEmail === "recuperation" && PelyoDonnees.disponible()){
      /* supabase-js lit le lien et ouvre la session de récupération. */
      PelyoDonnees.session(function(e, s){
        if (s) return peindreNouveauMdp();
        if (window.history.replaceState) window.history.replaceState(null, "", window.location.pathname);
        peindreLienExpire();
      });
    }
    else if (retourEmail === "expire"){
      if (window.history.replaceState) window.history.replaceState(null, "", window.location.pathname);
      peindreLienExpire();
    }
    else if (verifier){
      PelyoDonnees.session(function(e, s){ if (s) reprendreSession(); else peindreConnexion(); });
    }
    else if (CONNEXION_A_CHAQUE_OUVERTURE && window.PelyoDonnees && PelyoDonnees.disponible()){
      /* Session restée sur ce téléphone : oubliée ici seulement (les autres
         appareils du compte restent connectés). */
      oubliEnCours = true;
      PelyoDonnees.oublierSessionLocale(function(){ oubliEnCours = false; if (apresOubli){ var f = apresOubli; apresOubli = null; f(); } });
    }

    function auToucher(ev){
      /* Tout le formulaire d'un coup : le trousseau de l'iPhone remplit
         l'e-mail et le mot de passe ensemble. */
      var c = ev.target, f = c && c.hasAttribute && c.hasAttribute("data-au-toucher") ? c.form : null;
      if (f) Array.prototype.forEach.call(f.querySelectorAll("[data-au-toucher]"), function(x){ x.removeAttribute("readonly"); x.removeAttribute("data-au-toucher"); });
    }
    $("home").addEventListener("pointerdown", auToucher);
    $("home").addEventListener("focusin", auToucher);
    $("home").addEventListener("submit", function(ev){
      ev.preventDefault();
      soumettre(ev.target);
    });
    $("home").addEventListener("click", function(ev){
      var b = ev.target.closest("button");
      /* Les boutons d'envoi d'un formulaire passent par « submit » ; les
         autres boutons (postes, liens) n'ont pas de formulaire. */
      if (!b || (b.type === "submit" && b.form)) return;
      if (b.dataset.oeil !== undefined){
        var champ = b.parentNode.querySelector("input"), voir = champ.type === "password";
        champ.type = voir ? "text" : "password";
        b.setAttribute("aria-pressed", String(voir));
        b.setAttribute("aria-label", voir ? "Masquer le mot de passe" : "Afficher le mot de passe");
        return;
      }
      if (b.dataset.inscription !== undefined) return peindreInscription();
      if (b.dataset.tablette !== undefined) return peindreTablette();
      if (b.dataset.oubli !== undefined) return peindreOubli();
      if (b.dataset.retour !== undefined) return peindreConnexion();
      if (b.dataset.continuer !== undefined) return reprendreSession();
      if (b.dataset.demo !== undefined){
        if (DEMO_A_PART){ window.location.href = DEMO_A_PART; return; }
        if (window.PelyoDonnees) PelyoDonnees.modeDemo();
        peindreChoix();
        if (POSTE) ouvrir(POSTE);
        return;
      }
      if (b.dataset.deconnexionDemo !== undefined){
        if (!sessionReelle) return peindreConnexion();
        $("home").innerHTML = BRAND;
        return reprendreSession();
      }
      if (b.dataset.deconnexion !== undefined || b.dataset.oublierTablette !== undefined){
        var tablette = etapeAccueil === "attente" || (PelyoDonnees.contexte() && PelyoDonnees.contexte().role === "cuisine");
        if (tablette && !window.confirm("Déconnecter cette tablette ? Il faudra une nouvelle autorisation du gérant.")) return;
        if (arretAttente){ arretAttente(); arretAttente = null; }
        PelyoDonnees.deconnexion(function(){ sessionReelle = false; peindreConnexion(); });
        return;
      }
      if (b.dataset.app) ouvrir(b.dataset.app);
    });
    $("homebar").addEventListener("click", fermer);
    document.addEventListener("keydown", function(ev){ if (ev.key === "Escape") fermer(); });
  }

  /* ---------------------------- centre d'aide ---------------------------- */
  /* Un panneau commun aux applications : la personne écrit, l'assistant
     Pelyo (fonction serveur « aide ») répond, propose des actions qu'elle
     confirme ici (exécutées avec ses propres droits, comme les boutons
     habituels) ou transmet à l'équipe. Fonctionne avec un compte réel. */
  var aideFil = [], aideConversation = null, aideEnvoi = false, aideResto = null;
  var AIDE_SUGGESTIONS = [
    "La tablette ne reçoit plus les commandes",
    "Je veux mettre le service en pause",
    "Une commande a un problème",
    "Un produit est en rupture"
  ];

  /* Texte simple ; un éventuel **gras** de l'assistant devient du gras. */
  function aideTexte(t){ return esc(t).replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>"); }

  function aideRendu(){
    var p = $("aide");
    if (!p) return;
    var reel = !!(window.PelyoDonnees && PelyoDonnees.reel());
    var fil = aideFil.map(function(m){
      if (m.qui === "moi") return '<div class="aide-bulle aide-moi">' + aideTexte(m.texte) + '</div>';
      if (m.qui === "erreur") return '<p class="aide-erreur">' + esc(m.texte) + '</p>';
      if (m.qui === "action"){
        var a = m.action, fini = a.statut && a.statut !== "proposee";
        return '<div class="aide-action' + (fini ? ' aide-fini' : '') + '"><b>' + esc(a.resume) + '</b>' +
          (fini ? '<span>' + esc(a.statut === "confirmee" ? "Fait" : a.statut === "refusee" ? "Annulé" : a.statut) + '</span>'
                : '<div><button data-aide-ok="' + esc(a.id) + '">Confirmer</button><button data-aide-non="' + esc(a.id) + '">Non merci</button></div>') +
        '</div>';
      }
      if (m.qui === "demande") return '<p class="aide-demande">Transmis à l’équipe Pelyo · réf. ' + esc(m.ref) + '</p>';
      return '<div class="aide-bulle aide-ia">' + aideTexte(m.texte) + '</div>';
    }).join("");
    var accueil = !aideFil.length ? '<div class="aide-accueil"><p>Bonjour ! Décrivez votre souci : je regarde l’état de votre restaurant et je vous aide à le régler. Je ne modifie rien sans votre accord.</p>' +
      (reel ? '<div class="aide-suggestions">' + AIDE_SUGGESTIONS.map(function(t){ return '<button data-aide-suggestion>' + esc(t) + '</button>'; }).join("") + '</div>'
            : '<p class="aide-note">Le centre d’aide répond avec un compte réel. En démonstration, écrivez à <b>bonjour@pelyo.eu</b>.</p>') + '</div>' : '';
    p.querySelector("[data-aide-fil]").innerHTML = accueil + fil + (aideEnvoi ? '<p class="aide-attente">L’assistant regarde…</p>' : '');
    var champ = p.querySelector("[data-aide-champ]"), bouton = p.querySelector("[data-aide-envoyer]");
    champ.disabled = !reel; bouton.disabled = !reel || aideEnvoi;
    var f = p.querySelector("[data-aide-fil]"); f.scrollTop = f.scrollHeight;
  }

  function aideEnvoyer(demande, texteAffiche){
    if (aideEnvoi) return;
    if (texteAffiche) aideFil.push({ qui:"moi", texte:texteAffiche });
    aideEnvoi = true; aideRendu();
    if (aideConversation) demande.conversation_id = aideConversation;
    PelyoDonnees.aide(demande, function(e, r){
      aideEnvoi = false;
      if (e){ aideFil.push({ qui:"erreur", texte:e }); return aideRendu(); }
      aideConversation = r.conversation_id;
      if (r.reponse) aideFil.push({ qui:"ia", texte:r.reponse });
      (r.actions || []).forEach(function(a){ aideFil.push({ qui:"action", action:a }); });
      if (r.demande) aideFil.push({ qui:"demande", ref:String(r.demande).slice(0, 8) });
      aideRendu();
    });
  }

  /* Exécute l'action confirmée avec les droits de la personne, puis donne
     le résultat à l'assistant. */
  function aideExecuter(a, cb){
    var p = a.params || {}, D_ = PelyoDonnees;
    function fin(e){ cb(e ? "Échec : " + e : "Fait"); }
    if (a.type === "rythme"){
      var r = {};
      ["charge", "delai_retrait_min", "delai_livraison_min", "retrait_ouvert", "livraison_ouverte"].forEach(function(k){ if (p[k] !== undefined) r[k] = p[k]; });
      return D_.reglerService(r, fin);
    }
    if (a.type === "tablette_retirer") return D_.revoquerAppareil(p.appareil_id, fin);
    if (a.type === "tablette_autoriser") return D_.deciderAppareil(p.appareil_id, true, fin);
    if (a.type === "code_cuisine") return D_.renouvelerCode(fin);
    if (a.type === "disponibilite") return D_.changerDisponibilite(p.element, p.element_id, p.disponible, p.jusqu_a || null, fin);
    fin("action inconnue");
  }

  function aideTrouver(id){
    for (var i = 0; i < aideFil.length; i++) if (aideFil[i].qui === "action" && aideFil[i].action.id === id) return aideFil[i].action;
    return null;
  }

  function aideFermer(){
    var p = $("aide");
    if (p) p.remove();
  }

  function ouvrirAide(){
    if ($("aide")) return;
    var r = window.PelyoDonnees && PelyoDonnees.restaurant();
    var id = r ? r.id : null;
    if (id !== aideResto){ aideFil = []; aideConversation = null; aideResto = id; }
    var p = document.createElement("section");
    p.id = "aide"; p.className = "aide";
    var scene = $("scene");
    if (scene && scene.querySelector(".k-dark,.g-dark,.m-dark")) p.classList.add("aide-sombre");
    p.setAttribute("role", "dialog"); p.setAttribute("aria-modal", "true"); p.setAttribute("aria-label", "Centre d’aide Pelyo");
    p.innerHTML =
      '<header class="aide-tete"><button data-aide-fermer>← Retour</button><div><b>Centre d’aide</b><span>Assistant Pelyo · ne modifie rien sans votre accord</span></div></header>' +
      '<div class="aide-fil" data-aide-fil aria-live="polite"></div>' +
      '<form class="aide-saisie" data-aide-form><textarea data-aide-champ rows="1" maxlength="1500" placeholder="Votre question…"></textarea>' +
      '<button data-aide-envoyer type="submit">Envoyer</button></form>';
    $("glass").appendChild(p);
    p.addEventListener("click", function(ev){
      var b = ev.target.closest && ev.target.closest("button");
      if (!b) return;
      if (b.hasAttribute("data-aide-fermer")){ aideFermer(); return; }
      if (b.hasAttribute("data-aide-suggestion")){ aideEnvoyer({ message:b.textContent }, b.textContent); return; }
      var ok = b.getAttribute("data-aide-ok"), non = b.getAttribute("data-aide-non");
      var a = aideTrouver(ok || non);
      if (!a || a.statut || aideEnvoi) return;
      if (non){ a.statut = "refusee"; aideEnvoyer({ confirmation:{ action_id:a.id, ok:false } }); return; }
      a.statut = "en cours…"; aideRendu();
      aideExecuter(a, function(resultat){
        a.statut = resultat === "Fait" ? "confirmee" : resultat;
        if (resultat === "Fait") vibrer(12);
        aideEnvoyer({ confirmation:{ action_id:a.id, ok:true, resultat:resultat } });
      });
    });
    p.addEventListener("submit", function(ev){
      ev.preventDefault();
      var champ = p.querySelector("[data-aide-champ]"), t = champ.value.trim();
      if (!t || aideEnvoi) return;
      champ.value = "";
      aideEnvoyer({ message:t }, t);
    });
    p.addEventListener("keydown", function(ev){
      if (ev.key === "Escape"){ ev.stopPropagation(); aideFermer(); }
      if (ev.key === "Enter" && !ev.shiftKey && ev.target.hasAttribute("data-aide-champ")){
        ev.preventDefault(); p.querySelector("[data-aide-form]").requestSubmit();
      }
    });
    aideRendu();
    p.querySelector("[data-aide-fermer]").focus();
  }

  /* Pastille « LABO · v1.0.0 » ou « TEST · … » à côté du nom du restaurant.
     PELYO_ENV n'existe que sur labo et test (posé par outils/construire.sh) :
     en local et chez les clients, rien ne s'affiche. */
  function env(){
    var e = window.PELYO_ENV;
    return e ? '<span class="envb" title="' + esc(e.detail || e.version) + '">' + esc(e.nom) + ' · ' + esc(e.version) + '</span>' : '';
  }
  /* Le nom suivi de la pastille : s'il est trop long, c'est le nom qui se
     raccourcit (…), jamais la pastille qui disparaît. */
  function nomEnv(nom){
    return window.PELYO_ENV ? '<span class="envb-nom">' + esc(nom) + '</span>' + env() : esc(nom);
  }

  return { boot:boot, register:register, ouvrir:ouvrir, fermer:fermer, toast:toast, env:env, nomEnv:nomEnv, aide:ouvrirAide };
})();
