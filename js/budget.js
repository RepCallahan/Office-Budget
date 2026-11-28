/* global TrelloPowerUp */
/**
 * Shared helpers for the Budget Sync Trello Power-Up.
 * Categories, groups, and settings are stored in board-level shared pluginData
 * under the short key "b". Logged expenses move to card-scoped shared pluginData
 * (key "e") on one or more storage cards named like
 * "Budget Storage 1 – Don't delete (budget data)". Trello caps each
 * scope/visibility pair at 4096 characters, so each storage card adds another
 * 4096 characters. Card ids are remembered in board field "h".
 *
 * Stored shape (v4, backward compatible with v2 and v3):
 *   { v: 4, t: total, s: startingSpent, p: "YYYY-MM-DD",
 *     e: [[id, date, desc, cat, amount, by]],  // board copy is cleared after migration
 *     c: [[id, name, plannedCents, alreadyCents?, groupIndex?]],
 *     g: ["Spring Survey", ...],
 *     k: webhookUrl, m: lastSnapshotMonth, n: lastAttemptMs, o: lastOk, f: 1 if default categories were seeded,
 *     h: ["cardId", ...] }
 * Expense "cat" values:
 *   - a number 0-22: legacy built-in state category (v2 data)
 *   - "#id": a custom planned category in `c`
 *   - "*": Other / Unplanned
 *   - any other string: legacy "Other" free text, or a deleted category's name
 * `t`/`s` and expense amounts stay in dollars. Category planned/already use integer cents.
 * Optional keys (`c`, `g`, `k`, `m`, `n`, `o`) are omitted when empty.
 * Older copies that only know board key "b" still load categories and any
 * expenses left on the board. After expenses move to storage cards, use this
 * version so those expenses stay visible.
 */
