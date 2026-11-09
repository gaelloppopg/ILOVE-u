/* ============================================
   Service Worker Unificado (PWA + OneSignal)
   ============================================ */

importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");

const CACHE = "para-ti-v2";
const CACHE_INMUTABLE = "para-ti-inmutable-v2";

// 🛑 Recursos que casi nunca cambian (CDN, fonts)
const ASSETS_INMUTABLES = [
  "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400;1,600&family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,400&family=Poppins:wght@300;400&display=swap",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"
];

// 🛑 Recursos de la app (se actualizan)
const ASSETS_APP = [
  "./",
  "./index.html",
  "./login.html",
  "./registro.html",
  "./admin.html",
  "./unirse.html",
  "./manifest.json",
  "./css/style.css",
  "./css/animations.css",
  "./css/responsive.css",
  "./css/modo-cine.css",
  "./js/supabase.js",
  "./js/proteger.js",
  "./js/script.js",
  "./js/confeti.js",
  "./js/musica-global.js",
  "./js/pwa.js",
  "./js/diario.js",
  "./js/razones.js",
  "./js/arte.js",
  "./js/musica-flotante.js",
  "./pages/historia.html",
  "./pages/recuerdos.html",
  "./pages/cartas.html",
  "./pages/razones.html",
  "./pages/juego.html",
  "./pages/cuponera.html",
  "./pages/diario.html",
  "./pages/arte.html",
  "./pages/audios.html",
  "./pages/mapa.html",
  "./pages/calendario.html"
];

// 🛑 INSTALACIÓN
self.addEventListener("install", (e) => {
  e.waitUntil(
    Promise.all([
      // Cachear inmutables
      caches.open(CACHE_INMUTABLE).then((c) => c.addAll(ASSETS_INMUTABLES).catch(err => console.warn("No se pudo cachear inmutables:", err))),
      // Cachear app (una por una para tolerar errores)
      caches.open(CACHE).then((c) => {
        return Promise.all(
          ASSETS_APP.map(url => c.add(url).catch(err => console.warn("⚠️ No se pudo cachear:", url)))
        );
      })
    ])
  );
  self.skipWaiting();
});

// 🛑 ACTIVACIÓN (limpiar cachés viejos)
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE && k !== CACHE_INMUTABLE).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// 🛑 INTERCEPCIÓN DE RED (Estrategia: Network First con fallback a Cache)
self.addEventListener("fetch", (e) => {
  const url = e.request.url;

  // Ignorar peticiones a Supabase, OneSignal y otras APIs externas
  if (url.includes("supabase.co") || url.includes("onesignal.com")) return;
  if (!url.startsWith(self.location.origin) && !url.startsWith("https://fonts.")) return;
  if (e.request.method !== "GET") return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Cachear solo respuestas exitosas
        if (res && res.status === 200) {
          const cacheName = url.includes("fonts.") ? CACHE_INMUTABLE : CACHE;
          const copy = res.clone();
          caches.open(cacheName).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => {
        // Si falla la red, buscar en caché
        return caches.match(e.request).then((cached) => {
          if (cached) return cached;
          // Si no hay caché, devolver un fallback para navegación
          if (e.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('Recurso no disponible offline', { status: 503, statusText: 'Offline' });
        });
      })
  );
});

// 🛑 NOTIFICACIONES PUSH
self.addEventListener('push', (event) => {
  let data = { title: 'Nuevo mensaje 💜', body: 'Tienes una notificación', url: '/index.html' };
  
  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/assets/images/icons/icon-192.png',
      badge: '/assets/images/icons/icon-192.png',
      vibrate: [200, 100, 200],
      data: { url: data.url },
      actions: [
        { action: 'open', title: 'Abrir' },
        { action: 'close', title: 'Cerrar' }
      ]
    })
  );
});

// 🛑 CLIC EN NOTIFICACIÓN
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'close') return;
  
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      const url = event.notification.data.url || '/index.html';
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// 🛑 SINCRONIZACIÓN EN SEGUNDO PLANO
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    console.log('Sincronizando datos en segundo plano...');
  }
});