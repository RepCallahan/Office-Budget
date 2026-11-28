/**
 * Shared helpers for the Office Passwords Trello Power-Up.
 *
 * Logins are stored in card/shared pluginData under the short key "p"
 * on one or more storage cards named like
 * "Password Storage 1 – Don't delete (password data)". Trello caps each
 * scope/visibility pair at 4096 characters, so each storage card adds
 * another 4096 characters (about 45 logins). Card ids are remembered in
 * the board/shared field "p" as a pointer {h:["cardId",...]} so the app
 * still works after a card or list is archived. Do not delete those cards.
 *
 * On first open the app creates card 1 when the host can (tests, preview).
 * The official Trello Power-Up client cannot create cards without a REST
 * key, so in Trello the app will use a card you add with that exact name
 * if it cannot create one itself. New cards are added automatically when
 * one fills, when the host can create them.
 *
 * Existing logins that were stored as a compact array on board/shared "p"
 * are migrated onto the storage cards on first open; "p" is then replaced
 * with the pointer.
 *
 * Stored shape (as compact as possible): an array of [name, url, username, password].
 *   [["Example","example.com","user","pass"], ...]
 * No keys, ids or timestamps. URLs are saved without https://, www. and trailing slashes.
 * No encryption, by the office's choice: anyone with board access can read it.
 * No master password, notes, or categories.
 */
