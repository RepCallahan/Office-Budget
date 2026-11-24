/* global TrelloPowerUp, BudgetSync */

var t = TrelloPowerUp.iframe();
var currentBudget = null;
var editingId = null;
var originalBy = '';
var currentMemberName = 'you';
var canWrite = true;

var viewSetup = document.getElementById('view-setup');
var viewBudget = document.getElementById('view-budget');
var currentSection = 'overview';

BudgetSync.applyTheme(t);

function showView(name) {
  viewSetup.hidden = name !== 'setup';
  viewBudget.hidden = name !== 'budget';
}

function placeExpenseForm(section) {
  var panel = document.getElementById('expense-panel');
  var slot = document.getElementById(section === 'expenses' ? 'form-slot-expenses' : 'form-slot-overview');
  if (panel && slot && panel.parentNode !== slot) slot.appendChild(panel);
}

function showSection(name) {
  var allowed = { overview: true, budget: true, expenses: true, categories: true, reports: true, settings: true };
  if (!allowed[name]) name = 'overview';
  currentSection = name;
  document.querySelectorAll('.nav-btn[data-section]').forEach(function (btn) {
    var on = btn.getAttribute('data-section') === name;
    btn.classList.toggle('is-active', on);
    if (on) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });
  document.querySelectorAll('.app-section').forEach(function (section) {
    section.hidden = section.getAttribute('data-section-panel') !== name;
    section.classList.toggle('is-active', !section.hidden);
  });
  if (name === 'overview' || name === 'expenses') placeExpenseForm(name);
  if (name === 'reports' && currentBudget) renderReport(currentBudget);
  if (typeof t.sizeTo === 'function') {
    t.sizeTo(document.body).catch(function () { return null; });
  }
}

function text(node, value) {
  if (node) node.textContent = value == null ? '' : String(value);
}

function moneyReport(value) {
  var num = Number(value);
  if (!isFinite(num)) num = 0;
  var negative = num < 0;
  var formatted = Math.abs(num).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return (negative ? '-$' : '$') + formatted;
}

function longDate(iso) {
  if (!iso) return '';
  var parts = String(iso).split('-');
  if (parts.length !== 3) return String(iso);
  var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var m = parseInt(parts[1], 10);
  var d = parseInt(parts[2], 10);
  if (!m || m < 1 || m > 12) return String(iso);
  return months[m - 1] + ' ' + d + ', ' + parts[0];
}

function generatedStamp() {
  var d = new Date();
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) +
    ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function el(tag, attrs, children) {
  var node = document.createElement(tag);
  if (attrs) {
    Object.keys(attrs).forEach(function (key) {
      if (key === 'className') node.className = attrs[key];
      else if (key === 'text') node.textContent = attrs[key];
      else node.setAttribute(key, attrs[key]);
    });
  }
  (children || []).forEach(function (child) {
    if (child == null || child === '') return;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  });
  return node;
}

var expOther = document.getElementById('exp-other');
var editingPlanId = null;

function packedFromForm(value) {
  var catVal = String(value || '');
  if (!catVal) return '';
  if (catVal === BudgetSync.UNPLANNED || BudgetSync.isCustomPacked(catVal)) return catVal;
  if (/^\d+$/.test(catVal)) {
    var n = parseInt(catVal, 10);
    if (n >= 0 && n < BudgetSync.CATEGORIES.length) return n;
  }
  return catVal;
}

function fillCategorySelect(budget, selectedPacked) {
  var select = document.getElementById('exp-category');
  if (!select) return;
  var current = selectedPacked;
  if (current === undefined || current === null) current = packedFromForm(select.value);
  select.textContent = '';
  select.appendChild(el('option', { value: '', text: 'Choose a category' }));
  var planned = BudgetSync.sortPlanned((budget && budget.c) || []);
  planned.forEach(function (cat) {
    select.appendChild(el('option', { value: BudgetSync.packCustomId(cat.id), text: cat.name }));
  });
  select.appendChild(el('option', { value: BudgetSync.UNPLANNED, text: 'Other / Unplanned' }));
  if (current !== '' && current != null && current !== BudgetSync.UNPLANNED && !BudgetSync.isCustomPacked(current)) {
    var label = BudgetSync.categoryLabel(current, budget) || String(current);
    select.appendChild(el('option', { value: String(current), text: label + ' (from earlier expenses)' }));
  } else if (BudgetSync.isCustomPacked(current) && !BudgetSync.findPlanned(budget, BudgetSync.customIdFromPacked(current))) {
    select.appendChild(el('option', { value: String(current), text: (BudgetSync.categoryLabel(current, budget) || 'Category') + ' (from earlier expenses)' }));
  }
  if (current !== '' && current != null) select.value = String(current);
  if (expOther) {
    expOther.hidden = true;
    expOther.value = '';
  }
}

function svgIcon(name, size) {
  var paths = {
    plus: 'M12 5v14M5 12h14',
    edit: 'M4 20h4l10.5-10.5a2.12 2.12 0 0 0-3-3L5 17v3zM13.5 6.5l4 4',
    trash: 'M4 7h16M9 7V5h6v2M8 7l1 12h6l1-12'
  };
  var ns = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(ns, 'svg');
  var dim = String(size || 16);
  svg.setAttribute('width', dim);
  svg.setAttribute('height', dim);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  var d = paths[name] || paths.plus;
  var path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d);
  svg.appendChild(path);
  return svg;
}

function setFormHeading(label, kind) {
  var heading = document.getElementById('form-heading');
  heading.textContent = '';
  heading.appendChild(svgIcon(kind === 'edit' ? 'edit' : 'plus', 16));
  heading.appendChild(document.createTextNode(label));
}

