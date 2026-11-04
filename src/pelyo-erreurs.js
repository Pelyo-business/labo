/* =========================================================================
   Pelyo — signalement des plantages (suivi des erreurs, 8.4).

   Une erreur JavaScript non rattrapée sur un téléphone ou une tablette est
   envoyée à la base (signaler_erreur) : le fondateur la voit dans la
   console. Au plus 10 signalements par ouverture de page, chacun une seule
   fois ; rien n'est affiché à l'utilisateur et un échec d'envoi est ignoré.
   ========================================================================= */
(function(){
  "use strict";
  var deja = {}, n = 0;

  function appli(){
    if (document.querySelector('.g-app')) return 'gerant';
    if (document.querySelector('.k-app')) return 'cuisine';
    if (document.querySelector('.m-app')) return 'commercial';
    var p = location.pathname;
    return /gerant/.test(p) ? 'gerant' : /cuisine/.test(p) ? 'cuisine' : 'autre';
  }

  function envoyer(message, source, ligne, colonne, pile){
    message = String(message || '').slice(0, 500);
    if (!message || /^Script error\.?$/i.test(message) || n >= 10) return;
    var cle = message + '|' + source + '|' + ligne;
    if (deja[cle]) return;
    deja[cle] = true; n++;
    try {
      if (window.PelyoDonnees && PelyoDonnees.signalerErreur){
        PelyoDonnees.signalerErreur({ app:appli(), message:message, source:source || '', ligne:ligne || 0, colonne:colonne || 0,
          pile:String(pile || '').slice(0, 2000), page:location.href, version:(window.PELYO_ENV && PELYO_ENV.detail) || '',
          navigateur:navigator.userAgent });
      }
    } catch(e){}
  }

  window.addEventListener('error', function(e){
    if (!e || (e.target && e.target !== window)) return; /* image ou script introuvable : pas une erreur de code */
    envoyer(e.message, e.filename, e.lineno, e.colno, e.error && e.error.stack);
  });
  window.addEventListener('unhandledrejection', function(e){
    var r = e && e.reason;
    envoyer(r && r.message ? r.message : String(r), '', 0, 0, r && r.stack);
  });
})();
