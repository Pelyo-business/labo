/* QR code, fabriqué ici : aucun service externe, aucune bibliothèque. Sert à l'espace gérant (module « Commande par lien
   et QR code ») : le gérant télécharge ou imprime le QR code de sa page de commande.

   Ce que ça sait faire : du texte (UTF-8, mode « octets »), niveau de correction d'erreurs L, M, Q ou H, versions 1 à 10
   (jusqu'à 214 octets au niveau M), choix automatique du masque. Suffisant pour une adresse web.

   PelyoQR.matrice(texte, ecc)       tableau de lignes de booléens (vrai = module sombre)
   PelyoQR.svg(texte, options)       chaîne SVG (fond blanc, modules noirs, marge de 4 modules)
                                     options : ecc ('L'|'M'|'Q'|'H', 'M' par défaut), marge (4), titre (texte accessible)

   L'algorithme est celui de la norme ISO/IEC 18004. Vérifié par la garde « qr » (outils/gardes/qr.sh : décodage par le détecteur de QR code
   du système, sur des adresses de toutes longueurs, à tous les niveaux). */
(function(){
  "use strict";

  var ECC_PAR_BLOC = {
    L:[-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
    M:[-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
    Q:[-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24],
    H:[-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28]
  };
  var NB_BLOCS = {
    L:[-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
    M:[-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
    Q:[-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8],
    H:[-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8]
  };
  var BITS_FORMAT = { L:1, M:0, Q:3, H:2 };
  var VERSION_MAX = 10;

  function bit(x, i){ return ((x >>> i) & 1) !== 0; }

  /* Nombre de modules qui portent des données (le reste : motifs fixes, format, version). */
  function modulesBruts(ver){
    var r = (16 * ver + 128) * ver + 64;
    if (ver >= 2){
      var na = Math.floor(ver / 7) + 2;
      r -= (25 * na - 10) * na - 55;
      if (ver >= 7) r -= 36;
    }
    return r;
  }
  function motsDeDonnees(ver, ecc){
    return Math.floor(modulesBruts(ver) / 8) - ECC_PAR_BLOC[ecc][ver] * NB_BLOCS[ecc][ver];
  }

  function octetsUtf8(texte){
    var o = [], i, c, d;
    for (i = 0; i < texte.length; i++){
      c = texte.charCodeAt(i);
      if (c >= 0xD800 && c < 0xDC00 && i + 1 < texte.length){
        d = texte.charCodeAt(i + 1);
        if (d >= 0xDC00 && d < 0xE000){ c = 0x10000 + ((c - 0xD800) << 10) + (d - 0xDC00); i++; }
      }
      if (c < 0x80) o.push(c);
      else if (c < 0x800) o.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) o.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else o.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return o;
  }

  /* Corps du QR code : le message en octets, rempli jusqu'à la capacité de la version. */
  function donnees(octets, ver, ecc){
    var bits = [], i, cap = motsDeDonnees(ver, ecc) * 8;
    function ajouter(val, n){ for (var k = n - 1; k >= 0; k--) bits.push((val >>> k) & 1); }
    ajouter(4, 4);                              // mode « octets »
    ajouter(octets.length, ver <= 9 ? 8 : 16);  // nombre de caractères
    for (i = 0; i < octets.length; i++) ajouter(octets[i], 8);
    for (i = 0; i < 4 && bits.length < cap; i++) bits.push(0);   // terminaison
    while (bits.length % 8 !== 0) bits.push(0);
    var mots = [];
    for (i = 0; i < bits.length; i += 8){
      var v = 0;
      for (var k = 0; k < 8; k++) v = (v << 1) | bits[i + k];
      mots.push(v);
    }
    for (var pad = 0xEC; mots.length < cap / 8; pad ^= 0xEC ^ 0x11) mots.push(pad);
    return mots;
  }

  /* Correction d'erreurs : Reed-Solomon sur GF(256). */
  function mul(x, y){
    var z = 0;
    for (var i = 7; i >= 0; i--){ z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; }
    return z & 0xFF;
  }
  function diviseurRS(degre){
    var r = [], i, j, racine = 1;
    for (i = 0; i < degre - 1; i++) r.push(0);
    r.push(1);
    for (i = 0; i < degre; i++){
      for (j = 0; j < r.length; j++){ r[j] = mul(r[j], racine); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
      racine = mul(racine, 2);
    }
    return r;
  }
  function resteRS(mots, div){
    var r = div.map(function(){ return 0; });
    mots.forEach(function(b){
      var f = b ^ r.shift();
      r.push(0);
      div.forEach(function(c, i){ r[i] ^= mul(c, f); });
    });
    return r;
  }
  function entrelacer(mots, ver, ecc){
    var nb = NB_BLOCS[ecc][ver], lonEcc = ECC_PAR_BLOC[ecc][ver], bruts = Math.floor(modulesBruts(ver) / 8);
    var courts = nb - bruts % nb, lonCourt = Math.floor(bruts / nb), div = diviseurRS(lonEcc), blocs = [], k = 0, i, dat;
    for (i = 0; i < nb; i++){
      dat = mots.slice(k, k + lonCourt - lonEcc + (i < courts ? 0 : 1));
      k += dat.length;
      var e = resteRS(dat, div);
      if (i < courts) dat.push(0);
      blocs.push(dat.concat(e));
    }
    var res = [];
    for (i = 0; i < blocs[0].length; i++){
      blocs.forEach(function(b, j){ if (i !== lonCourt - lonEcc || j >= courts) res.push(b[i]); });
    }
    return res;
  }

  /* La grille. */
  function creerGrille(ver, ecc, mots){
    var taille = ver * 4 + 17, m = [], fixe = [], x, y;
    for (y = 0; y < taille; y++){ m.push([]); fixe.push([]); for (x = 0; x < taille; x++){ m[y].push(false); fixe[y].push(false); } }
    function poser(x, y, sombre){ m[y][x] = sombre; fixe[y][x] = true; }

    function viseur(cx, cy){
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++){
        var d = Math.max(Math.abs(dx), Math.abs(dy)), xx = cx + dx, yy = cy + dy;
        if (xx >= 0 && xx < taille && yy >= 0 && yy < taille) poser(xx, yy, d !== 2 && d !== 4);
      }
    }
    function alignement(cx, cy){
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) poser(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    function positionsAlignement(){
      if (ver === 1) return [];
      var na = Math.floor(ver / 7) + 2, pas = Math.ceil((ver * 4 + 4) / (na * 2 - 2)) * 2, r = [6];
      for (var p = taille - 7; r.length < na; p -= pas) r.splice(1, 0, p);
      return r;
    }
    function format(masque){
      var d = (BITS_FORMAT[ecc] << 3) | masque, r = d, i;
      for (i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      var bits = ((d << 10) | r) ^ 0x5412;
      for (i = 0; i <= 5; i++) poser(8, i, bit(bits, i));
      poser(8, 7, bit(bits, 6)); poser(8, 8, bit(bits, 7)); poser(7, 8, bit(bits, 8));
      for (i = 9; i < 15; i++) poser(14 - i, 8, bit(bits, i));
      for (i = 0; i < 8; i++) poser(taille - 1 - i, 8, bit(bits, i));
      for (i = 8; i < 15; i++) poser(8, taille - 15 + i, bit(bits, i));
      poser(8, taille - 8, true);
    }
    function versionBits(){
      if (ver < 7) return;
      var r = ver, i;
      for (i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25);
      var bits = (ver << 12) | r;
      for (i = 0; i < 18; i++){
        var c = bit(bits, i), a = taille - 11 + i % 3, b = Math.floor(i / 3);
        poser(a, b, c); poser(b, a, c);
      }
    }
    // Motifs fixes.
    for (var i = 0; i < taille; i++){ poser(6, i, i % 2 === 0); poser(i, 6, i % 2 === 0); }
    viseur(3, 3); viseur(taille - 4, 3); viseur(3, taille - 4);
    var al = positionsAlignement(), n = al.length, a, b;
    for (a = 0; a < n; a++) for (b = 0; b < n; b++){
      if (!((a === 0 && b === 0) || (a === 0 && b === n - 1) || (a === n - 1 && b === 0))) alignement(al[a], al[b]);
    }
    format(0); versionBits();

    // Les données, en zigzag par colonnes de deux modules.
    var k = 0, droite, vert, j, haut;
    for (droite = taille - 1; droite >= 1; droite -= 2){
      if (droite === 6) droite = 5;
      for (vert = 0; vert < taille; vert++){
        for (j = 0; j < 2; j++){
          x = droite - j; haut = ((droite + 1) & 2) === 0; y = haut ? taille - 1 - vert : vert;
          if (!fixe[y][x] && k < mots.length * 8){ m[y][x] = bit(mots[k >>> 3], 7 - (k & 7)); k++; }
        }
      }
    }

    function masquer(mk){
      for (var yy = 0; yy < taille; yy++) for (var xx = 0; xx < taille; xx++){
        var inv;
        switch (mk){
          case 0: inv = (xx + yy) % 2 === 0; break;
          case 1: inv = yy % 2 === 0; break;
          case 2: inv = xx % 3 === 0; break;
          case 3: inv = (xx + yy) % 3 === 0; break;
          case 4: inv = (Math.floor(xx / 3) + Math.floor(yy / 2)) % 2 === 0; break;
          case 5: inv = xx * yy % 2 + xx * yy % 3 === 0; break;
          case 6: inv = (xx * yy % 2 + xx * yy % 3) % 2 === 0; break;
          default: inv = ((xx + yy) % 2 + xx * yy % 3) % 2 === 0;
        }
        if (!fixe[yy][xx] && inv) m[yy][xx] = !m[yy][xx];
      }
    }
    function ajoutHistorique(lon, h){ if (h[0] === 0) lon += taille; h.pop(); h.unshift(lon); }
    function compterMotifs(h){
      var nn = h[1], coeur = nn > 0 && h[2] === nn && h[3] === nn * 3 && h[4] === nn && h[5] === nn;
      return (coeur && h[0] >= nn * 4 && h[6] >= nn ? 1 : 0) + (coeur && h[6] >= nn * 4 && h[0] >= nn ? 1 : 0);
    }
    function terminer(couleur, lon, h){
      if (couleur){ ajoutHistorique(lon, h); lon = 0; }
      lon += taille; ajoutHistorique(lon, h);
      return compterMotifs(h);
    }
    function penalite(){
      var r = 0, yy, xx, couleur, lon, h;
      for (yy = 0; yy < taille; yy++){
        couleur = false; lon = 0; h = [0, 0, 0, 0, 0, 0, 0];
        for (xx = 0; xx < taille; xx++){
          if (m[yy][xx] === couleur){ lon++; if (lon === 5) r += 3; else if (lon > 5) r++; }
          else { ajoutHistorique(lon, h); if (!couleur) r += compterMotifs(h) * 40; couleur = m[yy][xx]; lon = 1; }
        }
        r += terminer(couleur, lon, h) * 40;
      }
      for (xx = 0; xx < taille; xx++){
        couleur = false; lon = 0; h = [0, 0, 0, 0, 0, 0, 0];
        for (yy = 0; yy < taille; yy++){
          if (m[yy][xx] === couleur){ lon++; if (lon === 5) r += 3; else if (lon > 5) r++; }
          else { ajoutHistorique(lon, h); if (!couleur) r += compterMotifs(h) * 40; couleur = m[yy][xx]; lon = 1; }
        }
        r += terminer(couleur, lon, h) * 40;
      }
      var sombres = 0;
      for (yy = 0; yy < taille; yy++){
        for (xx = 0; xx < taille; xx++){
          if (m[yy][xx]) sombres++;
          if (xx < taille - 1 && yy < taille - 1 && m[yy][xx] === m[yy][xx + 1] && m[yy][xx] === m[yy + 1][xx] && m[yy][xx] === m[yy + 1][xx + 1]) r += 3;
        }
      }
      var total = taille * taille;
      r += (Math.ceil(Math.abs(sombres * 20 - total * 10) / total) - 1) * 10;
      return r;
    }
    var meilleur = 0, mini = Infinity, mk, p;
    for (mk = 0; mk < 8; mk++){
      masquer(mk); format(mk);
      p = penalite();
      if (p < mini){ mini = p; meilleur = mk; }
      masquer(mk);
    }
    masquer(meilleur); format(meilleur);
    return m;
  }

  function matrice(texte, ecc){
    ecc = ecc || 'M';
    if (!ECC_PAR_BLOC[ecc]) throw new Error('Niveau de correction inconnu : ' + ecc);
    var octets = octetsUtf8(String(texte));
    var ver = 1;
    while (ver <= VERSION_MAX){
      var bitsUtiles = 4 + (ver <= 9 ? 8 : 16) + octets.length * 8;
      if (bitsUtiles <= motsDeDonnees(ver, ecc) * 8) break;
      ver++;
    }
    if (ver > VERSION_MAX) throw new Error('Texte trop long pour ce QR code (' + octets.length + ' octets).');
    return creerGrille(ver, ecc, entrelacer(donnees(octets, ver, ecc), ver, ecc));
  }

  function echapper(t){ return String(t).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }

  function svg(texte, options){
    options = options || {};
    var m = matrice(texte, options.ecc), marge = options.marge === undefined ? 4 : options.marge, n = m.length, d = '', x, y;
    for (y = 0; y < n; y++){
      x = 0;
      while (x < n){
        if (!m[y][x]) { x++; continue; }
        var debut = x;
        while (x < n && m[y][x]) x++;
        d += 'M' + (debut + marge) + ',' + (y + marge) + 'h' + (x - debut) + 'v1h-' + (x - debut) + 'z';
      }
    }
    var l = n + marge * 2;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + l + ' ' + l + '" width="' + (options.taille || l * 8) + '" height="' + (options.taille || l * 8) +
      '" shape-rendering="crispEdges" role="img" aria-label="' + echapper(options.titre || 'QR code') + '">' +
      '<rect width="' + l + '" height="' + l + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  }

  var API = { matrice:matrice, svg:svg };
  if (typeof window !== 'undefined') window.PelyoQR = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
