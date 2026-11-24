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
  var allowed = { overview: true, expenses: true, categories: true, reports: true, settings: true };
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

(function fillCategories() {
  var select = document.getElementById('exp-category');
  BudgetSync.CATEGORIES.forEach(function (name, index) {
    var opt = document.createElement('option');
    opt.value = String(index);
    opt.textContent = name;
    select.appendChild(opt);
  });
})();

var expOther = document.getElementById('exp-other');
document.getElementById('exp-category').addEventListener('change', function () {
  var isOther = parseInt(this.value, 10) === BudgetSync.OTHER_INDEX;
  expOther.hidden = !isOther;
  if (!isOther) expOther.value = '';
});

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
  expOther.hidden = true;
  expOther.value = '';
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
  if (item.catIndex >= 0) document.getElementById('exp-category').value = String(item.catIndex);
  else document.getElementById('exp-category').value = String(BudgetSync.OTHER_INDEX);
  if (item.catIndex === BudgetSync.OTHER_INDEX) {
    expOther.hidden = false;
    expOther.value = item.catOther || item.cat || '';
  } else {
    expOther.hidden = true;
    expOther.value = '';
  }
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
  bar.className = 'used-bar' + (over ? ' is-over' : '');
  bar.style.width = Math.max(0, Math.min(100, over ? 100 : usedPct)) + '%';
  text(document.getElementById('hero-used'), (over ? usedPct : Math.max(0, usedPct)) + '% used');
  var starting = BudgetSync.startingSpentOf(budget);
  var logged = BudgetSync.loggedSpentOf(budget);
  var sub = document.getElementById('expense-sub');
  if (starting && logged) text(sub, 'Includes ' + BudgetSync.formatMoney(starting) + ' from the state report, plus ' + BudgetSync.formatMoney(logged) + ' logged here.');
  else if (starting) text(sub, 'Includes ' + BudgetSync.formatMoney(starting) + ' already spent from the state report.');
  else if (logged) text(sub, BudgetSync.formatMoney(logged) + ' logged here.');
  else text(sub, 'No spending logged yet.');
  text(document.getElementById('expense-heading'), budget.e.length === 1 ? '1 expense' : budget.e.length + ' expenses');
}

function renderCategories(budget) {
  var host = document.getElementById('category-totals');
  host.textContent = '';
  var rows = BudgetSync.categoryTotals(budget);
  if (!rows.length) {
    host.appendChild(el('p', { className: 'empty-table', text: 'No categorized expenses yet. Already-spent from the state report is a total only.' }));
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
  text(storage, 'Storage used: ' + info.percent + '% of Trello’s board limit.');
  if (info.full) document.getElementById('exp-save').disabled = true;
}

function renderBudget(budget) {
  currentBudget = budget;
  renderSummary(budget);
  renderBanners(budget);
  renderCategories(budget);
  renderExpenses(budget);
  renderRecent(budget);
  renderSettings(budget);
  if (currentSection === 'reports') renderReport(budget);
  if (!editingId) {
    if (!document.getElementById('exp-date').value) {
      document.getElementById('exp-date').value = BudgetSync.todayISO();
    }
    text(document.getElementById('exp-by'), currentMemberName);
  }
}

function refresh() {
  return BudgetSync.load(t).then(function (budget) {
    currentBudget = budget;
    if (!budget) {
      showView('setup');
      document.getElementById('setup-total').value = BudgetSync.DEFAULT_TOTAL;
    } else {
      showView('budget');
      renderBudget(budget);
      showSection(currentSection);
    }
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
  var catVal = document.getElementById('exp-category').value;
  var catIndex = catVal === '' ? -1 : parseInt(catVal, 10);
  var catOther = (document.getElementById('exp-other').value || '').trim();
  if (!date) return BudgetSync.showError(err, 'Please pick a date.');
  if (!desc) return BudgetSync.showError(err, 'Please enter a short description.');
  if (catIndex < 0) return BudgetSync.showError(err, 'Please choose a category.');
  if (catIndex === BudgetSync.OTHER_INDEX && !catOther) return BudgetSync.showError(err, 'Please describe the Other category.');
  if (!isFinite(amount) || amount <= 0) return BudgetSync.showError(err, 'Enter an amount greater than zero.');

  BudgetSync.load(t).then(function (budget) {
    if (!budget) throw new Error('NO_BUDGET');
    var expense = {
      id: editingId || BudgetSync.newId(),
      date: date,
      desc: desc,
      catIndex: catIndex,
      catOther: catIndex === BudgetSync.OTHER_INDEX ? catOther : '',
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
    'I\'ve saved the report, reset for next session?\n\nThis will clear all logged expenses and the already-spent amount, set the biennium budget back to $25,000, and start the next period on ' +
    BudgetSync.formatDate(start) + '. This cannot be undone.'
  );
  if (!ok) return;
  BudgetSync.save(t, BudgetSync.startNewPeriod(currentBudget)).then(function () {
    resetExpenseForm();
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

t.render(function () {
  canWrite = typeof t.memberCanWriteToModel === 'function' ? t.memberCanWriteToModel('board') : true;
  return t.member('fullName', 'username').then(function (member) {
    currentMemberName = (member && (member.fullName || member.username)) || 'you';
    return refresh();
  }).catch(function () {
    return refresh();
  });
});
