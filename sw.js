/* Service worker minimal — un seul but : empêcher qu'une page d'accueil
   ajoutée à l'écran d'un téléphone reste bloquée sur une version périmée.
   GitHub Pages impose 10 minutes de cache HTTP sur index.html (en-tête
   cache-control qu'on ne peut pas modifier), ce qui suffit largement à
   masquer une mise à jour tant qu'on n'a pas explicitement vidé le cache.
   Ici, toute navigation (ouverture/réouverture de l'app) recharge la page
   directement depuis le réseau, sans passer par ce cache HTTP. Les fichiers
   versionnés (?v=...) ne sont pas concernés : leur adresse change déjà à
   chaque publication, donc rien à faire de plus pour eux. */
self.addEventListener("install", function (evenement) {
  self.skipWaiting();
});

self.addEventListener("activate", function (evenement) {
  evenement.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", function (evenement) {
  if (evenement.request.mode !== "navigate") return;
  evenement.respondWith(
    fetch(evenement.request, { cache: "no-store" }).catch(function () {
      return fetch(evenement.request);
    })
  );
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
