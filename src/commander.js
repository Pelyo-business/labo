/* Page publique « Commander » d'un restaurant (module « Commande par lien et QR code »).
   Sans compte : le client voit la carte, compose un panier, donne son prénom et son téléphone, et la commande arrive en cuisine.
   La page parle à la fonction serveur « commande-lien » ; les PRIX affichés ici ne servent qu'à l'affichage : la base les
   recalcule toujours à partir de la carte du restaurant. Adresse : …/commander/<nom-du-restaurant> (voir 404.html),
   ou commander.html?r=<nom-du-restaurant>. Voir docs/COMMANDE-LIEN-QR.md. */
(function(){
  "use strict";
  var racine = document.getElementById('page');
  var barre = document.getElementById('barre');
  var API = ((window.PELYO_CONFIG && window.PELYO_CONFIG.supabaseUrl) || '') + '/functions/v1/commande-lien';
  var MAX_LIGNES = 20, MAX_QTE = 20, MAX_TOTAL = 50000;

  var slug = (function(){
    var q = /[?&]r=([a-z0-9-]+)/.exec(location.search);
    if (q) return q[1];
    var p = /\/commander\/([a-z0-9-]+)\/?$/.exec(location.pathname);
    return p ? p[1] : '';
  })();

  var etat = { carte:null, panier:[], cle:'', envoi:false, erreur:'', confirmation:null };

  /* ------------------------------ outils ------------------------------ */
  function esc(t){ return String(t === null || t === undefined ? '' : t).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function eur(c){ return (c / 100).toFixed(2).replace('.', ',') + ' €'; }
  function cleCourte(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
  function stocker(){ try { sessionStorage.setItem('pelyo:commander:' + slug, JSON.stringify({ panier:etat.panier, cle:etat.cle })); } catch(e){} }
  function relire(){
    try {
      var x = JSON.parse(sessionStorage.getItem('pelyo:commander:' + slug) || 'null');
      if (x && x.panier instanceof Array){ etat.panier = x.panier; etat.cle = x.cle || ''; }
    } catch(e){}
  }
  function produit(id){
    var l = (etat.carte && etat.carte.produits) || [];
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  }
  function prixLigne(p, choix, supp){
    var u = p.prix_cents, i, j;
    (p.choix_obligatoires || []).forEach(function(g){ g.choix.forEach(function(c){ if (choix.indexOf(c.id) !== -1) u += c.supplement_cents; }); });
    (p.supplements || []).forEach(function(s){ if (supp.indexOf(s.id) !== -1) u += s.prix_cents; });
    return u;
  }
  function libelleOptions(p, choix, supp){
    var t = [];
    (p.choix_obligatoires || []).forEach(function(g){ g.choix.forEach(function(c){ if (choix.indexOf(c.id) !== -1) t.push(c.nom); }); });
    (p.supplements || []).forEach(function(s){ if (supp.indexOf(s.id) !== -1) t.push('+ ' + s.nom); });
    return t.join(', ');
  }
  function totalPanier(){
    var t = 0;
    etat.panier.forEach(function(l){ var p = produit(l.produit); if (p) t += prixLigne(p, l.choix, l.supplements) * l.quantite; });
    return t;
  }
  function nbArticles(){ var n = 0; etat.panier.forEach(function(l){ n += l.quantite; }); return n; }
  function delaiTexte(){
    var d = etat.carte && etat.carte.delai_estime_min;
    return d ? 'environ ' + d + ' min' : '';
  }
  function telLien(){
    var t = etat.carte && etat.carte.telephone;
    return t ? '<a href="tel:' + esc(String(t).replace(/[^0-9+]/g, '')) + '">' + esc(t) + '</a>' : '';
  }

  /* ------------------------------ serveur ------------------------------ */
  function appeler(corps, cb){
    if (!window.fetch || !API || API.indexOf('/functions/') === 0){ return cb('Cette page n’est pas disponible pour le moment.'); }
    window.fetch(API, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(corps) })
      .then(function(r){ return r.text().then(function(t){ var j = null; try { j = t ? JSON.parse(t) : null; } catch(e){} return { ok:r.ok, j:j }; }); })
      .then(function(x){
        if (x.j && x.j.ok) return cb(null, x.j);
        cb((x.j && x.j.erreur) || 'Un souci de notre côté. Réessayez dans un instant.');
      }, function(){ cb('Pas de connexion internet. Réessayez.'); });
  }

  /* ------------------------------ page ------------------------------ */
  function entete(){
    var c = etat.carte || {};
    return '<header class="entete"><img src="assets/logo-toque.png" alt="">' +
      '<div><h1>' + esc(c.restaurant || 'Commander') + '</h1>' +
      ((c.adresse || c.telephone) ? '<p>' + esc(c.adresse || '') + (c.adresse && c.telephone ? ' · ' : '') + telLien() + '</p>' : '') + '</div></header>';
  }
  function messageFerme(titre, texte){
    var tel = telLien();
    racine.innerHTML = entete() +
      '<div class="info info-o" role="status"><b>' + esc(titre) + '</b><p>' + esc(texte) + (tel ? ' Vous pouvez l’appeler : ' + tel + '.' : '') + '</p></div>';
    barre.hidden = true;
  }
  function peindre(){
    var c = etat.carte;
    if (!c){ racine.innerHTML = '<p class="note" role="status">Chargement de la carte…</p>'; barre.hidden = true; return; }
    if (etat.confirmation) return peindreConfirmation();
    if (c.etat === 'inconnu'){ racine.innerHTML = '<h1>Page introuvable</h1><p class="note">Ce lien ne correspond à aucun restaurant.</p>'; barre.hidden = true; return; }
    if (c.etat === 'indisponible') return messageFerme('Les commandes par ce lien sont en pause.', 'Ce restaurant ne prend pas de commandes par ce lien pour le moment.');
    if (c.etat === 'ferme') return messageFerme('Le restaurant ne prend pas de commandes à emporter en ce moment.', 'Revenez un peu plus tard.');
    if (c.etat === 'sature') return messageFerme('Beaucoup de commandes en ce moment.', 'Le restaurant ne peut pas en prendre d’autres par ce lien.');
    var cats = [], parCat = {};
    (c.produits || []).forEach(function(p){
      var k = p.categorie || 'La carte';
      if (!parCat[k]){ parCat[k] = []; cats.push(k); }
      parCat[k].push(p);
    });
    racine.innerHTML = entete() +
      '<div class="info" role="status">Commande à emporter' + (delaiTexte() ? ', prête dans <b>' + esc(delaiTexte()) + '</b>' : '') + '. Paiement sur place, au retrait.</div>' +
      (cats.length ? cats.map(function(k){
        return '<section class="cat"><h2>' + esc(k) + '</h2><div class="prods">' + parCat[k].map(function(p){
          return '<button class="prod" data-produit="' + esc(p.id) + '"><span><b>' + esc(p.nom) + '</b>' +
            (p.description ? '<small>' + esc(p.description) + '</small>' : '') +
            ((p.halal || p.vegetarien) ? '<span class="puces">' + (p.halal ? '<span class="puce">Halal</span>' : '') + (p.vegetarien ? '<span class="puce">Végétarien</span>' : '') + '</span>' : '') +
            '</span><span class="prix">' + eur(p.prix_cents) + '</span><span class="rond plus" aria-hidden="true">+</span></button>';
        }).join('') + '</div></section>';
      }).join('') : '<p class="note">La carte est vide pour le moment.</p>') +
      '<p class="note">Vos données ne servent qu’à préparer et remettre votre commande.</p>';
    majBarre();
  }
  function majBarre(){
    var n = nbArticles();
    barre.hidden = !n || !etat.carte || etat.carte.etat !== 'ouvert' || !!etat.confirmation;
    if (!barre.hidden) barre.innerHTML = '<button class="btn btn-o" data-panier><span>Voir mon panier · ' + n + ' article' + (n > 1 ? 's' : '') + '</span><span>' + eur(totalPanier()) + '</span></button>';
  }
  function peindreConfirmation(){
    var k = etat.confirmation;
    racine.innerHTML = entete() +
      '<div class="confirm" role="status"><h1 class="grand">Commande envoyée</h1>' +
      '<p>Votre numéro de commande</p><div class="num">' + esc(k.numero) + '</div>' +
      '<p>Prête dans environ <b>' + esc(k.delai_min) + ' min</b></p>' +
      '<p><b>' + esc(eur(k.total_cents)) + '</b> à régler sur place, au retrait.</p>' +
      (telLien() ? '<p class="note">Un souci ? Appelez le restaurant : ' + telLien() + '</p>' : '') +
      '<button class="btn btn-o" data-nouvelle>Nouvelle commande</button></div>';
    barre.hidden = true;
  }

  /* ------------------------------ feuilles ------------------------------ */
  var feuille = null, retour = null;
  function ouvrir(html, nom){
    fermer();
    retour = document.activeElement;
    var f = document.createElement('div');
    f.className = 'fond';
    f.innerHTML = '<div class="feuille" role="dialog" aria-modal="true" aria-label="' + esc(nom) + '">' + html + '</div>';
    f.addEventListener('click', function(e){ if (e.target === f) fermer(); });
    document.body.appendChild(f);
    document.body.style.overflow = 'hidden';
    feuille = f;
    var premier = f.querySelector('input,textarea,button');
    if (premier) premier.focus();
    return f;
  }
  function fermer(){
    if (!feuille) return;
    document.body.removeChild(feuille);
    document.body.style.overflow = '';
    feuille = null;
    if (retour && retour.focus) { try { retour.focus(); } catch(e){} }
  }
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') fermer(); });

  /* Choix d'un produit : options obligatoires, suppléments, quantité, précision pour la cuisine. */
  var edition = null;
  function ouvrirProduit(id, indexLigne){
    var p = produit(id);
    if (!p) return;
    var ligne = indexLigne !== undefined ? etat.panier[indexLigne] : null;
    edition = { p:p, choix:ligne ? ligne.choix.slice() : [], supplements:ligne ? ligne.supplements.slice() : [], quantite:ligne ? ligne.quantite : 1, consigne:ligne ? ligne.consigne : '', index:indexLigne };
    var sansOption = !(p.choix_obligatoires || []).length && !(p.supplements || []).length;
    if (sansOption && indexLigne === undefined){ ajouterAuPanier(); return; }
    peindreProduit();
  }
  function choixValide(){
    var ok = true;
    (edition.p.choix_obligatoires || []).forEach(function(g){
      var n = 0; g.choix.forEach(function(c){ if (edition.choix.indexOf(c.id) !== -1) n++; });
      if (n < g.min || n > g.max) ok = false;
    });
    return ok;
  }
  function peindreProduit(){
    var p = edition.p;
    var html = '<div class="feuille-tete"><div><h2>' + esc(p.nom) + '</h2>' + (p.description ? '<p>' + esc(p.description) + '</p>' : '') + '</div><button class="fermer" data-fermer aria-label="Fermer">×</button></div>';
    (p.choix_obligatoires || []).forEach(function(g, gi){
      var unique = g.max === 1;
      html += '<fieldset class="groupe"><legend>' + esc(g.question || g.nom) + '</legend><small>' +
        (g.min === g.max ? 'Choisissez ' + g.min : g.min ? 'Choisissez de ' + g.min + ' à ' + g.max : 'Jusqu’à ' + g.max + ' choix') + '</small>' +
        g.choix.map(function(c){
          var coche = edition.choix.indexOf(c.id) !== -1;
          return '<label class="choix"><input type="' + (unique ? 'radio' : 'checkbox') + '" name="g' + gi + '" data-choix="' + esc(c.id) + '" data-groupe="' + gi + '"' + (coche ? ' checked' : '') + '><span>' + esc(c.nom) + '</span>' +
            (c.supplement_cents ? '<em>+ ' + eur(c.supplement_cents) + '</em>' : '') + '</label>';
        }).join('') + '</fieldset>';
    });
    if ((p.supplements || []).length){
      html += '<fieldset class="groupe"><legend>Suppléments</legend>' + p.supplements.map(function(s){
        return '<label class="choix"><input type="checkbox" data-supp="' + esc(s.id) + '"' + (edition.supplements.indexOf(s.id) !== -1 ? ' checked' : '') + '><span>' + esc(s.nom) + '</span><em>+ ' + eur(s.prix_cents) + '</em></label>';
      }).join('') + '</fieldset>';
    }
    html += '<div class="champ"><label for="consigne">Une précision pour la cuisine ?</label><textarea id="consigne" maxlength="300" placeholder="Sans oignons, bien cuit…">' + esc(edition.consigne) + '</textarea></div>' +
      '<div class="pas"><button class="rond" data-qte="-1" aria-label="Une de moins"' + (edition.quantite <= 1 ? ' disabled' : '') + '>−</button><output aria-live="polite">' + edition.quantite + '</output><button class="rond" data-qte="1" aria-label="Une de plus"' + (edition.quantite >= MAX_QTE ? ' disabled' : '') + '>+</button></div>' +
      '<button class="btn btn-o" data-ajouter' + (choixValide() ? '' : ' disabled') + '>' + (edition.index !== undefined ? 'Modifier' : 'Ajouter au panier') + ' · ' + eur(prixLigne(p, edition.choix, edition.supplements) * edition.quantite) + '</button>';
    var f = ouvrir(html, p.nom);
    f.querySelector('.feuille').addEventListener('change', function(e){
      var t = e.target;
      if (t.getAttribute('data-choix')){
        var g = p.choix_obligatoires[+t.getAttribute('data-groupe')], id = t.getAttribute('data-choix');
        if (g.max === 1){ g.choix.forEach(function(c){ var i = edition.choix.indexOf(c.id); if (i !== -1) edition.choix.splice(i, 1); }); edition.choix.push(id); }
        else {
          var i2 = edition.choix.indexOf(id);
          if (t.checked && i2 === -1){
            var n = 0; g.choix.forEach(function(c){ if (edition.choix.indexOf(c.id) !== -1) n++; });
            if (n >= g.max){ t.checked = false; return; }
            edition.choix.push(id);
          } else if (!t.checked && i2 !== -1) edition.choix.splice(i2, 1);
        }
      } else if (t.getAttribute('data-supp')){
        var sid = t.getAttribute('data-supp'), j = edition.supplements.indexOf(sid);
        if (t.checked && j === -1) edition.supplements.push(sid); else if (!t.checked && j !== -1) edition.supplements.splice(j, 1);
      }
      majProduit();
    });
    f.querySelector('#consigne').addEventListener('input', function(e){ edition.consigne = e.target.value; });
  }
  function majProduit(){
    if (!feuille || !edition) return;
    var b = feuille.querySelector('[data-ajouter]');
    if (b){ b.disabled = !choixValide(); b.textContent = (edition.index !== undefined ? 'Modifier' : 'Ajouter au panier') + ' · ' + eur(prixLigne(edition.p, edition.choix, edition.supplements) * edition.quantite); }
    var o = feuille.querySelector('output'); if (o) o.textContent = edition.quantite;
    var m = feuille.querySelector('[data-qte="-1"]'); if (m) m.disabled = edition.quantite <= 1;
    var pl = feuille.querySelector('[data-qte="1"]'); if (pl) pl.disabled = edition.quantite >= MAX_QTE;
  }
  function ajouterAuPanier(){
    if (!edition || !choixValide()) return;
    var l = { produit:edition.p.id, choix:edition.choix.slice(), supplements:edition.supplements.slice(), quantite:edition.quantite, consigne:(edition.consigne || '').trim().slice(0, 300) };
    if (edition.index !== undefined) etat.panier[edition.index] = l;
    else {
      if (etat.panier.length >= MAX_LIGNES){ etat.erreur = 'Votre panier est plein (' + MAX_LIGNES + ' lignes au plus).'; alert(etat.erreur); return; }
      etat.panier.push(l);
    }
    if (!etat.cle) etat.cle = cleCourte();
    stocker(); fermer(); edition = null; majBarre();
  }

  /* Le panier et l'envoi de la commande. */
  function peindrePanier(){
    var html = '<div class="feuille-tete"><div><h2>Mon panier</h2>' + (delaiTexte() ? '<p>Prête dans ' + esc(delaiTexte()) + '</p>' : '') + '</div><button class="fermer" data-fermer aria-label="Fermer">×</button></div>';
    if (!etat.panier.length) html += '<p class="note">Votre panier est vide.</p>';
    else {
      html += '<div>' + etat.panier.map(function(l, i){
        var p = produit(l.produit); if (!p) return '';
        var opt = libelleOptions(p, l.choix, l.supplements);
        return '<div class="ligne"><span><b>' + esc(p.nom) + '</b><small>' + esc(opt) + (l.consigne ? (opt ? ' · ' : '') + '« ' + esc(l.consigne) + ' »' : '') + '</small></span>' +
          '<span class="tot">' + eur(prixLigne(p, l.choix, l.supplements) * l.quantite) + '</span>' +
          '<span class="pas"><button class="rond" data-ligne-qte="' + i + '" data-delta="-1" aria-label="Une de moins">−</button><output>' + l.quantite + '</output>' +
          '<button class="rond" data-ligne-qte="' + i + '" data-delta="1" aria-label="Une de plus"' + (l.quantite >= MAX_QTE ? ' disabled' : '') + '>+</button>' +
          ((p.choix_obligatoires || []).length || (p.supplements || []).length ? '<button class="lien" data-ligne-modifier="' + i + '">Modifier</button>' : '') +
          '<button class="lien" data-ligne-retirer="' + i + '">Retirer</button></span></div>';
      }).join('') + '</div>' +
        '<div class="total"><span>Total</span><span>' + eur(totalPanier()) + '</span></div>' +
        (totalPanier() > MAX_TOTAL ? '<p class="erreur" role="alert">Au-delà de 500 €, merci d’appeler le restaurant.</p>' : '') +
        '<div class="champ"><label for="nom">Votre prénom</label><input id="nom" autocomplete="given-name" maxlength="80" value="' + esc(etat.nom || '') + '"></div>' +
        '<div class="champ"><label for="tel">Votre téléphone</label><input id="tel" type="tel" autocomplete="tel" inputmode="tel" maxlength="20" value="' + esc(etat.tel || '') + '" placeholder="06 12 34 56 78"></div>' +
        '<div class="piege" aria-hidden="true"><label for="site">Ne rien écrire ici</label><input id="site" name="site" tabindex="-1" autocomplete="off"></div>' +
        '<p class="info">À emporter · <b>paiement sur place</b>, au retrait.</p>' +
        (etat.erreur ? '<p class="erreur" role="alert">' + esc(etat.erreur) + '</p>' : '') +
        '<button class="btn btn-o" data-envoyer' + (etat.envoi || totalPanier() > MAX_TOTAL ? ' disabled' : '') + '>' + (etat.envoi ? 'Envoi…' : 'Envoyer la commande · ' + eur(totalPanier())) + '</button>';
    }
    var f = ouvrir(html, 'Mon panier');
    var nom = f.querySelector('#nom'), tel = f.querySelector('#tel');
    if (nom) nom.addEventListener('input', function(e){ etat.nom = e.target.value; });
    if (tel) tel.addEventListener('input', function(e){ etat.tel = e.target.value; });
  }
  function envoyer(){
    if (etat.envoi) return;
    var nom = (etat.nom || '').trim(), tel = (etat.tel || '').replace(/[^0-9+]/g, '');
    var site = feuille && feuille.querySelector('#site');
    if (nom.length < 2){ etat.erreur = 'Il faut votre prénom.'; return peindrePanier(); }
    if (tel.length < 9 || tel.length > 16){ etat.erreur = 'Il faut un numéro de téléphone valide, pour que le restaurant puisse vous joindre.'; return peindrePanier(); }
    etat.erreur = ''; etat.envoi = true; peindrePanier();
    appeler({
      action:'commander', slug:slug, cle:etat.cle || cleCourte(), site:site ? site.value : '',
      client:{ nom:nom, telephone:tel },
      lignes:etat.panier.map(function(l){ return { produit_id:l.produit, quantite:l.quantite, choix:l.choix, supplements:l.supplements, consigne:l.consigne }; })
    }, function(e, r){
      etat.envoi = false;
      if (e){ etat.erreur = e; return peindrePanier(); }
      if (r.accepte && !r.numero){ etat.erreur = 'Votre commande n’a pas pu être envoyée. Appelez le restaurant.'; return peindrePanier(); }
      etat.confirmation = { numero:r.numero, total_cents:r.total_cents, delai_min:r.delai_min };
      etat.panier = []; etat.cle = ''; etat.erreur = '';
      try { sessionStorage.removeItem('pelyo:commander:' + slug); } catch(x){}
      fermer(); peindre();
    });
  }

  /* ------------------------------ gestes ------------------------------ */
  document.addEventListener('click', function(e){
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b) return;
    if (b.hasAttribute('data-produit')) return ouvrirProduit(b.getAttribute('data-produit'));
    if (b.hasAttribute('data-fermer')) return fermer();
    if (b.hasAttribute('data-panier')) { etat.erreur = ''; return peindrePanier(); }
    if (b.hasAttribute('data-ajouter')) return ajouterAuPanier();
    if (b.hasAttribute('data-envoyer')) return envoyer();
    if (b.hasAttribute('data-nouvelle')){ etat.confirmation = null; return peindre(); }
    if (b.hasAttribute('data-qte') && edition){
      edition.quantite = Math.max(1, Math.min(MAX_QTE, edition.quantite + Number(b.getAttribute('data-qte'))));
      return majProduit();
    }
    if (b.hasAttribute('data-ligne-qte')){
      var i = +b.getAttribute('data-ligne-qte'), l = etat.panier[i];
      if (!l) return;
      l.quantite += Number(b.getAttribute('data-delta'));
      if (l.quantite < 1) etat.panier.splice(i, 1); else if (l.quantite > MAX_QTE) l.quantite = MAX_QTE;
      stocker(); majBarre(); return peindrePanier();
    }
    if (b.hasAttribute('data-ligne-retirer')){ etat.panier.splice(+b.getAttribute('data-ligne-retirer'), 1); stocker(); majBarre(); return peindrePanier(); }
    if (b.hasAttribute('data-ligne-modifier')){ var k = +b.getAttribute('data-ligne-modifier'); return ouvrirProduit(etat.panier[k].produit, k); }
  });

  /* ------------------------------ démarrage ------------------------------ */
  function charger(){
    if (!slug){ etat.carte = { etat:'inconnu' }; return peindre(); }
    relire();
    peindre();
    appeler({ action:'carte', slug:slug }, function(e, c){
      if (e){
        racine.innerHTML = '<p class="erreur" role="alert">' + esc(e) + '</p><button class="btn btn-o" data-recharger>Réessayer</button>';
        var r = racine.querySelector('[data-recharger]'); if (r) r.addEventListener('click', charger);
        return;
      }
      etat.carte = c;
      document.title = (c.restaurant ? c.restaurant + ' · ' : '') + 'Commander';
      // Ce qui n'est plus à la carte (rupture, retrait) sort du panier.
      etat.panier = etat.panier.filter(function(l){ return !!produit(l.produit); });
      stocker();
      peindre();
    });
  }
  charger();
})();
