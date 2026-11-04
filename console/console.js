/* Console Pelyo — site privé du fondateur, pensé pour ordinateur.
   Version démo : comptes, appels, courriels et avis sont fictifs. Les appels
   sont simulés sur une soirée accélérée (1 seconde = 1 minute) pour que les
   chiffres bougent comme ils bougeront avec de vrais clients.

   Tous les montants sont en centimes HT. */
(function () {
  "use strict";

  var D = window.DEMO;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };
  var lienHttps = function (s) { try { var u = new URL(String(s || "")); return u.protocol === "https:" ? u.toString() : ""; } catch (e) { return ""; } };
  var gras = function (s) { return esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>"); };
  var fmt2 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var fmt0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
  var eur = function (c) { return fmt2.format(c / 100) + " €"; };
  var eur0 = function (c) { return fmt0.format(Math.round(c / 100)) + " €"; };
  var signe = function (c, f) { return (c > 0 ? "+" : c < 0 ? "−" : "") + (f || eur)(Math.abs(c)); };
  var heureParis = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  var jourHeureParis = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  function heureCourte(iso) { return jourHeureParis.format(new Date(iso)).replace(" ", " à "); }
  var dateParisCourte = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short" });
  var partsParis = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "numeric", minute: "numeric", hourCycle: "h23" });

  /* ------------------------------------------------------------------
     Hypothèses de calcul — modifiables dans « Chiffres », gardées dans ce
     navigateur. À faire valider par le comptable.
     ------------------------------------------------------------------ */
  var H_DEFAUT = {
    coutMinute: 14,     /* téléphonie + voix + IA, par minute d'appel */
    /* Marge exacte d'un restaurant pile à la limite de son forfait, tous
       les coûts propres au compte déjà absorbés. */
    planchers: { basic: 1500, pro: 2000, biz: 2400, big: 4000 },
    numero: 150,        /* numéro de téléphone, par compte et par mois */
    autresIA: 100,      /* autres IA de l'app (centre d'aide, ruptures), par compte et par mois */
    stripe: 35,         /* frais d'un prélèvement SEPA */
    commission: 750,    /* par client actif apporté par un commercial */
    isReduit: 15, isNormal: 25, seuilReduit: 4250000,
    tva: 20, dividendes: 31.4,
    fixes: [
      { nom: "Base de données (Supabase)", montant: 2300 },
      { nom: "Serveurs (Cloudflare)", montant: 500 },
      { nom: "IA de la console (mails, avis)", montant: 2000 },
      { nom: "Expert-comptable", montant: 12000 },
      { nom: "Banque pro", montant: 1500 },
      { nom: "Assurance RC Pro + cyber", montant: 6000 },
      { nom: "Domaine et e-mails", montant: 300 }
    ]
  };
  var H = lireHyp();
  function lireHyp() {
    try {
      var h = JSON.parse(localStorage.getItem("pelyo:console:hyp2") || "null");
      if (h && h.fixes) return Object.assign(JSON.parse(JSON.stringify(H_DEFAUT)), h);
    } catch (e) {}
    return JSON.parse(JSON.stringify(H_DEFAUT));
  }
  function garderHyp() { try { localStorage.setItem("pelyo:console:hyp2", JSON.stringify(H)); } catch (e) {} }

  /* ------------------------------------------------------------------
     Horloge de démo : une soirée à Paris, 1 seconde réelle = 1 minute.
     ------------------------------------------------------------------ */
  var ACCEL = 60;
  /* 1 = consommation normale d'un client de ce forfait (demande de
     Hayden, 06/10 : pas de rush permanent). */
  var RUSH_MULTIPLICATEUR = 1;
  /* Compte fondateur connecté (reel.js) : vrais comptes, vraie heure. */
  var REEL = window.PELYO_REEL || null;
  var t = REEL ? Date.now() : (function () {
    var n = Date.now(), p = partsParis.formatToParts(new Date(n));
    var h = +p.filter(function (x) { return x.type === "hour"; })[0].value;
    var m = +p.filter(function (x) { return x.type === "minute"; })[0].value;
    return n + ((20 * 60) - (h * 60 + m)) * 60000;   /* aujourd'hui, 20 h à Paris */
  })();
  function heureDecimale(ms) {
    var p = partsParis.formatToParts(new Date(ms));
    return +p.filter(function (x) { return x.type === "hour"; })[0].value + p.filter(function (x) { return x.type === "minute"; })[0].value / 60;
  }
  /* Tous les restaurants de la démo restent en rush pendant le service. La
     consommation est régulière pour rendre lisible la descente jusqu'aux
     quotas, puis la remontée liée aux minutes facturées en dépassement. */
  function intensite(h) {
    if (h >= 11 && h < 23.5) return 1 / 12.5;
    return 0;
  }
  function moisFraction(ms) {
    var d = new Date(ms), debut = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    var fin = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    return Math.max(0.02, (ms - debut) / (fin - debut));
  }

  /* ------------------------------------------------------------------
     Comptes : minutes déjà consommées ce mois et appels en cours.
     ------------------------------------------------------------------ */
  /* Jours (date de Paris, « 2026-10-05 ») : la démo fabrique les minutes des
     jours passés, puis la soirée se joue en direct. */
  var cleParis = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });
  function cleJour(ms) { return cleParis.format(new Date(ms)); }
  function joursDuMois(cle) { return new Date(+cle.slice(0, 4), +cle.slice(5, 7), 0).getDate(); }
  function hasard(n) { var x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); }
  function debutCompte(c) { if (c.debut) return c.debut; var d = c.depuis.split("/"); return "2026-" + d[1] + "-" + d[0]; }
  function actifLe(c, cle) { return cle >= debutCompte(c); }
  function minutesDuJour(i, c, cle) {
    if (REEL) return (c.jours && c.jours[cle]) || 0;
    if (!actifLe(c, cle)) return 0;
    var n = +cle.slice(0, 4) * 400 + +cle.slice(5, 7) * 32 + +cle.slice(8, 10);
    return c.parJour * (0.85 + ((i * 37) % 30) / 100) * (0.7 + 0.6 * hasard(i * 977 + n));
  }
  function cumulAvant(i, c, cle) {   /* minutes du mois avant ce jour */
    var s = 0, d = +cle.slice(8, 10);
    for (var k = 1; k < d; k++) s += minutesDuJour(i, c, cle.slice(0, 8) + String(k).padStart(2, "0"));
    return s;
  }

  var T0 = REEL ? t : t - 570 * 60000;   /* démo : amorçage depuis 10 h 30 */
  var C = D.comptes.map(function (c, i) {
    var cle = cleJour(T0), rush = Object.assign({}, c, { parJour: c.parJour * RUSH_MULTIPLICATEUR });
    var etat = Object.assign({}, D.etats[c.id]);
    return Object.assign(rush, {
      rang: i,
      minutes: cumulAvant(i, rush, cle) + (REEL ? minutesDuJour(i, rush, cle) : 0),
      appels: REEL ? new Array(c.enCours || 0) : [],
      histo: [],
      derniers: [],
      etat: etat
    });
  });
  var parId = {}; C.forEach(function (c) { parId[c.id] = c; });

  /* Les 6 jours précédents, terminés, puis le jour en cours. */
  var joursPasses = [], jourCourant = null;
  function nouveauJour(cle) {
    var j = { cle: cle, jm: joursDuMois(cle), comptes: {} };
    C.forEach(function (c) { j.comptes[c.id] = { debut: c.minutes, fin: c.minutes }; });
    return j;
  }
  (function () {
    for (var off = 6; off >= 1; off--) {
      var cle = cleJour(T0 - off * 86400000), j = { cle: cle, jm: joursDuMois(cle), comptes: {} };
      C.forEach(function (c) {
        var debut = cumulAvant(c.rang, c, cle);
        j.comptes[c.id] = { debut: debut, fin: debut + minutesDuJour(c.rang, c, cle) };
      });
      joursPasses.push(j);
    }
    jourCourant = nouveauJour(cleJour(T0));
    if (REEL) C.forEach(function (c) { jourCourant.comptes[c.id].debut = cumulAvant(c.rang, c, jourCourant.cle); });
  })();

  /* Marge d'un compte pour m minutes consommées dans le mois. Le forfait est
     acquis dès le début du mois ; chaque minute coûte, et rapporte en plus
     une fois le forfait dépassé. La courbe descend jusqu'à la limite du
     forfait (le « plancher »), puis remonte. */
  function eco(c) {
    var f = D.forfaits[c.forfait], payant = c.statut === "actif";
    var com = c.commercial && c.statut === "actif" ? H.commission : 0;
    var plancherCible = payant && f.incluses && H.planchers[c.forfait] != null ? H.planchers[c.forfait] : null;
    /* La réserve absorbe numéro, prélèvement, autres IA et éventuelle
       commission. Elle est calibrée pour que chaque restaurant soit
       exactement au plancher demandé lorsqu'il atteint son quota. */
    var fixe = plancherCible !== null
      ? Math.max(0, f.prix - f.incluses * H.coutMinute - plancherCible)
      : H.numero + H.autresIA + (payant ? H.stripe : 0) + com;
    var a = function (m) {
      var ca = payant ? f.prix + Math.max(0, m - f.incluses) * f.dep : 0;
      var ia = m * H.coutMinute, marge;
      if (plancherCible !== null) {
        marge = m <= f.incluses
          ? plancherCible + (f.incluses - m) * H.coutMinute
          : plancherCible + (m - f.incluses) * (f.dep - H.coutMinute);
      } else marge = ca - ia - fixe;
      return { ca: ca, ia: ia, marge: marge };
    };
    var maintenant = a(c.minutes), proj = c.minutes / moisFraction(t), fin = a(proj);
    return {
      f: f, payant: payant, com: com, fixe: fixe,
      ca: maintenant.ca, ia: maintenant.ia, marge: maintenant.marge,
      proj: proj, pca: fin.ca, pia: fin.ia, pmarge: fin.marge,
      plancher: plancherCible,
      margeA: function (m) { return a(m).marge; },
      caA: function (m) { return a(m).ca; },
      parMinute: (payant && c.minutes >= f.incluses ? f.dep : 0) - H.coutMinute
    };
  }

  /* Résultat de consommation réel sur un jour : dépassements facturés moins
     coût des minutes. Le mois ajoute à cette dynamique les abonnements acquis
     dès le départ, dans netMoisAuxMinutes(). */
  function fixesMois() { return H.fixes.reduce(function (s, x) { return s + (+x.montant || 0); }, 0); }
  function netJour(j, enCours) {
    var r = 0;
    C.forEach(function (c) {
      if (!actifLe(c, j.cle)) return;
      var x = eco(c), m = j.comptes[c.id], fin = enCours ? c.minutes : m.fin;
      r += x.margeA(fin) - x.margeA(m.debut);
    });
    return r;
  }
  function global() {
    var g = { ca: 0, abos: 0, dep: 0, ia: 0, reserve: 0, minutes: 0, proj: 0, appels: 0, actuelle: 0, plancher: 0 };
    C.forEach(function (c) {
      var x = eco(c);
      g.ca += x.pca; g.ia += x.pia; g.minutes += c.minutes; g.proj += x.proj;
      g.reserve += x.pca - x.pia - x.pmarge; g.appels += c.appels.length;
      g.actuelle += x.marge;
      if (x.plancher !== null) g.plancher += x.plancher;
      if (x.payant) { g.abos += x.f.prix; g.dep += x.pca - x.f.prix; }
    });
    g.variables = g.ia + g.reserve;
    g.brute = g.ca - g.variables;
    g.fixes = H.fixes.reduce(function (s, x) { return s + (+x.montant || 0); }, 0);
    g.avantIS = g.brute - g.fixes;
    var an = g.avantIS * 12;
    g.is = an > 0 ? (Math.min(an, H.seuilReduit) * H.isReduit + Math.max(0, an - H.seuilReduit) * H.isNormal) / 100 / 12 : 0;
    g.net = g.avantIS - g.is;
    g.tva = g.ca * H.tva / 100;
    g.poche = g.net > 0 ? g.net * (1 - H.dividendes / 100) : 0;
    /* réel */
    g.caMois = 0; g.minutesJour = 0;
    var minutes = {};
    C.forEach(function (c) {
      var x = eco(c);
      g.caMois += x.ca; minutes[c.id] = c.minutes;
      g.minutesJour += c.minutes - jourCourant.comptes[c.id].debut;
    });
    g.mois = netMoisAuxMinutes(minutes);
    g.depart = netMoisAuxMinutes({});
    var jour = netJour(jourCourant, true);
    g.jour = jour;
    g.semaine = joursPasses.reduce(function (s, j) { return s + netJour(j, false); }, jour);
    return g;
  }

  /* Bénéfice net du mois pour des minutes données : somme des marges des
     clients (même calcul que leur courbe : descente jusqu'au plancher, puis
     remontée en dépassement), moins les charges fixes de Pelyo, moins
     l'impôt sur les sociétés estimé. */
  function netMoisAuxMinutes(minutes) {
    var r = -fixesMois();
    C.forEach(function (c) { r += eco(c).margeA(minutes[c.id] || 0); });
    if (r <= 0) return r;
    var an = r * 12;
    return r - (Math.min(an, H.seuilReduit) * H.isReduit + Math.max(0, an - H.seuilReduit) * H.isNormal) / 100 / 12;
  }
  function historiqueMois(cle) {
    var points = [], jour = +cle.slice(8, 10), prefixe = cle.slice(0, 8);
    var depart = {};
    C.forEach(function (c) { depart[c.id] = 0; });
    points.push({
      t: Date.UTC(+cle.slice(0, 4), +cle.slice(5, 7) - 1, 1, 0),
      v: netMoisAuxMinutes(depart)
    });
    for (var d = 1; d < jour; d++) {
      var cleD = prefixe + String(d).padStart(2, "0"), minutes = {};
      C.forEach(function (c) {
        minutes[c.id] = cumulAvant(c.rang, c, cleD) + minutesDuJour(c.rang, c, cleD);
      });
      var instant = Date.UTC(+cleD.slice(0, 4), +cleD.slice(5, 7) - 1, d, 12);
      points.push({ t: instant, v: netMoisAuxMinutes(minutes) });
    }
    return points;
  }

  /* ------------------------------------------------------------------
     Simulation : chaque seconde, des appels commencent et se terminent.
     ------------------------------------------------------------------ */
  var serie = historiqueMois(cleJour(T0)), evenements = [];
  function tic() {
    if (REEL) {
      t = Date.now();
      if (cleJour(t) !== jourCourant.cle) {
        C.forEach(function (c) { jourCourant.comptes[c.id].fin = c.minutes; });
        joursPasses.push(jourCourant); joursPasses = joursPasses.slice(-6);
        var cleR = cleJour(t);
        if (cleR.slice(0, 7) !== jourCourant.cle.slice(0, 7)) { C.forEach(function (c) { c.minutes = 0; }); serie = historiqueMois(cleR); }
        jourCourant = nouveauJour(cleR);
      }
      var gr = global();
      serie.push({ t: t, v: gr.mois });
      if (serie.length > 3000) serie.shift();
      return gr;
    }
    var dt = ACCEL;                         /* secondes de démo écoulées */
    var h = heureDecimale(t);
    if ((h >= 23.5 || h < 11) && !C.some(function (c) { return c.appels.length; })) {
      /* Nuit : on saute au service suivant. */
      t += ((h < 11.5 ? 11.5 - h : 24 - h + 11.5) * 3600000);
      h = heureDecimale(t);
    }
    t += dt * 1000;
    if (cleJour(t) !== jourCourant.cle) {
      /* Minuit passé : la journée est close. La courbe mensuelle continue ;
         elle repart uniquement au premier jour du mois suivant. */
      C.forEach(function (c) { jourCourant.comptes[c.id].fin = c.minutes; });
      joursPasses.push(jourCourant); joursPasses = joursPasses.slice(-6);
      var cle = cleJour(t);
      if (cle.slice(0, 7) !== jourCourant.cle.slice(0, 7)) {
        C.forEach(function (c) { c.minutes = 0; });
        serie = historiqueMois(cle);
      }
      jourCourant = nouveauJour(cle);
    }
    C.forEach(function (c) {
      var actif = c.etat.ouvert;
      var debit = c.parJour * intensite(h) / 3600 * dt;        /* minutes attendues pendant dt */
      if (actif && Math.random() < debit / 2.6) {
        c.appels.push({ reste: 60 + Math.random() * 210, duree: 0 });
      }
      c.appels = c.appels.filter(function (a) {
        var pas = Math.min(dt, a.reste);
        a.reste -= pas; a.duree += pas; c.minutes += pas / 60;
        if (a.reste > 0) return true;
        finAppel(c, a.duree);
        return false;
      });
    });
    var g = global();
    serie.push({ t: t, v: g.mois });
    if (serie.length > 3000) serie.shift();
    return g;
  }
  /* Un appel réel terminé, tel que lu dans la base. */
  var appelsVus = {};
  function ajouterAppelReel(a) {
    if (appelsVus[a.id] || a.issue === "En cours") return;
    var c = parId[a.compte];
    if (!c) return;
    appelsVus[a.id] = true;
    var ev = { heure: a.heure, compte: c, duree: a.duree, issue: a.issue, montant: a.montant, gain: Math.round((a.duree / 60) * eco(c).parMinute) };
    c.derniers.unshift(ev); c.derniers.length = Math.min(c.derniers.length, 8);
    evenements.unshift(ev); evenements.length = Math.min(evenements.length, 40);
  }
  /* Toutes les 30 secondes : nouveaux chiffres de la base. */
  function relireReel() {
    REEL.relire(function (e, r) {
      if (e) { toast("Lecture de la base impossible : " + e); return; }
      var cle = cleJour(Date.now()), nouveaux = 0;
      r.comptes.forEach(function (n) {
        var c = parId[n.id];
        if (!c) { nouveaux++; return; }
        c.jours = n.jours; c.statut = n.statut; c.forfait = n.forfait; c.parJour = n.parJour;
        c.minutes = cumulAvant(c.rang, c, cle) + minutesDuJour(c.rang, c, cle);
        c.appels = new Array(n.enCours || 0);
        c.etat = Object.assign({}, r.etats[n.id]);
      });
      r.appels.slice().reverse().forEach(ajouterAppelReel);
      if (r.boite && D.mailsReels) {
        var connus = {}; D.mails.forEach(function (m) { connus[m.id] = true; });
        var arrives = r.boite.mails.filter(function (m) { return !connus[m.id]; });
        D.mails = r.boite.mails; D.mailsMasques = r.boite.masques;
        D.mails.forEach(function (m) { traites[m.id] = m.traite; });
        if (arrives.length) toast(arrives.length + " nouveau" + (arrives.length > 1 ? "x" : "") + " courriel" + (arrives.length > 1 ? "s" : "") + ".");
        if (page === "boite" && (!document.activeElement || document.activeElement.id !== "brouillon")) majBoite();
      }
      if (r.avis && D.avisReels) {
        var avisConnus = {}; D.avis.liste.forEach(function (a) { avisConnus[a.id] = true; });
        var avisArrives = r.avis.liste.filter(function (a) { return !avisConnus[a.id]; });
        D.avis = r.avis;
        if (avisArrives.length) toast(avisArrives.length + " nouvel" + (avisArrives.length > 1 ? "s" : "") + " avis Google.");
        if (page === "avis" && (!document.activeElement || document.activeElement.tagName !== "TEXTAREA")) $("main").innerHTML = vueAvis();
      }
      if (r.erreurs) {
        var errConnues = {}; (D.erreurs || []).forEach(function (x) { errConnues[x.id] = true; });
        var errNouvelles = r.erreurs.filter(function (x) { return !errConnues[x.id]; }).length;
        D.erreurs = r.erreurs;
        if (errNouvelles) toast(errNouvelles + " nouvelle" + (errNouvelles > 1 ? "s" : "") + " erreur" + (errNouvelles > 1 ? "s" : "") + " dans les applis.");
        if ($("traiter")) $("traiter").innerHTML = aTraiter();
      }
      if (nouveaux) toast(nouveaux + " nouveau" + (nouveaux > 1 ? "x" : "") + " compte" + (nouveaux > 1 ? "s" : "") + " : recharge la page pour l’afficher.");
    });
  }

  function finAppel(c, s) {
    var x = eco(c), f = x.f;
    var gain = Math.round((s / 60) * x.parMinute);
    var issue = Math.random() < 0.82 ? "Commande" : Math.random() < 0.5 ? "Question" : "Transfert";
    var montant = issue === "Commande" ? 900 + Math.round(Math.random() * 3600) : 0;
    var ev = { heure: heureParis.format(new Date(t)).slice(0, 5), compte: c, duree: s, issue: issue, montant: montant, gain: gain };
    c.derniers.unshift(ev); c.derniers.length = Math.min(c.derniers.length, 8);
    evenements.unshift(ev); evenements.length = Math.min(evenements.length, 40);
    void f;
  }

  /* Historique de départ : on rejoue l'après-midi sans afficher, pour que
     le graphique et les mini-courbes aient déjà une forme. */
  (function amorcer() {
    if (REEL) {
      /* Mini-courbes : la marge de chaque compte, jour après jour ce mois. */
      var cle = cleJour(t), j = +cle.slice(8, 10);
      C.forEach(function (c) {
        for (var d = 1; d <= j; d++) {
          var cd = cle.slice(0, 8) + String(d).padStart(2, "0");
          c.histo.push(eco(c).margeA(cumulAvant(c.rang, c, cd) + minutesDuJour(c.rang, c, cd)));
        }
        if (c.histo.length < 2) c.histo.unshift(eco(c).margeA(0));
      });
      (REEL.appels || []).slice().reverse().forEach(ajouterAppelReel);
      return;
    }
    var fin = t;
    t = T0;
    for (var i = 0; t < fin - 30000; i++) {
      tic();
      if (i % 5 === 0) C.forEach(function (c) { c.histo.push(eco(c).marge); if (c.histo.length > 60) c.histo.shift(); });
    }
  })();

  /* ------------------------------------------------------------------
     Affichage commun
     ------------------------------------------------------------------ */
  var page = "marche", tri = { col: "marge", sens: -1 }, choisi = null, mailChoisi = D.mails.length ? D.mails[0].id : null;
  var traites = {}, avisVus = {}, journal = [], conversation = [], conversationId = null;
  D.mails.forEach(function (m) { if (m.traite) traites[m.id] = true; });

  function toast(m) {
    var el = $("toast"); el.textContent = m; el.classList.add("on");
    clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove("on"); }, 2600);
  }
  /* Valeur qui clignote vert ou rouge quand elle change, comme un cours. */
  var anciennes = new WeakMap();
  function poser(el, texte, valeur) {
    if (!el) return;
    if (el.textContent !== texte) el.textContent = texte;
    if (valeur === undefined) return;
    var avant = anciennes.get(el);
    anciennes.set(el, valeur);
    if (avant === undefined || Math.abs(valeur - avant) < 1) return;   /* comme en bourse : chaque mouvement clignote */
    el.classList.remove("c-flash-up", "c-flash-down"); void el.offsetWidth;
    el.classList.add(valeur > avant ? "c-flash-up" : "c-flash-down");
  }
  /* Cellules redessinées chaque seconde : on compare avec la valeur
     précédente pour faire clignoter ce qui a bougé. */
  var precedents = {};
  function bouge(cle, v) {
    var avant = precedents[cle]; precedents[cle] = v;
    if (avant === undefined || Math.abs(v - avant) < 1) return "";
    return v > avant ? " c-flash-up" : " c-flash-down";
  }
  function sens(v) { return v > 0 ? "c-up" : v < 0 ? "c-down" : ""; }
  function badgeStatut(c) {
    var lib = { actif: "Actif", essai: "Essai", impaye: "Impayé" }[c.statut];
    return '<span class="c-badge c-badge-' + c.statut + '">' + lib + "</span>";
  }
  function spark(vals, l, h) {
    if (vals.length < 2) return "";
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals), r = max - min || 1;
    var pts = vals.map(function (v, i) { return (i / (vals.length - 1) * l).toFixed(1) + "," + (h - 2 - (v - min) / r * (h - 4)).toFixed(1); });
    var cl = vals[vals.length - 1] >= vals[0] ? "c-up" : "c-down";
    return '<svg class="c-spark ' + cl + '" viewBox="0 0 ' + l + " " + h + '" preserveAspectRatio="none"><polyline points="' + pts.join(" ") + '"/></svg>';
  }

  /* Courbe de rentabilité : la marge du mois selon les minutes déjà
     consommées, de 0 à maintenant. Aucune prévision. */
  function courbe(c, x, L, Hh, grand) {
    var inc = x.payant ? x.f.incluses : 0;
    var X = Math.max(c.minutes, 1);
    var ms = [0]; if (inc && inc < X) ms.push(inc); ms.push(X);
    var vs = ms.map(x.margeA);
    var tout = vs.concat([0]);
    var min = Math.min.apply(null, tout), max = Math.max.apply(null, tout), r = max - min || 1;
    var gx = grand ? 14 : 2, gh = grand ? 22 : 3, gb = grand ? 26 : 3, gd = grand ? 120 : 4;
    var px = function (m) { return (gx + m / X * (L - gx - gd)).toFixed(1); };
    var py = function (v) { return (gh + (1 - (v - min) / r) * (Hh - gh - gb)).toFixed(1); };
    var svg = '<svg class="c-courbe' + (grand ? " c-courbe-g" : "") + '" viewBox="0 0 ' + L + " " + Hh + '">';
    svg += '<line class="c-courbe-zero" x1="0" x2="' + L + '" y1="' + py(0) + '" y2="' + py(0) + '"/>';
    if (inc && inc < X) svg += '<line class="c-courbe-quota" x1="' + px(inc) + '" x2="' + px(inc) + '" y1="0" y2="' + Hh + '"/>';
    svg += '<polyline class="c-courbe-passe ' + sens(x.marge) + '" points="' + ms.map(function (m, i) { return px(m) + "," + py(vs[i]); }).join(" ") + '"/>';
    svg += '<circle class="' + sens(x.marge) + '" cx="' + px(X) + '" cy="' + py(x.marge) + '" r="' + (grand ? 5 : 2.6) + '"/>';
    if (grand) {
      var txt = function (xx, yy, t, cl, ancre) { return '<text x="' + xx + '" y="' + yy + '" class="' + (cl || "") + '" text-anchor="' + (ancre || "start") + '">' + t + "</text>"; };
      svg += txt(gx, Hh - 8, "1er du mois", "c-courbe-axe");
      svg += txt(gx, +py(vs[0]) - 8, "Départ " + eur0(vs[0]), "c-courbe-axe");
      if (inc && inc < X) {
        svg += txt(px(inc), Hh - 8, inc + " min (fin du forfait)", "c-courbe-axe", "middle");
        svg += txt(px(inc), +py(x.plancher) + 18, "Plancher " + eur0(x.plancher), sens(x.plancher), "middle");
      }
      svg += txt(+px(X) + 10, +py(x.marge) + 4, eur(x.marge), sens(x.marge));
      svg += txt(+px(X) + 10, +py(x.marge) + 18, fmt0.format(c.minutes) + " min", "c-courbe-axe");
    }
    return svg + "</svg>";
  }

  /* Bandeau défilant : construit une fois, mis à jour sur place. */
  function monterBandeau() {
    var un = C.map(function (c) {
      return '<span class="c-tick" data-t="' + c.id + '"><b>' + c.code + '</b><i data-v></i><em data-d></em></span>';
    }).join("");
    $("tape").innerHTML = un + un;
    $("tape").style.animationDuration = C.length * 5 + "s";   /* même vitesse quel que soit le nombre de comptes */
  }
  function majBandeau() {
    C.forEach(function (c) {
      var x = eco(c), h = c.histo, base = h.length ? h[0] : x.marge;
      var pct = base ? (x.marge - base) / Math.abs(base) * 100 : 0;
      document.querySelectorAll('[data-t="' + c.id + '"]').forEach(function (el) {
        poser(el.querySelector("[data-v]"), eur(x.marge), x.marge);
        var d = el.querySelector("[data-d]");
        d.textContent = (pct >= 0 ? "▲ " : "▼ ") + fmt2.format(Math.abs(pct)) + " %";
        d.className = pct >= 0 ? "c-up" : "c-down";
        el.classList.toggle("c-tick-live", c.appels.length > 0);
      });
    });
  }

  /* ------------------------------------------------------------------
     Vue d'ensemble
     ------------------------------------------------------------------ */
  function vueMarche() {
    return '<div class="c-head"><div><small>' + C.length + ' restaurant' + (C.length > 1 ? 's' : '') + (REEL ? ' · données réelles' : ' · consommation normale') + '</small><h1>Vue d\'ensemble</h1></div>' +
      '<p class="c-head-note">Résultat actuel et projection de fin de mois, recalculés à chaque minute d\'appel. Montants HT.</p></div>' +
      '<section class="c-kpis">' +
        kpi("mois", "Bénéfice net mensuel", "marges des clients − frais fixes − impôt estimé", true) +
        kpi("ca", "Chiffre d'affaires", "abonnements + dépassements") +
        kpi("brute", "Marge brute", "après IA, numéros, prélèvements") +
        kpi("minutes", "Minutes d'appel", "consommées ce mois") +
        kpi("plancher", "Plancher portefeuille", "si chaque abonnement atteint son quota") +
      "</section>" +
      '<section class="c-grille">' +
        '<div class="c-panneau c-graph"><div class="c-panneau-tete"><h2>Bénéfice net du mois</h2><span class="c-muted" id="g-heure"></span></div>' +
          '<div class="c-nets">' +
            '<div class="c-net-on" title="Marges des clients depuis le 1er, moins les frais fixes et l\'impôt estimé"><small>Mensuel actuel</small><b id="n-mois"></b></div>' +
            '<div title="Projection à la fin du mois après charges et impôt estimé"><small>Fin de mois projetée</small><b id="n-net"></b></div>' +
            '<div title="Résultat des minutes consommées aujourd\'hui"><small>Aujourd\'hui</small><b id="n-jour"></b></div>' +
            '<div title="Aujourd\'hui et les 6 jours d\'avant"><small>7 jours</small><b id="n-semaine"></b></div>' +
          '</div>' +
          '<div class="c-canvas"><canvas id="graph"></canvas><div class="c-bulle" id="bulle"></div></div></div>' +
        '<div class="c-panneau c-traiter"><div class="c-panneau-tete"><h2>À traiter</h2></div><div id="traiter"></div></div>' +
      "</section>" +
      '<section class="c-grille c-grille-bas">' +
        '<div class="c-panneau"><div class="c-panneau-tete"><h2>Meilleures marges</h2><a href="#comptes">Les 100 comptes →</a></div><table class="c-table c-table-mini"><thead><tr><th>Compte</th><th>Forfait</th><th class="n">Marge actuelle</th><th>Rentabilité</th></tr></thead><tbody id="mini"></tbody></table></div>' +
        '<div class="c-panneau"><div class="c-panneau-tete"><h2>En direct</h2><span class="c-muted">appels terminés</span></div><ul class="c-flux" id="flux"></ul></div>' +
      "</section>";
  }
  function net(el, v) {
    poser(el, signe(v), v);
    el.classList.toggle("c-up", v > 0); el.classList.toggle("c-down", v < 0);
  }
  function kpi(id, titre, sous, grand) {
    return '<article class="c-kpi' + (grand ? " c-kpi-grand" : "") + '"><small>' + titre + '</small><b id="k-' + id + '"></b><span id="k-' + id + '-d"></span><em>' + sous + "</em></article>";
  }
  function majMarche(g) {
    poser($("k-mois"), eur(g.mois), g.mois);
    $("k-mois-d").textContent = "Au 1er : " + signe(g.depart, eur0) + " après frais et impôt estimé";
    poser($("k-ca"), eur0(g.ca), g.ca);
    $("k-ca-d").textContent = eur0(g.abos) + " d'abonnements";
    poser($("k-brute"), eur0(g.brute), g.brute);
    $("k-brute-d").textContent = g.ca ? fmt0.format(g.brute / g.ca * 100) + " % du CA" : "";
    poser($("k-minutes"), fmt0.format(g.minutes) + " min", g.minutes * 100);
    $("k-minutes-d").textContent = fmt0.format(g.minutesJour) + " min aujourd'hui";
    poser($("k-plancher"), eur0(g.plancher), g.plancher);
    $("k-plancher-d").textContent = "Basic 15 € · Pro 20 € · Business 24 € · Big 40 €";
    net($("n-net"), g.net); net($("n-mois"), g.mois); net($("n-jour"), g.jour); net($("n-semaine"), g.semaine);
    $("g-heure").textContent = "Paris " + heureParis.format(new Date(t)).slice(0, 5) + (REEL ? " · en direct" : " · démo accélérée");
    dessinerGraph();
    var lignes = C.slice().sort(function (a, b) { return eco(b).marge - eco(a).marge; }).slice(0, 10);
    $("mini").innerHTML = lignes.map(function (c) {
      var x = eco(c);
      return '<tr data-compte="' + c.id + '"><td><b class="c-code">' + c.code + "</b>" + esc(c.nom) + (c.appels.length ? ' <i class="c-point" title="En appel"></i>' : "") + "</td><td>" + x.f.nom + '</td><td class="n ' + sens(x.marge) + bouge("mini:" + c.id, x.marge) + '">' + eur(x.marge) + '</td><td>' + courbe(c, x, 110, 26) + "</td></tr>";
    }).join("");
    $("flux").innerHTML = evenements.slice(0, 12).map(function (e) {
      return '<li><time>' + e.heure + '</time><b>' + esc(e.compte.nom) + '</b><span>' + Math.round(e.duree / 60 * 10) / 10 + " min · " + e.issue + (e.montant ? " " + eur(e.montant) : "") + '</span><em class="' + sens(e.gain) + '">' + signe(e.gain) + "</em></li>";
    }).join("") || '<li class="c-vide">Pas encore d\'appel terminé.</li>';
    $("traiter").innerHTML = aTraiter();
  }
  function aTraiter() {
    var items = [];
    /* Compte réel : les mails et avis d'exemple ne sont pas « à traiter ». */
    if (!REEL || D.mailsReels) D.mails.forEach(function (m) {
      if (m.urgence === "haute" && !traites[m.id]) items.push({ type: "Mail", lien: "#boite/" + m.id, titre: m.sujet, txt: m.resume, ton: "chaud" });
    });
    C.forEach(function (c) {
      if (c.etat.alerte) items.push({ type: "Compte", lien: "#comptes/" + c.id, titre: c.nom, txt: c.etat.alerte, ton: c.statut === "impaye" || !c.etat.ouvert ? "chaud" : "" });
    });
    var nouveaux = (!REEL || D.avisReels) ? D.avis.liste.filter(function (a) { return a.nouveau && !avisVus[a.id]; }).length : 0;
    if (nouveaux) items.push({ type: "Avis", lien: "#avis", titre: nouveaux + " nouvel" + (nouveaux > 1 ? "s" : "") + " avis ce matin", txt: "Recherche de " + D.avis.scan + " sur " + D.avis.sources + " sources.", ton: "" });
    /* Plantages des applis (compte réel) : un clic les marque vus. */
    var NOMS_APPLI = { gerant: "Appli gérant", cuisine: "Appli cuisine", commercial: "Appli commercial", console: "Console", site: "Site", autre: "Appli" };
    (D.erreurs || []).forEach(function (x) {
      items.push({ type: "Erreur · " + (NOMS_APPLI[x.app] || "Appli"), lien: "#marche", erreur: x.id, titre: x.message,
        txt: x.nombre + " fois" + (x.restaurant ? " · " + x.restaurant : "") + (x.version ? " · " + x.version : "") +
          " · dernière le " + heureCourte(x.derniere) + (x.source ? " · " + String(x.source).split("/").pop() + (x.ligne ? ":" + x.ligne : "") : "") + " · cliquer = vue",
        ton: x.nombre >= 5 ? "chaud" : "" });
    });
    return items.map(function (i) {
      return '<a class="c-item' + (i.ton ? " c-item-" + i.ton : "") + '" href="' + i.lien + '"' + (i.erreur ? ' data-erreur="' + i.erreur + '"' : "") + "><small>" + i.type + "</small><b>" + esc(i.titre) + "</b><span>" + esc(i.txt) + "</span></a>";
    }).join("") || '<p class="c-vide">Rien à traiter. 👌</p>';
  }

  /* Courbe du bénéfice net mensuel actuel, recalculée à chaque minute. */
  var survol = null;
  function dessinerGraph() {
    var cv = $("graph"); if (!cv) return;
    var r = cv.parentNode.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) {
      cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    }
    var x = cv.getContext("2d"), L = r.width, Ht = r.height;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, L, Ht);
    var vals = serie.map(function (p) { return p.v; });
    if (!vals.length) { x.clearRect(0, 0, L, Ht); return; }
    /* Échelle rapprochée : elle suit uniquement les valeurs du mois au lieu
       de forcer zéro dans le cadre. Les variations de quelques euros restent
       ainsi visibles. Une amplitude minimale évite un zoom instable. */
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    var amplitude = Math.max(max - min, 100), centre = (min + max) / 2;
    min = centre - amplitude / 2; max = centre + amplitude / 2;
    var marge = amplitude * 0.08; min -= marge; max += marge;
    var G = 6, dx = L - 92, y = function (v) { return 14 + (1 - (v - min) / (max - min)) * (Ht - 44); };
    var t0 = serie[0].t, t1 = serie[serie.length - 1].t || t0 + 1;
    var px = function (i) { return G + (serie[i].t - t0) / (t1 - t0 || 1) * (dx - G); };
    var pt = function (tt) { return G + (tt - t0) / (t1 - t0 || 1) * (dx - G); };
    var css = getComputedStyle(document.body);
    var monte = vals[vals.length - 1] >= 0;
    var coul = css.getPropertyValue(monte ? "--c-up" : "--c-down").trim();
    /* quadrillage et étiquettes */
    x.font = "500 11px 'IBM Plex Mono', monospace"; x.fillStyle = css.getPropertyValue("--c-muted"); x.strokeStyle = css.getPropertyValue("--c-line");
    x.lineWidth = 1;
    x.setLineDash([2, 4]);
    for (var k = 0; k <= 4; k++) {
      var v = min + (max - min) * k / 4, yy = Math.round(y(v)) + 0.5;
      x.beginPath(); x.moveTo(G, yy); x.lineTo(dx, yy); x.stroke();
      x.fillText(max - min < 2000 ? eur(v) : eur0(v), dx + 14, yy + 4);
    }
    x.setLineDash([]);
    /* axe du temps : un repère par jour */
    var jour = new Date(t0); jour.setHours(0, 0, 0, 0); jour = jour.getTime() + 86400000;
    var pas = (t1 - t0) > 10 * 86400000 ? 2 : 1;
    for (var n = 0; jour < t1; jour += 86400000, n++) {
      if (n % pas) continue;
      var xx = Math.round(pt(jour)) + 0.5;
      x.strokeStyle = css.getPropertyValue("--c-line"); x.beginPath(); x.moveTo(xx, Ht - 26); x.lineTo(xx, Ht - 20); x.stroke();
      x.fillStyle = css.getPropertyValue("--c-muted"); x.textAlign = "center"; x.fillText(dateParisCourte.format(new Date(jour)), xx, Ht - 6); x.textAlign = "left";
    }
    /* Le repère zéro n'apparaît que lorsque la courbe le traverse. */
    if (min <= 0 && max >= 0) {
      x.setLineDash([3, 4]); x.strokeStyle = css.getPropertyValue("--c-muted");
      x.beginPath(); x.moveTo(0, y(0)); x.lineTo(dx, y(0)); x.stroke(); x.setLineDash([]);
    }
    /* aire et courbe */
    var grad = x.createLinearGradient(0, 0, 0, Ht);
    grad.addColorStop(0, coul + "55"); grad.addColorStop(1, coul + "00");
    x.beginPath(); x.moveTo(px(0), y(vals[0]));
    vals.forEach(function (v, i) { x.lineTo(px(i), y(v)); });
    x.lineTo(px(vals.length - 1), Ht - 30); x.lineTo(G, Ht - 30); x.closePath(); x.fillStyle = grad; x.fill();
    x.beginPath(); vals.forEach(function (v, i) { if (i) x.lineTo(px(i), y(v)); else x.moveTo(px(0), y(v)); });
    x.strokeStyle = coul; x.lineWidth = 2; x.lineJoin = "round"; x.stroke();
    /* dernier point qui pulse */
    var lx = px(vals.length - 1), ly = y(vals[vals.length - 1]);
    x.fillStyle = coul; x.beginPath(); x.arc(lx, ly, 3.5, 0, 7); x.fill();
    x.globalAlpha = 0.25 + 0.2 * Math.sin(Date.now() / 200); x.beginPath(); x.arc(lx, ly, 9, 0, 7); x.fill(); x.globalAlpha = 1;
    /* étiquette de la dernière valeur */
    x.setLineDash([2, 3]); x.strokeStyle = coul; x.globalAlpha = 0.5; x.beginPath(); x.moveTo(lx, ly); x.lineTo(dx + 6, ly); x.stroke(); x.globalAlpha = 1; x.setLineDash([]);
    x.fillStyle = coul; x.beginPath();
    if (x.roundRect) x.roundRect(dx + 6, ly - 11, 84, 22, 6); else x.rect(dx + 6, ly - 11, 84, 22);
    x.fill();
    x.fillStyle = "#08100c"; x.font = "600 11.5px 'IBM Plex Mono', monospace"; x.fillText(eur(vals[vals.length - 1]), dx + 12, ly + 4);
    /* survol */
    var b = $("bulle");
    if (survol !== null && survol < dx) {
      var cible = t0 + survol / dx * (t1 - t0), i = 0;
      while (i < serie.length - 1 && serie[i + 1].t <= cible) i++;
      var p = serie[i];
      x.strokeStyle = css.getPropertyValue("--c-muted"); x.setLineDash([3, 3]); x.beginPath(); x.moveTo(px(i), 6); x.lineTo(px(i), Ht - 30); x.stroke(); x.setLineDash([]);
      x.fillStyle = coul; x.beginPath(); x.arc(px(i), y(p.v), 4, 0, 7); x.fill();
      b.style.display = "block"; b.style.left = Math.min(px(i) + 12, dx - 150) + "px"; b.style.top = Math.max(8, y(p.v) - 46) + "px";
      b.innerHTML = "<small>" + dateParisCourte.format(new Date(p.t)) + " · " + heureParis.format(new Date(p.t)).slice(0, 5) + "</small><b>" + eur(p.v) + "</b>";
    } else b.style.display = "none";
  }

  /* ------------------------------------------------------------------
     Comptes
     ------------------------------------------------------------------ */
  var COLONNES = [
    { id: "nom", lib: "Compte" }, { id: "forfait", lib: "Forfait" }, { id: "minutes", lib: "Minutes ce mois", n: true },
    { id: "ca", lib: "CA ce mois", n: true }, { id: "ia", lib: "Coût IA", n: true }, { id: "marge", lib: "Marge actuelle", n: true },
    { id: "plancher", lib: "Plancher", n: true }, { id: "spark", lib: "Rentabilité" }
  ];
  function vueComptes() {
    return '<div class="c-head"><div><small>' + C.length + ' restaurants</small><h1>Comptes</h1></div>' +
      '<p class="c-head-note">Marge actuelle : ce que le client t\'a rapporté depuis le 1er du mois, après IA, numéro, prélèvement et commission. Dans le forfait, chaque minute te coûte ; au-delà, elle te rapporte. Le plancher est ta marge pile à la limite du forfait. La courbe montre ce qui s\'est passé depuis le 1er, rien de prévu.</p></div>' +
      '<div class="c-panneau"><table class="c-table"><thead><tr>' + COLONNES.map(function (c) {
        return '<th class="' + (c.n ? "n " : "") + (c.id === "spark" ? "" : "c-triable") + '" data-tri="' + c.id + '">' + c.lib + (tri.col === c.id ? (tri.sens < 0 ? " ↓" : " ↑") : "") + "</th>";
      }).join("") + '</tr></thead><tbody id="comptes"></tbody></table></div>';
  }
  function majComptes() {
    var lignes = C.slice().sort(function (a, b) {
      var xa = eco(a), xb = eco(b), va, vb;
      if (tri.col === "nom") { va = a.nom; vb = b.nom; return va < vb ? -tri.sens : va > vb ? tri.sens : 0; }
      if (tri.col === "forfait") { va = xa.f.prix; vb = xb.f.prix; }
      else if (tri.col === "minutes") { va = a.minutes; vb = b.minutes; }
      else { va = xa[tri.col] === null ? -1e9 : xa[tri.col]; vb = xb[tri.col] === null ? -1e9 : xb[tri.col]; }
      return (va - vb) * tri.sens;
    });
    $("comptes").innerHTML = lignes.map(function (c) {
      var x = eco(c), pc = x.f.incluses ? Math.min(100, c.minutes / x.f.incluses * 100) : 100;
      return '<tr data-compte="' + c.id + '"' + (choisi === c.id ? ' class="on"' : "") + '>' +
        '<td><b class="c-code">' + c.code + "</b>" + esc(c.nom) + (c.appels.length ? ' <i class="c-point" title="En appel"></i>' : "") + "<small>" + esc(c.ville) + " · " + badgeStatut(c) + "</small></td>" +
        "<td>" + x.f.nom + "<small>" + (x.f.prix ? eur0(x.f.prix) + " / mois" : "à la minute") + "</small></td>" +
        '<td class="n">' + fmt0.format(c.minutes) + (x.f.incluses ? " / " + x.f.incluses : "") +
          (x.f.incluses ? '<span class="c-jauge"><i style="width:' + pc + '%" class="' + (c.minutes >= x.f.incluses ? "c-jauge-plus" : "") + '"></i></span>' : "") + "</td>" +
        '<td class="n">' + eur(x.ca) + '</td><td class="n">' + eur(x.ia) + '</td>' +
        '<td class="n ' + sens(x.marge) + bouge("liste:" + c.id, x.marge) + '"><b>' + eur(x.marge) + "</b></td>" +
        '<td class="n">' + (x.plancher === null ? '<span class="c-muted">—</span>' : '<span class="' + sens(x.plancher) + '">' + eur(x.plancher) + "</span>") + "</td>" +
        "<td>" + courbe(c, x, 130, 30) + "</td></tr>";
    }).join("");
  }

  /* Volet d'un compte : lecture seule. */
  function ouvrirCompte(id) {
    choisi = id;
    $("volet").setAttribute("aria-hidden", "false");
    document.body.classList.add("c-volet-ouvert");
    majVolet();
  }
  function fermerVolet() {
    choisi = null;
    $("volet").setAttribute("aria-hidden", "true");
    document.body.classList.remove("c-volet-ouvert");
  }
  function majVolet() {
    var c = parId[choisi]; if (!c) return;
    var x = eco(c), e = c.etat;
    $("volet").innerHTML =
      '<div class="c-volet-tete"><div><b class="c-code">' + c.code + "</b><h2>" + esc(c.nom) + "</h2><p>" + esc(c.ville) + " · client depuis le " + c.depuis + " · " + (c.commercial ? "apporté par " + esc(c.commercial) : "sans commercial") + "</p></div>" +
        '<button class="c-fermer" data-fermer aria-label="Fermer">×</button></div>' +
      '<p class="c-lecture">🔒 Lecture seule. Toute modification passe par l\'assistant, avec ta validation.</p>' +
      (e.alerte ? '<p class="c-alerte">' + esc(e.alerte) + "</p>" : "") +
      (e.numeroStatut === "erreur" && REEL && REEL.relancerNumero ? '<p><button class="c-btn" data-relancer-numero="' + esc(c.id) + '">Relancer l’achat du numéro</button></p>' : "") +
      '<h3>Ce mois</h3><dl class="c-dl">' +
        "<dt>Forfait</dt><dd>" + x.f.nom + " " + badgeStatut(c) + "</dd>" +
        (e.numeroStatut ? "<dt>Numéro Pelyo</dt><dd>" + esc(e.numero || ({ attente: "En cours d’attribution", erreur: "Échec de l’achat", aucun: "Aucun" })[e.numeroStatut] || "—") + "</dd>" : "") +
        "<dt>Minutes</dt><dd>" + fmt0.format(c.minutes) + (x.f.incluses ? " sur " + x.f.incluses + " incluses" : "") + "</dd>" +
        "<dt>Chiffre d'affaires</dt><dd>" + eur(x.ca) + "</dd>" +
        "<dt>IA au téléphone</dt><dd class=\"c-down\">−" + eur(x.ia) + "</dd>" +
        "<dt>Coûts de service du compte</dt><dd class=\"c-down\">−" + eur(x.fixe) + "</dd>" +
        '<dt>Marge actuelle</dt><dd class="' + sens(x.marge) + '"><b>' + eur(x.marge) + "</b></dd>" +
        (x.plancher !== null ? '<dt>Plancher</dt><dd class="' + sens(x.plancher) + '">' + eur(x.plancher) + " à " + x.f.incluses + " min</dd>" : "") +
      "</dl>" +
      '<h3>Courbe de rentabilité</h3><div class="c-courbe-grande">' + courbe(c, x, 410, 170, true) + "</div>" +
      "<h3>En direct</h3><dl class=\"c-dl\">" +
        "<dt>Service</dt><dd>" + esc(e.service) + "</dd>" +
        "<dt>Appels en cours</dt><dd>" + c.appels.length + "</dd>" +
        "<dt>Commandes en cuisine</dt><dd>" + e.commandes + "</dd>" +
        "<dt>Ruptures</dt><dd>" + (e.ruptures.length ? esc(e.ruptures.join(", ")) : "Aucune") + "</dd>" +
        "<dt>Tablettes reliées</dt><dd>" + e.appareils + "</dd>" +
      "</dl>" +
      "<h3>Derniers appels</h3>" +
      (c.derniers.length ? '<ul class="c-flux">' + c.derniers.map(function (a) {
        return "<li><time>" + a.heure + "</time><b>" + Math.round(a.duree / 60 * 10) / 10 + " min</b><span>" + a.issue + (a.montant ? " · " + eur(a.montant) : "") + '</span><em class="' + sens(a.gain) + '">' + signe(a.gain) + "</em></li>";
      }).join("") + "</ul>" : '<p class="c-vide">Pas d\'appel depuis l\'ouverture de la console.</p>') +
      '<div class="c-volet-actions"><button class="c-btn" data-demander="' + c.id + '">Demander à l\'assistant</button>' +
      '<button class="c-btn c-btn2" data-espace>Ouvrir son espace (lecture)</button></div>';
  }

  /* ------------------------------------------------------------------
     Boîte mail
     ------------------------------------------------------------------ */
  var CATS = { client: "Client", prospect: "Prospect", fournisseur: "Fournisseur", equipe: "Équipe", presse: "Presse", autre: "Autre" };
  var filtreMail = "tous";
  function exemple(quoi) { return REEL ? '<p class="c-exemple">Exemples : ' + quoi + " pas encore branché" + (quoi.slice(-1) === "s" ? "s" : "") + ". Les comptes et les chiffres, eux, sont réels.</p>" : ""; }
  function vueBoite() {
    var restants = D.mails.filter(function (m) { return !traites[m.id]; });
    return '<div class="c-head"><div><small>bonjour@pelyo.eu et toutes les adresses @pelyo.eu</small><h1>Boîte mail</h1></div>' +
      '<p class="c-head-note">L\'IA lit chaque courriel, le classe et prépare une réponse. ' + D.mailsMasques + " publicités et notifications rangées à part.</p></div>" + (D.mailsReels ? "" : exemple("courriels")) +
      '<div class="c-filtres">' + ["tous", "client", "prospect", "fournisseur", "equipe", "presse", "autre"].map(function (f) {
        var n = f === "tous" ? restants.length : restants.filter(function (m) { return m.cat === f; }).length;
        return '<button data-filtre-mail="' + f + '" class="' + (filtreMail === f ? "on" : "") + '">' + (f === "tous" ? "Tous" : CATS[f]) + " <em>" + n + "</em></button>";
      }).join("") + "</div>" +
      '<div class="c-boite"><ul class="c-mails" id="mails"></ul><article class="c-lire" id="lire"></article></div>';
  }
  function majBoite() {
    var liste = D.mails.filter(function (m) { return filtreMail === "tous" || m.cat === filtreMail; });
    $("mails").innerHTML = liste.map(function (m) {
      return '<li><button data-mail="' + m.id + '" class="' + (mailChoisi === m.id ? "on " : "") + (traites[m.id] ? "c-traite" : "") + '">' +
        '<span class="c-mail-tete"><b>' + esc(m.de) + "</b><time>" + m.heure + "</time></span>" +
        "<strong>" + esc(m.sujet) + "</strong><span>" + esc(m.resume) + "</span>" +
        '<span class="c-tags"><i class="c-tag c-tag-' + m.cat + '">' + CATS[m.cat] + "</i>" + (m.urgence === "haute" ? '<i class="c-tag c-tag-urgent">Urgent</i>' : "") + (traites[m.id] ? '<i class="c-tag">Traité</i>' : "") + "</span></button></li>";
    }).join("");
    if (!liste.length) $("mails").innerHTML = '<li class="c-vide">' + (D.mails.length ? "Aucun courriel dans ce filtre." : "Aucun courriel pour l’instant.") + "</li>";
    var m = D.mails.filter(function (x) { return x.id === mailChoisi; })[0];
    if (!m) { $("lire").innerHTML = ""; return; }
    $("lire").innerHTML =
      "<h2>" + esc(m.sujet) + '</h2><p class="c-de">' + esc(m.de) + " &lt;" + esc(m.adresse) + "&gt; · " + m.heure + "</p>" +
      '<div class="c-ia-bloc"><small>Résumé de l\'IA</small><p>' + esc(m.resume) + "</p><small>À faire</small><p>" + esc(m.action) + "</p>" +
        (m.compte && parId[m.compte] ? '<a href="#comptes/' + m.compte + '">Voir le compte ' + esc(parId[m.compte].nom) + " →</a>" : "") + "</div>" +
      '<blockquote>' + esc(m.texte) + "</blockquote>" +
      (m.brouillon ? '<label class="c-label" for="brouillon">Réponse préparée</label><textarea id="brouillon" rows="8">' + esc(m.brouillon) + "</textarea>" : "") +
      '<div class="c-actions">' +
        (m.brouillon ? '<a class="c-btn" href="mailto:' + encodeURIComponent(m.adresse) + "?subject=" + encodeURIComponent("Re: " + m.sujet) + '" data-repondre>Répondre</a>' : "") +
        '<button class="c-btn c-btn2" data-traite="' + m.id + '">' + (traites[m.id] ? "Remettre à traiter" : "Marquer traité") + "</button></div>";
  }

  /* ------------------------------------------------------------------
     Avis
     ------------------------------------------------------------------ */
  function vueAvis() {
    var a = D.avis, notes = a.liste.filter(function (x) { return x.note; });
    var moy = notes.length ? notes.reduce(function (s, x) { return s + x.note; }, 0) / notes.length : 0;
    var reels = !!D.avisReels;
    return (reels ? "" : exemple("avis")) + '<div class="c-head"><div><small>Recherche automatique chaque matin à ' + a.scan + (a.derniereAnalyse ? " · dernier passage " + esc(a.derniereAnalyse) : "") + '</small><h1>Avis</h1></div>' +
      '<p class="c-head-note">' + (reels ? "Google Business Profile est lu du plus récent au plus ancien. L’IA prépare un brouillon, mais seule ta validation peut publier une réponse." : "L’IA surveille les sources publiques et prépare une réponse pour chaque avis.") + "</p></div>" +
      (a.erreur ? '<p class="c-alerte">Dernier scan Google : ' + esc(a.erreur) + "</p>" : "") +
      '<section class="c-kpis c-kpis-3">' +
        '<article class="c-kpi"><small>Note moyenne</small><b>' + (notes.length ? fmt2.format(moy).replace(/0$/, "") + " / 5" : "—") + '</b><em>' + notes.length + " avis notés</em></article>" +
        '<article class="c-kpi"><small>' + (reels ? "Non lus" : "Nouveaux ce matin") + '</small><b>' + a.liste.filter(function (x) { return x.nouveau && !avisVus[x.id]; }).length + "</b><em>à vérifier</em></article>" +
        '<article class="c-kpi"><small>À surveiller</small><b class="c-down">' + a.liste.filter(function (x) { return x.ton !== "positif"; }).length + "</b><em>mitigés ou négatifs</em></article>" +
      "</section>" +
      (reels ? '<p class="c-google-source">Avis fournis par Google Business Profile · ordre : plus récents d’abord</p>' : "") +
      '<div class="c-avis">' + (a.liste.length ? a.liste.map(function (x) {
        var repondre = lienHttps(x.lien), photo = lienHttps(x.photo);
        return '<article class="c-panneau c-un-avis' + (x.nouveau && !avisVus[x.id] ? " c-nouveau" : "") + '">' +
          '<div class="c-avis-tete">' + (photo ? '<img class="c-avis-photo" src="' + esc(photo) + '" alt="">' : "") + '<b>' + esc(x.source) + "</b><span>" + esc(x.ou) + " · " + esc(x.quand) + "</span>" +
          (x.note ? '<span class="c-etoiles" aria-label="' + x.note + ' sur 5">' + "★★★★★".slice(0, x.note) + '<i>' + "★★★★★".slice(x.note) + "</i></span>" : "") +
          '<i class="c-tag c-ton-' + esc(x.ton) + '">' + esc(x.ton) + "</i></div>" +
          "<blockquote>« " + esc(x.texte) + " »<cite>— " + esc(x.auteur) + "</cite></blockquote>" +
          (x.reponseGoogle ? '<div class="c-google-reponse"><small>Réponse déjà publiée sur Google</small><p>' + esc(x.reponseGoogle) + "</p></div>" :
            x.reponse ? '<div class="c-ia-bloc"><small>Brouillon IA — non publié</small><p>' + esc(x.reponse) + '</p></div>' : "") +
          '<div class="c-actions">' + (x.reponse && !x.reponseGoogle ? '<button class="c-btn" data-copier="' + esc(x.id) + '">Copier le brouillon</button>' : "") +
          (repondre ? '<a class="c-btn c-btn2" href="' + esc(repondre) + '" target="_blank" rel="noopener">Ouvrir dans Google</a>' : "") +
          (x.nouveau && !avisVus[x.id] ? '<button class="c-btn c-btn2" data-vu="' + esc(x.id) + '">Marquer vu</button>' : "") + "</div></article>";
      }).join("") : '<p class="c-vide">Aucun avis Google pour l’instant.</p>') + "</div>";
  }

  /* ------------------------------------------------------------------
     Assistant IA — propose, tu valides.
     ------------------------------------------------------------------ */
  function vueIA() {
    return '<div class="c-head"><div><small>Il lit tous les comptes, il n\'agit qu\'avec ton accord</small><h1>Assistant IA</h1></div></div>' + (REEL && REEL.assistant ? '' : exemple("assistant")) +
      '<div class="c-ia"><div class="c-panneau c-chat"><div class="c-messages" id="messages"></div>' +
        '<div class="c-suggestions">' + D.ia.map(function (q, i) { return '<button data-question="' + i + '">' + esc(q.q) + "</button>"; }).join("") + "</div>" +
        '<form class="c-saisie" id="saisie"><input id="question" placeholder="Pose une question sur un compte, un chiffre, un problème…" autocomplete="off"><button class="c-btn">Envoyer</button></form></div>' +
      '<div class="c-panneau"><div class="c-panneau-tete"><h2>Journal des actions</h2></div><ul class="c-journal" id="journal"></ul></div></div>';
  }
  function majIA() {
    $("messages").innerHTML = conversation.map(function (m, i) {
      if (m.qui === "moi") return '<p class="c-moi">' + esc(m.txt) + "</p>";
      return '<div class="c-lui' + (m.attente ? ' c-attente' : '') + '"><p>' + gras(m.txt) + "</p>" + (m.action ? '<div class="c-proposition' + (m.fait ? " c-fait" : "") + '"><small>Action proposée</small><b>' + esc(m.action.texte) + "</b>" +
        (m.fait ? "<span>" + (m.fait === "ok" ? "✓ Validée" : m.fait === "echec" ? "Échec" : "Refusée") + "</span>" : '<span><button class="c-btn" data-valider="' + i + '"' + (m.action.encours ? ' disabled' : '') + '>Valider</button><button class="c-btn c-btn2" data-refuser="' + i + '"' + (m.action.encours ? ' disabled' : '') + '>Refuser</button></span>') + "</div>" : "") + "</div>";
    }).join("") || '<p class="c-vide">Choisis une question ci-dessous, ou écris la tienne.</p>';
    var bas = $("messages"); bas.scrollTop = bas.scrollHeight;
    $("journal").innerHTML = journal.map(function (j) {
      return "<li><time>" + j.heure + "</time><b>" + esc(j.texte) + '</b><span class="' + (j.ok ? "c-up" : "c-muted") + '">' + (j.ok ? "validée par toi" : "refusée") + "</span></li>";
    }).join("") || '<li class="c-vide">Aucune action pour l\'instant.</li>';
  }
  function demander(txt, i) {
    conversation.push({ qui: "moi", txt: txt });
    if (REEL && REEL.assistant) {
      var attente = { qui: "ia", txt: "Je vérifie les données…", attente: true };
      conversation.push(attente); majIA();
      REEL.assistant({ conversation_id: conversationId, message: txt }, function (e, r) {
        attente.attente = false;
        if (e) { attente.txt = "Impossible de répondre : " + e; majIA(); return; }
        conversationId = r.conversation_id || conversationId;
        attente.txt = r.reponse || "Vérification terminée.";
        var actions = r.actions || [];
        if (actions.length) {
          attente.action = { id: actions[0].id, type: actions[0].type, params: actions[0].params, texte: actions[0].resume };
          for (var a = 1; a < actions.length; a++) conversation.push({ qui: "ia", txt: "Autre action proposée :", action: { id: actions[a].id, type: actions[a].type, params: actions[a].params, texte: actions[a].resume } });
        }
        majIA();
      });
      return;
    }
    var r = i != null ? D.ia[i] : null;
    conversation.push(r ? { qui: "ia", txt: r.r, action: r.action }
      : { qui: "ia", txt: "En démo, je ne réponds qu'aux questions proposées. Une fois branché aux vraies données, je lirai tous les comptes pour te répondre." });
    majIA();
  }
  function appliquer(a) {
    var c = parId[a.compte];
    if (!c) return;
    if (a.effet === "service") { c.etat.service = "Normal · 15 min"; c.etat.ouvert = true; c.etat.alerte = null; }
    if (a.effet === "relance") c.etat.alerte = "Nouvelle tentative de prélèvement programmée lundi.";
    if (a.effet === "sms") c.etat.alerte = "SMS envoyé au gérant avec le code cuisine. En attente d'une tablette.";
  }

  /* ------------------------------------------------------------------
     Chiffres — compte de résultat projeté
     ------------------------------------------------------------------ */
  function vueChiffres() {
    return '<div class="c-head"><div><small>Projection de fin de mois · montants HT</small><h1>Chiffres</h1></div>' +
      '<p class="c-head-note">Calculé sur la consommation actuelle des clients. Les hypothèses à droite sont modifiables. À faire valider par ton comptable.</p></div>' +
      '<div class="c-chiffres"><div class="c-panneau"><table class="c-resultat" id="resultat"></table></div>' +
      '<form class="c-panneau c-hyp" id="hyp">' + formHyp() + "</form></div>";
  }
  function ligne(lib, v, cl, sous) {
    return '<tr class="' + (cl || "") + '"><th>' + lib + (sous ? "<small>" + sous + "</small>" : "") + '</th><td class="n">' + (v === null ? "" : eur(v)) + '</td><td class="n c-muted">' + (v === null ? "" : eur0(v * 12)) + "</td></tr>";
  }
  function majChiffres(g) {
    $("resultat").innerHTML =
      '<thead><tr><th></th><th class="n">Ce mois</th><th class="n">Sur 12 mois</th></tr></thead><tbody>' +
      ligne("Abonnements", g.abos) + ligne("Dépassements et minutes PAYG", g.dep) +
      ligne("Chiffre d'affaires", g.ca, "c-total") +
      ligne("IA, téléphonie et voix", -g.ia, "", fmt0.format(g.proj) + " min × " + eur(H.coutMinute)) +
      ligne("Coûts opérationnels des comptes", -g.reserve, "", "planchers au quota : Basic 15 € · Pro 20 € · Business 24 € · Big 40 €") +
      ligne("Marge brute", g.brute, "c-total") +
      H.fixes.map(function (f) { return ligne(esc(f.nom), -f.montant); }).join("") +
      ligne("Résultat avant impôt", g.avantIS, "c-total") +
      ligne("Impôt sur les sociétés", -g.is, "", H.isReduit + " % jusqu'à " + eur0(H.seuilReduit) + " de bénéfice par an, " + H.isNormal + " % au-delà") +
      ligne("Bénéfice net", g.net, "c-total c-net " + sens(g.net)) +
      "</tbody><tfoot>" +
      ligne("Si tout est versé en dividendes", g.poche, "c-info", "après prélèvement forfaitaire de " + fmt2.format(H.dividendes) + " %") +
      ligne("TVA collectée, à reverser", g.tva, "c-info", "pas comptée dans le bénéfice") +
      "</tfoot>";
  }
  function champ(cle, lib, unite, centimes) {
    var v = centimes ? H[cle] / 100 : H[cle];
    return '<label class="c-champ"><span>' + lib + '</span><input type="number" step="any" min="0" data-hyp="' + cle + '"' + (centimes ? " data-centimes" : "") + ' value="' + v + '"><em>' + unite + "</em></label>";
  }
  function formHyp() {
    return "<h2>Hypothèses</h2>" +
      "<h3>Marge au plancher (pile au forfait)</h3>" +
      ["basic", "pro", "biz", "big"].map(function (id) {
        return '<label class="c-champ"><span>' + D.forfaits[id].nom + " · " + fmt0.format(D.forfaits[id].incluses) + ' min</span><input type="number" step="any" min="0" data-plancher="' + id + '" value="' + H.planchers[id] / 100 + '"><em>€</em></label>';
      }).join("") +
      "<h3>PAYG, essais et impayés</h3>" +
      champ("coutMinute", "Coût d'une minute d'appel", "€", true) +
      champ("numero", "Numéro de téléphone", "€ / mois", true) +
      champ("autresIA", "Autres IA de l'app, par compte", "€ / mois", true) +
      champ("stripe", "Frais d'un prélèvement", "€", true) +
      champ("commission", "Commission par client actif", "€ / mois", true) +
      champ("isReduit", "IS taux réduit", "%") + champ("seuilReduit", "Jusqu'à", "€ / an", true) + champ("isNormal", "IS taux normal", "%") +
      champ("tva", "TVA", "%") + champ("dividendes", "Prélèvement sur dividendes", "%") +
      "<h3>Charges fixes par mois</h3>" +
      H.fixes.map(function (f, i) {
        return '<label class="c-champ"><span>' + esc(f.nom) + '</span><input type="number" step="any" min="0" data-fixe="' + i + '" value="' + f.montant / 100 + '"><em>€</em></label>';
      }).join("") +
      '<button type="button" class="c-btn c-btn2" data-hyp-defaut>Revenir aux valeurs par défaut</button>';
  }

  /* ------------------------------------------------------------------
     Navigation et boucle
     ------------------------------------------------------------------ */
  var VUES = { marche: vueMarche, comptes: vueComptes, boite: vueBoite, avis: vueAvis, ia: vueIA, chiffres: vueChiffres };
  function lireAdresse() {
    var h = location.hash.replace(/^#/, "").split("/");
    page = VUES[h[0]] ? h[0] : "marche";
    if (page === "boite" && h[1]) mailChoisi = +h[1];
    $("main").innerHTML = VUES[page]();
    $("main").scrollTop = 0;
    document.querySelectorAll("#nav a").forEach(function (a) { a.classList.toggle("on", a.dataset.page === page); });
    if (page === "comptes" && h[1] && parId[h[1]]) ouvrirCompte(h[1]); else if (page !== "comptes") fermerVolet();
    maj(global());
  }
  function maj(g) {
    if (page === "marche") majMarche(g);
    if (page === "comptes") majComptes();
    if (page === "boite") majBoite();
    if (page === "ia") majIA();
    if (page === "chiffres") majChiffres(g);
    if (choisi) majVolet();
    $("appels").textContent = g.appels;
    $("nb-comptes").textContent = C.length;
    var m = D.mails.filter(function (x) { return x.urgence === "haute" && !traites[x.id]; }).length;
    var a = D.avis.liste.filter(function (x) { return x.nouveau && !avisVus[x.id]; }).length;
    if (REEL) { if (!D.avisReels) a = 0; if (!D.mailsReels) m = 0; }   /* exemples : pas de compteur */
    $("nb-mails").textContent = m || "";
    $("nb-avis").textContent = a || "";
    majBandeau();
  }

  document.addEventListener("click", function (ev) {
    var el = ev.target.closest("[data-compte],[data-tri],[data-fermer],[data-mail],[data-traite],[data-filtre-mail],[data-copier],[data-vu],[data-question],[data-valider],[data-refuser],[data-demander],[data-espace],[data-hyp-defaut],[data-repondre],[data-relancer-numero],[data-erreur]");
    if (!el) return;
    var d = el.dataset;
    if (d.repondre !== undefined) { el.href = el.href.split("&body=")[0] + "&body=" + encodeURIComponent($("brouillon").value); return; }
    if (d.compte) { location.hash = "comptes/" + d.compte; if (page === "comptes") ouvrirCompte(d.compte); }
    else if (d.tri) { tri = { col: d.tri, sens: tri.col === d.tri ? -tri.sens : -1 }; $("main").innerHTML = vueComptes(); majComptes(); }
    else if (d.fermer !== undefined) { fermerVolet(); try { history.replaceState(null, "", "#comptes"); } catch (e) {} majComptes(); }
    else if (d.mail) { mailChoisi = +d.mail; majBoite(); }
    else if (d.traite) {
      var idT = +d.traite, oui = !traites[idT];
      traites[idT] = oui; $("main").innerHTML = vueBoite(); majBoite(); maj(global());
      if (REEL && D.mailsReels) REEL.traiter(idT, oui, function (e) { if (e) { traites[idT] = !oui; toast("Impossible d’enregistrer : " + e); $("main").innerHTML = vueBoite(); majBoite(); } });
    }
    else if (d.filtreMail) { filtreMail = d.filtreMail; $("main").innerHTML = vueBoite(); majBoite(); }
    else if (d.erreur) {
      ev.preventDefault();
      var idE = +d.erreur;
      D.erreurs = (D.erreurs || []).filter(function (x) { return x.id !== idE; });
      if ($("traiter")) $("traiter").innerHTML = aTraiter();
      if (REEL && REEL.erreurVue) REEL.erreurVue(idE, function (e) { if (e) toast("Impossible d’enregistrer : " + e); });
    }
    else if (d.relancerNumero) {
      if (!confirm("Relancer l’achat automatique du numéro Pelyo pour ce restaurant ?")) return;
      REEL.relancerNumero(d.relancerNumero, function (e) {
        if (e) { toast("Impossible de relancer : " + e); return; }
        var cr = parId[d.relancerNumero]; if (cr) { cr.etat.numeroStatut = "attente"; cr.etat.alerte = null; }
        toast("Relancé : le serveur réessaie dans la minute."); majVolet();
      });
    }
    else if (d.copier) {
      var x = D.avis.liste.filter(function (a) { return String(a.id) === String(d.copier); })[0];
      if (!x) return;
      try { navigator.clipboard.writeText(x.reponse); toast("Brouillon copié."); } catch (e) { toast("Copie impossible dans ce navigateur."); }
    }
    else if (d.vu) {
      avisVus[d.vu] = true; $("main").innerHTML = vueAvis(); maj(global());
      if (REEL && D.avisReels && REEL.voirAvis) REEL.voirAvis(d.vu, true, function (e) {
        if (e) { delete avisVus[d.vu]; toast("Impossible d’enregistrer : " + e); $("main").innerHTML = vueAvis(); maj(global()); }
      });
    }
    else if (d.question) demander(D.ia[+d.question].q, +d.question);
    else if (d.valider || d.refuser) {
      var m = conversation[+(d.valider || d.refuser)];
      if (REEL && REEL.assistant && m.action && m.action.id) {
        m.action.encours = true; majIA();
        REEL.assistant({ conversation_id: conversationId, confirmation: { action_id: m.action.id, ok: !!d.valider } }, function (e, r) {
          m.action.encours = false;
          if (e) { toast("Action impossible : " + e); majIA(); return; }
          var echec = /^Échec\s*:/i.test(r.reponse || "");
          m.fait = echec ? "echec" : d.valider ? "ok" : "non";
          journal.unshift({ heure: heureParis.format(new Date()).slice(0, 5), texte: m.action.texte, ok: m.fait === "ok" });
          toast(r.reponse || (d.valider ? "Action validée." : "Action refusée."));
          majIA();
        });
        return;
      }
      m.fait = d.valider ? "ok" : "non";
      if (d.valider) appliquer(m.action);
      journal.unshift({ heure: heureParis.format(new Date(t)).slice(0, 5), texte: m.action.texte, ok: !!d.valider });
      toast(d.valider ? "Action validée (démo)." : "Action refusée.");
      majIA();
    }
    else if (d.demander) {
      var i = D.ia.map(function (q) { return q.action && q.action.compte; }).indexOf(d.demander);
      location.hash = "ia";
      setTimeout(function () { if (i >= 0) demander(D.ia[i].q, i); else if (parId[d.demander]) demander("Que se passe-t-il chez " + parId[d.demander].nom + " ?", null); }, 0);
    }
    else if (d.espace !== undefined) toast("Disponible avec les vraies données : ouvrira l'espace du gérant en lecture seule.");
    else if (d.hypDefaut !== undefined) { H = JSON.parse(JSON.stringify(H_DEFAUT)); garderHyp(); $("hyp").innerHTML = formHyp(); maj(global()); }
  });
  document.addEventListener("input", function (ev) {
    var el = ev.target;
    if (el.dataset.hyp) { H[el.dataset.hyp] = (+el.value || 0) * (el.hasAttribute("data-centimes") ? 100 : 1); garderHyp(); maj(global()); }
    if (el.dataset.plancher) {
      H.planchers[el.dataset.plancher] = (+el.value || 0) * 100; garderHyp(); maj(global());
    }
    if (el.dataset.fixe) { H.fixes[+el.dataset.fixe].montant = (+el.value || 0) * 100; garderHyp(); maj(global()); }
  });
  document.addEventListener("submit", function (ev) {
    if (ev.target.id !== "saisie") return;
    ev.preventDefault();
    var q = $("question").value.trim(); if (!q) return;
    var i = D.ia.map(function (x) { return x.q.toLowerCase(); }).indexOf(q.toLowerCase());
    $("question").value = "";
    demander(q, i >= 0 ? i : null);
  });
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && choisi) { fermerVolet(); try { history.replaceState(null, "", "#comptes"); } catch (e) {} majComptes(); } });
  document.addEventListener("mousemove", function (ev) {
    var cv = $("graph"); if (!cv) return;
    var r = cv.getBoundingClientRect();
    survol = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom ? ev.clientX - r.left : null;
  });
  window.addEventListener("hashchange", lireAdresse);
  window.addEventListener("resize", dessinerGraph);

  monterBandeau();
  lireAdresse();
  var compteur = 0;
  if (REEL) {
    setInterval(relireReel, 30000);
    var badge = document.querySelector(".c-demo");
    if (badge) { badge.textContent = "En direct"; badge.title = "Données réelles · cliquer pour se déconnecter"; badge.classList.add("c-reel"); badge.style.cursor = "pointer"; badge.addEventListener("click", function () { if (confirm("Se déconnecter de la console ?")) REEL.deconnecter(); }); }
  }
  setInterval(function () {
    var g = tic();
    if (++compteur % 5 === 0) C.forEach(function (c) { c.histo.push(eco(c).marge); if (c.histo.length > 60) c.histo.shift(); });
    /* La boîte, les avis et l'assistant ne bougent pas avec les appels :
       on ne les redessine pas (la saisie en cours serait perdue). */
    if (page === "marche" || page === "comptes") maj(g);
    else {
      if (page === "chiffres") majChiffres(g);
      if (choisi) majVolet();
      $("appels").textContent = g.appels;
      majBandeau();
    }
    $("horloge").textContent = "Paris " + heureParis.format(new Date(t));
  }, 1000);
  /* Le point de la courbe pulse entre deux secondes. */
  (function anim() { if (page === "marche") dessinerGraph(); requestAnimationFrame(anim); })();
})();