(function (root) {
  var KEY = 'p';
  var LIMIT = 4096;
  var WARN_RATIO = 0.8;
  var ASSET_VERSION = '20261128a';
  var MAX = { name: 40, url: 80, user: 60, pass: 64 };
  var STORAGE_NAME_RE = /^\s*password storage(?:\s+(\d+))?(?:\b.*)?$/i;

  function baseUrl() {
    if (typeof window === 'undefined' || !window.location) return '';
    var path = (window.location.pathname || '/').split('?')[0].replace(/(index|logins)\.html$/i, '');
    if (path.charAt(path.length - 1) !== '/') path += '/';
    return window.location.origin + path;
  }
  function assetUrl(rel) { return baseUrl() + rel + '?v=' + ASSET_VERSION; }
  function iconUrl() { return { dark: assetUrl('img/icon-dark.svg'), light: assetUrl('img/icon-light.svg') }; }

  function empty() { return []; }

  function storageCardTitle(n) {
    return "Password Storage " + Number(n) + " – Don't delete (password data)";
  }

  function isStorageCardName(name) {
    return STORAGE_NAME_RE.test(String(name || ''));
  }

  function parseStorageIndex(name) {
    var match = String(name || '').trim().match(STORAGE_NAME_RE);
    if (!match) return 0;
    return match[1] ? Number(match[1]) : 1;
  }

  function parseStorageIds(raw) {
    if (!Array.isArray(raw)) return [];
    var ids = [];
    var seen = {};
    raw.forEach(function (id) {
      id = String(id || '').trim();
      if (!id || seen[id]) return;
      seen[id] = true;
      ids.push(id);
    });
    return ids;
  }

  function isPointer(raw) {
    return !!(raw && typeof raw === 'object' && !Array.isArray(raw) && raw.h);
  }

  function isLegacyPayload(raw) {
    if (raw == null || raw === '') return false;
    if (Array.isArray(raw)) return true;
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch (err) { return false; }
      if (Array.isArray(raw)) return true;
      if (raw && typeof raw === 'object' && Array.isArray(raw.e) && !raw.h) return true;
      return false;
    }
    if (raw && typeof raw === 'object' && Array.isArray(raw.e) && !raw.h) return true;
    return false;
  }

  // Accepts the current array format. Also reads the earlier test format
  // {c:[...], e:[[name,url,user,pass,cat,notes]]} and keeps the first four fields.
  function normalize(raw) {
    var data = raw;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch (err) { data = null; } }
    if (isPointer(data)) return empty();
    if (data && !Array.isArray(data) && Array.isArray(data.e)) data = data.e;
    if (!Array.isArray(data)) return empty();
    var out = [];
    data.forEach(function (r) {
      if (Array.isArray(r)) out.push([r[0] || '', r[1] || '', r[2] || '', r[3] || '']);
    });
    return out;
  }

  function pack(data) {
    return (data || []).map(function (r) {
      var row = r.slice(0, 4);
      while (row.length > 1 && row[row.length - 1] === '') row.pop();
      return row;
    });
  }

  function size(data) { return JSON.stringify(pack(data)).length; }

  function cardCountOf(data) {
    var store = data && data._storage;
    return (store && store.ids && store.ids.length) || 0;
  }

  function setStorage(data, store) {
    if (!data || typeof data !== 'object') return data;
    try { delete data._storage; } catch (err) {}
    Object.defineProperty(data, '_storage', { value: store || { ids: [] }, enumerable: false, writable: true, configurable: true });
    return data;
  }

  function attachStorage(data, store) {
    return setStorage(Array.isArray(data) ? data.slice() : empty(), store);
  }

  function capacity(data) {
    if (data && data._storage && data._storage.google) return cloudCapacity(data);
    var used = size(data);
    var cards = cardCountOf(data);
    var limit = LIMIT * Math.max(1, cards);
    var n = data ? data.length : 0;
    var avg = n ? Math.max(30, Math.round((used - 1) / n)) : 70;
    var ratio = used / limit;
    var leftover = data && data._storage && data._storage.leftover || 0;
    var needCard = !!(data && data._storage && data._storage.needCard);
    var needSetup = !!(data && data._storage && data._storage.needSetup);
    var full = used > limit || needCard;
    return {
      used: used, limit: limit, ratio: ratio,
      percent: full && used >= limit ? 100 : Math.min(99, Math.round(ratio * 100)),
      warn: !full && ratio >= WARN_RATIO,
      full: full, avg: avg,
      roomFor: Math.max(0, Math.floor((limit - used) / avg)),
      cardCount: cards,
      needCard: needCard,
      needSetup: needSetup,
      leftover: leftover,
      nextTitle: (data && data._storage && data._storage.nextTitle) || storageCardTitle(Math.max(1, cards) + (cards ? 1 : 0)),
      missing: (data && data._storage && data._storage.missing) || [],
      cloudError: (data && data._storage && data._storage.cloudError) || null
    };
  }

  function boardPointer(ids) {
    return { h: parseStorageIds(ids) };
  }

  function listVisibleCards(t) {
    if (!t || typeof t.cards !== 'function') return Promise.resolve([]);
    return Promise.resolve().then(function () {
      return t.cards('id', 'name', 'closed');
    }).then(function (cards) {
      return Array.isArray(cards) ? cards : [];
    }).catch(function () {
      return [];
    });
  }

  function listBoardLists(t) {
    if (!t || typeof t.lists !== 'function') return Promise.resolve([]);
    return Promise.resolve().then(function () {
      return t.lists('id', 'name');
    }).then(function (lists) {
      return Array.isArray(lists) ? lists : [];
    }).catch(function () {
      return [];
    });
  }

  function createStorageCard(t, n) {
    var name = storageCardTitle(n);
    if (!t || typeof t.createCard !== 'function') return Promise.resolve(null);
    return listBoardLists(t).then(function (lists) {
      var list = null;
      var i;
      for (i = 0; i < lists.length; i++) {
        if (lists[i] && lists[i].id) { list = lists[i]; break; }
      }
      if (!list) return null;
      return Promise.resolve(t.createCard({ name: name, idList: list.id })).then(function (card) {
        if (!card || !card.id) return null;
        return { id: String(card.id), name: card.name || name, closed: !!card.closed };
      });
    }).catch(function () {
      return null;
    });
  }

  function resolveStorageCards(t, knownIds) {
    var known = parseStorageIds(knownIds);
    return listVisibleCards(t).then(function (cards) {
      var found = cards.filter(function (card) {
        return card && card.id && !card.closed && isStorageCardName(card.name);
      }).sort(function (a, b) {
        return parseStorageIndex(a.name) - parseStorageIndex(b.name);
      });
      var ids = known.slice();
      found.forEach(function (card) {
        if (ids.indexOf(String(card.id)) < 0) ids.push(String(card.id));
      });
      return {
        ids: ids,
        visible: found,
        needSetup: ids.length === 0,
        nextTitle: storageCardTitle(ids.length ? ids.length + 1 : 1),
        missing: [],
        needCard: false,
        leftover: 0
      };
    });
  }

  function ensureCardCount(t, store, needed) {
    store = store || { ids: [] };
    needed = Math.max(0, Number(needed) || 0);
    function step() {
      if (store.ids.length >= needed) return Promise.resolve(store);
      var n = store.ids.length + 1;
      return createStorageCard(t, n).then(function (card) {
        if (!card || !card.id) return store;
        store.ids.push(String(card.id));
        store.needSetup = false;
        store.nextTitle = storageCardTitle(store.ids.length + 1);
        return step();
      });
    }
    return step();
  }

  function readCardLogins(t, ids, store) {
    var missing = (store && store.missing) || [];
    var reads = (ids || []).map(function (id) {
      return Promise.resolve().then(function () {
        return t.get(id, 'shared', KEY);
      }).then(function (raw) {
        return normalize(raw);
      }).catch(function () {
        missing.push(id);
        return [];
      });
    });
    return Promise.all(reads).then(function (groups) {
      var all = [];
      groups.forEach(function (list) { all = all.concat(list); });
      if (store) store.missing = missing;
      return all;
    });
  }

  function writeCardLogins(t, chunks) {
    var writes = (chunks || []).map(function (chunk) {
      return Promise.resolve().then(function () {
        return t.set(chunk.id, 'shared', KEY, pack(chunk.list));
      });
    });
    return Promise.all(writes);
  }

  function planStorage(data, ids) {
    ids = parseStorageIds(ids);
    var logins = Array.isArray(data) ? data.slice() : [];
    if (!ids.length) {
      var used = size(logins);
      return {
        ids: [],
        onCards: false,
        chunks: [],
        leftover: logins,
        used: used,
        limit: LIMIT,
        cardCount: 0,
        full: used > LIMIT,
        needCard: used > LIMIT,
        needSetup: true,
        nextTitle: storageCardTitle(1)
      };
    }
    var remaining = logins.slice();
    var chunks = [];
    var i;
    for (i = 0; i < ids.length; i++) {
      var chunk = [];
      while (remaining.length) {
        var trial = chunk.concat([remaining[0]]);
        if (size(trial) > LIMIT) break;
        chunk.push(remaining.shift());
      }
      chunks.push({
        id: ids[i],
        list: chunk,
        size: size(chunk)
      });
    }
    var cardUsed = 0;
    chunks.forEach(function (chunk) { cardUsed += chunk.size; });
    var needCard = remaining.length > 0;
    return {
      ids: ids,
      onCards: true,
      chunks: chunks,
      leftover: remaining,
      used: cardUsed,
      limit: LIMIT * ids.length,
      cardCount: ids.length,
      full: false,
      needCard: needCard,
      needSetup: false,
      nextTitle: storageCardTitle(ids.length + 1)
    };
  }

  function readBoardRaw(t) {
    return Promise.resolve().then(function () {
      return t.get('board', 'shared', KEY);
    });
  }

  function writeBoardPointer(t, ids) {
    return t.set('board', 'shared', KEY, boardPointer(ids));
  }

  function mergeLogins(primary, secondary) {
    var out = [];
    var seen = {};
    function add(list) {
      (list || []).forEach(function (row) {
        var key = (row || []).join('\u0001');
        if (seen[key]) return;
        seen[key] = true;
        out.push(row);
      });
    }
    add(primary);
    add(secondary);
    return out;
  }

  function rejectStorage(code, extra) {
    var err = new Error(code);
    err.code = code;
    if (extra) {
      Object.keys(extra).forEach(function (key) { err[key] = extra[key]; });
    }
    return Promise.reject(err);
  }

  function attachPlan(store, plan) {
    store.needCard = !!(plan && plan.needCard);
    store.leftover = plan && plan.leftover ? plan.leftover.length : 0;
    store.nextTitle = (plan && plan.nextTitle) || storageCardTitle((store.ids.length || 0) + 1);
    store.needSetup = !store.ids.length;
    return store;
  }

  function growForPlan(t, store, data) {
    var plan = planStorage(data, store.ids);
    if (!plan.needCard) {
      attachPlan(store, plan);
      return Promise.resolve(plan);
    }
    if (plan.leftover.length && size([plan.leftover[0]]) > LIMIT) {
      attachPlan(store, plan);
      return Promise.resolve(plan);
    }
    var before = store.ids.length;
    if (before >= 50) {
      attachPlan(store, plan);
      return Promise.resolve(plan);
    }
    return ensureCardCount(t, store, before + 1).then(function () {
      if (store.ids.length <= before) {
        attachPlan(store, planStorage(data, store.ids));
        return planStorage(data, store.ids);
      }
      return growForPlan(t, store, data);
    });
  }

  function load(t) {
    return readBoardRaw(t).then(function (raw) {
      var legacy = isLegacyPayload(raw) ? normalize(raw) : empty();
      var known = isPointer(raw) ? parseStorageIds(raw.h) : [];
      return resolveStorageCards(t, known).then(function (store) {
        var needed = store.ids.length ? store.ids.length : 1;
        return ensureCardCount(t, store, needed).then(function () {
          return readCardLogins(t, store.ids, store).then(function (cardLogins) {
            var merged = mergeLogins(cardLogins, legacy);
            var shouldMigrate = store.ids.length > 0 && (legacy.length > 0 || isLegacyPayload(raw) || !isPointer(raw));
            if (!store.ids.length) {
              attachPlan(store, planStorage(merged, []));
              return attachStorage(merged, store);
            }
            if (!shouldMigrate && isPointer(raw) && cardLogins) {
              attachPlan(store, planStorage(merged, store.ids));
              return attachStorage(merged, store);
            }
            return growForPlan(t, store, merged).then(function (plan) {
              if (plan.needCard && plan.leftover.length) {
                attachPlan(store, plan);
                return attachStorage(merged, store);
              }
              var writes = writeCardLogins(t, plan.chunks).then(function () {
                return writeBoardPointer(t, store.ids);
              });
              return writes.then(function () {
                attachPlan(store, plan);
                return attachStorage(merged, store);
              }).catch(function (err) {
                store.migrateError = err;
                attachPlan(store, plan);
                return attachStorage(merged, store);
              });
            });
          });
        });
      });
    });
  }

  function save(t, data) {
    var rows = Array.isArray(data) ? data.slice() : empty();
    return readBoardRaw(t).then(function (raw) {
      var known = isPointer(raw) ? parseStorageIds(raw.h) : [];
      return resolveStorageCards(t, known).then(function (store) {
        if (data && data._storage && data._storage.ids) {
          data._storage.ids.forEach(function (id) {
            id = String(id || '');
            if (id && store.ids.indexOf(id) < 0) store.ids.push(id);
          });
        }
        var needed = store.ids.length ? store.ids.length : 1;
        return ensureCardCount(t, store, needed).then(function () {
          return growForPlan(t, store, rows).then(function (plan) {
            if (!store.ids.length) {
              if (plan.full || size(rows) > LIMIT) {
                return rejectStorage('NEED_CARD', { title: storageCardTitle(1), leftover: rows.length });
              }
              return t.set('board', 'shared', KEY, pack(rows)).then(function () {
                attachPlan(store, plan);
                if (data) setStorage(data, store);
                return rows;
              });
            }
            if (plan.needCard) {
              return rejectStorage('NEED_CARD', { title: plan.nextTitle, leftover: plan.leftover.length });
            }
            return writeCardLogins(t, plan.chunks).then(function () {
              return writeBoardPointer(t, store.ids);
            }).then(function () {
              attachPlan(store, plan);
              if (data) setStorage(data, store);
              return rows;
            });
          });
        });
      });
    });
  }

  function setupCardMessage() {
    return 'Add a card named “' + storageCardTitle(1) + '” in any list, then reopen Office Passwords. After it finds the card, you can archive it (or the list) so it stays off the board — do not delete it.';
  }

  function needCardMessage(title) {
    return 'To save more logins, add a card named “' + (title || storageCardTitle(2)) + '”, then reopen Office Passwords. You can archive that card afterward so it stays off the board — just don’t delete it.';
  }

  function fullMessage() {
    return 'Trello’s storage for these logins is full. Delete a login, or add another card named like “' + storageCardTitle(2) + '” and reopen Office Passwords.';
  }

  function saveErrorMessage(err) {
    if (err && err.cloud && cloudLib()) return cloudLib().errorMessage(err, 'Office Passwords');
    if (err && err.code === 'NEED_CARD') return needCardMessage(err.title);
    if (err && (err.code === 'FULL' || (err.message && String(err.message).indexOf('4096') !== -1))) return fullMessage();
    return (err && err.message) || 'Could not save. Please try again.';
  }

  function storageLineText(info) {
    if (info && info.google) {
      return 'Logins are stored in Google (in the Office Budget Email script). Storage used: ' + info.percent + '% (' + info.used.toLocaleString('en-US') + ' of ' + info.limit.toLocaleString('en-US') + ' characters).';
    }
    var cards = (info && info.cardCount) || 0;
    var where;
    if (!cards) where = " of Trello’s board limit";
    else where = ' across ' + cards + ' storage card' + (cards === 1 ? '' : 's');
    return 'Storage used: ' + (info && info.percent) + '%' + where + ' (' + (info && info.used) + ' of ' + (info && info.limit) + ' characters).';
  }

  function missingCardMessage() {
    return 'A Password Storage card could not be read. If you archived it, that is okay. If logins are missing, open Menu → Archived items, send the “Password Storage” card back to the board, and reopen Office Passwords. Do not delete those cards.';
  }

  // Saved form of a website: no https://, no www., no trailing slash.
  function stripScheme(u) {
    return String(u || '').trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
  }
  function openUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(u) ? u : 'https://' + u;
  }

  function generatePassword(len) {
    len = len || 16;
    var sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%^&*?'];
    var all = sets.join('');
    function rnd(n) {
      var a = new Uint32Array(1), lim = Math.floor(4294967296 / n) * n, x;
      do { crypto.getRandomValues(a); x = a[0]; } while (x >= lim);
      return x % n;
    }
    var chars = sets.map(function (s) { return s.charAt(rnd(s.length)); });
    while (chars.length < len) chars.push(all.charAt(rnd(all.length)));
    for (var i = chars.length - 1; i > 0; i--) { var j = rnd(i + 1); var tmp = chars[i]; chars[i] = chars[j]; chars[j] = tmp; }
    return chars.join('');
  }

  function applyTheme(t) {
    var ctx = typeof t.getContext === 'function' ? t.getContext() : null;
    var set = function (th) {
      if (typeof document !== 'undefined' && document.body) {
        document.body.setAttribute('data-theme', th === 'dark' ? 'dark' : 'light');
      }
    };
    set((ctx && ctx.theme) || 'light');
    if (typeof t.subscribeToThemeChanges === 'function') t.subscribeToThemeChanges(set);
  }


  /* ---------- Google storage (see js/cloud.js) ---------- */
  var CLOUD_APP = 'passwords';
  var CLOUD_LIMIT = 300000;
  function cloudLib() {
    return root.OfficeCloud || (typeof globalThis !== 'undefined' && globalThis.OfficeCloud) || null;
  }
  function cloudBody(data) { return JSON.stringify(pack(data)); }
  function cloudCountOf(body) {
    var raw = JSON.parse(body);
    if (!Array.isArray(raw)) throw new Error('bad');
    return raw.length;
  }
  function fromCloud(body, rev) {
    var list = normalize(body);
    return setStorage(list, { google: true, ids: [], missing: [], rev: rev });
  }
  function cloudCapacity(data) {
    var used = size(data);
    var n = data ? data.length : 0;
    var avg = n ? Math.max(30, Math.round((used - 1) / n)) : 70;
    var ratio = used / CLOUD_LIMIT;
    var full = used > CLOUD_LIMIT;
    return {
      google: true, used: used, limit: CLOUD_LIMIT, ratio: ratio,
      percent: full ? 100 : Math.min(99, Math.round(ratio * 100)),
      warn: !full && ratio >= WARN_RATIO, full: full, avg: avg,
      roomFor: Math.max(0, Math.floor((CLOUD_LIMIT - used) / avg)),
      cardCount: 0, needCard: false, needSetup: false, leftover: 0, nextTitle: '', missing: [], cloudError: null
    };
  }

  /**
   * Where logins are read from and saved to. Google once the board has {on:1}
   * in pluginData "g"; Trello until then. The first open by someone who can edit
   * moves the Trello logins to Google automatically (once). Trello data is never
   * changed by the move and never written again in Google mode.
   * opts.link() may return a script link to use (e.g. the one Office Budget uses).
   */
  function createStore(t, opts) {
    opts = opts || {};
    var Cloud = opts.cloud || cloudLib();
    var ro = { fetch: opts.fetch, timeout: opts.timeout };
    var state = { mode: 'trello', cfg: null, rev: 0, migrating: null, tried: false, error: null, link: '' };
    function canWrite() { return typeof opts.canWrite === 'function' ? !!opts.canWrite() : true; }
    function mark(err) { if (err && typeof err === 'object') err.cloud = true; return err; }
    function attachError(data, err) {
      if (!data) return data;
      if (!data._storage) setStorage(data, { ids: [], missing: [] });
      data._storage.cloudError = err;
      return data;
    }
    function loadGoogle() {
      return Cloud.getWithClaim(state.cfg, CLOUD_APP, ro).then(function (r) {
        state.rev = r.rev;
        return fromCloud(r.has ? r.body : '[]', r.rev);
      }, function (err) { throw mark(err); });
    }
    function migrate(url, data) {
      state.tried = true;
      var run = Cloud.connect(t, {
        app: CLOUD_APP, url: url, fetch: opts.fetch, timeout: opts.timeout,
        readLocal: function () { return { body: cloudBody(data), count: data.length }; },
        countOf: cloudCountOf
      }).then(function (cfg) {
        state.cfg = cfg; state.mode = 'google'; state.error = null;
        return loadGoogle();
      }, function (err) {
        state.error = mark(err);
        return attachError(data, err);
      });
      state.migrating = run.then(function (v) { state.migrating = null; return v; }, function (e) { state.migrating = null; throw e; });
      return state.migrating;
    }
    function storeLoad() {
      if (state.migrating) return state.migrating;
      return Cloud.getConfig(t).then(function (cfg) {
        if (Cloud.isOn(cfg)) {
          state.cfg = cfg; state.mode = 'google';
          return loadGoogle();
        }
        state.mode = 'trello';
        return load(t).then(function (data) {
          var hint = typeof opts.link === 'function' ? opts.link() : '';
          var url = state.link || (cfg && cfg.u) || hint;
          if (state.tried || !canWrite() || !Cloud.isScriptUrl(url)) {
            return state.error ? attachError(data, state.error) : data;
          }
          return migrate(url, data);
        });
      });
    }
    function storeSave(data) {
      if (state.mode !== 'google') return save(t, data);
      var body = cloudBody(data);
      if (body.length > CLOUD_LIMIT) return Promise.reject(mark(Cloud.makeErr('TOO_BIG')));
      return Cloud.put(state.cfg.u, CLOUD_APP, state.cfg.s, body, state.rev, false, ro).then(function (r) {
        state.rev = r.rev;
        setStorage(data, { google: true, ids: [], missing: [], rev: r.rev });
        return data;
      }, function (err) { throw mark(err); });
    }
    // Settings: the Apps Script link was pasted. Next load() moves the logins.
    function setLink(url) {
      if (!Cloud.isScriptUrl(url)) return Promise.reject(mark(Cloud.makeErr('URL')));
      state.link = Cloud.cleanUrl(url);
      state.tried = false;
      state.error = null;
      return Promise.resolve();
    }
    return {
      load: storeLoad,
      save: storeSave,
      setLink: setLink,
      mode: function () { return state.mode; },
      error: function () { return state.error; }
    };
  }

  root.Vault = {
    KEY: KEY, LIMIT: LIMIT, ASSET_VERSION: ASSET_VERSION, MAX: MAX,
    iconUrl: iconUrl, empty: empty, normalize: normalize, pack: pack, size: size, capacity: capacity,
    load: load, save: save, stripScheme: stripScheme, openUrl: openUrl,
    generatePassword: generatePassword, applyTheme: applyTheme,
    storageCardTitle: storageCardTitle, isStorageCardName: isStorageCardName,
    parseStorageIndex: parseStorageIndex, parseStorageIds: parseStorageIds,
    planStorage: planStorage, boardPointer: boardPointer,
    setupCardMessage: setupCardMessage, needCardMessage: needCardMessage,
    fullMessage: fullMessage, saveErrorMessage: saveErrorMessage,
    storageLineText: storageLineText, missingCardMessage: missingCardMessage,
    CLOUD_LIMIT: CLOUD_LIMIT, cloudBody: cloudBody, cloudCountOf: cloudCountOf, createStore: createStore
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root.Vault;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
