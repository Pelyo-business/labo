/* =========================================================================
   Pelyo — balance de portions, partagée par le gérant et la cuisine.

   Le gérant règle la balance et les grammages (Gestion → Balance) ; la
   cuisine s'y relie et guide la pesée de chaque commande. Balance visée :
   A&D SJ-6000WP-BT (IP67, Bluetooth). Son mode commande accepte Q (poids),
   T (tare), Z (zéro), L1 / H1 (seuils bas / haut) ; elle répond par des
   lignes « ST,+00012.34  g » (ST stable, US instable, OL hors plage).

   Le service Bluetooth exact de la balance reste à confirmer, balance en
   main : on essaie les services série les plus courants. Sans Bluetooth
   (iPad, ordinateur) ou en démo, une balance simulée prend le relais.

   Démo : réglages et relevés dans le stockage local, partagés entre les
   onglets gérant et cuisine du même navigateur. ES5, une seule globale.
   ========================================================================= */
var PelyoBalance = (function(){
  "use strict";

  var CLE = "pelyo:balance:demo:v1";
  var TYPES = [
    { id:"viande",    nom:"Viande" },
    { id:"fromage",   nom:"Fromage" },
    { id:"garniture", nom:"Garniture" },
    { id:"sauce",     nom:"Sauce" }
  ];
  /* Services série Bluetooth courants (Nordic UART, modules HM-10, FFF0). */
  var SERVICES = ["6e400001-b5a3-f393-e0a9-e50e24dcca9e", 0xffe0, 0xfff0];

  function recettesParDefaut(){
    return {
      "tacos-m":  [ { nom:"Viande", type:"viande", min:110, max:125 } ],
      "tacos-l":  [ { nom:"Viande 1", type:"viande", min:90, max:100 }, { nom:"Viande 2", type:"viande", min:90, max:100 } ],
      "kebab-xl": [ { nom:"Viande", type:"viande", min:150, max:170 } ],
      "4from":    [ { nom:"Fromages", type:"fromage", min:140, max:160 } ],
      "merguez":  [ { nom:"Merguez", type:"viande", min:90, max:100 }, { nom:"Mozzarella", type:"fromage", min:100, max:115 } ]
    };
  }
  function defaut(){
    return {
      reglages: { guidee:true, tolerance:10, tareAuto:true, mode:"portion", ordre:["viande", "fromage", "garniture", "sauce"] },
      balance:  { modele:"A&D SJ-6000WP-BT", reliee:false, simulee:true, nom:"", relieeAt:0, batterie:92 },
      recettes: recettesParDefaut(),
      journal:  []
    };
  }
  function lire(){
    try {
      var x = JSON.parse(localStorage.getItem(CLE) || "null");
      if (x && x.reglages && x.recettes) return x;
    } catch(e){}
    return defaut();
  }
  function ecrire(x){ try { localStorage.setItem(CLE, JSON.stringify(x)); } catch(e){} }
  function modifier(fn){ var x = lire(); fn(x); ecrire(x); return x; }

  /* Étapes de pesée d'une commande : chaque unité de chaque ligne, puis ses
     ingrédients dans l'ordre réglé par le gérant. */
  function etapes(lignes, produitDe){
    var x = lire(), r = [];
    (lignes || []).forEach(function(l){
      var p = produitDe(l), rec = p ? x.recettes[p.id] : null;
      if (!rec || !rec.length) return;
      for (var u = 0; u < (l.q || 1); u++){
        rec.forEach(function(i){
          r.push({ produit:l.nom, unite:u + 1, sur:l.q || 1, opt:l.opt || "", nom:i.nom, type:i.type, min:i.min, max:i.max });
        });
      }
    });
    return r;
  }
  /* Rouge : pas assez · jaune : presque · vert : bon · trop : au-dessus. */
  function niveau(poids, e){
    if (poids > e.max) return "trop";
    if (poids >= e.min) return "ok";
    if (poids >= e.min * 0.85) return "presque";
    return poids > 2 ? "peu" : "vide";
  }
  function noter(rel){
    modifier(function(x){ x.journal.push(rel); if (x.journal.length > 400) x.journal = x.journal.slice(-400); });
  }
  /* Ce mois : grammes servis en trop et ce qu'ils auraient coûté. */
  function bilan(prixKg){
    var x = lire(), trop = 0, pesees = 0, horsCible = 0;
    x.journal.forEach(function(j){
      pesees++;
      if (j.poids > j.max){ trop += j.poids - j.max; horsCible++; }
    });
    return { pesees:pesees, tropG:trop, horsCible:horsCible, euros:Math.round(trop / 1000 * (prixKg || 12) * 100) };
  }

  /* ------------------------------ Bluetooth ------------------------------ */
  var gatt = null, ecritureCar = null, ecouteurs = [], tampon = "";
  function bluetoothDispo(){ return !!(navigator.bluetooth && navigator.bluetooth.requestDevice); }
  function surPoids(fn){ ecouteurs.push(fn); return function(){ ecouteurs = ecouteurs.filter(function(f){ return f !== fn; }); }; }
  function diffuser(p){ ecouteurs.slice().forEach(function(f){ try { f(p); } catch(e){} }); }
  function lireLigne(l){
    var m = /^(ST|US|OL),([+-]\d+(?:\.\d+)?)(kg|g|PC)$/.exec(l.replace(/\s+/g, ""));
    if (!m) return;
    var v = parseFloat(m[2]); if (m[3] === "kg") v *= 1000;
    diffuser({ g:v, stable:m[1] === "ST", hors:m[1] === "OL" });
  }
  function recevoir(ev){
    var v = ev.target.value, s = "";
    for (var i = 0; i < v.byteLength; i++) s += String.fromCharCode(v.getUint8(i));
    tampon += s;
    var k;
    while ((k = tampon.indexOf("\n")) >= 0){ lireLigne(tampon.slice(0, k).replace(/\r/g, "")); tampon = tampon.slice(k + 1); }
  }
  function envoyer(cmd){
    if (!ecritureCar) return Promise.resolve(false);
    var b = new Uint8Array(cmd.length + 2);
    for (var i = 0; i < cmd.length; i++) b[i] = cmd.charCodeAt(i);
    b[cmd.length] = 13; b[cmd.length + 1] = 10;
    return ecritureCar.writeValue(b).then(function(){ return true; }, function(){ return false; });
  }
  /* Ouvre le sélecteur Bluetooth du navigateur, puis cherche une sortie
     série (lecture en notification, écriture des commandes). */
  function relierBluetooth(fini){
    navigator.bluetooth.requestDevice({ acceptAllDevices:true, optionalServices:SERVICES }).then(function(dev){
      return dev.gatt.connect().then(function(g){
        gatt = g;
        return g.getPrimaryServices();
      }).then(function(services){
        var fil = Promise.resolve(), lecture = null;
        services.forEach(function(s){
          fil = fil.then(function(){ return s.getCharacteristics(); }).then(function(cars){
            cars.forEach(function(c){
              if (!lecture && (c.properties.notify || c.properties.indicate)) lecture = c;
              if (!ecritureCar && (c.properties.write || c.properties.writeWithoutResponse)) ecritureCar = c;
            });
          }, function(){});
        });
        return fil.then(function(){
          if (!lecture) throw new Error("Aucune sortie de poids trouvée sur cet appareil.");
          lecture.addEventListener("characteristicvaluechanged", recevoir);
          return lecture.startNotifications();
        });
      }).then(function(){
        modifier(function(x){ x.balance.reliee = true; x.balance.simulee = false; x.balance.nom = dev.name || "Balance"; x.balance.relieeAt = Date.now(); });
        fini(null, false);
      });
    }).catch(function(e){
      fini(e && e.name === "NotFoundError" ? "Aucune balance choisie." : "Liaison impossible : " + (e && e.message || e));
    });
  }
  function relier(fini, forcerSimulee){
    if (!forcerSimulee && bluetoothDispo()) return relierBluetooth(fini);
    modifier(function(x){ x.balance.reliee = true; x.balance.simulee = true; x.balance.nom = "Balance de démonstration"; x.balance.relieeAt = Date.now(); });
    fini(null, true);
  }
  function delier(){
    try { if (gatt && gatt.connected) gatt.disconnect(); } catch(e){}
    gatt = null; ecritureCar = null;
    modifier(function(x){ x.balance.reliee = false; });
  }
  /* Seuils de l'étape en cours envoyés à la balance (si elle est réelle). */
  function cibler(e){
    if (!ecritureCar) return;
    var six = function(n){ return ("000000" + Math.round(n * 10)).slice(-6); };   /* dixièmes de gramme */
    envoyer("L1" + six(e.min)).then(function(){ return envoyer("H1" + six(e.max)); });
  }
  function tare(){ if (ecritureCar) envoyer("T"); }
  function reelle(){ return !!ecritureCar; }

  return {
    TYPES:TYPES, lire:lire, modifier:modifier, defaut:defaut, recettesParDefaut:recettesParDefaut,
    etapes:etapes, niveau:niveau, noter:noter, bilan:bilan,
    bluetoothDispo:bluetoothDispo, relier:relier, delier:delier, surPoids:surPoids,
    cibler:cibler, tare:tare, reelle:reelle
  };
})();
