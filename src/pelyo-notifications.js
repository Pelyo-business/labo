/* =========================================================================
   Pelyo — notifications du navigateur (Web Push), côté appareil.

   Ce fichier ne parle pas à Supabase : il demande l'autorisation, abonne
   ou désabonne le navigateur, et montre une notification d'exemple. Les
   abonnements sont enregistrés par PelyoDonnees ; l'affichage d'une
   notification reçue est fait par sw.js.

   Sur iPhone, les notifications ne marchent que depuis l'icône ajoutée à
   l'écran d'accueil (iOS 16.4 et plus).
   ========================================================================= */
var PelyoNotifs = (function(){
  "use strict";

  var CLE_ID = 'pelyo:notifs:id';

  function iphone(){ return /iPhone|iPad|iPod/.test(navigator.userAgent || ''); }
  function depuisIcone(){
    return window.navigator.standalone === true || !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  }

  /* 'possible' | 'bloque' | 'ios-ecran' (iPhone hors icône) | 'nonsupporte' */
  function etat(){
    var ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    if (!ok) return iphone() && !depuisIcone() ? 'ios-ecran' : 'nonsupporte';
    if (window.Notification.permission === 'denied') return 'bloque';
    return 'possible';
  }

  function enregistrement(){
    return navigator.serviceWorker.getRegistration().then(function(r){
      return r || navigator.serviceWorker.register('sw.js', { updateViaCache:'none' }).then(function(){ return navigator.serviceWorker.ready; });
    });
  }

  function demanderPermission(){
    return new Promise(function(ok){
      var p = window.Notification.requestPermission(function(x){ ok(x); });
      if (p && p.then) p.then(ok);
    });
  }

  /* Clé VAPID (base64url) → octets attendus par pushManager.subscribe. */
  function octets(b64){
    var s = (b64 + '===='.slice((b64.length % 4) || 4)).replace(/-/g, '+').replace(/_/g, '/');
    var bin = window.atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function abonnementActuel(cb){
    if (etat() === 'nonsupporte' || etat() === 'ios-ecran') return cb(null, null);
    enregistrement().then(function(r){ return r.pushManager.getSubscription(); })
      .then(function(s){ cb(null, s ? s.toJSON() : null); }, function(){ cb(null, null); });
  }

  /* cb(erreur, abonnement JSON {endpoint, keys:{p256dh, auth}}) */
  function activer(clePublique, cb){
    demanderPermission().then(function(p){
      if (p !== 'granted') return cb(p === 'denied' ? 'Notifications refusées. Autorisez-les dans les réglages du téléphone.' : 'Autorisation non donnée.');
      enregistrement().then(function(r){
        return r.pushManager.getSubscription().then(function(s){
          return s || r.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:octets(clePublique) });
        });
      }).then(function(s){ cb(null, s.toJSON()); }, function(e){ cb('Ce téléphone n’a pas pu s’abonner (' + ((e && e.message) || e) + ').'); });
    });
  }

  /* Démo : seulement l'autorisation, puis un exemple local. */
  function autoriser(cb){
    demanderPermission().then(function(p){ cb(p === 'granted' ? null : 'Notifications refusées. Autorisez-les dans les réglages du téléphone.'); });
  }

  /* cb(erreur, endpoint désabonné ou null) */
  function desactiver(cb){
    enregistrement().then(function(r){ return r.pushManager.getSubscription(); }).then(function(s){
      if (!s) return cb(null, null);
      var endpoint = s.endpoint;
      s.unsubscribe().then(function(){ cb(null, endpoint); }, function(){ cb(null, endpoint); });
    }, function(){ cb(null, null); });
    oublierId();
  }

  function exemple(titre, corps){
    enregistrement().then(function(r){
      r.showNotification(titre, { body:corps, tag:'pelyo-exemple', icon:'assets/icone-gerant-192.png', badge:'assets/icone-gerant-192.png' });
    });
  }

  function nomAppareil(){
    var ua = navigator.userAgent || '';
    var app = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'PC Windows' : 'Appareil';
    var nav = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
    return app + (nav && !(app === 'iPhone' || app === 'iPad') ? ' · ' + nav : '');
  }

  function lireId(){ try { return localStorage.getItem(CLE_ID); } catch(e){ return null; } }
  function noterId(id){ try { localStorage.setItem(CLE_ID, id); } catch(e){} }
  function oublierId(){ try { localStorage.removeItem(CLE_ID); } catch(e){} }

  return { etat:etat, abonnementActuel:abonnementActuel, activer:activer, autoriser:autoriser, desactiver:desactiver,
           exemple:exemple, nomAppareil:nomAppareil, lireId:lireId, noterId:noterId, oublierId:oublierId, octets:octets };
})();
