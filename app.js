/* I miei turni · La Falco — app dei turnisti.
   I turni arrivano dall'app del responsabile tramite il Worker "turni-sync" (config.js: TURNI_API);
   i promemoria push passano dal Worker "turni-push" (config.js: TURNI_PUSH). */

const P = window.TurniShifts;
const LS_NAME = 'turni.name.v1';
const LS_OV = 'turni.overrides.v1';
const LS_ONB = 'turni.onboarded.v1';
const LS_REVEAL = 'turni.reveal.v1'; // schermata "Bentornato" del nuovo design già vista
const LS_REMOTE = 'turni.remote.v1', LS_RVER = 'turni.remote.ver', LS_RCHK = 'turni.remote.checked';

const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
const GIORNI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const PENCIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z"/></svg>';
const PEOPLE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 20v-1a4 4 0 0 0-3-3.9M15.5 4.2a3.5 3.5 0 0 1 0 6.6"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

const $ = (s) => document.querySelector(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};
// I PDF caricati a mano non esistono più: tolgo quelli salvati dalle versioni precedenti
try { localStorage.removeItem('turni.docs.v2'); localStorage.removeItem('turni.guide.v1'); } catch { /* ignore */ }

let docs = store.get(LS_REMOTE, []);
let name = store.get(LS_NAME, '');
let overrides = store.get(LS_OV, {});
let view = 'next';
let wiz = null;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function dateOf(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
const fmtLong = (d) => GIORNI[d.getDay()] + ' ' + d.getDate() + ' ' + MESI[d.getMonth()];
const fmtH = (h) => (Number.isInteger(h) ? h : h.toFixed(1).replace('.', ',')) + ' ore';
const pad2 = (n) => String(n).padStart(2, '0');
const hhmm = (d) => pad2(d.getHours()) + ':' + pad2(d.getMinutes());
const normName = (s) => String(s || '').trim().toUpperCase().replace(/\s+/g, ' ');
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// Iniziali per l'avatar: "GENNARO C." -> "GC"
function initials(n) {
  const w = String(n || '').replace(/[^A-Za-zÀ-ÿ\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
  return w.length ? (w[0][0] + (w.length > 1 ? w[w.length - 1][0] : (w[0][1] || ''))).toUpperCase() : '';
}
// Numero che conta da 0 al valore
function countUp(node, to, fmt) {
  if (reduceMotion() || !to) { node.textContent = fmt(to); return; }
  const t0 = performance.now() + 150, dur = 1000;
  const f = (t) => {
    const k = Math.max(0, Math.min(1, (t - t0) / dur)), e = 1 - Math.pow(1 - k, 4);
    node.textContent = k < 1 ? fmt(Math.round(to * e)) : fmt(to);
    if (k < 1 && node.isConnected) requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
}

/* ---------- Postazioni e categorie (come nell'app del responsabile) ---------- */
// Ogni documento pubblicato porta la categoria (CAMPO SUD, CAMPO NORD, PARCHI, ...) e il nome
// della postazione (uiTitle): si usano quelli, senza indovinare dal titolo.
const CAT_ORDER = ['CAMPO SUD', 'CAMPO NORD', 'PARCHI'];
const SMALL_WORDS = new Set(['lato', 'del', 'della', 'dei', 'di', 'e', 'la', 'il', 'lo', 'le', 'al', 'alla']);
const niceCase = (s) => String(s || '').toLowerCase().split(' ')
  .map((w, i) => (i > 0 && SMALL_WORDS.has(w)) ? w : w.replace(/^(\p{L})/u, (c) => c.toUpperCase())).join(' ');
const normT = (s) => String(s || '').trim().toUpperCase().replace(/[_.]+/g, ' ').replace(/\s+/g, ' ');
function guessCat(t) {
  if (/\bPARCO\b|\bPARCHI\b|\bVILLA\b|\bGIARDIN|\bCAFASSO\b/.test(t)) return 'PARCHI';
  if (/\bCAMPO\s+NORD\b/.test(t)) return 'CAMPO NORD';
  if (/\bCAMPO\s+SUD\b/.test(t)) return 'CAMPO SUD';
  if (/\bNORD\b/.test(t)) return 'CAMPO NORD';
  if (/\bSUD\b/.test(t)) return 'CAMPO SUD';
  return 'ALTRO';
}
const infoCache = new WeakMap();
function docInfo(d) {
  if (!d) return { cat: '', post: '', short: '', catName: '', label: '' };
  if (infoCache.has(d)) return infoCache.get(d);
  const post = normT(d.uiTitle || d.title || d.id);
  let cat = normT(d.category);
  if (cat === 'PARCO CAFASSO') cat = 'PARCHI';
  if (!cat) cat = guessCat(post);
  const inside = post.startsWith(cat + ' ');
  const short = niceCase(inside ? post.slice(cat.length + 1) : post);
  const info = { cat, post, short, catName: niceCase(cat), label: inside ? short + ' · ' + niceCase(cat) : niceCase(post) };
  infoCache.set(d, info);
  return info;
}
const docById = (id) => docs.find((d) => d.id === id);
const roleOf = (s) => docInfo(docById(s.src)).label;
const catRank = (c) => { const i = CAT_ORDER.indexOf(c); return i < 0 ? 99 : i; };
function categories() {
  return [...new Set(docs.map((d) => docInfo(d).cat))].sort((a, b) => catRank(a) - catRank(b) || a.localeCompare(b, 'it'));
}
function docsOfCat(cat) {
  return docs.filter((d) => docInfo(d).cat === cat).sort((a, b) => docInfo(a).post.localeCompare(docInfo(b).post, 'it'));
}

/* ---------- Turni ---------- */
function decorate(s) {
  const day = dateOf(s.date);
  const [sh, sm] = s.start.split(':').map(Number);
  const [eh, em] = s.end.split(':').map(Number);
  const startAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), sh, sm);
  const endAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), eh, em);
  if (endAt <= startAt) endAt.setDate(endAt.getDate() + 1);
  const nextMidnight = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  let type;
  if (/extra/i.test(s.label || '')) type = { k: 'x', label: 'Extra' };
  else if (endAt > nextMidnight) type = { k: 'n', label: 'Notte' };
  else if (startAt.getHours() < 12) type = { k: 'm', label: 'Mattina' };
  else type = { k: 'p', label: 'Pomeriggio' };
  const out = { ...s, day, startAt, endAt, hours: (endAt - startAt) / 36e5, type, night: endAt > nextMidnight, role: roleOf(s) };
  // Notte al Gabbiotto di Campo Sud: il cambio arriva dalla Ronda di Campo Sud
  if (out.night && !s.rest && docInfo(docById(s.src)).post === 'CAMPO SUD GABBIOTTO') {
    const mates = cambioAt('CAMPO SUD RONDA', nextMidnight, s.end);
    if (mates.length) out.mates = mates;
  }
  // Notte dell'ultimo giorno del mese: il cambio sta nel foglio del mese dopo
  if (out.night && !s.rest && !(out.mates || []).length) {
    const mates = cambioAt(docInfo(docById(s.src)).post, nextMidnight, s.end);
    if (mates.length) out.mates = mates;
  }
  return out;
}
function iso(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function cambioAt(post, day, at) {
  const names = [];
  docs.forEach((d) => {
    if (docInfo(d).post !== post) return;
    P.dayOperators(d, iso(day)).forEach((op) => {
      if (op.start === at && !P.nameMatches(op.name, name) && !names.includes(op.name)) names.push(op.name);
    });
  });
  return names;
}
function build(base, orig) {
  const ov = overrides[base.key];
  if (!ov) return decorate(base);
  const m = { ...base, ...ov, orig, mod: true };
  m.rest = !!ov.rest;
  m.mates = (m.mates || []).filter((x) => !P.nameMatches(x, name));
  return decorate(m);
}
let shiftsCache = null;
function allShifts() {
  if (shiftsCache) return shiftsCache;
  const out = [], have = new Set();
  docs.forEach((d) => P.findShifts(d, name).forEach((s) => {
    have.add(s.date);
    const base = { ...s, src: d.id };
    base.key = [name, s.date, d.id, s.start].join('|');
    out.push(build(base, { start: s.start, end: s.end, role: roleOf(base) }));
  }));
  if (out.length) {
    const dates = new Set();
    let lastPlanned = '';
    docs.forEach((d) => d.rows.forEach((r) => {
      dates.add(r.date);
      if (r.cells.some((c) => c) && r.date > lastPlanned) lastPlanned = r.date;
    }));
    const todayIso = iso(startOfToday());
    const pend = {};
    [...dates].sort().forEach((date) => {
      if (have.has(date)) return;
      const key = [name, date, 'riposo'].join('|');
      const future = date > lastPlanned && date >= todayIso;
      if (future && !overrides[key]) { (pend[date.slice(0, 7)] = pend[date.slice(0, 7)] || []).push(date); return; }
      const base = { date, start: '00:00', end: '00:00', zone: '', src: '', label: '', note: '', extended: false, mates: [], rest: true, auto: true, key };
      out.push(build(base, { rest: true }));
    });
    Object.values(pend).forEach((ds) => {
      const day = dateOf(ds[0]), last = dateOf(ds[ds.length - 1]);
      out.push({ pending: true, rest: true, date: ds[0], lastDate: ds[ds.length - 1], key: 'pending|' + ds[0], day, startAt: day, endAt: new Date(last.getFullYear(), last.getMonth(), last.getDate(), 23, 59, 59), hours: 0, mates: [], type: { k: 'r', label: 'Riposo' }, night: false, role: '', start: '00:00', end: '00:00' });
    });
  }
  out.sort((a, b) => a.startAt - b.startAt);
  shiftsCache = out;
  return out;
}
const invalidate = () => { shiftsCache = null; };
function startOfToday() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
function relLabel(s, now) {
  if (s.startAt <= now && s.endAt >= now) return 'In corso';
  const diff = Math.round((s.day - startOfToday()) / 864e5);
  if (diff === 0) return 'Oggi';
  if (diff === 1) return 'Domani';
  return 'Tra ' + diff + ' giorni';
}

function render() {
  invalidate();
  $('#whoName').textContent = name;
  $('#whoAv').textContent = initials(name);
  const hr = new Date().getHours();
  $('#hello').textContent = (hr < 5 ? 'Buonanotte' : hr < 13 ? 'Buongiorno' : hr < 18 ? 'Buon pomeriggio' : 'Buonasera') + (name ? ', ' + name : '');
  $('#remBtnTxt').textContent = pushOn ? 'Notifiche attive' : 'Avvisi turni';
  if (document.activeElement !== $('#nameInput')) $('#nameInput').value = name;

  const now = new Date();
  const shifts = allShifts();
  const upcoming = shifts.filter((s) => s.endAt >= now && !s.rest);

  renderHero(upcoming[0], now);
  renderStats(shifts);
  renderList(shifts, now);
  renderSource();
  renderSimple(shifts);
  fillNameList();
  schedulePush();

  const empty = $('#empty');
  if (!API_URL) {
    empty.hidden = false;
    empty.replaceChildren(el('b', '', 'App non collegata'), el('p', '', 'Manca l\'indirizzo del server dei turni in config.js.'));
  } else if (!docs.length) {
    empty.hidden = false;
    empty.replaceChildren(el('b', '', 'Nessun turno pubblicato'), el('p', '', 'I turni compariranno qui appena il responsabile li pubblica.'));
  } else if (!shifts.length) {
    empty.hidden = false;
    empty.replaceChildren(el('b', '', 'Nessun turno per ' + name), el('p', '', 'Nei turni pubblicati non trovo questo nome. Sceglilo dall\'elenco qui sotto, scritto come lo scrive il responsabile.'));
  } else {
    empty.hidden = true;
  }
  $('#shiftsSection').hidden = !shifts.length;
}

/* ---------- Versione semplice: scritte grandi, un giorno per schermata, solo orario, posto e cambio ---------- */
const LS_SIMPLE = 'turni.simple.v1';
let simple = store.get(LS_SIMPLE, false), simpleOff = 0; // simpleOff: giorni di distanza da oggi
function dayWord(off, d) { return off === 0 ? 'Oggi' : off === 1 ? 'Domani' : off === -1 ? 'Ieri' : GIORNI[d.getDay()]; }
function renderSimple(shifts) {
  document.body.classList.toggle('simple', simple);
  const box = $('#simple');
  box.hidden = !simple;
  if (!simple) return;
  const t0 = startOfToday(), at = (off) => new Date(t0.getFullYear(), t0.getMonth(), t0.getDate() + off);
  const real = shifts.filter((s) => !s.pending);
  // non si esce dai giorni pubblicati (oggi resta sempre raggiungibile)
  const min = real.length ? Math.min(0, Math.round((real[0].day - t0) / 864e5)) : 0;
  const max = real.length ? Math.max(0, Math.round((real[real.length - 1].day - t0) / 864e5)) : 0;
  simpleOff = Math.max(min, Math.min(max, simpleOff));
  const day = at(simpleOff), mine = real.filter((s) => iso(s.day) === iso(day));
  const work = mine.filter((s) => !s.rest);
  const card = el('div', 'sm-card');
  card.append(el('span', 'sm-tag', dayWord(simpleOff, day).toUpperCase()), el('div', 'sm-date', fmtLong(day)));
  if (work.length) work.forEach((s) => {
    const info = docInfo(docById(s.src));
    card.append(el('div', 'sm-time', s.start + ' – ' + s.end), el('div', 'sm-place', info.catName && info.short !== info.catName ? info.catName + ' · ' + info.short : s.role));
    const cg = el('div', 'sm-cambio');
    if (s.mates.length) cg.append(el('span', '', 'Ti dà il cambio'), el('b', '', s.mates.join(', ')), el('span', '', 'alle ' + s.end));
    else cg.append(el('span', '', 'Cambio da definire'));
    card.append(cg);
  });
  else card.append(el('div', 'sm-rest', mine.length ? 'Riposo' : !docs.length ? 'Turni non ancora pubblicati' : !real.length ? 'Nessun turno per ' + name : 'Turni non ancora pubblicati'));
  const nav = el('div', 'sm-nav');
  const go = (off, txt) => { const b = el('button', 'sm-btn', txt); b.type = 'button'; b.disabled = off < min || off > max; b.addEventListener('click', () => { simpleOff = off; render(); scrollTo(0, 0); }); return b; };
  nav.append(go(simpleOff - 1, '◀ ' + dayWord(simpleOff - 1, at(simpleOff - 1))), go(simpleOff + 1, dayWord(simpleOff + 1, at(simpleOff + 1)) + ' ▶'));
  const today = go(0, 'Torna a oggi'); today.classList.add('sm-today'); today.hidden = Math.abs(simpleOff) < 2;
  const back = el('button', 'sm-btn sm-out', 'Torna alla versione normale'); back.type = 'button';
  back.addEventListener('click', () => setSimple(false));
  box.replaceChildren(el('div', 'sm-hi', 'Ciao ' + name), card, nav, today, back);
}
function setSimple(on) { simple = on; simpleOff = 0; store.set(LS_SIMPLE, on); render(); scrollTo(0, 0); }

/* ---------- Scena animata della postazione ----------
   Dove si trova l'operatore, in base a categoria, postazione e ora (come nell'app principale):
   - Campo Sud, Ronda: control room fino alle 19:00, poi in auto
   - Campo Sud, Gabbiotto: controllo ingressi fino alle 19:00, poi control room
   - Campo Sud Rom: sempre in auto
   - Campo Nord, Gabbiotto: sempre control room
   - Campo Nord, Ronda lato Sud: controllo ingressi fino alle 18:00, poi in auto
   - Campo Nord, Ronda lato Nord (o senza lato): sempre in auto
   - Parchi: il parco · Fotovoltaico: i pannelli solari · Casa Bartimeo: il centro Caritas
   L'orario del cambio è riferito al giorno in cui inizia il turno: una notte che inizia alle 22 è già "dopo le 19". */
const SCN = window.TurniScenes || {};
const SCENE_BEFORE = 36e5; // la scena compare già un'ora prima dell'inizio
function scenePlan(s) {
  const info = docInfo(docById(s.src));
  const t = info.post;
  const split = (a, b, h) => {
    const at = new Date(s.day.getFullYear(), s.day.getMonth(), s.day.getDate(), h, 0);
    if (s.endAt <= at) return [{ kind: a }];
    if (s.startAt >= at) return [{ kind: b }];
    return [{ kind: a, until: at }, { kind: b, from: at }];
  };
  const ronda = /\bROND[AE]\b/.test(t);
  const gab = !ronda && /\bGABBIOTT[OI]\b|\bTERR[AE]\s+DEL\s+SOLE\b/.test(t);
  if (info.cat === 'CAMPO SUD') {
    if (/\bROM\b/.test(t)) return [{ kind: 'car' }];
    if (ronda) return split('control', 'car', 19);
    if (gab) return split('gate', 'control', 19);
  }
  if (info.cat === 'CAMPO NORD') {
    if (gab) return [{ kind: 'control' }];
    if (ronda) return /\bLATO\s+SUD\b/.test(t) ? split('gate', 'car', 18) : [{ kind: 'car' }];
  }
  // campi a parte: valgono solo fuori da Campo Sud/Nord
  if (info.cat !== 'CAMPO SUD' && info.cat !== 'CAMPO NORD') {
    const all = info.cat + ' ' + t;
    if (/\bFOTOVOLTAIC[OA]\b/.test(all)) return [{ kind: 'solar' }];
    if (/\bBARTIMEO\b/.test(all)) return [{ kind: 'caritas' }];
    if (info.cat === 'PARCHI' || /\bPARC(O|HI)\b|\bVILLA\b|\bGIARDIN|\bCAFASSO\b/.test(all)) return [{ kind: 'park' }];
  }
  return [];
}
function sceneNow(plan, now) {
  if (!plan.length) return null;
  const i = plan[0].until && now >= plan[0].until ? 1 : 0;
  return { cur: plan[i], next: plan[i + 1] || null };
}
let heroShift = null, heroTimer = 0, heroLive = false, heroScene = false;
// Aggiorna la scena: cambio automatico di postazione all'orario stabilito e giorno/notte in base all'ora
function updateScene() {
  const box = $('#heroScene');
  if (!box || !heroShift) return;
  const now = new Date(), st = sceneNow(box._plan, now);
  if (!st || !SCN[st.cur.kind]) { box.hidden = true; return; }
  box.hidden = false;
  const hr = now.getHours();
  box.classList.toggle('night', hr >= 19 || hr < 6);
  const kind = st.cur.kind;
  if (box.dataset.kind !== kind) {
    const first = !box.dataset.kind;
    box.dataset.kind = kind;
    box.querySelector('.scn-art').innerHTML = SCN[kind].svg; // disegni fissi dell'app, nessun dato dell'utente
    if (!first) {
      box.classList.remove('swap'); void box.offsetWidth; box.classList.add('swap');
      toast('Sono le ' + hhmm(now) + ': ora sei ' + SCN[kind].short);
    }
  }
  box.querySelector('.scn-tag span').textContent = (now < heroShift.startAt ? 'Alle ' + hhmm(heroShift.startAt) + ' · ' : '')
    + SCN[kind].label + (st.next ? ' · dalle ' + hhmm(st.next.from) + ' ' + SCN[st.next.kind].short : '');
}
// Conto alla rovescia del prossimo turno (o barra di avanzamento se è in corso), aggiornato ogni secondo
function heroTick() {
  const s = heroShift, h = $('#hero');
  if (!s || h.hidden || !document.body.classList.contains('mode-app')) return;
  const now = Date.now(), live = s.startAt <= now;
  if (live !== heroLive) { render(); return; } // il turno è appena iniziato: "Turno in corso"
  if (!heroScene && s.startAt - now <= SCENE_BEFORE) { render(); return; } // manca un'ora: compare la scena
  const left = Math.max(0, (live ? s.endAt : s.startAt) - now);
  const lab = $('#cdLab');
  if (lab) lab.textContent = live ? 'Finisce tra' : 'Inizia tra';
  const d = Math.floor(left / 864e5), hh = Math.floor(left % 864e5 / 36e5), mm = Math.floor(left % 36e5 / 6e4), ss = Math.floor(left % 6e4 / 1e3);
  const set = (id, v, l) => { const b = $('#' + id); if (b) { b.firstChild.textContent = v; b.lastChild.textContent = l; } };
  if (d > 0) { set('cd1', d, d === 1 ? 'giorno' : 'giorni'); set('cd2', pad2(hh), 'ore'); set('cd3', pad2(mm), 'min'); }
  else { set('cd1', pad2(hh), 'ore'); set('cd2', pad2(mm), 'min'); set('cd3', pad2(ss), 'sec'); }
  const bar = $('#heroProg');
  if (bar) { bar.hidden = !live; if (live) bar.firstChild.style.width = Math.min(100, (now - s.startAt) / (s.endAt - s.startAt) * 100).toFixed(1) + '%'; }
  updateScene();
  if (left === 0) { clearInterval(heroTimer); heroTimer = 0; setTimeout(render, 1000); }
}
function renderHero(s, now) {
  const h = $('#hero');
  heroShift = s || null;
  if (!s) { h.hidden = true; clearInterval(heroTimer); heroTimer = 0; return; }
  h.hidden = false;
  const meta = el('div', 'meta');
  meta.append(el('span', 'chip ' + s.type.k, s.type.label));
  if (s.mod) meta.append(el('span', 'chip mod', 'Modificato'));
  if (s.extended) meta.append(el('span', 'chip ext', 'Prolungato'));
  meta.append(el('span', '', fmtH(s.hours)));
  if (s.note) meta.append(el('span', '', s.note));
  if (s.role) meta.append(el('span', 'role', s.role));
  const live = s.startAt <= now;
  heroLive = live;
  // scena della postazione: da un'ora prima dell'inizio fino alla fine del turno
  let scene = '';
  heroScene = s.startAt - now <= SCENE_BEFORE;
  const plan = heroScene ? scenePlan(s) : [];
  if (plan.length) {
    scene = el('div', 'scn');
    scene.id = 'heroScene';
    scene._plan = plan;
    const tag = el('div', 'scn-tag');
    tag.append(el('i'), el('span'));
    scene.append(el('div', 'scn-art'), tag);
  }
  const eb = el('div', 'eyebrow');
  eb.append(el('i', 'live' + (live ? ' on' : '')), document.createTextNode(live ? 'Turno in corso' : 'Prossimo turno'));
  const cdw = el('div', 'cdw');
  const cd = el('div', 'cd');
  ['cd1', 'cd2', 'cd3'].forEach((id) => { const b = el('div'); b.id = id; b.append(el('b', '', '00'), el('span', '', '')); cd.append(b); });
  const lab = el('div', 'cd-lab', '');
  lab.id = 'cdLab';
  cdw.append(lab, cd);
  const prog = el('div', 'hprog');
  prog.id = 'heroProg';
  prog.append(el('i'));
  const time = el('div', 'time');
  time.append(el('b', '', s.start + ' – ' + s.end));
  h.replaceChildren(
    el('i', 'blob'), el('i', 'blob b'), el('i', 'shine'),
    eb,
    el('div', 'when', relLabel(s, now)),
    el('div', 'date', fmtLong(s.day)),
    time, scene, prog, cdw,
    meta
  );
  heroTick();
  if (!heroTimer) heroTimer = setInterval(heroTick, 1000);
}

const monthKey = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1);
const fmtNum = (h) => { const r = Math.round(h * 10) / 10; return Number.isInteger(r) ? String(r) : r.toFixed(1).replace('.', ','); };
let statsKey = null, statsSig = '';
let statsKeys = [];
function renderStats(shifts) {
  const box = $('#stats');
  statsKeys = [...new Set(shifts.filter((s) => !s.pending).map((s) => monthKey(s.day)))].sort();
  if (!statsKeys.length) { box.hidden = true; return; }
  if (!statsKeys.includes(statsKey)) {
    const cur = monthKey(new Date());
    statsKey = statsKeys.includes(cur) ? cur : (statsKeys.find((k) => k > cur) || statsKeys[statsKeys.length - 1]);
  }
  box.hidden = false;
  const [y, m] = statsKey.split('-').map(Number);
  $('#statsMonth').textContent = 'Riepilogo ' + MESI[m - 1] + ' ' + y;
  const i = statsKeys.indexOf(statsKey);
  $('#statsNav').hidden = statsKeys.length < 2;
  $('#statsPrev').disabled = i <= 0;
  $('#statsNext').disabled = i >= statsKeys.length - 1;
  const mine = shifts.filter((s) => !s.rest && monthKey(s.day) === statsKey);
  const hours = mine.reduce((a, s) => a + s.hours, 0);
  const nights = mine.filter((s) => s.night).length;
  // barretta: quanto del mese è già stato fatto
  const now = new Date(), done = mine.filter((x) => x.endAt <= now);
  const doneH = done.reduce((a, x) => a + x.hours, 0), doneN = done.filter((x) => x.night).length;
  const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);
  const sig = statsKey + '|' + mine.length + '|' + hours + '|' + nights;
  const animate = sig !== statsSig;
  statsSig = sig;
  const mk = (v, l, p, fmt, tip) => {
    const d = el('div', 'stat'), b = el('b', '', fmt(animate ? 0 : v)), bar = el('div', 'sbar'), fill = el('i');
    d.title = tip;
    bar.append(fill);
    d.append(b, el('span', '', l), bar);
    if (animate) { countUp(b, v, fmt); setTimeout(() => { fill.style.width = p + '%'; }, 120); } else fill.style.width = p + '%';
    return d;
  };
  const int = (v) => String(Math.round(v));
  $('#statsGrid').replaceChildren(
    mk(mine.length, 'Turni', pct(done.length, mine.length), int, done.length + ' di ' + mine.length + ' già fatti'),
    mk(hours, 'Ore', pct(doneH, hours), fmtNum, fmtNum(doneH) + ' di ' + fmtNum(hours) + ' ore già fatte'),
    mk(nights, 'Notti', pct(doneN, nights), int, doneN + ' di ' + nights + ' notti già fatte'));
  updatePay(hours, y, m);
}

