/* global TrelloPowerUp */
/**
 * Shared helpers for the Budget Sync Trello Power-Up.
 * Budget data is stored in board-level shared pluginData under the short key "b".
 * Trello caps the stringified object at 4096 characters per scope/visibility pair.
 *
 * Stored shape (v3, backward compatible with v2):
 *   { v: 3, t: total, s: startingSpent, p: "YYYY-MM-DD",
 *     e: [[id, date, desc, cat, amount, by]],
 *     c: [[id, name, planned]] }
 * Expense "cat" values:
 *   - a number 0-22: legacy built-in state category (v2 data)
 *   - "#id": a custom planned category in `c`
 *   - "*": Other / Unplanned
 *   - any other string: legacy "Other" free text, or a deleted category's name
 * `c` is omitted when empty so existing v2 boards stay compact.
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

  function publicBaseUrl() {
    var path = window.location.pathname || '/';
    path = path.replace(/index\.html$/i, '');
    path = path.replace(/section\.html$/i, '');
    path = path.replace(/expense\.html$/i, '');
    path = path.replace(/settings\/total\.html$/i, '');
    if (path.charAt(path.length - 1) !== '/') {
      path += '/';
    }
    return window.location.origin + path;
  }

  function iconUrl() {
    return publicBaseUrl() + 'img/icon.svg';
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

  function emptyBudget(total, starting, period) {
    var n = Number(total);
    var s = Number(starting);
    return {
      v: 3,
      t: isFinite(n) ? n : DEFAULT_TOTAL,
      s: isFinite(s) ? s : 0,
      p: period || currentBienniumStart(),
      e: [],
      c: []
    };
  }

  function parseCategories(raw) {
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
          planned: Number(row[2]) || 0
        };
      } else {
        cat = {
          id: String(row.id || row.i || ''),
          name: String(row.name || row.n || '').trim().slice(0, MAX_CAT_NAME),
          planned: Number(row.planned != null ? row.planned : row.a) || 0
        };
      }
      if (!cat.id || !cat.name || seen[cat.id]) return;
      if (!isFinite(cat.planned) || cat.planned < 0) cat.planned = 0;
      cat.planned = Math.round(cat.planned * 100) / 100;
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

  function categoryLabel(packed, budget) {
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

  function categoryGroupLabel(packed, budget) {
    if (packed === UNPLANNED || packed === '' || packed == null) return 'Other / Unplanned';
    if (isCustomPacked(packed)) return categoryLabel(packed, budget);
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

  function normalize(raw) {
    if (raw == null || raw === '') return null;
    if (typeof raw === 'number') {
      return emptyBudget(raw);
    }
    if (typeof raw !== 'object') return null;
    var budget = {
      v: 3,
      t: Number(raw.t) || 0,
      s: Number(raw.s) || 0,
      p: raw.p ? String(raw.p) : currentBienniumStart(),
      e: [],
      c: parseCategories(raw.c)
    };
    budget.e = Array.isArray(raw.e) ? raw.e.map(function (row) { return parseExpense(row, budget); }).filter(Boolean) : [];
    return budget;
  }

  function serialize(budget) {
    var packed = {
      v: 3,
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
    if (cats.length) {
      packed.c = cats.map(function (cat) {
        return [String(cat.id), String(cat.name).slice(0, MAX_CAT_NAME), Number(cat.planned) || 0];
      });
    }
    return packed;
  }

  function storageSize(budget) {
    return JSON.stringify({ b: serialize(budget) }).length;
  }

  function storageInfo(budget) {
    var used = storageSize(budget);
    var ratio = used / PLUGIN_LIMIT;
    return {
      used: used,
      limit: PLUGIN_LIMIT,
      ratio: ratio,
      percent: used >= PLUGIN_LIMIT ? 100 : Math.min(99, Math.round(ratio * 100)),
      warn: ratio >= WARN_RATIO,
      full: used >= PLUGIN_LIMIT
    };
  }

  function wouldFit(budget) {
    return storageSize(budget) <= PLUGIN_LIMIT;
  }

  function load(t) {
    return t.get('board', 'shared', STORAGE_KEY).then(function (raw) {
      return normalize(raw);
    });
  }

  function save(t, budget) {
    var packed = serialize(budget);
    var size = JSON.stringify({ b: packed }).length;
    if (size > PLUGIN_LIMIT) {
      var err = new Error('FULL');
      err.code = 'FULL';
      err.size = size;
      return Promise.reject(err);
    }
    return t.set('board', 'shared', STORAGE_KEY, packed);
  }

  function remove(t) {
    if (typeof t.remove === 'function') {
      return t.remove('board', 'shared', STORAGE_KEY);
    }
    return t.set('board', 'shared', STORAGE_KEY, null);
  }

  function startingSpentOf(budget) {
    return Math.round((Number(budget && budget.s) || 0) * 100) / 100;
  }

  function loggedSpentOf(budget) {
    if (!budget || !budget.e) return 0;
    var sum = 0;
    for (var i = 0; i < budget.e.length; i++) {
      sum += Number(budget.e[i].amount) || 0;
    }
    return Math.round(sum * 100) / 100;
  }

  function spentOf(budget) {
    return Math.round((startingSpentOf(budget) + loggedSpentOf(budget)) * 100) / 100;
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
      v: 3,
      t: budget.t,
      s: startingSpentOf(budget),
      p: budget.p || currentBienniumStart(),
      e: (budget.e || []).slice(),
      c: parseCategories(budget && budget.c)
    };
    if (extras) {
      if (typeof extras.t !== 'undefined') next.t = extras.t;
      if (typeof extras.s !== 'undefined') next.s = extras.s;
      if (typeof extras.p !== 'undefined') next.p = extras.p;
      if (typeof extras.e !== 'undefined') next.e = extras.e;
      if (typeof extras.c !== 'undefined') next.c = parseCategories(extras.c);
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
    return withMeta(budget, {
      s: spentOf(budget),
      e: []
    });
  }

  function startNewPeriod(budget, today) {
    var start = periodStartForReset(budget, today);
    var next = emptyBudget(DEFAULT_TOTAL, 0, start);
    next.c = parseCategories(budget && budget.c);
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
    planned = Math.round(planned * 100) / 100;
    var id = fields && fields.id != null && String(fields.id) !== '' ? String(fields.id) : newPlannedId(next);
    var lower = name.toLowerCase();
    for (var i = 0; i < next.c.length; i++) {
      if (String(next.c[i].id) !== id && String(next.c[i].name).toLowerCase() === lower) {
        var dup = new Error('DUP');
        dup.code = 'DUP';
        throw dup;
      }
    }
    var found = false;
    for (var j = 0; j < next.c.length; j++) {
      if (String(next.c[j].id) === id) {
        next.c[j] = { id: id, name: name, planned: planned };
        found = true;
        break;
      }
    }
    if (!found) next.c.push({ id: id, name: name, planned: planned });
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

  function moneyRound(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  function plannedTracking(budget) {
    var spentById = {};
    var unplannedGroups = {};
    var unplannedOrder = [];
    var unplannedSpent = 0;
    ((budget && budget.e) || []).forEach(function (item) {
      var packed = (item.catPacked != null && item.catPacked !== '') ? item.catPacked : packCategory(item);
      var amount = Number(item.amount) || 0;
      if (isCustomPacked(packed) && findPlanned(budget, customIdFromPacked(packed))) {
        var id = customIdFromPacked(packed);
        spentById[id] = (spentById[id] || 0) + amount;
      } else {
        unplannedSpent += amount;
        var label = categoryGroupLabel(packed, budget);
        if (!unplannedGroups[label]) {
          unplannedGroups[label] = 0;
          unplannedOrder.push(label);
        }
        unplannedGroups[label] += amount;
      }
    });
    var categories = sortPlanned((budget && budget.c) || []).map(function (cat) {
      var spent = moneyRound(spentById[cat.id] || 0);
      var planned = moneyRound(cat.planned);
      var left = moneyRound(planned - spent);
      var usedPct = planned > 0 ? Math.round((spent / planned) * 100) : (spent > 0 ? 100 : 0);
      var status = 'ok';
      if (spent > planned || (planned === 0 && spent > 0)) status = 'over';
      else if (planned > 0 && usedPct >= 90) status = 'warn';
      return {
        id: cat.id,
        name: cat.name,
        planned: planned,
        spent: spent,
        left: left,
        usedPct: usedPct,
        status: status
      };
    });
    var totalPlanned = 0;
    categories.forEach(function (row) { totalPlanned += row.planned; });
    totalPlanned = moneyRound(totalPlanned);
    var biennium = moneyRound(budget && budget.t);
    var unallocated = moneyRound(biennium - totalPlanned);
    return {
      categories: categories,
      totalPlanned: totalPlanned,
      biennium: biennium,
      unallocated: unallocated,
      overPlanned: unallocated < 0,
      unplannedSpent: moneyRound(unplannedSpent),
      unplannedGroups: unplannedOrder.map(function (label) {
        return { label: label, amount: moneyRound(unplannedGroups[label]) };
      }).sort(function (a, b) {
        if (b.amount !== a.amount) return b.amount - a.amount;
        return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
      })
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

  function fullMessage() {
    return 'This board is out of storage space (Trello caps each Power-Up at 4,096 characters). Use Archive / roll up to fold logged expenses into the already-spent amount, or delete older expenses.';
  }

  function warnMessage(info) {
    return 'This board is getting full (' + info.percent + '% of Trello’s storage limit). After you reconcile with the state report, use Archive / roll up to free space.';
  }

  root.BudgetSync = {
    STORAGE_KEY: STORAGE_KEY,
    DEFAULT_TOTAL: DEFAULT_TOTAL,
    PLUGIN_LIMIT: PLUGIN_LIMIT,
    CATEGORIES: CATEGORIES,
    OTHER_INDEX: OTHER_INDEX,
    SUGGESTED_STARTING: SUGGESTED_STARTING,
    publicBaseUrl: publicBaseUrl,
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
    load: load,
    save: save,
    remove: remove,
    startingSpentOf: startingSpentOf,
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
    frontBadges: frontBadges,
    detailBadges: detailBadges,
    applyTheme: applyTheme,
    showError: showError,
    fullMessage: fullMessage,
    warnMessage: warnMessage
  };
})(this);
