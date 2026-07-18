/* ============================================================================
   SERVICE WORKER — Dépenses de voyage
   ----------------------------------------------------------------------------
   Rôle : mettre en cache l'app (HTML/CSS/JS) et le manifest, pour qu'elle se
   recharge sans connexion (avion, zone blanche en voyage...). Les données de
   dépenses elles-mêmes (IndexedDB) sont déjà hors-ligne par nature ; ce fichier
   ne s'occupe que du chargement de l'app.

   Stratégie : "cache d'abord, réseau en secours" pour l'app shell, et mise en
   cache à la volée des scripts d'export (xlsx/jsPDF) chargés depuis un CDN,
   pour qu'ils fonctionnent aussi hors-ligne une fois utilisés une première fois.

   Incrémentez CACHE_NAME (v1 → v2…) à chaque mise à jour notable de l'app pour
   forcer le renouvellement du cache chez les utilisateurs.
   ============================================================================ */

const CACHE_NAME = "depenses-voyage-v3";

// Fichiers de l'app à mettre en cache dès l'installation du Service Worker.
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
];

/* ---- Installation : pré-remplissage du cache avec l'app shell ---- */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => { /* non bloquant : un fichier manquant ne doit pas empêcher l'installation */ })
  );
  self.skipWaiting(); // active la nouvelle version immédiatement, sans attendre la fermeture des onglets
});

/* ---- Activation : nettoyage des anciens caches (versions précédentes) ---- */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim(); // prend le contrôle des pages déjà ouvertes sans nécessiter un rechargement
});

/* ---- Interception réseau ----
   - Requêtes non-GET (aucune ici en pratique) : laissées passer sans interception
   - Sinon : on sert le cache immédiatement si dispo, tout en rafraîchissant en
     arrière-plan (stale-while-revalidate). Hors-ligne, le cache fait foi. */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          // Met en cache les réponses valides, y compris les réponses "opaques"
          // (scripts CDN cross-origin comme xlsx.js / jsPDF, dont le JS ne peut
          // pas lire le statut mais que le cache peut tout de même stocker).
          if (res && (res.ok || res.type === "opaque")) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached); // pas de réseau → on retombe sur le cache s'il existe

      return cached || network;
    })
  );
});
