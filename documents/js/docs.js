/**
 * Shared helpers for the Office Documents Trello Power-Up.
 *
 * Everything is one flat list of short records:
 *   document:  ["d", id, title, url, description, "YYYY-MM-DD", sign(0|1), category, version, "YYYY-MM-DD updated"]
 *   signature: ["s", docId, memberId, memberName, typedName, "YYYY-MM-DDTHH:MMZ", version]
 * A signature counts only for the document version it was made on. The admin can mark a document
 * "updated", which bumps its version so everyone signs again; older signatures are kept as history
 * (visible to the admin only). Staff cannot remove or redo a signature for the current version.
 *
 * Storage (Trello pluginData is capped at 4096 characters per scope):
 *   1. Board shared pluginData, key "d": {a:[adminId,adminName], n:<storage card count>, r:[records...]}
 *      Small offices never need anything else.
 *   2. Overflow goes onto cards named "Document Storage N – Don't delete (document data)",
 *      key "d" on each card (shared), an array of records. Cards are found by name with
 *      t.cards('id','name','closed'); closed (archived) cards are ignored. Power-Ups cannot see
 *      cards in an ARCHIVED list, so keep storage cards in an open (collapsed is fine) list.
 *
 * Signatures are hidden from staff in the interface, but this is NOT encryption:
 * Trello pluginData can technically be read by board members through the Trello API.
 */