const LS_RATE = 'turni.rate.v1';
let rate = +store.get(LS_RATE, 6) || 6; // paga oraria scelta dal dipendente, resta sul suo telefono
const eur = (v) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(v);
let payOpen = false, payVal = 0, payRaf = 0, payTarget = 0, payArgs = null;
function animatePay(to) {
  cancelAnimationFrame(payRaf);
  const from = payVal, t0 = performance.now(), dur = 900;
  const done = () => { payVal = to; $('#payAmt').textContent = eur(to); };
  if (from === to || reduceMotion()) { done(); return; }
  const tick = (t) => {
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    payVal = from + (to - from) * e;
    $('#payAmt').textContent = eur(payVal);
    if (k < 1) payRaf = requestAnimationFrame(tick); else done();
  };
  payRaf = requestAnimationFrame(tick);
}
function updatePay(hours, y, m) {
  const total = Math.round(hours * rate * 100) / 100;
  payArgs = [hours, y, m];
  if (document.activeElement !== $('#payRate')) $('#payRate').value = String(rate).replace('.', ',');
  const ended = new Date(y, m, 1) <= startOfToday();
  $('#payTitle').textContent = 'Stima stipendio ' + MESI[m - 1] + ' ' + y;
  $('#payCalc').textContent = fmtNum(hours) + ' ore × ' + eur(rate).replace(',00', '') + ' all\'ora';
  $('#payNote').textContent = ended
    ? 'Mese concluso: calcolato su tutte le ore del mese.'
    : 'Mese in corso: calcolato sulle ore attuali del riepilogo.';
  if (payOpen) animatePay(total); else { payVal = 0; $('#payAmt').textContent = eur(0); }
  payTarget = total;
}
function togglePay() {
  payOpen = !payOpen;
  $('#pay').classList.toggle('open', payOpen);
  $('#payBtn').setAttribute('aria-expanded', String(payOpen));
  $('#payBtnTxt').textContent = payOpen ? 'Nascondi' : 'Calcola';
  if (payOpen) { payVal = 0; animatePay(payTarget); } else cancelAnimationFrame(payRaf);
}
$('#payBtn').addEventListener('click', togglePay);
$('#payRate').addEventListener('input', (e) => {
  const v = parseFloat(e.target.value.replace(',', '.'));
  if (!(v > 0 && v < 1000)) return; // valore non valido: resta la paga di prima
  rate = Math.round(v * 100) / 100;
  store.set(LS_RATE, rate);
  if (payArgs) updatePay(...payArgs);
});

