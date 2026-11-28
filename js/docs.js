/**
 * Shared helpers for the Office Hub Trello Power-Up.
 *
 * Everything is one flat list of short records:
 *   document:  ["d", id, title, url, description, "YYYY-MM-DD", sign(0|1), category, version, "YYYY-MM-DD updated"]
 *   signature: ["s", docId, memberId, memberName, typedName, "YYYY-MM-DDTHH:MMZ", version]
 *   bulletin / announcement:
 *     ["b", id, title, message, url, "YYYY-MM-DD", active(0|1), authorId, authorName, created("YYYY-MM-DDTHH:MMZ")]
 *     Older records without author/created still load; created falls back to the date.
 *     The stable id + created stamp are what a later Signal sender can key off.
 *   ack:        ["k", bulletinId, memberId, memberName, "YYYY-MM-DDTHH:MMZ"]
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
 * Signatures and bulletin acknowledgements are hidden from staff in the interface, but this is NOT encryption:
 * Trello pluginData can technically be read by board members through the Trello API.
 */
(function (root) {
  var KEY = 'd';
  var LIMIT = 4096;          // Trello's per-scope cap
  var CAP = 3900;            // what we allow ourselves (leaves headroom for Trello's wrapper)
  var WARN_RATIO = 0.8;
  var ASSET_VERSION = '20261128f';
  var MAX = { title: 80, url: 300, desc: 140, name: 60, message: 400 };
  var MAX_FULL_ANNOUNCEMENTS = 12; // newest + all still-active keep a full message body
  var TRIMMED_MESSAGE = 80;        // older ended announcements are shortened to this
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
    if (r[0] === 'b' && r.length >= 6) {
      var b = ['b', str(r[1]), str(r[2]), str(r[3]), str(r[4]), str(r[5]), Number(r[6]) ? 1 : (r[6] === 0 || r[6] === '0' ? 0 : 1)];
      b.push(str(r[7] || ''));
      b.push(str(r[8] || ''));
      var created = str(r[9] || '');
      if (!created && b[5]) created = b[5] + 'T00:00Z';
      b.push(created);
      return b;
    }
    if (r[0] === 'k' && r.length >= 5) return r.slice(0, 5).map(str);
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

  /**
   * Convert a Google Drive / Docs / Sheets / Slides link to an embeddable
   * /preview URL. Returns null for anything else (open in a new tab).
   */
  function previewUrl(raw) {
    var u = String(raw || '').trim();
    if (!/^https:\/\//i.test(u)) return null;
    var rk = '';
    var rm = u.match(/[?&]resourcekey=([^&#]+)/i);
    if (rm) rk = '?resourcekey=' + rm[1];
    var m = u.match(/^https:\/\/(?:www\.)?docs\.google\.com\/(document|spreadsheets|presentation)(?:\/u\/\d+)?\/d\/([a-zA-Z0-9_-]+)/i);
    if (m) return 'https://docs.google.com/' + m[1].toLowerCase() + '/d/' + m[2] + '/preview' + rk;
    m = u.match(/^https:\/\/(?:www\.)?drive\.google\.com\/(?:drive\/u\/\d+\/)?file\/d\/([a-zA-Z0-9_-]+)/i);
    if (m) return 'https://drive.google.com/file/d/' + m[1] + '/preview' + rk;
    m = u.match(/^https:\/\/(?:www\.)?(?:drive|docs)\.google\.com\/(?:open|uc)\?(?:[^#]*&)?id=([a-zA-Z0-9_-]+)/i);
    if (m) return 'https://drive.google.com/file/d/' + m[1] + '/preview' + rk;
    return null;
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
    if (state && state.google) return cloudCapacity(state);
    var p = plan(state.records, state.admin, state.cardIds || []);
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

  function loadTrello(t) {
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
    return 'Storage is full. In Trello, add a card named “' + title + '” to an open list (a collapsed list is fine, but never an archived one), then reopen Office Hub and try again.';
  }
  function missingMessage() {
    return 'A Document Storage card cannot be found, so saving is turned off to protect your documents. Open the board menu > Archived items, send the “Document Storage” card (or its list) back to the board, keep it in an open list (collapse the list if you like), then reopen Office Hub.';
  }

  /** Write the records out. Changes only chunks that differ. Trello path only. */
  function saveTrello(t, state, records, admin) {
    if (state.missing > 0) return errorWith('missing', missingMessage());
    admin = admin === undefined ? state.admin : admin;
    records = trimAnnouncementHistory(records);
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
        return saveTrello(t, state, records, admin).then(function () { return null; });
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

  function bulletinRecord(o) {
    return [
      'b', o.id || newId(), o.title, o.message || '', o.url || '',
      o.date || today(), o.active === 0 ? 0 : 1,
      o.authorId || '', o.authorName || '', o.created || nowStamp()
    ];
  }
  function ackRecord(bulletinId, member) {
    return ['k', bulletinId, member.id, member.name, nowStamp()];
  }
  function createdOfBulletin(r) {
    return (r && r[9]) || (r && r[5] ? r[5] + 'T00:00Z' : '');
  }
  function bulletinsOf(records, activeOnly) {
    var out = [];
    records.forEach(function (r, i) {
      if (r[0] !== 'b') return;
      var row = {
        id: r[1], title: r[2], message: r[3], url: r[4], date: r[5],
        active: r[6] === 1, authorId: r[7] || '', authorName: r[8] || '',
        created: createdOfBulletin(r), order: i
      };
      if (activeOnly && !row.active) return;
      out.push(row);
    });
    out.sort(function (a, b) {
      if (a.created < b.created) return 1;
      if (a.created > b.created) return -1;
      return b.order - a.order;
    });
    return out;
  }
  /**
   * Keep full message bodies on every active announcement and on the newest
   * ones, up to MAX_FULL_ANNOUNCEMENTS. Older ended announcements get their
   * message shortened so history (id, title, author, created) still fits.
   */
  function trimAnnouncementHistory(records) {
    var list = [];
    records.forEach(function (r, i) {
      if (r[0] === 'b') list.push({ i: i, created: createdOfBulletin(r), active: r[6] === 1 || r[6] === '1', order: i });
    });
    list.sort(function (a, b) {
      if (a.created < b.created) return 1;
      if (a.created > b.created) return -1;
      return b.order - a.order;
    });
    var kept = 0;
    list.forEach(function (item) {
      if (item.active || kept < MAX_FULL_ANNOUNCEMENTS) {
        kept += 1;
        return;
      }
      var r = records[item.i];
      var msg = String(r[3] || '');
      if (msg.length > TRIMMED_MESSAGE) {
        var cut = msg.slice(0, TRIMMED_MESSAGE);
        cut = cut.replace(/\s+\S*$/, '').replace(/\s+$/, '');
        r[3] = cut + '…';
      }
    });
    return records;
  }
  function acksOf(records, bulletinId) {
    var out = [];
    records.forEach(function (r) {
      if (r[0] === 'k' && r[1] === bulletinId) out.push({ bulletinId: r[1], memberId: r[2], memberName: r[3], at: r[4] });
    });
    return out;
  }
  function findAck(records, bulletinId, memberId) {
    var list = acksOf(records, bulletinId);
    for (var i = 0; i < list.length; i++) if (list[i].memberId === memberId) return list[i];
    return null;
  }
  function unackedBulletins(records, memberId) {
    return bulletinsOf(records, true).filter(function (b) {
      return !memberId || !findAck(records, b.id, memberId);
    });
  }
  /** Remove an announcement and all of its acknowledgements. */
  function removeAnnouncement(records, id) {
    return (records || []).filter(function (r) {
      return !((r[0] === 'b' && r[1] === id) || (r[0] === 'k' && r[1] === id));
    });
  }
  function requestedSection(search) {
    try {
      var q = String(search == null && typeof location !== 'undefined' ? location.search : search || '');
      var m = q.replace(/^\?/, '').split('&');
      for (var i = 0; i < m.length; i++) {
        var parts = m[i].split('=');
        if (decodeURIComponent(parts[0] || '') === 'section') {
          var v = decodeURIComponent(parts[1] || '');
          if (v === 'announcements' || v === 'docs' || v === 'settings') return v;
        }
      }
    } catch (e) {}
    return 'announcements';
  }

  /* ---------- board alerts (connector) ---------- */
  var SEEN_PREFIX = 'office-documents-seen:';
  var ALERT_PREFIX = 'office-documents-alerted:';

  function boardIdOf(t) {
    var ctx = t && typeof t.getContext === 'function' ? t.getContext() : null;
    if (ctx && ctx.board) return String(ctx.board);
    return 'board';
  }
  function storageKey(prefix, boardId, memberId) {
    return prefix + String(boardId || 'board') + ':' + String(memberId || 'unknown');
  }
  function readStore(storage, key, fallback) {
    try {
      if (typeof storage === 'undefined' || !storage) return fallback;
      var raw = storage.getItem(key);
      if (raw == null) return fallback;
      return raw;
    } catch (e) { return fallback; }
  }
  function writeStore(storage, key, val) {
    try { if (typeof storage !== 'undefined' && storage) storage.setItem(key, val); } catch (e) {}
  }
  /** Returns an array of previously seen document ids, or null if this member has never been recorded. */
  function readSeen(boardId, memberId) {
    var raw = readStore(typeof localStorage !== 'undefined' ? localStorage : undefined, storageKey(SEEN_PREFIX, boardId, memberId), null);
    if (raw == null) return null;
    try {
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.map(String) : [];
    } catch (e) { return []; }
  }
  function writeSeen(boardId, memberId, ids) {
    writeStore(typeof localStorage !== 'undefined' ? localStorage : undefined, storageKey(SEEN_PREFIX, boardId, memberId), JSON.stringify(ids || []));
  }
  function wasAlerted(boardId, memberId) {
    return !!readStore(typeof sessionStorage !== 'undefined' ? sessionStorage : undefined, storageKey(ALERT_PREFIX, boardId, memberId), null);
  }
  function markAlerted(boardId, memberId) {
    writeStore(typeof sessionStorage !== 'undefined' ? sessionStorage : undefined, storageKey(ALERT_PREFIX, boardId, memberId), '1');
  }
  function pendingDocs(records, memberId) {
    if (!memberId) return [];
    return docsOf(records).filter(function (d) {
      return d.sign && !findSig(records, d.id, memberId, d.version);
    });
  }
  /**
   * Decide what Trello board alert (if any) to show this member for documents.
   * seenIds: array of doc ids already known, or null on first visit (existing docs are not "new").
   * Priority: a new doc that needs their signature; else a new doc; else older unsigned required docs.
   */
  function alertForMember(records, memberId, seenIds) {
    var list = docsOf(records);
    var allIds = list.map(function (d) { return d.id; });
    var firstVisit = seenIds == null;
    var seen = {};
    (seenIds || []).forEach(function (id) { seen[String(id)] = true; });
    var newest = firstVisit ? [] : list.filter(function (d) { return !seen[d.id]; });
    var pending = memberId ? list.filter(function (d) {
      return d.sign && !findSig(records, d.id, memberId, d.version);
    }) : [];
    var newNeedSign = newest.filter(function (d) {
      return d.sign && memberId && !findSig(records, d.id, memberId, d.version);
    });
    var message = null;
    if (newNeedSign.length) {
      message = "There's a new document that needs your review and signature";
    } else if (newest.length) {
      message = "There's a new document";
    } else if (pending.length) {
      var n = pending.length;
      message = n === 1
        ? 'You have 1 document that needs your review and signature'
        : 'You have ' + n + ' documents that need your review and signature';
    }
    return {
      pending: pending,
      pendingCount: pending.length,
      newDocs: newest,
      newNeedSign: newNeedSign,
      message: message,
      allIds: allIds,
      firstVisit: firstVisit
    };
  }
  function actionCount(records, memberId) {
    return pendingDocs(records, memberId).length + unackedBulletins(records, memberId).length;
  }
  function buttonTextFor(records, memberId) {
    var n = actionCount(records, memberId);
    return n ? 'Office Hub (' + n + ')' : 'Office Hub';
  }
  function bulletinAlertMessage(records, memberId) {
    var list = unackedBulletins(records, memberId);
    if (!list.length) return null;
    if (list.length === 1) return 'Office bulletin: ' + list[0].title;
    return 'You have ' + list.length + ' office bulletins to acknowledge';
  }
  /**
   * Board-load notices. Unacknowledged bulletins open a compact t.modal every
   * board load (Trello always draws a header bar with an X; we pass a blank
   * title so it does not say "Office Hub"). Document alerts stay as t.alert,
   * at most once per tab session. If both apply, the bulletin takes priority
   * and the document alert waits for a later load (or the button badge).
   *
   * The modal is opened at most once per connector-iframe lifetime so repeated
   * board-buttons refreshes cannot loop or re-open it. Closing with the X
   * without acknowledging does not record an ack; the next board load shows it again.
   */
  var bulletinModalHandled = false;
  function resetBulletinModalState() { bulletinModalHandled = false; }
  function bulletinPopupUrl() { return './bulletin-popup.html?v=' + ASSET_VERSION; }
  function openBulletinModal(t) {
    if (bulletinModalHandled) return false;
    if (!t || typeof t.modal !== 'function') return false;
    bulletinModalHandled = true;
    t.modal({
      url: bulletinPopupUrl(),
      title: '​',
      fullscreen: false,
      height: 240,
      accentColor: '#1b365d'
    });
    return true;
  }
  function maybeAlert(t, records, memberId, boardId) {
    var seen = readSeen(boardId, memberId);
    var info = alertForMember(records, memberId, seen);
    if (info.firstVisit || info.message) writeSeen(boardId, memberId, info.allIds);
    var unacked = unackedBulletins(records, memberId);
    if (unacked.length) {
      info.bulletin = true;
      openBulletinModal(t);
      return info;
    }
    if (!info.message) return info;
    if (wasAlerted(boardId, memberId)) return info;
    markAlerted(boardId, memberId);
    if (t && typeof t.alert === 'function') {
      t.alert({ message: info.message, duration: 10, display: 'warning' });
    }
    return info;
  }
  function rememberOpen(t, records, memberId) {
    if (!memberId) return;
    writeSeen(boardIdOf(t), memberId, docsOf(records).map(function (d) { return d.id; }));
  }


  /* ---------- Google storage (see js/cloud.js) ---------- */
  var CLOUD_APP = 'hub';
  var CLOUD_LIMIT = 300000;
  var CACHE_PREFIX = 'office-hub-cache:';
  var ALERT_FETCH_MS = 8000;
  var ALERT_CACHE_WAIT_MS = 4000;

  function cloudLib() {
    return root.OfficeCloud || (typeof globalThis !== 'undefined' && globalThis.OfficeCloud) || null;
  }
  function cloudBody(records, admin) {
    return JSON.stringify({ a: admin || [], r: records || [] });
  }
  function cloudCountOf(body) {
    var raw = JSON.parse(body);
    if (!raw || !Array.isArray(raw.r)) throw new Error('bad');
    return raw.r.length;
  }
  function fromCloud(r, cfg) {
    var raw = {};
    if (r && r.has && r.body) {
      try { raw = JSON.parse(r.body); } catch (e) { raw = {}; }
    }
    var admin = Array.isArray(raw.a) && raw.a[0] ? [String(raw.a[0]), String(raw.a[1] || '')] : null;
    return {
      records: cleanRecords(raw.r),
      admin: admin,
      cardIds: [],
      cardNames: [],
      missing: 0,
      expected: 0,
      google: true,
      rev: (r && r.rev) || 0,
      cfg: cfg || null,
      raw: { board: (r && r.body) || '', cards: [] }
    };
  }
  function cloudCapacity(state) {
    var used = cloudBody(state.records, state.admin).length;
    var n = (state.records || []).length;
    var avg = n ? Math.max(60, Math.round(used / n)) : 200;
    var ratio = used / CLOUD_LIMIT;
    var full = used > CLOUD_LIMIT;
    return {
      google: true, used: used, limit: CLOUD_LIMIT, ratio: ratio,
      percent: full ? 100 : Math.min(99, Math.round(ratio * 100)),
      warn: !full && ratio >= WARN_RATIO, full: full,
      roomFor: Math.max(0, Math.floor((CLOUD_LIMIT - used) / avg)),
      cardCount: 0, needCard: false, nextTitle: '', cloudError: state.cloudError || null
    };
  }
  function attachCloudError(state, err) {
    if (!state) return state;
    state.cloudError = err;
    return state;
  }
  function saveErrorMessage(err) {
    var Cloud = cloudLib();
    if (err && err.cloud && Cloud) return Cloud.errorMessage(err, 'Office Hub');
    if (err && err.code === 'needcard') return err.message || needCardMessage(err.title);
    if (err && err.code === 'missing') return err.message || missingMessage();
    return (err && err.message) || 'Could not save. Please try again.';
  }
  function storageLineText(cap) {
    if (cap && cap.google) {
      return 'Documents, signatures, and announcements are stored in Google (in the Office Budget Email script). Storage used: ' + cap.percent + '% (' + cap.used.toLocaleString() + ' of ' + cap.limit.toLocaleString() + ' characters).';
    }
    return (cap && cap.percent) + '% of storage used (' + (cap && cap.used && cap.used.toLocaleString()) + ' of ' + (cap && cap.limit && cap.limit.toLocaleString()) + ' characters).';
  }

  function readAlertCache(boardId) {
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return null;
      var raw = localStorage.getItem(CACHE_PREFIX + String(boardId || 'board'));
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || !Array.isArray(o.records)) return null;
      return { records: cleanRecords(o.records), rev: o.rev || 0, at: o.at || 0, admin: o.admin || null };
    } catch (e) { return null; }
  }
  function writeAlertCache(boardId, state) {
    try {
      if (typeof localStorage === 'undefined' || !localStorage || !state) return;
      localStorage.setItem(CACHE_PREFIX + String(boardId || 'board'), JSON.stringify({
        records: state.records || [], rev: state.rev || 0, at: Date.now(), admin: state.admin || null
      }));
    } catch (e) {}
  }

  function load(t, opts) {
    opts = opts || {};
    var Cloud = cloudLib();
    if (!Cloud) return loadTrello(t);
    return Cloud.getConfig(t).then(function (cfg) {
      if (!Cloud.isOn(cfg)) return loadTrello(t);
      Cloud.rememberUrl(cfg.u);
      return Cloud.getWithClaim(cfg, CLOUD_APP, opts).then(function (r) {
        var state = fromCloud(r, cfg);
        writeAlertCache(boardIdOf(t), state);
        return state;
      });
    });
  }

  function save(t, state, records, admin, opts) {
    if (state && state.google) {
      var Cloud = cloudLib();
      if (!Cloud) return errorWith('NETWORK', 'Google storage is not available.');
      admin = admin === undefined ? state.admin : admin;
      var body = cloudBody(records, admin);
      if (body.length > CLOUD_LIMIT) {
        var too = Cloud.makeErr('TOO_BIG');
        too.cloud = true;
        return Promise.reject(too);
      }
      var cfg = state.cfg;
      return Cloud.put(cfg.u, CLOUD_APP, cfg.s, body, state.rev, false, opts || {}).then(function (r) {
        var next = fromCloud({ has: true, body: body, rev: r.rev }, cfg);
        writeAlertCache(boardIdOf(t), next);
        return next;
      }, function (err) {
        if (err && typeof err === 'object') err.cloud = true;
        throw err;
      });
    }
    return saveTrello(t, state, records, admin);
  }

  /**
   * Board-load path: if this board is already on Google, read Google (source of
   * truth) with a short timeout, and use the last cached copy if Google is slow
   * or fails. Does not start a migration.
   */
  function loadForAlerts(t, boardId, opts) {
    opts = opts || {};
    var Cloud = cloudLib();
    boardId = boardId || boardIdOf(t);
    if (!Cloud) return loadTrello(t);
    return Cloud.getConfig(t).then(function (cfg) {
      if (!Cloud.isOn(cfg)) return loadTrello(t);
      var cached = readAlertCache(boardId);
      var fetch = Cloud.getWithClaim(cfg, CLOUD_APP, { fetch: opts.fetch, timeout: opts.timeout || ALERT_FETCH_MS }).then(function (r) {
        var state = fromCloud(r, cfg);
        writeAlertCache(boardId, state);
        return state;
      });
      if (!cached) return fetch;
      var settled = false;
      var fromCache = new Promise(function (resolve) {
        setTimeout(function () {
          if (settled) return;
          resolve({
            records: cached.records, admin: cached.admin, google: true, fromCache: true,
            cardIds: [], cardNames: [], missing: 0, expected: 0, rev: cached.rev, cfg: cfg,
            raw: { board: '', cards: [] }
          });
        }, opts.cacheWait || ALERT_CACHE_WAIT_MS);
      });
      fetch.then(function () { settled = true; }, function () { settled = true; });
      return Promise.race([fetch, fromCache]).catch(function (err) {
        if (cached) {
          return {
            records: cached.records, admin: cached.admin, google: true, fromCache: true,
            cloudError: err, cardIds: [], cardNames: [], missing: 0, expected: 0,
            rev: cached.rev, cfg: cfg, raw: { board: '', cards: [] }
          };
        }
        throw err;
      });
    });
  }

  /**
   * Where data is read from and saved to. Google once the board has {on:1}
   * in pluginData "g"; Trello until then. The first open by someone who can
   * edit moves the Trello copy to Google automatically (once). Trello data is
   * never changed by the move and never written again in Google mode.
   * opts.link() may return a script link (e.g. the one Office Budget uses).
   */
  function createStore(t, opts) {
    opts = opts || {};
    var Cloud = opts.cloud || cloudLib();
    var ro = { fetch: opts.fetch, timeout: opts.timeout };
    var st = { mode: 'trello', cfg: null, rev: 0, migrating: null, tried: false, error: null, link: '' };
    function canWrite() { return typeof opts.canWrite === 'function' ? !!opts.canWrite() : true; }
    function mark(err) { if (err && typeof err === 'object') err.cloud = true; return err; }
    function loadGoogle() {
      Cloud.rememberUrl(st.cfg.u);
      return Cloud.getWithClaim(st.cfg, CLOUD_APP, ro).then(function (r) {
        st.rev = r.rev;
        var state = fromCloud(r.has ? r : { has: false, rev: r.rev }, st.cfg);
        writeAlertCache(boardIdOf(t), state);
        return state;
      }, function (err) { throw mark(err); });
    }
    function migrate(url, data) {
      st.tried = true;
      var run = Cloud.connect(t, {
        app: CLOUD_APP, url: url, fetch: opts.fetch, timeout: opts.timeout,
        readLocal: function () {
          return { body: cloudBody(data.records, data.admin), count: (data.records || []).length };
        },
        countOf: cloudCountOf
      }).then(function (cfg) {
        st.cfg = cfg; st.mode = 'google'; st.error = null;
        return loadGoogle();
      }, function (err) {
        st.error = mark(err);
        return attachCloudError(data, err);
      });
      st.migrating = run.then(function (v) { st.migrating = null; return v; }, function (e) { st.migrating = null; throw e; });
      return st.migrating;
    }
    function storeLoad() {
      if (st.migrating) return st.migrating;
      return Cloud.getConfig(t).then(function (cfg) {
        if (Cloud.isOn(cfg)) {
          st.cfg = cfg; st.mode = 'google';
          return loadGoogle();
        }
        st.mode = 'trello';
        return loadTrello(t).then(function (data) {
          var hint = typeof opts.link === 'function' ? opts.link() : '';
          var url = st.link || (cfg && cfg.u) || hint;
          if (st.tried || !canWrite() || !Cloud.isScriptUrl(url)) {
            return st.error ? attachCloudError(data, st.error) : data;
          }
          return migrate(url, data);
        });
      });
    }
    function storeSave(data, admin) {
      if (st.mode !== 'google') return saveTrello(t, data, data.records, admin === undefined ? data.admin : admin);
      var body = cloudBody(data.records, admin === undefined ? data.admin : admin);
      if (body.length > CLOUD_LIMIT) return Promise.reject(mark(Cloud.makeErr('TOO_BIG')));
      return Cloud.put(st.cfg.u, CLOUD_APP, st.cfg.s, body, st.rev, false, ro).then(function (r) {
        st.rev = r.rev;
        var next = fromCloud({ has: true, body: body, rev: r.rev }, st.cfg);
        writeAlertCache(boardIdOf(t), next);
        return next;
      }, function (err) { throw mark(err); });
    }
    function setLink(url) {
      if (!Cloud.isScriptUrl(url)) return Promise.reject(mark(Cloud.makeErr('URL')));
      st.link = Cloud.cleanUrl(url);
      st.tried = false;
      st.error = null;
      Cloud.rememberUrl(st.link);
      return Promise.resolve();
    }
    return {
      load: storeLoad,
      save: storeSave,
      setLink: setLink,
      mode: function () { return st.mode; },
      error: function () { return st.error; }
    };
  }


  function shouldQueueSignal(isNew, sendChecked) {
    return !!(isNew && sendChecked);
  }
  function signalAnnouncementBody(key, item) {
    return JSON.stringify({
      mode: 'hubAnnouncement',
      key: String(key || ''),
      id: String(item && item.id || ''),
      title: String(item && item.title || ''),
      message: String(item && item.message || ''),
      url: String(item && item.url || '')
    });
  }
  function postSignalAnnouncement(url, key, item, opts) {
    opts = opts || {};
    url = String(url || '');
    if (!url || !key || !item || !item.id) return false;
    var body = signalAnnouncementBody(key, item);
    try {
      if (typeof opts.sendBeacon === 'function') {
        var blob = typeof opts.Blob === 'function'
          ? new opts.Blob([body], { type: 'text/plain;charset=utf-8' })
          : body;
        return !!opts.sendBeacon(url, blob);
      }
    } catch (e) {}
    try {
      if (typeof opts.fetch === 'function') {
        opts.fetch(url, {
          method: 'POST',
          mode: 'no-cors',
          credentials: 'omit',
          cache: 'no-store',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: body,
          keepalive: true
        });
        return true;
      }
    } catch (e2) {}
    return false;
  }

  root.Docs = {
    KEY: KEY, LIMIT: LIMIT, CAP: CAP, ASSET_VERSION: ASSET_VERSION, MAX: MAX, CATEGORIES: CATEGORIES,
    iconUrl: iconUrl, storageCardTitle: storageCardTitle, isStorageCardName: isStorageCardName,
    parseStorageIndex: parseStorageIndex, newId: newId, today: today,
    docRecord: docRecord, sigRecord: sigRecord, docsOf: docsOf, sigsOf: sigsOf, findSig: findSig, hasSigs: hasSigs,
    bulletinRecord: bulletinRecord, ackRecord: ackRecord, bulletinsOf: bulletinsOf, acksOf: acksOf,
    findAck: findAck, unackedBulletins: unackedBulletins,
    removeAnnouncement: removeAnnouncement, requestedSection: requestedSection,
    trimAnnouncementHistory: trimAnnouncementHistory,
    MAX_FULL_ANNOUNCEMENTS: MAX_FULL_ANNOUNCEMENTS, TRIMMED_MESSAGE: TRIMMED_MESSAGE, nowStamp: nowStamp,
    cleanRecords: cleanRecords, normalizeUrl: normalizeUrl, previewUrl: previewUrl,
    nameMatchesAdmin: nameMatchesAdmin, isAdmin: isAdmin,
    plan: plan, capacity: capacity, load: load, save: save, mutate: mutate,
    loadTrello: loadTrello, saveTrello: saveTrello,
    whoAmI: whoAmI, boardMembers: boardMembers,
    needCardMessage: needCardMessage, missingMessage: missingMessage,
    saveErrorMessage: saveErrorMessage, storageLineText: storageLineText,
    createStore: createStore, loadForAlerts: loadForAlerts,
    readAlertCache: readAlertCache, writeAlertCache: writeAlertCache,
    cloudBody: cloudBody, cloudCountOf: cloudCountOf, fromCloud: fromCloud,
    CLOUD_APP: CLOUD_APP, CLOUD_LIMIT: CLOUD_LIMIT,
    boardIdOf: boardIdOf, readSeen: readSeen, writeSeen: writeSeen,
    wasAlerted: wasAlerted, markAlerted: markAlerted,
    pendingDocs: pendingDocs, alertForMember: alertForMember, maybeAlert: maybeAlert,
    rememberOpen: rememberOpen, actionCount: actionCount, buttonTextFor: buttonTextFor,
    bulletinAlertMessage: bulletinAlertMessage, openBulletinModal: openBulletinModal,
    shouldQueueSignal: shouldQueueSignal, signalAnnouncementBody: signalAnnouncementBody,
    postSignalAnnouncement: postSignalAnnouncement,
    resetBulletinModalState: resetBulletinModalState, bulletinPopupUrl: bulletinPopupUrl
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Docs;
})(typeof globalThis !== 'undefined' ? globalThis : this);
