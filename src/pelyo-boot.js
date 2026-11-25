/* =========================================================================
   Pelyo — démarrage de l'application.

   Pendant l'écran de chargement, l'application fait réellement son travail
   (rien n'est un décor) : elle vérifie son code, l'appareil, ses ressources,
   sa version, la session, les données, la connexion en direct, l'affichage.
   Chaque étape a une durée maximale ; une étape non critique qui échoue ou
   dépasse son délai n'empêche pas l'ouverture (mode dégradé, noté dans le
   rapport) ; une étape critique qui échoue affiche une erreur claire avec
   « Réessayer », jamais une page cassée.

   Les étapes « à signal » (session, données, direct, écran) sont annoncées
   par l'application elle-même : attendre(id) puis signal(id, ok).

   Le noyau (creer) ne touche ni au navigateur ni au réseau : il est testé
   par outils/tests/boot.test.js. Les étapes du navigateur sont plus bas.
   ========================================================================= */
var PelyoBoot = (function(){
  "use strict";

  /* ------------------------------ noyau ------------------------------ */
  /* options : { maintenant(), minuteur(fn, ms), annuler(id), delaiTotal, surEtape(etat, toutes), surFin(rapport) }
     etapes  : [{ id, nom, critique, delai, lancer(fin) }]  — lancer absent = étape « à signal » */
  function creer(options){
    var o = options || {}, etapes = [], index = {}, fini = false, demarre = false, t0 = 0, minuterieTotale = null;
    var maintenant = o.maintenant || function(){ return Date.now(); };
    var minuter = o.minuteur || function(fn, ms){ return setTimeout(fn, ms); };
    var annuler = o.annuler || function(id){ clearTimeout(id); };

    function ajouter(def){
      if (index[def.id]) return index[def.id];
      if (fini) return { id:def.id, nom:def.nom || def.id, statut:"ok", detail:"après la fin", critique:false };   /* trop tard : ne compte plus, n'apparaît nulle part */
      var e = { id:def.id, nom:def.nom || def.id, critique:!!def.critique, delai:def.delai || 5000, lancer:def.lancer || null,
        statut:"attente", detail:"", debut:0, duree:0, minuterie:null };
      etapes.push(e); index[e.id] = e;
      if (o.surEtape) o.surEtape(e, etapes);
      if (demarre && !fini) lancer(e);
      return e;
    }
    function clore(e, statut, detail){
      if (e.statut !== "attente" && e.statut !== "encours") return;
      e.statut = statut; e.detail = detail || ""; e.duree = maintenant() - e.debut;
      if (e.minuterie !== null){ annuler(e.minuterie); e.minuterie = null; }
      if (o.surEtape) o.surEtape(e, etapes);
      verifier();
    }
    function lancer(e){
      if (e.statut !== "attente") return;
      e.statut = "encours"; e.debut = maintenant();
      if (o.surEtape) o.surEtape(e, etapes);
      e.minuterie = minuter(function(){ e.minuterie = null; clore(e, "delai", "pas de réponse en " + Math.round(e.delai / 100) / 10 + " s"); }, e.delai);
      if (e.lancer){
        try { e.lancer(function(ok, detail){ clore(e, ok ? "ok" : "echec", detail); }); }
        catch (x){ clore(e, "echec", String(x && x.message || x)); }
      }
    }
    function verifier(){
      if (fini) return;
      var i, e, enAttente = 0;
      for (i = 0; i < etapes.length; i++){
        e = etapes[i];
        if (e.critique && e.statut === "echec") return terminer("erreur");
        if (e.statut === "attente" || e.statut === "encours") enAttente++;
      }
      if (demarre && enAttente === 0) terminer(null);
    }
    function terminer(forcer){
      if (fini) return;
      fini = true;
      if (minuterieTotale !== null){ annuler(minuterieTotale); minuterieTotale = null; }
      var i, e, degrade = false, erreur = false;
      for (i = 0; i < etapes.length; i++){
        e = etapes[i];
        if (e.statut === "attente" || e.statut === "encours"){ e.statut = "delai"; e.detail = "interrompue"; if (e.minuterie !== null) annuler(e.minuterie); }
        if (e.statut === "delai" || e.statut === "echec") degrade = true;
        if (e.critique && e.statut === "echec") erreur = true;
      }
      var statut = forcer === "erreur" || erreur ? "erreur" : degrade ? "degrade" : "ok";
      if (o.surFin) o.surFin({ statut:statut, duree:maintenant() - t0, etapes:etapes.map(function(x){ return { id:x.id, nom:x.nom, statut:x.statut, detail:x.detail, duree:x.duree, critique:x.critique }; }) });
    }
    return {
      ajouter:ajouter,
      /* L'application annonce qu'elle fait quelque chose dont le démarrage doit attendre le résultat. */
      attendre:function(id, nom, delai, critique){ return ajouter({ id:id, nom:nom, delai:delai, critique:critique }); },
      /* … et annonce le résultat. Un signal sans attente préalable crée l'étape déjà terminée. */
      signal:function(id, ok, detail, nom){
        var e = index[id] || ajouter({ id:id, nom:nom });
        if (e.statut === "attente" && !demarre){ e.debut = maintenant(); e.statut = "encours"; }
        clore(e, ok === false ? "echec" : "ok", detail);
      },
      demarrer:function(){
        if (demarre) return; demarre = true; t0 = maintenant();
        minuterieTotale = minuter(function(){ minuterieTotale = null; terminer(null); }, o.delaiTotal || 9000);
        etapes.slice().forEach(lancer);
        verifier();
      },
      etapes:function(){ return etapes; },
      termine:function(){ return fini; }
    };
  }

  /* ---------------------- étapes du navigateur ---------------------- */
  var noyau = null, reglages = null, rapportFinal = null, interface_ = null;

  function ajouterEtapesNavigateur(n, cfg){
    n.ajouter({ id:"code", nom:"Code", critique:true, delai:2500, lancer:function(fin){
      var manque = [], requis = cfg.requis || [];
      for (var i = 0; i < requis.length; i++) if (typeof window[requis[i]] === "undefined") manque.push(requis[i]);
      fin(!manque.length, manque.length ? "manque : " + manque.join(", ") : "");
    } });
    n.ajouter({ id:"appareil", nom:"Appareil", delai:2000, lancer:function(fin){
      var stockage = true;
      try { localStorage.setItem("pelyo:boot:test", "1"); localStorage.removeItem("pelyo:boot:test"); } catch (e) { stockage = false; }
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}   /* demande de garder les données locales */
      fin(stockage, stockage ? "" : "stockage local indisponible");
    } });
    n.ajouter({ id:"ressources", nom:"Ressources", delai:4500, lancer:function(fin){
      var restant = 1, ok = true;
      function un(){ restant--; if (restant === 0) fin(ok, ""); }
      var images = cfg.images || [];
      restant += images.length;
      images.forEach(function(src){
        var im = new Image(); im.onload = un; im.onerror = function(){ ok = false; un(); }; im.src = src;
      });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(un, un); else un();
    } });
    n.ajouter({ id:"version", nom:"Version", delai:3500, lancer:function(fin){
      var env = window.PELYO_ENV;
      if (!env || !window.fetch || navigator.onLine === false) return fin(true, "non vérifiée");
      var avant = Date.now();
      fetch("version.json?t=" + avant, { cache:"no-store" }).then(function(r){
        var serveur = r.headers && r.headers.get ? r.headers.get("date") : null;
        if (serveur){
          var derive = Date.parse(serveur) - (avant + Date.now()) / 2;
          if (isFinite(derive)) rapportAppareil.deriveMs = Math.round(derive);
        }
        return r.json();
      }).then(function(v){
        /* On compare le détail complet de la construction (version + commit), pas seulement le numéro de version. */
        var connues = [v.affichage, "v" + v.version].filter(Boolean);
        var aJour = connues.indexOf(env.detail) !== -1;
        rapportAppareil.versionServeur = v.affichage || v.version || "";
        if (aJour) return fin(true, "à jour");
        /* Plus tard que la fin du démarrage, ou après le délai de l'étape : jamais de rechargement en plein service. */
        var etape = noyau && noyau.etapes().filter(function(x){ return x.id === "version"; })[0];
        if (!noyau || noyau.termine() || !etape || etape.statut !== "encours") return fin(true, "plus récente disponible");
        /* Une version plus récente est en ligne : on la prend maintenant, avant le service, une seule fois. */
        var deja = 0; try { deja = +sessionStorage.getItem("pelyo:boot:maj") || 0; } catch (e) {}
        if (!deja || Date.now() - deja > 90000){
          var note = false;
          try { var marque = String(Date.now()); sessionStorage.setItem("pelyo:boot:maj", marque); note = sessionStorage.getItem("pelyo:boot:maj") === marque; } catch (e) {}
          if (!note) return fin(true, "plus récente disponible (rechargement impossible à protéger)");   /* sans mémoire, pas de rechargement : jamais de boucle */
          if (interface_ && interface_.texte) interface_.texte("Mise à jour de Pelyo…");
          rapportAppareil.majEnCours = true;
          /* Rechargement immédiat, en contournant le cache (l'ancienne page est peut-être celle que le navigateur garde) :
             l'adresse change d'un paramètre, qui est effacé aussitôt après le chargement. */
          try {
            var u = window.location.pathname + "?maj=" + Date.now() + (window.location.hash || "");
            window.location.replace(u);
          } catch (e2){ window.location.reload(); }
          return;   /* l'étape reste en cours : la page se recharge */
        }
        fin(true, "plus récente disponible");
      }).catch(function(e){ fin(true, "réseau : " + (e && e.message || "indisponible")); });
    } });
    n.ajouter({ id:"veille", nom:"Veille de l’écran", delai:1500, lancer:function(fin){
      /* Une tablette de cuisine ne doit pas s'éteindre en plein service. */
      if (!cfg.garderEveille || !navigator.wakeLock || /livreur/.test(location.search + location.hash)) return fin(true, "non demandée");
      var verrou = null;
      function demander(){
        if (document.visibilityState !== "visible") return;
        navigator.wakeLock.request("screen").then(function(v){ verrou = v; rapportAppareil.veille = true; v.addEventListener("release", function(){ verrou = null; }); }, function(){});
      }
      document.addEventListener("visibilitychange", function(){ if (!verrou) demander(); });
      demander(); fin(true, "");
    } });
  }
  var rapportAppareil = {};

  /* La barre de chargement. Les vérifications réelles se terminent en quelques millisecondes : si la barre suivait
     leur avancement brut, elle sauterait à 80 % dès le premier instant (on dirait une fausse barre). Elle monte
     donc régulièrement depuis 0, mais ne dépasse JAMAIS l'avancement réel : si une étape traîne, elle attend
     honnêtement ; elle n'atteint 100 % que lorsque tout est vraiment prêt. */
  var DUREE_BARRE = 1500, ratioReel = 0, t0Barre = 0, minuteurBarre = null;
  function lancerBarre(){
    if (minuteurBarre) return;
    if (!t0Barre) t0Barre = Date.now();
    var pas = function(){
      var sp = document.getElementById("splash"), barre = sp && sp.querySelector(".splash-barre i");
      if (!barre){ clearInterval(minuteurBarre); minuteurBarre = null; return; }
      var x = Math.min(1, (Date.now() - t0Barre) / DUREE_BARRE), temps = 1 - Math.pow(1 - x, 1.8);
      var pct = Math.round(Math.min(ratioReel, temps) * 100), avant = +barre.getAttribute("data-pct") || 0;
      if (pct < avant) pct = avant;   /* la barre n'avance que dans un sens, même quand une étape s'ajoute en route */
      barre.setAttribute("data-pct", String(pct)); barre.style.animation = "none"; barre.style.width = pct + "%";
      if (pct >= 100){ clearInterval(minuteurBarre); minuteurBarre = null; }
    };
    minuteurBarre = setInterval(pas, 80); pas();
  }

  /* ------------------------ affichage de l'écran de chargement ------------------------ */
  function dessiner(e, toutes){
    var splash = document.getElementById("splash"); if (!splash) return;
    var liste = splash.querySelector(".splash-etapes");
    if (!liste){
      liste = document.createElement("ul"); liste.className = "splash-etapes"; liste.setAttribute("aria-hidden", "true");
      var apres = splash.querySelector(".splash-etat"); if (apres && apres.parentNode) apres.parentNode.appendChild(liste); else return;
    }
    var li = liste.querySelector('[data-etape="' + e.id + '"]');
    if (!li){ li = document.createElement("li"); li.setAttribute("data-etape", e.id); li.innerHTML = "<i></i><span></span>"; liste.appendChild(li); }
    li.setAttribute("data-statut", e.statut); li.lastChild.textContent = e.nom;
    var faites = 0; for (var i = 0; i < toutes.length; i++) if (toutes[i].statut !== "attente" && toutes[i].statut !== "encours") faites++;
    var barre = splash.querySelector(".splash-barre i");
    if (barre){
      ratioReel = faites / Math.max(1, toutes.length);
      barre.style.animation = "none";
      lancerBarre();
    }
    var cours = null; for (var k = 0; k < toutes.length; k++) if (toutes[k].statut === "encours"){ cours = toutes[k]; break; }
    var etat = document.getElementById("splash-etat");
    if (etat && cours && !(rapportAppareil.majEnCours)) etat.textContent = TEXTES[cours.id] || cours.nom + "…";
  }
  var TEXTES = { code:"Vérification du code…", appareil:"Vérification de l’appareil…", ressources:"Chargement des ressources…", version:"Recherche de mises à jour…",
    session:"Ouverture de votre session…", donnees:"Chargement des données…", direct:"Connexion en direct…", ecran:"Réglage de l’écran…", veille:"Veille de l’écran…" };

  function afficherErreur(rapport){
    var splash = document.getElementById("splash"); if (!splash) return;
    var critique = rapport.etapes.filter(function(x){ return x.critique && x.statut === "echec"; })[0];
    var etat = document.getElementById("splash-etat");
    if (etat){ etat.textContent = "Pelyo n’a pas pu démarrer (" + (critique ? critique.nom + " : " + critique.detail : "erreur") + ")."; etat.setAttribute("role", "alert"); }
    if (!splash.querySelector(".splash-rejouer")){
      var b = document.createElement("button"); b.className = "splash-rejouer"; b.textContent = "Réessayer"; b.onclick = function(){ window.location.reload(); };
      etat.parentNode.appendChild(b); try { b.focus(); } catch (x) {}
    }
  }

  /* ------------------------------ API ------------------------------ */
  function demarrer(cfg){
    if (noyau) return noyau;
    lancerBarre();
    interface_ = { texte:function(t){ var e = document.getElementById("splash-etat"); if (e) e.textContent = t; } };
    reglages = cfg || {};
    noyau = creer({
      delaiTotal:reglages.delaiTotal || 9000,
      surEtape:function(e, toutes){ try { dessiner(e, toutes); } catch (x) {} },
      surFin:function(r){
        rapportFinal = r; r.appareil = rapportAppareil;
        try { localStorage.setItem("pelyo:boot:dernier", JSON.stringify({ date:new Date().toISOString(), statut:r.statut, duree:Math.round(r.duree), etapes:r.etapes.map(function(x){ return x.id + ":" + x.statut; }), appareil:rapportAppareil })); } catch (e) {}
        if (r.statut === "erreur") afficherErreur(r);
        if (typeof reglages.surFin === "function") reglages.surFin(r);
      }
    });
    ajouterEtapesNavigateur(noyau, reglages);
    noyau.demarrer();
    return noyau;
  }
  function attendre(id, nom, delai, critique){ return noyau ? noyau.attendre(id, nom, delai, critique) : null; }
  function signal(id, ok, detail, nom){ if (noyau) noyau.signal(id, ok, detail, nom); }
  function pret(){ return !noyau || noyau.termine(); }
  function rapport(){ return rapportFinal; }

  return { creer:creer, demarrer:demarrer, attendre:attendre, signal:signal, pret:pret, rapport:rapport };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PelyoBoot;
