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
  var etatsVus = null, finEntree = null; /* animations : commandes déjà affichées, entrée d'écran */
  var volet = {h: 0, replie: 0, dernierY: 0, onglet: null}; /* Service : mesures du volet, dernier défilement, onglet affiché */
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
  /* Minuteurs par étape (en minutes), réglables dans Réglages › Service :
     lancer la commande, la préparer, la faire partir (livreur ou comptoir). */
  var MINUTEURS = [['lancer','Lancer la commande','Après sa réception'],['preparer','Préparer','Après « Commencer »'],['partir','Départ ou remise','Une fois prête']];
  var minuteurs = {lancer:5, preparer:15, partir:15};
  /* Retards : si une commande va dépasser l'heure promise d'au moins
     « seuil » minutes, Pelyo prévient le client tout seul (SMS ou appel de
     l'IA), avec un geste, avant qu'il ne s'impatiente. */
  var retards = {actif:true, seuil:10, geste:'boisson', canal:'sms'}, dernierControleRetard = 0;
  /* Suivi client : un lien envoyé avec la confirmation ; SMS d'étape au
     choix. papier = cuisine sans écran : seul le livreur scanne le ticket. */
  var suivi = {papier:false, smsPrete:false, smsRoute:true};
  function codeSuivi(c){ return (c.id * 7919 + 4099).toString(36).toUpperCase(); }
  try { var mx = JSON.parse(localStorage.getItem('pelyo:cuisine:minuteurs') || 'null'); if (mx) MINUTEURS.forEach(function(m){ if (mx[m[0]] > 0) minuteurs[m[0]] = mx[m[0]]; }); } catch(e){}
  function retenirMinuteurs(){ try { localStorage.setItem('pelyo:cuisine:minuteurs', JSON.stringify(minuteurs)); } catch(e){} }
  var nouvelles = 0;
  var ops = null, triUrgence = false, jobs = [], stockFin = {}, supOff = {}, ingredientOff = {};
  var pesee = null, peseeT = null, arretPoidsK = null;   /* balance de portions (pelyo-balance.js) */
  var liensDemo = {imprimante:true,caisse:true}, stockageOK = true;
  var theme = 'light';
  var STOCKAGE = 'pelyo:cuisine:demo:v2:';
  /* Mode connecté (voir pelyo-donnees.js) : les commandes viennent de la
     base et chaque geste y est enregistré. Rien n'est alors sauvegardé dans
     le téléphone, et les actions pas encore reliées le disent. */
  var reel = false, arrets = [], connues = null;
  /* Ce qui reste propre à la démo : l'imprimante et la caisse simulées
     (reliées aux étapes 4 et 5), et la remise à zéro des données fictives. */
  var BLOQUES_REEL = "[data-import-caisse],[data-reset-demo],[data-reset-confirm],[data-link-toggle]," +
    "[data-job-retry],[data-retry-all],[data-reg=\"test\"],[data-reg=\"imp\"]";
  /* Connecté : la carte, les ruptures et l'adresse viennent de la base. */
  var menuReel = null, ingredientsReel = null, supIds = {}, infosReel = null;
  function carte(){ return reel ? (menuReel || []) : D_.menu; }
  function ingredientsCarte(){ return reel ? (ingredientsReel || []) : D_.cuisineOperations.ingredients; }
  function infosResto(){
    if (!reel) return D_.resto;
    var a = infosReel || {};
    return { nom:nomResto(), adresse:[a.adr_numero, a.adr_rue, a.adr_code_postal, a.adr_ville].filter(Boolean).join(' ') || 'Adresse à renseigner',
             tel:a.telephone_public || '' };
  }
  function nomResto(){ return reel ? PelyoDonnees.restaurant().nom : D_.resto.nom; }
  function pasEncoreRelie(){ api.toast("Réservé à la démo : l’imprimante et la caisse seront reliées dans une prochaine étape."); }
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
    /* Une commande expirée n'a jamais été validée par le client ni préparée :
       elle reste dans les Tickets, pas dans « Terminées ». */
    { id:"fin",    lbl:"Terminées",  test:function(c){ return c.etat === "terminee" || c.etat === "annulee"; } }
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
    try {localStorage.setItem(STOCKAGE+D_.resto.nom,JSON.stringify({schema:2,savedAt:Date.now(),son:son,cmds:cmds,jobs:jobs,rupt:rupt,catOff:catOff,supOff:supOff,ingredientOff:ingredientOff,stockFin:stockFin,imprimes:imprimes,nouvelles:nouvelles,charge:charge,retraitOuvert:retraitOuvert,livraisonOuverte:livraisonOuverte,delaiRetrait:delaiRetrait,delaiLivraison:delaiLivraison,retards:retards,suivi:suivi,capacite:capacite,impressionAuto:impressionAuto,impressionAnnulations:impressionAnnulations,liensDemo:liensDemo,theme:theme}));stockageOK=true;}catch(e){stockageOK=false;}
  }
  function restaurer(){
    if (reel) return;
    try{
      var x=JSON.parse(localStorage.getItem(STOCKAGE+D_.resto.nom)||'null');
      if(!x||x.schema!==2||!Array.isArray(x.cmds)||!x.cmds.every(function(c){return c&&ETATS[c.etat]&&typeof c.id==='number'&&Array.isArray(c.lignes)&&typeof c.version==='number';}))return;
      /* Commandes d'exemple de plus de 3 h : on repart des commandes du jour (sinon « 5000 min de retard »), en gardant les réglages. */
      if(x.savedAt&&Date.now()-x.savedAt<3*3600000){cmds=x.cmds;jobs=x.jobs||[];imprimes=x.imprimes||{};nouvelles=x.nouvelles||0;}
      son=x.son!==false;rupt=x.rupt||{};catOff=x.catOff||{};supOff=x.supOff||{};ingredientOff=x.ingredientOff||{};stockFin=x.stockFin||{};charge=x.charge||charge;retraitOuvert=x.retraitOuvert!==false;livraisonOuverte=x.livraisonOuverte!==false;delaiRetrait=x.delaiRetrait||delaiRetrait;delaiLivraison=x.delaiLivraison||delaiLivraison;retards=x.retards||retards;suivi=x.suivi||suivi;capacite=x.capacite||capacite;impressionAuto=x.impressionAuto!==false;impressionAnnulations=!!x.impressionAnnulations;liensDemo=x.liensDemo||liensDemo;theme=x.theme==='dark'?'dark':'light';
    }catch(e){stockageOK=false;}
  }
  /* L'apparence est un réglage de l'appareil : gardée à part, y compris en
     mode connecté où rien d'autre n'est stocké dans le téléphone. */
  /* Labo Cuisine (demo-cuisine.html) : thème à part, sombre par défaut. */
  var THEME = window.PELYO_DEMO ? 'pelyo:labo-cuisine:theme' : 'pelyo:cuisine:theme', THEME_DEFAUT = window.PELYO_DEMO ? 'dark' : 'light';
  function themeAppareil(){ try { var t = localStorage.getItem(THEME); return t === 'dark' || t === 'light' ? t : THEME_DEFAUT; } catch(e){ return THEME_DEFAUT; } }
  function retenirTheme(){ try { localStorage.setItem(THEME, theme); } catch(e){} }
  /* « Mon compte » : en mode connecté, ce que la base dit de ce poste
     (tablette reliée par code, ou gérant qui ouvre la cuisine). */
  function posteConnecte(){
    var ctx = reel ? PelyoDonnees.contexte() : null, app = ctx && ctx.appareil;
    if (!reel) return {qui:'Équipe cuisine', initiales:'EC', role:'Cuisine', appareil:'Cette tablette', note:'Compte de démonstration · aucune donnée réelle.'};
    if (app) return {qui:'Équipe cuisine', initiales:'EC', role:'Cuisine', appareil:app.nom || 'Cette tablette', note:'Accès cuisine autorisé pour cet appareil.'};
    var prenom = (ctx && ctx.prenom) || 'Gérant';
    return {qui:prenom, initiales:prenom.charAt(0).toUpperCase(), role:'Gérant', appareil:'Cet appareil', note:'Vous ouvrez la cuisine avec votre compte gérant.'};
  }
  function appliquerTheme(){
    if(root)root.classList.toggle('k-dark',theme==='dark');
    if(tiroir)tiroir.classList.toggle('k-dark',theme==='dark');
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
    if(reel)return '<button class="k-health" data-ops="connections"><i class="'+(navigator.onLine===false?'k-health-bad':'')+'"></i>'+(navigator.onLine===false?'Hors ligne':'En direct')+'</button>';
    var n=jobs.filter(function(j){return j.etat==='attente';}).length;
    return '<button class="k-health" data-ops="connections"><i class="'+(navigator.onLine===false||!liensDemo.caisse||!liensDemo.imprimante||!stockageOK?'k-health-bad':'')+'"></i>'+ (navigator.onLine===false?'Hors ligne':n?n+' en attente':'Connexions · démo')+'</button>';
  }
  function mapStock(type){return type==='p'?rupt:type==='c'?catOff:type==='s'?supOff:ingredientOff;}
  function setStock(type,id,off,duree){
    mapStock(type)[id]=off;var key=type+':'+id;
    delete stockFin[key];
    if(off&&duree&&duree!=='manuel'){var fin=new Date();if(duree==='demain')fin.setHours(24,0,0,0);else fin=new Date(Date.now()+(duree==='30'?30:120)*60000);stockFin[key]=fin.getTime();}
    if(reel)envoyerStock(type,id,off,stockFin[key]||null);
  }
  /* Connecté : chaque rupture part en base. En cas de refus (permission
     retirée par le gérant…), la carte est relue pour revenir à l'état réel. */
  var TYPES_STOCK={p:'produit',c:'categorie',s:'supplement',i:'ingredient'};
  /* Une seule demande en vol par élément : après des clics rapides, le
     dernier choix part quand la demande précédente est revenue, pour que la
     base finisse toujours sur ce qui est affiché. */
  var envoisStock={};
  function envoyerStock(type,id,off,fin){
    var uuid=type==='c'?(carte().filter(function(c){return c.cat===id;})[0]||{}).id:type==='s'?supIds[id]:id;
    if(!uuid){api.toast('Élément introuvable dans la carte.');return;}
    var key=type+':'+id,envoi=envoisStock[key];
    if(envoi){envoi.dernier={off:off,fin:fin};envoi.enAttente=true;return;}
    envoi=envoisStock[key]={dernier:{off:off,fin:fin},enAttente:false};
    (function partir(v){
      PelyoDonnees.changerDisponibilite(TYPES_STOCK[type],uuid,!v.off,v.fin,function(e){
        if(e){delete envoisStock[key];api.toast(e);chargerCarteReelle();return;}
        if(envoi.enAttente){envoi.enAttente=false;partir(envoi.dernier);return;}
        delete envoisStock[key];
      });
    })(envoi.dernier);
  }
  /* Une relecture de la carte (temps réel) peut arriver pendant un envoi :
     elle ne doit pas ré-afficher l'ancien état le temps qu'il aboutisse. */
  function garderEnvoisStock(){
    Object.keys(envoisStock).forEach(function(key){
      var v=envoisStock[key].dernier;
      mapStock(key.charAt(0))[key.slice(2)]=v.off;
      if(v.off&&v.fin)stockFin[key]=v.fin;else delete stockFin[key];
    });
  }
  /* La carte lue en base devient la carte de la cuisine ; les ruptures en
     cours (et leur heure de fin) remplissent les mêmes tables que la démo. */
  function chargerCarteReelle(){
    var generation=montageId;
    PelyoDonnees.chargerCarte(function(e,x){
      if(generation!==montageId)return;
      if(e){api.toast(e);return;}
      menuReel=x.menu;ingredientsReel=x.ingredients;supIds={};
      rupt={};catOff={};supOff={};ingredientOff={};stockFin={};
      x.menu.forEach(function(cat){
        if(!cat.dispo){catOff[cat.cat]=true;if(cat.fin)stockFin['c:'+cat.cat]=cat.fin;}
        cat.items.forEach(function(it){
          if(!it.dispo){rupt[it.id]=true;if(it.fin)stockFin['p:'+it.id]=it.fin;}
          it.dispo=true;it.sup.forEach(function(sp){sp.dispo=true;});
        });
      });
      x.supplements.forEach(function(sp){var k=api.norm(sp.nom);supIds[k]=sp.id;if(!sp.dispo){supOff[k]=true;if(sp.fin)stockFin['s:'+k]=sp.fin;}});
      x.ingredients.forEach(function(i){if(!i.dispo){ingredientOff[i.id]=true;if(i.fin)stockFin['i:'+i.id]=i.fin;}});
      garderEnvoisStock();
      /* Page des ruptures ouverte : ses lignes se mettent à jour sur place. */
      if(!ops)peindre();else if(ops.type==='stock')majLignesStock(null);
    });
  }
  function carteVide(){
    var ctx=PelyoDonnees.contexte()||{},gerant=ctx.role==='gerant'||ctx.role==='fondateur';
    if(!menuReel)return '<div class="k-empty">Chargement de la carte…</div>';
    return '<div class="k-empty"><b>La carte de ce restaurant est vide.</b><p>'+(gerant
      ?'Chargez la carte d’exemple pour essayer les ruptures tout de suite. Vous pourrez la modifier ou la remplacer par la vôtre.'
      :'Le gérant l’ajoute depuis son espace. Il n’y a rien à suspendre pour l’instant.')+'</p>'+
      (gerant?'<button class="k-btn" data-carte-exemple>Charger la carte d’exemple</button>':'')+'</div>';
  }

  /* Connecté : le rythme part en base. Les + / − rapprochés partent en un
     seul envoi ; pendant un envoi, l'écho temps réel n'écrase pas l'écran. */
  var reglagesEnAttente={},minuteurReglages=null,envoisReglages=0;
  function envoyerReglages(maj,differer){
    if(!reel)return;
    for(var k in maj)if(Object.prototype.hasOwnProperty.call(maj,k))reglagesEnAttente[k]=maj[k];
    clearTimeout(minuteurReglages);
    minuteurReglages=setTimeout(function(){
      minuteurReglages=null;
      var envoi=reglagesEnAttente;reglagesEnAttente={};envoisReglages++;
      PelyoDonnees.reglerService(envoi,function(e){envoisReglages--;if(e){api.toast(e);relireReglages();}});
    },differer?600:0);
  }
  function reglagesEnCours(){return !!minuteurReglages||envoisReglages>0;}
  function appliquerReglages(r){
    charge=r.charge;delaiRetrait=r.delai_retrait_min;delaiLivraison=r.delai_livraison_min;capacite=r.capacite;
    retraitOuvert=r.retrait_ouvert;livraisonOuverte=r.livraison_ouverte;
    impressionAuto=r.impression_auto;impressionAnnulations=r.impression_annulations;
    if(r.adr_rue!==undefined)infosReel=r;
  }
  function relireReglages(){
    var generation=montageId;
    PelyoDonnees.chargerReglages(function(e,r){if(e||!r||generation!==montageId)return;appliquerReglages(r);if(!ops)repeindreRythme();});
  }

  /* Connecté : la règle est d'abord vérifiée ici, avec les mêmes messages
     que la démo, puis la base l'applique à son tour. L'écran se met à jour
     par le temps réel, sur cette tablette comme sur les autres. */
  function envoyerOps(type,c){
    if(ops.envoi)return;
    var essai=PelyoKitchen.clone(c),now=Date.now(),envoi=ops;
    function derniers(){var h=essai.historique[essai.historique.length-1];return h?h.details:[];}
    function fin(message){return function(e){if(ops!==envoi)return;if(e){ops.envoi=false;ops.error=e;peindre();return;}ops=null;api.toast(message);peindre();};}
    if(type==='edit'){
      PelyoKitchen.modifier(essai,ops.lignes,root.querySelector('#k-confirm-client').checked,now);
      ops.envoi=true;
      PelyoDonnees.modifierCommande(c.uuid,c.version,essai.lignes,derniers(),true,fin('Correctif enregistré : il s’affiche sur tous les écrans du restaurant.'));
    } else if(type==='address'){
      var a={};Array.prototype.forEach.call(root.querySelectorAll('[data-address-field]'),function(input){a[input.dataset.addressField]=input.value;});
      PelyoKitchen.corrigerLivraison(essai,a,root.querySelector('#k-client-phone').value,root.querySelector('#k-address-confirm').checked,now);
      ops.envoi=true;
      PelyoDonnees.corrigerLivraison(c.uuid,c.version,essai.adresseDetail,essai.telephoneClient,derniers(),true,fin('Coordonnées de livraison enregistrées.'));
    } else if(type==='cancel'){
      var motif=root.querySelector('#k-cancel-reason').value;
      PelyoKitchen.annuler(essai,motif,now);
      ops.envoi=true;
      PelyoDonnees.annulerCommande(c.uuid,c.version,motif.trim(),fin('Commande #'+c.id+' annulée.'));
    } else {
      var raison=root.querySelector('#k-issue-reason').value;
      if(!raison)throw Error('Choisissez le problème rencontré.');
      ops.envoi=true;
      PelyoDonnees.signalerProbleme(c.uuid,raison,root.querySelector('#k-issue-note').value,root.querySelector('#k-issue-route').value,fin('Problème signalé : il s’affiche sur tous les écrans du restaurant.'));
    }
  }

  /* Connecté, sans imprimante reliée (étape 4) : le ticket passe par
     l'impression de l'appareil (AirPrint, imprimante du réseau…). */
  function imprimerNavigateur(c){
    var f=document.createElement('iframe');
    f.setAttribute('aria-hidden','true');f.setAttribute('tabindex','-1');
    f.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(f);
    var d=f.contentWindow.document;
    d.open();d.write('<!doctype html><meta charset="utf-8"><title>Ticket '+c.id+'</title><style>@page{margin:4mm}body{margin:0;font:12px/1.35 ui-monospace,Menlo,monospace;white-space:pre-wrap}</style>'+esc(ticket(c)));d.close();
    setTimeout(function(){
      try{f.contentWindow.focus();f.contentWindow.print();}catch(e){api.toast('Impression impossible sur cet appareil : utilisez « Télécharger ».');}
      setTimeout(function(){if(f.parentNode)f.parentNode.removeChild(f);},60000);
    },50);
    imprimes[c.id]=true;
  }
  function expirerStocks(){var change=false;Object.keys(stockFin).forEach(function(key){if(stockFin[key]<=Date.now()){mapStock(key.charAt(0))[key.slice(2)]=false;delete stockFin[key];change=true;}});return change;}
  function bloqueParIngredient(id){return ingredientsCarte().some(function(i){return ingredientOff[i.id]&&i.produits.indexOf(id)!==-1;});}
  function stockEffectif(it,cat){return !!(rupt[it.id]||catOff[cat]||bloqueParIngredient(it.id));}
  function produitEtCat(id){var r=null;carte().forEach(function(cat){cat.items.forEach(function(it){if(String(it.id)===id)r={it:it,cat:cat.cat};});});return r;}
  function stockLigne(key){
    var type=key.charAt(0),id=key.slice(2),pc=type==='p'?produitEtCat(id):null,off=pc?stockEffectif(pc.it,pc.cat):!!mapStock(type)[id];
    return {off:off,texte:off?(stockFin[key]?'Jusqu’au '+new Date(stockFin[key]).toLocaleString('fr-FR'):'Rupture active'):'Disponible'};
  }
  /* Gestion des ruptures à la main : met à jour chaque ligne sur place. La
     toque touchée fait un long tour en changeant de couleur ; les produits
     bloqués par un ingrédient changent de couleur sans tourner. */
  function majLignesStock(touche){
    Array.prototype.forEach.call(root.querySelectorAll('[data-ops-stock]'),function(row){
      var key=row.getAttribute('data-ops-stock'),e=stockLigne(key),avant=row.getAttribute('aria-pressed')==='true';
      if(key!==touche&&avant===e.off)return;
      row.setAttribute('aria-pressed',String(e.off));
      var petits=row.querySelectorAll('small');if(petits.length)petits[petits.length-1].textContent=e.texte;
      var etiquette=row.querySelector('.k-pelyo-toggle em');if(etiquette)etiquette.textContent=e.off?'Rupture':'Actif';
      if(key!==touche)return;
      var mark=row.querySelector('.k-pelyo-mark'),bascule=row.querySelector('.k-pelyo-toggle');
      if(!mark||!mark.animate||mouvementReduit())return;
      var sens=e.off?1:-1;
      if(row._tour){row._tour.cancel();row._gonfle.cancel();}
      row._tour=mark.animate([{rotate:'0deg'},{rotate:(sens*720)+'deg'}],{duration:1700,easing:'cubic-bezier(.55,.05,.15,1)'});
      row._gonfle=mark.animate([{scale:'1'},{scale:'1.28',offset:.38},{scale:'.94',offset:.78},{scale:'1'}],{duration:1700,easing:'ease-in-out'});
      bascule.classList.remove('k-halo');void bascule.offsetWidth;bascule.classList.add('k-halo');
    });
  }
  function listeSupplements(){var liste={};carte().forEach(function(cat){cat.items.forEach(function(it){it.sup.forEach(function(s){var key=api.norm(s.nom);if(!liste[key])liste[key]={id:key,nom:s.nom,produits:[]};liste[key].produits.push(it.nom);});});});return Object.keys(liste).map(function(k){return liste[k];});}

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
    var R = infosResto();
    return '<div class="k-over k-menu-over"><div class="k-ohead"><button data-ops-close>← Retour</button><span class="k-clock">Vue client</span></div>' +
      '<article class="k-menu-sheet" aria-label="Carte de ' + esc(R.nom) + '">' +
        '<header class="k-menu-head"><img src="assets/logo-toque.png" alt="" width="46" height="46"><span class="k-menu-eyebrow">La carte</span>' +
          '<h2>' + esc(R.nom) + '</h2><p>' + esc(R.adresse) + '</p><span class="k-menu-orn" aria-hidden="true"></span></header>' +
        carte().map(function(cat){
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

  /* ------------------------- balance de portions ------------------------- */
  function produitDeLigne(l){ var r = null; carte().forEach(function(cat){ cat.items.forEach(function(it){ if (it.nom === l.nom) r = it; }); }); return r; }
  /* Une commande commence : si la pesée guidée est active et la balance
     reliée, on ouvre l'écran de pesée, ingrédient par ingrédient. */
  function lancerPesee(c){
    if (reel || !window.PelyoBalance) return;
    var x = PelyoBalance.lire();
    if (!x.reglages.guidee || !x.balance.reliee) return;
    var et = PelyoBalance.etapes(c.lignes, produitDeLigne);
    if (!et.length) return;
    pesee = { id:c.id, etapes:et, i:0, poids:0, faits:[] };
    ops = { type:'pesee', id:c.id, error:'' };
    PelyoBalance.tare(); PelyoBalance.cibler(et[0]);
    if (!arretPoidsK) arretPoidsK = PelyoBalance.surPoids(function(p){
      if (!pesee) return;
      pesee.poids = Math.max(0, Math.round(p.g)); majPesee();
    });
  }
  function etapePesee(){ return pesee && pesee.etapes[pesee.i]; }
  function hautJauge(e){ return Math.max(e.max * 1.3, e.max + 30); }
  function msgPesee(niv, e){
    if (niv === 'trop') return 'Trop : retirez ' + (pesee.poids - e.max) + ' g';
    if (niv === 'ok') return PelyoBalance.lire().reglages.tareAuto ? 'C’est bon · on passe à la suite' : 'C’est bon';
    if (niv === 'presque') return 'Presque : encore ' + (e.min - pesee.poids) + ' g';
    return niv === 'peu' ? 'Encore ' + (e.min - pesee.poids) + ' g' : 'Posez l’ingrédient';
  }
  function overlayPesee(){
    var e = etapePesee(); if (!e) return '';
    var sim = PelyoBalance.lire().balance.simulee, niv = PelyoBalance.niveau(pesee.poids, e), haut = hautJauge(e);
    return '<div class="k-over k-pesee" data-niveau="' + niv + '" data-layer="ops:pesee">' +
      '<div class="k-pesee-tete"><button data-ops-close>Fermer</button><span>#' + pesee.id + ' · étape ' + (pesee.i + 1) + ' / ' + pesee.etapes.length + '</span></div>' +
      '<p class="k-pesee-prod">' + esc(e.produit) + (e.sur > 1 ? ' · ' + e.unite + ' / ' + e.sur : '') + (e.opt ? '<small>' + esc(e.opt) + '</small>' : '') + '</p>' +
      '<h2 class="k-pesee-ing">' + esc(e.nom) + '</h2>' +
      '<div class="k-pesee-poids"><b data-pesee-poids>' + pesee.poids + '</b><span>g</span></div>' +
      '<p class="k-pesee-msg" data-pesee-msg>' + msgPesee(niv, e) + '</p>' +
      '<div class="k-pesee-jauge"><span style="left:' + (e.min / haut * 100) + '%;width:' + ((e.max - e.min) / haut * 100) + '%"></span><i data-pesee-jauge style="width:' + Math.min(100, pesee.poids / haut * 100) + '%"></i></div>' +
      '<p class="k-pesee-cible">Cible <b>' + e.min + ' à ' + e.max + ' g</b></p>' +
      (sim ? '<div class="k-pesee-sim"><span>Balance de démonstration</span><button data-pesee-sim="10">+10 g</button><button data-pesee-sim="40">+40 g</button><button data-pesee-sim="-10">−10 g</button></div>' : '') +
      '<div class="k-pesee-actions"><button class="k-btn2" data-pesee-passer>Passer</button><button class="k-btn" data-pesee-valider>Valider</button></div>' +
      '<ol class="k-pesee-etapes">' + pesee.etapes.map(function(x, i){
        var f = pesee.faits[i];
        return '<li class="' + (i === pesee.i ? 'k-en-cours' : f ? (f.passe ? 'k-passe' : 'k-' + f.niv) : '') + '"><span>' + esc(x.produit) + ' · ' + esc(x.nom) + '</span><b>' + (f && !f.passe ? f.poids + ' g' : f ? 'passé' : x.min + '–' + x.max + ' g') + '</b></li>';
      }).join('') + '</ol></div>';
  }
  function majPesee(){
    var e = etapePesee(), o = root.querySelector('.k-pesee');
    if (!e || !o) return;
    var niv = PelyoBalance.niveau(pesee.poids, e);
    o.setAttribute('data-niveau', niv);
    o.querySelector('[data-pesee-poids]').textContent = pesee.poids;
    o.querySelector('[data-pesee-msg]').textContent = msgPesee(niv, e);
    o.querySelector('[data-pesee-jauge]').style.width = Math.min(100, pesee.poids / hautJauge(e) * 100) + '%';
    clearTimeout(peseeT);
    /* Bon et stable une seconde : tare automatique, ingrédient suivant. */
    if (niv === 'ok' && PelyoBalance.lire().reglages.tareAuto) peseeT = api.after(function(){ if (pesee) etapeSuivante(false); }, 1200);
  }
  function etapeSuivante(passe){
    clearTimeout(peseeT);
    var e = etapePesee(); if (!e) return;
    var niv = PelyoBalance.niveau(pesee.poids, e);
    pesee.faits[pesee.i] = { poids:pesee.poids, niv:niv, passe:passe };
    if (!passe) PelyoBalance.noter({ at:Date.now(), cmd:pesee.id, produit:e.produit, ing:e.nom, min:e.min, max:e.max, poids:pesee.poids });
    api.vibrer(niv === 'ok' ? 10 : 22);
    pesee.i++; pesee.poids = 0;
    if (pesee.i >= pesee.etapes.length){
      var peses = pesee.faits.filter(function(f){ return f && !f.passe; });
      api.toast('Pesée terminée · ' + peses.filter(function(f){ return f.niv === 'ok'; }).length + ' / ' + peses.length + ' dans la cible.');
      pesee = null; ops = null; peindre(); return;
    }
    PelyoBalance.tare(); PelyoBalance.cibler(etapePesee());
    peindre();
  }
  function feuilleBalanceCuisine(){
    if (reel) return feuilleOps('Balance de portions', '<p class="k-note">La balance arrive avec les comptes connectés dans une prochaine étape. Essayez-la dès maintenant dans le compte démo.</p>');
    var x = PelyoBalance.lire(), b = x.balance;
    return feuilleOps('Balance de portions',
      '<div class="k-bal-etat' + (b.reliee ? ' k-bal-on' : '') + '"><b>' + esc(b.modele) + '</b><span>' + (b.reliee ? 'Reliée · ' + (b.simulee ? 'balance de démonstration' : esc(b.nom)) : 'Pas encore reliée') + '</span></div>' +
      (b.reliee ? '<button class="k-btn2" data-bal-k="delier">Délier la balance</button>' : '<button class="k-btn" data-bal-k="relier">Relier la balance</button>') +
      '<p class="k-note">' + (PelyoBalance.bluetoothDispo() ? 'Allumez la balance, touchez « Relier », puis choisissez-la dans la liste Bluetooth.' : 'Ce navigateur ne lit pas le Bluetooth (iPad, Safari) : une balance de démonstration sera reliée. Avec une vraie balance : tablette Android avec Chrome, ou l’appli Pelyo.') + '</p>' +
      '<p class="k-note">Pesée guidée ' + (x.reglages.guidee ? 'activée' : 'désactivée') + ' · tolérance ± ' + x.reglages.tolerance + ' g · tare ' + (x.reglages.tareAuto ? 'automatique' : 'manuelle') + '. Quand une commande commence, l’écran de pesée s’ouvre tout seul. Les grammages et l’ordre se règlent dans Pelyo Gérant, Gestion → Balance de portions.</p>');
  }

  function overlayOps(){
    if (ops.type === 'menu') return overlayMenuCarte();
    if (ops.type === 'pesee') return overlayPesee();
    if (ops.type === 'balance') return feuilleBalanceCuisine();
    if (ops.type === 'livreur') return feuilleOps('Mode livreur', reel
      ? '<p class="k-note">Le mode livreur sera disponible avec les comptes connectés dans une prochaine étape. Essayez-le dès maintenant dans le compte démo.</p>'
      : '<form data-livreur-form novalidate><p class="k-note">Demandez au gérant le code livreur : il l’affiche dans son appli, Gestion → Livreurs. Après son accord, ce téléphone passe en lecture seule et ne montre plus que les livraisons.</p>' +
        '<label class="k-field">Ton prénom<input id="k-lv-nom" maxlength="30" autocomplete="given-name" required></label>' +
        '<label class="k-field">Code livreur<input id="k-lv-code" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ex. LIV-4821" required></label>' +
        '<button class="k-btn" type="submit">Envoyer la demande au gérant</button></form>');
    if (ops.type === 'ruptures-active'){
      var actives=ruptActives();
      return '<div class="k-over k-active-ruptures"><button class="k-ruptures-close" data-ops-close aria-label="Fermer">×</button><span class="k-eyebrow">DISPONIBILITÉS</span><h2>Ruptures actives</h2>'+(actives.length?actives.map(function(x){return '<button class="k-active-rupture" data-unrupt="'+esc(x.id)+'">'+esc(x.nom)+' <b>×</b></button>';}).join(''):'<p>Aucune rupture en cours.</p>')+'</div>';
    }
    var c=commande(ops.id),html='';
    if(ops.type==='info'){
      var legal=D_.mentionsLegales;
      var poste=posteConnecte();
      var pages={
        confidentialite:{title:'Confidentialité',body:reel?'<p>Les commandes, la carte et les réglages de ce restaurant sont enregistrés chez Pelyo, sur des serveurs en Europe. Seuls le gérant et les appareils qu’il a autorisés y ont accès.</p><p>Les coordonnées des clients servent uniquement à préparer, livrer et suivre leurs commandes. Les enregistrements des appels ne sont jamais visibles en cuisine.</p><p>Une question sur les données : <a href="mailto:bonjour@pelyo.eu">bonjour@pelyo.eu</a>.</p>':'<p>Cette maquette utilise uniquement des données de démonstration. Les commandes, réglages et coordonnées saisies sont conservés dans le stockage local de ce navigateur, sans synchronisation vers un compte réel.</p><p>Ne saisissez pas de données de vrais clients pendant les essais. La politique de confidentialité complète devra être publiée avant toute utilisation réelle.</p>'},
        mentions:{title:'Mentions légales',body:
          '<p class="k-legal-warning"><b>Projet pour la version officielle.</b> Texte incomplet, à vérifier et compléter avant publication.</p>'+
          '<h3>Éditeur</h3><p>Le site web Pelyo et les applications Pelyo destinées aux gérants, aux équipes de cuisine et aux commerciaux sont édités par <strong>'+esc(legal.editeur)+'</strong>, '+esc(legal.forme)+' au capital de <strong>'+esc(legal.capital)+'</strong>, dont le siège social est situé <strong>'+esc(legal.adresse)+'</strong>.</p>'+
          '<p>'+esc(legal.nomCommercial)+' est le nom commercial sous lequel '+esc(legal.editeur)+' propose son service.</p>'+
          '<h3>Contact</h3><p><a href="mailto:'+esc(legal.email)+'">'+esc(legal.email)+'</a><br><a href="tel:'+esc(legal.telephone.replace(/\s/g,''))+'">'+esc(legal.telephone)+'</a></p>'+
          '<h3>Directeur de la publication</h3><p><strong>'+esc(legal.directeur)+'</strong>, '+esc(legal.fonctionDirecteur)+'.</p>'},
        conditions:{title:'Conditions d’utilisation',body:reel?'<p>Cette tablette sert à recevoir et préparer les commandes du restaurant. Chaque geste est noté dans le journal avec l’appareil et l’heure.</p><p>Le gérant choisit ce que la cuisine a le droit de faire (modifier, annuler, ruptures, rush, pause) et peut retirer l’accès de cet appareil à tout moment.</p><p>Les conditions d’utilisation de Pelyo s’appliquent au compte du restaurant.</p>':'<p>Cette version sert à tester le parcours cuisine. Elle ne peut ni recevoir de vraies commandes, ni communiquer avec une caisse ou une imprimante réelle.</p><p>Les conditions d’utilisation définitives seront publiées avant la mise en service.</p>'},
        assistance:{title:'Assistance',body:reel?'<p>Une question ou un souci ? Le <b>Centre d’aide</b>, dans les réglages, répond en direct et peut régler la plupart des choses avec vous.</p><p>Sinon, écrivez à <a href="mailto:bonjour@pelyo.eu">bonjour@pelyo.eu</a> : l’équipe Pelyo vous répond vite.</p>':'<p>Cette maquette ne dispose pas encore d’un service d’assistance connecté. Le canal de support et ses coordonnées seront affichés ici avant la mise en service.</p><p>Pour tester les pannes simulées, ouvrez « État et opérations en attente » dans les réglages.</p>'},
        compte:{title:'Mon espace cuisine',body:'<section class="k-account-card"><span class="k-account-avatar" aria-hidden="true">'+esc(poste.initiales)+'</span><div><small>POSTE CONNECTÉ</small><b>'+esc(poste.qui)+'</b><p>'+esc(poste.note)+'</p></div></section><dl class="k-account-list"><dt>Restaurant associé</dt><dd>'+esc(nomResto())+'</dd><dt>Rôle</dt><dd>'+esc(poste.role)+'</dd><dt>Appareil</dt><dd>'+esc(poste.appareil)+'</dd><dt>État de l’accès</dt><dd><span class="k-account-status">Actif</span></dd></dl><p class="k-account-note">Le gérant autorise ou révoque les appareils depuis son espace restaurant.</p>'}
      };
      var page=pages[ops.id];
      return '<div class="k-over k-legal-page"><div class="k-ohead"><button data-ops-close>← Réglages</button></div><span class="k-eyebrow">PELYO CUISINE</span><h2>'+esc(page.title)+'</h2>'+page.body+'</div>';
    }
    if(ops.type==='address'){
      var a=c.adresseDetail||{};
      html='<form data-ops-form="address"><p class="k-note">Vérifiez les coordonnées avec le client. '+(reel?'Les frais ne changent pas ; la distance sera marquée à revérifier.':'La distance et les frais ne sont pas recalculés automatiquement dans cette maquette.')+'</p><div class="k-address-fields">'+[['numero','Numéro','street-address'],['rue','Rue','address-line1'],['codePostal','Code postal','postal-code'],['ville','Ville','address-level2'],['complement','Étage, bâtiment, appartement','address-line2'],['acces','Digicode ou consigne d’accès','off']].map(function(f){return '<label class="k-field">'+f[1]+'<input data-address-field="'+f[0]+'" autocomplete="'+f[2]+'" maxlength="120"'+(['numero','rue','codePostal','ville'].indexOf(f[0])!==-1?' required':'')+(f[0]==='codePostal'?' inputmode="numeric" pattern="[0-9]{5}"':'')+' value="'+esc(a[f[0]]||'')+'"></label>';}).join('')+'</div><label class="k-field">Téléphone du client · facultatif<input id="k-client-phone" type="tel" autocomplete="off" inputmode="tel" maxlength="24" value="'+esc(c.telephoneClient||'')+'" placeholder="À renseigner si connu"></label><label class="k-check"><input type="checkbox" id="k-address-confirm" required>J’ai vérifié ces coordonnées avec le client.</label><button class="k-btn" type="submit">Enregistrer les coordonnées</button></form>';
      return feuilleOps('Livraison · #'+c.id,html);
    }
    if(ops.type==='edit'){
      html='<form data-ops-form="edit"><p class="k-note">Modification confirmée avec le client. Les prix sont les totaux de chaque ligne, suppléments inclus. Aucun paiement traité.</p>'+ops.lignes.map(function(l,i){return '<fieldset class="k-edit-line"><legend>'+esc(l.nom)+'</legend><label>Quantité<input type="number" min="1" max="99" step="1" required data-edit="q" data-index="'+i+'" value="'+l.q+'"></label><label>Total ligne (€)<input type="number" min="0" max="10000" step="0.01" required data-edit="prix" data-index="'+i+'" value="'+(l.prix/100).toFixed(2)+'"></label>'+[['opt','Options'],['sup','Suppléments'],['dem','Consignes'],['allergie','Allergie déclarée par le client']].map(function(f){return '<label class="k-wide">'+f[1]+'<input maxlength="250" data-edit="'+f[0]+'" data-index="'+i+'" value="'+esc(l[f[0]]||'')+'"></label>';}).join('')+'<button type="button" class="k-text-danger" data-remove-line="'+i+'">Retirer ce produit</button></fieldset>';}).join('')+'<label class="k-field">Ajouter un produit<select id="k-add-product">'+carte().map(function(cat){return cat.items.map(function(it){return '<option value="'+it.id+'">'+esc(it.nom)+'</option>';}).join('');}).join('')+'</select></label><button type="button" class="k-btn2" data-add-line>Ajouter au brouillon</button><label class="k-check"><input type="checkbox" id="k-confirm-client" required>Je confirme l’accord du client sur ces changements.</label><button class="k-btn" type="submit">Enregistrer le correctif</button></form>';
      return feuilleOps('Modifier #'+c.id,html);
    }
    if(ops.type==='cancel')return feuilleOps('Annuler #'+c.id,'<form data-ops-form="cancel"><p class="k-note">La commande sera conservée dans l’historique, signalée comme annulée et ne pourra plus avancer en préparation. Aucun remboursement n’est effectué par Pelyo.</p><label class="k-field">Motif<textarea id="k-cancel-reason" required maxlength="300"></textarea></label><label class="k-check"><input type="checkbox" required>Je confirme l’annulation de cette commande.</label><button class="k-btn" type="submit">Confirmer l’annulation</button></form>');
    if(ops.type==='problem')return feuilleOps('Un problème · #'+c.id,'<form data-ops-form="problem"><label class="k-field">Motif<select id="k-issue-reason">'+D_.cuisineOperations.problemes.map(function(p){return '<option>'+esc(p)+'</option>';}).join('')+'</select></label><label class="k-field">Précision<textarea id="k-issue-note" maxlength="300"></textarea></label><label class="k-field">Action à demander<select id="k-issue-route"><option>Prévenir le gérant</option><option>Demander un rappel du client</option></select></label><p class="k-note">'+(reel?'Le problème s’affiche sur tous les écrans du restaurant, gérant compris. Aucun message n’est envoyé au client.':'Demande enregistrée localement dans la démo. Aucun message ni appel réel n’est envoyé.')+'</p><button class="k-btn" type="submit">Signaler le problème</button></form>');
    if(ops.type==='stock'){
      var groupes=[{type:'p',nom:'Produits',items:[]},{type:'i',nom:'Ingrédients',items:ingredientsCarte()},{type:'s',nom:'Suppléments',items:listeSupplements()}];
      carte().forEach(function(cat){cat.items.forEach(function(it){groupes[0].items.push({id:it.id,nom:it.nom,cat:cat.cat});});});
      html='<p class="k-note">Ces changements s’appliquent aux prochains appels. Un ingrédient suspend les produits auxquels il est associé ; les suppléments n’apparaissent au client que s’il les demande.</p><label class="k-field k-stock-duration">Durée des nouvelles ruptures<select id="k-stock-duration"><option value="manuel">Jusqu’à réactivation manuelle</option><option value="30">30 minutes</option><option value="120">2 heures</option><option value="demain">Jusqu’à demain à 00 h</option></select></label>'+groupes.map(function(g){var items=g.items.slice().sort(function(a,b){var ao=g.type==='p'?stockEffectif(a,a.cat):!!mapStock(g.type)[a.id],bo=g.type==='p'?stockEffectif(b,b.cat):!!mapStock(g.type)[b.id];return Number(bo)-Number(ao)||a.nom.localeCompare(b.nom,'fr');});return '<section class="k-stock-group"><h3>'+g.nom+'</h3><div class="k-stock-list">'+items.map(function(it){var off=g.type==='p'?stockEffectif(it,it.cat):!!mapStock(g.type)[it.id],key=g.type+':'+it.id;return '<button class="k-stock-detail-row" data-ops-stock="'+esc(key)+'" aria-pressed="'+off+'"><span><b>'+esc(it.nom)+'</b>'+(it.produits?'<small>'+esc(it.produits.map(function(id){var p=trouverProduit(id);return p?p.nom:id;}).join(' · '))+'</small>':'')+'<small>'+(off?(stockFin[key]?'Jusqu’au '+new Date(stockFin[key]).toLocaleString('fr-FR'):'Rupture active'):'Disponible')+'</small></span><span class="k-pelyo-toggle"><img class="k-pelyo-mark" src="assets/logo-toque.png" alt=""><em>'+(off?'Rupture':'Actif')+'</em></span></button>';}).join('')+'</div></section>';}).join('');
      return feuilleOps('Gestion manuelle des ruptures',html);
    }
    if(reel)return feuilleOps('Connexions','<div class="k-connection-row"><b>Internet</b><span>'+(navigator.onLine===false?'Hors ligne : les gestes reprendront au retour du réseau.':'En ligne')+'</span></div>'+
      '<div class="k-connection-row"><b>Pelyo</b><span>Commandes, carte et rythme synchronisés en direct avec les autres écrans du restaurant.</span></div>'+
      '<div class="k-connection-row"><b>Imprimante</b><span>Pas encore reliée. « Imprimer » passe par l’impression de cet appareil.</span></div>'+
      '<div class="k-connection-row"><b>Caisse</b><span>Pas encore reliée.</span></div>');
    var pending=jobs.filter(function(j){return j.etat==='attente';});
    html='<p class="k-note">Aucune caisse ni imprimante réelle connectée. Les états et reprises ci-dessous servent à tester les incidents.</p><div class="k-connection-row"><b>Internet</b><span>'+(navigator.onLine===false?'Navigateur hors ligne':'Navigateur en ligne · serveur non vérifié')+'</span></div>'+['imprimante','caisse'].map(function(k){return '<div class="k-connection-row"><b>'+esc(k==='caisse'?'Caisse':'Imprimante')+' · démo</b><span>'+(liensDemo[k]?'Disponible dans la simulation':'Panne simulée')+'</span><button class="k-btn2" data-link-toggle="'+k+'">'+(liensDemo[k]?'Simuler une panne':'Rétablir la simulation')+'</button></div>';}).join('')+'<p class="k-note">Sauvegarde locale : '+(stockageOK?'active sur ce navigateur (données fictives uniquement).':'indisponible : un rechargement peut perdre les changements.')+'</p><h3>'+pending.length+' opération(s) en attente</h3>'+pending.map(function(j){return '<p class="k-job">#'+j.commande+' · v'+j.version+' · '+esc(j.type)+' <button data-job-retry="'+esc(j.key)+'">Réessayer</button></p>';}).join('')+'<button class="k-btn2" data-retry-all>Réessayer toutes les opérations</button><details class="k-history"><summary>Journal des opérations simulées</summary>'+jobs.slice().reverse().map(function(j){return '<p>#'+j.commande+' · v'+j.version+' · '+esc(j.type)+' · '+(j.etat==='attente'?'en attente':j.etat==='remplace'?'remplacée par une version plus récente':'traitement simulé')+'</p>';}).join('')+'</details><button class="k-text-danger" data-reset-demo>Réinitialiser les données de démonstration</button>'+(ops.reset?'<p class="k-note">Efface uniquement les commandes et réglages fictifs de cette cuisine sur ce navigateur.</p><button class="k-btn2" data-reset-confirm>Confirmer la réinitialisation</button>':'');
    return feuilleOps('Connexions et reprises',html);
  }

  function badgeOrigine(c){
    return '<span class="k-origin ' + (c.origine === 'restaurant' ? 'k-origin-pos' : '') + '">' +
      '<span class="k-origin-mark" aria-hidden="true">' + (c.origine === 'restaurant' ? '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 3h14v9H5zM12 12v4M3 16h18v5H3zM7 7h10M16 18v1"/></svg>' : '<img src="assets/logo-toque.png" alt="" width="23" height="23">') + '</span><span class="k-origin-name">' + (c.origine === 'restaurant' ? 'Restaurant' : 'IA Pelyo') + '</span></span>';
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
      download:'<path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/>',
      print:'<path d="M7 8V3h10v5M7 17H4V8h16v9h-3M7 14h10v7H7zM16 11h1"/>',
      bag:'<path d="M5 7h14l1 14H4zM9 8V5a3 3 0 0 1 6 0v3"/>',
      truck:'<path d="M2 6h12v12H2zm12 4h4l4 4v4h-8"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
      lock:'<path d="M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3"/>',
      scooter:'<circle cx="6" cy="17" r="2.5"/><circle cx="18" cy="17" r="2.5"/><path d="M8.5 17h7M15 6h3l2 8M6 14.5 9 10h5l2 4.5"/>',
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
    return '<nav class="k-dock" aria-label="Navigation cuisine"><span class="k-dock-pastille" aria-hidden="true"></span><div class="k-rail-brand" aria-hidden="true"><img src="assets/logo-toque.png" width="40" height="40" alt=""><span>PELYO</span></div>' + VUES.map(function(v){
      return '<button data-vue="' + v.id + '" aria-current="' + (vue === v.id ? 'page' : 'false') + '" class="' + (vue === v.id ? 'k-active' : '') + '">' + icone(v.id) + '<span>' + esc(v.lbl) + '</span></button>';
    }).join('') + '<button class="k-rail-settings' + (vue === 'parametres' ? ' k-active' : '') + '" data-vue="parametres" aria-current="' + (vue === 'parametres' ? 'page' : 'false') + '">' + icone('settings') + '<span>Réglages</span></button></nav>';
  }

  /* Une commande qui arrive ou change d'étape s'anime une fois. */
  function animCommande(c){
    if (!etatsVus){ etatsVus = {}; cmds.forEach(function(x){ etatsVus[x.id] = x.etat; }); }
    var avant = etatsVus[c.id];
    etatsVus[c.id] = c.etat;
    return avant === undefined ? ' k-arrivee' : avant !== c.etat ? ' k-change' : '';
  }

  /* ---------------------- profondeur et mouvement ----------------------
     Rien de tout ça ne prend de place ni ne change ce qu'on peut faire :
     fond vivant, commandes qui glissent à leur nouvelle place, compteurs
     qui rebondissent, pastille qui suit l'onglet du bas. */
  function mouvementReduit(){ return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }

  /* Le fond est recréé à chaque rendu : un retard négatif calé sur l'horloge
     le fait reprendre exactement là où il en était, sans saut. */
  function ambiance(){
    var t = -((Date.now() / 1000) % 600).toFixed(2);
    return '<div class="k-ambiance" aria-hidden="true" style="--k-amb-t:' + t + 's"><i></i><i></i><i></i></div>';
  }

  function positionsCommandes(){
    var p = {};
    Array.prototype.forEach.call(root.querySelectorAll('.k-order[data-cmd]'), function(el){ p[el.getAttribute('data-cmd')] = el.getBoundingClientRect(); });
    return p;
  }
  /* Chaque commande restée à l'écran part de son ancienne place et glisse
     jusqu'à la nouvelle (une commande qui s'en va, une autre qui arrive). */
  function glisserCommandes(avant){
    if (!avant || !root.animate) return;
    Array.prototype.forEach.call(root.querySelectorAll('.k-order[data-cmd]'), function(el){
      var a = avant[el.getAttribute('data-cmd')];
      if (!a) return;
      var b = el.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate([{transform:'translate(' + dx + 'px,' + dy + 'px)'}, {transform:'none'}], {duration:440, easing:'cubic-bezier(.2,.85,.25,1)'});
    });
  }

  function comptesOnglets(){
    var n = {};
    Array.prototype.forEach.call(root.querySelectorAll('.k-filt [data-filt] em, .k-passe-col[data-col] h3 em'), function(em){
      var cle = em.parentNode.getAttribute('data-filt') || 'col-' + em.closest('[data-col]').getAttribute('data-col');
      n[cle] = em.textContent;
    });
    return n;
  }
  function rebond(em){
    if (!em) return;
    em.classList.remove('k-pop'); void em.offsetWidth; em.classList.add('k-pop');
  }
  var volsEnCours = {};
  function rebondirComptes(avant){
    Array.prototype.forEach.call(root.querySelectorAll('.k-filt [data-filt] em, .k-passe-col[data-col] h3 em'), function(em){
      var cle = em.parentNode.getAttribute('data-filt') || 'col-' + em.closest('[data-col]').getAttribute('data-col');
      if (avant[cle] === undefined || avant[cle] === em.textContent) return;
      /* Une commande vole vers cet onglet : le nombre change à l'atterrissage. */
      if (volsEnCours[cle]){ em.setAttribute('data-apres', em.textContent); em.textContent = avant[cle]; return; }
      rebond(em);
    });
  }

  /* La commande qui change d'étape s'envole vers l'onglet qui la reçoit. */
  function envoler(fantome, depart, cle){
    var cible = root.querySelector('.k-filt [data-filt="' + cle + '"] em');
    if (!cible || !fantome.animate){ delete volsEnCours[cle]; return; }
    var r0 = root.getBoundingClientRect(), c = cible.getBoundingClientRect();
    fantome.className = fantome.className.replace(/ k-(arrivee|change|appui)\b/g, '') + ' k-fantome';
    fantome.removeAttribute('data-cmd');
    fantome.setAttribute('aria-hidden', 'true');
    fantome.inert = true;
    fantome.style.cssText = 'position:absolute;left:' + (depart.left - r0.left) + 'px;top:' + (depart.top - r0.top) + 'px;width:' + depart.width + 'px;height:' + depart.height + 'px;margin:0;z-index:40;pointer-events:none;transform-origin:50% 50%';
    root.appendChild(fantome);
    var dx = c.left + c.width / 2 - (depart.left + depart.width / 2), dy = c.top + c.height / 2 - (depart.top + depart.height / 2);
    var echelle = Math.max(0.06, c.width / depart.width);
    var fini = false;
    function atterrir(){
      if (fini) return; fini = true;
      if (fantome.parentNode) fantome.parentNode.removeChild(fantome);
      delete volsEnCours[cle];
      var em = root.querySelector('.k-filt [data-filt="' + cle + '"] em');
      if (em && em.hasAttribute('data-apres')){ em.textContent = em.getAttribute('data-apres'); em.removeAttribute('data-apres'); }
      rebond(em);
    }
    var vol = fantome.animate([
      {transform:'none', opacity:1},
      {transform:'translate(' + (dx * 0.3) + 'px,' + (dy * 0.3 - 40) + 'px) scale(.62) rotate(-3deg)', opacity:1, offset:.42},
      {transform:'translate(' + dx + 'px,' + dy + 'px) scale(' + echelle + ') rotate(-12deg)', opacity:.15}
    ], {duration:620, easing:'cubic-bezier(.5,0,.25,1)'});
    vol.onfinish = atterrir;
    setTimeout(atterrir, 900);
  }

  /* Barre du bas : la pastille glisse de l'ancien onglet au nouveau. */
  var pastille = null;
  function placerPastille(animer){
    var dock = root && root.querySelector('.k-dock'), p = dock && dock.querySelector('.k-dock-pastille');
    if (!p) return;
    var act = dock.querySelector('button.k-active');
    if (!act || !act.offsetWidth){ p.style.opacity = '0'; pastille = null; return; }
    var r = {x:act.offsetLeft, y:act.offsetTop, w:act.offsetWidth, h:act.offsetHeight};
    function poser(q){ p.style.transform = 'translate(' + q.x + 'px,' + q.y + 'px)'; p.style.width = q.w + 'px'; p.style.height = q.h + 'px'; }
    if (animer && pastille && !mouvementReduit()){
      p.style.transition = 'none'; poser(pastille); void p.offsetWidth; p.style.transition = '';
    }
    poser(r); p.style.opacity = '1';
    pastille = r;
  }

  /* Le calque du haut (Service) : sa hauteur réserve la place au-dessus de la
     liste ; replié, il glisse jusqu'aux onglets (transformation seule, sans
     changer aucune taille pendant le défilement). */
  function mesurerVolet(){
    var v = root && root.querySelector('.k-volet'), ws = root && root.querySelector('.k-workspace');
    if (!v || !ws) return;
    var f = v.querySelector('.k-filt'), h = v.offsetHeight, r = Math.max(0, (f ? f.offsetTop : 0) - 8);
    if (h !== volet.h) ws.style.setProperty('--volet-h', h + 'px');
    if (r !== volet.replie) ws.style.setProperty('--volet-replie', r + 'px');
    volet.h = h; volet.replie = r;
  }
  /* Les dernières mesures sont posées dès la création du calque : il naît
     directement à sa place (sans glisser depuis 0 à chaque rendu). */
  function styleVolet(){
    return volet.h ? ' style="--volet-h:' + volet.h + 'px;--volet-replie:' + volet.replie + 'px"' : '';
  }

  function titre(sous, titreTexte, droite){
    if (!grandEcran()) return '<header class="k-pg-tete"><h1>' + String(titreTexte).replace(/\.$/, '') + '</h1>' + (droite || '') + '</header>';
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
      '<div class="k-brand"><b>' + RIA.nomEnv(nomResto()) + '</b><span>Pelyo · cuisine</span></div>' +
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

  /* Minuteur de l'étape en cours : départ, durée réglée, temps écoulé. La
     bande du ticket se remplit de gauche à droite pendant ce temps. */
  function etapeMinuteur(c){
    var cle = c.etat === 'confirmee' ? 'lancer' : c.etat === 'preparation' ? 'preparer' : c.etat === 'prete' ? 'partir' : null;
    if (!cle) return null;
    if (c.etat === 'confirmee' && !c.recueAt) c.recueAt = Date.now();
    if (c.etat === 'preparation' && !c.commenceAt) c.commenceAt = Date.now() - (c.depuis | 0) * 1000;
    if (c.etat === 'prete' && !c.preteAt) c.preteAt = Date.now();
    var debut = c.etat === 'confirmee' ? (c.lancerA ? c.lancerA - minuteurs.lancer * 60000 : c.recueAt) : c.etat === 'preparation' ? c.commenceAt : c.preteAt;
    if (Date.now() < debut) return {cle:cle, duree:1, reste:1, depasse:false, attente:debut + minuteurs.lancer * 60000};
    var duree = minuteurs[cle] * 60000, ecoule = Math.max(0, Date.now() - debut);
    return {cle:cle, duree:duree, reste:duree - ecoule, depasse:ecoule > duree};
  }
  function progresCommande(c){
    var m = etapeMinuteur(c);
    if (!m) return c.etat === 'terminee' ? 100 : 0;
    if (m.attente) return 0;
    return Math.min(100, Math.round((m.duree - m.reste) / m.duree * 1000) / 10);
  }
  function minuteurTicket(c){
    var m = etapeMinuteur(c);
    if (!m) return ligneMinuteur(c);
    if (m.attente) return '<u>' + PelyoKitchen.hhmm(m.attente) + '</u><small>à lancer</small>';
    var sec = Math.round(Math.abs(m.reste) / 1000);
    var libelle = m.depasse ? 'de retard' : m.cle === 'lancer' ? 'pour lancer' : m.cle === 'preparer' ? 'pour préparer' : c.mode === 'livraison' ? 'avant départ' : 'pour remettre';
    return '<u class="' + (m.depasse ? 'k-sv-depasse' : '') + '">' + (m.depasse ? '+' : '') + api.chrono(sec) + '</u><small>' + libelle + '</small>';
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

  /* Photo du plat principal en fond de la commande (assets/plats, photos
     libres CC0). Le premier produit reconnu l'emporte ; frites et desserts
     seulement s'il n'y a rien d'autre. */
  var PLATS = [
    ['pizza', /pizza|calzone/i], ['tacos', /tacos?\b/i], ['kebab', /kebab|d[oö]ner|grec|shawarma|d[uü]r[uü]m/i],
    ['burger', /burger/i], ['poulet', /tenders?|nuggets?|wings?|poulet|chicken|crispy/i],
    ['sandwich', /sandwich|panini|wrap|baguette|am[ée]ricain/i]
  ];
  var PLATS_SECOURS = [['frites', /frites/i], ['dessert', /tiramisu|dessert|cookie|brownie|muffin|glace|tarte|g[âa]teau|donut|cr[êe]pe/i]];
  var PHOTOS_PAR_PLAT = {pizza:4, tacos:8, kebab:4, burger:4, poulet:2, sandwich:3, frites:3, dessert:2};
  function photoPlat(c){
    var noms = (c.lignes || []).map(function(l){ return l.nom || ''; });
    function chercher(liste){ for (var i = 0; i < noms.length; i++) for (var j = 0; j < liste.length; j++) if (liste[j][1].test(noms[i])) return liste[j][0]; return null; }
    var p = chercher(PLATS) || chercher(PLATS_SECOURS);
    if (!p) return '';
    // Plusieurs photos par plat ; une commande garde toujours la même.
    var n = 0, id = String(c.id || '');
    for (var k = 0; k < id.length; k++) n = (n * 31 + id.charCodeAt(k)) % 997;
    var v = n % (PHOTOS_PAR_PLAT[p] || 1);
    return '<span class="k-plat" aria-hidden="true" style="background-image:url(assets/plats/' + p + (v ? '-' + (v + 1) : '') + '.jpg)"></span>';
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

    var u = PelyoKitchen.urgence(c, Date.now());
    return '<article class="k-order k-state-' + c.etat + (u && u.late && !mort ? ' k-en-retard' : '') + animCommande(c) + '" data-cmd="' + c.id + '">' + photoPlat(c) + '<div class="k-order-top"><div class="k-order-identity"><button class="k-order-id" data-open="' + c.id + '" aria-label="Détails de la commande ' + c.id + '"><span>#</span>' + c.id + '</button>' + badgeOrigine(c) + '</div><span class="k-status">' + esc(e.lbl) + '</span><span class="k-t" data-timer="' + c.id + '">' + ligneMinuteur(c) + '</span></div>' +
      '<div class="k-order-signals">'+alertesCommande(c)+'<span data-deadline="'+c.id+'">'+delaiPromis(c)+'</span></div>' +
      '<div class="k-customer">' + icone(c.mode === 'livraison' ? 'truck' : 'bag') + '<b>' + esc(c.client || 'Client en ligne') + '</b><span>' + (c.mode === 'livraison' ? 'Livraison' : 'À emporter') + '</span></div>' + puceLivreur(c) +
      '<div class="k-order-lines">' + (c.lignes.length ? c.lignes.map(function(l){
        return '<div class="k-product"><span class="k-quantity">' + l.q + '</span><div><b>' + esc(l.nom) + '</b>' + (l.opt ? '<p>' + esc(l.opt) + '</p>' : '') + (l.sup ? '<p class="k-extra">+ ' + esc(l.sup) + '</p>' : '') + consignes(l,true) + '</div></div>';
      }).join('') : '<p class="k-note">Le client compose sa commande.</p>') + '</div>' +
      (c.mode === 'livraison' ? adresseCarte(c) : '') +
      '<div class="k-order-foot">' + (mort ? '<span class="k-hold">' + (c.etat==='annulee'?'Annulée · ne plus préparer':c.etat === 'terminee' ? 'Commande terminée' : c.etat === 'expiree' ? 'Sans validation' : 'Ne pas préparer avant confirmation') + '</span>' : '<button class="k-print" data-imprimer="' + c.id + '" aria-label="Imprimer le ticket ' + c.id + '">' + icone('print') + '</button>' + ligneAction(c)) + '</div></article>';
  }

  /* Tablette en paysage : « À préparer », « En cours » et « Prêtes » côte à
     côte, comme un vrai passe ; « Terminées » reste un onglet à part. */
  function grandEcran(){ return !!(window.matchMedia && window.matchMedia('(min-width:1000px)').matches); }
  function colonnePasse(x){
    var liste = cmds.filter(x.test);
    if(triUrgence)liste.sort(function(a,b){return (a.promesseAt||Infinity)-(b.promesseAt||Infinity)||a.id-b.id;});
    return '<section class="k-passe-col" data-col="' + x.id + '"><h3>' + esc(x.lbl) + '<em>' + liste.length + '</em></h3>' +
      (liste.length ? '<div class="k-orders">' + liste.map(ligne).join('') + '</div>' : '<p class="k-passe-vide">Rien pour l’instant.</p>') + '</section>';
  }
  /* ---------------- Service sur téléphone : les tickets ----------------
     Une commande = un ticket : numéro et chrono en gros, client, produits,
     consignes, un seul bouton. Classes k-sv-* (voir la fin de cuisine.css) :
     rien n'hérite des anciens styles de carte. La tablette garde le passe. */
  function ticketTel(c){
    var mort = /^(annulee|expiree|terminee|attente|appel)$/.test(c.etat);
    var u = PelyoKitchen.urgence(c, Date.now());
    var origine = c.origine === 'restaurant' ? 'Caisse' : c.canal === 'sms' ? 'SMS « comme d’hab »' : 'IA Pelyo';
    var produits = c.lignes.length ? c.lignes.map(function(l){
      return '<div class="k-sv-produit"><b>' + l.q + ' × ' + esc(l.nom) + '</b>' +
        ((l.opt || l.sup) ? '<small>' + esc([l.opt, l.sup ? '+ ' + l.sup : ''].filter(Boolean).join(' · ')) + '</small>' : '') +
        (l.allergie ? '<p class="k-sv-allergie">⚠ Allergie : ' + esc(l.allergie) + '</p>' : '') +
        (l.dem ? '<p class="k-sv-consigne">→ ' + esc(l.dem) + '</p>' : '') + '</div>';
    }).join('') : '<p class="k-sv-attente">Le client compose sa commande.</p>';
    var adresse = c.mode === 'livraison'
      ? '<button class="k-sv-adresse" data-open="' + c.id + '">' + icone('truck') + '<span>' + esc(adresseRue(c)) + (adresseVille(c) ? ', ' + esc(adresseVille(c)) : '') + '</span>' + (c.km == null ? '' : '<em>' + esc(String(c.km).replace('.', ',')) + ' km</em>') + '</button>' : '';
    var pied = mort
      ? '<p class="k-sv-bloque">' + (c.etat === 'annulee' ? 'Annulée · ne plus préparer' : c.etat === 'terminee' ? 'Commande terminée' : c.etat === 'expiree' ? 'Sans validation' : 'Ne pas préparer avant confirmation') + '</p>'
      : '<div class="k-sv-actions"><button class="k-sv-imprimer" data-imprimer="' + c.id + '" aria-label="Imprimer le ticket ' + c.id + '">' + icone('print') + '</button>' + ligneAction(c) + '</div>';
    return '<article class="k-order k-sv-ticket k-sv-' + c.etat + (u && u.late && !mort ? ' k-sv-retard' : '') + animCommande(c) + '" data-cmd="' + c.id + '">' +
      photoPlat(c) + '<span class="k-sv-bande' + ((etapeMinuteur(c) || {}).depasse ? ' k-sv-depasse' : '') + '" aria-hidden="true" data-progres="' + c.id + '"><i style="width:' + progresCommande(c) + '%"></i></span>' +
      '<div class="k-sv-haut"><button class="k-sv-num" data-open="' + c.id + '" aria-label="Détails de la commande ' + c.id + '"><small>#</small>' + c.id + '</button>' +
        '<span class="k-sv-chrono" data-minuteur="' + c.id + '">' + minuteurTicket(c) + '</span></div>' +
      '<p class="k-sv-qui">' + esc(c.client || 'Client') + ' · ' + (c.mode === 'livraison' ? 'Livraison' : 'À emporter') + ' · ' + origine + '</p>' +
      '<p class="k-sv-delai" data-deadline="' + c.id + '">' + delaiPromis(c) + '</p>' +
      calme(c) +
      (alertesCommande(c) ? '<div class="k-sv-alertes">' + alertesCommande(c) + '</div>' : '') +
      puceLivreur(c) + '<div class="k-sv-produits">' + produits + '</div>' + adresse + pied +
    '</article>';
  }
  function vueServiceTel(liste, appels, alertes){
    var onglets = FILTRES.slice(0, 3).map(function(x){
      return '<button data-filt="' + x.id + '" aria-pressed="' + (filtre === x.id) + '" class="k-sv-onglet' + (filtre === x.id ? ' on' : '') + '"><b>' + compte(x) + '</b>' + esc(x.lbl) + '</button>';
    }).join('');
    var rythme = charge === 'stop' ? 'En pause' : esc(niveau().nom) + ' · ' + (retraitOuvert ? delaiRetrait + ' min' : 'retrait fermé');
    return '<div class="k-sv-tete"><h1>Le service</h1><button class="k-sv-rythme k-sv-rythme-' + charge + '" data-vue="rythme"><i aria-hidden="true"></i>' + rythme + '</button></div>' +
      '<div class="k-filt k-sv-onglets" aria-label="Étapes des commandes">' + onglets + '</div>' + '<!--volet-->' +
      '<div class="k-body k-sv-corps">' +
        '<div class="k-sv-outils"><button class="k-sv-lien" data-urgence aria-pressed="' + triUrgence + '">' + (triUrgence ? 'Tri : heure promise' : 'Trier par urgence') + '</button>' +
          (filtre === 'fin' ? '' : '<button class="k-sv-lien" data-filt="fin">Terminées · ' + compte(FILTRES[3]) + '</button>') +
          (reel ? '' : '<button class="k-sv-lien" data-demo-arrive>+ Commande démo</button>') + '</div>' +
        (appels.length ? '<div class="k-sv-ia">' + icone('wave') + '<span><b>L’IA prend ' + (appels.length > 1 ? appels.length + ' commandes' : 'une commande') + '</b>' + appels.map(function(c){ return '<button data-open="' + c.id + '">#' + c.id + ' · ' + esc(c.client || 'Client') + ' · <span data-timer="' + c.id + '">' + ligneMinuteur(c) + '</span></button>'; }).join('') + '</span></div>' : '') +
        (alertes.length ? '<div class="k-sv-changements"><b>' + alertes.length + ' changement(s) à lire</b>' + alertes.map(function(c){ return '<button data-open="' + c.id + '">#' + c.id + ' · ' + (c.etat === 'annulee' ? 'Annulée' : 'Modifiée') + '</button>'; }).join('') + '</div>' : '') +
        (derniereAction ? '<button class="k-sv-annuler" data-undo>Commande #' + derniereAction.id + ' mise à jour · <b>Annuler</b></button>' : '') +
        (liste.length ? '<div class="k-orders k-sv-liste">' + liste.map(ticketTel).join('') + '</div>'
          : '<div class="k-sv-vide"><b>Rien à faire ici.</b><span>Les nouvelles commandes apparaîtront ici.</span></div>') +
        (reel ? '' : '<p class="k-sv-demo">Compte démo · données de démonstration</p>') +
      '</div>';
  }
  function aPreparerEtPretes(){ return compte(FILTRES[0]) + compte(FILTRES[1]) + compte(FILTRES[2]); }
  function vueService(){
    var passe = grandEcran() && filtre !== 'fin';
    var f = FILTRES.filter(function(x){ return x.id === filtre; })[0] || FILTRES[0];
    var liste = cmds.filter(f.test);
    if(triUrgence)liste.sort(function(a,b){return (a.promesseAt||Infinity)-(b.promesseAt||Infinity)||a.id-b.id;});
    var alertes=cmds.filter(function(c){return c.ackVersion<c.version;});

    var appels = cmds.filter(function(c){ return c.etat === 'appel' || c.etat === 'attente'; });
    if (!grandEcran()) return vueServiceTel(liste, appels, alertes);
    /* « L'IA prend le relais » : en tête de liste sur téléphone, en colonne
       à droite sur tablette (le passe). */
    var bandeauIa = appels.length ? '<section class="k-incoming"><div class="k-incoming-title">' + icone('wave') + '<div><b>L’IA prend le relais</b><span>' + appels.length + ' commande(s) non confirmée(s)</span></div></div>' + appels.map(function(c){ return '<button class="k-call" data-open="' + c.id + '"><span>#' + c.id + ' · ' + esc(c.client || 'Client') + '<small>' + esc(ETATS[c.etat].lbl) + '</small></span><span class="k-t" data-timer="' + c.id + '">' + ligneMinuteur(c) + '</span></button>'; }).join('') + '</section>' : '';
    return titre('LE PASSE', 'Le service.', '<div class="k-title-actions">' + (reel ? '' : '<button class="k-demo-plus" data-demo-arrive aria-label="Ajouter une commande de démonstration">+ Démo</button>') + '<button class="k-pace-pill" data-vue="rythme"><i></i>' + esc(niveau().nom) + ' ' + icone('arrow') + '</button></div>') +
    '<div class="k-service-meta"><span><b>' + aPreparer() + '</b> en production</span><span>' + (charge==='stop'?'Prises en pause':!retraitOuvert?'Retrait fermé':!livraisonOuverte?'Livraison fermée':'Retrait <b>'+delaiRetrait+' min</b>') + '</span><button class="k-meta-tri" data-urgence aria-pressed="'+triUrgence+'">'+(triUrgence?'Heure promise':'Par urgence')+'</button></div>' +
    '<div class="k-filt" aria-label="Filtrer les commandes">' +
      (grandEcran()
        ? '<button data-filt="faire" aria-pressed="' + passe + '" class="' + (passe ? 'on' : '') + '">Le passe<em>' + aPreparerEtPretes() + '</em></button>' +
          '<button data-filt="fin" aria-pressed="' + !passe + '" class="' + (passe ? '' : 'on') + '">Terminées<em>' + compte(FILTRES[3]) + '</em></button>'
        : FILTRES.map(function(x){
            return '<button data-filt="' + x.id + '" aria-pressed="' + (filtre === x.id) + '" class="' + (filtre === x.id ? "on" : "") + '">' +
              esc(x.lbl) + '<em>' + compte(x) + '</em></button>';
          }).join("")) +
    '</div>' + '<!--volet-->' +
    '<div class="k-body">' +
      (alertes.length?'<div class="k-alert-list" aria-live="polite"><b>'+alertes.length+' changement(s) à lire</b>'+alertes.map(function(c){return '<button data-open="'+c.id+'">#'+c.id+' · '+(c.etat==='annulee'?'Annulée':'Modifiée')+' ↗</button>';}).join('')+'</div>':'')+
      (derniereAction ? '<button class="k-undo" data-undo>Commande #' + derniereAction.id + ' mise à jour <b>Annuler</b></button>' : '') +
      '<div class="k-service-board' + (passe ? ' k-passe' : '') + '">' +
      (passe ? '' : bandeauIa) +
      (passe ? FILTRES.slice(0, 3).map(colonnePasse).join('')
        : liste.length ? '<div class="k-orders">' + liste.map(ligne).join('') + '</div>'
        : '<div class="k-empty">' + icone('check') + '<h2>Le passe est libre.</h2><p>Aucune commande dans cette file.<br>Les nouvelles commandes apparaîtront ici.</p></div>') +
      (passe ? bandeauIa : '') +
      '</div>' +
      (reel ? '' : '<div class="k-demo-note">Compte démo · données de démonstration</div>') +
    '</div>';
  }

  /* ------------------------------ ticket ------------------------------ */
  function ticket(c){
    if (!c) return "Aucune commande : rien à imprimer.";
    var l = [];
    l.push("      " + nomResto().toUpperCase());
    l.push("   " + infosResto().adresse);
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
    if (c.mode === 'livraison') { l.push(" [QR] LIVREUR : scanner au depart"); l.push("      puis a la livraison"); }
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
      '<span class="k-trow-n k-mono"><i aria-hidden="true">⌁</i><b>#' + c.id + '</b></span>' +
      '<span class="k-trow-c"><b>' + esc(c.client || "Non communiqué") + '</b><span>' + esc(contenu) + '</span></span>' +
      '<span class="k-trow-h">' + badgeOrigine(c) + ' ' + esc(c.date || dateCourte()) + ' · ' + esc(c.heure || "—") + '</span>' +
    '</div>';
  }

  /* ================= ÉCRANS SECONDAIRES · TÉLÉPHONE (k-pg-*) =================
     Construits comme les applis de restauration du marché (Uber Eats
     Orders, Deliveroo Hub, Square) : un grand titre, des listes à filets,
     des interrupteurs, un contrôle segmenté, des pas − / +. Pas de
     surtitres, de numérotation ni de texte d'explication. */
  function interrupteur(attr, valeur, actif, label){
    return '<button class="k-pg-switch" role="switch" aria-checked="' + !!actif + '" aria-label="' + esc(label) + '" ' + attr + '="' + esc(valeur) + '"><i></i></button>';
  }
  function pas(moins, plus, valeur, label, attrValeur){
    return '<span class="k-pg-pas"><button data-d="' + moins + '" aria-label="' + esc(label) + ' : moins">−</button><output' + (attrValeur ? ' data-tempo-valeur="' + attrValeur + '"' : '') + '>' + valeur + '</output><button data-d="' + plus + '" aria-label="' + esc(label) + ' : plus">+</button></span>';
  }

  /* Sur Carte et Rythme, un interrupteur ou un − / + ne repeint que le
     contenu de la page : la zone qui défile reste la même, rien ne saute. */
  function peindrePage(){
    var b = !grandEcran() && !ops && !ouverte && !ticketOuvert && !triOuvert && root.querySelector('.k-body.k-pg');
    var html = !b ? null : vue === 'ruptures' ? corpsCarteTel() : vue === 'rythme' ? corpsRythmeTel() : null;
    if (html === null) { peindre(); return; }
    b.innerHTML = html;
  }

  function vueTicketsTel(){
    var h = ticketsHistorique();
    var tris = [['recent', 'Récents'], ['ancien', 'Anciens'], ['nom', 'Par nom']];
    return titre('', 'Tickets', '<span class="k-pg-compte">' + h.length + '</span>') +
      '<div class="k-body k-pg">' +
        '<form class="k-pg-recherche" data-search-form role="search">' + icone('search') + '<input type="search" data-search data-search-live aria-label="Rechercher un ticket" placeholder="Nom, numéro ou produit" value="' + esc(recherche) + '"></form>' +
        '<div class="k-pg-segment" role="tablist">' + tris.map(function(t){ return '<button role="tab" aria-selected="' + (triHistorique === t[0]) + '" data-tri="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' +
        (h.length ? '<div class="k-pg-liste">' + h.map(function(c){
          var contenu = c.lignes.length ? c.lignes.map(function(l){ return l.q + '× ' + l.nom; }).join(', ') : '—';
          return '<button class="k-pg-tk" data-voirticket="' + c.id + '">' +
            '<span class="k-pg-tk-g"><b>' + c.id + '</b><small>' + esc(c.heure || '—') + '</small></span>' +
            '<span class="k-pg-tk-m"><b>' + esc(c.client || 'Client') + '</b><small>' + esc(contenu) + '</small></span>' +
            '<span class="k-pg-tk-d"><b>' + eur(total(c)) + '</b><small>' + (c.origine === 'restaurant' ? 'Caisse' : 'IA') + (imprimes[c.id] ? ' · imprimé' : '') + '</small></span></button>';
        }).join('') + '</div>'
          : '<p class="k-pg-vide">' + (recherche ? 'Aucun ticket pour « ' + esc(recherche) + ' ».' : 'Aucun ticket pour l’instant.') + '</p>') +
      '</div>';
  }

  function vueCarteTel(){
    return titre('', 'Carte', '<button class="k-pg-lien" data-ops="menu">Aperçu</button>') +
      '<div class="k-body k-pg">' + corpsCarteTel() + '</div>';
  }
  function corpsCarteTel(){
    var actifs = ruptActives(), off = actifs.length;
    var derniers = ruptChat.slice(1).slice(-2);  // sans le message d'accueil
    return '<p class="k-pg-etat' + (off ? ' k-pg-etat-off' : '') + '"><i></i>' + (off ? off + ' indisponible' + (off > 1 ? 's' : '') : 'Tout est disponible') + '</p>' + PelyoModules.html('cuisine.carte') +
        '<div class="k-pg-assistant">' +
          '<div class="k-pg-champ"><input data-chatinp aria-label="Dire ce qui manque" value="' + esc(brouillon) + '" autocomplete="off" placeholder="Ex. : plus de tacos M ce soir">' +
            '<button class="k-pg-icone' + (ruptEcoute ? ' on' : '') + '" data-mic aria-label="Dicter">' + (ruptEcoute ? '···' : icone('mic')) + '</button>' +
            '<button class="k-pg-icone k-pg-orange" data-send aria-label="Envoyer">' + icone('arrow') + '</button></div>' +
          (derniers.length ? '<div class="k-pg-echange">' + derniers.map(bulle).join('') + '</div>' : '') +
        '</div>' +
        (off ? '<h2 class="k-pg-section">Indisponible</h2><div class="k-pg-liste">' + actifs.map(function(x){
          return '<div class="k-pg-ligne"><span class="k-pg-ligne-t"><b>' + esc(x.nom) + '</b></span><button class="k-pg-lien" data-unrupt="' + esc(x.id) + '">Remettre</button></div>';
        }).join('') + '</div>' : '') +
        carte().map(function(cat){
          var catCoupee = !!catOff[cat.cat];
          return '<div class="k-pg-cat"><h2 class="k-pg-section">' + esc(cat.cat) + '</h2>' + interrupteur('data-toggle-cat', cat.cat, !catCoupee, 'Catégorie ' + cat.cat + ' disponible') + '</div>' +
            '<div class="k-pg-liste' + (catCoupee ? ' k-pg-grise' : '') + '">' + cat.items.map(function(it){
              var dispo = !stockEffectif(it, cat.cat);
              return '<div class="k-pg-ligne"><span class="k-pg-ligne-t"><b>' + esc(it.nom) + '</b><small>' + eur(it.prix) + (bloqueParIngredient(it.id) ? ' · ingrédient manquant' : '') + '</small></span>' +
                interrupteur('data-toggle-stock', String(it.id), dispo, it.nom + ' disponible') + '</div>';
            }).join('') + '</div>';
        }).join('') +
        '<div class="k-pg-liste k-pg-fin"><button class="k-pg-ligne k-pg-nav" data-ops="stock"><span class="k-pg-ligne-t"><b>Suppléments et ingrédients</b></span>' + icone('arrow') + '</button></div>';
  }

  function vueRythmeTel(){
    return titre('', 'Rythme', '') + '<div class="k-body k-pg">' + corpsRythmeTel() + '</div>';
  }
  function corpsRythmeTel(){
    var lv = niveau(), n = chargeEnCours(), pause = charge === 'stop';
    var niveaux = [['normal', 'Normal'], ['rush', 'Rush'], ['charge', 'Très chargé']];
    return '<div class="k-pg-liste">' +
          '<div class="k-pg-ligne"><span class="k-pg-ligne-t"><b>Prendre des commandes</b><small>' + (pause ? 'En pause : l’IA indique l’heure de reprise' : 'L’IA prend les appels') + '</small></span>' +
            interrupteur('data-charge', pause ? 'normal' : 'stop', !pause, 'Prendre des commandes') + '</div>' +
        '</div>' +
        '<h2 class="k-pg-section">Affluence</h2>' +
        '<div class="k-pg-segment' + (pause ? ' k-pg-grise' : '') + '" role="tablist">' + niveaux.map(function(x){ return '<button role="tab" aria-selected="' + (charge === x[0]) + '" data-charge="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>' +
        '<p class="k-pg-aide">' + esc(pause ? 'Aucune nouvelle commande tant que la prise est en pause.' : lv.dit) + '</p>' +
        '<h2 class="k-pg-section">Délais annoncés</h2>' +
        '<div class="k-pg-liste">' +
          '<div class="k-pg-ligne"><span class="k-pg-ligne-t"><b>Retrait</b><small>Annoncé : ' + annonceRetrait() + ' min</small></span>' + pas('retrait-', 'retrait+', delaiRetrait + ' min', 'Délai retrait', 'retrait') + '</div>' +
          '<div class="k-pg-ligne"><span class="k-pg-ligne-t"><b>Livraison</b><small>Annoncé : ' + annonceLivraison() + ' min</small></span>' + pas('liv-', 'liv+', delaiLivraison + ' min', 'Délai livraison', 'livraison') + '</div>' +
        '</div>' +
        '<h2 class="k-pg-section">Canaux</h2>' +
        '<div class="k-pg-liste">' +
          '<div class="k-pg-ligne"><span class="k-pg-ligne-t"><b>Retrait au comptoir</b></span>' + interrupteur('data-channel', 'retrait', retraitOuvert, 'Retrait ouvert') + '</div>' +
          '<div class="k-pg-ligne"><span class="k-pg-ligne-t"><b>Livraison</b></span>' + interrupteur('data-channel', 'livraison', livraisonOuverte, 'Livraison ouverte') + '</div>' +
        '</div>' +
        PelyoModules.html('cuisine.rythme') +
        '<h2 class="k-pg-section">Retards</h2>' +
        '<div class="k-pg-liste">' +
          '<div class="k-pg-ligne"><span class="k-pg-ligne-t"><b>Prévenir le client d’un retard</b><small>' + (retards.actif ? 'Avant l’heure promise, sans rien faire' : 'Désactivé') + '</small></span>' + interrupteur('data-retards', 'actif', retards.actif, 'Prévenir le client d’un retard') + '</div>' +
        '</div>' +
        '<div class="' + (retards.actif ? '' : 'k-pg-grise') + '">' +
          '<p class="k-pg-aide">À partir de</p><div class="k-pg-segment">' + [5, 10, 15].map(function(m){ return '<button role="tab" aria-selected="' + (retards.seuil === m) + '" data-retards-seuil="' + m + '">' + m + ' min</button>'; }).join('') + '</div>' +
          '<p class="k-pg-aide">Comment</p><div class="k-pg-segment">' + [['sms', 'SMS'], ['appel', 'Appel de l’IA']].map(function(x){ return '<button role="tab" aria-selected="' + (retards.canal === x[0]) + '" data-retards-canal="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>' +
          '<p class="k-pg-aide">Geste</p><div class="k-pg-segment">' + [['boisson', 'Boisson offerte'], ['remise', '−10 %'], ['aucun', 'Sans geste']].map(function(x){ return '<button role="tab" aria-selected="' + (retards.geste === x[0]) + '" data-retards-geste="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>' +
          '<p class="k-pg-aide">Exemple : « ' + esc(texteRetard({id:252, promesseAt:Date.now() + 20 * 60000}, retards.seuil)) + ' »</p>' +
        '</div>' +
        '<h2 class="k-pg-section">Capacité</h2>' +
        '<div class="k-pg-liste">' +
          '<div class="k-pg-ligne"><span class="k-pg-ligne-t"><b>Commandes en même temps</b><small>' + n + ' en cours</small></span>' + pas('cap-', 'cap+', capacite, 'Capacité', 'capacite') + '</div>' +
        '</div>' +
        '<p class="k-pg-aide">Au téléphone : « ' + esc(phraseIA()) + ' »</p>';
  }

  function overlayTicketTel(c){
    var imp = imprimes[c.id];
    return '<div class="k-over k-sd k-pg-ticket">' +
      '<header class="k-sd-tete"><button class="k-sd-retour" data-fermer-ticket>‹ Retour</button><span class="k-sd-heure">Ticket ' + c.id + '</span></header>' +
      '<div class="k-sd-corps"><pre class="k-pg-recu">' + esc(ticket(c)) + '</pre>' +
      '<p class="k-sd-note">' + (c.origine === 'restaurant' ? 'Saisie au restaurant' : 'Prise par l’IA Pelyo') + ' · ' + esc(c.date || '') + ' ' + esc(c.heure || '') + (imp ? ' · déjà imprimé' : '') + '</p></div>' +
      (c.mode === 'livraison' && c.etat !== 'annulee' ? '<div class="k-pg-scan"><p>Démo : le livreur scanne le QR du ticket</p><span>' +
        (!c.departAt ? '<button class="k-pg-bouton k-pg-bouton-o" data-scan-parti="' + c.id + '">Scan au départ</button>' : !c.arriveeAt ? '<button class="k-pg-bouton k-pg-bouton-o" data-scan-livre="' + c.id + '">Scan à la livraison</button>' : '<b>Livrée à ' + PelyoKitchen.hhmm(c.arriveeAt) + '</b>') +
        '</span></div>' : '') +
      '<footer class="k-sd-pied"><button class="k-sd-ticket" data-telecharger="' + c.id + '" aria-label="Télécharger">' + icone('download') + '</button><button class="k-sd-go" data-imprimer="' + c.id + '">' + (imp ? 'Réimprimer' : 'Imprimer') + '</button></footer>' +
    '</div>';
  }

  function vueTickets(){
    if (!grandEcran()) return vueTicketsTel();
    var historique = ticketsHistorique();
    var triActuel = TRIS.filter(function(t){ return t.id === triHistorique; })[0];
    return titre('LA MÉMOIRE DU SERVICE', 'Les tickets.', '<span class="k-total-count">' + historique.length + '</span>') +
    '<form class="k-search" data-search-form>' + icone('search') + '<input type="search" data-search aria-label="Rechercher un ticket" placeholder="Un nom, un numéro, un produit…" value="' + esc(recherche) + '"><button type="submit">Chercher</button></form>' + '<div class="k-tikhead">' +
      '<button class="k-btn2" data-tri-ouvrir>Trier · ' + esc(triActuel.lbl) + '</button>' +
    '</div>' +
    '<div class="k-body">' +
      (historique.length ? historique.map(ligneTicket).join("")
        : '<div class="k-empty">' + (recherche ? 'Aucun ticket ne correspond à cette recherche.<br>Essayez un autre nom, numéro ou produit.' : 'Aucun ticket pour l\'instant.') + '</div>') +
    '</div>';
  }

  function overlayTri(){
    return '<div class="k-over k-sort-detail">' +
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
    if (!grandEcran()) return overlayTicketTel(c);
    var imp = imprimes[c.id];
    return '<div class="k-over k-ticket-detail">' +
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
      { k:"Impression auto",      v:impressionAuto ? (reel ? "Activée · dès que l’imprimante sera reliée" : "Activée (démo)") : "Désactivée", a:"auto" },
      { k:"Annulations",          v:impressionAnnulations ? (reel ? "Imprimées" : "Imprimées (démo)") : "Non imprimées", a:"ann" },
      { k:"Imprimante",           v:reel ? "Pas encore reliée" : "Epson TM-m30 · comptoir", a:"imp" },
      { k:"Test",                 v:"Envoyer une ligne de test",          a:"test" }
    ];
    return titre('LE POSTE DE CUISINE','Réglages.','')+
      '<div class="k-pane k-settings-page">'+
      '<p class="k-settings-intro">Tout est rangé par usage. Ouvrez uniquement la catégorie dont vous avez besoin.</p>'+
      '<details class="k-settings-group" data-settings-group="service"><summary><span><small>01 / LE SERVICE</small><b>Service et alertes</b><em>Rythme, disponibilité, son</em></span><i aria-hidden="true">⌄</i></summary><div class="k-settings-content">'+
      '<button class="k-settings-row" data-vue="rythme"><span><b>Rythme du service</b><small>Rush, délais et canaux disponibles</small></span>'+icone('arrow')+'</button>'+
      '<button class="k-settings-row" data-reg="son"><span><b>Alerte sonore</b><small>'+(son?'Active':'Coupée')+'</small></span>'+icone('arrow')+'</button>'+
      '<p class="k-settings-sous">Suivi client</p>'+
      [['papier','Cuisine au papier','Sans écran : seul le livreur scanne le ticket'],['smsPrete','SMS « commande prête »','En plus du lien de suivi'],['smsRoute','SMS « en route »','Quand le livreur part']].map(function(x){return '<div class="k-settings-row k-minuteur-reg"><span><b>'+x[1]+'</b><small>'+x[2]+'</small></span>'+interrupteur('data-suivi',x[0],suivi[x[0]],x[1])+'</div>';}).join('')+
      '<p class="k-settings-note">Le lien de suivi part toujours avec le SMS de confirmation.</p>'+
      '<p class="k-settings-sous">Minuteurs des commandes</p>'+
      MINUTEURS.map(function(m){return '<div class="k-settings-row k-minuteur-reg"><span><b>'+m[1]+'</b><small>'+m[2]+'</small></span><span class="k-pas"><button data-minuteur-reg="'+m[0]+':-1" aria-label="'+m[1]+' : une minute de moins">−</button><b>'+minuteurs[m[0]]+' min</b><button data-minuteur-reg="'+m[0]+':1" aria-label="'+m[1]+' : une minute de plus">+</button></span></div>';}).join('')+
      '</div></details>'+
      
'<details class="k-settings-group" data-settings-group="tickets"><summary><span><small>02 / LES TICKETS</small><b>Tickets et imprimante</b><em>Impression, annulations, test</em></span><i aria-hidden="true">⌄</i></summary><div class="k-settings-content">'+
      impression.map(function(r){return '<button class="k-settings-row" data-reg="'+r.a+'"><span><b>'+esc(r.k)+'</b><small>'+esc(r.v)+'</small></span>'+icone('arrow')+'</button>';}).join('')+'</div></details>'+
      
'<details class="k-settings-group" data-settings-group="balance"><summary><span><small>03 / LA BALANCE</small><b>Balance de portions</b><em>Pesée guidée des commandes</em></span><i aria-hidden="true">⌄</i></summary><div class="k-settings-content">'+
      '<button class="k-settings-row" data-ops="balance"><span><b>'+(reel?'Balance de portions':PelyoBalance.lire().balance.reliee?'Balance reliée':'Relier la balance')+'</b><small>'+(reel?'Bientôt disponible avec un compte connecté':PelyoBalance.lire().balance.reliee?(PelyoBalance.lire().balance.simulee?'Balance de démonstration':esc(PelyoBalance.lire().balance.nom))+' · pesée '+(PelyoBalance.lire().reglages.guidee?'guidée':'désactivée'):'A&D SJ-6000WP-BT ou balance de démonstration')+'</small></span>'+icone('arrow')+'</button>'+
      '<p class="k-settings-disclaimer">Les grammages et l’ordre de pesée se règlent dans Pelyo Gérant, Gestion → Balance de portions.</p></div></details>'+
      
'<details class="k-settings-group" data-settings-group="connexions"><summary><span><small>04 / LE MATÉRIEL</small><b>Caisse et connexions</b><em>État des liaisons et commandes</em></span><i aria-hidden="true">⌄</i></summary><div class="k-settings-content"><button class="k-settings-row" data-ops="connections"><span><b>État et opérations en attente</b><small>'+(reel?'Internet, imprimante et caisse':'Caisse et imprimante simulées dans la maquette')+'</small></span>'+icone('arrow')+'</button>'+(reel?'':'<button class="k-settings-row" data-import-caisse><span><b>Tester une commande caisse</b><small>Simulation sans doublon</small></span>'+icone('arrow')+'</button>')+'</div></details>'+
      
'<details class="k-settings-group" data-settings-group="livreur"><summary><span><small>05 / LIVRAISON</small><b>Mode livreur</b><em>Pour le téléphone d’un livreur</em></span><i aria-hidden="true">⌄</i></summary><div class="k-settings-content">'+
      '<button class="k-settings-row" data-ops="livreur"><span><b>Passer ce téléphone en mode livreur</b><small>'+(reel?'Bientôt disponible avec un compte connecté':'Avec le code affiché chez le gérant')+'</small></span>'+icone('arrow')+'</button>'+
      '<p class="k-settings-disclaimer">Le téléphone sera verrouillé : il ne verra que les livraisons, sans rien pouvoir modifier. Seul le gérant pourra le libérer.</p></div></details>'+
      
'<details class="k-settings-group" data-settings-group="espace"><summary><span><small>06 / MON ESPACE</small><b>Compte et apparence</b><em>Restaurant associé et affichage</em></span><i aria-hidden="true">⌄</i></summary><div class="k-settings-content">'+
      '<button class="k-settings-row" data-info="compte"><span><b>Mon compte cuisine</b><small>Équipe cuisine · '+esc(nomResto())+'</small></span>'+icone('arrow')+'</button>'+
      '<div class="k-theme-setting"><span><b>Apparence</b><small>Choisissez le confort de lecture</small></span><div class="k-theme-choices" role="group" aria-label="Choix de l’apparence"><button data-theme="light" aria-pressed="'+(theme==='light')+'">Clair</button><button data-theme="dark" aria-pressed="'+(theme==='dark')+'">Sombre</button></div></div></div></details>'+
      
'<details class="k-settings-group" data-settings-group="informations"><summary><span><small>07 / PELYO</small><b>Informations et aide</b><em>Documents et assistance</em></span><i aria-hidden="true">⌄</i></summary><div class="k-settings-content">'+
      '<button class="k-settings-row" data-aide><span><b>Centre d’aide</b><small>L’assistant Pelyo répond en direct</small></span>'+icone('arrow')+'</button>'+
      [['confidentialite','Confidentialité'],['mentions','Mentions légales'],['conditions','Conditions d’utilisation']].map(function(i){return '<button class="k-settings-row" data-info="'+i[0]+'"><span><b>'+i[1]+'</b><small>Voir les informations</small></span>'+icone('arrow')+'</button>';}).join('')+
      '<p class="k-settings-disclaimer">Textes définitifs et coordonnées de la société à publier avant la mise en service.</p>'+
      // Crédits exigés par les licences CC BY-SA des deux photos de tacos français.
      '<details class="k-credits"><summary>Crédits photos</summary><p>Photos de plats libres de droits (CC0), sauf : « Tacos français » par Colovia, <a href="https://creativecommons.org/licenses/by-sa/4.0" target="_blank" rel="noopener">CC BY-SA 4.0</a> ; « French tacos from French Tacos on London Road » par bob walker, <a href="https://creativecommons.org/licenses/by-sa/2.0" target="_blank" rel="noopener">CC BY-SA 2.0</a>. Photos recadrées. Source : Wikimedia Commons.</p></details></div></details>'+
      '<div class="k-settings-foot"><span>'+(reel?'Pelyo cuisine · '+esc(nomResto()):'Pelyo cuisine · maquette')+'</span><button data-exit-demo>'+(reel?'Fermer la cuisine':'Quitter la démo')+'</button></div></div>';
  }

  /* ------------------------------ ruptures ------------------------------ */
  /* Plus de liste exhaustive du menu à cocher produit par produit : un
     chatbot reçoit l'info (à l'écrit ou dictée), reconnaît le ou les
     produits cités et applique la rupture — ou la lève — lui-même. Les
     chips au-dessus du fil ne servent qu'à voir d'un coup d'œil ce qui est
     actuellement fermé, et à l'annuler en un geste en cas d'erreur. */
  function trouverProduit(id){
    for (var i = 0; i < carte().length; i++)
      for (var j = 0; j < carte()[i].items.length; j++)
        if (String(carte()[i].items[j].id) === String(id)) return carte()[i].items[j];
    return null;
  }

  function ruptActives(){
    var l = [];
    carte().forEach(function(cat){
      if (catOff[cat.cat]) l.push({ id:"cat:" + cat.cat, nom:cat.cat });
      else cat.items.forEach(function(it){ if (rupt[it.id]) l.push({ id:"it:" + it.id, nom:it.nom }); });
    });
    listeSupplements().forEach(function(s){if(supOff[s.id])l.push({id:'s:'+s.id,nom:s.nom+' (supplément)'});});
    ingredientsCarte().forEach(function(i){if(ingredientOff[i.id])l.push({id:'i:'+i.id,nom:i.nom+' (ingrédient)'});});
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
    peindrePage();
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
    carte().forEach(function(cat){
      cat.items.forEach(function(it){
        if (n.indexOf(api.norm(it.nom)) !== -1) itemsT.push({ item:it, cat:cat });
      });
    });
    carte().forEach(function(cat){
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
    return carte().map(function(cat){
      return { cat:cat.cat, items:cat.items.map(function(it){ return { id:String(it.id), nom:it.nom }; }) };
    });
  }

  function etatActuel(){
    var catsOff = [], prodOff = [];
    carte().forEach(function(cat){
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
    categories.forEach(function(c){ if (c && typeof c.off === 'boolean' && carte().some(function(cat){ return cat.cat === c.nom; })) setStock('c',c.nom,c.off); });
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
    if (reel && (!menuReel || !menuReel.length)) return titre('DISPONIBILITÉS', 'À la carte.', '') + '<div class="k-pane">' + carteVide() + '</div>';
    if (!grandEcran()) return vueCarteTel();
    var actifs = ruptActives();
    return titre('DISPONIBILITÉS', 'À la carte.', '<button class="k-total-count" data-ops="ruptures-active">' + actifs.length + '<small>ruptures</small></button>') + '<div class="k-chat">' +
      '<button class="k-carte-voir" data-ops="menu"><span>' + icone('ruptures') + '</span><span><b>Voir la carte</b><small>Le menu tel que vos clients le découvrent</small></span><i>'+icone('arrow')+'</i></button>' +
      '<section class="k-rupt-now"><h3>En rupture maintenant<em>' + actifs.length + '</em></h3>' +
        (actifs.length ? '<div class="k-rupt-chips">' + actifs.map(function(x){ return '<button data-unrupt="' + esc(x.id) + '"><span>' + esc(x.nom) + '</span><b>Remettre</b></button>'; }).join('') + '</div>'
          : '<p>Tout est disponible.</p>') + '</section>' +
      '<div class="k-msgs">' + ruptChat.map(bulle).join("") + '</div>' +
      '<div class="k-chatbar">' +
        '<input class="k-chatinp" data-chatinp aria-label="Message à l’assistant de disponibilité" value="' + esc(brouillon) + '" autocomplete="off" placeholder="Il n’y a plus de tacos M…">' +
        '<button class="k-send" data-send aria-label="Envoyer le message">' + icone('arrow') + '</button>' +
        '<button class="k-mic' + (ruptEcoute ? " on" : "") + '" data-mic aria-label="Simuler une dictée vocale">' + (ruptEcoute ? "···" : icone('mic')) + '</button>' +
      '</div>' +
      '<button class="k-stock-access" data-ops="stock"><b>+</b> Gérer les ruptures à la main</button>' +
    '</div>';
  }

  /* ------------------------------- rythme ------------------------------- */
  /* ============================ mode livreur ============================
     Le téléphone du livreur entre le code que le gérant affiche ; une fois
     le mode activé par le gérant, l'appareil est verrouillé : il ne voit que
     ses livraisons, ne peut rien modifier, et suit la tournée calculée par
     l'assistant. Seuls gestes : « Récupérées » au restaurant et « Livrée »
     chez le client, que le GPS propose à l'arrivée. */
  var MOI_LIVREUR = 'pelyo:livreur:moi';
  var livreur = null, posLivreur = null, verifies = {}, invitationsIgnorees = {}, trajetSimule = null, planCourant = null, dernierRepeintLivreur = 0;
  function lireLivreur(){ try { livreur = JSON.parse(localStorage.getItem(MOI_LIVREUR) || 'null'); } catch(e){ livreur = null; } }
  function garderLivreur(){ try { if (livreur) localStorage.setItem(MOI_LIVREUR, JSON.stringify(livreur)); else localStorage.removeItem(MOI_LIVREUR); } catch(e){} }
  function modeLivreur(){ return !!(livreur && livreur.statut === 'actif'); }
  function heureCourte(ms){ return PelyoKitchen.hhmm(ms); }
  function dansMin(ms){ var m = Math.round((ms - Date.now()) / 60000); return m <= 0 ? 'maintenant' : 'dans ' + m + ' min'; }

  /* Ce que la soirée apprend, pour que les délais suivent la réalité :
     - temps de préparation : médiane des 10 dernières commandes (de
       « Commencer » à « Prête ») ;
     - nombre de commandes préparées en même temps : le maximum constaté ;
     - trajets : écart entre l'arrivée prévue au départ du livreur et son
       arrivée réelle chez le client (GPS), sur les 8 dernières livraisons. */
  var appris = {postes:0, facteur:1.15, remise:3};
  function dureePrep(){
    var d = cmds.filter(function(c){ return c.preteAt && c.commenceAt && c.preteAt > c.commenceAt; })
      .sort(function(a, b){ return a.preteAt - b.preteAt; }).slice(-10).map(function(c){ return c.preteAt - c.commenceAt; }).sort(function(a, b){ return a - b; });
    return d.length >= 3 ? Math.min(60, Math.max(3, d[Math.floor(d.length / 2)] / 60000)) * 60000 : 12 * 60000;
  }
  function apprendre(){
    appris.postes = Math.max(appris.postes, cmds.filter(function(c){ return c.etat === 'preparation'; }).length);
    var r = cmds.filter(function(c){ return c.arriveeAt && c.departAt && c.prevuArrivee; })
      .sort(function(a, b){ return a.arriveeAt - b.arriveeAt; }).slice(-8).map(function(c){ return (c.facteurDepart || 1) * (c.arriveeAt - c.departAt) / Math.max(60000, c.prevuArrivee - c.departAt); }).sort(function(a, b){ return a - b; });
    if (r.length >= 3) appris.facteur = Math.min(1.8, Math.max(1, r[Math.floor(r.length / 2)]));
  }
  /* Commandes passées en « Prête » par minute sur la dernière demi-heure
     (au moins 4 pour s'y fier). */
  function debitCuisine(now){
    var faites = cmds.filter(function(c){ return c.preteAt && c.preteAt > now - 30 * 60000; });
    if (faites.length < 4) return 0;
    var premiere = Math.min.apply(null, faites.map(function(c){ return c.preteAt; }));
    return faites.length / Math.max(10, Math.min(30, (now - premiere) / 60000));
  }
  function etatCuisine(now){
    return PelyoTournee.estimerCuisine({maintenant:now, dureePrep:dureePrep(), postes:appris.postes || 2, debit:debitCuisine(now),
      commandes:cmds.filter(function(c){ return c.etat === 'confirmee' || c.etat === 'preparation'; }).map(function(c){ return {id:c.id, etat:c.etat, recueAt:c.recueAt || c.promesseAt || now, commenceAt:c.commenceAt}; })});
  }
  /* Délai de retrait estimé maintenant, d'après la file de la cuisine. */
  function delaiCuisine(){ var now = Date.now(); return PelyoTournee.annoncer((etatCuisine(now).nouvelle - now) / 60000, 'retrait'); }
  /* Prête quand ? Déjà prête : depuis son passage en « Prête ». Sinon,
     d'après la file d'attente réelle de la cuisine. */
  var cuisineCache = null;
  function pretEstime(c, now){
    if (c.etat === 'prete') return Math.min(now, c.preteAt || now);
    return Math.max(now + 60000, (cuisineCache && cuisineCache[c.id]) || now + dureePrep());
  }
  function livreursActifs(){ return PelyoTournee.registre().livreurs.filter(function(l){ return l.statut === 'actif'; }); }
  function aLivrer(){ return cmds.filter(function(c){ return c.mode === 'livraison' && (c.etat === 'confirmee' || c.etat === 'preparation' || c.etat === 'prete'); }); }
  function entreeTournees(now){
    cuisineCache = etatCuisine(now);
    return {maintenant:now, facteur:appris.facteur, remise:appris.remise};
  }
  function planLivraisons(){
    var now = Date.now(), base = entreeTournees(now), livs = livreursActifs().map(function(l){
      var moi = livreur && l.id === livreur.id;
      return {id:l.id, nom:l.nom, pos:(moi && posLivreur) || l.pos || PelyoTournee.RESTO, simule:l.simule};
    });
    var plan = PelyoTournee.planifier({maintenant:now, facteur:base.facteur, remise:base.remise, livreurs:livs, commandes:aLivrer().map(function(c){
      return {id:c.id, pos:PelyoTournee.positionCommande(c), pret:pretEstime(c, now), livreur:c.livreur || null, enMain:!!c.enMain && c.etat === 'prete'};
    })});
    plan.livreurs = livs;
    return plan;
  }
  /* Au départ du livreur : l'heure d'arrivée prévue chez chaque client, pour
     la comparer ensuite à l'arrivée réelle (calibrage des trajets). */
  function noterDepart(ids, livreurId){
    var now = Date.now(), plan = planLivraisons();
    ((plan.parLivreur[livreurId] || {}).etapes || []).forEach(function(e){
      if (e.type === 'livrer' && ids.indexOf(e.commande) !== -1){ var c = commande(e.commande); if (c){ c.departAt = now; c.prevuArrivee = e.arrivee; c.facteurDepart = appris.facteur; } }
    });
  }
  function nomLivreur(id){ var l = livreursActifs().filter(function(x){ return x.id === id; })[0]; return l ? l.nom : ''; }
  /* Pastille sur les commandes en livraison (écran normal de la cuisine). */
  function puceLivreur(c){
    if (c.mode !== 'livraison' || !planCourant) return '';
    var id = planCourant.attribution[c.id];
    if (!id) return '';
    var depart = null;
    (planCourant.parLivreur[id].etapes || []).forEach(function(e){ if (e.type === 'recuperer' && e.commandes.indexOf(c.id) !== -1 && depart === null) depart = e.a; });
    return '<span class="k-puce-livreur' + (c.enMain ? ' k-en-route' : '') + '">' + icone('truck') + esc(nomLivreur(id)) + (c.enMain ? ' · en route' : depart ? ' · départ ' + heureCourte(depart) : '') + '</span>';
  }
  /* Délai d'une livraison commandée maintenant, d'après les tournées. */
  function delaiTournee(){
    var livs = livreursActifs();
    if (!livs.length) return null;
    var now = Date.now(), plan = planLivraisons();
    var prep = Math.max(1, (cuisineCache.nouvelle - now) / 60000);
    var arrivee = PelyoTournee.estimerNouvelle({maintenant:now, facteur:appris.facteur, remise:appris.remise, livreurs:plan.livreurs, commandes:aLivrer().map(function(c){
      return {id:c.id, pos:PelyoTournee.positionCommande(c), pret:pretEstime(c, now), livreur:c.livreur || null, enMain:!!c.enMain && c.etat === 'prete'};
    })}, prep);
    return arrivee ? PelyoTournee.annoncer((arrivee - now) / 60000, 'livraison') : null;
  }

  /* Ce que le GPS propose : à l'arrivée au resto, prendre les commandes
     prêtes qui lui reviennent ; chez un client, confirmer la livraison. */
  function invitationLivreur(plan){
    if (!posLivreur) return null;
    var now = Date.now();
    function ignoree(cle){ return invitationsIgnorees[cle] && now - invitationsIgnorees[cle] < 120000; }
    if (PelyoTournee.proche(posLivreur, PelyoTournee.RESTO, 80)){
      var aPrendre = cmds.filter(function(c){ return plan.attribution[c.id] === livreur.id && c.etat === 'prete' && !c.enMain; });
      var cle = 'r:' + aPrendre.map(function(c){ return c.id; }).join(',');
      if (aPrendre.length && !ignoree(cle)) return {type:'recuperer', commandes:aPrendre, cle:cle};
    }
    var chez = cmds.filter(function(c){ return c.enMain && c.livreur === livreur.id && c.etat === 'prete' && PelyoTournee.proche(posLivreur, PelyoTournee.positionCommande(c), 80); })[0];
    if (chez && !chez.arriveeAt) chez.arriveeAt = now;
    if (chez && !ignoree('l:' + chez.id)) return {type:'livrer', commande:chez, cle:'l:' + chez.id};
    return null;
  }

  function lienNav(c, adresse){
    var l = PelyoTournee.liensNavigation(c || {adresse:adresse});
    return '<div class="k-lv-nav"><a class="k-lv-maps" href="' + esc(l.maps) + '" target="_blank" rel="noopener">Google Maps</a><a class="k-lv-waze" href="' + esc(l.waze) + '" target="_blank" rel="noopener">Waze</a></div>';
  }
  function etiquetteEtape(e){
    if (e.type === 'retour') return {titre:'Retour au restaurant', detail:'Arrivée ' + heureCourte(e.arrivee), heure:e.arrivee};
    if (e.type === 'attendre'){
      var pasPretes = e.commandes.map(commande).filter(function(c){ return c && c.etat !== 'prete'; }).map(function(c){ return '#' + c.id; });
      return {titre:'Attendre au restaurant', detail:(pasPretes.length ? pasPretes.join(', ') + (pasPretes.length > 1 ? ' seront prêtes' : ' sera prête') : 'Commandes bientôt prêtes') + ' vers ' + heureCourte(e.jusqua), heure:e.debut};
    }
    if (e.type === 'recuperer'){
      var cs = e.commandes.map(commande).filter(Boolean), pretes = cs.filter(function(c){ return c.etat === 'prete'; });
      var depuis = pretes.length ? Math.max(0, Math.round((Date.now() - Math.min.apply(null, pretes.map(function(c){ return c.preteAt || Date.now(); }))) / 60000)) : 0;
      return {titre:'Récupérer ' + cs.map(function(c){ return '#' + c.id; }).join(', '), detail:pretes.length === cs.length ? (depuis ? 'Prêtes depuis ' + depuis + ' min' : 'Prêtes maintenant') : pretes.length + ' sur ' + cs.length + ' prêtes', heure:e.a};
    }
    var c2 = commande(e.commande);
    return {titre:'Livrer ' + esc(c2 && c2.client || 'le client'), detail:c2 ? esc(adresseRue(c2)) + ' · arrivée ' + heureCourte(e.arrivee) : '', heure:e.arrivee, commande:c2};
  }
  function carteLivraison(c, plan){
    var enMain = c.enMain && c.livreur === livreur.id, v = verifies[c.id] || {}, total = c.lignes.length, coches = c.lignes.filter(function(l, i){ return v[i]; }).length;
    var a = c.adresseDetail || {};
    return '<article class="k-lv-cmd' + (enMain ? ' k-lv-enmain' : '') + '" data-lv-cmd="' + c.id + '">' +
      '<div class="k-lv-cmd-tete"><span class="k-mono">#' + c.id + '</span><b>' + esc(c.client || 'Client') + '</b><em class="k-lv-etat k-lv-' + (enMain ? 'route' : c.etat) + '">' + (enMain ? 'Avec toi' : c.etat === 'prete' ? 'Prête' : c.etat === 'preparation' ? 'En cuisine' : 'À préparer') + '</em></div>' +
      '<p class="k-lv-adresse">' + esc(adresseRue(c)) + (adresseVille(c) ? ', ' + esc(adresseVille(c)) : '') + (a.complement ? '<small>' + esc(a.complement) + '</small>' : '') + (a.acces ? '<small class="k-lv-acces">' + esc(a.acces) + '</small>' : '') + '</p>' +
      '<div class="k-lv-encaisser"><span>À encaisser</span><b>' + eur(total ? c.lignes.reduce(function(s, l){ return s + l.prix; }, 0) + (c.frais || 0) : c.total || 0) + '</b><small>' + esc(c.paiement || 'Paiement à la livraison') + '</small></div>' +
      '<div class="k-lv-verif"><p><b>Vérifier le sac</b><span>' + coches + ' / ' + total + '</span></p>' + c.lignes.map(function(l, i){
        return '<button class="k-lv-produit" data-lv-verif="' + c.id + ':' + i + '" aria-pressed="' + !!v[i] + '"><i aria-hidden="true"></i><span><b>' + l.q + '× ' + esc(l.nom) + '</b>' + (l.opt || l.sup ? '<small>' + esc([l.opt, l.sup ? '+ ' + l.sup : ''].filter(Boolean).join(' · ')) + '</small>' : '') + '</span></button>';
      }).join('') + (total && coches === total ? '<p class="k-lv-complet">Tout y est.</p>' : '') + '</div>' +
      lienNav(c) +
      (c.telephoneClient ? '<a class="k-lv-appel" href="tel:' + esc(c.telephoneClient.replace(/\s/g, '')) + '">Appeler le client</a>' : '') +
      (enMain ? '<button class="k-btn rdy k-lv-livree" data-lv-livree="' + c.id + '">Livrée</button>' : c.etat === 'prete' && plan.attribution[c.id] === livreur.id ? '<button class="k-btn2" data-lv-recuperer="' + c.id + '">Je l’ai récupérée</button>' : '') +
      '</article>';
  }
  function vueLivreur(){
    if (livreur.statut !== 'actif'){
      return '<div class="k-lv"><div class="k-lv-attente"><img src="assets/logo-toque.png" alt="" width="64" height="64"><h1>Demande envoyée</h1><p>Le gérant doit activer le mode livreur pour <b>' + esc(livreur.nom) + '</b> dans son appli : Gestion → Livreurs. Cet écran s’ouvrira tout seul.</p>' +
        (reel ? '' : '<button class="k-btn" data-lv-simuler-accord>Démo : simuler l’accord du gérant</button>') +
        '<button class="k-btn2" data-lv-annuler>Annuler la demande</button></div></div>';
    }
    var plan = planLivraisons(), moi = plan.parLivreur[livreur.id] || {etapes:[]}, inv = invitationLivreur(plan);
    var etapes = moi.etapes.map(etiquetteEtape), premiere = moi.etapes[0];
    var ids = [];
    moi.etapes.forEach(function(e){ (e.commandes || (e.commande ? [e.commande] : [])).forEach(function(id){ if (ids.indexOf(id) === -1) ids.push(id); }); });
    var mesCmds = ids.map(commande).filter(Boolean);
    var hero;
    if (!premiere) hero = '<h2>Rien à livrer pour l’instant</h2><p>Reste au restaurant : la prochaine livraison s’affichera ici dès qu’une commande sera prévue pour toi.</p>';
    else {
      var e0 = etapes[0];
      hero = '<span class="k-lv-quand">' + (premiere.type === 'attendre' ? 'Maintenant' : dansMin(e0.heure).replace(/^d/, 'D').replace(/^m/, 'M')) + '</span><h2>' + e0.titre + '</h2><p>' + e0.detail + '</p>' +
        (premiere.type === 'retour' ? lienNav(null, infosResto().adresse) : premiere.type === 'livrer' && e0.commande ? lienNav(e0.commande) : '');
    }
    var autres = plan.livreurs.filter(function(l){ return l.id !== livreur.id; }).map(function(l){
      var n = Object.keys(plan.attribution).filter(function(k){ return plan.attribution[k] === l.id; }).length;
      return '<span class="k-lv-autre"><i>' + esc(l.nom.charAt(0)) + '</i>' + esc(l.nom) + ' · ' + n + ' commande' + (n > 1 ? 's' : '') + ' · retour ' + heureCourte(plan.parLivreur[l.id].retour) + '</span>';
    }).join('');
    return '<div class="k-lv">' +
      '<header class="k-lv-tete"><span class="k-lv-avatar">' + esc(livreur.nom.charAt(0).toUpperCase()) + '</span><span><small>MODE LIVREUR</small><b>' + esc(livreur.nom) + '</b></span><span class="k-lv-verrou">' + icone('lock') + 'Lecture seule</span></header>' +
      '<p class="k-lv-gps"><i></i>Position partagée avec ' + esc(nomResto()) + (reel ? '' : ' · démo') + '</p>' +
      (inv ? '<div class="k-lv-invite" role="alert">' + (inv.type === 'recuperer'
        ? '<b>Tu es au restaurant</b><p>Tu prends ' + inv.commandes.map(function(c){ return '#' + c.id; }).join(', ') + ' ?</p><div><button class="k-btn" data-lv-recuperer="' + inv.commandes.map(function(c){ return c.id; }).join(',') + '">Oui, récupérées</button><button class="k-btn2" data-lv-pasencore="' + inv.cle + '">Pas encore</button></div>'
        : '<b>Tu es chez ' + esc(inv.commande.client || 'le client') + '</b><p>Commande #' + inv.commande.id + ' livrée ?</p><div><button class="k-btn rdy" data-lv-livree="' + inv.commande.id + '">Oui, livrée</button><button class="k-btn2" data-lv-pasencore="' + inv.cle + '">Pas encore</button></div>') + '</div>' : '') +
      '<section class="k-lv-hero">' + hero + (reel || !premiere ? '' : '<button class="k-lv-simuler" data-lv-simuler>' + (trajetSimule ? 'Trajet en cours…' : 'Démo : faire le trajet') + '</button>') + '</section>' +
      (etapes.length ? '<section class="k-lv-chrono"><h3>Ta tournée</h3><ol>' + etapes.map(function(e, i){
        return '<li class="' + (i === 0 ? 'k-lv-actuelle' : '') + '"><time>' + heureCourte(e.heure) + '</time><span><b>' + e.titre + '</b><small>' + e.detail + '</small></span></li>';
      }).join('') + '</ol></section>' : '') +
      (mesCmds.length ? '<section class="k-lv-liste"><h3>Tes commandes</h3>' + mesCmds.map(function(c){ return carteLivraison(c, plan); }).join('') + '</section>' : '') +
      (autres ? '<section class="k-lv-autres"><h3>Les autres livreurs</h3>' + autres + '</section>' : '') +
      '<p class="k-lv-pied">Seul le gérant peut retirer le mode livreur de ce téléphone.' + (reel ? '' : ' <button data-lv-quitter-demo>Démo : quitter le mode livreur</button>') + '</p>' +
    '</div>';
  }

  /* Le livreur n'atteint aucune autre action de l'appli. */
  function clicLivreur(ev){
    var b = ev.target.closest('button');
    if (!b) return;
    var d = b.dataset;
    if (d.lvVerif){
      var p = d.lvVerif.split(':'), id = +p[0], i = +p[1];
      verifies[id] = verifies[id] || {}; verifies[id][i] = !verifies[id][i];
      api.vibrer(6); peindre(); return;
    }
    if (d.lvRecuperer){
      var pris = [];
      d.lvRecuperer.split(',').forEach(function(x){ var c = commande(+x); if (c && c.etat === 'prete'){ c.enMain = true; c.livreur = livreur.id; pris.push(c.id); } });
      noterDepart(pris, livreur.id);
      api.vibrer(10); api.toast('Bonne route !'); retenir(); peindre(); return;
    }
    if (d.lvLivree){
      var c2 = commande(+d.lvLivree);
      if (c2 && c2.etat === 'prete'){ c2.enMain = false; avancer(c2.id, true); }
      return;
    }
    if (d.lvPasencore){ invitationsIgnorees[d.lvPasencore] = Date.now(); peindre(); return; }
    if (d.lvSimuler !== undefined){ simulerTrajet(); return; }
    if (d.lvSimulerAccord !== undefined){
      PelyoTournee.modifierRegistre(function(r){
        r.demandes = r.demandes.filter(function(x){ return x.id !== livreur.id; });
        r.livreurs.push({id:livreur.id, nom:livreur.nom, statut:'actif', depuis:Date.now(), pos:PelyoTournee.RESTO});
      });
      synchroLivreur(); peindre(); return;
    }
    if (d.lvAnnuler !== undefined || d.lvQuitterDemo !== undefined){
      var moiId = livreur.id;
      PelyoTournee.modifierRegistre(function(r){
        r.demandes = r.demandes.filter(function(x){ return x.id !== moiId; });
        r.livreurs = r.livreurs.filter(function(x){ return x.id !== moiId; });
      });
      cmds.forEach(function(c){ if (c.livreur === moiId){ c.livreur = null; c.enMain = false; } });
      livreur = null; posLivreur = null; garderLivreur(); vue = 'service'; retenir(); peindre(); return;
    }
  }

  /* Démo : le livreur roule jusqu'au prochain point de sa tournée. */
  function simulerTrajet(){
    if (trajetSimule) return;
    var plan = planLivraisons(), moi = plan.parLivreur[livreur.id];
    if (!moi || !moi.etapes.length) return;
    var e = moi.etapes[0], cible = PelyoTournee.RESTO;
    if (e.type === 'livrer') cible = PelyoTournee.positionCommande(commande(e.commande));
    var depart = posLivreur || PelyoTournee.RESTO, t0 = Date.now(), duree = 4000;
    trajetSimule = setInterval(function(){
      var k = Math.min(1, (Date.now() - t0) / duree);
      posLivreur = {lat:depart.lat + (cible.lat - depart.lat) * k, lon:depart.lon + (cible.lon - depart.lon) * k};
      if (k >= 1){ clearInterval(trajetSimule); trajetSimule = null; publierPosition(); peindre(); }
    }, 200);
    peindre();
  }
  function publierPosition(){
    if (!livreur || !posLivreur) return;
    var id = livreur.id, p = posLivreur;
    PelyoTournee.modifierRegistre(function(r){ r.livreurs.forEach(function(l){ if (l.id === id) l.pos = {lat:p.lat, lon:p.lon}; }); });
  }
  /* L'accord ou le retrait vient du gérant (registre commun). */
  function synchroLivreur(){
    if (!livreur) return false;
    var r = PelyoTournee.registre(), id = livreur.id, avant = livreur.statut;
    var actif = r.livreurs.filter(function(l){ return l.id === id && l.statut === 'actif'; })[0];
    var demande = r.demandes.filter(function(x){ return x.id === id; })[0];
    if (actif) livreur.statut = 'actif';
    else if (demande) livreur.statut = 'attente';
    else {
      api.toast(avant === 'attente' ? 'Le gérant a refusé le mode livreur.' : 'Le gérant a retiré le mode livreur de ce téléphone.');
      cmds.forEach(function(c){ if (c.livreur === id){ c.livreur = null; c.enMain = false; } });
      livreur = null; posLivreur = null; garderLivreur(); vue = 'service'; return true;
    }
    if (avant !== livreur.statut){
      garderLivreur();
      if (livreur.statut === 'actif'){ vue = 'livreur'; ops = null; ouverte = null; posLivreur = posLivreur || actif.pos || PelyoTournee.RESTO; api.toast('Mode livreur activé par le gérant.'); api.vibrer(14); }
      return true;
    }
    return false;
  }
  /* Démo : les autres livreurs roulent, récupèrent et livrent seuls ; et
     le gérant reçoit un instantané des tournées. */
  function animerTournees(){
    if (reel) return false;
    var plan = planLivraisons(), change = false, maintenant = Date.now();
    PelyoTournee.modifierRegistre(function(r){
      r.livreurs.forEach(function(l){
        if (!l.simule || l.statut !== 'actif') return;
        var e = (plan.parLivreur[l.id] || {etapes:[]}).etapes[0];
        if (!e) return;
        var cible = e.type === 'livrer' ? PelyoTournee.positionCommande(commande(e.commande)) : PelyoTournee.RESTO;
        var pos = l.pos || PelyoTournee.RESTO, d = PelyoTournee.distanceKm(pos, cible);
        if (d > 0.04){
          /* Démo accélérée : environ 60 m par seconde. */
          var k = Math.min(1, 0.06 / d);
          l.pos = {lat:pos.lat + (cible.lat - pos.lat) * k, lon:pos.lon + (cible.lon - pos.lon) * k};
          return;
        }
        if (e.type === 'recuperer' && maintenant >= e.a){
          var pris = [];
          e.commandes.forEach(function(id){ var c = commande(id); if (c && c.etat === 'prete'){ c.enMain = true; c.livreur = l.id; change = true; pris.push(id); } });
          if (pris.length) noterDepart(pris, l.id);
        }
        if (e.type === 'livrer'){
          var c2 = commande(e.commande);
          if (c2 && c2.enMain && c2.livreur === l.id){ c2.arriveeAt = c2.arriveeAt || maintenant; c2.enMain = false; c2.etat = 'terminee'; change = true; }
        }
      });
      r.instantane = {
        at:maintenant, delai:delaiTournee(),
        livreurs:plan.livreurs.map(function(l){
          var cs = Object.keys(plan.attribution).filter(function(k){ return plan.attribution[k] === l.id; }).map(function(k){ var c = commande(+k); return c ? {id:c.id, client:c.client || 'Client', enMain:!!c.enMain, pos:PelyoTournee.positionCommande(c)} : null; }).filter(Boolean);
          var e0 = (plan.parLivreur[l.id] || {etapes:[]}).etapes[0];
          return {id:l.id, nom:l.nom, commandes:cs, retour:plan.parLivreur[l.id].retour, etape:e0 ? etiquetteEtape(e0).titre.replace(/<[^>]+>/g, '') : 'Au restaurant'};
        })
      };
    });
    return change;
  }

  /* ------------------------------ rythme ------------------------------
     Un bouton de feu, comme sur un piano de cuisson : on le tourne de
     « Pause » à « Très chargé ». Tout se met à jour sur place (sans nouveau
     rendu) pour que le bouton, les chiffres et la bulle s'animent. */
  var ANGLES_TEMPO = {stop:-120, normal:-40, rush:40, charge:120};
  var TEINTES_TEMPO = {stop:'#8f8379', normal:'#3f9d6a', rush:'#e97838', charge:'#d63c22'};
  var ARC_TEMPO = 104 * (240 * Math.PI / 180);
  function remplissageTempo(angle){ return (ARC_TEMPO * (1 - (angle + 120) / 240)).toFixed(1); }
  function arcTempo(r, a0, a1){
    function pt(a){ var t = (a - 90) * Math.PI / 180; return (130 + r * Math.cos(t)).toFixed(2) + ' ' + (130 + r * Math.sin(t)).toFixed(2); }
    return 'M' + pt(a0) + ' A' + r + ' ' + r + ' 0 ' + (a1 - a0 > 180 ? 1 : 0) + ' 1 ' + pt(a1);
  }
  /* Capacité : seules comptent les commandes « À préparer » et « En cours ».
     Les prêtes (déjà faites) et les terminées ne chargent plus la cuisine. */
  /* Ce que l'IA annoncera.
     Retrait : jamais moins que le délai réglé ici, plus si la file l'exige.
     Livraison : uniquement le calcul en direct (commandes en cours et leur
     statut → heure où elle sera prête ; livreurs, ce qui leur reste à faire
     et leur retour au resto → heure de livraison). Le niveau du Rythme n'y
     entre pas. Le délai réglé ne sert que s'il n'y a aucun livreur en
     tournée. */
  function annonceRetrait(){ return Math.max(delaiRetrait, delaiCuisine()); }
  function annonceLivraison(){ return delaiTournee() || delaiLivraison; }
  function texteEstime(id){
    if (charge === 'stop') return '';
    if (id === 'retrait'){
      var a = annonceRetrait();
      return a > delaiRetrait ? '<b>Annoncé : ' + a + ' min</b> · la file de la cuisine l’exige' : 'Annoncé : ' + a + ' min';
    }
    var t = delaiTournee();
    if (!t) return 'Annoncé : ' + delaiLivraison + ' min · aucun livreur en tournée';
    if (t > 60) return '<b class="k-tempo-alerte">Livreurs débordés : ≈ ' + t + ' min.</b> Ajoutez un livreur ou fermez la livraison un moment.';
    return '<b>Annoncé : ' + t + ' min</b> · calcul en direct (commandes et livreurs)';
  }
  function chargeEnCours(){ return cmds.filter(function(c){ return c.etat === 'confirmee' || c.etat === 'preparation'; }).length; }
  /* Ce que l'IA répond au téléphone avec ces réglages (aperçu). */
  function finEstimee(c){
    var now = Date.now(), fin;
    if (c.etat === 'confirmee') fin = Math.max(now, c.lancerA ? c.lancerA : (c.recueAt || now) + minuteurs.lancer * 60000) + minuteurs.preparer * 60000;
    else if (c.etat === 'preparation') fin = Math.max(now, (c.commenceAt || now) + minuteurs.preparer * 60000);
    else return null;
    return fin + (c.mode === 'livraison' ? 15 * 60000 : 0);  // trajet moyen
  }
  function texteRetard(c, min){
    return D_.resto.nom + ' : votre commande ' + c.id + ' aura environ ' + min + ' min de retard, désolé !' +
      (retards.geste === 'boisson' ? ' On vous offre la boisson.' : retards.geste === 'remise' ? ' On vous fait −10 %.' : '') +
      ' Nouvelle heure : ' + PelyoKitchen.hhmm(c.promesseAt + min * 60000).replace(':', ' h ') + '.';
  }
  /* Prévenir ni trop tôt ni trop tard : seulement quand le retard est sûr
     (commande en préparation, ou heure promise à moins de 10 min) ; heure
     annoncée avec de la marge ; une relance au plus, si ça empire encore de
     5 min. Cuisine au papier : rien pour l'à emporter (Pelyo ne sait pas où
     en est la commande) ; en livraison, seulement après le scan de départ. */
  function retardPrevu(c){
    var now = Date.now(), fin;
    if (suivi.papier){
      if (c.mode !== 'livraison' || !c.departAt || c.arriveeAt) return null;
      fin = c.departAt + 15 * 60000;
    } else {
      if (!/^(confirmee|preparation)$/.test(c.etat)) return null;
      var sur = c.etat === 'preparation' || c.promesseAt - now < 10 * 60000;
      if (!sur) return null;
      fin = finEstimee(c);
    }
    return fin ? (fin - c.promesseAt) / 60000 : null;
  }
  function verifierRetards(){
    if (!retards.actif || reel) return;
    var now = Date.now();
    for (var i = 0; i < cmds.length; i++){
      var c = cmds[i];
      if (!c.promesseAt || c.promesseAt < now - 30 * 60000) continue;
      var r = retardPrevu(c); if (r === null) continue;
      var deja = c.retardPrevenu;
      if (deja ? (deja.fois >= 2 || r < deja.min + 5) : r < retards.seuil) continue;
      var min = Math.ceil((r + 3) / 5) * 5;  // de la marge, pour ne pas devoir reprévenir
      c.retardPrevenu = {at:now, min:min, geste:retards.geste, canal:retards.canal, fois:deja ? 2 : 1};
      if (!deja && retards.geste === 'boisson') c.lignes.push({q:1, nom:'Boisson 33 cl offerte', opt:'Geste pour le retard', dem:'', prix:0});
      api.toast('#' + c.id + ' : client ' + (deja ? 'reprévenu' : 'prévenu') + (retards.canal === 'appel' ? ' par l’IA' : ' par SMS') + ', environ ' + min + ' min de retard.');
      retenir();
      if (vue === 'service' && !ouverte && !ops && !ticketOuvert) peindre();
      return;  // un client à la fois
    }
  }
  /* Étiquettes d'une commande : retard prévenu (base), puis celles des modules. */
  function calme(c){
    return (c.retardPrevenu ? '<p class="k-sv-calme k-sv-prevenu">Client prévenu · +' + c.retardPrevenu.min + ' min' + (c.retardPrevenu.geste === 'boisson' ? ' · boisson offerte' : c.retardPrevenu.geste === 'remise' ? ' · −10 %' : '') + '</p>' : '') +
      PelyoModules.html('cuisine.etiquette', c);
  }
  function phraseIA(){
    if (charge === 'stop') return 'Désolé, nous ne prenons plus de commandes pour le moment. Rappelez-nous un peu plus tard !';
    var parModule = PelyoModules.premier('cuisine.phraseIA'); if (parModule) return parModule;
    var r = retraitOuvert, l = livraisonOuverte, delaiRetrait = annonceRetrait(), delaiLivraison = annonceLivraison();
    if (charge === 'normal') return r && l ? 'C’est noté ! Votre commande sera prête dans ' + delaiRetrait + ' minutes, ou livrée dans ' + delaiLivraison + ' minutes.'
      : r ? 'C’est noté ! Votre commande sera prête dans ' + delaiRetrait + ' minutes. La livraison est fermée ce soir.'
      : 'C’est noté ! Livraison dans ' + delaiLivraison + ' minutes. Pas de retrait sur place ce soir.';
    if (charge === 'rush') return 'Il y a du monde ce soir : comptez ' + (r ? delaiRetrait + ' minutes en retrait' : '') + (r && l ? ' et ' : '') + (l ? delaiLivraison + ' minutes en livraison' : '') + '. Ça vous convient ?';
    return 'Nous sommes très chargés. ' + (r ? 'Retrait dans ' + delaiRetrait + ' minutes' : 'Pas de retrait') + ', ' + (l ? 'livraison dans ' + delaiLivraison + ' minutes' : 'pas de livraison') + '. Vous préférez quoi ?';
  }
  function vueRythme(){
    if (!grandEcran()) return vueRythmeTel();
    var lv = niveau(), angle = ANGLES_TEMPO[charge] || 0, n = chargeEnCours();
    var reperes = D_.charges.map(function(c){
      var a = ANGLES_TEMPO[c.id], t = (a - 90) * Math.PI / 180, x = 50 + 46 * Math.cos(t), y = 50 + 46 * Math.sin(t);
      return '<button class="k-tempo-repere" data-charge="' + c.id + '" aria-pressed="' + (charge === c.id) + '" style="left:' + x.toFixed(1) + '%;top:' + y.toFixed(1) + '%;--teinte:' + TEINTES_TEMPO[c.id] + '">' + esc(c.id === 'stop' ? 'Pause' : c.nom) + '</button>';
    }).join('');
    var graduations = '';
    for (var g = -120; g <= 120; g += 10){
      var t2 = (g - 90) * Math.PI / 180, fort = ANGLES_TEMPO.stop === g || ANGLES_TEMPO.normal === g || ANGLES_TEMPO.rush === g || ANGLES_TEMPO.charge === g;
      graduations += '<line x1="' + (130 + 118 * Math.cos(t2)).toFixed(1) + '" y1="' + (130 + 118 * Math.sin(t2)).toFixed(1) + '" x2="' + (130 + (fort ? 108 : 113) * Math.cos(t2)).toFixed(1) + '" y2="' + (130 + (fort ? 108 : 113) * Math.sin(t2)).toFixed(1) + '"' + (fort ? ' class="k-tempo-fort"' : '') + '/>';
    }
    function minuteur(id, nom, icon, valeur, ouvert, moins, plus){
      return '<div class="k-tempo-delai" data-tempo-delai="' + id + '" data-ouvert="' + ouvert + '">' +
        '<div class="k-tempo-delai-tete">' + icone(icon) + '<b>' + nom + '</b><span data-tempo-ferme>' + (ouvert ? '' : 'Fermé') + '</span></div>' +
        '<div class="k-tempo-chiffre"><output class="k-mono" data-tempo-valeur="' + id + '">' + valeur + '</output><small>' + (id === 'livraison' ? 'min sans livreur' : 'min minimum') + '</small></div>' +
        '<p class="k-tempo-estime" data-tempo-estime="' + id + '">' + texteEstime(id) + '</p>' +
        '<div class="k-tempo-pas"><button data-d="' + moins + '" aria-label="Réduire le délai ' + nom.toLowerCase() + '">−</button><button data-d="' + plus + '" aria-label="Augmenter le délai ' + nom.toLowerCase() + '">+</button></div></div>';
    }
    return titre('PILOTAGE DU SERVICE', 'Le rythme.', '') + '<div class="k-pane k-tempo-page" data-level="' + charge + '" style="--teinte:' + TEINTES_TEMPO[charge] + '">' +
      '<section class="k-tempo-feu" aria-label="Intensité du service">' +
        '<div class="k-tempo-statut"><span class="k-tempo-live"><i></i><span data-tempo-live>' + (charge === 'stop' ? 'Commandes en pause' : 'Service ouvert') + '</span></span><span class="k-tempo-astuce">Tournez le bouton</span></div>' +
        '<div class="k-tempo-cadran">' +
          '<svg class="k-tempo-arc" viewBox="0 0 260 260" aria-hidden="true"><defs><linearGradient id="k-tempo-grad" x1="0" y1="1" x2="1" y2="1"><stop offset="0" stop-color="#8f8379"/><stop offset=".38" stop-color="#3f9d6a"/><stop offset=".7" stop-color="#e97838"/><stop offset="1" stop-color="#d63c22"/></linearGradient></defs>' +
            '<g class="k-tempo-grad">' + graduations + '</g>' +
            '<path class="k-tempo-piste" d="' + arcTempo(104, -120, 120) + '"/>' +
            '<path class="k-tempo-plein" d="' + arcTempo(104, -120, 120) + '" style="stroke-dasharray:' + ARC_TEMPO.toFixed(1) + ';stroke-dashoffset:' + remplissageTempo(angle) + '"/></svg>' +
          reperes +
          '<div class="k-tempo-bouton" data-tempo-bouton role="slider" tabindex="0" aria-label="Intensité du service" aria-valuemin="0" aria-valuemax="3" aria-valuenow="' + ['stop','normal','rush','charge'].indexOf(charge) + '" aria-valuetext="' + esc(lv.nom) + '" style="--angle:' + angle + 'deg"><i class="k-tempo-index"></i></div>' +
          '<div class="k-tempo-centre" aria-hidden="true"><b class="k-mono" data-tempo-centre>' + (charge === 'stop' ? '—' : annonceRetrait()) + '</b><small data-tempo-centre-u>' + (charge === 'stop' ? 'en pause' : 'min retrait') + '</small></div>' +
        '</div>' +
        '<div class="k-tempo-niveau"><h2 data-tempo-nom>' + esc(lv.nom) + '</h2><p data-tempo-dit>' + esc(lv.dit) + '</p></div>' +
        '<div class="k-tempo-bulle"><span class="k-tempo-bulle-qui">' + icone('wave') + 'Ce que dit l’IA au téléphone' + (reel ? '' : ' · démo') + '</span><p><span class="k-visually-hidden" data-tempo-phrase-lecteur aria-live="polite">' + esc(phraseIA()) + '</span><span aria-hidden="true" data-tempo-phrase>« ' + esc(phraseIA()) + ' »</span></p></div>' +
      '</section>' +
      '<section class="k-tempo-reglages">' +
        '<div class="k-tempo-delais">' +
          minuteur('retrait', 'Retrait', 'bag', delaiRetrait, retraitOuvert, 'retrait-', 'retrait+') +
          minuteur('livraison', 'Livraison', 'truck', delaiLivraison, livraisonOuverte, 'liv-', 'liv+') +
        '</div>' +
        '<div class="k-tempo-capacite"><div class="k-tempo-cap-tete"><span><b>Capacité</b><small data-tempo-cap-texte>' + n + ' en cours sur ' + capacite + ' possibles</small></span>' +
          '<div class="k-tempo-pas"><button data-d="cap-" aria-label="Réduire la capacité">−</button><output class="k-mono" data-tempo-valeur="capacite">' + capacite + '</output><button data-d="cap+" aria-label="Augmenter la capacité">+</button></div></div>' +
          '<div class="k-tempo-jauge" data-tempo-jauge aria-hidden="true">' + jaugeCapacite(n) + '</div></div>' +
        '<div class="k-tempo-canaux">' +
          '<button class="k-tempo-canal" data-channel="retrait" aria-pressed="' + retraitOuvert + '">' + icone('bag') + '<span><b>Retrait</b><small data-tempo-canal-etat>' + (retraitOuvert ? 'Ouvert aux nouvelles commandes' : 'Fermé aux nouvelles commandes') + '</small></span><i class="k-tempo-inter" aria-hidden="true"></i></button>' +
          '<button class="k-tempo-canal" data-channel="livraison" aria-pressed="' + livraisonOuverte + '">' + icone('truck') + '<span><b>Livraison</b><small data-tempo-canal-etat>' + (livraisonOuverte ? 'Ouverte aux nouvelles commandes' : 'Fermée aux nouvelles commandes') + '</small></span><i class="k-tempo-inter" aria-hidden="true"></i></button>' +
        '</div>' +
        '<p class="k-tempo-note">Les commandes déjà confirmées gardent leur heure promise.</p>' +
      '</section></div>';
  }
  function jaugeCapacite(n){
    var h = '';
    for (var i = 0; i < capacite; i++) h += '<i class="' + (i < n ? (n >= capacite ? 'k-plein' : 'k-pris') : '') + '" style="--i:' + i + '"></i>';
    return h;
  }
  /* Un chiffre qui change roule vers le haut ou vers le bas. */
  function rouler(el, valeur){
    if (!el || el.textContent === String(valeur)) return;
    var monte = +valeur > +el.textContent;
    el.textContent = valeur;
    if (el.animate && !mouvementReduit()) el.animate([{transform:'translateY(' + (monte ? '55%' : '-55%') + ')', opacity:0, filter:'blur(2px)'}, {transform:'none', opacity:1, filter:'blur(0)'}], {duration:420, easing:'cubic-bezier(.2,.9,.3,1.25)'});
  }
  /* La bulle de l'IA s'écrit au fil de l'eau quand la phrase change. */
  function taper(el, texte){
    if (!el || el._texte === texte) return;
    el._texte = texte; clearInterval(el._minuteur);
    if (mouvementReduit()){ el.textContent = texte; return; }
    var i = 0;
    el._minuteur = setInterval(function(){
      i += 2; el.textContent = texte.slice(0, i);
      if (i >= texte.length) clearInterval(el._minuteur);
    }, 18);
  }
  function majRythme(){
    var page = root.querySelector('.k-tempo-page');
    if (!page) return false;
    var lv = niveau(), angle = ANGLES_TEMPO[charge] || 0, n = chargeEnCours();
    page.setAttribute('data-level', charge);
    page.style.setProperty('--teinte', TEINTES_TEMPO[charge]);
    var bouton = page.querySelector('[data-tempo-bouton]');
    if (!glisseTempo){ bouton.style.setProperty('--angle', angle + 'deg'); page.querySelector('.k-tempo-plein').style.strokeDashoffset = remplissageTempo(angle); }
    bouton.setAttribute('aria-valuenow', String(['stop','normal','rush','charge'].indexOf(charge)));
    bouton.setAttribute('aria-valuetext', lv.nom);
    Array.prototype.forEach.call(page.querySelectorAll('.k-tempo-repere'), function(b){ b.setAttribute('aria-pressed', String(b.getAttribute('data-charge') === charge)); });
    var centre = page.querySelector('[data-tempo-centre]');
    if (charge === 'stop'){ centre.textContent = '—'; } else rouler(centre, annonceRetrait());
    page.querySelector('[data-tempo-centre-u]').textContent = charge === 'stop' ? 'en pause' : 'min retrait';
    page.querySelector('[data-tempo-live]').textContent = charge === 'stop' ? 'Commandes en pause' : 'Service ouvert';
    var nom = page.querySelector('[data-tempo-nom]');
    if (nom.textContent !== lv.nom){
      nom.textContent = lv.nom; page.querySelector('[data-tempo-dit]').textContent = lv.dit;
      var bloc = page.querySelector('.k-tempo-niveau');
      if (bloc.animate && !mouvementReduit()) bloc.animate([{opacity:0, transform:'translateY(8px)'}, {opacity:1, transform:'none'}], {duration:380, easing:'cubic-bezier(.2,.8,.2,1)'});
    }
    var phrase = phraseIA();
    page.querySelector('[data-tempo-phrase-lecteur]').textContent = phrase;
    taper(page.querySelector('[data-tempo-phrase]'), '« ' + phrase + ' »');
    rouler(page.querySelector('[data-tempo-valeur="retrait"]'), delaiRetrait);
    rouler(page.querySelector('[data-tempo-valeur="livraison"]'), delaiLivraison);
    rouler(page.querySelector('[data-tempo-valeur="capacite"]'), capacite);
    [['retrait', retraitOuvert], ['livraison', livraisonOuverte]].forEach(function(x){
      var carte = page.querySelector('[data-tempo-delai="' + x[0] + '"]');
      carte.setAttribute('data-ouvert', String(x[1]));
      carte.querySelector('[data-tempo-ferme]').textContent = x[1] ? '' : 'Fermé';
      var canal = page.querySelector('.k-tempo-canal[data-channel="' + x[0] + '"]');
      canal.setAttribute('aria-pressed', String(x[1]));
      canal.querySelector('[data-tempo-canal-etat]').textContent = (x[1] ? (x[0] === 'retrait' ? 'Ouvert' : 'Ouverte') : (x[0] === 'retrait' ? 'Fermé' : 'Fermée')) + ' aux nouvelles commandes';
    });
    ['retrait', 'livraison'].forEach(function(id){ var e = page.querySelector('[data-tempo-estime="' + id + '"]'); if (e) e.innerHTML = texteEstime(id); });
    page.querySelector('[data-tempo-cap-texte]').textContent = n + ' en cours sur ' + capacite + ' possibles';
    var jauge = page.querySelector('[data-tempo-jauge]');
    if (jauge.children.length !== capacite || jauge.querySelectorAll('.k-pris,.k-plein').length !== Math.min(n, capacite)) jauge.innerHTML = jaugeCapacite(n);
    return true;
  }
  /* Rythme ouvert : mise à jour sur place ; ailleurs, rendu complet. */
  function repeindreRythme(){ if (vue !== 'rythme' || ops) peindre(); else if (!majRythme()) peindrePage(); }
  function changerCharge(id){
    if (!id || id === charge) return;
    charge = id;
    if (niveau().delai) delaiRetrait = niveau().delai;
    envoyerReglages(niveau().delai ? { charge:charge, delai_retrait_min:delaiRetrait } : { charge:charge });
    api.vibrer(10);
    repeindreRythme();
  }
  function pasRythme(code){
    var avant = [delaiRetrait, delaiLivraison, capacite].join();
    if (code === "retrait-") delaiRetrait = Math.max(5, delaiRetrait - 5);
    if (code === "retrait+") delaiRetrait = Math.min(90, delaiRetrait + 5);
    if (code === "liv-") delaiLivraison = Math.max(10, delaiLivraison - 5);
    if (code === "liv+") delaiLivraison = Math.min(120, delaiLivraison + 5);
    if (code === "cap-") capacite = Math.max(1, capacite - 1);
    if (code === "cap+") capacite = Math.min(40, capacite + 1);
    if (avant === [delaiRetrait, delaiLivraison, capacite].join()){
      /* En butée : le chiffre refuse d'un petit mouvement de tête. */
      var cle = /^retrait/.test(code) ? 'retrait' : /^liv/.test(code) ? 'livraison' : 'capacite', el = root.querySelector('[data-tempo-valeur="' + cle + '"]');
      if (el && el.animate) el.animate([{transform:'none'}, {transform:'translateX(-5px)'}, {transform:'translateX(4px)'}, {transform:'translateX(-2px)'}, {transform:'none'}], {duration:320});
      return false;
    }
    envoyerReglages(/^retrait/.test(code) ? { delai_retrait_min:delaiRetrait } : /^liv/.test(code) ? { delai_livraison_min:delaiLivraison } : { capacite:capacite }, true);
    repeindreRythme();
    return true;
  }
  var glisseTempo = null, derniereMajRythme = 0;

  /* --------------------- détail d'une commande, plein écran --------------------- */
  /* Téléphone : la fiche reprend le ticket du service (même carte, même
     minuteur), puis les produits, les infos en lignes simples, et une barre
     d'action fixée en bas. Classes k-sd-* (fin de cuisine.css). */
  /* Détail : les produits en blocs côte à côte. Chaque gros produit a son
     bloc (nom en grand, ingrédients un par ligne) ; toutes les boissons —
     seules ou incluses dans un menu — sont regroupées dans un bloc
     « Boissons », placé tout à droite. */
  var BOISSON = /\b(boissons?|coca|cola|oasis|fanta|sprite|orangina|ice ?tea|lipton|eau|evian|cristaline|perrier|schweppes|7 ?up|jus|red ?bull|monster|capri|tropico|hawa[iï])/i;
  function blocsProduits(c){
    if (!c.lignes.length) return '<p class="k-sc-vide">Aucun produit pour le moment.</p>';
    var boissons = [], blocs = [];
    c.lignes.forEach(function(l){
      if (BOISSON.test(l.nom)){
        boissons.push((l.q > 1 ? l.q + '× ' : '') + l.nom + (l.opt ? ' · ' + l.opt : ''));
        return;
      }
      var elements = [];
      String(l.opt || '').split(/\s*·\s*/).forEach(function(part){
        part.split(/\s+\+\s+/).forEach(function(x){
          x = x.replace(/^\s+|\s+$/g, '');
          if (!x) return;
          if (BOISSON.test(x)) boissons.push((l.q > 1 ? l.q + '× ' : '') + x.charAt(0).toUpperCase() + x.slice(1));
          else elements.push(x);
        });
      });
      String(l.sup || '').split(/\s*[·,]\s*/).filter(Boolean).forEach(function(x){ elements.push('+ ' + x.replace(/^\+\s*/, '')); });
      blocs.push('<div class="k-sd-pbloc"><h3>' + (l.q > 1 ? '<span>' + l.q + '×</span> ' : '') + esc(l.nom) + '</h3>' +
        (elements.length ? '<ul class="k-sd-ingr">' + elements.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') +
        (l.allergie ? '<p class="k-sv-allergie">⚠ Allergie : ' + esc(l.allergie) + '</p>' : '') +
        (l.dem ? '<p class="k-sv-consigne">→ ' + esc(l.dem) + '</p>' : '') +
        '<small class="k-sd-pprix">' + eur(l.prix) + '</small></div>');
    });
    if (boissons.length) blocs.push('<div class="k-sd-pbloc"><h3>Boissons</h3><ul class="k-sd-ingr">' + boissons.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>');
    return '<div class="k-sd-pgrille">' + blocs.join('') + '</div>';
  }

  function overlayTel(c){
    var liv = c.mode === 'livraison', mort = /^(annulee|expiree|terminee|attente|appel)$/.test(c.etat);
    var u = PelyoKitchen.urgence(c, Date.now()), m = etapeMinuteur(c);
    var origine = c.origine === 'restaurant' ? 'Caisse' : c.canal === 'sms' ? 'SMS « comme d’hab »' : 'IA Pelyo';
    var carte = '<section class="k-sv-ticket k-sd-carte k-sv-' + c.etat + (u && u.late && !mort ? ' k-sv-retard' : '') + '">' + photoPlat(c) +
      '<span class="k-sv-bande' + (m && m.depasse ? ' k-sv-depasse' : '') + '" aria-hidden="true" data-progres="' + c.id + '"><i style="width:' + progresCommande(c) + '%"></i></span>' +
      '<div class="k-sv-haut"><span class="k-sv-num"><small>#</small>' + c.id + '</span><span class="k-sv-chrono" data-minuteur="' + c.id + '">' + minuteurTicket(c) + '</span></div>' +
      '<p class="k-sv-qui">' + esc(ETATS[c.etat].lbl) + ' · ' + (liv ? 'Livraison' : 'À emporter') + ' · ' + origine + '</p>' +
      '<p class="k-sv-delai" data-deadline="' + c.id + '">' + delaiPromis(c) + '</p>' + calme(c) + '</section>';
    var alertes =
      (c.ackVersion < c.version ? '<section class="k-sd-alerte"><b>' + (c.etat === 'annulee' ? 'Annulation à prendre en compte' : 'Correctif à prendre en compte') + '</b><ul>' + c.historique.filter(function(h){ return h.version > c.ackVersion; }).map(function(h){ return h.details.map(function(t){ return '<li>' + esc(t) + '</li>'; }).join(''); }).join('') + '</ul><button class="k-sd-lien k-sd-orange" data-ack="' + c.id + '">J’ai pris connaissance</button></section>' : '') +
      (c.probleme ? '<section class="k-sd-alerte k-sd-rouge"><b>' + esc(c.probleme.motif) + '</b><p>' + esc(c.probleme.note) + '</p><small>' + esc(c.probleme.route) + (reel ? (c.probleme.appareil ? ' · signalé par ' + esc(c.probleme.appareil) : '') : ' · demande simulée') + '</small><button class="k-sd-lien k-sd-orange" data-resolve="' + c.id + '">Marquer le problème résolu</button></section>' : '') +
      (c.motif ? '<section class="k-sd-alerte"><p>' + esc(c.motif) + '</p></section>' : '');
    function info(k, v){ return '<div class="k-sd-info"><span>' + k + '</span><b>' + v + '</b></div>'; }
    var a = c.adresseDetail || {}, tel = String(c.telephoneClient || '').replace(/[^+\d]/g, '');
    var infos = info('Client', esc(c.client || 'Non communiqué')) +
      (c.telephoneClient ? '<a class="k-sd-info k-sd-appel" href="tel:' + esc(tel) + '"><span>Téléphone</span><b>' + esc(c.telephoneClient) + '</b>' + icone('phone') + '</a>' : '') +
      info('Mode', liv ? 'Livraison' : 'Retrait au comptoir') +
      (liv ? info('Adresse', esc(adresseRue(c)) + (a.ville ? '<small>' + esc((a.codePostal || '') + ' ' + a.ville) + '</small>' : '') + (a.complement ? '<small>' + esc(a.complement) + '</small>' : '') + (a.acces ? '<small>Accès : ' + esc(a.acces) + '</small>' : '')) +
        info('Distance', c.distanceARevoir ? 'À revérifier' : c.km == null ? 'Non renseignée' : esc(String(c.km).replace('.', ',')) + ' km · frais ' + eur(c.frais || 0)) : '') +
      info('Paiement', esc(c.paiement || '—')) +
      info('Reçue', esc(c.heure || '—') + (c.prete ? ' · annoncée ' + esc(c.prete) : ''));
    var valide = /^(confirmee|preparation|prete|terminee)$/.test(c.etat);
    var caisse = '<p class="k-sd-note">' + (c.origine === 'restaurant' ? 'Saisie au restaurant' : 'Prise par l’IA Pelyo') + ' · ' + esc(c.date || '') + ' ' + esc(c.heure || '') +
      (valide ? '<br>' + (c.syncCaisse === 'en_attente' ? 'Caisse : en attente' : c.syncCaisse === 'simulee' ? 'Caisse simulée (démo)' : 'Caisse non connectée') + ' · réf. ' + esc(c.referenceCommande || '—') : '') + '</p>';
    var lienSuivi = c.origine === 'restaurant' || /^(appel|attente|expiree)$/.test(c.etat) ? '' :
      '<div class="k-sd-suivi"><span><b>Lien de suivi envoyé</b><small>pelyo.eu/s/' + codeSuivi(c) + '</small></span><a class="k-pg-lien" href="suivi.html?c=' + c.id + '" target="_blank" rel="noopener">Voir comme le client</a></div>';
    var appel = c.canal === 'sms' ? '<p class="k-sd-note">Commandé par SMS : le client a répondu OUI à « comme d’hab ? ».</p>' : c.origine === 'restaurant' || reel ? '' : '<button class="k-sd-ligne" data-discussion>' + icone('wave') + '<span>Voir l’appel et le récapitulatif</span>' + icone('arrow') + '</button>';
    var gerer = PelyoKitchen.actif(c) ? '<div class="k-sd-gerer"><button class="k-sd-lien" data-problem="' + c.id + '">Un problème</button>' +
      '<button class="k-sd-lien" data-edit-order="' + c.id + '">Modifier</button>' +
      (liv ? '<button class="k-sd-lien" data-edit-address="' + c.id + '">Corriger l’adresse</button>' : '') +
      '<button class="k-sd-lien k-sd-danger" data-cancel-order="' + c.id + '">Annuler</button></div>' : '';
    var action = ETATS[c.etat].suite && c.ackVersion >= c.version && !c.probleme
      ? '<button class="k-sd-go" data-go="' + c.id + '">' + esc(c.etat === 'confirmee' ? 'Commencer' : c.etat === 'preparation' ? (liv ? 'Prête pour livreur' : 'Prête au comptoir') : (liv ? 'Livrée' : 'Récupérée')) + '</button>'
      : '<p class="k-sd-attente">' + (c.ackVersion < c.version ? 'Lisez le correctif pour continuer' : c.probleme ? 'Résolvez le problème pour continuer' : 'Aucune action : ' + esc(ETATS[c.etat].lbl.toLowerCase())) + '</p>';
    var ticket = c.etat !== 'appel' && c.etat !== 'attente' && c.etat !== 'expiree' ? '<button class="k-sd-ticket" data-ticket="' + c.id + '" aria-label="Voir le ticket">' + icone('print') + '</button>' : '';
    return '<div class="k-over k-sd">' +
      '<header class="k-sd-tete"><button class="k-sd-retour" data-close>‹ Retour</button><span class="k-sd-heure" data-hor>' + esc(horloge) + '</span></header>' +
      '<div class="k-sd-corps">' + carte + alertes + lienSuivi +
        '<h2 class="k-sd-titre">Produits</h2>' + blocsProduits(c) + '<section class="k-sd-bloc"><div class="k-sd-total"><span>Total</span><b>' + eur(total(c)) + '</b></div></section>' +
        '<h2 class="k-sd-titre">Infos</h2><section class="k-sd-bloc">' + infos + '</section>' +
        appel + gerer + caisse + historique(c) +
      '</div>' +
      '<footer class="k-sd-pied">' + ticket + action + '</footer>' +
    '</div>';
  }

  function overlay(c){
    if (!grandEcran()) return overlayTel(c);
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

    return '<div class="k-over k-order-detail">' +
      '<div class="k-ohead"><button data-close>← Retour au tableau</button>' +
        '<span class="k-clock k-mono" data-hor style="margin-left:auto">' + esc(horloge) + '</span></div>' +
      '<div class="k-hero">' +
        '<span class="l"><b class="k-mono">' + c.id + '</b><span>' + esc(ETATS[c.etat].lbl) + '</span></span>' +
        '<span class="r" data-timer="' + c.id + '">' + ligneMinuteur(c) + '</span>' +
      '</div>' +
      '<div data-deadline="'+c.id+'">'+delaiPromis(c)+'</div>'+
      (c.ackVersion<c.version?'<div class="k-change-review"><b>'+(c.etat==='annulee'?'Annulation à prendre en compte':'Correctif à prendre en compte')+'</b><ul>'+c.historique.filter(function(h){return h.version>c.ackVersion;}).map(function(h){return h.details.map(function(t){return '<li>'+esc(t)+'</li>';}).join('');}).join('')+'</ul><button class="k-btn2" data-ack="'+c.id+'">J’ai pris connaissance</button></div>':'')+
      (c.probleme?'<div class="k-problem-review"><b>'+esc(c.probleme.motif)+'</b><p>'+esc(c.probleme.note)+'</p><small>'+esc(c.probleme.route)+(reel?(c.probleme.appareil?' · signalé par '+esc(c.probleme.appareil):''):' · demande simulée')+'</small><button class="k-btn2" data-resolve="'+c.id+'">Marquer le problème résolu</button></div>':'')+
      infosCaisse(c) +
      (c.origine === 'restaurant' ? '<p class="k-note">Commande saisie au restaurant · aucun appel Pelyo associé.</p>' : reel ? '<p class="k-note">' + (c.test ? 'Commande de test · aucun appel associé.' : 'La discussion de l’appel sera consultable ici.') + '</p>' : '<button class="k-call-access" data-discussion>' + icone('wave') + '<span>Voir l’appel et le récapitulatif<small>Discussion et détail de la commande</small></span>' + icone('arrow') + '</button>') +
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
    if (!grandEcran()) return discussionTel(c, messages, valide, statut);
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

  /* Téléphone : la discussion en page pleine, comme la fiche commande —
     bulles à contour (assistant à gauche, client à droite), puis le récap
     toujours visible en lignes simples. Classes k-sc-* (fin de cuisine.css) ;
     k-call-layer / k-call-scroll / k-call-recap restent pour le focus, le
     défilement conservé et le lien « Récap ». */
  function discussionTel(c, messages, valide, statut){
    var liv = c.mode === 'livraison', a = c.adresseDetail || {};
    function info(k, v){ return '<div class="k-sd-info"><span>' + k + '</span><b>' + v + '</b></div>'; }
    var infos = info('Client', esc(c.client || 'Non renseigné')) + info('Mode', liv ? 'Livraison' : 'Retrait au comptoir') +
      (liv ? info('Adresse', esc(adresseRue(c)) + '<small>' + esc(adresseVille(c) || 'Ville à préciser') + '</small>' + (a.complement ? '<small>' + esc(a.complement) + '</small>' : '') + (a.acces ? '<small>Accès : ' + esc(a.acces) + '</small>' : '')) +
        info('Téléphone', esc(c.telephoneClient || 'Non renseigné')) +
        info('Distance', c.distanceARevoir ? 'À revérifier' : c.km == null ? 'Non renseignée' : esc(String(c.km).replace('.', ',')) + ' km · frais ' + eur(c.frais || 0)) : '') +
      info('Horaire annoncé', esc(c.prete || 'Non renseigné')) + info('Paiement', esc(c.paiement || 'Non renseigné'));
    var attention = !valide ? '<p class="k-sc-alerte">' + (c.etat === 'appel' ? 'Appel en cours : le panier peut encore changer.' : c.etat === 'expiree' ? 'Aucune validation reçue. Ne pas préparer cette commande.' : 'En attente de confirmation. Ne pas préparer cette commande.') + '</p>' : '';
    return '<div class="k-over k-call-layer k-sd k-sc">' +
      '<header class="k-sd-tete"><button class="k-sd-retour" data-fermer-discussion aria-label="Fermer la discussion">‹ Retour</button><button class="k-sc-lienrecap" data-recap>Récap ↓</button></header>' +
      '<div class="k-call-scroll k-sd-corps">' +
        '<div class="k-sc-titre"><h2>Appel <span>#' + c.id + '</span></h2><p class="' + (valide ? 'k-sc-ok' : 'k-sc-brouillon') + '">' + esc(statut) + '</p></div>' +
        attention +
        '<div class="k-sc-fil">' + messages.map(function(m){ var client = m.role === 'Client'; return '<div class="k-sc-bulle' + (client ? ' k-sc-client' : '') + '"><span>' + (client ? 'Client' : 'Assistant Pelyo') + '</span><p>' + esc(m.texte) + '</p></div>'; }).join('') + '</div>' +
        '<p class="k-sd-note">Exemple fictif créé pour la maquette, pas la retranscription d’un appel réel.</p>' +
        '<section class="k-call-recap k-sc-recap"><h2 class="k-sd-titre">' + (valide ? 'Récapitulatif confirmé' : 'Récapitulatif provisoire') + '</h2>' +
          blocsProduits(c) + '<div class="k-sd-bloc"><div class="k-sd-total"><span>Total ' + (valide ? 'confirmé' : 'provisoire') + '</span><b>' + eur(total(c)) + '</b></div></div>' +
          '<div class="k-sd-bloc">' + infos + '</div></section>' +
      '</div></div>';
  }

  /* Ce que l'appli cuisine donne aux modules (voir src/modules.js). */
  PelyoModules.contexte('cuisine', {
    esc:esc, eur:eur, icone:icone, interrupteur:interrupteur, pas:pas, hhmm:function(ms){ return PelyoKitchen.hhmm(ms); },
    carte:carte, stockEffectif:stockEffectif, categorieCoupee:function(cat){ return !!catOff[cat]; },
    charge:function(){ return charge; }, capacite:function(){ return capacite; }, retraitOuvert:function(){ return retraitOuvert; },
    chargeEnCours:chargeEnCours, annonceRetrait:annonceRetrait, minuteurs:function(){ return minuteurs; },
    resto:function(){ return D_.resto; }, nbClients:function(){ return (D_.clientsMois && D_.clientsMois.clients) || 0; },
    reel:function(){ return reel; }, toast:function(t){ api.toast(t); }, vibrer:function(n){ api.vibrer(n); },
    repeindre:function(){ peindrePage(); }
  });
  PelyoModules.quandPret(function(){ if (root) peindre(); });

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
      ['data-vue','data-filt','data-d','data-charge','data-channel','data-reg','data-son','data-close','data-imprimer','data-toggle-stock','data-toggle-cat','data-search','data-theme','data-urgence','data-ops-stock'].some(function(attr){
        if (focus.hasAttribute(attr)) { focusSelector = '[' + attr + '="' + focus.getAttribute(attr) + '"]'; return true; }
        return false;
      });
    }
    var ancre = root.querySelector(".k-body, .k-pane");
    /* Un autre onglet s'ouvre en haut ; un rafraîchissement du même écran
       conserve la position du cuisinier pendant le service. */
    var y = ancre && root.getAttribute('data-page') === vue ? ancre.scrollTop : 0;
    if (vue === 'service' && livreursActifs().length) planCourant = planLivraisons(); else planCourant = null;
    var corps = livreur ? vueLivreur()
              : vue === "service" ? vueService()
              : vue === "tickets" ? vueTickets()
              : vue === "ruptures" ? vueRuptures()
              : vue === "rythme" ? vueRythme()
              : vueParametres();
    var superposition = ops ? overlayOps() : ouverte ? overlay(ouverte)
                       : ticketOuvert ? overlayTicket(ticketOuvert)
                       : triOuvert ? overlayTri()
                       : "";
    var entree = root.getAttribute('data-page') !== vue;
    root.setAttribute('data-page', vue);
    var morceaux = vue === 'service' ? corps.split('<!--volet-->') : null;
    /* Changement d'onglet : la nouvelle file s'affiche depuis son début, sans
       toucher au volet (replié, il le reste ; ouvert, il le reste). */
    var ongletChange = vue === 'service' && !entree && volet.onglet !== null && volet.onglet !== filtre;
    volet.onglet = vue === 'service' ? filtre : null;
    var replie = vue === 'service' && root.classList.contains('k-replie');
    if (ongletChange) y = replie ? volet.replie : 0;
    var avantPos = vue === 'service' && !entree && !ongletChange && !mouvementReduit() ? positionsCommandes() : null;
    var avantComptes = vue === 'service' && !entree ? comptesOnglets() : {};
    root.innerHTML = ambiance() + '<div class="k-workspace"' + (vue === 'service' ? styleVolet() : '') + '>' + (morceaux && morceaux.length === 2 ? '<div class="k-volet">' + head() + morceaux[0] + '</div>' + morceaux[1] : corps) + '</div>' + (livreur ? '' : navigation()) + superposition + (discussionOuverte && ouverte && !ops ? discussion(ouverte) : '');
    Array.prototype.forEach.call(root.querySelectorAll('.k-settings-group'),function(el){el.open = settingsOpen.indexOf(el.getAttribute('data-settings-group')) !== -1;});
    if(root.querySelector('.k-over'))root.querySelector('.k-over').setAttribute('data-layer',layer);
    mesurerVolet();
    /* État du volet d'après la position réelle de la liste, une fois le
       défilement restauré par le rendu. */
    setTimeout(function(){
      if (!root) return;
      var corpsDefile = root.querySelector('.k-body'), y = corpsDefile ? corpsDefile.scrollTop : 0;
      if (vue !== 'service' || y < Math.min(30, volet.replie - 2)) root.classList.remove('k-replie');
      root.classList.toggle('k-defile', vue === 'service' && y > 4);
    }, 0);
    if (entree){ root.classList.add('k-entree'); clearTimeout(finEntree); finEntree = setTimeout(function(){ if (root) root.classList.remove('k-entree'); }, 1400); }
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
    /* Le défilement remis en place par le rendu n'est pas un geste : il ne
       doit ni ouvrir ni fermer le volet. */
    volet.dernierY = ancre2 ? ancre2.scrollTop : 0;
    if (replie && vue === 'service' && volet.dernierY >= volet.replie - 2) root.classList.add('k-replie');
    glisserCommandes(avantPos);
    rebondirComptes(avantComptes);
    placerPastille(true);
    if (vue === "ruptures" && !ouverte){
      var msgs = root.querySelector(".k-msgs");
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }
    retenir();
  }

  /* ------------------------------ actions ------------------------------ */
  function avancer(id, glisse){
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
    if (suite === "prete") c.preteAt = Date.now();
    api.vibrer(12);
    api.toast("Commande " + id + " — " + ETATS[suite].lbl.toLowerCase() + ".");
    if (ouverte && ouverte.id === id) ouverte = c;
    /* Vers quel onglet part-elle ? Elle s'y envole si elle quitte l'écran. */
    var carte = !glisse && !ouverte && vue === 'service' && !mouvementReduit() && root.querySelector('.k-order[data-cmd="' + id + '"]');
    var cle = (FILTRES.filter(function(x){ return x.test(c); })[0] || {}).id;
    var depart = carte ? carte.getBoundingClientRect() : null, fantome = carte ? carte.cloneNode(true) : null;
    if (fantome && cle && root.querySelector('.k-filt [data-filt="' + cle + '"] em')) volsEnCours[cle] = true;
    peindre();
    if (fantome && cle && volsEnCours[cle]){
      if (root.querySelector('.k-order[data-cmd="' + id + '"]')) delete volsEnCours[cle];
      else envoler(fantome, depart, cle);
    }
    if (suite === "preparation"){ lancerPesee(c); if (pesee) peindre(); }
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
  /* Commandes de démo variées : petites, moyennes, grosses (familles,
     bureaux). Elles défilent dans un ordre mélangé ; les noms collent aux
     photos des plats. Prix en centimes, par ligne (quantité comprise). */
  var PANIERS_DEMO = [
    [{q:1, nom:"Tacos M", opt:"Poulet · sauce algérienne · frites", sup:"Cheddar", dem:"", prix:950}, {q:1, nom:"Boisson 33 cl", opt:"Coca", dem:"", prix:180}],
    [{q:1, nom:"Kebab", opt:"Pain · salade · tomate · oignon · sauce blanche", dem:"", prix:750}],
    [{q:2, nom:"Pizza Reine", opt:"Tomate · jambon · champignons · moyenne", dem:"Bien cuite", prix:2200}, {q:1, nom:"Tiramisu maison", opt:"", dem:"", prix:350}, {q:2, nom:"Boisson 33 cl", opt:"Ice Tea", dem:"", prix:360}],
    [{q:1, nom:"Burger maison", opt:"Steak · cheddar · salade · tomate · oignons", dem:"Sans cornichons", prix:1050}, {q:1, nom:"Frites", opt:"Grande", dem:"", prix:350}],
    [{q:3, nom:"Tacos L", opt:"Poulet + kebab · frites · sauce samouraï", sup:"Cheddar", dem:"", prix:3600}, {q:2, nom:"Tacos M", opt:"Viande hachée · frites · sauce biggy", dem:"Bien grillé", prix:1900}, {q:1, nom:"Tenders x6", opt:"Sauce barbecue", dem:"", prix:650}, {q:5, nom:"Boisson 33 cl", opt:"Oasis · Coca · Fanta", dem:"", prix:900}],
    [{q:1, nom:"Grec assiette", opt:"Viande kebab · frites · salade · tomate · oignon · sauce blanche", dem:"Sauce à part", prix:1100}],
    [{q:2, nom:"Kebab XL", opt:"Galette · salade · tomate · sauce algérienne", sup:"Frites dedans", dem:"", prix:2100}, {q:2, nom:"Boisson 33 cl", opt:"Coca", dem:"", prix:360}],
    [{q:1, nom:"Sandwich américain", opt:"Steak · frites · sauce mayo · ketchup", dem:"", prix:800}],
    [{q:4, nom:"Pizza", opt:"Margherita · 4 fromages · Reine · Orientale", dem:"Couper en 8", prix:4400}, {q:2, nom:"Frites", opt:"Grande", dem:"", prix:700}, {q:1, nom:"Wings x10", opt:"Épicées", dem:"", prix:900}, {q:4, nom:"Boisson 1,5 L", opt:"Coca · Ice Tea", dem:"", prix:1200}, {q:2, nom:"Brownie", opt:"", dem:"", prix:500}],
    [{q:1, nom:"Burger poulet crispy", opt:"Poulet pané · salade · sauce andalouse", dem:"", prix:900}, {q:1, nom:"Nuggets x6", opt:"Sauce curry", dem:"", prix:550}, {q:1, nom:"Boisson 33 cl", opt:"Sprite", dem:"", prix:180}],
    [{q:1, nom:"Tacos XL", opt:"3 viandes : poulet · cordon bleu · merguez · frites · sauce fromagère", sup:"Bacon", dem:"", prix:1400}, {q:1, nom:"Boisson 33 cl", opt:"Oasis", dem:"", prix:180}],
    [{q:1, nom:"Frites", opt:"Moyenne · sauce cheddar", dem:"", prix:350}, {q:1, nom:"Cookie", opt:"", dem:"", prix:250}]
  ];
  var ORDRE_DEMO = [0, 4, 1, 8, 3, 6, 11, 2, 10, 5, 9, 7];
  var CLIENTS_DEMO = ["Inès", "Théo", "Karim", "Léa", "Mehdi", "Sarah", "Yanis", "Camille", "Nassim", "Julie", "Bilal", "Emma"];
  var ADRESSES_DEMO = [
    {numero:"3", rue:"rue Chevreul", complement:"2e étage", acces:"", km:1.8},
    {numero:"41", rue:"rue de Marseille", complement:"Bât. B, 4e", acces:"Code 2580", km:2.4},
    {numero:"12", rue:"rue Garibaldi", complement:"", acces:"Interphone Martin", km:3.1},
    {numero:"88", rue:"avenue Jean Jaurès", complement:"Bureaux, accueil", acces:"", km:1.2}
  ];
  function panierDemo(){
    var p = PANIERS_DEMO[ORDRE_DEMO[(nouvelles - 1) % ORDRE_DEMO.length]];
    return p.map(function(l){ var x = {}; for (var k in l) x[k] = l[k]; return x; });
  }

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
        lignes:panierDemo(), total:0, frais:0, paiement:"Sur place", depuis:0
      };
      c.origine = 'restaurant'; c.referenceCaisse = 'DEMO-CAISSE-' + id; c.referenceCommande = 'DEMO-CAISSE-' + id;
    } else {
      c = {
        id:id, etat:"confirmee", mode: retraitOuvert&&livraisonOuverte?(nouvelles % 2 ? "retrait" : "livraison"):(retraitOuvert?"retrait":"livraison"),
        heure:api.heure(), client: CLIENTS_DEMO[nouvelles % CLIENTS_DEMO.length],
        lignes:panierDemo(), total:0, frais:0, paiement:"Sur place", depuis:0
      };
      if (c.mode === "livraison"){ var ad = ADRESSES_DEMO[nouvelles % ADRESSES_DEMO.length]; c.frais = 250; c.km = ad.km; c.adresse = ad.numero + " " + ad.rue + (ad.complement ? ", " + ad.complement : ""); c.adresseDetail={numero:ad.numero,rue:ad.rue,codePostal:"69007",ville:"Lyon",complement:ad.complement,acces:ad.acces}; c.paiement = nouvelles % 2 ? "Carte au livreur" : "Espèces au livreur"; c.telephoneClient = "06 12 34 5" + (nouvelles % 10) + " " + (10 + nouvelles % 89); }
      c.origine = 'ia_pelyo'; c.referenceCommande = 'DEMO-PELYO-' + id;
    }
    PelyoModules.chaque('cuisine.arrivee', c, {restaurant:restaurant, nouvelles:nouvelles});
    c.total = c.lignes.reduce(function(t, l){ return t + l.prix; }, 0) + (c.frais || 0);
    c.date = new Date().toLocaleDateString('fr-FR');
    c.syncCaisse = restaurant ? 'simulee' : 'en_attente';
    c.encaissement = 'non_transmis';
    PelyoKitchen.initialise(c,Date.now(),D_.cuisineOperations.heureReference);
    c.recueAt=Date.now();
    c.promesseAt=Date.now()+(c.mode==='livraison'?delaiLivraison:delaiRetrait)*60000;
    PelyoModules.chaque('cuisine.promesse', c);
    c.prete=PelyoKitchen.hhmm(c.promesseAt);
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
    impressionAuto=true;impressionAnnulations=false;delaiLivraison=35;capacite=12;son=true;triHistorique='recent';retraitOuvert=true;livraisonOuverte=true;theme='light';
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
    theme = themeAppareil();
    menuReel = null; ingredientsReel = null; supIds = {}; infosReel = null;
    reglagesEnAttente = {}; clearTimeout(minuteurReglages); minuteurReglages = null; envoisReglages = 0;
    if (reel){ cmds = []; imprimes = {}; charge = 'normal'; delaiRetrait = 15; rupt = {}; catOff = {}; supOff = {}; ingredientOff = {}; stockFin = {}; }
    cmds.forEach(function(c){if(c.mode==='livraison'&&!c.adresseDetail){var exemple=D_.commandes.filter(function(d){return d.id===c.id&&d.adresse===c.adresse&&d.adresseDetail;})[0];if(exemple)c.adresseDetail=PelyoKitchen.clone(exemple.adresseDetail);}});
    expirerStocks();

    root = document.createElement("div");
    root.className = "k-app";
    scene.appendChild(root);
    appliquerTheme();
    /* Tablette qu'on tourne : le passe passe de colonnes à onglets. */
    var etaitLarge = grandEcran();
    function surRotation(){
      if (grandEcran() === etaitLarge) return;
      etaitLarge = grandEcran();
      if (!ops && vue === 'service') peindre();
    }
    window.addEventListener('resize', surRotation);

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
    appliquerTheme();
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

    /* Téléphone resté en mode livreur : il rouvre directement sa tournée. */
    lireLivreur(); posLivreur = null; trajetSimule = null;
    if (livreur && reel){ livreur = null; }
    if (livreur){ synchroLivreur(); if (livreur) vue = 'livreur'; }

    peindre();

    /* Connecté : réglages du service et commandes lus dans la base, puis
       tenus à jour en temps réel. */
    if (reel){
      relireReglages();
      chargerCarteReelle();
      arrets = [
        PelyoDonnees.ecouterCommandes(recevoir),
        PelyoDonnees.ecouterReglages(function(r){ if (reglagesEnCours()) return; appliquerReglages(r); if (!ops) repeindreRythme(); }),
        PelyoDonnees.ecouterCarte(chargerCarteReelle)
      ];
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
      apprendre();
      /* Rythme ouvert : les délais annoncés suivent la cuisine et les tournées. */
      if (vue === 'rythme' && !ops && !livreur && Date.now() - (derniereMajRythme) > 10000){ derniereMajRythme = Date.now(); majRythme(); }
      /* Livreurs : accord du gérant, tournées simulées, écran livreur. */
      if (!reel){
        var tourneeChange = animerTournees();
        if (livreur){
          var statutChange = synchroLivreur();
          if (statutChange || tourneeChange || (modeLivreur() && !trajetSimule && Date.now() - dernierRepeintLivreur > 15000)){ dernierRepeintLivreur = Date.now(); retenir(); peindre(); return; }
          if (modeLivreur()) return;
        } else if (tourneeChange){ retenir(); if (!ops && vue === 'service') { peindre(); return; } }
      }
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
      Array.prototype.forEach.call(root.querySelectorAll('[data-progres] > i'),function(el){var c=commande(el.parentNode.getAttribute('data-progres'));if(!c)return;var m=etapeMinuteur(c);el.style.width=progresCommande(c)+'%';el.parentNode.classList.toggle('k-sv-depasse',!!(m&&m.depasse));});
      if (Date.now() - dernierControleRetard > 10000){ dernierControleRetard = Date.now(); verifierRetards(); }
      Array.prototype.forEach.call(root.querySelectorAll('[data-minuteur]'),function(el){var c=commande(el.getAttribute('data-minuteur'));if(c)el.innerHTML=minuteurTicket(c);});
      Array.prototype.forEach.call(root.querySelectorAll('[data-hor]'),function(el){ el.textContent = horloge; });
      Array.prototype.forEach.call(root.querySelectorAll('[data-deadline]'),function(el){var c=commande(el.getAttribute('data-deadline'));if(c)el.innerHTML=delaiPromis(c);var carte=el.closest('.k-order');if(c&&carte&&!carte.classList.contains('k-state-terminee')){var u=PelyoKitchen.urgence(c,Date.now());carte.classList.toggle('k-en-retard',!!(u&&u.late));}});
    }, 1000);

    function reseau(){traiterJobs();retenir();if(!ops||ops.type==='connections')peindre();}
    window.addEventListener('online',reseau);window.addEventListener('offline',reseau);

    /* Service : en descendant dans les commandes, le haut de page (en-tête,
       titre, infos) se replie comme un volet ; il revient dès qu'on remonte. */
    window.addEventListener("resize", mesurerVolet);
    window.addEventListener("load", mesurerVolet);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(mesurerVolet);
    root.addEventListener("load", mesurerVolet, true);
    root.addEventListener("scroll", function(ev){
      var t = ev.target;
      if (!t.classList || !t.classList.contains("k-body") || vue !== "service") return;
      var y = t.scrollTop;
      root.classList.toggle("k-defile", y > 4);
      /* Rebond en bas de liste (iPhone) : ce n'est pas l'utilisateur qui remonte. */
      if (y >= t.scrollHeight - t.clientHeight - 2){ volet.dernierY = y; return; }
      if (y > 60 && y > volet.dernierY + 6) root.classList.add("k-replie");
      else if (y < Math.min(30, volet.replie - 2) || y < volet.dernierY - 6) root.classList.remove("k-replie");
      volet.dernierY = y;
    }, true);

    /* Rythme : le bouton de feu se tourne au doigt et se cale sur le cran
       le plus proche ; les + et − se répètent si on les garde appuyés. */
    var maintienRythme = false, repetition = null;
    function angleDepuis(ev, bouton){
      var r = bouton.getBoundingClientRect(), dx = ev.clientX - (r.left + r.width / 2), dy = ev.clientY - (r.top + r.height / 2);
      var a = Math.atan2(dx, -dy) * 180 / Math.PI;
      return Math.max(-135, Math.min(135, a));
    }
    function cranProche(a){
      var meilleur = 'stop', ecart = 999;
      Object.keys(ANGLES_TEMPO).forEach(function(k){ var e = Math.abs(ANGLES_TEMPO[k] - a); if (e < ecart){ ecart = e; meilleur = k; } });
      return meilleur;
    }
    function arreterRepetition(){ clearTimeout(repetition); clearInterval(repetition); repetition = null; }
    root.addEventListener("pointerdown", function(ev){
      if (vue !== 'rythme' || ops) return;
      var pas = ev.target.closest && ev.target.closest('.k-tempo-page [data-d]');
      if (pas){
        arreterRepetition(); maintienRythme = false;
        var code = pas.getAttribute('data-d');
        repetition = setTimeout(function(){
          maintienRythme = true;
          pasRythme(code);
          repetition = setInterval(function(){ if (!pasRythme(code)) arreterRepetition(); }, 110);
        }, 420);
        return;
      }
      var bouton = ev.target.closest && ev.target.closest('[data-tempo-bouton]');
      if (!bouton || ev.button > 0) return;
      ev.preventDefault();
      try { bouton.setPointerCapture(ev.pointerId); } catch(e){}
      glisseTempo = {bouton:bouton, cran:charge, pointeur:ev.pointerId, depart:ANGLES_TEMPO[charge]};
      bouton.classList.add('k-tempo-tenu');
    });
    root.addEventListener("pointermove", function(ev){
      var g = glisseTempo;
      if (!g || ev.pointerId !== g.pointeur) return;
      var a = angleDepuis(ev, g.bouton);
      g.bouton.style.setProperty('--angle', a.toFixed(1) + 'deg');
      var plein = root.querySelector('.k-tempo-plein');
      if (plein) plein.style.strokeDashoffset = remplissageTempo(Math.max(-120, Math.min(120, a)));
      var cran = cranProche(a);
      if (cran !== g.cran){
        g.cran = cran; api.vibrer(6);
        Array.prototype.forEach.call(root.querySelectorAll('.k-tempo-repere'), function(b){ b.classList.toggle('k-tempo-vise', b.getAttribute('data-charge') === cran); });
      }
    });
    function finTempo(){
      var g = glisseTempo; glisseTempo = null;
      if (!g) return;
      g.bouton.classList.remove('k-tempo-tenu');
      Array.prototype.forEach.call(root.querySelectorAll('.k-tempo-repere'), function(b){ b.classList.remove('k-tempo-vise'); });
      if (g.cran !== charge) changerCharge(g.cran); else majRythme();
    }
    root.addEventListener("pointerup", function(ev){ arreterRepetition(); if (glisseTempo && ev.pointerId === glisseTempo.pointeur) finTempo(); });
    root.addEventListener("pointercancel", function(){ arreterRepetition(); finTempo(); });
    root.addEventListener("pointerleave", arreterRepetition);
    root.addEventListener("keydown", function(ev){
      var bouton = ev.target.closest && ev.target.closest('[data-tempo-bouton]');
      if (!bouton) return;
      var ordre = ['stop','normal','rush','charge'], i = ordre.indexOf(charge);
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp'){ ev.preventDefault(); changerCharge(ordre[Math.min(3, i + 1)]); }
      if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown'){ ev.preventDefault(); changerCharge(ordre[Math.max(0, i - 1)]); }
    });

    /* Une commande se glisse vers la droite pour passer à l'étape suivante
       (même effet que son bouton). Le défilement vertical reste libre : le
       geste ne démarre que si le doigt part nettement à l'horizontale. */
    var geste = null, bloquerClic = 0;
    function finGeste(valide){
      var g = geste; geste = null;
      if (!g) return;
      g.carte.classList.remove('k-appui', 'k-glisse-actif');
      if (!g.horizontal) return;
      bloquerClic = Date.now() + 450;
      var largeur = g.carte.offsetWidth;
      if (valide && g.dx >= g.seuil){
        var depart = g.carte.animate ? g.carte.animate([{transform:g.carte.style.transform}, {transform:'translateX(' + (largeur + 40) + 'px) rotate(4deg)', opacity:0}], {duration:240, easing:'cubic-bezier(.4,0,1,1)', fill:'forwards'}) : null;
        var fait = false, suite = function(){ if (fait) return; fait = true; if (g.fond.parentNode) g.fond.parentNode.removeChild(g.fond); avancer(g.id, true); };
        if (depart) depart.onfinish = suite;
        setTimeout(suite, 320);
        return;
      }
      var retour = g.carte.animate ? g.carte.animate([{transform:g.carte.style.transform}, {transform:'none'}], {duration:420, easing:'cubic-bezier(.2,1.5,.4,1)'}) : null;
      g.carte.style.transform = '';
      g.fond.style.opacity = '0';
      setTimeout(function(){ if (g.fond.parentNode) g.fond.parentNode.removeChild(g.fond); }, retour ? 420 : 0);
    }
    root.addEventListener("pointerdown", function(ev){
      if (geste || ev.button > 0 || vue !== 'service' || ops || ouverte) return;
      var carte = ev.target.closest && ev.target.closest('.k-order[data-cmd]');
      if (!carte || ev.target.closest('input,textarea,select,summary,a')) return;
      carte.classList.add('k-appui');
      var bouton = carte.querySelector('[data-go]');
      geste = {carte:carte, id:+carte.getAttribute('data-cmd'), x:ev.clientX, y:ev.clientY, dx:0, horizontal:false, pointeur:ev.pointerId,
               action:bouton ? (bouton.classList.contains('amb') ? 'Prête' : bouton.textContent) : '', ton:bouton ? (bouton.classList.contains('rdy') ? 'vert' : bouton.classList.contains('amb') ? 'ambre' : 'orange') : '', fond:null, seuil:0, passe:false};
    });
    root.addEventListener("pointermove", function(ev){
      var g = geste;
      if (!g || ev.pointerId !== g.pointeur) return;
      var dx = ev.clientX - g.x, dy = ev.clientY - g.y;
      if (!g.horizontal){
        if (Math.abs(dy) > 8 && Math.abs(dy) >= Math.abs(dx)){ finGeste(false); return; }
        if (!g.action || dx < 12 || dx < Math.abs(dy) * 1.4) return;
        g.horizontal = true;
        g.carte.classList.remove('k-appui');
        g.carte.classList.add('k-glisse-actif', 'k-touchee');
        try { g.carte.setPointerCapture(ev.pointerId); } catch(e){}
        g.seuil = Math.min(160, g.carte.offsetWidth * 0.4);
        g.fond = document.createElement('div');
        g.fond.className = 'k-glisse-fond k-glisse-' + g.ton;
        g.fond.setAttribute('aria-hidden', 'true');
        g.fond.innerHTML = '<span>' + icone('arrow') + '<b>' + esc(g.action) + '</b></span>';
        g.fond.style.cssText = 'top:' + g.carte.offsetTop + 'px;left:' + g.carte.offsetLeft + 'px;width:' + g.carte.offsetWidth + 'px;height:' + g.carte.offsetHeight + 'px';
        g.carte.parentNode.insertBefore(g.fond, g.carte);
      }
      ev.preventDefault();
      /* Au-delà du seuil, la carte résiste (élastique). */
      var x = Math.max(0, dx);
      if (x > g.seuil) x = g.seuil + (x - g.seuil) * 0.35;
      g.dx = Math.max(0, dx);
      g.carte.style.transform = 'translateX(' + x + 'px) rotate(' + (x * 0.012) + 'deg)';
      var p = Math.min(1, x / g.seuil);
      g.fond.style.setProperty('--p', p.toFixed(3));
      var passe = g.dx >= g.seuil;
      if (passe !== g.passe){ g.passe = passe; g.fond.classList.toggle('k-glisse-ok', passe); if (passe) api.vibrer(8); }
    }, {passive:false});
    root.addEventListener("pointerup", function(ev){ if (geste && ev.pointerId === geste.pointeur) finGeste(true); });
    root.addEventListener("pointercancel", function(){ finGeste(false); });
    root.addEventListener("click", function(ev){
      if (Date.now() < bloquerClic){ ev.stopPropagation(); ev.preventDefault(); bloquerClic = 0; }
    }, true);
    window.addEventListener("resize", function(){ placerPastille(false); });

    root.addEventListener("click", function(ev){
      var t = ev.target;
      if (!t.closest) return;
      if (livreur){ clicLivreur(ev); return; }
      var settingsTab = t.closest('.k-settings-group summary');
      if (settingsTab) {
        var selectedGroup = settingsTab.parentNode;
        if (!selectedGroup.open) Array.prototype.forEach.call(root.querySelectorAll('.k-settings-group[open]'),function(group){if(group !== selectedGroup) group.open = false;});
        return;
      }
      if (reel && t.closest(BLOQUES_REEL)){ ev.preventDefault(); pasEncoreRelie(); return; }
      var SEL = "[data-import-caisse],[data-discussion],[data-fermer-discussion],[data-recap],[data-vue],[data-undo],[data-demo-arrive],[data-toggle-stock],[data-toggle-cat],[data-go],[data-open],[data-close],[data-filt],[data-son]," +
                "[data-reg],[data-unrupt],[data-charge],[data-channel],[data-ticket],[data-d]," +
                "[data-mic],[data-send],[data-menu],[data-voirticket],[data-fermer-ticket]," +
                "[data-telecharger],[data-imprimer],[data-info],[data-aide],[data-exit-demo],[data-tri]," +
                "[data-tri-ouvrir],[data-fermer-tri],[data-ops],[data-ops-close],[data-edit-order],[data-edit-address],[data-cancel-order],[data-problem],[data-ack],[data-resolve],[data-urgence],[data-remove-line],[data-add-line],[data-ops-stock],[data-link-toggle],[data-job-retry],[data-retry-all],[data-reset-demo],[data-reset-confirm],[data-theme],[data-carte-exemple]," +
                "[data-bal-k],[data-pesee-sim],[data-pesee-passer],[data-pesee-valider],[data-minuteur-reg],[data-retards],[data-scan-parti],[data-scan-livre],[data-suivi],[data-retards-seuil],[data-retards-canal],[data-retards-geste],[data-mod]";
      var b = t.closest(SEL);
      if (!b) return;
      var d = b.dataset;
      if (d.mod){ PelyoModules.clic('cuisine', d.mod, b); return; }
      if (d.retards){ retards.actif = !retards.actif; retenir(); api.vibrer(8); peindrePage(); return; }
      if (d.retardsSeuil){ retards.seuil = +d.retardsSeuil; retenir(); peindrePage(); return; }
      if (d.retardsCanal){ retards.canal = d.retardsCanal; retenir(); peindrePage(); return; }
      if (d.retardsGeste){ retards.geste = d.retardsGeste; retenir(); peindrePage(); return; }
      if(d.minuteurReg){var mr=d.minuteurReg.split(':');minuteurs[mr[0]]=Math.max(1,Math.min(90,minuteurs[mr[0]]+(+mr[1])));retenirMinuteurs();peindre();return;}
      if(d.ops){ouvrirOps(d.ops);return;}
      if(d.aide!==undefined){RIA.aide();return;}
      if(d.info){ouvrirOps('info',d.info);return;}
      if(d.theme){theme=d.theme==='dark'?'dark':'light';appliquerTheme();retenirTheme();retenir();peindre();return;}
      if(d.exitDemo!==undefined){api.fermer();return;}
      if(d.opsClose!==undefined){if(ops&&ops.type==='pesee'){clearTimeout(peseeT);pesee=null;}ops=null;peindre();return;}
      if(d.balK){
        if(d.balK==='relier') PelyoBalance.relier(function(e,simulee){if(e){api.toast(e);return;}api.toast(simulee?'Balance de démonstration reliée.':'Balance reliée.');peindre();});
        else {PelyoBalance.delier();api.toast('Balance déliée.');peindre();}
        return;
      }
      if(d.peseeSim&&pesee){pesee.poids=Math.max(0,pesee.poids+(+d.peseeSim));majPesee();return;}
      if(d.peseePasser!==undefined&&pesee){etapeSuivante(true);return;}
      if(d.peseeValider!==undefined&&pesee){etapeSuivante(false);return;}
      if(d.editOrder){ouvrirOps('edit',+d.editOrder);return;}
      if(d.editAddress){ouvrirOps('address',+d.editAddress);return;}
      if(d.cancelOrder){ouvrirOps('cancel',+d.cancelOrder);return;}
      if(d.problem){ouvrirOps('problem',+d.problem);return;}
      if(d.ack){var ac=commande(d.ack);ac.ackVersion=ac.version;if(reel)PelyoDonnees.marquerVue(ac.uuid,ac.version,function(e){if(e)api.toast(e);});peindre();return;}
      if(d.resolve){var cr=commande(d.resolve);if(reel){cr.probleme=null;PelyoDonnees.resoudreProbleme(cr.uuid,function(e){if(e)api.toast(e);});}else PelyoKitchen.resoudre(cr,Date.now());peindre();return;}
      if(d.carteExemple!==undefined){b.disabled=true;PelyoDonnees.chargerCarteExemple(function(e){if(e){b.disabled=false;api.toast(e);return;}api.toast('Carte d’exemple chargée : essayez une rupture.');chargerCarteReelle();});return;}
      if(d.urgence!==undefined){triUrgence=!triUrgence;peindre();return;}
      if(d.removeLine!==undefined){ops.lignes.splice(+d.removeLine,1);peindre();return;}
      if(d.addLine!==undefined){var it=trouverProduit((root.querySelector('#k-add-product')||{}).value);if(!it)return;ops.lignes.push({q:1,nom:it.nom,prix:it.prix,opt:'',sup:'',dem:'',allergie:''});peindre();return;}
      if(d.opsStock){
        var key=d.opsStock,id=key.slice(2),type=key.charAt(0),duration=root.querySelector('#k-stock-duration').value;
        setStock(type,id,!mapStock(type)[id],duration);
        /* Pas de nouveau rendu : la liste ne bouge pas, seule la ligne
           touchée (et les produits qu'elle bloque) change sur place. */
        majLignesStock(key);
        api.vibrer(8);
        retenir();
        return;
      }
      if(d.linkToggle){liensDemo[d.linkToggle]=!liensDemo[d.linkToggle];peindre();return;}
      if(d.jobRetry||d.retryAll!==undefined){traiterJobs(d.jobRetry);api.toast(navigator.onLine===false?'Hors ligne : opérations conservées.':'Reprise simulée : seules les connexions disponibles ont été traitées.');peindre();return;}
      if(d.resetDemo!==undefined){ops.reset=true;peindre();return;}
      if(d.resetConfirm!==undefined){try{localStorage.removeItem(STOCKAGE+D_.resto.nom);}catch(e){ops.error='Le navigateur refuse la réinitialisation de sa sauvegarde locale.';peindre();return;}api.ouvrir('cuisine');return;}
      if (d.importCaisse !== undefined) { importerCaisseDemo(); return; }
      if (d.discussion !== undefined) { discussionOuverte = true; peindre(); var couche = root.querySelector('.k-sc'); if (couche) couche.scrollTop = 0; return; }
      if (d.fermerDiscussion !== undefined) { fermerDiscussion(); return; }
      if (d.recap !== undefined) {
        var rec = root.querySelector('.k-call-recap'); rec.open = true;
        rec.scrollIntoView({behavior:api.reduit() ? 'auto' : 'smooth',block:'start'});
        var cible = rec.querySelector('summary'); if (cible) cible.focus({preventScroll:true}); return;
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
        var parentCat = carte().filter(function(cat){ return cat.items.some(function(it){ return String(it.id) === d.toggleStock; }); })[0];
        if (parentCat && catOff[parentCat.cat]) { api.toast('Rétablissez d’abord la catégorie ' + parentCat.cat + '.'); return; }
        if(bloqueParIngredient(d.toggleStock)){api.toast('Un ingrédient est en rupture : rétablissez-le dans les ruptures détaillées.');return;}
        setStock('p',d.toggleStock,!rupt[d.toggleStock]); peindrePage(); return;
      }
      if (d.toggleCat){ setStock('c',d.toggleCat,!catOff[d.toggleCat]); peindrePage(); return; }

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
        if (reel) { imprimerNavigateur(printOrder); peindre(); return; }
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
        else if (d.reg === "auto") { impressionAuto = !impressionAuto; envoyerReglages({ impression_auto:impressionAuto }); }
        else if (d.reg === "ann") { impressionAnnulations = !impressionAnnulations; envoyerReglages({ impression_annulations:impressionAnnulations }); }
        peindre(); return;
      }
      if (d.unrupt){ retablirUn(d.unrupt); return; }
      if (d.mic !== undefined){ ecouter(); return; }
      if (d.send !== undefined){ envoyerChat(); return; }
      if (d.charge){ changerCharge(d.charge); return; }
      if(d.channel){
        if(d.channel==='retrait'&&retraitOuvert&&!livraisonOuverte || d.channel==='livraison'&&livraisonOuverte&&!retraitOuvert){api.toast('Gardez au moins un canal ouvert, ou mettez le service en pause.');return;}
        if(d.channel==='retrait'){retraitOuvert=!retraitOuvert;envoyerReglages({retrait_ouvert:retraitOuvert});}
        if(d.channel==='livraison'){livraisonOuverte=!livraisonOuverte;envoyerReglages({livraison_ouverte:livraisonOuverte});}
        api.vibrer(8);
        repeindreRythme();return;
      }
      if (d.ticket){
        var idtk = +d.ticket, ctk = null;
        for (var itk = 0; itk < cmds.length; itk++) if (cmds[itk].id === idtk) ctk = cmds[itk];
        ouverte = null; vue = "tickets"; ticketOuvert = ctk;
        rafraichirTiroir(); peindre(); return;
      }
      if (d.d){ if (maintienRythme){ maintienRythme = false; return; } pasRythme(d.d); return; }
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
    var rechercheT = null;
    root.addEventListener('input',function(ev){ if (ev.target.hasAttribute('data-search-live')) { var v = ev.target.value; clearTimeout(rechercheT); rechercheT = setTimeout(function(){ recherche = v.trim(); peindre(); var champ = root.querySelector('[data-search]'); if (champ) { champ.focus(); champ.setSelectionRange(champ.value.length, champ.value.length); } }, 250); }
      if (ev.target.hasAttribute('data-chatinp')) brouillon = ev.target.value;
      if(ops&&ops.type==='edit'&&ev.target.hasAttribute('data-edit')){var field=ev.target.dataset.edit,value=ev.target.value;ops.lignes[+ev.target.dataset.index][field]=field==='q'?Number(value):field==='prix'?Math.round(Number(value)*100):value;}
    });
    root.addEventListener('submit',function(ev){
      if (ev.target.hasAttribute('data-search-form')) { ev.preventDefault(); recherche = root.querySelector('[data-search]').value.trim(); peindre(); }
      if (ev.target.hasAttribute('data-livreur-form')){
        ev.preventDefault();
        var nomLv = root.querySelector('#k-lv-nom').value.trim(), codeLv = root.querySelector('#k-lv-code').value;
        if (!nomLv){ ops.error = 'Indique ton prénom.'; peindre(); return; }
        if (PelyoTournee.normCode(codeLv) !== PelyoTournee.normCode(PelyoTournee.registre().code)){ ops.error = 'Code incorrect. Vérifie-le auprès du gérant.'; peindre(); root.querySelector('#k-lv-nom').value = nomLv; return; }
        livreur = {id:'lv-' + Date.now().toString(36), nom:nomLv.slice(0, 30), statut:'attente'};
        PelyoTournee.modifierRegistre(function(r){ r.demandes.push({id:livreur.id, nom:livreur.nom, at:Date.now()}); });
        garderLivreur(); ops = null; vue = 'livreur'; api.toast('Demande envoyée au gérant.'); peindre();
        return;
      }
      if(ev.target.hasAttribute('data-ops-form')){
        ev.preventDefault();var c=commande(ops.id),type=ev.target.getAttribute('data-ops-form');
        try{
          if(reel){envoyerOps(type,c);return;}
          if(type==='edit'){PelyoKitchen.modifier(c,ops.lignes,root.querySelector('#k-confirm-client').checked,Date.now());changementsEnregistres(c,'correctif');}
          else if(type==='address'){var a={};Array.prototype.forEach.call(root.querySelectorAll('[data-address-field]'),function(input){a[input.dataset.addressField]=input.value;});PelyoKitchen.corrigerLivraison(c,a,root.querySelector('#k-client-phone').value,root.querySelector('#k-address-confirm').checked,Date.now());changementsEnregistres(c,'livraison');}
          else if(type==='cancel'){PelyoKitchen.annuler(c,root.querySelector('#k-cancel-reason').value,Date.now());changementsEnregistres(c,'annulation');}
          else {PelyoKitchen.signaler(c,root.querySelector('#k-issue-reason').value,root.querySelector('#k-issue-note').value,root.querySelector('#k-issue-route').value,Date.now());ops=null;api.toast('Problème enregistré localement. Notification simulée uniquement.');peindre();}
        }catch(e){ops.error=e.message;peindre();}
      }
    });

    return function(){
      montageId++;
      arrets.forEach(function(arret){ try { arret(); } catch(e){} }); arrets = [];
      window.removeEventListener('resize', surRotation);
      clearTimeout(minuteurReglages); minuteurReglages = null;
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
