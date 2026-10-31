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
   l'espace réel qu'on lui donne (voir base.css). Une seule exception, la
   hauteur sur iPhone ouvert depuis l'écran d'accueil (ci-dessous).
   ========================================================================= */
var RIA = (function(){
  "use strict";

  /* iPhone, Pelyo ouvert depuis son icône : au lancement, l'iPhone annonce
     une fenêtre plus courte que l'écran (de la hauteur des encoches), et ne
     la corrige pas : tout ce qui s'y cale laisse une bande noire en bas. On
     pose donc la vraie hauteur de l'écran dans --pelyo-h (base.css : html,
     body et le cadre la prennent ; rien ne doit couper ce qui dépasse de la
     fenêtre annoncée). Ailleurs, la variable reste vide. */
  (function hauteurEcran(){
    if (window.navigator.standalone !== true || !window.screen) return;
    function poser(){
      var a = window.screen.width, b = window.screen.height;
      var paysage = window.matchMedia && window.matchMedia("(orientation: landscape)").matches;
      document.documentElement.style.setProperty("--pelyo-h", (paysage ? Math.min(a, b) : Math.max(a, b)) + "px");
      if (window.scrollY) window.scrollTo(0, 0);
    }
    poser();
    window.addEventListener("orientationchange", function(){ setTimeout(poser, 250); });
    window.addEventListener("resize", poser);
  })();

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
  /* Appli séparée (cuisine.html, gerant.html, commercial.html) : un seul poste. index.html
     garde l'accueil complet avec la liste des postes. */
  var POSTE = window.PELYO_POSTE || null;
  /* demo.html : appli à part, restaurant fictif, jamais de connexion. */
  var DEMO = !!window.PELYO_DEMO;
  /* Appli gérant : le compte est redemandé à chaque ouverture (Face ID
     remplit l'e-mail et le mot de passe au toucher du champ). */
  var CONNEXION_A_CHAQUE_OUVERTURE = POSTE === "gerant" && !DEMO;
  /* « Compte démo » d'une appli séparée : ouvre son appli Labo à part. */
  var DEMO_A_PART = DEMO ? null : { gerant:"demo.html", cuisine:"demo-cuisine.html" }[POSTE] || null;
  var NOM_POSTE = { cuisine:"Cuisine", gerant:"Gérant", commercial:"Commercial" }[POSTE] || "";

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
      /* commercial.html : le compte de l'équipe, rien d'autre (la démo n'a pas d'assistant). */
      (POSTE === "gerant" || POSTE === "commercial" ? '' : '<button class="hlien" type="button" data-tablette>Relier une tablette cuisine</button>') +
      (POSTE === "commercial" ? '' : '<button class="hdemo" type="button" data-demo>Compte démo</button>');
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
          '<ol><li>Fermez cette page.</li><li>Ouvrez Pelyo.</li><li>Connectez-vous avec votre e-mail et votre mot de passe.</li></ol>' +
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
      '<div class="hliste">' + (!ids || ids.length ? listePostes(ids) : '<p class="hinfo">Ce compte n’a pas accès à Pelyo ' + esc(NOM_POSTE) + '.</p>') + '</div>' +
      '<button class="hdeco" data-deconnexion>' + (ctx.role === "cuisine" ? "Déconnecter cette tablette" : "Se déconnecter") + '</button>';
  }

  /* Session retrouvée (réouverture de l'appli, retour du lien de
     confirmation) ou juste ouverte : on demande à la base qui l'on est. */
  function reprendreSession(){
    PelyoDonnees.chargerContexte(function(e, ctx){
      /* Sans réseau, l'assistant commercial s'ouvre quand même : son mode
         Hors ligne lit le savoir gardé sur le téléphone. */
      if (e && POSTE === "commercial" && navigator.onLine === false){ etapeAccueil = "reel"; return ouvrir("commercial"); }
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
          "Pelyo n'a pas pu se charger.<br><span style=\"opacity:.6\">" + esc(e.message) + "</span></div>";
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
  var DEBUT = Date.now(), DUREE_SPLASH = 1100;
  function splash(){
    var el = $("splash");
    if (!el) return;
    var etat = $("splash-etat"), etapes = POSTE === "gerant"
      ? ["Ouverture de votre restaurant…", "Chargement des chiffres du soir…", "Presque prêt…"]
      : POSTE === "commercial" ? ["Ouverture de l’assistant…", "Chargement de ce que Pelyo sait…", "Presque prêt…"]
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

  /* ------------------------ assistant des commerciaux ------------------------ */
  /* L'espace commercial (commercial.html) est cette seule page : le
     commercial pose la question d'un restaurateur ; l'assistant (fonction
     serveur « assistant-commercial ») répond avec le savoir de Pelyo, ou
     transmet la question à Hayden. Dans le même fil : les réponses de Hayden
     pour le commercial ; les questions à traiter pour le fondateur, qui y
     répond (sa réponse revient au commercial et entre dans le savoir).
     L'écran ne bouge pas quand le clavier s'ouvre : seule la barre d'écriture
     monte au-dessus. Fonctionne avec un compte réel. */
  var acFil = [], acConversation = null, acEnvoi = false, acQuestions = null, acReponse = {}, acVues = {}, acPlumeEnCours = null;
  var AC_ICONES = {
    retour:'<path d="M15 5l-7 7 7 7"/>',
    cloche:'<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    envoyer:'<path d="M12 19V5m-6 6 6-6 6 6"/>',
    volet:'<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M9.5 4.5v15M6 8.5h1.5M6 11.5h1.5"/>',
    horsligne:'<path d="M5 4.5h9.5a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h9.5M9 8h5M9 11h3"/>',
    nouveau:'<path d="M12 20h8M15.5 4.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/>',
    accueil:'<path d="M4 11l8-6.5 8 6.5M6.5 9.5V19h11V9.5"/>',
    fermer:'<path d="M6 6l12 12M18 6 6 18"/>',
    chercher:'<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>'
  };
  function acIcone(n){ return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + AC_ICONES[n] + '</svg>'; }

  function acDate(iso){
    var d = new Date(iso), n = function(x){ return (x < 10 ? "0" : "") + x; };
    return n(d.getDate()) + "/" + n(d.getMonth() + 1) + " · " + n(d.getHours()) + "h" + n(d.getMinutes());
  }

  /* Les cartes du fil : questions en attente (fondateur), réponses de Hayden
     nouvelles ou de cette conversation (commercial). */
  function acCartes(){
    if (!acQuestions) return [];
    if (PelyoDonnees.estFondateur()) return acQuestions.filter(function(q){ return q.statut === "en_attente"; });
    return acQuestions.filter(function(q){ return q.statut === "repondue" && (!q.vue_at || acVues[q.id]); });
  }
  function acCarte(q){
    if (q.statut === "en_attente") return '<article class="ac-carte"><small>Question à traiter · ' + esc(acDate(q.created_at)) + '</small>' +
      '<p class="ac-q">' + esc(q.question) + '</p>' + (q.contexte ? '<p class="ac-ctx">' + esc(q.contexte) + '</p>' : '') +
      '<form class="ac-form" data-ac-repondre="' + esc(q.id) + '"><textarea rows="3" maxlength="4000" placeholder="Ta réponse : elle part au commercial et l’assistant la retient.">' + esc(acReponse[q.id] || "") + '</textarea>' +
      '<button type="submit">Répondre</button></form></article>';
    return '<article class="ac-carte"><small>Réponse de Hayden · ' + esc(acDate(q.repondu_at || q.created_at)) + '</small>' +
      '<p class="ac-q">« ' + esc(q.question) + ' »</p><div class="ac-rep">' + aideTexte(q.reponse || "") + '</div></article>';
  }

  /* Le fil est mis à jour élément par élément : ce qui est déjà affiché ne
     bouge pas (ni animation rejouée, ni champ de réponse perdu), seuls les
     nouveaux éléments arrivent en douceur. */
  function acRendu(){
    var p = $("assistant-com");
    if (!p) return;
    var reel = !!(window.PelyoDonnees && PelyoDonnees.commercialReel());
    var items = acCartes().map(function(q){ return { cle:"q" + q.id + q.statut, html:acCarte(q) }; });
    acFil.forEach(function(m, i){
      items.push({ cle:"m" + i, message:m, html:
        m.qui === "moi" ? '<div class="ac-bulle ac-moi">' + aideTexte(m.texte) + '</div>'
        : m.qui === "erreur" ? '<p class="ac-info ac-erreur">' + esc(m.texte) + '</p>'
        : m.qui === "transmis" ? '<p class="ac-info">Question transmise à Hayden · sa réponse arrivera ici</p>'
        : '<div class="ac-bulle ac-ia">' + aideTexte(m.texte) + '</div>' });
    });
    if (acEnvoi && !acPlumeEnCours) items.push({ cle:"ecrit", html:'<p class="ac-info ac-ecrit" aria-label="L’assistant cherche"><i></i><i></i><i></i></p>' });

    var zone = p.querySelector("[data-ac-fil]"), vide = !items.length;
    zone.classList.toggle("ac-fil-vide", vide);
    if (vide){
      if (!zone.querySelector(".ac-hero")) zone.innerHTML =
        '<div class="ac-hero"><div class="ac-logo"><span class="ac-halo" aria-hidden="true"></span><img src="assets/logo-pelyo.png" alt="Pelyo" width="150" height="150"><span class="ac-eclat" aria-hidden="true"></span></div>' +
        '<p>Besoin d’un renseignement ?</p>' + (reel ? '' : navigator.onLine === false
          ? '<small>Pas de réseau : le mode Hors ligne reste disponible dans le volet.</small>'
          : '<small>Dans la démo, l’assistant ne répond pas.</small>') + '</div>';
    } else {
      var garder = {}, ajout = false;
      items.forEach(function(it){ garder[it.cle] = true; });
      Array.prototype.slice.call(zone.children).forEach(function(el){ if (!garder[el.getAttribute("data-cle")]) el.remove(); });
      items.forEach(function(it, i){
        var la = zone.children[i];
        if (la && la.getAttribute("data-cle") === it.cle) return;
        var t = document.createElement("div");
        t.innerHTML = it.html;
        var n = t.firstChild;
        n.setAttribute("data-cle", it.cle);
        n.classList.add("ac-neuf");
        zone.insertBefore(n, la || null);
        ajout = true;
      });
      if (ajout) requestAnimationFrame(function(){
        if (zone.scrollTo) zone.scrollTo({ top:zone.scrollHeight, behavior:"smooth" }); else zone.scrollTop = zone.scrollHeight;
      });
    }
    p.querySelector("[data-ac-champ]").disabled = !reel;
    p.querySelector("[data-ac-envoyer]").disabled = !reel || acEnvoi;
  }

  /* La plume : la réponse de l'assistant s'écrit dans sa bulle au fil de
     l'arrivée, comme sur ChatGPT. Chaque morceau (un mot, ou un bout de mot
     reçu) apparaît en fondu, du flou au net ; si le réseau envoie d'un coup,
     la plume accélère un peu pour rester fluide. Le **gras** et les retours
     à la ligne sont interprétés au vol (un * isolé attend le suivant). Le fil
     suit tant qu'on est en bas. */
  function acPlume(bulle, zone){
    var file = [], attente = "", gras = false, fin = false, surFin = null, minuterie = null;
    var lent = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function analyser(texte){
      var t = attente + texte;
      attente = "";
      if (!fin && /\*$/.test(t)){ attente = "*"; t = t.slice(0, -1); }
      t.split(/(\*\*|\n)/).forEach(function(p){
        if (p === "**") gras = !gras;
        else if (p === "\n") file.push({ br:true });
        else if (p) (p.match(/\S+\s*|\s+/g) || []).forEach(function(b){ file.push({ t:b, gras:gras }); });
      });
    }
    function pas(){
      if (!bulle.isConnected){ clearInterval(minuterie); return; }
      var enBas = zone.scrollHeight - zone.scrollTop - zone.clientHeight < 80;
      var n = lent ? file.length : Math.max(1, Math.ceil(file.length / 14));
      while (n-- > 0 && file.length){
        var j = file.shift(), el;
        if (j.br) el = document.createElement("br");
        else { el = document.createElement(j.gras ? "b" : "span"); el.className = "ac-jeton"; el.textContent = j.t; }
        bulle.appendChild(el);
      }
      if (enBas) zone.scrollTop = zone.scrollHeight;
      if (!file.length && fin){ clearInterval(minuterie); minuterie = null; if (surFin){ var f = surFin; surFin = null; f(); } }
    }
    function lancer(){ if (!minuterie) minuterie = setInterval(pas, 32); }
    return {
      ajouter:function(texte){ analyser(texte); lancer(); },
      finir:function(cb){ fin = true; if (attente) analyser(""); surFin = cb || null; lancer(); }
    };
  }

  function acCharger(){
    if (!PelyoDonnees.commercialReel()) return;
    PelyoDonnees.questionsCommerciales(function(e, l){
      if (e) return;
      acQuestions = l || [];
      /* Les réponses montrées restent dans le fil jusqu'à la fermeture. */
      var nouvelles = false;
      if (!PelyoDonnees.estFondateur()) acQuestions.forEach(function(q){ if (q.statut === "repondue" && !q.vue_at){ acVues[q.id] = true; nouvelles = true; } });
      if (nouvelles) PelyoDonnees.questionsCommercialesVues(function(){});
      acRendu();
    });
  }

  function acEnvoyer(texte){
    if (acEnvoi) return;
    acFil.push({ qui:"moi", texte:texte });
    acEnvoi = true; acPlumeEnCours = null; acRendu();
    var demande = { message:texte }, m = null;
    if (acConversation) demande.conversation_id = acConversation;
    PelyoDonnees.assistantCommercialFlux(demande, function(morceau){
      if (!m){
        /* Premier mot : la bulle remplace les trois points. */
        m = { qui:"ia", texte:"" };
        acFil.push(m);
        acPlumeEnCours = true;
        acRendu();
        var zone = $("assistant-com") && $("assistant-com").querySelector("[data-ac-fil]");
        var bulle = zone && zone.querySelector('[data-cle="m' + (acFil.length - 1) + '"]');
        acPlumeEnCours = bulle ? acPlume(bulle, zone) : null;
      }
      m.texte += morceau;
      if (acPlumeEnCours && acPlumeEnCours.ajouter) acPlumeEnCours.ajouter(morceau);
    }, function(e, r){
      function terminer(){
        acEnvoi = false; acPlumeEnCours = null;
        if (e) acFil.push({ qui:"erreur", texte:e });
        else {
          acConversation = r.conversation_id;
          if (m) m.texte = r.reponse; else if (r.reponse) acFil.push({ qui:"ia", texte:r.reponse });
          if (r.question) acFil.push({ qui:"transmis" });
        }
        acRendu();
      }
      if (acPlumeEnCours && acPlumeEnCours.finir) acPlumeEnCours.finir(terminer); else terminer();
    });
  }

  function acAlertes(){
    if (!PelyoDonnees.commercialReel()) return toast("Les alertes marchent avec un vrai compte.");
    if (PelyoNotifs.etat() === "ios-ecran") return toast("Sur iPhone, ouvre Pelyo depuis son icône sur l’écran d’accueil pour activer les alertes.");
    PelyoDonnees.cleNotifications(function(e, cle){
      if (e) return toast(e);
      PelyoNotifs.activer(cle, function(e2, sub){
        if (e2) return toast(e2);
        PelyoDonnees.abonnerNotificationsEquipe(sub, PelyoNotifs.nomAppareil(), function(e3){
          toast(e3 || (PelyoDonnees.estFondateur() ? "Alertes activées : tu seras prévenu à chaque question." : "Alertes activées : tu seras prévenu quand Hayden répond."));
        });
      });
    });
  }

  /* ------------------------- volet latéral et hors ligne ------------------------- */
  /* Comme le volet de ChatGPT ou de Claude : en haut le mode Hors ligne, puis
     « Nouvelle discussion », puis l'historique (titré automatiquement par la
     base d'après la première question), et Accueil en bas.
     Le mode Hors ligne range tout le savoir de l'assistant par catégories,
     de A à Z, avec une recherche ; il est gardé sur le téléphone à chaque
     ouverture avec réseau, donc consultable sans réseau. */
  var AC_SAVOIR = "pelyo:assistant:savoir", acHisto = null, acRecherche = "";
  function acSavoirLocal(){
    try { var v = JSON.parse(localStorage.getItem(AC_SAVOIR) || "null"); return v && v.fiches ? v : null; } catch(e){ return null; }
  }
  function acSavoirCharger(){
    if (!PelyoDonnees.commercialReel()) return;
    PelyoDonnees.savoirCommercial(function(e, l){
      if (e || !l || !l.length) return;
      try { localStorage.setItem(AC_SAVOIR, JSON.stringify({ maj:Date.now(), fiches:l })); } catch(x){}
      if ($("assistant-com") && $("assistant-com").classList.contains("ac-hl-ouvert")) acHorsLigneRendu();
    });
  }
  function acSansAccents(t){
    return String(t || "").toLowerCase().replace(/[àâä]/g, "a").replace(/[éèêë]/g, "e").replace(/[îï]/g, "i").replace(/[ôö]/g, "o").replace(/[ùûü]/g, "u").replace(/ç/g, "c").replace(/[’']/g, " ");
  }
  function acHorsLigneRendu(){
    var p = $("assistant-com");
    if (!p) return;
    var liste = p.querySelector("[data-ac-hl-liste]"), infos = p.querySelector("[data-ac-hl-infos]");
    var savoir = acSavoirLocal();
    if (!savoir){
      infos.textContent = "";
      liste.innerHTML = '<p class="ac-hl-vide">Ouvre l’assistant une fois avec du réseau : tout le savoir se garde alors sur ce téléphone.</p>';
      return;
    }
    var mots = acSansAccents(acRecherche).split(/\s+/).filter(Boolean);
    var fiches = savoir.fiches.filter(function(f){
      var t = acSansAccents(f.titre + " " + f.theme + " " + f.contenu);
      return mots.every(function(m){ return t.indexOf(m) !== -1; });
    });
    var themes = {};
    fiches.forEach(function(f){ (themes[f.theme] = themes[f.theme] || []).push(f); });
    var noms = Object.keys(themes).sort(function(a, b){ return a.localeCompare(b, "fr", { sensitivity:"base" }); });
    var d = new Date(savoir.maj), n = function(x){ return (x < 10 ? "0" : "") + x; };
    infos.textContent = savoir.fiches.length + " fiches · à jour le " + n(d.getDate()) + "/" + n(d.getMonth() + 1);
    if (!noms.length){ liste.innerHTML = '<p class="ac-hl-vide">Rien trouvé pour « ' + esc(acRecherche) + ' ». Essaie un autre mot, ou pose la question à l’assistant.</p>'; return; }
    liste.innerHTML = noms.map(function(nom){
      var l = themes[nom].sort(function(a, b){ return a.titre.localeCompare(b.titre, "fr", { sensitivity:"base" }); });
      return '<details class="ac-cat"' + (mots.length ? ' open' : '') + '><summary><i>' + esc(nom.charAt(0).toUpperCase()) + '</i><b>' + esc(nom) + '</b><small>' + l.length + '</small></summary>' +
        l.map(function(f){
          return '<details class="ac-fiche"><summary>' + esc(f.titre) + '</summary><div class="ac-fiche-texte">' + aideTexte(f.contenu) + '</div></details>';
        }).join("") + '</details>';
    }).join("");
  }
  function acHistoRendu(){
    var p = $("assistant-com");
    if (!p) return;
    var zone = p.querySelector("[data-ac-histo]");
    if (!PelyoDonnees.commercialReel()){
      zone.innerHTML = '<p class="ac-histo-vide">' + (navigator.onLine === false ? 'L’historique revient avec le réseau.' : 'L’historique apparaît avec un vrai compte.') + '</p>';
      return;
    }
    if (!acHisto){ zone.innerHTML = '<p class="ac-histo-vide">Chargement…</p>'; return; }
    if (!acHisto.length){ zone.innerHTML = '<p class="ac-histo-vide">Tes discussions apparaîtront ici.</p>'; return; }
    var auj = new Date(); auj.setHours(0, 0, 0, 0);
    var groupe = null;
    zone.innerHTML = acHisto.map(function(c){
      var d = new Date(c.maj), jours = Math.floor((auj - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
      var g = jours <= 0 ? "Aujourd’hui" : jours === 1 ? "Hier" : jours < 7 ? "7 derniers jours" : jours < 30 ? "30 derniers jours" : "Plus ancien";
      var tete = g !== groupe ? '<p class="ac-histo-groupe">' + g + '</p>' : "";
      groupe = g;
      return tete + '<button class="ac-histo-ligne' + (c.id === acConversation ? ' ac-histo-actuelle' : '') + '" data-ac-conv="' + esc(c.id) + '">' + esc(c.titre) + '</button>';
    }).join("");
  }
  function acHistoCharger(){
    if (!PelyoDonnees.commercialReel()) return acHistoRendu();
    PelyoDonnees.conversationsAssistant(function(e, l){ if (!e) acHisto = l || []; acHistoRendu(); });
  }
  function acViderFil(){
    var p = $("assistant-com"), z = p && p.querySelector("[data-ac-fil]");
    if (z) z.innerHTML = "";
  }

  /* Monte l'assistant dans le conteneur (la page de l'espace commercial) ;
     renvoie la fonction qui le démonte. */
  function ouvrirAssistant(conteneur){
    if ($("assistant-com")) return null;
    var p = document.createElement("section");
    p.id = "assistant-com"; p.className = "ac";
    p.setAttribute("aria-label", "Assistant Pelyo");
    p.innerHTML =
      '<div class="ac-deco" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>' +
      '<header class="ac-tete"><button class="ac-rond" data-ac-volet-ouvrir aria-label="Ouvrir le volet : hors ligne et historique" aria-expanded="false">' + acIcone("volet") + '</button>' +
        '<span class="ac-marque">Pelyo<em>assistant</em></span>' +
        '<button class="ac-rond" data-ac-alertes aria-label="Recevoir les alertes sur ce téléphone">' + acIcone("cloche") + '</button></header>' +
      '<div class="ac-fil" data-ac-fil aria-live="polite"></div>' +
      '<form class="ac-saisie" data-ac-form><textarea data-ac-champ rows="1" maxlength="1500" placeholder="La question du restaurateur…" aria-label="Question"></textarea>' +
      '<button class="ac-envoyer" data-ac-envoyer type="submit" aria-label="Envoyer">' + acIcone("envoyer") + '</button></form>' +
      '<div class="ac-voile" data-ac-voile aria-hidden="true"></div>' +
      '<aside class="ac-volet" data-ac-volet aria-label="Volet de l’assistant">' +
        '<div class="ac-volet-tete"><span class="ac-marque">Pelyo<em>assistant</em></span><button class="ac-rond" data-ac-volet-fermer aria-label="Fermer le volet">' + acIcone("fermer") + '</button></div>' +
        '<button class="ac-hl" data-ac-horsligne>' + acIcone("horsligne") + '<span><b>Hors ligne</b><small>Tout ce que Pelyo sait, rangé de A à Z</small></span></button>' +
        '<button class="ac-nouveau" data-ac-nouvelle>' + acIcone("nouveau") + '<span>Nouvelle discussion</span></button>' +
        '<p class="ac-volet-titre">Historique</p>' +
        '<nav class="ac-histo" data-ac-histo aria-label="Discussions passées"></nav>' +
        '<button class="ac-volet-bas" data-ac-accueil>' + acIcone("accueil") + '<span>Accueil</span></button>' +
      '</aside>' +
      '<section class="ac-hl-page" data-ac-hl-page aria-label="Hors ligne">' +
        '<header class="ac-tete"><button class="ac-rond" data-ac-hl-fermer aria-label="Revenir à la discussion">' + acIcone("retour") + '</button>' +
          '<span class="ac-marque">Hors ligne<em data-ac-hl-infos></em></span><span class="ac-tete-vide" aria-hidden="true"></span></header>' +
        '<label class="ac-hl-chercher">' + acIcone("chercher") + '<input type="search" data-ac-hl-recherche placeholder="Chercher : prix, caisse, installation…" aria-label="Chercher dans le savoir" autocomplete="off"></label>' +
        '<div class="ac-hl-liste" data-ac-hl-liste></div>' +
      '</section>';
    conteneur.appendChild(p);
    var champ = p.querySelector("[data-ac-champ]");

    /* Clavier fermé : la page est collée aux quatre bords de l'écran (CSS),
       aucune hauteur calculée : l'iPhone en donne parfois une trop courte à
       l'ouverture depuis l'icône. Clavier ouvert (champ actif et partie
       visible nettement plus petite) : la page épouse la partie visible
       (visualViewport), le logo rapetisse et se pose au-dessus de la barre ;
       le décor ne bouge pas. */
    var vv = window.visualViewport, image = 0;
    function liberer(){
      p.style.height = ""; p.style.transform = "";
      p.classList.remove("ac-clavier");
    }
    function caler(){
      image = 0;
      if (!vv || document.activeElement !== champ) return liberer();
      var plein = document.documentElement.clientHeight || window.innerHeight;
      if (plein - vv.height < 80) return liberer();
      p.style.height = Math.round(vv.height) + "px";
      p.style.transform = vv.offsetTop > 0 ? "translateY(" + Math.round(vv.offsetTop) + "px)" : "";
      if (!p.classList.contains("ac-clavier")){
        p.classList.add("ac-clavier");
        var zone = p.querySelector("[data-ac-fil]");
        if (zone) zone.scrollTop = zone.scrollHeight;
      }
    }
    function bientot(){ if (!image) image = requestAnimationFrame(caler); }
    if (vv){ vv.addEventListener("resize", bientot); vv.addEventListener("scroll", bientot); }
    window.addEventListener("resize", bientot);
    /* L'iPhone fait défiler la page pour montrer le champ : on la ramène. */
    function remonter(){ if (window.scrollY) window.scrollTo(0, 0); bientot(); }
    window.addEventListener("scroll", remonter);
    champ.addEventListener("focus", bientot);
    champ.addEventListener("blur", function(){ liberer(); setTimeout(bientot, 60); });
    document.documentElement.classList.add("ac-actif");
    caler();
    /* Seul le fil défile : un glissé ailleurs ne fait pas bouger la page
       (sinon, clavier ouvert, l'iPhone déplaçait la page au lieu du fil). */
    function glisse(ev){
      var t = ev.target;
      if (t && t.closest && t.closest("[data-ac-fil],[data-ac-histo],[data-ac-hl-liste],textarea")) return;
      ev.preventDefault();
    }
    document.addEventListener("touchmove", glisse, { passive:false });
    /* Pas de zoom au pincement (iPhone). */
    function sansZoom(ev){ ev.preventDefault(); }
    document.addEventListener("gesturestart", sansZoom);

    /* Toucher « Envoyer » ne retire pas le focus du champ : le clavier
       reste ouvert, rien ne saute. */
    var envoyer = p.querySelector("[data-ac-envoyer]");
    envoyer.addEventListener("mousedown", function(ev){ ev.preventDefault(); });
    envoyer.addEventListener("touchend", function(ev){
      if (envoyer.disabled) return;
      ev.preventDefault();
      p.querySelector("[data-ac-form]").requestSubmit();
    });
    function hauteurChamp(){
      champ.style.height = "auto";
      champ.style.height = Math.max(44, Math.min(champ.scrollHeight, 120)) + "px";
      champ.style.overflowY = champ.scrollHeight > 120 ? "auto" : "hidden";
    }
    p.addEventListener("click", function(ev){
      var b = ev.target.closest && ev.target.closest("button");
      if (!b) return;
      if (b.hasAttribute("data-ac-accueil")){ fermer(); return; }
      if (b.hasAttribute("data-ac-alertes")){ acAlertes(); return; }
      if (b.hasAttribute("data-ac-volet-ouvrir")){ ouvrirVolet(); return; }
      if (b.hasAttribute("data-ac-volet-fermer")){ fermerVolet(); return; }
      if (b.hasAttribute("data-ac-horsligne")){ fermerVolet(); ouvrirHorsLigne(); return; }
      if (b.hasAttribute("data-ac-hl-fermer")){ fermerHorsLigne(); return; }
      if (b.hasAttribute("data-ac-nouvelle")){
        if (acEnvoi) return toast("Attends la fin de la réponse.");
        acConversation = null; acFil = []; acViderFil(); acRendu(); fermerVolet();
        return;
      }
      var conv = b.getAttribute("data-ac-conv");
      if (conv){
        if (acEnvoi) return toast("Attends la fin de la réponse.");
        if (conv === acConversation) return fermerVolet();
        PelyoDonnees.messagesAssistant(conv, function(e, l){
          if (e) return toast(e);
          acConversation = conv;
          acFil = (l || []).map(function(m){ return { qui:m.role === "user" ? "moi" : "ia", texte:m.texte }; });
          acViderFil(); acRendu(); fermerVolet();
        });
      }
    });
    p.querySelector("[data-ac-voile]").addEventListener("click", function(){ fermerVolet(); });
    function ouvrirVolet(){
      p.classList.add("ac-volet-ouvert");
      p.querySelector("[data-ac-volet-ouvrir]").setAttribute("aria-expanded", "true");
      if (document.activeElement === champ) champ.blur();
      acHistoRendu(); acHistoCharger();
    }
    function fermerVolet(){
      p.classList.remove("ac-volet-ouvert");
      p.querySelector("[data-ac-volet-ouvrir]").setAttribute("aria-expanded", "false");
    }
    function ouvrirHorsLigne(){ p.classList.add("ac-hl-ouvert"); acHorsLigneRendu(); }
    function fermerHorsLigne(){ p.classList.remove("ac-hl-ouvert"); }
    var recherche = p.querySelector("[data-ac-hl-recherche]");
    recherche.addEventListener("input", function(){ acRecherche = recherche.value; acHorsLigneRendu(); });
    p.addEventListener("input", function(ev){
      if (ev.target === champ) return hauteurChamp();
      if (ev.target === recherche) return;
      var form = ev.target.closest && ev.target.closest("[data-ac-repondre]");
      if (form) acReponse[form.getAttribute("data-ac-repondre")] = ev.target.value;
    });
    p.addEventListener("submit", function(ev){
      ev.preventDefault();
      var form = ev.target, id = form.getAttribute("data-ac-repondre");
      if (id){
        var t = form.querySelector("textarea").value.trim(), bouton = form.querySelector("button");
        if (t.length < 2) return;
        bouton.disabled = true;
        PelyoDonnees.repondreQuestionCommerciale(id, t, function(e){
          if (e){ bouton.disabled = false; return toast(e); }
          delete acReponse[id]; vibrer(12);
          toast("Réponse envoyée. L’assistant la retient.");
          acCharger();
        });
        return;
      }
      var texte = champ.value.trim();
      if (!texte || acEnvoi) return;
      champ.value = ""; hauteurChamp();
      acEnvoyer(texte);
    });
    p.addEventListener("keydown", function(ev){
      if (ev.key === "Escape"){
        if (p.classList.contains("ac-volet-ouvert")) return fermerVolet();
        if (p.classList.contains("ac-hl-ouvert")) return fermerHorsLigne();
      }
      if (ev.key === "Enter" && !ev.shiftKey && ev.target === champ){
        ev.preventDefault(); p.querySelector("[data-ac-form]").requestSubmit();
      }
    });
    /* Les réponses de Hayden arrivent sans recharger. */
    var relance = setInterval(acCharger, 30000);
    function auRetour(){ if (document.visibilityState === "visible") acCharger(); }
    document.addEventListener("visibilitychange", auRetour);

    acRendu();
    acCharger();
    acSavoirCharger();
    return function(){
      clearInterval(relance);
      document.removeEventListener("visibilitychange", auRetour);
      document.removeEventListener("gesturestart", sansZoom);
      document.removeEventListener("touchmove", glisse, { passive:false });
      if (vv){ vv.removeEventListener("resize", bientot); vv.removeEventListener("scroll", bientot); }
      window.removeEventListener("resize", bientot);
      window.removeEventListener("scroll", remonter);
      if (image) cancelAnimationFrame(image);
      document.documentElement.classList.remove("ac-actif");
      p.remove();
    };
  }

  /* Pastille « LABO · v0.9.0 », « TEST · … » ou « BÊTA · … » à côté du nom
     du restaurant. PELYO_ENV est posé par outils/construire.sh à chaque
     publication : en local, rien ne s'affiche. */
  function env(){
    var e = window.PELYO_ENV;
    return e ? '<span class="envb" title="' + esc(e.detail || e.version) + '">' + esc(e.nom) + ' · ' + esc(e.version) + '</span>' : '';
  }
  /* Le nom suivi de la pastille : s'il est trop long, c'est le nom qui se
     raccourcit (…), jamais la pastille qui disparaît. */
  function nomEnv(nom){
    return window.PELYO_ENV ? '<span class="envb-nom">' + esc(nom) + '</span>' + env() : esc(nom);
  }

  return { boot:boot, register:register, ouvrir:ouvrir, fermer:fermer, toast:toast, env:env, nomEnv:nomEnv, aide:ouvrirAide, assistant:ouvrirAssistant };
})();