function resetExpenseForm() {
  editingId = null;
  originalBy = '';
  setFormHeading('Add expense', 'plus');
  document.getElementById('expense-form').reset();
  document.getElementById('exp-date').value = BudgetSync.todayISO();
  fillCategorySelect(currentBudget, '');
  document.getElementById('exp-cancel').hidden = true;
  document.getElementById('exp-delete').hidden = true;
  document.getElementById('exp-save').textContent = 'Save expense';
  text(document.getElementById('exp-by'), currentMemberName);
  BudgetSync.showError(document.getElementById('exp-error'), '');
}

function startEdit(item) {
  editingId = item.id;
  originalBy = item.by || '';
  setFormHeading('Edit expense', 'edit');
  document.getElementById('exp-date').value = item.date;
  document.getElementById('exp-desc').value = item.desc;
  document.getElementById('exp-amount').value = item.amount;
  fillCategorySelect(currentBudget, item.catPacked != null && item.catPacked !== '' ? item.catPacked : BudgetSync.packCategory(item));
  document.getElementById('exp-cancel').hidden = false;
  document.getElementById('exp-delete').hidden = false;
  document.getElementById('exp-save').textContent = 'Save changes';
  text(document.getElementById('exp-by'), originalBy || currentMemberName);
  BudgetSync.showError(document.getElementById('exp-error'), '');
  document.getElementById('expense-form').scrollIntoView({ block: 'nearest' });
}

function renderBanners(budget) {
  var box = document.getElementById('banners');
  box.textContent = '';
  var left = BudgetSync.leftOf(budget);
  var info = BudgetSync.storageInfo(budget);
  if (left < 0) {
    box.appendChild(el('div', { className: 'banner banner-over', text: 'Overspent by ' + BudgetSync.formatMoney(Math.abs(left)) + '.' }));
  }
  if (info.full) box.appendChild(el('div', { className: 'banner banner-over', text: BudgetSync.fullMessage() }));
  else if (info.warn) box.appendChild(el('div', { className: 'banner banner-warn', text: BudgetSync.warnMessage(info) }));
}

function renderSummary(budget) {
  var spent = BudgetSync.spentOf(budget);
  var left = BudgetSync.leftOf(budget);
  var over = left < 0;
  var remainPct = BudgetSync.percentRemaining(budget);
  var usedPct = (Number(budget.t) || 0) > 0 ? Math.round((spent / budget.t) * 100) : 0;
  text(document.getElementById('hero-left'), BudgetSync.formatMoney(left));
  text(document.getElementById('hero-spent'), BudgetSync.formatMoney(spent));
  text(document.getElementById('hero-remain'), remainPct + '%');
  text(document.getElementById('hero-total'), BudgetSync.formatMoney(budget.t));
  text(document.getElementById('hero-period'), BudgetSync.formatPeriod(budget.p).replace(/^Period:\s*/, ''));
  var leftMetric = document.getElementById('hero-left').closest('.metric');
  var remainMetric = document.getElementById('hero-remain').closest('.metric');
  if (leftMetric) leftMetric.className = 'metric' + (over ? ' is-over' : '');
  if (remainMetric) remainMetric.className = 'metric' + (over ? ' is-over' : '');
  var bar = document.getElementById('hero-bar');
  var nearLimit = over || usedPct >= 90;
  bar.className = 'used-bar' + (nearLimit ? (over ? ' is-over' : ' is-warn') : '');
  bar.style.width = Math.max(0, Math.min(100, over ? 100 : usedPct)) + '%';
  var usedLabel = document.getElementById('hero-used');
  usedLabel.className = 'used-label' + (nearLimit ? (over ? ' is-over' : ' is-warn') : '');
  text(usedLabel, (over ? usedPct : Math.max(0, usedPct)) + '% used');
  var starting = BudgetSync.startingSpentOf(budget);
  var logged = BudgetSync.loggedSpentOf(budget);
  var sub = document.getElementById('expense-sub');
  if (starting && logged) text(sub, 'Includes ' + BudgetSync.formatMoney(starting) + ' from the state report, plus ' + BudgetSync.formatMoney(logged) + ' logged here.');
  else if (starting) text(sub, 'Includes ' + BudgetSync.formatMoney(starting) + ' already spent from the state report.');
  else if (logged) text(sub, BudgetSync.formatMoney(logged) + ' logged here.');
  else text(sub, 'No spending logged yet.');
  text(document.getElementById('expense-heading'), budget.e.length === 1 ? '1 expense' : budget.e.length + ' expenses');
}

function renderSpendList(host, rows, emptyText) {
  if (!rows.length) {
    host.appendChild(el('p', { className: 'empty-table', text: emptyText }));
    return;
  }
  var max = 0;
  rows.forEach(function (row) {
    if (row.amount > max) max = row.amount;
  });
  var ul = el('ul', { className: 'cat-totals' });
  rows.forEach(function (row) {
    var width = max > 0 ? Math.max(2, Math.round((row.amount / max) * 100)) : 0;
    var bar = el('div', { className: 'cat-bar' });
    bar.style.width = width + '%';
    ul.appendChild(el('li', null, [
      el('div', { className: 'cat-row' }, [
        el('span', { className: 'cat-name', text: row.label }),
        el('span', { className: 'cat-amount', text: BudgetSync.formatMoney(row.amount) })
      ]),
      el('div', { className: 'cat-track' }, [bar])
    ]));
  });
  host.appendChild(ul);
}

