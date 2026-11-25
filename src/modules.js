/* Modules Pelyo — le chargeur de blocs indépendants.

   Un module est un dossier (maquette/src/modules/<id>/) avec un manifeste déclaratif (manifest.json) et, s'il a un
   morceau d'écran, un fichier d'interface (index.js). Le catalogue de tous les manifestes est généré dans
   maquette/src/modules/catalogue.js (python3 outils/modules.py) : c'est lui, et non du code, qui dit ce que chaque
   module est, ce dont il dépend, où il se branche et ce qu'il a le droit de lire.

   - Un module n'est chargé que s'il est activé pour ce restaurant (liste « pelyo:modules:actifs »). Aucun module
     actif : rien n'est chargé, le logiciel de base n'en sait rien.
   - Le logiciel de base offre une liste FERMÉE de points de branchement (les « slots », versionnés avec l'api du
     catalogue). Un module ne peut se brancher que sur les slots que son manifeste déclare ; un slot inconnu ou une
     permission manquante est refusé (avertissement dans la console, rien ne casse).
   - Le logiciel donne aux modules un contexte LIMITÉ par leurs permissions : un module ne reçoit que les fonctions
     que son manifeste l'autorise à lire. Il n'accède jamais aux variables internes.
   - Dépendances : activer un module demande que ceux dont il dépend (« requiert ») soient déjà actifs ; en débrancher
     un dont un autre dépend est refusé.
   Voir docs/ARCHITECTURE-MODULES.md. */
