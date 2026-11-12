/* =========================================================================
   Pelyo — réglage automatique de l'écran (écran de cuisine).

   Au premier lancement sur un appareil (installé sur l'écran d'accueil, ou tablette
   tactile), un petit robot :
     1. mesure l'écran (largeur, hauteur, densité, orientation) ;
     2. passe en revue chaque page de l'écran cuisine, cachée derrière un écran
        « Réglage de l'écran… » ;
     3. cherche la plus grande taille d'affichage sans aucun défaut (rien qui
        dépasse, aucun texte coupé, boutons assez grands pour un doigt) et la corrige
        en réduisant si besoin ;
     4. mémorise le résultat sur CET appareil, pour cette orientation.
   Aux lancements suivants, la taille mémorisée s'applique tout de suite, sans
   refaire la vérification. Elle n'est refaite que si l'écran change (rotation
   vers une orientation jamais vue, nouvelle taille de fenêtre) ou à la demande
   (Réglages → Taille de l'affichage → Refaire le réglage).

   Sur un ordinateur (onglet de navigateur), pas de mémorisation : la taille
   suit simplement la largeur de la fenêtre. Pour forcer la vérification :
   ajouter ?calibrer=1 à l'adresse (?appareil=1 simule un appareil sans forcer).
   ========================================================================= */