function stepMonth(dir) {
  const k = statsKeys[statsKeys.indexOf(statsKey) + dir];
  if (k) { statsKey = k; render(); }
}

function renderList(shifts, now) {
  const list = $('#list');
  const src = view === 'next' ? shifts.filter((s) => s.endAt >= now) : shifts;
  list.replaceChildren();
  if (!src.length) {
    list.append(el('p', 'hint', view === 'next' ? 'Nessun turno in programma.' : 'Nessun turno.'));
    return;
  }
  let curMonth = '';
  const today = startOfToday().getTime();
  // turno in corso (es. la notte iniziata ieri): finché non finisce resta lui "quello di oggi"
  const cur = src.find((s) => !s.pending && !s.rest && s.startAt <= now && s.endAt >= now);
  const carry = !!cur && cur.day.getTime() !== today;
  src.forEach((s, idx) => {
    const mk = s.day.getFullYear() + '-' + s.day.getMonth();
    if (mk !== curMonth) {
      curMonth = mk;
      list.append(el('div', 'month', MESI[s.day.getMonth()] + ' ' + s.day.getFullYear()));
    }
    if (s.pending) {
      const d2 = dateOf(s.lastDate), one = s.lastDate === s.date;
      const pc = el('div', 'shift pending');
      const pb = el('div', 'dbox');
      pb.append(el('b', '', String(s.day.getDate())), el('span', '', MESI[s.day.getMonth()].slice(0, 3)));
      const pbody = el('div');
      const pm = el('div', 's-main');
      pm.append(el('span', 's-day', 'Turni ancora da stabilire'));
      const ps = el('div', 's-sub');
      ps.append(el('span', 'chip wait', 'In attesa'));
      ps.append(el('span', '', one ? 'Il ' + s.day.getDate() + ' ' + MESI[s.day.getMonth()].toLowerCase() : 'Dal ' + s.day.getDate() + ' al ' + d2.getDate() + ' ' + MESI[d2.getMonth()].toLowerCase()));
      ps.append(el('span', 'note', 'Compariranno quando il responsabile li pubblica'));
      pbody.append(pm, ps);
      pc.append(pb, pbody);
      list.append(pc);
      return;
    }
    const isToday = carry ? s === cur : s.day.getTime() === today;
    const card = el('div', 'shift' + (isToday ? ' today' : '') + (s.endAt < now ? ' past' : '') + (s.rest ? ' rest' : ' k-' + s.type.k));
    card.style.animationDelay = (Math.min(idx, 10) * 0.04) + 's';

    const dbox = el('div', 'dbox');
    dbox.append(el('b', '', String(s.day.getDate())), el('span', '', MESI[s.day.getMonth()].slice(0, 3)));

    const body = el('div');
    const main = el('div', 's-main');
    const dayEl = el('span', 's-day', GIORNI[s.day.getDay()] + (isToday ? (s.day.getTime() === today ? ' · oggi' : ' · in corso') : ''));
    if (s.role && !s.rest) dayEl.append(el('span', 'role', ' · ' + s.role));
    main.append(dayEl, el('span', 's-time', s.rest ? 'Riposo' : s.start + ' – ' + s.end));

    const sub = el('div', 's-sub');
    if (s.rest) {
      sub.append(el('span', 'chip r', 'Riposo'));
    } else {
      sub.append(el('span', 'chip ' + s.type.k, s.type.label));
      if (s.mod) sub.append(el('span', 'chip mod', 'Modificato'));
      if (s.extended) sub.append(el('span', 'chip ext', 'Prolungato'));
      sub.append(el('span', '', fmtH(s.hours)));
      if (s.note) sub.append(el('span', 'note', s.note));
      if (s.mod && s.swap) sub.append(el('span', '', 'Scambio con ' + s.swap));
      sub.append(el('span', '', s.mates.length ? 'Cambio ' + s.mates.join(', ') : 'Cambio da definire'));
    }
    if (s.mod) sub.append(el('span', 'was', 'Prima: ' + (s.orig.rest ? 'Riposo' : s.orig.start + ' – ' + s.orig.end + (s.orig.role ? ' · ' + s.orig.role : ''))));

    const mb = el('button', 'mbtn');
    mb.type = 'button';
    mb.innerHTML = PEOPLE + 'Colleghi';
    if (!s.rest) mb.addEventListener('click', () => openSheet(s, mb, 'mates'));
    const edit = el('button', 'edit');
    edit.type = 'button';
    edit.innerHTML = PENCIL + 'Modifica';
    edit.addEventListener('click', () => openSheet(s, edit));
    if (!s.rest) sub.append(mb);
    sub.append(edit);
    if (!s.rest) { card.classList.add('tap'); card.addEventListener('click', (e) => { if (!e.target.closest('button')) openSheet(s, card, 'mates'); }); }

    body.append(main, sub);
    card.append(dbox, body);
    if (!s.rest && s.startAt <= now && s.endAt >= now) {
      // turno in corso: barra di avanzamento
      const pr = el('div', 'prog'), pi = el('i');
      pr.append(pi);
      card.append(pr);
      const p = Math.min(100, (now - s.startAt) / (s.endAt - s.startAt) * 100);
      requestAnimationFrame(() => setTimeout(() => { pi.style.width = p.toFixed(1) + '%'; }, 250));
    }
    list.append(card);
  });
}