(function (root) {
  var KEY = 'd';
  var LIMIT = 4096;          // Trello's per-scope cap
  var CAP = 3900;            // what we allow ourselves (leaves headroom for Trello's wrapper)
  var WARN_RATIO = 0.8;
  var ASSET_VERSION = '20261128a';
  var MAX = { title: 80, url: 300, desc: 140, name: 60 };
  var CATEGORIES = ['Policies', 'Memos', 'Forms', 'Other'];
  var ADMIN_NAME_RE = /callahan/i;
  var STORAGE_NAME_RE = /^\s*document storage(?:\s+(\d+))?(?:\b.*)?$/i;

  function baseUrl() {
    if (typeof window === 'undefined' || !window.location) return '';
    var path = (window.location.pathname || '/').split('?')[0].replace(/[^\/]*\.html$/i, '');
    if (path.charAt(path.length - 1) !== '/') path += '/';
    return window.location.origin + path;
  }
  function assetUrl(rel) { return baseUrl() + rel + '?v=' + ASSET_VERSION; }
  function iconUrl() { return { dark: assetUrl('img/icon-dark.svg'), light: assetUrl('img/icon-light.svg') }; }

  /* ---------- storage card names ---------- */
  function storageCardTitle(n) { return "Document Storage " + Number(n) + " – Don't delete (document data)"; }
  function isStorageCardName(name) { return STORAGE_NAME_RE.test(String(name || '')); }
  function parseStorageIndex(name) {
    var m = String(name || '').trim().match(STORAGE_NAME_RE);
    if (!m) return 0;
    return m[1] ? Number(m[1]) : 1;
  }

  /* ---------- records ---------- */
  function newId() {
    var s = '';
    while (s.length < 6) s += Math.floor(Math.random() * 36).toString(36);
    return s;
  }
  function today() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function nowStamp() { return new Date().toISOString().slice(0, 16) + 'Z'; }

  function cleanRecord(r) {
    if (!Array.isArray(r)) return null;
    function str(v) { return String(v == null ? '' : v); }
    if (r[0] === 'd' && r.length >= 7) {
      var d = r.slice(0, 10).map(function (v, i) { return i === 6 ? (Number(v) ? 1 : 0) : str(v); });
      while (d.length < 10) d.push('');
      if (!d[8]) d[8] = '1';
      return d;
    }
    if (r[0] === 's' && r.length >= 6) {
      var g = r.slice(0, 7).map(str);
      while (g.length < 7) g.push('');
      if (!g[6]) g[6] = '1';
      return g;
    }
    return null;
  }
  function cleanRecords(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (r) { var c = cleanRecord(r); if (c) out.push(c); });
    return out;
  }
  function docRecord(o) {
    return ['d', o.id || newId(), o.title, o.url, o.desc || '', o.date || today(), o.sign ? 1 : 0, o.cat || '', String(o.version || 1), o.updated || ''];
  }
  function sigRecord(docId, member, typed, version) {
    return ['s', docId, member.id, member.name, typed, nowStamp(), String(version || 1)];
  }
  function docsOf(records) {
    var out = [];
    records.forEach(function (r, i) {
      if (r[0] !== 'd') return;
      out.push({ id: r[1], title: r[2], url: r[3], desc: r[4], date: r[5], sign: r[6] === 1, cat: r[7] || '', version: Number(r[8]) || 1, updated: r[9] || '', order: i });
    });
    out.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : b.order - a.order; });
    return out;
  }
  /** All signatures for a document (every version). Pass version to filter to one. */
  function sigsOf(records, docId, version) {
    var out = [];
    records.forEach(function (r) {
      if (r[0] !== 's' || r[1] !== docId) return;
      var v = Number(r[6]) || 1;
      if (version && v !== Number(version)) return;
      out.push({ docId: r[1], memberId: r[2], memberName: r[3], typed: r[4], at: r[5], version: v });
    });
    return out;
  }
  function findSig(records, docId, memberId, version) {
    var s = sigsOf(records, docId, version);
    for (var i = 0; i < s.length; i++) if (s[i].memberId === memberId) return s[i];
    return null;
  }
  function hasSigs(records, docId) { return sigsOf(records, docId).length > 0; }

  /* ---------- validation ---------- */
  function normalizeUrl(raw) {
    var u = String(raw || '').trim();
    if (!u) return { error: 'Please paste a link.' };
    if (/^http:\/\//i.test(u)) return { error: 'The link must start with https://' };
    if (!/^https:\/\//i.test(u)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return { error: 'The link must start with https://' };
      u = 'https://' + u;
    }
    if (!/^https:\/\/[^\s\/]+\.[^\s\/]+/i.test(u)) return { error: 'That does not look like a web link.' };
    if (/\s/.test(u)) return { error: 'The link cannot contain spaces.' };
    if (u.length > MAX.url) return { error: 'That link is too long.' };
    return { url: u };
  }

  /* ---------- admin ---------- */
  function nameMatchesAdmin(me) {
    return !!me && (ADMIN_NAME_RE.test(me.name || '') || ADMIN_NAME_RE.test(me.username || ''));
  }
  function isAdmin(me, adminPair) {
    if (!me || !me.id) return false;
    if (nameMatchesAdmin(me)) return true;
    return !!(adminPair && adminPair[0] && adminPair[0] === me.id);
  }

  /* ---------- sizes / planning ---------- */
  function boardSize(a, n, recs) { return JSON.stringify({ d: { a: a || [], n: n || 0, r: recs } }).length; }
  function cardSize(recs) { return JSON.stringify({ d: recs }).length; }

  /** Spread records over the board slot, then each storage card, in order. */
  function plan(records, admin, cardIds) {
    var remaining = records.slice();
    var board = [];
    var n = cardIds.length;
    while (remaining.length && boardSize(admin, n, board.concat([remaining[0]])) <= CAP) board.push(remaining.shift());
    var chunks = [];
    for (var i = 0; i < cardIds.length; i++) {
      var list = [];
      while (remaining.length && cardSize(list.concat([remaining[0]])) <= CAP) list.push(remaining.shift());
      chunks.push({ id: cardIds[i], list: list, size: cardSize(list) });
    }
    var tooBig = remaining.length && boardSize(admin, n, [remaining[0]]) > CAP && cardSize([remaining[0]]) > CAP;
    return {
      board: board, boardSize: boardSize(admin, n, board), chunks: chunks,
      leftover: remaining, needCard: remaining.length > 0, tooBig: !!tooBig,
      nextTitle: storageCardTitle(cardIds.length + 1)
    };
  }

  function capacity(state) {
    var p = plan(state.records, state.admin, state.cardIds);
    var used = p.boardSize + p.chunks.reduce(function (s, c) { return s + c.size; }, 0);
    var limit = CAP * (1 + state.cardIds.length);
    var ratio = used / limit;
    var avg = state.records.length ? Math.max(60, Math.round(used / state.records.length)) : 120;
    return {
      used: used, limit: limit, ratio: ratio, percent: Math.min(100, Math.round(ratio * 100)),
      warn: ratio >= WARN_RATIO, full: p.needCard, cardCount: state.cardIds.length,
      roomFor: Math.max(0, Math.floor((limit - used) / avg)), nextTitle: p.nextTitle
    };
  }

  /* ---------- Trello access ---------- */
  function listVisibleCards(t) {
    if (!t || typeof t.cards !== 'function') return Promise.resolve([]);
    return Promise.resolve().then(function () { return t.cards('id', 'name', 'closed'); })
      .then(function (c) { return Array.isArray(c) ? c : []; })
      .catch(function () { return []; });
  }
  function listBoardLists(t) {
    if (!t || typeof t.lists !== 'function') return Promise.resolve([]);
    return Promise.resolve().then(function () { return t.lists('id', 'name'); })
      .then(function (l) { return Array.isArray(l) ? l : []; }).catch(function () { return []; });
  }
  function tryCreateCard(t, n) {
    if (!t || typeof t.createCard !== 'function') return Promise.resolve(null);
    return listBoardLists(t).then(function (lists) {
      if (!lists.length || !lists[0].id) return null;
      return Promise.resolve(t.createCard({ name: storageCardTitle(n), idList: lists[0].id })).then(function (c) {
        return c && c.id ? String(c.id) : null;
      });
    }).catch(function () { return null; });
  }

  function whoAmI(t) {
    return Promise.resolve().then(function () { return t.member('id', 'fullName', 'username'); })
      .then(function (m) {
        if (!m || !m.id) return null;
        return { id: String(m.id), name: String(m.fullName || m.username || ''), username: String(m.username || '') };
      }).catch(function () { return null; });
  }
  function boardMembers(t) {
    return Promise.resolve().then(function () { return t.board('members'); })
      .then(function (b) {
        return ((b && b.members) || []).map(function (m) { return { id: String(m.id), name: String(m.fullName || m.username || '') }; });
      }).catch(function () { return []; });
  }

  function load(t) {
    return Promise.resolve().then(function () { return t.get('board', 'shared', KEY); }).then(function (raw) {
      if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (e) { raw = null; } }
      raw = raw && typeof raw === 'object' ? raw : {};
      var admin = Array.isArray(raw.a) && raw.a[0] ? [String(raw.a[0]), String(raw.a[1] || '')] : null;
      var expected = Number(raw.n) || 0;
      return listVisibleCards(t).then(function (cards) {
        var found = cards.filter(function (c) { return c && c.id && !c.closed && isStorageCardName(c.name); })
          .sort(function (a, b) { return parseStorageIndex(a.name) - parseStorageIndex(b.name); });
        var ids = found.map(function (c) { return String(c.id); });
        var seen = {};
        ids = ids.filter(function (id) { if (seen[id]) return false; seen[id] = true; return true; });
        return Promise.all(ids.map(function (id) {
          return Promise.resolve().then(function () { return t.get(id, 'shared', KEY); }).then(function (v) {
            if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = []; } }
            return cleanRecords(v);
          }).catch(function () { return null; });
        })).then(function (groups) {
          var records = cleanRecords(raw.r);
          var unreadable = 0;
          groups.forEach(function (g) { if (g === null) unreadable++; else records = records.concat(g); });
          var state = {
            records: records, admin: admin, cardIds: ids, cardNames: found.map(function (c) { return c.name; }),
            missing: Math.max(0, expected - ids.length) + unreadable,
            expected: expected,
            raw: { board: JSON.stringify(raw.r || []), cards: groups.map(function (g) { return g === null ? null : JSON.stringify(g); }) }
          };
          return state;
        });
      });
    });
  }

  function errorWith(code, message) { var e = new Error(message); e.code = code; return Promise.reject(e); }

  function needCardMessage(title) {
    return 'Storage is full. In Trello, add a card named “' + title + '” to an open list (a collapsed list is fine, but never an archived one), then reopen Office Documents and try again.';
  }
  function missingMessage() {
    return 'A Document Storage card cannot be found, so saving is turned off to protect your documents. Open the board menu > Archived items, send the “Document Storage” card (or its list) back to the board, keep it in an open list (collapse the list if you like), then reopen Office Documents.';
  }

  /** Write the records out. Changes only chunks that differ. */
  function save(t, state, records, admin) {
    if (state.missing > 0) return errorWith('missing', missingMessage());
    admin = admin === undefined ? state.admin : admin;
    return Promise.resolve().then(function () {
      var p = plan(records, admin, state.cardIds);
      if (p.tooBig) return errorWith('toobig', 'That entry is too large to save. Shorten the title, description, or link.');
      if (!p.needCard) return p;
      var next = state.cardIds.length + 1;
      return tryCreateCard(t, next).then(function (id) {
        if (!id) return errorWith('needcard', needCardMessage(storageCardTitle(next)));
        state.cardIds.push(id);
        state.cardNames.push(storageCardTitle(next));
        state.raw.cards.push('[]');
        return save(t, state, records, admin).then(function () { return null; });
      });
    }).then(function (p) {
      if (!p) return state;
      var writes = [];
      p.chunks.forEach(function (c, i) {
        var s = JSON.stringify(c.list);
        if (state.raw.cards[i] !== s) writes.push(function () { return t.set(c.id, 'shared', KEY, c.list); });
      });
      return Promise.all(writes.map(function (w) { return w(); })).then(function () {
        return t.set('board', 'shared', KEY, { a: admin || [], n: state.cardIds.length, r: p.board });
      }).then(function () {
        state.records = records.slice(); state.admin = admin || null;
        state.raw = { board: JSON.stringify(p.board), cards: p.chunks.map(function (c) { return JSON.stringify(c.list); }) };
        return state;
      });
    });
  }

  /** Re-read fresh data, apply fn(records) -> new records (or null to cancel), save. */
  function mutate(t, fn, adminFn) {
    return load(t).then(function (fresh) {
      var out = fn(fresh.records.slice(), fresh);
      if (out === null) return fresh;
      return save(t, fresh, out, adminFn ? adminFn(fresh) : undefined);
    });
  }


  root.Docs = {
    KEY: KEY, LIMIT: LIMIT, CAP: CAP, ASSET_VERSION: ASSET_VERSION, MAX: MAX, CATEGORIES: CATEGORIES,
    iconUrl: iconUrl, storageCardTitle: storageCardTitle, isStorageCardName: isStorageCardName,
    parseStorageIndex: parseStorageIndex, newId: newId, today: today,
    docRecord: docRecord, sigRecord: sigRecord, docsOf: docsOf, sigsOf: sigsOf, findSig: findSig, hasSigs: hasSigs,
    cleanRecords: cleanRecords, normalizeUrl: normalizeUrl,
    nameMatchesAdmin: nameMatchesAdmin, isAdmin: isAdmin,
    plan: plan, capacity: capacity, load: load, save: save, mutate: mutate,
    whoAmI: whoAmI, boardMembers: boardMembers,
    needCardMessage: needCardMessage, missingMessage: missingMessage
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Docs;
})(typeof globalThis !== 'undefined' ? globalThis : this);
