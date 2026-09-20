// Service worker des versions web de Taxi Sylvain : reçoit les notifications Web Push envoyées par
// le serveur (backend/src/lib/webPush.js) et les affiche même quand l'onglet est fermé. Un clic
// sur la notification ramène l'application au premier plan, ou l'ouvre.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let charge = {};
  try {
    charge = event.data ? event.data.json() : {};
  } catch {
    charge = { body: event.data ? event.data.text() : "" };
  }
  const donnees = charge.data || {};
  const options = {
    body: charge.body || "",
    icon: "/icon.png",
    badge: "/icon.png",
    tag: charge.tag || undefined,
    renotify: Boolean(charge.tag),
    data: donnees,
    vibrate: donnees.type === "ride:broadcast" || donnees.type === "ride:reminder:urgent" ? [300, 150, 300, 150, 300] : [200, 100, 200],
    // Une course à saisir ou un rappel urgent reste affiché jusqu'à ce que la personne agisse.
    requireInteraction: donnees.type === "ride:broadcast" || donnees.type === "ride:reminder:urgent",
  };
  event.waitUntil(self.registration.showNotification(charge.title || "Taxi Sylvain", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((fenetres) => {
      const ouverte = fenetres.find((f) => "focus" in f);
      if (ouverte) return ouverte.focus();
      return self.clients.openWindow("/");
    })
  );
});
