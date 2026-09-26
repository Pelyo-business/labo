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
