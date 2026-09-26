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
  var etapeAccueil = "connexion"; /* connexion | inscription | tablette | attente | restaurant | choix | reel | confirme */

  /* Lien reçu par e-mail : Supabase revient sur la page avec
     #…&type=signup, ou #error_code=otp_expired si le lien a expiré. On le lit
     ici, au chargement du script, avant que supabase-js ne nettoie l'adresse. */
  var retourEmail = (function(){
    var adresse = (window.location.hash || "") + "&" + (window.location.search || "");
    if (/error_code=otp_expired|error=access_denied/.test(adresse)) return "expire";
    if (/type=signup/.test(adresse)) return "confirme";
    return null;
  })();
  var arretAttente = null;
  var BRAND = '<div class="hbrand">' +
      '<img class="hlogo" src="assets/logo-toque.png" alt="Pelyo" width="52" height="52">' +
      '<b>Pelyo</b><span>Prise de commande par IA</span>' +
    '</div>';

  function message(m, ok){ return m ? '<p class="hmsg' + (ok ? ' hmsg-ok' : '') + '" role="' + (ok ? 'status' : 'alert') + '">' + esc(m) + '</p>' : ''; }

  function peindreConnexion(m, ok){
    etapeAccueil = "connexion";
    $("home").innerHTML = BRAND +
      '<form class="hform" data-form="connexion" novalidate>' +
        '<input class="hchamp" type="email" name="email" placeholder="Adresse e-mail" autocomplete="email" required>' +
        '<input class="hchamp" type="password" name="mdp" placeholder="Mot de passe" autocomplete="current-password" required>' +
        message(m, ok) +
        '<button class="hbtn" type="submit">Se connecter</button>' +
        '<button class="hbtn2" type="button" data-inscription>Créer un compte</button>' +
      '</form>' +
      '<button class="hlien" type="button" data-tablette>Relier une tablette cuisine</button>' +
      '<button class="hdemo" type="button" data-demo>Compte démo</button>';
  }

  function peindreInscription(m){
    etapeAccueil = "inscription";
    $("home").innerHTML = BRAND +
      '<form class="hform" data-form="inscription" novalidate>' +
        '<p class="hinfo">Compte gérant : vous pourrez ensuite créer votre restaurant et relier les tablettes de la cuisine.</p>' +
        '<input class="hchamp" type="text" name="prenom" placeholder="Prénom" autocomplete="given-name" maxlength="60" required>' +
        '<input class="hchamp" type="email" name="email" placeholder="Adresse e-mail" autocomplete="email" required>' +
        '<input class="hchamp" type="password" name="mdp" placeholder="Mot de passe (8 caractères au moins)" autocomplete="new-password" minlength="8" required>' +
        message(m) +
        '<button class="hbtn" type="submit">Créer mon compte</button>' +
        '<button class="hbtn2" type="button" data-retour>J’ai déjà un compte</button>' +
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
        '<p class="hconf-texte">Il a déjà servi, ou il est trop ancien. Essayez de vous connecter : si votre adresse est déjà confirmée, tout marchera.</p>' +
        '<button class="hbtn" type="button" data-retour>Aller à la connexion</button>' +
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
      '<div class="hbrand hbrand-sm"><b>Pelyo</b><span>Compte démo — ' + esc(D.resto.nom) + '</span></div>' +
      '<div class="hliste">' + listePostes(null) + '</div>' +
      '<button class="hdeco" data-deconnexion-demo>Se déconnecter</button>';
  }

  /* Compte réel : les postes dépendent du rôle. Le gérant ouvre aussi la
     cuisine de son restaurant ; une tablette n'ouvre que la cuisine. Le
     commercial reste sur les données de démonstration jusqu'à la phase 7. */
  function peindreChoixReel(ctx){
    etapeAccueil = "reel";
    var r = PelyoDonnees.restaurant();
    var ids = ctx.role === "cuisine" ? ["cuisine"] : ctx.role === "commercial" ? ["commercial"]
            : ctx.role === "fondateur" ? null : ["gerant", "cuisine"];
    $("home").innerHTML =
      '<div class="hbrand hbrand-sm"><b>Pelyo</b><span>' + esc(r ? r.nom : "Compte connecté") + '</span></div>' +
      (ctx.role === "commercial" ? '<p class="hinfo">L’application commercial utilise encore des données d’exemple : elle sera reliée à la base plus tard.</p>' : '') +
      '<div class="hliste">' + listePostes(ids) + '</div>' +
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
      if (ctx.restaurants.length) PelyoDonnees.ouvrirRestaurant(ctx.restaurants[0]);
      else if (ctx.role === "gerant") return peindreRestaurant();
      peindreChoixReel(ctx);
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
      else peindreRestaurant(e);
      /* Le formulaire est redessiné avec le message : on remet ce qui avait
         été saisi, sauf le mot de passe. */
      var f = $("home").querySelector("form");
      if (f) Array.prototype.forEach.call(f.elements, function(el){ if (el.name && el.type !== "password" && v[el.name]) el.value = v[el.name]; });
    }
    if (type === "connexion"){
      if (!v.email || !v.mdp) return rafraichir("Renseignez votre e-mail et votre mot de passe.");
      occupe(form, true);
      PelyoDonnees.connexion(v.email, v.mdp, function(e){ fin(e, reprendreSession); });
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
    } else if (type === "restaurant"){
      if (!v.nom) return rafraichir("Indiquez le nom du restaurant.");
      occupe(form, true);
      PelyoDonnees.creerRestaurant(v.nom, function(e){ fin(e, reprendreSession); });
    }
  }

  /* ----------------------- ouverture d'une application ----------------------- */
  var cssCharge = {};
  function charger(app, pret){
    if (!app.css || cssCharge[app.id]) return pret();
    var l = document.createElement("link");
    l.rel = "stylesheet"; l.href = "src/" + app.css + (VERSION ? "?v=" + VERSION : "");
    l.onload = pret; l.onerror = pret;
    document.head.appendChild(l);
    cssCharge[app.id] = true;
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

  /* ------------------------------ démarrage ------------------------------ */
  function boot(){
    peindreConnexion();
    /* Direct preview link; this opens demo data, never an authenticated account. */
    if (window.location.hash === '#cuisine') ouvrir('cuisine');
    else if (retourEmail === "confirme" && PelyoDonnees.disponible()) peindreConfirmation();
    else if (retourEmail === "expire"){
      if (window.history.replaceState) window.history.replaceState(null, "", window.location.pathname);
      peindreLienExpire();
    }
    else if (window.PelyoDonnees && PelyoDonnees.disponible()){
      PelyoDonnees.session(function(e, s){ if (s) reprendreSession(); });
    }

    $("home").addEventListener("submit", function(ev){
      ev.preventDefault();
      soumettre(ev.target);
    });
    $("home").addEventListener("click", function(ev){
      var b = ev.target.closest("button");
      /* Les boutons d'envoi d'un formulaire passent par « submit » ; les
         autres boutons (postes, liens) n'ont pas de formulaire. */
      if (!b || (b.type === "submit" && b.form)) return;
      if (b.dataset.inscription !== undefined) return peindreInscription();
      if (b.dataset.tablette !== undefined) return peindreTablette();
      if (b.dataset.retour !== undefined) return peindreConnexion();
      if (b.dataset.continuer !== undefined) return reprendreSession();
      if (b.dataset.demo !== undefined){
        if (window.PelyoDonnees) PelyoDonnees.modeDemo();
        peindreChoix();
        return;
      }
      if (b.dataset.deconnexionDemo !== undefined) return peindreConnexion();
      if (b.dataset.deconnexion !== undefined || b.dataset.oublierTablette !== undefined){
        var tablette = etapeAccueil === "attente" || (PelyoDonnees.contexte() && PelyoDonnees.contexte().role === "cuisine");
        if (tablette && !window.confirm("Déconnecter cette tablette ? Il faudra une nouvelle autorisation du gérant.")) return;
        if (arretAttente){ arretAttente(); arretAttente = null; }
        PelyoDonnees.deconnexion(function(){ peindreConnexion(); });
        return;
      }
      if (b.dataset.app) ouvrir(b.dataset.app);
    });
    $("homebar").addEventListener("click", fermer);
    document.addEventListener("keydown", function(ev){ if (ev.key === "Escape") fermer(); });
  }

  return { boot:boot, register:register, ouvrir:ouvrir, fermer:fermer, toast:toast };
})();