function renderCategories(budget) {
  var host = document.getElementById('category-totals');
  host.textContent = '';
  var track = BudgetSync.plannedTracking(budget);
  var plannedSpend = track.categories.filter(function (row) { return row.spent > 0; }).map(function (row) {
    return { label: row.name, amount: row.spent };
  });
  var hasPlanned = track.categories.length > 0;
  if (!plannedSpend.length && !track.unplannedGroups.length) {
    host.appendChild(el('p', { className: 'empty-table', text: 'No expenses logged in this period yet. Already-spent from the state report is a total only.' }));
  } else if (hasPlanned) {
    var plannedBox = el('div', { className: 'cat-group' }, [el('h3', { text: 'Planned categories' })]);
    renderSpendList(plannedBox, plannedSpend, 'No spending has been logged against a planned category yet.');
    host.appendChild(plannedBox);
    var unplannedBox = el('div', { className: 'cat-group' }, [el('h3', { text: 'Unplanned' })]);
    renderSpendList(unplannedBox, track.unplannedGroups, 'No unplanned expenses this period.');
    host.appendChild(unplannedBox);
  } else {
    renderSpendList(host, BudgetSync.categoryTotals(budget), 'No categorized expenses yet.');
  }
  var go = el('button', { className: 'ghost-btn go-budget', type: 'button', text: 'Go to Budget to plan amounts' });
  go.addEventListener('click', function () { showSection('budget'); });
  host.appendChild(go);
}

function fillGroupSelect(budget, selected) {
  var sel = document.getElementById('plan-group');
  if (!sel) return;
  var groups = (budget && budget.g && budget.g.length) ? budget.g.slice() : [];
  sel.textContent = '';
  sel.appendChild(el('option', { value: '', text: 'No group' }));
  groups.forEach(function (name, i) {
    var opt = el('option', { value: String(i), text: name });
    if (selected != null && String(selected) === String(i)) opt.selected = true;
    sel.appendChild(opt);
  });
}

function resetPlanForm() {
  editingPlanId = null;
  text(document.getElementById('plan-form-heading'), 'Add category');
  var form = document.getElementById('plan-form');
  if (form) form.reset();
  fillGroupSelect(currentBudget, '');
  document.getElementById('plan-cancel').hidden = true;
  document.getElementById('plan-save').textContent = 'Save category';
  BudgetSync.showError(document.getElementById('plan-error'), '');
}

function startEditPlan(row) {
  editingPlanId = row.id;
  text(document.getElementById('plan-form-heading'), 'Edit category');
  document.getElementById('plan-name').value = row.name;
  document.getElementById('plan-amount').value = row.planned;
  fillGroupSelect(currentBudget, row.group);
  document.getElementById('plan-cancel').hidden = false;
  document.getElementById('plan-save').textContent = 'Save changes';
  BudgetSync.showError(document.getElementById('plan-error'), '');
  document.getElementById('plan-form').scrollIntoView({ block: 'nearest' });
}

function planUsedLabel(row) {
  if (row.status === 'none') {
    return row.spent ? 'No planned amount set' : 'No plan set';
  }
  return row.usedPct + '% used';
}

function appendPlanItem(host, row) {
  var actions = el('div', { className: 'actions' });
  if (canWrite) {
    var editBtn = el('button', { className: 'row-btn', type: 'button', 'aria-label': 'Edit' });
    editBtn.appendChild(svgIcon('edit', 14));
    editBtn.appendChild(document.createTextNode('Edit'));
    editBtn.addEventListener('click', function () { startEditPlan(row); });
    var delBtn = el('button', { className: 'row-btn danger', type: 'button', 'aria-label': 'Delete' });
    delBtn.appendChild(svgIcon('trash', 14));
    delBtn.appendChild(document.createTextNode('Delete'));
    delBtn.addEventListener('click', function () { deletePlan(row); });
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
  }
  var width = row.status === 'none' ? 0 : Math.max(0, Math.min(100, row.usedPct));
  if (row.status === 'over') width = 100;
  var bar = el('div', { className: 'plan-bar is-' + row.status });
  bar.style.width = width + '%';
  var leftClass = row.status === 'none' ? '' : (row.left < 0 ? 'is-over' : (row.status === 'ok' ? 'is-ok' : ''));
  var leftText = row.status === 'none' ? '—' : BudgetSync.formatMoney(row.left);
  var children = [
    el('div', { className: 'plan-item-head' }, [
      el('div', { className: 'plan-item-name', text: row.name }),
      actions
    ]),
    el('div', { className: 'plan-item-stats' }, [
      el('span', null, ['Planned ', el('strong', { text: BudgetSync.formatMoney(row.planned) })]),
      el('span', null, ['Spent ', el('strong', { text: BudgetSync.formatMoney(row.spent) })]),
      el('span', null, ['Left ', el('strong', { className: leftClass, text: leftText })])
    ])
  ];
  children.push(el('div', { className: 'plan-track' }, [bar]));
  children.push(el('div', { className: 'plan-used is-' + row.status, text: planUsedLabel(row) }));
  host.appendChild(el('div', { className: 'plan-item' }, children));
}

