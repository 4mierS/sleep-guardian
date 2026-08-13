/**
 * Minimaler Service Worker.
 *
 * Zweck ist NUR die Installierbarkeit als PWA (Chrome verlangt einen SW mit
 * fetch-Handler, bevor es "Zum Startbildschirm hinzufügen" anbietet).
 *
 * Bewusst KEIN Caching der API-Antworten: die App zeigt Live-Status: ein
 * gecachter "alles ruhig"-Zustand wäre schlimmer als gar keine Anzeige.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  // Immer direkt ans Netz, kein Cache dazwischen.
  event.respondWith(fetch(event.request));
});
