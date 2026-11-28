/* global TrelloPowerUp, Vault */
var t = TrelloPowerUp.iframe();
var data = Vault.empty();   // array of [name, url, username, password]
var revealed = {};          // entry index -> true while the password is shown
var editIndex = -1;         // -1 = adding
var deleteIndex = -1;
var canWrite = true;
var toastTimer = null;

Vault.applyTheme(t);

function $(id) { return document.getElementById(id); }
function text(node, v) { if (node) node.textContent = v == null ? '' : String(v); }

var ICON = {
  eye: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.9 17.9A10.4 10.4 0 0 1 12 19c-6.4 0-10-7-10-7a17.6 17.6 0 0 1 4.1-4.9M9.9 5.2A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a17.7 17.7 0 0 1-2.2 3.2M1 1l22 22"/><path d="M14.1 14.1a3 3 0 0 1-4.2-4.2"/></svg>',
  copy: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
  open: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/></svg>',
  edit: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  trash: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/></svg>'
};

function el(tag, attrs, kids) {
  var n = document.createElement(tag);
  Object.keys(attrs || {}).forEach(function (k) {
    if (k === 'class') n.className = attrs[k];
    else if (k === 'html') n.innerHTML = attrs[k];
    else if (k === 'text') n.textContent = attrs[k];
    else n.setAttribute(k, attrs[k]);
  });
  (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
  return n;
}

function resize() {
  if (typeof t.sizeTo === 'function') t.sizeTo(document.body).catch(function () { return null; });
}

/* ---------- navigation ---------- */
function showSection(name) {
  document.querySelectorAll('.nav-btn[data-section]').forEach(function (b) {
    var on = b.getAttribute('data-section') === name;
    b.classList.toggle('is-active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  document.querySelectorAll('.app-section').forEach(function (s) {
    s.hidden = s.getAttribute('data-section-panel') !== name;
  });
  $('main').scrollTop = 0;
  if (name === 'settings') renderSettings();
}
document.querySelectorAll('.nav-btn[data-section]').forEach(function (b) {
  b.addEventListener('click', function () { showSection(b.getAttribute('data-section')); });
});

/* ---------- toast + clipboard ---------- */
function toast(msg) {
  var n = $('toast');
  n.textContent = msg || 'Copied';
  n.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { n.hidden = true; }, 1400);
}

function copyText(value, label) {
  value = String(value || '');
  if (!value) return;
  var done = function () { toast('Copied ' + (label || '')); };
  var legacy = function () {
    var ta = document.createElement('textarea');
    ta.value = value; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, value.length);
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    if (ok) done(); else toast('Could not copy');
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(value).then(done, legacy);
  } else {
    legacy();
  }
}

/* ---------- capacity ---------- */
function renderCapacity() {
  var cap = Vault.capacity(data);
  var banner = $('banner');
  if (cap.missing && cap.missing.length) {
    banner.hidden = false; banner.className = 'banner';
    banner.textContent = Vault.missingCardMessage();
  } else if (cap.needSetup) {
    banner.hidden = false; banner.className = 'banner';
    banner.textContent = Vault.setupCardMessage();
  } else if (cap.full || cap.needCard) {
    banner.hidden = false; banner.className = 'banner is-full';
    banner.textContent = cap.needCard ? Vault.needCardMessage(cap.nextTitle) : Vault.fullMessage();
  } else if (cap.warn) {
    banner.hidden = false; banner.className = 'banner';
    var across = cap.cardCount ? (' across ' + cap.cardCount + ' storage card' + (cap.cardCount === 1 ? '' : 's')) : '';
    banner.textContent = 'Storage is ' + Math.round(cap.ratio * 100) + '% full' + across + '. Room for about ' + cap.roomFor + ' more logins.';
  } else {
    banner.hidden = true;
  }
  text($('side-count'), data.length + (data.length === 1 ? ' login' : ' logins'));
  return cap;
}