var PelyoEcran = (function(){
  "use strict";
  var CLE = "pelyo:ecran:v2:", CLE_PREF = "pelyo:ecran:pref";
  var PAGES = ["service", "ruptures", "tickets", "ia", "rythme", "parametres"];
  var PREFS = { auto:1, grand:1.15, tres_grand:1.3 };
  var enCours = false, attendu = false, racine = null, minuteurTaille = null, derniere = null;

  function lire(cle){ try { return localStorage.getItem(cle); } catch (e) { return null; } }
  function ecrire(cle, v){ try { localStorage.setItem(cle, v); } catch (e) {} }
  function effacer(cle){ try { localStorage.removeItem(cle); } catch (e) {} }

  function mesurer(){
    var w = window.innerWidth || document.documentElement.clientWidth, h = window.innerHeight || document.documentElement.clientHeight;
    return {
      largeur:Math.round(w), hauteur:Math.round(h), dpr:window.devicePixelRatio || 1,
      ecranL:(window.screen && screen.width) || 0, ecranH:(window.screen && screen.height) || 0,
      paysage:w >= h,
      tactile:!!(window.matchMedia && matchMedia("(pointer:coarse)").matches),
      installee:!!((window.matchMedia && matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone)
    };
  }
  function orientation(m){ return m.paysage ? "paysage" : "portrait"; }
  function profil(m){ return m.largeur < 700 ? "telephone" : m.largeur < 1200 ? "tablette" : "grand"; }
  function preference(){ var p = lire(CLE_PREF); return PREFS[p] ? p : "auto"; }
  /* Taille de départ : sur grand écran on grossit pour garder une largeur de mise en page proche de 1280. */
  /* Tablette tenue à la verticale (700 à 999 px de large) : l'écran sert la mise en page « téléphone », que l'on agrandit
     jusqu'à ~560 px de largeur utile pour que textes et boutons soient lisibles et touchables. Le paysage n'est jamais concerné. */
  function portraitTablette(m){ return !m.paysage && m.largeur >= 700 && m.largeur < 1000; }
  function depart(m){
    if (m.largeur < 700) return 1;
    /* Grande tablette tenue à la verticale (1000 à 1399 px) : la mise en page large est servie ; on grossit pour que les boutons restent touchables, le robot réduit si ça dépasse. */
    if (!m.paysage && m.largeur >= 1000 && m.largeur < 1400) return Math.max(1, Math.min(1.3 * PREFS[preference()], m.largeur / 800, 1.45));
    if (portraitTablette(m)) return Math.max(1, Math.min(Math.min(1.5, m.largeur / 560) * PREFS[preference()], m.largeur / 520, 1.7));
    /* Paysage : l'affichage validé reste à 100 % sur toute tablette (jusqu'à 1500 px de large) ; seul un grand moniteur est agrandi. */
    var base = m.largeur >= 1500 ? Math.max(1, Math.min(1.5, m.largeur / 1280)) : 1;
    var z = Math.min(base * PREFS[preference()], m.largeur / 960, m.hauteur / 560);
    return Math.max(1, z);
  }
  function arrondir(z){ return Math.round(z * 100) / 100; }
  function appliquer(z){
    derniere = z;
    document.documentElement.style.setProperty("--pelyo-zoom", String(arrondir(z)));
    if (racine) racine.setAttribute("data-ecran", profil(mesurer()));
  }
  function memoire(m){
    var s = lire(CLE + orientation(m)); if (!s) return null;
    try { var o = JSON.parse(s); return o && o.zoom ? o : null; } catch (e) { return null; }
  }
  function proche(o, m){ return Math.abs(o.largeur - m.largeur) / o.largeur < 0.08 && o.pref === preference(); }   /* la hauteur n'entre pas : un clavier qui s'ouvre ne doit rien relancer */
  /* La mémorisation n'a de sens que sur un appareil : installé, ou tactile. Un onglet d'ordinateur suit la fenêtre. */
  function sur_appareil(m){ return m.installee || m.tactile || /[?&](calibrer|appareil)=1/.test(location.search); }

  /* Le robot travaille pendant le vrai écran de chargement (#splash) : il y écrit où il en est. */
  function statut(texte){ var s = document.getElementById("splash-etat"); if (s) s.textContent = texte; }

  function note(d){ var n = 0; for (var i = 0; i < d.length; i++) n += /petit/.test(d[i]) ? 1 : 10; return n; }

  /* ------------------------------ contrôle d'une page ------------------------------ */
  function visible(e){
    if (!e.getClientRects().length) return false;
    var s = getComputedStyle(e);
    return s.display !== "none" && s.visibility !== "hidden" && s.opacity !== "0";
  }
  function defauts(z){
    var res = [], W = window.innerWidth / z, tous = racine.querySelectorAll("*"), i, e, r, s;
    var paysage = window.innerWidth >= window.innerHeight;   /* en paysage, la taille des boutons n'est pas jugée : ce design ne change jamais */
    if (racine.scrollWidth > racine.clientWidth + 2) res.push("débordement horizontal");
    var ws = racine.querySelector(".k-workspace");
    if (ws && window.innerWidth >= 700 && racine.getAttribute("data-page") !== "livreur"){
      var wr = ws.getBoundingClientRect();
      if ((window.innerWidth - wr.right) / z > 60 || wr.left / z > 140) res.push("page mal cadrée (vide sur le côté)");
    }
    for (i = 0; i < tous.length && res.length < 12; i++){
      e = tous[i];
      if (e.closest("svg, [hidden], .k-visually-hidden, .k-lva-carte, .leaflet-container")) continue;
      if (!visible(e)) continue;
      r = e.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      s = getComputedStyle(e);
      if (r.right / z > W + 3 && s.position !== "fixed" && !e.closest("[class*=jours], [class*=scroll], .k-filt, .k-ar-days, .k-tk2-filtres")) { res.push("dépasse à droite : " + (e.className || e.tagName)); continue; }
      if ((s.overflow === "hidden" || s.overflowX === "hidden") && e.children.length === 0 && e.scrollWidth > e.clientWidth + 2 && s.textOverflow !== "ellipsis" && e.textContent.replace(/\s/g, "").length > 1) res.push("texte coupé : " + (e.className || e.tagName));
      if (!paysage && (e.tagName === "BUTTON" || e.getAttribute("role") === "button") && r.height * z < 34 && !e.closest("[aria-hidden=true], .k-sv-hd-signal")) res.push("bouton trop petit pour un doigt : " + (e.className || e.tagName));
    }
    return res;
  }
  function attendre(ms, suite){ setTimeout(suite, ms); }
  function passerPages(z, progres, fini, attente){
    var i = 0, tous = [];
    (function suivante(){
      if (i >= PAGES.length) return fini(tous);
      var b = racine.querySelector('.k-dock [data-vue="' + PAGES[i] + '"]');
      if (b) b.click();
      progres(i, PAGES.length);
      attendre(attente || 320, function(){
        var d = defauts(z);
        for (var k = 0; k < d.length; k++) tous.push(PAGES[i] + " : " + d[k]);
        i++; suivante();
      });
    })();
  }

  /* Contrôle rapide à chaque ouverture : chaque page s'ouvre-t-elle bien, aux bonnes dimensions, sans défaut ? */
  function controler(z, cb){
    if (!racine.querySelector('.k-dock [data-vue]')) return cb([]);
    enCours = true; statut("Vérification de l’affichage…");
    passerPages(z, function(i, n){ statut("Vérification de l’affichage (" + (i + 1) + "/" + n + ")…"); }, function(d){
      var b = racine.querySelector('.k-dock [data-vue="service"]'); if (b) b.click();
      enCours = false;
      ecrire("pelyo:ecran:dernier", JSON.stringify({ date:new Date().toISOString(), zoom:arrondir(z), pages:PAGES.length, defauts:d.slice(0, 8) }));
      cb(d);
    }, 140);
  }

  /* ------------------------------ écran « Réglage… » ------------------------------ */
  function voile(){
    var v = document.createElement("div");
    v.className = "k-cal"; v.setAttribute("role", "status"); v.setAttribute("aria-live", "polite");
    v.innerHTML = '<div class="k-cal-in"><img src="assets/logo-toque.png" alt="" width="72" height="72"><b>Réglage de l’écran</b><p data-cal-texte>Je vérifie chaque page sur cet écran…</p><div class="k-cal-barre"><i data-cal-barre></i></div></div>';
    document.body.appendChild(v);
    return v;
  }

  /* ------------------------------ réglage complet ------------------------------ */
  function regler(cb){
    if (enCours || !racine) { if (cb) cb(); return; }
    var m = mesurer();
    if (!racine.querySelector('.k-dock [data-vue]')) { appliquer(depart(m)); if (cb) cb(); return; }   /* pas encore connecté : rien à vérifier, mais jamais une taille périmée */
    enCours = true;
    var avecSplash = !!document.getElementById("splash"), v = avecSplash ? null : voile();
    var texte = v ? v.querySelector("[data-cal-texte]") : { textContent:"" }, barre = v ? v.querySelector("[data-cal-barre]") : { style:{} };
    var dire = function(s){ texte.textContent = s; if (avecSplash) statut(s); };
    var base = depart(m), z = base, pas = 0, vus = {}, meilleur = { z:base, note:1e9, n:0 };
    var zmax = m.paysage ? base : (!m.paysage && m.largeur >= 1000 && m.largeur < 1400) ? Math.max(base, Math.min(1.45, m.largeur / 720)) : portraitTablette(m) ? Math.max(base, Math.min(1.7, m.largeur / 520, m.hauteur / 520)) : Math.max(base, Math.min(1.5, m.largeur / 760, m.hauteur / 520)), zmin = Math.max(0.8, base * 0.74), ETAPES = 7;
    function fin(zChoisi, nb){
      var b = racine.querySelector('.k-dock [data-vue="service"]'); if (b) b.click();
      appliquer(zChoisi);
      if (sur_appareil(m)) ecrire(CLE + orientation(m), JSON.stringify({ largeur:m.largeur, hauteur:m.hauteur, dpr:m.dpr, ecranL:m.ecranL, ecranH:m.ecranH, zoom:arrondir(zChoisi), pref:preference(), defauts:nb, note:meilleur.note === 1e9 ? 0 : meilleur.note, date:new Date().toISOString(), v:1 }));
      dire("Écran réglé : " + m.largeur + " × " + m.hauteur + ", taille " + Math.round(zChoisi * 100) + " %.");
      barre.style.width = "100%";
      setTimeout(function(){ if (v && v.parentNode) v.parentNode.removeChild(v); enCours = false; if (cb) cb(); }, avecSplash ? 0 : 350);
    }
    function essai(){
      var cle = String(arrondir(z));
      if (pas >= ETAPES || vus[cle]) return fin(meilleur.z, meilleur.n);
      vus[cle] = true;
      appliquer(z);
      dire("Réglage de l’écran : taille " + Math.round(z * 100) + " %…");
      attendre(260, function(){
        passerPages(z, function(i, n){ barre.style.width = Math.round(((pas + i / n) / ETAPES) * 100) + "%"; }, function(d){
          var nt = note(d);
          if (nt < meilleur.note) meilleur = { z:z, note:nt, n:d.length };
          if (!d.length) return fin(z, 0);
          var deborde = false, petit = false;
          for (var i = 0; i < d.length; i++){ if (/petit/.test(d[i])) petit = !m.paysage; else deborde = true; }   /* en paysage, la mise en page ne se grossit jamais */
          /* Ça dépasse : on réduit. Seulement des boutons trop petits : on agrandit (jusqu'à ce que la mise en page tienne). */
          var suivant = deborde ? z * 0.94 : petit ? z * 1.08 : z;
          if (suivant > zmax) suivant = zmax; if (suivant < zmin) suivant = zmin;
          pas++; z = arrondir(suivant); essai();
        });
      });
    }
    essai();
  }

  /* ------------------------------ démarrage ------------------------------ */
  /* Appelé par l'écran cuisine quand il est affiché et connecté. */
  function demarrer(el, cb){
    racine = el;
    var m = mesurer(), forcer = /[?&]calibrer=1/.test(location.search), mem = memoire(m);
    function fini(){ attendu = false; if (cb) cb(); }
    attendu = true;
    if (!sur_appareil(m)){
      var z0 = depart(m); appliquer(z0);
      return controler(z0, function(d){ if (!d.length) return fini(); regler(fini); });   /* ordinateur : jamais mémorisé */
    }
    if (mem && proche(mem, m) && !forcer){
      appliquer(mem.zoom);
      /* Ouvertures suivantes : la taille est déjà connue, le robot contrôle seulement que tout s'affiche bien. */
      return controler(mem.zoom, function(d){ if (note(d) <= (mem.note || 0)) return fini(); regler(fini); });
    }
    regler(fini);
  }
  /* Le chargement de l'application attend le robot (au plus quelques secondes). */
  function reserver(){ attendu = true; }
  function occupe(){ return attendu || enCours; }
  /* Appelé tout de suite au chargement : la taille mémorisée s'applique avant le premier affichage. */
  function amorcer(){
    var m = mesurer(), mem = memoire(m), dernier = m;
    if (sur_appareil(m) && mem) appliquer(mem.zoom); else appliquer(depart(m));
    window.addEventListener("resize", function(){
      var n = mesurer();
      /* Rotation de la tablette : la bonne taille s'applique TOUT DE SUITE (jamais le zoom du vertical en horizontal), même pendant un réglage. */
      if (n.paysage !== dernier.paysage){
        var mo = memoire(n);
        appliquer(sur_appareil(n) && mo && proche(mo, n) ? mo.zoom : depart(n));
      }
      clearTimeout(minuteurTaille);
      minuteurTaille = setTimeout(function(){
        var ancien = dernier; dernier = n = mesurer();
        if (enCours || !racine) return;
        /* Seule la hauteur a changé (clavier à l'écran, barre d'adresse) : rien à refaire. */
        var memeLargeur = Math.abs(n.largeur - ancien.largeur) / Math.max(1, ancien.largeur) < 0.03;
        var champ = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
        if (n.paysage === ancien.paysage && (memeLargeur || champ)) return;
        var mm = memoire(n);
        if (!sur_appareil(n)){ appliquer(depart(n)); return; }
        if (mm && proche(mm, n)) { appliquer(mm.zoom); return; }
        regler(function(){});
      }, 900);
    });
  }
  function etat(){
    var m = mesurer(), mem = memoire(m);
    return { largeur:m.largeur, hauteur:m.hauteur, orientation:orientation(m), profil:profil(m), zoom:derniere || 1, memorise:!!mem, appareil:sur_appareil(m), pref:preference() };
  }
  function choisirPreference(p){ if (PREFS[p]) ecrire(CLE_PREF, p); else effacer(CLE_PREF); var m = mesurer(); effacer(CLE + orientation(m)); effacer(CLE + (m.paysage ? "portrait" : "paysage")); appliquer(depart(m)); if (racine) regler(function(){}); }
  function refaire(cb){ var m = mesurer(); effacer(CLE + orientation(m)); regler(cb); }

  /* Pour le support : la liste des défauts vus sur chaque page à la taille actuelle. */
  function diagnostic(cb){ if (!racine) return cb([]); passerPages(derniere || 1, function(){}, function(d){ cb(d); }); }

  amorcer();
  return { diagnostic:diagnostic, demarrer:demarrer, attendre:reserver, occupe:occupe, etat:etat, preference:preference, choisirPreference:choisirPreference, refaire:refaire, PREFS:PREFS };
})();
