/* =========================================================================
   Resto IA — application GÉRANT.
   Même écriture que devis60 : ES5, une IIFE, des fonctions renderXxxScreen()
   qui appellent renderNavbar(), construisent une chaîne de HTML, la posent
   avec setContent(), branchent les écouteurs puis règlent l'actionbar.
   Aucune classe CSS nouvelle : tout vient de theme.css (repris de devis60).
   Chiffres : uniquement D (data.js), argent en centimes via RIA.eur().
   ========================================================================= */
(function(){
  "use strict";

  var $ = RIA.$, esc = RIA.esc, eur = RIA.eur, eur0 = RIA.eur0, svg = RIA.svg;

  /* ---------- petite bibliothèque d'icônes (même principe que devis60) ---------- */
  var I = {
    phone:'<path d="M6.6 3.5 4 6.1c-.7.7-.9 1.8-.5 2.7a20 20 0 0 0 11.7 11.7c.9.4 2 .2 2.7-.5l2.6-2.6-4.2-2.8-2 1.6a15 15 0 0 1-6.5-6.5l1.6-2z"/>',
    power:'<path d="M12 3v7"/><path d="M6.5 6.5a8 8 0 1 0 11 0"/>',
    carte:'<path d="M5 4h14v16H5z"/><path d="M9 9h6M9 13h4"/>',
    micro:'<path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4"/>',
    profil:'<circle cx="12" cy="8" r="3.4"/><path d="M5 20c0-3.9 3.1-6.5 7-6.5S19 16.1 19 20"/>',
    feu:'<path d="M12 3c3 4 5 6 5 9a5 5 0 0 1-10 0c0-1.4.6-2.6 1.6-3.8C9.8 9.6 11 7.2 12 3z"/>',
    stop:'<rect x="5" y="5" width="14" height="14" rx="3"/>',
    sms:'<path d="M4 5h16v11H9l-5 4z"/><path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01"/>',
    check:'<path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/>',
    transfert:'<path d="M4 8h12l-3-3M20 16H8l3 3"/>',
    horloge:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    import:'<path d="M12 16V4m0 0 4 4m-4-4L8 8"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
    camion:'<path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
    carteb:'<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/>',
    bouclier:'<path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z"/>',
    doc:'<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h6M9 16h6"/>',
    alerte:'<path d="M12 4 2.5 20h19z"/><path d="M12 10v4M12 17h.01"/>',
    play:'<path d="M8 5l11 7-11 7z"/>',
    oeil:'<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.6"/>',
    envoi:'<path d="M4 20 20 12 4 4v6l12 2-12 2Z"/>'
  };

  /* ---------- état local (la maquette ne persiste rien) ---------- */
  var chargeId   = D.resto.charge;
  var reprise    = "";
  var menuCat    = 0;
  var compteTab  = "horaires";
  var scopeIdx   = 0;
  var forfaitSel = D.resto.forfait;
  var testVoix   = false;
  var voix = { prenom:D.voix.prenom, ton:D.voix.ton, vitesse:D.voix.vitesse,
               langues:D.voix.langues.slice(0), accueil:D.voix.accueil, signature:D.voix.signature };
  var livr = { minimum:D.livraison.minimum, frais:D.livraison.frais };

  var ETATS = {
    appel:       { lbl:"IA en appel",              pill:"attente" },
    attente:     { lbl:"En attente de confirmation", pill:"attente" },
    confirmee:   { lbl:"Confirmée",                pill:"signe" },
    preparation: { lbl:"En préparation",           pill:"signe" },
    prete:       { lbl:"Prête",                    pill:"signe" },
    expiree:     { lbl:"Expirée",                  pill:"refuse" }
  };
  var ISSUES = {
    commande:  { lbl:"Commande",  pill:"signe" },
    question:  { lbl:"Question",  pill:"attente" },
    transfert: { lbl:"Transfert", pill:"attente" },
    expiree:   { lbl:"Expirée",   pill:"refuse" }
  };
  var SCOPES = [
    { nom:"Ouverture physique",            tag:"Salle", dot:true,  sous:"Salle et comptoir ouverts." },
    { nom:"Prise de commande téléphonique", tag:"Tél.",  dot:true,  sous:"Dernière commande 15 minutes avant la fermeture." },
    { nom:"Livraison",                      tag:"Livr.", dot:false, sous:"Le soir uniquement, rayon " + D.livraison.rayon + ", délai " + D.livraison.delai + " min." }
  ];
  var JOURS = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];

  /* ---------- fragments repris de devis60 ---------- */
  function bloc(html){ return '<div class="ag-rows">' + html + '</div>'; }
  function topbar(eyebrow, titre, chips){
    return '<div class="topbar"><span class="eyebrow">' + esc(eyebrow) + '</span><h1>' + esc(titre) + '</h1>' + (chips ? '<div class="chip-row">' + chips + '</div>' : '') + '</div>';
  }
  function fsection(t){ return '<div class="fsection">' + esc(t) + '</div>'; }
  function ligne(n, sous, v, added){
    return '<div class="line' + (added ? ' added' : '') + '"><div class="n">' + esc(n) + (sous ? '<small>' + esc(sous) + '</small>' : '') + '</div><div class="v">' + esc(v) + '</div></div>';
  }
  function acctrow(k, v){ return '<div class="acctrow"><span>' + esc(k) + '</span><span>' + esc(v) + '</span></div>'; }
  function factcard(id, icone, titre, sous, bouton){
    return '<div class="factcard"><div class="fc-ico">' + svg(icone) + '</div>' + '<div class="fc-info"><div class="fc-title">' + esc(titre) + '</div><div class="fc-sub">' + esc(sous) + '</div></div>' +
      (bouton ? '<button class="fc-btn" id="' + id + '">' + esc(bouton) + '</button>' : '') + '</div>';
  }
  function qchip(val, txt, on){
    return '<button class="qchip' + (on ? ' primary' : '') + '" data-v="' + esc(val) + '">' + esc(txt) + '</button>';
  }
  function banniere(txt){ return '<div class="alert-banner">' + svg(I.alerte) + '<span>' + esc(txt) + '</span></div>'; }
  function barre(libelle, pct, ton){
    return '<div class="charge-wrap"><span class="charge-lbl">' + esc(libelle) + '</span>' + '<div class="charge-bar"><div class="charge-fill ' + (ton || "ok") + '" style="width:' + pct + '%"></div></div></div>';
  }
  function tabs(liste, actif){
    return '<div class="journaltabs">' + liste.map(function(t){
      return '<button class="jtab' + (t.id === actif ? ' on' : '') + '" data-jt="' + esc(t.id) + '">' + esc(t.lbl) + (t.n != null ? '<span class="jn">' + t.n + '</span>' : '') + '</button>';
    }).join("") + '</div>';
  }
  function surTabs(fn){
    var b = $("content").querySelectorAll(".jtab");
    for (var i = 0; i < b.length; i++) b[i].addEventListener("click", function(){ fn(this.dataset.jt); });
  }
  function surClic(id, fn){ var e = $(id); if (e) e.addEventListener("click", fn); }
  function surTous(racine, sel, fn){
    var n = racine.querySelectorAll(sel);
    for (var i = 0; i < n.length; i++) n[i].addEventListener("click", fn);
  }

  /* Progression simulée : la seule largeur en style= de tout le fichier. */
  function simuler(hote, libelle, fin){
    hote.innerHTML = barre(libelle, 0);
    var p = 0;
    var id = RIA.every(function(){
      p += 6 + Math.round(Math.random() * 11);
      if (p >= 100){ p = 100; clearInterval(id); RIA.after(fin, 340); }
      var f = hote.querySelector(".charge-fill");
      if (f) f.style.width = p + "%";
    }, 150);
  }

  function charge(){
    var c = D.charges.filter(function(x){ return x.id === chargeId; })[0];
    return c || D.charges[0];
  }
  function phraseClient(c){
    if (c.id === "stop") return "Le restaurant a arrêté les commandes pour le moment" + (reprise ? ", reprise prévue vers " + reprise : "") + ". Je peux répondre à vos questions.";
    if (c.id === "normal") return "Ce sera prêt dans " + c.delai + " minutes au comptoir.";
    if (c.id === "rush")   return "Il y a du monde ce soir, ce sera prêt dans " + c.delai + " minutes. Est-ce que cela vous convient ?";
    return "Nous sommes très chargés : " + c.delai + " minutes d'attente, et la livraison est suspendue. Le retrait vous convient ?";
  }
  function produit(id){
    for (var i = 0; i < D.menu.length; i++)
      for (var j = 0; j < D.menu[i].items.length; j++)
        if (D.menu[i].items[j].id === id) return D.menu[i].items[j];
    return null;
  }
  function commande(id){ return D.commandes.filter(function(c){ return c.id === id; })[0]; }
  function coutIA(sec){ return Math.round(D.coutMinute * sec / 60); }
  function forfait(id){ return D.forfaits.filter(function(f){ return f.id === id; })[0] || D.forfaits[2]; }

  /* =======================================================================
     1) SERVICE — état en ligne, charge, chiffres du jour, dernières commandes
     ======================================================================= */
  function renderServiceScreen(){
    RIA.renderNavbar("service");
    var c = charge(), ouvert = c.id !== "stop", j = D.jour;
    var chipsCharges = D.charges.map(function(x){ return qchip(x.id, x.nom, x.id === chargeId); }).join("");
    var cartes = D.commandes.slice(0, 3).map(function(o){
      var e = ETATS[o.etat];
      return '<div class="card" data-cmd="' + o.id + '"><div class="row1"><div><div class="who">#' + o.id + (o.client ? ' · ' + esc(o.client) : '') + '</div>' +
        '<div class="job">' + esc(o.mode === "livraison" ? "Livraison" : "Retrait") + ' · ' + esc(o.heure) + '</div></div>' + '<div class="amtwrap"><span class="amount">' + eur(o.total) + '</span></div></div>' +
        '<div class="row2"><span class="date">' + esc(o.prete ? "prête " + o.prete : "en cours") + '</span>' + RIA.pill(e.lbl, e.pill) + '</div></div>';
    }).join("");

    RIA.setContent(
      topbar("Service en direct", "Ce soir", RIA.chip(ouvert ? "Assistant actif" : "Prise de commande en pause", I.power) + RIA.chip(D.resto.tel, I.phone) + RIA.pill(c.nom, c.pill)) +
      banniere((D.commandes.filter(function(o){ return o.etat === "appel"; }).length ? "Un appel est en cours. " : "") + D.commandes.filter(function(o){ return o.etat === "attente"; }).length + " commande(s) attendent la validation du client : rien ne part en cuisine avant confirmation.") +
      bloc(factcard("goCuisine", I.feu, "Production", D.commandes.length + " commandes suivies en temps réel · alerte sonore active", "Voir la file")) +
      fsection("Mode de service") + bloc('<div class="chips" id="chargeChips">' + chipsCharges + '</div>') + '<div class="lines">' +
        ligne("Délai annoncé", "ce que l'IA promet au téléphone", ouvert ? c.delai + " min" : "aucune commande") + ligne("Retrait", "comptoir", ouvert ? "ouvert" : "suspendu") +
        ligne("Livraison", D.livraison.rayon + " · " + eur(livr.frais) + " de frais", c.id === "normal" || c.id === "rush" ? "ouverte" : "suspendue") + '</div>' +
      '<div class="lines"><div class="row bot"><div class="bub">' + esc(phraseClient(c)) + '</div></div></div>' + RIA.note("<b>Phrase annoncée :</b> " + esc(c.dit)) + fsection("Le service aujourd’hui") +
      '<div class="stats">' + RIA.stat(String(j.appels), "appels traités") + RIA.stat(String(j.commandes), "commandes") + RIA.stat(String(j.expirees), "non validées") +
        RIA.stat(eur0(j.ca), "valeur confirmée") + RIA.stat(eur(j.panier), "panier moyen") + RIA.stat(RIA.dur(j.minutes * 60), "temps IA") + '</div>' +
      RIA.note("Valeur des commandes confirmées : <b>" + esc(eur0(j.ca)) + "</b>. Resto IA ne collecte aucun paiement. Coût IA indicatif : " + esc(eur(j.minutes * D.coutMinute)) + " · " + j.transferts + " transferts.") +
      fsection("File en direct") + '<div class="list">' + cartes + '</div>'
    );

    surClic("goCuisine", function(){ RIA.toast("Ouverture de l'écran cuisine…"); RIA.openApp("cuisine"); });
    surTous($("content"), "#chargeChips .qchip", function(){
      chargeId = this.dataset.v;
      if (chargeId !== "stop") reprise = "";
      renderServiceScreen();
      RIA.toast("Charge « " + charge().nom + " » — délai annoncé mis à jour.");
    });
    surTous($("content"), ".card", function(){ sheetCommande(commande(parseInt(this.dataset.cmd, 10))); });

    RIA.actionbar('<div class="ctabar"><button class="cta" id="btnStop">' + svg(ouvert ? I.stop : I.power) + (ouvert ? "Mettre en pause 30 min" : "Reprendre les commandes") + '</button><div class="secrow">' +
      '<button class="sec" id="btnAppels">' + svg(I.phone) + 'Suivre l’appel</button>' + '<button class="sec" id="btnMenu">' + svg(I.carte) + 'Gérer les ruptures</button></div></div>');
    surClic("btnStop", function(){
      if (charge().id === "stop"){
        chargeId = "normal"; reprise = "";
        RIA.toast("Commandes rouvertes — délai annoncé " + charge().delai + " min.");
      } else {
        var d = new Date(Date.now() + 30 * 60000);
        reprise = String(d.getHours()).padStart(2, "0") + "h" + String(d.getMinutes()).padStart(2, "0");
        chargeId = "stop";
        RIA.toast("Commandes stoppées. L'IA répond encore et annonce une reprise à " + reprise + ".");
      }
      renderServiceScreen();
    });
    surClic("btnAppels", renderAppelsScreen);
    surClic("btnMenu", sheetRuptures);
  }

  /* Détail d'une commande, dans la feuille coulissante. */
  function sheetCommande(o){
    if (!o) return;
    var e = ETATS[o.etat];
    var lignes = o.lignes.length ? o.lignes.map(function(l){
      var sous = [l.opt, l.sup ? "+ " + l.sup : "", l.dem].filter(function(x){ return !!x; }).join(" · ");
      return ligne(l.q + "× " + l.nom, sous, eur(l.prix));
    }).join("") : '<div class="empty">Panier encore vide — l\'IA est en ligne avec le client.</div>';

    var corps = RIA.sheet("Commande #" + o.id,
      '<div class="chip-row">' + RIA.pill(e.lbl, e.pill) + RIA.chip(o.mode === "livraison" ? "Livraison" : "Retrait", o.mode === "livraison" ? I.camion : I.horloge) + RIA.chip(o.heure, I.horloge) + '</div>' +
      '<div class="lines">' + lignes + (o.frais ? ligne("Frais de livraison", o.km + " km par la route", eur(o.frais)) : "") + ligne("Total", o.paiement || "paiement à définir", eur(o.total + (o.frais || 0))) +
      '</div>' + '<div class="acctinfo">' + acctrow("Client", o.client || "non communiqué") + acctrow("Heure annoncée", o.prete || "—") + (o.adresse ? acctrow("Adresse", o.adresse) : "") +
        acctrow("Ticket", o.imprime ? "imprimé" : "pas encore imprimé") + (o.motif ? acctrow("Motif", o.motif) : "") + '</div>' + RIA.note(esc(D.regles.paiement)) +
      '<div class="ctabar"><button class="cta" id="shCuisine">' + svg(I.feu) + 'Suivre en cuisine</button></div>'
    );
    surClic("shCuisine", function(){
      RIA.closeSheet();
      RIA.toast("Commande #" + o.id + " — écran cuisine");
      RIA.openApp("cuisine");
    });
    return corps;
  }

  /* =======================================================================
     2) APPELS — l'appel en direct rejoué, puis le journal
     ======================================================================= */
  var PAS = 210;                 /* millisecondes par seconde d'appel simulée */
  var sec = 0, idx = 0, tid = null, panier = [], confirme = false, fini = false;

  function renderAppelsScreen(){
    RIA.renderNavbar("appels");
    var journal = D.appels.map(function(a, i){
      var s = ISSUES[a.issue];
      return '<div class="jcard" data-a="' + i + '">' + '<div class="jcard-info"><div class="jcard-who">' + esc(a.num) + '</div>' + '<div class="jcard-meta">' + RIA.pill(s.lbl, s.pill) +
        '<span class="jcard-date">' + esc(a.h + " · " + RIA.dur(a.duree)) + '</span></div></div>' + '<span class="jcard-amt">' + (a.montant ? eur(a.montant) : "—") + '</span>' +
        '<div class="jcard-actions"><button class="jactionbtn" data-voir="' + i + '">' + svg(I.oeil) + '</button></div>' + '</div>';
    }).join("");

    RIA.setContent(
      topbar("Appel en direct", "Appels",
        '<span class="chip" id="chrono">00:00</span>' + '<span class="chip" id="cout">' + esc(eur(0)) + '</span>' + '<span class="pill attente" id="etatAppel">En ligne</span>') + '<div class="lines" id="panier"></div>' +
      '<div class="thread" id="thread"></div>' + fsection("Journal des appels") + '<div class="jrows">' + journal + '</div>'
    );

    surTous($("content"), ".jcard", function(){ sheetAppel(D.appels[this.dataset.a]); });
    surTous($("content"), ".jactionbtn", function(ev){
      ev.stopPropagation();
      sheetAppel(D.appels[this.dataset.voir]);
    });

    RIA.actionbar(
      '<div class="quickreplies chip-row">' + '<button class="qreply" data-q="rejouer">Rejouer l\'appel</button>' + '<button class="qreply" data-q="transfert">Transférer au restaurant</button>' +
        '<button class="qreply" data-q="commande">Voir la commande</button>' + '</div>' + '<div class="composer"><input class="field" id="noteInput" placeholder="Note interne sur cet appel…">' +
        '<button class="sendb" id="noteSend">' + svg(I.envoi) + '</button></div>'
    );
    surTous($("actionbar"), ".qreply", function(){
      var q = this.dataset.q;
      if (q === "rejouer") jouerAppel();
      else if (q === "transfert") transferer();
      else sheetCommande(commande(248));
    });
    surClic("noteSend", envoyerNote);
    $("noteInput").addEventListener("keydown", function(e){ if (e.key === "Enter") envoyerNote(); });

    jouerAppel();
  }

  function envoyerNote(){
    var i = $("noteInput");
    if (!i || !i.value.trim()) return;
    addBubble("me", i.value.trim(), false);
    i.value = "";
    RIA.toast("Note interne ajoutée à la fiche d'appel.");
  }

  /* --- bulles, copiées de devis60 (effet d'écriture progressive) --- */
  function addBubble(role, text, typed){
    var thread = $("thread");
    if (!thread) return null;
    var row = document.createElement("div");
    row.className = "row " + (role === "me" ? "me" : "bot");
    var bub = document.createElement("div");
    bub.className = "bub";
    row.appendChild(bub);
    thread.appendChild(row);
    thread.scrollTop = thread.scrollHeight;
    if (typed){
      var i = 0;
      var step = Math.max(1, Math.round(text.length / 44));
      var iv = setInterval(function(){
        if (!document.body.contains(bub)){ clearInterval(iv); return; }
        i += step;
        bub.textContent = text.slice(0, i);
        if (i < text.length){
          var caret = document.createElement("span");
          caret.className = "caret";
          bub.appendChild(caret);
        }
        thread.scrollTop = thread.scrollHeight;
        if (i >= text.length) clearInterval(iv);
      }, 18);
    } else {
      bub.textContent = text;
    }
    return row;
  }
  function addThinking(){
    var thread = $("thread");
    if (!thread) return null;
    var row = document.createElement("div");
    row.className = "row bot";
    row.innerHTML = '<div class="thinkRow"><span class="thinkLogo">' + svg(I.micro) + '</span>' + '<span class="thinkDots">L\'assistant écoute…</span></div>';
    thread.appendChild(row);
    thread.scrollTop = thread.scrollHeight;
    return row;
  }
  function addFact(icone, titre, sous, bouton, fn){
    var thread = $("thread");
    if (!thread) return;
    var row = document.createElement("div");
    row.className = "row bot";
    row.innerHTML = factcard("", icone, titre, sous, bouton);
    thread.appendChild(row);
    if (bouton){
      var b = row.querySelector(".fc-btn");
      if (b) b.addEventListener("click", fn);
    }
    thread.scrollTop = thread.scrollHeight;
  }

  function majPanier(){
    var p = $("panier");
    if (!p) return;
    if (!panier.length){
      p.innerHTML = '<div class="empty">Panier vide — l\'IA construit la commande en silence pendant qu\'elle parle.</div>';
      return;
    }
    var total = 0;
    var html = panier.map(function(l, i){
      total += l.prix;
      var sous = [l.opt, l.sup ? "+ " + l.sup : ""].filter(function(x){ return !!x; }).join(" · ");
      return ligne(l.q + "× " + l.nom, sous, eur(l.prix), i === panier.length - 1 && !confirme);
    }).join("");
    p.innerHTML = html + ligne("Total", confirme ? "confirmé par le client" : "en cours de construction", eur(total));
  }
  function majEntete(){
    var ch = $("chrono"), co = $("cout"), et = $("etatAppel");
    if (ch) ch.textContent = RIA.chrono(sec);
    if (co) co.textContent = eur(coutIA(sec));
    if (!et) return;
    et.className = "pill " + (fini ? "signe" : confirme ? "signe" : "attente");
    et.textContent = fini ? "Confirmée" : confirme ? "Validation client" : "En ligne";
  }

  function jouerAppel(){
    if (tid){ clearInterval(tid); tid = null; }
    sec = 0; idx = 0; panier = []; confirme = false; fini = false;
    var thread = $("thread");
    if (!thread) return;
    thread.innerHTML = "";
    majPanier(); majEntete();
    addThinking();
    tid = RIA.every(tickAppel, PAS);
  }

  function tickAppel(){
    if (!$("thread")){ clearInterval(tid); tid = null; return; }
    sec++;
    while (idx < D.appel.length && D.appel[idx].t <= sec){
      jouerEntree(D.appel[idx]);
      idx++;
    }
    majEntete();
    if (idx >= D.appel.length && sec > D.appel[D.appel.length - 1].t + 2){
      clearInterval(tid); tid = null;
    }
  }

  function jouerEntree(e){
    var thread = $("thread");
    var attente = thread.querySelector(".thinkRow");
    if (attente && attente.parentNode) attente.parentNode.remove();

    if (e.qui === "bot"){ addBubble("bot", e.txt, true); }
    else if (e.qui === "me"){
      addBubble("me", e.txt, false);
      if (e.panier){ panier.push({ q:e.panier.q, nom:e.panier.nom, opt:e.panier.opt, prix:e.panier.prix }); majPanier(); }
      if (e.maj && panier.length){
        var l = panier[panier.length - 1];
        if (e.maj.opt) l.opt = e.maj.opt;
        if (e.maj.sup) l.sup = e.maj.sup;
        if (e.maj.prix) l.prix = e.maj.prix;
        majPanier();
      }
      if (e.confirme){ confirme = true; majPanier(); }
      if (!e.confirme) addThinking();
    } else {
      if (e.sms){
        addFact(I.sms, "Récapitulatif SMS envoyé", "Le client peut répondre OK ou MODIF", "Voir le SMS", sheetSms);
        addBubble("bot", D.sms, false);
      } else if (e.fin){
        fini = true;
        addFact(I.check, e.txt, "Le ticket part en cuisine après confirmation", "Voir la commande", function(){
          sheetCommande(commande(248));
        });
        RIA.toast("Commande #248 confirmée — envoyée en cuisine.");
      } else {
        addFact(I.check, e.txt, "Panier recalculé sans relancer la commande", "", null);
      }
      majPanier();
    }
  }

  function transferer(){
    if (tid){ clearInterval(tid); tid = null; }
    addFact(I.transfert, "Transfert vers le restaurant", "L'IA s'excuse, passe l'appel et n'insiste pas.", "", null);
    RIA.toast("Appel transféré — " + D.regles.transfert.slice(0, 60) + "…");
    fini = true; majEntete();
  }

  function sheetSms(){
    var corps = RIA.sheet("Récapitulatif SMS",
      '<div class="chip-row">' + RIA.chip("06 •• •• •• 47", I.sms) + RIA.chip("19:41", I.horloge) + '</div>' + '<div class="lines"><div class="row bot"><div class="bub" id="smsBub"></div></div></div>' +
      RIA.note(esc(D.regles.confirmation)) + RIA.note(esc(D.regles.modification)) + '<div class="ctabar"><button class="cta" id="smsRenv">' + svg(I.sms) + 'Renvoyer le récapitulatif</button></div>');
    corps.querySelector("#smsBub").textContent = D.sms;
    surClic("smsRenv", function(){
      RIA.toast("Récapitulatif renvoyé — l'ancien est invalidé, pas de seconde commande.");
      RIA.closeSheet();
    });
  }

  function sheetAppel(a){
    if (!a) return;
    var s = ISSUES[a.issue];
    var o = a.cmd ? commande(a.cmd) : null;
    var lignes = o ? o.lignes.map(function(l){
      var sous = [l.opt, l.sup ? "+ " + l.sup : "", l.dem].filter(function(x){ return !!x; }).join(" · ");
      return ligne(l.q + "× " + l.nom, sous, eur(l.prix));
    }).join("") : "";

    RIA.sheet("Appel de " + a.h,
      '<div class="chip-row">' + RIA.pill(s.lbl, s.pill) + RIA.chip(RIA.dur(a.duree), I.horloge) + RIA.chip(a.num, I.phone) + '</div>' + '<div class="acctinfo">' + acctrow("Heure", a.h) +
        acctrow("Durée", RIA.dur(a.duree)) + acctrow("Coût IA", eur(coutIA(a.duree))) + acctrow("Issue", s.lbl) + (a.cmd ? acctrow("Commande", "#" + a.cmd) : "") + (a.info ? acctrow("Détail", a.info) : "") + '</div>' +
      (lignes ? '<div class="lines">' + lignes + ligne("Total", o.paiement || "", eur(o.total + (o.frais || 0))) + '</div>' : "") + (a.issue === "transfert" ? RIA.note(esc(D.regles.transfert)) : "") +
      (a.issue === "expiree" ? RIA.note(esc(D.regles.confirmation)) : "") + RIA.note(esc(D.regles.rgpd)) +
      (o ? '<div class="ctabar"><button class="cta" id="apCmd">' + svg(I.feu) + 'Ouvrir la commande #' + o.id + '</button></div>' : "")
    );
    if (o) surClic("apCmd", function(){ sheetCommande(o); });
  }

  /* =======================================================================
     3) MENU — catégories, produits, règles posées par l'IA
     ======================================================================= */
  function renderMenuScreen(){
    RIA.renderNavbar("menu");
    var cat = D.menu[menuCat];
    var rupt = 0;
    D.menu.forEach(function(c){ c.items.forEach(function(it){ if (!it.dispo) rupt++; }); });

    var cartes = cat.items.map(function(it){
      var nbSup = it.sup.filter(function(s){ return s.dispo; }).length;
      return '<div class="card" data-p="' + esc(it.id) + '"><div class="row1"><div>' + '<div class="who">' + esc(it.nom) + '</div>' + '<div class="job">' + esc(it.inclus || it.prec || "sans inclusion") + '</div></div>' +
        '<div class="amtwrap"><span class="amount">' + eur(it.prix) + '</span></div></div>' + '<div class="row2"><span class="date">' + it.obl.length + ' choix · ' + nbSup + ' suppl.</span>' +
        RIA.pill(it.dispo ? "Disponible" : "En rupture", it.dispo ? "signe" : "refuse") + '</div></div>';
    }).join("");

    RIA.setContent(
      topbar("Carte", "Menu intelligent",
        RIA.chip(D.menu.length + " cat.", I.carte) + RIA.chip(rupt + " rupture" + (rupt > 1 ? "s" : ""), I.alerte)) +
      tabs(D.menu.map(function(c, i){ return { id:String(i), lbl:c.cat, n:c.items.length }; }), String(menuCat)) + '<div class="list">' + cartes + '</div>' +
      RIA.note("L'IA pose les choix obligatoires dans l'ordre de la fiche produit, propose les suppléments disponibles, puis lit le récapitulatif. " + esc(D.regles.allergenes))
    );

    surTabs(function(id){ menuCat = parseInt(id, 10); renderMenuScreen(); });
    surTous($("content"), ".card", function(){ sheetProduit(produit(this.dataset.p)); });

    RIA.actionbar(
      '<div class="ctabar">' + '<button class="cta" id="btnImport">' + svg(I.import) + 'Importer une carte</button>' + '<div class="secrow">' + '<button class="sec" id="btnRupt">' + svg(I.alerte) + 'Ruptures</button>' +
          '<button class="sec" id="btnTout">' + svg(I.check) + 'Tout remettre</button>' + '</div>' + '</div>'
    );
    surClic("btnImport", sheetImport);
    surClic("btnRupt", sheetRuptures);
    surClic("btnTout", function(){
      D.menu.forEach(function(c){ c.items.forEach(function(it){ it.dispo = true; }); });
      renderMenuScreen();
      RIA.toast("Tous les produits sont de nouveau proposés par l'IA.");
    });
  }

  function sheetProduit(it){
    if (!it) return;
    var obl = it.obl.length ? it.obl.map(function(o, i){
      var borne = o.min === o.max ? ("exactement " + o.min) : (o.min + " à " + o.max);
      return ligne((i + 1) + ". " + o.nom, o.choix, borne);
    }).join("") : '<div class="empty">Aucun choix obligatoire : l\'IA enregistre directement.</div>';

    var sup = it.sup.length ? it.sup.map(function(s){
      return ligne(s.nom, s.dispo ? "proposé par l'IA" : "en rupture, non proposé", s.prix ? "+" + eur(s.prix) : "offert");
    }).join("") : '<div class="empty">Aucun supplément sur ce produit.</div>';

    var dem = (it.dem || "").split(" · ").filter(function(x){ return !!x; })
      .map(function(x){ return RIA.chip(x); }).join("");

    RIA.sheet(it.nom,
      '<div class="pricecard"><div class="label">Prix carte</div><div class="price">' + eur(it.prix) + '</div>' + (it.inclus ? '<div class="gain">' + svg(I.check) + esc(it.inclus) + '</div>' : '') + '</div>' +
      fsection("Choix obligatoires") + '<div class="lines">' + obl + '</div>' + RIA.note("L'IA pose les questions <b>dans cet ordre</b> et ne valide pas tant que les minimums ne sont pas atteints.") +
      fsection("Suppléments") + '<div class="lines">' + sup + '</div>' + fsection("Précisions") + '<div class="acctinfo">' + acctrow("Mentions", it.prec || "aucune mention particulière") +
        acctrow("Prononciation", it.nom + " — telle qu'annoncée au client") + '</div>' + RIA.note(esc(D.regles.allergenes)) + fsection("Demandes admises") +
      (dem ? bloc('<div class="chip-row">' + dem + '</div>') : '<div class="empty">Aucune demande particulière déclarée.</div>') +
      '<div class="ctabar"><button class="cta" id="pDispo">' + svg(it.dispo ? I.alerte : I.check) + (it.dispo ? "Passer en rupture" : "Remettre disponible") + '</button>' +
        '<div class="secrow"><button class="sec" id="pFerme">' + svg(I.carte) + 'Fermer la fiche</button></div></div>'
    );

    surClic("pDispo", function(){
      it.dispo = !it.dispo;
      RIA.closeSheet();
      renderMenuScreen();
      RIA.toast(it.dispo
        ? it.nom + " est de nouveau proposé dès le prochain appel."
        : it.nom + " en rupture immédiate : les commandes déjà confirmées ne bougent pas, l'IA propose une alternative.");
    });
    surClic("pFerme", RIA.closeSheet);
  }

  function sheetRuptures(){
    var rows = [];
    D.menu.forEach(function(c){
      c.items.forEach(function(it){
        if (!it.dispo) rows.push({ nom:it.nom, cat:c.cat, id:it.id });
        it.sup.forEach(function(s){ if (!s.dispo) rows.push({ nom:s.nom + " (supplément)", cat:it.nom, id:"" }); });
      });
    });
    RIA.sheet("Ruptures en cours",
      (rows.length
        ? '<div class="jrows">' + rows.map(function(r){
            return '<div class="jcard"' + (r.id ? ' data-p="' + esc(r.id) + '"' : '') + '>' + '<div class="jcard-info"><div class="jcard-who">' + esc(r.nom) + '</div>' +
              '<div class="jcard-meta">' + RIA.pill("En rupture", "refuse") + '<span class="jcard-date">' + esc(r.cat) + '</span></div></div>' +
              (r.id ? '<div class="jcard-actions"><button class="jactionbtn" data-p="' + esc(r.id) + '">' + svg(I.check) + '</button></div>' : '') + '</div>';
          }).join("") + '</div>'
        : '<div class="empty">Aucune rupture : toute la carte est proposée par l\'IA.</div>') +
      RIA.note("La rupture est <b>immédiate pour les nouveaux appels</b>, sans repasser par Publier. Elle ne supprime jamais une commande confirmée et entraîne une proposition d'alternative.")
    );
    surTous($("sheet"), ".jcard[data-p]", function(){
      var it = produit(this.dataset.p);
      if (!it) return;
      it.dispo = true;
      RIA.closeSheet();
      renderMenuScreen();
      RIA.toast(it.nom + " est remis en vente.");
    });
  }

  function sheetImport(){
    var corps = RIA.sheet("Importer une carte",
      RIA.note("L'IA lit la source, crée un <b>brouillon</b> de catégories, produits, formules et prix. Rien n'est publié sans votre validation.") + fsection("Source") + bloc('<div class="chips" id="impSrc">' +
        qchip("photo", "Photo du menu", true) + qchip("pdf", "PDF") + qchip("site", "Site du restaurant") + qchip("saisie", "Saisie à la main") + '</div>') +
      '<div class="lines" id="impZone"><div class="empty">Choisissez une source puis lancez la lecture.</div></div>' +
      '<div class="ctabar"><button class="cta" id="impGo">' + svg(I.import) + 'Lire la carte</button></div>');

    var src = "photo";
    surTous(corps, "#impSrc .qchip", function(){
      var n = corps.querySelectorAll("#impSrc .qchip");
      for (var i = 0; i < n.length; i++) n[i].classList.remove("primary");
      this.classList.add("primary");
      src = this.dataset.v;
    });
    var pret = false;
    surClic("impGo", function(){
      if (pret){ RIA.closeSheet(); RIA.toast("Brouillon publié : la nouvelle carte s'applique dès le prochain appel."); return; }
      var libelles = { photo:"Lecture de la photo…", pdf:"Extraction du PDF…", site:"Analyse du site…", saisie:"Mise en forme de la saisie…" };
      $("impGo").disabled = true;
      simuler($("impZone"), libelles[src], function(){
        var zone = $("impZone");
        if (!zone) return;
        zone.innerHTML =
          ligne("Catégories reconnues", "Tacos · Sandwichs · Pizzas · À côté", String(D.menu.length)) +
          ligne("Produits", "prix et inclusions repris de la source", String(D.menu[0].items.length + D.menu[1].items.length + D.menu[2].items.length + D.menu[3].items.length)) +
          ligne("Choix obligatoires", "taille, viande, sauce, base…", "détectés") + ligne("Suppléments", "avec leurs prix", "détectés") + ligne("À vérifier", "prix illisibles sur la source", "2");
        var b = $("impGo");
        if (b){ b.disabled = false; b.innerHTML = svg(I.check) + "Publier le brouillon"; }
        pret = true;
        RIA.toast("Brouillon prêt — vérifiez avant publication.");
      });
    });
  }

  /* =======================================================================
     4) VOIX — identité de l'assistant, aperçu vivant, appel test
     ======================================================================= */
  function renderVoixScreen(){
    RIA.renderNavbar("voix");

    RIA.setContent(
      topbar("Assistant téléphonique", "Voix et identité",
        RIA.chip(voix.prenom, I.micro) + RIA.chip(voix.ton, I.check) + RIA.pill(testVoix ? "Appel test validé" : "Appel test requis", testVoix ? "signe" : "attente")) +
      (testVoix ? "" : banniere("Un appel test sur votre vrai menu est obligatoire avant activation. Un changement de voix ne s'applique jamais au milieu d'un appel en cours.")) + fsection("Prénom de l'assistant") +
      '<div class="authfield"><label class="flabel" for="vPrenom">Prénom annoncé au décrochage</label><input class="field" id="vPrenom" value="' + esc(voix.prenom) + '"></div>' + fsection("Ton") +
      bloc('<div class="chips" id="vTon">' + D.tons.map(function(t){ return qchip(t, t, t === voix.ton); }).join("") + '</div>') + fsection("Vitesse") +
      bloc('<div class="chips" id="vVit">' + D.vitesses.map(function(v){ return qchip(v, v, v === voix.vitesse); }).join("") + '</div>') + fsection("Langues actives") +
      bloc('<div class="chips" id="vLang">' + ["Français","Arabe","Anglais","Turc"].map(function(l){
        return qchip(l, l, voix.langues.indexOf(l) >= 0);
      }).join("") + '</div>') + fsection("Phrase d'accueil") + '<div class="authfield"><label class="flabel" for="vAcc">Lue au décrochage, avant toute commande</label>' +
        '<input class="field" id="vAcc" value="' + esc(voix.accueil) + '"></div>' + fsection("Aperçu") + '<div class="lines"><div class="row bot"><div class="bub" id="vApercu"></div></div>' +
        ligne("Langues actives", voix.langues.join(" · "), voix.ton + " · " + voix.vitesse) + '</div>' + RIA.note(esc(D.regles.rgpd)) + fsection("Voix signature") +
      bloc(factcard("vSign", I.micro, voix.signature ? "Voix signature active" : "Voix signature désactivée",
        "Un texte guidé d'une minute, lu par le gérant", voix.signature ? "Désactiver" : "Enregistrer")) +
      RIA.note("L'activation exige de <b>confirmer posséder cette voix et en autoriser l'usage</b>. Même avec une voix signature, l'assistant annonce toujours qu'il est automatisé.")
    );

    majApercu();

    $("vPrenom").addEventListener("input", function(){ voix.prenom = this.value; majApercu(); });
    $("vAcc").addEventListener("input", function(){ voix.accueil = this.value; majApercu(); });

    surTous($("content"), "#vTon .qchip", function(){ voix.ton = this.dataset.v; exclusif("#vTon", this); majApercu(); });
    surTous($("content"), "#vVit .qchip", function(){ voix.vitesse = this.dataset.v; exclusif("#vVit", this); majApercu(); });
    surTous($("content"), "#vLang .qchip", function(){
      var l = this.dataset.v, k = voix.langues.indexOf(l);
      if (k >= 0){
        if (voix.langues.length === 1){ RIA.toast("Au moins une langue doit rester active."); return; }
        voix.langues.splice(k, 1); this.classList.remove("primary");
      } else { voix.langues.push(l); this.classList.add("primary"); }
      majApercu();
    });
    surClic("vSign", function(){
      if (voix.signature){
        voix.signature = false;
        renderVoixScreen();
        RIA.toast("Voix signature désactivée — retour à la voix préexistante.");
      } else sheetSignature();
    });

    RIA.actionbar(
      '<div class="ctabar">' + '<button class="cta" id="vTest">' + svg(I.phone) + 'Appel test sur mon vrai menu</button>' + '<div class="secrow">' + '<button class="sec" id="vSave">' + svg(I.check) + 'Activer</button>' +
          '<button class="sec" id="vReset">' + svg(I.horloge) + 'Annuler</button>' + '</div>' + '</div>'
    );
    surClic("vTest", sheetTest);
    surClic("vSave", function(){
      if (!testVoix){ RIA.toast("Appel test obligatoire avant activation."); return; }
      RIA.toast("Voix activée. Elle ne s'applique jamais au milieu d'un appel en cours.");
    });
    surClic("vReset", function(){
      voix = { prenom:D.voix.prenom, ton:D.voix.ton, vitesse:D.voix.vitesse,
               langues:D.voix.langues.slice(0), accueil:D.voix.accueil, signature:D.voix.signature };
      testVoix = false;
      renderVoixScreen();
      RIA.toast("Réglages remis à ceux du business plan.");
    });
  }

  function exclusif(sel, el){
    var n = $("content").querySelectorAll(sel + " .qchip");
    for (var i = 0; i < n.length; i++) n[i].classList.remove("primary");
    el.classList.add("primary");
  }
  function majApercu(){
    var a = $("vApercu");
    if (!a) return;
    a.textContent = (voix.prenom ? voix.prenom + " : " : "") + voix.accueil;
    var l = $("content").querySelectorAll(".lines .line .v");
    if (l.length) l[l.length - 1].textContent = voix.ton + " · " + voix.vitesse;
    var sous = $("content").querySelectorAll(".lines .line .n small");
    if (sous.length) sous[sous.length - 1].textContent = voix.langues.join(" · ");
  }

  function sheetSignature(){
    RIA.sheet("Voix signature",
      RIA.note("Le gérant lit un texte guidé d'environ une minute. L'IA génère ensuite une voix proche de son timbre, de son rythme et de son style.") + '<div class="lines">' +
        ligne("Durée d'enregistrement", "texte guidé affiché à l'écran", "≈ 1 min") + ligne("Annonce automatisée", "obligatoire même avec la voix signature", "conservée") +
        ligne("Option premium", "si le coût variable réduit trop la marge", "à l'étude") + '</div>' + '<div class="acctinfo">' + acctrow("Consentement", "obligatoire avant activation") +
        acctrow("Titulaire de la voix", D.resto.nom) + '</div>' + RIA.note(esc(D.regles.rgpd)) +
      '<div class="ctabar"><button class="cta" id="sgOk">' + svg(I.bouclier) + 'Je possède cette voix et j\'en autorise l\'usage</button>' +
        '<div class="secrow"><button class="sec" id="sgNon">' + svg(I.stop) + 'Annuler</button></div></div>');
    surClic("sgOk", function(){
      voix.signature = true;
      testVoix = false;
      RIA.closeSheet();
      renderVoixScreen();
      RIA.toast("Consentement enregistré — un nouvel appel test est requis.");
    });
    surClic("sgNon", RIA.closeSheet);
  }

  function sheetTest(){
    RIA.sheet("Appel test",
      RIA.note("Le test utilise <b>votre vrai menu</b> : l'IA lit l'accueil, prend un Tacos M, pose les choix obligatoires et envoie un récapitulatif fictif.") +
      '<div class="lines" id="tZone"><div class="empty">Le test dure une trentaine de secondes.</div></div>' + '<div class="ctabar"><button class="cta" id="tGo">' + svg(I.play) + 'Lancer l\'appel test</button></div>');
    var teste = false;
    surClic("tGo", function(){
      if (teste){ RIA.closeSheet(); renderVoixScreen(); return; }
      $("tGo").disabled = true;
      simuler($("tZone"), "Appel test en cours…", function(){
        var z = $("tZone");
        if (!z) return;
        z.innerHTML =
          ligne("Accueil", voix.prenom + " · " + voix.ton + " · " + voix.vitesse, "OK") + ligne("Choix obligatoires", "taille, viande, sauce posées dans l'ordre", "OK") +
          ligne("Suppléments", "cheddar proposé, boursin ignoré (rupture)", "OK") + ligne("Récapitulatif", "SMS fictif, aucune commande créée", "OK") + ligne("Durée", "cible sous 2 min 30", RIA.dur(118));
        testVoix = true;
        var b = $("tGo");
        if (b){ b.disabled = false; b.innerHTML = svg(I.check) + "Fermer et activer"; }
        teste = true;
        RIA.toast("Appel test validé — la voix peut être activée.");
      });
    });
  }

  /* =======================================================================
     5) COMPTE — horaires, livraison, abonnement, mentions
     ======================================================================= */
  function renderCompteScreen(){
    RIA.renderNavbar("compte");
    var f = forfait(forfaitSel);
    var corps = compteTab === "horaires" ? blocHoraires()
              : compteTab === "livraison" ? blocLivraison()
              : compteTab === "abo" ? blocAbonnement(f)
              : blocMentions();

    RIA.setContent(
      topbar("Réglages du restaurant", D.resto.nom,
        RIA.chip("Lyon 7e", I.horloge) + RIA.pill("Forfait " + f.nom, "signe")) + tabs([ { id:"horaires", lbl:"Horaires" }, { id:"livraison", lbl:"Livraison" },
             { id:"abo", lbl:"Abonnement" }, { id:"mentions", lbl:"Mentions" } ], compteTab) +
      corps
    );

    surTabs(function(id){ compteTab = id; renderCompteScreen(); });

    if (compteTab === "horaires") brancherHoraires();
    else if (compteTab === "livraison") brancherLivraison();
    else if (compteTab === "abo") brancherAbonnement();
    else brancherMentions();

    if (compteTab === "horaires"){
      RIA.actionbar('<div class="ctabar"><button class="cta" id="hExc">' + svg(I.horloge) + 'Ajouter une exception</button></div>');
      surClic("hExc", function(){
        var jour = prompt("Jour de l'exception ?", "1er janvier");
        if (!jour) return;
        var regle = prompt("Règle appliquée ce jour-là ?", "Fermé") || "Fermé";
        D.exceptions.push({ d:jour, r:regle });
        renderCompteScreen();
        RIA.toast("Exception ajoutée : " + jour + " — " + regle + ".");
      });
    } else if (compteTab === "livraison"){
      RIA.actionbar('<div class="ctabar"><button class="cta" id="lSave">' + svg(I.check) + 'Appliquer aux prochains appels</button></div>');
      surClic("lSave", function(){
        RIA.toast("Zone de livraison mise à jour : minimum " + eur(livr.minimum) + ", frais " + eur(livr.frais) + ".");
        renderCompteScreen();
      });
    } else RIA.actionbar();
  }

  /* --- horaires : calendrier hebdomadaire repris de l'agenda de devis60 --- */
  function horaireDuJour(i){
    if (i <= 3) return D.horaires[0];
    if (i === 4) return D.horaires[1];
    if (i === 5) return D.horaires[2];
    return D.horaires[3];
  }
  function blocHoraires(){
    var sc = SCOPES[scopeIdx];
    var cells = "";
    for (var i = 0; i < 7; i++){
      var h = horaireDuJour(i);
      var n = h.c.split(" · ").length;
      var actif = scopeIdx === 2 ? i !== 6 : true;
      cells += '<div class="ag-cell' + (i === 4 ? ' auj' : '') + '" data-j="' + i + '"><span>' + n + '</span>' + (actif ? '<span class="ag-dot"></span>' : '') + '</div>';
    }
    var rows = D.horaires.map(function(h){
      return '<div class="ag-card" data-h="' + esc(h.j) + '"><div class="ag-time">' + esc(h.j.split(" ")[0]) + '</div>' + '<div class="ag-info"><div class="ag-titre">' + esc(h.c) + '</div>' +
        '<div class="ag-client">' + esc(h.j) + ' · ' + esc(sc.sous) + '</div></div>' + '<div class="ag-duree">' + esc(sc.tag) + '</div></div>';
    }).join("");
    var exc = D.exceptions.map(function(e){
      return '<div class="ag-card" data-x="' + esc(e.d) + '"><div class="ag-time">' + esc(e.d.split(" ")[0]) + '</div>' + '<div class="ag-info"><div class="ag-titre">' + esc(e.r) + '</div>' +
        '<div class="ag-client">' + esc(e.d) + '</div></div>' + '<div class="ag-duree">Except.</div></div>';
    }).join("");

    return '<div class="ag-monthbar"><button class="ag-nav" id="hPrev">' + svg('<path d="M15 18l-6-6 6-6"/>') + '</button>' + '<span class="ag-monthlbl">' + esc(sc.nom) + '</span>' +
        '<button class="ag-nav" id="hNext">' + svg('<path d="M9 6l6 6-6 6"/>') + '</button></div>' +
      '<div class="ag-weekdays"><span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>D</span></div>' + '<div class="ag-grid">' + cells + '</div>' +
      RIA.note("Nombre de créneaux par jour. " + esc(sc.sous)) + fsection("Semaine type") + '<div class="ag-rows">' + rows + '</div>' + fsection("Exceptions") + '<div class="ag-rows">' + exc + '</div>' +
      RIA.note("Un bouton d'accueil permet d'<b>arrêter les commandes 30 minutes</b> ou jusqu'à nouvel ordre, tout en laissant l'IA répondre aux questions.");
  }
  function brancherHoraires(){
    surClic("hPrev", function(){ scopeIdx = (scopeIdx + SCOPES.length - 1) % SCOPES.length; renderCompteScreen(); });
    surClic("hNext", function(){ scopeIdx = (scopeIdx + 1) % SCOPES.length; renderCompteScreen(); });
    surTous($("content"), ".ag-cell", function(){
      var i = parseInt(this.dataset.j, 10);
      RIA.toast(JOURS[i] + " — " + horaireDuJour(i).c + " (" + SCOPES[scopeIdx].nom.toLowerCase() + ")");
    });
    surTous($("content"), "[data-h]", function(){
      var h = D.horaires.filter(function(x){ return x.j === this.dataset.h; }.bind(this))[0];
      RIA.sheet(h.j,
        '<div class="acctinfo">' + acctrow("Ouverture physique", h.c) + acctrow("Prise de commande", h.c + " (dernière commande −15 min)") +
          acctrow("Livraison", D.livraison.rayon + " · délai " + D.livraison.delai + " min") + '</div>' +
        RIA.note("Les horaires distinguent l'ouverture physique, la prise de commande par téléphone et la livraison. Plusieurs créneaux par jour sont prévus."));
    });
    surTous($("content"), "[data-x]", function(){
      RIA.toast("Exception : " + this.dataset.x + " — " +
        D.exceptions.filter(function(e){ return e.d === this.dataset.x; }.bind(this))[0].r);
    });
  }

  /* --- livraison --- */
  function blocLivraison(){
    return '<div class="acctinfo">' + acctrow("Rayon maximum", D.livraison.rayon) + acctrow("Délai annoncé", D.livraison.delai + " min") + acctrow("Paiement accepté", D.livraison.paiement) +
        acctrow("Hors zone", "l'IA propose le retrait") + '</div>' + fsection("Montants") + '<div class="fieldgrp">' + '<div class="fg-row"><label for="lMin">Minimum de commande (€)</label>' +
          '<input class="field" id="lMin" value="' + (livr.minimum / 100).toFixed(2) + '"></div>' + '<div class="fg-row"><label for="lFrais">Frais de livraison (€)</label>' +
          '<input class="field" id="lFrais" value="' + (livr.frais / 100).toFixed(2) + '"></div>' + '</div>' + '<div class="lines" id="lApercu">' +
        ligne("Minimum", "sous ce montant, l'IA propose le retrait", eur(livr.minimum)) + ligne("Frais", "ajoutés au récapitulatif et au ticket", eur(livr.frais)) +
        ligne("Exemple", "commande de " + eur(1800) + " livrée", eur(1800 + livr.frais)) + '</div>' +
      RIA.note("Pour une livraison, l'IA recueille numéro et rue, code postal et ville, bâtiment, étage, digicode et instruction de remise, puis calcule la distance <b>par la route</b>. " + esc(D.regles.paiement));
  }
  function brancherLivraison(){
    function maj(){
      var m = parseFloat(String($("lMin").value).replace(",", "."));
      var f = parseFloat(String($("lFrais").value).replace(",", "."));
      if (!isNaN(m) && m >= 0) livr.minimum = Math.round(m * 100);
      if (!isNaN(f) && f >= 0) livr.frais = Math.round(f * 100);
      var v = $("lApercu").querySelectorAll(".line .v");
      v[0].textContent = eur(livr.minimum);
      v[1].textContent = eur(livr.frais);
      v[2].textContent = eur(1800 + livr.frais);
    }
    $("lMin").addEventListener("input", maj);
    $("lFrais").addEventListener("input", maj);
  }

  /* --- abonnement : palette grise dédiée, comme devis60 --- */
  function blocAbonnement(f){
    var minutes = D.resto.minutes;
    var incluses = f.minutes;
    var pct = incluses ? Math.min(100, Math.round(minutes / incluses * 100)) : 100;
    var alerte = incluses ? (minutes / incluses >= 0.8) : true;
    var depasse = incluses ? Math.max(0, minutes - incluses) : minutes;

    var plans = D.forfaits.map(function(p){
      var sousTitre = p.minutes
        ? eur0(p.prix) + "/mois — " + p.minutes + " min incluses, puis " + eur(p.dep) + "/min"
        : "sans abonnement — " + eur(p.dep) + "/min, " + p.note.toLowerCase();
      return '<button class="sub-plan-card' + (p.id === forfaitSel ? ' on' : '') + '" data-f="' + esc(p.id) + '">' + '<span class="radio"></span><span class="pl-info"><span class="pl-name">' + esc(p.nom) + '</span>' +
        '<span class="pl-price">' + esc(sousTitre) + '</span></span>' + (p.id === D.resto.forfait ? '<span class="pl-badge">ACTUEL</span>' : '') + '</button>';
    }).join("");

    return '<div class="sub-hero">' + '<div class="sub-ribbon">' + svg(I.bouclier) + 'Essai gratuit</div>' + '<div class="sub-plan">Forfait ' + esc(f.nom) + '</div>' +
        '<div class="sub-head">' + (f.minutes ? f.minutes + ' minutes d\'appels incluses' : 'Paiement à l\'usage, sans abonnement') + '</div>' +
        '<div class="sub-price-row"><span class="sub-price-now">' + eur0(f.prix) + '<small>/mois</small></span></div>' + '<div class="sub-plans">' + plans + '</div>' +
        '<div class="sub-trustrow">' + RIA.chip("Essai gratuit", I.check) + RIA.chip("6 mois", I.horloge) + RIA.chip("SEPA", I.carteb) + '</div>' + '</div>' + fsection("Consommation du mois") +
      bloc(barre(minutes + " / " + (incluses || "∞") + " min", pct, alerte ? "haut" : "ok")) + (alerte
        ? banniere("Alerte automatique à 80 % des minutes incluses. Le service n'est jamais coupé : " +
            (depasse ? "les " + depasse + " minutes au-delà sont facturées " + eur(f.dep) + "/min." : "le dépassement est facturé " + eur(f.dep) + "/min."))
        : RIA.note("Alerte automatique envoyée à <b>80 %</b> des minutes incluses. Le service n'est jamais coupé, le dépassement est facturé " + esc(eur(f.dep)) + "/min.")) + '<div class="sub-money">' +
        moneyRow("Abonnement", "prélevé chaque mois", f.prix ? eur0(f.prix) : "0 €") + moneyRow("Minutes incluses", "au-delà : " + eur(f.dep) + "/min", (f.minutes || 0) + " min") +
        moneyRow("Consommé ce mois", "coût IA à " + eur(D.coutMinute) + "/min", eur(minutes * D.coutMinute)) + moneyRow("Commission apporteur", "par mois et par client actif", eur(D.commission)) +
        moneyRow("Dépassement estimé", depasse ? depasse + " min hors forfait" : "aucun dépassement", eur(depasse * f.dep)) + '</div>' + '<div class="sub-steps">' +
        subStep("1", "Essai gratuit", "L'essai mesure votre vrai volume d'appels avant toute recommandation de forfait.") +
        subStep("2", "Forfait recommandé", "Le forfait proposé correspond aux minutes réellement consommées pendant l'essai.") +
        subStep("3", "Engagement de 6 mois", "Après l'essai, l'abonnement s'engage sur 6 mois, facturé au compteur à la seconde.") + '</div>' +
      '<div class="ctabar"><button class="sub-cta" id="aboGo">' + svg(I.carteb) + 'Passer au forfait ' + esc(f.nom) + '</button></div>' +
      '<div class="sub-fine">Maquette — aucun paiement réel. <b>Essai gratuit</b> puis engagement de 6 mois, ' + 'prélèvement SEPA par défaut, carte en option avec frais répercutés.</div>';
  }
  function moneyRow(k, d, v){
    return '<div class="sub-money-row"><span><span class="k">' + esc(k) + '</span><span class="d">' + esc(d) + '</span></span>' + '<span class="v">' + esc(v) + '</span></div>';
  }
  function subStep(n, titre, txt){
    return '<div class="sub-step"><span class="num">' + esc(n) + '</span><span class="tx"><b>' + esc(titre) + '</b><span>' + esc(txt) + '</span></span></div>';
  }
  function brancherAbonnement(){
    surTous($("content"), ".sub-plan-card", function(){
      forfaitSel = this.dataset.f;
      renderCompteScreen();
    });
    surClic("aboGo", function(){
      var f = forfait(forfaitSel);
      RIA.toast(f.prix
        ? "Forfait " + f.nom + " à " + eur0(f.prix) + "/mois — essai gratuit d'abord, puis 6 mois."
        : "PAYG : aucun abonnement, " + eur(f.dep) + "/min et " + f.note.toLowerCase() + ".");
    });
  }

  /* --- mentions --- */
  function blocMentions(){
    return '<div class="acctinfo">' + acctrow("Restaurant", D.resto.nom) + acctrow("Adresse", D.resto.adresse) + acctrow("Numéro public", D.resto.tel) + acctrow("Assistant", D.resto.assistant) + '</div>' +
      fsection("Règles de service") + '<div class="menu">' + RIA.menurow(I.phone, "Renvoi d'appel chez l'opérateur") + RIA.menurow(I.check, "Confirmation avant la cuisine") +
        RIA.menurow(I.sms, "Modification d'une commande") + RIA.menurow(I.transfert, "Transfert vers un humain") + '</div>' + fsection("Données et paiement") + RIA.note(esc(D.regles.rgpd)) +
      RIA.note(esc(D.regles.paiement));
  }
  function brancherMentions(){
    var textes = [
      { t:"Renvoi d'appel chez l'opérateur", x:D.regles.renvoi },
      { t:"Confirmation avant la cuisine",   x:D.regles.confirmation },
      { t:"Modification d'une commande",     x:D.regles.modification },
      { t:"Transfert vers un humain",        x:D.regles.transfert }
    ];
    var rows = $("content").querySelectorAll(".menurow");
    for (var i = 0; i < rows.length; i++){
      (function(k){
        rows[k].addEventListener("click", function(){
          RIA.sheet(textes[k].t, RIA.note(esc(textes[k].x)) + RIA.note(esc(D.regles.rgpd)));
        });
      })(i);
    }
  }

  /* ---------- enregistrement de l'application ---------- */
  RIA.register({
    id:"gerant", nom:"Gérant", badge:"2",
    fond:"linear-gradient(150deg,#9db8ff,#5f7fd8)", encre:"#071020",
    glyph:'<path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6"/>',
    espace:"ESPACE GÉRANT",
    titre:"Resto IA", sub:"L'assistant décroche quand la cuisine ne peut pas.",
    cta:"Se connecter",
    tabs:[
      { id:"service", lbl:"Ce soir",    svg:I.power,  go:renderServiceScreen },
      { id:"appels",  lbl:"Commandes", svg:I.phone,  go:renderAppelsScreen },
      { id:"menu",    lbl:"Carte",     svg:I.carte,  go:renderMenuScreen },
      { id:"voix",    lbl:"Assistant", svg:I.micro,  go:renderVoixScreen },
      { id:"compte",  lbl:"Réglages",  svg:I.profil, go:renderCompteScreen }
    ]
  });
})();
