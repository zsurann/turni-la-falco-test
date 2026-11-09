// Indirizzo del Worker per le notifiche push dei promemoria (turni-push).
// Lascia vuoto per usare solo i promemoria nel calendario.
// Esempio: self.TURNI_PUSH = 'https://turni-push.tuonome.workers.dev';
self.TURNI_PUSH = 'https://turni-push.zsuran139.workers.dev/';

// Indirizzo del Worker dei turni del responsabile (turni-sync): da qui arrivano i turni.
// Esempio: self.TURNI_API = 'https://turni-sync.tuonome.workers.dev/';
self.TURNI_API = 'https://turni-sync.zsuran139.workers.dev/';

// ATTENZIONE: se cambi uno di questi indirizzi, aggiornalo anche in "connect-src" dentro _headers.
