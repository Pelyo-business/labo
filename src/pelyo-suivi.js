/* Suivi de position du livreur : le plus fiable possible pour une application web.
 *
 * Ce qu'une page web PEUT faire, et que ce module fait :
 *  - lire le GPS en continu tant que la page est affichée (haute précision) ;
 *  - garder l'écran allumé (Wake Lock) et le redemander au retour au premier plan ;
 *  - mettre chaque point en FILE (conservée même si l'application est fermée) et
 *    l'envoyer par lots, avec nouvelles tentatives de plus en plus espacées ;
 *  - envoyer un signe de vie régulier (position + « page affichée ou non » +
 *    batterie) pour que le gérant distingue « il ne bouge pas » de « son
 *    application est en arrière-plan » ;
 *  - dire au livreur, sans détour, quand le suivi est coupé et pourquoi.
 * Ce qu'une page web NE PEUT PAS faire : lire le GPS quand elle n'est plus
 * affichée (autre application au premier plan, écran verrouillé). Seule une
 * application installée le permet (voir docs/MISE-EN-SERVICE.md, 2.5 bis).
 *
 * Utilisation : PelyoSuivi.demarrer({ envoyer:function(points, etat, rappel){…}, surChangement:function(etat){…} })
 * puis PelyoSuivi.arreter(). Rien n'est lu avant « demarrer ».
 */
