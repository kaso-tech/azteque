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

/* ---------- Notifications ---------- */

// Le message arrive chiffré ; le navigateur l'a déjà déchiffré quand il nous
// le remet (voir web-push.ts pour l'autre bout). On ne fait ici que l'afficher.
//
// `tag` regroupe par type : deux invitations coup sur coup remplacent la
// première notification au lieu d'empiler deux lignes identiques dans le
// volet du téléphone. `renotify` fait tout de même vibrer la seconde, sans
// quoi elle passerait inaperçue.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let charge = {};
  try {
    charge = event.data.json();
  } catch {
    charge = { titre: "Aztèque", corps: event.data.text() };
  }
  const titre = charge.titre || "Aztèque";
  event.waitUntil(
    self.registration.showNotification(titre, {
      body: charge.corps || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: charge.type || "azteque",
      renotify: true,
      data: { lien: charge.lien || "/" },
    }),
  );
});

// Un clic doit RETROUVER la partie déjà ouverte, pas en ouvrir une seconde :
// deux onglets sur la même table, c'est deux abonnements temps réel et un
// joueur qui se voit jouer en double.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const lien = (event.notification.data && event.notification.data.lien) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((fenetres) => {
      for (const fenetre of fenetres) {
        if (new URL(fenetre.url).origin !== self.location.origin) continue;
        return fenetre.focus().then((f) => (f && f.navigate ? f.navigate(lien) : f));
      }
      return self.clients.openWindow(lien);
    }),
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