function renderPlan(budget) {
  var track = BudgetSync.plannedTracking(budget);
  text(document.getElementById('plan-biennium'), BudgetSync.formatMoney(track.biennium));
  text(document.getElementById('plan-total'), BudgetSync.formatMoney(track.totalPlanned));
  var unalloc = document.getElementById('plan-unallocated');
  text(unalloc, BudgetSync.formatMoney(track.unallocated));
  unalloc.className = 'metric-value pill ' + (track.overPlanned ? 'pill-red is-over' : 'pill-green');
  var warn = document.getElementById('plan-warn');
  if (track.overPlanned) {
    warn.hidden = false;
    text(warn, 'Planned categories add up to ' + BudgetSync.formatMoney(track.totalPlanned) + ', which is ' + BudgetSync.formatMoney(Math.abs(track.unallocated)) + ' more than the biennium budget.');
  } else {
    warn.hidden = true;
    text(warn, '');
  }
  text(document.getElementById('plan-note'), 'Unallocated is the biennium budget minus your planned amounts.');

  var list = document.getElementById('plan-list');
  list.textContent = '';
  if (!track.categories.length) {
    list.appendChild(el('div', { className: 'empty-table', text: 'No categories yet. Add one on the right.' }));
  } else {
    var i = 0;
    while (i < track.categories.length) {
      var row = track.categories[i];
      if (row.group >= 0 && row.groupName) {
        var groupIndex = row.group;
        var groupName = row.groupName;
        var groupBox = el('div', { className: 'plan-group' });
        var plannedSum = 0;
        var spentSum = 0;
        var items = [];
        while (i < track.categories.length && track.categories[i].group === groupIndex && track.categories[i].groupName === groupName) {
          plannedSum += track.categories[i].planned;
          spentSum += track.categories[i].spent;
          items.push(track.categories[i]);
          i += 1;
        }
        var sub = BudgetSync.formatMoney(spentSum) + ' spent';
        if (plannedSum) sub = BudgetSync.formatMoney(spentSum) + ' of ' + BudgetSync.formatMoney(plannedSum);
        groupBox.appendChild(el('div', { className: 'plan-group-head' }, [
          el('span', { text: groupName }),
          el('span', { className: 'subtotal', text: sub })
        ]));
        items.forEach(function (item) { appendPlanItem(groupBox, item); });
        list.appendChild(groupBox);
      } else {
        appendPlanItem(list, row);
        i += 1;
      }
    }
  }

  var unplanned = document.getElementById('plan-unplanned');
  unplanned.textContent = '';
  if (!track.unplannedSpent) {
    unplanned.appendChild(el('p', { className: 'hint', text: 'No unplanned expenses this period. New expenses can use Other / Unplanned, and older state-report categories stay listed here.' }));
  } else {
    var unplannedHint = BudgetSync.formatMoney(track.unplannedSpent) + ' without a planned amount.';
    if (track.unitemized) {
      unplannedHint = BudgetSync.formatMoney(track.unitemized) + ' is Other / unitemized — the part of already-spent not assigned to a category.';
      if (track.unplannedLogged) unplannedHint += ' Another ' + BudgetSync.formatMoney(track.unplannedLogged) + ' was logged without a planned category.';
    }
    unplanned.appendChild(el('p', { className: 'hint', text: unplannedHint }));
    renderSpendList(unplanned, track.unplannedGroups, '');
  }

  fillGroupSelect(budget, editingPlanId ? document.getElementById('plan-group').value : '');
  var saveBtn = document.getElementById('plan-save');
  if (saveBtn) saveBtn.disabled = !canWrite;
}

function deletePlan(row) {
  if (!canWrite || !currentBudget) return;
  var track = BudgetSync.plannedTracking(currentBudget);
  var current = null;
  track.categories.forEach(function (item) { if (item.id === row.id) current = item; });
  var spent = current ? current.spent : 0;
  var message = spent
    ? '“' + row.name + '” has expenses totaling ' + BudgetSync.formatMoney(spent) + '. Delete this planned category? Those expenses will be kept and shown as unplanned under the name “' + row.name + '.”'
    : 'Delete the planned category “' + row.name + '”? This cannot be undone.';
  if (!window.confirm(message)) return;
  BudgetSync.load(t).then(function (budget) {
    if (!budget) return;
    return BudgetSync.save(t, BudgetSync.deletePlannedCategory(budget, row.id)).then(function () {
      if (editingPlanId === row.id) resetPlanForm();
      return refresh();
    });
  }).catch(function (e) {
    if (e && e.code === 'FULL') window.alert(BudgetSync.fullMessage());
    else window.alert('Could not delete that category. Please try again.');
  });
}

function renderExpenseTable(wrap, list, emptyText) {
  wrap.textContent = '';
  if (!list.length) {
    wrap.appendChild(el('div', { className: 'empty-table', text: emptyText }));
    return;
  }
  var body = el('tbody');
  list.forEach(function (item) {
    var actions = el('td', { className: 'actions' });
    if (canWrite) {
      var editBtn = el('button', { className: 'row-btn', type: 'button', 'aria-label': 'Edit' });
      editBtn.appendChild(svgIcon('edit', 14));
      editBtn.appendChild(document.createTextNode('Edit'));
      editBtn.addEventListener('click', function () { startEdit(item); });
      var delBtn = el('button', { className: 'row-btn danger', type: 'button', 'aria-label': 'Delete' });
      delBtn.appendChild(svgIcon('trash', 14));
      delBtn.appendChild(document.createTextNode('Delete'));
      delBtn.addEventListener('click', function () { deleteExpense(item); });
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
    }
    body.appendChild(el('tr', null, [
      el('td', { text: BudgetSync.formatDate(item.date) }),
      el('td', { text: item.desc || '' }),
      el('td', { text: item.cat || '' }),
      el('td', { className: 'num', text: BudgetSync.formatMoney(item.amount) }),
      el('td', { text: item.by || '' }),
      actions
    ]));
  });
  wrap.appendChild(el('table', { className: 'expenses' }, [
    el('thead', null, [el('tr', null, [
      el('th', { text: 'Date' }),
      el('th', { text: 'Description' }),
      el('th', { text: 'Category' }),
      el('th', { className: 'num', text: 'Amount' }),
      el('th', { text: 'Entered by' }),
      el('th', { text: '' })
    ])]),
    body
  ]));
}

function renderExpenses(budget) {
  var wrap = document.getElementById('expense-table-wrap');
  var list = BudgetSync.sortExpenses(budget.e);
  renderExpenseTable(wrap, list, 'No expenses logged in this period yet. Use the form on the right to add the first one.');
}

function renderRecent(budget) {
  var wrap = document.getElementById('recent-table-wrap');
  if (!wrap) return;
  var list = BudgetSync.sortExpenses(budget.e).slice(0, 5);
  renderExpenseTable(wrap, list, 'No expenses logged in this period yet. Use the form on the right to add the first one.');
}

