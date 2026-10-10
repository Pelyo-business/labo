/* =========================================================================
   Pelyo — démarrage d'un restaurant, dans l'appli gérant.
   1. Visite : chaque onglet est présenté, l'appli défile derrière.
   2. Mise en route : un assistant pose ses questions une par une, comprend
      les réponses (gerant-comprendre.js) et règle l'appli au fur et à mesure
      (nom, adresse, téléphone, horaires, livraison, délai, carte, assistant),
      puis explique le renvoi d'appel vers Pelyo.
   L'appli gérant fournit les « crochets » (lire l'état, appliquer un
   réglage, changer d'onglet) : ce module ne touche à rien d'autre.
   ES5 strict. Classes : g-dem-*. Styles : gerant.css.
   ========================================================================= */
var PelyoDemarrage = (function(){
  "use strict";
  var C = PelyoComprendre;
  var hote = null, k = null, el = null, fil = [], etape = -1, attente = null, memo = {}, occupe = false;

  function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function lent(){ return !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }

  /* ------------------------------- visite ------------------------------- */
  var PAGES = [
    { ecran:'soir', titre:'Le pilotage', texte:'Ce soir en un regard : le montant commandé, les appels, et un interrupteur pour mettre l’IA en veille. En bas, ce que Pelyo te rapporte ce mois-ci.' },
    { ecran:'appels', titre:'L’activité', texte:'Tes commandes heure par heure, le journal des appels, et tes clients avec leurs numéros. Les habitués sont reconnus quand ils rappellent.' },
    { ecran:'carte', titre:'La carte', texte:'Tout ce que l’IA peut vendre. Ajoute ou modifie un produit, ses choix et ses suppléments. Un interrupteur le met en rupture dès le prochain appel.' },
    { ecran:'assistant', titre:'L’assistant', texte:'Son prénom, son ton, et ce qu’il fait quand il ne peut pas répondre : transfert vers toi ou message.' },
    { ecran:'reglages', titre:'La gestion', texte:'Horaires, livraison, rythme du service, tablettes de la cuisine, abonnement et aide. Tout se règle ici.' }
  ];
  function visite(i){
    var p = PAGES[i];
    k.allerA(p.ecran);
    el.className = 'g-dem g-dem-visite';
    el.innerHTML = '<div class="g-dem-carte" role="dialog" aria-modal="true" aria-label="Visite de l’appli">' +
      '<div class="g-dem-points" aria-hidden="true">' + PAGES.map(function(_x, j){ return '<i' + (j === i ? ' class="g-on"' : '') + '></i>'; }).join('') + '</div>' +
      '<small>' + (i + 1) + ' / ' + PAGES.length + '</small><h2>' + esc(p.titre) + '</h2><p>' + esc(p.texte) + '</p>' +
      '<div class="g-dem-acts"><button class="g-dem-btn2" data-dem="passer">Passer</button>' +
      '<button class="g-dem-btn" data-dem="' + (i < PAGES.length - 1 ? 'suivant' : 'regler') + '">' + (i < PAGES.length - 1 ? 'Suivant' : 'Régler mon restaurant →') + '</button></div></div>';
    el.setAttribute('data-page', String(i));
    var b = el.querySelector('[data-dem="suivant"],[data-dem="regler"]'); if (b) b.focus();
  }

  /* ------------------------------- questions ------------------------------- */
  var TONS = ['chaleureux','dynamique','professionnel','de quartier'];
  function norm(s){ return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }

  var ETAPES = [
    { id:'nom',
      q:function(e){ return e.nom ? 'Pour commencer : ton restaurant s’appelle bien « ' + e.nom + ' » ? Sinon, écris son nom.' : 'Pour commencer : comment s’appelle ton restaurant ?'; },
      choix:function(e){ return e.nom ? ['Oui, c’est ça'] : []; },
      lire:function(t, e){
        if (C.ouiNon(t) === true && e.nom) return { garde:'Super.' };
        if (C.ouiNon(t) === false) return { erreur:'Écris simplement le nom du restaurant.' };
        var v = String(t).trim();
        return v.length >= 2 ? { valeur:v.slice(0, 120), dit:'Parfait, « ' + v.slice(0, 120) + ' ».' } : { erreur:'Écris le nom du restaurant.' };
      }, appliquer:'nom' },
    { id:'adresse',
      q:function(e){ return 'Son adresse ?' + (e.adresse ? ' Aujourd’hui j’ai : ' + e.adresse + '. Réponds « oui » si c’est bon.' : ' Par exemple : 12 rue Garibaldi, 69007 Lyon'); },
      choix:function(e){ return e.adresse ? ['Oui, c’est bon'] : []; },
      lire:function(t, e){
        if (C.ouiNon(t) === true && e.adresse) return { garde:'Très bien.' };
        var a = C.adresse(t);
        return a ? { valeur:a, verifierAdresse:true } : { erreur:'Je n’ai pas compris l’adresse. Écris-la comme sur une enveloppe : numéro, rue, code postal, ville.' };
      }, appliquer:'adresse' },
    { id:'tel',
      q:function(e){ return 'Le numéro que tes clients appellent aujourd’hui ?' + (e.tel ? ' (j’ai ' + e.tel + ', réponds « oui » s’il est bon)' : ''); },
      choix:function(e){ return e.tel ? ['Oui, c’est le bon'] : []; },
      lire:function(t, e){
        if (C.ouiNon(t) === true && e.tel) return { garde:'Noté.' };
        var n = C.telephone(t);
        return n ? { valeur:n, dit:'Noté : ' + n + '. C’est aussi là que je transférerai les appels que l’IA ne peut pas gérer.' } : { erreur:'Ce numéro ne ressemble pas à un numéro français à 10 chiffres. Réessaie, par exemple 04 78 12 34 56.' };
      }, appliquer:'telephone' },
    { id:'horaires',
      q:function(){ return 'Tes horaires ? Dis-les comme tu veux, par exemple : « du lundi au samedi 11h30-14h30 et 18h-23h, fermé le dimanche ».'; },
      choix:function(){ return ['Midi et soir, 7j/7', 'Le soir seulement, 7j/7']; },
      lire:function(t){
        var s = /midi et soir, 7j\/7/i.test(t) ? C.horaires('midi et soir tous les jours') : /soir seulement/i.test(t) ? C.horaires('tous les jours 18h30-23h') : C.horaires(t);
        return s ? { valeur:s, dit:'Compris : ' + C.texteSemaine(s) + '. Si c’est faux, réécris-les maintenant, sinon on continue.' }
                 : { erreur:'Je n’ai pas compris les horaires. Essaie par exemple : « tous les jours 11h30-14h30 et 18h30-23h ».' };
      }, appliquer:'horaires', relire:true },
    { id:'livre',
      q:function(){ return 'Tu fais de la livraison ?'; },
      choix:function(){ return ['Oui', 'Non, retrait seulement']; },
      lire:function(t){
        var o = C.ouiNon(t);
        if (o === null) return { erreur:'Réponds juste oui ou non.' };
        memo.livre = o;
        return o ? { garde:'D’accord, trois petites questions sur la livraison.' } : { valeur:{ ouverte:false }, dit:'OK, retrait au restaurant seulement.' };
      }, appliquer:'livraison' },
    { id:'rayon', si:function(){ return memo.livre; },
      q:function(){ return 'Jusqu’à quelle distance tu livres ?'; }, choix:function(){ return ['2 km', '3 km', '5 km', '7 km']; },
      lire:function(t){ var v = C.km(t); if (v === null) return { erreur:'Donne une distance entre 0,5 et 30 km.' }; memo.rayon = v; return { garde:v + ' km, noté.' }; } },
    { id:'minimum', si:function(){ return memo.livre; },
      q:function(){ return 'Un montant minimum pour être livré ?'; }, choix:function(){ return ['Aucun', '10 €', '15 €', '20 €']; },
      lire:function(t){ var v = /aucun|non|pas de/i.test(t) ? 0 : C.montant(t); if (v === null) return { erreur:'Donne un montant, par exemple 15 €.' }; memo.minimum = v; return { garde:v ? 'Minimum ' + (v / 100).toFixed(2).replace('.', ',') + ' €.' : 'Pas de minimum.' }; } },
    { id:'frais', si:function(){ return memo.livre; },
      q:function(){ return 'Et les frais de livraison ?'; }, choix:function(){ return ['Gratuit', '1,50 €', '2,50 €', '3 €']; },
      lire:function(t){ var v = C.montant(t); if (v === null) return { erreur:'Donne un montant, ou « gratuit ».' };
        return { valeur:{ ouverte:true, rayonM:Math.round(memo.rayon * 1000), minimum:memo.minimum, frais:v }, dit:'Livraison réglée : ' + memo.rayon + ' km, ' + (memo.minimum ? 'minimum ' + (memo.minimum / 100).toFixed(2).replace('.', ',') + ' €' : 'sans minimum') + ', ' + (v ? 'frais ' + (v / 100).toFixed(2).replace('.', ',') + ' €' : 'livraison gratuite') + '.' }; },
      appliquer:'livraison' },
    { id:'delai',
      q:function(){ return 'En général, une commande à emporter est prête en combien de temps ?'; }, choix:function(){ return ['10 min', '15 min', '20 min', '30 min']; },
      lire:function(t){ var v = C.minutes(t); return v ? { valeur:v, dit:'L’IA annoncera environ ' + v + ' minutes, et plus quand tu passes en « Rush ».' } : { erreur:'Donne un temps en minutes, par exemple 15 min.' }; },
      appliquer:'retrait' },
    { id:'carte',
      q:function(e){ return e.produits ? 'Ta carte a déjà ' + e.produits + ' produit' + (e.produits > 1 ? 's' : '') + '. Tu veux en ajouter maintenant ?' : 'Passons à ta carte. Tu préfères :'; },
      choix:function(e){ return e.produits ? ['Oui, j’en tape', 'Non, c’est bon'] : ['Partir d’une carte d’exemple', 'Taper mes produits ici', 'Plus tard']; },
      lire:function(t, e){
        if (memo.tape){
          var l = C.produits(t);
          if (!l.length) return { erreur:'Je n’ai trouvé aucun produit. Un par ligne avec son prix, par exemple « Tacos M 9,50 ».' };
          memo.tape = false;
          return { valeur:l, dit:l.length + ' produit' + (l.length > 1 ? 's ajoutés' : ' ajouté') + ' : ' + l.map(function(p){ return p.nom; }).join(', ') + '. Ajoute les choix (viandes, sauces) et suppléments dans l’onglet Carte.' , type:'produits' };
        }
        if (/exemple/i.test(t)) return { valeur:true, dit:'C’est fait : une carte d’exemple (tacos, pizzas, desserts, boissons) est chargée. Modifie les noms et les prix dans l’onglet Carte.', type:'carte-exemple' };
        if (/taper|tape|oui|ajout/i.test(norm(t)) && C.produits(t).length === 0){ memo.tape = true; return { relance:'Écris un produit par ligne avec son prix, par exemple :\nTacos M 9,50\nKebab 8\nFrites 3,50' }; }
        var l2 = C.produits(t);
        if (l2.length) return { valeur:l2, dit:l2.length + ' produit' + (l2.length > 1 ? 's ajoutés' : ' ajouté') + '. Complète-les dans l’onglet Carte.', type:'produits' };
        void e;
        return { garde:'Pas de souci, tu pourras la remplir dans l’onglet Carte.' };
      } },
    { id:'prenom',
      q:function(){ return 'Ton assistant répond au téléphone à ta place. Quel prénom lui donne-t-on ?'; }, choix:function(){ return ['Sofiane', 'Inès', 'Léa', 'Yanis']; },
      lire:function(t){ var v = String(t).trim().replace(/[^A-Za-zÀ-ÿ' -]/g, '').slice(0, 40); memo.prenom = v; return v.length >= 2 ? { valeur:v, dit:'Enchanté, ' + v + ' !' } : { erreur:'Écris juste un prénom.' }; },
      appliquer:'prenom' },
    { id:'ton',
      q:function(){ return 'Et comment doit parler ' + (memo.prenom || 'ton assistant') + ' ?'; }, choix:function(){ return ['Chaleureux', 'Dynamique', 'Professionnel', 'De quartier']; },
      lire:function(t){ var n = norm(t); for (var i = 0; i < TONS.length; i++) if (n.indexOf(TONS[i]) >= 0) return { valeur:TONS[i], dit:'Ton ' + TONS[i] + ', noté.' }; return { erreur:'Choisis un des quatre tons proposés.' }; },
      appliquer:'ton' },
    { id:'activer', derniere:true,
      q:function(e){
        return 'Dernière étape, sur le téléphone du restaurant : renvoyer vers Pelyo les appels que vous ne décrochez pas. ' +
          (e.numeroPelyo ? 'Compose **61*' + e.numeroPelyo.replace(/\s/g, '') + '**20# puis appuie sur Appeler : après 20 secondes sans réponse, Pelyo décroche. Pour l’annuler : ##61#.'
                         : 'Ton numéro Pelyo arrive tout seul dès le début de ton essai ou de ton abonnement, en quelques minutes. Tu recevras une notification, et le code à composer sera dans Gestion → Renvoi des appels.');
      },
      choix:function(){ return ['C’est noté !']; },
      lire:function(){ return { garde:'Tout est prêt. L’IA prendra les commandes avec tes réglages, et tu peux tout modifier dans Gestion.' }; } }
  ];

  function active(i){ var x = ETAPES[i]; return !x.si || x.si(); }
  function nbActives(){ var n = 0; for (var i = 0; i < ETAPES.length; i++) if (active(i)) n++; return n; }
  function rang(i){ var n = 0; for (var j = 0; j <= i; j++) if (active(j)) n++; return n; }

  /* ------------------------------- discussion ------------------------------- */
  function dire(qui, texte){ fil.push({ qui:qui, texte:texte }); }
  function peindreChat(){
    var x = etape >= 0 && etape < ETAPES.length ? ETAPES[etape] : null, e = k.etat();
    var choix = x && !occupe ? (memo.tape ? [] : x.choix(e)) : [];
    var fini = etape >= ETAPES.length;
    el.className = 'g-dem g-dem-chat';
    el.innerHTML = '<div class="g-dem-tete"><img src="assets/logo-toque.png" alt="" width="28" height="28"><div><b>Mise en route</b><small>' + (fini ? 'Terminé' : 'Étape ' + Math.max(1, rang(etape)) + ' sur ' + nbActives()) + '</small></div>' +
        '<button class="g-dem-plus-tard" data-dem="plus-tard">' + (fini ? 'Fermer' : 'Plus tard') + '</button></div>' +
      '<div class="g-dem-barre" aria-hidden="true"><i style="width:' + Math.round((fini ? 1 : (rang(etape) - 1) / nbActives()) * 100) + '%"></i></div>' +
      '<div class="g-dem-fil" aria-live="polite">' + fil.map(function(m){
        return '<p class="g-dem-' + m.qui + '">' + esc(m.texte).replace(/\n/g, '<br>') + '</p>';
      }).join('') + (occupe ? '<p class="g-dem-ia g-dem-ecrit"><i></i><i></i><i></i></p>' : '') + '</div>' +
      (fini ? '<div class="g-dem-pied"><button class="g-dem-btn" data-dem="terminer">Ouvrir mon tableau de bord</button></div>' :
        '<div class="g-dem-pied">' + (choix.length ? '<div class="g-dem-choix">' + choix.map(function(c){ return '<button data-dem-choix="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') + '</div>' : '') +
        '<form class="g-dem-saisie" data-dem-form>' + (memo.tape ? '<textarea rows="4" aria-label="Ta réponse" placeholder="Tacos M 9,50"></textarea>' : '<input aria-label="Ta réponse" autocomplete="off" placeholder="Écris ta réponse…">') +
        '<button aria-label="Envoyer"' + (occupe ? ' disabled' : '') + '>↑</button></form></div>');
    var f = el.querySelector('.g-dem-fil'); if (f) f.scrollTop = f.scrollHeight;
    var champ = el.querySelector('.g-dem-saisie input,.g-dem-saisie textarea'); if (champ && !occupe) champ.focus();
  }
  function poser(){
    while (etape < ETAPES.length && !active(etape)) etape++;
    if (etape >= ETAPES.length){ peindreChat(); return; }
    occupe = true; peindreChat();
    setTimeout(function(){ occupe = false; dire('ia', ETAPES[etape].q(k.etat())); peindreChat(); }, lent() ? 450 : 0);
  }
  function suivante(){ etape++; poser(); }

  /* Position et adresse officielles (Géoplateforme de l'IGN). Sans réponse, on garde ce qui a été tapé. */
  function verifierAdresse(a, cb){
    var q = [a.numero, a.rue, a.codePostal, a.ville].filter(Boolean).join(' ');
    var fini = false, t = setTimeout(function(){ if (!fini){ fini = true; cb(a, false); } }, 4000);
    try {
      fetch('https://data.geopf.fr/geocodage/search?index=address&limit=1&q=' + encodeURIComponent(q)).then(function(r){ return r.json(); }).then(function(j){
        if (fini) return; fini = true; clearTimeout(t);
        var f = j && j.features && j.features[0], p = f && f.properties;
        if (!p || p.score < 0.5) return cb(a, false);
        cb({ numero:p.housenumber || a.numero, rue:p.street || p.name || a.rue, codePostal:p.postcode || a.codePostal, ville:p.city || a.ville,
             lat:f.geometry.coordinates[1], lon:f.geometry.coordinates[0] }, true);
      }, function(){ if (!fini){ fini = true; clearTimeout(t); cb(a, false); } });
    } catch (e){ if (!fini){ fini = true; clearTimeout(t); cb(a, false); } }
  }

  function repondre(texte){
    texte = String(texte || '').trim();
    if (!texte || occupe || etape >= ETAPES.length) return;
    var x = ETAPES[etape], r = x.lire(texte, k.etat());
    dire('moi', texte);
    if (r.erreur){ dire('ia', r.erreur); peindreChat(); return; }
    if (r.relance){ dire('ia', r.relance); peindreChat(); return; }
    if (r.garde !== undefined && r.valeur === undefined){ dire('ia', r.garde); peindreChat(); return suivante(); }
    var type = r.type || x.appliquer;
    function appliquer(v, msg){
      occupe = true; peindreChat();
      k.appliquer(type, v, function(err){
        occupe = false;
        dire('ia', err ? 'Je n’ai pas pu l’enregistrer (' + err + '). Tu pourras le régler dans Gestion.' : msg);
        if (x.relire && !err){ attente = x; }
        peindreChat(); suivante();
      });
    }
    if (r.verifierAdresse){
      occupe = true; peindreChat();
      verifierAdresse(r.valeur, function(a, trouve){
        occupe = false;
        appliquer(a, trouve ? 'J’ai trouvé : ' + a.numero + ' ' + a.rue + ', ' + a.codePostal + ' ' + a.ville + '. Je m’en sers pour calculer les distances de livraison.' : 'Adresse notée : ' + [a.numero, a.rue, a.codePostal, a.ville].filter(Boolean).join(' ') + '.');
      });
      return;
    }
    appliquer(r.valeur, r.dit || 'C’est noté.');
  }

  /* Revenir sur la question des horaires si le gérant les réécrit juste après. */
  function repondreAvecRetour(texte){
    if (attente && attente.id === 'horaires' && ETAPES[etape] && ETAPES[etape].id === 'livre' && C.horaires(texte) && C.ouiNon(texte) === null){
      etape = ETAPES.indexOf(attente); attente = null; fil.pop(); return repondre(texte);
    }
    attente = null;
    repondre(texte);
  }

  /* ------------------------------- montage ------------------------------- */
  function clic(ev){
    var b = ev.target.closest && ev.target.closest('[data-dem],[data-dem-choix]');
    if (!b || !el.contains(b)) return;
    var d = b.getAttribute('data-dem'), c = b.getAttribute('data-dem-choix');
    if (c !== null) return repondreAvecRetour(c);
    var i = +el.getAttribute('data-page');
    if (d === 'suivant') return visite(i + 1);
    if (d === 'passer' || d === 'regler'){ k.allerA('soir'); return discuter(); }
    if (d === 'plus-tard'){ fermer(); if (etape >= ETAPES.length) k.fin(); else k.plusTard(); return; }
    if (d === 'terminer'){ fermer(); k.fin(); }
  }
  function envoi(ev){
    if (!ev.target.hasAttribute || !ev.target.hasAttribute('data-dem-form')) return;
    ev.preventDefault();
    var champ = ev.target.querySelector('input,textarea');
    if (champ) repondreAvecRetour(champ.value);
  }
  function touche(ev){
    if (ev.target.tagName === 'TEXTAREA' && ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)){ ev.preventDefault(); repondreAvecRetour(ev.target.value); }
    if (ev.key === 'Escape' && el && el.classList.contains('g-dem-visite')){ ev.stopPropagation(); k.allerA('soir'); discuter(); }
  }
  function discuter(){
    fil = []; memo = {}; etape = 0; occupe = false; attente = null;
    el.removeAttribute('data-page');
    dire('ia', 'Salut ! Je vais régler Pelyo avec toi, en 2 minutes. Réponds comme tu veux, ou touche une réponse proposée. Tu pourras tout changer ensuite dans Gestion.');
    poser();
  }
  function ouvrir(h, crochets, mode){
    fermer();
    hote = h; k = crochets;
    el = document.createElement('div');
    hote.appendChild(el);
    el.addEventListener('click', clic);
    el.addEventListener('submit', envoi);
    el.addEventListener('keydown', touche);
    if (mode === 'chat') discuter(); else visite(0);
  }
  function fermer(){ if (el && el.parentNode) el.parentNode.removeChild(el); el = null; }
  function ouvert(){ return !!el; }
  /* L'appli redessine son écran : on remet la mise en route par-dessus. */
  function rattacher(h){ if (el && h && el.parentNode !== h){ hote = h; h.appendChild(el); } }

  return { ouvrir:ouvrir, fermer:fermer, ouvert:ouvert, rattacher:rattacher, ETAPES:ETAPES };
})();
