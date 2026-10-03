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
  /* Mode connecté (voir pelyo-donnees.js) : pour l'instant, seuls le nom du
     restaurant et l'accès de l'équipe cuisine viennent de la base ; le reste
     de l'écran garde les données d'exemple. */
  var reel = false, arretAppareils = null;
  function nomResto(){ return reel ? PelyoDonnees.restaurant().nom : D_.resto.nom; }
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
  var timerRejeu = null, timerImport = null, retourFocus = null;
  var theme = 'light';
  function lireTheme(){ try { return localStorage.getItem('pelyo:gerant:theme') === 'dark' ? 'dark' : 'light'; } catch(e){ return 'light'; } }


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
  /* Le mois en cours : ce que coûte Pelyo (forfait + dépassement, ou usage +
     10 % du CA en PAYG) face aux commandes prises par l'IA. En démonstration,
     le CA du mois suit le rythme de la soirée d'exemple (CA par minute). */
  function bilanMois(){
    var f = leForfait(), j = D_.jour, minutes = D_.resto.minutes;
    var ca = j.minutes ? Math.round(minutes * j.ca / j.minutes) : 0;
    var commandes = j.minutes ? Math.round(minutes * j.commandes / j.minutes) : 0;
    var depasse = f.minutes ? Math.max(0, minutes - f.minutes) : minutes;
    var cout = f.prix + depasse * f.dep + (f.id === 'payg' ? Math.round(ca * 0.10) : 0);
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
            (f.id === 'payg' ? ' · usage + 10 % du CA' : b.depasse ? ' + ' + b.depasse + ' min de dépassement' : ' · aucun dépassement') + '</small></article>' +
          '<article><span>Retour</span><b>× ' + fois + '</b><small>commandes / prix</small></article>' +
        '</div>' +
        '<button class="g-renta-lien" data-sheet="abo"><span>Forfait ' + esc(f.nom) + ' · ' + b.commandes + ' commandes ce mois</span><b>Mon abonnement ↗</b></button>' +
      '</section>';
  }

  function libelleIa(on){ return 'Assistant IA : ' + (on ? 'actif' : 'en veille, appels transférés au restaurant'); }

  function vueSoir(){
    var j=D_.jour, lv=niveau(), off=nbRuptures(), total=0, ventes={}, meilleur='', meilleurQ=0, quarts=[0,0,0,0], connectes=0;
    D_.menu.forEach(function(c){ total+=c.items.length; });
    D_.commandes.forEach(function(c){
      if(c.total && c.heure && c.heure.slice(0,2)==='19') quarts[Math.min(3,Math.floor(Number(c.heure.slice(3,5))/15))]++;
      c.lignes.forEach(function(l){ventes[l.nom]=(ventes[l.nom]||0)+l.q;if(ventes[l.nom]>meilleurQ){meilleur=l.nom;meilleurQ=ventes[l.nom];}});
    });
    cuisineAccess.devices.forEach(function(d){if(api.norm(d.info).indexOf('connecte')>=0) connectes++;});
    var conversion=j.appels ? Math.round(j.commandes/j.appels*100) : 0;
    var iaOn=routage.mode!=='restaurant';
    var pic=0;for(var qi=1;qi<quarts.length;qi++)if(quarts[qi]>quarts[pic])pic=qi;
    var maxQuart=Math.max.apply(Math,quarts)||1;
    var labels=['19 h','19 h 15','19 h 30','19 h 45'];
    return titre('Ce soir, en un regard','Le pilotage.') +
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
        '<p class="g-caption">Informations de démonstration · actualisation en direct prévue avec les connexions réelles.</p>' +
      '</div></div>' +
      '<div class="g-section-title"><h2>À surveiller</h2><span>Alertes</span></div><div class="g-insights">' +
        '<article><span class="g-insight-mark">' + off + '</span><div><b>Ruptures actives</b><small>' + (total-off) + ' produits sur ' + total + ' en vente · gestion dans l’onglet Carte.</small></div></article>' +
        '<article><span class="g-insight-mark">' + (j.expirees+j.transferts) + '</span><div><b>Appels à vérifier</b><small>Le détail est classé dans l’onglet Activité.</small></div></article>' +
      '</div>' +
      carteRentabilite() +
      '<div class="g-section-title"><h2>Tendances de vente</h2><span>Ce soir</span></div><section class="g-sales-panel">' +
        '<div class="g-sales-highlights"><article><span>Produit le plus vendu</span><b>' + esc(meilleur || 'Aucune vente') + '</b><small>' + meilleurQ + ' unité(s) dans les commandes visibles</small></article><article><span>Créneau le plus actif</span><b>' + labels[pic] + '</b><small>' + quarts[pic] + ' commande(s) visible(s)</small></article></div>' +
        '<div class="g-sales-chart" aria-label="Commandes visibles par quart d’heure">' + quarts.map(function(v,i){return '<span><i style="height:' + Math.max(10,Math.round(v/maxQuart*100)) + '%"></i><small>' + labels[i] + '</small></span>';}).join('') + '</div>' +
      '</section>';
  }

  function feuilleService(){
    return '<div class="g-top">Rythme du service</div><div class="g-body"><p class="g-note">Réglez ce que l’assistant annonce aux prochains clients. Aucun appel réel dans cette démonstration.</p><div class="g-options">' +
      D_.charges.map(function(c){return '<button data-charge="' + c.id + '" aria-pressed="' + (charge===c.id) + '"><b>' + esc(c.nom) + '</b><small>' + (c.delai ? c.delai + ' min annoncées' : 'Plus de nouvelles commandes') + '</small></button>';}).join('') +
      '</div><p class="g-para">' + esc(niveau().dit) + '</p><p class="g-note">' + (!ouvert ? 'Reprise annoncée : ' + esc(reprise || 'à préciser') + '. La reprise automatique n’est pas connectée.' : 'Les commandes déjà confirmées restent inchangées.') + '</p></div><div class="g-foot"><button class="g-act" data-arret>' + (ouvert ? 'Mettre en pause 30 min' : 'Reprendre maintenant') + '</button></div>';
  }

  /* Activité : une barre par heure, jour ou mois ; hauteur = commandes prises
     par l'IA. Touchez une barre pour son chiffre. */
  function graphiqueCommandes(){
    var echelle = echelleActivite, e = ECHELLES.filter(function(x){ return x.id === echelle; })[0];
    var s = serieVentes({id:'resto-commandes'}, echelle, Math.round(D_.jour.commandes / 1.5)), pts = s.pts, n = pts.length;
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
      '<p class="g-ventes-note">Données d’exemple. Glissez le doigt sur les barres pour lire chaque chiffre.</p>' +
    '</section>' +
      '<div class="g-cmds" data-liste="cmd" aria-live="polite">' + graphes.cmd.liste(choisi) + '</div>';
  }

  function vueAppels(){
    if(rejeu) return vueRejeu();
    var a=D_.appels.filter(function(x){return filtreAppels==='tous' || (filtreAppels==='attention' ? x.issue==='transfert'||x.issue==='expiree' : x.issue==='commande');});
    return titre('Ce soir','L’activité.') +
      graphiqueCommandes() +
      '<div class="g-metrics"><div><span>Panier moyen IA</span><b>' + esc(api.eur(D_.jour.panier)) + '</b><small>sur les commandes confirmées</small></div><div><span>Conversation</span><b>' + D_.jour.minutes + '<small> min</small></b><small>temps cumulé ce soir</small></div></div>' +
      '<div class="g-section-title"><h2>Journal des appels</h2><span>Ce soir</span></div>' +
      '<div class="g-filters" aria-label="Filtrer les appels">' + [{id:'tous',t:'Tous'},{id:'commande',t:'Commandes'},{id:'attention',t:'À regarder'}].map(function(f){return '<button data-filtre-appels="' + f.id + '" aria-pressed="' + (filtreAppels===f.id) + '">' + f.t + '</button>';}).join('') + '</div>' +
      '<p class="g-caption">Extrait de ' + D_.appels.length + ' appels fictifs ; les chiffres du bilan couvrent toute la soirée d’exemple.</p><div class="g-list">' +
      a.map(function(x){var i=D_.appels.indexOf(x);return '<button class="g-call-row" data-appel="' + i + '"><span class="g-call-time">' + esc(x.h) + '</span><span><b>' + esc(x.num) + '</b><small>' + esc(x.info || (x.cmd ? 'Commande #'+x.cmd : 'Appel entrant')) + ' · ' + esc(api.dur(x.duree)) + '</small></span><em class="g-issue g-issue-' + x.issue + '">' + (x.issue==='commande' ? esc(api.eur(x.montant)) : x.issue==='transfert' ? 'Transfert' : x.issue==='expiree' ? 'Expiré' : 'Question') + '</em></button>';}).join('') + '</div>' +
      '<p class="g-note">Le détail d’un appel et la démonstration de prise de commande sont séparés.</p><button class="g-act g-off" data-rejeu>Voir une prise de commande simulée</button>';
  }

  function feuilleAppel(){
    var x=D_.appels[sheet.index];
    return '<div class="g-top">Détail de l’appel · ' + esc(x.h) + '</div><div class="g-body"><h2>' + esc(x.num) + '</h2><dl class="g-facts"><dt>Durée</dt><dd>' + esc(api.dur(x.duree)) + '</dd><dt>Issue</dt><dd>' + esc(x.issue==='commande' ? 'Commande enregistrée' : x.issue==='transfert' ? 'Transfert au restaurant' : x.issue==='expiree' ? 'Sans confirmation' : 'Renseignement') + '</dd>' + (x.cmd ? '<dt>Référence associée</dt><dd>#' + x.cmd + '</dd>' : '') + (x.montant ? '<dt>Montant commandé</dt><dd>' + esc(api.eur(x.montant)) + '</dd>' : '') + '</dl>' + (x.info ? '<p class="g-para">' + esc(x.info) + '</p>' : '') + '<p class="g-note">Exemple de journal. Aucune transcription ni aucun enregistrement audio de cet appel ne sont fournis dans la maquette.</p><p class="g-note">' + esc(D_.regles.confirmation) + '</p></div>';
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
        '<button class="g-tile g-tile-import" data-import><span aria-hidden="true">+</span><b>Importer une carte</b><small>Photo, PDF ou site web</small></button>' +
      '</div>' +
      '<p class="g-empty g-carte-vide"' + (visibles ? ' hidden' : '') + '>Aucun produit ne correspond.<button data-reset-carte>Tout afficher</button></p>' +
      '<p class="g-note">Touchez un produit pour ses options, suppléments et courbe de ventes. L’interrupteur le retire de la carte de l’assistant dès le prochain appel.</p>';
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

  function serieVentes(item, echelle, base){
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
  function commandesPoint(cle, p, produit){
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
          '<span class="g-cmds-txt"><b>#' + c.num + ' · ' + esc(titre) + '</b><small>' + esc(jour + (c.livraison ? 'Livraison' : 'Retrait') + ' · ' + c.tel) + '</small></span>' +
          '<strong>' + esc(api.eur(c.total)) + '</strong></summary>' +
          '<div class="g-cmds-articles">' + c.lignes.map(function(l){
            return '<p><span>' + l.q + '× ' + esc(l.nom) + '</span><span>' + esc(api.eur(l.prix)) + '</span></p>';
          }).join('') +
          '<p class="g-cmds-total"><span>Total</span><span>' + esc(api.eur(c.total)) + '</span></p>' +
          '<small>Prise par l’assistant · appel de ' + esc(api.dur(c.duree)) + '</small></div></details>';
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
      '<p class="g-ventes-note">Données d’exemple. Glissez le doigt sur la courbe pour lire chaque point.</p>' +
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
        '<button class="g-act" data-rupture="' + item.id + '">' + (ko ? "Remettre en carte" : "Mettre en rupture") + '</button>' +
        '<button class="g-act g-off" data-fermer>Fermer</button>' +
      '</div></div>';
  }

  function feuilleImport(){
    var etapes = [
      "Photo de la carte, PDF, site web ou saisie",
      "L'IA propose catégories, produits, tailles et prix",
      "Vous vérifiez chaque ligne",
      "Publication — la nouvelle carte s'applique au prochain appel"
    ];
    var n = sheet.etape || 0;
    return '<div class="g-top">Importer une carte · simulation</div>' +
      '<div class="g-body g-mid-v">' +
        '<div class="g-figure' + (n < etapes.length ? " g-pulse" : "") + '">' +
          (n < etapes.length ? Math.round(n / etapes.length * 100) + '<small>%</small>' : 'Prêt') + '</div>' +
        '<p class="g-note">Aucun fichier envoyé : aperçu du futur parcours d’import.</p><div class="g-steps" style="max-width:280px">' +
          etapes.map(function(e, i){
            return '<p class="g-step' + (i < n ? " g-done" : (i === n ? " g-on" : "")) + '">' + esc(e) + '</p>';
          }).join("") +
        '</div>' +
      '</div>' +
      '<div class="g-foot"><div class="g-acts">' +
        (n >= etapes.length
          ? '<button class="g-act" data-publier>Simuler la publication</button>'
          : '<button class="g-act g-off" data-fermer>Annuler</button>') +
      '</div></div>';
  }

  /* ------------------------------- assistant ------------------------------- */
  function vueAssistant(){
    return titre('Votre assistant','L’assistant.') +
      '<section class="g-voice"><div class="g-voice-orb" aria-hidden="true"><i></i><i></i><span><img src="assets/logo-toque.png" width="40" height="40" alt=""></span></div><div class="g-voice-copy"><span class="g-lab">Votre accueil téléphonique</span><h2>' + esc(voix.prenom) + '</h2><p>« ' + esc(voix.accueil) + ' »</p><button class="g-act g-off" data-test>Écouter une simulation <span aria-hidden="true">↗</span></button></div></section>' +
      '<div class="g-section-title"><h2>Personnalité</h2></div>' +
      lien('data-prenom','Prénom de l’assistant',voix.prenom) +
      lien('data-sheet="voix"','Ton et vitesse',voix.ton + ' · ' + voix.vitesse) +
      lien('data-signature','Ma voix signature','Texte guidé et autorisation d’utilisation') +
      '<div class="g-section-title"><h2>Prise de commande</h2></div>' +
      lien('data-sheet="parcours"','Confirmation et sécurité','Récapitulatif, validation, allergies et transfert') +
      lien('data-sheet="langues"','Langues',langues.join(' · ')) +
      '<p class="g-note">L’assistant annonce son caractère automatisé. Les changements sont destinés aux prochains appels.</p>';
  }

  function feuilleVoix(){
    return '<div class="g-top">Ton et vitesse</div><div class="g-body"><h2>Comment parle ' + esc(voix.prenom) + ' ?</h2><p class="g-lab">Le ton</p><div class="g-options">' +
      D_.tons.map(function(t){return '<button data-ton="' + esc(t) + '" aria-pressed="' + (voix.ton===t) + '">' + esc(t) + '</button>';}).join('') +
      '</div><p class="g-lab">Le rythme</p><div class="g-options">' +
      D_.vitesses.map(function(v){return '<button data-vitesse="' + esc(v) + '" aria-pressed="' + (voix.vitesse===v) + '">' + esc(v) + '</button>';}).join('') +
      '</div><p class="g-note">Choix conservés pendant cette session de démonstration. Aucun moteur vocal connecté.</p></div>';
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
    cuisine:'M6 3h12v18H6zM11 18h2', caisse:'M4 10h16v10H4zM7 10V5h10v5M8 14h2M12 14h4', abo:'M3 6h18v12H3zM3 10h18M7 15h3',
    aide:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01', donnees:'M12 4v11m-4-4 4 4 4-4M5 20h14',
    rgpd:'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z', mentions:'M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5',
    paiement:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M15 9a3.5 3.5 0 1 0 0 6M8 11h5M8 13h5'
  };
  function iconeGx(id){ return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + ICONES_GX[id] + '"/></svg>'; }

  /* Horaires du jour (données d'exemple) : « Ouvert jusqu'à 23 h », « Ouvre à 18 h »… */
  function horaireDuJour(){
    var j = new Date().getDay(), h = D_.horaires;
    return (j === 0 ? h[3] : j === 6 ? h[2] : j === 5 ? h[1] : h[0]).c;
  }
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
    var demandes = cuisineAccess.demandes.length;
    return titre('Votre compte', 'La gestion.') +
      /* fiche du restaurant */
      '<section class="g-gx-profil">' +
        '<span class="g-gx-avatar"><img src="assets/logo-toque.png" alt="" width="44" height="44"></span>' +
        '<div class="g-gx-id"><h2>' + esc(nomResto()) + '</h2><p>' + (reel ? 'Adresse et téléphone : bientôt modifiables ici.' : esc(D_.resto.adresse) + ' · ' + esc(D_.resto.tel)) + '</p></div>' +
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
          ligneGx('data-sheet="service"', 'rythme', 'orange', 'Rythme du service', ouvert ? lv.nom + ' · ' + lv.delai + ' min annoncées' : 'Commandes en pause · reprise ' + (reprise || 'à préciser')) +
          ligneGx('data-sheet="routage"', 'appels', 'orange', 'Gestion des appels', routage.mode === 'ia' ? 'IA active · Pelyo répond' : routage.mode === 'restaurant' ? 'Transfert vers le restaurant' : 'Mode automatique · selon vos règles') +
          ligneGx('data-sheet="horaires"', 'horaires', 'orange', 'Horaires et fermetures', 'Aujourd’hui ' + horaireDuJour()) +
          ligneGx('data-sheet="livraison"', 'livraison', 'orange', 'Retrait et livraison', liv.rayon + ' · minimum ' + api.eur0(liv.minimum) + ' · frais ' + api.eur(liv.frais))) +
        groupeGx('Équipe et matériel',
          ligneGx('data-sheet="acces-cuisine"', 'cuisine', 'vert', 'Accès de l’équipe cuisine', cuisineAccess.devices.length + ' appareil(s) autorisé(s)', demandes ? demandes + ' demande' + (demandes > 1 ? 's' : '') : '') +
          ligneGx('data-sheet="caisse"', 'caisse', 'vert', 'Caisse et connexions', 'Aucune caisse connectée')) +
        groupeGx('Compte',
          ligneGx('data-sheet="abo"', 'abo', 'brun', 'Abonnement', f.nom + ' · ' + D_.resto.minutes + (f.minutes ? ' / ' + f.minutes : '') + ' min ce mois', pct === null ? '' : pct + ' %') +
          ligneGx('data-aide', 'aide', 'brun', 'Centre d’aide', 'L’assistant Pelyo répond en direct') +
          ligneGx('data-sheet="donnees"', 'donnees', 'brun', 'Mes données et fin d’abonnement', 'Export sécurisé · 30 jours en lecture seule')) +
        groupeGx('Confiance',
          ligneGx('data-sheet="rgpd"', 'rgpd', 'sable', 'Annonce IA et données', 'Information des clients et confidentialité') +
          ligneGx('data-sheet="mentions"', 'mentions', 'sable', 'Mentions légales', 'Projet de la future version officielle') +
          ligneGx('data-sheet="paiement"', 'paiement', 'sable', 'Qui encaisse les commandes ?', 'Le restaurant, jamais Pelyo')) +
      '</div>' +
      '<p class="g-empty g-gx-vide" hidden>Aucun réglage ne correspond.</p>' +
      '<p class="g-note">Maquette locale : les choix ne modifient aucun compte réel et sont réinitialisés à la réouverture.</p>';
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
    var html='';
    if(type==='horaires'){
      html='<h2>La semaine</h2><dl class="g-facts">' + D_.horaires.map(function(h){return '<dt>' + esc(h.j) + '</dt><dd>' + esc(h.c) + '</dd>';}).join('') + '<dt>Dernière commande</dt><dd>20 min avant fermeture</dd></dl><h2>Les exceptions</h2><dl class="g-facts">' + D_.exceptions.map(function(x){return '<dt>' + esc(x.d) + '</dt><dd>' + esc(x.r) + '</dd>';}).join('') + '</dl>';
    } else {
      html='<h2>La zone de livraison</h2><dl class="g-facts"><dt>Rayon</dt><dd>' + esc(D_.livraison.rayon) + '</dd><dt>Minimum de commande</dt><dd>' + esc(api.eur(D_.livraison.minimum)) + '</dd><dt>Frais</dt><dd>' + esc(api.eur(D_.livraison.frais)) + '</dd><dt>Délai de référence</dt><dd>' + D_.livraison.delai + ' min</dd><dt>Règlement au restaurant</dt><dd>' + esc(D_.livraison.paiement) + '</dd></dl><p class="g-note">Hors de la zone, l’assistant propose le retrait. Aucun paiement traité par Pelyo.</p>';
    }
    return '<div class="g-top">' + (type==='horaires' ? 'Horaires et fermetures' : 'Retrait et livraison') + '</div><div class="g-body">' + html + '<p class="g-note">Paramètres d’exemple, consultables uniquement dans cette maquette.</p></div>';
  }

  /* --------------------------------- abonnement --------------------------------- */
  /* Coût d'un mois (centimes) : forfait + minutes au-delà ; PAYG = minutes + 10 %
     des commandes. Le CA estimé suit le CA par minute de la soirée d'exemple. */
  function coutForfait(p, minutes){
    var caMinute = D_.jour.minutes ? D_.jour.ca / D_.jour.minutes : 0;
    var dep = p.minutes ? Math.max(0, minutes - p.minutes) : minutes;
    return p.prix + dep * p.dep + (p.id === 'payg' ? Math.round(minutes * caMinute * 0.10) : 0);
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
      ['Comment fonctionne le PAYG ?', 'Aucun fixe : vous payez chaque minute d’appel et 10 % des commandes prises par l’assistant. Idéal pour démarrer, moins intéressant quand le volume monte.'],
      ['Mettre l’IA en veille arrête-t-il la facturation ?', 'Non. La veille transfère les appels au restaurant sans résilier : le numéro, l’application et les intégrations restent actifs pendant l’engagement.']
    ];
    return '<div class="g-top">Abonnement</div>' +
      '<div class="g-body g-abo">' +
        /* forfait actuel */
        '<section class="g-abo-hero">' +
          '<div class="g-abo-hero-top"><span>Votre forfait</span><em>Actif</em></div>' +
          '<div class="g-abo-hero-prix"><b>' + esc(f.nom) + '</b><strong>' + esc(api.eur0(f.prix)) + '<small> / mois</small></strong></div>' +
          (pct === null
            ? '<p class="g-abo-hero-detail">' + b.minutes + ' min ce mois · ' + esc(api.eur(f.dep)) + ' la minute + 10 % des commandes</p>'
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
                : '<li><b>Sans fixe</b> · ' + esc(api.eur(p.dep)) + '/min</li><li>+ 10 % des commandes de l’IA</li>') +
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
    var pret=abonnement.exportEtat==='pret';
    return '<div class="g-top">Mes données et fin d’abonnement</div><div class="g-body">' +
      '<div class="g-data-intro"><span>Après la fin</span><b>30 jours en lecture seule</b><small>Le gérant peut consulter son compte, récupérer ses informations ou réactiver l’abonnement.</small></div>' +
      '<div><p class="g-lab">Ce que contient l’export</p><ul class="g-data-list"><li>Menu, produits, formules, options et prix</li><li>Historique des commandes et statistiques</li><li>Horaires, livraison et réglages principaux</li><li>Factures Pelyo</li></ul></div>' +
      '<div><p class="g-lab">Format à préparer</p><div class="g-delay"><button data-export-format="pdf" aria-pressed="' + (abonnement.exportFormat==='pdf') + '">PDF</button><button data-export-format="csv" aria-pressed="' + (abonnement.exportFormat==='csv') + '">Excel CSV</button><button data-export-format="json" aria-pressed="' + (abonnement.exportFormat==='json') + '">JSON</button></div></div>' +
      '<p class="g-note">Les audios, transcriptions, numéros et adresses clients ne sont pas exportés massivement par défaut. Dans le vrai produit, une nouvelle authentification sera demandée et le lien privé expirera automatiquement.</p>' +
      (pret ? '<div class="g-export-ready"><b>Export de démonstration prêt</b><small>Le vrai fichier sera chiffré, journalisé et disponible par un lien temporaire.</small></div>' : '') +
      '<div><p class="g-lab">Calendrier après résiliation</p><ol class="g-timeline"><li><b>Date de fin</b><span>Arrêt des nouveaux appels IA</span></li><li><b>30 jours</b><span>Lecture seule et export</span></li><li><b>Après 30 jours</b><span>Suppression des données actives</span></li><li><b>90 jours maximum</b><span>Purge progressive des sauvegardes, hors obligations légales</span></li></ol></div>' +
      '</div><div class="g-foot"><div class="g-acts"><button class="g-act" data-export>' + (pret ? 'Regénérer l’export' : 'Préparer mon export') + '</button><button class="g-act g-off" data-fermer>Fermer</button></div></div>';
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
      sheet.type === "horaires" || sheet.type === "livraison" ? feuilleOrganisation(sheet.type) :
      sheet.type === "parcours"  ? feuilleTexte("Confirmation et sécurité", D_.regles.confirmation + ' ' + D_.regles.allergenes) :
      sheet.type === "langues"   ? feuilleTexte("Langues de l’assistant", langues.join(' · ') + '. Langues configurées dans les données d’exemple. La modification et la reconnaissance vocale multilingue restent à connecter.') :
      sheet.type === "caisse"    ? feuilleTexte("Caisse et connexions", 'Aucune caisse connectée. Cible : commandes IA confirmées vers la caisse ; commandes validées en caisse vers Pelyo, sans doublons. Les statistiques consolidées et les prévisions de stocks attendent cette connexion. Pelyo ne gère pas les encaissements.') :
      sheet.type === "rgpd"      ? feuilleTexte("Annonce IA et données", D_.regles.rgpd) :
      sheet.type === "mentions"  ? feuilleMentions() :
      sheet.type === "paiement"  ? feuilleTexte("Encaissement", D_.regles.paiement) : "";
    return '<section class="g-sheet' + (sheet.on ? " g-on" : "") + '" role="dialog" aria-modal="true" aria-label="Détail et paramètres"><button class="g-back" data-fermer>← Retour</button>' + dedans + '</section>';
  }

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
    abonnement={fin:'31 mars 2027',resiliation:false,exportFormat:'pdf',exportEtat:'vide',plafond:0};
    reel = !!(window.PelyoDonnees && PelyoDonnees.reel());
    if (reel){
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

    root.addEventListener('submit',function(ev){
      if(ev.target.hasAttribute('data-recherche-form')){ev.preventDefault();rechercheCarte=root.querySelector('#g-search').value;peindre();root.querySelector('#g-search').focus();}
    });
    root.addEventListener('keydown',function(ev){
      if(ev.key==='Escape' && (sheet || rejeu)){ev.stopPropagation();ev.preventDefault();sheet=null;rejeu=null;peindre();var back=retourFocus ? root.querySelector(retourFocus) : null;if(back) back.focus();}
      if(ev.key==='Tab' && sheet){var items=root.querySelectorAll('.g-sheet button,.g-sheet input');var first=items[0],last=items[items.length-1];if(ev.shiftKey && document.activeElement===first){ev.preventDefault();last.focus();}else if(!ev.shiftKey && document.activeElement===last){ev.preventDefault();first.focus();}}
    });

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
      if (ev.target.id === "g-prenom"){
        var ap = root.querySelector("[data-apercu]");
        if (ap) ap.textContent = ev.target.value || "…";
      }
    });

    root.addEventListener("click", function(ev){
      var t = ev.target;
      if (!t.closest) return;
      var SEL = "[data-ecran],[data-charge],[data-arret],[data-ia],[data-cuisine],[data-rejeu],[data-aide]," +
                "[data-stoprejeu],[data-transfert],[data-appel],[data-produit],[data-import]," +
                "[data-rupture],[data-publier],[data-ton],[data-vitesse],[data-test],[data-signature]," +
                "[data-consent],[data-prenom],[data-prenom-ok],[data-sheet],[data-fermer],[data-filtre-appels],[data-cat],[data-reset-carte],[data-aller-alertes]," +
                "[data-code-show],[data-code-renew],[data-toggle-perm],[data-device-approve],[data-device-refuse],[data-device-revoke]," +
                "[data-route],[data-secours],[data-delai],[data-resilier],[data-export-format],[data-export],[data-theme],[data-ventes-echelle],[data-tri],[data-activite-echelle],[data-plus-commandes],[data-abo-choisir],[data-abo-confirmer],[data-abo-annuler],[data-plafond]";
      var b = t.closest(SEL);
      if (!b) return;
      var d = b.dataset;
      if(d.theme){theme=d.theme==='dark'?'dark':'light';try{localStorage.setItem('pelyo:gerant:theme',theme);}catch(e){}peindre();return;}
      if(!sheet){Array.prototype.some.call(b.attributes,function(a){if(a.name.indexOf('data-')===0){retourFocus='['+a.name+'="'+a.value+'"]';return true;}return false;});}
      if(d.filtreAppels){filtreAppels=d.filtreAppels;peindre();return;}
      if(d.cat!==undefined){filtreCarte=d.cat;peindre();return;}
      if(d.tri){triCarte=d.tri;peindre();return;}
      if(d.activiteEchelle){echelleActivite=d.activiteEchelle;barreActivite=null;animActivite=true;limiteCommandes=6;peindre();return;}
      if(d.plusCommandes!==undefined){limiteCommandes+=20;peindre();return;}
      if(d.resetCarte!==undefined){rechercheCarte='';filtreCarte='tous';peindre();return;}
      if(d.allerAlertes!==undefined){filtreAppels='attention';ecran='appels';peindre();root.querySelector('.g-main').scrollTop=0;return;}
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
        /* Sur place, sans redessiner : seule la toque change, en douceur (voir gerant.css). */
        var iaOn=routage.mode!=='restaurant', hero=root.querySelector('.g-dashboard-hero'), etat=root.querySelector('[data-ia-etat]');
        if(!hero){peindre();return;}
        hero.classList.toggle('g-ia-off',!iaOn);
        b.setAttribute('aria-checked',String(iaOn));
        b.setAttribute('aria-label',libelleIa(iaOn));
        if(etat){etat.textContent=iaOn?'En ligne':'En veille';etat.classList.toggle('g-veille',!iaOn);}
        return;
      }
      if(d.route){if(d.route!=='restaurant')modeAvantVeille=d.route;routage.mode=d.route;api.toast(d.route==='ia' ? 'L’IA répondra aux prochains appels.' : d.route==='restaurant' ? 'Les prochains appels seront transférés au restaurant.' : 'Le routage automatique est activé.');peindre();return;}
      if(d.secours!==undefined){routage.secours=!routage.secours;api.toast(routage.secours ? 'L’IA reprendra les appels sans réponse.' : 'La reprise automatique est désactivée.');peindre();return;}
      if(d.delai){routage.delai=Number(d.delai);peindre();return;}
      if(d.resilier!==undefined){abonnement.resiliation=!abonnement.resiliation;api.toast(abonnement.resiliation ? 'Résiliation simulée pour la fin de l’engagement.' : 'Demande simulée annulée.');peindre();return;}
      if(d.exportFormat){abonnement.exportFormat=d.exportFormat;abonnement.exportEtat='vide';peindre();return;}
      if(d.export!==undefined){abonnement.exportEtat='pret';api.toast('Export de démonstration préparé. Aucun fichier réel créé.');peindre();return;}

      if (d.ecran){ ecran = d.ecran; sheet=null; if (ecran !== "appels") rejeu = null; peindre();root.querySelector('.g-main').scrollTop=0; return; }
      if (d.charge){
        charge = d.charge; ouvert = charge !== "stop";
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
          charge = "rush";
          api.toast("Commandes rouvertes — " + niveau().delai + " minutes annoncées.");
        }
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
      if (d.produit){ sheet = { type:"produit", id:d.produit }; limiteCommandes = 6; peindre(); return; }
      if (d.ventesEchelle && sheet){ sheet.echelle = d.ventesEchelle; sheet.point = null; sheet.ventesAnim = true; limiteCommandes = 6; peindre(); return; }
      if (d.import !== undefined){
        if(timerImport) clearInterval(timerImport);
        sheet = { type:"import", etape:0 };
        peindre();
        var pas = timerImport = api.every(function(){
          if (!sheet || sheet.type !== "import"){ clearInterval(pas); return; }
          sheet.etape = (sheet.etape || 0) + 1;
          if (sheet.etape > 4){ clearInterval(pas); sheet.etape = 4; }
          peindre();
        }, 900);
        return;
      }
      if (d.rupture){
        var item=null;D_.menu.forEach(function(c){c.items.forEach(function(i){if(i.id===d.rupture)item=i;});});
        rupt[d.rupture] = !indisponible(item);
        dernierBascule = d.rupture;
        api.toast(rupt[d.rupture]
          ? "En rupture dès le prochain appel. Les commandes déjà confirmées ne sont pas touchées."
          : "De nouveau proposé par l'IA.");
        peindre(); return;
      }
      if (d.publier !== undefined){
        sheet = null;
        api.toast("Simulation terminée. Aucun fichier importé ni carte réelle publiée.");
        peindre(); return;
      }
      if (d.ton){ voix.ton = d.ton; peindre(); return; }
      if (d.vitesse){ voix.vitesse = d.vitesse; peindre(); return; }
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
        voix.accueil = "Bonsoir, " + voix.prenom + ", assistant vocal automatisé du " + nomResto() + ", je prends votre commande ?";
        sheet = null;
        api.toast("L'assistant s'appelle désormais " + voix.prenom + ".");
        peindre(); return;
      }
      if (d.aide !== undefined){ RIA.aide(); return; }
      if (d.sheet){ sheet = { type:d.sheet }; peindre(); return; }
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

    return function(){ if(arretAppareils){arretAppareils();arretAppareils=null;} rejeu = null; sheet = null;if(timerRejeu)clearInterval(timerRejeu);if(timerImport)clearInterval(timerImport);timerRejeu=null;timerImport=null; };
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
