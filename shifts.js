/* Lettura dei turni pubblicati dal responsabile.
   Ogni postazione arriva come documento { id, title, uiTitle, category, month, cols:[{start,end,label}], rows:[{date, cells}] }:
   una riga per giorno, una cella per colonna oraria con il nome di chi lavora.

   Note riconosciute accanto ai nomi (le stesse dell'app del responsabile):
   - "NOME 18"  -> il turno finisce alle 18:00 (se segue un altro turno della stessa persona, i due si uniscono)
   - "18 NOME"  -> il turno inizia alle 18:00
   Le parole riservate (NO = turno scoperto, FERIE, MALATTIA, ...) non sono persone. */
(function (root) {
  'use strict';

  // Stesso elenco dell'app del responsabile
  var RESERVED = ['NO', 'RIPOSO', 'FERIE', 'MALATTIA', 'PERMESSO', 'FESTIVO', 'RECUPERO', 'LIBERO', 'ASSENTE', 'SCOPERTO', 'CHIUSO', 'ROL', 'CONGEDO', 'INFORTUNIO'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function normTok(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
  function nameTokens(name) {
    return String(name).split(/\s+/).map(normTok).filter(Boolean);
  }
  function cellTokens(cell) {
    return String(cell).split(/\s+/).filter(Boolean).map(function (r) { return { raw: r, n: normTok(r) }; })
      .filter(function (t) { return t.n; });
  }
  // "18" -> 1080 (minuti), "17.30" / "17:30" -> 1050; non è un orario -> null
  function hourMin(raw) {
    var m = /^(\d{1,2})(?:[:.](\d{2}))?$/.exec(raw);
    if (!m) return null;
    var h = +m[1], mi = m[2] ? +m[2] : 0;
    if (h > 24 || mi > 59) return null;
    return h * 60 + mi;
  }
  function toMin(t) { var p = t.split(':'); return +p[0] * 60 + +p[1]; }
  function fmt(min) { min = ((min % 1440) + 1440) % 1440; return pad(Math.floor(min / 60)) + ':' + pad(min % 60); }
  // nome della persona in una cella, senza orari; '' se la cella contiene solo una parola riservata
  function personOf(toks) {
    var words = toks.filter(function (t) { return hourMin(t.raw) === null; });
    if (!words.length) return '';
    if (RESERVED.indexOf(words.map(function (t) { return t.n; }).join(' ')) !== -1) return '';
    if (words.length === 1 && RESERVED.indexOf(words[0].n) !== -1) return '';
    return words.map(function (t) { return t.raw; }).join(' ');
  }

  // Due parti di nome sono "uguali" se identiche, oppure se una è l'altra accorciata
  // (es. GIANNELAVIGN / GIANNELAVIG per GIANNELAVIGNA). Servono almeno 10 lettere e al massimo 3 tagliate,
  // così nomi diversi (e iniziali come "V.") non si confondono.
  function tokEq(a, b) {
    if (a === b) return true;
    var s = a.length <= b.length ? a : b, l = s === a ? b : a;
    return s.length >= 10 && l.length - s.length <= 3 && l.indexOf(s) === 0;
  }

  function locate(toks, want) {
    if (!want.length) return -1;
    for (var s = 0; s + want.length <= toks.length; s++) {
      var ok = true;
      for (var k = 0; k < want.length; k++) if (!tokEq(toks[s + k].n, want[k])) { ok = false; break; }
      // "GIANNELAVIG V." è un'altra persona rispetto a "GIANNELAVIGNA": una lettera sola dopo il nome è l'iniziale di un altro cognome
      var nx = toks[s + want.length];
      if (ok && nx && /^[A-Z]$/.test(nx.n) && !/^[A-Z]$/.test(want[want.length - 1])) ok = false;
      if (ok) return s;
    }
    return -1;
  }

  function unique(a) { return a.filter(function (x, k) { return a.indexOf(x) === k; }); }

  // Chi inizia nel momento in cui finisce un turno (endMin > 1440 = finisce il giorno dopo)
  function successors(doc, ri, endMin, mine) {
    var row = doc.rows[ri], target = endMin, rel = row, out = [];
    if (target > 1440) {
      rel = doc.rows[ri + 1];
      target -= 1440;
      if (rel && Date.parse(rel.date) - Date.parse(row.date) !== 86400000) rel = null;
    }
    if (!rel) return out;
    rel.cells.forEach(function (o, j) {
      if (!o || !doc.cols[j] || (rel === row && mine[j])) return;
      var toks = cellTokens(o);
      var lead = toks.length ? hourMin(toks[0].raw) : null;
      var st = lead !== null ? lead : toMin(doc.cols[j].start);
      if (st % 1440 !== target % 1440) return;
      var t = personOf(toks);
      if (t && out.indexOf(t) === -1) out.push(t);
    });
    return out;
  }

  // Segmento di una cella: orario di inizio/fine (dalle note, altrimenti dalla colonna)
  function mkSeg(doc, i, so, eo, name) {
    var col = doc.cols[i], cs = toMin(col.start), ce = toMin(col.end);
    var s = so !== null ? so : cs, e = eo !== null ? eo : ce;
    if (e <= s) e += 1440;
    return { i: i, s: s, e: e, so: so, eo: eo, name: name, base: (ce <= cs ? ce + 1440 : ce) - cs };
  }

  // Unisce i segmenti consecutivi/sovrapposti della stessa persona e costruisce i turni
  function buildEntries(doc, ri, segs) {
    var row = doc.rows[ri], out = [], merged = [];
    segs.sort(function (a, b) { return a.s - b.s; });
    segs.forEach(function (sg) {
      var cur = merged[merged.length - 1];
      if (cur && sg.s <= cur.e) { cur.e = Math.max(cur.e, sg.e); cur.parts.push(sg); }
      else merged.push({ s: sg.s, e: sg.e, parts: [sg] });
    });
    merged.forEach(function (m) {
      var mine = {}, notes = [], baseDur = 0;
      m.parts.forEach(function (p) {
        var col = doc.cols[p.i];
        mine[p.i] = true;
        // se l'orario è scritto per intero ("06 NOME 18") è già visibile: nota solo per le estensioni
        if (!(p.so !== null && p.eo !== null)) {
          if (p.so !== null && p.so !== toMin(col.start)) notes.push('Dalle ' + fmt(p.so));
          if (p.eo !== null && p.eo !== toMin(col.end)) notes.push('Fino alle ' + fmt(p.eo));
        }
        baseDur = Math.max(baseDur, p.base);
      });
      var fc = doc.cols[m.parts[0].i];
      out.push({
        date: row.date, name: m.parts[0].name || '',
        start: fmt(m.s), end: fmt(m.e),
        kindStart: fc.start, label: fc.label || '', zone: doc.title,
        note: unique(notes).join(' · '),
        extended: (m.e - m.s) > baseDur,
        mates: successors(doc, ri, m.e, mine)
      });
    });
    return out;
  }

  // Turni della persona "name" in un documento
  function findShifts(doc, name) {
    var want = nameTokens(name), out = [];
    if (!want.length || !doc || !Array.isArray(doc.rows)) return out;
    var wantRev = want.slice().reverse();
    doc.rows.forEach(function (row, ri) {
      var segs = [];
      row.cells.forEach(function (cell, i) {
        if (!cell || !doc.cols[i]) return;
        var toks = cellTokens(cell);
        var s = locate(toks, want);
        if (s < 0 && want.length > 1) s = locate(toks, wantRev);
        if (s < 0) return;
        var before = toks[s - 1], after = toks[s + want.length];
        segs.push(mkSeg(doc, i,
          before ? hourMin(before.raw) : null,
          after ? hourMin(after.raw) : null, String(name).trim()));
      });
      if (segs.length) out = out.concat(buildEntries(doc, ri, segs));
    });
    return out;
  }

  // Tutti gli operatori in turno in un certo giorno (YYYY-MM-DD), con orario
  function dayOperators(doc, date) {
    var ri = -1, byKey = {}, order = [], out = [];
    doc.rows.forEach(function (r, k) { if (r.date === date) ri = k; });
    if (ri < 0) return out;
    doc.rows[ri].cells.forEach(function (cell, i) {
      if (!cell || !doc.cols[i]) return;
      var toks = cellTokens(cell), so = null, eo = null;
      if (toks.length && hourMin(toks[0].raw) !== null) { so = hourMin(toks[0].raw); toks = toks.slice(1); }
      if (toks.length && hourMin(toks[toks.length - 1].raw) !== null) { eo = hourMin(toks[toks.length - 1].raw); toks = toks.slice(0, -1); }
      var person = personOf(toks);
      if (!person) return; // cella vuota, solo orari o parola riservata (es. NO)
      var key = toks.map(function (t) { return t.n; }).join('');
      if (!byKey[key]) { byKey[key] = []; order.push(key); }
      byKey[key].push(mkSeg(doc, i, so, eo, person));
    });
    order.forEach(function (k) { out = out.concat(buildEntries(doc, ri, byKey[k])); });
    out.sort(function (a, b) { return toMin(a.start) - toMin(b.start); });
    return out;
  }

  // Tutti i nomi presenti nei documenti (per suggerire il proprio nome)
  function allNames(docs) {
    var seen = {}, out = [];
    (docs || []).forEach(function (doc) {
      (doc.rows || []).forEach(function (row) {
        (row.cells || []).forEach(function (cell) {
          if (!cell) return;
          var p = personOf(cellTokens(cell));
          var k = normTok(p);
          if (p && !seen[k]) { seen[k] = true; out.push(p.toUpperCase()); }
        });
      });
    });
    return out.sort(function (a, b) { return a.localeCompare(b, 'it'); });
  }

  // "full" è il nome scritto nei turni, "name" è il nome cercato dall'utente
  function nameMatches(full, name) {
    var want = nameTokens(name), toks = cellTokens(String(full));
    if (!want.length || toks.length !== want.length) return false;
    return locate(toks, want) === 0 || locate(toks, want.slice().reverse()) === 0;
  }

  var api = { findShifts: findShifts, dayOperators: dayOperators, nameMatches: nameMatches, allNames: allNames };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TurniShifts = api;
})(typeof self !== 'undefined' ? self : this);