(function (root) {
  var STORAGE_KEY = 'b';
  var DEFAULT_TOTAL = 25000;
  var PLUGIN_LIMIT = 4096;
  var WARN_RATIO = 0.8;
  var CATEGORIES = [
    'Blue Book miscellaneous',
    'Citations',
    'Flags',
    'In-District Travel-Staff',
    'Internet',
    'Lazer Labels',
    'Mailing Services',
    'Maint Repair St Owned Bldg',
    'Materials & Supplies',
    'Out-State Travel-Leg',
    'Paper for Printing',
    'Postage-Bulk Mail',
    'Postage-Metered Mail',
    'Print Business Cards',
    'Print Labels',
    'Print Newsletters',
    'Print Note Cards',
    'Print Postcards',
    'Print Questionnaire',
    'Print Reg Envelopes',
    'Registration Fee-Leg',
    'Subscriptions',
    'Other'
  ];
  var OTHER_INDEX = CATEGORIES.indexOf('Other');
  var SUGGESTED_STARTING = 22473.29;

  // Bump this when uploading a new copy to GitHub Pages so Trello and the
  // browser fetch fresh HTML, JS, CSS, and icons instead of a cached copy.
  var ASSET_VERSION = '20261127c';

  function publicBaseUrl() {
    var path = window.location.pathname || '/';
    path = path.split('?')[0];
    path = path.replace(/index\.html$/i, '');
    path = path.replace(/budget\.html$/i, '');
    path = path.replace(/section\.html$/i, '');
    path = path.replace(/expense\.html$/i, '');
    path = path.replace(/settings\/total\.html$/i, '');
    if (path.charAt(path.length - 1) !== '/') {
      path += '/';
    }
    return window.location.origin + path;
  }

  function assetUrl(relativePath) {
    return publicBaseUrl() + String(relativePath || '').replace(/^\.\//, '') + '?v=' + ASSET_VERSION;
  }

  function iconUrl() {
    return {
      dark: assetUrl('img/icon-dark.svg'),
      light: assetUrl('img/icon-light.svg')
    };
  }

  function firstMondayOfJanuary(year) {
    var y = Number(year);
    var dow = new Date(y, 0, 1).getDay();
    var date = 1 + (dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow);
    return y + '-01-' + (date < 10 ? '0' : '') + date;
  }

  function todayISO() {
    var d = new Date();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  function currentBienniumStart(today) {
    today = today || todayISO();
    var y = parseInt(String(today).slice(0, 4), 10);
    if (!isFinite(y)) y = 2025;
    if (y % 2 === 0) y -= 1;
    var start = firstMondayOfJanuary(y);
    if (today < start) {
      start = firstMondayOfJanuary(y - 2);
    }
    return start;
  }

  function nextBienniumStart(periodStart) {
    var y = parseInt(String(periodStart || currentBienniumStart()).slice(0, 4), 10);
    if (!isFinite(y)) y = 2025;
    if (y % 2 === 0) y += 1;
    else y += 2;
    return firstMondayOfJanuary(y);
  }

  function periodStartForReset(budget, today) {
    today = today || todayISO();
    var next = nextBienniumStart(budget && budget.p);
    if (today < next) return next;
    return currentBienniumStart(today);
  }

  function needsPeriodReset(budget, today) {
    if (!budget) return false;
    today = today || todayISO();
    var start = budget.p || currentBienniumStart(today);
    return today >= nextBienniumStart(start);
  }

  var UNPLANNED = '*';
  var CUSTOM_PREFIX = '#';
  var MAX_CAT_NAME = 40;

  function moneyRound(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  function toCents(dollars) {
    return Math.round((Number(dollars) || 0) * 100);
  }

  function fromCents(cents) {
    return moneyRound((Number(cents) || 0) / 100);
  }

  function emptyBudget(total, starting, period) {
    var n = Number(total);
    var s = Number(starting);
    return {
      v: 4,
      t: isFinite(n) ? n : DEFAULT_TOTAL,
      s: isFinite(s) ? s : 0,
      p: period || currentBienniumStart(),
      e: [],
      c: [],
      g: [],
      k: '',
      m: '',
      n: 0,
      o: 0,
      f: 0,
      h: []
    };
  }

  function parseGroups(raw) {
    if (!Array.isArray(raw)) return [];
    var list = [];
    raw.forEach(function (name) {
      name = String(name || '').trim().slice(0, 48);
      if (name) list.push(name);
    });
    return list;
  }

  function parseCategories(raw, fromStorageCents) {
    if (!Array.isArray(raw)) return [];
    var seen = {};
    var list = [];
    raw.forEach(function (row) {
      if (!row) return;
      var cat;
      if (Array.isArray(row)) {
        cat = {
          id: String(row[0] || ''),
          name: String(row[1] || '').trim().slice(0, MAX_CAT_NAME),
          planned: Number(row[2]) || 0,
          already: Number(row[3]) || 0,
          group: row.length > 4 && row[4] != null && row[4] !== '' ? Number(row[4]) : -1
        };
        if (fromStorageCents) {
          cat.planned = fromCents(cat.planned);
          cat.already = fromCents(cat.already);
        }
      } else {
        cat = {
          id: String(row.id || row.i || ''),
          name: String(row.name || row.n || '').trim().slice(0, MAX_CAT_NAME),
          planned: Number(row.planned != null ? row.planned : row.a) || 0,
          already: Number(row.already != null ? row.already : 0) || 0,
          group: row.group != null && row.group !== '' ? Number(row.group) : -1
        };
      }
      if (!cat.id || !cat.name || seen[cat.id]) return;
      if (!isFinite(cat.planned) || cat.planned < 0) cat.planned = 0;
      if (!isFinite(cat.already) || cat.already < 0) cat.already = 0;
      if (!isFinite(cat.group)) cat.group = -1;
      cat.planned = moneyRound(cat.planned);
      cat.already = moneyRound(cat.already);
      seen[cat.id] = true;
      list.push(cat);
    });
    return list;
  }

  function isCustomPacked(packed) {
    return typeof packed === 'string' && packed.charAt(0) === CUSTOM_PREFIX && packed.length > 1;
  }

  function customIdFromPacked(packed) {
    return isCustomPacked(packed) ? packed.slice(1) : '';
  }

  function packCustomId(id) {
    return CUSTOM_PREFIX + String(id);
  }

  function findPlanned(budget, id) {
    var list = (budget && budget.c) || [];
    var key = String(id || '');
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id) === key) return list[i];
    }
    return null;
  }

  function newPlannedId(budget) {
    var used = {};
    ((budget && budget.c) || []).forEach(function (cat) { used[String(cat.id)] = true; });
    var n = 0;
    var id;
    do {
      id = n.toString(36);
      n += 1;
    } while (used[id]);
    return id;
  }

  function sortPlanned(list) {
    return (list || []).slice().sort(function (a, b) {
      var an = String(a.name || '').toLowerCase();
      var bn = String(b.name || '').toLowerCase();
      if (an < bn) return -1;
      if (an > bn) return 1;
      return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
    });
  }

  function packCategory(x) {
    if (!x) return UNPLANNED;
    if (typeof x.catPacked !== 'undefined' && x.catPacked !== null && x.catPacked !== '') {
      return x.catPacked;
    }
    if (x.catId != null && String(x.catId) !== '') return packCustomId(x.catId);
    if (typeof x.catIndex === 'number' && x.catIndex >= 0 && x.catIndex < CATEGORIES.length) {
      if (x.catIndex === OTHER_INDEX) {
        var typed = String(x.catOther || '').trim();
        return typed ? typed : UNPLANNED;
      }
      return x.catIndex;
    }
    var name = String(x.cat || '').trim();
    if (!name || name === 'Other / Unplanned') return UNPLANNED;
    var idx = CATEGORIES.indexOf(name);
    if (idx >= 0 && idx !== OTHER_INDEX) return idx;
    if (idx === OTHER_INDEX) return UNPLANNED;
    return name;
  }

  function normalizeCatName(name) {
    return String(name || '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  /* Unambiguous maps from the old built-in state-report names to office categories. */
  var CATEGORY_ALIASES = {
    'blue book miscellaneous': 'Blue Book Misc',
    'in district travel staff': 'In-District Travel - Staff',
    'internet': "Calvin's Internet",
    'maint repair st owned bldg': 'Maintenance and Repair',
    'materials and supplies': 'Material and Office Supplies',
    'out state travel leg': 'Out of State Travel',
    'postage bulk mail': 'Postage - Bulk',
    'postage metered mail': 'Postage - Metered',
    'print business cards': 'Print - Business Cards',
    'print note cards': 'Print - Notecards',
    'registration fee leg': 'Registration Fee'
  };

  function rawCategoryLabel(packed, budget) {
    if (packed === UNPLANNED || packed === '' || packed == null) return packed === UNPLANNED ? 'Other / Unplanned' : '';
    if (isCustomPacked(packed)) {
      var found = findPlanned(budget, customIdFromPacked(packed));
      return found ? found.name : packed.slice(1);
    }
    if (typeof packed === 'number') {
      return CATEGORIES[packed] || 'Other';
    }
    var idx = CATEGORIES.indexOf(String(packed));
    if (idx >= 0) return CATEGORIES[idx];
    return String(packed);
  }

  function findPlannedByName(budget, name) {
    var list = (budget && budget.c) || [];
    var raw = String(name || '').trim();
    if (!raw) return null;
    var norm = normalizeCatName(raw);
    if (CATEGORY_ALIASES[norm]) {
      raw = CATEGORY_ALIASES[norm];
      norm = normalizeCatName(raw);
    }
    var lower = raw.toLowerCase();
    var i;
    for (i = 0; i < list.length; i++) {
      if (String(list[i].name || '').toLowerCase() === lower) return list[i];
    }
    for (i = 0; i < list.length; i++) {
      if (normalizeCatName(list[i].name) === norm) return list[i];
    }
    return null;
  }

  function resolvePlannedCategory(packed, budget) {
    if (isCustomPacked(packed)) {
      var byId = findPlanned(budget, customIdFromPacked(packed));
      if (byId) return byId;
    }
    return findPlannedByName(budget, rawCategoryLabel(packed, budget));
  }

  function categoryLabel(packed, budget) {
    var linked = resolvePlannedCategory(packed, budget);
    if (linked) return linked.name;
    return rawCategoryLabel(packed, budget);
  }

  function categoryGroupLabel(packed, budget) {
    var linked = resolvePlannedCategory(packed, budget);
    if (linked) return linked.name;
    if (packed === UNPLANNED || packed === '' || packed == null) return 'Other / Unplanned';
    if (isCustomPacked(packed)) return rawCategoryLabel(packed, budget);
    if (typeof packed === 'number') {
      return CATEGORIES[packed] || 'Other';
    }
    var idx = CATEGORIES.indexOf(String(packed));
    if (idx >= 0 && idx !== OTHER_INDEX) return CATEGORIES[idx];
    if (idx === OTHER_INDEX) return 'Other / Unplanned';
    return String(packed);
  }

  function unpackCategory(packed, budget) {
    var label = categoryLabel(packed, budget);
    var index = OTHER_INDEX;
    var other = '';
    var catId = customIdFromPacked(packed);
    if (isCustomPacked(packed) || packed === UNPLANNED) {
      index = -1;
    } else if (typeof packed === 'number' && packed >= 0 && packed < CATEGORIES.length) {
      index = packed;
    } else if (packed != null && packed !== '') {
      var found = CATEGORIES.indexOf(String(packed));
      if (found >= 0) index = found;
      else {
        index = -1;
        other = String(packed);
      }
    } else {
      index = -1;
    }
    if (index === OTHER_INDEX && typeof packed === 'number') other = '';
    return {
      catPacked: packed === '' || packed == null ? UNPLANNED : packed,
      catIndex: index,
      catOther: other,
      catId: catId,
      cat: other || label || 'Other / Unplanned'
    };
  }

  function parseExpense(row, budget) {
    if (!row) return null;
    var packed;
    var base;
    if (Array.isArray(row)) {
      packed = row[3];
      base = {
        id: String(row[0] || ''),
        date: String(row[1] || ''),
        desc: String(row[2] || ''),
        amount: Number(row[4]) || 0,
        by: String(row[5] || '')
      };
    } else if (typeof row === 'object') {
      packed = row.catPacked != null && row.catPacked !== '' ? row.catPacked : (row.catId || row.catIndex != null ? packCategory(row) : (row.cat || row.c));
      base = {
        id: String(row.id || row.i || ''),
        date: String(row.date || row.d || ''),
        desc: String(row.desc || row.n || ''),
        amount: Number(row.amount != null ? row.amount : row.a) || 0,
        by: String(row.by || '')
      };
    } else {
      return null;
    }
    var cat = unpackCategory(packed, budget);
    base.catPacked = cat.catPacked;
    base.catIndex = cat.catIndex;
    base.catOther = cat.catOther;
    base.catId = cat.catId;
    base.cat = cat.cat;
    return base;
  }

  function copyHookFields(target, source) {
    target.k = source && source.k ? String(source.k) : '';
    target.m = source && source.m ? String(source.m) : '';
    target.n = source && source.n ? Number(source.n) || 0 : 0;
    target.o = source && typeof source.o !== 'undefined' ? Number(source.o) || 0 : 0;
    target.f = source && source.f ? 1 : 0;
    if (source && Array.isArray(source.h)) {
      var ids = [];
      var seen = {};
      source.h.forEach(function (id) {
        id = String(id || '').trim();
        if (!id || seen[id]) return;
        seen[id] = true;
        ids.push(id);
      });
      target.h = ids;
    } else if (typeof target.h === 'undefined') {
      target.h = [];
    }
    return target;
  }

  function normalize(raw) {
    if (raw == null || raw === '') return null;
    if (typeof raw === 'number') {
      return emptyBudget(raw);
    }
    if (typeof raw !== 'object') return null;
    var fromCentsStored = Number(raw.v) >= 4;
    var budget = {
      v: 4,
      t: Number(raw.t) || 0,
      s: Number(raw.s) || 0,
      p: raw.p ? String(raw.p) : currentBienniumStart(),
      e: [],
      c: parseCategories(raw.c, fromCentsStored),
      g: parseGroups(raw.g)
    };
    copyHookFields(budget, raw);
    budget.e = Array.isArray(raw.e) ? raw.e.map(function (row) { return parseExpense(row, budget); }).filter(Boolean) : [];
    return budget;
  }

  function serializeCategory(cat) {
    var plannedCents = toCents(cat.planned);
    var alreadyCents = toCents(cat.already);
    var group = cat.group != null && isFinite(cat.group) ? Number(cat.group) : -1;
    if (alreadyCents === 0 && group < 0) {
      return [String(cat.id), String(cat.name).slice(0, MAX_CAT_NAME), plannedCents];
    }
    return [String(cat.id), String(cat.name).slice(0, MAX_CAT_NAME), plannedCents, alreadyCents, group < 0 ? -1 : group];
  }

  function serialize(budget) {
    var packed = {
      v: 4,
      t: Number(budget && budget.t) || 0,
      s: Number(budget && budget.s) || 0,
      p: String((budget && budget.p) || ''),
      e: ((budget && budget.e) || []).map(function (x) {
        return [
          String(x.id || ''),
          String(x.date || ''),
          String(x.desc || ''),
          packCategory(x),
          Number(x.amount) || 0,
          String(x.by || '')
        ];
      })
    };
    var cats = parseCategories(budget && budget.c);
    if (cats.length) packed.c = cats.map(serializeCategory);
    var groups = parseGroups(budget && budget.g);
    if (groups.length) packed.g = groups;
    if (budget && budget.k) packed.k = String(budget.k);
    if (budget && budget.m) packed.m = String(budget.m);
    if (budget && budget.n) packed.n = Number(budget.n) || 0;
    if (budget && budget.n) packed.o = Number(budget.o) || 0;
    if (budget && budget.f) packed.f = 1;
    if (budget && Array.isArray(budget.h) && budget.h.length) {
      var hid = [];
      var hseen = {};
      budget.h.forEach(function (id) {
        id = String(id || '').trim();
        if (!id || hseen[id]) return;
        hseen[id] = true;
        hid.push(id);
      });
      if (hid.length) packed.h = hid;
    }
    return packed;
  }

  var STORAGE_EXPENSE_KEY = 'e';
  var STORAGE_NAME_RE = /^\s*budget storage(?:\s+(\d+))?(?:\b.*)?$/i;

  function storageCardTitle(n) {
    return "Budget Storage " + Number(n) + " – Don't delete (budget data)";
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

  function storageIdsOf(budget) {
    return parseStorageIds(budget && budget.h);
  }

  function isStorageCardName(name) {
    return STORAGE_NAME_RE.test(String(name || ''));
  }

  function parseStorageIndex(name) {
    var match = String(name || '').trim().match(STORAGE_NAME_RE);
    if (!match) return 0;
    return match[1] ? Number(match[1]) : 1;
  }

  function serializeExpenseRows(list) {
    return (list || []).map(function (x) {
      return [
        String(x.id || ''),
        String(x.date || ''),
        String(x.desc || ''),
        packCategory(x),
        Number(x.amount) || 0,
        String(x.by || '')
      ];
    });
  }

  function packCardExpenses(list) {
    return { v: 4, e: serializeExpenseRows(list) };
  }

  function cardStorageSize(list) {
    return JSON.stringify({ e: packCardExpenses(list) }).length;
  }

  function parseCardExpenses(raw, budget) {
    if (raw == null || raw === '') return [];
    var rows = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.e) ? raw.e : []);
    return rows.map(function (row) { return parseExpense(row, budget); }).filter(Boolean);
  }

  function mergeExpenses(primary, secondary) {
    var out = [];
    var seen = {};
    function add(list) {
      (list || []).forEach(function (item) {
        if (!item || !item.id || seen[item.id]) return;
        seen[item.id] = true;
        out.push(item);
      });
    }
    add(primary);
    add(secondary);
    return out;
  }

  function boardPackedOf(budget, omitExpenses) {
    var packed = serialize(budget);
    if (omitExpenses) delete packed.e;
    else if (packed.e && !packed.e.length) delete packed.e;
    var ids = storageIdsOf(budget);
    if (ids.length) packed.h = ids;
    else delete packed.h;
    return packed;
  }

  function boardStorageSize(budget, omitExpenses) {
    return JSON.stringify({ b: boardPackedOf(budget, omitExpenses) }).length;
  }

  function planStorage(budget) {
    var ids = storageIdsOf(budget);
    var expenses = (budget && budget.e) || [];
    var onCards = ids.length > 0;
    var boardSize = boardStorageSize(budget, onCards);
    var boardOver = boardSize > PLUGIN_LIMIT;
    if (!onCards) {
      var used = boardStorageSize(budget, false);
      return {
        ids: [],
        onCards: false,
        boardPacked: boardPackedOf(budget, false),
        boardSize: used,
        chunks: [],
        leftover: [],
        used: used,
        limit: PLUGIN_LIMIT,
        cardCount: 0,
        full: used > PLUGIN_LIMIT,
        needCard: false,
        needSetup: true,
        nextTitle: storageCardTitle(1)
      };
    }
    var remaining = expenses.slice();
    var chunks = [];
    var i;
    for (i = 0; i < ids.length; i++) {
      var chunk = [];
      while (remaining.length) {
        var trial = chunk.concat([remaining[0]]);
        if (cardStorageSize(trial) > PLUGIN_LIMIT) break;
        chunk.push(remaining.shift());
      }
      chunks.push({
        id: ids[i],
        list: chunk,
        size: cardStorageSize(chunk)
      });
    }
    var cardUsed = 0;
    chunks.forEach(function (chunk) { cardUsed += chunk.size; });
    var needCard = remaining.length > 0;
    return {
      ids: ids,
      onCards: true,
      boardPacked: boardPackedOf(budget, true),
      boardSize: boardSize,
      chunks: chunks,
      leftover: remaining,
      used: boardSize + cardUsed,
      limit: PLUGIN_LIMIT * (1 + ids.length),
      cardCount: ids.length,
      full: boardOver,
      needCard: needCard,
      needSetup: false,
      nextTitle: storageCardTitle(ids.length + 1)
    };
  }

  function storageSize(budget) {
    return planStorage(budget).used;
  }

  function storageInfo(budget) {
    var plan = planStorage(budget);
    var store = budget && budget._storage;
    var cardCount = plan.cardCount || (store && store.ids && store.ids.length) || 0;
    var needSetup = cardCount === 0;
    var ratio = plan.limit ? plan.used / plan.limit : 0;
    var full = plan.full || plan.needCard;
    return {
      used: plan.used,
      limit: plan.limit,
      ratio: ratio,
      percent: full && plan.used >= plan.limit ? 100 : Math.min(99, Math.round(ratio * 100)),
      warn: !full && ratio >= WARN_RATIO,
      full: !!plan.full,
      needCard: !!plan.needCard,
      needSetup: needSetup,
      cardCount: cardCount,
      nextTitle: plan.nextTitle,
      missing: (store && store.missing) || []
    };
  }

  function wouldFit(budget) {
    var plan = planStorage(budget);
    return !plan.full && !plan.needCard;
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

  function resolveStorageCards(t, budget) {
    var known = storageIdsOf(budget);
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
        nextTitle: storageCardTitle(ids.length + 1),
        missing: []
      };
    });
  }

  function readCardExpenses(t, ids, budget, store) {
    var missing = (store && store.missing) || [];
    var reads = (ids || []).map(function (id) {
      return Promise.resolve().then(function () {
        return t.get(id, 'shared', STORAGE_EXPENSE_KEY);
      }).then(function (raw) {
        return parseCardExpenses(raw, budget);
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

  function writeCardExpenses(t, chunks) {
    var writes = (chunks || []).map(function (chunk) {
      return Promise.resolve().then(function () {
        return t.set(chunk.id, 'shared', STORAGE_EXPENSE_KEY, packCardExpenses(chunk.list));
      });
    });
    return Promise.all(writes);
  }

  function clearCardExpenses(t, ids) {
    var writes = (ids || []).map(function (id) {
      return Promise.resolve().then(function () {
        if (typeof t.remove === 'function') {
          return t.remove(id, 'shared', STORAGE_EXPENSE_KEY);
        }
        return t.set(id, 'shared', STORAGE_EXPENSE_KEY, packCardExpenses([]));
      }).catch(function () {
        return t.set(id, 'shared', STORAGE_EXPENSE_KEY, packCardExpenses([]));
      });
    });
    return Promise.all(writes);
  }

  function rejectStorage(code, extra) {
    var err = new Error(code);
    err.code = code;
    if (extra) {
      Object.keys(extra).forEach(function (key) { err[key] = extra[key]; });
    }
    return Promise.reject(err);
  }

  function load(t) {
    return Promise.resolve().then(function () {
      return t.get('board', 'shared', STORAGE_KEY);
    }).then(function (raw) {
      var budget = normalize(raw);
      return resolveStorageCards(t, budget).then(function (store) {
        if (!budget) {
          return { budget: null, store: store };
        }
        budget.h = store.ids.slice();
        var boardExpenses = (budget.e || []).slice();
        return readCardExpenses(t, store.ids, budget, store).then(function (cardExpenses) {
          budget.e = mergeExpenses(cardExpenses, boardExpenses);
          budget._storage = store;
          var shouldMigrate = store.ids.length > 0 && boardExpenses.length > 0;
          if (!shouldMigrate) return { budget: budget, store: store };
          return save(t, budget).then(function () {
            budget._storage = store;
            return { budget: budget, store: store };
          }).catch(function (err) {
            budget.e = mergeExpenses(cardExpenses, boardExpenses);
            store.migrateError = err;
            budget._storage = store;
            return { budget: budget, store: store };
          });
        });
      });
    }).then(function (result) {
      return result.budget;
    });
  }

  function save(t, budget) {
    var next = withMeta(budget);
    return resolveStorageCards(t, next).then(function (store) {
      next.h = store.ids.slice();
      next._storage = store;
      var plan = planStorage(next);
      if (plan.full) {
        return rejectStorage('FULL', { size: plan.boardSize, used: plan.used, limit: plan.limit });
      }
      if (plan.needCard) {
        return rejectStorage('NEED_CARD', { title: plan.nextTitle, leftover: plan.leftover.length });
      }
      var writes = plan.onCards ? writeCardExpenses(t, plan.chunks) : Promise.resolve();
      return writes.then(function () {
        return t.set('board', 'shared', STORAGE_KEY, plan.boardPacked);
      });
    });
  }

  function remove(t) {
    return Promise.resolve().then(function () {
      return t.get('board', 'shared', STORAGE_KEY);
    }).then(function (raw) {
      var ids = parseStorageIds(raw && raw.h);
      return clearCardExpenses(t, ids).then(function () {
        if (typeof t.remove === 'function') return t.remove('board', 'shared', STORAGE_KEY);
        return t.set('board', 'shared', STORAGE_KEY, null);
      });
    });
  }

  function setupCardMessage() {
    return 'To keep more expenses than Trello allows on the board itself, add a card named “' + storageCardTitle(1) + '”, then reopen Office Budget. You can archive that card afterward so it stays off the board — just don’t delete it.';
  }

  function needCardMessage(title) {
    return 'To save more expenses, add a card named “' + (title || storageCardTitle(1)) + '”, then reopen Office Budget. You can archive that card afterward so it stays off the board — just don’t delete it.';
  }

  function fullMessage() {
    return 'Trello’s storage for this budget is full. Use Archive / roll up to fold logged expenses into already spent, or add another card named like “' + storageCardTitle(2) + '” and reopen Office Budget.';
  }

  function warnMessage(info) {
    var extra = info && info.cardCount ? ' across the board and ' + info.cardCount + ' storage card' + (info.cardCount === 1 ? '' : 's') : '';
    return 'Storage is getting full (' + (info && info.percent) + '% of Trello’s limit' + extra + '). After you reconcile with the state report, use Archive / roll up to free space, or add another Budget Storage card.';
  }

  function saveErrorMessage(err) {
    if (err && err.code === 'NEED_CARD') return needCardMessage(err.title);
    if (err && (err.code === 'FULL' || (err.message && String(err.message).indexOf('4096') !== -1))) return fullMessage();
    return 'Could not save. Please try again.';
  }

  function storageLineText(info) {
    var cards = info.cardCount || 0;
    var where = cards ? (' across the board and ' + cards + ' storage card' + (cards === 1 ? '' : 's')) : " of Trello’s board limit";
    if (!cards) where = " of Trello’s board limit";
    else where = ' across the board and ' + cards + ' storage card' + (cards === 1 ? '' : 's');
    return 'Storage used: ' + info.percent + '%' + where + ' (' + info.used + ' of ' + info.limit + ' characters).';
  }


  function alreadyTotalOf(budget) {
    var sum = 0;
    ((budget && budget.c) || []).forEach(function (cat) {
      sum += Number(cat.already) || 0;
    });
    return moneyRound(sum);
  }

  function startingSpentOf(budget) {
    return moneyRound(budget && budget.s);
  }

  /* Overall already-spent is at least the sum of per-category carried-in
     amounts, so a board with s=0 still counts category starting spend.
     If s is larger, the extra is unitemized. Never add both. */
  function effectiveStartingOf(budget) {
    return moneyRound(Math.max(startingSpentOf(budget), alreadyTotalOf(budget)));
  }

  function loggedSpentOf(budget) {
    if (!budget || !budget.e) return 0;
    var sum = 0;
    for (var i = 0; i < budget.e.length; i++) {
      sum += Number(budget.e[i].amount) || 0;
    }
    return moneyRound(sum);
  }

  function spentOf(budget) {
    return moneyRound(effectiveStartingOf(budget) + loggedSpentOf(budget));
  }

  function leftOf(budget) {
    return Math.round(((Number(budget && budget.t) || 0) - spentOf(budget)) * 100) / 100;
  }

  function isOverspent(budget) {
    return !!budget && leftOf(budget) < 0;
  }

  function percentRemaining(budget) {
    var total = Number(budget && budget.t) || 0;
    if (total <= 0) return leftOf(budget) >= 0 ? 0 : -100;
    return Math.round((leftOf(budget) / total) * 100);
  }

  function formatPercentRemaining(pct) {
    return pct + '% remaining';
  }

  function formatMoney(value) {
    var num = Number(value);
    if (!isFinite(num)) num = 0;
    var negative = num < 0;
    var abs = Math.abs(num);
    var hasCents = Math.round(abs * 100) % 100 !== 0;
    var formatted = abs.toLocaleString('en-US', {
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: 2
    });
    return (negative ? '-$' : '$') + formatted;
  }

  function parseMoney(value) {
    if (typeof value === 'number') {
      return isFinite(value) ? value : NaN;
    }
    var s = String(value || '').trim();
    if (!s) return NaN;
    s = s.replace(/[^0-9.-]/g, '');
    if (!s || s === '-' || s === '.' || s === '-.') return NaN;
    var n = parseFloat(s);
    return isFinite(n) ? Math.round(n * 100) / 100 : NaN;
  }

  function formatDate(iso) {
    if (!iso) return '';
    var parts = String(iso).split('-');
    if (parts.length !== 3) return String(iso);
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var m = parseInt(parts[1], 10);
    var d = parseInt(parts[2], 10);
    var y = parts[0];
    if (!m || m < 1 || m > 12) return String(iso);
    return months[m - 1] + ' ' + d + ', ' + y;
  }

  function formatPeriod(periodStart) {
    if (!periodStart) return '';
    return 'Period: ' + formatDate(periodStart) + ' –';
  }

  function newId() {
    return Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
  }

  function findExpense(budget, id) {
    if (!budget || !budget.e) return null;
    for (var i = 0; i < budget.e.length; i++) {
      if (budget.e[i].id === id) return budget.e[i];
    }
    return null;
  }

  function withMeta(budget, extras) {
    var next = {
      v: 4,
      t: budget.t,
      s: startingSpentOf(budget),
      p: budget.p || currentBienniumStart(),
      e: (budget.e || []).slice(),
      c: parseCategories(budget && budget.c),
      g: parseGroups(budget && budget.g)
    };
    copyHookFields(next, budget);
    if (extras) {
      if (typeof extras.t !== 'undefined') next.t = extras.t;
      if (typeof extras.s !== 'undefined') next.s = extras.s;
      if (typeof extras.p !== 'undefined') next.p = extras.p;
      if (typeof extras.e !== 'undefined') next.e = extras.e;
      if (typeof extras.c !== 'undefined') next.c = parseCategories(extras.c);
      if (typeof extras.g !== 'undefined') next.g = parseGroups(extras.g);
      if (typeof extras.k !== 'undefined') next.k = extras.k ? String(extras.k) : '';
      if (typeof extras.m !== 'undefined') next.m = extras.m ? String(extras.m) : '';
      if (typeof extras.n !== 'undefined') next.n = Number(extras.n) || 0;
      if (typeof extras.o !== 'undefined') next.o = Number(extras.o) || 0;
      if (typeof extras.f !== 'undefined') next.f = extras.f ? 1 : 0;
    }
    return next;
  }

  function upsertExpense(budget, expense) {
    var next = withMeta(budget);
    var found = false;
    for (var i = 0; i < next.e.length; i++) {
      if (next.e[i].id === expense.id) {
        next.e[i] = expense;
        found = true;
        break;
      }
    }
    if (!found) next.e.push(expense);
    return next;
  }

  function deleteExpense(budget, id) {
    return withMeta(budget, {
      e: (budget.e || []).filter(function (x) { return x.id !== id; })
    });
  }

  function rollUp(budget) {
    var next = withMeta(budget);
    var spentById = {};
    (next.e || []).forEach(function (item) {
      var packed = (item.catPacked != null && item.catPacked !== '') ? item.catPacked : packCategory(item);
      if (isCustomPacked(packed) && findPlanned(next, customIdFromPacked(packed))) {
        var id = customIdFromPacked(packed);
        spentById[id] = (spentById[id] || 0) + (Number(item.amount) || 0);
      }
    });
    next.c = next.c.map(function (cat) {
      return {
        id: cat.id,
        name: cat.name,
        planned: cat.planned,
        already: moneyRound((Number(cat.already) || 0) + (spentById[cat.id] || 0)),
        group: cat.group
      };
    });
    next.s = spentOf(budget);
    next.e = [];
    return next;
  }

  function startNewPeriod(budget, today) {
    var start = periodStartForReset(budget, today);
    var next = emptyBudget(DEFAULT_TOTAL, 0, start);
    next.c = parseCategories(budget && budget.c).map(function (cat) {
      return { id: cat.id, name: cat.name, planned: cat.planned, already: 0, group: cat.group };
    });
    next.g = parseGroups(budget && budget.g);
    next.k = budget && budget.k ? String(budget.k) : '';
    next.m = '';
    next.n = 0;
    next.o = 0;
    next.f = 1;
    next.h = Array.isArray(budget && budget.h) ? budget.h.slice() : [];
    return next;
  }

  function upsertPlannedCategory(budget, fields) {
    var next = withMeta(budget);
    var name = String((fields && fields.name) || '').trim().slice(0, MAX_CAT_NAME);
    var planned = Number(fields && fields.planned);
    if (!name) {
      var err = new Error('NAME');
      err.code = 'NAME';
      throw err;
    }
    if (!isFinite(planned) || planned < 0) {
      var amtErr = new Error('AMOUNT');
      amtErr.code = 'AMOUNT';
      throw amtErr;
    }
    planned = moneyRound(planned);
    var id = fields && fields.id != null && String(fields.id) !== '' ? String(fields.id) : newPlannedId(next);
    var lower = name.toLowerCase();
    for (var i = 0; i < next.c.length; i++) {
      if (String(next.c[i].id) !== id && String(next.c[i].name).toLowerCase() === lower) {
        var dup = new Error('DUP');
        dup.code = 'DUP';
        throw dup;
      }
    }
    var alreadyProvided = fields && typeof fields.already !== 'undefined';
    var groupProvided = fields && typeof fields.group !== 'undefined';
    var already = alreadyProvided ? Number(fields.already) : 0;
    if (!isFinite(already) || already < 0) already = 0;
    already = moneyRound(already);
    var group = groupProvided ? Number(fields.group) : -1;
    if (!isFinite(group)) group = -1;
    var found = false;
    for (var j = 0; j < next.c.length; j++) {
      if (String(next.c[j].id) === id) {
        next.c[j] = {
          id: id,
          name: name,
          planned: planned,
          already: alreadyProvided ? already : (Number(next.c[j].already) || 0),
          group: groupProvided ? group : (next.c[j].group != null ? next.c[j].group : -1)
        };
        found = true;
        break;
      }
    }
    if (!found) next.c.push({ id: id, name: name, planned: planned, already: already, group: group });
    return next;
  }

  function deletePlannedCategory(budget, id) {
    var next = withMeta(budget);
    var cat = findPlanned(next, id);
    if (!cat) return next;
    var packed = packCustomId(id);
    next.e = next.e.map(function (item) {
      var itemPacked = (item.catPacked != null && item.catPacked !== '') ? item.catPacked : packCategory(item);
      if (itemPacked !== packed) return item;
      var copy = {};
      Object.keys(item).forEach(function (key) { copy[key] = item[key]; });
      copy.catPacked = cat.name;
      copy.catId = '';
      copy.catIndex = -1;
      copy.catOther = cat.name;
      copy.cat = cat.name;
      return copy;
    });
    next.c = next.c.filter(function (row) { return String(row.id) !== String(id); });
    return next;
  }

  function sortExpenses(list) {
    return (list || []).slice().sort(function (a, b) {
      if (a.date > b.date) return -1;
      if (a.date < b.date) return 1;
      if (a.id > b.id) return -1;
      if (a.id < b.id) return 1;
      return 0;
    });
  }

  function categoryTotals(budget) {
    var groups = {};
    var order = [];
    ((budget && budget.e) || []).forEach(function (item) {
      var packed = (item.catPacked != null && item.catPacked !== '') ? item.catPacked : packCategory(item);
      var label = categoryGroupLabel(packed, budget);
      if (!groups[label]) {
        groups[label] = 0;
        order.push(label);
      }
      groups[label] += Number(item.amount) || 0;
    });
    return order.map(function (label) {
      return { label: label, amount: Math.round(groups[label] * 100) / 100 };
    }).sort(function (a, b) {
      if (b.amount !== a.amount) return b.amount - a.amount;
      return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
    });
  }

  var UNITEMIZED_LABEL = 'Other / unitemized';

  function categoriesInSheetOrder(budget) {
    var list = ((budget && budget.c) || []).slice();
    var grouped = list.some(function (cat) { return cat.group != null && cat.group >= 0; });
    if (!grouped) return sortPlanned(list);
    return list;
  }

  function plannedTracking(budget) {
    var spentById = {};
    var unplannedGroups = {};
    var unplannedOrder = [];
    var unplannedLogged = 0;
    ((budget && budget.e) || []).forEach(function (item) {
      var packed = (item.catPacked != null && item.catPacked !== '') ? item.catPacked : packCategory(item);
      var amount = Number(item.amount) || 0;
      var linked = resolvePlannedCategory(packed, budget);
      if (linked) {
        var id = linked.id;
        spentById[id] = (spentById[id] || 0) + amount;
      } else {
        unplannedLogged += amount;
        var label = categoryGroupLabel(packed, budget);
        if (!unplannedGroups[label]) {
          unplannedGroups[label] = 0;
          unplannedOrder.push(label);
        }
        unplannedGroups[label] += amount;
      }
    });
    var alreadyTotal = 0;
    var categories = categoriesInSheetOrder(budget).map(function (cat) {
      var logged = moneyRound(spentById[cat.id] || 0);
      var already = moneyRound(cat.already);
      alreadyTotal += already;
      var spent = moneyRound(already + logged);
      var planned = moneyRound(cat.planned);
      var left = moneyRound(planned - spent);
      var usedPct = planned > 0 ? Math.round((spent / planned) * 100) : 0;
      var status = 'ok';
      if (planned <= 0) status = 'none';
      else if (spent > planned) status = 'over';
      else if (usedPct >= 90) status = 'warn';
      var groupIndex = cat.group != null && isFinite(cat.group) ? Number(cat.group) : -1;
      var groupName = groupIndex >= 0 && budget && budget.g && budget.g[groupIndex] ? budget.g[groupIndex] : '';
      return {
        id: cat.id,
        name: cat.name,
        planned: planned,
        already: already,
        logged: logged,
        spent: spent,
        left: left,
        usedPct: usedPct,
        status: status,
        group: groupIndex,
        groupName: groupName
      };
    });
    var totalPlanned = 0;
    categories.forEach(function (row) { totalPlanned += row.planned; });
    totalPlanned = moneyRound(totalPlanned);
    var biennium = moneyRound(budget && budget.t);
    var unallocated = moneyRound(biennium - totalPlanned);
    var unitemized = moneyRound(Math.max(0, startingSpentOf(budget) - alreadyTotal));
    var unplannedSpent = moneyRound(unplannedLogged + unitemized);
    var groups = unplannedOrder.map(function (label) {
      return { label: label, amount: moneyRound(unplannedGroups[label]) };
    });
    if (unitemized > 0) groups.push({ label: UNITEMIZED_LABEL, amount: unitemized });
    groups.sort(function (a, b) {
      if (b.amount !== a.amount) return b.amount - a.amount;
      return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
    });
    return {
      categories: categories,
      totalPlanned: totalPlanned,
      biennium: biennium,
      unallocated: unallocated,
      overPlanned: unallocated < 0,
      unitemized: unitemized,
      alreadyTotal: moneyRound(alreadyTotal),
      unplannedLogged: moneyRound(unplannedLogged),
      unplannedSpent: unplannedSpent,
      unplannedGroups: groups
    };
  }

  function frontBadges(budget) {
    if (!budget) return [];
    var spent = spentOf(budget);
    var left = leftOf(budget);
    var over = left < 0;
    return [
      {
        text: 'Left: ' + formatMoney(left),
        color: over ? 'red' : 'green'
      },
      {
        text: 'Spent: ' + formatMoney(spent),
        color: 'red'
      }
    ];
  }

  function detailBadges(budget) {
    if (!budget) return [];
    var spent = spentOf(budget);
    var left = leftOf(budget);
    var over = left < 0;
    var pct = percentRemaining(budget);
    var badges = [];
    if (over) {
      badges.push({
        title: 'Status',
        text: 'Overspent',
        color: 'red'
      });
    }
    badges.push({
      title: 'Left',
      text: formatMoney(left),
      color: over ? 'red' : 'green',
      callback: function (t) {
        return t.popup({
          title: 'Edit budget',
          url: './settings/total.html',
          height: 520
        });
      }
    });
    badges.push({
      title: 'Spent',
      text: formatMoney(spent),
      color: 'red',
      callback: function (t) {
        return t.popup({
          title: 'Add expense',
          url: './expense.html',
          height: 520
        });
      }
    });
    badges.push({
      title: 'Remaining',
      text: formatPercentRemaining(pct),
      color: over ? 'red' : (pct <= 15 ? 'yellow' : 'green'),
      callback: function (t) {
        return t.popup({
          title: 'Edit budget',
          url: './settings/total.html',
          height: 520
        });
      }
    });
    return badges;
  }

  function applyTheme(t) {
    var context = typeof t.getContext === 'function' ? t.getContext() : null;
    var theme = (context && context.theme) || 'light';
    document.body.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
    if (typeof t.subscribeToThemeChanges === 'function') {
      t.subscribeToThemeChanges(function (next) {
        document.body.setAttribute('data-theme', next === 'dark' ? 'dark' : 'light');
      });
    }
  }

  function showError(el, message) {
    if (!el) return;
    if (!message) {
      el.textContent = '';
      el.className = 'error';
      return;
    }
    el.textContent = message;
    el.className = 'error is-visible';
  }



  var OFFICE_GROUPS = [
    'Spring Survey',
    'Spring Newsletter',
    'Internet + Social Media',
    'Travel / Registration',
    'Misc',
    'Postage',
    'Print',
    'Maintenance / Unallocated'
  ];

  // planned2027 and actual2025 are integer cents used only to seed starting category amounts.
  // "SOCIAL MEDIA BOOTING" is stored as "Social Media Boosting".
  var OFFICE_LINES = [
    { name: 'Spring Survey - Printing', group: 0, planned2027: 75000, actual2025: 69661 },
    { name: 'Spring Survey - Paper', group: 0, planned2027: 35000, actual2025: 26132 },
    { name: 'Spring Survey - Addressing', group: 0, planned2027: 75000, actual2025: 64604 },
    { name: 'Spring Survey - Postage', group: 0, planned2027: 320000, actual2025: 249485 },
    { name: 'Spring Newsletter - Printing', group: 1, planned2027: 75000, actual2025: 65609 },
    { name: 'Spring Newsletter - Paper', group: 1, planned2027: 85000, actual2025: 74907 },
    { name: 'Spring Newsletter - Addressing', group: 1, planned2027: 95000, actual2025: 82609 },
    { name: 'Spring Newsletter - Postage', group: 1, planned2027: 650000, actual2025: 539713 },
    { name: "Calvin's Internet", group: 2, planned2027: 140000, actual2025: 0 },
    { name: 'Social Media Boosting', group: 2, planned2027: 200000, actual2025: 171582 },
    { name: 'Registration Fee - Staff', group: 3, planned2027: 20000, actual2025: 0 },
    { name: 'In-District Travel - Staff', group: 3, planned2027: 100000, actual2025: 0 },
    { name: 'Registration Fee', group: 3, planned2027: 40000, actual2025: 0 },
    { name: 'Out of State Travel', group: 3, planned2027: 100000, actual2025: 122000 },
    { name: 'Blue Book Misc', group: 4, planned2027: 10000, actual2025: 5000 },
    { name: 'Flags', group: 4, planned2027: 35000, actual2025: 0 },
    { name: 'Subscriptions', group: 4, planned2027: 175000, actual2025: 0 },
    { name: 'GIS Requests', group: 4, planned2027: 7500, actual2025: 0 },
    { name: 'Citations', group: 4, planned2027: 10000, actual2025: 7690 },
    { name: 'School Group Postcards', group: 4, planned2027: 2500, actual2025: 0 },
    { name: 'Material and Office Supplies', group: 4, planned2027: 20000, actual2025: 0 },
    { name: 'Color Copies', group: 4, planned2027: 1000, actual2025: 0 },
    { name: 'Postage - Bulk', group: 5, planned2027: 0, actual2025: 0 },
    { name: 'Postage - Metered', group: 5, planned2027: 0, actual2025: 0 },
    { name: 'Postage', group: 5, planned2027: 0, actual2025: 0 },
    { name: 'Print - Business Cards', group: 6, planned2027: 15000, actual2025: 0 },
    { name: 'Print - Notecards', group: 6, planned2027: 0, actual2025: 0 },
    { name: 'Print - Notecard Envelopes', group: 6, planned2027: 0, actual2025: 0 },
    { name: 'Print - Sticker Business Cards', group: 6, planned2027: 10000, actual2025: 0 },
    { name: 'Print - Letterhead', group: 6, planned2027: 50000, actual2025: 0 },
    { name: 'Print - Letterhead Envelopes', group: 6, planned2027: 40000, actual2025: 0 },
    { name: 'Print - Saw You in the News', group: 6, planned2027: 0, actual2025: 0 },
    { name: 'Maintenance and Repair', group: 7, planned2027: 10000, actual2025: 0 },
    { name: 'Unallocated / Contingency', group: 7, planned2027: 0, actual2025: 0 }
  ];

  var OFFICE_PLANNED_2027 = 23960;
  var OFFICE_ACTUAL_2025 = 14789.92;

  function groupClassFor(name) {
    return '';
  }

  function ensureGroupIndex(groups, name) {
    var lower = String(name || '').toLowerCase();
    var i;
    for (i = 0; i < groups.length; i++) {
      if (String(groups[i]).toLowerCase() === lower) return i;
    }
    groups.push(name);
    return groups.length - 1;
  }

  function shouldCarryInStarting(budget) {
    var period = String((budget && budget.p) || currentBienniumStart());
    return period < '2027-01-04';
  }

  function categoryHasSpend(budget, cat) {
    var already = Number(cat && cat.already) || 0;
    if (already > 0) return true;
    var packedWant = packCustomId(cat.id);
    var i;
    for (i = 0; i < ((budget && budget.e) || []).length; i++) {
      var item = budget.e[i];
      var packed = (item.catPacked != null && item.catPacked !== '') ? item.catPacked : packCategory(item);
      var linked = resolvePlannedCategory(packed, budget);
      if (linked && String(linked.id) === String(cat.id)) return true;
      if (packed === packedWant) return true;
    }
    return false;
  }

  function relinkExpenses(budget) {
    var next = withMeta(budget);
    var changed = false;
    next.e = (next.e || []).map(function (item) {
      var packed = (item.catPacked != null && item.catPacked !== '') ? item.catPacked : packCategory(item);
      var cat = resolvePlannedCategory(packed, next);
      if (!cat) return item;
      var want = packCustomId(cat.id);
      if (String(packed) === want) return item;
      var copy = {};
      Object.keys(item).forEach(function (key) { copy[key] = item[key]; });
      copy.catPacked = want;
      copy.catId = cat.id;
      copy.cat = cat.name;
      copy.catIndex = -1;
      copy.catOther = '';
      changed = true;
      return copy;
    });
    return { budget: next, changed: changed };
  }

  function ensureOfficeCategories(budget, options) {
    options = options || {};
    var force = !!options.force;
    var next = withMeta(budget);
    if (next.f && !force && next.c && next.c.length) {
      return { budget: next, changed: false, added: 0, updated: 0, droppedZero: false };
    }
    var groups = parseGroups(next.g);
    OFFICE_GROUPS.forEach(function (name) { ensureGroupIndex(groups, name); });
    var byName = {};
    next.c.forEach(function (cat) {
      byName[String(cat.name || '').toLowerCase()] = cat;
    });
    var carry = shouldCarryInStarting(next);
    var added = [];
    var updated = 0;
    OFFICE_LINES.forEach(function (line) {
      var key = String(line.name || '').toLowerCase();
      var groupIndex = ensureGroupIndex(groups, OFFICE_GROUPS[line.group]);
      if (byName[key]) {
        if (byName[key].group == null || byName[key].group < 0) {
          byName[key].group = groupIndex;
          updated += 1;
        }
        if (force && carry && !categoryHasSpend(next, byName[key]) && (line.actual2025 || 0) > 0) {
          byName[key].already = fromCents(line.actual2025);
          updated += 1;
        }
        return;
      }
      var cat = {
        id: newPlannedId({ c: next.c.concat(added) }),
        name: line.name,
        planned: 0,
        already: carry ? fromCents(line.actual2025) : 0,
        group: groupIndex
      };
      added.push(cat);
    });
    next.g = groups;
    next.c = next.c.concat(added);
    next.f = 1;
    var droppedZero = false;
    if (!wouldFit(next)) {
      var addedIds = {};
      added.forEach(function (cat) { addedIds[cat.id] = true; });
      next.c = next.c.filter(function (cat) {
        if (!addedIds[cat.id]) return true;
        return (Number(cat.already) || 0) > 0 || (Number(cat.planned) || 0) > 0;
      });
      droppedZero = true;
    }
    return {
      budget: next,
      changed: true,
      added: added.length,
      updated: updated,
      droppedZero: droppedZero,
      lineCount: next.c.length
    };
  }


  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function chicagoParts(date) {
    var d = date ? new Date(date) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    var parts = {};
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).formatToParts(d).forEach(function (part) {
      if (part.type !== 'literal') parts[part.type] = part.value;
    });
    return parts;
  }

  function chicagoYearMonth(date) {
    var parts = chicagoParts(date);
    return parts.year + '-' + parts.month;
  }

  function previousYearMonth(ym) {
    ym = String(ym || chicagoYearMonth());
    var y = parseInt(ym.slice(0, 4), 10);
    var m = parseInt(ym.slice(5, 7), 10);
    if (!isFinite(y) || !isFinite(m)) return chicagoYearMonth();
    m -= 1;
    if (m < 1) { m = 12; y -= 1; }
    return y + '-' + pad2(m);
  }

  function isLeapYear(year) {
    var y = Number(year);
    return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
  }

  function lastDayOfMonth(year, month) {
    var y = Number(year);
    var m = Number(month);
    var lengths = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (m === 2 && isLeapYear(y)) return 29;
    if (m < 1 || m > 12) return 0;
    return lengths[m];
  }

  function isLastDayOfMonth(year, month, day) {
    var d = Number(day);
    return d > 0 && d === lastDayOfMonth(year, month);
  }

  function formatDateTimeChicago(ms) {
    var parts = chicagoParts(ms);
    return parts.month + '/' + parts.day + '/' + parts.year + ' ' + parts.hour + ':' + parts.minute + ' ' + (parts.dayPeriod || '') + ' CT';
  }

  function validateWebhookUrl(url) {
    url = String(url || '').trim();
    if (!url) return { ok: true, url: '', hint: '' };
    var lower = url.toLowerCase();
    if (lower.indexOf('javascript:') === 0 || lower.indexOf('data:') === 0) {
      return { ok: false, error: 'URL' };
    }
    var isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url);
    var isHttps = /^https:\/\//i.test(url);
    if (!isHttps && !isLocal) return { ok: false, error: 'HTTPS' };
    var hint = '';
    if (/script\.google\.com\/macros\/s\/[^/]+\/exec/i.test(url)) hint = 'apps-script';
    else if (isLocal) hint = 'local';
    else hint = 'other';
    return { ok: true, url: url, hint: hint };
  }

  function setWebhookUrl(budget, url) {
    var checked = validateWebhookUrl(url);
    if (!checked.ok) {
      var err = new Error(checked.error);
      err.code = checked.error;
      throw err;
    }
    return withMeta(budget, { k: checked.url });
  }

  function markWebhookResult(budget, fields) {
    var next = withMeta(budget);
    next.n = (fields && fields.at) || Date.now();
    next.o = fields && fields.ok ? 1 : 0;
    if (fields && fields.ok && fields.month) next.m = String(fields.month);
    return next;
  }

  function postWebhook(url, payload) {
    return fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).then(function () {
      return { ok: true };
    });
  }

  function expensesInMonth(budget, yearMonth) {
    var prefix = String(yearMonth || '');
    return ((budget && budget.e) || []).filter(function (item) {
      return String(item.date || '').slice(0, 7) === prefix;
    });
  }

  function buildMonthlyPayload(budget, reportMonth, sentBy, mode) {
    var track = plannedTracking(budget);
    var spent = spentOf(budget);
    var left = leftOf(budget);
    var monthExpenses = expensesInMonth(budget, reportMonth);
    var monthTotal = 0;
    monthExpenses.forEach(function (item) { monthTotal += Number(item.amount) || 0; });
    var payload = {
      office: 'Callahan Office',
      generatedAt: new Date().toISOString(),
      reportMonth: reportMonth,
      periodStart: (budget && budget.p) || currentBienniumStart(),
      periodEnd: nextBienniumStart(budget && budget.p),
      bienniumBudget: moneyRound(budget && budget.t),
      alreadySpent: effectiveStartingOf(budget),
      totalSpent: moneyRound(spent),
      left: moneyRound(left),
      percentUsed: budget && budget.t ? Math.round((spent / budget.t) * 100) : 0,
      percentRemaining: percentRemaining(budget),
      planned: track.categories.map(function (row) {
        return {
          group: row.groupName || '',
          name: row.name,
          planned: row.planned,
          spent: row.spent,
          left: row.left,
          percentUsed: row.usedPct
        };
      }),
      unplanned: {
        total: track.unplannedSpent,
        unitemized: track.unitemized,
        groups: track.unplannedGroups
      },
      expenses: sortExpenses((budget && budget.e) || []).map(function (item) {
        return {
          date: item.date || '',
          desc: item.desc || '',
          category: categoryLabel(item.catPacked != null && item.catPacked !== '' ? item.catPacked : packCategory(item), budget),
          amount: moneyRound(item.amount),
          by: item.by || ''
        };
      }),
      expenseCount: ((budget && budget.e) || []).length,
      expensesThisMonth: moneyRound(monthTotal),
      expenseCountThisMonth: monthExpenses.length,
      sentBy: sentBy || ''
    };
    if (mode) payload.mode = mode;
    return payload;
  }

  function measurePlanCapacity(options) {
    options = options || {};
    var base = emptyBudget(DEFAULT_TOTAL, SUGGESTED_STARTING, '2025-01-06');
    if (options.webhook) base.k = options.webhook;
    if (options.period) base.p = options.period;
    var applied = ensureOfficeCategories(base);
    var budget = applied.budget;
    var n = options.expenses || 0;
    var i;
    for (i = 0; i < n; i++) {
      budget.e.push({
        id: 'x' + i,
        date: '2026-03-15',
        desc: 'Example expense line',
        catPacked: packCustomId((budget.c[0] && budget.c[0].id) || '1'),
        amount: 12.34,
        by: 'Amy-Rose'
      });
    }
    var info = storageInfo(budget);
    info.includeZero = !applied.droppedZero;
    info.lineCount = applied.lineCount;
    info.added = applied.added;
    return info;
  }


  root.BudgetSync = {
    STORAGE_KEY: STORAGE_KEY,
    STORAGE_EXPENSE_KEY: STORAGE_EXPENSE_KEY,
    DEFAULT_TOTAL: DEFAULT_TOTAL,
    PLUGIN_LIMIT: PLUGIN_LIMIT,
    CATEGORIES: CATEGORIES,
    OTHER_INDEX: OTHER_INDEX,
    SUGGESTED_STARTING: SUGGESTED_STARTING,
    ASSET_VERSION: ASSET_VERSION,
    publicBaseUrl: publicBaseUrl,
    assetUrl: assetUrl,
    iconUrl: iconUrl,
    firstMondayOfJanuary: firstMondayOfJanuary,
    currentBienniumStart: currentBienniumStart,
    nextBienniumStart: nextBienniumStart,
    periodStartForReset: periodStartForReset,
    needsPeriodReset: needsPeriodReset,
    UNPLANNED: UNPLANNED,
    CUSTOM_PREFIX: CUSTOM_PREFIX,
    MAX_CAT_NAME: MAX_CAT_NAME,
    emptyBudget: emptyBudget,
    parseCategories: parseCategories,
    isCustomPacked: isCustomPacked,
    customIdFromPacked: customIdFromPacked,
    packCustomId: packCustomId,
    findPlanned: findPlanned,
    newPlannedId: newPlannedId,
    sortPlanned: sortPlanned,
    packCategory: packCategory,
    unpackCategory: unpackCategory,
    categoryLabel: categoryLabel,
    categoryGroupLabel: categoryGroupLabel,
    normalize: normalize,
    serialize: serialize,
    storageSize: storageSize,
    storageInfo: storageInfo,
    wouldFit: wouldFit,
    planStorage: planStorage,
    storageCardTitle: storageCardTitle,
    isStorageCardName: isStorageCardName,
    setupCardMessage: setupCardMessage,
    needCardMessage: needCardMessage,
    saveErrorMessage: saveErrorMessage,
    storageLineText: storageLineText,
    load: load,
    save: save,
    remove: remove,
    startingSpentOf: startingSpentOf,
    alreadyTotalOf: alreadyTotalOf,
    effectiveStartingOf: effectiveStartingOf,
    loggedSpentOf: loggedSpentOf,
    spentOf: spentOf,
    leftOf: leftOf,
    isOverspent: isOverspent,
    percentRemaining: percentRemaining,
    formatPercentRemaining: formatPercentRemaining,
    formatMoney: formatMoney,
    parseMoney: parseMoney,
    todayISO: todayISO,
    formatDate: formatDate,
    formatPeriod: formatPeriod,
    newId: newId,
    findExpense: findExpense,
    withMeta: withMeta,
    upsertExpense: upsertExpense,
    deleteExpense: deleteExpense,
    rollUp: rollUp,
    startNewPeriod: startNewPeriod,
    upsertPlannedCategory: upsertPlannedCategory,
    deletePlannedCategory: deletePlannedCategory,
    sortExpenses: sortExpenses,
    categoryTotals: categoryTotals,
    plannedTracking: plannedTracking,
    UNITEMIZED_LABEL: UNITEMIZED_LABEL,
    OFFICE_GROUPS: OFFICE_GROUPS,
    OFFICE_LINES: OFFICE_LINES,
    OFFICE_PLANNED_2027: OFFICE_PLANNED_2027,
    OFFICE_ACTUAL_2025: OFFICE_ACTUAL_2025,
    ensureOfficeCategories: ensureOfficeCategories,
    relinkExpenses: relinkExpenses,
    normalizeCatName: normalizeCatName,
    findPlannedByName: findPlannedByName,
    resolvePlannedCategory: resolvePlannedCategory,
    groupClassFor: groupClassFor,
    chicagoYearMonth: chicagoYearMonth,
    previousYearMonth: previousYearMonth,
    isLeapYear: isLeapYear,
    lastDayOfMonth: lastDayOfMonth,
    isLastDayOfMonth: isLastDayOfMonth,
    formatDateTimeChicago: formatDateTimeChicago,
    validateWebhookUrl: validateWebhookUrl,
    setWebhookUrl: setWebhookUrl,
    markWebhookResult: markWebhookResult,
    postWebhook: postWebhook,
    buildMonthlyPayload: buildMonthlyPayload,
    measurePlanCapacity: measurePlanCapacity,
    moneyRound: moneyRound,
    toCents: toCents,
    fromCents: fromCents,
    frontBadges: frontBadges,
    detailBadges: detailBadges,
    applyTheme: applyTheme,
    showError: showError,
    fullMessage: fullMessage,
    warnMessage: warnMessage
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root.BudgetSync;
  }
})(this);
