/* Modules Pelyo — le socle qui permet de brancher une fonction en option
   (Heures de pointe, Fidélité, Anti-gaspi…) sans toucher à l'appli de base.

   - Chaque module vit dans son propre fichier, maquette/src/modules/<id>.js,
     et n'est chargé que s'il est activé pour ce restaurant.
   - Activés : la liste enregistrée sous « pelyo:modules:actifs » (plus tard,
     la marketplace de l'appli gérant l'écrira ; pour l'instant aucun module
     n'est actif, donc rien n'est chargé).
   - L'appli de base appelle des « points de branchement » (une section de
     Rythme, un bloc de la Carte, l'arrivée d'une commande…). Un module
     déclare ce qu'il ajoute à chacun ; sans module, ces points ne font rien.
   - L'appli donne aux modules un contexte (fonctions et valeurs utiles) ; les
     modules n'accèdent jamais directement à ses variables internes. */
(function(){
  "use strict";
  var CLE = 'pelyo:modules:actifs';
  var CATALOGUE = ['heures-de-pointe', 'fidelite', 'anti-gaspi'];
  var modules = {}, contextes = {}, ecouteurs = [];

  function actifs(){
    try { var l = JSON.parse(localStorage.getItem(CLE) || '[]'); return Array.isArray(l) ? l.filter(function(id){ return CATALOGUE.indexOf(id) !== -1; }) : []; }
    catch(e){ return []; }
  }
  /* Point de branchement : chaque module actif qui le déclare est appelé. */
  function points(nom){
    var l = [];
    Object.keys(modules).forEach(function(id){ var f = modules[id][nom]; if (typeof f === 'function') l.push(f); });
    return l;
  }
  function contexte(app){ return contextes[app] || {}; }
  function appli(nom){ return nom.split('.')[0]; }

  var API = {
    /* Un module s'enregistre : PelyoModules.ajouter('fidelite', { 'gerant.clients': fn, … }). */
    ajouter: function(id, def){ modules[id] = def || {}; ecouteurs.forEach(function(f){ try { f(id); } catch(e){} }); },
    /* L'appli donne son contexte ('cuisine' ou 'gerant'). */
    contexte: function(app, ctx){ contextes[app] = ctx; },
    /* L'appli repeint quand un module finit de se charger. */
    quandPret: function(f){ ecouteurs.push(f); },
    /* HTML ajouté à un point de branchement (vide sans module). */
    html: function(nom){
      var args = [contexte(appli(nom))].concat([].slice.call(arguments, 1));
      return points(nom).map(function(f){ try { return f.apply(null, args) || ''; } catch(e){ return ''; } }).join('');
    },
    /* Premier résultat non vide (ex. une phrase de l'IA remplacée). */
    premier: function(nom){
      var args = [contexte(appli(nom))].concat([].slice.call(arguments, 1)), l = points(nom);
      for (var i = 0; i < l.length; i++){ try { var r = l[i].apply(null, args); if (r) return r; } catch(e){} }
      return null;
    },
    /* Chaque module modifie un objet (ex. une commande qui arrive). */
    chaque: function(nom){
      var args = [contexte(appli(nom))].concat([].slice.call(arguments, 1));
      points(nom).forEach(function(f){ try { f.apply(null, args); } catch(e){} });
    },
    /* Un clic sur un bouton data-mod="…" : le module qui le reconnaît le traite. */
    clic: function(app, valeur, bouton){
      var l = points(app + '.clic');
      for (var i = 0; i < l.length; i++){ try { if (l[i](contexte(app), valeur, bouton)) return true; } catch(e){} }
      return false;
    },
    actifs: actifs,
    catalogue: function(){ return CATALOGUE.slice(); }
  };
  window.PelyoModules = API;

  /* Chargement des modules actifs, à côté de ce fichier (même version). */
  var moi = document.currentScript && document.currentScript.src || '';
  var version = (/\?v=([^&#]+)/.exec(moi) || [])[1] || '';
  actifs().forEach(function(id){
    var s = document.createElement('script');
    s.src = moi.replace(/modules\.js.*$/, 'modules/' + id + '.js') + (version ? '?v=' + version : '');
    document.head.appendChild(s);
  });
})();
