/* Service worker separato (ambito /notify/) solo per l'avviso "il responsabile ha pubblicato i turni".
   Non tocca i promemoria del service worker principale. */
try { importScripts('../config.js'); } catch (e) { /* senza avvisi */ }
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

const TITLE = 'Nuovi Turni Pubblicati!';
const API = String(self.TURNI_API || '').replace(/\/$/, '');

self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let n = { body: 'Apri l\'app per vedere i tuoi turni.' };
    try {
      const api = String(self.TURNI_API || '').replace(/\/$/, '');
      if (api) { const r = await fetch(api + '/api/notice', { cache: 'no-store' }); if (r.ok) n = { ...n, ...(await r.json()) }; }
    } catch (err) { /* offline: testo generico */ }
    await self.registration.showNotification(TITLE, {
      body: n.body || '', icon: '../icon-192.png', badge: '../favicon.png', tag: 'turni-agg', renotify: true,
    });
  })());
});

// Se il telefono rinnova l'iscrizione, la nuova va comunicata al server (altrimenti gli avvisi si perdono)
self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil((async () => {
    try {
      if (!API) return;
      let sub = await self.registration.pushManager.getSubscription();
      if (!sub) {
        const { key } = await (await fetch(API + '/api/vapid')).json();
        const bytes = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
        sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
      }
      await fetch(API + '/api/sub', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
    } catch (err) { /* alla prossima apertura l'app rifà l'iscrizione */ }
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