function renderSettings(budget) {
  document.getElementById('set-total').value = budget.t;
  document.getElementById('set-starting').value = budget.s;
  var periodStart = budget.p || BudgetSync.currentBienniumStart();
  text(document.getElementById('set-period-start'), BudgetSync.formatDate(periodStart));
  text(document.getElementById('set-period-end'), BudgetSync.formatDate(BudgetSync.nextBienniumStart(periodStart)));
  document.getElementById('rollup-btn').disabled = !canWrite || !(budget.e && budget.e.length);
  document.getElementById('confirm-reset-btn').disabled = !canWrite;
  document.getElementById('remove-btn').hidden = !canWrite;
  document.getElementById('exp-save').disabled = !canWrite;
  var info = BudgetSync.storageInfo(budget);
  var storage = document.getElementById('storage-line');
  storage.className = 'storage' + (info.full ? ' is-full' : info.warn ? ' is-warn' : '');
  text(storage, 'Storage used: ' + info.percent + '% of Trello’s board limit (' + info.used + ' of ' + info.limit + ' characters).');
  if (info.full) document.getElementById('exp-save').disabled = true;
  var urlField = document.getElementById('webhook-url');
  if (urlField && document.activeElement !== urlField) urlField.value = budget.k || '';
  var status = document.getElementById('webhook-status');
  if (status) {
    var statusParts = [];
    if (!budget.k) statusParts.push('No webhook saved yet.');
    else statusParts.push('Webhook saved.');
    if (budget.n) {
      var when = BudgetSync.formatDateTimeChicago(budget.n);
      statusParts.push(budget.o ? ('Last sent ' + when + '.') : ('Last try failed ' + when + '. It will retry the next time Office Budget is opened.'));
    }
    if (budget.m) statusParts.push('Last automatic month: ' + budget.m + '.');
    if (budget.k) statusParts.push('Apps Script responses cannot be read from Trello (the request is sent without CORS), so “sent” means the request left this browser without a network error.');
    text(status, statusParts.join(' '));
  }
  var hookSave = document.getElementById('webhook-save');
  var hookSend = document.getElementById('webhook-send');
  if (hookSave) hookSave.disabled = !canWrite;
  if (hookSend) hookSend.disabled = !canWrite || !budget.k;
}

function renderBudget(budget) {
  currentBudget = budget;
  renderSummary(budget);
  renderBanners(budget);
  renderCategories(budget);
  renderPlan(budget);
  renderExpenses(budget);
  renderRecent(budget);
  renderSettings(budget);
  fillCategorySelect(budget, editingId && document.getElementById('exp-category').value ? packedFromForm(document.getElementById('exp-category').value) : '');
  if (currentSection === 'reports') renderReport(budget);
  if (!editingId) {
    if (!document.getElementById('exp-date').value) {
      document.getElementById('exp-date').value = BudgetSync.todayISO();
    }
    text(document.getElementById('exp-by'), currentMemberName);
  }
}

var autoSendTried = false;

function maybeAutoSend(budget) {
  if (autoSendTried || !budget || !budget.k) return Promise.resolve();
  autoSendTried = true;
  var prev = BudgetSync.previousYearMonth(BudgetSync.chicagoYearMonth());
  if (budget.m === prev) return Promise.resolve();
  var payload = BudgetSync.buildMonthlyPayload(budget, prev, currentMemberName);
  return BudgetSync.postWebhook(budget.k, payload).then(function () {
    return BudgetSync.save(t, BudgetSync.markWebhookResult(budget, { ok: true, month: prev })).then(function () {
      return BudgetSync.load(t).then(function (fresh) {
        if (fresh) {
          currentBudget = fresh;
          renderSettings(fresh);
        }
      });
    });
  }).catch(function () {
    return BudgetSync.save(t, BudgetSync.markWebhookResult(budget, { ok: false })).then(function () {
      return BudgetSync.load(t).then(function (fresh) {
        if (fresh) {
          currentBudget = fresh;
          renderSettings(fresh);
        }
      });
    }).catch(function () { return null; });
  });
}

function showLoadedBudget(budget) {
  currentBudget = budget;
  showView('budget');
  renderBudget(budget);
  showSection(currentSection);
  return maybeAutoSend(budget);
}

function maybeSeedCategories(budget) {
  if (!budget || !canWrite) return Promise.resolve(budget);
  var seeded = BudgetSync.ensureOfficeCategories(budget);
  if (!seeded.changed) return Promise.resolve(budget);
  return BudgetSync.save(t, seeded.budget).then(function () {
    return BudgetSync.load(t);
  }).catch(function () {
    return budget;
  });
}

function refresh() {
  return BudgetSync.load(t).then(function (budget) {
    currentBudget = budget;
    if (!budget) {
      showView('setup');
      document.getElementById('setup-total').value = BudgetSync.DEFAULT_TOTAL;
      return;
    }
    return maybeSeedCategories(budget).then(showLoadedBudget);
  }).then(function () {
    if (typeof t.sizeTo === 'function') {
      return t.sizeTo(document.body).catch(function () { return null; });
    }
  });
}

function deleteExpense(item) {
  if (!canWrite) return;
  if (!window.confirm('Delete “' + item.desc + '”? This cannot be undone.')) return;
  BudgetSync.load(t).then(function (budget) {
    if (!budget) return;
    return BudgetSync.save(t, BudgetSync.deleteExpense(budget, item.id)).then(function () {
      if (editingId === item.id) resetExpenseForm();
      return refresh();
    });
  }).catch(function () {
    window.alert('Could not delete that expense. Please try again.');
  });
}