/* ---------- Provenienza dei turni e nome ---------- */
function renderSource() {
  const box = $('#source');
  const ver = store.get(LS_RVER, null), chk = store.get(LS_RCHK, null);
  const lines = [];
  if (!API_URL) lines.push('Server dei turni non configurato.');
  else if (!docs.length) lines.push('Il responsabile non ha ancora pubblicato turni.');
  else {
    const months = [...new Set(docs.map((d) => d.month || (d.rows[0] && d.rows[0].date.slice(0, 7))).filter(Boolean))].sort();
    const fromTo = months.length ? MESI[+months[0].slice(5) - 1].toLowerCase() + (months.length > 1 ? ' – ' + MESI[+months[months.length - 1].slice(5) - 1].toLowerCase() : '') : '';
    const pv = Number(ver) > 1e12 ? new Date(Number(ver)) : null;
    lines.push((pv ? 'Pubblicati il ' + pv.getDate() + ' ' + MESI[pv.getMonth()].toLowerCase() + ' alle ' + hhmm(pv) : 'Turni pubblicati') + (fromTo ? ' · ' + fromTo : ''));
  }
  if (chk) lines.push('Ultimo controllo alle ' + hhmm(new Date(chk)));
  box.replaceChildren(...lines.map((t, i) => el(i ? 'span' : 'b', '', t)));
}
// Elenco dei nomi presenti nei turni: si sceglie il proprio invece di scriverlo a memoria
let namesSig = '';
function fillNameList() {
  const names = P.allNames(docs);
  const sig = names.join('|');
  if (sig === namesSig) return;
  namesSig = sig;
  $('#nameList').replaceChildren(...names.map((n) => { const o = el('option'); o.value = n; return o; }));
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

/* ---------- Pannello: modifica turno, colleghi, promemoria ---------- */
function openSheet(shift, opener, mode) {
  wiz = { shift, step: 1, cat: '', docId: '', opener, mode: mode || 'edit' };
  $('#sheet').hidden = false;
  document.body.classList.add('lock');
  renderSheet();
  $('#shPanel').focus();
}
function closeSheet() {
  if (!wiz) return;
  const op = wiz.opener;
  wiz = null;
  $('#sheet').hidden = true;
  document.body.classList.remove('lock');
  if (op && op.isConnected) op.focus();
}

function opt(title, sub, onClick, cls, right) {
  const b = el('button', 'opt' + (cls ? ' ' + cls : ''));
  b.type = 'button';
  const l = el('span', 'opt-l');
  l.append(el('b', '', title));
  if (sub) l.append(el('span', '', sub));
  b.append(l);
  if (right) b.append(el('span', 'opt-r', right));
  b.addEventListener('click', onClick);
  return b;
}
function backBtn(step) {
  const b = el('button', 'back', '‹ Indietro');
  b.type = 'button';
  b.addEventListener('click', () => { wiz.step = step; renderSheet(); });
  return b;
}

function commit(entry, msg) {
  if (entry) overrides[wiz.shift.key] = entry; else delete overrides[wiz.shift.key];
  store.set(LS_OV, overrides);
  closeSheet();
  render();
  toast(msg);
}

function renderSheet() {
  if (wiz.mode === 'mates') return renderMates();
  if (wiz.mode === 'remind') return renderRemind();
  $('#shTitle').textContent = 'Modifica turno';
  const s = wiz.shift;
  const body = $('#shBody');
  const cur = s.rest ? 'Riposo' : s.start + ' – ' + s.end + (s.role ? ' · ' + s.role : '');
  $('#shSub').textContent = fmtLong(s.day) + ' · ' + cur;
  $('#shSteps').replaceChildren(...[1, 2, 3].map((n) => el('i', n <= wiz.step ? 'on' : '')));
  body.replaceChildren();

  // 1) categoria (Campo Sud, Campo Nord, Parchi, ...) oppure riposo
  if (wiz.step === 1) {
    body.append(el('p', 'q', 'Dove hai lavorato?'));
    categories().forEach((c) => {
      body.append(opt(niceCase(c), docsOfCat(c).map((d) => docInfo(d).short).join(', '), () => {
        wiz.cat = c;
        const ds = docsOfCat(c);
        if (ds.length === 1) { wiz.docId = ds[0].id; wiz.step = 3; } else wiz.step = 2;
        renderSheet();
      }, 'big'));
    });
    if (!docs.length) body.append(el('p', 'none', 'Il responsabile non ha ancora pubblicato turni.'));
    if (!(s.auto && !s.mod)) {
      const rest = opt('Riposo', 'Imposta questo giorno come libero', () => commit(s.auto ? null : { rest: true }, 'Riposo impostato'), 'big rest');
      rest.insertAdjacentHTML('afterbegin', MOON);
      body.append(rest);
    }
    if (s.mod) {
      const g = el('button', 'ghost', s.orig && s.orig.rest ? 'Torna a Riposo' : 'Ripristina turno originale');
      g.type = 'button';
      g.addEventListener('click', () => commit(null, 'Turno ripristinato'));
      body.append(g);
    }
    return;
  }

  // 2) postazione della categoria
  if (wiz.step === 2) {
    body.append(backBtn(1), el('p', 'q', 'Quale postazione? · ' + niceCase(wiz.cat)));
    docsOfCat(wiz.cat).forEach((d) => body.append(opt(docInfo(d).short, '', () => { wiz.docId = d.id; wiz.step = 3; renderSheet(); }, 'big')));
    return;
  }

  // 3) con chi hai fatto il cambio
  const d = docById(wiz.docId);
  const single = docsOfCat(wiz.cat).length === 1;
  body.append(backBtn(single ? 1 : 2), el('p', 'q', 'Con chi hai fatto il cambio? · ' + (d ? docInfo(d).label : '')));
  if (!d) { body.append(el('p', 'none', 'Postazione non più presente nei turni pubblicati.')); return; }
  const ops = P.dayOperators(d, s.date).filter((o) => !P.nameMatches(o.name, name));
  ops.forEach((o) => {
    const t = decorate({ ...o, src: d.id });
    const sub = t.type.label + (o.note ? ' · ' + o.note : '');
    body.append(opt(o.name, sub, () => commit({
      swap: o.name, start: o.start, end: o.end, kindStart: o.kindStart, label: o.label,
      note: o.note, extended: o.extended, mates: o.mates, zone: d.title, src: d.id,
    }, 'Turno aggiornato'), '', o.start + ' – ' + o.end));
  });
  if (!ops.length) body.append(el('p', 'none', 'Nessun operatore in questo giorno in questa postazione.'));
}

function renderMates() {
  const s = wiz.shift, body = $('#shBody');
  $('#shTitle').textContent = 'Chi lavora con te';
  $('#shSub').textContent = fmtLong(s.day) + ' · ' + s.start + ' – ' + s.end + (s.role ? ' · ' + s.role : '');
  $('#shSteps').replaceChildren();
  body.replaceChildren();
  const cat = docInfo(docById(s.src)).cat;
  const prev = new Date(s.day.getFullYear(), s.day.getMonth(), s.day.getDate() - 1);
  const together = [], others = [], seen = new Set();
  docs.forEach((d) => {
    const info = docInfo(d);
    if (!cat || info.cat !== cat) return;
    [[iso(prev), true], [s.date, false]].forEach(([date, isPrev]) => {
      P.dayOperators(d, date).forEach((o) => {
        if (P.nameMatches(o.name, name)) return;
        const t = decorate({ ...o, date, src: d.id, zone: d.title });
        const ov = t.startAt < s.endAt && t.endAt > s.startAt;
        if (isPrev && !ov) return;
        const k = o.name + '|' + info.post + '|' + date + '|' + o.start;
        if (seen.has(k)) return;
        seen.add(k);
        (ov ? together : others).push({ name: o.name, role: info.short, time: o.start + ' – ' + o.end, at: t.startAt });
      });
    });
  });
  const add = (title, arr) => {
    if (!arr.length) return;
    arr.sort((x, y) => x.at - y.at || x.name.localeCompare(y.name));
    body.append(el('p', 'grp', title));
    arr.forEach((m) => {
      const row = el('div', 'mate');
      row.style.setProperty('--i', String(Math.min(body.querySelectorAll('.mate').length, 10)));
      const l = el('span', 'opt-l');
      l.append(el('b', '', m.name), el('span', '', m.role));
      const av = el('span', 'av sm ' + (/ronda/i.test(m.role) ? 'c2' : /gabbiotto|terra del sole/i.test(m.role) ? 'c1' : 'c3'), initials(m.name));
      av.setAttribute('aria-hidden', 'true');
      row.append(av, l, el('span', 'opt-r', m.time));
      body.append(row);
    });
  };
  add('Con te · ' + niceCase(cat), together);
  add('Altri turni del giorno', others);
  if (!together.length && !others.length) {
    body.append(el('p', 'none', cat ? 'Nei turni pubblicati non trovo altri operatori in questo giorno.' : 'Non so a quale postazione appartiene questo turno.'));
  }
}

/* ---------- Notifiche push: promemoria (turni-push) e turni pubblicati (turni-sync) ---------- */
const PUSH_URL = String(window.TURNI_PUSH || '').replace(/\/$/, '');
const API_URL = String(window.TURNI_API || '').replace(/\/$/, '');
const pushOK = !!PUSH_URL && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const LS_PUSH = 'turni.push.v1', LS_PUSHSIG = 'turni.push.sig', LS_UPD = 'turni.updates.v1';
let pushOn = store.get(LS_PUSH, false), pushTimer = 0, pushBusy = false;
let updOn = store.get(LS_UPD, true); // avviso quando il responsabile pubblica nuovi turni
const bytesB64 = (buf) => { let s = ''; for (const c of new Uint8Array(buf)) s += String.fromCharCode(c); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const keyBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
async function pushPost(path, body) {
  const r = await fetch(PUSH_URL + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('push ' + r.status);
  return r.json();
}
function pushNotifs() {
  const out = [], now = Date.now();
  remindShifts().forEach((s) => {
    const body = s.start + ' – ' + s.end + (s.role ? ' · ' + s.role : '');
    if (rem.eve) {
      const at = new Date(s.day.getFullYear(), s.day.getMonth(), s.day.getDate() - 1, 20, 0).getTime();
      if (at < s.startAt && at > now - 36e5) out.push({ id: s.date + '|' + s.start + '|eve', at, title: 'Domani hai turno', body });
    }
    if (rem.hour) {
      const at = s.startAt.getTime() - 36e5;
      if (at > now - 36e5) out.push({ id: s.date + '|' + s.start + '|hour', at, title: 'Il turno inizia tra un\'ora', body });
    }
  });
  return out.sort((a, b) => a.at - b.at).slice(0, 300);
}
async function pushSub() { const reg = await navigator.serviceWorker.ready; return reg.pushManager.getSubscription(); }
async function syncPush(force) {
  if (!pushOK || !pushOn || pushBusy) return;
  pushBusy = true;
  try {
    const sub = await pushSub();
    if (!sub) { pushOn = false; store.set(LS_PUSH, false); return; }
    const notifs = pushNotifs();
    const sig = JSON.stringify(notifs);
    if (!force && sig === store.get(LS_PUSHSIG, '')) return;
    await pushPost('/api/sync', { sub: sub.toJSON(), notifs });
    store.set(LS_PUSHSIG, sig);
  } catch { /* offline: riprovo al prossimo aggiornamento */ }
  finally { pushBusy = false; }
}
function schedulePush() { if (pushOK && pushOn) { clearTimeout(pushTimer); pushTimer = setTimeout(() => syncPush(false), 1500); } }
async function enablePush() {
  if (Notification.permission === 'denied') { toast('Notifiche bloccate: attivale dalle impostazioni del telefono'); return false; }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast('Notifiche non consentite'); return false; }
  const { key } = await (await fetch(PUSH_URL + '/api/key')).json();
  const reg = await navigator.serviceWorker.ready;
  const old = await reg.pushManager.getSubscription();
  if (old) await old.unsubscribe();
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  pushOn = true; store.set(LS_PUSH, true);
  const notifs = pushNotifs();
  await pushPost('/api/sync', { sub: sub.toJSON(), notifs });
  store.set(LS_PUSHSIG, JSON.stringify(notifs));
  if (updOn) enableUpdates();
  return true;
}
async function disablePush() {
  try { const sub = await pushSub(); if (sub) { await pushPost('/api/unsub', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); } } catch { /* ignore */ }
  pushOn = false; store.set(LS_PUSH, false);
  updOn = false; store.set(LS_UPD, false);
  disableUpdates();
}

const LS_REM = 'turni.remind.v1';
let rem = { eve: true, hour: true, ...store.get(LS_REM, {}) };
const icsEsc = (t) => String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
function icsFold(line) {
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b = enc.encode(line);
  if (b.length <= 74) return line;
  const parts = [];
  let i = 0;
  while (i < b.length) {
    let n = Math.min(i === 0 ? 74 : 73, b.length - i);
    while (n > 0 && i + n < b.length && (b[i + n] & 0xc0) === 0x80) n--;
    parts.push(dec.decode(b.slice(i, i + n)));
    i += n;
  }
  return parts.join('\r\n ');
}
const icsDate = (d) => d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + 'T' + pad2(d.getHours()) + pad2(d.getMinutes()) + '00';
function remindShifts() { const now = new Date(); return allShifts().filter((s) => !s.rest && !s.pending && s.endAt >= now); }
function buildIcs(list, o) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//La Falco//Turni//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Turni La Falco'];
  list.forEach((s) => {
    const desc = [s.role, s.note, s.mates && s.mates.length ? 'Cambio: ' + s.mates.join(', ') : 'Cambio da definire'].filter(Boolean).join(' - ');
    L.push('BEGIN:VEVENT', 'UID:turno-' + s.date + '-' + s.start.replace(':', '') + '@turni-lafalco', 'DTSTAMP:' + stamp,
      'DTSTART:' + icsDate(s.startAt), 'DTEND:' + icsDate(s.endAt),
      'SUMMARY:' + icsEsc('Turno ' + s.start + '-' + s.end + (s.role ? ' · ' + s.role : '')),
      'DESCRIPTION:' + icsEsc(desc), 'TRANSP:OPAQUE');
    if (o.hour) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Turno tra un\'ora', 'TRIGGER:-PT1H', 'END:VALARM');
    if (o.eve) {
      const eve = new Date(s.day.getFullYear(), s.day.getMonth(), s.day.getDate() - 1, 20, 0);
      const mins = Math.round((s.startAt - eve) / 6e4);
      if (mins > 0) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Domani hai turno', 'TRIGGER:-PT' + mins + 'M', 'END:VALARM');
    }
    L.push('END:VEVENT');
  });
  L.push('END:VCALENDAR');
  return L.map(icsFold).join('\r\n') + '\r\n';
}
async function deliverIcs(text) {
  const file = new File([text], 'turni-la-falco.ics', { type: 'text/calendar' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Turni La Falco' }); return 'shared'; }
    catch (e) { if (e && e.name === 'AbortError') return 'abort'; }
  }
  const url = URL.createObjectURL(file);
  const a = el('a');
  a.href = url; a.download = 'turni-la-falco.ics';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'download';
}
function switchOpt(title, sub, on, onToggle) {
  const b = opt(title, sub, onToggle, 'tg' + (on ? ' on' : ''), on ? '✓' : '');
  b.setAttribute('role', 'switch');
  b.setAttribute('aria-checked', String(!!on));
  return b;
}
function renderRemind() {
  const body = $('#shBody');
  $('#shTitle').textContent = 'Promemoria e avvisi';
  $('#shSub').textContent = 'Un avviso sul telefono prima di ogni turno';
  $('#shSteps').replaceChildren();
  body.replaceChildren();
  const list = remindShifts();
  body.append(el('p', 'q', 'Quando vuoi essere avvisato?'));
  [['eve', 'La sera prima', 'Alle 20:00 del giorno prima'], ['hour', 'Un\'ora prima', 'Un\'ora prima dell\'inizio del turno']].forEach(([k, t, sub]) => {
    body.append(switchOpt(t, sub, rem[k], () => { rem[k] = !rem[k]; store.set(LS_REM, rem); schedulePush(); renderRemind(); }));
  });
  if (pushOK && API_URL) {
    body.append(switchOpt('Turni pubblicati', 'Quando il responsabile pubblica o cambia i turni', updOn, async () => {
      updOn = !updOn;
      store.set(LS_UPD, updOn);
      if (!updOn) await disableUpdates();
      else if (Notification.permission === 'granted') await enableUpdates();
      else if (Notification.permission === 'denied') toast('Notifiche bloccate: attivale dalle impostazioni del telefono');
      else if ((await Notification.requestPermission()) === 'granted') await enableUpdates();
      renderRemind();
    }));
  }
  if (!pushOK) body.append(el('p', 'none', list.length ? 'Verranno aggiunti ' + list.length + (list.length === 1 ? ' turno' : ' turni') + ' da oggi in poi.' : 'Non ci sono turni in programma.'));
  if (pushOK) {
    body.append(el('p', 'q', 'Notifiche push'));
    if (pushOn) {
      const st = el('div', 'mate');
      const l = el('span', 'opt-l');
      l.append(el('b', '', 'Notifiche attive ✓'), el('span', '', 'Ti avviso anche con l\'app chiusa'));
      st.append(l);
      const test = el('button', 'ghost', 'Invia notifica di prova');
      test.type = 'button';
      test.addEventListener('click', async () => {
        try { const sub = await pushSub(); const r = await pushPost('/api/test', { endpoint: sub.endpoint }); toast(r.ok ? 'Notifica inviata' : 'Non sono riuscito a inviarla'); }
        catch { toast('Server notifiche non raggiungibile'); }
      });
      const off = el('button', 'ghost', 'Disattiva le notifiche');
      off.type = 'button';
      off.addEventListener('click', async () => { await disablePush(); renderRemind(); toast('Notifiche disattivate'); });
      body.append(st, test, off);
    } else {
      const on = el('button', 'big', 'Attiva le notifiche');
      on.type = 'button';
      on.disabled = !rem.eve && !rem.hour && !updOn;
      on.addEventListener('click', async () => {
        on.disabled = true; on.textContent = 'Attivazione…';
        try { if (await enablePush()) toast('Notifiche attivate'); }
        catch { toast('Non sono riuscito ad attivarle'); }
        renderRemind();
      });
      body.append(on);
    }
    body.append(el('p', 'fine', 'Per inviare i promemoria, giorni, orari e postazione dei tuoi turni vengono salvati sul server delle notifiche. Se disattivi, vengono cancellati.'));
    return;
  }
  body.append(el('p', 'q', 'Calendario'));
  const go = el('button', 'big', 'Aggiungi al calendario');
  go.type = 'button';
  go.disabled = !list.length || (!rem.eve && !rem.hour);
  go.addEventListener('click', async () => {
    const r = await deliverIcs(buildIcs(list, rem));
    if (r === 'abort') return;
    closeSheet();
    toast(r === 'shared' ? 'Scegli "Calendario" per aggiungerli' : 'File calendario pronto: aprilo per aggiungerli');
  });
  body.append(go, el('p', 'fine', 'Funziona con il calendario del telefono, su iPhone e Android, anche con l\'app chiusa. Se il responsabile cambia i turni, ripeti: i giorni già inseriti vengono aggiornati.'));
}
$('#remBtn').addEventListener('click', (e) => openSheet(null, e.currentTarget, 'remind'));

/* ---------- Nome ---------- */
function setName(v) {
  name = v;
  store.set(LS_NAME, name);
  render();
}
$('#nameForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = normName($('#nameInput').value);
  if (!v) return;
  $('#nameInput').blur();
  setName(v);
  const n = allShifts().filter((s) => !s.rest).length;
  toast(n ? 'Trovati ' + n + (n === 1 ? ' turno' : ' turni') + ' per ' + v : 'Nessun turno per ' + v + ' nei turni pubblicati');
});
$('#refreshBtn').addEventListener('click', () => pullSchedule(true));
$('#simpleBtn').addEventListener('click', () => setSimple(true));

