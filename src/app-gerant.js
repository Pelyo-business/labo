/* =========================================================================
   Pelyo — application GÉRANT, « Le Bureau ».
   Pilotage quotidien, activité, catalogue, assistant et établissement.
   Les détails s'ouvrent en feuilles dédiées ; les réglages occasionnels
   ne concurrencent pas les actions de service. Données de démonstration.

   ES5 strict. Toutes les classes commencent par g-. Voir src/gerant.css.
   ========================================================================= */
(function(){
  "use strict";

  var api, root, D_;
  var ecran = "soir";
  var charge, voix, ouvert = true, reprise = "";
  var rupt = {}, forfait, langues, cuisineAccess, routage, abonnement;
  var modeAvantVeille = 'ia'; /* mode des appels à rétablir quand l'IA se réveille */
  /* Mode connecté (voir pelyo-donnees.js et « compte réel » plus bas) :
     chiffres, appels, clients, carte et réglages viennent de la base ;
     livreurs, balance, caisse et abonnement payant restent à brancher. */
  var reel = false, arretAppareils = null;
  function nomResto(){ return reel ? PelyoDonnees.restaurant().nom : D_.resto.nom; }
  /* ------------------------------ compte réel ------------------------------
     Démo : D_ = données d'exemple (data.js), jamais modifiées. Compte réel :
     une copie de D_ remise à zéro, puis remplie avec la base (tableau_gerant,
     carte). Les réglages modifiés ici sont enregistrés dans la base. */
  var tableau = null, tableauEnCours = false, semaine = null;
  var LANGUES = { fr:'Français', ar:'Arabe', en:'Anglais', es:'Espagnol', tr:'Turc', it:'Italien', pt:'Portugais', de:'Allemand' };
  var CODES_FORFAIT = { payg:'payg', basic:'basic', pro:'pro', business:'biz', big_business:'big' };
  var JOURS_LONGS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  var PAIEMENTS = { especes_livreur:'Espèces', carte_livreur:'Carte', sur_place:'Sur place' };
  function hhmm(iso){ var d = new Date(iso); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function donneesReelles(base){
    var d = JSON.parse(JSON.stringify(base));
    d.resto.adresse = ''; d.resto.tel = ''; d.resto.minutes = 0;
    d.jour = { appels:0, commandes:0, expirees:0, ca:0, panier:0, minutes:0, transferts:0 };
    d.appels = []; d.commandes = []; d.clients = []; d.menu = []; d.exceptions = [];
    d.livraison = { rayon:'Non défini', minimum:0, frais:0, paiement:'Espèces ou carte', delai:35 };
    return d;
  }
  function chargerTableau(){
    if (tableauEnCours) return;
    tableauEnCours = true;
    PelyoDonnees.tableauGerant(function(e, t){
      tableauEnCours = false;
      if (e){ api.toast(e); return; }
      appliquerTableau(t || {});
      peindre();
    });
  }
  function chargerCarteReelle(){
    PelyoDonnees.chargerCarte(function(e, x){
      if (e){ api.toast(e); return; }
      D_.menu = x.menu; rupt = {};
      peindre();
    });
  }
  function appliquerTableau(t){
    tableau = t;
    var r = t.restaurant || {}, j = t.jour || {};
    D_.resto.nom = r.nom || nomResto();
    D_.resto.adresse = [[r.adr_numero, r.adr_rue].filter(Boolean).join(' '), [r.adr_code_postal, r.adr_ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    D_.resto.tel = r.telephone_public || '';
    D_.resto.minutes = Math.round((t.secondes_periode || 0) / 60);
    if (t.abonnement && CODES_FORFAIT[t.abonnement.code]) forfait = CODES_FORFAIT[t.abonnement.code];
    if (t.abonnement && t.abonnement.engagement_fin) abonnement.fin = new Date(t.abonnement.engagement_fin).toLocaleDateString('fr-FR', {day:'numeric', month:'long', year:'numeric'});
    charge = r.charge || 'normal'; ouvert = charge !== 'stop';
    reprise = r.reprise_prevue_at ? hhmm(r.reprise_prevue_at).replace(':', 'h') : '';
    /* Délais annoncés : ceux du restaurant (Normal), plus l'écart des niveaux d'exemple. */
    var base = D_.charges[0].delai, propre = r.delai_retrait_min || base;
    D_.charges.forEach(function(c, i){ if (c.id !== 'stop') c.delai = propre + (JSON_CHARGES[i] - base); });
    routage = { mode:r.routage || 'ia', secours:r.reprise_ia !== false, delai:r.reprise_ia_delai_s || 20, numero:r.telephone_transfert || r.telephone_public || '' };
    voix.prenom = r.assistant_prenom || 'Pelyo';
    voix.ton = r.assistant_ton || 'chaleureux';
    voix.vitesse = r.assistant_vitesse || 'normale';
    voix.accueil = r.assistant_accueil || 'Bonjour, ' + D_.resto.nom + ', je suis ' + voix.prenom + ', l’assistant vocal automatisé du restaurant. Que puis-je vous préparer ?';
    langues = (r.assistant_langues || ['fr']).map(function(c){ return LANGUES[c] || c; });
    D_.livraison = {
      rayon:r.livraison_rayon_m ? (r.livraison_rayon_m / 1000).toLocaleString('fr-FR', {maximumFractionDigits:1}) + ' km' : 'Non défini',
      rayonM:r.livraison_rayon_m || 0, minimum:r.livraison_minimum_cents || 0, frais:r.livraison_frais_cents || 0,
      paiement:(r.paiements_livraison || []).map(function(x){ return PAIEMENTS[x] || x; }).join(' ou ') + ' au livreur',
      delai:r.delai_livraison_min || 35
    };
    semaine = semaineDepuisBase(r.horaires);
    D_.exceptions = (r.exceptions || []).map(function(x){
      return { d:x.date ? new Date(x.date + 'T12:00:00').toLocaleDateString('fr-FR', {day:'numeric', month:'long'}) : '', r:x.ferme ? 'Fermé' : x.fin ? 'Jusqu’à ' + x.fin.replace(':', 'h') : 'Horaires habituels' };
    });
    var minutes = Math.round((j.secondes || 0) / 60);
    D_.jour = { appels:j.appels || 0, commandes:j.commandes || 0, expirees:j.expirees || 0, ca:j.ca || 0,
      panier:j.commandes ? Math.round((j.ca || 0) / j.commandes) : 0, minutes:minutes, transferts:j.transferts || 0 };
    D_.appels = (t.appels || []).map(function(a){
      var issue = a.issue === 'commande' || a.issue === 'transfert' || a.issue === 'expiree' ? a.issue : a.issue === 'abandon' || a.issue === 'echec' ? 'expiree' : 'question';
      var info = a.info || (a.issue === 'en_cours' ? 'Appel en cours' : a.issue === 'abandon' ? 'Le client a raccroché' : a.issue === 'echec' ? 'Problème technique' : '');
      return { h:hhmm(a.at), duree:a.duree || 0, issue:issue, num:a.numero ? telLisible(a.numero) : 'masqué', montant:a.montant || 0, cmd:a.cmd || null, info:info };
    });
    D_.commandes = (t.commandes || []).map(function(c){
      return { num:c.numero, quand:new Date(c.at), heure:hhmm(c.at), total:c.total || 0, livraison:c.mode === 'livraison', origine:c.origine,
        tel:c.telephone ? telLisible(c.telephone) : '', lignes:(c.lignes || []).map(function(l){ return { nom:l.nom, q:l.q, prix:l.prix || 0 }; }) };
    });
    clientsReels = clientsDepuisTableau(t.clients);
    var h = clientsReels.filter(function(c){ return c.nb >= 2; }), caH = 0, ca = 0;
    clientsReels.forEach(function(c){ ca += c.total; });
    h.forEach(function(c){ caH += c.total; });
    D_.clientsMois = { ca:ca || 1, clients:clientsReels.length, habitues:h.length, caHabitues:caH };
  }
  var JSON_CHARGES = null; /* délais d'exemple des niveaux, gardés pour calculer les écarts */

  /* Horaires : une semaine = 7 jours (0 = dimanche), chacun une liste de
     créneaux {debut:"11:30", fin:"14:30"}. Démo : lue depuis les horaires
     d'exemple ; compte réel : restaurants.horaires. */
  function semaineDepuisBase(h){
    var sem = [[], [], [], [], [], [], []];
    (h || []).forEach(function(x){
      var jour = Number(x.jour);
      if (jour >= 0 && jour <= 6 && /^\d\d:\d\d$/.test(x.debut || '') && /^\d\d:\d\d$/.test(x.fin || '')) sem[jour].push({ debut:x.debut, fin:x.fin });
    });
    sem.forEach(function(l){ l.sort(function(a, b){ return a.debut < b.debut ? -1 : 1; }); });
    return sem;
  }
  function semaineDemo(){
    var sem = [[], [], [], [], [], [], []], quels = { 'Lun – Jeu':[1, 2, 3, 4], 'Vendredi':[5], 'Samedi':[6], 'Dimanche':[0] };
    D_.horaires.forEach(function(x){
      var re = /(\d\d)h(\d\d)–(\d\d)h(\d\d)/g, m, cr = [];
      while ((m = re.exec(x.c))) cr.push({ debut:m[1] + ':' + m[2], fin:m[3] + ':' + m[4] });
      (quels[x.j] || []).forEach(function(j){ sem[j] = cr.map(function(c){ return { debut:c.debut, fin:c.fin }; }); });
    });
    return sem;
  }
  function texteCreneaux(l){ return l.length ? l.map(function(c){ return c.debut.replace(':', 'h') + '–' + c.fin.replace(':', 'h'); }).join(' · ') : 'Fermé'; }
  function semaineVersBase(){
    var l = [];
    semaine.forEach(function(cr, j){ cr.forEach(function(c){ l.push({ jour:j, debut:c.debut, fin:c.fin }); }); });
    return l;
  }
  /* Enregistre un réglage dans la base (compte réel seulement). */
  function enregistrer(champs, service){
    if (!reel) return;
    (service ? PelyoDonnees.reglerService : PelyoDonnees.majRestaurant)(champs, function(e){
      if (e){ api.toast(e); chargerTableau(); }
    });
  }

  function heureCourte(iso){ var d = new Date(iso); return ('0' + d.getHours()).slice(-2) + ' h ' + ('0' + d.getMinutes()).slice(-2); }
  function chargerAcces(){
    PelyoDonnees.chargerAcces(function(e, a){
      if (e) return api.toast(e);
      cuisineAccess.code = a.code;
      cuisineAccess.permissions = a.permissions;
      cuisineAccess.demandes = a.demandes.map(function(x){ return { id:x.id, nom:x.nom, info:'Demande reçue à ' + heureCourte(x.demande_at) }; });
      cuisineAccess.devices = a.appareils.map(function(x){ return { id:x.id, nom:x.nom, info:'Autorisé le ' + new Date(x.decide_at || x.demande_at).toLocaleDateString('fr-FR') }; });
      peindre();
    });
  }
  /* Rappel commun des actions d'accès : message, puis relecture de la base. */
  function apresAcces(ok){ return function(e){ api.toast(e || ok); chargerAcces(); }; }
  var rejeu = null;          /* état du rejeu d'appel */
  var sheet = null;          /* feuille plein écran */
  var filtreAppels = 'tous', filtreCarte = 'tous', rechercheCarte = '', triCarte = 'populaires', dernierBascule = null,
      echelleActivite = 'jour', barreActivite = null, animActivite = true;
  var timerRejeu = null, retourFocus = null;
  var theme = 'light';
  /* Pelyo Labo (demo.html) : thème à part, sombre par défaut. */
  var CLE_THEME = window.PELYO_DEMO ? 'pelyo:labo:theme' : 'pelyo:gerant:theme', THEME_DEFAUT = window.PELYO_DEMO ? 'dark' : 'light';
  function lireTheme(){ try { var t = localStorage.getItem(CLE_THEME); return t === 'dark' || t === 'light' ? t : THEME_DEFAUT; } catch(e){ return THEME_DEFAUT; } }


  var ECRANS = [
    { id:"soir",      lbl:"Pilotage" },
    { id:"appels",    lbl:"Activité" },
    { id:"carte",     lbl:"Carte" },
    { id:"assistant", lbl:"Assistant" },
    { id:"reglages",  lbl:"Gestion" }
  ];

  function esc(s){ return api.esc(s); }
  function niveau(){
    for (var i = 0; i < D_.charges.length; i++) if (D_.charges[i].id === charge) return D_.charges[i];
    return D_.charges[0];
  }
  function leForfait(){
    for (var i = 0; i < D_.forfaits.length; i++) if (D_.forfaits[i].id === forfait) return D_.forfaits[i];
    return D_.forfaits[2];
  }

  /* --------------------------- fragments communs --------------------------- */
  function statusbar(){
    return '<header class="g-status"><span class="g-logo"><img src="assets/logo-toque.png" alt="Pelyo" width="35" height="35"><i aria-hidden="true"></i></span><div class="g-wordmark"><span>PELYO · GÉRANT</span><b>' + RIA.nomEnv(nomResto()) + '</b></div>' +
      '<button class="g-round" data-cuisine aria-label="Ouvrir l’écran cuisine"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v15H4zM8 2v6m8-6v6M8 12h8m-8 4h5"/></svg><span>Cuisine</span></button></header>';
  }
  function nav(){
    return '<nav class="g-nav" aria-label="Navigation gérant">' + ECRANS.map(function(e){
      return '<button data-ecran="' + e.id + '"' + (ecran === e.id ? ' aria-current="page"' : '') + '>' + icone(e.id) + '<span>' + esc(e.lbl) + '</span></button>';
    }).join('') + '</nav>';
  }
  function icone(id){
    var p = {soir:'M3 11 12 3l9 8M5 10v11h5v-7h4v7h5V10',appels:'M4 20V10m8 10V4m8 16v-8',carte:'M4 4h6l2 2 2-2h6v16h-6l-2 2-2-2H4zM12 6v16',assistant:'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0zM5 11a7 7 0 0 0 14 0M12 18v4',reglages:'M3 10h18L19 3H5zM5 10v11h14V10M9 21v-7h6v7'};
    return '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + p[id] + '"/></svg>';
  }
  function titre(k,t){ return '<div class="g-heading"><div><p class="g-lab">' + esc(k) + '</p><h1>' + esc(t) + '</h1></div><span class="g-heading-mark" aria-hidden="true">' + ({soir:'01',appels:'02',carte:'03',assistant:'04',reglages:'05'}[ecran] || '•') + '</span></div>'; }
  function lien(attr,t,s){ return '<button class="g-link" ' + attr + '><span class="g-link-copy"><b>' + esc(t) + '</b><small>' + esc(s) + '</small></span><span class="g-link-arrow" aria-hidden="true">↗</span></button>'; }
  function indisponible(it){ return Object.prototype.hasOwnProperty.call(rupt,it.id) ? rupt[it.id] : !it.dispo; }
  function nbRuptures(){ var n=0; D_.menu.forEach(function(c){c.items.forEach(function(it){if(indisponible(it)) n++;});});return n; }

  /* ------------------------------- ce soir ------------------------------- */
  /* Le mois en cours : ce que coûte Pelyo (forfait + dépassement ; en PAYG,
     chaque minute à 0,49 €) face aux commandes prises par l'IA. Les 10 % du
     business plan pour le PAYG sont la commission du vendeur, prise sur ce
     que Pelyo encaisse : le restaurant ne les paie pas. En démonstration,
     le CA du mois suit le rythme de la soirée d'exemple (CA par minute). */
  function bilanMois(){
    var f = leForfait(), j = D_.jour, minutes = D_.resto.minutes;
    var ca = j.minutes ? Math.round(minutes * j.ca / j.minutes) : 0;
    var commandes = j.minutes ? Math.round(minutes * j.commandes / j.minutes) : 0;
    var depasse = f.minutes ? Math.max(0, minutes - f.minutes) : minutes;
    var cout = f.prix + depasse * f.dep;
    return {f:f, minutes:minutes, ca:ca, commandes:commandes, depasse:depasse, cout:cout, gain:ca - cout};
  }

  function carteRentabilite(){
    var b = bilanMois(), f = b.f, ok = b.gain > 0;
    var mois = new Date().toLocaleDateString('fr-FR', {month:'long'});
    var haut = Math.max(b.ca, b.cout, 1);
    var pct = f.minutes ? Math.round(b.minutes / f.minutes * 100) : null;
    var fois = b.cout ? (Math.round(b.ca / b.cout * 10) / 10).toString().replace('.', ',') : '—';
    return '<div class="g-section-title"><h2>Votre abonnement</h2><span>' + esc(mois.charAt(0).toUpperCase() + mois.slice(1)) + '</span></div>' +
      '<section class="g-renta ' + (ok ? 'g-renta-ok' : 'g-renta-ko') + '">' +
        '<div class="g-renta-msg"><span class="g-renta-icone" aria-hidden="true">' + (ok ? '✓' : '↗') + '</span><div>' +
          (ok
            ? '<b>Vous êtes rentable !</b><p>Pelyo vous a rapporté <strong>' + esc(api.eur(b.gain)) + '</strong> de commandes de plus que son prix ce mois‑ci.</p>'
            : '<b>Pas encore rentabilisé ce mois-ci</b><p>Encore <strong>' + esc(api.eur(-b.gain)) + '</strong> de commandes par l’IA pour couvrir votre abonnement.</p>') +
        '</div></div>' +
        '<div class="g-renta-duel">' +
          '<div><span>Commandes prises par l’IA</span><b>' + esc(api.eur(b.ca)) + '</b><i class="g-renta-ca" style="--w:' + Math.round(b.ca / haut * 100) + '%"></i></div>' +
          '<div><span>Coût de Pelyo ce mois</span><b>' + esc(api.eur(b.cout)) + '</b><i class="g-renta-cout" style="--w:' + Math.max(2, Math.round(b.cout / haut * 100)) + '%"></i></div>' +
        '</div>' +
        '<div class="g-renta-stats">' +
          '<article><span>IA en ligne</span><b>' + b.minutes + '<small> min</small></b>' +
            '<small>' + (f.minutes ? 'sur ' + f.minutes + ' incluses' : 'facturées à l’usage') + '</small>' +
            (pct === null ? '' : '<i class="g-renta-jauge' + (pct > 100 ? ' g-renta-depasse' : '') + '" style="--w:' + Math.min(100, pct) + '%"></i>') + '</article>' +
          '<article><span>Coût du mois</span><b>' + esc(api.eur(b.cout)) + '</b><small>' + esc(f.nom) +
            (f.id === 'payg' ? ' · ' + api.eur(f.dep) + ' la minute' : b.depasse ? ' + ' + b.depasse + ' min de dépassement' : ' · aucun dépassement') + '</small></article>' +
          '<article><span>Retour</span><b>× ' + fois + '</b><small>commandes / prix</small></article>' +
        '</div>' +
        '<button class="g-renta-lien" data-sheet="abo"><span>Forfait ' + esc(f.nom) + ' · ' + b.commandes + ' commandes ce mois</span><b>Mon abonnement ↗</b></button>' +
      '</section>';
  }

  function libelleIa(on){ return 'Assistant IA : ' + (on ? 'actif' : 'en veille, appels transférés au restaurant'); }

  /* Bilan du soir : à l'heure choisie, le gérant reçoit par SMS les
     chiffres de la soirée. */
  var CLE_BILAN = 'pelyo:gerant:bilan';
  var bilan = (function(){ try { var x = JSON.parse(localStorage.getItem(CLE_BILAN) || 'null'); if (x && x.heure) return x; } catch(e){} return {actif:true, heure:'23:30'}; })();
  function garderBilan(){ try { localStorage.setItem(CLE_BILAN, JSON.stringify(bilan)); } catch(e){} }
  function smsBilan(j, meilleur, meilleurQ){
    return 'Pelyo · ' + nomResto() + ', ce soir : ' + j.commandes + ' commandes, ' + api.eur(j.ca) + ', panier moyen ' + api.eur(j.panier) + '. ' +
      j.appels + ' appels décrochés, ' + (j.expirees + j.transferts) + ' à vérifier.' + (meilleur ? ' Produit star : ' + meilleur + ' (' + meilleurQ + ').' : '') + ' Bonne nuit !';
  }
  function blocBilan(j, meilleur, meilleurQ){
    return '<div class="g-section-title"><h2>Bilan du soir</h2><span>Par SMS</span></div><section class="g-cd">' +
      '<button class="g-bal-ligne" role="switch" aria-checked="' + bilan.actif + '" data-bilan><span><b>Recevoir le bilan par SMS</b><small>' + (bilan.actif ? 'Chaque soir à ' + bilan.heure.replace(':', ' h ') : 'Désactivé') + '</small></span><i class="g-bal-sw" aria-hidden="true"></i></button>' +
      (bilan.actif ? '<div class="g-cd-heure"><span>Heure d’envoi</span><span class="g-cd-pas"><button data-bilan-heure="-30" aria-label="30 minutes plus tôt">−</button><b>' + bilan.heure.replace(':', ' h ') + '</b><button data-bilan-heure="30" aria-label="30 minutes plus tard">+</button></span></div>' +
        '<div class="g-cd-sms"><p>' + esc(smsBilan(j, meilleur, meilleurQ)) + '</p></div>' +
        '<p class="g-note">Envoyé au numéro du compte gérant.' + (reel ? '' : ' Exemple avec les chiffres de démonstration.') + '</p>' : '') +
    '</section>';
  }
  function vueSoir(){
    var j=D_.jour, lv=niveau(), off=nbRuptures(), total=0, ventes={}, meilleur='', meilleurQ=0, quarts=[0,0,0,0], connectes=0;
    D_.menu.forEach(function(c){ total+=c.items.length; });
    /* L'heure la plus chargée du jour, découpée en quarts d'heure. */
    var parHeure={}, heurePic='19';
    D_.commandes.forEach(function(c){ if(c.heure){ var hh=c.heure.slice(0,2); parHeure[hh]=(parHeure[hh]||0)+1; if(parHeure[hh]>(parHeure[heurePic]||0)) heurePic=hh; } });
    D_.commandes.forEach(function(c){
      if(c.total && c.heure && c.heure.slice(0,2)===heurePic) quarts[Math.min(3,Math.floor(Number(c.heure.slice(3,5))/15))]++;
      c.lignes.forEach(function(l){ventes[l.nom]=(ventes[l.nom]||0)+l.q;if(ventes[l.nom]>meilleurQ){meilleur=l.nom;meilleurQ=ventes[l.nom];}});
    });
    cuisineAccess.devices.forEach(function(d){if(api.norm(d.info).indexOf('connecte')>=0) connectes++;});
    var conversion=j.appels ? Math.round(j.commandes/j.appels*100) : 0;
    var iaOn=routage.mode!=='restaurant';
    var pic=0;for(var qi=1;qi<quarts.length;qi++)if(quarts[qi]>quarts[pic])pic=qi;
    var maxQuart=Math.max.apply(Math,quarts)||1;
    var hp=Number(heurePic), labels=[hp+' h',hp+' h 15',hp+' h 30',hp+' h 45'];
    return titre('Ce soir, en un regard','Le pilotage.') +
      (reel && demarrageAFaire ? '<button class="g-dem-invite" type="button" data-demarrage><b>Réglez votre restaurant</b><span>Visite de l’appli et réglages guidés, environ 5 minutes.</span><i aria-hidden="true">→</i></button>' : '') +
      '<div class="g-dashboard-layout"><section class="g-dashboard-hero' + (ouvert ? '' : ' g-paused') + (iaOn ? '' : ' g-ia-off') + '">' +
        '<div class="g-hero-top"><span class="g-hero-status"><i aria-hidden="true"></i>' + (ouvert ? 'Service actif' : 'Service en pause') + '</span>' +
          '<button class="g-ia-switch" role="switch" aria-checked="' + iaOn + '" data-ia aria-label="' + libelleIa(iaOn) + '"><span>IA</span><i aria-hidden="true"></i></button>' +
          '<span class="g-hero-live">Ce soir</span></div>' +
        '<div class="g-hero-body"><div class="g-hero-copy"><p class="g-hero-kicker">Montant commandé</p><strong class="g-hero-value">' + esc(api.eur(j.ca)) + '</strong>' +
        '<p class="g-hero-detail">' + (ouvert ? esc(lv.nom) + ' · ' + lv.delai + ' min annoncées' : 'Reprise annoncée : ' + esc(reprise || 'à préciser')) + '</p></div>' +
        '<div class="g-orbit" aria-hidden="true"><i class="g-orbit-ring g-orbit-a"></i><i class="g-orbit-ring g-orbit-b"></i><i class="g-orbit-ring g-orbit-c"></i><span class="g-toque"><i></i><i></i><i></i><i></i><i></i><b></b></span><span class="g-zzz"><i>z</i><i>z</i><i>Z</i></span><span class="g-orbit-core"><b>' + conversion + '<small>%</small></b><em>conversion</em></span><span class="g-orbit-dot"></span></div></div>' +
        '<div class="g-hero-summary">' +
          '<span><b>' + j.commandes + '</b><small>commandes</small></span>' +
          '<span><b>' + j.appels + '</b><small>appels</small></span>' +
          '<span><b>' + esc(api.eur(j.panier)) + '</b><small>panier moyen</small></span>' +
          '<span><b>' + j.minutes + ' min</b><small>au téléphone</small></span>' +
        '</div><button class="g-hero-control" data-sheet="service"><span>Régler le rythme du service</span><b>' + esc(lv.nom) + ' · ' + lv.delai + ' min</b><i aria-hidden="true">↗</i></button>' +
      '</section><div class="g-dashboard-secondary">' +
        '<div class="g-section-title"><h2>Équipe et service</h2><span>En direct</span></div>' +
        '<section class="g-team-card"><div><span class="g-team-avatar">IA</span><span><b>' + esc(voix.prenom) + '</b><small>Assistant · ' + esc(voix.ton) + '</small></span><em data-ia-etat' + (iaOn ? '' : ' class="g-veille"') + '>' + (iaOn ? 'En ligne' : 'En veille') + '</em></div>' +
          '<div><span class="g-team-avatar">CU</span><span><b>Équipe cuisine</b><small>' + connectes + ' appareil(s) connecté(s)</small></span><em>' + cuisineAccess.devices.length + ' autorisé(s)</em></div>' +
          '<div><span class="g-team-avatar">SE</span><span><b>Rythme du service</b><small>' + esc(lv.nom) + '</small></span><em>' + lv.delai + ' min</em></div></section>' +
        '<p class="g-caption">' + (reel ? 'Chiffres du jour, mis à jour à chaque ouverture.' : 'Informations de démonstration.') + '</p>' +
      '</div></div>' +
      '<div class="g-section-title"><h2>À surveiller</h2><span>Alertes</span></div><div class="g-insights">' +
        '<button class="g-insight" data-ecran="carte"><span class="g-insight-mark">' + off + '</span><div><b>Ruptures actives</b><small>' + (total-off) + ' produits sur ' + total + ' en vente</small></div><i aria-hidden="true">›</i></button>' +
        '<button class="g-insight" data-aller-alertes><span class="g-insight-mark">' + (j.expirees+j.transferts) + '</span><div><b>Appels à vérifier</b><small>Transferts et commandes non confirmées</small></div><i aria-hidden="true">›</i></button>' +
      '</div>' + blocBilan(j, meilleur, meilleurQ) +
      '<div class="g-section-title"><h2>Tendances de vente</h2><span>Ce soir</span></div><section class="g-sales-panel">' +
        '<div class="g-sales-highlights"><article><span>Produit le plus vendu</span><b>' + esc(meilleur || 'Aucune vente') + '</b><small>' + meilleurQ + ' vendu' + (meilleurQ > 1 ? 's' : '') + ' ce soir</small></article><article><span>Créneau le plus actif</span><b>' + labels[pic] + '</b><small>' + quarts[pic] + ' commande' + (quarts[pic] > 1 ? 's' : '') + ' en un quart d’heure</small></article></div>' +
        '<div class="g-sales-chart" aria-label="Commandes par quart d’heure">' + quarts.map(function(v,i){return '<span><i style="height:' + Math.max(10,Math.round(v/maxQuart*100)) + '%"></i><small>' + labels[i] + '</small></span>';}).join('') + '</div>' +
      '</section>' +
      carteRentabilite();
  }

  function feuilleService(){
    return '<div class="g-top">Rythme du service</div><div class="g-body"><p class="g-note">Réglez ce que l’assistant annonce aux prochains clients.' + (reel ? '' : ' Aucun appel réel dans cette démonstration.') + '</p><div class="g-options">' +
      D_.charges.map(function(c){return '<button data-charge="' + c.id + '" aria-pressed="' + (charge===c.id) + '"><b>' + esc(c.nom) + '</b><small>' + (c.delai ? c.delai + ' min annoncées' : 'Plus de nouvelles commandes') + '</small></button>';}).join('') +
      '</div><p class="g-para">' + esc(niveau().dit) + '</p><p class="g-note">' + (!ouvert ? 'Reprise annoncée : ' + esc(reprise || 'à préciser') + '. La reprise automatique n’est pas connectée.' : 'Les commandes déjà confirmées restent inchangées.') + '</p></div><div class="g-foot"><button class="g-act" data-arret>' + (ouvert ? 'Mettre en pause 30 min' : 'Reprendre maintenant') + '</button></div>';
  }

  /* Activité : une barre par heure, jour ou mois ; hauteur = commandes prises
     par l'IA. Touchez une barre pour son chiffre. */
  function graphiqueCommandes(){
    var echelle = echelleActivite, e = ECHELLES.filter(function(x){ return x.id === echelle; })[0];
    var s = serieVentes({id:'resto-commandes'}, echelle, Math.round(D_.jour.commandes / 1.5)), pts = s.pts, n = pts.length;
    /* Aujourd'hui : les barres totalisent exactement les commandes affichées
       dans Pilotage (sinon 24 d'un côté, 26 de l'autre). */
    if (echelle === 'jour' && !reel) caler(pts, D_.jour.commandes, s);
    var max = 0, top = 0;
    pts.forEach(function(p, i){ if (p.v > max){ max = p.v; top = i; } });
    var choisi = typeof barreActivite === 'number' && barreActivite < n ? barreActivite : top;
    var pas = max > 40 ? Math.pow(10, Math.floor(Math.log(max) / Math.LN10)) / 2 : 5;
    var plafond = Math.ceil(max * 1.12 / pas) * pas || 5;
    var L = root.offsetWidth >= 700 ? 560 : 320;
    var G = 40, D = L - 6, H = 30, B = 128, col = (D - G) / n, larg = Math.max(4, col * (n > 20 ? 0.62 : 0.68));
    var tous = n <= 7 ? 1 : n <= 13 ? 2 : 5;
    var evol = s.avant ? Math.round((s.total - s.avant) / s.avant * 100) : 0;
    var anim = animActivite;
    animActivite = false;
    var barres = pts.map(function(p, i){
      var x = G + col * i + (col - larg) / 2, h = Math.max(2, (B - H) * p.v / plafond);
      return '<rect class="g-barre' + (i === choisi ? ' g-barre-choisie' : '') + '" x="' + x.toFixed(1) + '" y="' + (B - h).toFixed(1) + '" width="' + larg.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="' + Math.min(5, larg / 2).toFixed(1) + '" style="--d:' + (i * (0.5 / n)).toFixed(3) + 's"/>';
    }).join('');
    var cx = G + col * choisi + col / 2, cy = B - (B - H) * pts[choisi].v / plafond;
    function detail(i){ return '<b>' + pts[i].v.toLocaleString('fr-FR') + ' commande' + (pts[i].v > 1 ? 's' : '') + '</b> ' + esc(pts[i].l) + (i === top ? ' · meilleur moment' : ''); }
    graphes.cmd = {
      largeur:L, G:G, D:D, ecart:8, i:choisi, barres:true,
      x:pts.map(function(p, i){ return G + col * i + col / 2; }), y:pts.map(function(p){ return B - (B - H) * p.v / plafond; }),
      valeurs:pts.map(function(p){ return nombreCourt(p.v); }), details:pts.map(function(p, i){ return detail(i); }),
      aria:pts.map(function(p){ return p.l + ' : ' + p.v + ' commande(s)'; }),
      garder:function(i){ barreActivite = i; },
      liste:function(i){ return listeCommandes('resto:' + echelle + ':' + i, pts[i], null); }
    };
    return '<section class="g-cmd' + (anim ? ' g-cmd-anim' : '') + '" aria-label="Commandes prises par l’IA">' +
      '<div class="g-ventes-head"><div><span>Commandes prises par l’IA ' + esc(e.periode) + '</span><b>' + s.total.toLocaleString('fr-FR') + '</b>' +
        '<small class="' + (evol >= 0 ? 'g-ventes-hausse' : 'g-ventes-baisse') + '">' + (evol === 0 ? 'Stable' : (evol > 0 ? '+' : '−') + Math.abs(evol) + ' %') + ' par rapport ' + esc(e.compare) + '</small></div></div>' +
      '<div class="g-ventes-echelles" role="group" aria-label="Échelle du graphique">' + ECHELLES.map(function(x){
        return '<button data-activite-echelle="' + x.id + '" aria-pressed="' + (x.id === echelle) + '">' + x.t + '</button>';
      }).join('') + '</div>' +
      '<svg class="g-cmd-svg" data-graphe="cmd" viewBox="0 0 ' + L + ' 150" role="img" aria-label="' + esc(pts[choisi].l + ' : ' + pts[choisi].v + ' commande(s)') + '">' +
        '<defs><linearGradient id="g-barre-degrade" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffd35a"/><stop offset=".5" stop-color="#ffab3d"/><stop offset="1" stop-color="#ff7a2f"/></linearGradient></defs>' +
        [0, 0.5, 1].map(function(f){
          var y = B - (B - H) * f;
          return '<line x1="' + G + '" x2="' + D + '" y1="' + y + '" y2="' + y + '" class="g-ventes-grille"/>' +
            '<text x="' + (G - 7) + '" y="' + (y + 3) + '" text-anchor="end">' + nombreCourt(Math.round(plafond * f)) + '</text>';
        }).join('') +
        barres +
        pts.map(function(p, i){
          return i % tous === 0 || (i === n - 1 && (n - 1) % tous >= tous / 2)
            ? '<text data-i="' + i + '" x="' + (G + col * i + col / 2).toFixed(1) + '" y="146" text-anchor="middle"' + (i === choisi ? ' class="g-ventes-actif"' : '') + '>' + esc(p.c) + '</text>' : '';
        }).join('') +
        '<text class="g-ventes-valeur" x="' + Math.max(G + 10, Math.min(D - 10, cx)).toFixed(1) + '" y="' + (cy - 8).toFixed(1) + '" text-anchor="middle">' + nombreCourt(pts[choisi].v) + '</text>' +
        '<rect class="g-ventes-zone" x="0" y="0" width="' + L + '" height="150"/>' +
      '</svg>' +
      '<p class="g-ventes-detail">' + detail(choisi) + '</p>' +
      '<p class="g-ventes-note">' + (reel ? '' : 'Données d’exemple. ') + 'Glissez le doigt sur les barres pour lire chaque chiffre.</p>' +
    '</section>' +
      '<div class="g-cmds" data-liste="cmd" aria-live="polite">' + graphes.cmd.liste(choisi) + '</div>';
  }

  var ongletActivite = 'commandes';
  function vueAppels(){
    if(rejeu) return vueRejeu();
    var onglets = [{id:'commandes',t:'Commandes'},{id:'appels',t:'Appels'},{id:'clients',t:'Clients'}];
    return titre('Ce soir','L’activité.') +
      '<div class="g-filters g-sous-onglets" aria-label="Rubriques de l’activité">' + onglets.map(function(o){
        return '<button data-activite="' + o.id + '" aria-pressed="' + (ongletActivite === o.id) + '">' + o.t + '</button>'; }).join('') + '</div>' +
      (ongletActivite === 'appels' ? journalAppels() : ongletActivite === 'clients' ? contenuClients() : activiteCommandes());
  }
  function activiteCommandes(){
    return graphiqueCommandes() +
      '<div class="g-metrics"><div><span>Panier moyen IA</span><b>' + esc(api.eur(D_.jour.panier)) + '</b><small>sur les commandes confirmées</small></div><div><span>Conversation</span><b>' + D_.jour.minutes + '<small> min</small></b><small>temps cumulé ce soir</small></div></div>';
  }
  function journalAppels(){
    var a=D_.appels.filter(function(x){return filtreAppels==='tous' || (filtreAppels==='attention' ? x.issue==='transfert'||x.issue==='expiree' : x.issue==='commande');});
    return '<div class="g-cl-tri"><span>Afficher</span>' + [{id:'tous',t:'Tous'},{id:'commande',t:'Commandes'},{id:'attention',t:'À regarder'}].map(function(f){return '<button data-filtre-appels="' + f.id + '" aria-pressed="' + (filtreAppels===f.id) + '">' + f.t + '</button>';}).join('') + '</div>' +
      '<div class="g-list">' +
      a.map(function(x){var i=D_.appels.indexOf(x);return '<button class="g-call-row" data-appel="' + i + '"><span class="g-call-time">' + esc(x.h) + '</span><span><b>' + esc(x.num) + '</b><small>' + esc(x.info || (x.cmd ? 'Commande #'+x.cmd : 'Appel entrant')) + ' · ' + esc(api.dur(x.duree)) + '</small></span><em class="g-issue g-issue-' + x.issue + '">' + (x.issue==='commande' ? esc(api.eur(x.montant)) : x.issue==='transfert' ? 'Transfert' : x.issue==='expiree' ? 'Expiré' : 'Question') + '</em></button>';}).join('') + '</div>' +
      (reel ? (D_.appels.length ? '' : '<p class="g-caption">Aucun appel aujourd’hui pour l’instant.</p>') : '<p class="g-caption">Extrait de ' + D_.appels.length + ' appels fictifs.</p>');
  }

  /* ------------------------------ Pelyo Habitués ------------------------------
     Les clients que Pelyo reconnaît à leur numéro : ce qu'ils prennent, ce
     qu'ils rapportent, ceux qui ne viennent plus. Visible seulement ici,
     jamais en cuisine. Démo : D_.clients ; compte réel : les commandes des
     90 derniers jours, regroupées par numéro. */
  var RECONQUETE_J = 21, filtreClients = 'tous', triClients = 'date', clientsOublies = {};
  var clientsReels = null;
  function telNormal(t){ var d = String(t || '').replace(/\D/g, ''); return /^0[1-9]\d{8}$/.test(d) ? '33' + d.slice(1) : d.replace(/^00/, ''); }
  function telLisible(t){
    var d = telNormal(t);
    if (/^33[1-9]\d{8}$/.test(d)) d = '0' + d.slice(2);
    return d.length === 10 ? d.replace(/(\d\d)(?=\d)/g, '$1 ') : String(t || '');
  }
  /* Compte réel : clients regroupés par la base (tableau_gerant). */
  function clientsDepuisTableau(l){
    var maintenant = Date.now();
    function jours(iso){ return Math.max(0, Math.floor((maintenant - Date.parse(iso)) / 864e5)); }
    return (l || []).map(function(c){
      var histo = (c.histo || []).map(function(h){ return { j:jours(h.at), t:h.total || 0, r:h.mode === 'livraison' ? 'Livraison' : 'À emporter' }; });
      if (!histo.length) histo = [{ j:jours(c.derniere), t:0, r:'' }];
      return { id:telNormal(c.tel), prenom:c.prenom || 'Client', tel:telLisible(c.tel), nb:c.nb || 0, total:c.total || 0,
        panier:c.nb ? Math.round((c.total || 0) / c.nb) : 0, histo:histo, allergies:c.allergies || [],
        mode:c.livraisons * 2 >= c.nb ? 'livraison' : 'retrait', lieu:c.rue || '', reel:true,
        depuis:new Date(c.premiere).toLocaleDateString('fr-FR', {month:'long', year:'numeric'}) };
    });
  }
  function lesClients(){
    var l = reel ? (clientsReels || []) : D_.clients;
    return l.filter(function(c){ return !clientsOublies[c.id]; }).sort(function(a, b){
      return triClients === 'date' ? a.histo[0].j - b.histo[0].j || b.nb - a.nb : b.nb - a.nb;
    });
  }
  function trouverClient(id){ var l = reel ? (clientsReels || []) : D_.clients; for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  function totalClient(c){ return c.reel ? c.total : c.nb * c.panier; }
  function ilYa(j){ return j === 0 ? 'aujourd’hui' : j === 1 ? 'hier' : 'il y a ' + j + ' jours'; }
  function ilYaCourt(j){ return j < 2 ? ilYa(j) : 'il y a ' + j + ' j'; }
  function absent(c){ return c.nb >= 2 && c.histo[0].j > RECONQUETE_J; }
  function ligneClient(c){
    return '<button class="g-cl-row" data-client="' + esc(c.id) + '"><span class="g-cl-av" aria-hidden="true">' + esc(c.prenom.charAt(0)) + '</span>' +
      '<span class="g-cl-txt"><b>' + esc(c.prenom) + (c.allergies.length ? '<em class="g-cl-tag">Allergie</em>' : '') + '</b>' +
        '<small class="g-cl-tel">' + esc(c.tel) + '</small><small>' + c.nb + ' commande' + (c.nb > 1 ? 's' : '') + ' · ' + ilYaCourt(c.histo[0].j) + '</small></span>' +
      '<span class="g-cl-val"><b>' + esc(api.eur0(totalClient(c))) + '</b>' +
        (absent(c) ? '<small class="g-cl-absent">À reconquérir</small>' : '<small>moy. ' + esc(api.eur(c.panier)) + '</small>') + '</span></button>';
  }
  function chiffresClients(){
    if (!reel){ var m = D_.clientsMois; return { habitues:m.habitues, clients:m.clients, part:Math.round(m.caHabitues / m.ca * 100), periode:'ce mois' }; }
    var l = clientsReels || [], ca = 0, caH = 0, h = 0;
    l.forEach(function(c){ ca += c.total; if (c.nb >= 2){ h++; caH += c.total; } });
    return { habitues:h, clients:l.length, part:ca ? Math.round(caH / ca * 100) : 0, periode:'sur 90 jours' };
  }
  function contenuClients(){
    var tous = lesClients(), k = chiffresClients(), nbAbsents = tous.filter(absent).length;
    var l = tous.filter(function(c){ return filtreClients === 'habitues' ? c.nb >= 2 : filtreClients === 'reconquerir' ? absent(c) : true; });
    var vide = reel && !tableau ? 'Chargement des clients…' : tous.length ? 'Aucun client dans cette liste.' : 'Vos clients apparaîtront ici dès leurs premières commandes au téléphone.';
    return '<div class="g-cl-kpis">' +
        '<div><span>Habitués</span><b>' + k.habitues + '</b><small>sur ' + k.clients + ' clients ' + k.periode + '</small></div>' +
        '<div><span>Leur part</span><b>' + k.part + '<small> %</small></b><small>du chiffre ' + k.periode + '</small></div>' +
        '<div><span>À reconquérir</span><b>' + nbAbsents + '</b><small>plus venus depuis ' + RECONQUETE_J + ' jours</small></div>' +
      '</div>' + PelyoModules.html('gerant.clients') +
      '<div class="g-cl-tri"><span>Afficher</span>' + [{id:'tous',t:'Tous'},{id:'habitues',t:'Habitués'},{id:'reconquerir',t:'À reconquérir'}].map(function(f){
        return '<button data-clients-filtre="' + f.id + '" aria-pressed="' + (filtreClients === f.id) + '">' + f.t + '</button>'; }).join('') + '</div>' +
      '<div class="g-cl-tri"><span>Trier par</span>' + [{id:'date',t:'Plus récents'},{id:'fidelite',t:'Plus fidèles'}].map(function(f){
        return '<button data-clients-tri="' + f.id + '" aria-pressed="' + (triClients === f.id) + '">' + f.t + '</button>'; }).join('') + '</div>' +
      (l.length ? '<div class="g-list">' + l.map(ligneClient).join('') + '</div>' : '<p class="g-note">' + vide + '</p>') +
      '<p class="g-note">Les numéros viennent des commandes passées au téléphone (90 derniers jours). Ils servent à la commande et à reconnaître les habitués ; pour leur envoyer une offre par SMS, il faut leur accord.</p>';
  }
  function feuilleClient(){
    var c = trouverClient(sheet.id);
    if (!c) return feuilleClients();
    var der = c.histo[0].j;
    var accueil = c.habituelle ? 'Bonjour ' + c.prenom + ' ! ' + nomResto() + ', je suis ' + voix.prenom + ', l’assistant vocal automatisé du restaurant. Comme d’habitude : ' + c.habituelle + ' ?' : '';
    return '<div class="g-body">' +
      '<div class="g-cl-tete"><span class="g-cl-av g-cl-av-l" aria-hidden="true">' + esc(c.prenom.charAt(0)) + '</span><div><h2>' + esc(c.prenom) + '</h2>' +
        '<a class="g-cl-appel" href="tel:' + esc(telNormal(c.tel) ? '+' + telNormal(c.tel) : '') + '">' + esc(c.tel) + '</a>' + (c.depuis ? '<small>Client depuis ' + esc(c.depuis) + '</small>' : '') + '</div></div>' +
      (accueil ? '<div class="g-cl-accueil"><p class="g-lab">Quand il appelle, Pelyo dit</p><p>« ' + esc(accueil) + ' »</p><small>Un « oui » suffit : la commande est reprise, l’adresse reconfirmée, et ce qui manque ce soir est signalé.</small></div>' : '') +
      (c.allergies.length ? '<div class="g-cl-allergie"><b>Allergie signalée : ' + esc(c.allergies.join(', ')) + '</b><small>Pelyo la rappelle et la redemande à chaque appel. Elle n’est jamais reprise sans la réponse du client.</small></div>' : '') +
      '<dl class="g-facts"><dt>Commandes</dt><dd>' + c.nb + '</dd><dt>Dernière commande</dt><dd>' + ilYa(der) + '</dd><dt>Panier moyen</dt><dd>' + esc(api.eur(c.panier)) + '</dd>' +
        '<dt>Total commandé</dt><dd>' + esc(api.eur0(totalClient(c))) + '</dd><dt>Habitude</dt><dd>' + (c.mode === 'livraison' ? 'Livraison' + (c.lieu ? ' · ' + esc(c.lieu) : '') : 'À emporter') + '</dd></dl>' +
      (absent(c) ? '<p class="g-note g-cu">Plus de commande depuis ' + der + ' jours, alors qu’il commandait régulièrement.</p>' : '') +
      '<p class="g-lab">Dernières commandes</p><div class="g-cl-histo">' + c.histo.slice(0, 8).map(function(h){
        return '<div><span>' + ilYa(h.j) + '</span><b>' + esc(h.r) + '</b><em>' + esc(api.eur(h.t)) + '</em></div>'; }).join('') + '</div>' +
      '<p class="g-note">Pelyo reconnaît ce numéro grâce à ses commandes des 90 derniers jours. Si le client le demande, il n’est plus reconnu : ses commandes restent, mais Pelyo ne lui propose plus rien.</p>' +
    '</div><div class="g-foot"><div class="g-acts"><button class="g-act g-off" data-client-oublier="' + esc(c.id) + '">Ne plus reconnaître ce client</button></div></div>';
  }

  function feuilleAppel(){
    var x=D_.appels[sheet.index];
    return '<div class="g-top">Détail de l’appel · ' + esc(x.h) + '</div><div class="g-body"><h2>' + esc(x.num) + '</h2><dl class="g-facts"><dt>Durée</dt><dd>' + esc(api.dur(x.duree)) + '</dd><dt>Issue</dt><dd>' + esc(x.issue==='commande' ? 'Commande enregistrée' : x.issue==='transfert' ? 'Transfert au restaurant' : x.issue==='expiree' ? 'Sans confirmation' : 'Renseignement') + '</dd>' + (x.cmd ? '<dt>Référence associée</dt><dd>#' + x.cmd + '</dd>' : '') + (x.montant ? '<dt>Montant commandé</dt><dd>' + esc(api.eur(x.montant)) + '</dd>' : '') + '</dl>' + (x.info ? '<p class="g-para">' + esc(x.info) + '</p>' : '') + (reel ? '<p class="g-note">L’audio de l’appel est effacé après 7 jours, la transcription après 6 mois.</p>' : '<p class="g-note">Exemple de journal. Aucune transcription ni aucun enregistrement audio de cet appel ne sont fournis dans la maquette.</p>') + '<p class="g-note">' + esc(D_.regles.confirmation) + '</p></div>';
  }

  function vueRejeu(){
    var r = rejeu;
    var lignes = r.vues.map(function(e){
      if (e.qui === "sys") return '<p class="g-sys">' + esc(e.txt) + '</p>';
      if (e.qui === "me")  return '<p class="g-me">' + esc(e.txt) + '</p>';
      return '<p class="g-bot">' + esc(e.txt) + '</p>';
    }).join("");
    var panier = r.panier
      ? r.panier.q + "× " + r.panier.nom + (r.panier.sup ? " + " + r.panier.sup : "") +
        "<br>" + r.panier.opt + " — " + api.eur(r.panier.prix)
      : "panier vide — l'IA construit en silence";

    return '<div class="g-top">Simulation accélérée · <span data-rejeu-temps>' + api.chrono(r.t) + '</span></div>' +
      '<div class="g-center g-flow">' +
        '<div class="g-basket">' + panier + '</div>' +
        '<div class="g-tr" data-tr>' + lignes + '</div>' +
        '<div class="g-block' + (r.sms ? " g-on" : "") + '">' +
          '<p class="g-smslab">Récapitulatif envoyé</p>' +
          '<p class="g-sms">' + esc(D_.sms) + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="g-foot">' +
        '<p class="g-micro">' + (r.fini ? "Commande 248 confirmée par le client, envoyée en cuisine." :
          (r.confirme ? "Le client a validé." : "Rien ne part en cuisine avant confirmation.")) + '</p>' +
        '<div class="g-acts">' +
          '<button class="g-act" data-rejeu>' + (r.fini ? "Rejouer" : "Reprendre au début") + '</button>' +
          '<button class="g-act g-off" data-transfert>Transférer</button>' +
          '<button class="g-act g-off" data-stoprejeu>Fermer</button>' +
        '</div>' +
      '</div>';
  }

  /* --------------------------------- carte --------------------------------- */
  /* La carte : un anneau par catégorie (touchez pour filtrer), puis une tuile
     par produit avec ses ventes de la semaine et un interrupteur de rupture. */
  var COULEURS_CAT = ['#ff8a3d', '#ffc04d', '#ef5b3a', '#ffe08a', '#c8743f', '#ffa36b'];
  var TRIS = [{id:'populaires', t:'Populaires'}, {id:'prix', t:'Prix'}, {id:'az', t:'A → Z'}];

  function produitsCarte(){
    var tous = [];
    D_.menu.forEach(function(c, ci){
      c.items.forEach(function(it){
        tous.push({it:it, cat:c.cat, ci:ci, ko:indisponible(it), semaine:serieVentes(it, 'semaine')});
      });
    });
    tous.slice().sort(function(a, b){ return b.semaine.total - a.semaine.total; })
      .forEach(function(x, i){ x.rang = i + 1; });
    return tous;
  }

  function anneauCarte(tous){
    var n = tous.length, off = 0, R = 52, C = 2 * Math.PI * R, gap = 4, pos = 0;
    tous.forEach(function(x){ if (x.ko) off++; });
    var segs = D_.menu.map(function(c, i){
      var k = c.items.length, ko = c.items.filter(indisponible).length;
      var long = Math.max(1, C * k / n - gap), dispo = long * (k - ko) / k;
      var actif = filtreCarte === 'tous' || filtreCarte === String(i) || (filtreCarte === 'ruptures' && ko);
      var s = '<g class="g-ring-seg' + (actif ? '' : ' g-ring-dim') + '" data-cat="' + i + '" style="--d:' + (i * 0.08) + 's">' +
        '<circle class="g-ring-hit" r="' + R + '" cx="70" cy="70" stroke-dasharray="' + long.toFixed(2) + ' ' + (C - long).toFixed(2) + '" stroke-dashoffset="' + (-pos).toFixed(2) + '"/>' +
        (dispo > 0 ? '<circle class="g-ring-on" r="' + R + '" cx="70" cy="70" stroke="' + COULEURS_CAT[i % COULEURS_CAT.length] + '" stroke-dasharray="' + dispo.toFixed(2) + ' ' + (C - dispo).toFixed(2) + '" stroke-dashoffset="' + (-pos).toFixed(2) + '"/>' : '') +
        (ko ? '<circle class="g-ring-ko" r="' + R + '" cx="70" cy="70" stroke-dasharray="' + (long - dispo).toFixed(2) + ' ' + (C - long + dispo).toFixed(2) + '" stroke-dashoffset="' + (-(pos + dispo)).toFixed(2) + '"/>' : '') +
        '</g>';
      pos += long + gap;
      return s;
    }).join('');
    var meilleur = tous.filter(function(x){ return x.rang === 1; })[0];
    var choisi = /^\d+$/.test(filtreCarte) ? D_.menu[Number(filtreCarte)] : null;
    return '<section class="g-board">' +
      '<div class="g-board-ring"><svg viewBox="0 0 140 140" role="img" aria-label="' + (n - off) + ' produits en vente sur ' + n + '"><g transform="rotate(-90 70 70)">' + segs + '</g></svg>' +
        '<div class="g-board-centre"><b>' + (n - off) + '<small>/' + n + '</small></b><span>' + (choisi ? esc(choisi.cat) : 'en vente') + '</span></div></div>' +
      '<div class="g-board-side"><p class="g-board-kicker">En un coup d’œil</p>' +
        '<div class="g-board-legend">' +
          '<button data-cat="tous" aria-pressed="' + (filtreCarte === 'tous') + '"><i class="g-board-all"></i><span>Toute la carte</span><em>' + (n - off) + '/' + n + '</em></button>' +
          D_.menu.map(function(c, i){
            var ko = c.items.filter(indisponible).length;
            return '<button data-cat="' + i + '" aria-pressed="' + (filtreCarte === String(i)) + '"><i style="background:' + COULEURS_CAT[i % COULEURS_CAT.length] + '"></i><span>' + esc(c.cat) + '</span><em' + (ko ? ' class="g-board-alerte"' : '') + '>' + (c.items.length - ko) + '/' + c.items.length + '</em></button>';
          }).join('') +
        '</div></div>' +
        (meilleur ? '<button class="g-board-top" data-produit="' + meilleur.it.id + '"><span>N° 1 cette semaine</span><b>' + esc(meilleur.it.nom) + '</b><em>' + meilleur.semaine.total.toLocaleString('fr-FR') + ' ventes ↗</em></button>' : '') +
      '</section>';
  }

  function tendance(serie){
    var pts = serie.pts, max = -Infinity, min = Infinity;
    pts.forEach(function(p){ if (p.v > max) max = p.v; if (p.v < min) min = p.v; });
    var ecart = max - min || 1;
    var xy = pts.map(function(p, i){ return [2 + 96 * i / (pts.length - 1), 24 - 20 * (p.v - min) / ecart]; });
    var d = tracerCourbe(xy, 2, 26);
    return '<svg class="g-tile-trend" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"><path class="g-tile-aire" d="' + d + ' L98 28 L2 28Z"/><path class="g-tile-ligne" d="' + d + '"/></svg>';
  }

  function compteProduits(n){ return '<b>' + n + '</b> produit' + (n > 1 ? 's' : '') + ' affiché' + (n > 1 ? 's' : ''); }

  function vueCarte(){
    var tous = produitsCarte(), n = tous.length, off = 0;
    tous.forEach(function(x){ if (x.ko) off++; });
    var q = api.norm(rechercheCarte), visibles = 0;
    var liste = tous.filter(function(x){
      if (filtreCarte === 'ruptures') return x.ko;
      return filtreCarte === 'tous' || filtreCarte === String(x.ci);
    });
    liste.sort(triCarte === 'prix' ? function(a, b){ return a.it.prix - b.it.prix; }
      : triCarte === 'az' ? function(a, b){ return a.it.nom.localeCompare(b.it.nom, 'fr'); }
      : function(a, b){ return a.rang - b.rang; });
    var tuiles = liste.map(function(x, i){
      var it = x.it, cherche = api.norm(it.nom + ' ' + (it.inclus || '') + ' ' + (it.prec || '') + ' ' + x.cat);
      var ok = !q || cherche.indexOf(q) >= 0;
      if (ok) visibles++;
      return '<article class="g-tile' + (x.ko ? ' g-tile-ko' : '') + (dernierBascule === it.id ? ' g-tile-flash' : '') + '" data-cherche="' + esc(cherche) + '"' + (ok ? '' : ' hidden') + ' style="--i:' + i + '">' +
        '<div class="g-tile-top"><span class="g-tile-cat"><i style="background:' + COULEURS_CAT[x.ci % COULEURS_CAT.length] + '"></i><span>' + esc(x.cat) + '</span></span>' +
          (x.ko ? '<span class="g-tile-etat">Rupture</span>' : x.rang <= 3 ? '<span class="g-tile-rang" title="Classement des ventes de la semaine">N° ' + x.rang + '</span>' : '') + '</div>' +
        '<button class="g-tile-open" data-produit="' + it.id + '"><b>' + esc(it.nom) + '</b><small>' + esc(it.inclus || it.prec || 'Produit à la carte') + '</small></button>' +
        tendance(x.semaine) +
        '<p class="g-tile-ventes">' + x.semaine.total.toLocaleString('fr-FR') + ' ventes · 7 jours</p>' +
        '<div class="g-tile-bas"><strong>' + esc(api.eur(it.prix)) + '</strong>' +
          '<button class="g-switch" role="switch" aria-checked="' + !x.ko + '" data-rupture="' + it.id + '" aria-label="' + esc(it.nom) + ' : ' + (x.ko ? 'en rupture' : 'en vente') + '"><span>' + (x.ko ? 'Rupture' : 'En vente') + '</span><i></i></button>' +
        '</div>' +
      '</article>';
    }).join('');
    dernierBascule = null;
    return titre('Votre carte', 'La carte.') +
      anneauCarte(tous) +
      '<div class="g-carte-outils">' +
        '<form class="g-carte-search" data-recherche-form role="search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>' +
          '<label class="g-visually-hidden" for="g-search">Rechercher un produit</label><input id="g-search" type="search" autocomplete="off" placeholder="Rechercher un produit, un ingrédient…" value="' + esc(rechercheCarte) + '">' +
          '<button type="button" data-reset-carte aria-label="Effacer la recherche">×</button></form>' +
        '<div class="g-carte-tris" role="group" aria-label="Trier les produits">' + TRIS.map(function(t){
          return '<button data-tri="' + t.id + '" aria-pressed="' + (triCarte === t.id) + '">' + t.t + '</button>';
        }).join('') +
          '<button class="g-carte-ruptures" data-cat="' + (filtreCarte === 'ruptures' ? 'tous' : 'ruptures') + '" aria-pressed="' + (filtreCarte === 'ruptures') + '">Ruptures <em>' + off + '</em></button>' +
        '</div>' +
      '</div>' +
      '<p class="g-carte-compte" aria-live="polite" data-carte-compte>' + compteProduits(visibles) + '</p>' +
      '<div class="g-tiles">' + tuiles +
        '<button class="g-tile g-tile-import" data-produit-nouveau><span aria-hidden="true">+</span><b>Ajouter un produit</b><small>Prix, choix et suppléments</small></button>' +
        '<button class="g-tile g-tile-import" data-import><span aria-hidden="true">↥</span><b>Importer une carte</b><small>Photo, PDF ou site web</small></button>' +
      '</div>' +
      '<p class="g-empty g-carte-vide"' + (visibles ? ' hidden' : '') + '>Aucun produit ne correspond.<button data-reset-carte>Tout afficher</button></p>' +
      '<p class="g-note">Touchez un produit pour le modifier ou voir ses ventes. L’interrupteur le retire de la carte de l’assistant dès le prochain appel.</p>';
  }

  /* ------------------------- ventes d'un produit -------------------------- */
  /* Données d'exemple, stables pour un même produit. Une fois branché, la même
     série viendra de commande_lignes (produit_id, quantite, created_at)
     regroupées par heure, jour ou mois. */
  var ECHELLES = [
    {id:'jour', t:'Jour', compare:'à la veille', periode:'sur la journée'},
    {id:'semaine', t:'Semaine', compare:'aux 7 jours précédents', periode:'sur 7 jours'},
    {id:'mois', t:'Mois', compare:'aux 30 jours précédents', periode:'sur 30 jours'},
    {id:'annee', t:'Année', compare:'aux 12 mois précédents', periode:'sur 12 mois'}
  ];
  var MOIS_COURTS = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];
  var JOURS_COURTS = ['Di','Lu','Ma','Me','Je','Ve','Sa'];

  function hasard(texte){
    var h = 2166136261;
    for (var i = 0; i < texte.length; i++){ h ^= texte.charCodeAt(i); h = Math.imul(h, 16777619); }
    return function(){
      h = (h + 0x6D2B79F5) | 0;
      var t = Math.imul(h ^ (h >>> 15), 1 | h);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Répartit exactement `cible` entre les barres, en gardant leur forme. */
  function caler(pts, cible, s){
    var somme = pts.reduce(function(t, p){ return t + p.v; }, 0);
    if (!somme) return;
    var reste = cible, parts = pts.map(function(p, i){ var x = p.v * cible / somme; return {i:i, ent:Math.floor(x), frac:x - Math.floor(x)}; });
    parts.forEach(function(q){ pts[q.i].v = q.ent; reste -= q.ent; });
    parts.sort(function(a, b){ return b.frac - a.frac; }).slice(0, reste).forEach(function(q){ pts[q.i].v++; });
    s.total = cible;
  }
  /* Compte réel : courbes tirées du tableau de bord (commandes du restaurant,
     ou ventes d'un produit). Avant chargement, tout est à zéro. */
  function serieReelle(item, echelle){
    var t = tableau || {}, produit = item.id !== 'resto-commandes' ? (t.produits || {})[item.nom] || {} : null;
    var heures = produit ? produit.heures || [] : t.heures || [], veille = produit ? [] : t.veille || [];
    var jours = produit ? (produit.jours || []) : (t.jours || []).map(function(x){ return x.n; });
    var mois = produit ? (produit.mois || []) : (t.mois || []).map(function(x){ return x.n; });
    var auj = new Date(), pts = [], i, d, avant = 0;
    function v(l, k){ return Number(l[k]) || 0; }
    function somme(l){ var n = 0; l.forEach(function(x){ n += Number(x) || 0; }); return n; }
    if (echelle === 'jour'){
      var premier = 11, dernier = 23;
      for (i = 0; i < 24; i++) if (v(heures, i)){ premier = Math.min(premier, i); dernier = Math.max(dernier, i); }
      for (i = premier; i <= dernier; i++){
        pts.push({ v:v(heures, i), c:i + 'h', l:'aujourd’hui entre ' + i + ' h et ' + (i + 1) + ' h',
          d:new Date(auj.getFullYear(), auj.getMonth(), auj.getDate(), i), per:'heure' });
      }
      avant = somme(veille);
    } else if (echelle === 'semaine' || echelle === 'mois'){
      var n = echelle === 'semaine' ? 7 : 30, L = jours.length || 60;
      for (i = n - 1; i >= 0; i--){
        d = new Date(auj.getFullYear(), auj.getMonth(), auj.getDate() - i);
        pts.push({ v:v(jours, L - 1 - i), c:echelle === 'semaine' ? JOURS_COURTS[d.getDay()] : String(d.getDate()),
          l:d.toLocaleDateString('fr-FR', {weekday:'long', day:'numeric', month:'long'}), d:d, per:'jour' });
      }
      avant = somme(jours.slice(Math.max(0, L - 2 * n), L - n));
    } else {
      var M = mois.length || 12;
      for (i = 11; i >= 0; i--){
        d = new Date(auj.getFullYear(), auj.getMonth() - i, 1);
        pts.push({ v:v(mois, M - 1 - i), c:MOIS_COURTS[d.getMonth()], l:'en ' + d.toLocaleDateString('fr-FR', {month:'long', year:'numeric'}), d:d, per:'mois' });
      }
      avant = M > 12 ? somme(mois.slice(0, M - 12)) : 0;
    }
    var total = 0;
    pts.forEach(function(p){ total += p.v; });
    return { pts:pts, total:total, avant:avant };
  }
  function serieVentes(item, echelle, base){
    if (reel) return serieReelle(item, echelle);
    var r = hasard(item.id + ':' + echelle), pop = 0.6 + hasard(item.id)() * 1.1;
    var parJour = base || pop * 18, auj = new Date(), pts = [], i, d;
    var semaine = [0.95, 0.7, 0.75, 0.85, 0.95, 1.3, 1.45]; /* dimanche → samedi */
    function bruit(){ return 0.82 + r() * 0.36; }
    if (echelle === 'jour'){
      var heures = [0.15, 0.55, 0.7, 0.35, 0.12, 0.08, 0.1, 0.2, 0.45, 0.9, 1, 0.7, 0.3];
      for (i = 0; i < heures.length; i++){
        pts.push({v: Math.round(parJour / 5.6 * heures[i] * bruit() * 1.6), c: (11 + i) + 'h', l: 'aujourd’hui entre ' + (11 + i) + ' h et ' + (12 + i) + ' h',
          d: new Date(auj.getFullYear(), auj.getMonth(), auj.getDate(), 11 + i), per: 'heure'});
      }
    } else if (echelle === 'semaine' || echelle === 'mois'){
      var n = echelle === 'semaine' ? 7 : 30;
      for (i = n - 1; i >= 0; i--){
        d = new Date(auj.getFullYear(), auj.getMonth(), auj.getDate() - i);
        pts.push({
          v: Math.round(parJour * semaine[d.getDay()] * bruit() * (1 - i * 0.004)),
          c: echelle === 'semaine' ? JOURS_COURTS[d.getDay()] : String(d.getDate()),
          l: d.toLocaleDateString('fr-FR', {weekday:'long', day:'numeric', month:'long'}),
          d: d, per: 'jour'
        });
      }
    } else {
      var saison = [0.9, 0.88, 0.97, 1, 1.04, 1.02, 0.92, 0.8, 1, 1.03, 1.05, 1.15];
      for (i = 11; i >= 0; i--){
        d = new Date(auj.getFullYear(), auj.getMonth() - i, 1);
        pts.push({
          v: Math.round(parJour * 30 * saison[d.getMonth()] * bruit() * (1 - i * 0.02)),
          c: MOIS_COURTS[d.getMonth()],
          l: 'en ' + d.toLocaleDateString('fr-FR', {month:'long', year:'numeric'}),
          d: d, per: 'mois'
        });
      }
    }
    var total = 0;
    pts.forEach(function(p){ total += p.v; });
    return {pts: pts, total: total, avant: Math.round(total * (0.82 + r() * 0.3))};
  }

  /* Commandes du moment choisi sur un graphique (liste sous le graphique).
     Données d'exemple, stables pour un même point ; une fois branché, ce
     seront les commandes réelles de la période. */
  var limiteCommandes = 6;
  function deuxChiffres(n){ return (n < 10 ? '0' : '') + n; }
  function instantDans(r, p){
    var d = new Date(p.d.getTime());
    if (p.per === 'heure'){ d.setMinutes(Math.floor(r() * 60)); return d; }
    if (p.per === 'mois'){
      var fin = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(), auj = new Date();
      if (d.getFullYear() === auj.getFullYear() && d.getMonth() === auj.getMonth()) fin = auj.getDate();
      d.setDate(1 + Math.floor(r() * fin));
    }
    var midi = r() < 0.35, debut = midi ? 11 * 60 + 30 : 18 * 60 + 30, duree = midi ? 180 : 255;
    var m = debut + Math.floor(r() * duree);
    d.setHours(Math.floor(m / 60), m % 60, 0, 0);
    return d;
  }
  /* produit : les commandes qui le contiennent, jusqu'à p.v unités ; sinon p.v commandes. */
  /* Compte réel : seules les commandes du jour sont détaillées. */
  function commandesPointReel(p, produit){
    var auj = new Date(), memeJour = p.d.getFullYear() === auj.getFullYear() && p.d.getMonth() === auj.getMonth() && p.d.getDate() === auj.getDate();
    if (p.per === 'mois' || !memeJour) return null;
    return D_.commandes.filter(function(c){
      if (p.per === 'heure' && c.quand.getHours() !== p.d.getHours()) return false;
      return !produit || c.lignes.some(function(l){ return l.nom === produit.nom; });
    }).map(function(c){
      var lignes = produit ? c.lignes.slice().sort(function(a, b){ return (b.nom === produit.nom) - (a.nom === produit.nom); }) : c.lignes;
      return { quand:c.quand, num:c.num, lignes:lignes, total:c.total, livraison:c.livraison, tel:c.tel, duree:null, origine:c.origine };
    });
  }
  function commandesPoint(cle, p, produit){
    if (reel) return commandesPointReel(p, produit) || [];
    var r = hasard(cle), carte = [], liste = [], unites = 0;
    D_.menu.forEach(function(c){ c.items.forEach(function(it){ carte.push(it); }); });
    while (produit ? unites < p.v : liste.length < p.v){
      var lignes = [], q;
      if (produit){
        q = Math.min(p.v - unites, r() < 0.82 ? 1 : 2);
        unites += q;
        lignes.push({q:q, nom:produit.nom, prix:produit.prix * q});
      }
      var autres = produit ? Math.floor(r() * 3) : 1 + Math.floor(r() * 3);
      for (var k = 0; k < autres; k++){
        var it = carte[Math.floor(r() * carte.length)];
        if (produit && it.id === produit.id) continue;
        q = r() < 0.85 ? 1 : 2;
        lignes.push({q:q, nom:it.nom, prix:it.prix * q});
      }
      var total = 0;
      lignes.forEach(function(l){ total += l.prix; });
      liste.push({
        quand: instantDans(r, p), num: 1000 + Math.floor(r() * 9000), lignes: lignes, total: total,
        livraison: r() < 0.3, tel: '06 •• •• •• ' + deuxChiffres(Math.floor(r() * 100)), duree: 40 + Math.floor(r() * 140)
      });
    }
    return liste.sort(function(a, b){ return b.quand - a.quand; });
  }
  function listeCommandes(cle, p, produit){
    var liste = commandesPoint(cle, p, produit), n = liste.length;
    if (!n && reel && p.v) return '<p class="g-cmds-vide">' + p.v + ' commande' + (p.v > 1 ? 's' : '') + ' ' + esc(p.l) + '. Le détail est affiché pour les commandes du jour.</p>';
    if (!n) return '<p class="g-cmds-vide">Aucune commande ' + esc(p.l) + '.</p>';
    var montre = liste.slice(0, limiteCommandes);
    var compte = n.toLocaleString('fr-FR') + ' commande' + (n > 1 ? 's' : '');
    if (produit && p.v !== n) compte = p.v.toLocaleString('fr-FR') + ' ventes dans ' + compte;
    return '<div class="g-cmds-tete"><b>' + compte + '</b><span>' + esc(p.l) + '</span></div>' +
      montre.map(function(c){
        var h = deuxChiffres(c.quand.getHours()) + ':' + deuxChiffres(c.quand.getMinutes());
        var jour = p.per === 'heure' ? '' : c.quand.toLocaleDateString('fr-FR', {day:'numeric', month:'short'}) + ' · ';
        var titre = produit ? c.lignes[0].q + '× ' + produit.nom : c.lignes.length + ' article' + (c.lignes.length > 1 ? 's' : '');
        return '<details class="g-cmds-ligne"><summary><span class="g-cmds-heure">' + h + '</span>' +
          '<span class="g-cmds-txt"><b>#' + c.num + ' · ' + esc(titre) + '</b><small>' + esc(jour + (c.livraison ? 'Livraison' : 'Retrait') + (c.tel ? ' · ' + c.tel : '')) + '</small></span>' +
          '<strong>' + esc(api.eur(c.total)) + '</strong></summary>' +
          '<div class="g-cmds-articles">' + c.lignes.map(function(l){
            return '<p><span>' + l.q + '× ' + esc(l.nom) + '</span><span>' + esc(api.eur(l.prix)) + '</span></p>';
          }).join('') +
          '<p class="g-cmds-total"><span>Total</span><span>' + esc(api.eur(c.total)) + '</span></p>' +
          '<small>' + (c.origine === 'restaurant' ? 'Saisie au restaurant' : 'Prise par l’assistant' + (c.duree ? ' · appel de ' + esc(api.dur(c.duree)) : '')) + '</small></div></details>';
      }).join('') +
      (n > montre.length ? '<button class="g-cmds-plus" data-plus-commandes>Voir ' + Math.min(20, n - montre.length) + ' de plus <span>· ' + (n - montre.length).toLocaleString('fr-FR') + ' restante' + (n - montre.length > 1 ? 's' : '') + '</span></button>' : '');
  }

  /* Graphiques : on pose le doigt (ou la souris) et on glisse ; le point le
     plus proche s'allume. Mise à jour directe, sans redessiner l'écran. */
  var graphes = {}, glisse = null;
  function bezier(a, b, c, d, t){ var u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d; }
  /* Hauteur de la courbe à l'abscisse x (recherche de t par dichotomie). */
  function yCourbe(g, x){
    for (var k = 0; k < g.segs.length; k++){
      var s = g.segs[k];
      if (x <= s[6] || k === g.segs.length - 1){
        var a = 0, b = 1, t = 0.5;
        for (var n = 0; n < 20; n++){ t = (a + b) / 2; if (bezier(s[0], s[2], s[4], s[6], t) < x) a = t; else b = t; }
        return bezier(s[1], s[3], s[5], s[7], t);
      }
    }
    return g.y[0];
  }
  /* Curseur de la courbe à l'abscisse x : point, halo, repère, valeur. */
  function placer(svg, g, x){
    var y = yCourbe(g, x), xs = x.toFixed(1);
    ['.g-ventes-point', '.g-ventes-halo'].forEach(function(sel){ var c = svg.querySelector(sel); c.setAttribute('cx', xs); c.setAttribute('cy', y.toFixed(1)); });
    var l = svg.querySelector('.g-ventes-repere');
    l.setAttribute('x1', xs); l.setAttribute('x2', xs); l.setAttribute('y1', (y + 8).toFixed(1));
    var val = svg.querySelector('.g-ventes-valeur');
    val.setAttribute('x', Math.max(g.G + 10, Math.min(g.D - 10, x)).toFixed(1));
    val.setAttribute('y', (y - g.ecart).toFixed(1));
  }
  /* Point le plus proche : chiffre, date en bas, phrase sous le graphique. */
  function choisirPoint(svg, g, i){
    if (i === g.i) return;
    g.i = i;
    g.garder(i);
    svg.querySelector('.g-ventes-valeur').textContent = g.valeurs[i];
    [].forEach.call(svg.querySelectorAll('text[data-i]'), function(t){ t.classList.toggle('g-ventes-actif', Number(t.getAttribute('data-i')) === i); });
    svg.setAttribute('aria-label', g.aria[i]);
    var d = svg.parentNode.querySelector('.g-ventes-detail');
    if (d) d.innerHTML = g.details[i];
    var lst = root.querySelector('[data-liste="' + svg.getAttribute('data-graphe') + '"]');
    if (lst && g.liste){ limiteCommandes = 6; lst.innerHTML = g.liste(i); }
  }
  function glisser(svg, clientX){
    var g = graphes[svg.getAttribute('data-graphe')];
    if (!g) return;
    var r = svg.getBoundingClientRect(), vx = (clientX - r.left) / r.width * g.largeur, i = 0, k;
    for (k = 1; k < g.x.length; k++) if (Math.abs(g.x[k] - vx) < Math.abs(g.x[i] - vx)) i = k;
    if (g.barres){
      /* Barres : chaque barre s'allume tour à tour. */
      if (i === g.i) return;
      [].forEach.call(svg.querySelectorAll('.g-barre'), function(b, n){ b.classList.toggle('g-barre-choisie', n === i); });
      var val = svg.querySelector('.g-ventes-valeur');
      val.setAttribute('x', Math.max(g.G + 10, Math.min(g.D - 10, g.x[i])).toFixed(1));
      val.setAttribute('y', (g.y[i] - g.ecart).toFixed(1));
      choisirPoint(svg, g, i);
      return;
    }
    /* Courbe : le curseur reste sous le doigt. */
    g.retour = null;
    g.curseur = Math.max(g.x[0], Math.min(g.x[g.x.length - 1], vx));
    placer(svg, g, g.curseur);
    choisirPoint(svg, g, i);
  }
  /* Au relâché, le curseur rejoint en douceur le point le plus proche. */
  function relacher(svg){
    var g = graphes[svg.getAttribute('data-graphe')];
    if (!g || g.barres || g.curseur == null) return;
    var de = g.curseur, vers = g.x[g.i], debut = null, jeton = {};
    g.curseur = null;
    g.retour = jeton;
    function pas(ts){
      if (g.retour !== jeton) return;
      if (debut === null) debut = ts;
      var k = Math.min(1, (ts - debut) / 220), e = 1 - Math.pow(1 - k, 3);
      placer(svg, g, de + (vers - de) * e);
      if (k < 1) requestAnimationFrame(pas); else g.retour = null;
    }
    requestAnimationFrame(pas);
    /* Si l'animation est suspendue (appli en arrière-plan), le point est quand même posé. */
    setTimeout(function(){ if (g.retour === jeton){ g.retour = null; placer(svg, g, vers); } }, 300);
  }

  function nombreCourt(n){
    if (n < 10000) return n.toLocaleString('fr-FR');
    return (Math.round(n / 100) / 10).toString().replace('.', ',') + 'k';
  }

  /* Courbe lissée (Catmull-Rom), sans dépasser le cadre du graphique. */
  /* `segs` (facultatif) reçoit chaque segment de Bézier [x0,y0,x1,y1,x2,y2,x3,y3],
     pour placer un curseur n'importe où sur la courbe. */
  function tracerCourbe(xy, haut, bas, segs){
    var c = 'M' + xy[0][0] + ' ' + xy[0][1];
    function borne(y){ return Math.max(haut, Math.min(bas, y)); }
    for (var i = 0; i < xy.length - 1; i++){
      var p0 = xy[i - 1] || xy[i], p1 = xy[i], p2 = xy[i + 1], p3 = xy[i + 2] || p2;
      var s = [p1[0], p1[1],
        +(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1), +borne(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1),
        +(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1), +borne(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1),
        +p2[0].toFixed(1), +p2[1].toFixed(1)];
      if (segs) segs.push(s);
      c += ' C' + s.slice(2).join(' ');
    }
    return c;
  }

  function graphiqueVentes(item){
    var echelle = sheet.echelle || 'semaine', e = ECHELLES.filter(function(x){ return x.id === echelle; })[0];
    var s = serieVentes(item, echelle), pts = s.pts, n = pts.length;
    var max = 0, top = 0;
    pts.forEach(function(p, i){ if (p.v > max){ max = p.v; top = i; } });
    var choisi = typeof sheet.point === 'number' && sheet.point < n ? sheet.point : top;
    var pas = max > 40 ? Math.pow(10, Math.floor(Math.log(max) / Math.LN10)) / 2 : 5;
    var plafond = Math.ceil(max * 1.12 / pas) * pas || 5;
    var L = root.offsetWidth >= 700 ? 520 : 320; /* plus large sur tablette, même hauteur */
    var G = 40, D = L - 8, H = 34, B = 128;
    var xy = pts.map(function(p, i){ return [G + (D - G) * (n > 1 ? i / (n - 1) : 0.5), B - (B - H) * p.v / plafond]; });
    var tous = n <= 7 ? 1 : n <= 13 ? 2 : 5;
    var evol = s.avant ? Math.round((s.total - s.avant) / s.avant * 100) : 0;
    var anim = sheet.ventesAnim !== false;
    sheet.ventesAnim = false;
    var segs = [], trace = tracerCourbe(xy, H - 6, B, segs);
    var px = xy[choisi][0], py = xy[choisi][1];
    function detail(i){ return '<b>' + pts[i].v.toLocaleString('fr-FR') + ' vente' + (pts[i].v > 1 ? 's' : '') + '</b> ' + esc(pts[i].l) + (i === top ? ' · meilleur moment' : ''); }
    graphes.ventes = {
      largeur:L, G:G, D:D, ecart:13, i:choisi, segs:segs,
      x:xy.map(function(p){ return p[0]; }), y:xy.map(function(p){ return p[1]; }),
      valeurs:pts.map(function(p){ return nombreCourt(p.v); }), details:pts.map(function(p, i){ return detail(i); }),
      aria:pts.map(function(p){ return p.l + ' : ' + p.v + ' vente(s)'; }),
      garder:function(i){ if (sheet) sheet.point = i; },
      liste:function(i){ return listeCommandes(item.id + ':' + echelle + ':' + i, pts[i], item); }
    };
    return '<section class="g-ventes' + (anim ? ' g-ventes-anim' : '') + '" aria-label="Évolution des ventes">' +
      '<div class="g-ventes-head"><div><span>Ventes ' + esc(e.periode) + '</span><b>' + s.total.toLocaleString('fr-FR') + '</b>' +
        '<small class="' + (evol >= 0 ? 'g-ventes-hausse' : 'g-ventes-baisse') + '">' + (evol === 0 ? 'Stable' : (evol > 0 ? '+' : '−') + Math.abs(evol) + ' %') + ' par rapport ' + esc(e.compare) + '</small></div></div>' +
      '<div class="g-ventes-echelles" role="group" aria-label="Échelle du graphique">' + ECHELLES.map(function(x){
        return '<button data-ventes-echelle="' + x.id + '" aria-pressed="' + (x.id === echelle) + '">' + x.t + '</button>';
      }).join('') + '</div>' +
      '<svg class="g-ventes-svg" data-graphe="ventes" viewBox="0 0 ' + L + ' 150" role="img" aria-label="' + esc(pts[choisi].l + ' : ' + pts[choisi].v + ' vente(s)') + '">' +
        '<defs><linearGradient id="g-ventes-trait" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#ff7a2f"/><stop offset=".55" stop-color="#ffab3d"/><stop offset="1" stop-color="#ffd35a"/></linearGradient>' +
        '<linearGradient id="g-ventes-aire" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ff9a3d" stop-opacity=".22"/><stop offset="1" stop-color="#ff9a3d" stop-opacity="0"/></linearGradient></defs>' +
        [0, 0.5, 1].map(function(f){
          var y = B - (B - H) * f;
          return '<line x1="' + G + '" x2="' + D + '" y1="' + y + '" y2="' + y + '" class="g-ventes-grille"/>' +
            '<text x="' + (G - 7) + '" y="' + (y + 3) + '" text-anchor="end">' + nombreCourt(Math.round(plafond * f)) + '</text>';
        }).join('') +
        '<path class="g-ventes-aire" d="' + trace + ' L' + D + ' ' + B + ' L' + G + ' ' + B + 'Z"/>' +
        '<path class="g-ventes-lueur" d="' + trace + '" pathLength="1"/>' +
        '<path class="g-ventes-courbe" d="' + trace + '" pathLength="1"/>' +
        pts.map(function(p, i){
          return i % tous === 0 || (i === n - 1 && (n - 1) % tous >= tous / 2)
            ? '<text data-i="' + i + '" x="' + xy[i][0].toFixed(1) + '" y="146" text-anchor="middle"' + (i === choisi ? ' class="g-ventes-actif"' : '') + '>' + esc(p.c) + '</text>' : '';
        }).join('') +
        '<line class="g-ventes-repere" x1="' + px + '" x2="' + px + '" y1="' + (py + 8) + '" y2="' + B + '"/>' +
        '<circle class="g-ventes-halo" cx="' + px + '" cy="' + py + '" r="11"/>' +
        '<circle class="g-ventes-point" cx="' + px + '" cy="' + py + '" r="5"/>' +
        '<text class="g-ventes-valeur" x="' + Math.max(G + 10, Math.min(D - 10, px)) + '" y="' + (py - 13) + '" text-anchor="middle">' + nombreCourt(pts[choisi].v) + '</text>' +
        '<rect class="g-ventes-zone" x="0" y="0" width="' + L + '" height="150"/>' +
      '</svg>' +
      '<p class="g-ventes-detail">' + detail(choisi) + '</p>' +
      '<p class="g-ventes-note">' + (reel ? '' : 'Données d’exemple. ') + 'Glissez le doigt sur la courbe pour lire chaque point.</p>' +
    '</section>' +
      '<div class="g-cmds" data-liste="ventes" aria-live="polite">' + graphes.ventes.liste(choisi) + '</div>';
  }

  function feuilleProduit(id){
    var item = null, cat = "";
    D_.menu.forEach(function(c){ c.items.forEach(function(i){ if (i.id === id){ item = i; cat = c.cat; } }); });
    if (!item) return "";
    var ko = indisponible(item);
    return '<div class="g-top">' + esc(cat) + '</div>' +
      '<div class="g-body">' +
        '<div style="text-align:center"><div class="g-figure">' + esc(api.eur(item.prix)) + '</div>' +
          '<p class="g-note" style="margin:14px auto 0">' + esc(item.nom) +
          (item.inclus ? ' — ' + esc(item.inclus) : '') + '</p></div>' +
        graphiqueVentes(item) +
        (item.obl.length ? '<div><p class="g-lab">Questions posées, dans cet ordre</p>' +
          '<div class="g-list" style="margin-top:12px">' +
          item.obl.map(function(o, i){
            return '<div class="g-row"><span class="g-k">' + (i+1) + '. ' + esc(o.nom) +
              '<span class="g-s">' + esc(o.choix) + '</span></span>' +
              '<span class="g-v">' + (o.min === o.max ? o.min : o.min + "–" + o.max) + '</span></div>';
          }).join("") + '</div></div>' : '') +
        (item.sup.length ? '<div><p class="g-lab">Suppléments</p><div class="g-list" style="margin-top:12px">' +
          item.sup.map(function(s){
            return '<div class="g-row' + (s.dispo ? "" : " g-out") + '"><span class="g-k">' + esc(s.nom) + '</span>' +
              '<span class="g-v">' + (s.dispo ? "+ " + esc(api.eur(s.prix)) : "rupture") + '</span></div>';
          }).join("") + '</div></div>' : '') +
        (item.prec ? '<div><p class="g-lab">Précisions</p><p class="g-para">' + esc(item.prec) + '</p>' +
          '<p class="g-note g-cu" style="margin-top:10px">' + esc(D_.regles.allergenes) + '</p></div>' : '') +
        (item.dem ? '<div><p class="g-lab">Demandes admises</p><p class="g-para">' + esc(item.dem) + '</p></div>' : '') +
      '</div>' +
      '<div class="g-foot"><div class="g-acts">' +
        '<button class="g-act" data-produit-modifier="' + item.id + '">Modifier</button>' +
        '<button class="g-act g-off" data-rupture="' + item.id + '">' + (ko ? "Remettre en carte" : "Mettre en rupture") + '</button>' +
      '</div></div>';
  }

  /* ------------------------------ mise en route ------------------------------
     Visite des onglets puis réglages guidés par discussion (gerant-demarrage.js).
     Jamais ouverte d'office : tant que demarrage_fini_at est vide, une
     carte du pilotage la propose ; elle reste aussi dans Gestion. */
  var numeroPelyo = '', demarrageAFaire = false;
  function ouvrirDemarrage(mode){
    if (!window.PelyoDemarrage) return;
    sheet = null; peindre();
    PelyoDemarrage.ouvrir(root, {
      allerA:function(e){ ecran = e; sheet = null; rejeu = null; if (e === 'appels') ongletActivite = 'commandes'; peindre(); var m = root.querySelector('.g-main'); if (m) m.scrollTop = 0; },
      etat:function(){
        var n = 0; D_.menu.forEach(function(c){ n += c.items.length; });
        return { nom:nomResto(), adresse:D_.resto.adresse || '', tel:D_.resto.tel ? (reel ? telLisible(D_.resto.tel) : D_.resto.tel) : '', produits:n, numeroPelyo:numeroPelyo };
      },
      appliquer:appliquerDemarrage,
      plusTard:function(){ api.toast('Tu pourras reprendre la mise en route dans Gestion → Aide et informations.'); },
      fin:function(){
        if (reel) PelyoDonnees.majRestaurant({ demarrage_fini_at:new Date().toISOString() }, function(){});
        demarrageAFaire = false;
        ecran = 'soir'; sheet = null; peindre(); api.toast('Bienvenue sur Pelyo !');
      }
    }, mode);
  }
  /* Applique une réponse de la mise en route ; cb(erreur ou null). Démo : en mémoire ; compte réel : dans la base. */
  function appliquerDemarrage(type, v, cb){
    function fin(e){ cb(e || null); if (!e) peindre(); }
    function base(champs){ if (reel) PelyoDonnees.majRestaurant(champs, fin); else fin(); }
    if (type === 'nom'){ D_.resto.nom = v; if (reel && PelyoDonnees.restaurant()) PelyoDonnees.restaurant().nom = v; return base({ nom:v }); }
    if (type === 'adresse'){
      D_.resto.adresse = v.numero + ' ' + v.rue + ', ' + [v.codePostal, v.ville].filter(Boolean).join(' ');
      if (!reel) return fin();
      var champs = { adr_numero:v.numero || null, adr_rue:v.rue || null, adr_code_postal:/^\d{5}$/.test(v.codePostal || '') ? v.codePostal : null, adr_ville:v.ville || null };
      var avecPosition = { adr_numero:champs.adr_numero, adr_rue:champs.adr_rue, adr_code_postal:champs.adr_code_postal, adr_ville:champs.adr_ville, latitude:v.lat == null ? null : v.lat, longitude:v.lon == null ? null : v.lon };
      /* Sans la mise à jour « demarrage » de la base, la position est refusée : on garde l'adresse. */
      return PelyoDonnees.majRestaurant(avecPosition, function(e){ if (e) PelyoDonnees.majRestaurant(champs, fin); else fin(); });
    }
    if (type === 'telephone'){ D_.resto.tel = v; routage.numero = v; var t = v.replace(/\s/g, ''); return base({ telephone_public:t, telephone_transfert:t }); }
    if (type === 'horaires'){ semaine = v; return base({ horaires:semaineVersBase() }); }
    if (type === 'livraison'){
      if (!v.ouverte){ if (reel) return PelyoDonnees.reglerService({ livraison_ouverte:false, retrait_ouvert:true }, fin); return fin(); }
      D_.livraison.rayonM = v.rayonM; D_.livraison.rayon = (v.rayonM / 1000).toLocaleString('fr-FR', {maximumFractionDigits:1}) + ' km';
      D_.livraison.minimum = v.minimum; D_.livraison.frais = v.frais;
      if (!reel) return fin();
      return PelyoDonnees.majRestaurant({ livraison_rayon_m:v.rayonM, livraison_minimum_cents:v.minimum, livraison_frais_cents:v.frais }, function(e){
        if (e) return fin(e);
        PelyoDonnees.reglerService({ livraison_ouverte:true }, fin);
      });
    }
    if (type === 'retrait'){
      if (!reel){ D_.charges[0].delai = v; return fin(); }
      return PelyoDonnees.reglerService({ delai_retrait_min:v }, function(e){ if (!e) chargerTableau(); fin(e); });
    }
    if (type === 'carte-exemple'){
      if (!reel) return fin();
      return PelyoDonnees.chargerCarteExemple(function(e){ if (!e) chargerCarteReelle(); fin(e); });
    }
    if (type === 'produits'){
      var l = v.map(function(p){ return { id:null, categorie_id:null, categorie_nom:'Carte', nom:p.nom, prix_cents:p.prix, inclus:'', precisions:'', allergenes:[], consignes:[], groupes:[], supplements:[] }; });
      if (!reel){ l.forEach(appliquerProduitDemo); return fin(); }
      var i = 0;
      (function suivant(e){
        if (e) return fin(e);
        if (i >= l.length){ chargerCarteReelle(); return fin(); }
        PelyoDonnees.enregistrerProduit(l[i++], suivant);
      })();
      return;
    }
    if (type === 'prenom'){
      voix.prenom = v; voix.accueil = 'Bonjour, ' + nomResto() + ', je suis ' + v + ', l’assistant vocal automatisé du restaurant. Que puis-je vous préparer ?';
      return base({ assistant_prenom:v });
    }
    if (type === 'ton'){ voix.ton = v; return base({ assistant_ton:v }); }
    fin();
  }

  /* ------------------------------ éditeur de produit ------------------------------
     Un brouillon dans la feuille ; rien ne change avant « Enregistrer ».
     Démo : la carte d'exemple est modifiée le temps de la session. Compte
     réel : le produit entier part d'un bloc (enregistrer_produit). */
  function listeTexte(t){ return String(t || '').split(/\s*[·,\n]\s*/).map(function(x){ return x.trim(); }).filter(Boolean); }
  function allergenesDe(it){
    if (it.allergenes && it.allergenes.length) return it.allergenes;
    var m = /contient (.+)/i.exec(it.prec || '');
    return m ? m[1].split(/, | et /) : [];
  }
  function brouillonProduit(id){
    var it = null, cat = '';
    D_.menu.forEach(function(c){ c.items.forEach(function(i){ if (i.id === id){ it = i; cat = c.cat; } }); });
    if (!it) return { id:null, cat:(D_.menu[0] || {}).cat || '', nom:'', prix:'', inclus:'', precisions:'', allergenes:'', consignes:'', groupes:[], supplements:[] };
    return {
      id:it.id, cat:cat, nom:it.nom, prix:(it.prix / 100).toFixed(2).replace('.', ','), inclus:it.inclus || '',
      precisions:String(it.prec || '').replace(/\s*·?\s*contient .+$/i, ''), allergenes:allergenesDe(it).join(', '), consignes:listeTexte(it.dem).join(', '),
      groupes:(it.obl || []).map(function(o){ return { nom:o.nom, min:o.min, max:o.max, choix:listeTexte(o.choix).join(', ') }; }),
      supplements:(it.sup || []).map(function(x){ return { nom:x.nom, prix:(x.prix / 100).toFixed(2).replace('.', ',') }; })
    };
  }
  function feuilleProduitEdit(){
    var b = sheet.brouillon, cats = D_.menu.map(function(c){ return c.cat; });
    function champ(lbl, cle, attrs, aide){
      return '<label class="g-pe-champ"><span>' + lbl + '</span><input data-pe="' + cle + '" value="' + esc(b[cle]) + '"' + (attrs || '') + '>' + (aide ? '<small>' + aide + '</small>' : '') + '</label>';
    }
    return '<div class="g-top">' + (b.id ? 'Modifier le produit' : 'Nouveau produit') + '</div><div class="g-body g-pe">' +
      champ('Nom', 'nom', ' maxlength="120" placeholder="Tacos M"') +
      '<div class="g-pe-duo">' + champ('Prix (€)', 'prix', ' inputmode="decimal" placeholder="9,50"') +
        '<label class="g-pe-champ"><span>Catégorie</span><input data-pe="cat" list="g-pe-cats" maxlength="80" value="' + esc(b.cat) + '" placeholder="Tacos"><datalist id="g-pe-cats">' +
        cats.map(function(c){ return '<option value="' + esc(c) + '">'; }).join('') + '</datalist></label></div>' +
      champ('Inclus', 'inclus', ' maxlength="200" placeholder="Frites et une boisson"') +
      '<p class="g-lab">Questions posées par l’assistant</p>' +
      (b.groupes.length ? b.groupes.map(function(g, i){
        return '<div class="g-pe-bloc"><div class="g-pe-duo">' +
          '<label class="g-pe-champ"><span>Question</span><input data-pe-g="' + i + ':nom" maxlength="60" value="' + esc(g.nom) + '" placeholder="Viande"></label>' +
          '<label class="g-pe-champ g-pe-court"><span>Combien</span><span class="g-pe-minmax"><input data-pe-g="' + i + ':min" inputmode="numeric" value="' + esc(g.min) + '" aria-label="Minimum"><i>à</i><input data-pe-g="' + i + ':max" inputmode="numeric" value="' + esc(g.max) + '" aria-label="Maximum"></span></label></div>' +
          '<label class="g-pe-champ"><span>Choix, séparés par des virgules</span><input data-pe-g="' + i + ':choix" value="' + esc(g.choix) + '" placeholder="Poulet, Kebab, Merguez"></label>' +
          '<button class="g-pe-retire" data-pe-retire="g:' + i + '">Retirer cette question</button></div>';
      }).join('') : '<p class="g-note">Aucune question : l’assistant n’en pose pas pour ce produit.</p>') +
      '<button class="g-pe-ajout" data-pe-ajout="groupe">+ Ajouter une question</button>' +
      '<p class="g-lab">Suppléments</p>' +
      (b.supplements.length ? b.supplements.map(function(x, i){
        return '<div class="g-pe-sup"><input data-pe-s="' + i + ':nom" maxlength="80" value="' + esc(x.nom) + '" placeholder="Cheddar" aria-label="Supplément"><span><input data-pe-s="' + i + ':prix" inputmode="decimal" value="' + esc(x.prix) + '" placeholder="1,00" aria-label="Prix du supplément"><em>€</em></span><button data-pe-retire="s:' + i + '" aria-label="Retirer ce supplément">×</button></div>';
      }).join('') : '') +
      '<button class="g-pe-ajout" data-pe-ajout="supplement">+ Ajouter un supplément</button>' +
      '<p class="g-lab">Informations</p>' +
      champ('Allergènes', 'allergenes', ' placeholder="gluten, lait"', 'L’assistant les annonce « selon les informations du restaurant », sans jamais garantir leur absence.') +
      champ('Demandes acceptées', 'consignes', ' placeholder="Sans oignons, sauce à part"') +
      champ('Précisions', 'precisions', ' maxlength="300" placeholder="Halal"') +
    '</div><div class="g-foot"><div class="g-acts">' +
      '<button class="g-act" data-pe-enregistrer>Enregistrer</button>' +
      (b.id ? '<button class="g-act g-off" data-pe-supprimer>Supprimer</button>' : '') +
    '</div></div>';
  }
  function prixSaisi(v){ var n = parseFloat(String(v).replace(',', '.').replace(/\s|€/g, '')); return isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN; }
  /* Brouillon → produit vérifié, ou message d'erreur. */
  function produitDepuisBrouillon(b){
    var nom = b.nom.trim(), prix = prixSaisi(b.prix), cat = b.cat.trim();
    if (!nom) return 'Donnez un nom au produit.';
    if (isNaN(prix) || prix > 1000000) return 'Prix invalide.';
    if (!cat) return 'Choisissez une catégorie.';
    var groupes = [], faute = null;
    b.groupes.forEach(function(g){
      var choix = listeTexte(g.choix), min = parseInt(g.min, 10), max = parseInt(g.max, 10);
      if (!g.nom.trim() && !choix.length) return;
      if (!g.nom.trim()) faute = faute || 'Chaque question a un nom.';
      else if (!choix.length) faute = faute || 'Question « ' + g.nom.trim() + ' » : ajoutez des choix.';
      else if (!(min >= 0) || !(max >= 1) || max < min || max > choix.length) faute = faute || 'Question « ' + g.nom.trim() + ' » : entre ' + (isNaN(min) ? '?' : min) + ' et ' + (isNaN(max) ? '?' : max) + ' choix sur ' + choix.length + ', ce n’est pas possible.';
      groupes.push({ nom:g.nom.trim(), min:min, max:max, choix:choix });
    });
    var sups = [];
    b.supplements.forEach(function(x){
      if (!x.nom.trim()) return;
      var p = x.prix === '' ? 0 : prixSaisi(x.prix);
      if (isNaN(p) || p > 100000) faute = faute || 'Supplément « ' + x.nom.trim() + ' » : prix invalide.';
      sups.push({ nom:x.nom.trim(), prix_cents:p });
    });
    if (faute) return faute;
    var catId = null;
    D_.menu.forEach(function(c){ if (c.cat.toLowerCase() === cat.toLowerCase() && c.id) catId = c.id; });
    return { id:b.id, categorie_id:reel ? catId : null, categorie_nom:cat, nom:nom, prix_cents:prix, inclus:b.inclus.trim(), precisions:b.precisions.trim(),
      allergenes:listeTexte(b.allergenes), consignes:listeTexte(b.consignes), groupes:groupes, supplements:sups };
  }
  /* Démo : on applique le produit à la carte d'exemple. */
  function appliquerProduitDemo(p){
    var it = null;
    D_.menu.forEach(function(c){ c.items = c.items.filter(function(i){ if (i.id === p.id){ it = i; return false; } return true; }); });
    var cat = D_.menu.filter(function(c){ return c.cat.toLowerCase() === p.categorie_nom.toLowerCase(); })[0];
    if (!cat){ cat = { cat:p.categorie_nom, items:[] }; D_.menu.push(cat); }
    it = it || { id:'demo-' + Date.now(), dispo:true, pop:false };
    it.nom = p.nom; it.prix = p.prix_cents; it.inclus = p.inclus;
    it.prec = [p.precisions, p.allergenes.length ? 'contient ' + p.allergenes.join(', ') : ''].filter(Boolean).join(' · ');
    it.allergenes = p.allergenes; it.dem = p.consignes.join(' · ');
    it.obl = p.groupes.map(function(g){ return { nom:g.nom, min:g.min, max:g.max, choix:g.choix.join(' · ') }; });
    it.sup = p.supplements.map(function(x, i){ return { id:it.id + ':s' + i, nom:x.nom, prix:x.prix_cents, dispo:true }; });
    cat.items.push(it);
    D_.menu = D_.menu.filter(function(c){ return c.items.length; });
  }

  /* ---------------------------- import de carte ---------------------------- */
  /* Photos ou PDF de la carte (et/ou texte collé) → l'IA prépare un brouillon
     (fonction « import-carte ») → le gérant coche, corrige les noms et les
     prix → chaque produit est enregistré comme avec l'éditeur. En démo, la
     lecture est simulée avec une carte d'exemple toujours identique. */
  var IMPORT_DEMO = { remarques:'Démo : la lecture est simulée, cette carte d’exemple est toujours la même.', categories:[
    { nom:'Tacos', produits:[
      { nom:'Tacos M', prix_cents:750, inclus:'Frites', precisions:'1 viande', allergenes:['gluten', 'lait'], doute:'',
        groupes:[{ nom:'Viande', min:1, max:1, choix:['Poulet', 'Kebab', 'Cordon bleu', 'Merguez'] }, { nom:'Sauce', min:0, max:2, choix:['Blanche', 'Algérienne', 'Samouraï', 'Biggy'] }],
        supplements:[{ nom:'Cheddar', prix_cents:100 }, { nom:'En menu (boisson 33 cl)', prix_cents:150 }] },
      { nom:'Tacos L', prix_cents:950, inclus:'Frites', precisions:'2 viandes', allergenes:['gluten', 'lait'], doute:'',
        groupes:[{ nom:'Viandes', min:2, max:2, choix:['Poulet', 'Kebab', 'Cordon bleu', 'Merguez'] }, { nom:'Sauce', min:0, max:2, choix:['Blanche', 'Algérienne', 'Samouraï', 'Biggy'] }],
        supplements:[{ nom:'Cheddar', prix_cents:100 }, { nom:'En menu (boisson 33 cl)', prix_cents:150 }] },
      { nom:'Tacos XL', prix_cents:null, inclus:'Frites', precisions:'3 viandes', allergenes:[], doute:'Prix illisible sur la photo.',
        groupes:[{ nom:'Viandes', min:3, max:3, choix:['Poulet', 'Kebab', 'Cordon bleu', 'Merguez'] }], supplements:[] }
    ]},
    { nom:'Burgers', produits:[
      { nom:'Cheese burger', prix_cents:550, inclus:'', precisions:'', allergenes:[], doute:'', groupes:[], supplements:[{ nom:'En menu (frites + boisson)', prix_cents:300 }] },
      { nom:'Double chicken', prix_cents:790, inclus:'', precisions:'Halal', allergenes:[], doute:'', groupes:[], supplements:[{ nom:'En menu (frites + boisson)', prix_cents:300 }] }
    ]},
    { nom:'Boissons', produits:[
      { nom:'Coca-Cola 33 cl', prix_cents:200, inclus:'', precisions:'', allergenes:[], doute:'', groupes:[], supplements:[] },
      { nom:'Oasis tropical 33 cl', prix_cents:200, inclus:'', precisions:'', allergenes:[], doute:'', groupes:[], supplements:[] },
      { nom:'Eau 50 cl', prix_cents:150, inclus:'', precisions:'', allergenes:[], doute:'', groupes:[], supplements:[] }
    ]}
  ]};

  function prixTexte(c){ return c === null || c === undefined ? '' : (c / 100).toFixed(2).replace('.', ','); }
  function dejaSurCarte(nom){
    var n = nom.trim().toLowerCase(), oui = false;
    D_.menu.forEach(function(c){ c.items.forEach(function(i){ if (i.nom.toLowerCase() === n) oui = true; }); });
    return oui;
  }
  /* Le brouillon de l'IA → lignes modifiables, cochées sauf doublons et prix absents. */
  function preparerRevue(carte){
    sheet.carte = carte; sheet.lignes = [];
    carte.categories.forEach(function(c, ci){
      c.produits.forEach(function(p, pi){
        var deja = dejaSurCarte(p.nom);
        sheet.lignes.push({ ci:ci, pi:pi, cat:c.nom, nom:p.nom, prix:prixTexte(p.prix_cents), deja:deja,
          coche:!deja && p.prix_cents !== null, doute:p.doute || '' });
      });
    });
    sheet.etape = sheet.lignes.length ? 'revue' : 'vide';
  }
  function resumeLu(p){
    var bouts = (p.groupes || []).map(function(g){ return g.nom + ' (' + (g.min === g.max ? g.max : g.min + ' à ' + g.max) + ')'; });
    if (p.supplements && p.supplements.length) bouts.push(p.supplements.length + ' supplément' + (p.supplements.length > 1 ? 's' : ''));
    if (p.inclus) bouts.push('avec ' + p.inclus.toLowerCase());
    return bouts.join(' · ');
  }
  function cochees(){ return (sheet.lignes || []).filter(function(l){ return l.coche; }); }

  function feuilleImport(){
    var e = sheet.etape;
    if (e === 'lecture' || e === 'ajout'){
      var pc = e === 'ajout' ? Math.round(sheet.fait / Math.max(sheet.total, 1) * 100) : null;
      return '<div class="g-top">Importer une carte</div><div class="g-body g-mid-v">' +
        '<div class="g-figure g-pulse">' + (pc === null ? '…' : pc + '<small>%</small>') + '</div>' +
        '<p class="g-note">' + (e === 'lecture'
          ? 'L’IA lit votre carte. Comptez 20 à 60 secondes selon le nombre de pages.'
          : 'Ajout des produits : ' + sheet.fait + ' sur ' + sheet.total + '.') + '</p>' +
      '</div><div class="g-foot"><div class="g-acts">' +
        (e === 'lecture' ? '<button class="g-act g-off" data-fermer>Annuler</button>' : '') +
      '</div></div>';
    }
    if (e === 'revue'){
      var n = cochees().length, cat = null, html = '';
      sheet.lignes.forEach(function(l, i){
        if (l.cat !== cat){ cat = l.cat; html += '<p class="g-lab">' + esc(cat) + '</p>'; }
        var p = sheet.carte.categories[l.ci].produits[l.pi], resume = resumeLu(p);
        html += '<div class="g-imp-ligne' + (l.coche ? '' : ' g-imp-off') + '">' +
          '<input type="checkbox" data-imp-coche="' + i + '"' + (l.coche ? ' checked' : '') + ' aria-label="Ajouter ' + esc(l.nom) + '">' +
          '<div class="g-imp-txt"><input data-imp-nom="' + i + '" maxlength="120" value="' + esc(l.nom) + '" aria-label="Nom du produit">' +
            (resume ? '<small>' + esc(resume) + '</small>' : '') +
            (l.deja ? '<em>Déjà sur votre carte</em>' : '') + (l.doute ? '<em>À vérifier : ' + esc(l.doute) + '</em>' : '') + '</div>' +
          '<span class="g-imp-prix"><input data-imp-prix="' + i + '" inputmode="decimal" value="' + esc(l.prix) + '" placeholder="?" aria-label="Prix de ' + esc(l.nom) + '"><i>€</i></span>' +
        '</div>';
      });
      return '<div class="g-top">Vérifiez la carte lue</div><div class="g-body g-pe g-imp">' +
        '<p class="g-note">' + sheet.lignes.length + ' produit' + (sheet.lignes.length > 1 ? 's' : '') + ' trouvé' + (sheet.lignes.length > 1 ? 's' : '') +
          '. Corrigez un nom ou un prix en le touchant, décochez ce qui ne doit pas être ajouté. Choix et suppléments se modifient ensuite dans la carte.</p>' +
        (sheet.carte.remarques ? '<p class="g-insight">' + esc(sheet.carte.remarques) + '</p>' : '') +
        html + '</div>' +
        '<div class="g-foot"><div class="g-acts">' +
          '<button class="g-act" data-imp-ajouter' + (n ? '' : ' disabled') + '>' + (n ? 'Ajouter ' + n + ' produit' + (n > 1 ? 's' : '') : 'Aucun produit coché') + '</button>' +
          '<button class="g-act g-off" data-imp-recommencer>Recommencer</button>' +
        '</div></div>';
    }
    if (e === 'vide'){
      return '<div class="g-top">Importer une carte</div><div class="g-body g-mid-v">' +
        '<p class="g-note">Aucun produit trouvé. ' + esc((sheet.carte && sheet.carte.remarques) || 'Essayez une photo plus nette, prise de face, une page à la fois.') + '</p>' +
      '</div><div class="g-foot"><div class="g-acts"><button class="g-act" data-imp-recommencer>Réessayer</button></div></div>';
    }
    /* Étape 1 : choisir les pages. */
    var fichiers = sheet.fichiers || [];
    return '<div class="g-top">Importer une carte</div><div class="g-body g-pe g-imp">' +
      '<p class="g-note">Prenez votre carte en photo, une photo par page, ou choisissez un PDF. L’IA prépare les produits et les prix ; vous vérifiez tout avant l’ajout.</p>' +
      '<label class="g-imp-depot"><input type="file" accept="image/*,application/pdf" multiple data-imp-fichier>' +
        '<span aria-hidden="true">↥</span><b>Photo ou PDF</b><small>6 pages au plus</small></label>' +
      (fichiers.length ? '<div class="g-imp-pages">' + fichiers.map(function(f, i){
        return '<div class="g-pe-sup"><span>' + (f.type === 'application/pdf' ? 'PDF' : 'Photo') + ' · ' + esc(f.nom) + '</span><span></span>' +
          '<button data-imp-retire="' + i + '" aria-label="Retirer ' + esc(f.nom) + '">×</button></div>';
      }).join('') + '</div>' : '') +
      '<label class="g-pe-champ"><span>Ou collez le texte de votre carte</span><textarea data-imp-texte rows="4" maxlength="20000" placeholder="Tacos M 7,50 € · Tacos L 9,50 €…">' + esc(sheet.texte || '') + '</textarea></label>' +
      (sheet.erreur ? '<p class="g-imp-erreur" role="alert">' + esc(sheet.erreur) + '</p>' : '') +
    '</div><div class="g-foot"><div class="g-acts">' +
      '<button class="g-act" data-imp-lire' + (fichiers.length || (sheet.texte || '').trim() ? '' : ' disabled') + '>Lire la carte</button>' +
      '<button class="g-act g-off" data-fermer>Annuler</button>' +
    '</div></div>';
  }

  /* Une photo est réduite (1568 px, JPEG) avant l'envoi : plus rapide, et
     c'est la taille que l'IA lit le mieux. Un PDF part tel quel. */
  function lireFichierCarte(f, cb){
    if (f.type === 'application/pdf'){
      if (f.size > 4500000) return cb('« ' + f.name + ' » dépasse 4,5 Mo.');
      var r = new FileReader();
      r.onload = function(){ cb(null, { nom:f.name, type:f.type, donnees:String(r.result).split(',')[1] }); };
      r.onerror = function(){ cb('« ' + f.name + ' » est illisible.'); };
      return r.readAsDataURL(f);
    }
    if (!/^image\//.test(f.type)) return cb('« ' + f.name + ' » : photo ou PDF seulement.');
    var url = URL.createObjectURL(f), img = new Image();
    img.onload = function(){
      var k = Math.min(1, 1568 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      cb(null, { nom:f.name, type:'image/jpeg', donnees:c.toDataURL('image/jpeg', 0.85).split(',')[1] });
    };
    img.onerror = function(){ URL.revokeObjectURL(url); cb('« ' + f.name + ' » : image illisible. Essayez une capture d’écran ou un JPEG.'); };
    img.src = url;
  }
  function ajouterFichiersCarte(liste){
    var s = sheet, restants = Array.prototype.slice.call(liste, 0, Math.max(0, 6 - (s.fichiers || []).length));
    if (liste.length > restants.length) s.erreur = '6 pages au plus par import.';
    (function suivant(){
      if (sheet !== s) return;
      var f = restants.shift();
      if (!f) return peindre();
      lireFichierCarte(f, function(e, x){
        if (e) s.erreur = e; else { s.fichiers.push(x); s.erreur = null; }
        suivant();
      });
    })();
  }
  function lireCarteImport(){
    var s = sheet;
    s.etape = 'lecture'; s.erreur = null; peindre();
    function fin(e, carte){
      if (sheet !== s) return;
      if (e){ s.etape = 'choisir'; s.erreur = e; peindre(); return; }
      preparerRevue(carte); peindre();
    }
    if (!reel) return setTimeout(function(){ fin(null, JSON.parse(JSON.stringify(IMPORT_DEMO))); }, 2200);
    PelyoDonnees.importerCarte({ fichiers:s.fichiers.map(function(f){ return { type:f.type, donnees:f.donnees }; }), texte:s.texte || '' }, fin);
  }
  /* Produit lu + corrections du gérant → produit pour enregistrer_produit. */
  function produitImporte(l){
    var p = sheet.carte.categories[l.ci].produits[l.pi], prix = prixSaisi(l.prix);
    if (!l.nom.trim()) return 'Un produit coché n’a pas de nom.';
    if (isNaN(prix) || l.prix === '' || prix > 1000000) return '« ' + l.nom.trim() + ' » : indiquez un prix.';
    return { id:null, categorie_id:null, categorie_nom:l.cat, nom:l.nom.trim(), prix_cents:prix, inclus:p.inclus || '', precisions:p.precisions || '',
      allergenes:p.allergenes || [], consignes:[], groupes:p.groupes || [], supplements:p.supplements || [] };
  }
  function ajouterCarteImport(){
    var s = sheet, produits = [];
    for (var i = 0; i < s.lignes.length; i++){
      if (!s.lignes[i].coche) continue;
      var x = produitImporte(s.lignes[i]);
      if (typeof x === 'string'){ api.toast(x); return; }
      produits.push(x);
    }
    if (!produits.length) return;
    s.etape = 'ajout'; s.fait = 0; s.total = produits.length; s.echecs = [];
    peindre();
    function termine(){
      var ok = s.total - s.echecs.length;
      if (sheet === s) sheet = null;
      api.toast(ok + ' produit' + (ok > 1 ? 's' : '') + ' ajouté' + (ok > 1 ? 's' : '') + '. L’assistant les proposera dès le prochain appel.' +
        (s.echecs.length ? ' Non ajouté' + (s.echecs.length > 1 ? 's' : '') + ' : ' + s.echecs.join(', ') + '.' : ''));
      if (reel) chargerCarteReelle();
      ecran = 'carte'; peindre();
    }
    if (!reel){ produits.forEach(appliquerProduitDemo); s.fait = s.total; return setTimeout(termine, 500); }
    (function suivant(){
      var p = produits[s.fait];
      if (!p) return termine();
      PelyoDonnees.enregistrerProduit(p, function(e){
        if (e) s.echecs.push(p.nom);
        s.fait++;
        if (sheet === s) peindre();
        suivant();
      });
    })();
  }


  /* ------------------------------- assistant ------------------------------- */
  function vueAssistant(){
    return titre('Votre assistant','L’assistant.') +
      '<section class="g-voice"><div class="g-voice-orb" aria-hidden="true"><i></i><i></i><span><img src="assets/logo-toque.png" width="40" height="40" alt=""></span></div><div class="g-voice-copy"><span class="g-lab">Votre accueil téléphonique</span><h2>' + esc(voix.prenom) + '</h2><p>« ' + esc(voix.accueil) + ' »</p><button class="g-act g-off" data-test>Écouter une simulation <span aria-hidden="true">↗</span></button></div></section>' +
      '<div class="g-section-title"><h2>Personnalité</h2></div>' +
      lien('data-prenom','Prénom de l’assistant',voix.prenom) +
      lien('data-sheet="voix"','Ton et vitesse',voix.ton + ' · ' + voix.vitesse) +
      lien('data-signature','Ma voix signature','Texte guidé et autorisation d’utilisation') +
      '<div class="g-section-title"><h2>Au téléphone</h2></div>' +
      lien('data-sheet="routage"','Gestion des appels', routage.mode === 'ia' ? 'IA active · Pelyo répond' : routage.mode === 'restaurant' ? 'Transfert vers le restaurant' : 'Mode automatique · selon vos règles') +
      lien('data-sheet="parcours"','Confirmation et sécurité','Récapitulatif, validation, allergies et transfert') +
      lien('data-sheet="langues"','Langues',langues.join(' · ')) +
      '<p class="g-note">L’assistant annonce son caractère automatisé. Les changements sont destinés aux prochains appels.</p>';
  }

  function feuilleVoix(){
    return '<div class="g-top">Ton et vitesse</div><div class="g-body"><h2>Comment parle ' + esc(voix.prenom) + ' ?</h2><p class="g-lab">Le ton</p><div class="g-options">' +
      D_.tons.map(function(t){return '<button data-ton="' + esc(t) + '" aria-pressed="' + (voix.ton===t) + '">' + esc(t) + '</button>';}).join('') +
      '</div><p class="g-lab">Le rythme</p><div class="g-options">' +
      D_.vitesses.map(function(v){return '<button data-vitesse="' + esc(v) + '" aria-pressed="' + (voix.vitesse===v) + '">' + esc(v) + '</button>';}).join('') +
      '</div><p class="g-note">' + (reel ? 'Enregistré pour les prochains appels.' : 'Choix conservés pendant cette session de démonstration. Aucun moteur vocal connecté.') + '</p></div>';
  }

  function feuilleSignature(){
    return '<div class="g-top">Voix signature</div>' +
      '<div class="g-body g-mid-v">' +
        '<div class="g-figure">1<small>min</small></div>' +
        '<p class="g-note" style="margin-top:8px">Parcours prévu : lire un texte guidé d’une minute pour personnaliser la voix. Ici, aucun microphone ni clonage vocal connecté.</p>' +
        '<p class="g-note g-cu" style="margin-top:22px">' +
          (sheet.consent ? "Consentement donné." : "Vous devez confirmer posséder cette voix et en autoriser l'usage.") + '</p>' +
      '</div>' +
      '<div class="g-foot"><div class="g-acts">' +
        '<button class="g-act" data-consent>' + (sheet.consent ? "Simuler l’enregistrement" : "Je confirme") + '</button>' +
        '<button class="g-act g-off" data-fermer>Fermer</button>' +
      '</div></div>';
  }

  function feuillePrenom(){
    return '<div class="g-top">Prénom de l\'assistant</div>' +
      '<div class="g-body g-mid-v">' +
        '<label class="g-lab" for="g-prenom">Prénom annoncé</label><input class="g-input" id="g-prenom" value="' + esc(voix.prenom) + '" maxlength="14">' +
        '<p class="g-note" style="margin-top:26px">C\'est le prénom que le client entend au décrochage.</p>' +
        '<p class="g-note g-cu" style="margin-top:18px">« Bonsoir, ' +
          '<span data-apercu>' + esc(voix.prenom) + '</span>, assistant vocal automatisé du Comptoir. »</p>' +
      '</div>' +
      '<div class="g-foot"><div class="g-acts">' +
        '<button class="g-act" data-prenom-ok>Enregistrer</button>' +
        '<button class="g-act g-off" data-fermer>Annuler</button>' +
      '</div></div>';
  }

  /* -------------------------------- réglages -------------------------------- */
  /* --------------------------------- gestion --------------------------------- */
  var ICONES_GX = {
    rythme:'M4 15a8 8 0 1 1 16 0M12 15l4-5', appels:'M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
    horaires:'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0', livraison:'M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4M17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
    cuisine:'M6 3h12v18H6zM11 18h2', notifs:'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0', caisse:'M4 10h16v10H4zM7 10V5h10v5M8 14h2M12 14h4', abo:'M3 6h18v12H3zM3 10h18M7 15h3',
    aide:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01', donnees:'M12 4v11m-4-4 4 4 4-4M5 20h14',
    rgpd:'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z', mentions:'M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5',
    paiement:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M15 9a3.5 3.5 0 1 0 0 6M8 11h5M8 13h5',
    securite:'M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3M12 15v2',
    livreurs:'M6 17a2.5 2.5 0 1 0 0 .01M18 17a2.5 2.5 0 1 0 0 .01M8.5 17h7M15 6h3l2 8M6 14.5 9 10h5l2 4.5',
    balance:'M4 20h16M6 20l1.5-9h9L18 20M9 11V8a3 3 0 0 1 6 0v3M12 15v2'
  };
  function iconeGx(id){ return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + ICONES_GX[id] + '"/></svg>'; }

  /* Horaires du jour (données d'exemple) : « Ouvert jusqu'à 23 h », « Ouvre à 18 h »… */
  function horaireDuJour(){ return texteCreneaux(semaine[new Date().getDay()]); }
  function heureLisible(m){ m = m % 1440; return Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60 < 10 ? '0' : '') + (m % 60) : ''); }
  function statutOuverture(){
    var d = new Date(), m = d.getHours() * 60 + d.getMinutes(), re = /(\d\d)h(\d\d)–(\d\d)h(\d\d)/g, x, prochain = null;
    while ((x = re.exec(horaireDuJour()))){
      var a = +x[1] * 60 + +x[2], b = +x[3] * 60 + +x[4];
      if (b <= a) b += 1440;
      if (m >= a && m < b) return {ouvert:true, t:'Ouvert jusqu’à ' + heureLisible(b)};
      if (a > m && prochain === null) prochain = a;
    }
    return {ouvert:false, t:prochain !== null ? 'Ouvre à ' + heureLisible(prochain) : 'Fermé pour aujourd’hui'};
  }

  function ligneGx(attr, ico, ton, titre, valeur, badge){
    return '<button class="g-gx-ligne" ' + attr + ' data-cherche="' + esc(api.norm(titre + ' ' + valeur)) + '">' +
      '<span class="g-gx-ico g-gx-' + ton + '">' + iconeGx(ico) + '</span>' +
      '<span class="g-gx-txt"><b>' + esc(titre) + '</b><small>' + esc(valeur) + '</small></span>' +
      (badge ? '<em class="g-gx-badge">' + esc(badge) + '</em>' : '') +
      '<span class="g-gx-chev" aria-hidden="true">›</span></button>';
  }
  function groupeGx(titre, lignes){ return '<section class="g-gx-groupe"><h2>' + esc(titre) + '</h2><div class="g-gx-liste">' + lignes + '</div></section>'; }

  function vueReglages(){
    var f = leForfait(), pct = f.minutes ? Math.round(D_.resto.minutes / f.minutes * 100) : null;
    var iaOn = routage.mode !== 'restaurant', st = statutOuverture(), lv = niveau(), liv = D_.livraison;
    var demandes = cuisineAccess.demandes.length, demandesLv = reel ? 0 : registreLv().demandes.length;
    return titre('Votre compte', 'La gestion.') +
      /* fiche du restaurant */
      '<section class="g-gx-profil">' +
        '<span class="g-gx-avatar"><img src="assets/logo-toque.png" alt="" width="44" height="44"></span>' +
        '<div class="g-gx-id"><h2>' + esc(nomResto()) + '</h2><p>' + (reel && !D_.resto.adresse ? 'Adresse à compléter avec l’équipe Pelyo.' : esc(D_.resto.adresse) + (D_.resto.tel ? ' · ' + esc(reel ? telLisible(D_.resto.tel) : D_.resto.tel) : '')) + '</p></div>' +
        '<div class="g-gx-puces"><button class="g-gx-puce g-gx-puce-plan" data-sheet="abo">Forfait ' + esc(f.nom) + ' ›</button>' +
          '<span class="g-gx-puce' + (st.ouvert ? ' g-gx-puce-ok' : '') + '"><i aria-hidden="true"></i>' + esc(st.t) + '</span></div>' +
      '</section>' +
      /* commandes rapides */
      '<div class="g-gx-rapides">' +
        '<button class="g-gx-rapide" role="switch" aria-checked="' + iaOn + '" data-ia><span class="g-gx-r-tete"><b>Assistant IA</b><i class="g-gx-sw" aria-hidden="true"></i></span><small>' + (iaOn ? esc(voix.prenom) + ' répond aux appels' : 'En veille · appels au restaurant') + '</small></button>' +
        '<button class="g-gx-rapide" role="switch" aria-checked="' + ouvert + '" data-arret><span class="g-gx-r-tete"><b>Commandes</b><i class="g-gx-sw" aria-hidden="true"></i></span><small>' + (ouvert ? 'Ouvertes · ' + lv.delai + ' min annoncées' : 'En pause · reprise ' + esc(reprise || 'à préciser')) + '</small></button>' +
        '<div class="g-gx-rapide g-gx-theme"><b>Apparence</b><div class="g-theme-choices" role="group" aria-label="Choix de l’apparence"><button data-theme="light" aria-pressed="' + (theme === 'light') + '">Clair</button><button data-theme="dark" aria-pressed="' + (theme === 'dark') + '">Sombre</button></div></div>' +
      '</div>' +
      /* recherche */
      '<div class="g-gx-recherche" role="search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>' +
        '<label class="g-visually-hidden" for="g-gx-recherche">Rechercher un réglage</label><input id="g-gx-recherche" type="search" autocomplete="off" placeholder="Rechercher un réglage…"></div>' +
      '<div class="g-gx-groupes">' +
        groupeGx('Service',
          ligneGx('data-sheet="renvoi"', 'appels', 'orange', 'Renvoi des appels vers Pelyo', numeroAffiche() ? 'Numéro Pelyo ' + numeroAffiche() : 'Numéro en préparation') +
          ligneGx('data-sheet="service"', 'rythme', 'orange', 'Rythme du service', ouvert ? lv.nom + ' · ' + lv.delai + ' min annoncées' : 'Commandes en pause · reprise ' + (reprise || 'à préciser')) +
          ligneGx('data-sheet="horaires"', 'horaires', 'orange', 'Horaires et fermetures', 'Aujourd’hui ' + horaireDuJour()) +
          ligneGx('data-sheet="livraison"', 'livraison', 'orange', 'Retrait et livraison', liv.rayon + ' · minimum ' + api.eur0(liv.minimum) + ' · frais ' + api.eur(liv.frais))) +
        groupeGx('Équipe et matériel',
          ligneGx('data-sheet="acces-cuisine"', 'cuisine', 'vert', 'Accès de l’équipe cuisine', cuisineAccess.devices.length + ' appareil(s) autorisé(s)', demandes ? demandes + ' demande' + (demandes > 1 ? 's' : '') : '') +
          ligneGx('data-sheet="livreurs"', 'livreurs', 'vert', 'Livreurs', livreursResume(), demandesLv ? demandesLv + ' demande' + (demandesLv > 1 ? 's' : '') : '') +
          ligneGx('data-sheet="balance"', 'balance', 'vert', 'Balance de portions', balanceResume()) +
          ligneGx('data-sheet="caisse"', 'caisse', 'vert', 'Caisse et connexions', 'Aucune caisse connectée')) +
        groupeGx('Mon compte',
          ligneGx('data-sheet="notifs"', 'notifs', 'brun', 'Notifications', resumeNotifs()) +
          ligneGx('data-sheet="abo"', 'abo', 'brun', 'Abonnement', f.nom + ' · ' + D_.resto.minutes + (f.minutes ? ' / ' + f.minutes : '') + ' min ce mois', pct === null ? '' : pct + ' %') +
          ligneGx('data-sheet="securite"', 'securite', 'brun', 'Connexion et sécurité', 'Mot de passe · appareils connectés') +
          ligneGx('data-sheet="donnees"', 'donnees', 'brun', 'Mes données et fin d’abonnement', 'Export sécurisé · 30 jours en lecture seule')) +
        groupeGx('Aide et informations',
          ligneGx('data-demarrage', 'aide', 'sable', 'Mise en route', 'Visite de l’appli et réglages guidés') +
          ligneGx('data-aide', 'aide', 'sable', 'Centre d’aide', 'L’assistant Pelyo répond en direct') +
          ligneGx('data-sheet="rgpd"', 'rgpd', 'sable', 'Annonce IA et données', 'Information des clients et confidentialité') +
          ligneGx('data-sheet="mentions"', 'mentions', 'sable', 'Mentions légales', 'Projet de la future version officielle') +
          ligneGx('data-sheet="paiement"', 'paiement', 'sable', 'Qui encaisse les commandes ?', 'Le restaurant, jamais Pelyo')) +
      '</div>' +
      '<p class="g-empty g-gx-vide" hidden>Aucun réglage ne correspond.</p>' +
      (reel ? '' : '<p class="g-note">Compte démo : les choix ne modifient aucun compte réel et sont réinitialisés à la réouverture.</p>');
  }

  function feuilleAccesCuisine(){
    var demandes = cuisineAccess.demandes.length ?
      '<div><p class="g-lab">Demandes à valider</p><div class="g-list">' + cuisineAccess.demandes.map(function(x){
        return '<div class="g-row"><span class="g-k">' + esc(x.nom) + '<span class="g-s">' + esc(x.info) + '</span></span><span class="g-device-actions"><button data-device-approve="' + esc(x.id) + '">Autoriser</button><button data-device-refuse="' + esc(x.id) + '">Refuser</button></span></div>';
      }).join('') + '</div></div>' : '<p class="g-note">Aucune nouvelle demande de connexion.</p>';
    var permissions = [
      {id:'modifier', nom:'Modifier une commande', aide:'Après accord du client, avec historique'},
      {id:'annuler', nom:'Annuler une commande', aide:'Motif obligatoire'},
      {id:'adresse', nom:'Corriger une adresse', aide:'Vérification avec le client'},
      {id:'ruptures', nom:'Gérer les ruptures', aide:'Produits, suppléments et ingrédients'},
      {id:'rush', nom:'Modifier le niveau de rush', aide:'Pour les prochains appels'},
      {id:'pause', nom:'Suspendre les commandes', aide:'Sans arrêter les renseignements'}
    ];
    return '<div class="g-top">Accès de l’équipe cuisine</div><div class="g-body">' +
      '<p class="g-note">Le code du restaurant reste valable. Un nouvel appareil ne peut toutefois accéder à la cuisine qu’après votre autorisation explicite.</p>' +
      '<div class="g-kitchen-code"><span>Code cuisine permanent</span><strong>' + (cuisineAccess.codeVisible ? esc(cuisineAccess.code) : '•••• ••••') + '</strong><button data-code-show>' + (cuisineAccess.codeVisible ? 'Masquer' : 'Afficher') + '</button>' + (reel ? '<button data-code-renew>Code divulgué ? En tirer un nouveau</button>' : '') + '</div>' +
      demandes +
      '<div><p class="g-lab">Appareils autorisés</p><div class="g-list">' + cuisineAccess.devices.map(function(x){
        return '<div class="g-row"><span class="g-k">' + esc(x.nom) + '<span class="g-s">' + esc(x.info) + '</span></span><button data-device-revoke="' + esc(x.id) + '">Révoquer</button></div>';
      }).join('') + '</div></div>' +
      '<div><p class="g-lab">Ce que la cuisine peut faire</p><div class="g-permissions">' + permissions.map(function(x){
        return '<button data-toggle-perm="' + x.id + '" aria-pressed="' + cuisineAccess.permissions[x.id] + '"><span><b>' + esc(x.nom) + '</b><small>' + esc(x.aide) + '</small></span><em>' + (cuisineAccess.permissions[x.id] ? 'Autorisé' : 'Validation gérant') + '</em></button>';
      }).join('') + '</div></div>' +
      '<p class="g-note">Le compte cuisine est partagé. Le journal identifie l’appareil et l’heure de l’action, pas l’employé. Les prix libres et les réglages sensibles restent réservés au gérant.</p>' +
      '</div>';
  }

  function feuilleOrganisation(type){
    var html = '';
    if (type === 'horaires'){
      var ordre = [1, 2, 3, 4, 5, 6, 0];
      html = '<h2>La semaine</h2><p class="g-note">Deux créneaux par jour au plus. Laissez vide pour un jour fermé ; une fin après minuit (01:00) est acceptée.</p>' +
        '<div class="g-org-semaine">' + ordre.map(function(jr){
          var cr = semaine[jr];
          function champ(k, cle){ var v = cr[k] ? cr[k][cle] : ''; return '<input type="text" inputmode="numeric" maxlength="5" placeholder="--:--" autocomplete="off" data-h="' + jr + '-' + k + '-' + cle + '" value="' + esc(v) + '" aria-label="' + JOURS_LONGS[jr] + ', créneau ' + (k + 1) + ', ' + (cle === 'debut' ? 'ouverture' : 'fermeture') + '">'; }
          return '<div class="g-org-jour"><b>' + JOURS_LONGS[jr] + '</b>' +
            '<span>' + champ(0, 'debut') + '<i>–</i>' + champ(0, 'fin') + '</span>' +
            '<span>' + champ(1, 'debut') + '<i>–</i>' + champ(1, 'fin') + '</span></div>';
        }).join('') + '</div>' +
        (D_.exceptions.length ? '<h2>Les exceptions</h2><dl class="g-facts">' + D_.exceptions.map(function(x){ return '<dt>' + esc(x.d) + '</dt><dd>' + esc(x.r) + '</dd>'; }).join('') + '</dl>' : '');
    } else {
      var lv = D_.livraison, km = lv.rayonM ? lv.rayonM / 1000 : parseFloat(String(lv.rayon).replace(',', '.')) || '';
      html = '<h2>La zone de livraison</h2><div class="g-org-champs">' +
        '<label>Rayon de livraison<span><input type="number" min="0.5" max="30" step="0.5" inputmode="decimal" data-lv="rayon" value="' + esc(km) + '"><em>km</em></span></label>' +
        '<label>Minimum de commande<span><input type="number" min="0" max="1000" step="0.5" inputmode="decimal" data-lv="minimum" value="' + (lv.minimum / 100) + '"><em>€</em></span></label>' +
        '<label>Frais de livraison<span><input type="number" min="0" max="100" step="0.5" inputmode="decimal" data-lv="frais" value="' + (lv.frais / 100) + '"><em>€</em></span></label>' +
        '</div><dl class="g-facts"><dt>Paiement</dt><dd>' + esc(lv.paiement) + '</dd><dt>Délai de livraison annoncé</dt><dd>' + lv.delai + ' min · réglé dans Rythme</dd></dl>';
    }
    return '<div class="g-top">' + (type === 'horaires' ? 'Horaires et fermetures' : 'Retrait et livraison') + '</div><div class="g-body">' + html +
      '<p class="g-note">' + (reel ? 'L’assistant utilise ces réglages dès le prochain appel.' : 'Compte démo : les changements ne durent que jusqu’à la fermeture de l’appli.') + '</p></div>' +
      '<div class="g-foot"><div class="g-acts"><button class="g-act" data-org-enregistrer="' + type + '">Enregistrer</button></div></div>';
  }
  /* « 9h », « 18h30 », « 1130 » → « 09:00 », « 18:30 », « 11:30 » ; sinon null. */
  function heureSaisie(v){
    var m = /^(\d{1,2})\s*(?:[:hH.]\s*(\d{1,2})?|(\d{2}))?$/.exec(String(v).trim()), x;
    if (!m) return null;
    x = m[2] || m[3] || '';
    var h = +m[1], mn = x ? +x : 0;
    if (x.length === 1) mn = mn * 10;
    if (h > 23 || mn > 59) return null;
    return (h < 10 ? '0' : '') + h + ':' + (mn < 10 ? '0' : '') + mn;
  }
  /* Lit le formulaire Horaires ou Livraison ; renvoie un message d'erreur ou null. */
  function enregistrerOrganisation(type){
    if (type === 'horaires'){
      var sem = [[], [], [], [], [], [], []], faute = null;
      for (var jr = 0; jr < 7; jr++) for (var k = 0; k < 2; k++){
        var de = (root.querySelector('[data-h="' + jr + '-' + k + '-debut"]') || {}).value || '', a = (root.querySelector('[data-h="' + jr + '-' + k + '-fin"]') || {}).value || '';
        if (!de && !a) continue;
        de = heureSaisie(de); a = heureSaisie(a);
        if (!de || !a){ faute = JOURS_LONGS[jr] + ' : heures au format 11:30 (ouverture et fermeture).'; continue; }
        if (de === a){ faute = JOURS_LONGS[jr] + ' : l’ouverture et la fermeture sont identiques.'; continue; }
        sem[jr].push({ debut:de, fin:a });
      }
      if (faute) return faute;
      sem.forEach(function(l){ l.sort(function(x, y){ return x.debut < y.debut ? -1 : 1; }); });
      semaine = sem;
      enregistrer({ horaires:semaineVersBase() });
      return null;
    }
    function val(k){ var x = root.querySelector('[data-lv="' + k + '"]'); return x ? parseFloat(String(x.value).replace(',', '.')) : NaN; }
    var rayon = val('rayon'), minimum = val('minimum'), frais = val('frais');
    if (!(rayon >= 0.5 && rayon <= 30)) return 'Rayon : entre 0,5 et 30 km.';
    if (!(minimum >= 0 && minimum <= 1000)) return 'Minimum : entre 0 et 1 000 €.';
    if (!(frais >= 0 && frais <= 100)) return 'Frais : entre 0 et 100 €.';
    D_.livraison.rayonM = Math.round(rayon * 1000);
    D_.livraison.rayon = rayon.toLocaleString('fr-FR', {maximumFractionDigits:1}) + ' km';
    D_.livraison.minimum = Math.round(minimum * 100);
    D_.livraison.frais = Math.round(frais * 100);
    enregistrer({ livraison_rayon_m:D_.livraison.rayonM, livraison_minimum_cents:D_.livraison.minimum, livraison_frais_cents:D_.livraison.frais });
    return null;
  }

  /* --------------------------------- abonnement --------------------------------- */
  /* Coût d'un mois (centimes) : forfait + minutes au-delà ; PAYG = chaque
     minute au tarif PAYG, sans fixe. */
  function coutForfait(p, minutes){
    var dep = p.minutes ? Math.max(0, minutes - p.minutes) : minutes;
    return p.prix + dep * p.dep;
  }
  function plusAvantageux(minutes){
    var m = D_.forfaits[0];
    D_.forfaits.forEach(function(p){ if (coutForfait(p, minutes) < coutForfait(m, minutes)) m = p; });
    return m;
  }
  function appelsPour(minutes){ return D_.jour.appels ? Math.round(minutes * D_.jour.appels / D_.jour.minutes) : 0; }
  var PLAFONDS = [{v:0, t:'Aucun'}, {v:2000, t:'20 €'}, {v:5000, t:'50 €'}, {v:10000, t:'100 €'}];

  /* Simulateur : mise à jour sur place pendant le glissé du curseur. */
  function majSimulation(minutes){
    var max = 0, top = plusAvantageux(minutes);
    D_.forfaits.forEach(function(p){ max = Math.max(max, coutForfait(p, minutes)); });
    root.querySelector('[data-sim-minutes]').textContent = minutes.toLocaleString('fr-FR') + ' min';
    root.querySelector('[data-sim-appels]').textContent = '≈ ' + appelsPour(minutes).toLocaleString('fr-FR') + ' appels par mois';
    root.querySelector('[data-sim-conseil]').innerHTML = 'Le plus avantageux : <b>' + esc(top.nom) + '</b> · ' + esc(api.eur(coutForfait(top, minutes))) + ' par mois';
    D_.forfaits.forEach(function(p){
      var c = coutForfait(p, minutes), ligne = root.querySelector('[data-sim-ligne="' + p.id + '"]');
      if (ligne){
        ligne.classList.toggle('g-abo-top', p.id === top.id);
        ligne.querySelector('i').style.setProperty('--w', Math.max(3, Math.round(c / (max || 1) * 100)) + '%');
        ligne.querySelector('b').textContent = api.eur(c);
      }
      var carte = root.querySelector('[data-plan="' + p.id + '"]');
      if (carte){
        carte.classList.toggle('g-abo-avantage', p.id === top.id);
        carte.querySelector('[data-plan-cout]').textContent = api.eur(c);
      }
    });
  }

  function feuilleAbo(){
    var f = leForfait(), b = bilanMois(), sim = typeof sheet.sim === 'number' ? sheet.sim : b.minutes;
    var top = plusAvantageux(sim), choix = sheet.choix && sheet.choix !== forfait ? D_.forfaits.filter(function(p){ return p.id === sheet.choix; })[0] : null;
    var pct = f.minutes ? Math.round(b.minutes / f.minutes * 100) : null, maxSim = 0;
    D_.forfaits.forEach(function(p){ maxSim = Math.max(maxSim, coutForfait(p, sim)); });
    var fois = b.cout ? (Math.round(b.ca / b.cout * 10) / 10).toString().replace('.', ',') : null;
    var inclus = ['Assistant vocal qui prend les commandes', 'Votre numéro et le transfert vers le restaurant', 'Application cuisine et tablettes illimitées',
      'Carte, ruptures et rythme en direct', 'Statistiques de ventes et d’appels', 'Centre d’aide et export de vos données'];
    var faq = [
      ['Que se passe-t-il si je dépasse mes minutes ?', 'L’assistant continue de répondre : les minutes au-delà sont facturées au tarif de votre forfait, à la seconde près. Vous êtes prévenu à 80 % et vous pouvez fixer un plafond.'],
      ['Puis-je changer de forfait ?', 'Oui. Le nouveau forfait s’applique au cycle de facturation suivant ; vos réglages, votre carte et votre historique ne bougent pas.'],
      ['Comment fonctionne le PAYG ?', 'Aucun fixe : vous payez seulement chaque minute d’appel, 0,49 €. Idéal pour démarrer, moins intéressant quand le volume monte.'],
      ['Mettre l’IA en veille arrête-t-il la facturation ?', 'Non. La veille transfère les appels au restaurant sans résilier : le numéro, l’application et les intégrations restent actifs pendant l’engagement.']
    ];
    return '<div class="g-top">Abonnement</div>' +
      '<div class="g-body g-abo">' +
        /* forfait actuel */
        '<section class="g-abo-hero">' +
          '<div class="g-abo-hero-top"><span>Votre forfait</span><em>Actif</em></div>' +
          '<div class="g-abo-hero-prix"><b>' + esc(f.nom) + '</b><strong>' + esc(api.eur0(f.prix)) + '<small> / mois</small></strong></div>' +
          (pct === null
            ? '<p class="g-abo-hero-detail">' + b.minutes + ' min ce mois · ' + esc(api.eur(f.dep)) + ' la minute, sans fixe</p>'
            : '<div class="g-abo-jauge' + (pct >= 80 ? ' g-abo-alerte' : '') + '"><i style="--w:' + Math.min(100, pct) + '%"></i><span class="g-abo-repere" title="Alerte à 80 %"></span></div>' +
              '<p class="g-abo-hero-detail"><b>' + b.minutes + ' min</b> utilisées sur ' + f.minutes + ' · ' + pct + ' %' + (pct >= 100 ? ' · dépassement à ' + esc(api.eur(f.dep)) + '/min' : pct >= 80 ? ' · alerte atteinte' : ' · alerte à 80 %') + '</p>') +
          (fois ? '<p class="g-abo-valeur"><i aria-hidden="true">✓</i><span>Ce mois, l’IA a pris <b>' + esc(api.eur(b.ca)) + '</b> de commandes, soit <b>' + fois + ' fois</b> le prix de votre forfait.</span></p>' : '') +
        '</section>' +
        /* simulateur */
        '<section class="g-abo-sim">' +
          '<div class="g-abo-titre"><h2>Trouvez le bon forfait</h2><p>Faites glisser selon vos minutes d’appel par mois.</p></div>' +
          '<div class="g-abo-sim-val"><b data-sim-minutes>' + sim.toLocaleString('fr-FR') + ' min</b><span data-sim-appels>≈ ' + appelsPour(sim).toLocaleString('fr-FR') + ' appels par mois</span></div>' +
          '<label class="g-visually-hidden" for="g-abo-sim">Minutes d’appel par mois</label>' +
          '<input id="g-abo-sim" class="g-abo-range" type="range" min="0" max="2000" step="10" value="' + sim + '">' +
          '<div class="g-abo-barres">' + D_.forfaits.map(function(p){
            var c = coutForfait(p, sim);
            return '<div class="g-abo-ligne' + (p.id === top.id ? ' g-abo-top' : '') + '" data-sim-ligne="' + p.id + '"><span>' + esc(p.nom) + '</span><i style="--w:' + Math.max(3, Math.round(c / (maxSim || 1) * 100)) + '%"></i><b>' + esc(api.eur(c)) + '</b></div>';
          }).join('') + '</div>' +
          '<p class="g-abo-conseil" data-sim-conseil>Le plus avantageux : <b>' + esc(top.nom) + '</b> · ' + esc(api.eur(coutForfait(top, sim))) + ' par mois</p>' +
        '</section>' +
        /* forfaits */
        '<div class="g-abo-titre"><h2>Les forfaits</h2><p>Faites défiler, puis choisissez.</p></div>' +
        '<div class="g-abo-plans">' + D_.forfaits.map(function(p){
          var actuel = p.id === forfait, choisi = choix && choix.id === p.id;
          return '<article class="g-abo-plan' + (actuel ? ' g-abo-actuel' : '') + (choisi ? ' g-abo-choisi' : '') + (p.id === top.id ? ' g-abo-avantage' : '') + '" data-plan="' + p.id + '">' +
            '<div class="g-abo-badges">' + (actuel ? '<em class="g-abo-b-actuel">Votre forfait</em>' : '') + '<em class="g-abo-b-avantage">Le plus avantageux</em></div>' +
            '<h3>' + esc(p.nom) + '</h3>' +
            '<p class="g-abo-plan-prix"><b>' + esc(api.eur0(p.prix)) + '</b><small> / mois</small></p>' +
            '<ul>' +
              (p.minutes
                ? '<li><b>' + p.minutes.toLocaleString('fr-FR') + ' min</b> incluses · ' + esc(api.eur(Math.round(p.prix / p.minutes))) + '/min</li><li>Au-delà : ' + esc(api.eur(p.dep)) + '/min</li>'
                : '<li><b>Sans fixe</b> · ' + esc(api.eur(p.dep)) + '/min</li><li>Sans engagement</li>') +
              '<li>≈ ' + appelsPour(p.minutes || 100).toLocaleString('fr-FR') + ' appels ' + (p.minutes ? 'inclus' : 'pour 100 min') + '</li>' +
            '</ul>' +
            '<p class="g-abo-plan-cout">Pour ' + '<span>votre simulation</span> : <b data-plan-cout>' + esc(api.eur(coutForfait(p, sim))) + '</b></p>' +
            (actuel ? '<button class="g-abo-cta g-abo-cta-off" disabled>Forfait actuel</button>'
                    : '<button class="g-abo-cta" data-abo-choisir="' + p.id + '" aria-pressed="' + !!choisi + '">' + (choisi ? 'Sélectionné ✓' : 'Choisir ' + esc(p.nom)) + '</button>') +
          '</article>';
        }).join('') + '</div>' +
        /* inclus */
        '<section class="g-abo-inclus"><h2>Inclus dans tous les forfaits</h2><ul>' + inclus.map(function(t){ return '<li><span aria-hidden="true">✓</span>' + esc(t) + '</li>'; }).join('') + '</ul></section>' +
        /* garde-fous */
        '<section class="g-abo-garde"><div class="g-abo-titre"><h2>Pas de mauvaise surprise</h2></div>' +
          '<div class="g-abo-regle"><b>Alerte à 80 % de vos minutes</b><small>Toujours active, sans coupure du service.</small></div>' +
          '<div class="g-abo-regle"><b>Plafond de dépassement</b><small>' + (abonnement.plafond ? 'Au-delà de ' + esc(api.eur0(abonnement.plafond)) + ' de dépassement, les appels sont transférés au restaurant.' : 'Aucun plafond : l’assistant répond toujours.') + '</small>' +
            '<div class="g-abo-plafonds" role="group" aria-label="Plafond de dépassement">' + PLAFONDS.map(function(x){
              return '<button data-plafond="' + x.v + '" aria-pressed="' + ((abonnement.plafond || 0) === x.v) + '">' + x.t + '</button>';
            }).join('') + '</div></div>' +
          '<div class="g-abo-regle"><b>Facturation claire</b><small>Forfait prélevé par SEPA en début de mois, minutes au-delà régularisées en fin de mois, décomptées à la seconde.</small></div>' +
          '<div class="g-abo-regle"><b>Engagement jusqu’au ' + esc(abonnement.fin) + '</b><small>Engagement initial de 6 mois, puis renouvellement mensuel résiliable pour l’échéance suivante.</small></div>' +
        '</section>' +
        /* questions */
        '<section class="g-abo-faq"><div class="g-abo-titre"><h2>Questions fréquentes</h2></div>' + faq.map(function(q){
          return '<details><summary>' + esc(q[0]) + '<span aria-hidden="true">+</span></summary><p>' + esc(q[1]) + '</p></details>';
        }).join('') + '</section>' +
        '<div class="g-abo-fin">' +
          (abonnement.resiliation ? '<p class="g-note g-cu">Résiliation simulée pour la fin de l’engagement. Aucun contrat réel n’est modifié.</p>' : '') +
          '<button class="g-abo-resilier" data-resilier>' + (abonnement.resiliation ? 'Annuler la demande de résiliation' : 'Planifier la résiliation') + '</button>' +
          '<p class="g-note">Maquette : aucun contrat réel n’est modifié.</p>' +
        '</div>' +
      '</div>' +
      '<div class="g-foot">' + (choix
        ? '<div class="g-abo-confirm"><p>Passer de <b>' + esc(f.nom) + '</b> à <b>' + esc(choix.nom) + '</b> · ' + esc(api.eur0(choix.prix)) + ' / mois au prochain cycle</p>' +
          '<div class="g-acts"><button class="g-act" data-abo-confirmer>Confirmer</button><button class="g-act g-off" data-abo-annuler>Annuler</button></div></div>'
        : '<div class="g-acts"><button class="g-act g-off" data-fermer>Fermer</button></div>') + '</div>';
  }

  function feuilleRoutage(){
    var modes=[
      {id:'ia',nom:'IA active',aide:'Pelyo répond et prend les commandes.'},
      {id:'restaurant',nom:'Transfert restaurant',aide:'Tous les appels sonnent au ' + routage.numero + '.'},
      {id:'auto',nom:'Mode automatique',aide:'Horaires, rush et règles du restaurant décident.'}
    ];
    return '<div class="g-top">Gestion des appels</div><div class="g-body">' +
      '<p class="g-note">Changer de mode ne résilie pas l’abonnement. Le nouveau routage s’applique aux prochains appels sans interrompre celui qui est déjà en cours.</p>' +
      '<div class="g-route-options">' + modes.map(function(m){return '<button data-route="' + m.id + '" aria-pressed="' + (routage.mode===m.id) + '"><span><b>' + esc(m.nom) + '</b><small>' + esc(m.aide) + '</small></span><em>' + (routage.mode===m.id ? 'Actif' : 'Choisir') + '</em></button>';}).join('') + '</div>' +
      '<div class="g-route-detail"><span class="g-lab">Si le restaurant ne répond pas</span><button data-secours aria-pressed="' + routage.secours + '"><b>Reprise par l’IA</b><small>' + (routage.secours ? 'Après ' + routage.delai + ' secondes' : 'Désactivée') + '</small></button>' +
      (routage.secours ? '<div class="g-delay"><button data-delai="15" aria-pressed="' + (routage.delai===15) + '">15 s</button><button data-delai="20" aria-pressed="' + (routage.delai===20) + '">20 s</button><button data-delai="30" aria-pressed="' + (routage.delai===30) + '">30 s</button></div>' : '') + '</div>' +
      '<p class="g-note">Maquette : aucun renvoi téléphonique réel n’est modifié.</p></div>';
  }

  function feuilleDonnees(){
    var pret=abonnement.exportEtat==='pret', sd=sheet;
    var formats='<div><p class="g-lab">Format</p><div class="g-delay"><button data-export-format="csv" aria-pressed="' + (abonnement.exportFormat==='csv') + '">Excel (CSV)</button><button data-export-format="json" aria-pressed="' + (abonnement.exportFormat==='json') + '">Complet (JSON)</button></div>' +
      '<small class="g-secu-aide">' + (abonnement.exportFormat==='json' ? 'Tout en un fichier : restaurant, carte, commandes, appels.' : 'Une ligne par produit commandé, lisible dans Excel ou Numbers.') + '</small></div>';
    var clients = reel ? '<div class="g-secu-bloc"><label class="g-export-option"><input type="checkbox" data-export-clients' + (sd.exportClients ? ' checked' : '') + '><span><b>Inclure les coordonnées des clients</b><small>Noms, téléphones, adresses et allergies. Votre mot de passe sera demandé.</small></span></label>' +
        (sd.exportClients ? '<label class="g-secu-lab" for="g-mdp-export">Votre mot de passe</label><div class="g-mdp"><input class="g-champ" id="g-mdp-export" type="password" autocomplete="current-password"><button class="g-oeil" type="button" data-oeil aria-label="Afficher le mot de passe" aria-pressed="false">' + OEIL + '</button></div>' : '') + '</div>' : '';
    return '<div class="g-top">Mes données et fin d’abonnement</div><div class="g-body">' +
      '<div class="g-data-intro"><span>Vos données</span><b>Téléchargeables à tout moment</b><small>Elles restent à vous. Après une résiliation, le compte reste lisible 30 jours pour les récupérer.</small></div>' +
      '<div><p class="g-lab">Ce que contient l’export</p><ul class="g-data-list"><li>Carte : produits, choix, suppléments et prix</li><li>Historique des commandes et des appels</li><li>Horaires, livraison et réglages de l’assistant</li></ul></div>' +
      formats + clients +
      '<p class="g-note">Les enregistrements audio et les transcriptions ne sont jamais exportés. Chaque export est noté dans le journal du restaurant.</p>' +
      (!reel && pret ? '<div class="g-export-ready"><b>Export de démonstration prêt</b><small>Sur un vrai compte, le fichier se télécharge directement sur ce téléphone.</small></div>' : '') +
      '<div><p class="g-lab">Calendrier après résiliation</p><ol class="g-timeline"><li><b>Date de fin</b><span>Arrêt des nouveaux appels IA</span></li><li><b>30 jours</b><span>Lecture seule et export</span></li><li><b>Après 30 jours</b><span>Suppression des données actives</span></li><li><b>90 jours maximum</b><span>Purge progressive des sauvegardes, hors obligations légales</span></li></ol></div>' +
      '</div><div class="g-foot"><div class="g-acts"><button class="g-act" data-export' + (sd.occupe ? ' disabled' : '') + '>' + (sd.occupe ? 'Préparation…' : reel ? 'Télécharger mes données' : (pret ? 'Regénérer l’export' : 'Préparer mon export')) + '</button><button class="g-act g-off" data-fermer>Fermer</button></div></div>';
  }
  /* Export réel : fichier fabriqué sur le téléphone à partir de la réponse
     de exporter_donnees, puis téléchargé. CSV au format français (« ; »,
     virgule décimale, BOM pour Excel). */
  function euroCsv(c){ return c === null || c === undefined ? '' : (c / 100).toFixed(2).replace('.', ','); }
  function celluleCsv(v){ v = v === null || v === undefined ? '' : String(v); return /[";\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  var ETATS_CSV = { confirmee:'Confirmée', preparation:'En préparation', prete:'Prête', terminee:'Terminée', annulee:'Annulée', expiree:'Expirée' };
  var PAIEMENTS_CSV = { sur_place:'Sur place', especes_livreur:'Espèces au livreur', carte_livreur:'Carte au livreur' };
  function csvExport(x, avecClients){
    var tete = ['Date', 'Heure', 'Commande', 'État', 'Mode', 'Produit', 'Quantité', 'Options', 'Suppléments', 'Consigne', 'Total ligne (€)', 'Total commande (€)', 'Frais livraison (€)', 'Paiement', 'Ville'];
    if (avecClients) tete = tete.concat(['Client', 'Téléphone', 'Adresse', 'Allergie']);
    var lignes = [tete.join(';')];
    (x.commandes || []).forEach(function(k){
      var d = new Date(k.recue_le), date = d.toLocaleDateString('fr-FR', {timeZone:'Europe/Paris'}), heure = d.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit', timeZone:'Europe/Paris'});
      (k.lignes && k.lignes.length ? k.lignes : [{}]).forEach(function(l){
        var c = [date, heure, '#' + k.numero, ETATS_CSV[k.etat] || k.etat, k.mode === 'livraison' ? 'Livraison' : 'À emporter', l.produit || '', l.quantite || '', l.options || '', l.supplements || '', l.consigne || '',
          euroCsv(l.total_cents), euroCsv(k.total_cents), euroCsv(k.frais_livraison_cents), PAIEMENTS_CSV[k.paiement] || k.paiement || '', k.ville || ''];
        if (avecClients) c = c.concat([k.client_nom || '', k.client_telephone || '', k.adresse || '', l.allergie || '']);
        lignes.push(c.map(celluleCsv).join(';'));
      });
    });
    return '﻿' + lignes.join('\r\n');
  }
  function telecharger(nom, contenu, type){
    var blob = new Blob([contenu], { type:type }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = nom; document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); }, 4000);
  }
  function exporterReel(){
    var sd = sheet, avec = !!sd.exportClients, champ = root.querySelector('#g-mdp-export'), mdp = champ ? champ.value : '';
    if (avec && !mdp){ api.toast('Entrez votre mot de passe pour inclure les coordonnées des clients.'); if (champ) champ.focus(); return; }
    function fin(e){ if (sheet !== sd) return; sd.occupe = false; peindre(); if (e) api.toast(e); }
    sd.occupe = true; peindre();
    (avec ? PelyoDonnees.verifierMotDePasse : function(x, cb){ cb(null); })(mdp, function(e){
      if (e) return fin(e);
      PelyoDonnees.exporterDonnees(avec, function(e2, x){
        if (e2) return fin(e2);
        var jour = new Date().toISOString().slice(0, 10), base = 'pelyo-' + api.norm(nomResto()).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + jour;
        if (abonnement.exportFormat === 'json') telecharger(base + '.json', JSON.stringify(x, null, 2), 'application/json');
        else telecharger(base + '.csv', csvExport(x, avec), 'text/csv;charset=utf-8');
        sd.exportClients = false; fin(null);
        api.toast('Export téléchargé : ' + (x.commandes || []).length + ' commande' + ((x.commandes || []).length > 1 ? 's' : '') + '.');
      });
    });
  }


  /* Connexion et sécurité : mot de passe (l'actuel est redemandé), lien par
     e-mail, déconnexion des autres appareils. Les messages s'affichent sur
     place, sans redessiner : ce qui est tapé reste dans les champs. */
  var OEIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path class="g-oeil-barre" d="M4 4l16 16"/></svg>';
  function champMdp(nom, texte, auto){
    return '<label class="g-secu-lab" for="g-mdp-' + nom + '">' + texte + '</label>' +
      '<div class="g-mdp"><input class="g-champ" id="g-mdp-' + nom + '" name="' + nom + '" type="password" autocomplete="' + auto + '"' + (auto === 'new-password' ? ' minlength="8"' : '') + ' required>' +
      '<button class="g-oeil" type="button" data-oeil aria-label="Afficher le mot de passe" aria-pressed="false">' + OEIL + '</button></div>';
  }
  /* ----------------------------- notifications ----------------------------- */
  /* Le téléphone du gérant sonne à chaque commande prise par l'IA et quand
     une tablette demande l'accès (serveur « notifications »). En démo,
     seule une notification d'exemple, locale, est montrée. */
  var notifsDemo = { actif:false, commandes:true, appareils:true };
  function resumeNotifs(){
    if (!reel) return notifsDemo.actif ? 'Activées sur ce téléphone (démo)' : 'Nouvelles commandes, tablettes en attente';
    return PelyoNotifs.lireId() ? 'Activées sur ce téléphone' : 'Nouvelles commandes, tablettes en attente';
  }
  function chargerNotifs(){
    var s = sheet;
    s.etat = PelyoNotifs.etat();
    if (!reel){ s.abo = notifsDemo.actif ? notifsDemo : null; s.pret = true; return peindre(); }
    PelyoNotifs.abonnementActuel(function(e, sub){
      PelyoDonnees.mesNotifications(function(e2, liste){
        if (sheet !== s) return;
        liste = liste || [];
        var id = PelyoNotifs.lireId(), moi = null;
        liste.forEach(function(x){ if (x.id === id) moi = x; });
        if (!sub || !moi){ if (id && !moi) PelyoNotifs.oublierId(); moi = null; }
        s.abo = moi; s.sub = sub; s.autres = liste.length - (moi ? 1 : 0); s.pret = true;
        peindre();
      });
    });
  }
  function feuilleNotifs(){
    var s = sheet, corps;
    var bouton = function(attr, texte, off){ return '<button class="g-act' + (off ? ' g-off' : '') + '" ' + attr + (s.occupe ? ' disabled' : '') + '>' + texte + '</button>'; };
    if (!s.pret) corps = '<p class="g-note">Vérification de ce téléphone…</p>';
    else if (s.etat === 'ios-ecran') corps = '<div class="g-secu-bloc"><b>Sur iPhone, une étape avant</b><small>Les notifications marchent seulement depuis l’icône Pelyo : touchez Partager, puis « Sur l’écran d’accueil ». Ouvrez Pelyo depuis cette icône et revenez ici.</small></div>';
    else if (s.etat === 'nonsupporte') corps = '<div class="g-secu-bloc"><b>Ce navigateur ne reçoit pas les notifications</b><small>Utilisez Chrome sur Android, ou l’icône Pelyo sur iPhone (iOS 16.4 ou plus récent).</small></div>';
    else if (s.etat === 'bloque') corps = '<div class="g-secu-bloc"><b>Notifications bloquées</b><small>Elles ont été refusées pour Pelyo. Autorisez-les dans les réglages du téléphone (ou du navigateur), puis revenez ici.</small></div>';
    else if (!s.abo) corps = '<div class="g-secu-bloc"><b>Pas encore activées sur ce téléphone</b><small>Le téléphone vous demandera votre accord. Vous pourrez les couper à tout moment.</small>' + bouton('data-notif-activer', 'Activer sur ce téléphone') + '</div>';
    else corps = '<div><p class="g-lab">Ce téléphone reçoit</p><div class="g-permissions">' +
        [{id:'commandes', nom:'Nouvelles commandes', aide:'À chaque commande prise par l’IA, avec le montant.'},
         {id:'appareils', nom:'Tablettes en attente', aide:'Quand une tablette demande l’accès à la cuisine.'}].map(function(x){
          return '<button data-notif-pref="' + x.id + '" aria-pressed="' + !!s.abo[x.id] + '"' + (s.occupe ? ' disabled' : '') + '><span><b>' + esc(x.nom) + '</b><small>' + esc(x.aide) + '</small></span><em>' + (s.abo[x.id] ? 'Oui' : 'Non') + '</em></button>';
        }).join('') + '</div></div>' +
      '<div class="g-secu-bloc"><b>Vérifier que ça marche</b><small>Une notification arrive dans quelques secondes, même appli fermée.</small>' + bouton('data-notif-test', 'M’envoyer une notification de test', true) + '</div>' +
      '<div class="g-secu-bloc"><b>Ne plus rien recevoir ici</b><small>Les autres appareils gardent leurs notifications.</small>' + bouton('data-notif-desactiver', 'Désactiver sur ce téléphone', true) + '</div>';
    return '<div class="g-top">Notifications</div><div class="g-body">' +
      '<p class="g-note">Recevez une alerte sur ce téléphone à chaque nouvelle commande, même quand l’appli est fermée.</p>' + corps +
      (s.autres ? '<p class="g-note">' + s.autres + ' autre' + (s.autres > 1 ? 's appareils reçoivent' : ' appareil reçoit') + ' aussi les notifications avec votre compte.</p>' : '') +
      (reel ? '' : '<p class="g-note">Compte démo : une notification d’exemple s’affiche sur ce téléphone. Aucune n’est envoyée par le serveur.</p>') +
    '</div><div class="g-foot"><div class="g-acts"><button class="g-act g-off" data-fermer>Fermer</button></div></div>';
  }
  function actionNotifs(d){
    var s = sheet;
    function fin(e, texte){ if (sheet !== s) return; s.occupe = false; if (e) api.toast(e); else if (texte) api.toast(texte); peindre(); }
    if (!reel){
      if (d.notifActiver !== undefined) return PelyoNotifs.autoriser(function(e){
        if (!e){ notifsDemo.actif = true; s.abo = notifsDemo; PelyoNotifs.exemple('Nouvelle commande #248', 'À emporter · 13,50 € · Sarah'); }
        else s.etat = PelyoNotifs.etat();
        fin(e, e ? null : 'Notifications activées. Voici à quoi ressemble une nouvelle commande.');
      });
      if (d.notifPref){ notifsDemo[d.notifPref] = !notifsDemo[d.notifPref]; return fin(null); }
      if (d.notifTest !== undefined){ PelyoNotifs.exemple('Nouvelle commande #249', 'Livraison · 22,50 € · Karim'); return fin(null, 'Notification d’exemple affichée.'); }
      if (d.notifDesactiver !== undefined){ notifsDemo.actif = false; s.abo = null; return fin(null, 'Notifications désactivées sur ce téléphone.'); }
      return;
    }
    s.occupe = true; peindre();
    if (d.notifActiver !== undefined) return PelyoDonnees.cleNotifications(function(e, cle){
      if (e) return fin(e);
      PelyoNotifs.activer(cle, function(e2, sub){
        if (e2){ s.etat = PelyoNotifs.etat(); return fin(e2); }
        PelyoDonnees.abonnerNotifications(sub, PelyoNotifs.nomAppareil(), {}, function(e3, id){
          if (e3) return fin(e3);
          PelyoNotifs.noterId(id); s.sub = sub; s.abo = { id:id, commandes:true, appareils:true };
          fin(null, 'Notifications activées sur ce téléphone.');
        });
      });
    });
    if (d.notifPref){
      var prefs = { commandes:s.abo.commandes, appareils:s.abo.appareils };
      prefs[d.notifPref] = !prefs[d.notifPref];
      return PelyoDonnees.abonnerNotifications(s.sub, PelyoNotifs.nomAppareil(), prefs, function(e, id){
        if (!e){ s.abo.commandes = prefs.commandes; s.abo.appareils = prefs.appareils; PelyoNotifs.noterId(id); }
        fin(e);
      });
    }
    if (d.notifTest !== undefined) return PelyoDonnees.testerNotification(function(e){ fin(e, e ? null : 'Envoyée : elle arrive dans quelques secondes.'); });
    if (d.notifDesactiver !== undefined) return PelyoNotifs.desactiver(function(e, endpoint){
      var fini = function(){ s.abo = null; s.sub = null; fin(null, 'Notifications désactivées sur ce téléphone.'); };
      if (!endpoint) return fini();
      PelyoDonnees.desabonnerNotifications(endpoint, function(){ fini(); });
    });
  }

  function feuilleSecurite(){
    return '<div class="g-top">Connexion et sécurité</div><div class="g-body">' +
      '<div class="g-secu-compte"><span class="g-gx-ico g-gx-brun">' + iconeGx('securite') + '</span>' +
        '<span><small>Adresse de connexion</small><b data-secu-email>' + esc(reel ? (sheet.email || '…') : 'demo@pelyo.eu') + '</b></span></div>' +
      '<form class="g-secu-form" data-secu-form novalidate>' +
        '<h3>Changer le mot de passe</h3>' +
        champMdp('actuel', 'Mot de passe actuel', 'current-password') +
        champMdp('nouveau', 'Nouveau mot de passe (8 caractères au moins)', 'new-password') +
        champMdp('nouveau2', 'Le même, encore une fois', 'new-password') +
        '<p class="g-secu-msg" data-secu-msg role="status" hidden></p>' +
        '<button class="g-act" type="submit">Changer le mot de passe</button>' +
        '<small class="g-secu-aide">Vos autres appareils seront déconnectés.</small>' +
      '</form>' +
      '<form class="g-secu-form" data-email-form novalidate>' +
        '<h3>Changer d’adresse e-mail</h3>' +
        '<label class="g-secu-lab" for="g-email-nouvel">Nouvelle adresse</label><input class="g-champ" id="g-email-nouvel" name="nouvel" type="email" autocomplete="email" required>' +
        champMdp('email-actuel', 'Mot de passe actuel', 'current-password') +
        '<p class="g-secu-msg" data-email-msg role="status" hidden></p>' +
        '<button class="g-act g-off" type="submit">Recevoir le lien de confirmation</button>' +
        '<small class="g-secu-aide">L’adresse change seulement après un clic sur le lien envoyé.</small>' +
      '</form>' +
      '<div class="g-secu-bloc"><b>Mot de passe oublié ?</b><small>Recevez un lien par e-mail pour en choisir un nouveau.</small>' +
        '<button class="g-act g-off" type="button" data-secu-lien>Recevoir un lien par e-mail</button></div>' +
      '<div class="g-secu-bloc"><b>Téléphone perdu ou prêté ?</b><small>Fermez votre compte sur tous les autres téléphones et ordinateurs. Les tablettes cuisine gardent leur accès : elles se gèrent dans Accès de l’équipe cuisine.</small>' +
        '<button class="g-act g-off" type="button" data-secu-autres>Déconnecter les autres appareils</button></div>' +
    '</div><div class="g-foot"><div class="g-acts"><button class="g-act g-off" data-fermer>Fermer</button></div></div>';
  }
  function messageSecu(texte, ok, cible){
    var m = root.querySelector(cible || '[data-secu-msg]');
    if (!m) return;
    m.hidden = !texte; m.textContent = texte || '';
    m.className = 'g-secu-msg' + (ok ? ' g-secu-ok' : '');
    m.setAttribute('role', ok ? 'status' : 'alert');
  }
  function occupeSecu(oui){
    Array.prototype.forEach.call(root.querySelectorAll('.g-sheet button, .g-sheet input'), function(el){ el.disabled = oui; });
  }
  function changerMdp(form){
    var v = {}; ['actuel','nouveau','nouveau2'].forEach(function(n){ v[n] = form.elements[n].value; });
    if (!v.actuel) return messageSecu('Saisissez votre mot de passe actuel.');
    if (v.nouveau.length < 8) return messageSecu('Nouveau mot de passe trop court : 8 caractères au moins.');
    if (v.nouveau !== v.nouveau2) return messageSecu('Les deux nouveaux mots de passe ne sont pas identiques.');
    if (v.nouveau === v.actuel) return messageSecu('Choisissez un mot de passe différent de l’actuel.');
    if (!reel){ form.reset(); messageSecu('Compte démo : aucun mot de passe n’est modifié.', true); return; }
    occupeSecu(true); messageSecu('Vérification…', true);
    PelyoDonnees.changerMotDePasseConnecte(v.actuel, v.nouveau, function(e){
      occupeSecu(false);
      if (e){ messageSecu(e); var champ = form.elements[/actuel/i.test(e) ? 'actuel' : 'nouveau']; if (champ) champ.focus(); return; }
      form.reset();
      messageSecu('Mot de passe changé. Vos autres appareils sont déconnectés.', true);
      api.toast('Mot de passe changé.');
    });
  }

  function changerEmailForm(form){
    var nouvel = form.elements.nouvel.value.trim(), mdp = form.elements['email-actuel'].value, cible = '[data-email-msg]';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(nouvel)) return messageSecu('Adresse e-mail invalide.', false, cible);
    if (!mdp) return messageSecu('Saisissez votre mot de passe actuel.', false, cible);
    if (!reel){ form.reset(); messageSecu('Compte démo : aucune adresse n’est modifiée.', true, cible); return; }
    occupeSecu(true); messageSecu('Vérification…', true, cible);
    PelyoDonnees.changerEmail(mdp, nouvel, function(e){
      occupeSecu(false);
      if (e){ messageSecu(e, false, cible); return; }
      form.reset();
      messageSecu('Lien envoyé à ' + nouvel + '. Cliquez dessus pour confirmer : votre adresse changera à ce moment-là.', true, cible);
    });
  }

  /* ------------------------------ livreurs ------------------------------
     Le gérant affiche le code livreur, active (ou refuse) les téléphones qui
     le saisissent, voit les livreurs en direct sur une carte et leur tournée.
     Démo : le registre est partagé avec la cuisine dans le navigateur. */
  var carteLv = null, carteLvDiv = null, calqueLv = null, leafletLv = '', sigLivreurs = '', carteLvCadree = false;
  var LEAFLET_LV = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
  function hh(ms){ var d = new Date(ms); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function registreLv(){ return window.PelyoTournee ? PelyoTournee.registre() : {code:'', demandes:[], livreurs:[], instantane:null}; }
  function signatureLivreurs(){
    var r = registreLv(), i = r.instantane || {};
    return [r.code, r.demandes.map(function(x){ return x.id; }).join(','), r.livreurs.map(function(l){ return l.id + l.statut; }).join(','),
      (i.livreurs || []).map(function(l){ return l.id + ':' + l.commandes.length + ':' + l.etape; }).join('|'), i.delai].join('/');
  }
  function feuilleLivreurs(){
    var r = registreLv(), inst = r.instantane || {livreurs:[]}, actifs = r.livreurs.filter(function(l){ return l.statut === 'actif'; });
    if (reel) return '<div class="g-top">Livreurs</div><div class="g-body g-mid-v"><p class="g-quote" style="max-width:300px">Le mode livreur arrive avec les comptes connectés dans une prochaine étape. Essayez-le dès maintenant dans le compte démo.</p></div><div class="g-foot"><div class="g-acts"><button class="g-act g-off" data-fermer>Fermer</button></div></div>';
    var parId = {};
    (inst.livreurs || []).forEach(function(l){ parId[l.id] = l; });
    return '<div class="g-top">Livreurs</div><div class="g-body">' +
      '<div class="g-lv-carte"><div class="g-lv-place" data-lv-carte></div>' +
        '<div class="g-lv-delai"><span>Livraison commandée maintenant</span><b>' + (inst.delai ? '≈ ' + inst.delai + ' min' : '—') + '</b><small>Calculé d’après les tournées en cours</small></div></div>' +
      (r.demandes.length ? '<div><p class="g-lab">Demandes à valider</p><div class="g-list">' + r.demandes.map(function(x){
        return '<div class="g-row"><span class="g-k">' + esc(x.nom) + '<span class="g-s">Demande reçue à ' + hh(x.at) + '</span></span><span class="g-device-actions"><button data-lv-activer="' + esc(x.id) + '">Activer</button><button data-lv-refuser="' + esc(x.id) + '">Refuser</button></span></div>';
      }).join('') + '</div></div>' : '') +
      '<div><p class="g-lab">En tournée</p>' + (actifs.length ? '<div class="g-lv-liste">' + actifs.map(function(l){
        var s = parId[l.id] || {commandes:[]}, enMain = s.commandes.filter(function(c){ return c.enMain; }).length;
        return '<div class="g-lv-livreur"><span class="g-lv-pastille">' + esc(l.nom.charAt(0).toUpperCase()) + '</span><span class="g-lv-txt"><b>' + esc(l.nom) + '</b><small>' + esc(s.etape || 'Au restaurant') + '</small><small>' +
          (s.commandes.length ? s.commandes.length + ' commande' + (s.commandes.length > 1 ? 's' : '') + (enMain ? ' · ' + enMain + ' avec lui' : '') + (s.retour ? ' · retour ' + hh(s.retour) : '') : 'Disponible pour la prochaine livraison') + '</small></span>' +
          '<button class="g-lv-retirer" data-lv-retirer="' + esc(l.id) + '">Retirer</button></div>';
      }).join('') + '</div>' : '<p class="g-note">Aucun livreur en tournée.</p>') + '</div>' +
      '<div class="g-kitchen-code g-lv-code"><span>Code livreur</span><strong>' + (sheet.editCode ? '<input class="g-champ g-lv-saisie" id="g-lv-code" maxlength="12" value="' + esc(r.code) + '" autocapitalize="characters" spellcheck="false">' : esc(r.code)) + '</strong>' +
        (sheet.editCode ? '<button data-lv-code-ok>Enregistrer</button>' : '<button data-lv-code-edit>Modifier</button><button data-lv-code-nouveau>Nouveau code</button>') + '</div>' +
      '<p class="g-note">Le livreur installe l’appli, ouvre la cuisine, puis Réglages → Mode livreur, et saisit ce code. Vous l’activez ici : son téléphone passe en lecture seule, ne montre que ses livraisons, et seul vous pouvez le libérer. Sa position n’est partagée que pendant sa tournée.</p>' +
      '</div><div class="g-foot"><div class="g-acts"><button class="g-act g-off" data-fermer>Fermer</button></div></div>';
  }
  function chargerLeafletLv(){
    if (leafletLv) return;
    leafletLv = 'charge';
    var css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = LEAFLET_LV + 'leaflet.css'; css.crossOrigin = 'anonymous';
    css.integrity = 'sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H';
    document.head.appendChild(css);
    var js = document.createElement('script');
    js.src = LEAFLET_LV + 'leaflet.js'; js.crossOrigin = 'anonymous';
    js.integrity = 'sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH';
    js.onload = function(){ leafletLv = 'pret'; monterCarteLv(); };
    js.onerror = function(){ leafletLv = ''; var p = root.querySelector('[data-lv-carte]'); if (p) p.innerHTML = '<p class="g-note">Carte indisponible hors connexion.</p>'; };
    document.head.appendChild(js);
  }
  function monterCarteLv(){
    var place = root && root.querySelector('[data-lv-carte]');
    if (!place) return;
    if (!window.L){ if (!place.firstChild) place.innerHTML = '<p class="g-note">Chargement de la carte…</p>'; chargerLeafletLv(); return; }
    if (!carteLvDiv){
      carteLvDiv = document.createElement('div');
      carteLvDiv.className = 'g-lv-leaflet';
      place.innerHTML = ''; place.appendChild(carteLvDiv);
      carteLv = window.L.map(carteLvDiv, {zoomControl:false, attributionControl:true, zoomAnimation:false, fadeAnimation:false, markerZoomAnimation:false});
      carteLv.attributionControl.setPrefix(false);
      window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'}).addTo(carteLv);
      calqueLv = window.L.layerGroup().addTo(carteLv);
      carteLv.setView([PelyoTournee.RESTO.lat, PelyoTournee.RESTO.lon], 14, {animate:false});
    } else { place.innerHTML = ''; place.appendChild(carteLvDiv); }
    carteLv.invalidateSize(false);
    dessinerLivreurs();
  }
  /* Démo : pendant que le gérant regarde, les livreurs simulés continuent
     leur route vers leur prochain client (la cuisine n'est pas ouverte). */
  function deplacerSimules(){
    PelyoTournee.modifierRegistre(function(r){
      var inst = r.instantane || {livreurs:[]};
      r.livreurs.forEach(function(l){
        if (!l.simule || l.statut !== 'actif' || !l.pos) return;
        var s = (inst.livreurs || []).filter(function(x){ return x.id === l.id; })[0];
        var prochaine = s ? s.commandes.filter(function(c){ return c.enMain; })[0] : null;
        var cible = prochaine ? prochaine.pos : PelyoTournee.RESTO, d = PelyoTournee.distanceKm(l.pos, cible);
        if (d > 0.04){ var k = Math.min(1, 0.12 / d); l.pos = {lat:l.pos.lat + (cible.lat - l.pos.lat) * k, lon:l.pos.lon + (cible.lon - l.pos.lon) * k}; }
        else if (prochaine){ s.commandes = s.commandes.filter(function(c){ return c !== prochaine; }); s.etape = s.commandes.length ? 'En livraison' : 'Retour au restaurant'; }
      });
    });
  }
  function dessinerLivreurs(){
    if (!carteLv || !calqueLv) return;
    var L = window.L, r = registreLv(), inst = r.instantane || {livreurs:[]}, parId = {};
    (inst.livreurs || []).forEach(function(l){ parId[l.id] = l; });
    calqueLv.clearLayers();
    var points = [[PelyoTournee.RESTO.lat, PelyoTournee.RESTO.lon]];
    r.livreurs.forEach(function(l){ if (l.statut === 'actif' && l.pos){ points.push([l.pos.lat, l.pos.lon]); (parId[l.id] ? parId[l.id].commandes : []).forEach(function(c){ points.push([c.pos.lat, c.pos.lon]); }); } });
    /* Cadrage une seule fois à l'ouverture : ensuite le gérant déplace la carte librement. */
    if (!carteLvCadree){ carteLvCadree = true; if (points.length > 1) carteLv.fitBounds(points, {padding:[28, 28], maxZoom:15, animate:false}); }
    L.marker([PelyoTournee.RESTO.lat, PelyoTournee.RESTO.lon], {icon:L.divIcon({className:'g-lv-marque g-lv-resto', html:'<img src="assets/logo-toque.png" alt="">', iconSize:[34, 34], iconAnchor:[17, 17]})}).addTo(calqueLv);
    r.livreurs.filter(function(l){ return l.statut === 'actif' && l.pos; }).forEach(function(l){
      (parId[l.id] ? parId[l.id].commandes : []).forEach(function(c){
        L.polyline([[l.pos.lat, l.pos.lon], [c.pos.lat, c.pos.lon]], {color:c.enMain ? '#e97838' : '#2f7c86', weight:2, dashArray:'4 6', opacity:.8}).addTo(calqueLv);
        L.marker([c.pos.lat, c.pos.lon], {icon:L.divIcon({className:'g-lv-marque g-lv-client', html:'<span>#' + c.id + '</span>', iconSize:[46, 22], iconAnchor:[23, 11]})}).addTo(calqueLv);
      });
      L.marker([l.pos.lat, l.pos.lon], {icon:L.divIcon({className:'g-lv-marque g-lv-moto', html:'<span>' + esc(l.nom.charAt(0).toUpperCase()) + '</span>', iconSize:[30, 30], iconAnchor:[15, 15]})}).addTo(calqueLv);
    });
  }

  /* ------------------------- balance de portions ------------------------- */
  function balanceResume(){
    if (reel) return 'Bientôt avec votre compte';
    var b = PelyoBalance.lire().balance;
    return b.reliee ? 'Reliée · ' + (b.simulee ? 'démonstration' : b.nom) : 'Pas encore reliée';
  }
  function produitsMenu(){ var r = []; D_.menu.forEach(function(cat){ cat.items.forEach(function(it){ r.push(it); }); }); return r; }
  function grammes(e){ return e.min + '–' + e.max + ' g'; }
  function interrupteurBal(cle, on, titre, sous){
    return '<button class="g-bal-ligne" role="switch" aria-checked="' + on + '" data-bal-reglage="' + cle + '"><span><b>' + esc(titre) + '</b><small>' + esc(sous) + '</small></span><i class="g-bal-sw" aria-hidden="true"></i></button>';
  }
  function feuilleBalance(){
    if (reel) return '<div class="g-top">Balance de portions</div><div class="g-body g-mid-v"><p class="g-quote" style="max-width:300px">La balance arrive avec les comptes connectés dans une prochaine étape. Essayez-la dès maintenant dans le compte démo.</p></div><div class="g-foot"><div class="g-acts"><button class="g-act g-off" data-fermer>Fermer</button></div></div>';
    var x = PelyoBalance.lire(), b = x.balance, rg = x.reglages, bl = PelyoBalance.bilan(13);
    var nomType = {}; PelyoBalance.TYPES.forEach(function(t){ nomType[t.id] = t.nom; });
    return '<div class="g-top">Balance de portions</div><div class="g-body">' +
      /* état de la balance */
      '<div class="g-bal-etat' + (b.reliee ? ' g-bal-on' : '') + '">' +
        '<span class="g-bal-ico">' + iconeGx('balance') + '</span>' +
        '<span class="g-bal-txt"><b>' + esc(b.modele) + '</b><small>' + (b.reliee ? 'Reliée · ' + esc(b.simulee ? 'balance de démonstration' : b.nom) + ' · depuis ' + hh(b.relieeAt) : 'Pas encore reliée') + '</small></span>' +
        (b.reliee ? '<button class="g-bal-btn g-bal-btn2" data-bal-delier>Délier</button>' : '<button class="g-bal-btn" data-bal-relier>Relier</button>') +
      '</div>' +
      (b.reliee ? '<div class="g-bal-test"><span>Pesée test</span><b data-bal-poids>' + (sheet.poids || 0) + ' g</b>' +
        (b.simulee ? '<div class="g-bal-sim"><button data-bal-sim="20">+20 g</button><button data-bal-sim="-10">−10 g</button><button data-bal-sim="0">Vider</button></div>' : '<small>Posez un objet sur la balance.</small>') + '</div>' : '') +
      '<p class="g-note">' + (PelyoBalance.bluetoothDispo()
        ? 'Allumez la balance, puis touchez « Relier » et choisissez-la dans la liste Bluetooth.'
        : 'Ce navigateur ne lit pas le Bluetooth (iPad, Safari, ordinateur) : « Relier » branche une balance de démonstration. Avec une vraie balance, utilisez une tablette Android avec Chrome, ou l’appli Pelyo.') + '</p>' +
      /* réglages */
      '<p class="g-lab">Réglages</p><div class="g-bal-reglages">' +
        interrupteurBal('guidee', rg.guidee, 'Pesée guidée en cuisine', 'L’écran de pesée s’ouvre quand une commande commence') +
        interrupteurBal('tareAuto', rg.tareAuto, 'Tare automatique', 'Ingrédient bon et stable : la balance se remet à zéro et passe au suivant') +
        '<div class="g-bal-ligne"><span><b>Affichage sur la balance</b><small>' + (rg.mode === 'portion' ? '7 couleurs, pour guider le geste' : '3 couleurs : pas assez, bon, trop') + '</small></span>' +
          '<span class="g-bal-seg"><button data-bal-mode="portion" aria-pressed="' + (rg.mode === 'portion') + '">Portion</button><button data-bal-mode="simple" aria-pressed="' + (rg.mode === 'simple') + '">Simple</button></span></div>' +
        '<div class="g-bal-ligne"><span><b>Tolérance</b><small>Écart accepté autour du grammage visé</small></span>' +
          '<span class="g-bal-pas"><button data-bal-tol="-1" aria-label="Diminuer">−</button><b>± ' + rg.tolerance + ' g</b><button data-bal-tol="1" aria-label="Augmenter">+</button></span></div>' +
        '<button class="g-bal-lien" data-bal-tol-partout>Appliquer ± ' + rg.tolerance + ' g à tous les produits</button>' +
      '</div>' +
      /* ordre par défaut */
      '<p class="g-lab">Ordre de pesée par défaut</p><ol class="g-bal-ordre">' + rg.ordre.map(function(t, i){
        return '<li><span>' + (i + 1) + '</span><b>' + esc(nomType[t] || t) + '</b>' +
          '<button data-bal-type="' + i + ':-1" aria-label="Monter"' + (i ? '' : ' disabled') + '>↑</button><button data-bal-type="' + i + ':1" aria-label="Descendre"' + (i < rg.ordre.length - 1 ? '' : ' disabled') + '>↓</button></li>';
      }).join('') + '</ol>' +
      '<button class="g-bal-lien" data-bal-ordre-partout>Ranger tous les produits dans cet ordre</button>' +
      /* grammages par produit */
      '<p class="g-lab">Grammages par produit</p><div class="g-bal-produits">' + produitsMenu().map(function(it){
        var rec = x.recettes[it.id] || [], ouvert = sheet.produit === it.id;
        return '<div class="g-bal-produit' + (ouvert ? ' g-bal-ouvert' : '') + '"><button class="g-bal-p-tete" data-bal-produit="' + esc(it.id) + '" aria-expanded="' + ouvert + '"><b>' + esc(it.nom) + '</b><small>' +
          (rec.length ? rec.map(function(e){ return esc(e.nom) + ' ' + grammes(e); }).join(' · ') : 'Non pesé') + '</small><i aria-hidden="true">⌄</i></button>' +
          (ouvert ? '<div class="g-bal-etapes">' + rec.map(function(e, i){
            var cle = it.id + ':' + i;
            return '<div class="g-bal-etape"><span class="g-bal-num">' + (i + 1) + '</span>' +
              '<input class="g-bal-nom" value="' + esc(e.nom) + '" data-bal-champ="' + cle + ':nom" aria-label="Ingrédient" maxlength="30">' +
              '<label><input type="number" inputmode="numeric" min="0" max="5000" value="' + e.min + '" data-bal-champ="' + cle + ':min" aria-label="Minimum en grammes"><em>à</em></label>' +
              '<label><input type="number" inputmode="numeric" min="0" max="5000" value="' + e.max + '" data-bal-champ="' + cle + ':max" aria-label="Maximum en grammes"><em>g</em></label>' +
              '<span class="g-bal-actions"><button data-bal-bouge="' + cle + ':-1" aria-label="Monter"' + (i ? '' : ' disabled') + '>↑</button><button data-bal-bouge="' + cle + ':1" aria-label="Descendre"' + (i < rec.length - 1 ? '' : ' disabled') + '>↓</button><button data-bal-suppr="' + cle + '" aria-label="Retirer">×</button></span></div>';
          }).join('') + '<button class="g-bal-lien" data-bal-ajout="' + esc(it.id) + '">+ Ajouter un ingrédient à peser</button></div>' : '') + '</div>';
      }).join('') + '</div>' +
      /* bilan */
      '<p class="g-lab">Ce mois</p><div class="g-bal-bilan">' +
        '<div><b>' + bl.pesees + '</b><small>pesées</small></div>' +
        '<div><b>' + (bl.pesees ? Math.round(bl.horsCible / bl.pesees * 100) : 0) + ' %</b><small>au-dessus du grammage</small></div>' +
        '<div><b>' + (bl.tropG >= 1000 ? (bl.tropG / 1000).toFixed(1).replace('.', ',') + ' kg' : Math.round(bl.tropG) + ' g') + '</b><small>servis en trop ≈ ' + api.eur(bl.euros) + '</small></div>' +
      '</div>' +
      '<p class="g-note">Chaque pesée faite en cuisine s’ajoute ici. Démo : réglages partagés avec la cuisine de ce navigateur.</p>' +
      '</div><div class="g-foot"><div class="g-acts"><button class="g-act g-off" data-fermer>Fermer</button></div></div>';
  }
  function deplacer(l, i, sens){ var j = i + sens; if (j < 0 || j >= l.length) return; var t = l[i]; l[i] = l[j]; l[j] = t; }
  function clicBalance(d){
    if (d.balRelier !== undefined){
      PelyoBalance.relier(function(e, simulee){
        if (e){ api.toast(e); return; }
        api.toast(simulee ? 'Balance de démonstration reliée.' : 'Balance reliée.');
        if (!simulee) PelyoBalance.surPoids(function(p){
          if (!sheet || sheet.type !== 'balance') return;
          sheet.poids = Math.round(p.g);
          var el = root.querySelector('[data-bal-poids]'); if (el) el.textContent = sheet.poids + ' g';
        });
        peindre();
      });
      return true;
    }
    if (d.balDelier !== undefined){ PelyoBalance.delier(); sheet.poids = 0; api.toast('Balance déliée.'); peindre(); return true; }
    if (d.balSim !== undefined){
      var v = +d.balSim; sheet.poids = v ? Math.max(0, (sheet.poids || 0) + v) : 0;
      var el = root.querySelector('[data-bal-poids]'); if (el) el.textContent = sheet.poids + ' g';
      return true;
    }
    if (d.balReglage){ var k = d.balReglage; PelyoBalance.modifier(function(x){ x.reglages[k] = !x.reglages[k]; }); peindre(); return true; }
    if (d.balMode){ PelyoBalance.modifier(function(x){ x.reglages.mode = d.balMode; }); peindre(); return true; }
    if (d.balTol){ PelyoBalance.modifier(function(x){ x.reglages.tolerance = Math.max(1, Math.min(50, x.reglages.tolerance + +d.balTol)); }); peindre(); return true; }
    if (d.balTolPartout !== undefined){
      PelyoBalance.modifier(function(x){
        var t = x.reglages.tolerance;
        Object.keys(x.recettes).forEach(function(id){ x.recettes[id].forEach(function(e){ var c = Math.round((e.min + e.max) / 2); e.min = Math.max(0, c - t); e.max = c + t; }); });
      });
      api.toast('Tolérance appliquée à tous les produits.'); peindre(); return true;
    }
    if (d.balType){
      var pt = d.balType.split(':');
      PelyoBalance.modifier(function(x){ deplacer(x.reglages.ordre, +pt[0], +pt[1]); }); peindre(); return true;
    }
    if (d.balOrdrePartout !== undefined){
      PelyoBalance.modifier(function(x){
        var rang = function(e){ var i = x.reglages.ordre.indexOf(e.type); return i < 0 ? 99 : i; };
        Object.keys(x.recettes).forEach(function(id){
          x.recettes[id] = x.recettes[id].map(function(e, i){ return {e:e, i:i}; })
            .sort(function(a, b){ return rang(a.e) - rang(b.e) || a.i - b.i; }).map(function(o){ return o.e; });
        });
      });
      api.toast('Produits rangés dans l’ordre par défaut.'); peindre(); return true;
    }
    if (d.balProduit){ sheet.produit = sheet.produit === d.balProduit ? null : d.balProduit; peindre(); return true; }
    if (d.balBouge){
      var pb = d.balBouge.split(':');
      PelyoBalance.modifier(function(x){ deplacer(x.recettes[pb[0]], +pb[1], +pb[2]); }); peindre(); return true;
    }
    if (d.balSuppr){
      var ps = d.balSuppr.split(':');
      PelyoBalance.modifier(function(x){ x.recettes[ps[0]].splice(+ps[1], 1); }); peindre(); return true;
    }
    if (d.balAjout){
      PelyoBalance.modifier(function(x){ (x.recettes[d.balAjout] = x.recettes[d.balAjout] || []).push({ nom:'Ingrédient', type:'garniture', min:30, max:30 + 2 * x.reglages.tolerance }); });
      peindre(); return true;
    }
    return false;
  }

  /* Renvoi des appels : le numéro Pelyo arrive tout seul (abonnement ou
     essai) ; le gérant compose le code sur le téléphone du restaurant. */
  function numeroNational(n){ var d = String(n || '').replace(/[^\d+]/g, ''); return /^\+33\d{9}$/.test(d) ? '0' + d.slice(3) : d; }
  function numeroAffiche(){
    var n = reel ? numeroPelyo : '+33478123456';
    return n ? numeroNational(n).replace(/(\d{2})(?=\d)/g, '$1 ') : '';
  }
  function feuilleRenvoi(){
    var n = numeroNational(reel ? numeroPelyo : '+33478123456');
    function code(c, quoi){ return '<div class="g-renvoi-code"><small>' + esc(quoi) + '</small><b>' + esc(c) + '</b><button data-copier="' + esc(c) + '">Copier</button></div>'; }
    return '<div class="g-top">Renvoi des appels</div><div class="g-body">' +
      (n ? '<p class="g-note">Sur le téléphone du restaurant, composez ce code puis appuyez sur Appeler. Quand personne ne décroche au bout de 20 secondes, Pelyo prend l’appel.</p>' +
          code('**61*' + n + '**20#', 'Pas de réponse en 20 s → Pelyo') +
          code('**67*' + n + '#', 'Ligne occupée → Pelyo (facultatif)') +
          '<div><p class="g-lab">Pour arrêter</p>' + code('##61#', 'Couper le renvoi sans réponse') + code('##67#', 'Couper le renvoi si occupé') + '</div>' +
          '<p class="g-note">Ligne fixe ou box : le renvoi se règle parfois dans l’espace client de l’opérateur. Le Centre d’aide peut vous guider.</p>'
        : '<div class="g-secu-bloc"><b>Votre numéro Pelyo est en préparation</b><small>Il est attribué automatiquement au début de votre essai ou de votre abonnement, en quelques minutes. Vous recevrez une notification, et le code à composer s’affichera ici.</small></div>') +
      (reel ? '' : '<p class="g-note">Compte démo : numéro d’exemple.</p>') +
    '</div><div class="g-foot"><div class="g-acts"><button class="g-act g-off" data-fermer>Fermer</button></div></div>';
  }

  function feuilleTexte(titre, texte){
    return '<div class="g-top">' + esc(titre) + '</div>' +
      '<div class="g-body g-mid-v"><p class="g-quote" style="max-width:280px">' + esc(texte) + '</p></div>' +
      '<div class="g-foot"><div class="g-acts"><button class="g-act g-off" data-fermer>Fermer</button></div></div>';
  }

  function feuilleMentions(){
    var legal=D_.mentionsLegales;
    return '<div class="g-top">Mentions légales</div><div class="g-body g-legal">' +
      '<p class="g-legal-warning"><b>Projet pour la version officielle.</b> Texte incomplet, à vérifier et compléter avant publication.</p>'+
      '<h2>Éditeur</h2><p>Le site web Pelyo et les applications Pelyo destinées aux gérants, aux équipes de cuisine et aux commerciaux sont édités par <strong>'+esc(legal.editeur)+'</strong>, '+esc(legal.forme)+' au capital de <strong>'+esc(legal.capital)+'</strong>, dont le siège social est situé <strong>'+esc(legal.adresse)+'</strong>.</p>'+
      '<p>'+esc(legal.nomCommercial)+' est le nom commercial sous lequel '+esc(legal.editeur)+' propose son service.</p>'+
      '<h2>Contact</h2><p><a href="mailto:'+esc(legal.email)+'">'+esc(legal.email)+'</a><br><a href="tel:'+esc(legal.telephone.replace(/\s/g,''))+'">'+esc(legal.telephone)+'</a></p>'+
      '<h2>Directeur de la publication</h2><p><strong>'+esc(legal.directeur)+'</strong>, '+esc(legal.fonctionDirecteur)+'.</p></div>';
  }

  /* -------------------------------- rendu -------------------------------- */
  function corps(){
    if (ecran === "soir")      return vueSoir();
    if (ecran === "appels")    return vueAppels();
    if (ecran === "carte")     return vueCarte();
    if (ecran === "assistant") return vueAssistant();
    return vueReglages();
  }

  function feuille(){
    if (!sheet) return "";
    var dedans =
      sheet.type === "produit"   ? feuilleProduit(sheet.id) :
      sheet.type === "produit-edit" ? feuilleProduitEdit() :
      sheet.type === "import"    ? feuilleImport() :
      sheet.type === "signature" ? feuilleSignature() :
      sheet.type === "prenom"    ? feuillePrenom() :
      sheet.type === "abo"       ? feuilleAbo() :
      sheet.type === "routage"   ? feuilleRoutage() :
      sheet.type === "donnees"   ? feuilleDonnees() :
      sheet.type === "service"   ? feuilleService() :
      sheet.type === "appel"     ? feuilleAppel() :
      sheet.type === "voix"      ? feuilleVoix() :
      sheet.type === "acces-cuisine" ? feuilleAccesCuisine() :
      sheet.type === "securite"  ? feuilleSecurite() :
      sheet.type === "notifs"    ? feuilleNotifs() :
      sheet.type === "renvoi"    ? feuilleRenvoi() :
      sheet.type === "livreurs"  ? feuilleLivreurs() :
      sheet.type === "balance"   ? feuilleBalance() :
      sheet.type === "client"    ? feuilleClient() :
      sheet.type === "horaires" || sheet.type === "livraison" ? feuilleOrganisation(sheet.type) :
      sheet.type === "parcours"  ? feuilleTexte("Confirmation et sécurité", D_.regles.confirmation + ' ' + D_.regles.allergenes) :
      sheet.type === "langues"   ? feuilleTexte("Langues de l’assistant", langues.join(' · ') + '.' + (reel ? '' : ' Langues configurées dans les données d’exemple.') + ' La modification et la reconnaissance vocale multilingue restent à connecter.') :
      sheet.type === "caisse"    ? feuilleTexte("Caisse et connexions", 'Aucune caisse connectée. Cible : commandes IA confirmées vers la caisse ; commandes validées en caisse vers Pelyo, sans doublons. Les statistiques consolidées et les prévisions de stocks attendent cette connexion. Pelyo ne gère pas les encaissements.') :
      sheet.type === "rgpd"      ? feuilleTexte("Annonce IA et données", D_.regles.rgpd) :
      sheet.type === "mentions"  ? feuilleMentions() :
      sheet.type === "paiement"  ? feuilleTexte("Encaissement", D_.regles.paiement) : "";
    return '<section class="g-sheet' + (sheet.on ? " g-on" : "") + '" role="dialog" aria-modal="true" aria-label="Détail et paramètres">' + '<button class="g-back" data-fermer>← Retour</button>' + dedans + '</section>';
  }

  /* Ce que l'appli gérant donne aux modules (voir src/modules.js). */
  PelyoModules.contexte('gerant', {
    esc:esc, eur:function(c){ return api.eur(c); }, nomResto:nomResto, lesClients:lesClients,
    reel:function(){ return reel; }, repeindre:function(){ peindre(); }
  });
  PelyoModules.quandPret(function(){ if (root) peindre(); });

  function peindre(){
    var ancien=root.querySelector('.g-main'), scroll=ancien && root.getAttribute('data-page')===ecran ? ancien.scrollTop : 0;
    var ancienSheet=root.querySelector('.g-sheet .g-body'), scrollSheet=ancienSheet ? ancienSheet.scrollTop : 0;
    var active=document.activeElement, focusAttr=null;
    if(root.contains(active)) ['data-charge','data-ton','data-vitesse','data-filtre-appels','data-cat','data-ecran','data-rejeu','data-stoprejeu','data-consent','data-theme','data-ventes-echelle','data-tri','data-rupture','data-activite-echelle','data-ia','data-abo-choisir','data-plafond'].some(function(a){if(active.hasAttribute(a)){focusAttr='['+a+'="'+active.getAttribute(a)+'"]';return true;}return false;});
    var entree=root.getAttribute('data-page')!==ecran;
    if(entree && ecran==='appels') animActivite=true;
    root.classList.toggle('g-dark',theme==='dark');
    root.setAttribute('data-page',ecran);
    root.innerHTML = '<div class="g-shell"' + (sheet ? ' inert' : '') + '>' + (ecran === 'soir' ? statusbar() : '') + '<main class="g-main' + (entree ? ' g-entree' : '') + '">' + corps() + '</main>' + nav() + '</div>' + feuille();
    if (window.PelyoDemarrage) PelyoDemarrage.rattacher(root);
    root.querySelector('.g-main').scrollTop=scroll;
    var body=root.querySelector('.g-sheet .g-body');if(body) body.scrollTop=scrollSheet;
    var focus=focusAttr ? root.querySelector(focusAttr) : null;
    if(focus && (!sheet || focus.closest('.g-sheet'))) focus.focus({preventScroll:true});
    else if(sheet) root.querySelector('.g-back').focus({preventScroll:true});
    if (sheet && !sheet.on){
      sheet.on = true;
      requestAnimationFrame(function(){
        var s = root.querySelector(".g-sheet");
        if (s) s.classList.add("g-on");
      });
    }
    /* Abonnement : à l'ouverture, la rangée des forfaits démarre sur le plus avantageux. */
    if (sheet && sheet.type === "abo" && !sheet.defile){
      sheet.defile = true;
      var rang = root.querySelector(".g-abo-plans"), vise = root.querySelector(".g-abo-plan.g-abo-avantage");
      if (rang && vise && rang.scrollWidth > rang.clientWidth) rang.scrollLeft = vise.offsetLeft - rang.offsetLeft - 18;
    }
    var tr = root.querySelector("[data-tr]");
    if (tr) tr.scrollTop = tr.scrollHeight;
    if (sheet && sheet.type === 'livreurs' && !reel){ sigLivreurs = signatureLivreurs(); monterCarteLv(); }
  }
  function livreursResume(){
    if (reel) return 'Bientôt avec votre compte';
    var r = registreLv(), n = r.livreurs.filter(function(l){ return l.statut === 'actif'; }).length;
    return n + ' en tournée · code ' + r.code;
  }

  /* ------------------------------ rejeu d'appel ------------------------------ */
  function demarrerRejeu(){
    if(timerRejeu) clearInterval(timerRejeu);
    sheet=null;
    rejeu = { t:0, i:0, vues:[], panier:null, sms:false, confirme:false, fini:false };
    ecran = "appels";
    peindre();
    timerRejeu=api.every(function(){
      if (!rejeu || rejeu.fini){ clearInterval(timerRejeu); timerRejeu=null; return; }
      rejeu.t += 1;
      var avance = false;
      while (rejeu.i < D_.appel.length && D_.appel[rejeu.i].t <= rejeu.t){
        var e = D_.appel[rejeu.i];
        rejeu.vues.push(e);
        if (e.panier) rejeu.panier = { q:e.panier.q, nom:e.panier.nom, opt:e.panier.opt, prix:e.panier.prix, sup:"" };
        if (e.maj && rejeu.panier){
          rejeu.panier.opt = e.maj.opt; rejeu.panier.prix = e.maj.prix; rejeu.panier.sup = e.maj.sup || "";
        }
        if (e.sms) rejeu.sms = true;
        if (e.confirme) rejeu.confirme = true;
        if (e.fin) rejeu.fini = true;
        rejeu.i++; avance = true;
      }
      if (rejeu.t > 90) rejeu.fini = true;
      if (ecran === "appels" && !sheet){
        if(avance) peindre();
        else {var temps=root.querySelector('[data-rejeu-temps]');if(temps) temps.textContent=api.chrono(rejeu.t);}
      }
      else if (avance) { /* l'appel continue en fond */ }
    }, api.reduit() ? 400 : 260);
  }

  /* ------------------------------- montage ------------------------------- */
  function monter(scene, a){
    api = a; D_ = a.data;
    theme = lireTheme();
    ecran='soir';sheet=null;rejeu=null;rupt={};reprise='';
    filtreAppels='tous';filtreCarte='tous';rechercheCarte='';triCarte='populaires';echelleActivite='jour';barreActivite=null;animActivite=true;retourFocus=null;
    charge = D_.resto.charge;
    ouvert=charge!=='stop';
    forfait = D_.resto.forfait;
    langues = D_.voix.langues.slice();
    voix = { prenom:D_.voix.prenom, ton:D_.voix.ton, vitesse:D_.voix.vitesse, accueil:D_.voix.accueil };
    semaine = semaineDemo();
    cuisineAccess = {
      code:"PLYO 4827", codeVisible:false,
      permissions:{modifier:true,annuler:true,adresse:true,ruptures:true,rush:true,pause:true},
      devices:[
        {id:"tablette-principale",nom:"Tablette cuisine principale",info:"Connectée · autorisée aujourd’hui"},
        {id:"telephone-secours",nom:"Téléphone de secours",info:"Hors ligne · autorisé le 24 septembre"}
      ],
      demandes:[{id:"nouvelle-tablette",nom:"Nouvelle tablette Android",info:"Demande reçue à 19 h 42"}]
    };
    routage={mode:'ia',secours:true,delai:20,numero:D_.resto.tel};
    abonnement={fin:'31 mars 2027',resiliation:false,exportFormat:'csv',exportEtat:'vide',plafond:0};
    reel = !!(window.PelyoDonnees && PelyoDonnees.reel());
    clientsReels = null; clientsOublies = {}; tableau = null;
    JSON_CHARGES = D_.charges.map(function(c){ return c.delai; });
    if (reel){
      D_ = donneesReelles(a.data);
      charge = 'normal'; ouvert = true; forfait = 'payg'; langues = ['Français'];
      voix = { prenom:'Pelyo', ton:'chaleureux', vitesse:'normale', accueil:'' };
      semaine = [[], [], [], [], [], [], []];
      chargerTableau();
      chargerCarteReelle();
      cuisineAccess.code = '…'; cuisineAccess.devices = []; cuisineAccess.demandes = [];
      chargerAcces();
      arretAppareils = PelyoDonnees.ecouterAppareils(function(type, a){
        if (type === 'INSERT' && a.statut === 'demande') api.toast('Nouvelle demande de connexion cuisine : ' + a.nom + '.');
        chargerAcces();
      });
    }

    root = document.createElement("div");
    root.className = "g-app";
    scene.appendChild(root);
    peindre();
    numeroPelyo = ''; demarrageAFaire = false;
    if (reel){
      PelyoDonnees.etatDemarrage(function(e, x){
        if (e || !x) return;   /* sans la mise à jour « demarrage » : rien d'automatique */
        numeroPelyo = x.numero_pelyo || '';
        /* Plus d'ouverture automatique par-dessus l'appli : une carte sur le
           pilotage propose la mise en route tant qu'elle n'est pas finie. */
        demarrageAFaire = !x.demarrage_fini_at;
        if (demarrageAFaire && ecran === 'soir' && !sheet) peindre();
      });
    }

    root.addEventListener('submit',function(ev){
      if(ev.target.hasAttribute('data-secu-form')){ev.preventDefault();changerMdp(ev.target);return;}
      if(ev.target.hasAttribute('data-email-form')){ev.preventDefault();changerEmailForm(ev.target);return;}
      if(ev.target.hasAttribute('data-recherche-form')){ev.preventDefault();rechercheCarte=root.querySelector('#g-search').value;peindre();root.querySelector('#g-search').focus();}
    });
    root.addEventListener('keydown',function(ev){
      if(ev.key==='Escape' && (sheet || rejeu)){ev.stopPropagation();ev.preventDefault();sheet=null;rejeu=null;peindre();var back=retourFocus ? root.querySelector(retourFocus) : null;if(back) back.focus();}
      if(ev.key==='Tab' && sheet){var items=root.querySelectorAll('.g-sheet button,.g-sheet input');var first=items[0],last=items[items.length-1];if(ev.shiftKey && document.activeElement===first){ev.preventDefault();last.focus();}else if(!ev.shiftKey && document.activeElement===last){ev.preventDefault();first.focus();}}
    });

    /* Livreurs : la carte bouge en direct ; la feuille se redessine quand
       une demande, un livreur ou une tournée change. */
    api.every(function(){
      if (!sheet || sheet.type !== 'livreurs' || reel || sheet.editCode) return;
      deplacerSimules();
      if (signatureLivreurs() !== sigLivreurs) peindre(); else dessinerLivreurs();
    }, 2000);

    api.every(function(){
      var n = root.querySelectorAll("[data-hor]");
      for (var i = 0; i < n.length; i++) n[i].textContent = api.heure();
    }, 20000);

    root.addEventListener("pointerdown", function(ev){
      var svg = ev.target.closest && ev.target.closest("[data-graphe]");
      if (!svg) return;
      glisse = svg;
      svg.classList.add("g-glisse");
      try { svg.setPointerCapture(ev.pointerId); } catch(e){}
      glisser(svg, ev.clientX);
    });
    root.addEventListener("pointermove", function(ev){
      if (glisse){ glisser(glisse, ev.clientX); return; }
      var svg = ev.pointerType === "mouse" && ev.target.closest && ev.target.closest("[data-graphe]");
      if (svg) glisser(svg, ev.clientX);
    });
    function finGlisse(){ if (glisse){ glisse.classList.remove("g-glisse"); relacher(glisse); } glisse = null; }
    root.addEventListener("pointerup", finGlisse);
    root.addEventListener("pointercancel", finGlisse);
    root.addEventListener("pointerout", function(ev){
      /* Souris qui quitte le graphique sans clic : retour au point le plus proche. */
      if (glisse || ev.pointerType !== "mouse") return;
      var svg = ev.target.closest && ev.target.closest("[data-graphe]");
      if (svg && !svg.contains(ev.relatedTarget)) relacher(svg);
    });

    root.addEventListener("input", function(ev){
      var pe = ev.target.dataset || {};
      if (sheet && sheet.type === 'import'){
        if (pe.impTexte !== undefined){
          var vide = !(sheet.texte || '').trim(); sheet.texte = ev.target.value;
          if (vide !== !sheet.texte.trim()){ var bl = root.querySelector('[data-imp-lire]'); if (bl) bl.disabled = !sheet.fichiers.length && !sheet.texte.trim(); }
          return;
        }
        if (pe.impNom !== undefined){ sheet.lignes[Number(pe.impNom)].nom = ev.target.value; return; }
        if (pe.impPrix !== undefined){ sheet.lignes[Number(pe.impPrix)].prix = ev.target.value; return; }
      }
      if (sheet && sheet.brouillon && (pe.pe || pe.peG || pe.peS)){
        if (pe.pe) sheet.brouillon[pe.pe] = ev.target.value;
        else { var q = (pe.peG || pe.peS).split(':'); (pe.peG ? sheet.brouillon.groupes : sheet.brouillon.supplements)[Number(q[0])][q[1]] = ev.target.value; }
        return;
      }
      if (ev.target.id === "g-abo-sim" && sheet){
        sheet.sim = Number(ev.target.value);
        majSimulation(sheet.sim);
      }
      if (ev.target.id === "g-gx-recherche"){
        /* Filtre instantané des réglages, sans redessiner. */
        var qg = api.norm(ev.target.value), totalGx = 0;
        [].forEach.call(root.querySelectorAll(".g-gx-groupe"), function(g){
          var vus = 0;
          [].forEach.call(g.querySelectorAll(".g-gx-ligne"), function(l){
            var ok = !qg || l.getAttribute("data-cherche").indexOf(qg) >= 0;
            l.hidden = !ok; if (ok) vus++;
          });
          g.hidden = !vus; totalGx += vus;
        });
        var videGx = root.querySelector(".g-gx-vide");
        if (videGx) videGx.hidden = totalGx > 0;
      }
      if (ev.target.id === "g-search"){
        /* Filtre instantané, sans redessiner : le clavier reste ouvert. */
        rechercheCarte = ev.target.value;
        var q = api.norm(rechercheCarte), vus = 0;
        [].forEach.call(root.querySelectorAll(".g-tile[data-cherche]"), function(t){
          var ok = !q || t.getAttribute("data-cherche").indexOf(q) >= 0;
          t.hidden = !ok;
          if (ok) vus++;
        });
        var compte = root.querySelector("[data-carte-compte]"), vide = root.querySelector(".g-carte-vide");
        if (compte) compte.innerHTML = compteProduits(vus);
        if (vide) vide.hidden = vus > 0;
      }
      var champBal = ev.target.getAttribute && ev.target.getAttribute("data-bal-champ");
      if (champBal){
        var cb = champBal.split(":"), val = ev.target.value;
        PelyoBalance.modifier(function(x){
          var e = x.recettes[cb[0]] && x.recettes[cb[0]][+cb[1]];
          if (!e) return;
          if (cb[2] === "nom") e.nom = val.trim() || "Ingrédient";
          else { var n = Math.max(0, Math.min(5000, Math.round(+val) || 0)); e[cb[2]] = n; }
        });
      }
      if (ev.target.id === "g-prenom"){
        var ap = root.querySelector("[data-apercu]");
        if (ap) ap.textContent = ev.target.value || "…";
      }
    });

    root.addEventListener("change", function(ev){
      var de = ev.target.dataset || {};
      if (sheet && de.exportClients !== undefined){ sheet.exportClients = ev.target.checked; peindre(); if (sheet.exportClients){ var m = root.querySelector('#g-mdp-export'); if (m) m.focus(); } return; }
      if (!sheet || sheet.type !== 'import') return;
      if (de.impFichier !== undefined && ev.target.files && ev.target.files.length){ ajouterFichiersCarte(ev.target.files); return; }
      if (de.impCoche !== undefined){
        /* Sans redessiner : la liste garde sa position. */
        sheet.lignes[Number(de.impCoche)].coche = ev.target.checked;
        ev.target.parentNode.classList.toggle('g-imp-off', !ev.target.checked);
        var n = cochees().length, ba = root.querySelector('[data-imp-ajouter]');
        if (ba){ ba.disabled = !n; ba.textContent = n ? 'Ajouter ' + n + ' produit' + (n > 1 ? 's' : '') : 'Aucun produit coché'; }
      }
    });

    root.addEventListener("click", function(ev){
      var t = ev.target;
      if (!t.closest) return;
      var SEL = "[data-ecran],[data-charge],[data-arret],[data-ia],[data-cuisine],[data-rejeu],[data-aide]," +
                "[data-stoprejeu],[data-transfert],[data-appel],[data-produit],[data-import]," +
                "[data-rupture],[data-ton],[data-vitesse],[data-test],[data-signature]," +
                "[data-consent],[data-prenom],[data-prenom-ok],[data-sheet],[data-fermer],[data-filtre-appels],[data-cat],[data-reset-carte],[data-aller-alertes]," +
                "[data-code-show],[data-code-renew],[data-toggle-perm],[data-device-approve],[data-device-refuse],[data-device-revoke]," +
                "[data-route],[data-secours],[data-delai],[data-resilier],[data-export-format],[data-export],[data-theme],[data-ventes-echelle],[data-tri],[data-activite-echelle],[data-plus-commandes],[data-abo-choisir],[data-abo-confirmer],[data-abo-annuler],[data-plafond],[data-oeil],[data-secu-lien],[data-secu-autres],[data-lv-activer],[data-lv-refuser],[data-lv-retirer],[data-lv-code-edit],[data-lv-code-ok],[data-lv-code-nouveau]," +
                "[data-bal-relier],[data-bal-delier],[data-bal-sim],[data-bal-reglage],[data-bal-mode],[data-bal-tol],[data-bal-tol-partout],[data-bal-type],[data-bal-ordre-partout],[data-bal-produit],[data-bal-bouge],[data-bal-suppr],[data-bal-ajout],[data-client],[data-bilan],[data-bilan-heure],[data-mod],[data-clients-filtre],[data-clients-tri],[data-client-oublier],[data-activite],[data-org-enregistrer],[data-produit-nouveau],[data-produit-modifier],[data-demarrage],[data-pe-ajout],[data-pe-retire],[data-pe-enregistrer],[data-pe-supprimer],[data-imp-retire],[data-imp-lire],[data-imp-recommencer],[data-imp-ajouter],[data-notif-activer],[data-notif-pref],[data-notif-test],[data-notif-desactiver],[data-copier]";
      var b = t.closest(SEL);
      if (!b) return;
      var d = b.dataset;
      if(d.theme){theme=d.theme==='dark'?'dark':'light';try{localStorage.setItem(CLE_THEME,theme);}catch(e){}peindre();return;}
      if(!sheet){Array.prototype.some.call(b.attributes,function(a){if(a.name.indexOf('data-')===0){retourFocus='['+a.name+'="'+a.value+'"]';return true;}return false;});}
      if(d.filtreAppels){filtreAppels=d.filtreAppels;peindre();return;}
      if(d.cat!==undefined){filtreCarte=d.cat;peindre();return;}
      if(d.tri){triCarte=d.tri;peindre();return;}
      if(d.activiteEchelle){echelleActivite=d.activiteEchelle;barreActivite=null;animActivite=true;limiteCommandes=6;peindre();return;}
      if(d.plusCommandes!==undefined){limiteCommandes+=20;peindre();return;}
      if(d.resetCarte!==undefined){rechercheCarte='';filtreCarte='tous';peindre();return;}
      if(d.allerAlertes!==undefined){filtreAppels='attention';ongletActivite='appels';ecran='appels';peindre();root.querySelector('.g-main').scrollTop=0;return;}
      if(d.codeShow!==undefined){cuisineAccess.codeVisible=!cuisineAccess.codeVisible;peindre();return;}
      if(reel && d.togglePerm){
        var droit = d.togglePerm, valeur = !cuisineAccess.permissions[droit];
        PelyoDonnees.changerPermission(droit, valeur, apresAcces(valeur ? 'Autorisation cuisine activée.' : 'Validation du gérant désormais nécessaire.'));
        return;
      }
      if(reel && d.deviceApprove){ PelyoDonnees.deciderAppareil(d.deviceApprove, true, apresAcces('Appareil autorisé : la cuisine s’ouvre sur la tablette.')); return; }
      if(reel && d.deviceRefuse){ PelyoDonnees.deciderAppareil(d.deviceRefuse, false, apresAcces('Demande de connexion refusée.')); return; }
      if(reel && d.deviceRevoke){
        if(!window.confirm('Révoquer cet appareil ? Il perdra immédiatement l’accès à la cuisine.')) return;
        PelyoDonnees.revoquerAppareil(d.deviceRevoke, apresAcces('Appareil révoqué : il n’a plus accès.'));
        return;
      }
      if(d.codeRenew!==undefined){
        if(!window.confirm('Tirer un nouveau code ? L’ancien ne fonctionnera plus pour les nouveaux appareils ; ceux déjà autorisés restent connectés.')) return;
        PelyoDonnees.renouvelerCode(function(e){ if(!e) cuisineAccess.codeVisible = true; apresAcces('Nouveau code cuisine créé.')(e); });
        return;
      }
      if(d.togglePerm){cuisineAccess.permissions[d.togglePerm]=!cuisineAccess.permissions[d.togglePerm];api.toast(cuisineAccess.permissions[d.togglePerm] ? 'Autorisation cuisine activée.' : 'Validation du gérant désormais nécessaire.');peindre();return;}
      if(d.deviceApprove){
        cuisineAccess.demandes=cuisineAccess.demandes.filter(function(x){if(x.id===d.deviceApprove){cuisineAccess.devices.push({id:x.id,nom:x.nom,info:'Connectée · autorisée à l’instant'});return false;}return true;});
        api.toast('Appareil autorisé et relié à votre restaurant.');peindre();return;
      }
      if(d.deviceRefuse){cuisineAccess.demandes=cuisineAccess.demandes.filter(function(x){return x.id!==d.deviceRefuse;});api.toast('Demande de connexion refusée.');peindre();return;}
      if(d.deviceRevoke){cuisineAccess.devices=cuisineAccess.devices.filter(function(x){return x.id!==d.deviceRevoke;});api.toast('Appareil révoqué et déconnecté.');peindre();return;}
      if(d.ia!==undefined){
        if(routage.mode==='restaurant'){routage.mode=modeAvantVeille||'ia';api.toast(voix.prenom+' reprend les appels.');}
        else{modeAvantVeille=routage.mode;routage.mode='restaurant';api.toast('IA en veille : les prochains appels sonnent au restaurant.');}
        enregistrer({ routage:routage.mode });
        /* Sur place, sans redessiner : seule la toque change, en douceur (voir gerant.css). */
        var iaOn=routage.mode!=='restaurant', hero=root.querySelector('.g-dashboard-hero'), etat=root.querySelector('[data-ia-etat]');
        if(!hero){peindre();return;}
        hero.classList.toggle('g-ia-off',!iaOn);
        b.setAttribute('aria-checked',String(iaOn));
        b.setAttribute('aria-label',libelleIa(iaOn));
        if(etat){etat.textContent=iaOn?'En ligne':'En veille';etat.classList.toggle('g-veille',!iaOn);}
        return;
      }
      if(d.route){if(d.route!=='restaurant')modeAvantVeille=d.route;routage.mode=d.route;enregistrer({ routage:d.route });api.toast(d.route==='ia' ? 'L’IA répondra aux prochains appels.' : d.route==='restaurant' ? 'Les prochains appels seront transférés au restaurant.' : 'Le routage automatique est activé.');peindre();return;}
      if(d.secours!==undefined){routage.secours=!routage.secours;enregistrer({ reprise_ia:routage.secours });api.toast(routage.secours ? 'L’IA reprendra les appels sans réponse.' : 'La reprise automatique est désactivée.');peindre();return;}
      if(d.delai){routage.delai=Number(d.delai);enregistrer({ reprise_ia_delai_s:routage.delai });peindre();return;}
      if(reel && d.export!==undefined){exporterReel();return;}
      if(reel && (d.resilier!==undefined || d.aboConfirmer!==undefined)){api.toast(d.aboConfirmer!==undefined ? 'Changement de forfait : bientôt depuis l’appli. En attendant, écrivez au Centre d’aide.' : 'Bientôt disponible depuis l’appli. En attendant, écrivez au Centre d’aide.');return;}
      if(d.resilier!==undefined){abonnement.resiliation=!abonnement.resiliation;api.toast(abonnement.resiliation ? 'Résiliation simulée pour la fin de l’engagement.' : 'Demande simulée annulée.');peindre();return;}
      if(d.exportFormat){var mdpX=root.querySelector('#g-mdp-export'),mdpV=mdpX?mdpX.value:'';abonnement.exportFormat=d.exportFormat;abonnement.exportEtat='vide';peindre();mdpX=root.querySelector('#g-mdp-export');if(mdpX&&mdpV)mdpX.value=mdpV;mdpV='';return;}
      if(d.export!==undefined){abonnement.exportEtat='pret';api.toast('Compte démo : aucun fichier réel. Sur votre compte, il se télécharge directement.');peindre();return;}

      if (d.ecran){ ecran = d.ecran; sheet=null; if (ecran !== "appels") rejeu = null; peindre();root.querySelector('.g-main').scrollTop=0; return; }
      if (d.charge){
        charge = d.charge; ouvert = charge !== "stop";
        enregistrer({ charge:charge }, true);
        api.toast(niveau().dit);
        peindre(); return;
      }
      if (d.arret !== undefined){
        ouvert = !ouvert;
        if (!ouvert){
          charge = "stop";
          var dt = new Date(Date.now() + 30*60000);
          reprise = String(dt.getHours()).padStart(2,"0") + "h" + String(dt.getMinutes()).padStart(2,"0");
          api.toast("Commandes arrêtées. L'IA répond encore et annonce une reprise à " + reprise + ".");
        } else {
          charge = reel ? "normal" : "rush";
          api.toast("Commandes rouvertes — " + niveau().delai + " minutes annoncées.");
        }
        enregistrer({ charge:charge }, true);
        peindre(); return;
      }
      if (d.cuisine !== undefined){ api.ouvrir("cuisine"); return; }
      if (d.rejeu !== undefined){ demarrerRejeu(); return; }
      if (d.stoprejeu !== undefined){ rejeu = null; peindre(); return; }
      if (d.transfert !== undefined){
        rejeu = null;
        api.toast("Appel transféré au restaurant — allergie évoquée, aucune commande enregistrée.");
        peindre(); return;
      }
      if (d.appel !== undefined){ sheet={type:'appel',index:Number(d.appel)}; peindre(); return; }
      if (d.client){ sheet = { type:'client', id:d.client }; peindre(); return; }
      if (d.bilan !== undefined){ bilan.actif = !bilan.actif; garderBilan(); peindre(); return; }
      if (d.bilanHeure){ var hb = bilan.heure.split(':'), mb = (+hb[0] * 60 + +hb[1] + (+d.bilanHeure) + 1440) % 1440; bilan.heure = ('0' + Math.floor(mb / 60)).slice(-2) + ':' + ('0' + mb % 60).slice(-2); garderBilan(); peindre(); return; }
      if (d.mod){ PelyoModules.clic('gerant', d.mod, b); return; }
      if (d.clientsFiltre){ filtreClients = d.clientsFiltre; peindre(); return; }
      if (d.clientsTri){ triClients = d.clientsTri; peindre(); return; }
      if (d.activite){ ongletActivite = d.activite; peindre(); return; }
      if (d.demarrage !== undefined){ ouvrirDemarrage('visite'); return; }
      if (d.produitNouveau !== undefined || d.produitModifier){
        sheet = { type:'produit-edit', brouillon:brouillonProduit(d.produitModifier || null), on:!!(sheet && d.produitModifier) }; peindre(); return;
      }
      if (d.peAjout && sheet && sheet.brouillon){
        if (d.peAjout === 'groupe') sheet.brouillon.groupes.push({ nom:'', min:1, max:1, choix:'' });
        else sheet.brouillon.supplements.push({ nom:'', prix:'' });
        peindre();
        var champs = root.querySelectorAll(d.peAjout === 'groupe' ? '[data-pe-g$=":nom"]' : '[data-pe-s$=":nom"]');
        if (champs.length) champs[champs.length - 1].focus();
        return;
      }
      if (d.peRetire && sheet && sheet.brouillon){
        var pr = d.peRetire.split(':');
        (pr[0] === 'g' ? sheet.brouillon.groupes : sheet.brouillon.supplements).splice(Number(pr[1]), 1);
        peindre(); return;
      }
      if (d.peEnregistrer !== undefined && sheet && sheet.brouillon){
        var prod = produitDepuisBrouillon(sheet.brouillon);
        if (typeof prod === 'string'){ api.toast(prod); return; }
        if (!reel){ appliquerProduitDemo(prod); sheet = null; api.toast('« ' + prod.nom + ' » enregistré. L’assistant le proposera dès le prochain appel.'); peindre(); return; }
        b.disabled = true;
        PelyoDonnees.enregistrerProduit(prod, function(e){
          b.disabled = false;
          if (e){ api.toast(e); return; }
          sheet = null; api.toast('« ' + prod.nom + ' » enregistré. L’assistant le proposera dès le prochain appel.');
          chargerCarteReelle(); peindre();
        });
        return;
      }
      if (d.peSupprimer !== undefined && sheet && sheet.brouillon && sheet.brouillon.id){
        var bp = sheet.brouillon;
        if (!window.confirm('Supprimer « ' + bp.nom + ' » de la carte ? Les commandes passées gardent leur historique.')) return;
        if (!reel){
          D_.menu.forEach(function(c){ c.items = c.items.filter(function(i){ return i.id !== bp.id; }); });
          D_.menu = D_.menu.filter(function(c){ return c.items.length; });
          sheet = null; api.toast('« ' + bp.nom + ' » retiré de la carte.'); peindre(); return;
        }
        PelyoDonnees.supprimerProduit(bp.id, function(e){
          if (e){ api.toast(e); return; }
          sheet = null; api.toast('« ' + bp.nom + ' » retiré de la carte.'); chargerCarteReelle(); peindre();
        });
        return;
      }
      if (d.orgEnregistrer){
        var fauteOrg = enregistrerOrganisation(d.orgEnregistrer);
        if (fauteOrg){ api.toast(fauteOrg); return; }
        sheet = null; api.toast(d.orgEnregistrer === 'horaires' ? 'Horaires enregistrés.' : 'Livraison enregistrée.'); peindre(); return;
      }
      if (d.clientOublier){
        var co = trouverClient(d.clientOublier);
        if (reel){
          if (!co || !window.confirm('Ne plus reconnaître ' + co.prenom + ' ? Son nom, son numéro, ses allergies et ses appels seront effacés. Les montants de ses commandes restent dans vos chiffres. C’est définitif.')) return;
          PelyoDonnees.oublierClient(co.tel, function(e){
            if (e){ api.toast(e); return; }
            clientsOublies[co.id] = true; sheet = null; peindre();
            api.toast(co.prenom + ' ne sera plus reconnu par Pelyo. Ses données personnelles sont effacées.');
            chargerTableau();
          });
          return;
        }
        if (!co || !window.confirm('Ne plus reconnaître ' + co.prenom + ' ? Pelyo le traitera comme un nouveau client. Ses commandes restent dans l’historique.')) return;
        clientsOublies[co.id] = true; sheet = null; peindre();
        api.toast(co.prenom + ' ne sera plus reconnu par Pelyo.');
        return;
      }
      if (d.produit){ sheet = { type:"produit", id:d.produit }; limiteCommandes = 6; peindre(); return; }
      if (d.ventesEchelle && sheet){ sheet.echelle = d.ventesEchelle; sheet.point = null; sheet.ventesAnim = true; limiteCommandes = 6; peindre(); return; }
      if (d.import !== undefined){ sheet = { type:'import', etape:'choisir', fichiers:[], texte:'' }; peindre(); return; }
      if (sheet && sheet.type === 'import'){
        if (d.impRetire !== undefined){ sheet.fichiers.splice(Number(d.impRetire), 1); sheet.erreur = null; peindre(); return; }
        if (d.impLire !== undefined){ lireCarteImport(); return; }
        if (d.impRecommencer !== undefined){ sheet = { type:'import', etape:'choisir', fichiers:sheet.fichiers || [], texte:sheet.texte || '' }; peindre(); return; }
        if (d.impAjouter !== undefined){ ajouterCarteImport(); return; }
      }
      if (d.rupture){
        var item=null;D_.menu.forEach(function(c){c.items.forEach(function(i){if(i.id===d.rupture)item=i;});});
        rupt[d.rupture] = !indisponible(item);
        dernierBascule = d.rupture;
        if (reel){
          var idRupt = d.rupture, horsVente = rupt[idRupt];
          PelyoDonnees.changerDisponibilite('produit', idRupt, !horsVente, null, function(e){
            if (e){ api.toast(e); delete rupt[idRupt]; peindre(); return; }
            item.dispo = !horsVente; delete rupt[idRupt];
          });
        }
        api.toast(rupt[d.rupture]
          ? "En rupture dès le prochain appel. Les commandes déjà confirmées ne sont pas touchées."
          : "De nouveau proposé par l'IA.");
        peindre(); return;
      }
      if (d.ton){ voix.ton = d.ton; enregistrer({ assistant_ton:d.ton }); peindre(); return; }
      if (d.vitesse){ voix.vitesse = d.vitesse; enregistrer({ assistant_vitesse:d.vitesse }); peindre(); return; }
      if (d.test !== undefined){
        demarrerRejeu();
        api.toast("Simulation d’un appel d’exemple, sans appel téléphonique réel.");
        return;
      }
      if (d.signature !== undefined){ sheet = { type:"signature", consent:false }; peindre(); return; }
      if (d.consent !== undefined){
        if (!sheet.consent){ sheet.consent = true; api.toast("Consentement enregistré."); }
        else { sheet = null; api.toast("Parcours simulé terminé. Aucun son enregistré ni voix clonée."); }
        peindre(); return;
      }
      if (d.prenom !== undefined && d.prenomOk === undefined){ sheet = { type:"prenom" }; peindre(); return; }
      if (d.prenomOk !== undefined){
        var v = root.querySelector("#g-prenom");
        if (v && v.value.trim()) voix.prenom = v.value.trim();
        voix.accueil = "Bonjour, " + nomResto() + ", je suis " + voix.prenom + ", l’assistant vocal automatisé du restaurant. Que puis-je vous préparer ?";
        enregistrer({ assistant_prenom:voix.prenom });
        sheet = null;
        api.toast("L'assistant s'appelle désormais " + voix.prenom + ".");
        peindre(); return;
      }
      if (d.aide !== undefined){ RIA.aide(); return; }
      if (sheet && sheet.type === 'balance' && clicBalance(d)) return;
      if (d.lvActiver){
        PelyoTournee.modifierRegistre(function(r){
          var dem = r.demandes.filter(function(x){ return x.id === d.lvActiver; })[0];
          r.demandes = r.demandes.filter(function(x){ return x.id !== d.lvActiver; });
          if (dem) r.livreurs.push({id:dem.id, nom:dem.nom, statut:'actif', depuis:Date.now(), pos:PelyoTournee.RESTO});
        });
        api.toast('Mode livreur activé : le téléphone passe en lecture seule.'); peindre(); return;
      }
      if (d.lvRefuser){ PelyoTournee.modifierRegistre(function(r){ r.demandes = r.demandes.filter(function(x){ return x.id !== d.lvRefuser; }); }); api.toast('Demande refusée.'); peindre(); return; }
      if (d.lvRetirer){
        var lv = registreLv().livreurs.filter(function(x){ return x.id === d.lvRetirer; })[0];
        if (!window.confirm('Retirer le mode livreur de ' + (lv ? lv.nom : 'ce livreur') + ' ? Ses commandes en cours seront réattribuées.')) return;
        PelyoTournee.modifierRegistre(function(r){ r.livreurs = r.livreurs.filter(function(x){ return x.id !== d.lvRetirer; }); });
        api.toast('Mode livreur retiré.'); peindre(); return;
      }
      if (d.lvCodeEdit !== undefined){ sheet.editCode = true; peindre(); var champ = root.querySelector('#g-lv-code'); if (champ){ champ.focus(); champ.select(); } return; }
      if (d.lvCodeOk !== undefined){
        var code = PelyoTournee.normCode((root.querySelector('#g-lv-code') || {}).value);
        if (code.length < 4 || code.length > 10){ api.toast('Le code doit faire de 4 à 10 lettres ou chiffres.'); return; }
        PelyoTournee.modifierRegistre(function(r){ r.code = code; });
        sheet.editCode = false; api.toast('Code livreur enregistré.'); peindre(); return;
      }
      if (d.lvCodeNouveau !== undefined){
        var nouveau = 'LIV-' + String(1000 + Math.floor(Math.random() * 9000));
        PelyoTournee.modifierRegistre(function(r){ r.code = nouveau; });
        api.toast('Nouveau code : ' + nouveau + '. L’ancien ne marche plus.'); peindre(); return;
      }
      if (d.oeil !== undefined){
        var champMasque = b.parentNode.querySelector('input'), voir = champMasque.type === 'password';
        champMasque.type = voir ? 'text' : 'password';
        b.setAttribute('aria-pressed', String(voir));
        b.setAttribute('aria-label', voir ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
        return;
      }
      if (d.secuLien !== undefined){
        if (!reel){ api.toast('Compte démo : aucun e-mail n’est envoyé.'); return; }
        if (!sheet.email){ api.toast('Adresse du compte introuvable. Reconnectez-vous.'); return; }
        b.disabled = true;
        PelyoDonnees.motDePasseOublie(sheet.email, function(e){
          if (e){ b.disabled = false; api.toast(e); return; }
          b.textContent = 'Lien envoyé à ' + sheet.email;
          api.toast('Lien envoyé. Ouvrez l’e-mail reçu (pensez aux spams).');
        });
        return;
      }
      if (d.secuAutres !== undefined){
        if (!reel){ api.toast('Compte démo : aucun appareil n’est déconnecté.'); return; }
        if (!window.confirm('Déconnecter votre compte de tous les autres téléphones et ordinateurs ? Cet appareil-ci reste connecté.')) return;
        b.disabled = true;
        PelyoDonnees.deconnecterAutres(function(e){
          b.disabled = false;
          api.toast(e || 'Les autres appareils sont déconnectés.');
        });
        return;
      }
      if (d.copier){
        var copie = d.copier;
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(copie).then(function(){ api.toast('Code copié : ' + copie); }, function(){ api.toast(copie); });
        else api.toast(copie);
        return;
      }
      if (sheet && sheet.type === 'notifs' && (d.notifActiver !== undefined || d.notifPref || d.notifTest !== undefined || d.notifDesactiver !== undefined)){ actionNotifs(d); return; }
      if (d.sheet){
        sheet = { type:d.sheet }; if (d.sheet === 'livreurs') carteLvCadree = false; peindre();
        if (d.sheet === 'notifs') chargerNotifs();
        if (d.sheet === 'securite' && reel){
          var ouverte = sheet;
          PelyoDonnees.emailCompte(function(e, email){
            if (sheet !== ouverte) return;
            sheet.email = email;
            var zone = root.querySelector('[data-secu-email]'); if (zone) zone.textContent = email || 'Adresse introuvable';
          });
        }
        return;
      }
      if (d.aboChoisir || d.aboAnnuler !== undefined || d.aboConfirmer !== undefined || d.plafond !== undefined){
        /* La rangée des forfaits garde sa position de défilement. */
        var rangee = root.querySelector('.g-abo-plans'), gauche = rangee ? rangee.scrollLeft : 0;
        if (d.aboChoisir) sheet.choix = d.aboChoisir;
        if (d.aboAnnuler !== undefined) sheet.choix = null;
        if (d.plafond !== undefined) abonnement.plafond = Number(d.plafond);
        if (d.aboConfirmer !== undefined && sheet.choix){
          forfait = sheet.choix; sheet.choix = null;
          api.toast("Simulation : forfait " + leForfait().nom + " au prochain cycle. Aucun contrat modifié.");
        }
        peindre();
        rangee = root.querySelector('.g-abo-plans');
        if (rangee) rangee.scrollLeft = gauche;
        return;
      }
      if (d.fermer !== undefined){ sheet = null; peindre();var cible=retourFocus ? root.querySelector(retourFocus) : null;if(cible)cible.focus({preventScroll:true});return; }
    });

    return function(){ if(arretAppareils){arretAppareils();arretAppareils=null;} rejeu = null; sheet = null;if(timerRejeu)clearInterval(timerRejeu);timerRejeu=null; };
  }

  RIA.register({
    id:"gerant", nom:"Gérant", badge:"2",
    fond:"linear-gradient(145deg,#D9A273,#A66B3C)", encre:"#1A1206",
    glyph:'<path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4"/>',
    format:"phone",
    css:"gerant.css",
    monter:monter
  });
})();