document.getElementById('setup-form').addEventListener('submit', function (event) {
  event.preventDefault();
  var err = document.getElementById('setup-error');
  BudgetSync.showError(err, '');
  var total = BudgetSync.parseMoney(document.getElementById('setup-total').value);
  var startingRaw = document.getElementById('setup-starting').value;
  var starting = startingRaw.trim() === '' ? 0 : BudgetSync.parseMoney(startingRaw);
  if (!isFinite(total) || total < 0) {
    BudgetSync.showError(err, 'Enter a biennium budget of zero or more.');
    return;
  }
  if (!isFinite(starting) || starting < 0) {
    BudgetSync.showError(err, 'Enter an already-spent amount of zero or more.');
    return;
  }
  BudgetSync.save(t, BudgetSync.emptyBudget(total, starting)).then(refresh).catch(function () {
    BudgetSync.showError(err, 'Could not save the budget. Please try again.');
  });
});

document.getElementById('expense-form').addEventListener('submit', function (event) {
  event.preventDefault();
  var err = document.getElementById('exp-error');
  BudgetSync.showError(err, '');
  var date = (document.getElementById('exp-date').value || '').trim();
  var desc = (document.getElementById('exp-desc').value || '').trim();
  var amount = BudgetSync.parseMoney(document.getElementById('exp-amount').value);
  var catPacked = packedFromForm(document.getElementById('exp-category').value);
  if (!date) return BudgetSync.showError(err, 'Please pick a date.');
  if (!desc) return BudgetSync.showError(err, 'Please enter a short description.');
  if (catPacked === '') return BudgetSync.showError(err, 'Please choose a category.');
  if (!isFinite(amount) || amount <= 0) return BudgetSync.showError(err, 'Enter an amount greater than zero.');

  BudgetSync.load(t).then(function (budget) {
    if (!budget) throw new Error('NO_BUDGET');
    var expense = {
      id: editingId || BudgetSync.newId(),
      date: date,
      desc: desc,
      catPacked: catPacked,
      amount: amount,
      by: editingId ? (originalBy || currentMemberName) : currentMemberName
    };
    return BudgetSync.save(t, BudgetSync.upsertExpense(budget, expense));
  }).then(function () {
    resetExpenseForm();
    return refresh();
  }).catch(function (e) {
    if (e && (e.code === 'FULL' || (e.message && String(e.message).indexOf('4096') !== -1))) {
      BudgetSync.showError(err, BudgetSync.fullMessage());
      return;
    }
    BudgetSync.showError(err, 'Could not save this expense. Please try again.');
  });
});

document.getElementById('exp-cancel').addEventListener('click', resetExpenseForm);

document.getElementById('exp-delete').addEventListener('click', function () {
  if (!editingId || !currentBudget) return;
  var item = BudgetSync.findExpense(currentBudget, editingId);
  if (item) deleteExpense(item);
});

document.getElementById('settings-form').addEventListener('submit', function (event) {
  event.preventDefault();
  var err = document.getElementById('set-error');
  BudgetSync.showError(err, '');
  var total = BudgetSync.parseMoney(document.getElementById('set-total').value);
  var starting = BudgetSync.parseMoney(document.getElementById('set-starting').value);
  if (!isFinite(total) || total < 0) return BudgetSync.showError(err, 'Enter a biennium budget of zero or more.');
  if (!isFinite(starting) || starting < 0) return BudgetSync.showError(err, 'Enter an already-spent amount of zero or more.');
  BudgetSync.load(t).then(function (budget) {
    if (!budget) throw new Error('NO_BUDGET');
    return BudgetSync.save(t, BudgetSync.withMeta(budget, { t: total, s: starting }));
  }).then(refresh).catch(function (e) {
    if (e && e.code === 'FULL') return BudgetSync.showError(err, BudgetSync.fullMessage());
    BudgetSync.showError(err, 'Could not save settings. Please try again.');
  });
});

document.getElementById('rollup-btn').addEventListener('click', function () {
  if (!currentBudget || !currentBudget.e.length) return;
  var logged = BudgetSync.loggedSpentOf(currentBudget);
  var nextSpent = BudgetSync.spentOf(currentBudget);
  var ok = window.confirm(
    'Add the ' + currentBudget.e.length + ' logged expense' + (currentBudget.e.length === 1 ? '' : 's') +
    ' (' + BudgetSync.formatMoney(logged) + ') into Already spent, and clear the expense list? ' +
    'Spent will stay ' + BudgetSync.formatMoney(nextSpent) + '. This cannot be undone.'
  );
  if (!ok) return;
  BudgetSync.save(t, BudgetSync.rollUp(currentBudget)).then(function () {
    resetExpenseForm();
    return refresh();
  }).catch(function () {
    window.alert('Could not roll up expenses. Please try again.');
  });
});

