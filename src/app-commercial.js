/* =========================================================================
   Pelyo — application COMMERCIAL, identité « Le Passe ».
   Même matière que la cuisine et le gérant : papier, encre brune, accent
   orange, titres Georgia, dock sombre, tiroir latéral ouvert par le logo.
   La carte du secteur devient un ticket papier en tête de l'écran Secteur ;
   la fiche d'un restaurant s'ouvre en panneau plein écran « ← Retour ».
   L'utilisateur est debout, dehors, une main occupée : grandes cibles,
   une décision par écran.

   ES5 strict. Toutes les classes commencent par m-. Voir src/commercial.css.
   ========================================================================= */
(function(){
  "use strict";

  var api, root, D_;
  var tiroir, scrim;
  var vue = "secteur", derniereVue = "", derniereCle = "";
  var menuOuvert = false;
  var clavier = false;      /* anneau de focus seulement au clavier, pas après un appui */
  var P = [];               /* copie de travail des prospects */
  var filtre = "";          /* statut filtré, "" = tous */
  var choisi = null;        /* prospect ouvert en fiche */
  var mentions = false;     /* page Mentions légales ouverte depuis le tiroir */
  var preuve = "photo";
  var pitchT = null, demoT = null;
  var demoVues = [];
  var simu = 0;             /* valeur du simulateur de revenus */
  var DUREE_RESA = 3 * 86400;

  var VUES = [
    { id:"secteur", lbl:"Secteur" },
    { id:"tournee", lbl:"Tournée" },
    { id:"pitch",   lbl:"Argumentaire" },
    { id:"revenus", lbl:"Revenus" }
  ];
  var TEINTES = { tournee:"petrole", pitch:"sauge" };

  /* ------------------------------ utilitaires ------------------------------ */
  function esc(s){ return api.esc(s); }
  function eur(c){ return api.eur(c); }
  function st(p){ return D_.statuts[p.statut]; }
  function aPied(p){ return Math.max(1, Math.round(p.dist / 75)); }
  function trouver(id){
    for (var i = 0; i < P.length; i++) if (P[i].id === +id) return P[i];
    return null;
  }
  function libres(){
    return P.filter(function(p){ return p.statut === "jamais" || p.statut === "sansrep"; })
      .sort(function(a, b){ return a.dist - b.dist; });
  }
  function actifs(){ return P.filter(function(p){ return p.statut === "client"; }).length; }
  function reste(p){
    var s = p.reste | 0;
    var j = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    return j + " j " + String(h).padStart(2, "0") + " h " + String(m).padStart(2, "0");
  }
  function pastille(p){
    return '<span class="m-status m-st-' + p.statut + '">' + esc(st(p).nom) + '</span>';
  }

  /* Position stable sur la carte, dérivée de l'identifiant et de la distance :
     la distance est réelle, la projection est une commodité de maquette. */
  function pos(p){
    var a = (p.id * 2.399963) % 6.283185;
    var r = 14 + Math.min(34, p.dist / 26);
    return { x: 50 + Math.cos(a) * r, y: 47 + Math.sin(a) * r * 0.86 };
  }

  function icone(n){
    var paths = {
      secteur:'<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
      tournee:'<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h8a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h8"/>',
      pitch:'<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8m-8 3h5"/>',
      revenus:'<path d="M3 21h18M6 17v-5m5 5V7m5 10v-3m4 3V9"/>',
      itineraire:'<path d="M12 3 21 21 12 17 3 21z"/>',
      arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
      play:'<path d="M7 4v16l13-8z"/>'
    };
    return '<svg class="m-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[n] || paths.secteur) + '</svg>';
  }

  function titre(sous, texte, droite){
    return '<div class="m-page-title"><div><span class="m-eyebrow">' + sous + '</span><h1>' + texte + '</h1></div>' + (droite || '') + '</div>';
  }
  function compteur(n, lbl){
    return '<span class="m-total-count">' + n + '<small>' + lbl + '</small></span>';
  }

  /* ------------------------------ en-tête, dock ------------------------------ */
  function head(){
    return '<header class="m-head"><button class="m-logo" data-menu aria-label="Pelyo, ouvrir le menu"><img src="assets/logo-toque.png" alt="" width="36" height="36"></button>' +
      '<div class="m-brand"><b>' + esc(D_.commercial.nom) + '</b><span>Pelyo · commercial</span></div>' +
      '<button class="m-round" data-itineraire aria-label="Itinéraire vers le prochain restaurant">' + icone('itineraire') + '</button></header>';
  }

  function navigation(){
    return '<nav class="m-dock" aria-label="Navigation commercial">' + VUES.map(function(v){
      return '<button data-vue="' + v.id + '" aria-current="' + (vue === v.id ? 'page' : 'false') + '" class="' + (vue === v.id ? 'm-active' : '') + '">' + icone(v.id) + '<span>' + esc(v.lbl) + '</span></button>';
    }).join('') + '</nav>';
  }

  /* -------------------------- tiroir de navigation -------------------------- */
  function listeTiroir(){
    return VUES.map(function(v){
      return '<button data-vue="' + v.id + '" class="' + (vue === v.id ? "on" : "") + '">' + esc(v.lbl) + '</button>';
    }).join("") + '<div class="m-tiroir-sep" aria-hidden="true"></div><button data-mentions>Mentions légales</button>';
  }
  function rafraichirTiroir(){
    var liste = tiroir.querySelector("[data-tiroir-liste]");
    if (liste) liste.innerHTML = listeTiroir();
  }
  function ouvrirTiroir(){
    if (menuOuvert) return;
    menuOuvert = true;
    scrim.classList.add("on");
    tiroir.classList.add("on");
    root.inert = true;
    tiroir.setAttribute('role','dialog');
    tiroir.setAttribute('aria-modal','true');
    tiroir.setAttribute('aria-label','Menu Pelyo');
    tiroir.querySelector('button').focus();
  }
  function fermerTiroir(){
    if (!menuOuvert) return;
    menuOuvert = false;
    scrim.classList.remove("on");
    tiroir.classList.remove("on");
    root.inert = false;
    var trigger = root.querySelector('[data-menu]'); if (trigger) trigger.focus();
  }

  function allerA(v){
    vue = v; choisi = null; mentions = false;
    rafraichirTiroir();
    peindre();
  }

  /* -------------------------------- secteur -------------------------------- */
  function carte(){
    var ilots = [
      [8,8,124,62],[148,8,114,62],[278,8,60,62],
      [8,86,124,56],[148,86,114,56],[278,86,60,56],
      [8,158,124,84],[148,158,114,84],[278,158,60,84]
    ].map(function(r){ return '<rect x="' + r[0] + '" y="' + r[1] + '" width="' + r[2] + '" height="' + r[3] + '" rx="3"/>'; }).join('');
    var pins = P.map(function(p){
      var c = pos(p), off = filtre && p.statut !== filtre;
      var cx = c.x.toFixed(1) + '%', cy = c.y.toFixed(1) + '%';
      return '<g class="m-pin' + (off ? ' m-pin-off' : '') + '" data-pin="' + p.id + '">' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="16" fill="transparent"/>' +
        (p.statut === "reserve" ? '<circle class="m-halo" cx="' + cx + '" cy="' + cy + '" r="9"/>' : '') +
        '<circle class="m-pin-ring" cx="' + cx + '" cy="' + cy + '" r="8.5"/>' +
        '<circle class="m-pin-' + p.statut + '" cx="' + cx + '" cy="' + cy + '" r="5.5"/>' +
      '</g>';
    }).join('');
    return '<figure class="m-card m-map">' +
      '<svg viewBox="0 0 390 250" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
        '<rect class="m-map-sol" width="390" height="250"/>' +
        '<g class="m-map-ilot">' + ilots + '</g>' +
        '<rect class="m-map-parc" x="156" y="166" width="98" height="68" rx="3"/>' +
        '<path class="m-map-eau" d="M318 0 H390 V250 H298 Q334 176 310 120 Q294 60 318 0 Z"/>' +
        '<path class="m-map-pont" d="M296 78 H390 M304 150 H390"/>' +
        '<text class="m-map-txt" x="14" y="81">COURS GAMBETTA</text>' +
        '<text class="m-map-txt" x="14" y="153">AV. JEAN-JAURÈS</text>' +
        '<text class="m-map-txt m-map-parc-txt" x="184" y="203">SQUARE</text>' +
        pins +
        '<circle class="m-halo m-ici-halo" cx="50%" cy="47%" r="11"/>' +
        '<circle class="m-ici" cx="50%" cy="47%" r="6.5"/>' +
      '</svg>' +
      '<figcaption class="m-map-cap"><span>● Vous êtes ici</span><span>Touchez un point pour ouvrir la fiche</span></figcaption>' +
    '</figure>';
  }

  function ligneProspect(p){
    return '<button class="m-trow" data-fiche="' + p.id + '">' +
      '<span class="m-trow-n m-mono">' + p.dist + '<small>m</small></span>' +
      '<span class="m-trow-c"><b>' + esc(p.nom) + '</b><span>' + esc(p.type) + ' · ' + esc(p.adr) + '</span>' +
        '<span class="m-trow-st">' + pastille(p) +
        (p.statut === "reserve" && p.reste ? ' <span class="m-mono m-cd-mini" data-cdl="' + p.id + '">' + reste(p) + '</span>' : '') + '</span></span>' +
      '<span class="m-trow-h">' + icone('arrow') + '</span>' +
    '</button>';
  }

  function vueSecteur(){
    var liste = P.filter(function(p){ return !filtre || p.statut === filtre; })
      .sort(function(a, b){ return a.dist - b.dist; });
    var zone = D_.commercial.zone.split("—");
    var onglets = [{ id:"", nom:"Tous", n:P.length }].concat(Object.keys(D_.statuts).map(function(k){
      return { id:k, nom:D_.statuts[k].nom, n:P.filter(function(p){ return p.statut === k; }).length };
    }));
    return titre(esc((zone[1] || zone[0]).trim().toUpperCase()), 'Le secteur.', compteur(D_.commercial.cibles, 'cibles')) +
    '<div class="m-filt" aria-label="Filtrer par statut">' + onglets.map(function(o){
      return '<button data-filtre="' + o.id + '" class="' + (filtre === o.id ? 'on' : '') + '">' + esc(o.nom) + '<em>' + o.n + '</em></button>';
    }).join('') + '</div>' +
    '<div class="m-body">' +
      carte() +
      '<div class="m-lbl">' + liste.length + ' restaurant' + (liste.length > 1 ? 's' : '') + '<em>Du plus proche au plus loin</em></div>' +
      (liste.length ? liste.map(ligneProspect).join('') : '<div class="m-empty">Aucun restaurant avec ce statut sur le secteur.</div>') +
      '<div class="m-note">Le secteur est une <b>priorité commerciale, pas un planning</b> : vous gardez vos horaires, votre parcours et votre organisation.</div>' +
      '<div class="m-demo-note">Compte démo · données de démonstration</div>' +
    '</div>';
  }

  /* ------------------------------ fiche prospect ------------------------------ */
  function overlayFiche(p){
    var stop = p.statut === "stop";
    var libre = p.statut === "jamais" || p.statut === "sansrep";
    var cta = libre
      ? '<button class="m-btn amb" data-prendre="' + p.id + '">Je prends ce prospect</button>'
      : '<button class="m-btn" data-visite="' + p.id + '">Marquer une visite</button>';
    var PREUVES = [
      { id:"appel",   l:"Appel",   s:"numéro pro" },
      { id:"message", l:"Message", s:"canal Pelyo" },
      { id:"photo",   l:"Photo",   s:"de devanture" }
    ];
    return '<div class="m-over" aria-label="Fiche ' + esc(p.nom) + '">' +
      '<div class="m-ohead"><button data-fermer>← Retour</button><span class="m-clock m-mono">' + p.dist + ' m · ' + aPied(p) + ' min à pied</span></div>' +
      '<div class="m-htitle">' + pastille(p) + '<h2>' + esc(p.nom) + '</h2>' +
        '<p>' + esc(p.type) + ' · ' + esc(p.adr) + (p.info ? '<br>' + esc(p.info) : '') + '</p></div>' +

      (p.statut === "reserve" && p.reste ?
        '<article class="m-card m-card-prep"><span class="m-eyebrow">RÉSERVÉ PAR VOUS</span>' +
          '<div class="m-level m-mono" data-cd>' + reste(p) + '</div><div class="m-level-meta">restantes avant retour au commun</div>' +
          '<span class="m-bar"><span data-cdbar style="width:' + Math.round(p.reste / DUREE_RESA * 100) + '%"></span></span>' +
          '<p class="m-quote">Sans action il retourne au commun : vous serez bloqué deux mois, un autre commercial pourra le prendre tout de suite.</p>' +
        '</article>' : '') +

      (p.derniere || p.preuve || p.objection ?
        '<div class="m-lbl">Dernière action</div>' +
        (p.derniere ? '<div class="m-kv"><span>Action</span><b>' + esc(p.derniere) + '</b></div>' : '') +
        (p.preuve ? '<div class="m-kv"><span>Preuve</span><b>' + esc(p.preuve) + '</b></div>' : '') +
        (p.objection ? '<div class="m-note amb">' + esc(p.objection) + '</div>' : '') : '') +

      (stop
        ? '<div class="m-note amb">Opposition définitive : ce restaurant ne doit plus être contacté, par aucun commercial.</div>'
        : '<div class="m-lbl">Tracer la visite<em>Preuve choisie</em></div>' +
          '<div class="m-seg">' + PREUVES.map(function(x){
            return '<button class="' + (preuve === x.id ? 'on' : '') + '" aria-pressed="' + (preuve === x.id) + '" data-preuve="' + x.id + '">' + x.l + '<small>' + x.s + '</small></button>';
          }).join('') + '</div>' +
          '<div class="m-note">Photo de devanture <b>sans visages ni plaques</b>. L’audio ne sert pas de preuve. La géolocalisation est ponctuelle, jamais un suivi continu.</div>' +
          '<div class="m-lbl">Suite</div>' +
          '<button class="m-r" data-rappel="' + p.id + '"><span class="v">Planifier un rappel<small>Hors rush, lundi 10h</small></span><span class="s">›</span></button>' +
          '<button class="m-r" data-essai="' + p.id + '"><span class="v">Passer en essai gratuit<small>La commission de ' + esc(eur(D_.commission)) + ' court dès le premier mois payant</small></span><span class="s">›</span></button>' +
          (p.statut === "reserve" ? '<button class="m-r" data-rendre="' + p.id + '"><span class="v">Rendre au commun<small>Blocage de deux mois pour vous</small></span><span class="s">›</span></button>' : '') +
          '<button class="m-r m-danger" data-stop="' + p.id + '"><span class="v">Ne plus contacter<small>Opposition définitive, respectée par tous les commerciaux</small></span><span class="s">›</span></button>') +

      '<div class="m-ofoot">' +
        (stop ? '<p class="m-hold">Aucune action commerciale possible.</p><button class="m-btn2" data-fermer>Fermer</button>'
              : cta + '<button class="m-btn2" data-itineraire="' + p.id + '">' + icone('itineraire') + 'Itinéraire</button>') +
      '</div>' +
    '</div>';
  }

  /* -------------------------------- tournée -------------------------------- */
  function vueTournee(){
    var l = libres(), total = 0;
    l.forEach(function(p){ total += aPied(p) + 12; });
    return titre('À VOIR AUJOURD’HUI', 'La tournée.', compteur(l.length, 'arrêts')) +
    '<div class="m-meta"><span>Environ <b>' + total + ' min</b> à pied et sur place</span><span>Depuis votre position</span></div>' +
    '<div class="m-body">' +
      (l.length
        ? '<div class="m-route">' + l.map(function(p, i){
            return '<button class="m-stop" data-fiche="' + p.id + '"><span class="m-stop-n">' + (i + 1) + '</span>' +
              '<span class="m-stop-c"><b>' + esc(p.nom) + '</b><span>' + esc(p.adr) + ' · ' + p.dist + ' m · ' + aPied(p) + ' min à pied</span></span>' +
              icone('arrow') + '</button>';
          }).join('') + '</div>' +
          '<div class="m-acts"><button class="m-btn amb" data-itineraire="' + l[0].id + '">' + icone('itineraire') + 'Itinéraire vers le premier arrêt</button></div>'
        : '<div class="m-empty">Tout le secteur a été démarché.</div>') +
      '<div class="m-note">Ordre par distance croissante depuis votre position. <b>Rien ne vous oblige à le suivre</b> — c’est une suggestion, pas un itinéraire imposé.</div>' +
      '<div class="m-note">Repère national : environ <b>29 700 cibles</b> en France, soit une pour 2 300 habitants.</div>' +
    '</div>';
  }

  /* ------------------------------ argumentaire ------------------------------ */
  function fil(){
    if (!demoVues.length) return '<p class="m-sys">Touchez « Jouer la démo » pour faire entendre l’assistant au gérant.</p>';
    return demoVues.map(function(e, i){
      var neuf = i === demoVues.length - 1 ? ' m-new' : '';
      if (e.qui === "sys") return '<p class="m-sys' + neuf + '">' + esc(e.txt) + '</p>';
      return '<div class="m-bulle ' + (e.qui === "me" ? 'cu' : 'ia') + neuf + '"><span>' + (e.qui === "me" ? 'Client' : 'Assistant Pelyo') + '</span>' + esc(e.txt) + '</div>';
    }).join('');
  }

  function vuePitch(){
    var pitch = "Vous ratez des appels entre midi et deux, et le soir. " +
      "Un assistant décroche à votre place, prend la commande et vous l’envoie confirmée. " +
      "Vous gardez votre numéro. Dix minutes à installer.";
    var tient = [
      { t:"Il garde son numéro", x:D_.regles.renvoi },
      { t:"Rien ne part sans confirmation", x:D_.regles.confirmation },
      { t:"Pelyo n’encaisse jamais", x:D_.regles.paiement }
    ];
    return titre('VINGT SECONDES, DEBOUT, HORS RUSH', 'Le pitch.', icone('pitch')) +
    '<div class="m-pane">' +
      '<div class="m-note amb">« ' + esc(pitch) + ' »</div>' +
      '<div class="m-timer"><b class="m-mono" data-chrono>00:00</b><span class="m-bar"><span data-jauge style="width:0"></span></span><small>20 s</small></div>' +
      '<div class="m-acts"><button class="m-btn" data-pitch>' + icone('play') + 'Lancer le minuteur</button></div>' +
      '<div class="m-lbl">Objections<em>Touchez pour la réponse</em></div>' +
      D_.commercial.objections.map(function(o){
        return '<details class="m-obj"><summary><span>' + esc(o.q) + '</span><span class="m-chev" aria-hidden="true">⌄</span></summary><p>' + esc(o.r) + '</p></details>';
      }).join('') +
      '<div class="m-lbl">Faire écouter<em>Exemple de démonstration</em></div>' +
      '<div class="m-thread" data-thread>' + fil() + '</div>' +
      '<div class="m-acts"><button class="m-btn2" data-demo>' + icone('play') + 'Jouer la démo</button></div>' +
      '<div class="m-lbl">Ce qui tient</div>' +
      tient.map(function(r, i){
        return '<div class="m-rule"><span class="m-rule-n">' + (i + 1) + '</span><span class="m-rule-c"><b>' + esc(r.t) + '</b><span>' + esc(r.x) + '</span></span></div>';
      }).join('') +
    '</div>';
  }

  /* -------------------------------- revenus -------------------------------- */
  function vueRevenus(){
    var n = actifs();
    var g = D_.commercial.gains, gmax = Math.max.apply(null, g.map(function(x){ return x.v; }));
    var fun = D_.commercial.entonnoir, fmax = fun[0].n;
    var v = simu || Math.max(1, n);
    return titre('CE MOIS-CI', 'Mes revenus.', compteur(n, 'clients actifs')) +
    '<div class="m-pane">' +
      '<article class="m-card m-card-ok"><span class="m-eyebrow">COMMISSION DU MOIS</span>' +
        '<div class="m-level m-money">' + esc(eur(n * D_.commission)) + '</div>' +
        '<div class="m-level-meta">' + n + ' clients actifs × ' + esc(eur(D_.commission)) + '</div>' +
        '<p class="m-quote">Récurrent tant qu’ils restent abonnés. Aucun quota, aucun plafond ; les frais de déplacement restent à votre charge.</p>' +
      '</article>' +
      '<div class="m-lbl">Quatre derniers mois</div>' +
      g.map(function(x, i){
        return '<div class="m-hbar"><span>' + esc(x.m) + '</span><span class="m-track"><span class="' + (i === g.length - 1 ? 'm-ok' : '') + '" style="width:' + Math.round(x.v / gmax * 100) + '%"></span></span><b>' + esc(eur(x.v)) + '</b></div>';
      }).join('') +
      '<div class="m-lbl">Entonnoir du secteur</div>' +
      fun.map(function(e, i){
        var cls = i === fun.length - 1 ? 'm-warn' : (i === fun.length - 2 ? 'm-ok' : 'm-dim');
        return '<div class="m-hbar m-hbar-large"><span>' + esc(e.e) + '</span><span class="m-track"><span class="' + cls + '" style="width:' + Math.round(e.n / fmax * 100) + '%"></span></span><b>' + e.n + '</b></div>';
      }).join('') +
      '<div class="m-lbl">Si j’en signe davantage<em>Simulation</em></div>' +
      '<div class="m-slide"><input type="range" data-simu min="1" max="120" value="' + v + '" aria-label="Nombre de clients actifs simulé"></div>' +
      '<div class="m-kv"><span>Clients actifs</span><b data-sl-n>' + v + '</b></div>' +
      '<div class="m-kv m-ok"><span>Par mois</span><b data-sl-m>' + esc(eur(v * D_.commission)) + '</b></div>' +
      '<div class="m-kv"><span>Sur douze mois</span><b data-sl-a>' + esc(api.eur0(v * D_.commission * 12)) + '</b></div>' +
      '<div class="m-note amb">Repère du business plan : 1 500 à 1 800 visites par an, conversion supposée de 10 à 15 %, soit 150 à 270 clients par an. <b>Hypothèse à valider, pas une promesse.</b></div>' +
      '<div class="m-lbl">Règles</div>' +
      D_.commercial.regles.map(function(r, i){
        return '<div class="m-rule"><span class="m-rule-n">' + (i + 1) + '</span><span class="m-rule-c"><b>' + esc(r.t) + '</b><span>' + esc(r.x) + '</span></span></div>';
      }).join('') +
    '</div>';
  }

  /* --------------------------- mentions légales --------------------------- */
  function overlayMentions(){
    var l = D_.mentionsLegales;
    return '<div class="m-over m-legal" aria-label="Mentions légales">' +
      '<div class="m-ohead"><button data-fermer>← Retour</button><span class="m-clock">Document de travail</span></div>' +
      '<span class="m-eyebrow m-legal-eye">PELYO · INFORMATIONS</span><h2 class="m-legal-h">Mentions légales.</h2>' +
      '<p class="m-legal-warning"><b>Projet pour la version officielle.</b> Texte incomplet, à vérifier et compléter avant publication.</p>' +
      '<h3>Éditeur</h3><p>Le site web Pelyo et les applications Pelyo destinées aux gérants, aux équipes de cuisine et aux commerciaux sont édités par <strong>' + esc(l.editeur) + '</strong>, ' + esc(l.forme) + ' au capital de <strong>' + esc(l.capital) + '</strong>, dont le siège social est situé <strong>' + esc(l.adresse) + '</strong>.</p>' +
      '<p>' + esc(l.nomCommercial) + ' est le nom commercial sous lequel ' + esc(l.editeur) + ' propose son service.</p>' +
      '<h3>Contact</h3><p><a href="mailto:' + esc(l.email) + '">' + esc(l.email) + '</a><br><a href="tel:' + esc(l.telephone.replace(/\s/g, '')) + '">' + esc(l.telephone) + '</a></p>' +
      '<h3>Directeur de la publication</h3><p><strong>' + esc(l.directeur) + '</strong>, ' + esc(l.fonctionDirecteur) + '.</p>' +
    '</div>';
  }

  /* --------------------------------- rendu --------------------------------- */
  function corps(){
    if (vue === "tournee") return vueTournee();
    if (vue === "pitch")   return vuePitch();
    if (vue === "revenus") return vueRevenus();
    return vueSecteur();
  }

  function peindre(){
    var ancre = root.querySelector(".m-body, .m-pane");
    var memeVue = vue === derniereVue;
    var y = ancre && memeVue ? ancre.scrollTop : 0;
    var barre = root.querySelector(".m-filt");
    var bx = barre ? barre.scrollLeft : 0;
    var ancienne = root.querySelector(".m-over");
    var oy = ancienne ? ancienne.scrollTop : 0;
    var ouverts = [];
    Array.prototype.forEach.call(root.querySelectorAll(".m-obj"), function(d, i){ if (d.open) ouverts.push(i); });
    var focus = document.activeElement, focusSel = null;
    if (focus && root.contains(focus)){
      ["data-vue","data-filtre","data-fiche","data-preuve"].some(function(attr){
        if (focus.hasAttribute(attr)){ focusSel = '[' + attr + '="' + focus.getAttribute(attr) + '"]'; return true; }
        return false;
      });
    }
    var cle = choisi ? "fiche" + choisi.id : mentions ? "mentions" : "";
    var memeFeuille = !!(cle && cle === derniereCle);
    root.setAttribute("data-page", vue);
    if (TEINTES[vue]) root.setAttribute("data-teinte", TEINTES[vue]); else root.removeAttribute("data-teinte");
    if (memeVue) root.setAttribute("data-still", ""); else root.removeAttribute("data-still");
    root.innerHTML = head() + corps() + navigation() + (choisi ? overlayFiche(choisi) : mentions ? overlayMentions() : "");
    if (memeVue){
      var objs = root.querySelectorAll(".m-obj");
      ouverts.forEach(function(i){ if (objs[i]) objs[i].open = true; });
    }
    if (root.querySelector(".m-filt")) root.querySelector(".m-filt").scrollLeft = bx;
    if (choisi || mentions){
      var dialog = root.querySelector(".m-over");
      if (memeFeuille) dialog.classList.add("m-still");
      dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true");
      Array.prototype.forEach.call(root.children, function(el){ if (el !== dialog) el.inert = true; });
      var first = (focusSel && dialog.querySelector(focusSel)) || dialog.querySelector("button");
      if (first) first.focus({ preventScroll:true, focusVisible:clavier });
      dialog.scrollTop = memeFeuille ? oy : 0;
    } else if (focusSel){
      var nf = root.querySelector(focusSel); if (nf) nf.focus({ preventScroll:true });
    }
    var a2 = root.querySelector(".m-body, .m-pane");
    if (a2) a2.scrollTop = y;
    derniereVue = vue; derniereCle = cle;
    api.badge(P.filter(function(p){ return p.statut === "reserve" || p.statut === "attente"; }).length || 0);
  }

  function majSimu(v){
    simu = v;
    var a = root.querySelector("[data-sl-n]"), b = root.querySelector("[data-sl-m]"), c = root.querySelector("[data-sl-a]");
    if (a) a.textContent = v;
    if (b) b.textContent = eur(v * D_.commission);
    if (c) c.textContent = api.eur0(v * D_.commission * 12);
  }

  /* -------------------------------- montage -------------------------------- */
  function monter(scene, a){
    api = a; D_ = a.data;
    vue = "secteur"; derniereVue = ""; derniereCle = "";
    choisi = null; mentions = false; filtre = ""; menuOuvert = false; demoVues = []; simu = 0;
    pitchT = null; demoT = null;

    P = D_.prospects.map(function(p){
      var n = {};
      for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k)) n[k] = p[k];
      if (p.statut === "reserve") n.reste = 2 * 86400 + 4 * 3600 + 15 * 60;
      return n;
    });

    root = document.createElement("div");
    root.className = "m-app";
    scene.appendChild(root);

    scrim = document.createElement("div");
    scrim.className = "m-scrim";
    scene.appendChild(scrim);
    scrim.addEventListener("click", fermerTiroir);

    tiroir = document.createElement("nav");
    tiroir.className = "m-tiroir";
    tiroir.innerHTML =
      '<div class="m-tiroir-head">' + esc(D_.commercial.zone.split("—")[0].trim()) + '<button data-fermer-tiroir aria-label="Fermer">✕</button></div>' +
      '<div class="m-tiroir-liste" data-tiroir-liste></div>';
    scene.appendChild(tiroir);
    rafraichirTiroir();
    tiroir.addEventListener("click", function(ev){
      var b = ev.target.closest && ev.target.closest("[data-vue],[data-fermer-tiroir],[data-mentions]");
      if (!b) return;
      fermerTiroir();
      if (b.dataset.vue) allerA(b.dataset.vue);
      else if (b.hasAttribute("data-mentions")){ choisi = null; mentions = true; peindre(); }
    });
    tiroir.addEventListener("keydown", function(ev){
      if (ev.key === "Escape"){ ev.stopPropagation(); fermerTiroir(); }
      if (ev.key === "Tab"){
        var items = tiroir.querySelectorAll("button");
        if (ev.shiftKey && document.activeElement === items[0]){ ev.preventDefault(); items[items.length - 1].focus(); }
        else if (!ev.shiftKey && document.activeElement === items[items.length - 1]){ ev.preventDefault(); items[0].focus(); }
      }
    });

    peindre();

    /* La réservation descend réellement : seuls les textes du compte à rebours
       bougent chaque seconde, pas l'écran entier. */
    api.every(function(){
      var expire = null;
      P.forEach(function(p){
        if (p.statut === "reserve" && p.reste > 0){
          p.reste -= 1;
          if (p.reste <= 0){ p.statut = "jamais"; p.reste = 0; p.info = ""; expire = p; }
        }
      });
      if (expire){ api.toast("Réservation expirée : " + expire.nom + " est revenu au commun."); peindre(); return; }
      var cd = root.querySelector("[data-cd]");
      if (cd && choisi) cd.textContent = reste(choisi);
      var bar = root.querySelector("[data-cdbar]");
      if (bar && choisi) bar.style.width = Math.round(choisi.reste / DUREE_RESA * 100) + "%";
      Array.prototype.forEach.call(root.querySelectorAll("[data-cdl]"), function(el){
        var p = trouver(el.getAttribute("data-cdl"));
        if (p) el.textContent = reste(p);
      });
    }, 1000);

    root.addEventListener("input", function(ev){
      if (ev.target.hasAttribute("data-simu")) majSimu(+ev.target.value);
    });

    root.addEventListener("pointerdown", function(){ clavier = false; });
    root.addEventListener("keydown", function(ev){
      clavier = true;
      if (ev.key === "Escape"){
        ev.stopPropagation();
        if (choisi || mentions){ choisi = null; mentions = false; peindre(); }
        return;
      }
      var over = root.querySelector(".m-over");
      if (ev.key === "Tab" && over){
        var btns = over.querySelectorAll("button");
        if (btns.length && ev.shiftKey && document.activeElement === btns[0]){ ev.preventDefault(); btns[btns.length - 1].focus(); }
        else if (btns.length && !ev.shiftKey && document.activeElement === btns[btns.length - 1]){ ev.preventDefault(); btns[0].focus(); }
      }
    });

    root.addEventListener("click", function(ev){
      var t = ev.target;
      if (!t.closest) return;
      var SEL = "[data-menu],[data-vue],[data-pin],[data-fiche],[data-filtre],[data-fermer]," +
                "[data-prendre],[data-visite],[data-preuve],[data-rappel],[data-essai],[data-stop]," +
                "[data-rendre],[data-itineraire],[data-pitch],[data-demo]";
      var b = t.closest(SEL);
      if (!b) return;
      var d = b.dataset, p;

      if (d.menu !== undefined){ ouvrirTiroir(); return; }
      if (d.vue){ allerA(d.vue); return; }
      if (d.pin || d.fiche){ choisi = trouver(d.pin || d.fiche); peindre(); return; }
      if (d.fermer !== undefined){ choisi = null; mentions = false; peindre(); return; }
      if (d.filtre !== undefined){ filtre = d.filtre; peindre(); return; }
      if (d.prendre){
        p = trouver(d.prendre);
        p.statut = "reserve"; p.reste = DUREE_RESA; p.info = "Réservé par vous";
        choisi = p;
        api.vibrer(14);
        api.toast("Réservé 3 jours. Sans action il retourne au commun : vous serez bloqué deux mois, un autre pourra le prendre.");
        peindre(); return;
      }
      if (d.rendre){
        p = trouver(d.rendre);
        p.statut = "jamais"; p.reste = 0; p.info = "";
        api.toast("Rendu au commun. Blocage de deux mois pour vous ; disponible tout de suite pour un autre.");
        peindre(); return;
      }
      if (d.preuve){ preuve = d.preuve; peindre(); return; }
      if (d.visite){
        p = trouver(d.visite);
        var lbl = preuve === "appel" ? "appel depuis le numéro professionnel"
                : preuve === "message" ? "message depuis le canal Pelyo"
                : "photo de devanture";
        p.derniere = api.heure() + " · visite tracée";
        p.preuve = lbl;
        if (p.statut === "jamais" || p.statut === "sansrep") p.statut = "attente";
        api.toast("Visite tracée (" + lbl + "). Protection de 30 jours depuis cette action.");
        choisi = p; peindre(); return;
      }
      if (d.rappel){
        p = trouver(d.rappel);
        p.statut = "attente"; p.reste = 0; p.info = "Rappel programmé lundi 10h";
        api.toast("Rappel programmé lundi 10h — hors rush.");
        choisi = p; peindre(); return;
      }
      if (d.essai){
        p = trouver(d.essai);
        p.statut = "essai"; p.reste = 0; p.info = "Essai — jour 1 sur 14";
        api.toast("Essai gratuit lancé. La commission de " + eur(D_.commission) + " court dès le premier mois payant.");
        choisi = p; peindre(); return;
      }
      if (d.stop){
        p = trouver(d.stop);
        p.statut = "stop"; p.reste = 0; p.info = "Opposition explicite";
        api.toast("Ne plus contacter : opposition définitive, respectée par tous les commerciaux.");
        choisi = null; peindre(); return;
      }
      if (d.itineraire !== undefined){
        var cible = trouver(d.itineraire) || choisi || libres()[0];
        if (cible) api.toast("Démo : itinéraire vers " + cible.nom + " — " + cible.dist + " m, " + aPied(cible) + " min à pied.");
        return;
      }
      if (d.pitch !== undefined){
        var t0 = 0;
        if (pitchT) clearInterval(pitchT);
        pitchT = api.every(function(){
          t0 += 0.2;
          var c = root.querySelector("[data-chrono]"), j = root.querySelector("[data-jauge]");
          if (!c || !j){ clearInterval(pitchT); pitchT = null; return; }
          c.textContent = "00:" + String(Math.floor(t0)).padStart(2, "0");
          j.style.width = Math.min(100, t0 / 20 * 100) + "%";
          if (t0 >= 20){ clearInterval(pitchT); pitchT = null; api.toast("Vingt secondes. C’est tout ce qu’il faut pour obtenir une démo."); }
        }, 200);
        return;
      }
      if (d.demo !== undefined){
        var i = 0, extrait = D_.appel.slice(0, 6);
        demoVues = [];
        if (demoT) clearInterval(demoT);
        var afficher = function(){
          var zone = root.querySelector("[data-thread]");
          if (zone) zone.innerHTML = fil();
        };
        afficher();
        demoT = api.every(function(){
          if (i >= extrait.length){ clearInterval(demoT); demoT = null; return; }
          demoVues.push(extrait[i]); i++;
          afficher();
        }, 1100);
        return;
      }
    });

    return function(){
      if (pitchT) clearInterval(pitchT);
      if (demoT) clearInterval(demoT);
      pitchT = null; demoT = null; choisi = null;
    };
  }

  RIA.register({
    id:"commercial", nom:"Commercial", badge:"3",
    fond:"linear-gradient(145deg,#5BE4A0,#12A05E)", encre:"#04200F",
    glyph:'<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    format:"phone",
    css:"commercial.css",
    monter:monter
  });
})();
