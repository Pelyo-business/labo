/* =========================================================================
   Pelyo — Le Passe. Application cuisine mobile.
   Four destinations, complete order tickets, incremental timers.
   Demonstration data and simulated hardware actions are explicitly labelled.

   ES5 strict. Toutes les classes commencent par k-. Voir src/cuisine.css.
   ========================================================================= */
(function(){
  "use strict";

  var api, root, D_;
  var tiroir, scrim;       /* le tiroir de navigation : monté une fois, hors du cycle de repaint */
  var vue = "service";
  var recherche = "";
  var impressionAuto = true, impressionAnnulations = false;
  var derniereAction = null;
  var brouillon = "";
  var montageId = 0;
  var filtre = "faire";
  var son = true;
  var charge = "rush";
  var retraitOuvert = true, livraisonOuverte = true;
  var cmds = [];           /* copie de travail : on ne mute jamais D.commandes */
  var ouverte = null;      /* commande affichée en plein écran */
  var discussionOuverte = false;
  var horloge = "";
  var audio = null;
  var imprimes = {};
  var ticketOuvert = null; /* commande dont le ticket numérique est affiché */
  var triHistorique = "recent"; /* recent | ancien | nom */
  var triOuvert = false;
  var menuOuvert = false;  /* tiroir de navigation */
  var rupt = {};           /* id produit → true si en rupture */
  var catOff = {};
  var delaiRetrait = 15, delaiLivraison = 35, capacite = 12;
  var nouvelles = 0;
  var ops = null, triUrgence = false, jobs = [], stockFin = {}, supOff = {}, ingredientOff = {};
  var liensDemo = {imprimante:true,caisse:true}, stockageOK = true;
  var STOCKAGE = 'pelyo:cuisine:demo:v2:';
  /* Mode connecté (voir pelyo-donnees.js) : les commandes viennent de la
     base et chaque geste y est enregistré. Rien n'est alors sauvegardé dans
     le téléphone, et les actions pas encore reliées le disent. */
  var reel = false, arretEcoute = null, connues = null;
  var BLOQUES_REEL = "[data-edit-order],[data-cancel-order],[data-problem],[data-edit-address],[data-resolve],[data-ack]," +
    "[data-import-caisse],[data-reset-demo],[data-reset-confirm],[data-charge],[data-stop],[data-channel],[data-d]," +
    "[data-toggle-stock],[data-toggle-cat],[data-unrupt],[data-ops-stock],[data-send],[data-mic],[data-link-toggle]," +
    "[data-job-retry],[data-retry-all],[data-reg]:not([data-reg=\"son\"])";
  function nomResto(){ return reel ? PelyoDonnees.restaurant().nom : D_.resto.nom; }
  function pasEncoreRelie(){ api.toast("Pas encore relié à la base : arrive dans une prochaine étape."); }
  var ruptChat = [{ de:"ia", texte:"Dites-moi ce qui manque, à l'écrit ou à la voix — je mets la carte à jour tout de suite. Ça s'applique aux nouveaux appels, jamais à une commande déjà confirmée." }];
  var ruptEcoute = false;
  var VOIX = [
    "Il n'y a plus de tacos M, arrête-les",
    "On n'a plus de mozzarella, stop les pizzas",
    "Remets les tacos M, on en a reçu",
    "Le poulet mariné est fini pour ce soir"
  ];
  var voixIdx = 0;

  /* Adresse du relais IA (voir worker/README.md). Vide = le chat retombe
     automatiquement sur une reconnaissance locale par mots-clés, gratuite
     et sans réseau — la démo reste utilisable tant que rien n'est déployé. */
  var IA_ENDPOINT = "https://pelyo-ruptures-ia.haydenrouet2104.workers.dev";

  /* ------------------------------ états ------------------------------ */
  var ETATS = {
    appel:       { lbl:"IA en ligne",     suite:null,        bouton:null },
    attente:     { lbl:"À confirmer",     suite:null,        bouton:null },
    confirmee:   { lbl:"À préparer",      suite:"preparation", bouton:"Commencer" },
    preparation: { lbl:"En préparation",  suite:"prete",     bouton:null },
    prete:       { lbl:"Prête",           suite:"terminee",  bouton:null },
    terminee:    { lbl:"Terminée",        suite:null,        bouton:null },
    expiree:     { lbl:"Expirée",         suite:null,        bouton:null },
    annulee:     { lbl:"Annulée",         suite:null,        bouton:null }
  };
  /* Plus de « Tout » : chaque filtre trie déjà directement sur un état
     précis, superposer une vue qui mélange tout n'apportait rien de plus. */
  var FILTRES = [
    { id:"faire",  lbl:"À préparer", test:function(c){ return c.etat === "confirmee"; } },
    { id:"cours",  lbl:"En cours",   test:function(c){ return c.etat === "preparation"; } },
    { id:"pretes", lbl:"Prêtes",     test:function(c){ return c.etat === "prete"; } },
    { id:"fin",    lbl:"Terminées",  test:function(c){ return c.etat === "terminee" || c.etat === "expiree" || c.etat === "annulee"; } }
  ];
  var VUES = [
    { id:"service",  lbl:"Service" },
    { id:"ruptures", lbl:"La carte" },
    { id:"tickets",  lbl:"Tickets" },
    { id:"rythme",   lbl:"Rythme" }
  ];

  /* ------------------------------ utilitaires ------------------------------ */
  function esc(s){ return api.esc(s); }
  function eur(c){ return api.eur(c); }
  function niveau(){
    for (var i = 0; i < D_.charges.length; i++) if (D_.charges[i].id === charge) return D_.charges[i];
    return D_.charges[0];
  }
  function compte(f){
    var n = 0;
    for (var i = 0; i < cmds.length; i++) if (f.test(cmds[i])) n++;
    return n;
  }
  function aPreparer(){
    var n = 0;
    for (var i = 0; i < cmds.length; i++) if (cmds[i].etat === "confirmee" || cmds[i].etat === "preparation") n++;
    return n;
  }
  /* D.commandes[].total inclut déjà les frais de livraison : ne pas les ajouter. */
  function total(c){ return c.total; }

  function commande(id){return cmds.filter(function(c){return c.id===+id;})[0];}
  function retenir(){
    if (reel) return;
    try {localStorage.setItem(STOCKAGE+D_.resto.nom,JSON.stringify({schema:2,son:son,cmds:cmds,jobs:jobs,rupt:rupt,catOff:catOff,supOff:supOff,ingredientOff:ingredientOff,stockFin:stockFin,imprimes:imprimes,nouvelles:nouvelles,charge:charge,retraitOuvert:retraitOuvert,livraisonOuverte:livraisonOuverte,delaiRetrait:delaiRetrait,delaiLivraison:delaiLivraison,capacite:capacite,impressionAuto:impressionAuto,impressionAnnulations:impressionAnnulations,liensDemo:liensDemo}));stockageOK=true;}catch(e){stockageOK=false;}
  }
  function restaurer(){
    if (reel) return;
    try{
      var x=JSON.parse(localStorage.getItem(STOCKAGE+D_.resto.nom)||'null');
      if(!x||x.schema!==2||!Array.isArray(x.cmds)||!x.cmds.every(function(c){return c&&ETATS[c.etat]&&typeof c.id==='number'&&Array.isArray(c.lignes)&&typeof c.version==='number';}))return;
      son=x.son!==false;cmds=x.cmds;jobs=x.jobs||[];rupt=x.rupt||{};catOff=x.catOff||{};supOff=x.supOff||{};ingredientOff=x.ingredientOff||{};stockFin=x.stockFin||{};imprimes=x.imprimes||{};nouvelles=x.nouvelles||0;charge=x.charge||charge;retraitOuvert=x.retraitOuvert!==false;livraisonOuverte=x.livraisonOuverte!==false;delaiRetrait=x.delaiRetrait||delaiRetrait;delaiLivraison=x.delaiLivraison||delaiLivraison;capacite=x.capacite||capacite;impressionAuto=x.impressionAuto!==false;impressionAnnulations=!!x.impressionAnnulations;liensDemo=x.liensDemo||liensDemo;
    }catch(e){stockageOK=false;}
  }
  function feuilleOps(titre,contenu){return '<div class="k-over k-ops"><div class="k-ohead"><button data-ops-close>← Retour</button></div><h2>'+esc(titre)+'</h2>'+(ops.error?'<p class="k-ops-error" role="alert">'+esc(ops.error)+'</p>':'')+contenu+'</div>';}
  function ouvrirOps(type,id){ops={type:type,id:id,error:''};discussionOuverte=false;if(type==='edit')ops.lignes=PelyoKitchen.clone(commande(id).lignes);peindre();}
  function consignes(l,service){return (l.allergie?'<p class="k-safety"><b>Allergie déclarée</b> '+esc(l.allergie)+'</p>':'')+(l.dem?'<p class="k-instruction'+(service?' k-instruction-service':'')+'">'+(service?'':'<b>Consigne</b> ')+esc(l.dem)+'</p>':'');}
  function adresseRue(c){var a=c.adresseDetail;return a&&a.rue?[a.numero,a.rue].filter(Boolean).join(' '):(c.adresse||'Adresse à préciser');}
  function adresseVille(c){var a=c.adresseDetail;return a&&a.ville?[a.codePostal,a.ville].filter(Boolean).join(' '):'';}
  function adresseComplete(c){var a=c.adresseDetail;return [adresseRue(c),adresseVille(c),a&&a.complement,a&&a.acces].filter(Boolean).join(', ');}
  function appelClient(c){var n=String(c.telephoneClient||'').replace(/[^+\d]/g,'');return c.telephoneClient?'<a class="k-contact-call" href="tel:'+esc(n)+'" aria-label="Appeler le client au '+esc(c.telephoneClient)+'">'+icone('phone')+'<span>Appeler le client<small>'+esc(c.telephoneClient)+'</small></span></a>':'<span class="k-contact-empty">Numéro client non renseigné · ajoutez-le pour pouvoir appeler.</span>';}
  function adresseCarte(c){var a=c.adresseDetail;return '<button class="k-address" data-open="'+c.id+'" aria-label="Détails de livraison de la commande '+c.id+'"><span class="k-address-icon">'+icone('truck')+'</span><span class="k-address-content"><b>'+esc(adresseRue(c))+'</b>'+(adresseVille(c)?'<small>'+esc(adresseVille(c))+'</small>':'<small>Ville et code postal à préciser</small>')+'</span><span class="k-address-distance">'+(c.km==null?'':esc(String(c.km).replace('.',','))+' km')+icone('arrow')+'</span></button>';}
  function adresseDetailHTML(c){var a=c.adresseDetail;return '<section class="k-delivery-panel"><div class="k-delivery-panel-title">'+icone('truck')+'<span>Adresse de livraison</span></div><strong>'+esc(adresseRue(c))+'</strong>'+(a&&a.ville?'<div class="k-delivery-locality"><span>'+esc(a.codePostal||'Code postal à préciser')+'</span><span>'+esc(a.ville)+'</span></div>':'<p>Ville et code postal à préciser</p>')+(a&&a.complement?'<p><b>Complément</b> '+esc(a.complement)+'</p>':'')+(a&&a.acces?'<p><b>Accès</b> '+esc(a.acces)+'</p>':'')+'<div class="k-delivery-meta"><span>Distance · '+(c.distanceARevoir?'à revérifier':c.km==null?'non renseignée':esc(String(c.km).replace('.',','))+' km')+'</span><span>Frais · '+eur(c.frais||0)+'</span></div><div class="k-delivery-actions">'+appelClient(c)+(PelyoKitchen.actif(c)?'<button class="k-address-edit" data-edit-address="'+c.id+'">Corriger l’adresse ou le numéro '+icone('arrow')+'</button>':'')+'</div>'+(c.distanceARevoir?'<p class="k-delivery-warning">Adresse modifiée : vérifiez la distance et les frais avec le client. Le montant reste inchangé dans la maquette.</p>':'')+'</section>';}
  function delaiPromis(c){var u=PelyoKitchen.urgence(c,Date.now());if(!u)return '';return '<span class="k-deadline '+(u.late?'k-late':'')+'">'+(u.late?u.minutes+' min de retard':u.minutes===0?'À remettre maintenant':'À remettre dans '+u.minutes+' min')+' · '+esc(PelyoKitchen.hhmm(c.promesseAt))+'</span>';}
  function alertesCommande(c){
    return (c.ackVersion<c.version?'<button class="k-change-alert" data-open="'+c.id+'">'+(c.etat==='annulee'?'Annulation à lire':'Commande modifiée · v'+c.version)+' ↗</button>':'')+(c.probleme?'<button class="k-problem-alert" data-open="'+c.id+'">Problème : '+esc(c.probleme.motif)+' ↗</button>':'');
  }
  function historique(c){
    if(!c.historique.length)return '';
    return '<details class="k-history"><summary>Historique · '+c.historique.length+' événement(s)</summary>'+c.historique.slice().reverse().map(function(h){return '<div><b>'+esc(h.type)+(h.version?' · v'+h.version:'')+'</b><small>'+esc(new Date(h.at).toLocaleString('fr-FR'))+'</small><ul>'+h.details.filter(Boolean).map(function(t){return '<li>'+esc(t)+'</li>';}).join('')+'</ul>'+(h.validation?'<small>'+esc(h.validation)+'</small>':'')+'</div>';}).join('')+'</details>';
  }
  function demandesImpression(c,type,repetition){
    if(!c)return;
    if(PelyoKitchen.ajouterJob(jobs,c,type,!!repetition,Date.now())){
      var j=jobs[jobs.length-1];j.texte=(type==='correctif'?'CORRECTIF — NE PAS PREPARER EN DOUBLE\n':type==='annulation'?'ANNULATION — ARRETER LA PREPARATION\n':'')+ticket(c);
    }
    traiterJobs();
  }
  function traiterJobs(cle){
    if(navigator.onLine===false)return;
    jobs.forEach(function(j){
      if(j.etat!=='attente'||(cle&&j.key!==cle))return;
      if((j.type==='caisse'&&liensDemo.caisse)||(j.type!=='caisse'&&liensDemo.imprimante)){
        j.etat='simule';j.termineAt=Date.now();var c=commande(j.commande);
        if(j.type==='caisse'){if(c&&c.version===j.version)c.syncCaisse='simulee';}
        else imprimes[j.commande]=true;
      }
    });
  }
  function changementsEnregistres(c,type){
    derniereAction=null;c.syncCaisse='en_attente';
    jobs.forEach(function(j){if(j.commande===c.id&&j.etat==='attente'&&j.version<c.version)j.etat='remplace';});
    PelyoKitchen.ajouterJob(jobs,c,'caisse',false,Date.now());
    if(type==='correctif'||type==='livraison'||impressionAnnulations)demandesImpression(c,type==='livraison'?'correctif':type,false);
    traiterJobs();bip();ops=null;peindre();
  }
  function etatConnexion(){
    var n=jobs.filter(function(j){return j.etat==='attente';}).length;
    return '<button class="k-health" data-ops="connections"><i class="'+(navigator.onLine===false||!liensDemo.caisse||!liensDemo.imprimante||!stockageOK?'k-health-bad':'')+'"></i>'+ (navigator.onLine===false?'Hors ligne':n?n+' en attente':'Connexions · démo')+'</button>';
  }
  function mapStock(type){return type==='p'?rupt:type==='c'?catOff:type==='s'?supOff:ingredientOff;}
  function setStock(type,id,off,duree){
    mapStock(type)[id]=off;var key=type+':'+id;
    delete stockFin[key];
    if(off&&duree&&duree!=='manuel'){var fin=new Date();if(duree==='demain')fin.setHours(24,0,0,0);else fin=new Date(Date.now()+(duree==='30'?30:120)*60000);stockFin[key]=fin.getTime();}
  }
  function expirerStocks(){var change=false;Object.keys(stockFin).forEach(function(key){if(stockFin[key]<=Date.now()){mapStock(key.charAt(0))[key.slice(2)]=false;delete stockFin[key];change=true;}});return change;}
  function bloqueParIngredient(id){return D_.cuisineOperations.ingredients.some(function(i){return ingredientOff[i.id]&&i.produits.indexOf(id)!==-1;});}
  function stockEffectif(it,cat){return !!(rupt[it.id]||catOff[cat]||bloqueParIngredient(it.id));}
  function listeSupplements(){var liste={};D_.menu.forEach(function(cat){cat.items.forEach(function(it){it.sup.forEach(function(s){var key=api.norm(s.nom);if(!liste[key])liste[key]={id:key,nom:s.nom,produits:[]};liste[key].produits.push(it.nom);});});});return Object.keys(liste).map(function(k){return liste[k];});}

  function iconeCategorie(nom){
    var n = api.norm(nom), p;
    if (/taco/.test(n)) p = '<path d="M3 17a9 9 0 0 1 18 0z"/><path d="M6.5 12.5c1-.8 1.8.4 2.8-.4s1.8.4 2.8-.4 1.8.4 2.8-.4 1.8.4 2.6-.2"/><path d="M8 17v-1m4 1v-1.5m4 1.5v-1"/>';
    else if (/burger|sandwich|kebab/.test(n)) p = '<path d="M4 10.5a8 5.5 0 0 1 16 0z"/><path d="M3 13.5c1.5-1 3 1 4.5 0s3 1 4.5 0 3 1 4.5 0 3 1 4.5 0"/><path d="M4 16h16"/><path d="M5 18.5h14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path d="M9 7.5h.01M12 6.5h.01M15 7.5h.01"/>';
    else if (/pizza/.test(n)) p = '<path d="M12 21 3.5 6.5a15 15 0 0 1 17 0z"/><path d="M5.2 9.4a12 12 0 0 1 13.6 0"/><circle cx="10" cy="12" r="1.3"/><circle cx="14" cy="11.5" r="1.1"/><circle cx="12" cy="16" r="1.2"/>';
    else p = '<path d="M6.5 10h11l-1.6 11H8.1z"/><path d="M8.5 10 7.5 3.5M11 10V3m2.5 7 .8-6.2M16 10l1.6-5.2"/>';
    return '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  }

  /* La carte telle qu'un client la lirait, avec l'état des ruptures de ce soir. */
  function overlayMenuCarte(){
    var R = D_.resto;
    return '<div class="k-over k-menu-over"><div class="k-ohead"><button data-ops-close>← Retour</button><span class="k-clock">Vue client</span></div>' +
      '<article class="k-menu-sheet" aria-label="Carte de ' + esc(R.nom) + '">' +
        '<header class="k-menu-head"><img src="assets/logo-toque.png" alt="" width="46" height="46"><span class="k-menu-eyebrow">La carte</span>' +
          '<h2>' + esc(R.nom) + '</h2><p>' + esc(R.adresse) + '</p><span class="k-menu-orn" aria-hidden="true"></span></header>' +
        D_.menu.map(function(cat){
          var sups = {};
          cat.items.forEach(function(it){ it.sup.forEach(function(s){ if (s.dispo && !supOff[api.norm(s.nom)] && s.prix > 0 && !sups[s.nom]) sups[s.nom] = s.prix; }); });
          var supListe = Object.keys(sups).map(function(k){ return esc(k) + ' ' + eur(sups[k]); }).join(' · ');
          return '<section class="k-menu-cat"><div class="k-menu-medal">' + iconeCategorie(cat.cat) + '</div><h3>' + esc(cat.cat) + '</h3>' +
            cat.items.map(function(it){
              var off = !it.dispo || stockEffectif(it, cat.cat);
              var choix = it.obl.filter(function(o){ return o.choix.indexOf('·') !== -1; })[0];
              var desc = [];
              if (it.inclus) desc.push(it.inclus);
              if (choix) desc.push(choix.nom + ' au choix : ' + choix.choix.split(' · ').join(', '));
              var allergenes = /contient ([^·]+)/i.exec(it.prec || '');
              var tags = [];
              if (it.pop && !off) tags.push('<span class="k-menu-tag k-menu-pop">★ Le plus demandé</span>');
              if (/halal/i.test(it.prec || '')) tags.push('<span class="k-menu-tag">Halal</span>');
              if (/végétarien/i.test(it.prec || '')) tags.push('<span class="k-menu-tag">Végétarien</span>');
              if (off) tags.push('<span class="k-menu-tag k-menu-epuise">Indisponible ce soir</span>');
              return '<div class="k-menu-item' + (off ? ' k-menu-off' : '') + '">' +
                '<div class="k-menu-line"><b>' + esc(it.nom) + '</b><i aria-hidden="true"></i><span>' + eur(it.prix) + '</span></div>' +
                (desc.length ? '<p>' + esc(desc.join(' · ')) + '</p>' : '') +
                (allergenes ? '<small>Contient ' + esc(allergenes[1].trim()) + '</small>' : '') +
                (tags.length ? '<div class="k-menu-tags">' + tags.join('') + '</div>' : '') +
              '</div>';
            }).join('') +
            (supListe ? '<p class="k-menu-sup">Suppléments : ' + supListe + '</p>' : '') +
          '</section>';
        }).join('') +
        '<footer class="k-menu-foot"><span class="k-menu-orn" aria-hidden="true"></span>' +
          '<p>Commandez au <b>' + esc(R.tel) + '</b> — notre assistant vous répond, même en plein rush.</p>' +
          '<small>Prix TTC. Allergènes selon les informations du restaurant : en cas de doute, demandez à l’équipe.</small></footer>' +
      '</article>' +
      '<p class="k-note">Aperçu de la carte telle que l’assistant la propose ce soir : les produits en rupture y apparaissent indisponibles.</p>' +
    '</div>';
  }

  function overlayOps(){
    if (ops.type === 'menu') return overlayMenuCarte();
    var c=commande(ops.id),html='';
    if(ops.type==='info'){
      var legal=D_.mentionsLegales;
      var pages={
        confidentialite:{title:'Confidentialité',body:'<p>Cette maquette utilise uniquement des données de démonstration. Les commandes, réglages et coordonnées saisies sont conservés dans le stockage local de ce navigateur, sans synchronisation vers un compte réel.</p><p>Ne saisissez pas de données de vrais clients pendant les essais. La politique de confidentialité complète devra être publiée avant toute utilisation réelle.</p>'},
        mentions:{title:'Mentions légales',body:
          '<p class="k-legal-warning"><b>Projet pour la version officielle.</b> Texte incomplet, à vérifier et compléter avant publication.</p>'+
          '<h3>Éditeur</h3><p>Le site web Pelyo et les applications Pelyo destinées aux gérants, aux équipes de cuisine et aux commerciaux sont édités par <strong>'+esc(legal.editeur)+'</strong>, '+esc(legal.forme)+' au capital de <strong>'+esc(legal.capital)+'</strong>, dont le siège social est situé <strong>'+esc(legal.adresse)+'</strong>.</p>'+
          '<p>'+esc(legal.nomCommercial)+' est le nom commercial sous lequel '+esc(legal.editeur)+' propose son service.</p>'+
          '<h3>Contact</h3><p><a href="mailto:'+esc(legal.email)+'">'+esc(legal.email)+'</a><br><a href="tel:'+esc(legal.telephone.replace(/\s/g,''))+'">'+esc(legal.telephone)+'</a></p>'+
          '<h3>Directeur de la publication</h3><p><strong>'+esc(legal.directeur)+'</strong>, '+esc(legal.fonctionDirecteur)+'.</p>'},
        conditions:{title:'Conditions d’utilisation',body:'<p>Cette version sert à tester le parcours cuisine. Elle ne peut ni recevoir de vraies commandes, ni communiquer avec une caisse ou une imprimante réelle.</p><p>Les conditions d’utilisation définitives seront publiées avant la mise en service.</p>'},
        assistance:{title:'Assistance',body:'<p>Cette maquette ne dispose pas encore d’un service d’assistance connecté. Le canal de support et ses coordonnées seront affichés ici avant la mise en service.</p><p>Pour tester les pannes simulées, ouvrez « État et opérations en attente » dans les réglages.</p>'}
      };
      var page=pages[ops.id];
      return '<div class="k-over k-legal-page"><div class="k-ohead"><button data-ops-close>← Réglages</button></div><span class="k-eyebrow">PELYO CUISINE</span><h2>'+esc(page.title)+'</h2>'+page.body+'</div>';
    }
    if(ops.type==='address'){
      var a=c.adresseDetail||{};
      html='<form data-ops-form="address"><p class="k-note">Vérifiez les coordonnées avec le client. La distance et les frais ne sont pas recalculés automatiquement dans cette maquette.</p><div class="k-address-fields">'+[['numero','Numéro','street-address'],['rue','Rue','address-line1'],['codePostal','Code postal','postal-code'],['ville','Ville','address-level2'],['complement','Étage, bâtiment, appartement','address-line2'],['acces','Digicode ou consigne d’accès','off']].map(function(f){return '<label class="k-field">'+f[1]+'<input data-address-field="'+f[0]+'" autocomplete="'+f[2]+'" maxlength="120"'+(['numero','rue','codePostal','ville'].indexOf(f[0])!==-1?' required':'')+(f[0]==='codePostal'?' inputmode="numeric" pattern="[0-9]{5}"':'')+' value="'+esc(a[f[0]]||'')+'"></label>';}).join('')+'</div><label class="k-field">Téléphone du client · facultatif<input id="k-client-phone" type="tel" autocomplete="off" inputmode="tel" maxlength="24" value="'+esc(c.telephoneClient||'')+'" placeholder="À renseigner si connu"></label><label class="k-check"><input type="checkbox" id="k-address-confirm" required>J’ai vérifié ces coordonnées avec le client.</label><button class="k-btn" type="submit">Enregistrer les coordonnées</button></form>';
      return feuilleOps('Livraison · #'+c.id,html);
    }
    if(ops.type==='edit'){
      html='<form data-ops-form="edit"><p class="k-note">Modification confirmée avec le client. Les prix sont les totaux de chaque ligne, suppléments inclus. Aucun paiement traité.</p>'+ops.lignes.map(function(l,i){return '<fieldset class="k-edit-line"><legend>'+esc(l.nom)+'</legend><label>Quantité<input type="number" min="1" max="99" step="1" required data-edit="q" data-index="'+i+'" value="'+l.q+'"></label><label>Total ligne (€)<input type="number" min="0" max="10000" step="0.01" required data-edit="prix" data-index="'+i+'" value="'+(l.prix/100).toFixed(2)+'"></label>'+[['opt','Options'],['sup','Suppléments'],['dem','Consignes'],['allergie','Allergie déclarée par le client']].map(function(f){return '<label class="k-wide">'+f[1]+'<input maxlength="250" data-edit="'+f[0]+'" data-index="'+i+'" value="'+esc(l[f[0]]||'')+'"></label>';}).join('')+'<button type="button" class="k-text-danger" data-remove-line="'+i+'">Retirer ce produit</button></fieldset>';}).join('')+'<label class="k-field">Ajouter un produit<select id="k-add-product">'+D_.menu.map(function(cat){return cat.items.map(function(it){return '<option value="'+it.id+'">'+esc(it.nom)+'</option>';}).join('');}).join('')+'</select></label><button type="button" class="k-btn2" data-add-line>Ajouter au brouillon</button><label class="k-check"><input type="checkbox" id="k-confirm-client" required>Je confirme l’accord du client sur ces changements.</label><button class="k-btn" type="submit">Enregistrer le correctif</button></form>';
      return feuilleOps('Modifier #'+c.id,html);
    }
    if(ops.type==='cancel')return feuilleOps('Annuler #'+c.id,'<form data-ops-form="cancel"><p class="k-note">La commande sera conservée dans l’historique, signalée comme annulée et ne pourra plus avancer en préparation. Aucun remboursement n’est effectué par Pelyo.</p><label class="k-field">Motif<textarea id="k-cancel-reason" required maxlength="300"></textarea></label><label class="k-check"><input type="checkbox" required>Je confirme l’annulation de cette commande.</label><button class="k-btn" type="submit">Confirmer l’annulation</button></form>');
    if(ops.type==='problem')return feuilleOps('Un problème · #'+c.id,'<form data-ops-form="problem"><label class="k-field">Motif<select id="k-issue-reason">'+D_.cuisineOperations.problemes.map(function(p){return '<option>'+esc(p)+'</option>';}).join('')+'</select></label><label class="k-field">Précision<textarea id="k-issue-note" maxlength="300"></textarea></label><label class="k-field">Action à demander<select id="k-issue-route"><option>Prévenir le gérant</option><option>Demander un rappel du client</option></select></label><p class="k-note">Demande enregistrée localement dans la démo. Aucun message ni appel réel n’est envoyé.</p><button class="k-btn" type="submit">Signaler le problème</button></form>');
    if(ops.type==='stock'){
      var groupes=[{type:'p',nom:'Produits',items:[]},{type:'c',nom:'Catégories',items:D_.menu.map(function(cat){return {id:cat.cat,nom:cat.cat};})},{type:'s',nom:'Suppléments',items:listeSupplements()},{type:'i',nom:'Ingrédients',items:D_.cuisineOperations.ingredients}];
      D_.menu.forEach(function(cat){cat.items.forEach(function(it){groupes[0].items.push({id:it.id,nom:it.nom});});});
      html='<p class="k-note">Pour les prochains appels uniquement. Un ingrédient suspend les produits explicitement associés, sans remplacer automatiquement une recette.</p><label class="k-field">Durée des nouvelles ruptures<select id="k-stock-duration"><option value="manuel">Jusqu’à réactivation manuelle</option><option value="30">30 minutes</option><option value="120">2 heures</option><option value="demain">Jusqu’à demain à 00 h</option></select></label>'+groupes.map(function(g){return '<details class="k-stock-group"'+(g.type==='s'?' open':'')+'><summary>'+g.nom+'</summary>'+g.items.map(function(it){var off=!!mapStock(g.type)[it.id],key=g.type+':'+it.id;return '<button class="k-stock-detail-row" data-ops-stock="'+esc(key)+'" aria-pressed="'+off+'"><span><b>'+esc(it.nom)+'</b>'+(it.produits?'<small>'+esc(it.produits.map(function(id){var p=trouverProduit(id);return p?p.nom:id;}).join(' · '))+'</small>':'')+'<small>'+(off?(stockFin[key]?'Jusqu’au '+new Date(stockFin[key]).toLocaleString('fr-FR'):'Réactivation manuelle'):'Disponible')+'</small></span><em>'+(off?'Rétablir':'Suspendre')+'</em></button>';}).join('')+'</details>';}).join('');
      return feuilleOps('Ruptures détaillées',html);
    }
    var pending=jobs.filter(function(j){return j.etat==='attente';});
    html='<p class="k-note">Aucune caisse ni imprimante réelle connectée. Les états et reprises ci-dessous servent à tester les incidents.</p><div class="k-connection-row"><b>Internet</b><span>'+(navigator.onLine===false?'Navigateur hors ligne':'Navigateur en ligne · serveur non vérifié')+'</span></div>'+['imprimante','caisse'].map(function(k){return '<div class="k-connection-row"><b>'+esc(k==='caisse'?'Caisse':'Imprimante')+' · démo</b><span>'+(liensDemo[k]?'Disponible dans la simulation':'Panne simulée')+'</span><button class="k-btn2" data-link-toggle="'+k+'">'+(liensDemo[k]?'Simuler une panne':'Rétablir la simulation')+'</button></div>';}).join('')+'<p class="k-note">Sauvegarde locale : '+(stockageOK?'active sur ce navigateur (données fictives uniquement).':'indisponible : un rechargement peut perdre les changements.')+'</p><h3>'+pending.length+' opération(s) en attente</h3>'+pending.map(function(j){return '<p class="k-job">#'+j.commande+' · v'+j.version+' · '+esc(j.type)+' <button data-job-retry="'+esc(j.key)+'">Réessayer</button></p>';}).join('')+'<button class="k-btn2" data-retry-all>Réessayer toutes les opérations</button><details class="k-history"><summary>Journal des opérations simulées</summary>'+jobs.slice().reverse().map(function(j){return '<p>#'+j.commande+' · v'+j.version+' · '+esc(j.type)+' · '+(j.etat==='attente'?'en attente':j.etat==='remplace'?'remplacée par une version plus récente':'traitement simulé')+'</p>';}).join('')+'</details><button class="k-text-danger" data-reset-demo>Réinitialiser les données de démonstration</button>'+(ops.reset?'<p class="k-note">Efface uniquement les commandes et réglages fictifs de cette cuisine sur ce navigateur.</p><button class="k-btn2" data-reset-confirm>Confirmer la réinitialisation</button>':'');
    return feuilleOps('Connexions et reprises',html);
  }

  function badgeOrigine(c){
    return '<span class="k-origin ' + (c.origine === 'restaurant' ? 'k-origin-pos' : '') + '">' +
      '<span class="k-origin-mark" aria-hidden="true">' + (c.origine === 'restaurant' ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 3h14v9H5zM12 12v4M3 16h18v5H3zM7 7h10M16 18v1"/></svg>' : '<img src="assets/logo-toque.png" alt="" width="16" height="16">') + '</span><span class="k-origin-name">' + (c.origine === 'restaurant' ? 'Restaurant' : 'IA Pelyo') + '</span></span>';
  }

  function infosCaisse(c){
    var valide = /^(confirmee|preparation|prete|terminee)$/.test(c.etat);
    return '<div class="k-origin-line">' + badgeOrigine(c) + '<span>' + esc(c.date || 'Date non renseignée') + ' · ' + esc(c.heure || '—') + '</span></div>' +
      (valide ? '<div class="k-sync-note"><b>' + (c.syncCaisse === 'en_attente' ? 'Caisse : en attente (démo)' : c.syncCaisse==='simulee' ? (c.origine==='restaurant'?'Import caisse simulé':'Enregistrement caisse simulé') : 'Caisse non connectée') + '</b><span>Réf. ' + esc(c.referenceCommande) + (c.referenceCaisse ? ' · caisse ' + esc(c.referenceCaisse) : '') + '</span><span>Encaissement non transmis · Pelyo ne gère pas le paiement.</span></div>' : '');
  }

  function importerCaisseDemo(){
    var event = D_.caisseDemo;
    var existante = cmds.filter(function(c){return c.referenceCaisse === event.referenceCaisse;})[0];
    if (existante) { api.toast('Événement caisse déjà reçu : aucun doublon, aucune réimpression.'); return; }
    var c = JSON.parse(JSON.stringify(event));
    c.referenceCommande = 'DEMO-CAISSE-' + c.id;
    c.syncCaisse = 'simulee'; c.depuis = 0; c.reste = 0;
    PelyoKitchen.initialise(c,Date.now(),D_.cuisineOperations.heureReference);
    cmds.unshift(c);
    imprimes[c.id] = true; /* La caisse est propriétaire de l’impression initiale. */
    api.toast('Démo : commande caisse #' + c.id + ' importée. Impression laissée à la caisse.');
    vue = 'service'; filtre = 'faire'; peindre();
  }

  function icone(n){
    var paths = {
      service:'<path d="M4 5h16v15H4zM8 2v6m8-6v6M8 12h8m-8 4h5"/>',
      ruptures:'<path d="M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-3H4zm9 3a3 3 0 0 1 3-3h5v14h-4a4 4 0 0 0-4 3"/>',
      tickets:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6m-6 4h6"/>',
      rythme:'<path d="M3 17a9 9 0 1 1 18 0M12 13l4-5M6 17h12"/><circle cx="12" cy="14" r="2"/>',
      sound:'<path d="M4 9h4l5-4v14l-5-4H4zM17 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
      mute:'<path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6m0-6-5 6"/>',
      arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
      print:'<path d="M7 8V3h10v5M7 17H4V8h16v9h-3M7 14h10v7H7zM16 11h1"/>',
      bag:'<path d="M5 7h14l1 14H4zM9 8V5a3 3 0 0 1 6 0v3"/>',
      truck:'<path d="M2 6h12v12H2zm12 4h4l4 4v4h-8"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
      phone:'<path d="M6 3h4l1 5-2 2a16 16 0 0 0 5 5l2-2 5 1v4c0 2-2 3-4 3A18 18 0 0 1 3 7c0-2 1-4 3-4z"/>',
      wave:'<path d="M3 10v4m4-7v10m5-14v18m5-15v12m4-8v4"/>',
      settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
      search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
      check:'<path d="m5 12 4 4L19 6"/>',
      mic:'<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/>'
    };
    return '<svg class="k-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[n] || paths.service) + '</svg>';
  }

  function navigation(){
    return '<nav class="k-dock" aria-label="Navigation cuisine">' + VUES.map(function(v){
      return '<button data-vue="' + v.id + '" aria-current="' + (vue === v.id ? 'page' : 'false') + '" class="' + (vue === v.id ? 'k-active' : '') + '">' + icone(v.id) + '<span>' + esc(v.lbl) + '</span></button>';
    }).join('') + '</nav>';
  }

  function titre(sous, titreTexte, droite){
    return '<div class="k-page-title"><div><span class="k-eyebrow">' + sous + '</span><h1>' + titreTexte + '</h1></div>' + (droite || '') + '</div>';
  }

  /* Toutes les commandes de cette maquette se déroulent le même jour — la
     date du jour suffit, affichée telle quelle partout où une date est due. */
  function dateCourte(){
    var d = new Date();
    return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0");
  }
  function dateLongue(){
    var d = new Date(), MOIS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
    return d.getDate() + " " + MOIS[d.getMonth()] + " " + d.getFullYear();
  }

  function bip(){
    if (!son) return;
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      var t = audio.currentTime;
      [880, 1320].forEach(function(f, i){
        var o = audio.createOscillator(), g = audio.createGain();
        o.type = "square"; o.frequency.value = f;
        g.gain.setValueAtTime(.0001, t + i*.12);
        g.gain.exponentialRampToValueAtTime(.16, t + i*.12 + .01);
        g.gain.exponentialRampToValueAtTime(.0001, t + i*.12 + .1);
        o.connect(g); g.connect(audio.destination);
        o.start(t + i*.12); o.stop(t + i*.12 + .12);
      });
    } catch(e){}
  }

  /* --------------------------- rendu : en-tête --------------------------- */
  function head(){
    /* Le niveau (rush/normal/…) a sa propre ligne juste sous les filtres,
       dans l'écran Service (voir vueService) : plus besoin de le répéter
       ici, à côté du nom du restaurant. */
    return '<header class="k-head"><button class="k-logo" data-menu aria-label="Pelyo, ouvrir le menu"><img src="assets/logo-toque.png" alt="" width="36" height="36"></button>' +
      '<div class="k-brand"><b>' + esc(nomResto()) + '</b><span>Pelyo · cuisine</span></div>' +
      '<button class="k-sound" data-son aria-label="' + (son ? 'Couper' : 'Activer') + ' les alertes sonores" aria-pressed="' + son + '">' + icone(son ? 'sound' : 'mute') + '</button></header><div class="k-healthbar">'+etatConnexion()+'</div>';
  }

  /* -------------------------- tiroir de navigation -------------------------- */
  /* Monté une seule fois dans monter(), hors du cycle de repaint de .k-app —
     c'est ce qui permet à la transition de glissement de vraiment s'animer :
     un nœud recréé à chaque `innerHTML` n'a pas d'état précédent depuis
     lequel transitionner. Seule sa liste interne est régénérée (rafraichirTiroir),
     pour refléter l'onglet actif sans reconstruire le tiroir lui-même. */
  function listeTiroir(){
    return VUES.map(function(v){
      return '<button data-vue="' + v.id + '" class="' + (vue === v.id ? "on" : "") + '">' + esc(v.lbl) + '</button>';
    }).join("")+'<div class="k-tiroir-sep" aria-hidden="true"></div><button data-vue="parametres" class="'+(vue==='parametres'?'on':'')+'">Réglages et informations</button>';
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

  /* --------------------------- rendu : le tableau --------------------------- */
  function ligneMinuteur(c){
    if (c.etat === "attente"){
      var r = Math.max(0, c.reste | 0);
      return '<u class="k-amb">' + api.chrono(r) + '</u><small>expire</small>';
    }
    if (c.etat === "preparation"){
      var d = c.depuis | 0;
      var trop = c.promesseAt && c.promesseAt < Date.now();
      return '<u class="' + (trop ? "k-amb" : "") + '">' + api.chrono(d) + '</u><small>en cuisson</small>';
    }
    if (c.etat === "prete") return '<u class="k-rdy">' + esc(c.prete || "—") + '</u><small>à remettre</small>';
    if (c.etat === "appel") return '<u>' + api.chrono(c.depuis | 0) + '</u><small>en ligne</small>';
    if (c.etat === "expiree") return '<u class="k-strike">00:00</u><small>sans validation</small>';
    if (c.etat === "annulee") return '<small>Ne plus préparer</small>';
    if (c.etat === "terminee") return '<u>' + esc(c.prete || "") + '</u><small>servie</small>';
    return '<u>' + esc(c.prete || "—") + '</u><small>annoncée</small>';
  }

  function ligneAction(c){
    if(c.ackVersion<c.version)return '<button class="k-btn2" data-open="'+c.id+'">Lire le changement</button>';
    if(c.probleme)return '<button class="k-btn2" data-open="'+c.id+'">Traiter le problème</button>';
    if (c.etat === "confirmee")
      return '<button class="k-btn" data-go="' + c.id + '">Commencer</button>';
    if (c.etat === "preparation")
      return '<button class="k-btn amb" data-go="' + c.id + '">' +
        (c.mode === "livraison" ? "Prête pour livreur" : "Prête au comptoir") + '</button>';
    if (c.etat === "prete")
      return '<button class="k-btn rdy" data-go="' + c.id + '">' +
        (c.mode === "livraison" ? "Livrée" : "Récupérée") + '</button>';
    if (c.etat === "attente") return '<div class="k-hold">Ne rien<br>préparer</div>';
    if (c.etat === "appel")   return '<div class="k-hold">Commande<br>en cours</div>';
    return '<div class="k-hold">—</div>';
  }

  function ligne(c){
    var e = ETATS[c.etat];
    var mort = (c.etat === "annulee" || c.etat === "expiree" || c.etat === "terminee" || c.etat === "attente" || c.etat === "appel");
    var contenu = c.lignes.length
      ? c.lignes.map(function(l){ return l.q + "× " + l.nom; }).join(", ")
      : "prise de commande en cours";
    var detail = c.lignes.length
      ? c.lignes.map(function(l){ return [l.opt, l.sup ? "+ " + l.sup : "", l.dem].filter(Boolean).join(" · "); })
          .filter(Boolean).join("  ·  ")
      : "aucun produit tant que le client n'a pas confirmé";

    return '<article class="k-order k-state-' + c.etat + '"><div class="k-order-top"><div class="k-order-identity"><button class="k-order-id" data-open="' + c.id + '" aria-label="Détails de la commande ' + c.id + '"><span>#</span>' + c.id + '</button>' + badgeOrigine(c) + '</div><span class="k-status">' + esc(e.lbl) + '</span><span class="k-t" data-timer="' + c.id + '">' + ligneMinuteur(c) + '</span></div>' +
      '<div class="k-order-signals">'+alertesCommande(c)+'<span data-deadline="'+c.id+'">'+delaiPromis(c)+'</span></div>' +
      '<div class="k-customer">' + icone(c.mode === 'livraison' ? 'truck' : 'bag') + '<b>' + esc(c.client || 'Client en ligne') + '</b><span>' + (c.mode === 'livraison' ? 'Livraison' : 'À emporter') + '</span></div>' +
      '<div class="k-order-lines">' + (c.lignes.length ? c.lignes.map(function(l){
        return '<div class="k-product"><span class="k-quantity">' + l.q + '</span><div><b>' + esc(l.nom) + '</b>' + (l.opt ? '<p>' + esc(l.opt) + '</p>' : '') + (l.sup ? '<p class="k-extra">+ ' + esc(l.sup) + '</p>' : '') + consignes(l,true) + '</div></div>';
      }).join('') : '<p class="k-note">Le client compose sa commande.</p>') + '</div>' +
      (c.mode === 'livraison' ? adresseCarte(c) : '') +
      '<div class="k-order-foot">' + (mort ? '<span class="k-hold">' + (c.etat==='annulee'?'Annulée · ne plus préparer':c.etat === 'terminee' ? 'Commande terminée' : c.etat === 'expiree' ? 'Sans validation' : 'Ne pas préparer avant confirmation') + '</span>' : '<button class="k-print" data-imprimer="' + c.id + '" aria-label="Imprimer le ticket ' + c.id + '">' + icone('print') + '</button>' + ligneAction(c)) + '</div></article>';
  }

  function vueService(){
    var f = FILTRES.filter(function(x){ return x.id === filtre; })[0] || FILTRES[0];
    var liste = cmds.filter(f.test);
    if(triUrgence)liste.sort(function(a,b){return (a.promesseAt||Infinity)-(b.promesseAt||Infinity)||a.id-b.id;});
    var alertes=cmds.filter(function(c){return c.ackVersion<c.version;});

    var appels = cmds.filter(function(c){ return c.etat === 'appel' || c.etat === 'attente'; });
    return titre('LE PASSE', 'Le service.', '<button class="k-pace-pill" data-vue="rythme"><i></i>' + esc(niveau().nom) + ' ' + icone('arrow') + '</button>') +
    '<div class="k-service-meta"><span><b>' + aPreparer() + '</b> en production</span><span>' + (charge==='stop'?'Prises en pause':!retraitOuvert?'Retrait fermé':!livraisonOuverte?'Livraison fermée':'Retrait <b>'+delaiRetrait+' min</b>') + '</span><button data-demo-arrive>+ Démo</button></div>' +
    '<div class="k-filt" aria-label="Filtrer les commandes">' +
      FILTRES.map(function(x){
        return '<button data-filt="' + x.id + '" class="' + (filtre === x.id ? "on" : "") + '">' +
          esc(x.lbl) + '<em>' + compte(x) + '</em></button>';
      }).join("") +
    '</div>' +
    '<div class="k-body">' +
      '<div class="k-service-tools"><button data-urgence aria-pressed="'+triUrgence+'">'+(triUrgence?'Tri : heure promise':'Trier par urgence')+'</button></div>'+
      (alertes.length?'<div class="k-alert-list" aria-live="polite"><b>'+alertes.length+' changement(s) à lire</b>'+alertes.map(function(c){return '<button data-open="'+c.id+'">#'+c.id+' · '+(c.etat==='annulee'?'Annulée':'Modifiée')+' ↗</button>';}).join('')+'</div>':'')+
      (derniereAction ? '<button class="k-undo" data-undo>Commande #' + derniereAction.id + ' mise à jour <b>Annuler</b></button>' : '') +
      (liste.length ? '<div class="k-orders">' + liste.map(ligne).join('') + '</div>'
        : '<div class="k-empty">' + icone('check') + '<h2>Le passe est libre.</h2><p>Aucune commande dans cette file.<br>Les nouvelles commandes apparaîtront ici.</p></div>') +
      (appels.length ? '<section class="k-incoming"><div class="k-incoming-title">' + icone('wave') + '<div><b>L’IA prend le relais</b><span>' + appels.length + ' commande(s) non confirmée(s)</span></div></div>' + appels.map(function(c){ return '<button class="k-call" data-open="' + c.id + '"><span>#' + c.id + ' · ' + esc(c.client || 'Client') + '<small>' + esc(ETATS[c.etat].lbl) + '</small></span><span class="k-t" data-timer="' + c.id + '">' + ligneMinuteur(c) + '</span></button>'; }).join('') + '</section>' : '') +
      '<div class="k-demo-note">Compte démo · données de démonstration</div>' +
    '</div>';
  }

  /* ------------------------------ ticket ------------------------------ */
  function ticket(c){
    if (!c) return "Aucune commande : rien à imprimer.";
    var l = [];
    l.push("      " + nomResto().toUpperCase());
    l.push("   " + D_.resto.adresse);
    l.push("================================");
    l.push("COMMANDE #" + c.id + "        " + (c.mode === "livraison" ? "LIVRAISON" : "RETRAIT"));
    l.push("VERSION " + c.version + (c.etat==='annulee'?' — ANNULEE — NE PLUS PREPARER':''));
    if(c.historique&&c.historique.length){var h=c.historique.filter(function(x){return x.version===c.version;})[0];if(h){l.push(h.type.toUpperCase());h.details.forEach(function(t){l.push('! '+t);});}}
    l.push("Date      " + (c.date || dateLongue()));
    l.push("Origine   " + (c.origine === 'restaurant' ? 'Restaurant' : 'IA Pelyo'));
    l.push("Reference " + c.referenceCommande);
    l.push("Recue     " + (c.heure || "--:--"));
    l.push("Annoncee  " + (c.prete || "--:--"));
    l.push("Client    " + (c.client || "-"));
    if(c.mode==='livraison'){
      l.push("Rue       " + adresseRue(c));
      l.push("CP / ville " + (adresseVille(c)||"A preciser"));
      if(c.adresseDetail&&c.adresseDetail.complement)l.push("Complement " + c.adresseDetail.complement);
      if(c.adresseDetail&&c.adresseDetail.acces)l.push("Acces     " + c.adresseDetail.acces);
      if(c.telephoneClient)l.push("Telephone " + c.telephoneClient);
      if(c.distanceARevoir)l.push("Distance a reverifier - frais inchanges");
    }
    l.push("--------------------------------");
    c.lignes.forEach(function(x){
      l.push(x.q + "x " + x.nom.toUpperCase());
      if (x.opt) l.push("   " + x.opt);
      if (x.sup) l.push("   + " + x.sup);
      if (x.dem) l.push("   ! " + x.dem);
      if (x.allergie) l.push("   !!! ALLERGIE DECLAREE : " + x.allergie);
    });
    l.push("--------------------------------");
    l.push("TOTAL                    " + (total(c)/100).toFixed(2).replace(".", ","));
    if (c.mode === "livraison") l.push("dont frais " + (c.frais/100).toFixed(2).replace(".", ",") + " - " + c.paiement);
    else l.push("Mode prevu : sur place");
    l.push("Encaissement non transmis");
    l.push("================================");
    l.push(c.etat==='annulee' ? " Commande annulee" : c.origine === 'restaurant' ? " Commande validee en caisse" : " Commande confirmee par le client");
    l.push(" DEMONSTRATION - pas un recu fiscal");
    return l.join("\n");
  }

  /* Déclenche un vrai téléchargement du ticket en texte brut — pas une
     simulation : un fichier .txt part réellement dans le navigateur. */
  function telechargerTicket(c){
    var blob = new Blob([ticket(c)], { type:"text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "ticket-" + c.id + ".txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
    api.toast("Ticket " + c.id + " téléchargé.");
  }

  /* --------------------------- historique des tickets --------------------------- */
  /* Tout ce qui a été confirmé a un ticket : ni les appels en cours, ni les
     commandes jamais validées, ni les expirées (rien n'a été imprimé). */
  var TRIS = [
    { id:"recent", lbl:"Récent" },
    { id:"ancien", lbl:"Ancien" },
    { id:"nom",    lbl:"Nom" }
  ];

  function ticketsHistorique(){
    var liste = cmds
      .filter(function(c){ return c.etat !== "appel" && c.etat !== "attente" && c.etat !== "expiree"; })
      .slice();
    if (recherche) liste = liste.filter(function(c){ return api.norm(String(c.id) + ' ' + (c.client || '') + ' ' + c.lignes.map(function(l){return l.nom;}).join(' ')).indexOf(api.norm(recherche)) !== -1; });
    if (triHistorique === "nom") liste.sort(function(a, b){ return String(a.client || "").localeCompare(String(b.client || ""), "fr"); });
    else if (triHistorique === "ancien") liste.sort(function(a, b){ return a.id - b.id; });
    else liste.sort(function(a, b){ return b.id - a.id; });
    return liste;
  }

  function ligneTicket(c){
    var contenu = c.lignes.length
      ? c.lignes.map(function(l){ return l.q + "× " + l.nom; }).join(", ")
      : "—";
    return '<div class="k-trow" data-voirticket="' + c.id + '" role="button" tabindex="0">' +
      '<span class="k-trow-n k-mono">' + c.id + '</span>' +
      '<span class="k-trow-c"><b>' + esc(c.client || "Non communiqué") + '</b><span>' + esc(contenu) + '</span></span>' +
      '<span class="k-trow-h">' + badgeOrigine(c) + ' ' + esc(c.date || dateCourte()) + ' · ' + esc(c.heure || "—") + '</span>' +
    '</div>';
  }

  function vueTickets(){
    var historique = ticketsHistorique();
    var triActuel = TRIS.filter(function(t){ return t.id === triHistorique; })[0];
    return titre('LA MÉMOIRE DU SERVICE', 'Les tickets.', '<span class="k-total-count">' + historique.length + '</span>') +
    '<form class="k-search" data-search-form>' + icone('search') + '<input data-search aria-label="Rechercher un ticket" placeholder="Un nom, un numéro, un produit…" value="' + esc(recherche) + '"><button type="submit">Chercher</button></form>' + '<div class="k-tikhead">' +
      '<button class="k-btn2" data-tri-ouvrir>Trier · ' + esc(triActuel.lbl) + '</button>' +
    '</div>' +
    '<div class="k-body">' +
      (historique.length ? historique.map(ligneTicket).join("")
        : '<div class="k-empty">Aucun ticket pour l\'instant.</div>') +
    '</div>';
  }

  function overlayTri(){
    return '<div class="k-over">' +
      '<div class="k-ohead"><button data-fermer-tri>← Retour</button></div>' +
      '<div class="k-lbl">Trier l\'historique</div>' +
      TRIS.map(function(t){
        return '<button class="k-r' + (triHistorique === t.id ? " sel" : "") + '" data-tri="' + t.id + '">' +
          '<span class="v">' + esc(t.lbl) + '</span>' +
          '<span class="s' + (triHistorique === t.id ? " rdy" : "") + '">' + (triHistorique === t.id ? "Actif" : "Choisir") + '</span>' +
        '</button>';
      }).join("") +
    '</div>';
  }

  function overlayTicket(c){
    var imp = imprimes[c.id];
    return '<div class="k-over">' +
      '<div class="k-ohead"><button data-fermer-ticket>← Retour</button></div>' +
      '<div class="k-lbl">Ticket<em>#' + c.id + '</em></div>' + infosCaisse(c) +
      '<div class="k-tkwrap"><div class="k-tk">' + esc(ticket(c)) + '</div></div>' +
      '<div class="k-ofoot">' +
        '<button class="k-btn" data-telecharger="' + c.id + '">Télécharger</button>' +
        '<button class="k-btn2" data-imprimer="' + c.id + '">' + (imp ? "Réimprimer" : "Imprimer") + '</button>' +
      '</div>' +
    '</div>';
  }

  function vueParametres(){
    var impression = [
      { k:"Impression auto",      v:impressionAuto ? "Activée (démo)" : "Désactivée", a:"auto" },
      { k:"Annulations",          v:impressionAnnulations ? "Imprimées (démo)" : "Non imprimées", a:"ann" },
      { k:"Imprimante",           v:"Epson TM-m30 · comptoir",            a:"imp" },
      { k:"Test",                 v:"Envoyer une ligne de test",          a:"test" }
    ];
    return titre('LE POSTE DE CUISINE','Réglages.','')+
      '<div class="k-pane k-settings-page">'+
      '<p class="k-settings-intro">Tout est rangé par usage. Ouvrez uniquement la catégorie dont vous avez besoin.</p>'+
      '<details class="k-settings-group" data-settings-group="service"><summary><span><small>01 / LE SERVICE</small><b>Service et alertes</b><em>Rythme, disponibilité, son</em></span><i aria-hidden="true">⌄</i></summary><div class="k-settings-content">'+
      '<button class="k-settings-row" data-vue="rythme"><span><b>Rythme du service</b><small>Rush, délais et canaux disponibles</small></span>'+icone('arrow')+'</button>'+
      '<button class="k-settings-row" data-reg="son"><span><b>Alerte sonore</b><small>'+(son?'Active':'Coupée')+'</small></span>'+icone('arrow')+'</button></div></details>'+
      '<details class="k-settings-group" data-settings-group="tickets"><summary><span><small>02 / LES TICKETS</small><b>Tickets et imprimante</b><em>Impression, annulations, test</em></span><i aria-hidden="true">⌄</i></summary><div class="k-settings-content">'+
      impression.map(function(r){return '<button class="k-settings-row" data-reg="'+r.a+'"><span><b>'+esc(r.k)+'</b><small>'+esc(r.v)+'</small></span>'+icone('arrow')+'</button>';}).join('')+'</div></details>'+
      '<details class="k-settings-group" data-settings-group="connexions"><summary><span><small>03 / LE MATÉRIEL</small><b>Caisse et connexions</b><em>État des liaisons et commandes</em></span><i aria-hidden="true">⌄</i></summary><div class="k-settings-content"><button class="k-settings-row" data-ops="connections"><span><b>État et opérations en attente</b><small>Caisse et imprimante simulées dans la maquette</small></span>'+icone('arrow')+'</button><button class="k-settings-row" data-import-caisse><span><b>Tester une commande caisse</b><small>Simulation sans doublon</small></span>'+icone('arrow')+'</button></div></details>'+
      '<details class="k-settings-group" data-settings-group="informations"><summary><span><small>04 / PELYO</small><b>Informations et aide</b><em>Documents et assistance</em></span><i aria-hidden="true">⌄</i></summary><div class="k-settings-content">'+
      [['confidentialite','Confidentialité'],['mentions','Mentions légales'],['conditions','Conditions d’utilisation'],['assistance','Assistance']].map(function(i){return '<button class="k-settings-row" data-info="'+i[0]+'"><span><b>'+i[1]+'</b><small>'+(i[0]==='assistance'?'Canal à définir':'Voir les informations')+'</small></span>'+icone('arrow')+'</button>';}).join('')+
      '<p class="k-settings-disclaimer">Textes définitifs et coordonnées de la société à publier avant la mise en service.</p></div></details>'+
      '<div class="k-settings-foot"><span>Pelyo cuisine · maquette</span><button data-exit-demo>Quitter la démo</button></div></div>';
  }

  /* ------------------------------ ruptures ------------------------------ */
  /* Plus de liste exhaustive du menu à cocher produit par produit : un
     chatbot reçoit l'info (à l'écrit ou dictée), reconnaît le ou les
     produits cités et applique la rupture — ou la lève — lui-même. Les
     chips au-dessus du fil ne servent qu'à voir d'un coup d'œil ce qui est
     actuellement fermé, et à l'annuler en un geste en cas d'erreur. */
  function trouverProduit(id){
    for (var i = 0; i < D_.menu.length; i++)
      for (var j = 0; j < D_.menu[i].items.length; j++)
        if (String(D_.menu[i].items[j].id) === String(id)) return D_.menu[i].items[j];
    return null;
  }

  function ruptActives(){
    var l = [];
    D_.menu.forEach(function(cat){
      if (catOff[cat.cat]) l.push({ id:"cat:" + cat.cat, nom:cat.cat });
      else cat.items.forEach(function(it){ if (rupt[it.id]) l.push({ id:"it:" + it.id, nom:it.nom }); });
    });
    listeSupplements().forEach(function(s){if(supOff[s.id])l.push({id:'s:'+s.id,nom:s.nom+' (supplément)'});});
    D_.cuisineOperations.ingredients.forEach(function(i){if(ingredientOff[i.id])l.push({id:'i:'+i.id,nom:i.nom+' (ingrédient)'});});
    return l;
  }

  function retablirUn(id){
    if (id.indexOf("cat:") === 0){
      var nomCat = id.slice(4);
      setStock('c',nomCat,false);
      ruptChat.push({ de:"ia", texte:"C'est noté, " + nomCat + " est de nouveau en carte." });
    } else if (id.indexOf("it:") === 0){
      var pid = id.slice(3), it = trouverProduit(pid);
      setStock('p',pid,false);
      ruptChat.push({ de:"ia", texte:"C'est noté, " + (it ? it.nom : "ce produit") + " est de nouveau disponible." });
    } else if(id.indexOf('s:')===0||id.indexOf('i:')===0){setStock(id.charAt(0),id.slice(2),false);}
    peindre();
  }

  /* ------------------------ reconnaissance locale ------------------------ */
  /* Repli sans réseau : recherche de mots-clés. Utilisé quand IA_ENDPOINT
     est vide, ou quand le relais ne répond pas. Ne pousse pas le message du
     cuisinier (déjà fait par traiterMessage) — seulement la réponse. */
  function appliquerLocal(texte){
    var n = api.norm(texte);
    var restaurer = /remet|revient|redispo|recu|arrivee|de nouveau|a nouveau/.test(n) || (/\bdisponible/.test(n) && !/plus|pas|indisponible/.test(n));
    /* Un produit trouvé prime sur sa catégorie : « tacos M » contient
       « tacos », qui est aussi le nom de la catégorie « Tacos ». Sans cette
       priorité, citer un seul produit fermerait toute la catégorie. */
    var catsT = [], itemsT = [];
    D_.menu.forEach(function(cat){
      cat.items.forEach(function(it){
        if (n.indexOf(api.norm(it.nom)) !== -1) itemsT.push({ item:it, cat:cat });
      });
    });
    D_.menu.forEach(function(cat){
      var viaItem = itemsT.some(function(x){ return x.cat === cat; });
      if (!viaItem && n.indexOf(api.norm(cat.cat)) !== -1) catsT.push(cat);
    });
    if (!catsT.length && !itemsT.length){
      ruptChat.push({ de:"ia", texte:"Je n'ai pas reconnu de produit du menu. Essayez par exemple « il n'y a plus de tacos M »." });
      return;
    }
    var mettre = !restaurer;
    catsT.forEach(function(c){ setStock('c',c.cat,mettre); });
    itemsT.forEach(function(x){ setStock('p',x.item.id,mettre); });
    var noms = catsT.map(function(c){ return c.cat; }).concat(itemsT.map(function(x){ return x.item.nom; }));
    var reponse;
    if (mettre){
      reponse = "Noté : " + noms.join(", ") + " en rupture. L'IA au téléphone ne le" +
        (noms.length > 1 ? "s" : "") + " proposera plus dès le prochain appel, et le signalera si un client insiste.";
      if (itemsT.length === 1 && !catsT.length){
        var cat0 = itemsT[0].cat, id0 = itemsT[0].item.id;
        var alt = cat0.items.filter(function(x){ return x.id !== id0 && !stockEffectif(x,cat0.cat); })[0];
        if (alt) reponse += " Elle proposera plutôt : " + alt.nom + ".";
      }
    } else {
      reponse = "C'est noté, " + noms.join(", ") + " de nouveau disponible" + (noms.length > 1 ? "s" : "") + ".";
    }
    ruptChat.push({ de:"ia", texte:reponse });
  }

  /* ------------------------------ relais IA ------------------------------ */
  function menuCompact(){
    return D_.menu.map(function(cat){
      return { cat:cat.cat, items:cat.items.map(function(it){ return { id:String(it.id), nom:it.nom }; }) };
    });
  }

  function etatActuel(){
    var catsOff = [], prodOff = [];
    D_.menu.forEach(function(cat){
      if (catOff[cat.cat]) catsOff.push(cat.cat);
      cat.items.forEach(function(it){ if (stockEffectif(it,cat.cat)) prodOff.push(String(it.id)); });
    });
    return { categories_off:catsOff, produits_off:prodOff };
  }

  /* Applique ce que le relais a décidé — categories[] et produits[] portent
     chacun {nom|id, off}. Ignore silencieusement un nom/id inconnu plutôt
     que de planter sur une réponse mal formée. */
  function appliquerChangements(resultat){
    var categories = Array.isArray(resultat.categories) ? resultat.categories : [];
    var produits = Array.isArray(resultat.produits) ? resultat.produits : [];
    categories.forEach(function(c){ if (c && typeof c.off === 'boolean' && D_.menu.some(function(cat){ return cat.cat === c.nom; })) setStock('c',c.nom,c.off); });
    produits.forEach(function(p){ if (p && typeof p.off === 'boolean' && trouverProduit(p.id)) setStock('p',String(p.id),p.off); });
  }

  /* L'IA a besoin de tout l'échange, pas seulement du dernier message —
     sinon elle « oublie » ce qui a été dit deux messages plus haut (produit
     déjà cité, réponse à une question posée juste avant). On reconstruit
     l'historique à partir du fil affiché, dans l'ordre, sans les bulles
     d'attente ("···"). */
  function historiqueChat(){
    return ruptChat
      .filter(function(m){ return !m.attente; })
      .map(function(m){ return { role: m.de === "ia" ? "assistant" : "user", contenu: m.texte }; });
  }

  function appelIA(historique, cb){
    var xhr = new XMLHttpRequest();
    try { xhr.open("POST", IA_ENDPOINT, true); }
    catch(e){ cb(e); return; }
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.timeout = 12000;
    xhr.onload = function(){
      if (xhr.status < 200 || xhr.status >= 300){ cb(new Error("http " + xhr.status)); return; }
      var data;
      try { data = JSON.parse(xhr.responseText); } catch(e){ cb(e); return; }
      if (data.erreur){ cb(new Error(data.erreur)); return; }
      cb(null, data);
    };
    xhr.onerror = function(){ cb(new Error("réseau")); };
    xhr.ontimeout = function(){ cb(new Error("délai dépassé")); };
    try { xhr.send(JSON.stringify({ historique:historique, menu:menuCompact(), etat:etatActuel() })); }
    catch(e){ cb(e); }
  }

  function traiterMessage(texte){
    var generation = montageId;
    ruptChat.push({ de:"cu", texte:texte });

    if (!IA_ENDPOINT){
      appliquerLocal(texte);
      peindre();
      return;
    }

    var attente = { de:"ia", texte:"···", attente:true };
    ruptChat.push(attente);
    peindre();

    appelIA(historiqueChat(), function(erreur, resultat){
      if (generation !== montageId || !root.isConnected) return;
      var i = ruptChat.indexOf(attente);
      if (i !== -1) ruptChat.splice(i, 1);
      if (erreur){
        /* Le chat reste utilisable même si le relais est hors service. */
        appliquerLocal(texte);
      } else {
        appliquerChangements(resultat);
        ruptChat.push({ de:"ia", texte:resultat.reponse || "C'est noté." });
      }
      peindre();
    });
  }

  function envoyerChat(){
    if (reel) return pasEncoreRelie();
    var inp = root.querySelector("[data-chatinp]");
    var texte = inp ? inp.value.trim() : "";
    if (!texte) return;
    brouillon = "";
    traiterMessage(texte);
  }

  function ecouter(){
    if (ruptEcoute) return;
    ruptEcoute = true;
    api.toast("Démonstration vocale : une phrase exemple sera utilisée. Le microphone n’est pas activé.");
    peindre();
    api.after(function(){
      ruptEcoute = false;
      var phrase = VOIX[voixIdx % VOIX.length];
      voixIdx++;
      traiterMessage(phrase);
    }, 1500);
  }

  function bulle(m){
    return '<div class="k-bulle ' + (m.de === "ia" ? "ia" : "cu") + (m.attente ? " attente" : "") + '">' +
      esc(m.texte) + '</div>';
  }

  function vueRuptures(){
    var actifs = ruptActives();
    return titre('DISPONIBILITÉS', 'À la carte.', '<span class="k-total-count">' + actifs.length + '<small>ruptures</small></span>') + '<div class="k-chat">' +
      '<button class="k-carte-voir" data-ops="menu"><span>' + icone('ruptures') + '</span><span><b>Voir la carte</b><small>Le menu tel que vos clients le découvrent</small></span>' + icone('arrow') + '</button>' +
      '<button class="k-stock-access" data-ops="stock">Suppléments, ingrédients et durées ↗</button>'+ '<details class="k-inventory"><summary>Gérer les produits à la main ' + icone('settings') + '</summary><div class="k-inventory-list">' + D_.menu.map(function(cat){ return '<div class="k-inventory-category"><b>' + esc(cat.cat) + '</b><button data-toggle-cat="' + esc(cat.cat) + '" aria-pressed="' + !!catOff[cat.cat] + '">' + (catOff[cat.cat] ? 'Rétablir' : 'Tout suspendre') + '</button></div>' + cat.items.map(function(it){ return '<button class="k-stock-item" data-toggle-stock="' + esc(it.id) + '" aria-pressed="' + stockEffectif(it,cat.cat) + '"><span>' + esc(it.nom) + '</span><span class="k-stock-state">' + (stockEffectif(it,cat.cat) ? 'En rupture' : 'Disponible') + '</span></button>'; }).join(''); }).join('') + '</div></details>' +
      '<div class="k-chips">' +
        (actifs.length
          ? actifs.map(function(x){
              return '<button class="k-chip" data-unrupt="' + esc(x.id) + '">' + esc(x.nom) + ' ✕</button>';
            }).join("")
          : '<span class="k-chipsvide">Aucune rupture en cours</span>') +
      '</div>' +
      '<div class="k-msgs">' + ruptChat.map(bulle).join("") + '</div>' +
      '<div class="k-chatbar">' +
        '<button class="k-mic' + (ruptEcoute ? " on" : "") + '" data-mic aria-label="Simuler une dictée vocale">' +
          (ruptEcoute ? "···" : icone('mic')) +
        '</button>' +
        '<input class="k-chatinp" data-chatinp aria-label="Message à l’assistant de disponibilité" value="' + esc(brouillon) + '" autocomplete="off" placeholder="Il n’y a plus de tacos M…">' +
        '<button class="k-send" data-send aria-label="Envoyer le message">' + icone('arrow') + '</button>' +
      '</div>' +
    '</div>';
  }

  /* ------------------------------- rythme ------------------------------- */
  function vueRythme(){
    var lv=niveau(),actives=cmds.filter(function(c){return PelyoKitchen.actif(c);}).length;
    var modes=D_.charges.map(function(c,i){return '<button class="k-rhythm-mode'+(charge===c.id?' is-active':'')+'" data-charge="'+c.id+'" aria-pressed="'+(charge===c.id)+'"><span class="k-rhythm-index k-mono">0'+(i+1)+'</span><span class="k-rhythm-mode-copy"><b>'+esc(c.nom)+'</b><small>'+esc(c.dit)+'</small></span><span class="k-rhythm-mode-mark" aria-hidden="true"></span></button>';}).join('');
    var reglages=[
      {id:'retrait',nom:'Retrait',description:'Délai annoncé au comptoir',valeur:delaiRetrait,unite:'min',moins:'retrait-',plus:'retrait+'},
      {id:'livraison',nom:'Livraison',description:'Délai annoncé à domicile',valeur:delaiLivraison,unite:'min',moins:'liv-',plus:'liv+'},
      {id:'capacite',nom:'Capacité',description:'Commandes simultanées acceptées',valeur:capacite,unite:'',moins:'cap-',plus:'cap+'}
    ].map(function(r){return '<div class="k-rhythm-adjust" data-adjust="'+r.id+'"><div class="k-rhythm-adjust-copy"><b>'+r.nom+'</b><small>'+r.description+'</small></div><div class="k-rhythm-step"><button data-d="'+r.moins+'" aria-label="Réduire '+r.nom.toLowerCase()+'">−</button><output class="k-mono">'+r.valeur+(r.unite?' <small>'+r.unite+'</small>':'')+'</output><button data-d="'+r.plus+'" aria-label="Augmenter '+r.nom.toLowerCase()+'">+</button></div></div>';}).join('');
    var retraitTexte=retraitOuvert?'Retrait '+delaiRetrait+' min':'Retrait fermé',livraisonTexte=livraisonOuverte?'livraison '+delaiLivraison+' min':'livraison fermée';
    return titre('PILOTAGE DU SERVICE','Le rythme.',icone('rythme'))+'<div class="k-pane k-rhythm-page">'+
      '<section class="k-rhythm-hero" data-level="'+charge+'"><div class="k-rhythm-hero-top"><span>EN CE MOMENT</span><span class="k-rhythm-live"><i></i>'+(charge==='stop'?'En pause':'Service ouvert')+'</span></div><div class="k-rhythm-hero-middle"><div><h2>'+esc(lv.nom)+'.</h2><p>'+esc(lv.dit)+'</p></div><div class="k-rhythm-dial"><div><b class="k-mono">'+actives+'</b><small>à suivre</small></div></div></div><div class="k-rhythm-hero-bottom"><button data-rhythm-jump>Modifier les délais ↓</button><span>'+aPreparer()+' à préparer</span></div></section>'+
      '<section class="k-rhythm-section"><div class="k-rhythm-heading"><span>01 / Intensité</span><h2>Choisir le tempo</h2><p>Changez de niveau pendant le service. Affinez ensuite les délais.</p></div><div class="k-rhythm-modes" role="group" aria-label="Intensité du service">'+modes+'</div></section>'+
      '<section class="k-rhythm-section k-rhythm-settings"><div class="k-rhythm-heading"><span>02 / Annonce</span><h2>Régler les délais</h2><p>Chaque ajustement s’applique aux prochaines commandes.</p></div><div class="k-rhythm-controls">'+reglages+'</div></section>'+
      '<section class="k-rhythm-section k-rhythm-channels"><div class="k-rhythm-heading"><span>03 / Disponibilité</span><h2>Canaux ouverts</h2></div><div class="k-rhythm-channel-row"><button data-channel="retrait" aria-pressed="'+retraitOuvert+'"><span><b>Retrait</b><small>Prise des nouvelles commandes au comptoir</small></span><em>'+(retraitOuvert?'Ouvert':'Fermé')+'</em></button><button data-channel="livraison" aria-pressed="'+livraisonOuverte+'"><span><b>Livraison</b><small>Prise des nouvelles commandes à domicile</small></span><em>'+(livraisonOuverte?'Ouvert':'Fermé')+'</em></button></div></section>'+
      '<section class="k-rhythm-preview"><span>APERÇU DE L’ANNONCE · DÉMO</span><p>'+(charge==='stop'?'Prise de commande en pause. Les commandes confirmées restent à préparer.':esc(retraitTexte+' · '+livraisonTexte+'.'))+'</p></section>'+
      '<div class="k-rhythm-footer"><p>Les commandes déjà confirmées et leur heure promise restent inchangées.</p><button class="k-btn'+(charge==='stop'?' rdy':' amb')+'" data-stop>'+(charge==='stop'?'Reprendre les commandes':'Mettre les commandes en pause')+'</button></div></div>';
  }

  /* --------------------- détail d'une commande, plein écran --------------------- */
  function overlay(c){
    var liv = c.mode === "livraison";
    var lignes = c.lignes.map(function(l){
      var sous = [l.opt, l.sup ? "+ " + l.sup : ""].filter(Boolean).join(" · ");
      return '<div class="k-li"><span class="q k-mono">' + l.q + '×</span>' +
        '<span class="x"><b>' + esc(l.nom) + '</b>' +
          (sous ? '<small>' + esc(sous) + '</small>' : '') +
          consignes(l) + '</span>' +
        '<span class="p">' + eur(l.prix) + '</span></div>';
    }).join("");

    var infos =
      '<div class="k-r"><span class="k">Client</span><span class="v">' + esc(c.client || "non communiqué") + '</span></div>' +
      '<div class="k-r"><span class="k">Mode</span><span class="v">' + (liv ? "Livraison" : "Retrait au comptoir") + '</span></div>' +
      (liv ? adresseDetailHTML(c) : '') +
      '<div class="k-r"><span class="k">Paiement</span><span class="v">' + esc(c.paiement || "—") + '</span></div>' +
      '<div class="k-r"><span class="k">Reçue</span><span class="v"><em>' + esc(c.heure || "—") + '</em>' +
        (c.prete ? ' · annoncée <em>' + esc(c.prete) + '</em>' : '') + '</span></div>' +
      (c.motif ? '<div class="k-note amb">' + esc(c.motif) + '</div>' : '');

    return '<div class="k-over">' +
      '<div class="k-ohead"><button data-close>← Retour au tableau</button>' +
        '<span class="k-clock k-mono" data-hor style="margin-left:auto">' + esc(horloge) + '</span></div>' +
      '<div class="k-hero">' +
        '<span class="l"><b class="k-mono">' + c.id + '</b><span>' + esc(ETATS[c.etat].lbl) + '</span></span>' +
        '<span class="r" data-timer="' + c.id + '">' + ligneMinuteur(c) + '</span>' +
      '</div>' +
      '<div data-deadline="'+c.id+'">'+delaiPromis(c)+'</div>'+
      (c.ackVersion<c.version?'<div class="k-change-review"><b>'+(c.etat==='annulee'?'Annulation à prendre en compte':'Correctif à prendre en compte')+'</b><ul>'+c.historique.filter(function(h){return h.version>c.ackVersion;}).map(function(h){return h.details.map(function(t){return '<li>'+esc(t)+'</li>';}).join('');}).join('')+'</ul><button class="k-btn2" data-ack="'+c.id+'">J’ai pris connaissance</button></div>':'')+
      (c.probleme?'<div class="k-problem-review"><b>'+esc(c.probleme.motif)+'</b><p>'+esc(c.probleme.note)+'</p><small>'+esc(c.probleme.route)+' · demande simulée</small><button class="k-btn2" data-resolve="'+c.id+'">Marquer le problème résolu</button></div>':'')+
      infosCaisse(c) +
      (c.origine === 'restaurant' ? '<p class="k-note">Commande saisie au restaurant · aucun appel Pelyo associé.</p>' : '<button class="k-call-access" data-discussion>' + icone('wave') + '<span>Voir l’appel et le récapitulatif<small>Discussion et détail de la commande</small></span>' + icone('arrow') + '</button>') +
      lignes + infos +
      '<div class="k-tot">Total de la commande<i>' + eur(total(c)) + '</i></div>' +
      (PelyoKitchen.actif(c)?'<div class="k-order-actions"><button class="k-btn2" data-problem="'+c.id+'">Un problème</button><details><summary>Gérer la commande</summary><button data-edit-order="'+c.id+'">Modifier avec accord du client</button><button class="k-text-danger" data-cancel-order="'+c.id+'">Annuler la commande</button></details></div>':'')+historique(c)+
      '<div class="k-ofoot">' +
        (ETATS[c.etat].suite && c.ackVersion>=c.version && !c.probleme
          ? '<button class="k-btn' + (c.etat === "preparation" ? " amb" : (c.etat === "prete" ? " rdy" : "")) +
            '" data-go="' + c.id + '">' + esc(
              c.etat === "confirmee" ? "Commencer" :
              c.etat === "preparation" ? (liv ? "Prête pour livreur" : "Prête au comptoir") :
              (liv ? "Livrée" : "Récupérée")) + '</button>'
          : '<div class="k-hold" style="flex:1">' + (c.ackVersion<c.version?'Lire le correctif pour continuer':c.probleme?'Résoudre le problème pour continuer':'Aucune action : '+esc(ETATS[c.etat].lbl.toLowerCase())) + '</div>') +
        (c.etat !== 'appel' && c.etat !== 'attente' && c.etat !== 'expiree' ? '<button class="k-btn2" data-ticket="' + c.id + '">Ticket</button>' : '') +
      '</div>' +
    '</div>';
  }

  /* ------------------------------- rendu ------------------------------- */
  /* Synthetic, labelled examples only. No fabricated transcript is presented
     as an actual call recording. Production must supply real transcript data. */
  function fermerDiscussion(){
    discussionOuverte = false; peindre();
    var trigger = root.querySelector('[data-discussion]');
    if (trigger) trigger.focus({preventScroll:true});
  }

  function discussion(c){
    var valide = /^(confirmee|preparation|prete|terminee)$/.test(c.etat);
    var messages = [{role:'Assistant Pelyo', texte:'Bonjour, vous parlez à l’assistant vocal automatisé du restaurant. Que souhaitez-vous commander ?'}];
    c.lignes.forEach(function(l){
      messages.push({role:'Client',texte:l.q + ' × ' + l.nom + '. ' + [l.opt,l.sup ? 'Suppléments : ' + l.sup : '',l.dem ? 'Précision : ' + l.dem : ''].filter(Boolean).join('. ')});
    });
    if (c.etat !== 'appel') {
      messages.push({role:'Assistant Pelyo',texte:'Ce sera à emporter ou en livraison ?'});
      messages.push({role:'Client',texte:c.mode === 'livraison' ? (c.historique.some(function(h){return h.type==='coordonnées de livraison';})?'En livraison. Adresse précisée ensuite avec le restaurant.':'En livraison. ' + adresseComplete(c)) : 'À emporter.'});
      messages.push({role:'Assistant Pelyo',texte:'Le total est de ' + eur(total(c)) + (c.prete ? ', pour ' + c.prete : '') + '. Confirmez-vous cette commande ?'});
      if (valide) messages.push({role:'Client',texte:'Oui, je valide.'});
    }
    var statut = valide ? 'Commande confirmée' : c.etat === 'expiree' ? 'Expirée · non confirmée' : 'Brouillon · non confirmé';
    return '<div class="k-over k-call-layer"><section class="k-call-sheet" aria-label="Discussion de la commande ' + c.id + '">' +
      '<div class="k-call-handle" aria-hidden="true"></div><header class="k-call-header"><div><span class="k-eyebrow">APPEL · #' + c.id + '</span><h2>La discussion.</h2></div><button data-fermer-discussion aria-label="Fermer la discussion">×</button></header>' +
      '<div class="k-call-toolbar"><span>' + esc(statut) + '</span><button data-recap>Aller au récap ↓</button></div>' +
      '<div class="k-call-scroll"><p class="k-transcript-notice">Exemple fictif de discussion, créé pour la maquette. Ce n’est pas la retranscription d’un appel réel.</p>' +
      messages.map(function(m){return '<div class="k-transcript-message ' + (m.role === 'Client' ? 'k-from-client' : 'k-from-assistant') + '"><span>' + esc(m.role) + '</span><p>' + esc(m.texte) + '</p></div>';}).join('') +
      (!valide ? '<p class="k-transcript-notice">' + (c.etat === 'appel' ? 'Appel en cours dans la démo. Le panier peut encore changer.' : c.etat === 'expiree' ? 'Aucune validation reçue. Ne pas préparer cette commande.' : 'En attente de confirmation. Ne pas préparer cette commande.') + '</p>' : '') +
      '<details class="k-call-recap"><summary><span>' + (valide ? 'Récapitulatif confirmé' : 'Récapitulatif provisoire') + '<small>' + c.lignes.reduce(function(n,l){return n + l.q;},0) + ' article(s) · ' + eur(total(c)) + '</small></span><span class="k-recap-chevron" aria-hidden="true">⌄</span></summary><div class="k-recap-content">' +
      (c.lignes.length ? c.lignes.map(function(l){return '<div class="k-recap-item"><b>' + l.q + ' × ' + esc(l.nom) + '<span>' + eur(l.prix) + '</span></b>' + [l.opt,l.sup ? 'Suppléments : ' + l.sup : '',l.dem ? 'Consigne : ' + l.dem : ''].filter(Boolean).map(function(t){return '<p>' + esc(t) + '</p>';}).join('') + '</div>';}).join('') : '<p>Aucun produit pour le moment.</p>') +
      '<dl><dt>Client</dt><dd>' + esc(c.client || 'Non renseigné') + '</dd><dt>Mode</dt><dd>' + (c.mode === 'livraison' ? 'Livraison' : 'Retrait au comptoir') + '</dd>' +
      (c.mode === 'livraison' ? '<dt>Numéro et rue</dt><dd>' + esc(adresseRue(c)) + '</dd><dt>Code postal et ville</dt><dd>' + esc(adresseVille(c)||'À préciser') + '</dd>'+(c.adresseDetail&&c.adresseDetail.complement?'<dt>Complément</dt><dd>'+esc(c.adresseDetail.complement)+'</dd>':'')+(c.adresseDetail&&c.adresseDetail.acces?'<dt>Accès</dt><dd>'+esc(c.adresseDetail.acces)+'</dd>':'')+'<dt>Téléphone</dt><dd>'+esc(c.telephoneClient||'Non renseigné')+'</dd><dt>Distance</dt><dd>' + (c.distanceARevoir?'À revérifier':c.km == null ? 'Non renseignée' : esc(String(c.km).replace('.',',')) + ' km') + '</dd><dt>Frais inclus</dt><dd>' + eur(c.frais || 0) + '</dd>' : '') +
      '<dt>Horaire annoncé</dt><dd>' + esc(c.prete || 'Non renseigné') + '</dd><dt>Paiement au restaurant</dt><dd>' + esc(c.paiement || 'Non renseigné') + '</dd></dl><div class="k-recap-total">Total ' + (valide ? 'confirmé' : 'provisoire') + '<b>' + eur(total(c)) + '</b></div></div></details></div></section></div>';
  }

  function peindre(){
    /* Les interactions repeignent l’écran ; les minuteurs seuls sont mis
       à jour séparément. Conserver le défilement uniquement dans la même
       feuille, jamais entre un formulaire et une commande. */
    var inventory = root.querySelector('.k-inventory');
    var inventoryOpen = inventory && inventory.open;
    var inventoryList = root.querySelector('.k-inventory-list');
    var inventoryY = inventoryList ? inventoryList.scrollTop : 0;
    var filterBar = root.querySelector('.k-filt');
    var filterX = filterBar ? filterBar.scrollLeft : 0;
    var oldOverlay = root.querySelector('.k-over');
    var layer=ops?'ops:'+ops.type+':'+(ops.id||''):ouverte?'commande:'+ouverte.id:ticketOuvert?'ticket:'+ticketOuvert.id:triOuvert?'tri':'';
    var overlayY = oldOverlay && oldOverlay.getAttribute('data-layer')===layer ? oldOverlay.scrollTop : 0;
    var callScroll = root.querySelector('.k-call-scroll');
    var callY = callScroll ? callScroll.scrollTop : 0;
    var recap = root.querySelector('.k-call-recap');
    var recapOpen = recap && recap.open;
    var settingsOpen = Array.prototype.map.call(root.querySelectorAll('.k-settings-group[open]'),function(el){return el.getAttribute('data-settings-group');});
    var focus = document.activeElement;
    var focusSelector = null;
    if (focus && root.contains(focus)) {
      ['data-vue','data-filt','data-d','data-charge','data-channel','data-reg','data-son','data-close','data-imprimer','data-toggle-stock','data-toggle-cat','data-search'].some(function(attr){
        if (focus.hasAttribute(attr)) { focusSelector = '[' + attr + '="' + focus.getAttribute(attr) + '"]'; return true; }
        return false;
      });
    }
    var ancre = root.querySelector(".k-body, .k-pane");
    var y = ancre ? ancre.scrollTop : 0;
    var corps = vue === "service" ? vueService()
              : vue === "tickets" ? vueTickets()
              : vue === "ruptures" ? vueRuptures()
              : vue === "rythme" ? vueRythme()
              : vueParametres();
    var superposition = ops ? overlayOps() : ouverte ? overlay(ouverte)
                       : ticketOuvert ? overlayTicket(ticketOuvert)
                       : triOuvert ? overlayTri()
                       : "";
    root.setAttribute('data-page', vue);
    root.innerHTML = head() + corps + navigation() + superposition + (discussionOuverte && ouverte && !ops ? discussion(ouverte) : '');
    Array.prototype.forEach.call(root.querySelectorAll('.k-settings-group'),function(el){el.open = settingsOpen.indexOf(el.getAttribute('data-settings-group')) !== -1;});
    if(root.querySelector('.k-over'))root.querySelector('.k-over').setAttribute('data-layer',layer);
    if (root.querySelector('.k-filt')) root.querySelector('.k-filt').scrollLeft = filterX;
    if (inventoryOpen && root.querySelector('.k-inventory')) {
      root.querySelector('.k-inventory').open = true;
      root.querySelector('.k-inventory-list').scrollTop = inventoryY;
    }
    if (superposition) {
      var dialog = root.querySelector('.k-call-layer') || root.querySelector('.k-over');
      dialog.setAttribute('role','dialog'); dialog.setAttribute('aria-modal','true'); dialog.setAttribute('aria-label','Détails et réglages cuisine');
      Array.prototype.forEach.call(root.children,function(el){ if (el !== dialog) el.inert = true; });
      var first = focusSelector && dialog.querySelector(focusSelector) || dialog.querySelector('button'); if (first) first.focus({preventScroll:true});
      dialog.scrollTop = overlayY;
      if (discussionOuverte) {
        dialog.setAttribute('aria-label','Discussion de la commande ' + ouverte.id);
        root.querySelector('.k-call-recap').open = !!recapOpen;
        root.querySelector('.k-call-scroll').scrollTop = callY;
      }
    } else if (focusSelector) {
      var nextFocus = root.querySelector(focusSelector); if (nextFocus) nextFocus.focus({preventScroll:true});
    }
    api.badge(aPreparer() ? String(aPreparer()) : 0);
    var ancre2 = root.querySelector(".k-body, .k-pane");
    if (ancre2) ancre2.scrollTop = y;
    if (vue === "ruptures" && !ouverte){
      var msgs = root.querySelector(".k-msgs");
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }
    retenir();
  }

  /* ------------------------------ actions ------------------------------ */
  function avancer(id){
    var c = null, i;
    for (i = 0; i < cmds.length; i++) if (cmds[i].id === id) c = cmds[i];
    if (!c) return;
    if(c.ackVersion<c.version||c.probleme){api.toast('Lisez le changement ou résolvez le problème avant de poursuivre.');return;}
    var suite = ETATS[c.etat].suite;
    if (!suite){ api.toast("Rien à faire avancer sur la commande " + id + "."); return; }
    var de = c.etat;
    derniereAction = {id:c.id, etat:c.etat, depuis:c.depuis,commenceAt:c.commenceAt};
    c.etat = suite;
    if (suite === "preparation"){ c.depuis = 0;c.commenceAt=Date.now(); }
    api.vibrer(12);
    api.toast("Commande " + id + " — " + ETATS[suite].lbl.toLowerCase() + ".");
    if (ouverte && ouverte.id === id) ouverte = c;
    peindre();
    /* Connecté : l'écran bouge tout de suite, la base confirme ensuite. Si
       un autre appareil a déjà bougé la commande, on revient en arrière. */
    if (reel) PelyoDonnees.changerEtat(c.uuid, de, suite, function(e){
      if (!e) return;
      c.etat = de; derniereAction = null;
      api.toast(e); peindre();
    });
  }

  /* Un tiers des arrivées simulées vient du comptoir (client sur place, saisi
     en caisse) plutôt que de l'IA au téléphone — les deux origines suivent le
     même circuit cuisine (à préparer → en cours → prête → terminée) : la
     cuisine prépare un plat de la même façon quel que soit le canal qui a
     pris la commande. Seule la caisse comptoir n'a pas de discussion d'appel. */
  function arrive(){
    if (reel){
      PelyoDonnees.commandeDemo(function(e){
        api.toast(e || "Commande de test envoyée : elle arrive sur tous les écrans du restaurant.");
      });
      return;
    }
    if(charge==='stop'||(!retraitOuvert&&!livraisonOuverte)){api.toast('Démo : la prise de nouvelles commandes est en pause.');return;}
    nouvelles++;
    var id = 251 + nouvelles;
    var restaurant = nouvelles % 3 === 0 && retraitOuvert;
    var c;
    if (restaurant){
      c = {
        id:id, etat:"confirmee", mode:"retrait",
        heure:api.heure(), client: nouvelles % 2 ? "Karim" : "Léa",
        lignes:[{ q:1, nom:"Kebab XL", opt:"Galette · sauce blanche", dem:"", sup:"Frites dedans", prix:1050 }],
        total:1050, frais:0, paiement:"Sur place", depuis:0
      };
      c.origine = 'restaurant'; c.referenceCaisse = 'DEMO-CAISSE-' + id; c.referenceCommande = 'DEMO-CAISSE-' + id;
    } else {
      c = {
        id:id, etat:"confirmee", mode: retraitOuvert&&livraisonOuverte?(nouvelles % 2 ? "retrait" : "livraison"):(retraitOuvert?"retrait":"livraison"),
        heure:api.heure(), client: nouvelles % 2 ? "Inès" : "Théo",
        lignes:[{ q:2, nom:"Tacos M", opt:"Poulet · sauce blanche", dem:"", sup:"Cheddar", prix:2100 }],
        total:2100, frais:0, paiement:"Sur place", depuis:0
      };
      if (c.mode === "livraison"){ c.frais = 250; c.total = 2350; c.km = 1.8; c.adresse = "3 rue Chevreul, 2e étage"; c.adresseDetail={numero:"3",rue:"rue Chevreul",codePostal:"69007",ville:"Lyon",complement:"2e étage",acces:""}; c.paiement = "Carte au livreur"; }
      c.origine = 'ia_pelyo'; c.referenceCommande = 'DEMO-PELYO-' + id;
    }
    c.date = new Date().toLocaleDateString('fr-FR');
    c.syncCaisse = restaurant ? 'simulee' : 'en_attente';
    c.encaissement = 'non_transmis';
    PelyoKitchen.initialise(c,Date.now(),D_.cuisineOperations.heureReference);
    c.promesseAt=Date.now()+(c.mode==='livraison'?delaiLivraison:delaiRetrait)*60000;c.prete=PelyoKitchen.hhmm(c.promesseAt);
    cmds.unshift(c);
    /* Une commande comptoir vient déjà de la caisse : on ne la lui renvoie pas,
       et c'est la caisse qui imprime (voir docs/INTEGRATION-CAISSE.md). */
    if (restaurant) imprimes[c.id] = true;
    else {
      PelyoKitchen.ajouterJob(jobs,c,'caisse',false,Date.now());
      if(impressionAuto)demandesImpression(c,'initial',false);
    }
    traiterJobs();
    bip();
    api.vibrer(20);
    api.toast(restaurant
      ? "Démo : commande comptoir " + id + " importée de la caisse. Impression laissée à la caisse."
      : "Démo : commande IA " + id + " confirmée. Consultez Connexions pour le suivi simulé.");
    peindre();
  }

  /* Nouvelle liste venue de la base : la commande ouverte reste ouverte, et
     chaque commande confirmée encore inconnue fait sonner la cuisine. */
  function recevoir(liste){
    var arrivees = connues ? liste.filter(function(c){ return c.etat === 'confirmee' && !connues[c.uuid]; }) : [];
    connues = {};
    liste.forEach(function(c){ connues[c.uuid] = true; });
    cmds = liste;
    if (ouverte) ouverte = cmds.filter(function(c){ return c.uuid === ouverte.uuid; })[0] || null;
    if (ticketOuvert) ticketOuvert = cmds.filter(function(c){ return c.uuid === ticketOuvert.uuid; })[0] || null;
    if (arrivees.length){
      bip(); api.vibrer(20);
      api.toast(arrivees.length === 1 ? 'Nouvelle commande #' + arrivees[0].id + ' à préparer.' : arrivees.length + ' nouvelles commandes à préparer.');
    }
    if (!ops && (vue === 'service' || vue === 'tickets' || ouverte)) peindre();
    else api.badge(aPreparer() ? String(aPreparer()) : 0);
  }

  /* ------------------------------- montage ------------------------------- */
  function monter(scene, a){
    api = a; D_ = a.data;
    montageId++;
    vue = 'service'; filtre = 'faire'; ouverte = null; ticketOuvert = null; discussionOuverte = false;
    triOuvert = false; menuOuvert = false;
    derniereAction = null; nouvelles = 0; recherche = ''; ruptEcoute = false;
    impressionAuto=true;impressionAnnulations=false;delaiLivraison=35;capacite=12;son=true;triHistorique='recent';retraitOuvert=true;livraisonOuverte=true;
    ops=null;triUrgence=false;jobs=[];stockFin={};supOff={};ingredientOff={};rupt={};catOff={};imprimes={};liensDemo={imprimante:true,caisse:true};stockageOK=true;
    D_.menu.forEach(function(cat){cat.items.forEach(function(it){rupt[it.id]=!it.dispo;it.sup.forEach(function(s){if(!s.dispo)supOff[api.norm(s.nom)]=true;});});});
    charge = D_.resto.charge;
    delaiRetrait = niveau().delai || 15;
    horloge = api.heure();
    reel = !!(window.PelyoDonnees && PelyoDonnees.reel());
    connues = null;

    /* copie de travail : les autres applications lisent les mêmes données */
    cmds = D_.commandes.map(function(c){
      var n = {};
      for (var k in c) if (Object.prototype.hasOwnProperty.call(c, k)) n[k] = c[k];
      n.lignes = PelyoKitchen.clone(c.lignes);
      n.reste = c.expire || 0;
      n.depuis = c.depuis || (c.etat === "preparation" ? 540 : 0);
      n.origine = c.origine || 'ia_pelyo';
      n.date = c.date || new Date().toLocaleDateString('fr-FR');
      n.referenceCommande = c.referenceCommande || (c.origine === 'restaurant' ? 'DEMO-CAISSE-' + c.id : 'DEMO-PELYO-' + c.id);
      n.encaissement = 'non_transmis';
      n.syncCaisse = c.origine === 'restaurant' ? 'simulee' : 'non_connectee';
      n.commenceAt=Date.now()-n.depuis*1000;n.expireAt=Date.now()+n.reste*1000;
      PelyoKitchen.initialise(n,Date.now(),D_.cuisineOperations.heureReference);
      if(/^\d{2}:\d{2}$/.test(c.heure||'')){
        var hm=c.heure.split(':'),ref=D_.cuisineOperations.heureReference.split(':');
        var ecart=(+hm[0]*60+(+hm[1]))-(+ref[0]*60+(+ref[1]));
        if(ecart < -720)ecart+=1440;if(ecart>720)ecart-=1440;
        var recue=new Date(Date.now()+ecart*60000);
        n.heure=PelyoKitchen.hhmm(recue.getTime());n.date=recue.toLocaleDateString('fr-FR');
        if(n.etat==='preparation'&&n.commenceAt<recue.getTime()){n.commenceAt=recue.getTime();n.depuis=Math.max(0,Math.floor((Date.now()-n.commenceAt)/1000));}
      }
      imprimes[n.id]=!!c.imprime;
      return n;
    });
    restaurer();
    if (reel){ cmds = []; imprimes = {}; charge = 'normal'; delaiRetrait = 15; }
    cmds.forEach(function(c){if(c.mode==='livraison'&&!c.adresseDetail){var exemple=D_.commandes.filter(function(d){return d.id===c.id&&d.adresse===c.adresse&&d.adresseDetail;})[0];if(exemple)c.adresseDetail=PelyoKitchen.clone(exemple.adresseDetail);}});
    expirerStocks();

    root = document.createElement("div");
    root.className = "k-app";
    scene.appendChild(root);

    /* Tiroir de navigation : monté une fois, en dehors de root, pour que sa
       transition de glissement soit une vraie transition CSS et non un
       DOM recréé déjà ouvert. */
    scrim = document.createElement("div");
    scrim.className = "k-scrim";
    scene.appendChild(scrim);
    scrim.addEventListener("click", fermerTiroir);

    tiroir = document.createElement("nav");
    tiroir.className = "k-tiroir";
    tiroir.innerHTML =
      '<div class="k-tiroir-head">' + esc(nomResto()) +
        '<button data-fermer-tiroir aria-label="Fermer">✕</button></div>' +
      '<div class="k-tiroir-liste" data-tiroir-liste></div>';
    scene.appendChild(tiroir);
    rafraichirTiroir();
    tiroir.addEventListener("click", function(ev){
      var b = ev.target.closest && ev.target.closest("[data-vue],[data-fermer-tiroir]");
      if (!b) return;
      if (b.dataset.vue){
        vue = b.dataset.vue; ouverte = null; ticketOuvert = null; triOuvert = false;ops=null;
        rafraichirTiroir(); fermerTiroir(); peindre();
        return;
      }
      fermerTiroir();
    });
    tiroir.addEventListener('keydown',function(ev){
      if (ev.key === 'Escape') { ev.stopPropagation(); fermerTiroir(); }
      if (ev.key === 'Tab') {
        var items = tiroir.querySelectorAll('button');
        if (ev.shiftKey && document.activeElement === items[0]) {ev.preventDefault();items[items.length-1].focus();}
        else if (!ev.shiftKey && document.activeElement === items[items.length-1]) {ev.preventDefault();items[0].focus();}
      }
    });

    peindre();

    /* Connecté : réglages du service et commandes lus dans la base, puis
       tenus à jour en temps réel. */
    if (reel){
      PelyoDonnees.chargerReglages(function(e, r){
        if (e || !r) return;
        charge = r.charge; delaiRetrait = r.delai_retrait_min; delaiLivraison = r.delai_livraison_min;
        capacite = r.capacite; retraitOuvert = r.retrait_ouvert; livraisonOuverte = r.livraison_ouverte;
        if (!ops) peindre();
      });
      arretEcoute = PelyoDonnees.ecouterCommandes(recevoir);
    }

    /* une seconde qui passe : minuteurs, expiration, horloge */
    api.every(function(){
      var bouge = false, expiration = false, i, c;
      for (i = 0; i < cmds.length; i++){
        c = cmds[i];
        if (c.etat === "attente"){
          c.reste = Math.max(0, Math.ceil((c.expireAt-Date.now())/1000));
          if (c.reste === 0){ c.etat = "expiree"; c.motif = "Aucune validation du client"; expiration = true; }
          bouge = true;
        } else if (c.etat === "preparation" || c.etat === "appel"){
          c.depuis = Math.max(0,Math.floor((Date.now()-c.commenceAt)/1000)); bouge = true;
        }
      }
      var h = api.heure();
      if (h !== horloge){ horloge = h; bouge = true; }
      var stockChange=expirerStocks();
      if(expiration||stockChange)retenir();
      if ((expiration||stockChange) && !ops && (vue === 'service' || vue==='ruptures' || ouverte)) { peindre(); return; }
      api.badge(aPreparer() ? String(aPreparer()) : 0);
      /* On ne repeint en continu que ce qui affiche un minuteur : le tableau
         de service et le détail ouvert. Les autres écrans — impression,
         ruptures, rythme — ne bougent pas tout seuls, sinon la discussion de
         rupture en cours de frappe serait effacée à chaque seconde. */
      /* Update only clocks: preserve scroll, focus, text selection and gestures. */
      var expireVisible = root.querySelector('[data-timer]');
      if (expireVisible) {
        Array.prototype.forEach.call(root.querySelectorAll('[data-timer]'),function(el){
          var cmd = cmds.filter(function(x){ return x.id === +el.getAttribute('data-timer'); })[0];
          if (cmd) el.innerHTML = ligneMinuteur(cmd);
        });
      }
      Array.prototype.forEach.call(root.querySelectorAll('[data-hor]'),function(el){ el.textContent = horloge; });
      Array.prototype.forEach.call(root.querySelectorAll('[data-deadline]'),function(el){var c=commande(el.getAttribute('data-deadline'));if(c)el.innerHTML=delaiPromis(c);});
    }, 1000);

    function reseau(){traiterJobs();retenir();if(!ops||ops.type==='connections')peindre();}
    window.addEventListener('online',reseau);window.addEventListener('offline',reseau);

    root.addEventListener("click", function(ev){
      var t = ev.target;
      if (!t.closest) return;
      var settingsTab = t.closest('.k-settings-group summary');
      if (settingsTab) {
        var selectedGroup = settingsTab.parentNode;
        if (!selectedGroup.open) Array.prototype.forEach.call(root.querySelectorAll('.k-settings-group[open]'),function(group){if(group !== selectedGroup) group.open = false;});
        return;
      }
      if (reel && t.closest(BLOQUES_REEL)){ ev.preventDefault(); pasEncoreRelie(); return; }
      var SEL = "[data-import-caisse],[data-discussion],[data-fermer-discussion],[data-recap],[data-vue],[data-undo],[data-demo-arrive],[data-toggle-stock],[data-toggle-cat],[data-go],[data-open],[data-close],[data-filt],[data-son]," +
                "[data-reg],[data-unrupt],[data-charge],[data-channel],[data-rhythm-jump],[data-stop],[data-ticket],[data-d]," +
                "[data-mic],[data-send],[data-menu],[data-voirticket],[data-fermer-ticket]," +
                "[data-telecharger],[data-imprimer],[data-info],[data-exit-demo],[data-tri]," +
                "[data-tri-ouvrir],[data-fermer-tri],[data-ops],[data-ops-close],[data-edit-order],[data-edit-address],[data-cancel-order],[data-problem],[data-ack],[data-resolve],[data-urgence],[data-remove-line],[data-add-line],[data-ops-stock],[data-link-toggle],[data-job-retry],[data-retry-all],[data-reset-demo],[data-reset-confirm]";
      var b = t.closest(SEL);
      if (!b) return;
      var d = b.dataset;
      if(d.ops){ouvrirOps(d.ops);return;}
      if(d.info){ouvrirOps('info',d.info);return;}
      if(d.exitDemo!==undefined){api.fermer();return;}
      if(d.opsClose!==undefined){ops=null;peindre();return;}
      if(d.editOrder){ouvrirOps('edit',+d.editOrder);return;}
      if(d.editAddress){ouvrirOps('address',+d.editAddress);return;}
      if(d.cancelOrder){ouvrirOps('cancel',+d.cancelOrder);return;}
      if(d.problem){ouvrirOps('problem',+d.problem);return;}
      if(d.ack){var ac=commande(d.ack);ac.ackVersion=ac.version;peindre();return;}
      if(d.resolve){PelyoKitchen.resoudre(commande(d.resolve),Date.now());peindre();return;}
      if(d.urgence!==undefined){triUrgence=!triUrgence;peindre();return;}
      if(d.removeLine!==undefined){ops.lignes.splice(+d.removeLine,1);peindre();return;}
      if(d.addLine!==undefined){var it=trouverProduit(root.querySelector('#k-add-product').value);ops.lignes.push({q:1,nom:it.nom,prix:it.prix,opt:'',sup:'',dem:'',allergie:''});peindre();return;}
      if(d.opsStock){var key=d.opsStock,id=key.slice(2),type=key.charAt(0),duration=root.querySelector('#k-stock-duration').value,openGroups=Array.prototype.map.call(root.querySelectorAll('.k-stock-group'),function(g){return g.open;});setStock(type,id,!mapStock(type)[id],duration);peindre();root.querySelector('#k-stock-duration').value=duration;Array.prototype.forEach.call(root.querySelectorAll('.k-stock-group'),function(g,i){g.open=openGroups[i];});return;}
      if(d.linkToggle){liensDemo[d.linkToggle]=!liensDemo[d.linkToggle];peindre();return;}
      if(d.jobRetry||d.retryAll!==undefined){traiterJobs(d.jobRetry);api.toast(navigator.onLine===false?'Hors ligne : opérations conservées.':'Reprise simulée : seules les connexions disponibles ont été traitées.');peindre();return;}
      if(d.resetDemo!==undefined){ops.reset=true;peindre();return;}
      if(d.resetConfirm!==undefined){try{localStorage.removeItem(STOCKAGE+D_.resto.nom);}catch(e){ops.error='Le navigateur refuse la réinitialisation de sa sauvegarde locale.';peindre();return;}api.ouvrir('cuisine');return;}
      if (d.importCaisse !== undefined) { importerCaisseDemo(); return; }
      if (d.discussion !== undefined) { discussionOuverte = true; peindre(); return; }
      if (d.fermerDiscussion !== undefined) { fermerDiscussion(); return; }
      if (d.recap !== undefined) {
        var rec = root.querySelector('.k-call-recap'); rec.open = true;
        rec.scrollIntoView({behavior:api.reduit() ? 'auto' : 'smooth',block:'start'});
        rec.querySelector('summary').focus({preventScroll:true}); return;
      }

      if (d.vue){ vue = d.vue; ouverte = null; ticketOuvert = null; triOuvert = false;ops=null; peindre(); return; }
      if (d.demoArrive !== undefined){ arrive(); return; }
      if (d.undo !== undefined && derniereAction){
        if (reel){
          var cu = commande(derniereAction.id), retour = derniereAction.etat;
          if (cu) PelyoDonnees.changerEtat(cu.uuid, cu.etat, retour, function(e){ if (e) api.toast(e); });
        }
        cmds.forEach(function(c){ if (c.id === derniereAction.id){ c.etat = derniereAction.etat; c.depuis = derniereAction.depuis;c.commenceAt=derniereAction.commenceAt; }});
        derniereAction = null; api.toast('Dernière action annulée.'); peindre(); return;
      }
      if (d.toggleStock){
        var parentCat = D_.menu.filter(function(cat){ return cat.items.some(function(it){ return String(it.id) === d.toggleStock; }); })[0];
        if (parentCat && catOff[parentCat.cat]) { api.toast('Rétablissez d’abord la catégorie ' + parentCat.cat + '.'); return; }
        if(bloqueParIngredient(d.toggleStock)){api.toast('Un ingrédient est en rupture : rétablissez-le dans les ruptures détaillées.');return;}
        setStock('p',d.toggleStock,!rupt[d.toggleStock]); peindre(); return;
      }
      if (d.toggleCat){ setStock('c',d.toggleCat,!catOff[d.toggleCat]); peindre(); return; }

      if (d.go !== undefined){ ev.stopPropagation(); avancer(+d.go); return; }
      if (d.open !== undefined && !ouverte){
        var id = +d.open;
        for (var i = 0; i < cmds.length; i++) if (cmds[i].id === id) ouverte = cmds[i];
        peindre(); return;
      }
      if (d.close !== undefined){ ouverte = null; peindre(); return; }
      if (d.filt){ filtre = d.filt; peindre(); return; }
      if (d.menu !== undefined){ ouvrirTiroir(); return; }
      if (d.son !== undefined){
        son = !son;
        api.toast(son ? "Alerte sonore active." : "Alerte sonore coupée — les commandes arrivent en silence.");
        peindre(); return;
      }
      if (d.voirticket){
        var idv = +d.voirticket, cv = null;
        for (var iv = 0; iv < cmds.length; iv++) if (cmds[iv].id === idv) cv = cmds[iv];
        if (cv){ ticketOuvert = cv; peindre(); }
        return;
      }
      if (d.fermerTicket !== undefined){ ticketOuvert = null; peindre(); return; }
      if (d.telecharger){
        var idt = +d.telecharger, ct = null;
        for (var it2 = 0; it2 < cmds.length; it2++) if (cmds[it2].id === idt) ct = cmds[it2];
        if (ct) telechargerTicket(ct);
        return;
      }
      if (d.imprimer){
        var idp = +d.imprimer;
        var printOrder = cmds.filter(function(c){ return c.id === idp; })[0];
        if (!printOrder || /^(appel|attente|expiree)$/.test(printOrder.etat)) { api.toast('La commande doit être confirmée avant impression.'); return; }
        demandesImpression(printOrder,printOrder.etat==='annulee'?'annulation':printOrder.version>1?'correctif':'initial',!!imprimes[idp]);
        api.toast("Démo : ticket #" + idp + (navigator.onLine!==false&&liensDemo.imprimante?' traité dans la simulation.':' conservé dans la file d’attente.')+' Aucune imprimante réelle connectée.');
        peindre(); return;
      }
      if (d.triOuvrir !== undefined){ triOuvert = true; peindre(); return; }
      if (d.fermerTri !== undefined){ triOuvert = false; peindre(); return; }
      if (d.tri){ triHistorique = d.tri; triOuvert = false; peindre(); return; }
      if (d.reg){
        if (d.reg === "son"){ son = !son; api.toast(son ? "Alerte sonore active." : "Alerte sonore coupée."); }
        else if (d.reg === "test") api.toast("Démo : test simulé, aucune imprimante connectée.");
        else if (d.reg === "imp") api.toast("Epson TM-m30 : exemple de configuration, connexion réelle à intégrer.");
        else if (d.reg === "auto") impressionAuto = !impressionAuto;
        else if (d.reg === "ann") impressionAnnulations = !impressionAnnulations;
        peindre(); return;
      }
      if (d.unrupt){ retablirUn(d.unrupt); return; }
      if (d.mic !== undefined){ ecouter(); return; }
      if (d.send !== undefined){ envoyerChat(); return; }
      if (d.charge){
        charge = d.charge;
        if (niveau().delai) delaiRetrait = niveau().delai;
        api.toast("Rythme : " + niveau().nom + " — " + niveau().dit);
        peindre(); return;
      }
      if(d.rhythmJump!==undefined){root.querySelector('.k-rhythm-settings').scrollIntoView({behavior:api.reduit()?'auto':'smooth',block:'start'});return;}
      if(d.channel){
        if(d.channel==='retrait'&&retraitOuvert&&!livraisonOuverte || d.channel==='livraison'&&livraisonOuverte&&!retraitOuvert){api.toast('Gardez au moins un canal ouvert, ou mettez le service en pause.');return;}
        if(d.channel==='retrait')retraitOuvert=!retraitOuvert;
        if(d.channel==='livraison')livraisonOuverte=!livraisonOuverte;
        peindre();return;
      }
      if (d.stop !== undefined){
        charge = charge === "stop" ? "rush" : "stop";
        api.toast(charge === "stop"
          ? "Démo : commandes en pause. Les commandes confirmées restent à préparer."
          : "Commandes rouvertes — retrait annoncé " + delaiRetrait + " min.");
        peindre(); return;
      }
      if (d.ticket){
        var idtk = +d.ticket, ctk = null;
        for (var itk = 0; itk < cmds.length; itk++) if (cmds[itk].id === idtk) ctk = cmds[itk];
        ouverte = null; vue = "tickets"; ticketOuvert = ctk;
        rafraichirTiroir(); peindre(); return;
      }
      if (d.d){
        if (d.d === "retrait-") delaiRetrait = Math.max(5, delaiRetrait - 5);
        if (d.d === "retrait+") delaiRetrait = Math.min(90, delaiRetrait + 5);
        if (d.d === "liv-") delaiLivraison = Math.max(10, delaiLivraison - 5);
        if (d.d === "liv+") delaiLivraison = Math.min(120, delaiLivraison + 5);
        if (d.d === "cap-") capacite = Math.max(1, capacite - 1);
        if (d.d === "cap+") capacite = Math.min(40, capacite + 1);
        peindre(); return;
      }
    });

    /* Entrée envoie le message de rupture sans passer par le bouton. */
    root.addEventListener("keydown", function(ev){
      if (ev.key === 'Escape') {
        if(ops){ev.stopPropagation();ops=null;peindre();return;}
        if (discussionOuverte) { ev.stopPropagation(); fermerDiscussion(); return; }
        ev.stopPropagation(); ouverte = null; ticketOuvert = null; triOuvert = false; fermerTiroir(); peindre(); return;
      }
      if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.getAttribute('role') === 'button') { ev.preventDefault(); ev.target.click(); return; }
      if (ev.key === 'Tab' && root.querySelector('.k-over')) {
        var btns = Array.prototype.filter.call((root.querySelector('.k-call-layer') || root.querySelector('.k-over')).querySelectorAll('button,input,summary,select,textarea'),function(el){
          if(el.disabled||!el.getClientRects().length)return false;
          for(var parent=el.parentElement;parent&&parent!==root;parent=parent.parentElement){
            if(parent.tagName==='DETAILS'&&!parent.open&&!(el.tagName==='SUMMARY'&&el.parentElement===parent))return false;
          }
          return true;
        });
        if (btns.length && ev.shiftKey && document.activeElement === btns[0]) { ev.preventDefault(); btns[btns.length-1].focus(); }
        else if (btns.length && !ev.shiftKey && document.activeElement === btns[btns.length-1]) { ev.preventDefault(); btns[0].focus(); }
      }
      if ((ev.key === "Enter" || ev.keyCode === 13) && ev.target && ev.target.matches && ev.target.matches("[data-chatinp]")){
        ev.preventDefault();
        envoyerChat();
      }
    });
    root.addEventListener('input',function(ev){ if (ev.target.hasAttribute('data-chatinp')) brouillon = ev.target.value;
      if(ops&&ops.type==='edit'&&ev.target.hasAttribute('data-edit')){var field=ev.target.dataset.edit,value=ev.target.value;ops.lignes[+ev.target.dataset.index][field]=field==='q'?Number(value):field==='prix'?Math.round(Number(value)*100):value;}
    });
    root.addEventListener('submit',function(ev){
      if (ev.target.hasAttribute('data-search-form')) { ev.preventDefault(); recherche = root.querySelector('[data-search]').value.trim(); peindre(); }
      if(ev.target.hasAttribute('data-ops-form')){
        ev.preventDefault();var c=commande(ops.id),type=ev.target.getAttribute('data-ops-form');
        try{
          if(type==='edit'){PelyoKitchen.modifier(c,ops.lignes,root.querySelector('#k-confirm-client').checked,Date.now());changementsEnregistres(c,'correctif');}
          else if(type==='address'){var a={};Array.prototype.forEach.call(root.querySelectorAll('[data-address-field]'),function(input){a[input.dataset.addressField]=input.value;});PelyoKitchen.corrigerLivraison(c,a,root.querySelector('#k-client-phone').value,root.querySelector('#k-address-confirm').checked,Date.now());changementsEnregistres(c,'livraison');}
          else if(type==='cancel'){PelyoKitchen.annuler(c,root.querySelector('#k-cancel-reason').value,Date.now());changementsEnregistres(c,'annulation');}
          else {PelyoKitchen.signaler(c,root.querySelector('#k-issue-reason').value,root.querySelector('#k-issue-note').value,root.querySelector('#k-issue-route').value,Date.now());ops=null;api.toast('Problème enregistré localement. Notification simulée uniquement.');peindre();}
        }catch(e){ops.error=e.message;peindre();}
      }
    });

    return function(){
      montageId++;
      if (arretEcoute){ arretEcoute(); arretEcoute = null; }
      window.removeEventListener('online',reseau);window.removeEventListener('offline',reseau);
      try { if (audio && audio.close) audio.close(); } catch(e){}
      audio = null;
    };
  }

  RIA.register({
    id:"cuisine", nom:"Cuisine", badge:"2",
    fond:"linear-gradient(145deg,#F5B544,#C8811A)", encre:"#1A1206",
    glyph:'<path d="M4 7h16M4 12h16M4 17h10"/><path d="M19.5 15.5v4"/>',
    format:"phone",
    css:"cuisine.css",
    monter:monter
  });
})();
