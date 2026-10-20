/* Tirer pour actualiser — commun à toutes les applis (gérant, cuisine, démo).
   Une app ajoutée à l'écran d'accueil d'un iPhone n'a pas le geste du
   navigateur : en haut de la page, on tire vers le bas, une pastille
   descend, et au relâché la page se recharge depuis le réseau (sw.js lit
   toujours la page sans cache), donc avec la dernière version publiée.
   Le geste ne démarre que si rien n'est défilé au-dessus du doigt, et
   jamais dans une fenêtre superposée, un champ de saisie ou un geste
   horizontal (glisser un ticket). Styles en ligne : aucune feuille touchée. */
(function(){
  "use strict";
  if (!("ontouchstart" in window)) return;
  var SEUIL = 100, MAX = 130;
  var depart = null, tire = 0, engage = false, pret = false, pastille = null, fleche = null;

  function creerPastille(){
    if (pastille) return;
    pastille = document.createElement("div");
    pastille.setAttribute("aria-hidden", "true");
    var s = pastille.style;
    s.position = "fixed"; s.left = "50%"; s.top = "env(safe-area-inset-top)"; s.zIndex = "9999";
    s.width = "40px"; s.height = "40px"; s.margin = "0 0 0 -20px"; s.borderRadius = "50%";
    s.display = "grid"; s.placeItems = "center"; s.pointerEvents = "none";
    s.background = "#17171A"; s.border = "1px solid #3A3A40"; s.boxShadow = "0 6px 18px rgba(0,0,0,.35)";
    s.transform = "translateY(-60px)"; s.opacity = "0";
    pastille.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F07A2E" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v13M6 12l6 6 6-6"/></svg>';
    fleche = pastille.firstChild;
    fleche.style.transition = "transform .18s";
    document.body.appendChild(pastille);
  }

  function placer(y, anime){
    var s = pastille.style;
    s.transition = anime ? "transform .25s cubic-bezier(.2,.8,.3,1), opacity .2s" : "none";
    s.transform = "translateY(" + (y - 50) + "px)";
    s.opacity = String(Math.min(1, y / SEUIL));
  }

  function defileAuDessus(el){
    if ((window.scrollY || document.documentElement.scrollTop || 0) > 0) return true;
    while (el && el !== document.body && el.nodeType === 1){
      if (el.scrollTop > 0){
        var o = window.getComputedStyle(el).overflowY;
        if (o === "auto" || o === "scroll") return true;
      }
      el = el.parentNode;
    }
    return false;
  }

  function horsJeu(el){
    return !!(el.closest && el.closest('input,textarea,select,[contenteditable="true"],.k-over,[role="dialog"],[data-sans-actualiser]'));
  }

  document.addEventListener("touchstart", function(e){
    depart = null; engage = false; pret = false; tire = 0;
    if (e.touches.length !== 1 || horsJeu(e.target) || defileAuDessus(e.target)) return;
    depart = {x:e.touches[0].clientX, y:e.touches[0].clientY};
  }, {passive:true});

  document.addEventListener("touchmove", function(e){
    if (!depart) return;
    var dx = e.touches[0].clientX - depart.x, dy = e.touches[0].clientY - depart.y;
    if (!engage){
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) { depart = null; return; }
      if (dy < -4) { depart = null; return; }
      if (dy > 10 && dy > Math.abs(dx) * 1.5) { engage = true; creerPastille(); }
      else return;
    }
    if (e.cancelable) e.preventDefault();
    tire = Math.max(0, Math.min(MAX, dy * 0.5));
    placer(tire, false);
    pret = tire >= SEUIL;
    fleche.style.transform = pret ? "rotate(180deg)" : "none";
  }, {passive:false});

  function relacher(){
    if (!engage) { depart = null; return; }
    engage = false; depart = null;
    if (pret){
      placer(SEUIL, true);
      fleche.style.transition = "none";
      fleche.innerHTML = '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>';
      fleche.style.transform = "none";
      if (fleche.animate) fleche.animate([{transform:"rotate(0)"}, {transform:"rotate(360deg)"}], {duration:700, iterations:Infinity});
      if (navigator.vibrate) { try { navigator.vibrate(10); } catch(x){} }
      setTimeout(function(){ window.location.reload(); }, 150);
    } else {
      placer(0, true);
    }
  }
  document.addEventListener("touchend", relacher, {passive:true});
  document.addEventListener("touchcancel", relacher, {passive:true});
})();
