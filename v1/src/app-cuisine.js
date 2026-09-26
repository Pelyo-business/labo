/* =========================================================================
   Resto IA — application CUISINE (écran de préparation, KDS).
   Section 4 du business plan v1.7 : file des commandes, tickets ESC/POS,
   ruptures produit et niveau de charge.
   Même forme que devis60 : ES5, une IIFE, aucune classe CSS nouvelle.
   ========================================================================= */
(function(){
  "use strict";

  var $ = RIA.$, esc = RIA.esc, eur = RIA.eur, svg = RIA.svg;

  /* ---------- chemins d'icônes (aucun style, uniquement du tracé) ---------- */
  var ICO = {
    feu:     '<path d="M12 3c0 4 3 4.6 3 8a3 3 0 0 1-6 0c0-1.4.6-2.1.6-2.1S8 10.6 8 13a4 4 0 0 0 8 0c0-4.2-4-6-4-10z"/>',
    ticket:  '<path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2 2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4z"/><path d="M12 6v12"/>',
    rupture: '<path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4z"/><path d="M5 5l14 14"/>',
    jauge:   '<path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4.5-5.5"/>',
    cloche:  '<path d="M6 16v-5a6 6 0 1 1 12 0v5l1.6 2.6H4.4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    imprim:  '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="7" rx="2"/><path d="M7 14h10v6H7z"/>',
    moto:    '<circle cx="5.5" cy="17" r="3"/><circle cx="18.5" cy="17" r="3"/><path d="M8.5 17h6l3-7h-4"/><path d="M6 10h4l2.2 3.4"/>',
    sac:     '<path d="M6 8h12l-1.2 12H7.2z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    horloge: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.2 2"/>',
    alerte:  '<path d="M12 4 3 19h18z"/><path d="M12 10v4M12 17h.01"/>',
    check:   '<path d="m4 12.5 5.5 5.5L20 6.5"/>',
    croix:   '<path d="M6 6l12 12M18 6 6 18"/>',
    plat:    '<path d="M4 15h16"/><path d="M5.2 15a6.8 6.8 0 0 1 13.6 0"/><path d="M12 5.5V8"/>',
    tel:     '<path d="M6.6 3.5 4 6.1c-.7.7-.9 1.8-.5 2.7a20 20 0 0 0 11.7 11.7c.9.4 2 .2 2.7-.5l2.6-2.6-4.2-2.8-2 1.6a15 15 0 0 1-6.5-6.5l1.6-2z"/>',
    stop:    '<circle cx="12" cy="12" r="9"/><path d="M9.2 9.2h5.6v5.6H9.2z"/>',
    plus:    '<path d="M12 5v14M5 12h14"/>'
  };

  /* ---------- état local de l'écran de cuisine ---------- */
  var filtre        = "tout";
  var chargeId      = D.resto.charge;
  var delaiRetrait  = null;
  var delaiLivr     = null;
  var capacite      = 12;
  var repriseA      = "";
  var ticketSel     = 248;
  var vueModif      = false;
  var catStop       = {};
  var reglages = {
    son:true, autoConf:true, autoModif:true, autoAnnul:false,
    imprimante:"Epson TM-m30 — comptoir"
  };
  var IMPRIMANTES = [
    "Epson TM-m30 — comptoir",
    "Star mC-Print3 — plonge",
    "Sunmi V2 — cloud print",
    "Aucune — repli SMS au gérant"
  ];
  var audio     = null;
  var seq       = 252;
  var arrivee_t = 0;
  var FILE_A_VENIR = [
    { id:0, etat:"confirmee", mode:"retrait", client:"Inès", paiement:"Sur place",
      lignes:[ { q:1, nom:"Tacos M", opt:"Kebab · sauce blanche · frites + Coca", dem:"Sans oignons", sup:"Double viande", prix:1150 } ],
      total:1150 },
    { id:0, etat:"confirmee", mode:"livraison", client:"Bastien", paiement:"Espèces au livreur",
      adresse:"51 rue Chevreul, 4e étage sans ascenseur, digicode 12B04", km:1.6, frais:250,
      lignes:[ { q:2, nom:"Pizza 4 fromages", opt:"Tomate · moyenne", dem:"Coupée en 8", prix:2300 },
               { q:2, nom:"Boisson 33 cl", opt:"Coca", dem:"", prix:360 } ],
      total:2660 }
  ];

  /* ---------- préparation des données de départ ---------- */
  function init(){
    var lvl = niveau();
    if (delaiRetrait === null) delaiRetrait = lvl.delai;
    if (delaiLivr === null)    delaiLivr    = lvl.delai + 20;
    for (var i = 0; i < D.commandes.length; i++){
      var c = D.commandes[i];
      if (typeof c.chrono !== "number") c.chrono = (c.etat === "preparation") ? 312 : 0;
      if (c.etat === "attente" && typeof c.expireMax !== "number") c.expireMax = 120;
      if (typeof c.depuis !== "number") c.depuis = 0;
    }
  }

  function niveau(){
    var l = D.charges.filter(function(x){ return x.id === chargeId; })[0];
    return l || D.charges[0];
  }
  function stoppe(){ return chargeId === "stop"; }

  /* ---------- petits utilitaires ---------- */
  function hhmm(d){ return String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0"); }
  function dans(min){ return hhmm(new Date(Date.now() + min * 60000)); }
  function cmdById(id){ return D.commandes.filter(function(c){ return String(c.id) === String(id); })[0]; }
  function articles(c){
    var n = 0;
    for (var i = 0; i < c.lignes.length; i++) n += c.lignes[i].q;
    return n;
  }
  function resume(c){
    if (!c.lignes.length) return "Panier vide — l'IA est encore en ligne";
    return c.lignes.map(function(l){ return l.q + "× " + l.nom; }).join(" · ");
  }
  function modeLbl(c){ return c.mode === "livraison" ? "Livraison" : "Retrait"; }
  function etatInfo(c){
    if (c.etat === "appel")       return { lbl:"IA en appel",     tone:"attente" };
    if (c.etat === "attente")     return { lbl:"À confirmer",     tone:"attente" };
    if (c.etat === "confirmee")   return { lbl:"À préparer",      tone:"signe"   };
    if (c.etat === "preparation") return { lbl:"En préparation",  tone:"attente" };
    if (c.etat === "prete")       return { lbl:c.mode === "livraison" ? "Prête — livreur" : "Prête — comptoir", tone:"signe" };
    if (c.etat === "terminee")    return { lbl:c.fin || "Terminée", tone:"signe" };
    return { lbl:"Expirée", tone:"refuse" };
  }
  function boutonEtat(c){
    if (c.etat === "confirmee")   return "Commencer";
    if (c.etat === "preparation") return c.mode === "livraison" ? "Prête pour le livreur" : "Prête";
    if (c.etat === "prete")       return c.mode === "livraison" ? "Livrée" : "Récupérée";
    return "";
  }
  function compte(etat){ return D.commandes.filter(function(c){ return c.etat === etat; }).length; }

  /* bip WebAudio court — jamais de fichier externe */
  function bip(){
    if (!reglages.son) return;
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audio) audio = new Ctx();
      if (audio.state === "suspended" && audio.resume) audio.resume();
      var t = audio.currentTime;
      for (var k = 0; k < 2; k++){
        var o = audio.createOscillator(), g = audio.createGain();
        o.type = "square";
        o.frequency.setValueAtTime(k ? 1174 : 880, t + k * 0.16);
        g.gain.setValueAtTime(0.0001, t + k * 0.16);
        g.gain.exponentialRampToValueAtTime(0.16, t + k * 0.16 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + k * 0.16 + 0.13);
        o.connect(g); g.connect(audio.destination);
        o.start(t + k * 0.16); o.stop(t + k * 0.16 + 0.15);
      }
    } catch(e){}
  }

  /* =======================================================================
     ONGLET 1 — FILE
     ======================================================================= */
  function goFile(){
    init();
    RIA.clearTimers();
    RIA.renderNavbar("file");
    if (!arrivee_t) arrivee_t = Date.now() + 21000;
    paintFile();
    RIA.every(battement, 1000);
  }

  function familles(){
    return [
      { id:"encoursappel", h:"En ligne et à confirmer", etats:["appel","attente"] },
      { id:"afaire",       h:"À préparer",              etats:["confirmee"] },
      { id:"encours",      h:"En préparation",          etats:["preparation"] },
      { id:"pretes",       h:"Prêtes",                  etats:["prete"] },
      { id:"finies",       h:"Terminées",               etats:["terminee"] },
      { id:"expirees",     h:"Annulées et expirées — aucune préparation", etats:["expiree"] }
    ];
  }

  function visibles(fam){
    if (filtre === "tout")   return fam.id !== "finies";
    if (filtre === "finies") return fam.id === "finies" || fam.id === "expirees";
    return fam.id === filtre;
  }

  function tiroir(titre, liste){
    if (!liste.length) return "";
    return '<details class="calcdetail"><summary>' + esc(titre) +
      svg('<path d="m6 9 6 6 6-6"/>') + '</summary><div class="calcbody">' +
      liste.map(carteHtml).join("") + '</div></details>';
  }

  function paintFile(){
    var lvl = niveau();
    var onglets = [
      { id:"tout",    lbl:"Tout",     n:D.commandes.filter(function(c){ return c.etat !== "terminee"; }).length },
      { id:"afaire",  lbl:"À faire",  n:compte("confirmee") },
      { id:"encours", lbl:"En cours", n:compte("preparation") },
      { id:"pretes",  lbl:"Prêtes",   n:compte("prete") },
      { id:"finies",  lbl:"Finies",   n:compte("terminee") + compte("expiree") }
    ];
    var tabs = '<div class="journaltabs">' + onglets.map(function(o){
      return '<button class="jtab' + (filtre === o.id ? " on" : "") + '" data-f="' + o.id + '">' +
        esc(o.lbl) + '<span class="jn">' + o.n + '</span></button>';
    }).join("") + '</div>';

    var stats = '<div class="stats">' +
      RIA.stat(String(compte("confirmee")), "À préparer") +
      RIA.stat(String(compte("preparation")), "En cours") +
      RIA.stat(String(compte("prete")), "Prêtes") +
      RIA.stat(stoppe() ? "—" : delaiRetrait + " min", "Délai annoncé") +
      '</div>';

    var bandeaux = "";
    if (stoppe()){
      bandeaux += '<div class="alert-banner">' + svg(ICO.stop) +
        '<span><b>Commandes stoppées.</b> L\'IA n\'enregistre plus rien et annonce une reprise à ' +
        esc(repriseA || dans(30)) + '. Elle continue de répondre aux questions.</span></div>';
    }
    var corps = "";
    var fams = familles();
    if (filtre === "tout"){
      var attente = D.commandes.filter(function(c){ return c.etat === "appel" || c.etat === "attente"; });
      var actives = D.commandes.filter(function(c){ return ["confirmee","preparation","prete"].indexOf(c.etat) >= 0; });
      var expirees = D.commandes.filter(function(c){ return c.etat === "expiree"; });
      corps += tiroir(attente.length + " à confirmer — ne pas préparer", attente);
      if (actives.length){
        corps += '<div class="fam" data-active-orders><div class="fam-h">Production — ' + actives.length + '</div>' +
          actives.map(carteHtml).join("") + '</div>';
      }
      corps += tiroir(expirees.length + " annulée(s) / expirée(s)", expirees);
    } else {
      for (var i = 0; i < fams.length; i++){
        var f = fams[i];
        if (!visibles(f)) continue;
        var liste = D.commandes.filter(function(c){ return f.etats.indexOf(c.etat) >= 0; });
        if (!liste.length) continue;
        corps += '<div class="fam" data-active-orders><div class="fam-h">' + esc(f.h) + ' — ' + liste.length + '</div>' +
          liste.map(carteHtml).join("") + '</div>';
      }
    }
    if (!corps) corps = '<div class="empty">Rien dans ce filtre.<br>La file se remplit toute seule dès qu\'une commande est confirmée.</div>';

    RIA.setContent(
      '<div data-kitchen-queue>' +
        '<div class="topbar" data-no-workspace><h1>' + esc(D.resto.nom) + '</h1>' +
          '<div class="chip-row">' + RIA.pill("Cuisine · " + lvl.nom, lvl.pill) + '</div></div>' +
        stats + tabs + bandeaux + '<div class="body">' + corps + '</div>' +
      '</div>'
    );

    var jt = $("content").querySelectorAll(".jtab");
    for (var a = 0; a < jt.length; a++){
      jt[a].addEventListener("click", function(){ filtre = this.dataset.f; paintFile(); });
    }
    var cards = $("content").querySelectorAll(".card");
    for (var b = 0; b < cards.length; b++){
      cards[b].addEventListener("click", function(ev){
        if (ev.target.closest && ev.target.closest("[data-act]")) return;
        ouvrirDetail(cmdById(this.dataset.cmd));
      });
    }
    var acts = $("content").querySelectorAll("[data-act]");
    for (var d = 0; d < acts.length; d++){
      acts[d].addEventListener("click", function(ev){
        ev.stopPropagation();
        avancer(cmdById(this.dataset.act));
      });
    }
    barreFile();
  }

  function carteHtml(c){
    var e = etatInfo(c);
    var haut = '<div class="row1">' +
      '<div><div class="who">#' + c.id + (c.client ? " · " + esc(c.client) : " · appel en cours") + '</div>' +
      '<div class="job">' + modeLbl(c) + (c.prete ? " · " + esc(c.prete) : "") + '</div></div>' +
      RIA.pill(e.lbl, e.tone) + '</div>';

    var bas = '<div class="row2"><span class="date">reçue ' + esc(c.heure || "—") +
      (c.mode === "livraison" && c.km ? " · " + String(c.km).replace(".", ",") + " km" : "") + '</span>' +
      '<span class="amount">' + eur(c.total + (c.mode === "livraison" ? (c.frais || 0) : 0)) + '</span></div>';

    var milieu = c.lignes.length ? c.lignes.map(function(l){
      var sous = [l.opt, l.sup ? "+ " + l.sup : "", l.dem].filter(function(x){ return !!x; }).join(" · ");
      return '<div class="line"><span class="n"><b>' + l.q + '× ' + esc(l.nom) + '</b>' +
        (sous ? '<small>' + esc(sous) + '</small>' : "") + '</span></div>';
    }).join("") : '<div class="job">Panier en cours de création.</div>';

    if (c.mode === "livraison" && c.adresse){
      milieu += '<div class="job">' + esc(c.adresse) + '</div>';
    }

    if (c.etat === "appel"){
      milieu = '<div class="job">L\'assistant est en ligne depuis <b id="cui-a-' + c.id + '">' +
        RIA.dur(c.depuis) + '</b>. Aucun ticket tant que le client n\'a pas confirmé.</div>';
    }
    if (c.etat === "attente"){
      var pct = Math.max(0, Math.min(100, Math.round(c.expire / c.expireMax * 100)));
      milieu += '<div class="charge-wrap"><span class="charge-lbl" id="cui-e-' + c.id + '">' + RIA.chrono(c.expire) + '</span>' +
        '<div class="charge-bar"><div class="charge-fill ' + tonBarre(pct) + '" id="cui-b-' + c.id + '" style="width:' + pct + '%"></div></div></div>';
    }
    if (c.etat === "preparation"){
      milieu += '<div class="row2"><span class="date">en cuisine depuis <b id="cui-c-' + c.id + '">' + RIA.chrono(c.chrono) + '</b></span>' +
        '<span class="date">' + articles(c) + ' article' + (articles(c) > 1 ? "s" : "") + '</span></div>';
    }
    if (c.etat === "expiree"){
      milieu += '<div class="job">' + esc(c.motif || "Aucune validation du client") + ' — ne jamais mélanger avec les commandes actives.</div>';
    }

    var btn = boutonEtat(c);
    var action = btn ? '<button class="cta" data-act="' + c.id + '">' + svg(ICO.check) + esc(btn) + '</button>' : "";

    return '<div class="card" data-cmd="' + c.id + '">' + haut + bas + '<div>' + milieu + '</div>' + action + '</div>';
  }

  function tonBarre(pct){ return pct > 55 ? "ok" : (pct > 22 ? "haut" : "bas"); }

  /* battement de seconde : compte à rebours, chronomètre, arrivée automatique */
  function battement(){
    var refaire = false;
    for (var i = 0; i < D.commandes.length; i++){
      var c = D.commandes[i];
      if (c.etat === "appel"){
        c.depuis++;
        var ea = $("cui-a-" + c.id); if (ea) ea.textContent = RIA.dur(c.depuis);
      } else if (c.etat === "attente"){
        c.expire--;
        if (c.expire <= 0){
          c.etat = "expiree";
          c.motif = "Aucune validation du client — panier abandonné après 2 minutes";
          RIA.toast("Commande #" + c.id + " expirée — rien à préparer");
          refaire = true;
        } else {
          var pct = Math.max(0, Math.round(c.expire / c.expireMax * 100));
          var el = $("cui-e-" + c.id); if (el) el.textContent = RIA.chrono(c.expire);
          var eb = $("cui-b-" + c.id);
          if (eb){ eb.style.width = pct + "%"; eb.className = "charge-fill " + tonBarre(pct); }
        }
      } else if (c.etat === "preparation"){
        c.chrono++;
        var ec = $("cui-c-" + c.id); if (ec) ec.textContent = RIA.chrono(c.chrono);
      }
    }
    if (arrivee_t && Date.now() >= arrivee_t){
      nouvelleCommande();
      refaire = true;
    }
    if (refaire) paintFile();
  }

  function nouvelleCommande(){
    var modele = FILE_A_VENIR.shift();
    arrivee_t = FILE_A_VENIR.length ? Date.now() + 48000 : 0;
    if (!modele) return;
    var c = {
      id: seq++, etat:"confirmee", mode:modele.mode, client:modele.client,
      heure: hhmm(new Date()),
      prete: dans(modele.mode === "livraison" ? delaiLivr : delaiRetrait),
      lignes: modele.lignes, total: modele.total, paiement: modele.paiement,
      adresse: modele.adresse, km: modele.km, frais: modele.frais,
      imprime: false, chrono:0, depuis:0
    };
    D.commandes.unshift(c);
    bip();
    if (reglages.autoConf) c.imprime = true;
    var app = RIA.app(); if (app) app.badge = String(compte("confirmee") + compte("preparation"));
    RIA.toast("Nouvelle commande #" + c.id + " — " + modeLbl(c).toLowerCase() +
      (reglages.autoConf ? " · ticket imprimé" : ""));
  }

  function avancer(c){
    if (!c) return;
    if (c.etat === "confirmee"){
      c.etat = "preparation"; c.chrono = 0;
      RIA.toast("Commande #" + c.id + " en préparation");
    } else if (c.etat === "preparation"){
      c.etat = "prete";
      RIA.toast(c.mode === "livraison" ? "Commande #" + c.id + " prête pour le livreur" : "Commande #" + c.id + " prête au comptoir");
    } else if (c.etat === "prete"){
      c.etat = "terminee";
      c.fin = c.mode === "livraison" ? "Livrée" : "Récupérée";
      RIA.toast("Commande #" + c.id + " " + c.fin.toLowerCase());
    } else return;
    var app = RIA.app(); if (app) app.badge = String(compte("confirmee") + compte("preparation"));
    RIA.closeSheet();
    paintFile();
  }

  function prochaineAction(){
    var ordre = ["confirmee","preparation","prete"];
    for (var i = 0; i < ordre.length; i++){
      var l = D.commandes.filter(function(c){ return c.etat === ordre[i]; });
      if (l.length) return l[l.length - 1];
    }
    return null;
  }

  function barreFile(){
    var p = prochaineAction();
    var lvl = niveau();
    RIA.actionbar(
      '<div class="ctabar">' +
        '<button class="cta" id="cuiGo">' + svg(ICO.feu) +
          (p ? esc(boutonEtat(p)) + " — #" + p.id : "Rien à lancer pour l'instant") + '</button>' +
        '<div class="secrow">' +
          '<button class="sec" id="cuiSon">' + svg(ICO.cloche) + (reglages.son ? "Alerte sonore" : "Alerte coupée") + '</button>' +
          '<button class="sec" id="cuiCharge">' + svg(ICO.jauge) + esc(lvl.nom) + (stoppe() ? "" : " · " + delaiRetrait + " min") + '</button>' +
        '</div>' +
      '</div>'
    );
    $("cuiGo").addEventListener("click", function(){
      if (p) avancer(p); else RIA.toast("Aucune commande à faire avancer.");
    });
    $("cuiSon").addEventListener("click", function(){
      reglages.son = !reglages.son;
      RIA.toast(reglages.son ? "Alerte sonore activée" : "Alerte sonore coupée");
      if (reglages.son) bip();
      barreFile();
    });
    $("cuiCharge").addEventListener("click", goCharge);
  }

  /* ---------- feuille de détail d'une commande ---------- */
  function ouvrirDetail(c){
    if (!c) return;
    var e = etatInfo(c);
    var liv = c.mode === "livraison";
    var infos = '<div class="acctinfo">' +
      '<div class="acctrow"><span>Client</span><span>' + esc(c.client || "non communiqué") + '</span></div>' +
      '<div class="acctrow"><span>Mode</span><span>' + modeLbl(c) + '</span></div>' +
      '<div class="acctrow"><span>Reçue</span><span>' + esc(c.heure || "—") + '</span></div>' +
      '<div class="acctrow"><span>Heure annoncée</span><span>' + esc(c.prete || "à confirmer") + '</span></div>' +
      (liv ? '<div class="acctrow"><span>Adresse</span><span>' + esc(c.adresse || "—") + '</span></div>' +
             '<div class="acctrow"><span>Distance par la route</span><span>' + esc(String(c.km || "—")) + ' km</span></div>' +
             '<div class="acctrow"><span>Frais de livraison</span><span>' + eur(c.frais || 0) + '</span></div>' : "") +
      '<div class="acctrow"><span>Paiement</span><span>' + esc(c.paiement || "à confirmer") + '</span></div>' +
      '</div>';

    var lignes = c.lignes.length ? '<div class="lines">' + c.lignes.map(function(l){
      var sous = [];
      if (l.opt) sous.push(esc(l.opt));
      if (l.sup) sous.push("supplément " + esc(l.sup));
      if (l.dem) sous.push("demande : " + esc(l.dem));
      return '<div class="line"><span class="n">' + l.q + '× ' + esc(l.nom) +
        (sous.length ? '<small>' + sous.join(" · ") + '</small>' : "") +
        '</span><span class="v">' + eur(l.prix) + '</span></div>';
    }).join("") +
      (liv ? '<div class="line"><span class="n">Frais de livraison<small>' + esc(D.livraison.rayon) + ' de rayon</small></span><span class="v">' + eur(c.frais || 0) + '</span></div>' : "") +
      '<div class="line"><span class="n"><b>Total de la commande</b></span><span class="v">' + eur(c.total + (liv ? (c.frais || 0) : 0)) + '</span></div>' +
      '</div>' : '<div class="empty">Panier provisoire — l\'assistant est encore en ligne.</div>';

    var btn = boutonEtat(c);
    var barre = '<div class="ctabar">' +
      (btn ? '<button class="cta" data-sheetact="' + c.id + '">' + svg(ICO.check) + esc(btn) + '</button>' : "") +
      '<div class="secrow">' +
        (c.etat === "attente" || c.etat === "appel" || c.etat === "expiree" ? "" :
          '<button class="sec" data-sheetticket="' + c.id + '">' + svg(ICO.ticket) + 'Voir le ticket</button>') +
        '<button class="sec" data-sheetclose>' + svg(ICO.croix) + 'Fermer</button>' +
      '</div></div>';

    RIA.sheet("Commande #" + c.id,
      '<div class="chip-row">' + RIA.pill(e.lbl, e.tone) +
        RIA.chip(modeLbl(c), liv ? ICO.moto : ICO.sac) +
        RIA.chip(c.prete ? "prête " + c.prete : "à confirmer", ICO.horloge) +
      '</div>' + infos + lignes +
      (c.etat === "attente" ? RIA.note("<b>Pas de ticket de préparation.</b> " + esc(D.regles.confirmation)) : "") +
      (liv ? RIA.note("<b>Paiement au livreur.</b> " + esc(D.regles.paiement)) : "") +
      (c.etat === "expiree" ? RIA.note("<b>Commande expirée.</b> " + esc(c.motif || "")) : "") +
      barre);

    var s = $("sheet");
    var go = s.querySelector("[data-sheetact]");
    if (go) go.addEventListener("click", function(){ avancer(cmdById(this.dataset.sheetact)); });
    var tk = s.querySelector("[data-sheetticket]");
    if (tk) tk.addEventListener("click", function(){
      ticketSel = parseInt(this.dataset.sheetticket, 10);
      vueModif = false;
      RIA.closeSheet();
      goTickets();
    });
    var cl = s.querySelector("[data-sheetclose]");
    if (cl) cl.addEventListener("click", RIA.closeSheet);
  }

  /* =======================================================================
     ONGLET 2 — TICKETS
     ======================================================================= */
  function imprimables(){
    return D.commandes.filter(function(c){
      return ["confirmee","preparation","prete","terminee"].indexOf(c.etat) >= 0;
    });
  }

  function supPrix(nom){
    for (var i = 0; i < D.menu.length; i++){
      for (var j = 0; j < D.menu[i].items.length; j++){
        var s = D.menu[i].items[j].sup || [];
        for (var k = 0; k < s.length; k++) if (s[k].nom === nom) return s[k].prix;
      }
    }
    return 100;
  }

  function goTickets(){
    init();
    RIA.clearTimers();
    RIA.renderNavbar("tickets");
    paintTickets();
  }

  function paintTickets(){
    var liste = imprimables();
    if (!liste.filter(function(c){ return c.id === ticketSel; }).length && liste.length) ticketSel = liste[0].id;
    var c = cmdById(ticketSel);

    var choix = '<div class="chip-row">' + liste.map(function(x){
      return '<button class="chip" data-tk="' + x.id + '">#' + x.id + ' · ' + esc(x.client || "—") +
        (x.imprime ? " ✓" : "") + '</button>';
    }).join("") + '</div>';

    var apercu = c ? ticketHtml(c, vueModif) :
      '<div class="empty">Aucune commande confirmée : rien à imprimer.<br>Un panier jaune non confirmé ne produit jamais de ticket.</div>';

    var etats = '<div class="acctinfo">' +
      basculeRow("son",       "Alerte sonore",                      reglages.son) +
      basculeRow("autoConf",  "Impression auto des confirmées",     reglages.autoConf) +
      basculeRow("autoModif", "Impression des modifications",       reglages.autoModif) +
      basculeRow("autoAnnul", "Impression des annulations",         reglages.autoAnnul) +
      '<div class="acctrow"><span>Imprimante</span><span>' + esc(reglages.imprimante) + '</span></div>' +
      '</div>';

    var menu = '<div class="menu">' +
      RIA.menurow(ICO.imprim, "Choisir l'imprimante") +
      RIA.menurow(ICO.cloche, "Tester l'imprimante et le bip") +
      RIA.menurow(ICO.ticket, "Règle de modification") +
      '</div>';

    var pack = '<div class="factcard"><span class="fc-ico">' + svg(ICO.imprim) + '</span>' +
      '<span class="fc-info"><span class="fc-title">Pack imprimante — 79 €</span>' +
      '<span class="fc-sub">ESC/POS 80 mm, WebSockets ou Cloud Print, prévu si le restaurant ne possède rien.</span></span>' +
      '<button class="fc-btn" id="tkPack">Demander</button></div>';

    RIA.setContent(
      RIA.screenHeader("Impression", "Tickets de cuisine", "Ticket ESC/POS de la commande confirmée.") +
      choix +
      '<div class="alert-banner">' + svg(ICO.alerte) +
        '<span>L\'écran continue de fonctionner sans imprimante. Pour les micro-structures, le ticket part en <b>repli SMS ou WhatsApp au gérant</b>.</span></div>' +
      '<div class="docwrap">' + apercu + '</div>' +
      etats + menu +
      '<div class="body">' + pack + '</div>' +
      RIA.note("<b>Réimpression.</b> Après une première impression le bouton devient « Réimprimer le ticket » : papier manquant, ticket perdu, ou seconde copie pour le comptoir.")
    );

    var chips = $("content").querySelectorAll("[data-tk]");
    for (var i = 0; i < chips.length; i++){
      chips[i].addEventListener("click", function(){
        ticketSel = parseInt(this.dataset.tk, 10); vueModif = false; paintTickets();
      });
    }
    var tog = $("content").querySelectorAll("[data-bas]");
    for (var j = 0; j < tog.length; j++){
      tog[j].addEventListener("click", function(){
        var k = this.dataset.bas;
        reglages[k] = !reglages[k];
        RIA.toast((this.dataset.lbl || "Réglage") + " : " + (reglages[k] ? "activée" : "désactivée"));
        if (k === "son" && reglages.son) bip();
        paintTickets();
      });
    }
    var rows = $("content").querySelectorAll(".menurow");
    rows[0].addEventListener("click", choisirImprimante);
    rows[1].addEventListener("click", function(){
      bip();
      RIA.toast("Test envoyé à " + reglages.imprimante);
    });
    rows[2].addEventListener("click", function(){
      RIA.sheet("Modification de commande",
        RIA.note(esc(D.regles.modification)) +
        RIA.note("<b>Jamais deux commandes.</b> Le panier est corrigé, l'ancien récapitulatif est invalidé, un nouveau SMS part au client.") +
        '<div class="ctabar"><button class="cta" data-sheetclose>Compris</button></div>');
      $("sheet").querySelector("[data-sheetclose]").addEventListener("click", RIA.closeSheet);
    });
    $("tkPack").addEventListener("click", function(){
      RIA.toast("Pack imprimante 79 € — demande transmise au gérant");
    });

    barreTickets(c);
  }

  function basculeRow(cle, libelle, actif){
    return '<div class="acctrow"><span>' + esc(libelle) + '</span>' +
      '<button class="pill ' + (actif ? "signe" : "refuse") + '" data-bas="' + cle + '" data-lbl="' + esc(libelle) + '">' +
      (actif ? "Activée" : "Coupée") + '</button></div>';
  }

  function choisirImprimante(){
    RIA.sheet("Choisir l'imprimante",
      '<div class="menu">' + IMPRIMANTES.map(function(p){ return RIA.menurow(ICO.imprim, p); }).join("") + '</div>' +
      RIA.note("Technologie envisagée : <b>ESC/POS via WebSockets ou Cloud Print</b>.") +
      '<div class="ctabar"><button class="cta" data-sheetclose>Fermer</button></div>');
    var rows = $("sheet").querySelectorAll(".menurow");
    for (var i = 0; i < rows.length; i++){
      (function(nom){
        rows[i].addEventListener("click", function(){
          reglages.imprimante = nom;
          RIA.closeSheet();
          RIA.toast("Imprimante : " + nom);
          paintTickets();
        });
      })(IMPRIMANTES[i]);
    }
    $("sheet").querySelector("[data-sheetclose]").addEventListener("click", RIA.closeSheet);
  }

  function barreTickets(c){
    if (!c){
      RIA.actionbar('<div class="ctabar"><button class="cta" id="tkVide">' + svg(ICO.ticket) + 'Aucun ticket à imprimer</button></div>');
      $("tkVide").addEventListener("click", function(){ RIA.toast("Rien de confirmé : aucun ticket de préparation."); });
      return;
    }
    RIA.actionbar(
      '<div class="ctabar">' +
        '<button class="cta" id="tkPrint">' + svg(ICO.imprim) + (c.imprime ? "Réimprimer le ticket" : "Imprimer le ticket") + '</button>' +
        '<div class="secrow">' +
          '<button class="sec" id="tkModif">' + svg(ICO.ticket) + (vueModif ? "Ticket normal" : "Ticket de modification") + '</button>' +
          '<button class="sec" id="tkFile">' + svg(ICO.feu) + 'Revenir à la file</button>' +
        '</div>' +
      '</div>'
    );
    $("tkPrint").addEventListener("click", function(){
      var premier = !c.imprime;
      c.imprime = true;
      if (reglages.son) bip();
      RIA.toast("Envoi ESC/POS vers " + reglages.imprimante + "…");
      RIA.after(function(){
        RIA.toast((premier ? "Ticket #" : "Seconde copie du ticket #") + c.id + " imprimé");
      }, 1400);
      paintTickets();
    });
    $("tkModif").addEventListener("click", function(){
      vueModif = !vueModif;
      if (vueModif && reglages.autoModif) RIA.toast("MODIFICATION COMMANDE #" + c.id + " — ticket imprimé automatiquement");
      paintTickets();
    });
    $("tkFile").addEventListener("click", goFile);
  }

  /* ---------- le ticket lui-même, bâti comme le devis de devis60 ---------- */
  function ticketHtml(c, modif){
    var liv = c.mode === "livraison";
    var ini = D.resto.nom.split(" ").map(function(m){ return m.charAt(0); }).join("").slice(0,2).toUpperCase();
    var lignes = c.lignes;
    var retire = null, delta = 0;
    if (modif){
      for (var i = 0; i < lignes.length; i++){
        if (lignes[i].sup){ retire = lignes[i]; delta = supPrix(lignes[i].sup); break; }
      }
      if (!retire && lignes.length){ retire = lignes[lignes.length - 1]; delta = retire.prix; }
    }
    var total = c.total + (liv ? (c.frais || 0) : 0) - (modif ? delta : 0);

    var rows = lignes.map(function(l){
      var sous = [];
      if (l.opt) sous.push(esc(l.opt));
      if (l.sup) sous.push((modif && l === retire ? "SUPPRIMÉ : " : "+ ") + esc(l.sup));
      if (l.dem) sous.push("** " + esc(l.dem) + " **");
      return '<tr><td class="c">' + l.q + '</td>' +
        '<td class="des">' + esc(l.nom) + (sous.length ? '<small>' + sous.join("<br>") + '</small>' : "") + '</td>' +
        '<td class="r">' + eur(l.prix - (modif && l === retire && !l.sup ? l.prix : 0)) + '</td></tr>';
    }).join("");
    if (modif && retire){
      rows += '<tr><td class="c">—</td><td class="des">MODIFICATION' +
        '<small>' + (retire.sup ? "retirer " + esc(retire.sup.toLowerCase()) : "retirer " + esc(retire.nom)) + '</small></td>' +
        '<td class="r">-' + eur(delta) + '</td></tr>';
    }
    if (liv){
      rows += '<tr><td class="c">1</td><td class="des">Frais de livraison<small>' + esc(String(c.km || "—")) + ' km par la route</small></td>' +
        '<td class="r">' + eur(c.frais || 0) + '</td></tr>';
    }

    return '<div class="doc">' +
      '<div class="doc-head">' +
        '<div class="doc-emit">' +
          '<div class="doc-logo">' + esc(ini) + '</div>' +
          '<div class="doc-emit-name">' + esc(D.resto.nom) + '</div>' +
          '<div class="doc-emit-metier">Assistant vocal ' + esc(D.resto.assistant) + '</div>' +
          '<div class="doc-emit-meta">' + esc(D.resto.adresse) + '<br>Tél. ' + esc(D.resto.tel) + '</div>' +
        '</div>' +
        '<div class="doc-ref">' +
          '<div class="doc-type">#' + c.id + '</div>' +
          '<div class="doc-reftab">' +
            '<div><span>Mode</span><b>' + modeLbl(c).toUpperCase() + '</b></div>' +
            '<div><span>Reçue</span><b>' + esc(c.heure || "—") + '</b></div>' +
            '<div><span>Annoncée</span><b>' + esc(c.prete || "—") + '</b></div>' +
            '<div><span>Client</span><b>' + esc(c.client || "—") + '</b></div>' +
          '</div>' +
          '<div class="doc-badge">' + (modif ? "Modification" : "Commande confirmée") + '</div>' +
        '</div>' +
      '</div>' +

      (modif ? '<div class="doc-idbar"><b>MODIFICATION COMMANDE #' + c.id + '</b> &nbsp;·&nbsp; ' +
        'l\'ancien récapitulatif est invalidé &nbsp;·&nbsp; un nouveau SMS est parti au client</div>'
             : '<div class="doc-idbar"><b>ESC/POS</b> 80 mm &nbsp;·&nbsp; <b>Imprimante</b> ' + esc(reglages.imprimante) +
               ' &nbsp;·&nbsp; <b>Impression auto</b> ' + (reglages.autoConf ? "activée" : "coupée") +
               ' &nbsp;·&nbsp; <b>Alerte sonore</b> ' + (reglages.son ? "activée" : "coupée") + '</div>') +

      '<div class="doc-parties">' +
        '<div class="doc-party"><h4>Client</h4><p class="nm">' + esc(c.client || "Client") + '</p>' +
          '<p>' + esc(c.paiement || "paiement à confirmer") + '</p></div>' +
        '<div class="doc-party"><h4>' + (liv ? "Livraison" : "Retrait") + '</h4><p>' +
          (liv ? esc(c.adresse || "adresse à préciser") + '<br>' + esc(String(c.km || "—")) + ' km · frais ' + eur(c.frais || 0)
               : 'Au comptoir, ' + esc(D.resto.adresse)) + '</p></div>' +
      '</div>' +

      '<table class="doc-table">' +
        '<colgroup><col style="width:12%"><col style="width:62%"><col style="width:26%"></colgroup>' +
        '<thead><tr><th class="c">Qté</th><th>Désignation</th><th class="r">Total</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table>' +

      '<div class="doc-bottom">' +
        '<div class="doc-cond">' +
          '<p><b>Heure annoncée au client :</b> ' + esc(c.prete || "—") + '.</p>' +
          '<p><b>Charge du service :</b> ' + esc(niveau().nom) + ' — ' + (liv ? delaiLivr : delaiRetrait) + ' minutes annoncées.</p>' +
          '<p><b>Demandes particulières :</b> reportées sous chaque produit, entre astérisques.</p>' +
          '<p><b>Allergènes :</b> ' + esc(D.regles.allergenes) + '</p>' +
        '</div>' +
        '<div class="doc-totbox">' +
          '<div class="tr"><span>Articles</span><b>' + articles(c) + '</b></div>' +
          (liv ? '<div class="tr dsub"><span>Frais livraison</span><b>' + eur(c.frais || 0) + '</b></div>' : "") +
          (modif ? '<div class="tr dsub"><span>Modification</span><b>-' + eur(delta) + '</b></div>' : "") +
          '<div class="tr ttc"><span>' + (modif ? "Nouveau total" : "Total") + '</span><b>' + eur(total) + '</b></div>' +
          '<div class="tr"><span>À régler sur place</span><b>' + esc(c.paiement || "—") + '</b></div>' +
        '</div>' +
      '</div>' +

      '<div class="doc-legal">' +
        '<p><b>Commande confirmée par le client — prise par assistant vocal.</b> Rien ne part en cuisine sans confirmation.</p>' +
        (modif ? '<p><b>' + esc(D.regles.modification) + '</b></p>' : "") +
        '<p>' + esc(D.regles.paiement) + '</p>' +
        '<p>' + esc(D.regles.rgpd) + '</p>' +
      '</div>' +
    '</div>';
  }

  /* =======================================================================
     ONGLET 3 — RUPTURES
     ======================================================================= */
  function goRuptures(){
    init();
    RIA.clearTimers();
    RIA.renderNavbar("ruptures");
    paintRuptures();
  }

  function altDe(cat, item){
    var libres = cat.items.filter(function(x){ return x.dispo && x.id !== item.id; });
    if (libres.length) return libres[0].nom;
    for (var i = 0; i < D.menu.length; i++){
      var l = D.menu[i].items.filter(function(x){ return x.dispo; });
      if (l.length) return l[0].nom;
    }
    return "le reste de la carte";
  }

  function comptesRupture(){
    var p = 0, s = 0, cats = 0;
    for (var i = 0; i < D.menu.length; i++){
      if (catStop[D.menu[i].cat]) cats++;
      for (var j = 0; j < D.menu[i].items.length; j++){
        var it = D.menu[i].items[j];
        if (!it.dispo) p++;
        var sup = it.sup || [];
        for (var k = 0; k < sup.length; k++) if (!sup[k].dispo) s++;
      }
    }
    return { produits:p, sups:s, cats:cats };
  }

  function conflits(){
    var out = [];
    var actives = D.commandes.filter(function(c){ return ["confirmee","preparation","prete"].indexOf(c.etat) >= 0; });
    for (var i = 0; i < D.menu.length; i++){
      for (var j = 0; j < D.menu[i].items.length; j++){
        var it = D.menu[i].items[j];
        if (it.dispo) continue;
        for (var k = 0; k < actives.length; k++){
          for (var l = 0; l < actives[k].lignes.length; l++){
            if (actives[k].lignes[l].nom === it.nom) out.push({ nom:it.nom, id:actives[k].id });
          }
        }
      }
    }
    return out;
  }

  function paintRuptures(){
    var n = comptesRupture();
    var stats = '<div class="stats">' +
      RIA.stat(String(n.produits), "Produits coupés") +
      RIA.stat(String(n.sups), "Suppléments coupés") +
      RIA.stat(String(n.cats), "Catégories arrêtées") +
      '</div>';

    var corps = D.menu.map(function(cat){
      var off = catStop[cat.cat];
      var tiles = cat.items.map(function(it){
        return '<div class="m ' + (it.dispo ? "on" : "off") + '" data-prod="' + esc(it.id) + '">' +
          svg(ICO.plat) + '<span>' + esc(it.nom) + '<br><small>' +
          (it.dispo ? eur(it.prix) : "en rupture") + '</small></span></div>';
      }).join("");
      var sups = [];
      for (var i = 0; i < cat.items.length; i++){
        var s = cat.items[i].sup || [];
        for (var j = 0; j < s.length; j++){
          sups.push('<div class="m ' + (s[j].dispo ? "on" : "off") + '" data-sup="' + esc(cat.items[i].id + "|" + s[j].nom) + '">' +
            svg(ICO.plus) + '<span>' + esc(s[j].nom) + '<br><small>' + (s[j].dispo ? eur(s[j].prix) : "coupé") + '</small></span></div>');
        }
      }
      return '<div class="fam">' +
        '<div class="fam-h">' + esc(cat.cat) + ' — ' + cat.items.length + ' produits ' +
          '<button class="pill ' + (off ? "refuse" : "signe") + '" data-cat="' + esc(cat.cat) + '">' +
          (off ? "Catégorie arrêtée" : "Arrêter la catégorie") + '</button></div>' +
        '<div class="grid">' + tiles + '</div>' +
        '<div class="fam-h">Suppléments</div>' +
        '<div class="grid">' + sups.join("") + '</div>' +
        '</div>';
    }).join("");

    var conf = conflits();
    var alerte = conf.length ?
      '<div class="alert-banner">' + svg(ICO.alerte) + '<span><b>' + esc(conf[0].nom) +
      '</b> est en rupture, mais la commande <b>#' + conf[0].id + '</b> déjà confirmée le contient : elle reste à préparer. ' +
      'Une rupture ne supprime jamais une commande confirmée.</span></div>' : "";

    RIA.setContent(
      RIA.screenHeader("Carte", "Ruptures produit", "Ce que la cuisine change sans passer par le gérant.") +
      stats + alerte +
      RIA.note("Effet <b>immédiat pour les nouveaux appels</b>, sans repasser par Publier. L'IA propose alors une alternative de la même catégorie.") +
      '<div class="body">' + corps + '</div>'
    );

    var tiles = $("content").querySelectorAll("[data-prod]");
    for (var a = 0; a < tiles.length; a++){
      tiles[a].addEventListener("click", function(){ basculerProduit(this.dataset.prod); });
    }
    var st = $("content").querySelectorAll("[data-sup]");
    for (var b = 0; b < st.length; b++){
      st[b].addEventListener("click", function(){ basculerSup(this.dataset.sup); });
    }
    var cb = $("content").querySelectorAll("[data-cat]");
    for (var d = 0; d < cb.length; d++){
      cb[d].addEventListener("click", function(ev){ ev.stopPropagation(); basculerCat(this.dataset.cat); });
    }
    barreRuptures(n);
  }

  function trouveProduit(id){
    for (var i = 0; i < D.menu.length; i++){
      for (var j = 0; j < D.menu[i].items.length; j++){
        if (D.menu[i].items[j].id === id) return { cat:D.menu[i], item:D.menu[i].items[j] };
      }
    }
    return null;
  }

  function basculerProduit(id){
    var f = trouveProduit(id);
    if (!f) return;
    f.item.dispo = !f.item.dispo;
    if (f.item.dispo) catStop[f.cat.cat] = false;
    RIA.toast(f.item.dispo ? f.item.nom + " de nouveau proposé" :
      f.item.nom + " en rupture — l'IA proposera « " + altDe(f.cat, f.item) + " »");
    paintRuptures();
  }

  function basculerSup(cle){
    var p = cle.split("|");
    var f = trouveProduit(p[0]);
    if (!f) return;
    var s = (f.item.sup || []).filter(function(x){ return x.nom === p[1]; })[0];
    if (!s) return;
    s.dispo = !s.dispo;
    RIA.toast(s.nom + (s.dispo ? " de nouveau proposé" : " coupé — l'IA ne le propose plus"));
    paintRuptures();
  }

  function basculerCat(nom){
    var cat = D.menu.filter(function(c){ return c.cat === nom; })[0];
    if (!cat) return;
    var off = !catStop[nom];
    catStop[nom] = off;
    for (var i = 0; i < cat.items.length; i++) cat.items[i].dispo = !off;
    RIA.toast(off ? "Catégorie « " + nom + " » arrêtée pour les nouveaux appels" : "Catégorie « " + nom + " » réactivée");
    paintRuptures();
  }

  function barreRuptures(n){
    var total = n.produits + n.sups;
    RIA.actionbar(
      '<div class="ctabar">' +
        '<button class="cta" id="ruInfo">' + svg(ICO.rupture) + 'Ce que l\'IA ne propose plus : ' + total + '</button>' +
        '<div class="secrow">' +
          '<button class="sec" id="ruReset">' + svg(ICO.check) + 'Tout remettre disponible</button>' +
          '<button class="sec" id="ruFile">' + svg(ICO.feu) + 'Revenir à la file</button>' +
        '</div>' +
      '</div>'
    );
    $("ruInfo").addEventListener("click", function(){
      var l = [];
      for (var i = 0; i < D.menu.length; i++){
        for (var j = 0; j < D.menu[i].items.length; j++){
          var it = D.menu[i].items[j];
          if (!it.dispo) l.push('<div class="acctrow"><span>' + esc(it.nom) + '</span><span>alternative : ' + esc(altDe(D.menu[i], it)) + '</span></div>');
          var s = it.sup || [];
          for (var k = 0; k < s.length; k++){
            if (!s[k].dispo) l.push('<div class="acctrow"><span>' + esc(s[k].nom) + '</span><span>supplément coupé</span></div>');
          }
        }
      }
      RIA.sheet("Retiré de la proposition",
        (l.length ? '<div class="acctinfo">' + l.join("") + '</div>' : '<div class="empty">Toute la carte est disponible.</div>') +
        RIA.note("Une rupture ne supprime jamais une commande déjà confirmée.") +
        '<div class="ctabar"><button class="cta" data-sheetclose>Fermer</button></div>');
      $("sheet").querySelector("[data-sheetclose]").addEventListener("click", RIA.closeSheet);
    });
    $("ruReset").addEventListener("click", function(){
      for (var i = 0; i < D.menu.length; i++){
        catStop[D.menu[i].cat] = false;
        for (var j = 0; j < D.menu[i].items.length; j++){
          D.menu[i].items[j].dispo = true;
          var s = D.menu[i].items[j].sup || [];
          for (var k = 0; k < s.length; k++) s[k].dispo = true;
        }
      }
      RIA.toast("Toute la carte est de nouveau proposée");
      paintRuptures();
    });
    $("ruFile").addEventListener("click", goFile);
  }

  /* =======================================================================
     ONGLET 4 — CHARGE
     ======================================================================= */
  function goCharge(){
    init();
    RIA.clearTimers();
    RIA.renderNavbar("charge");
    paintCharge();
  }

  function paintCharge(){
    var lvl = niveau();
    var rows = D.charges.map(function(c){
      var on = c.id === chargeId;
      return '<div class="fg-row"><label>' + esc(c.nom) +
        '<small><br>' + (c.delai ? c.delai + " minutes annoncées" : "aucune commande acceptée") + '</small></label>' +
        '<button class="pill ' + (on ? c.pill || "signe" : "") + '" data-lvl="' + esc(c.id) + '">' +
        (on ? "Actif" : "Choisir") + '</button></div>';
    }).join("");

    var reglagesDelais = '<div class="fieldgrp">' +
      '<div class="fg-row"><label>Délai retrait (min)</label><input type="number" id="chRet" value="' + delaiRetrait + '" min="5" max="90"></div>' +
      '<div class="fg-row"><label>Délai livraison (min)</label><input type="number" id="chLiv" value="' + delaiLivr + '" min="5" max="120"></div>' +
      '<div class="fg-row"><label>Capacité maximale</label><input type="number" id="chCap" value="' + capacite + '" min="1" max="60"></div>' +
      '</div>';

    var enCours = compte("confirmee") + compte("preparation");
    var pct = Math.min(100, Math.round(enCours / capacite * 100));

    RIA.setContent(
      RIA.screenHeader("Service", "Charge de la cuisine", "Le niveau choisi change ce que l'IA annonce au téléphone.") +
      '<div class="stats">' +
        RIA.stat(lvl.nom, "Niveau actif") +
        RIA.stat(stoppe() ? "—" : delaiRetrait + " min", "Retrait") +
        RIA.stat(stoppe() ? "—" : delaiLivr + " min", "Livraison") +
      '</div>' +
      '<div class="body"><div class="fam">' +
        '<div class="fam-h">Occupation — ' + enCours + ' sur ' + capacite + '</div>' +
        '<div class="charge-wrap"><span class="charge-lbl">' + pct + ' %</span>' +
        '<div class="charge-bar"><div class="charge-fill ' + (pct > 80 ? "haut" : (pct > 40 ? "ok" : "bas")) +
        '" style="width:' + pct + '%"></div></div></div>' +
      '</div></div>' +
      '<div class="fieldgrp">' + rows + '</div>' +
      '<div class="alert-banner">' + svg(ICO.tel) + '<span><b>Ce que l\'IA dit au client :</b> ' + esc(lvl.dit) + '</span></div>' +
      reglagesDelais +
      RIA.note("Au lancement le <b>rush est manuel</b>, activable par le gérant ou la cuisine. Plus tard, l'IA pourra le recommander ou l'activer selon les commandes en attente.") +
      RIA.note("Hors zone de livraison (" + esc(D.livraison.rayon) + ", minimum " + eur(D.livraison.minimum) + "), l'IA propose le retrait.")
    );

    var lv = $("content").querySelectorAll("[data-lvl]");
    for (var i = 0; i < lv.length; i++){
      lv[i].addEventListener("click", function(){ setNiveau(this.dataset.lvl); });
    }
    $("chRet").addEventListener("change", function(){
      delaiRetrait = Math.max(5, parseInt(this.value, 10) || 15);
      RIA.toast("Délai retrait annoncé : " + delaiRetrait + " min");
      paintCharge();
    });
    $("chLiv").addEventListener("change", function(){
      delaiLivr = Math.max(5, parseInt(this.value, 10) || 35);
      RIA.toast("Délai livraison annoncé : " + delaiLivr + " min");
      paintCharge();
    });
    $("chCap").addEventListener("change", function(){
      capacite = Math.max(1, parseInt(this.value, 10) || 12);
      RIA.toast("Capacité maximale : " + capacite + " commandes");
      paintCharge();
    });
    barreCharge();
  }

  function setNiveau(id){
    chargeId = id;
    D.resto.charge = id;
    var lvl = niveau();
    if (id === "stop"){
      repriseA = dans(30);
      RIA.toast("Commandes stoppées — reprise annoncée à " + repriseA);
    } else {
      repriseA = "";
      delaiRetrait = lvl.delai;
      delaiLivr = lvl.delai + 20;
      RIA.toast(lvl.nom + " — " + lvl.delai + " min annoncées");
    }
    paintCharge();
  }

  function barreCharge(){
    RIA.actionbar(
      '<div class="ctabar">' +
        '<button class="cta" id="chStop">' + svg(stoppe() ? ICO.check : ICO.stop) +
          (stoppe() ? "Reprendre les commandes" : "Stopper les commandes") + '</button>' +
        '<div class="secrow">' +
          '<button class="sec" id="chPlus">' + svg(ICO.horloge) + '+10 min annoncées</button>' +
          '<button class="sec" id="chFile">' + svg(ICO.feu) + 'Revenir à la file</button>' +
        '</div>' +
      '</div>'
    );
    $("chStop").addEventListener("click", function(){
      if (stoppe()) setNiveau("normal");
      else setNiveau("stop");
    });
    $("chPlus").addEventListener("click", function(){
      delaiRetrait += 10; delaiLivr += 10;
      RIA.toast("Délais allongés : " + delaiRetrait + " min au retrait, " + delaiLivr + " min en livraison");
      paintCharge();
    });
    $("chFile").addEventListener("click", goFile);
  }

  /* =======================================================================
     Enregistrement de l'application
     ======================================================================= */
  RIA.register({
    id:"cuisine", nom:"Cuisine", badge:"4",
    fond:"linear-gradient(150deg,#79d3a4,#2f9d68)", encre:"#06180f",
    glyph:'<path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4z"/><path d="M12 7v10"/>',
    espace:"ESPACE CUISINE",
    titre:"Écran de préparation", sub:"Les commandes confirmées arrivent ici, et rien d'autre.",
    cta:"Ouvrir le service",
    tabs:[
      { id:"file",     lbl:"Service",    svg:ICO.feu,     go:goFile },
      { id:"tickets",  lbl:"Impression", svg:ICO.ticket,  go:goTickets },
      { id:"ruptures", lbl:"Ruptures",   svg:ICO.rupture, go:goRuptures },
      { id:"charge",   lbl:"Rythme",     svg:ICO.jauge,   go:goCharge }
    ]
  });

})();