function renderSettings() {
  var cap = renderCapacity();
  var pct = Math.min(100, cap.percent != null ? cap.percent : Math.round(cap.ratio * 100));
  var fill = $('meter-fill');
  fill.style.width = pct + '%';
  fill.classList.toggle('is-warn', cap.warn || cap.full || cap.needCard);
  $('meter-wrap').setAttribute('aria-label', pct + ' percent full');
  text($('meter-text'), Vault.storageLineText(cap));
  text($('meter-room'), data.length + ' saved. Room for about ' + cap.roomFor + ' more.');
  text($('ver'), Vault.ASSET_VERSION);
}

/* ---------- logins list ---------- */
function cell(label, kids) {
  return el('div', { class: 'cell' }, [el('span', { class: 'cell-label', text: label })].concat(kids));
}
function iconBtn(kind, label, handler, extra) {
  var b = el('button', { type: 'button', class: 'icon-btn' + (extra ? ' ' + extra : ''), 'aria-label': label, title: label, html: ICON[kind] });
  b.addEventListener('click', handler);
  return b;
}

function renderList() {
  var q = $('search').value.trim().toLowerCase();
  var list = $('list');
  list.innerHTML = '';
  var shown = 0;
  data.forEach(function (r, i) {
    if (q && (r[0] + ' ' + r[1] + ' ' + r[2]).toLowerCase().indexOf(q) === -1) return;
    shown++;
    var left = el('div', { class: 'cell' }, [el('div', { class: 'e-name', text: r[0] })]);
    if (r[1]) left.appendChild(el('div', { class: 'e-sub', text: r[1] }));

    var userCell = cell('Username', [el('div', { class: 'val-row' }, [
      el('span', { class: 'val', text: r[2] || '—' }),
      r[2] ? iconBtn('copy', 'Copy username', function () { copyText(r[2], 'username'); }) : null
    ])]);

    var shownPw = !!revealed[i];
    var pwKids = [el('span', { class: 'val' + (shownPw ? '' : ' dots'), text: r[3] ? (shownPw ? r[3] : '••••••••••') : '—' })];
    if (r[3]) {
      pwKids.push(iconBtn(shownPw ? 'eyeOff' : 'eye', shownPw ? 'Hide password' : 'Show password', function () {
        if (revealed[i]) delete revealed[i]; else revealed[i] = true;
        renderList();
      }));
      pwKids.push(iconBtn('copy', 'Copy password', function () { copyText(r[3], 'password'); }));
    }
    var pwCell = cell('Password', [el('div', { class: 'val-row' }, pwKids)]);

    var actions = el('div', { class: 'e-actions' }, [
      r[1] ? iconBtn('open', 'Open site', function () { window.open(Vault.openUrl(r[1]), '_blank', 'noopener'); }) : null,
      iconBtn('edit', 'Edit', function () { openForm(i); }),
      iconBtn('trash', 'Delete', function () { askDelete(i); }, 'del')
    ]);
    var card = el('div', { class: 'entry' }, [left, userCell, pwCell, actions]);
    list.appendChild(card);
  });
  if (!shown) {
    list.appendChild(data.length
      ? el('div', { class: 'empty' }, [el('strong', { text: 'No matches' }), document.createTextNode('Try a different search.')])
      : el('div', { class: 'empty' }, [el('strong', { text: 'No logins yet' }), document.createTextNode('Click “Add login” to save your first one.')]));
  }
  renderCapacity();
  resize();
}

/* ---------- saving (always re-read first so two people don't overwrite each other) ---------- */
function mutate(fn) {
  if (!canWrite) { return Promise.reject(new Error('You have view-only access to this board.')); }
  return Vault.load(t).then(function (fresh) {
    var err = fn(fresh);
    if (err) throw new Error(err);
    var cap = Vault.capacity(fresh);
    var before = Vault.capacity(data);
    if (cap.full && cap.used > before.used && !cap.needCard && cap.cardCount) {
      throw new Error(Vault.fullMessage());
    }
    return Vault.save(t, fresh).then(function () { data = fresh; }).catch(function (err) {
      throw new Error(Vault.saveErrorMessage(err));
    });
  });
}

