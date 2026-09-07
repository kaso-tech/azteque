// Service worker minimal : juste ce qu'il faut pour qu'Android propose
// d'installer l'application, et pour qu'un chargement hors ligne retrouve
// la dernière page vue plutôt qu'un écran d'erreur du navigateur.
//
// La page elle-même passe toujours par le réseau d'abord : après un
// déploiement, un joueur en ligne doit obtenir le nouveau code tout de
// suite, jamais une version mise en cache. Les scripts et styles, eux,
// portent une empreinte de leur contenu dans leur nom — un nouveau
// déploiement leur donne un nouveau nom, donc les servir du cache d'abord
// ne risque jamais de figer une ancienne version.
//
// Les appels à Supabase (autre origine) ne passent jamais par ce cache :
// jetons, parties en cours et discussion doivent toujours venir du réseau.

const CACHE = "azteque-v1";

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cles) => Promise.all(cles.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((reponse) => {
          const copie = reponse.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copie));
          return reponse;
        })
        .catch(() => caches.match(request).then((r) => r ?? Response.error())),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((depose) => {
      if (depose) return depose;
      return fetch(request).then((reponse) => {
        if (reponse.ok) {
          const copie = reponse.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copie));
        }
        return reponse;
      });
    }),
  );
});
