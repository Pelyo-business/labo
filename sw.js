/* Service worker — deux buts.
   1. Une page d'accueil ajoutée à l'écran d'un téléphone ne doit jamais
      rester bloquée sur une version périmée. GitHub Pages impose 10 minutes
      de cache HTTP sur les pages (en-tête qu'on ne peut pas modifier) : toute
      navigation (ouverture/réouverture de l'app) recharge donc la page
      directement depuis le réseau, sans ce cache HTTP.
   2. Sans réseau, Pelyo doit quand même s'ouvrir (le mode Hors ligne de
      l'assistant commercial). La dernière version de chaque page est gardée
      et servie seulement quand le réseau manque. Les fichiers versionnés
      (?v=...), les images de l'app, les polices et supabase-js sont gardés à
      leur premier passage : leur adresse change à chaque publication, donc
      une copie gardée n'est jamais périmée ; les anciennes versions d'un même
      fichier sont effacées. En local (localhost), rien n'est gardé. */
var CACHE = "pelyo-hors-ligne-1";
var LOCAL = self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1";

self.addEventListener("install", function (evenement) {
  self.skipWaiting();
});

self.addEventListener("activate", function (evenement) {
  evenement.waitUntil(caches.keys().then(function (noms) {
    return Promise.all(noms.filter(function (n) { return n.indexOf("pelyo-hors-ligne-") === 0 && n !== CACHE; })
      .map(function (n) { return caches.delete(n); }));
  }).then(function () { return self.clients.claim(); }));
});

/* Les autres versions d'un même fichier ne servent plus. */
function nettoyer(cache, url) {
  cache.keys().then(function (cles) {
    cles.forEach(function (k) {
      var u = new URL(k.url);
      if (u.origin === url.origin && u.pathname === url.pathname && u.search !== url.search) cache.delete(k);
    });
  });
}

self.addEventListener("fetch", function (evenement) {
  var requete = evenement.request;
  if (requete.method !== "GET") return;
  var url = new URL(requete.url);

  if (requete.mode === "navigate") {
    var cle = url.origin + url.pathname;
    evenement.respondWith(
      fetch(requete, { cache: "no-store" }).then(function (reponse) {
        if (!LOCAL && reponse && reponse.ok) {
          var copie = reponse.clone();
          caches.open(CACHE).then(function (c) { c.put(cle, copie); });
        }
        return reponse;
      }).catch(function () {
        return caches.match(cle).then(function (gardee) { return gardee || fetch(requete); });
      })
    );
    return;
  }

  if (LOCAL) return;
  var chezNous = url.origin === self.location.origin;
  var versionne = chezNous && /[?&]v=/.test(url.search);
  var garder = versionne || (chezNous && /\/assets\//.test(url.pathname)) ||
    /(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname) ||
    (url.hostname === "cdn.jsdelivr.net" && url.pathname.indexOf("/@supabase/supabase-js@") !== -1);
  if (!garder) return;
  evenement.respondWith(caches.open(CACHE).then(function (c) {
    return c.match(requete).then(function (gardee) {
      if (gardee) return gardee;
      return fetch(requete).then(function (reponse) {
        if (reponse && (reponse.ok || reponse.type === "opaque")) {
          c.put(requete, reponse.clone());
          if (versionne) nettoyer(c, url);
        }
        return reponse;
      });
    });
  }));
});

/* Notifications (Web Push) envoyées par le serveur « notifications » :
   { titre, corps, lien, etiquette }. Une même étiquette remplace la
   notification précédente au lieu d'en empiler une deuxième. */
self.addEventListener("push", function (evenement) {
  var d = {};
  try { d = evenement.data ? evenement.data.json() : {}; } catch (e) { d = { corps: evenement.data ? evenement.data.text() : "" }; }
  var options = {
    body: d.corps || "",
    icon: "assets/icone-gerant-192.png",
    badge: "assets/icone-gerant-192.png",
    data: { lien: /^[a-z0-9-]+\.html(#[a-z0-9-]*)?$/i.test(d.lien || "") ? d.lien : "gerant.html" }
  };
  if (d.etiquette) { options.tag = d.etiquette; options.renotify = true; }
  evenement.waitUntil(self.registration.showNotification(d.titre || "Pelyo", options));
});

self.addEventListener("notificationclick", function (evenement) {
  evenement.notification.close();
  var lien = new URL((evenement.notification.data && evenement.notification.data.lien) || "gerant.html", self.registration.scope).href;
  evenement.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (fenetres) {
    for (var i = 0; i < fenetres.length; i++) {
      if (fenetres[i].url.indexOf("gerant.html") >= 0 && "focus" in fenetres[i]) return fenetres[i].focus();
    }
    return self.clients.openWindow(lien);
  }));
});