function setView(v) {
  view = v;
  $('#tabNext').classList.toggle('on', v === 'next');
  $('#tabAll').classList.toggle('on', v === 'all');
  $('#seg').classList.toggle('all', v === 'all');
  $('#tabNext').setAttribute('aria-selected', String(v === 'next'));
  $('#tabAll').setAttribute('aria-selected', String(v === 'all'));
  render();
}
$('#tabNext').addEventListener('click', () => setView('next'));
$('#tabAll').addEventListener('click', () => setView('all'));

$('#statsPrev').addEventListener('click', () => stepMonth(-1));
$('#statsNext').addEventListener('click', () => stepMonth(1));
$('#shClose').addEventListener('click', closeSheet);
$('#shBg').addEventListener('click', closeSheet);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

/* ---------- Installazione e benvenuto ---------- */
const UA = navigator.userAgent;
const isStandalone = ['standalone', 'fullscreen', 'minimal-ui'].some((m) => matchMedia('(display-mode: ' + m + ')').matches) || navigator.standalone === true;
const isIOS = /iPhone|iPad|iPod/i.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isSafariIOS = isIOS && /Safari\//.test(UA) && !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|DuckDuckGo|YaBrowser|Brave|FBAN|FBAV|Instagram|Line\//i.test(UA);
const SHARE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';
const setMode = (m) => {
  [...document.body.classList].filter((c) => c.startsWith('mode-')).forEach((c) => document.body.classList.remove(c));
  if (m) document.body.classList.add('mode-' + m);
};

