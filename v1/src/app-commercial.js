/* =========================================================================
   Resto IA — application COMMERCIAL (apporteur d’affaires indépendant).
   Même forme que devis60 : ES5 strict, une IIFE, aucune classe CSS nouvelle.
   La marketplace de chantiers de devis60 (.mkt-*, .lead-*) devient ici la
   liste des prospects et la fiche prospect.
   Quatre onglets : Secteur · Prospects · Argumentaire · Gains.
   Spécification : business plan v1.7 §5 (attribution et CRM), §6.1 (zone
   pilote et productivité), §1.1 (taille réelle du marché).
   ========================================================================= */
(function(){
  "use strict";

  var $ = RIA.$, esc = RIA.esc, svg = RIA.svg;

  /* ---------- chemins d’icônes, rendus par RIA.svg() ---------- */
  var I = {
    pin:     '<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    tel:     '<path d="M6.6 3.5 4 6.1c-.7.7-.9 1.8-.5 2.7a20 20 0 0 0 11.7 11.7c.9.4 2 .2 2.7-.5l2.6-2.6-4.2-2.8-2 1.6a15 15 0 0 1-6.5-6.5l1.6-2z"/>',
    chat:    '<path d="M4 5h16v11H9l-5 4z"/><path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01"/>',
    photo:   '<rect x="3" y="7" width="18" height="13" rx="3"/><circle cx="12" cy="13.5" r="3.6"/><path d="M8.5 7 10 4h4l1.5 3"/>',
    horloge: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    agenda:  '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    euro:    '<path d="M17 6.5A6.5 6.5 0 0 0 8 12a6.5 6.5 0 0 0 9 5.5"/><path d="M4.5 10.5h8M4.5 13.5h8"/>',
    check:   '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.2 2.4 2.4 4.6-4.9"/>',
    alerte:  '<path d="M12 4 3 19h18z"/><path d="M12 10v4M12 16.6h.01"/>',
    doc:     '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h4"/>',
    cible:   '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
    pas:     '<path d="M9 20c-2 0-3-1.2-3-3 0-2 1.5-3 1.5-5.5C7.5 9 8.5 6 11 6s3 2.5 2.5 5.5C13 15 12 16 12 18c0 1.4-1 2-3 2z"/>',
    stop:    '<circle cx="12" cy="12" r="9"/><path d="m8 8 8 8"/>',
    eclair:  '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    boutique:'<path d="M4 9h16v11H4z"/><path d="M3 9l1.5-5h15L21 9"/><path d="M9 20v-6h6v6"/>'
  };

  /* glyphes de vignette par type d’établissement (classe .mkt-media-photo) */
  var TYPEG = {
    "Kebab":  '<path d="M12 3c3.3 0 5 2.4 5 5H7c0-2.6 1.7-5 5-5z"/><path d="M6 11h12M7 15h10M9 19h6"/>',
    "Tacos":  '<path d="M4 18a8 8 0 0 1 16 0z"/><path d="M8 18a4 4 0 0 1 8 0"/>',
    "Pizza":  '<path d="M12 4 21 20H3z"/><circle cx="12" cy="13" r="1"/><circle cx="9.5" cy="17" r="1"/><circle cx="14.5" cy="17" r="1"/>',
    "Burger": '<path d="M4 9a8 4 0 0 1 16 0z"/><path d="M4 12.5h16"/><path d="M4 16a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3z"/>'
  };

  var RESA = 3 * 24 * 3600;          /* réservation de 3 jours, en secondes */
  var ORDRE = ["jamais","reserve","sansrep","refus","attente","essai","client","stop"];
  var PREUVES = [
    { id:"appel", ico:"tel",   nom:"Appel depuis le numéro professionnel",
      det:"Restaurant, commercial, date, heure et durée sont tracés automatiquement." },
    { id:"canal", ico:"chat",  nom:"Message depuis le canal Resto IA",
      det:"Canal, date, contenu et statut de livraison sont tracés." },
    { id:"photo", ico:"photo", nom:"Photo de devanture",
      det:"Sans visages ni plaques d’immatriculation. Le résultat de la visite est saisi avec." }
  ];

  /* ---------- état local de l’application ---------- */
  var etat = null;

  function initEtat(){
    if (etat) return;
    var p = [], i, s;
    for (i = 0; i < D.prospects.length; i++){
      s = D.prospects[i];
      p.push({ id:s.id, nom:s.nom, type:s.type, adr:s.adr, statut:s.statut, dist:s.dist,
               info:s.info, derniere:s.derniere || "", preuve:s.preuve || "",
               objection:s.objection || "", restant:0, bloque:false });
    }
    /* Tacos Avenue est déjà réservé : il reste 2 jours et quelques heures. */
    for (i = 0; i < p.length; i++) if (p[i].statut === "reserve") p[i].restant = 2 * 86400 + 3 * 3600 + 12 * 60;
    etat = { p:p, onglet:"secteur", fs:"", q:"", filtre:"tous",
             clients:Math.round(dernierGain() / D.commission), pitch:0, pitchOn:false, gtab:"mois" };
  }

  function dernierGain(){ return D.commercial.gains[D.commercial.gains.length - 1].v; }
  function prospect(id){ var i; for (i = 0; i < etat.p.length; i++) if (String(etat.p[i].id) === String(id)) return etat.p[i]; return null; }
  function compte(k){ var n = 0, i; for (i = 0; i < etat.p.length; i++) if (etat.p[i].statut === k) n++; return n; }

  /* ---------- formatage ---------- */
  function pad(n){ return (n < 10 ? "0" : "") + n; }
  function dist(m){ return m < 1000 ? m + " m" : (m / 1000).toFixed(1).replace(".", ",") + " km"; }
  function marche(m){ return Math.max(1, Math.round(m / 75)) + " min à pied"; }
  function restant(s){
    if (s <= 0) return "expiré";
    var j = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600),
        m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (j > 0) return j + " j " + pad(h) + ":" + pad(m) + ":" + pad(sec);
    return pad(h) + ":" + pad(m) + ":" + pad(sec);
  }
  function dansNJours(n){
    var d = new Date(Date.now() + n * 86400000);
    return pad(d.getDate()) + "/" + pad(d.getMonth() + 1);
  }

  /* ---------- fragments repris de devis60 ---------- */
  function entete(eyebrow, titre, sub, chips){
    return '<div class="topbar"><span class="eyebrow">' + esc(eyebrow) + '</span><h1>' + esc(titre) + '</h1>' +
      (sub ? '<p class="sub">' + esc(sub) + '</p>' : "") +
      (chips ? '<div class="chip-row">' + chips + '</div>' : "") + '</div>';
  }
  function barre(lbl, pct, ton, val){
    return '<div class="charge-wrap"><div class="charge-lbl">' + esc(lbl) + '</div>' +
      '<div class="charge-bar"><div class="charge-fill ' + ton + '" style="width:' + pct + '%"></div></div>' +
      '<div class="charge-lbl">' + esc(val) + '</div></div>';
  }
  function ton(pct){ return pct >= 75 ? "ok" : pct >= 40 ? "haut" : "bas"; }
  function metarow(ico, lbl, val){
    return '<div class="lead-metarow">' + svg(I[ico]) + '<div><div class="lm-lbl">' + esc(lbl) + '</div>' +
      '<div class="lm-val">' + esc(val) + '</div></div></div>';
  }
  function subStep(num, titre, txt){
    return '<div class="sub-step"><span class="num">' + esc(num) + '</span><span class="tx"><b>' + esc(titre) + '</b>' +
      '<span>' + esc(txt) + '</span></span></div>';
  }
  function moneyRow(k, d, v){
    return '<div class="sub-money-row"><div><div class="k">' + esc(k) + '</div>' +
      (d ? '<div class="d">' + esc(d) + '</div>' : "") + '</div><div class="v">' + esc(v) + '</div></div>';
  }
  function fact(ico, titre, sub, btn, cle){
    return '<div class="factcard"><span class="fc-ico">' + svg(I[ico]) + '</span>' +
      '<span class="fc-info"><span class="fc-title">' + esc(titre) + '</span>' +
      '<span class="fc-sub">' + esc(sub) + '</span></span>' +
      '<button class="fc-btn" data-regle="' + esc(cle) + '">' + esc(btn) + '</button></div>';
  }
  function banniere(txt){
    return '<div class="alert-banner">' + svg(I.alerte) + '<div>' + txt + '</div></div>';
  }

  /* ---------- carte prospect (la .mkt-card de la marketplace devis60) ---------- */
  function carte(p){
    var s = D.statuts[p.statut];
    var droite = p.statut === "reserve"
      ? '<span class="mkt-time" id="t' + p.id + '">' + restant(p.restant) + '</span>'
      : '<span class="mkt-time">' + esc(p.derniere ? p.derniere : dist(p.dist) + " · " + marche(p.dist)) + '</span>';
    return '<div class="mkt-card" data-id="' + p.id + '">' +
      '<div class="mkt-media"><svg class="mkt-media-photo" viewBox="0 0 24 24" fill="none" stroke-width="1.6" ' +
        'stroke-linecap="round" stroke-linejoin="round">' + (TYPEG[p.type] || I.boutique) + '</svg>' +
        (p.preuve ? '<span class="mkt-photobadge">' + svg(I.check) + esc(p.preuve) + '</span>' : "") + '</div>' +
      '<div class="mkt-body">' +
        '<div class="mkt-toprow"><div class="mkt-title">' + esc(p.nom) + '</div>' +
          '<div class="mkt-dist">' + esc(dist(p.dist)) + '</div></div>' +
        '<div class="mkt-sub">' + svg(I.pin) + esc(p.type + " · " + p.adr) + '</div>' +
        '<div class="mkt-bottom"><span class="mkt-delai">' + svg(I.cible) + '<span>' + esc(s.nom) + '</span></span>' +
          droite + '</div>' +
      '</div></div>';
  }
  function liste(arr){
    if (!arr.length) return '<div class="empty">Aucun prospect ne correspond. Enlevez le filtre ou changez la recherche.</div>';
    var h = "", i;
    for (i = 0; i < arr.length; i++) h += carte(arr[i]);
    return h;
  }
  function brancherCartes(racine){
    var c = racine.querySelectorAll(".mkt-card"), i;
    for (i = 0; i < c.length; i++) c[i].addEventListener("click", function(){ fiche(prospect(this.dataset.id)); });
  }

  /* ---------- minuteur des réservations : le temps descend réellement ---------- */
  function tick(){
    var change = false, i, p, el;
    for (i = 0; i < etat.p.length; i++){
      p = etat.p[i];
      if (p.statut !== "reserve" || p.restant <= 0) continue;
      p.restant--;
      if (p.restant <= 0){
        p.statut = "jamais"; p.bloque = true;
        p.info = "Réservation expirée sans action — revenu au commun";
        change = true;
      } else {
        el = $("t" + p.id);
        if (el) el.textContent = restant(p.restant);
      }
    }
    if (change){
      RIA.toast("Réservation expirée : le prospect est revenu au commun.");
      refresh();
    }
  }

  function refresh(){
    if (etat.onglet === "prospects") goProspects();
    else if (etat.onglet === "argu") goArgu();
    else if (etat.onglet === "gains") goGains();
    else goSecteur();
  }

  /* =======================================================================
     FICHE PROSPECT — la .lead-* de devis60, avec des actions qui agissent
     ======================================================================= */
  function fiche(p){
    if (!p) return;
    var s = D.statuts[p.statut];
    var actions = [];
    var cta = null;

    if (p.statut === "stop"){
      cta = null;
    } else if (p.statut === "reserve"){
      cta = { a:"rendre", l:"Rendre ce prospect au commun" };
      actions = ["visite","rappel","essai","stop"];
    } else if (p.statut === "jamais" || p.statut === "sansrep" || p.statut === "refus"){
      cta = { a:"prendre", l:"Je prends ce prospect" };
      actions = ["visite","rappel","essai","stop"];
    } else {
      cta = { a:"visite", l:"Marquer une visite" };
      actions = ["rappel","essai","stop"];
    }

    var LBL = { visite:"Marquer une visite", rappel:"Planifier un rappel",
                essai:"Passer en essai gratuit", stop:"Ne plus contacter" };
    var secs = "", i;
    for (i = 0; i < actions.length; i++){
      if (i % 2 === 0) secs += '<div class="secrow">';
      secs += '<button class="sec" data-a="' + actions[i] + '">' + esc(LBL[actions[i]]) + '</button>';
      if (i % 2 === 1 || i === actions.length - 1) secs += '</div>';
    }

    var meta = metarow("cible", "Statut", s.nom) +
      metarow("pin", "Distance", dist(p.dist) + " · " + marche(p.dist)) +
      (p.statut === "reserve" ? metarow("horloge", "Réservation restante", restant(p.restant)) : "") +
      (p.derniere ? metarow("agenda", "Dernière action", p.derniere) : "") +
      (p.preuve ? metarow("check", "Preuve retenue", p.preuve) : "") +
      (p.objection ? metarow("chat", "Objection notée", p.objection) : "") +
      (p.statut === "client" ? metarow("euro", "Commission", RIA.eur(D.commission) + " par mois, tant qu’il reste abonné") : "");

    var corps = RIA.sheet(p.nom,
      '<div class="lead-head"><span class="lead-av">' + esc(p.nom.charAt(0)) + '</span>' +
        '<div class="lead-id"><div class="lead-nom">' + esc(p.nom) + '</div>' +
        '<div class="lead-loc">' + svg(I.pin) + esc(p.type + " · " + p.adr) + '</div></div></div>' +
      '<p class="lead-titre">' + esc(s.nom) + '</p>' +
      '<div class="lead-desc">' + esc(s.def) + (p.info ? " " + esc(p.info) : "") + '</div>' +
      '<div class="lead-meta">' + meta + '</div>' +
      (cta || secs
        ? '<div class="ctabar">' + (cta ? '<button class="cta" data-a="' + cta.a + '">' + esc(cta.l) + '</button>' : "") + secs + '</div>'
        : "") +
      (p.statut === "stop"
        ? '<p class="note">Opposition explicite : aucun commercial ne reprend contact, ni en porte-à-porte, ni par téléphone, ni par message. Ce statut ne se lève pas depuis le terrain.</p>'
        : '<p class="note">Une action est tracée par un appel depuis le numéro professionnel, un message depuis le canal Resto IA, ou une photo de devanture. Après action valide et suivi, le prospect est protégé <b>30 jours</b> depuis la dernière action.</p>')
    );

    var btns = corps.querySelectorAll("[data-a]");
    for (i = 0; i < btns.length; i++){
      btns[i].addEventListener("click", function(){ agir(p, this.dataset.a); });
    }
  }

  function agir(p, a){
    if (a === "prendre") return prendre(p);
    if (a === "rendre") return rendre(p);
    if (a === "visite") return feuilleVisite(p);
    if (a === "rappel") return rappel(p);
    if (a === "essai") return essai(p);
    if (a === "stop") return opposition(p);
  }

  function prendre(p){
    if (p.bloque){
      RIA.toast("Vous l’avez laissé expirer : blocage de 2 mois pour vous. Un autre commercial peut le prendre tout de suite.");
      return;
    }
    p.statut = "reserve"; p.restant = RESA;
    p.info = "Réservé jusqu’au " + dansNJours(3);
    RIA.closeSheet();
    RIA.toast("Réservé 3 jours. Sans action il retourne au commun : vous ne pourrez plus le reprendre pendant 2 mois, un autre commercial le pourra immédiatement.");
    refresh();
  }

  function rendre(p){
    p.statut = "jamais"; p.restant = 0; p.bloque = true;
    p.info = "Rendu au commun sans action";
    RIA.closeSheet();
    RIA.toast("Rendu au commun. Blocage de 2 mois pour vous ; disponible tout de suite pour un autre commercial.");
    refresh();
  }

  function feuilleVisite(p){
    var rows = "", i;
    for (i = 0; i < PREUVES.length; i++){
      rows += '<button class="menurow" data-pr="' + PREUVES[i].id + '">' +
        '<span class="ico">' + svg(I[PREUVES[i].ico]) + '</span>' +
        '<span class="lbl">' + esc(PREUVES[i].nom) + '</span>' +
        svg('<path d="m9 18 6-6-6-6"/>').replace("<svg ", '<svg class="chev" ') + '</button>';
    }
    var det = "", j;
    for (j = 0; j < PREUVES.length; j++){
      det += '<div class="acctrow"><span>' + esc(PREUVES[j].nom) + '</span></div>' +
             '<div class="acctrow"><span>' + esc(PREUVES[j].det) + '</span></div>';
    }
    var corps = RIA.sheet("Preuve de visite — " + p.nom,
      '<div class="lead-desc">Choisissez la preuve qui correspond à ce que vous venez de faire. Elle est horodatée et rattachée au prospect.</div>' +
      '<div class="menu">' + rows + '</div>' +
      '<details class="calcdetail"><summary>Ce que chaque preuve enregistre' + svg(I.chevron) + '</summary>' +
        '<div class="calcbody">' + det + '</div></details>' +
      '<p class="note"><b>L’audio ne sert pas de preuve de prospection.</b> La géolocalisation est ponctuelle, au moment de la preuve : aucun suivi GPS continu, aucun itinéraire imposé, aucune sanction.</p>' +
      '<div class="ctabar"><div class="secrow"><button class="sec" data-annule="1">Annuler</button></div></div>');

    var b = corps.querySelectorAll("[data-pr]"), i2;
    for (i2 = 0; i2 < b.length; i2++){
      b[i2].addEventListener("click", function(){
        var pr = null, k;
        for (k = 0; k < PREUVES.length; k++) if (PREUVES[k].id === this.dataset.pr) pr = PREUVES[k];
        p.preuve = pr.id === "photo" ? "photo de devanture" : pr.id === "appel" ? "appel professionnel" : "message Resto IA";
        p.derniere = dansNJours(0) + " — visite tracée";
        if (p.statut === "jamais" || p.statut === "reserve"){
          p.statut = "sansrep";
          p.restant = 0;
          p.info = "Tentative réalisée — relance planifiable";
        }
        RIA.closeSheet();
        RIA.toast("Visite tracée (" + p.preuve + "). Protection de 30 jours depuis cette action.");
        refresh();
      });
    }
    corps.querySelector("[data-annule]").addEventListener("click", function(){ fiche(p); });
  }

  function rappel(p){
    p.statut = "attente";
    p.derniere = dansNJours(0) + " — rappel programmé";
    p.info = "Rappel programmé le " + dansNJours(2) + " à 10h00, hors service";
    RIA.closeSheet();
    RIA.toast("Rappel programmé le " + dansNJours(2) + " à 10h00 — hors rush, comme demandé par le gérant.");
    refresh();
  }

  function essai(p){
    p.statut = "essai";
    p.derniere = dansNJours(0) + " — essai lancé";
    p.info = "Essai gratuit — jour 1 sur 14";
    RIA.closeSheet();
    RIA.toast("Essai gratuit lancé. La commission de " + RIA.eur(D.commission) + " par mois démarre au premier mois payant.");
    refresh();
  }

  function opposition(p){
    p.statut = "stop"; p.restant = 0;
    p.derniere = dansNJours(0) + " — opposition enregistrée";
    p.info = "Opposition explicite";
    RIA.closeSheet();
    RIA.toast("Ne plus contacter : opposition définitive, respectée par tous les commerciaux.");
    refresh();
  }

  /* =======================================================================
     ONGLET 1 — SECTEUR
     ======================================================================= */
  function goSecteur(){
    initEtat(); etat.onglet = "secteur";
    RIA.clearTimers();
    RIA.renderNavbar("secteur");

    var i, cells = "";
    /* L’accueil ne montre que les quatre décisions du jour. Les huit statuts
       restent dans le CRM, où ils sont utiles sans surcharger le terrain. */
    ["jamais","reserve","attente","client"].forEach(function(statut){
      var libelle = statut === "attente" ? "À relancer" : D.statuts[statut].nom;
      cells += '<div class="stat" data-st="' + statut + '"><div class="v">' + compte(statut) + '</div>' +
               '<div class="l">' + esc(libelle) + '</div></div>';
    });

    var vus = etat.p.slice(0);
    vus.sort(function(a, b){ return a.dist - b.dist; });
    if (etat.fs) vus = vus.filter(function(x){ return x.statut === etat.fs; });
    else vus = vus.slice(0, 4);

    /* tournée suggérée : jamais démarchés, distance croissante */
    var neufs = etat.p.filter(function(x){ return x.statut === "jamais"; });
    neufs.sort(function(a, b){ return a.dist - b.dist; });
    var steps = "", total = 0, prev = 0;
    for (i = 0; i < neufs.length; i++){
      var trajet = Math.max(1, Math.round(Math.abs(neufs[i].dist - prev) / 75));
      total += trajet + 12; prev = neufs[i].dist;
      steps += subStep(String(i + 1), neufs[i].nom + " — " + neufs[i].type,
        neufs[i].adr + " · " + dist(neufs[i].dist) + " · " + trajet + " min de marche puis 12 min de visite.");
    }
    if (!neufs.length) steps = subStep("—", "Aucun prospect jamais démarché",
      "Tout ce qui est chargé dans cette zone a déjà été travaillé. Laissez une réservation expirer ou ouvrez une zone voisine.");

    RIA.setContent(
      entete("Aujourd’hui", D.commercial.zone,
        "Vos priorités de prospection, sans horaires ni itinéraire imposés.",
        RIA.chip(D.commercial.cibles + " cibles", I.cible) +
        RIA.chip(etat.p.length + " au CRM", I.doc) +
        RIA.chip(D.commercial.nom, I.pas)) +
      '<div class="stats">' + cells + '</div>' +
      '<div class="mkt-summary">' + (etat.fs
        ? 'Filtre <b>' + esc(D.statuts[etat.fs].nom) + '</b> — touchez à nouveau le compteur pour l’enlever.'
        : 'Les <b>4 prochains restaurants à regarder</b>. Touchez un compteur pour ouvrir la bonne liste.') + '</div>' +
      '<div class="mkt-rows" id="cSecList">' + liste(vus) + '</div>' +
      banniere('La zone est une <b>priorité commerciale</b>, pas un planning salarié. Le CRM attribue les prospects et les commissions ; il n’impose ni horaires, ni itinéraire, ni sanction.') +
      '<div class="fsection">Tournée suggérée</div>' +
      '<div class="sub-steps">' + steps +
        subStep("↺", "Durée estimée : " + total + " min",
          "Marche à 4,5 km/h et 12 minutes par visite. Ordre indicatif : vous restez libre de le suivre ou non.") + '</div>' +
      RIA.note('Repère de marché corrigé (v1.7) : environ <b>29 700 cibles en France</b>, soit <b>une pour 2 300 habitants</b>. Le ratio « une pour 400 » des versions précédentes comptait tous les restaurants.')
    );

    var st = $("content").querySelectorAll("[data-st]");
    for (i = 0; i < st.length; i++){
      st[i].addEventListener("click", function(){
        etat.fs = (etat.fs === this.dataset.st) ? "" : this.dataset.st;
        goSecteur();
      });
    }
    brancherCartes($("cSecList"));

    RIA.actionbar(
      '<button class="cta" id="cVersProspects">' + svg(I.doc) + 'Ouvrir la liste des prospects</button>' +
      '<div class="secrow"><button class="sec" id="cTournee">Détail de la tournée</button>' +
      '<button class="sec" id="cMarche">Repère de marché</button></div>');
    $("cVersProspects").addEventListener("click", function(){ RIA.clearTimers(); goProspects(); });
    $("cTournee").addEventListener("click", function(){ feuilleTournee(neufs, total); });
    $("cMarche").addEventListener("click", feuilleMarche);

    RIA.every(tick, 1000);
  }

  function feuilleTournee(neufs, total){
    var rows = "", i;
    for (i = 0; i < neufs.length; i++){
      rows += '<div class="jcard" data-id="' + neufs[i].id + '"><div class="jcard-info">' +
        '<div class="jcard-who">' + esc(neufs[i].nom) + '</div><div class="jcard-meta">' +
        RIA.pill("Jamais démarché", "") + '<span class="jcard-date">' + esc(neufs[i].adr) + '</span></div></div>' +
        '<div class="jcard-amt">' + esc(dist(neufs[i].dist)) + '</div></div>';
    }
    var corps = RIA.sheet("Tournée suggérée",
      '<div class="lead-desc">' + neufs.length + ' arrêt(s) jamais démarché(s), triés par distance croissante depuis votre position. ' +
        'Environ ' + total + ' minutes marche comprise. Cet ordre est une suggestion : ni horaire imposé, ni itinéraire obligatoire.</div>' +
      (neufs.length ? '<div class="jrows">' + rows + '</div>' : '<div class="empty">Rien à démarcher pour l’instant dans cette zone.</div>') +
      '<p class="note">Repère du business plan : <b>6 à 10 visites par jour</b>, 220 jours par an, soit 1 500 à 1 800 visites terrain sur l’année pour un commercial à temps plein.</p>');
    var c = corps.querySelectorAll(".jcard"), i2;
    for (i2 = 0; i2 < c.length; i2++) c[i2].addEventListener("click", function(){ fiche(prospect(this.dataset.id)); });
  }

  function feuilleMarche(){
    RIA.sheet("Repère de marché",
      '<div class="lead-desc">Le chiffre a été corrigé en v1.7. Ce qu’on vend n’est pas « tous les restaurants » : c’est l’indépendant qui prend encore des commandes par téléphone.</div>' +
      '<div class="acctinfo">' +
        '<div class="acctrow"><span>Tous restaurants (NACE 56.10)</span><span>176 929 · 1 / 387 hab</span></div>' +
        '<div class="acctrow"><span>Restauration rapide stricte</span><span>≈ 50 000 · 1 / 1 370 hab</span></div>' +
        '<div class="acctrow"><span>Cible commerciale réelle</span><span>≈ 29 700 · 1 / 2 300 hab</span></div>' +
        '<div class="acctrow"><span>Coefficient de conversion</span><span>0,28 × 0,60 = 0,168</span></div>' +
      '</div>' +
      '<div class="fsection">Zone pilote</div>' +
      '<div class="acctinfo">' +
        '<div class="acctrow"><span>Lyon Est (7e, 8e, Villeurbanne, Vénissieux)</span><span>230 à 280 cibles</span></div>' +
        '<div class="acctrow"><span>Population couverte</span><span>≈ 350 000 hab</span></div>' +
        '<div class="acctrow"><span>Votre secteur</span><span>' + esc(D.commercial.zone) + ' · ' + D.commercial.cibles + ' cibles</span></div>' +
      '</div>' +
      '<p class="note">Une ville de 50 000 habitants ne contient pas 125 cibles mais <b>environ 22</b>. Le modèle « un commercial, une ville » ne tient qu’au-dessus de 500 000 habitants d’aire urbaine.</p>');
  }

  /* =======================================================================
     ONGLET 2 — PROSPECTS
     ======================================================================= */
  function filtres(){
    var h = '<button class="mkt-catchip' + (etat.filtre === "tous" ? " on" : "") + '" data-f="tous">Tous <span>' +
            etat.p.length + '</span></button>', i;
    for (i = 0; i < ORDRE.length; i++){
      h += '<button class="mkt-catchip' + (etat.filtre === ORDRE[i] ? " on" : "") + '" data-f="' + ORDRE[i] + '">' +
        esc(D.statuts[ORDRE[i]].nom) + ' <span>' + compte(ORDRE[i]) + '</span></button>';
    }
    return h;
  }

  function retenus(){
    var q = RIA.norm(etat.q);
    return etat.p.filter(function(p){
      if (etat.filtre !== "tous" && p.statut !== etat.filtre) return false;
      if (!q) return true;
      return RIA.norm(p.nom + " " + p.type + " " + p.adr + " " + D.statuts[p.statut].nom).indexOf(q) >= 0;
    }).sort(function(a, b){ return a.dist - b.dist; });
  }

  function goProspects(){
    initEtat(); etat.onglet = "prospects";
    RIA.clearTimers();
    RIA.renderNavbar("prospects");

    RIA.setContent(
      entete("CRM terrain", "Prospects",
        "Un seul statut par restaurant : qui appeler, suivre ou laisser tranquille.") +
      '<div class="authfield"><label class="flabel">Recherche</label>' +
        '<input class="field" id="cQ" placeholder="Nom, type, rue, statut…" value="' + esc(etat.q) + '"></div>' +
      '<div class="mkt-catbar" id="cCat">' + filtres() + '</div>' +
      '<div class="mkt-rows" id="cList">' + liste(retenus()) + '</div>' +
      RIA.note('Le fondateur voit toute la France ; vous ne voyez que vos zones et vos prospects autorisés. Un client actif reste attribué à son apporteur selon la règle de commission.')
    );

    brancherCartes($("cList"));
    brancherFiltres();

    var q = $("cQ");
    q.addEventListener("input", function(){
      etat.q = this.value;
      $("cList").innerHTML = liste(retenus());
      brancherCartes($("cList"));
    });

    RIA.actionbar(
      '<button class="cta" id="cAPrendre">' + svg(I.cible) + 'À prendre : ' + compte("jamais") + ' prospect(s)</button>' +
      '<div class="secrow"><button class="sec" id="cResa">Réservations en cours</button>' +
      '<button class="sec" id="cTout">Tout afficher</button></div>');
    $("cAPrendre").addEventListener("click", function(){ etat.filtre = "jamais"; etat.q = ""; goProspects(); });
    $("cResa").addEventListener("click", function(){ etat.filtre = "reserve"; etat.q = ""; goProspects(); });
    $("cTout").addEventListener("click", function(){ etat.filtre = "tous"; etat.q = ""; goProspects(); });

    RIA.every(tick, 1000);
  }

  function brancherFiltres(){
    var c = $("cCat").querySelectorAll(".mkt-catchip"), i;
    for (i = 0; i < c.length; i++){
      c[i].addEventListener("click", function(){
        etat.filtre = this.dataset.f;
        goProspects();
      });
    }
  }

  /* =======================================================================
     ONGLET 3 — ARGUMENTAIRE
     ======================================================================= */
  var PITCH = [
    { t:5,  x:"Bonjour, je passe voir les restaurants du quartier. Quand vous êtes en plein rush, les appels que vous ne décrochez pas, ils partent ailleurs." },
    { t:10, x:"On met un assistant vocal sur votre numéro actuel. Vous le gardez : on active juste le renvoi sur non-réponse, c’est deux minutes chez l’opérateur." },
    { t:15, x:"Il prend la commande, envoie le récapitulatif par SMS, et rien ne part en cuisine tant que le client n’a pas confirmé." },
    { t:20, x:"Essai gratuit pour mesurer votre vrai volume d’appels. Un seul tacos récupéré par jour paie déjà le forfait Basic à " }
  ];

  function pitchTexte(i){
    return i === 3 ? PITCH[3].x + RIA.eur0(D.forfaits[1].prix) + " par mois. Je vous montre ?" : PITCH[i].x;
  }
  function segCourant(){
    var i;
    for (i = 0; i < PITCH.length; i++) if (etat.pitch < PITCH[i].t) return i;
    return PITCH.length - 1;
  }

  function goArgu(){
    initEtat(); etat.onglet = "argu";
    RIA.clearTimers();
    RIA.renderNavbar("argu");

    var obj = "", i;
    for (i = 0; i < D.commercial.objections.length; i++){
      obj += '<details class="calcdetail"><summary>' + esc(D.commercial.objections[i].q) + svg(I.chevron) + '</summary>' +
        '<div class="calcbody"><div class="acctrow"><span>' + esc(D.commercial.objections[i].r) + '</span></div></div></details>';
    }

    var steps = "";
    for (i = 0; i < PITCH.length; i++){
      steps += subStep(String(i + 1), "Seconde " + (i === 0 ? "0" : PITCH[i - 1].t) + " à " + PITCH[i].t, pitchTexte(i));
    }

    RIA.setContent(
      entete("Outils terrain", "Parler du produit",
        "Une accroche courte, une vraie démo et les réponses aux objections — hors rush.") +
      '<div class="lead-desc" id="cPitchTxt">' + esc(pitchTexte(segCourant())) + '</div>' +
      '<div class="code-rows">' +
        barre(RIA.chrono(etat.pitch), Math.round(etat.pitch / 20 * 100), "ok", "00:20") +
      '</div>' +
      '<div class="fsection">Le pitch, seconde par seconde</div>' +
      '<div class="sub-steps">' + steps + '</div>' +
      '<div class="fsection">Faire écouter</div>' +
      '<div class="code-rows">' +
        '<div class="factcard"><span class="fc-ico">' + svg(I.tel) + '</span>' +
        '<span class="fc-info"><span class="fc-title">Démo d’appel</span>' +
        '<span class="fc-sub">Quatre répliques réelles, à faire écouter au gérant.</span></span>' +
        '<button class="fc-btn" id="cDemo">Lancer</button></div>' +
      '</div>' +
      '<div class="fsection">Objections du terrain</div>' +
      '<div class="code-rows">' + obj + '</div>' +
      '<div class="fsection">Les trois arguments qui tiennent</div>' +
      '<div class="code-rows">' +
        fact("tel", "Le restaurant garde son numéro", "Renvoi conditionnel, réversible en deux minutes.", "Détail", "renvoi") +
        fact("check", "Rien ne part en cuisine sans confirmation", "Le client valide, sinon la commande expire.", "Détail", "confirmation") +
        fact("euro", "Resto IA n’encaisse jamais les commandes", "Aucune carte stockée, aucun litige géré.", "Détail", "paiement") +
      '</div>' +
      RIA.note('Si le gérant demande un humain, s’énerve, évoque une allergie ou sort du menu, l’assistant transfère : c’est la réponse à l’objection « et si l’IA se trompe ? ».')
    );

    var reg = $("content").querySelectorAll("[data-regle]"), j;
    for (j = 0; j < reg.length; j++){
      reg[j].addEventListener("click", function(){ feuilleRegle(this.dataset.regle); });
    }
    $("cDemo").addEventListener("click", feuilleDemo);

    RIA.actionbar(
      '<button class="cta" id="cPitch">' + svg(I.eclair) + (etat.pitchOn ? "Arrêter le minuteur" : "Lancer le pitch — 20 s") + '</button>' +
      '<div class="secrow"><button class="sec" id="cReset">Remettre à zéro</button>' +
      '<button class="sec" id="cDemo2">Faire écouter la démo</button></div>');
    $("cPitch").addEventListener("click", togglePitch);
    $("cReset").addEventListener("click", function(){
      etat.pitch = 0; etat.pitchOn = false; goArgu(); RIA.toast("Minuteur remis à zéro.");
    });
    $("cDemo2").addEventListener("click", feuilleDemo);

    if (etat.pitchOn) lancerMinuteur();
  }

  function togglePitch(){
    etat.pitchOn = !etat.pitchOn;
    if (etat.pitchOn && etat.pitch >= 20) etat.pitch = 0;
    goArgu();
  }

  function lancerMinuteur(){
    RIA.every(function(){
      if (!etat.pitchOn) return;
      etat.pitch += 0.2;
      if (etat.pitch >= 20){
        etat.pitch = 20; etat.pitchOn = false;
        majPitch();
        RIA.toast("Vingt secondes. C’est tout ce que ça prend pour obtenir une démo.");
        RIA.after(function(){ if (etat.onglet === "argu") goArgu(); }, 900);
        return;
      }
      majPitch();
    }, 200);
  }

  function majPitch(){
    var pct = Math.round(etat.pitch / 20 * 100);
    var bar = $("content").querySelector(".charge-fill");
    var lbls = $("content").querySelectorAll(".charge-lbl");
    var txt = $("cPitchTxt");
    if (bar) bar.style.width = pct + "%";
    if (lbls.length) lbls[0].textContent = RIA.chrono(etat.pitch);
    if (txt) txt.textContent = pitchTexte(segCourant());
  }

  function feuilleRegle(cle){
    var titres = { renvoi:"Le restaurant garde son numéro", confirmation:"Confirmation obligatoire", paiement:"Aucun encaissement" };
    RIA.sheet(titres[cle],
      '<div class="lead-desc">' + esc(D.regles[cle]) + '</div>' +
      '<div class="lead-meta">' +
        metarow("check", "Ce que vous pouvez promettre", "Exactement la phrase ci-dessus, rien de plus.") +
        metarow("alerte", "Ce que vous ne promettez pas", "Aucune garantie d’absence d’allergène, aucun chiffre de chiffre d’affaires.") +
      '</div>' +
      '<p class="note">' + esc(D.regles.rgpd) + '</p>');
  }

  function feuilleDemo(){
    var idx = [0, 8, 9, 10];
    var corps = RIA.sheet("Démo d’appel",
      '<div class="lead-desc">Tendez le téléphone au gérant et laissez tourner. Quatre répliques : l’annonce d’assistant automatisé, le récapitulatif SMS, la confirmation du client, l’envoi en cuisine.</div>' +
      '<div class="thread" id="cThread"><div class="row me"><button class="qchip primary" id="cPlay">Jouer les quatre répliques</button></div></div>' +
      '<p class="note">' + esc(D.regles.confirmation) + '</p>');

    corps.querySelector("#cPlay").addEventListener("click", function(){
      var th = $("cThread");
      th.innerHTML = "";
      var i;
      for (i = 0; i < idx.length; i++){
        (function(k){
          RIA.after(function(){
            var t = D.appel[idx[k]];
            var row = document.createElement("div");
            row.className = "row " + (t.qui === "me" ? "me" : "bot");
            row.innerHTML = '<div class="bub">' + esc(t.txt) + '</div>';
            th.appendChild(row);
            if (k === idx.length - 1){
              var again = document.createElement("div");
              again.className = "row me";
              again.innerHTML = '<button class="qchip" id="cReplay">Rejouer</button>';
              th.appendChild(again);
              again.querySelector("#cReplay").addEventListener("click", function(){ feuilleDemo(); });
            }
          }, k * 2200);
        })(i);
      }
    });
  }

  /* =======================================================================
     ONGLET 4 — GAINS
     ======================================================================= */
  function goGains(){
    initEtat(); etat.onglet = "gains";
    RIA.clearTimers();
    RIA.renderNavbar("gains");

    var g = D.commercial.gains, i;
    var actifs = Math.round(dernierGain() / D.commission);
    var maxG = 0;
    for (i = 0; i < g.length; i++) if (g[i].v > maxG) maxG = g[i].v;

    var blocMois = '<div class="code-rows">';
    for (i = 0; i < g.length; i++){
      var pc = Math.round(g[i].v / maxG * 100);
      blocMois += barre(g[i].m, pc, ton(pc), RIA.eur0(g[i].v));
    }
    blocMois += '</div>';

    var e = D.commercial.entonnoir, maxE = e[0].n;
    var blocEnt = '<div class="code-rows">';
    for (i = 0; i < e.length; i++){
      var pe = Math.round(e[i].n / maxE * 100);
      blocEnt += barre(e[i].e, pe, e[i].e === "Ne plus contacter" ? "bas" : ton(pe), String(e[i].n));
    }
    blocEnt += '</div>';

    var porte = etat.p.filter(function(x){ return x.statut === "client"; });
    var rows = "";
    for (i = 0; i < porte.length; i++){
      rows += '<div class="jcard" data-id="' + porte[i].id + '"><div class="jcard-info">' +
        '<div class="jcard-who">' + esc(porte[i].nom) + '</div><div class="jcard-meta">' +
        RIA.pill("Client actif", "signe") + '<span class="jcard-date">' + esc(porte[i].info) + '</span></div></div>' +
        '<div class="jcard-amt">' + esc(RIA.eur(D.commission)) + '</div></div>';
    }
    var blocPorte = porte.length
      ? '<div class="jrows">' + rows + '</div>'
      : '<div class="empty">Aucun client actif chargé dans cette zone de démonstration.</div>';

    var bloc = etat.gtab === "mois" ? blocMois : etat.gtab === "entonnoir" ? blocEnt : blocPorte;

    var regles = "";
    for (i = 0; i < D.commercial.regles.length; i++){
      regles += subStep(String(i + 1), D.commercial.regles[i].t, D.commercial.regles[i].x);
    }

    RIA.setContent(
      entete("Rémunération", "Mes revenus",
        RIA.eur(D.commission) + " par mois et par client actif, tant qu’il reste abonné.") +
      '<div class="pricecard"><div class="label">Commission de ' + esc(g[g.length - 1].m) + '</div>' +
        '<div class="price">' + RIA.eur0(dernierGain()) + '<small> /mois</small></div>' +
        '<div class="gain">' + svg(I.euro) + actifs + ' clients actifs × ' + RIA.eur(D.commission) + '</div></div>' +
      '<div class="sub-money">' +
        moneyRow("Par client actif", "Récurrent tant que le restaurant reste abonné.", RIA.eur(D.commission) + " / mois") +
        moneyRow("Quota", "Aucun quota, aucun avertissement, aucune éviction.", "aucun") +
        moneyRow("Plafond", "Les gains sont cumulés et non plafonnés.", "aucun") +
        moneyRow("Frais de déplacement", "À la charge de l’apporteur d’affaires.", "à vous") +
      '</div>' +
      '<div class="journaltabs" id="cGTabs">' +
        '<button class="jtab' + (etat.gtab === "mois" ? " on" : "") + '" data-g="mois">Mois <span class="jn">' + g.length + '</span></button>' +
        '<button class="jtab' + (etat.gtab === "entonnoir" ? " on" : "") + '" data-g="entonnoir">Entonnoir <span class="jn">' + e.length + '</span></button>' +
        '<button class="jtab' + (etat.gtab === "porte" ? " on" : "") + '" data-g="porte">Portefeuille <span class="jn">' + porte.length + '</span></button>' +
      '</div>' + bloc +
      '<div class="fsection">Projecteur</div>' +
      '<div class="acctinfo">' +
        '<div class="acctrow"><span>Clients actifs</span><input type="range" id="cRange" min="0" max="270" step="1" value="' + etat.clients + '"></div>' +
        '<div class="acctrow"><span>Nombre retenu</span><span id="cN">' + etat.clients + '</span></div>' +
        '<div class="acctrow"><span>Revenu mensuel</span><span id="cM">' + RIA.eur0(etat.clients * D.commission) + '</span></div>' +
        '<div class="acctrow"><span>Revenu annuel</span><span id="cA">' + RIA.eur0(etat.clients * D.commission * 12) + '</span></div>' +
      '</div>' +
      banniere('Repère du business plan : <b>1 500 à 1 800 visites terrain par an</b> (220 jours × 6 à 10 visites), conversion supposée de <b>10 à 15 %</b>, soit 150 à 270 clients par an après montée en compétence. <b>Hypothèse à valider, pas une promesse.</b>') +
      '<div class="fsection">Règles d’attribution</div>' +
      '<div class="sub-steps">' + regles + '</div>' +
      RIA.note('Le client passe d’un modèle sans engagement à un essai gratuit puis un <b>engagement de 6 mois</b>. Votre commission suit ce cycle.')
    );

    var tabs = $("cGTabs").querySelectorAll(".jtab");
    for (i = 0; i < tabs.length; i++){
      tabs[i].addEventListener("click", function(){ etat.gtab = this.dataset.g; goGains(); });
    }
    var jc = $("content").querySelectorAll(".jcard"), k;
    for (k = 0; k < jc.length; k++) jc[k].addEventListener("click", function(){ fiche(prospect(this.dataset.id)); });

    $("cRange").addEventListener("input", function(){
      etat.clients = parseInt(this.value, 10) || 0;
      $("cN").textContent = etat.clients;
      $("cM").textContent = RIA.eur0(etat.clients * D.commission);
      $("cA").textContent = RIA.eur0(etat.clients * D.commission * 12);
    });

    RIA.actionbar(
      '<button class="cta" id="cVersClients">' + svg(I.check) + 'Voir mes ' + porte.length + ' clients actifs</button>' +
      '<div class="secrow"><button class="sec" id="cRegles">Règles d’attribution</button>' +
      '<button class="sec" id="cMandat">Fin de mandat</button></div>');
    $("cVersClients").addEventListener("click", function(){
      RIA.clearTimers(); etat.filtre = "client"; etat.q = ""; goProspects();
    });
    $("cRegles").addEventListener("click", feuilleRegles);
    $("cMandat").addEventListener("click", feuilleMandat);
  }

  function feuilleRegles(){
    var h = "", i;
    for (i = 0; i < D.commercial.regles.length; i++){
      h += '<details class="calcdetail"><summary>' + esc(D.commercial.regles[i].t) + svg(I.chevron) + '</summary>' +
        '<div class="calcbody"><div class="acctrow"><span>' + esc(D.commercial.regles[i].x) + '</span></div></div></details>';
    }
    RIA.sheet("Règles d’attribution",
      '<div class="lead-desc">Le CRM attribue les prospects et les commissions. Il n’impose ni horaires, ni itinéraires, ni sanctions.</div>' +
      '<div class="code-rows">' + h + '</div>' +
      '<p class="note">Sans action après 3 jours, le prospect redevient « Jamais démarché ». Le même commercial ne peut pas le réserver pendant <b>2 mois</b> ; un autre le peut immédiatement.</p>');
  }

  function feuilleMandat(){
    var r = D.commercial.regles[D.commercial.regles.length - 1];
    RIA.sheet("Fin de mandat",
      '<div class="lead-desc">' + esc(r.x) + '</div>' +
      '<div class="lead-meta">' +
        metarow("agenda", "Préavis", "Résiliable avec préavis dans les deux sens.") +
        metarow("euro", "Commission", "Maintenue jusqu’à la fin du cycle d’engagement de 6 mois en cours, puis arrêtée définitivement pour ces clients.") +
        metarow("alerte", "Statut du texte", "À valider juridiquement avant tout recrutement.") +
      '</div>' +
      '<p class="note">La distinction entre <b>mission de prospection</b> et <b>commissions acquises</b> n’est pas tranchée dans cette maquette : elle doit être écrite par un avocat avant le premier contrat signé.</p>');
  }

  /* =======================================================================
     ENREGISTREMENT
     ======================================================================= */
  RIA.register({
    id:"commercial", nom:"Commercial", badge:"3",
    fond:"linear-gradient(150deg,#c3b2f0,#6f57c8)", encre:"#0d0720",
    glyph:'<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    espace:"ESPACE COMMERCIAL",
    titre:"Resto IA — terrain", sub:"Le porte-à-porte chez l’indépendant, le seul avantage défendable.",
    cta:"Se connecter",
    tabs:[
      { id:"secteur",   lbl:"Aujourd’hui", svg:I.pin,    go:goSecteur },
      { id:"prospects", lbl:"Prospects",   svg:I.doc,    go:goProspects },
      { id:"argu",      lbl:"Outils",      svg:I.chat,   go:goArgu },
      { id:"gains",     lbl:"Revenus",     svg:I.euro,   go:goGains }
    ]
  });

})();
