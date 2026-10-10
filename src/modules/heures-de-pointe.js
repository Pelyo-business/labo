/* Module Heures de pointe — le rush lissé. Quand la cuisine est presque
   pleine (80 % de sa capacité) ou en Rush, l'IA propose au client un créneau
   plus calme, avec un geste. Les commandes décalées sont lancées à l'heure.
   Branché sur la page Rythme de l'appli cuisine. Indépendant : sans ce
   fichier, l'appli n'en sait rien. */
(function(){
  "use strict";
  var CLE = 'pelyo:module:heures-de-pointe';
  var GESTES = {boisson:'avec la boisson offerte', remise:'avec 10 % de remise', aucun:''};
  var reglage = {actif:true, geste:'boisson'};
  try { var x = JSON.parse(localStorage.getItem(CLE) || 'null'); if (x) reglage = x; } catch(e){}
  function garder(){ try { localStorage.setItem(CLE, JSON.stringify(reglage)); } catch(e){} }

  function enCours(ctx){
    var charge = ctx.charge();
    return !!(reglage.actif && charge !== 'stop' && ctx.retraitOuvert() && (charge !== 'normal' || ctx.chargeEnCours() >= Math.ceil(ctx.capacite() * 0.8)));
  }
  function creneau(ctx){
    var t = Date.now() + (ctx.annonceRetrait() + 25) * 60000;
    return Math.ceil(t / 300000) * 300000;  // arrondi aux 5 minutes
  }
  function section(ctx){
    return '<h2 class="k-pg-section">Lisser le rush</h2>' +
      '<div class="k-pg-liste">' +
        '<div class="k-pg-ligne"><span class="k-pg-ligne-t"><b>Proposer un créneau plus calme</b><small>' + (!reglage.actif ? 'Désactivé' : enCours(ctx) ? 'En ce moment : ' + ctx.hhmm(creneau(ctx)) : 'Dès 80 % de la capacité ou en Rush') + '</small></span>' +
          ctx.interrupteur('data-mod', 'hp:actif', reglage.actif, 'Proposer un créneau plus calme') + '</div>' +
      '</div>' +
      '<div class="k-pg-segment' + (reglage.actif ? '' : ' k-pg-grise') + '" role="tablist">' + [['boisson', 'Boisson offerte'], ['remise', '−10 %'], ['aucun', 'Sans geste']].map(function(g){
        return '<button role="tab" aria-selected="' + (reglage.geste === g[0]) + '" data-mod="hp:geste:' + g[0] + '">' + g[1] + '</button>';
      }).join('') + '</div>';
  }
  function clic(ctx, valeur){
    var p = valeur.split(':'); if (p[0] !== 'hp') return false;
    if (p[1] === 'actif'){ reglage.actif = !reglage.actif; ctx.vibrer(8); }
    if (p[1] === 'geste') reglage.geste = p[2];
    garder(); ctx.repeindre();
    return true;
  }
  /* Ce que l'IA dit au client pendant le rush. */
  function phrase(ctx){
    if (!enCours(ctx)) return null;
    return 'Il y a du monde : ce sera prêt dans ' + ctx.annonceRetrait() + ' minutes, ou à ' + ctx.hhmm(creneau(ctx)) + (GESTES[reglage.geste] ? ' ' + GESTES[reglage.geste] : '') + '. Vous préférez ?';
  }
  /* Démo : une commande à emporter sur deux accepte le créneau calme. */
  function arrivee(ctx, c, info){
    if (info.restaurant || c.mode !== 'retrait' || !enCours(ctx) || info.nouvelles % 4 !== 1) return;
    c.creneauCalme = reglage.geste;
    if (reglage.geste === 'boisson') c.lignes.push({q:1, nom:'Boisson 33 cl offerte', opt:'Au choix du client', dem:'', prix:0});
    if (reglage.geste === 'remise') c.lignes.push({q:1, nom:'Remise créneau calme −10 %', opt:'', dem:'', prix:-Math.round(c.lignes.reduce(function(t, l){ return t + l.prix; }, 0) / 10)});
  }
  /* L'heure promise devient le créneau calme ; la cuisine lance la commande
     juste à temps pour la préparer. */
  function promesse(ctx, c){
    if (!c.creneauCalme) return;
    c.promesseAt = creneau(ctx);
    c.lancerA = c.promesseAt - ctx.minuteurs().preparer * 60000;
  }
  function etiquette(ctx, c){
    if (!c.creneauCalme) return '';
    return '<p class="k-sv-calme">Créneau calme accepté' + (c.creneauCalme === 'boisson' ? ' · boisson offerte' : c.creneauCalme === 'remise' ? ' · −10 %' : '') + '</p>';
  }
  PelyoModules.ajouter('heures-de-pointe', {
    'cuisine.rythme': section,
    'cuisine.clic': clic,
    'cuisine.phraseIA': phrase,
    'cuisine.arrivee': arrivee,
    'cuisine.promesse': promesse,
    'cuisine.etiquette': etiquette
  });
})();