let installEvt = null;
let arrowEl = null;
function gateSteps(items) {
  const box = $('#gateSteps');
  box.replaceChildren();
  items.forEach((it, n) => {
    const row = el('div', 'gs');
    row.style.setProperty('--d', (n * 0.12) + 's');
    const num = el('i', '', String(n + 1));
    const t = el('span');
    t.innerHTML = it; // testi fissi dell'app, nessun dato dell'utente
    row.append(num, t);
    box.append(row);
  });
  box.hidden = false;
}
function showArrow(on) {
  if (on && !arrowEl) { arrowEl = el('div', 'arrow', '↓'); document.body.append(arrowEl); }
  if (!on && arrowEl) { arrowEl.remove(); arrowEl = null; }
}
function gateInstalled() {
  $('#gate').classList.add('done');
  $('#gateSteps').hidden = true;
  showArrow(false);
  $('#gateBtn').hidden = true;
  $('#gate h1').innerHTML = 'App installata<br>✓';
  $('#gateLead').textContent = 'Ora chiudi questa pagina e apri "Turni" dalla schermata Home.';
  $('#gateNote').textContent = '';
}
function showGate() {
  setMode('');
  $('#gate').hidden = false;
  $('#welcome').hidden = true;
  const btn = $('#gateBtn'), note = $('#gateNote');
  const mode = isIOS ? (isSafariIOS ? 'ios-safari' : 'ios-other') : 'auto';
  if (mode === 'ios-other') {
    btn.textContent = 'Apri con Safari';
    $('#gateLead').textContent = "Per scaricare l'app devi aprire questo link con Safari.";
    note.textContent = 'Il link si apre da Safari, poi segui le istruzioni.';
  }
  btn.addEventListener('click', async () => {
    if (mode === 'ios-safari') {
      const box = $('#gateSteps');
      if (!box.hidden) { box.hidden = true; showArrow(false); btn.textContent = "Scarica l'app"; return; }
      gateSteps(['Tocca <b>Condividi</b> ' + SHARE + ' nella barra di Safari', 'Scorri e scegli <b>Aggiungi alla schermata Home</b>', 'Tocca <b>Aggiungi</b>, poi apri <b>Turni</b> dalla Home']);
      showArrow(true);
      btn.textContent = 'Ho capito';
      return;
    }
    if (mode === 'ios-other') {
      let copied = true;
      try { await navigator.clipboard.writeText(location.href.split('#')[0]); } catch { copied = false; }
      gateSteps([copied ? 'Link copiato ✓' : 'Copia il link dalla barra degli indirizzi', 'Apri <b>Safari</b> e incolla il link', 'Segui le istruzioni per installare l\'app']);
      btn.textContent = copied ? 'Copiato ✓' : 'Copia il link';
      return;
    }
    if (installEvt) {
      installEvt.prompt();
      try { await installEvt.userChoice; } catch { /* ignore */ }
      installEvt = null;
      return;
    }
    gateSteps(['Apri il <b>menu</b> del browser (⋮ in alto a destra)', 'Scegli <b>Installa app</b> oppure <b>Aggiungi a schermata Home</b>', 'Conferma, poi apri <b>Turni</b> dalla Home']);
  });
}
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); if (!isIOS) installEvt = e; });
window.addEventListener('appinstalled', () => { if (!isStandalone) gateInstalled(); });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function setStep(n) { $('#welcome').dataset.step = String(n); }
async function startWelcome() {
  setMode('');
  $('#gate').hidden = true;
  const w = $('#welcome');
  w.hidden = false;
  setStep(0);
  $('#welName').value = name || '';
  fillNameList();
  await wait(2000);
  setStep(1);
  setTimeout(() => { try { $('#welName').focus({ preventScroll: true }); } catch { /* ignore */ } }, 650);
}
$('#welForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const inp = $('#welName');
  const v = normName(inp.value);
  if (!v) { inp.classList.remove('bad'); void inp.offsetWidth; inp.classList.add('bad'); return; }
  inp.blur();
  name = v;
  store.set(LS_NAME, name);
  store.set(LS_ONB, true);
  store.set(LS_REVEAL, true); // chi si registra ora vede già il nuovo design
  $('#welHi').textContent = name;
  setStep(2);
  await wait(2300);
  const w = $('#welcome');
  w.classList.add('out');
  await wait(550);
  w.hidden = true;
  w.classList.remove('out');
  enterMain(true);
});

