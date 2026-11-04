/* Module Anti-gaspi — en fin de service, la cuisine signale ce qui reste de
   cuit ; Pelyo prévient par SMS les habitués proches (ou tous les clients)
   avec une remise jusqu'à la fermeture. Branché sur la page Carte de
   l'appli cuisine. Indépendant : sans ce fichier, l'appli n'en sait rien. */
(function(){
  "use strict";
  var CLE = 'pelyo:module:anti-gaspi';
  var HABITUES_PROCHES_DEMO = 24;
  var form = null, offre = null;
  try { offre = JSON.parse(localStorage.getItem(CLE) || 'null'); } catch(e){}
  function garder(){ try { localStorage.setItem(CLE, JSON.stringify(offre)); } catch(e){} }

  var CSS = [
    ".k-app .k-pg-ag-entree{margin-top:14px}",
    ".k-app .k-pg-ag{display:flex;flex-direction:column;gap:10px;padding:14px;border:1px solid var(--p-line);border-radius:16px}",
    ".k-app .k-pg-ag p{margin:0;color:var(--p-ink);font:500 15px/1.4 Inter,system-ui,sans-serif}",
    ".k-app .k-pg-ag-q{font-weight:600!important}",
    ".k-app .k-pg-ag .k-pg-ligne{min-height:48px;padding:4px 0}",
    ".k-app .k-pg-ag .k-pg-segment{margin:0}",
    ".k-app .k-pg-puces{display:flex;flex-wrap:wrap;gap:6px}",
    ".k-app .k-pg-puces button{all:unset;cursor:pointer;padding:7px 12px;border:1px solid var(--p-line);border-radius:999px;color:var(--p-ink);font:500 13.5px Inter,system-ui,sans-serif}",
    ".k-app .k-pg-puces button[aria-pressed=true]{border-color:var(--p-orange);color:var(--p-orange)}",
    ".k-app .k-pg-ag-sms{padding:10px 12px;border:1px solid var(--p-line);border-radius:14px 14px 14px 4px;color:var(--p-muted)!important;font-size:13.5px!important}",
    ".k-app .k-pg-ag-actions,.k-app .k-pg-ag-confirme span{display:flex;gap:8px}",
    ".k-app .k-pg-ag-confirme{display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid var(--p-orange);border-radius:14px}",
    ".k-app .k-pg-ag-chiffres{display:flex;gap:18px;color:var(--p-muted);font:500 13px Inter,system-ui,sans-serif}",
    ".k-app .k-pg-ag-chiffres b{color:var(--p-ink);font-size:18px;margin-right:3px}",
    ".k-app .k-pg-ag .k-pg-lien{align-self:flex-start}",
    ".k-app .k-pg-ag p.k-pg-aide{color:var(--p-muted);font:500 13px/1.45 Inter,system-ui,sans-serif}"
  ].join('\n');
  var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

  function trouverItem(ctx, id){ var r = null; ctx.carte().forEach(function(cat){ cat.items.forEach(function(it){ if (String(it.id) === String(id)) r = it; }); }); return r; }
  function prixRemise(it, remise){ return Math.round(it.prix * (100 - remise) / 100 / 5) * 5; }
  function destinataires(ctx, f){ return f.cible === 'tous' ? (ctx.nbClients() || 418) : HABITUES_PROCHES_DEMO; }
  function libelleCible(f){ return f.cible === 'tous' ? 'clients' : 'habitués proches'; }
  function heure(h){ return h.replace(':', ' h '); }
  function sms(ctx, f){
    var it = trouverItem(ctx, f.produit); if (!it) return '';
    return ctx.resto().nom + ' : il reste ' + f.q + ' ' + it.nom + ' ce soir, -' + f.remise + ' % jusqu\'a ' + heure(f.heure) + ' (' + ctx.eur(prixRemise(it, f.remise)) + ' au lieu de ' + ctx.eur(it.prix) + '). Repondez OUI pour reserver. STOP pour ne plus recevoir.';
  }
  function bloc(ctx){
    var esc = ctx.esc;
    if (offre){
      var it = trouverItem(ctx, offre.produit), reste = offre.q - offre.vendus;
      return '<h2 class="k-pg-section">Anti-gaspi en cours</h2><div class="k-pg-ag">' +
        '<p><b>' + esc(it ? it.nom : '') + '</b> · −' + offre.remise + ' % jusqu’à ' + heure(offre.heure) + '</p>' +
        '<div class="k-pg-ag-chiffres"><span><b>' + reste + '</b> restants</span><span><b>' + offre.vendus + '</b> vendus</span><span><b>' + offre.envoyes + '</b> prévenus</span></div>' +
        '<button class="k-pg-lien" data-mod="ag:arreter">Arrêter l’offre</button></div>';
    }
    if (!form) return '<div class="k-pg-liste k-pg-ag-entree"><button class="k-pg-ligne k-pg-nav" data-mod="ag:ouvrir"><span class="k-pg-ligne-t"><b>Il reste des produits cuits ?</b><small>Prévenir les clients avec une remise</small></span>' + ctx.icone('arrow') + '</button></div>';
    var produits = [];
    ctx.carte().forEach(function(cat){ if (!ctx.categorieCoupee(cat.cat)) cat.items.forEach(function(it){ if (!ctx.stockEffectif(it, cat.cat)) produits.push(it); }); });
    var choisi = trouverItem(ctx, form.produit);
    function segment(nom, liste, valeur){ return '<div class="k-pg-segment" role="tablist">' + liste.map(function(x){ return '<button role="tab" aria-selected="' + (valeur === x[0]) + '" data-mod="ag:' + nom + ':' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>'; }
    return '<h2 class="k-pg-section">Anti-gaspi</h2><div class="k-pg-ag">' +
      '<p class="k-pg-ag-q">Qu’est-ce qui reste ?</p><div class="k-pg-puces">' + produits.map(function(it){ return '<button aria-pressed="' + (String(form.produit) === String(it.id)) + '" data-mod="ag:produit:' + esc(String(it.id)) + '">' + esc(it.nom) + '</button>'; }).join('') + '</div>' +
      '<div class="k-pg-ligne"><span class="k-pg-ligne-t"><b>Combien</b></span><span class="k-pg-pas"><button data-mod="ag:q:-1" aria-label="Un de moins">−</button><output>' + form.q + '</output><button data-mod="ag:q:1" aria-label="Un de plus">+</button></span></div>' +
      '<div class="k-pg-ligne"><span class="k-pg-ligne-t"><b>Jusqu’à</b></span><span class="k-pg-pas"><button data-mod="ag:heure:-30" aria-label="30 minutes plus tôt">−</button><output>' + heure(form.heure) + '</output><button data-mod="ag:heure:30" aria-label="30 minutes plus tard">+</button></span></div>' +
      '<p class="k-pg-ag-q">À qui</p>' + segment('cible', [['habitues', 'Habitués proches'], ['tous', 'Tous les clients']], form.cible) +
      '<p class="k-pg-ag-q">Remise</p>' + segment('remise', [['20', '−20 %'], ['30', '−30 %'], ['50', '−50 %']], String(form.remise)) +
      (choisi ? '<p class="k-pg-ag-sms">' + esc(sms(ctx, form)) + '</p>' : '') +
      (form.confirme
        ? '<div class="k-pg-ag-confirme"><p>Envoyer ce SMS à ' + destinataires(ctx, form) + ' ' + libelleCible(form) + ' ?</p><span><button class="k-pg-bouton k-pg-bouton-o" data-mod="ag:envoyer">Envoyer</button><button class="k-pg-bouton" data-mod="ag:annuler">Annuler</button></span></div>'
        : '<div class="k-pg-ag-actions"><button class="k-pg-bouton k-pg-bouton-o" data-mod="ag:confirmer"' + (choisi ? '' : ' disabled') + '>Prévenir les clients</button><button class="k-pg-bouton" data-mod="ag:annuler">Annuler</button></div>') +
      '<p class="k-pg-aide">' + (form.cible === 'tous' ? 'Tous les clients qui ont déjà commandé' : 'Habitués à moins de 3 km') + ', prévenus lors de leur première commande. Au plus un SMS anti-gaspi par soir.' + (ctx.reel() ? '' : ' Démo : aucun SMS ne part.') + '</p>' +
    '</div>';
  }
  function clic(ctx, valeur){
    var p = valeur.split(':'); if (p[0] !== 'ag') return false;
    var action = p[1], arg = p.slice(2).join(':');
    if (action === 'ouvrir') form = {produit:null, q:6, remise:30, heure:'23:00', cible:'habitues', confirme:false};
    else if (action === 'produit'){ form.produit = arg; form.confirme = false; }
    else if (action === 'q') form.q = Math.max(1, Math.min(50, form.q + (+arg)));
    else if (action === 'heure'){ var h = form.heure.split(':'), m = Math.max(18 * 60, Math.min(26 * 60, +h[0] * 60 + +h[1] + (+arg))) % 1440; form.heure = ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + m % 60).slice(-2); }
    else if (action === 'cible'){ form.cible = arg; form.confirme = false; }
    else if (action === 'remise') form.remise = +arg;
    else if (action === 'confirmer'){ if (form && form.produit) form.confirme = true; }
    else if (action === 'envoyer'){ var nb = destinataires(ctx, form), qui = libelleCible(form); offre = {produit:form.produit, q:form.q, remise:form.remise, heure:form.heure, vendus:0, envoyes:nb}; form = null; garder(); ctx.toast('SMS anti-gaspi envoyé à ' + nb + ' ' + qui + (ctx.reel() ? '.' : ' (démo).')); }
    else if (action === 'annuler') form = null;
    else if (action === 'arreter'){ offre = null; garder(); }
    ctx.repeindre();
    return true;
  }
  /* Démo : des clients répondent OUI et commandent le produit remisé. */
  function arrivee(ctx, c, info){
    if (!offre || info.restaurant || offre.vendus >= offre.q || info.nouvelles % 2 !== 1) return;
    var it = trouverItem(ctx, offre.produit); if (!it) return;
    var nb = Math.min(offre.q - offre.vendus, info.nouvelles % 3 === 0 ? 2 : 1);
    c.lignes = [{q:nb, nom:it.nom, opt:'Anti-gaspi −' + offre.remise + ' %', dem:'', prix:prixRemise(it, offre.remise) * nb}];
    c.antigaspi = offre.remise; c.canal = 'sms'; offre.vendus += nb; garder();
  }
  PelyoModules.ajouter('anti-gaspi', {
    'cuisine.carte': bloc,
    'cuisine.clic': clic,
    'cuisine.arrivee': arrivee,
    'cuisine.etiquette': function(ctx, c){ return c.antigaspi ? '<p class="k-sv-calme">Anti-gaspi −' + c.antigaspi + ' %</p>' : ''; }
  });
})();
