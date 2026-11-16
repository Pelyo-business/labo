/* pelyo-file.js — les actions de la cuisine ne se perdent plus quand le réseau coupe.

   Problème : en plein service, le wifi tombe quelques secondes. Un cuisinier appuie sur « Commencer »
   ou « Prête » : avant, l'écran affichait une erreur et revenait en arrière, et l'action était perdue.

   Maintenant :
   - hors ligne (ou réseau qui échoue), l'action est GARDÉE sur la tablette (stockage local) et l'écran
     reste à jour ;
   - dès que le réseau revient, les actions partent dans l'ordre. La base les accepte sans danger même
     si l'une d'elles était déjà passée (changer_etat_commande est rejouable) ;
   - si une action n'a plus de sens (un autre appareil a déjà avancé la commande), elle est abandonnée
     et la cuisine est prévenue ;
   - une action trop ancienne (plus de 12 h) est abandonnée.

   Le noyau (PelyoFile.creer) est pur : aucune dépendance au navigateur, testé par outils/tests/file.test.js.
   Le branchement en bas de fichier enveloppe PelyoDonnees.changerEtat SANS modifier pelyo-donnees.js.
   JavaScript ES5 strict. */
var PelyoFile = (function(){
  "use strict";

  var AGE_MAX = 12 * 3600 * 1000;
  var PAUSE_REESSAI = 10000;

  /* Une erreur de réseau (à réessayer) se distingue d'un refus de la base (à abandonner). */
  function estReseau(message){
    return /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|timed out|hors ligne|pas de r[ée]seau/i.test(String(message || ""));
  }

  function creer(options){
    var o = options || {};
    var envoyer = o.envoyer;                       /* function(action, cb(erreur)) */
    var charger = o.charger || function(){ return []; };
    var sauver = o.sauver || function(){};
    var enLigne = o.enLigne || function(){ return true; };
    var maintenant = o.maintenant || function(){ return Date.now(); };
    var attendre = o.attendre || function(fn, ms){ return setTimeout(fn, ms); };
    var arreterAttente = o.arreterAttente || function(t){ clearTimeout(t); };
    var liste = [], ecoutes = [], conflits = [], enCours = false, minuteur = null;

    function lire(){
      var l = charger();
      var t = maintenant();
      liste = (l || []).filter(function(a){ return a && a.cle && (t - (a.t || 0)) < AGE_MAX; });
    }
    function ecrire(){ sauver(liste.slice()); prevenir(); }
    function prevenir(){ ecoutes.forEach(function(f){ try { f(liste.length); } catch (e) {} }); }
    function surConflit(f){ conflits.push(f); }
    function surChangement(f){ ecoutes.push(f); }
    function signalerConflit(action, message){ conflits.forEach(function(f){ try { f(action, message); } catch (e) {} }); }

    function planifier(){
      arreterAttente(minuteur); minuteur = null;
      if (!liste.length) return;
      minuteur = attendre(function(){ minuteur = null; traiter(); }, PAUSE_REESSAI);
    }

    /* Envoie les actions gardées, dans l'ordre, jusqu'à la première coupure. */
    function traiter(){
      if (enCours || !liste.length) return;
      if (!enLigne()){ planifier(); return; }
      enCours = true;
      (function suivante(){
        if (!liste.length){ enCours = false; return; }
        var a = liste[0];
        envoyer(a, function(e){
          if (!e){ liste.shift(); ecrire(); suivante(); return; }
          if (estReseau(e)){ enCours = false; planifier(); return; }
          /* Refus de la base : l'action n'a plus de sens. On l'abandonne et on prévient. */
          liste.shift(); ecrire();
          signalerConflit(a, String(e));
          suivante();
        });
      })();
    }

    /* Soumet une action. cb(erreur) :
       - rien (succès) quand l'action est partie OU gardée pour plus tard ;
       - un message quand la base la refuse (l'écran doit revenir en arrière). */
    function soumettre(action, cb){
      var a = { cle: action.cle, de: action.de, vers: action.vers, restaurant: action.restaurant, t: maintenant() };
      var derriere = liste.some(function(x){ return x.cle === a.cle; });
      if (derriere || !enLigne() || enCours){
        liste.push(a); ecrire(); traiter();
        cb(null, "gardee");
        return;
      }
      enCours = true;
      envoyer(a, function(e){
        enCours = false;
        if (!e){ cb(null, "envoyee"); traiter(); return; }
        if (estReseau(e)){ liste.push(a); ecrire(); planifier(); cb(null, "gardee"); return; }
        cb(e);
      });
    }

    function reprendre(){ lire(); prevenir(); traiter(); }
    function taille(){ return liste.length; }
    function contenu(){ return liste.slice(); }
    lire();
    return { soumettre: soumettre, traiter: traiter, reprendre: reprendre, taille: taille, contenu: contenu, surChangement: surChangement, surConflit: surConflit };
  }

  /* --------------------------------- branchement navigateur --------------------------------- */
  var instance = null;
  function cle(){
    var r = window.PelyoDonnees && PelyoDonnees.restaurant && PelyoDonnees.restaurant();
    return "pelyo:file:cuisine:" + (r && r.id ? r.id : "?");
  }
  function installer(){
    if (instance || !window.PelyoDonnees || !PelyoDonnees.changerEtat) return null;
    var originale = PelyoDonnees.changerEtat;
    var depuisOriginale = function(a, cb){ originale(a.cle, a.de, a.vers, cb); };
    instance = creer({
      envoyer: depuisOriginale,
      charger: function(){ try { return JSON.parse(localStorage.getItem(cle()) || "[]"); } catch (e) { return []; } },
      sauver: function(l){ try { localStorage.setItem(cle(), JSON.stringify(l)); } catch (e) {} },
      enLigne: function(){ return navigator.onLine !== false; }
    });
    var cleLue = cle();
    PelyoDonnees.changerEtat = function(uuid, de, vers, cb){
      var r = PelyoDonnees.restaurant && PelyoDonnees.restaurant();
      /* Le restaurant n'est connu qu'après la connexion : on relit alors les actions gardées de CE restaurant. */
      if (cle() !== cleLue){ cleLue = cle(); instance.reprendre(); }
      instance.soumettre({ cle: uuid, de: de, vers: vers, restaurant: r && r.id }, function(e, etat){ if (cb) cb(e, etat); });
    };
    window.addEventListener("online", function(){ if (cle() !== cleLue){ cleLue = cle(); instance.reprendre(); } else instance.traiter(); });
    document.addEventListener("visibilitychange", function(){ if (document.visibilityState === "visible") instance.traiter(); });
    instance.reprendre();
    return instance;
  }

  var api = {
    creer: creer, estReseau: estReseau, installer: installer,
    taille: function(){ return instance ? instance.taille() : 0; },
    surChangement: function(f){ if (instance) instance.surChangement(f); },
    surConflit: function(f){ if (instance) instance.surConflit(f); }
  };
  return api;
})();

if (typeof module !== "undefined" && module.exports) module.exports = PelyoFile;
else if (typeof window !== "undefined") { try { PelyoFile.installer(); } catch (e) {} }