function enterMain(animate) {
  setMode('app');
  if (animate) { document.body.classList.add('enter'); setTimeout(() => document.body.classList.remove('enter'), 900); }
  $('#gate').hidden = true;
  render();
  setTimeout(checkNotif, animate ? 2200 : 700);
}

/* ---------- Aggiornamento dell'app ---------- */
async function siteSig() {
  let h = 2166136261;
  for (const f of ['index.html', 'app.js', 'shifts.js', 'scenes.js', 'style.css', 'sw.js', 'notify/sw.js', 'config.js']) {
    const r = await fetch(f, { cache: 'no-store' });
    if (!r.ok) throw new Error('x');
    const t = await r.text();
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
  }
  return h >>> 0;
}
let sigBase = null, sigBusy = false;
async function checkUpdate() {
  if (sigBusy || !navigator.onLine || document.hidden) return;
  sigBusy = true;
  try {
    const s = await siteSig();
    if (sigBase === null) sigBase = s;
    else if (s !== sigBase) $('#update').hidden = false;
  } catch { /* offline */ }
  sigBusy = false;
}
$('#updBtn').addEventListener('click', async () => {
  try { const keys = await caches.keys(); await Promise.all(keys.map((k) => caches.delete(k))); } catch { /* ignore */ }
  try { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map((r) => r.update())); } catch { /* ignore */ }
  location.reload();
});

/* ---------- Turni pubblicati dal responsabile ---------- */
let pulling = false;
async function pullSchedule(manual) {
  if (!API_URL) { if (manual) toast('Server dei turni non configurato'); return; }
  if (pulling) return;
  pulling = true;
  try {
    const r = await fetch(API_URL + '/api/schedule', { cache: 'no-store' });
    if (!r.ok) throw new Error('server ' + r.status);
    const d = await r.json();
    store.set(LS_RCHK, Date.now());
    const prev = store.get(LS_RVER, null);
    if (prev !== null && String(d.version) === String(prev)) {
      if (manual) toast('I turni sono già aggiornati');
      renderSource();
      return;
    }
    const remote = (Array.isArray(d.docs) ? d.docs : []).filter((x) => x && Array.isArray(x.rows) && Array.isArray(x.cols)).map((x) => ({ ...x, remote: true }));
    store.set(LS_REMOTE, remote);
    store.set(LS_RVER, d.version);
    docs = remote;
    render();
    if (prev !== null) toast('Turni aggiornati dal responsabile');
  } catch {
    if (manual) toast('Server dei turni non raggiungibile: restano gli ultimi ricevuti');
  } finally {
    pulling = false;
  }
}
/* Avviso push "turni pubblicati": registrazione separata (ambito notify/), con la chiave di turni-sync */
const NOTIFY_SCOPE = 'notify/';
async function notifyReg() {
  let reg = await navigator.serviceWorker.getRegistration(NOTIFY_SCOPE);
  if (!reg) reg = await navigator.serviceWorker.register('notify/sw.js', { scope: NOTIFY_SCOPE });
  else reg.update().catch(() => {}); // così arriva anche il nuovo testo della notifica
  if (!reg.active) {
    const w = reg.installing || reg.waiting;
    if (w) await new Promise((res) => { if (w.state === 'activated') return res(); w.addEventListener('statechange', () => { if (w.state === 'activated') res(); }); });
  }
  return reg;
}
async function enableUpdates() {
  if (!API_URL || !('PushManager' in window) || !('Notification' in window) || Notification.permission !== 'granted') return false;
  try {
    const reg = await notifyReg();
    let sub = await reg.pushManager.getSubscription();
    const { key } = await (await fetch(API_URL + '/api/vapid')).json();
    if (!key) return false;
    // iscrizione fatta con una chiave diversa da quella del server: non riceverebbe nulla, va rifatta
    if (sub && sub.options && sub.options.applicationServerKey && bytesB64(sub.options.applicationServerKey) !== key.replace(/=+$/, '')) {
      await fetch(API_URL + '/api/unsub', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
      await sub.unsubscribe();
      sub = null;
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
    // con le chiavi il server può mettere il testo dentro la notifica (arriva anche se il telefono in quel momento non ha rete)
    const keys = (sub.toJSON && sub.toJSON().keys) || null;
    const r = await fetch(API_URL + '/api/sub', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint, keys }) });
    return r.ok;
  } catch { return false; }
}
async function disableUpdates() {
  try {
    const reg = await navigator.serviceWorker.getRegistration(NOTIFY_SCOPE);
    const sub = reg && await reg.pushManager.getSubscription();
    if (sub) { await fetch(API_URL + '/api/unsub', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {}); await sub.unsubscribe(); }
  } catch { /* ignore */ }
}

