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
  var filtreAppels = 'tous', filtreCarte = 'tous', rechercheCarte = '';
  var timerRejeu = null, timerImport = null, retourFocus = null;

  var ECRANS = [
    { id:"soir",      lbl:"Pilotage" },
    { id:"appels",    lbl:"Activité" },
    { id:"carte",     lbl:"Carte" },
    { id:"assistant", lbl:"Assistant" },
    { id:"reglages",  lbl:"Restaurant" }
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
    return '<header class="g-status"><span class="g-logo"><img src="assets/logo-toque.png" alt="Pelyo" width="35" height="35"></span><div><b>' + esc(nomResto()) + '</b><span>PELYO · GÉRANT</span></div>' +
      '<button class="g-round" data-cuisine aria-label="Ouvrir l’écran cuisine"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v15H4zM8 2v6m8-6v6M8 12h8m-8 4h5"/></svg></button></header>';
  }
  function nav(){
    return '<nav class="g-nav" aria-label="Navigation gérant">' + ECRANS.map(function(e){
      return '<button data-ecran="' + e.id + '"' + (ecran === e.id ? ' aria-current="page"' : '') + '>' + icone(e.id) + '<span>' + (e.id === 'reglages' ? 'Resto' : esc(e.lbl)) + '</span></button>';
    }).join('') + '</nav>';
  }
  function icone(id){
    var p = {soir:'M3 11 12 3l9 8M5 10v11h5v-7h4v7h5V10',appels:'M4 20V10m8 10V4m8 16v-8',carte:'M4 4h6l2 2 2-2h6v16h-6l-2 2-2-2H4zM12 6v16',assistant:'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0zM5 11a7 7 0 0 0 14 0M12 18v4',reglages:'M3 10h18L19 3H5zM5 10v11h14V10M9 21v-7h6v7'};
    return '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + p[id] + '"/></svg>';
  }
  function titre(k,t){ return '<div class="g-heading"><p class="g-lab">' + esc(k) + '</p><h1>' + esc(t) + '</h1></div>'; }
  function lien(attr,t,s){ return '<button class="g-link" ' + attr + '><span><b>' + esc(t) + '</b><small>' + esc(s) + '</small></span><span aria-hidden="true">↗</span></button>'; }
  function indisponible(it){ return Object.prototype.hasOwnProperty.call(rupt,it.id) ? rupt[it.id] : !it.dispo; }
  function nbRuptures(){ var n=0; D_.menu.forEach(function(c){c.items.forEach(function(it){if(indisponible(it)) n++;});});return n; }

  /* ------------------------------- ce soir ------------------------------- */
  function vueSoir(){
    var j=D_.jour, lv=niveau(), off=nbRuptures();
    return titre('Votre restaurant, en un regard','Le pilotage.') +
      '<section class="g-service"><div><span class="g-lab">Prise de commande</span><h2>' + (ouvert ? 'L’assistant répond.' : 'Commandes en pause.') + '</h2><p>' + (ouvert ? esc(lv.nom) + ' · ' + lv.delai + ' min annoncées' : 'Reprise annoncée : ' + esc(reprise || 'à préciser')) + '</p></div><button class="g-act" data-sheet="service">Ajuster le service ↗</button></section>' +
      '<div class="g-section-title"><h2>Ce soir</h2><button data-ecran="appels">Voir l’activité ↗</button></div>' +
      '<div class="g-metrics"><div><b>' + j.commandes + '</b><span>commandes IA</span></div><div><b>' + esc(api.eur(j.ca)) + '</b><span>montant commandé</span></div><div><b>' + j.appels + '</b><span>appels pris</span></div></div>' +
      '<p class="g-caption">Chiffres de démonstration · pas un total encaissé. Caisse non connectée.</p>' +
      '<div class="g-section-title"><h2>À regarder</h2></div>' +
      lien('data-ecran="carte"','La disponibilité de votre carte',off + ' produit(s) indisponible(s)') +
      lien('data-aller-alertes','Les appels sans commande',j.expirees + ' expirés · ' + j.transferts + ' transferts dans le bilan de démonstration') +
      '<div class="g-section-title"><h2>Accès direct</h2></div><div class="g-shortcuts">' +
      lien('data-cuisine','Ouvrir la cuisine','Préparation et tickets') + lien('data-ecran="assistant"','Mon assistant','Voix et règles de prise de commande') + '</div>';
  }

  function feuilleService(){
    return '<div class="g-top">Rythme du service</div><div class="g-body"><p class="g-note">Réglez ce que l’assistant annonce aux prochains clients. Aucun appel réel dans cette démonstration.</p><div class="g-options">' +
      D_.charges.map(function(c){return '<button data-charge="' + c.id + '" aria-pressed="' + (charge===c.id) + '"><b>' + esc(c.nom) + '</b><small>' + (c.delai ? c.delai + ' min annoncées' : 'Plus de nouvelles commandes') + '</small></button>';}).join('') +
      '</div><p class="g-para">' + esc(niveau().dit) + '</p><p class="g-note">' + (!ouvert ? 'Reprise annoncée : ' + esc(reprise || 'à préciser') + '. La reprise automatique n’est pas connectée.' : 'Les commandes déjà confirmées restent inchangées.') + '</p></div><div class="g-foot"><button class="g-act" data-arret>' + (ouvert ? 'Mettre en pause 30 min' : 'Reprendre maintenant') + '</button></div>';
  }

  function vueAppels(){
    if(rejeu) return vueRejeu();
    var a=D_.appels.filter(function(x){return filtreAppels==='tous' || (filtreAppels==='attention' ? x.issue==='transfert'||x.issue==='expiree' : x.issue==='commande');});
    return titre('Comprendre ce qui se passe','L’activité.') +
      '<div class="g-metrics"><div><b>' + esc(api.eur(D_.jour.panier)) + '</b><span>panier moyen IA</span></div><div><b>' + D_.jour.minutes + '<small> min</small></b><span>au téléphone</span></div></div>' +
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
  function vueCarte(){
    var n=0, off=nbRuptures();
    D_.menu.forEach(function(c){n+=c.items.length;});
    var q=api.norm(rechercheCarte);
    var groups=D_.menu.map(function(cat,i){
      if(filtreCarte!=='tous' && filtreCarte!==String(i)) return '';
      var items=cat.items.filter(function(it){return !q || api.norm(it.nom+' '+it.inclus+' '+it.prec).indexOf(q)>=0;});
      if(!items.length) return '';
      return '<section class="g-category"><h2>' + esc(cat.cat) + '<small>' + items.length + '</small></h2>' + items.map(function(it){var ko=indisponible(it);return '<button class="g-product" data-produit="' + it.id + '"><span><b>' + esc(it.nom) + '</b><small>' + esc(it.inclus || it.prec || 'Produit à la carte') + '</small><em class="' + (ko ? 'g-unavailable' : 'g-available') + '">' + (ko ? 'Indisponible' : 'Disponible') + '</em></span><strong>' + esc(api.eur(it.prix)) + '<span aria-hidden="true"> ↗</span></strong></button>';}).join('') + '</section>';
    }).join('');
    return titre('Ce que votre assistant peut vendre','La carte.') +
      '<div class="g-inline-summary"><span>' + n + ' produits · ' + off + ' indisponible(s)</span><button class="g-act g-off" data-import>Importer ↗</button></div>' +
      '<form class="g-search" data-recherche-form><label class="g-visually-hidden" for="g-search">Rechercher un produit</label><input id="g-search" type="search" placeholder="Nom, ingrédient, précision…" value="' + esc(rechercheCarte) + '"><button type="submit">Chercher</button></form>' +
      '<div class="g-filters" aria-label="Catégories"><button data-cat="tous" aria-pressed="' + (filtreCarte==='tous') + '">Tout</button>' + D_.menu.map(function(c,i){return '<button data-cat="' + i + '" aria-pressed="' + (filtreCarte===String(i)) + '">' + esc(c.cat) + '</button>';}).join('') + '</div>' +
      (groups || '<p class="g-empty">Aucun produit trouvé.<button data-reset-carte>Réinitialiser la recherche</button></p>') +
      '<p class="g-note">Ouvrez un produit pour retrouver ses options, suppléments, précisions et disponibilité.</p>';
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
    return titre('Votre voix, vos habitudes','L’assistant.') +
      '<section class="g-voice"><span class="g-lab">Votre accueil téléphonique</span><h2>' + esc(voix.prenom) + '</h2><p>« ' + esc(voix.accueil) + ' »</p><button class="g-act" data-test>Tester le parcours ↗</button></section>' +
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
  function vueReglages(){
    var f=leForfait(), pct=f.minutes ? Math.round(D_.resto.minutes/f.minutes*100) : null;
    return titre('Le cadre de votre activité','Le restaurant.') +
      '<section class="g-establishment"><h2>' + esc(nomResto()) + '</h2><p>' + (reel ? 'Adresse et téléphone : bientôt modifiables ici.' : esc(D_.resto.adresse) + '<br>' + esc(D_.resto.tel)) + '</p></section>' +
      '<div class="g-section-title"><h2>Organisation</h2></div>' +
      lien('data-sheet="routage"','Gestion des appels',routage.mode==='ia' ? 'IA active · Pelyo répond' : routage.mode==='restaurant' ? 'Transfert vers le restaurant' : 'Mode automatique · selon vos règles') +
      lien('data-sheet="horaires"','Horaires et fermetures','Semaine, exceptions et dernière commande') +
      lien('data-sheet="livraison"','Retrait et livraison','Zone, minimum, frais et règlement au restaurant') +
      lien('data-sheet="caisse"','Caisse et connexions','Aucune caisse connectée · fonctionnement prévu') +
      lien('data-sheet="acces-cuisine"','Accès de l’équipe cuisine',cuisineAccess.devices.length + ' appareil(s) autorisé(s) · permissions réglables') +
      '<div class="g-section-title"><h2>Votre compte Pelyo</h2></div>' +
      lien('data-sheet="abo"','Abonnement ' + f.nom,'Engagé jusqu’au ' + abonnement.fin + ' · ' + D_.resto.minutes + ' min utilisées' + (pct===null ? '' : ' / ' + f.minutes + ' · ' + pct + ' %')) +
      lien('data-sheet="donnees"','Mes données et fin d’abonnement','Export sécurisé · accès en lecture seule pendant 30 jours') +
      '<div class="g-section-title"><h2>Confiance et données</h2></div>' +
      lien('data-sheet="rgpd"','Annonce IA et données','Information des clients et confidentialité') +
      lien('data-sheet="mentions"','Mentions légales','Projet de la future version officielle') +
      lien('data-sheet="paiement"','Qui encaisse les commandes ?','Le restaurant, jamais Pelyo') +
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

  function feuilleAbo(){
    var f = leForfait();
    return '<div class="g-top">Abonnement</div>' +
      '<div class="g-body">' +
        '<div style="text-align:center"><div class="g-figure">' + esc(api.eur0(f.prix)) +
          '<small>/mois</small></div>' +
          '<p class="g-note" style="margin:14px auto 0">' + esc(f.nom) + ' · ' + f.minutes +
          ' minutes · dépassement ' + (f.dep/100).toFixed(2).replace(".", ",") + ' € la minute</p></div>' +
        '<p class="g-note">' + D_.resto.minutes + ' minutes utilisées. ' + (f.minutes ? 'Alerte à 80 % du forfait, sans coupure automatique du service.' : 'Facturation à l’usage, sans quota de minutes incluses.') + '</p><div class="g-list">' +
          D_.forfaits.map(function(p){
            return '<div class="g-row' + (forfait === p.id ? "" : " g-out") + '">' +
              '<button data-forfait="' + p.id + '"><span class="g-k">' + esc(p.nom) +
                '<span class="g-s">' + p.minutes + ' minutes incluses · ' + esc(api.eur(p.dep)) + '/min au-delà</span></span></button>' +
              '<span class="g-v' + (forfait === p.id ? " g-cu" : "") + '">' +
                (forfait === p.id ? "en cours" : esc(api.eur0(p.prix))) + '</span></div>';
          }).join("") +
        '</div>' +
        '<div class="g-contract"><span>Engagement en cours</span><b>Jusqu’au ' + esc(abonnement.fin) + '</b><small>Après cette date, renouvellement mensuel résiliable pour l’échéance suivante.</small></div>' +
        '<p class="g-note">Vous pouvez désactiver l’IA et transférer les appels au restaurant sans résilier. Le numéro, le routage, l’application et les intégrations restent actifs : la facturation continue pendant l’engagement.</p>' +
        (abonnement.resiliation ? '<p class="g-note g-cu">Résiliation simulée pour la fin de l’engagement. Aucun contrat réel n’est modifié.</p>' : '') +
      '</div>' +
      '<div class="g-foot"><div class="g-acts">' +
        '<button class="g-act g-off" data-resilier>' + (abonnement.resiliation ? 'Annuler la demande simulée' : 'Planifier la résiliation') + '</button>' +
        '<button class="g-act g-off" data-fermer>Fermer</button>' +
      '</div></div>';
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
    var ancien=root.querySelector('.g-main'), scroll=ancien ? ancien.scrollTop : 0;
    var ancienSheet=root.querySelector('.g-sheet .g-body'), scrollSheet=ancienSheet ? ancienSheet.scrollTop : 0;
    var active=document.activeElement, focusAttr=null;
    if(root.contains(active)) ['data-charge','data-ton','data-vitesse','data-forfait','data-filtre-appels','data-cat','data-ecran','data-rejeu','data-stoprejeu','data-consent'].some(function(a){if(active.hasAttribute(a)){focusAttr='['+a+'="'+active.getAttribute(a)+'"]';return true;}return false;});
    root.setAttribute('data-page',ecran);
    root.innerHTML = '<div class="g-shell"' + (sheet ? ' inert' : '') + '>' + statusbar() + '<main class="g-main">' + corps() + '</main>' + nav() + '</div>' + feuille();
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
    ecran='soir';sheet=null;rejeu=null;rupt={};reprise='';
    filtreAppels='tous';filtreCarte='tous';rechercheCarte='';retourFocus=null;
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
    abonnement={fin:'31 mars 2027',resiliation:false,exportFormat:'pdf',exportEtat:'vide'};
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

    root.addEventListener("input", function(ev){
      if (ev.target.id === "g-prenom"){
        var ap = root.querySelector("[data-apercu]");
        if (ap) ap.textContent = ev.target.value || "…";
      }
    });

    root.addEventListener("click", function(ev){
      var t = ev.target;
      if (!t.closest) return;
      var SEL = "[data-ecran],[data-charge],[data-arret],[data-cuisine],[data-rejeu]," +
                "[data-stoprejeu],[data-transfert],[data-appel],[data-produit],[data-import]," +
                "[data-rupture],[data-publier],[data-ton],[data-vitesse],[data-test],[data-signature]," +
                "[data-consent],[data-prenom],[data-prenom-ok],[data-sheet],[data-forfait],[data-fermer],[data-filtre-appels],[data-cat],[data-reset-carte],[data-aller-alertes]," +
                "[data-code-show],[data-code-renew],[data-toggle-perm],[data-device-approve],[data-device-refuse],[data-device-revoke]," +
                "[data-route],[data-secours],[data-delai],[data-resilier],[data-export-format],[data-export]";
      var b = t.closest(SEL);
      if (!b) return;
      var d = b.dataset;
      if(!sheet){Array.prototype.some.call(b.attributes,function(a){if(a.name.indexOf('data-')===0){retourFocus='['+a.name+'="'+a.value+'"]';return true;}return false;});}
      if(d.filtreAppels){filtreAppels=d.filtreAppels;peindre();return;}
      if(d.cat!==undefined){filtreCarte=d.cat;peindre();return;}
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
      if(d.route){routage.mode=d.route;api.toast(d.route==='ia' ? 'L’IA répondra aux prochains appels.' : d.route==='restaurant' ? 'Les prochains appels seront transférés au restaurant.' : 'Le routage automatique est activé.');peindre();return;}
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
      if (d.produit){ sheet = { type:"produit", id:d.produit }; peindre(); return; }
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
      if (d.sheet){ sheet = { type:d.sheet }; peindre(); return; }
      if (d.forfait){
        forfait = d.forfait;
        api.toast("Simulation : forfait " + leForfait().nom + " sélectionné, aucun contrat modifié.");
        peindre(); return;
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
