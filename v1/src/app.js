/* =========================================================================
   Resto IA — noyau du prototype.
   Reprend le fonctionnement de devis60/src/app-html.js : ES5, une IIFE,
   setContent() avec fondu, toast(), navbar rendue à chaque écran, actionbar
   pilotée par l'écran courant. Seule différence : le téléphone porte trois
   applications au lieu d'une, donc openApp() prend un identifiant.
   ========================================================================= */
var RIA = (function(){
  "use strict";

  /* ---------- outils ---------- */
  var $ = function(i){ return document.getElementById(i); };
  var esc = function(s){ return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); };
  var safe = function(f, d){ try { return f(); } catch(e){ return d; } };
  var eur = function(c){ return (c/100).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}) + " €"; };
  var eur0 = function(c){ return Math.round(c/100).toLocaleString('fr-FR') + " €"; };
  var dur = function(s){ return s < 60 ? s + " s" : Math.floor(s/60) + " min " + String(s%60).padStart(2,"0"); };
  var chrono = function(s){ return String(Math.floor(s/60)).padStart(2,"0") + ":" + String(Math.floor(s)%60).padStart(2,"0"); };
  var norm = function(s){ return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,""); };
  /* Un <svg> sans width/height occupe 300x150 px par défaut et fait éclater son
     conteneur. On donne donc une taille d'attribut, que le CSS de devis60
     écrase partout où il en définit une (.navitem svg, .menurow .ico svg…). */
  var svg = function(path, w){
    return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke-width="' + (w || 1.8) + '" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>';
  };

  /* ---------- horloge de la barre d'état ---------- */
  function tick(){
    var d = new Date();
    var t = String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0");
    var n = document.querySelectorAll("[data-clock]");
    for (var i = 0; i < n.length; i++) n[i].textContent = t;
  }

  /* ---------- applications enregistrées ---------- */
  var APPS = [];
  var courante = null;
  var minuteurs = [];

  function register(app){ APPS.push(app); }

  /* Les minuteurs d'un écran sont rangés ici : fermer l'appli les annule tous. */
  function every(fn, ms){ var id = setInterval(fn, ms); minuteurs.push(id); return id; }
  function after(fn, ms){ var id = setTimeout(fn, ms); minuteurs.push(id); return id; }
  function clearTimers(){
    for (var i = 0; i < minuteurs.length; i++){ clearInterval(minuteurs[i]); clearTimeout(minuteurs[i]); }
    minuteurs = [];
  }

  /* ---------- écran d'accueil du téléphone ---------- */
  var DECO = [
    { lbl:"Photos",   bg:"linear-gradient(150deg,#f0a35e,#d24f7c 55%,#8a3fb0)", d:'<rect x="3" y="7" width="18" height="13" rx="3"/><circle cx="12" cy="13.5" r="3.6"/><path d="M8.5 7 10 4h4l1.5 3"/>' },
    { lbl:"Éclair",   bg:"linear-gradient(150deg,#ffe066,#f5c518)", ink:"#2a2003", d:'<path d="M5 20V10a7 7 0 0 1 14 0v10l-2.3-2-2.3 2-2.4-2-2.4 2z"/><path d="M9.5 10h.01M14.5 10h.01"/>' },
    { lbl:"Messages", bg:"linear-gradient(150deg,#63d47f,#1fa84e)", ink:"#04210f", d:'<path d="M4 5h16v11H9l-5 4z"/><path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01"/>' },
    { lbl:"Musique",  bg:"linear-gradient(150deg,#f57d7d,#c62f47)", d:'<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>' },
    { lbl:"Maps",     bg:"linear-gradient(150deg,#7fd6a8,#3f8fd4 70%)", d:'<path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>' },
    { lbl:"Météo",    bg:"linear-gradient(150deg,#7db8ec,#2f6fb5)", d:'<path d="M7 18a4 4 0 0 1 .6-8 5.5 5.5 0 0 1 10.6 1.4A3.6 3.6 0 0 1 17.5 18z"/>' },
    { lbl:"Mail",     bg:"linear-gradient(150deg,#8fc3f0,#2d6fc4)", d:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6 8.5-6"/>' },
    { lbl:"Vidéo",    bg:"linear-gradient(150deg,#2c2c34,#111116)", d:'<rect x="3" y="6" width="12" height="12" rx="3"/><path d="m15 11 6-3.5v9L15 13z"/>' },
    { lbl:"Réglages", bg:"linear-gradient(150deg,#6e6a62,#3a3833)", d:'<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M21 12h-2.5M5.5 12H3M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8M18.4 18.4l-1.8-1.8M7.4 7.4 5.6 5.6"/>' }
  ];
  var DOCK = [
    { lbl:"Téléphone", bg:"linear-gradient(150deg,#63d47f,#1c9c48)", ink:"#04210f", d:'<path d="M6.6 3.5 4 6.1c-.7.7-.9 1.8-.5 2.7a20 20 0 0 0 11.7 11.7c.9.4 2 .2 2.7-.5l2.6-2.6-4.2-2.8-2 1.6a15 15 0 0 1-6.5-6.5l1.6-2z"/>' },
    { lbl:"Messages",  bg:"linear-gradient(150deg,#7db8ec,#2f6fb5)", d:'<path d="M4 5h16v11H9l-5 4z"/>' },
    { lbl:"Notes",     bg:"linear-gradient(150deg,#f3e6b0,#d9b84a)", ink:"#241c05", d:'<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h4"/>' },
    { lbl:"Photos",    bg:"linear-gradient(150deg,#f0a35e,#d24f7c 55%,#8a3fb0)", d:'<rect x="3" y="4.5" width="18" height="15" rx="3"/><circle cx="8.5" cy="9.5" r="1.8"/><path d="m4 17 5-4.5 4.5 4 3-2.5L20 18"/>' }
  ];

  function tuile(o, id){
    return '<button class="appicon"' + (id ? ' data-app="' + id + '"' : ' data-deco="' + esc(o.lbl) + '"') + '>' +
      '<span class="glyph" style="background:' + o.bg + ';color:' + (o.ink || "#fff") + '">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + o.d + '</svg>' +
      '</span>' +
      (o.badge ? '<span class="new-badge">' + esc(o.badge) + '</span>' : '') +
      '<span>' + esc(o.lbl) + '</span></button>';
  }

  function renderHome(){
    var grid = $("iconsgrid");
    grid.innerHTML = APPS.map(function(a){
      return tuile({ lbl:a.nom, bg:a.fond, ink:a.encre, d:a.glyph, badge:a.badge }, a.id);
    }).join("") + DECO.map(function(o){ return tuile(o); }).join("");
    $("dock").innerHTML = DOCK.map(function(o){ return tuile(o); }).join("");

    grid.onclick = function(ev){
      var b = ev.target.closest ? ev.target.closest(".appicon") : null;
      if (!b) return;
      if (b.dataset.app) openApp(b.dataset.app);
      else toast("« " + b.dataset.deco + " » est une icône de décor.");
    };
    $("dock").onclick = function(ev){
      var b = ev.target.closest ? ev.target.closest(".appicon") : null;
      if (b) toast("« " + b.dataset.deco + " » est une icône de décor.");
    };
  }

  /* ---------- ouverture et fermeture d'une application ---------- */
  function openApp(id){
    var app = APPS.filter(function(a){ return a.id === id; })[0];
    if (!app) return;
    courante = app;
    $("appwrap").dataset.app = id;
    $("home").style.display = "none";
    $("appwrap").style.display = "flex";
    renderLanding(app);
  }
  function closeApp(){
    clearTimers();
    closeSheet();
    $("appwrap").style.display = "none";
    $("home").style.display = "flex";
    $("navbar").hidden = true; $("actionbar").hidden = true; $("histBtn").hidden = true;
    courante = null;
    delete $("appwrap").dataset.app;
  }

  /* ---------- écran d'entrée de chaque application ---------- */
  function renderLanding(app){
    clearTimers();
    $("histBtn").hidden = true; $("actionbar").hidden = true; $("navbar").hidden = true;
    setContent(
      '<div class="landing">' +
        '<div class="greet-logo"><span class="glyph" style="width:64px;height:64px;border-radius:19px;display:flex;align-items:center;justify-content:center;background:' + app.fond + ';color:' + (app.encre || "#fff") + '">' +
          '<svg viewBox="0 0 24 24" width="31" height="31" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + app.glyph + '</svg></span></div>' +
        '<h1>' + esc(app.titre) + '</h1>' +
        '<p class="sub">' + esc(app.sub) + '</p>' +
        '<div class="landing-btns">' +
          '<button class="cta" id="btnEntrer">' + esc(app.cta || "Se connecter") + '</button>' +
          '<button class="sec" id="btnCompte">Créer un compte</button>' +
        '</div>' +
        '<button class="landing-demo" id="btnDemo">Voir la démo sans compte</button>' +
      '</div>'
    );
    $("btnEntrer").onclick = function(){ demarrer(app); };
    $("btnDemo").onclick = function(){ demarrer(app); };
    $("btnCompte").onclick = function(){ toast("Prototype : la création de compte n'est pas branchée."); };
  }

  function demarrer(app){
    app.tabs[0].go();
  }

  /* ---------- rendu avec animation d'entrée ---------- */
  function setContent(html){
    var c = $("content");
    c.classList.remove("fadein");
    c.innerHTML = html;
    void c.offsetWidth;
    c.classList.add("fadein");
    marquer();
    return c;
  }

  /* Reprend l'ajout du bandeau d'espace de travail fait par theme.js en prod. */
  function marquer(){
    var bars = document.querySelectorAll(".topbar:not([data-product-header]):not([data-no-workspace])");
    for (var i = 0; i < bars.length; i++){
      bars[i].dataset.productHeader = "true";
      var mark = document.createElement("div");
      mark.className = "ui-workspace-mark";
      mark.innerHTML = '<i></i><span>' + esc(courante ? courante.espace : "RESTO IA") + '</span><em>ASSISTANT ACTIF</em>';
      bars[i].prepend(mark);
    }
  }

  /* ---------- barre d'onglets ---------- */
  function renderNavbar(active){
    if (!courante) return;
    var nb = $("navbar");
    nb.hidden = false;
    nb.dataset.productNav = "true";
    nb.innerHTML = courante.tabs.map(function(t){
      return '<button class="navitem' + (t.id === active ? " on" : "") + '" data-t="' + t.id + '">' +
        svg(t.svg) + '<span>' + esc(t.lbl) + '</span></button>';
    }).join("");
    var btns = nb.querySelectorAll(".navitem");
    for (var i = 0; i < btns.length; i++){
      btns[i].addEventListener("click", function(){
        var id = this.dataset.t;
        var tab = courante.tabs.filter(function(t){ return t.id === id; })[0];
        if (tab){ clearTimers(); tab.go(); }
      });
    }
  }

  /* ---------- fragments communs ---------- */
  function screenHeader(eyebrow, titre, sub){
    return '<div class="topbar"><span class="eyebrow">' + esc(eyebrow) + '</span><h1>' + esc(titre) + '</h1>' +
      (sub ? '<p class="sub">' + esc(sub) + '</p>' : '') + '</div>';
  }
  function backHeader(eyebrow, titre){
    return '<div class="topbar"><div class="backrow">' +
      '<button class="backbtn" data-back>' + svg('<path d="m15 18-6-6 6-6"/>') + '</button>' +
      '<span class="eyebrow">' + esc(eyebrow) + '</span></div><h1>' + esc(titre) + '</h1></div>';
  }
  function menurow(icon, label){
    return '<button class="menurow"><span class="ico">' + svg(icon) + '</span>' +
      '<span class="lbl">' + esc(label) + '</span>' +
      svg('<path d="m9 18 6-6-6-6"/>').replace('<svg ', '<svg class="chev" ') + '</button>';
  }
  function chip(txt, icon){
    return '<span class="chip">' + (icon ? svg(icon) : "") + esc(txt) + '</span>';
  }
  function pill(txt, tone){
    return '<span class="pill ' + (tone || "") + '">' + esc(txt) + '</span>';
  }
  function stat(valeur, libelle){
    return '<div class="stat"><div class="v">' + esc(valeur) + '</div><div class="l">' + esc(libelle) + '</div></div>';
  }
  function note(txt){ return '<p class="note">' + txt + '</p>'; }
  /* Les actions d'un écran descendent dans le flux du contenu : elles défilent
     avec lui au lieu d'occuper un bandeau fixe. Seule une vraie barre de
     saisie (le composer de l'appel en direct, ses réponses rapides) reste
     collée en bas, là où on l'attend. */
  function actionbar(html){
    var a = $("actionbar"), c = $("content"), vieux = c.querySelector(".ctabar");
    if (vieux) vieux.parentNode.removeChild(vieux);
    if (!html){ a.hidden = true; a.innerHTML = ""; return a; }
    if (html.indexOf("composer") !== -1 || html.indexOf("quickreplies") !== -1){
      a.hidden = false; a.innerHTML = html; return a;
    }
    a.hidden = true; a.innerHTML = "";
    var boite = document.createElement("div");
    boite.innerHTML = html;
    var barre = boite.querySelector(".ctabar") || boite.firstElementChild;
    if (barre) c.appendChild(barre);
    return c;
  }

  /* ---------- feuille coulissante (reprise de openDevisSheet dans devis60) ----------
     L'enveloppe est créée puis retirée du DOM : la couche visuelle de production
     lui applique un backdrop-filter, qui flouterait tout l'écran si on la
     laissait en permanence. */
  function sheet(titre, html){
    closeSheet();
    var wrap = document.createElement("div");
    wrap.className = "docsheetOv";
    wrap.id = "sheetOv";
    wrap.innerHTML =
      '<div class="docsheet" id="sheet">' +
        '<div class="docsheet-bar"><b>' + esc(titre) + '</b>' +
        '<button class="backbtn" data-closesheet>' + svg('<path d="M6 6l12 12M18 6 6 18"/>') + '</button></div>' +
        '<div class="docsheet-body">' + html + '</div>' +
      '</div>';
    $("viewport").appendChild(wrap);
    wrap.addEventListener("click", function(ev){
      if (ev.target === wrap || (ev.target.closest && ev.target.closest("[data-closesheet]"))) closeSheet();
    });
    void wrap.offsetWidth;
    wrap.classList.add("on");
    return wrap.querySelector(".docsheet-body");
  }
  function closeSheet(){
    var w = $("sheetOv");
    if (!w) return;
    w.classList.remove("on");
    setTimeout(function(){ if (w.parentNode) w.parentNode.removeChild(w); }, 280);
  }

  /* ---------- toast ---------- */
  var toastT = null;
  function toast(msg){
    var t = $("toast");
    t.textContent = msg; t.classList.add("on");
    clearTimeout(toastT);
    toastT = setTimeout(function(){ t.classList.remove("on"); }, 2200);
  }

  /* ---------- démarrage ---------- */
  function boot(){
    tick(); setInterval(tick, 20000);
    renderHome();
    $("homeind").addEventListener("click", closeApp);
    $("content").addEventListener("click", function(ev){
      if (ev.target.closest && ev.target.closest("[data-back]")) {
        if (courante) { clearTimers(); courante.tabs[0].go(); }
      }
    });
    document.addEventListener("keydown", function(ev){
      if (ev.key === "Escape"){ if ($("sheetOv")) closeSheet(); else closeApp(); }
    });
  }

  return {
    boot:boot, register:register, toast:toast, setContent:setContent,
    renderNavbar:renderNavbar, screenHeader:screenHeader, backHeader:backHeader,
    menurow:menurow, chip:chip, pill:pill, stat:stat, note:note, actionbar:actionbar,
    sheet:sheet, closeSheet:closeSheet, openApp:openApp, closeApp:closeApp,
    $:$, esc:esc, safe:safe, eur:eur, eur0:eur0, dur:dur, chrono:chrono, norm:norm, svg:svg,
    every:every, after:after, clearTimers:clearTimers,
    app:function(){ return courante; }
  };
})();
