/* Écran fixe : pas de zoom au pincement ni au double toucher, comme dans une vraie application.
   (Le réglage de la page et le CSS font déjà le gros du travail ; iOS ignore parfois la balise viewport,
   d'où ces garde-fous.) Ne change rien à l'affichage. */
(function(){
  "use strict";
  var opt = { passive: false };
  function stop(e){ if (e.cancelable) e.preventDefault(); }
  // Pincement sur iOS Safari.
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function(n){ document.addEventListener(n, stop, opt); });
  // Pincement à deux doigts (autres navigateurs).
  document.addEventListener('touchmove', function(e){ if (e.touches && e.touches.length > 1) stop(e); }, opt);
  // Ctrl + molette (zoom du navigateur de bureau).
  window.addEventListener('wheel', function(e){ if (e.ctrlKey) stop(e); }, opt);
})();
