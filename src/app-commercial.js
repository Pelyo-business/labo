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
  var theme = 'light';

  /* Compte réel : les prospects viennent de la base, et chaque geste part au
     serveur, qui applique seul les règles (réservation, blocage, protection,
     preuve). L'appli affiche et demande, elle ne décide rien. */
  var reel = false, charge = false, erreurChargement = "";
  var moiId = null, prenom = "", zonesNoms = [], commissions = [], blocages = {};
  var ici = null;            /* position ponctuelle, jamais suivie */
  var plus = 40;             /* lignes affichées dans la liste */
  var suite = "attente", noteVisite = "", retourVisite = "";
  var envoi = false, photoPour = null, photoSuite = "", photoInput = null;
  var versionDonnees = 0, sigPoints = "";
  var carteDiv = null, carteL = null, calque = null, carteCadree = false, leafletEtat = "";
  var GENRES = { kebab:"Kebab", tacos:"Tacos", burger:"Burger", pizza:"Pizza", snack:"Snack", autre:"Restauration rapide" };
  var SUITES = [
    { id:"sansrep", l:"Sans réponse", s:"personne de dispo" },
    { id:"attente", l:"Intéressé",    s:"à revoir, démo" },
    { id:"refus",   l:"Refus",        s:"pas pour l’instant" }
  ];
  var LIB_SUITE = { sansrep:"Sans réponse", attente:"Intéressé", refus:"Refus", essai:"Essai gratuit", stop:"Ne plus contacter" };
  var LIB_ACTION = { appel:"appel", message:"message", porte_a_porte:"visite", note:"note" };
  var MOIS = ["Janv.","Févr.","Mars","Avr.","Mai","Juin","Juil.","Août","Sept.","Oct.","Nov.","Déc."];
  var LEAFLET = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/";
  function lireTheme(){ try { return localStorage.getItem('pelyo:commercial:theme') === 'dark' ? 'dark' : 'light'; } catch(e){ return 'light'; } }
  function appliquerTheme(){
    root.classList.toggle('m-dark',theme==='dark');
    if(tiroir)tiroir.classList.toggle('m-dark',theme==='dark');
  }

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
  function aPied(p){ return p.dist == null ? null : Math.max(1, Math.round(p.dist / 75)); }
  function trouver(id){
    for (var i = 0; i < P.length; i++) if (String(P[i].id) === String(id)) return P[i];
    return null;
  }
  /* Sans position connue, l'ordre est celui des villes puis des noms. */
  function parDistance(a, b){
    if (a.dist != null && b.dist != null) return a.dist - b.dist;
    if (a.dist != null) return -1;
    if (b.dist != null) return 1;
    return (a.ville || "").localeCompare(b.ville || "", "fr") || a.nom.localeCompare(b.nom, "fr");
  }
  function libres(){
    return P.filter(function(p){ return (p.statut === "jamais" || p.statut === "sansrep") && (!reel || peutPrendre(p)); })
      .sort(parDistance);
  }
  function metrage(p){
    if (p.dist == null) return "";
    return p.dist < 1000 ? p.dist + " m" : (p.dist / 1000).toFixed(1).replace(".", ",") + " km";
  }
  function trajet(p){
    if (p.dist == null) return "";
    return metrage(p) + (p.dist < 3000 ? " · " + aPied(p) + " min à pied" : "");
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
      '<div class="m-brand"><b>' + RIA.nomEnv(reel ? (prenom || 'Commercial') : D_.commercial.nom) + '</b><span>Pelyo · commercial</span></div>' +
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
    }).join("") + '<div class="m-tiroir-sep" aria-hidden="true"></div><div class="m-appearance"><span>Apparence</span><div class="m-theme-choices" role="group" aria-label="Choix de l’apparence"><button data-theme="light" aria-pressed="' + (theme==='light') + '">Clair</button><button data-theme="dark" aria-pressed="' + (theme==='dark') + '">Sombre</button></div></div><button data-mentions>Mentions légales</button>';
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
    if (reel) return carteReelle();
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
      '<figcaption class="m-map-cap"><span>● Votre secteur</span><span>Carte illustrative · démo</span></figcaption>' +
    '</figure>';
  }

  function ligneProspect(p){
    return '<button class="m-trow" data-fiche="' + p.id + '">' +
      '<span class="m-trow-n m-mono">' + (p.dist == null ? '·' : p.dist < 1000 ? p.dist + '<small>m</small>' : (p.dist / 1000).toFixed(1).replace('.', ',') + '<small>km</small>') + '</span>' +
      '<span class="m-trow-c"><b>' + esc(p.nom) + '</b><span>' + esc(p.type) + ' · ' + esc(p.adr) + '</span>' +
        '<span class="m-trow-st">' + pastille(p) +
        (p.statut === "reserve" && p.reste ? ' <span class="m-mono m-cd-mini" data-cdl="' + p.id + '">' + reste(p) + '</span>' : '') + '</span></span>' +
      '<span class="m-trow-h">' + icone('arrow') + '</span>' +
    '</button>';
  }

  function vueSecteur(){
    if (reel && !charge) return attenteChargement();
    var liste = P.filter(function(p){ return !filtre || p.statut === filtre; })
      .sort(parDistance);
    var tous = liste.length;
    if (reel) liste = liste.slice(0, plus);
    var zone = reel ? [zonesTexte()] : D_.commercial.zone.split("—");
    var onglets = [{ id:"", nom:"Tous", n:P.length }].concat(Object.keys(D_.statuts).map(function(k){
      return { id:k, nom:D_.statuts[k].nom, n:P.filter(function(p){ return p.statut === k; }).length };
    }));
    return titre(esc((zone[1] || zone[0]).trim().toUpperCase()), 'Le secteur.', compteur(reel ? P.length : D_.commercial.cibles, 'cibles')) +
    '<div class="m-filt" aria-label="Filtrer par statut">' + onglets.map(function(o){
      return '<button data-filtre="' + o.id + '" aria-pressed="' + (filtre === o.id) + '" class="' + (filtre === o.id ? 'on' : '') + '">' + esc(o.nom) + '<em>' + o.n + '</em></button>';
    }).join('') + '</div>' +
    '<div class="m-body">' +
      carte() +
      '<div class="m-lbl m-list-heading"><span>' + tous + ' restaurant' + (tous > 1 ? 's' : '') + '</span><em>' + (!reel || ici ? 'Les plus proches d’abord' : 'Par ville') + '</em></div>' +
      (liste.length ? liste.map(ligneProspect).join('') : '<div class="m-empty">' + (reel && !P.length ? 'Aucune zone ne vous est encore ouverte. Pelyo vous attribue vos zones avant votre première tournée.' : 'Aucun restaurant avec ce statut sur le secteur.') + '</div>') +
      (tous > liste.length ? '<div class="m-acts"><button class="m-btn2" data-plus>Afficher ' + Math.min(40, tous - liste.length) + ' restaurants de plus</button></div>' : '') +
      '<div class="m-note">Le secteur est une <b>priorité commerciale, pas un planning</b> : vous gardez vos horaires, votre parcours et votre organisation.</div>' +
      (reel ? '' : '<div class="m-demo-note">Compte démo · données de démonstration</div>') +
    '</div>';
  }

  /* ------------------------------ fiche prospect ------------------------------ */
  function overlayFiche(p){
    if (reel) return overlayFicheReelle(p);
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
    if (reel && !charge) return attenteChargement();
    var l = reel ? tourneeReelle() : libres(), total = 0;
    l.forEach(function(p){ total += (aPied(p) || 0) + 12; });
    return titre('À VOIR AUJOURD’HUI', 'La tournée.', compteur(l.length, 'arrêts')) +
    (!reel || ici
      ? '<div class="m-meta"><span>Environ <b>' + total + ' min</b> à pied et sur place</span><span>Depuis votre position</span></div>'
      : '<div class="m-meta"><span>Sans votre position, l’ordre suit les villes</span><button class="m-map-loc" data-localiser>Me localiser</button></div>') +
    '<div class="m-body">' +
      (l.length
        ? '<div class="m-route">' + l.map(function(p, i){
            return '<button class="m-stop" data-fiche="' + p.id + '"><span class="m-stop-n">' + (i + 1) + '</span>' +
              '<span class="m-stop-c"><b>' + esc(p.nom) + '</b><span>' + esc(p.adr) + (p.dist == null ? '' : ' · ' + esc(trajet(p))) + (p.mien ? ' · réservé par vous' : '') + '</span></span>' +
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
      '<div class="m-pitch-intro"><span class="m-eyebrow">L’ESSENTIEL, SIMPLEMENT</span><p>« ' + esc(pitch) + ' »</p></div>' +
      '<div class="m-timer"><b class="m-mono" data-chrono>00:00</b><span class="m-bar"><span data-jauge style="width:0"></span></span><small>20 s</small></div>' +
      '<div class="m-acts"><button class="m-btn" data-pitch>' + icone('play') + 'Lancer le minuteur</button></div>' +
      '<div class="m-lbl">Objections<em>Touchez pour la réponse</em></div>' +
      D_.commercial.objections.map(function(o){
        return '<details class="m-obj"><summary><span>' + esc(o.q) + '</span><span class="m-chev" aria-hidden="true">⌄</span></summary><p>' + esc(o.r) + '</p></details>';
      }).join('') +
      '<div class="m-lbl">Le parcours client<em>Conversation simulée</em></div>' +
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
    if (reel && !charge) return attenteChargement();
    var n = reel ? mesClients() : actifs();
    var g = reel ? gainsReels() : D_.commercial.gains, gmax = Math.max.apply(null, [1].concat(g.map(function(x){ return x.v; })));
    var fun = reel ? entonnoirReel() : D_.commercial.entonnoir, fmax = fun[0].n || 1;
    var v = simu || Math.max(1, n);
    return titre('CE MOIS-CI', 'Mes revenus.', compteur(n, 'clients actifs')) +
    '<div class="m-pane">' +
      '<article class="m-card m-card-ok m-revenue-card"><span class="m-eyebrow">COMMISSION DU MOIS</span>' +
        '<div class="m-level m-money">' + esc(eur(n * D_.commission)) + '</div>' +
        '<div class="m-level-meta">' + n + ' client' + (n > 1 ? 's' : '') + ' actif' + (n > 1 ? 's' : '') + ' × ' + esc(eur(D_.commission)) + (reel ? ' · estimation, le relevé fait foi' : '') + '</div>' +
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

  /* ------------------------------ compte réel ------------------------------ */
  function deux(n){ return (n < 10 ? "0" : "") + n; }
  function jj(t){ var d = new Date(t); return deux(d.getDate()) + "/" + deux(d.getMonth() + 1); }
  function aujourdhui(){ var d = new Date(); return d.getFullYear() + "-" + deux(d.getMonth() + 1) + "-" + deux(d.getDate()); }
  function dateLongue(iso){ var x = iso.split("-"); return x[2] + "/" + x[1] + "/" + x[0]; }

  function zonesTexte(){
    if (!zonesNoms.length) return "Aucune zone";
    return zonesNoms.length > 2 ? zonesNoms.length + " zones" : zonesNoms.join(" · ");
  }

  function attenteChargement(){
    return titre('VOS ZONES', erreurChargement ? 'Pas de connexion.' : 'Chargement…', '') +
      '<div class="m-body">' + (erreurChargement
        ? '<div class="m-empty">' + esc(erreurChargement) + '</div><div class="m-acts"><button class="m-btn" data-recharger>Réessayer</button></div>'
        : '<div class="m-empty">Vos zones et vos prospects arrivent.</div>') + '</div>';
  }

  /* Distance à vol d'oiseau, depuis la dernière position demandée. */
  function metres(a, b){
    var r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return Math.round(12742000 * Math.asin(Math.sqrt(h)));
  }

  /* Ce que la fiche doit savoir, recalculé à chaque changement. */
  function enrichir(p){
    var t = Date.now();
    p.mien = p.statut === "reserve" && p.reservePar === moiId;
    p.autre = p.statut === "reserve" && !p.mien;
    p.reste = p.mien && p.reserveJusqua ? Math.max(0, Math.round((p.reserveJusqua - t) / 1000)) : 0;
    p.bloque = blocages[p.id] && blocages[p.id] > t ? blocages[p.id] : null;
    p.suivi = p.suiviPar === moiId && p.statut !== "stop" && p.statut !== "reserve" &&
      ((p.protegeJusqua && p.protegeJusqua > t) || p.statut === "essai" || p.statut === "client");
    p.protegeAutre = !!(p.suiviPar && p.suiviPar !== moiId && p.protegeJusqua && p.protegeJusqua > t);
    p.pasAvant = p.retourLe && p.retourLe > aujourdhui() && p.suiviPar !== moiId ? p.retourLe : null;
    p.dist = ici && p.lat != null ? metres(ici, p) : null;
    p.info = p.mien ? "Réservé par vous"
      : p.autre ? "Réservé par un autre commercial"
      : p.statut === "client" || p.statut === "essai" ? (p.suiviPar === moiId ? "Apporté par vous" : "Suivi par un autre commercial")
      : p.suivi ? "Suivi par vous jusqu’au " + jj(p.protegeJusqua)
      : p.protegeAutre ? "Suivi par un autre commercial jusqu’au " + jj(p.protegeJusqua)
      : p.pasAvant ? "Ne pas recontacter avant le " + dateLongue(p.pasAvant)
      : p.bloque ? "Vous y aurez de nouveau accès le " + jj(p.bloque)
      : "";
    return p;
  }
  function peutPrendre(p){
    return ["jamais", "sansrep", "refus", "attente"].indexOf(p.statut) >= 0 &&
      !p.protegeAutre && !p.bloque && !p.pasAvant && !p.suivi;
  }
  function peutAgir(p){ return p.mien || p.suivi; }

  function versP(x, derniere){
    var p = {
      id:x.id, nom:x.nom, type:GENRES[x.genre] || GENRES.autre,
      adr:[x.adr, x.ville].filter(Boolean).join(", "), ville:x.ville, lat:x.lat, lon:x.lon, tel:x.tel,
      statut:x.statut, reservePar:x.reservePar, reserveJusqua:x.reserveJusqua,
      protegeJusqua:x.protegeJusqua, retourLe:x.retourLe, suiviPar:x.suiviPar
    };
    if (derniere) retenirAction(p, derniere);
    return enrichir(p);
  }
  function retenirAction(p, a){
    p.derniere = jj(a.at) + " · " + (LIB_ACTION[a.type] || a.type) + (a.resultat ? " · " + a.resultat : "");
    p.preuve = a.photo ? "Photo de devanture" : a.position ? "Position ponctuelle" : a.type === "appel" ? "Appel" : a.type === "message" ? "Message" : "";
    p.objection = a.objection || "";
  }

  function charger(){
    erreurChargement = "";
    PelyoDonnees.chargerCrm(function(e, r){
      if (e){ erreurChargement = e; peindre(); return; }
      var dernieres = {};
      r.actions.forEach(function(a){
        if (!dernieres[a.prospect_id]) dernieres[a.prospect_id] = { at:Date.parse(a.created_at), type:a.type, resultat:a.resultat,
          objection:a.objection, photo:!!a.preuve_photo_chemin, position:a.latitude != null };
      });
      blocages = {};
      r.blocages.forEach(function(b){ blocages[b.prospect_id] = Date.parse(b.jusqu_a); });
      zonesNoms = r.zones.map(function(z){ return z.nom; });
      commissions = r.commissions;
      P = r.prospects.map(function(x){ return versP(x, dernieres[x.id]); });
      if (choisi) choisi = trouver(choisi.id);
      charge = true; versionDonnees++;
      var titreTiroir = tiroir.querySelector("[data-tiroir-titre]");
      if (titreTiroir) titreTiroir.textContent = zonesTexte();
      peindre();
    });
  }

  function recalculer(){ P.forEach(enrichir); versionDonnees++; }

  /* Une position à la demande, jamais un suivi. */
  function localiser(silencieux){
    if (!navigator.geolocation){ if (!silencieux) api.toast("Ce téléphone ne donne pas sa position."); return; }
    navigator.geolocation.getCurrentPosition(function(pos){
      ici = { lat:pos.coords.latitude, lon:pos.coords.longitude };
      carteCadree = false; recalculer(); peindre();
    }, function(){
      if (!silencieux) api.toast("Position indisponible : autorisez la localisation pour trier par distance.");
    }, { enableHighAccuracy:true, maximumAge:60000, timeout:15000 });
  }

  function tourneeReelle(){
    var miens = P.filter(function(p){ return p.mien; }).sort(parDistance);
    return miens.concat(libres().slice(0, Math.max(0, 12 - miens.length)));
  }

  function mesClients(){ return P.filter(function(p){ return p.statut === "client" && p.suiviPar === moiId; }).length; }
  function gainsReels(){
    var d = new Date(), res = [];
    for (var i = 3; i >= 0; i--){
      var m = new Date(d.getFullYear(), d.getMonth() - i, 1);
      var cle = m.getFullYear() + "-" + deux(m.getMonth() + 1) + "-01", v = 0;
      commissions.forEach(function(c){ if (c.mois === cle && c.statut !== "annulee") v += c.montant_cents; });
      res.push({ m:MOIS[m.getMonth()], v:v });
    }
    return res;
  }
  function entonnoirReel(){
    var miens = P.filter(function(p){ return p.suiviPar === moiId; });
    function n(st){ return miens.filter(function(p){ return p.statut === st; }).length; }
    return [
      { e:"Démarchés", n:miens.length },
      { e:"Intéressés", n:n("attente") },
      { e:"En essai", n:n("essai") },
      { e:"Clients", n:n("client") }
    ];
  }

  /* ----- carte réelle (OpenStreetMap), chargée seulement pour un compte réel ----- */
  function carteReelle(){
    return '<figure class="m-card m-map m-map-reelle"><div class="m-map-place" data-carte-place></div>' +
      '<figcaption class="m-map-cap"><span>● ' + (ici ? 'Vous êtes ici' : esc(zonesTexte())) + '</span>' +
      '<button class="m-map-loc" data-localiser>' + (ici ? 'Actualiser ma position' : 'Me localiser') + '</button></figcaption></figure>';
  }
  function chargerLeaflet(){
    if (leafletEtat) return;
    leafletEtat = "charge";
    var css = document.createElement("link");
    css.rel = "stylesheet"; css.href = LEAFLET + "leaflet.css"; css.crossOrigin = "anonymous";
    css.integrity = "sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H";
    document.head.appendChild(css);
    var js = document.createElement("script");
    js.src = LEAFLET + "leaflet.js"; js.crossOrigin = "anonymous";
    js.integrity = "sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH";
    js.onload = function(){ leafletEtat = "pret"; if (root && root.isConnected && vue === "secteur") monterCarte(); };
    js.onerror = function(){
      leafletEtat = "";
      var place = root && root.querySelector("[data-carte-place]");
      if (place) place.innerHTML = '<p class="m-map-attente">Carte indisponible hors connexion. La liste reste à jour.</p>';
    };
    document.head.appendChild(js);
  }
  function monterCarte(){
    var place = root.querySelector("[data-carte-place]");
    if (!place) return;
    if (!window.L){ place.innerHTML = '<p class="m-map-attente">Chargement de la carte…</p>'; chargerLeaflet(); return; }
    if (!carteDiv){
      carteDiv = document.createElement("div");
      carteDiv.className = "m-map-leaflet";
      place.innerHTML = "";
      place.appendChild(carteDiv);
      /* Sans animation de zoom : l'écran est redessiné souvent, et une
         animation interrompue par un nouveau rendu laisserait la carte figée. */
      carteL = window.L.map(carteDiv, { zoomControl:false, attributionControl:true,
        zoomAnimation:false, fadeAnimation:false, markerZoomAnimation:false });
      carteL.attributionControl.setPrefix(false);
      window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom:19, attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
      }).addTo(carteL);
      calque = window.L.layerGroup().addTo(carteL);
      sigPoints = "";
    } else place.appendChild(carteDiv);
    carteL.invalidateSize(false);
    dessinerPoints();
  }
  function dessinerPoints(){
    var sig = versionDonnees + "|" + filtre + "|" + (ici ? ici.lat + "," + ici.lon : "");
    if (sig === sigPoints) return;
    sigPoints = sig;
    var visibles = P.filter(function(p){ return p.lat != null && (!filtre || p.statut === filtre); });
    /* La vue d'abord, les points ensuite : Leaflet place les points d'après
       la vue en cours. */
    if (!carteCadree){
      carteCadree = true;
      if (ici) carteL.setView([ici.lat, ici.lon], 14, { animate:false });
      else if (visibles.length) carteL.fitBounds(visibles.map(function(p){ return [p.lat, p.lon]; }), { padding:[18, 18], maxZoom:15, animate:false });
      else carteL.setView([48.75, 1.9], 9, { animate:false });
    }
    calque.clearLayers();
    visibles.forEach(function(p){
      var m = window.L.circleMarker([p.lat, p.lon], { radius:p.mien ? 8 : 6, weight:2, color:"#fffaf2", fillOpacity:1,
        className:"m-lpin m-pin-" + p.statut + (p.mien ? " m-lpin-mien" : "") });
      m.on("click", function(){ choisi = trouver(p.id); peindre(); });
      calque.addLayer(m);
    });
    if (ici) calque.addLayer(window.L.circleMarker([ici.lat, ici.lon], { radius:7, weight:3, color:"#fffaf2", fillOpacity:1, className:"m-lpin m-lpin-ici", interactive:false }));
  }

  function itineraire(p){
    var dest = p.lat != null ? p.lat + "," + p.lon : encodeURIComponent(p.nom + ", " + p.adr);
    var apple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) && "ontouchend" in document;
    window.open(apple ? "https://maps.apple.com/?daddr=" + dest : "https://www.google.com/maps/dir/?api=1&destination=" + dest, "_blank", "noopener");
  }

  /* ------------------------------ fiche réelle ------------------------------ */
  function overlayFicheReelle(p){
    var agir = peutAgir(p), prendre = peutPrendre(p), stop = p.statut === "stop";
    var PREUVES = [
      { id:"appel",   l:"Appel",   s:"depuis votre téléphone" },
      { id:"message", l:"Message", s:"SMS ou e-mail" },
      { id:"photo",   l:"Visite",  s:"photo de devanture" }
    ];
    var pourquoi = stop ? "Opposition définitive : ce restaurant ne doit plus être contacté, par aucun commercial."
      : p.statut === "client" || p.statut === "essai" ? "Ce restaurant est déjà " + (p.statut === "client" ? "client" : "en essai") + "."
      : p.info;
    var bouton = envoi ? '<button class="m-btn" disabled>Envoi…</button>'
      : agir ? '<button class="m-btn amb" data-visite="' + p.id + '">' + (preuve === "photo" ? 'Photographier et enregistrer' : 'Enregistrer ' + (preuve === "appel" ? 'l’appel' : 'le message')) + '</button>'
      : prendre ? '<button class="m-btn amb" data-prendre="' + p.id + '">Je prends ce prospect</button>'
      : '<p class="m-hold">' + (stop ? 'Aucune action commerciale possible.' : 'Pas disponible pour vous en ce moment.') + '</p>';
    return '<div class="m-over" aria-label="Fiche ' + esc(p.nom) + '">' +
      '<div class="m-ohead"><button data-fermer>← Retour</button><span class="m-clock m-mono">' + esc(trajet(p) || p.type) + '</span></div>' +
      '<div class="m-htitle">' + pastille(p) + '<h2>' + esc(p.nom) + '</h2>' +
        '<p>' + esc(p.type) + ' · ' + esc(p.adr) + (p.info ? '<br>' + esc(p.info) : '') + '</p></div>' +
      (p.tel ? '<a class="m-r" href="tel:' + esc(p.tel.replace(/\s/g, '')) + '"><span class="v">Appeler<small>' + esc(p.tel) + '</small></span><span class="s">›</span></a>' : '') +

      (p.mien ?
        '<article class="m-card m-card-prep"><span class="m-eyebrow">RÉSERVÉ PAR VOUS</span>' +
          '<div class="m-level m-mono" data-cd>' + reste(p) + '</div><div class="m-level-meta">restantes pour le démarcher</div>' +
          '<span class="m-bar"><span data-cdbar style="width:' + Math.round(p.reste / DUREE_RESA * 100) + '%"></span></span>' +
          '<p class="m-quote">Une action (appel, message ou visite) le protège 30 jours. Sans action, il retourne au commun et vous êtes bloqué deux mois dessus.</p>' +
        '</article>' : '') +

      (p.derniere ?
        '<div class="m-lbl">Votre dernière action</div>' +
        '<div class="m-kv"><span>Action</span><b>' + esc(p.derniere) + '</b></div>' +
        (p.preuve ? '<div class="m-kv"><span>Preuve</span><b>' + esc(p.preuve) + '</b></div>' : '') +
        (p.objection ? '<div class="m-note amb">' + esc(p.objection) + '</div>' : '') : '') +

      (stop ? '<div class="m-note amb">' + esc(pourquoi) + '</div>'
       : agir ?
          '<div class="m-lbl">Tracer l’action<em>Preuve</em></div>' +
          '<div class="m-seg">' + PREUVES.map(function(x){
            return '<button class="' + (preuve === x.id ? 'on' : '') + '" aria-pressed="' + (preuve === x.id) + '" data-preuve="' + x.id + '">' + x.l + '<small>' + x.s + '</small></button>';
          }).join('') + '</div>' +
          (preuve === "photo" ? '<div class="m-note">Photo de devanture <b>sans visages ni plaques</b>. Votre position est jointe une seule fois si vous l’avez donnée, jamais suivie.</div>' : '') +
          '<div class="m-lbl">Résultat</div>' +
          '<div class="m-seg">' + SUITES.map(function(x){
            return '<button class="' + (suite === x.id ? 'on' : '') + '" aria-pressed="' + (suite === x.id) + '" data-suite="' + x.id + '">' + x.l + '<small>' + x.s + '</small></button>';
          }).join('') + '</div>' +
          (suite === "refus" ? '<label class="m-champ">Ne pas recontacter avant (facultatif)<input type="date" data-retour min="' + aujourdhui() + '" value="' + esc(retourVisite) + '"></label>' : '') +
          '<label class="m-champ">Objection ou remarque (facultatif)<textarea data-note maxlength="300" rows="2" placeholder="Ex. : déjà un outil, rappeler après les vacances…">' + esc(noteVisite) + '</textarea></label>' +
          '<div class="m-lbl">Suite</div>' +
          '<button class="m-r" data-essai="' + p.id + '"><span class="v">Passer en essai gratuit<small>La commission de ' + esc(eur(D_.commission)) + ' court dès le premier mois payant</small></span><span class="s">›</span></button>' +
          (p.mien ? '<button class="m-r" data-rendre="' + p.id + '"><span class="v">Rendre au commun<small>Libre aussitôt pour les autres ; blocage de deux mois pour vous</small></span><span class="s">›</span></button>' : '') +
          '<button class="m-r m-danger" data-stop="' + p.id + '"><span class="v">Ne plus contacter<small>Opposition définitive, respectée par tous les commerciaux</small></span><span class="s">›</span></button>'
       : prendre ? '<div class="m-note">« Je prends ce prospect » vous le réserve <b>3 jours</b>. Une action dans ce délai le protège ensuite 30 jours.</div>'
       : '<div class="m-note">' + explication(p) + '</div>') +

      '<div class="m-ofoot">' + bouton +
        '<button class="m-btn2" data-itineraire="' + p.id + '">' + icone('itineraire') + 'Itinéraire</button>' +
      '</div>' +
    '</div>';
  }

  /* Pourquoi ce prospect n'est pas disponible, et quand il le redeviendra. */
  function explication(p){
    if (p.statut === "client" || p.statut === "essai")
      return "Ce restaurant est déjà " + (p.statut === "client" ? "client" : "en essai") + (p.suiviPar === moiId ? " grâce à vous." : " : il est suivi par un autre commercial.");
    if (p.autre) return "Un autre commercial l’a réservé. <b>Sans action de sa part sous 3 jours</b>, il redevient libre.";
    if (p.protegeAutre) return "Un autre commercial le suit. Sans nouvelle action de sa part, il redevient libre le <b>" + jj(p.protegeJusqua) + "</b>.";
    if (p.pasAvant) return "Le restaurant a demandé à ne pas être recontacté avant le <b>" + dateLongue(p.pasAvant) + "</b>.";
    if (p.bloque) return "Vous l’aviez réservé puis laissé retomber : il vous sera de nouveau accessible le <b>" + jj(p.bloque) + "</b>. Un autre commercial peut le prendre d’ici là.";
    return "Ce prospect n’est pas disponible pour le moment.";
  }

  /* ------------------------------ gestes réels ------------------------------ */
  function reduirePhoto(fichier, cb){
    var url = URL.createObjectURL(fichier), img = new Image();
    img.onload = function(){
      var k = Math.min(1, 1280 / Math.max(img.width, img.height));
      var c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(function(b){ if (b) cb(null, b); else cb("Photo illisible. Réessayez."); }, "image/jpeg", 0.8);
    };
    img.onerror = function(){ URL.revokeObjectURL(url); cb("Photo illisible. Réessayez."); };
    img.src = url;
  }

  function prendreReel(p){
    envoi = true; peindre();
    PelyoDonnees.reserverProspect(p.id, function(e, fin){
      envoi = false;
      if (e){ api.toast(e); peindre(); return; }
      p.statut = "reserve"; p.reservePar = moiId; p.reserveJusqua = fin;
      enrichir(p); versionDonnees++;
      api.vibrer(14);
      api.toast("Réservé 3 jours. Une action dans ce délai le protège 30 jours.");
      peindre();
    });
  }

  function rendreReel(p){
    envoi = true; peindre();
    PelyoDonnees.libererProspect(p.id, function(e){
      envoi = false;
      if (e){ api.toast(e); peindre(); return; }
      p.statut = "jamais"; p.reservePar = null; p.reserveJusqua = null;
      blocages[p.id] = Date.now() + 61 * 86400000;
      enrichir(p); versionDonnees++;
      api.toast("Rendu au commun : libre pour les autres, bloqué deux mois pour vous.");
      peindre();
    });
  }

  /* Enregistre l'action choisie. Une visite demande d'abord la photo. */
  function agirReel(p, laSuite){
    if (laSuite === "refus" && retourVisite && retourVisite <= aujourdhui()){ api.toast("La date de retour doit être dans le futur."); return; }
    if (preuve === "photo"){
      photoPour = p; photoSuite = laSuite;
      photoInput.click();
      return;
    }
    envoyerAction(p, laSuite, null);
  }

  function envoyerAction(p, laSuite, photo){
    var type = preuve === "photo" ? "porte_a_porte" : preuve;
    envoi = true; peindre();
    function fin(e){ envoi = false; if (e){ api.toast(e); peindre(); } return !e; }
    function enregistrer(chemin){
      PelyoDonnees.enregistrerAction({
        prospect:p.id, type:type, suite:laSuite, resultat:LIB_SUITE[laSuite], objection:noteVisite,
        retourLe:laSuite === "refus" ? retourVisite : null, photo:chemin,
        lat:type === "porte_a_porte" && ici ? ici.lat : null, lon:type === "porte_a_porte" && ici ? ici.lon : null
      }, function(e){
        if (!fin(e)) return;
        p.statut = laSuite; p.suiviPar = moiId; p.reservePar = null; p.reserveJusqua = null;
        p.protegeJusqua = laSuite === "stop" ? null : Date.now() + 30 * 86400000;
        p.retourLe = laSuite === "refus" && retourVisite ? retourVisite : null;
        retenirAction(p, { at:Date.now(), type:type, resultat:LIB_SUITE[laSuite], objection:noteVisite, photo:!!chemin, position:type === "porte_a_porte" && !!ici });
        delete blocages[p.id];
        enrichir(p); versionDonnees++;
        noteVisite = ""; retourVisite = ""; suite = "attente";
        api.vibrer(14);
        api.toast(laSuite === "stop" ? "Ne plus contacter : respecté par tous les commerciaux."
          : laSuite === "essai" ? "Essai enregistré. La commission de " + eur(D_.commission) + " court dès le premier mois payant."
          : "Action enregistrée. " + p.nom + " est protégé pour vous 30 jours.");
        if (laSuite === "stop") choisi = null;
        peindre();
      });
    }
    if (!photo) return enregistrer(null);
    reduirePhoto(photo, function(e, blob){
      if (e) return fin(e);
      PelyoDonnees.deposerPhoto(p.id, blob, function(e2, chemin){
        if (e2) return fin(e2);
        enregistrer(chemin);
      });
    });
  }

  function ecouter(){
    PelyoDonnees.ecouterProspects(function(x){
      var p = trouver(x.id);
      if (p){
        ["statut","reservePar","reserveJusqua","protegeJusqua","retourLe","suiviPar","lat","lon","nom","tel"].forEach(function(k){ p[k] = x[k]; });
        enrichir(p);
      } else P.push(versP(x, null));
      versionDonnees++;
      /* On ne redessine pas sous les doigts de quelqu'un qui écrit. */
      var actif = document.activeElement;
      if (!envoi && !(actif && root.contains(actif) && /INPUT|TEXTAREA/.test(actif.tagName))) peindre();
    });
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
      ["data-vue","data-filtre","data-fiche","data-preuve","data-suite"].some(function(attr){
        if (focus.hasAttribute(attr)){ focusSel = '[' + attr + '="' + focus.getAttribute(attr) + '"]'; return true; }
        return false;
      });
    }
    var cle = choisi ? "fiche" + choisi.id : mentions ? "mentions" : "";
    var memeFeuille = !!(cle && cle === derniereCle);
    root.setAttribute("data-page", vue);
    appliquerTheme();
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
    if (reel && charge && vue === "secteur") monterCarte();
    api.badge(P.filter(function(p){ return reel ? (p.mien || (p.statut === "attente" && p.suiviPar === moiId)) : (p.statut === "reserve" || p.statut === "attente"); }).length || 0);
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
    theme = lireTheme();
    vue = "secteur"; derniereVue = ""; derniereCle = "";
    choisi = null; mentions = false; filtre = ""; menuOuvert = false; demoVues = []; simu = 0;
    pitchT = null; demoT = null;
    reel = !!(window.PelyoDonnees && PelyoDonnees.commercialReel && PelyoDonnees.commercialReel());
    charge = false; erreurChargement = ""; envoi = false; plus = 40; suite = "attente"; noteVisite = ""; retourVisite = "";
    carteDiv = null; carteL = null; calque = null; carteCadree = false; sigPoints = ""; ici = null; blocages = {};
    if (reel){ moiId = PelyoDonnees.moi(); prenom = (PelyoDonnees.contexte() || {}).prenom || ""; }

    P = reel ? [] : D_.prospects.map(function(p){
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
      '<div class="m-tiroir-head"><span data-tiroir-titre>' + esc(reel ? "Mes zones" : D_.commercial.zone.split("—")[0].trim()) + '</span><button data-fermer-tiroir aria-label="Fermer">✕</button></div>' +
      '<div class="m-tiroir-liste" data-tiroir-liste></div>';
    scene.appendChild(tiroir);
    rafraichirTiroir();
    tiroir.addEventListener("click", function(ev){
      var b = ev.target.closest && ev.target.closest("[data-vue],[data-fermer-tiroir],[data-mentions],[data-theme]");
      if (!b) return;
      if(b.dataset.theme){
        theme=b.dataset.theme==='dark'?'dark':'light';
        try{localStorage.setItem('pelyo:commercial:theme',theme);}catch(e){}
        appliquerTheme();rafraichirTiroir();
        tiroir.querySelector('[data-theme="'+theme+'"]').focus({preventScroll:true});return;
      }
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

    if (reel){
      photoInput = document.createElement("input");
      photoInput.type = "file"; photoInput.accept = "image/*"; photoInput.hidden = true;
      photoInput.setAttribute("capture", "environment");
      scene.appendChild(photoInput);
      photoInput.addEventListener("change", function(){
        var f = photoInput.files && photoInput.files[0];
        photoInput.value = "";
        if (f && photoPour) envoyerAction(photoPour, photoSuite, f);
        photoPour = null;
      });
      charger();
      localiser(true);
      ecouter();
    }

    peindre();

    /* La réservation descend réellement : seuls les textes du compte à rebours
       bougent chaque seconde, pas l'écran entier. */
    api.every(function(){
      var expire = null;
      if (reel) P.forEach(function(p){
        if (!p.mien) return;
        p.reste = Math.max(0, Math.round((p.reserveJusqua - Date.now()) / 1000));
        if (p.reste <= 0){
          /* La base fera de même au prochain geste : on l'affiche tout de suite. */
          p.statut = "jamais"; p.reservePar = null; p.reserveJusqua = null;
          blocages[p.id] = Date.now() + 61 * 86400000;
          enrichir(p); versionDonnees++; expire = p;
        }
      });
      else P.forEach(function(p){
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
      if (ev.target.hasAttribute("data-note")) noteVisite = ev.target.value;
      if (ev.target.hasAttribute("data-retour")) retourVisite = ev.target.value;
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
                "[data-rendre],[data-itineraire],[data-pitch],[data-demo],[data-suite],[data-localiser],[data-plus],[data-recharger]";
      var b = t.closest(SEL);
      if (!b) return;
      var d = b.dataset, p;

      if (d.menu !== undefined){ ouvrirTiroir(); return; }
      if (d.vue){ allerA(d.vue); return; }
      if (d.pin || d.fiche){ choisi = trouver(d.pin || d.fiche); peindre(); return; }
      if (d.fermer !== undefined){ choisi = null; mentions = false; peindre(); return; }
      if (d.filtre !== undefined){ filtre = d.filtre; plus = 40; peindre(); return; }
      if (d.suite){ suite = d.suite; peindre(); return; }
      if (d.localiser !== undefined){ localiser(false); return; }
      if (d.plus !== undefined){ plus += 40; peindre(); return; }
      if (d.recharger !== undefined){ charger(); peindre(); return; }
      if (reel && envoi && (d.prendre || d.rendre || d.visite || d.essai || d.stop)) return;
      if (reel && d.prendre){ prendreReel(trouver(d.prendre)); return; }
      if (reel && d.rendre){ rendreReel(trouver(d.rendre)); return; }
      if (reel && d.visite){ agirReel(trouver(d.visite), suite); return; }
      if (reel && d.essai){ agirReel(trouver(d.essai), "essai"); return; }
      if (reel && d.stop){
        p = trouver(d.stop);
        if (window.confirm("Ne plus contacter " + p.nom + " ? C’est définitif, pour tous les commerciaux.")) agirReel(p, "stop");
        return;
      }
      if (reel && d.itineraire !== undefined){
        var dest = trouver(d.itineraire) || choisi || tourneeReelle()[0];
        if (dest) itineraire(dest); else api.toast("Aucun restaurant à rejoindre pour l’instant.");
        return;
      }
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
      if (carteL){ try { carteL.remove(); } catch(e){} }
      carteL = null; carteDiv = null; calque = null;
      if (photoInput && photoInput.parentNode) photoInput.parentNode.removeChild(photoInput);
      photoInput = null;
      if (reel && window.PelyoDonnees) PelyoDonnees.arreterEcoutes();
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
