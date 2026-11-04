/* Module Fidélité — « Comme d'hab ? Répondez OUI ». Quand un habitué tarde
   à recommander, Pelyo lui envoie un SMS avec sa commande habituelle ; un OUI
   crée la commande en cuisine, sans appel. Envoi selon le rythme de chaque
   client, à jours fixes, ou à la main. Branché sur l'onglet Clients de
   l'appli gérant (et, en démo, sur l'arrivée des commandes en cuisine).
   Indépendant : sans ce fichier, les applis n'en savent rien. */
(function(){
  "use strict";
  var X = {};  // contexte de l'appli qui appelle (voir src/modules.js)
  var CSS = [
    ".g-cd-chiffres{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}",
    ".g-cd-chiffres div{display:flex;flex-direction:column;gap:2px}",
    ".g-cd-chiffres b{font-size:20px;font-variant-numeric:tabular-nums}",
    ".g-cd-chiffres small,.g-cd-demo{color:var(--g-muted);font-size:12px}",
    ".g-cd-demo{margin:-4px 0 0}",
    ".g-cd-liste{display:flex;flex-direction:column;gap:8px}",
    ".g-cd-seg{display:flex;gap:4px;padding:3px;border:1px solid var(--g-line);border-radius:12px}",
    ".g-cd-seg button{flex:1;min-height:36px;border:1px solid transparent;border-radius:9px;background:transparent;color:var(--g-muted);font:600 13px Inter,system-ui,sans-serif;cursor:pointer}",
    ".g-cd-seg button[aria-selected=true]{border-color:var(--g-orange);color:var(--g-orange)}",
    ".g-cd-jours{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}",
    ".g-cd-jours button{min-height:38px;border:1px solid var(--g-line);border-radius:10px;background:transparent;color:var(--g-muted);font:600 12.5px Inter,system-ui,sans-serif;cursor:pointer}",
    ".g-cd-jours button[aria-pressed=true]{border-color:var(--g-orange);color:var(--g-orange)}",
    ".g-app .g-cd-btn{min-height:44px;padding:0 16px;border:1px solid var(--g-line);border-radius:12px;background:transparent;color:var(--g-ink);font:600 14px Inter,system-ui,sans-serif;cursor:pointer}",
    ".g-app .g-cd-btn-o{border:1.5px solid var(--g-orange);color:var(--g-orange)}",
    ".g-app .g-cd>.g-cd-btn{width:100%}",
    ".g-cd-confirme{display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid var(--g-orange);border-radius:14px}",
    ".g-cd-confirme p{margin:0;font-weight:600}",
    ".g-cd-confirme span{display:flex;gap:8px}",
    ".g-app .g-cd-confirme .g-cd-btn{flex:1}",
    ".g-cd-ok{margin:0;padding:10px 12px;border:1px solid var(--g-green);border-radius:12px;color:var(--g-green);font-weight:600}"
  ].join('\n');
  var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

  /* « Comme d'hab ? Réponds OUI » : quand un habitué dépasse son rythme
     habituel de commande, Pelyo lui envoie un SMS avec sa commande habituelle.
     Un OUI crée la commande en cuisine, sans appel. Réservé aux clients
     prévenus à leur première commande ; STOP dans chaque SMS. */
  var CLE_COMMEDHAB = 'pelyo:gerant:commedhab';
  var commeDhab = (function(){ try { return localStorage.getItem(CLE_COMMEDHAB) !== 'off'; } catch(e){ return true; } })();
  /* Quand envoyer : selon le rythme de chaque client (auto), certains jours
     à heure fixe (jours), ou seulement quand le gérant appuie (main). */
  var CLE_CD_CONF = 'pelyo:gerant:commedhab-conf';
  var cdConf = (function(){ try { var x = JSON.parse(localStorage.getItem(CLE_CD_CONF) || 'null'); if (x && x.mode) return x; } catch(e){} return {mode:'auto', jours:[5, 6], heure:'18:30', cible:'retard'}; })();
  var cdConfirme = false, cdEnvoi = null;
  var JOURS_CD = [[1, 'Lun'], [2, 'Mar'], [3, 'Mer'], [4, 'Jeu'], [5, 'Ven'], [6, 'Sam'], [0, 'Dim']];
  var NOMS_JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  function garderCdConf(){ try { localStorage.setItem(CLE_CD_CONF, JSON.stringify(cdConf)); } catch(e){} }
  function cdCibles(){ var l = X.lesClients(); return cdConf.cible === 'tous' ? l.filter(function(c){ return c.nb >= 3; }) : l.filter(aRelancer); }
  function prochainEnvoi(){
    if (!cdConf.jours.length) return 'aucun jour choisi';
    var h = cdConf.heure.split(':'), now = new Date();
    for (var i = 0; i < 8; i++){
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, +h[0], +h[1]);
      if (cdConf.jours.indexOf(d.getDay()) !== -1 && d > now) return (i === 0 ? 'ce soir' : i === 1 ? 'demain' : NOMS_JOURS[d.getDay()]) + ' à ' + cdConf.heure.replace(':', ' h ');
    }
    return '—';
  }
  function decalerHeure(pas){
    var h = cdConf.heure.split(':'), m = Math.max(10 * 60, Math.min(23 * 60, +h[0] * 60 + +h[1] + pas));
    cdConf.heure = ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + m % 60).slice(-2);
  }
  function rythmeClient(c){
    if (!c.histo || c.histo.length < 2) return null;
    var ecarts = [];
    for (var i = 1; i < c.histo.length; i++) ecarts.push(c.histo[i].j - c.histo[i - 1].j);
    return Math.max(2, Math.round(ecarts.reduce(function(a, b){ return a + b; }, 0) / ecarts.length));
  }
  function aRelancer(c){ var r = rythmeClient(c); return !!(r && c.nb >= 3 && c.histo[0].j >= r + 1); }
  function smsCommeDhab(c){
    var cmd = c.habituelle ? c.habituelle.split(', en livraison')[0].split(', à emporter')[0] : c.histo[0].r;
    return X.nomResto() + ' : ' + c.prenom + ', comme d\'hab ce soir ? ' + cmd.charAt(0).toUpperCase() + cmd.slice(1) + ', ' + X.eur(c.panier) + (c.mode === 'livraison' ? ', livré' : ', à emporter') + '. Repondez OUI pour commander. STOP pour ne plus recevoir.';
  }
  function blocCommeDhab(){
    var ligne = '<button class="g-bal-ligne" role="switch" aria-checked="' + commeDhab + '" data-mod="fid:actif"><span><b>« Comme d’hab ? Réponds OUI »</b><small>' + (commeDhab ? 'Un SMS aux habitués avec leur commande habituelle' : 'Désactivé') + '</small></span><i class="g-bal-sw" aria-hidden="true"></i></button>';
    if (!commeDhab) return '<section class="g-cd">' + ligne + '</section>';
    var cibles = cdCibles();
    var modes = [['auto', 'Selon chaque client'], ['jours', 'Jours fixes'], ['main', 'À la main']];
    var reglage = '<p class="g-lab">Quand envoyer</p><div class="g-cd-seg" role="tablist">' + modes.map(function(m){ return '<button role="tab" aria-selected="' + (cdConf.mode === m[0]) + '" data-mod="fid:mode:' + m[0] + '">' + m[1] + '</button>'; }).join('') + '</div>';
    if (cdConf.mode === 'auto') reglage += '<p class="g-note">Chaque habitué reçoit le SMS quand il dépasse son rythme habituel, à l’heure où il commande d’habitude.</p>';
    if (cdConf.mode === 'jours') reglage +=
      '<div class="g-cd-jours">' + JOURS_CD.map(function(j){ return '<button aria-pressed="' + (cdConf.jours.indexOf(j[0]) !== -1) + '" data-mod="fid:jour:' + j[0] + '">' + j[1] + '</button>'; }).join('') + '</div>' +
      '<div class="g-cd-heure"><span>Heure d’envoi</span><span class="g-cd-pas"><button data-mod="fid:heure:-30" aria-label="30 minutes plus tôt">−</button><b>' + cdConf.heure.replace(':', ' h ') + '</b><button data-mod="fid:heure:30" aria-label="30 minutes plus tard">+</button></span></div>' +
      '<p class="g-note">Prochain envoi : ' + X.esc(prochainEnvoi()) + '.</p>';
    var cible = '<p class="g-lab">À qui</p><div class="g-cd-seg" role="tablist">' + [['retard', 'Habitués en retard'], ['tous', 'Tous les habitués']].map(function(m){ return '<button role="tab" aria-selected="' + (cdConf.cible === m[0]) + '" data-mod="fid:cible:' + m[0] + '">' + m[1] + '</button>'; }).join('') + '</div>';
    var envoi = cdEnvoi ? '<p class="g-cd-ok">' + cdEnvoi.n + ' SMS envoyés à ' + X.esc(cdEnvoi.h) + (X.reel() ? '' : ' (démo, rien n’est parti)') + '.</p>'
      : !cibles.length ? '' : cdConfirme
        ? '<div class="g-cd-confirme"><p>Envoyer maintenant ' + cibles.length + ' SMS ?</p><span><button class="g-cd-btn g-cd-btn-o" data-mod="fid:envoyer">Envoyer</button><button class="g-cd-btn" data-mod="fid:annuler">Annuler</button></span></div>'
        : '<button class="g-cd-btn g-cd-btn-o" data-mod="fid:maintenant">Envoyer maintenant · ' + cibles.length + ' SMS</button>';
    return '<section class="g-cd">' + ligne + reglage + cible +
      (X.reel() ? '<p class="g-note">Les premiers SMS partiront quand l’envoi sera branché.</p>' :
      '<div class="g-cd-chiffres"><div><b>38</b><small>SMS envoyés</small></div><div><b>11</b><small>« OUI » reçus</small></div><div><b>' + X.esc(X.eur(18150)) + '</b><small>commandés en plus</small></div></div><p class="g-cd-demo">Exemple fictif sur un mois.</p>') +
      envoi +
      (cibles.length ? '<p class="g-lab">' + (cdConf.mode === 'auto' ? 'Prévus ce soir' : 'Recevront le prochain SMS') + ' · ' + cibles.length + '</p><div class="g-cd-liste">' + cibles.slice(0, 4).map(function(c){
        var r = rythmeClient(c);
        return '<div class="g-cd-sms"><span><b>' + X.esc(c.prenom) + '</b><small>' + (r ? 'commande tous les ' + r + ' j · ' : '') + 'dernière il y a ' + c.histo[0].j + ' j</small></span><p>' + X.esc(smsCommeDhab(c)) + '</p></div>';
      }).join('') + (cibles.length > 4 ? '<p class="g-note">et ' + (cibles.length - 4) + ' autres.</p>' : '') + '</div>' : '<p class="g-note">Personne à relancer pour l’instant : vos habitués sont à jour.</p>') +
      '<p class="g-note">Au plus un SMS par semaine et par client. Seulement aux clients prévenus lors de leur première commande ; chaque SMS permet de répondre STOP.</p>' +
    '</section>';
  }


  function clic(ctx, valeur){
    X = ctx;
    var p = valeur.split(':'); if (p[0] !== 'fid') return false;
    var action = p[1], arg = p.slice(2).join(':');
    if (action === 'actif'){ commeDhab = !commeDhab; try { localStorage.setItem(CLE_COMMEDHAB, commeDhab ? 'on' : 'off'); } catch(e){} }
    else if (action === 'mode'){ cdConf.mode = arg; cdConfirme = false; garderCdConf(); }
    else if (action === 'jour'){ var jj = +arg, ij = cdConf.jours.indexOf(jj); if (ij === -1) cdConf.jours.push(jj); else cdConf.jours.splice(ij, 1); garderCdConf(); }
    else if (action === 'heure'){ decalerHeure(+arg); garderCdConf(); }
    else if (action === 'cible'){ cdConf.cible = arg; garderCdConf(); }
    else if (action === 'maintenant'){ cdConfirme = true; cdEnvoi = null; }
    else if (action === 'annuler') cdConfirme = false;
    else if (action === 'envoyer'){ var nb = cdCibles().length; cdConfirme = false; cdEnvoi = {n:nb, h:new Date().toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})}; }
    ctx.repeindre();
    return true;
  }
  PelyoModules.ajouter('fidelite', {
    'gerant.clients': function(ctx){ X = ctx; return blocCommeDhab(); },
    'gerant.clic': clic,
    /* Démo cuisine : de temps en temps, une commande arrive par un OUI au SMS. */
    'cuisine.arrivee': function(ctx, c, info){ if (!info.restaurant && info.nouvelles % 5 === 4) c.canal = 'sms'; }
  });
})();
