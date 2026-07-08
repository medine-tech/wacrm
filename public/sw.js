// Push-only service worker for WACRM.
//
// This worker exists solely to receive Web Push messages and route
// notification clicks. It deliberately has no fetch handler or offline
// cache — WACRM's data lives behind an authenticated session, so caching
// it here would be both useless and a privacy risk.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || 'New notification';

  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body,
      tag: data.tag,
      renotify: true,
      data: { url: data.url },
      icon: '/icon',
      badge: '/icon',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    (async () => {
      const url = event.notification.data?.url || '/';
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      // Reuse an existing window, but always navigate it to the FULL url
      // (including the ?c=<conversation> query) — matching only on the
      // pathname would focus an already-open /inbox tab without switching
      // it to the target conversation.
      for (const c of clients) {
        if ('focus' in c) {
          await c.focus();
          if ('navigate' in c) return c.navigate(url);
          return c;
        }
      }

      return self.clients.openWindow(url);
    })()
  );
});