var PelyoSuivi = (function(){
  var CLE = 'pelyo:suivi:file';
  var MAX_FILE = 300, LOT = 30;
  var ECART_MIN_MS = 4000, ECART_ARRET_MS = 20000, SIGNE_VIE_MS = 15000, FIX_FAIBLE_MS = 20000, PRECISION_MAX_M = 150;
  var o = null, suivi = null, minuteur = null, fil = [], enCours = false, echecs = 0, prochainEssai = 0, verrou = null;
  var etat = { actif:false, gps:'attente', precision:null, dernierFix:0, dernierEnvoi:0, file:0, reseau:'ok', visible:true, ecranAllume:false, manque:0, hors:0 };
  var dernierPoint = null, cacheDepuis = 0, batterie = null;

  function lire(){ try { var x = JSON.parse(localStorage.getItem(CLE) || '[]'); return Array.isArray(x) ? x : []; } catch(e){ return []; } }
  function garder(){ try { localStorage.setItem(CLE, JSON.stringify(fil.slice(-MAX_FILE))); } catch(e){} }
  function prevenir(){ etat.file = fil.length; if (o && o.surChangement) try { o.surChangement(copie()); } catch(e){} }
  function copie(){ var c = {}; for (var k in etat) c[k] = etat[k]; return c; }
  function distanceM(a, b){
    var R = 6371000, p = Math.PI / 180, dl = (b.lat - a.lat) * p, dn = (b.lon - a.lon) * p;
    var x = Math.sin(dl / 2) * Math.sin(dl / 2) + Math.cos(a.lat * p) * Math.cos(b.lat * p) * Math.sin(dn / 2) * Math.sin(dn / 2);
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  /* Un point lu par le GPS : filtré, puis mis en file. */
  function surPosition(p){
    var c = p.coords, maintenant = Date.now();
    etat.gps = 'ok'; etat.precision = Math.round(c.accuracy || 0); etat.dernierFix = maintenant;
    if (o.surPoint && (!c.accuracy || c.accuracy <= PRECISION_MAX_M)) try { o.surPoint({ lat:c.latitude, lon:c.longitude, precision:c.accuracy || 0 }); } catch(e){}
    if (c.accuracy && c.accuracy > PRECISION_MAX_M){ etat.gps = 'faible'; prevenir(); return; }   /* trop imprécis : on ne fausse pas la carte */
    var pt = { t:p.timestamp || maintenant, lat:+c.latitude.toFixed(6), lon:+c.longitude.toFixed(6), p:Math.round(c.accuracy || 0) };
    if (c.speed != null && c.speed >= 0) pt.v = +c.speed.toFixed(1);
    if (c.heading != null && !isNaN(c.heading)) pt.c = Math.round(c.heading);
    if (dernierPoint){
      var dt = pt.t - dernierPoint.t, d = distanceM(dernierPoint, pt);
      if (dt < ECART_MIN_MS) return;                                     /* pas plus d'un point toutes les 4 s */
      if (d < 8 && dt < ECART_ARRET_MS) return;                          /* à l'arrêt : un point toutes les 20 s suffit */
    }
    dernierPoint = pt; fil.push(pt); if (fil.length > MAX_FILE) fil.shift(); garder(); prevenir();
    envoyer();
  }
  function surErreur(e){
    etat.gps = e && e.code === 1 ? 'refuse' : e && e.code === 3 ? 'faible' : 'indispo';
    prevenir();
  }

  /* Envoi par lots. Un lot n'est retiré de la file qu'une fois confirmé par le serveur. */
  function envoyer(forcer){
    if (!o || enCours) return;
    var maintenant = Date.now();
    if (navigator.onLine === false){ etat.reseau = 'hors'; prevenir(); return; }
    if (!forcer && maintenant < prochainEssai) return;
    var lot = fil.slice(0, LOT);
    var etatEnvoi = { visible:document.visibilityState === 'visible' };
    if (batterie != null) etatEnvoi.batterie = batterie;
    enCours = true;
    o.envoyer(lot, etatEnvoi, function(err){
      enCours = false;
      if (err){
        echecs++; etat.reseau = 'retard';
        prochainEssai = Date.now() + Math.min(60000, 2000 * Math.pow(2, Math.min(echecs, 5)));   /* 4 s, 8 s, 16 s… 60 s */
        prevenir(); return;
      }
      echecs = 0; prochainEssai = 0; etat.reseau = 'ok'; etat.dernierEnvoi = Date.now();
      fil = fil.slice(lot.length); garder(); prevenir();
      if (fil.length) setTimeout(function(){ envoyer(true); }, 200);                              /* vider la file d'une traite au retour du réseau */
    });
  }
  function pouls(){
    if (!o) return;
    var maintenant = Date.now();
    if (etat.dernierFix && maintenant - etat.dernierFix > FIX_FAIBLE_MS && etat.gps === 'ok'){ etat.gps = 'faible'; prevenir(); }
    if (maintenant - etat.dernierEnvoi > SIGNE_VIE_MS) envoyer(true);                                /* signe de vie même sans nouveau point */
  }

  /* Écran allumé : redemandé à chaque retour au premier plan (le système le libère en arrière-plan). */
  function ecranAllumer(){
    if (!navigator.wakeLock || document.visibilityState !== 'visible' || verrou) return;
    navigator.wakeLock.request('screen').then(function(v){
      verrou = v; etat.ecranAllume = true; prevenir();
      v.addEventListener('release', function(){ verrou = null; etat.ecranAllume = false; prevenir(); });
    }, function(){ etat.ecranAllume = false; });
  }
  function surVisibilite(){
    var visible = document.visibilityState === 'visible';
    etat.visible = visible;
    if (!visible){
      cacheDepuis = Date.now();
      envoyer(true);                                                                                  /* dernier signe de vie : « je passe en arrière-plan » */
    } else {
      if (cacheDepuis){ etat.hors = Math.round((Date.now() - cacheDepuis) / 1000); etat.manque = etat.hors; cacheDepuis = 0; }
      ecranAllumer(); redemarrerGps(); envoyer(true);
    }
    prevenir();
  }
  function redemarrerGps(){
    if (!navigator.geolocation) { etat.gps = 'indispo'; return; }
    if (suivi != null) try { navigator.geolocation.clearWatch(suivi); } catch(e){}
    suivi = navigator.geolocation.watchPosition(surPosition, surErreur, { enableHighAccuracy:true, maximumAge:2000, timeout:20000 });
  }
  function permission(){
    if (!navigator.permissions || !navigator.permissions.query) return;
    navigator.permissions.query({ name:'geolocation' }).then(function(r){
      function maj(){ if (r.state === 'denied'){ etat.gps = 'refuse'; prevenir(); } }
      maj(); r.onchange = maj;
    }, function(){});
  }

  function demarrer(options){
    if (o) arreter();
    o = options; fil = lire(); etat = { actif:true, gps:'attente', precision:null, dernierFix:0, dernierEnvoi:0, file:fil.length, reseau:'ok', visible:document.visibilityState === 'visible', ecranAllume:false, manque:0, hors:0 };
    dernierPoint = null; echecs = 0; prochainEssai = 0;
    if (navigator.getBattery) navigator.getBattery().then(function(b){ batterie = Math.round(b.level * 100); b.addEventListener('levelchange', function(){ batterie = Math.round(b.level * 100); }); }, function(){});
    redemarrerGps(); ecranAllumer(); permission();
    document.addEventListener('visibilitychange', surVisibilite);
    window.addEventListener('online', function(){ envoyer(true); });
    window.addEventListener('pagehide', function(){ garder(); });
    minuteur = setInterval(pouls, 5000);
    prevenir(); envoyer(true);
  }
  function arreter(){
    if (suivi != null && navigator.geolocation) try { navigator.geolocation.clearWatch(suivi); } catch(e){}
    suivi = null; clearInterval(minuteur); minuteur = null;
    document.removeEventListener('visibilitychange', surVisibilite);
    if (verrou) try { verrou.release(); } catch(e){}
    verrou = null; if (etat) etat.actif = false;
    o = null;
  }
  function acquitterManque(){ etat.manque = 0; prevenir(); }
  /* Pour les essais : injecte un point comme si le GPS l'avait lu. */
  function injecter(lat, lon, precision){ surPosition({ timestamp:Date.now(), coords:{ latitude:lat, longitude:lon, accuracy:precision || 10, speed:null, heading:null } }); }
  return { demarrer:demarrer, arreter:arreter, etat:function(){ return copie(); }, acquitterManque:acquitterManque, injecter:injecter, vider:function(){ fil = []; garder(); } };
})();
