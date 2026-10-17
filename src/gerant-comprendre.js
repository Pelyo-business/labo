/* =========================================================================
   Pelyo — comprendre les réponses du gérant pendant le démarrage.
   « du lundi au jeudi 11h30-14h30 et 18h-23h, fermé le dimanche »,
   « 12 rue Garibaldi 69007 Lyon », « 15 € », « 5 km », « Tacos M 9,50 »…
   Fonctions pures, sans écran ni réseau : testées par
   outils/tests/comprendre.test.js (node --test).
   ES5 strict.
   ========================================================================= */
var PelyoComprendre = (function(){
  "use strict";

  var JOURS = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
  var COURTS = { dim:0, lun:1, mar:2, mer:3, jeu:4, ven:5, sam:6 };

  function norm(s){
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[’']/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function deux(n){ return (n < 10 ? '0' : '') + n; }

  /* « 11h30 », « 11:30 », « 11 h », « 23h », « midi », « minuit » → « 11:30 » */
  function heure(t){
    var s = norm(t);
    if (s === 'midi') return '12:00';
    if (s === 'minuit') return '00:00';
    var m = /^(\d{1,2})\s*(?:h|:|\.)\s*(\d{2})?$/.exec(s) || /^(\d{1,2})$/.exec(s);
    if (!m) return null;
    var h = +m[1], mn = m[2] ? +m[2] : 0;
    if (h === 24) h = 0;
    if (h > 23 || mn > 59) return null;
    return deux(h) + ':' + deux(mn);
  }

  var H = '(?:\\d{1,2}\\s*(?:h|:|\\.)\\s*(?:\\d{2})?|\\d{1,2}|midi|minuit)';
  var RE_CRENEAU = new RegExp('(' + H + ')\\s*(?:-|–|a|jusqu a|jusqu au|>)\\s*(' + H + ')', 'g');

  /* Créneaux d'un bout de texte : [{debut, fin}] */
  function creneaux(t){
    var s = norm(t).replace(/\bde\b/g, ' '), m, l = [];
    RE_CRENEAU.lastIndex = 0;
    while ((m = RE_CRENEAU.exec(s))){
      var a = heure(m[1]), b = heure(m[2]);
      if (a && b && a !== b) l.push({ debut:a, fin:b });
    }
    return l;
  }

  function numJour(mot){
    var w = norm(mot);
    for (var i = 0; i < 7; i++) if (w === JOURS[i]) return i;
    var c = w.slice(0, 3);
    return COURTS.hasOwnProperty(c) && w.length <= 4 ? COURTS[c] : -1;
  }

  /* Jours cités dans un bout de texte → liste d'index (0 = dimanche). */
  function jours(t){
    var s = norm(t);
    if (/tous les jours|7 ?j ?\/ ?7|7 jours|toute la semaine|chaque jour/.test(s)) return [0,1,2,3,4,5,6];
    var l = [], m;
    var mots = '(dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi|dim|lun|mar|mer|jeu|ven|sam)\\.?';
    var reInter = new RegExp('(?:du )?' + mots + '\\s*(?:au|a|-|–)\\s*' + mots, 'g');
    var reste = s.replace(reInter, function(_x, a, b){
      var i = numJour(a), j = numJour(b);
      if (i < 0 || j < 0) return ' ';
      for (var k = i; ; k = (k + 1) % 7){ if (l.indexOf(k) < 0) l.push(k); if (k === j) break; }
      return ' ';
    });
    if (/\ben semaine\b/.test(reste)) [1,2,3,4,5].forEach(function(k){ if (l.indexOf(k) < 0) l.push(k); });
    if (/week ?-?end/.test(reste)) [0,6].forEach(function(k){ if (l.indexOf(k) < 0) l.push(k); });
    var reSeul = new RegExp('\\b' + mots + '\\b', 'g');
    while ((m = reSeul.exec(reste))){ var n = numJour(m[1]); if (n >= 0 && l.indexOf(n) < 0) l.push(n); }
    return l;
  }

  /* Horaires d'une semaine, ou null si rien n'est compris.
     « midi et soir tous les jours » sans heures → 11:30-14:30 / 18:30-23:00. */
  function horaires(t){
    var s = norm(t), sem = [[],[],[],[],[],[],[]], compris = false, derniers = [0,1,2,3,4,5,6];
    if (!s) return null;
    var morceaux = s.split(/\s*(?:[,;\n\/]|\.\s| sauf )\s*/);
    morceaux.forEach(function(m){
      if (!m) return;
      var j = jours(m), cr = creneaux(m), ferme = /ferme|repos|closed|pas ouvert/.test(m);
      if (!j.length) j = derniers;
      if (ferme && !cr.length){
        j.forEach(function(k){ sem[k] = []; }); compris = true; return;
      }
      if (!cr.length){
        var midi = /\bmidi\b/.test(m), soir = /\bsoir\b/.test(m);
        if (midi) cr.push({ debut:'11:30', fin:'14:30' });
        if (soir) cr.push({ debut:'18:30', fin:'23:00' });
      }
      if (!cr.length) return;
      j.forEach(function(k){ sem[k] = cr.map(function(c){ return { debut:c.debut, fin:c.fin }; }); });
      derniers = j; compris = true;
    });
    if (/\bsauf\b/.test(s)){
      var apres = s.split(/\bsauf\b/)[1] || '', f = jours(apres);
      f.forEach(function(k){ sem[k] = []; });
    }
    sem.forEach(function(l){ l.sort(function(a, b){ return a.debut < b.debut ? -1 : 1; }); if (l.length > 2) l.length = 2; });
    return compris ? sem : null;
  }

  /* « 12 rue Garibaldi, 69007 Lyon » → {numero, rue, codePostal, ville} */
  function adresse(t){
    var s = String(t || '').replace(/\s+/g, ' ').trim();
    var m = /^(\d+\s*(?:bis|ter)?)\s*,?\s+(.+?)\s*,?\s+(\d{5})\s+(.+)$/i.exec(s);
    if (m) return { numero:m[1].replace(/\s+/g, ' '), rue:m[2], codePostal:m[3], ville:m[4] };
    m = /^(\d+\s*(?:bis|ter)?)\s*,?\s+(.+?)\s*,\s*(.+)$/i.exec(s);
    if (m) return { numero:m[1], rue:m[2], codePostal:'', ville:m[3] };
    return null;
  }

  /* « 15 », « 15 € », « 12,50 », « gratuit » → centimes ; sinon null */
  function montant(t){
    var s = norm(t);
    if (/gratuit|offert|rien|aucun|pas de frais|0 ?(e|eur|euros?)?$/.test(s) && !/[1-9]/.test(s)) return 0;
    var m = /(\d+(?:[.,]\d{1,2})?)/.exec(s);
    if (!m) return null;
    var v = Math.round(parseFloat(m[1].replace(',', '.')) * 100);
    return v >= 0 && v <= 100000 ? v : null;
  }
  /* « 5 km », « 3,5 » → km ; sinon null */
  function km(t){
    var m = /(\d+(?:[.,]\d)?)/.exec(norm(t));
    if (!m) return null;
    var v = parseFloat(m[1].replace(',', '.'));
    return v >= 0.5 && v <= 30 ? v : null;
  }
  /* « 20 min », « un quart d'heure », « une demi-heure » → minutes */
  function minutes(t){
    var s = norm(t);
    if (/quart d heure/.test(s)) return 15;
    if (/demi ?-?heure/.test(s)) return 30;
    if (/^une heure|^1 ?h$/.test(s)) return 60;
    var m = /(\d{1,3})/.exec(s);
    if (!m) return null;
    var v = +m[1];
    return v >= 5 && v <= 120 ? v : null;
  }
  /* Numéro français → « 04 78 12 34 56 » ; sinon null */
  function telephone(t){
    var d = String(t || '').replace(/[^\d+]/g, '');
    if (/^\+33\d{9}$/.test(d)) d = '0' + d.slice(3);
    if (/^0033\d{9}$/.test(d)) d = '0' + d.slice(4);
    if (!/^0[1-9]\d{8}$/.test(d)) return null;
    return d.replace(/(\d\d)(?=\d)/g, '$1 ');
  }
  /* oui / non ; sinon null */
  function ouiNon(t){
    var s = norm(t);
    if (/^(oui|ouais|yes|ok|d accord|bien sur|exact|c est ca|carrement|evidemment|oui oui|yep|absolument)\b/.test(s)) return true;
    if (/^(non|nan|no|pas du tout|jamais|aucun|pas de)\b/.test(s)) return false;
    return null;
  }
  /* Lignes « Tacos M 9,50 » ou « Kebab : 8 € » → [{nom, prix}] */
  function produits(t){
    var l = [];
    String(t || '').split(/\n|;|\s\/\s/).forEach(function(x){
      x = x.replace(/^\s*[-•*]\s*/, '').trim();
      var m = /^(.+?)\s*(?::|=|-|–|à)?\s*(\d+(?:[.,]\d{1,2})?)\s*(?:€|eur|euros?)?\s*$/i.exec(x);
      if (!m || m[1].length > 120) return;
      var prix = Math.round(parseFloat(m[2].replace(',', '.')) * 100);
      if (prix > 0 && prix <= 1000000) l.push({ nom:m[1].replace(/\s*[:=]\s*$/, '').trim(), prix:prix });
    });
    return l;
  }

  function texteSemaine(sem){
    var ordre = [1,2,3,4,5,6,0], out = [];
    function t(l){ return l.length ? l.map(function(c){ return c.debut.replace(':', 'h') + '–' + c.fin.replace(':', 'h'); }).join(' et ') : 'fermé'; }
    ordre.forEach(function(j){
      var x = t(sem[j]), d = out[out.length - 1];
      if (d && d.t === x) d.fin = j; else out.push({ debut:j, fin:j, t:x });
    });
    function nom(j){ var n = JOURS[j]; return n.charAt(0).toUpperCase() + n.slice(1); }
    return out.map(function(x){ return (x.debut === x.fin ? nom(x.debut) : nom(x.debut) + ' – ' + nom(x.fin)) + ' : ' + x.t; }).join(' · ');
  }

  return { heure:heure, creneaux:creneaux, jours:jours, horaires:horaires, adresse:adresse, montant:montant, km:km,
    minutes:minutes, telephone:telephone, ouiNon:ouiNon, produits:produits, texteSemaine:texteSemaine };
})();
if (typeof module !== 'undefined') module.exports = PelyoComprendre;
