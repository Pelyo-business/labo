/* =========================================================================
   Pelyo — espace COMMERCIAL.
   Depuis le 28/10/2026, l'espace commercial est une seule page : l'assistant
   Pelyo en plein écran. Le commercial y pose la question d'un restaurateur ;
   l'assistant répond avec le savoir de Pelyo, ou transmet à Hayden.
   L'assistant lui-même (discussion, questions transmises, alertes) vit dans
   src/app.js (RIA.assistant) ; ce fichier ne fait que le monter.
   L'ancien espace (secteur, tournée, argumentaire, revenus) est dans
   l'historique git, commit 47ca6b0 ; les données du CRM restent en base.

   ES5 strict. Toutes les classes commencent par m-. Voir src/commercial.css.
   ========================================================================= */
(function(){
  "use strict";

  function monter(scene){
    var root = document.createElement("div");
    root.className = "m-app m-assistant";
    scene.appendChild(root);
    var demonter = RIA.assistant(root);
    return function(){ if (demonter) demonter(); };
  }

  RIA.register({
    id:"commercial", nom:"Commercial", badge:"3",
    fond:"linear-gradient(145deg,#5BE4A0,#12A05E)", encre:"#04200F",
    glyph:'<path d="M4 5h16v11H9l-5 4z"/><path d="M10 9.2a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6.9v.3m0 2.1v.01"/>',
    format:"phone",
    css:"commercial.css",
    monter:monter
  });
})();