function renderReport(budget) {
  var reportEl = document.getElementById('report');
  reportEl.textContent = '';
  if (!budget) {
    reportEl.appendChild(el('p', { className: 'empty', text: 'No budget is set up on this board yet.' }));
    return;
  }
  var spent = BudgetSync.spentOf(budget);
  var left = BudgetSync.leftOf(budget);
  var starting = BudgetSync.startingSpentOf(budget);
  var logged = BudgetSync.loggedSpentOf(budget);
  var pct = BudgetSync.percentRemaining(budget);
  var generated = generatedStamp();
  var today = BudgetSync.todayISO();
  var periodStart = budget.p || BudgetSync.currentBienniumStart();
  var expenses = BudgetSync.sortExpenses(budget.e).slice().reverse();
  var cats = BudgetSync.categoryTotals(budget);
  document.title = 'AD35 Office Budget Report — ' + longDate(today);

  reportEl.appendChild(el('header', { className: 'letterhead' }, [
    el('p', { className: 'district', text: 'Assembly District 35' }),
    el('p', { className: 'name', text: 'Calvin Callahan' }),
    el('p', { className: 'title', text: 'Office Budget' })
  ]));
  reportEl.appendChild(el('dl', { className: 'meta' }, [
    el('dt', { text: 'Session period' }),
    el('dd', { text: longDate(periodStart) + ' – ' + longDate(today) }),
    el('dt', { text: 'Generated' }),
    el('dd', { text: generated })
  ]));
  reportEl.appendChild(el('h2', { text: 'Budget summary' }));
  reportEl.appendChild(el('table', { className: 'totals' }, [el('tbody', null, [
    el('tr', null, [el('th', { text: 'Biennium budget' }), el('td', { className: 'num', text: moneyReport(budget.t) })]),
    el('tr', null, [el('th', { text: 'Already spent (from state report)' }), el('td', { className: 'num', text: moneyReport(starting) })]),
    el('tr', null, [el('th', { text: 'Expenses logged this period' }), el('td', { className: 'num', text: moneyReport(logged) })]),
    el('tr', { className: 'grand' }, [el('th', { text: 'Total spent' }), el('td', { className: 'num', text: moneyReport(spent) })]),
    el('tr', { className: 'grand' }, [el('th', { text: 'Total remaining' }), el('td', { className: 'num', text: moneyReport(left) })]),
    el('tr', null, [el('th', { text: 'Percent remaining' }), el('td', { className: 'num', text: pct + '%' })])
  ])]));

  var track = BudgetSync.plannedTracking(budget);
  if (track.categories.length) {
    reportEl.appendChild(el('h2', { text: 'Planned vs spent' }));
    var planBody = el('tbody');
    track.categories.forEach(function (row) {
      planBody.appendChild(el('tr', null, [
        el('td', { text: row.groupName ? (row.groupName + ' — ' + row.name) : row.name }),
        el('td', { className: 'num', text: moneyReport(row.planned) }),
        el('td', { className: 'num', text: moneyReport(row.spent) }),
        el('td', { className: 'num' + (row.status !== 'none' && row.left < 0 ? ' is-over' : ''), text: row.status === 'none' ? '—' : moneyReport(row.left) })
      ]));
    });
    if (track.unplannedSpent) {
      planBody.appendChild(el('tr', null, [
        el('td', { text: 'Unplanned / unitemized' }),
        el('td', { className: 'num', text: moneyReport(0) }),
        el('td', { className: 'num', text: moneyReport(track.unplannedSpent) }),
        el('td', { className: 'num', text: '—' })
      ]));
    }
    reportEl.appendChild(el('table', { className: 'plan-table' }, [
      el('thead', null, [el('tr', null, [el('th', { text: 'Category' }), el('th', { className: 'num', text: 'Planned' }), el('th', { className: 'num', text: 'Spent' }), el('th', { className: 'num', text: 'Left' })])]),
      planBody,
      el('tfoot', null, [el('tr', null, [
        el('td', { text: 'Total' }),
        el('td', { className: 'num', text: moneyReport(track.totalPlanned) }),
        el('td', { className: 'num', text: moneyReport(spent) }),
        el('td', { className: 'num', text: '' })
      ])])
    ]));
    var planNote = 'Spent amounts include any amounts carried in for a category plus expenses logged this period. The already-spent total from the state report (' + moneyReport(starting) + ') is not added a second time.';
    if (track.unitemized) planNote += ' The ' + moneyReport(track.unitemized) + ' gap between that already-spent total and the amounts carried in by category is listed as Other / unitemized.';
    if (track.overPlanned) planNote += ' Planned categories exceed the biennium budget by ' + moneyReport(Math.abs(track.unallocated)) + '.';
    reportEl.appendChild(el('p', { className: 'note', text: planNote }));
  } else {
    reportEl.appendChild(el('h2', { text: 'Totals by category' }));
    if (!cats.length) {
      reportEl.appendChild(el('p', { className: 'empty', text: 'No categorized expenses were logged this period. The already-spent amount from the state report is a total only and is not broken down by category.' }));
    } else {
      var catBody = el('tbody');
      cats.forEach(function (row) {
        catBody.appendChild(el('tr', null, [el('td', { text: row.label }), el('td', { className: 'num', text: moneyReport(row.amount) })]));
      });
      reportEl.appendChild(el('table', null, [
        el('thead', null, [el('tr', null, [el('th', { text: 'Category' }), el('th', { className: 'num', text: 'Amount' })])]),
        catBody,
        el('tfoot', null, [el('tr', null, [el('td', { text: 'Logged expenses total' }), el('td', { className: 'num', text: moneyReport(logged) })])])
      ]));
      reportEl.appendChild(el('p', { className: 'note', text: 'Category totals are for expenses logged in Budget Sync this period. They do not include the already-spent amount carried in from the state report (' + moneyReport(starting) + ').' }));
    }
  }

  reportEl.appendChild(el('h2', { text: 'Expense list' }));
  if (!expenses.length) {
    reportEl.appendChild(el('p', { className: 'empty', text: 'No expenses were logged this period.' }));
  } else {
    var expBody = el('tbody');
    expenses.forEach(function (item) {
      expBody.appendChild(el('tr', null, [
        el('td', { text: BudgetSync.formatDate(item.date) }),
        el('td', { text: item.desc || '' }),
        el('td', { text: item.cat || '' }),
        el('td', { className: 'num', text: moneyReport(item.amount) }),
        el('td', { text: item.by || '' })
      ]));
    });
    reportEl.appendChild(el('table', null, [
      el('thead', null, [el('tr', null, [el('th', { text: 'Date' }), el('th', { text: 'Description' }), el('th', { text: 'Category' }), el('th', { className: 'num', text: 'Amount' }), el('th', { text: 'Entered by' })])]),
      expBody,
      el('tfoot', null, [el('tr', null, [el('td', { text: 'Total' }), el('td', { text: '' }), el('td', { text: '' }), el('td', { className: 'num', text: moneyReport(logged) }), el('td', { text: '' })])])
    ]));
  }
  reportEl.appendChild(el('p', { className: 'note', text: 'Generated from Budget Sync on the Callahan Office board. This is an office record of the biennium budget and expenses logged in Trello as of ' + generated + '.' }));
}