(function(){
  "use strict";
  var VIDE = { api:1, familles:[], slots:{}, permissions:{}, evenements:[], contexte:{ toujours:[], par_permission:{} }, modules:[], packs:[], questions:[] };
  var CAT = window.PelyoCatalogue || null;
  if (!CAT || !CAT.modules){ avertir('Le catalogue des modules est absent : aucun module ne sera proposé.'); CAT = VIDE; }
  var CLE = 'pelyo:modules:actifs';
  var index = {};
  CAT.modules.forEach(function(m){ index[m.id] = m; });
  var modules = {}, contextes = {}, ecouteurs = [], charges = {}, retires = {}, filtres = {};
  var moi = document.currentScript && document.currentScript.src || '';
  var version = (/\?v=([^&#]+)/.exec(moi) || [])[1] || '';

  function avertir(t){ try { if (typeof console !== 'undefined' && console.warn) console.warn('[modules] ' + t); } catch(e){} }
  /* Un module qui a un morceau d'écran et qui est disponible : le seul genre que le logiciel charge. */
  function chargeable(id){ var m = index[id]; return !!(m && m.ui && m.statut !== 'bientot'); }
  function permis(id){ return (index[id] && index[id].permissions) || []; }
  function actifs(){
    try { var l = JSON.parse(localStorage.getItem(CLE) || '[]'); return Array.isArray(l) ? l.filter(chargeable) : []; }
    catch(e){ return []; }
  }
  function ecrire(l){ try { localStorage.setItem(CLE, JSON.stringify(l)); } catch(e){} }
  function appli(nom){ return nom.split('.')[0]; }
  function prevenir(id){ ecouteurs.forEach(function(f){ try { f(id); } catch(e){} }); }

  /* Le contexte d'un module : ce que le logiciel donne à tous (affichage, gestes) plus, un par un, ce que ses
     permissions autorisent. Le reste n'existe pas pour lui. */
  function contexte(app, id){
    var cle = app + ':' + id;
    if (filtres[cle]) return filtres[cle];
    var source = contextes[app] || {}, sortie = {}, ok = permis(id), c = CAT.contexte;
    c.toujours.forEach(function(n){ if (Object.prototype.hasOwnProperty.call(source, n)) sortie[n] = source[n]; });
    Object.keys(c.par_permission).forEach(function(n){
      if (ok.indexOf(c.par_permission[n]) !== -1 && Object.prototype.hasOwnProperty.call(source, n)) sortie[n] = source[n];
    });
    filtres[cle] = sortie;
    return sortie;
  }
  /* Point de branchement : chaque module actif qui le déclare est appelé, avec son propre contexte. */
  function points(nom){
    var l = [];
    Object.keys(modules).forEach(function(id){ var f = modules[id][nom]; if (typeof f === 'function') l.push({ id:id, f:f }); });
    return l;
  }
  function appel(p, nom, args){ return p.f.apply(null, [contexte(appli(nom), p.id)].concat(args)); }

  /* Charge le fichier d'interface du module, dans son dossier (même version que ce fichier). */
  function charger(id){
    if (charges[id]) return; charges[id] = true;
    var s = document.createElement('script');
    s.src = moi.replace(/modules\.js.*$/, 'modules/' + id + '/' + index[id].ui) + (version ? '?v=' + version : '');
    document.head.appendChild(s);
  }

  var API = {
    api:CAT.api,
    /* Un module s'enregistre : PelyoModules.ajouter('fidelite', { 'gerant.clients': fn, … }). */
    ajouter: function(id, def){
      var m = index[id];
      if (!m){ avertir('Module inconnu : ' + id + '.'); return; }
      var propre = {};
      Object.keys(def || {}).forEach(function(slot){
        if ((m.slots || []).indexOf(slot) === -1){ avertir(id + ' : le point de branchement « ' + slot + ' » n’est pas déclaré dans son manifeste, ignoré.'); return; }
        var exige = CAT.slots[slot] && CAT.slots[slot].permission;
        if (exige && permis(id).indexOf(exige) === -1){ avertir(id + ' : « ' + slot + ' » demande la permission ' + exige + ', ignoré.'); return; }
        if (typeof def[slot] === 'function') propre[slot] = def[slot];
      });
      modules[id] = propre; prevenir(id);
    },
    /* Le logiciel donne son contexte ('cuisine' ou 'gerant'). */
    contexte: function(app, ctx){ contextes[app] = ctx; filtres = {}; },
    /* Le logiciel repeint quand un module finit de se charger. */
    quandPret: function(f){ ecouteurs.push(f); },
    /* HTML ajouté à un point de branchement (vide sans module). */
    html: function(nom){
      var args = [].slice.call(arguments, 1);
      return points(nom).map(function(p){ try { return appel(p, nom, args) || ''; } catch(e){ return ''; } }).join('');
    },
    /* Premier résultat non vide (ex. une phrase de l'IA remplacée). */
    premier: function(nom){
      var args = [].slice.call(arguments, 1), l = points(nom);
      for (var i = 0; i < l.length; i++){ try { var r = appel(l[i], nom, args); if (r) return r; } catch(e){} }
      return null;
    },
    /* Chaque module modifie un objet (ex. une commande qui arrive). */
    chaque: function(nom){
      var args = [].slice.call(arguments, 1);
      points(nom).forEach(function(p){ try { appel(p, nom, args); } catch(e){} });
    },
    /* Un clic sur un bouton data-mod="…" : le module qui le reconnaît le traite. */
    clic: function(app, valeur, bouton){
      var l = points(app + '.clic');
      for (var i = 0; i < l.length; i++){ try { if (l[i].f(contexte(app, l[i].id), valeur, bouton)) return true; } catch(e){} }
      return false;
    },
    actifs: actifs,
    estActif: function(id){ return actifs().indexOf(id) !== -1; },
    /* Brancher un module tout de suite, sans recharger. Refusé si ce dont il dépend n'est pas actif. */
    activer: function(id){
      if (!chargeable(id)) return { ok:false, raison:'inconnu' };
      var manque = (index[id].requiert || []).filter(function(d){ return chargeable(d) && actifs().indexOf(d) === -1; });
      if (manque.length) return { ok:false, raison:'dependances', manque:manque };
      var l = actifs(); if (l.indexOf(id) === -1){ l.push(id); ecrire(l); }
      if (retires[id]){ modules[id] = retires[id]; delete retires[id]; prevenir(id); }
      else charger(id);
      return { ok:true };
    },
    /* Le débrancher : ses points de branchement se taisent aussitôt. Refusé si un module actif en dépend. */
    desactiver: function(id, forcer){
      var dependants = actifs().filter(function(x){ return (index[x].requiert || []).indexOf(id) !== -1; });
      if (dependants.length && !forcer) return { ok:false, raison:'dependants', dependants:dependants };
      ecrire(actifs().filter(function(x){ return x !== id; }));
      if (modules[id]){ retires[id] = modules[id]; delete modules[id]; prevenir(id); }
      return { ok:true };
    },
    /* Les identifiants des modules que le logiciel sait charger. */
    catalogue: function(){ return CAT.modules.filter(function(m){ return chargeable(m.id); }).map(function(m){ return m.id; }); },
    /* Le catalogue complet (manifestes), les familles, les packs métier et les questions de l'assistant de choix. */
    manifeste: function(id){ return index[id] || null; },
    manifestes: function(){ return CAT.modules.slice(); },
    familles: function(){ return CAT.familles.slice(); },
    packs: function(){ return CAT.packs.slice(); },
    questions: function(){ return CAT.questions.slice(); }
  };
  window.PelyoModules = API;

  /* Chargement des modules actifs. */
  actifs().forEach(charger);
})();
