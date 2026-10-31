/* Pelyo — tournées des livreurs, logique partagée par la cuisine (mode
   livreur) et le gérant (carte et accès).

   - Temps de trajet : distance à vol d'oiseau, corrigée des détours, à la
     vitesse d'un scooter en ville. Quand la carte réelle sera branchée
     (étape 2.5), seul tempsTrajet() changera.
   - Répartition : chaque livreur livre d'abord ce qu'il a en main, revient,
     puis reçoit les commandes suivantes par lots (proches, prêtes au même
     moment). Le calcul est refait à chaque changement : il ne garde aucun
     état et ne modifie rien.
   - Démo : un registre commun des livreurs (code, demandes, positions) est
     gardé dans le navigateur pour que la cuisine et le gérant le partagent. */
window.PelyoTournee = (function(){
  "use strict";

  var VITESSE_KMH = 22, DETOUR = 1.35, REMISE_MIN = 2, LOT_MAX = 3, ATTENTE_LOT_MIN = 4, ECART_LOT_KM = 2.5;
  var MINUTE = 60000;
  /* Démo : le restaurant d'exemple (rue Garibaldi, Lyon 7e). */
  var RESTO = {lat:45.75335, lon:4.84935};

  function rad(x){ return x * Math.PI / 180; }
  function distanceKm(a, b){
    var dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
  /* Même adresse (deux commandes pour le même client) : pas de trajet. */
  function tempsTrajet(a, b){ var d = distanceKm(a, b); return d < 0.03 ? 0 : Math.max(1, d * DETOUR / VITESSE_KMH * 60) * MINUTE; }
  function proche(a, b, metres){ return distanceKm(a, b) * 1000 <= metres; }

  function hachage(t){ var h = 2166136261; for (var i = 0; i < t.length; i++){ h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function adresseTexte(c){
    var a = c.adresseDetail;
    if (a && a.rue) return [[a.numero, a.rue].filter(Boolean).join(' '), [a.codePostal, a.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    return c.adresse || '';
  }
  /* Position d'une adresse de livraison. Démo : une position stable tirée
     de l'adresse, à la distance annoncée du restaurant. */
  function positionCommande(c){
    if (c.lat != null && c.lon != null) return {lat:c.lat, lon:c.lon};
    var h = hachage(adresseTexte(c) || String(c.id)), angle = (h % 360) * Math.PI / 180;
    var km = c.km || (1 + (h % 30) / 10);
    return {lat:RESTO.lat + km * Math.cos(angle) / 111, lon:RESTO.lon + km * Math.sin(angle) / (111 * Math.cos(rad(RESTO.lat)))};
  }
  function liensNavigation(c){
    var a = encodeURIComponent(adresseTexte(c));
    return {
      maps:'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' + a,
      waze:'https://waze.com/ul?navigate=yes&q=' + a
    };
  }

  /* planifier({maintenant, resto, livreurs:[{id, nom, pos}], commandes:[
       {id, pos, pret (ms), livreur (id si en main), enMain}]})
     → {parLivreur:{id:{etapes:[…], retour}}, attribution:{cmd:livreur}, nonAttribuees:[ids]} */
  function planifier(o){
    var resto = o.resto || RESTO, t0 = o.maintenant || Date.now();
    /* Calibrage : facteur appris sur les vraies livraisons de la soirée
       (trafic, détours) et temps de remise au client. */
    var facteur = o.facteur || 1, remise = (o.remise || REMISE_MIN) * MINUTE;
    function trajet(a, b){ return tempsTrajet(a, b) * facteur; }
    var plan = {parLivreur:{}, attribution:{}, nonAttribuees:[]};
    var libres = [];
    o.livreurs.forEach(function(l){
      var etapes = [], t = t0, p = l.pos || resto;
      var enMain = o.commandes.filter(function(c){ return c.enMain && c.livreur === l.id; });
      while (enMain.length){
        enMain.sort(function(a, b){ return distanceKm(p, a.pos) - distanceKm(p, b.pos); });
        var c = enMain.shift(), duree = trajet(p, c.pos);
        /* Même adresse que la précédente : remise en une seule fois. */
        if (!duree && etapes.length) t -= remise;
        t += duree;
        etapes.push({type:'livrer', commande:c.id, arrivee:t});
        plan.attribution[c.id] = l.id;
        t += remise; p = c.pos;
      }
      if (!proche(p, resto, 80)){ t += trajet(p, resto); etapes.push({type:'retour', arrivee:t}); }
      plan.parLivreur[l.id] = {etapes:etapes, retour:t};
      libres.push({id:l.id, libre:t});
    });
    var attente = o.commandes.filter(function(c){ return !c.enMain; }).sort(function(a, b){ return a.pret - b.pret || a.id - b.id; });
    var tours = 0;
    while (attente.length && libres.length && tours < 40){
      tours++;
      libres.sort(function(a, b){ return a.libre - b.libre; });
      var l2 = libres[0], premiere = attente[0];
      var depart = Math.max(l2.libre, premiere.pret), lot = [premiere];
      attente.slice(1).forEach(function(c){
        if (lot.length >= LOT_MAX) return;
        if (c.pret > depart + ATTENTE_LOT_MIN * MINUTE) return;
        if (distanceKm(premiere.pos, c.pos) > ECART_LOT_KM) return;
        lot.push(c); depart = Math.max(depart, c.pret);
      });
      attente = attente.filter(function(c){ return lot.indexOf(c) === -1; });
      var etapes2 = plan.parLivreur[l2.id].etapes, ids = lot.map(function(c){ return c.id; });
      if (depart > l2.libre + MINUTE) etapes2.push({type:'attendre', debut:l2.libre, jusqua:depart, commandes:ids});
      etapes2.push({type:'recuperer', commandes:ids, a:depart});
      var t2 = depart, p2 = resto, reste = lot.slice();
      while (reste.length){
        reste.sort(function(a, b){ return distanceKm(p2, a.pos) - distanceKm(p2, b.pos); });
        var c2 = reste.shift(), trajet2 = trajet(p2, c2.pos);
        if (!trajet2 && reste.length < lot.length - 1) t2 -= remise;
        t2 += trajet2;
        etapes2.push({type:'livrer', commande:c2.id, arrivee:t2});
        plan.attribution[c2.id] = l2.id;
        t2 += remise; p2 = c2.pos;
      }
      t2 += trajet(p2, resto);
      etapes2.push({type:'retour', arrivee:t2});
      plan.parLivreur[l2.id].retour = t2;
      l2.libre = t2;
    }
    plan.nonAttribuees = attente.map(function(c){ return c.id; });
    return plan;
  }

  /* Heure d'arrivée d'une livraison commandée maintenant (pour l'annonce
     de l'IA au téléphone) : la commande fictive passe dans le même calcul. */
  function estimerNouvelle(o, preparationMin){
    var fictive = {id:-1, pos:o.posClient || positionCommande({id:'nouvelle', km:2}), pret:(o.maintenant || Date.now()) + preparationMin * MINUTE, enMain:false};
    var plan = planifier({maintenant:o.maintenant, resto:o.resto, livreurs:o.livreurs, commandes:o.commandes.concat([fictive]), facteur:o.facteur, remise:o.remise});
    var arrivee = null;
    Object.keys(plan.parLivreur).forEach(function(id){
      plan.parLivreur[id].etapes.forEach(function(e){ if (e.type === 'livrer' && e.commande === -1) arrivee = e.arrivee; });
    });
    return arrivee;
  }

  /* La cuisine réelle : à quelle heure chaque commande sera prête, d'après la
     file d'attente, le temps de préparation constaté ce soir et le nombre de
     commandes que la cuisine prépare en même temps (constaté aussi).
     commandes : [{id, etat, recueAt, commenceAt}] ; renvoie {id: heure}, et
     .nouvelle = l'heure d'une commande reçue maintenant. */
  function estimerCuisine(o){
    var now = o.maintenant || Date.now(), duree = o.dureePrep || 12 * MINUTE, postes = Math.max(2, o.postes || 2);
    var res = {}, libres = [];
    /* Débit constaté (commandes passées en « Prête » par minute) : utile si
       l'équipe n'appuie pas sur « Commencer » pour chaque commande. Chaque
       méthode surestime quand elle se trompe : on garde la plus courte. */
    if (o.debit){
      var parPostes = estimerCuisine({maintenant:now, dureePrep:duree, postes:postes, commandes:o.commandes}), parDebit = estimerCuisine({maintenant:now, dureePrep:duree, debitSeul:o.debit, commandes:o.commandes});
      Object.keys(parPostes).forEach(function(k){ res[k] = Math.min(parPostes[k], parDebit[k] || parPostes[k]); });
      return res;
    }
    if (o.debitSeul){
      var debit = o.debitSeul;
      var rang = 0;
      o.commandes.filter(function(c){ return c.etat === 'preparation'; }).sort(function(a, b){ return (a.commenceAt || 0) - (b.commenceAt || 0); }).forEach(function(c){
        rang++; res[c.id] = Math.max(now + MINUTE, Math.min((c.commenceAt || now) + duree, now + rang / debit * MINUTE));
      });
      o.commandes.filter(function(c){ return c.etat === 'confirmee'; }).sort(function(a, b){ return (a.recueAt || 0) - (b.recueAt || 0); }).forEach(function(c){
        rang++; res[c.id] = Math.max(now + duree, now + rang / debit * MINUTE);
      });
      res.nouvelle = Math.max(now + duree, now + (rang + 1) / debit * MINUTE);
      return res;
    }
    o.commandes.filter(function(c){ return c.etat === 'preparation'; }).forEach(function(c){
      /* Déjà commencée : il lui reste le temps habituel moins ce qui est fait (au moins une minute). */
      var fin = Math.max(now + MINUTE, (c.commenceAt || now) + duree);
      res[c.id] = fin; libres.push(fin);
    });
    while (libres.length < postes) libres.push(now);
    libres.sort(function(a, b){ return a - b; });
    function suivante(){ var debut = Math.max(now, libres.shift()), fin = debut + duree; libres.push(fin); libres.sort(function(a, b){ return a - b; }); return fin; }
    o.commandes.filter(function(c){ return c.etat === 'confirmee'; }).sort(function(a, b){ return (a.recueAt || 0) - (b.recueAt || 0); }).forEach(function(c){ res[c.id] = suivante(); });
    res.nouvelle = suivante();
    return res;
  }
  /* Ce qu'on annonce au client, arrondi aux 5 minutes supérieures.
     Livraison : + 5 % + 2 min, car les commandes qui arriveront après la
     sienne peuvent encore la retarder. Réglages choisis sur des soirées
     simulées (calme à très chargé, 1 à 3 livreurs) : avec 2 livreurs ou
     plus, moins de 15 % de clients livrés plus de 10 min après l'annonce. */
  function annoncer(minutes, type){
    var v = type === 'livraison' ? minutes * 1.05 + 2 : minutes;
    return Math.max(5, Math.ceil(v / 5) * 5);
  }

  /* ------------------------- registre de la démo ------------------------- */
  var CLE = 'pelyo:livreurs:demo:v1';
  function registreInitial(){
    return {
      code:'LIV-4821',
      demandes:[],
      livreurs:[{id:'karim', nom:'Karim', statut:'actif', depuis:Date.now() - 50 * MINUTE, simule:true,
                 pos:{lat:RESTO.lat + 0.011, lon:RESTO.lon - 0.006}}],
      instantane:null
    };
  }
  function lire(){
    try { var r = JSON.parse(localStorage.getItem(CLE) || 'null'); if (r && r.code) return r; } catch(e){}
    return registreInitial();
  }
  function ecrire(r){
    try { localStorage.setItem(CLE, JSON.stringify(r)); } catch(e){}
    return r;
  }
  function modifier(f){ var r = lire(); f(r); return ecrire(r); }
  function normCode(c){ return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

  return {
    RESTO:RESTO, MINUTE:MINUTE,
    distanceKm:distanceKm, tempsTrajet:tempsTrajet, proche:proche,
    positionCommande:positionCommande, adresseTexte:adresseTexte, liensNavigation:liensNavigation,
    planifier:planifier, estimerNouvelle:estimerNouvelle, estimerCuisine:estimerCuisine, annoncer:annoncer,
    registre:lire, modifierRegistre:modifier, normCode:normCode,
    reinitialiser:function(){ try { localStorage.removeItem(CLE); } catch(e){} }
  };
})();
