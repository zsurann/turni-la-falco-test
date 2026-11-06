/* Service worker separato (ambito /notify/) solo per l'avviso "il responsabile ha pubblicato i turni".
   Non tocca i promemoria del service worker principale. */
try { importScripts('../config.js'); } catch (e) { /* senza avvisi */ }
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let n = { title: 'Turni aggiornati', body: 'Apri l\'app per vedere i tuoi turni.' };
    try {
      const api = String(self.TURNI_API || '').replace(/\/$/, '');
      if (api) { const r = await fetch(api + '/api/notice', { cache: 'no-store' }); if (r.ok) n = { ...n, ...(await r.json()) }; }
    } catch (err) { /* offline: testo generico */ }
    await self.registration.showNotification(n.title || 'Turni aggiornati', {
      body: n.body || '', icon: '../icon-192.png', badge: '../favicon.png', tag: 'turni-agg', renotify: true,
    });
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const home = new URL('../', self.location.href).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    for (const c of cs) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow(home);
  }));
});