/* ---------- add / edit form ---------- */
function setEye(show) {
  var inp = $('f-pass');
  inp.type = show ? 'text' : 'password';
  $('f-eye').innerHTML = show ? ICON.eyeOff : ICON.eye;
  $('f-eye').setAttribute('aria-label', show ? 'Hide password' : 'Show password');
}

function openForm(i) {
  editIndex = i;
  var r = i >= 0 ? data[i] : ['', '', '', ''];
  text($('form-title'), i >= 0 ? 'Edit login' : 'Add login');
  $('f-name').value = r[0]; $('f-url').value = r[1]; $('f-user').value = r[2]; $('f-pass').value = r[3];
  setEye(false);
  text($('form-error'), '');
  $('form-overlay').hidden = false;
  $('f-name').focus();
}
function closeForm() { $('form-overlay').hidden = true; }

$('btn-add').addEventListener('click', function () { openForm(-1); });
$('f-cancel').addEventListener('click', closeForm);
$('f-eye').addEventListener('click', function () { setEye($('f-pass').type === 'password'); });
$('f-gen').addEventListener('click', function () {
  $('f-pass').value = Vault.generatePassword(16);
  setEye(true);
});
$('form-overlay').addEventListener('mousedown', function (e) { if (e.target === this) closeForm(); });

$('login-form').addEventListener('submit', function (e) {
  e.preventDefault();
  var M = Vault.MAX;
  var row = [
    $('f-name').value.trim().slice(0, M.name),
    Vault.stripScheme($('f-url').value).slice(0, M.url),
    $('f-user').value.trim().slice(0, M.user),
    $('f-pass').value.slice(0, M.pass)
  ];
  if (!row[0]) { text($('form-error'), 'Please enter a name.'); return; }
  var idx = editIndex;
  var snapshot = idx >= 0 ? data[idx] : null;
  mutate(function (fresh) {
    if (idx >= 0) {
      // find by original content in case someone else added/removed entries meanwhile
      var at = -1;
      fresh.forEach(function (r, k) { if (at < 0 && snapshot && r.join('\u0001') === snapshot.join('\u0001')) at = k; });
      if (at < 0) return 'This login was changed by someone else. Close and reopen to see the latest.';
      fresh[at] = row;
    } else {
      fresh.push(row);
    }
  }).then(function () {
    revealed = {};
    closeForm(); renderList(); toast('Saved');
  }).catch(function (err) { text($('form-error'), err.message || 'Could not save. Please try again.'); });
});

/* ---------- delete with confirmation ---------- */
function askDelete(i) {
  deleteIndex = i;
  text($('confirm-text'), '“' + data[i][0] + '” will be removed for everyone with access to this board. This cannot be undone.');
  $('confirm-overlay').hidden = false;
}
$('c-cancel').addEventListener('click', function () { $('confirm-overlay').hidden = true; });
$('c-ok').addEventListener('click', function () {
  var snap = data[deleteIndex];
  if (!snap) { $('confirm-overlay').hidden = true; return; }
  mutate(function (fresh) {
    var at = -1;
    fresh.forEach(function (r, k) { if (at < 0 && r.join('\u0001') === snap.join('\u0001')) at = k; });
    if (at < 0) return null;
    fresh.splice(at, 1);
  }).then(function () {
    revealed = {}; $('confirm-overlay').hidden = true; renderList(); toast('Deleted');
  }).catch(function (err) { $('confirm-overlay').hidden = true; toast(err.message || 'Could not delete'); });
});

/* ---------- search / filter / keys ---------- */
$('search').addEventListener('input', renderList);
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape') return;
  if (!$('confirm-overlay').hidden) $('confirm-overlay').hidden = true;
  else if (!$('form-overlay').hidden) closeForm();
});

/* ---------- start ---------- */
t.render(function () {
  canWrite = typeof t.memberCanWriteToModel === 'function' ? t.memberCanWriteToModel('board') : true;
  return Vault.load(t).then(function (d) {
    data = d;
    renderList();
    text($('ver'), Vault.ASSET_VERSION);
  }).catch(function () {
    text($('banner'), 'Could not load logins. Close and reopen this window.');
    $('banner').hidden = false;
  });
});