/* ---------- Richiesta delle notifiche: a ogni apertura, finché non sono consentite ---------- */
const notifOK = !!API_URL && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
let askBusy = false, hiddenAt = 0;
function askShow() {
  const blocked = Notification.permission === 'denied';
  $('#askTitle').textContent = blocked ? 'Le notifiche sono bloccate' : 'Consenti le notifiche';
  $('#askText').textContent = blocked
    ? 'Così non ricevi l\'avviso quando il responsabile pubblica i turni. Per attivarle apri le Impostazioni del telefono, cerca "Turni La Falco" tra le app e consenti le notifiche.'
    : 'Ti avviso subito quando il responsabile pubblica i nuovi turni, e prima di ogni tuo turno. Puoi cambiare idea quando vuoi da "Promemoria".';
  $('#askYes').hidden = blocked;
  $('#askYes').disabled = false;
  $('#askYes').textContent = 'Consenti notifiche';
  $('#askNo').textContent = blocked ? 'Ho capito' : 'Non ora';
  $('#askNotif').hidden = false;
  $('#askNotif .ask-card').focus();
}
function askHide() { $('#askNotif').hidden = true; }
// Già consentite: non mostra niente e tiene viva l'iscrizione. Altrimenti chiede il consenso.
function checkNotif() {
  if (!notifOK || !document.body.classList.contains('mode-app')) return;
  if (Notification.permission === 'granted') {
    askHide();
    if (updOn) enableUpdates();
    return;
  }
  if ($('#askNotif').hidden && $('#sheet').hidden) askShow();
}
$('#askNo').addEventListener('click', askHide);
$('#askNotif').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') return askHide();
  if (e.key !== 'Tab') return;
  const f = [...$('#askNotif').querySelectorAll('button')].filter((b) => !b.hidden);
  const i = f.indexOf(document.activeElement);
  e.preventDefault();
  f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus(); // Tab resta dentro la finestra
});
$('#askYes').addEventListener('click', async () => {
  if (askBusy) return;
  askBusy = true;
  const b = $('#askYes');
  b.disabled = true; b.textContent = 'Attivazione…';
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { if (perm === 'denied') askShow(); else { askHide(); toast('Notifiche non consentite'); } return; }
    updOn = true; store.set(LS_UPD, true);
    const ok = await enableUpdates(); // prima l'avviso dei turni pubblicati, che non dipende dai promemoria
    if (pushOK && !pushOn) { try { await enablePush(); } catch { /* i promemoria si attivano poi da "Promemoria" */ } }
    askHide();
    toast(ok ? 'Notifiche attivate' : 'Notifiche consentite: completo l\'attivazione appena torna la rete');
    render();
  } catch { askHide(); toast('Non sono riuscito ad attivarle: riprova da "Promemoria"'); }
  finally { askBusy = false; }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') { hiddenAt = Date.now(); return; }
  if (Date.now() - hiddenAt > 60 * 1000) checkNotif(); // riaperta dopo essere stata messa da parte
  pullSchedule();
  checkUpdate();
  if (Date.now() - hiddenAt > 60 * 1000) simpleOff = 0; // versione semplice: riaprendo l'app si riparte da oggi
  if (document.body.classList.contains('mode-app')) render(); // passata la mezzanotte, "oggi" e "prossimo turno" si aggiornano
});
setInterval(() => { if (document.visibilityState === 'visible') pullSchedule(); }, 5 * 60 * 1000);
window.addEventListener('online', () => { pullSchedule(); checkUpdate(); if (notifOK && updOn && Notification.permission === 'granted') enableUpdates(); });
setInterval(checkUpdate, 3 * 60 * 1000);
setTimeout(checkUpdate, 2500);

/* ---------- Bentornato: presentazione del nuovo design a chi aveva già l'app ---------- */
const GIFT_MSG = 'Gennaro ci tiene molto ai suoi colleghi, questo è un regalo per voi, spero vi piaccia!';
let typeTimer = 0;
function revealStep(step) { $('#reveal').dataset.step = step; }
const focusReveal = () => setTimeout(() => { try { $('#rvInput').focus({ preventScroll: true }); } catch { /* ignore */ } }, 650);
function startReveal() {
  setMode('');
  $('#gate').hidden = true;
  $('#welcome').hidden = true;
  $('#reveal').hidden = false;
  fillNameList();
  if (name) { $('#rvName').textContent = name; revealStep('ask'); }
  else { revealStep('who'); focusReveal(); }
}
// Il messaggio compare parola per parola, poi il pulsante OK!
function showGift() {
  revealStep('gift');
  const box = $('#rvGift'), ok = $('#rvOk');
  ok.classList.remove('show');
  box.textContent = '';
  clearInterval(typeTimer);
  const words = GIFT_MSG.split(' ');
  if (reduceMotion()) { box.textContent = GIFT_MSG; ok.classList.add('show'); return; }
  let i = 0;
  setTimeout(() => {
    typeTimer = setInterval(() => {
      box.append(el('span', 'w', (i ? ' ' : '') + words[i]));
      if (++i >= words.length) { clearInterval(typeTimer); setTimeout(() => ok.classList.add('show'), 350); }
    }, 110);
  }, 700);
}
$('#rvYes').addEventListener('click', showGift);
$('#rvNo').addEventListener('click', () => { revealStep('who'); $('#rvInput').value = ''; focusReveal(); });
$('#rvForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const inp = $('#rvInput');
  const v = normName(inp.value);
  if (!v) { inp.classList.remove('bad'); void inp.offsetWidth; inp.classList.add('bad'); return; }
  inp.blur();
  name = v;
  store.set(LS_NAME, name);
  showGift();
});
// OK!: un cerchio rosso parte dal pulsante e riempie lo schermo, poi si apre sul nuovo design con i coriandoli
$('#rvOk').addEventListener('click', async (e) => {
  store.set(LS_REVEAL, true);
  store.set(LS_ONB, true);
  const b = $('#burst'), r = e.currentTarget.getBoundingClientRect();
  b.style.setProperty('--x', Math.round(r.left + r.width / 2) + 'px');
  b.style.setProperty('--y', Math.round(r.top + r.height / 2) + 'px');
  b.hidden = false;
  b.className = 'burst grow';
  await wait(reduceMotion() ? 50 : 1000);
  $('#reveal').hidden = true;
  enterMain(true);
  window.scrollTo(0, 0);
  b.className = 'burst grow open';
  confetti();
  await wait(reduceMotion() ? 50 : 900);
  b.hidden = true;
  b.className = 'burst';
});
function confetti() {
  if (reduceMotion()) return;
  const box = el('div', 'confetti');
  box.setAttribute('aria-hidden', 'true');
  const colors = ['#b23338', '#d2474d', '#ffb3b6', '#121214', '#fbbf24', '#4ade80', '#ffffff'];
  for (let i = 0; i < 70; i++) {
    const c = el('i');
    c.style.setProperty('--l', (Math.random() * 100).toFixed(1) + '%');
    c.style.setProperty('--c', colors[i % colors.length]);
    c.style.setProperty('--d', (Math.random() * 0.6).toFixed(2) + 's');
    c.style.setProperty('--t', (1.8 + Math.random() * 1.4).toFixed(2) + 's');
    c.style.setProperty('--r', Math.round(Math.random() * 720 - 360) + 'deg');
    c.style.setProperty('--dx', Math.round(Math.random() * 120 - 60) + 'px');
    box.append(c);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 3800);
}

function boot() {
  const onboarded = store.get(LS_ONB, false) || !!store.get(LS_NAME, '');
  if (!isStandalone) { showGate(); return; }
  if (!onboarded) { startWelcome(); return; }
  if (!store.get(LS_REVEAL, false)) { startReveal(); return; }
  enterMain(false);
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}

pullSchedule();
boot();