document.getElementById('back-btn').addEventListener('click', function () {
  document.title = 'Office Budget';
  showSection('overview');
});

document.getElementById('print-btn').addEventListener('click', function () {
  window.print();
});

document.getElementById('confirm-reset-btn').addEventListener('click', function () {
  if (!currentBudget) return;
  var start = BudgetSync.periodStartForReset(currentBudget);
  var ok = window.confirm(
    'I\'ve saved the report, reset for next session?\n\nThis will clear all expenses, per-category spent and carried-in amounts, the already-spent total, and unitemized amounts. The biennium budget goes back to $25,000, and the next period starts on ' +
    BudgetSync.formatDate(start) + '. Every category the office has made is kept — names, groups, and planned amounts. A reset never deletes categories. This cannot be undone.'
  );
  if (!ok) return;
  BudgetSync.save(t, BudgetSync.startNewPeriod(currentBudget)).then(function () {
    resetExpenseForm();
    resetPlanForm();
    document.title = 'Office Budget';
    showSection('overview');
    return refresh();
  }).catch(function () {
    BudgetSync.showError(document.getElementById('report-error'), 'Could not reset the budget. Please try again.');
  });
});

document.getElementById('remove-btn').addEventListener('click', function () {
  if (!window.confirm('Remove the budget from this board? Expense history will be deleted.')) return;
  BudgetSync.remove(t).then(function () {
    resetExpenseForm();
    return refresh();
  }).catch(function () {
    window.alert('Could not remove the budget. Please try again.');
  });
});


document.querySelectorAll('.nav-btn[data-section]').forEach(function (btn) {
  btn.addEventListener('click', function () {
    showSection(btn.getAttribute('data-section'));
  });
});

var viewAll = document.getElementById('view-all-expenses');
if (viewAll) {
  viewAll.addEventListener('click', function () {
    showSection('expenses');
  });
}


document.getElementById('plan-form').addEventListener('submit', function (event) {
  event.preventDefault();
  var err = document.getElementById('plan-error');
  BudgetSync.showError(err, '');
  var name = (document.getElementById('plan-name').value || '').trim();
  var planned = BudgetSync.parseMoney(document.getElementById('plan-amount').value);
  var groupVal = document.getElementById('plan-group').value;
  if (!name) return BudgetSync.showError(err, 'Please enter a category name.');
  if (!isFinite(planned) || planned < 0) return BudgetSync.showError(err, 'Enter a planned amount of zero or more.');
  BudgetSync.load(t).then(function (budget) {
    if (!budget) throw new Error('NO_BUDGET');
    return BudgetSync.save(t, BudgetSync.upsertPlannedCategory(budget, {
      id: editingPlanId || '',
      name: name,
      planned: planned,
      group: groupVal === '' ? -1 : Number(groupVal)
    }));
  }).then(function () {
    resetPlanForm();
    return refresh();
  }).catch(function (e) {
    if (e && e.code === 'DUP') return BudgetSync.showError(err, 'A category with that name already exists.');
    if (e && e.code === 'NAME') return BudgetSync.showError(err, 'Please enter a category name.');
    if (e && e.code === 'AMOUNT') return BudgetSync.showError(err, 'Enter a planned amount of zero or more.');
    if (e && e.code === 'FULL') return BudgetSync.showError(err, BudgetSync.fullMessage());
    BudgetSync.showError(err, 'Could not save that category. Please try again.');
  });
});

document.getElementById('plan-cancel').addEventListener('click', resetPlanForm);

document.getElementById('webhook-form').addEventListener('submit', function (event) {
  event.preventDefault();
  var err = document.getElementById('webhook-error');
  BudgetSync.showError(err, '');
  var url = document.getElementById('webhook-url').value;
  BudgetSync.load(t).then(function (budget) {
    if (!budget) throw new Error('NO_BUDGET');
    return BudgetSync.save(t, BudgetSync.setWebhookUrl(budget, url));
  }).then(refresh).catch(function (e) {
    if (e && e.code === 'HTTPS') return BudgetSync.showError(err, 'Use an https URL (or localhost for a test).');
    if (e && e.code === 'URL') return BudgetSync.showError(err, 'Enter a valid webhook URL.');
    if (e && e.code === 'FULL') return BudgetSync.showError(err, BudgetSync.fullMessage());
    BudgetSync.showError(err, 'Could not save the webhook URL. Please try again.');
  });
});

document.getElementById('webhook-send').addEventListener('click', function () {
  var err = document.getElementById('webhook-error');
  BudgetSync.showError(err, '');
  if (!currentBudget || !currentBudget.k) {
    return BudgetSync.showError(err, 'Save a webhook URL first.');
  }
  var month = BudgetSync.chicagoYearMonth();
  var payload = BudgetSync.buildMonthlyPayload(currentBudget, month, currentMemberName);
  var url = currentBudget.k;
  BudgetSync.postWebhook(url, payload).then(function () {
    return BudgetSync.load(t).then(function (budget) {
      if (!budget) return;
      return BudgetSync.save(t, BudgetSync.markWebhookResult(budget, { ok: true })).then(refresh);
    });
  }).catch(function () {
    return BudgetSync.load(t).then(function (budget) {
      if (!budget) return;
      return BudgetSync.save(t, BudgetSync.markWebhookResult(budget, { ok: false })).then(function () {
        BudgetSync.showError(err, 'The update could not be sent. Check the URL and try again.');
        return refresh();
      });
    });
  });
});


t.render(function () {
  canWrite = typeof t.memberCanWriteToModel === 'function' ? t.memberCanWriteToModel('board') : true;
  return t.member('fullName', 'username').then(function (member) {
    currentMemberName = (member && (member.fullName || member.username)) || 'you';
    return refresh();
  }).catch(function () {
    return refresh();
  });
});
