/* global TrelloPowerUp, Docs */
'use strict';
var t = TrelloPowerUp.iframe();

var state = null;      // { records, admin, cardIds, ... }
var me = null;         // { id, name, username } or null
var members = [];      // board members (used for the admin's "not yet signed" list)
var canWrite = true;
var query = '';
var catFilter = '';
var editId = null;     // id of document being edited, or null when adding
var signId = null;     // id of document being signed
var deleteId = null;
var toastTimer = null;

function $(id) { return document.getElementById(id); }
function text(el, s) { el.textContent = s == null ? '' : String(s); return el; }
function el(tag, cls, s) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (s != null) n.textContent = s;
  return n;
}
function isAdmin() { return Docs.isAdmin(me, state && state.admin); }

/* ---------- dates ---------- */
var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(ymd) {
  var m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  return MONTHS[Number(m[2]) - 1] + ' ' + Number(m[3]) + ', ' + m[1];
}
function fmtStamp(iso) {
  var d = new Date(iso);
  if (isNaN(d.getTime())) return fmtDate(iso);
  return MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}
function fmtStampTime(iso) {
  var d = new Date(iso);
  if (isNaN(d.getTime())) return fmtDate(iso);
  var h = d.getHours(), mi = d.getMinutes();
  return fmtStamp(iso) + ' at ' + (h % 12 || 12) + ':' + (mi < 10 ? '0' : '') + mi + ' ' + (h < 12 ? 'AM' : 'PM');
}

/* ---------- UI helpers ---------- */
function toast(msg) {
  var n = $('toast');
  text(n, msg); n.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { n.hidden = true; }, 2200);
}
function showBanner(msg) {
  var b = $('banner');
  if (!msg) { b.hidden = true; return; }
  text(b, msg); b.hidden = false;
}
function svg(path) {
  var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('width', '16'); s.setAttribute('height', '16'); s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.9');
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', path); s.appendChild(p);
  return s;
}
function iconBtn(cls, label, path, fn) {
  var b = el('button', 'icon-btn ' + cls);
  b.type = 'button'; b.title = label; b.setAttribute('aria-label', label);
  b.appendChild(svg(path));
  b.addEventListener('click', fn);
  return b;
}
var PEN = 'M4 20h4L19 9l-4-4L4 16z';
var TRASH = 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13';

/* ---------- navigation ---------- */
function showSection(name) {
  document.querySelectorAll('.nav-btn').forEach(function (b) {
    var on = b.getAttribute('data-section') === name;
    b.classList.toggle('is-active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  document.querySelectorAll('[data-section-panel]').forEach(function (s) {
    s.hidden = s.getAttribute('data-section-panel') !== name;
  });
  if (name === 'settings') renderSettings();
}
document.querySelectorAll('.nav-btn').forEach(function (b) {
  b.addEventListener('click', function () { showSection(b.getAttribute('data-section')); });
});

/* ---------- list ---------- */
function renderChips() {
  var wrap = $('chips');
  wrap.textContent = '';
  [''].concat(Docs.CATEGORIES).forEach(function (c) {
    var b = el('button', 'chip' + (catFilter === c ? ' is-active' : ''), c || 'All');
    b.type = 'button';
    b.addEventListener('click', function () { catFilter = c; renderChips(); renderList(); });
    wrap.appendChild(b);
  });
}

function sigLine(s, showTyped) {
  var who = s.memberName || s.typed;
  var line = who + ', ' + fmtStampTime(s.at);
  if (showTyped && s.typed && s.typed.toLowerCase() !== (s.memberName || '').toLowerCase()) line += ' (typed: ' + s.typed + ')';
  return line;
}

function adminPanel(d) {
  var current = Docs.sigsOf(state.records, d.id, d.version);
  var all = Docs.sigsOf(state.records, d.id);
  var det = el('details', 'sigs');
  var sum = el('summary', null, 'Signatures: ' + current.length + ' signed on version ' + d.version);
  sum.appendChild(el('span', 'admin-tag', 'only you can see this'));
  det.appendChild(sum);

  det.appendChild(el('h3', null, 'Signed by'));
  if (!current.length) det.appendChild(el('div', 'none', 'No one has signed this version yet.'));
  else {
    var ul = el('ul');
    current.forEach(function (s) { ul.appendChild(el('li', null, sigLine(s, true))); });
    det.appendChild(ul);
  }
  if (members.length) {
    var signedIds = {};
    current.forEach(function (s) { signedIds[s.memberId] = true; });
    var pending = members.filter(function (m) { return !signedIds[m.id] && !(me && m.id === me.id); }).map(function (m) { return m.name; });
    det.appendChild(el('h3', null, 'Not yet signed'));
    det.appendChild(el('div', pending.length ? 'none' : null, pending.length ? pending.join(', ') : 'Everyone on the board has signed.'));
  }
  var past = all.filter(function (s) { return s.version !== d.version; });
  if (past.length) {
    det.appendChild(el('h3', null, 'History (earlier versions)'));
    var versions = {};
    past.forEach(function (s) { (versions[s.version] = versions[s.version] || []).push(s); });
    Object.keys(versions).sort(function (a, b) { return Number(b) - Number(a); }).forEach(function (v) {
      var u = el('ul');
      versions[v].forEach(function (s) { u.appendChild(el('li', null, 'Version ' + v + ': ' + sigLine(s, true))); });
      det.appendChild(u);
    });
  }
  return det;
}

function entry(d) {
  var box = el('div', 'entry');
  var top = el('div', 'entry-top');
  var main = el('div', 'e-main');
  var tr = el('div', 'e-titlerow');
  tr.appendChild(el('span', 'e-title', d.title));
  if (d.cat) tr.appendChild(el('span', 'badge', d.cat));
  if (d.sign && d.version > 1) tr.appendChild(el('span', 'badge ver', 'Version ' + d.version));
  main.appendChild(tr);
  if (d.desc) main.appendChild(el('div', 'e-desc', d.desc));
  var meta = 'Added ' + fmtDate(d.date);
  if (d.updated) meta += ' · Updated ' + fmtDate(d.updated);
  main.appendChild(el('div', 'e-meta', meta));
  top.appendChild(main);

  var side = el('div', 'e-side');
  var btns = el('div', 'e-btns');
  if (d.sign) {
    var mine = me ? Docs.findSig(state.records, d.id, me.id, d.version) : null;
    if (!me) {
      btns.appendChild(el('span', 'need', 'Cannot tell who you are in Trello, so signing is off.'));
    } else if (!mine) {
      btns.appendChild(el('span', 'need', 'Signature needed'));
      var sb = el('button', 'ghost big sign-btn', 'Sign');
      sb.type = 'button';
      sb.addEventListener('click', function () { openSign(d.id); });
      btns.appendChild(sb);
    }
  }
  var open = el('a', 'primary big', 'Open');
  open.href = d.url; open.target = '_blank'; open.rel = 'noopener noreferrer';
  btns.appendChild(open);
  side.appendChild(btns);
  if (d.sign && me) {
    var mine2 = Docs.findSig(state.records, d.id, me.id, d.version);
    if (mine2) side.appendChild(el('div', 'signed-note', '✓ You signed on ' + fmtStampTime(mine2.at)));
  }
  var icons = el('div', 'icon-row');
  icons.appendChild(iconBtn('', 'Edit', PEN, function () { openForm(d.id); }));
  icons.appendChild(iconBtn('del', 'Delete', TRASH, function () { askDelete(d.id); }));
  side.appendChild(icons);
  top.appendChild(side);
  box.appendChild(top);
  if (d.sign && isAdmin()) box.appendChild(adminPanel(d));
  return box;
}

function renderList() {
  var list = $('list');
  list.textContent = '';
  var docs = Docs.docsOf(state.records);
  text($('side-count'), docs.length + (docs.length === 1 ? ' document' : ' documents'));
  var q = query.trim().toLowerCase();
  var shown = docs.filter(function (d) {
    if (catFilter && d.cat !== catFilter) return false;
    if (!q) return true;
    return (d.title + ' ' + d.desc + ' ' + d.cat).toLowerCase().indexOf(q) >= 0;
  });
  if (!shown.length) {
    var e = el('div', 'empty');
    e.appendChild(el('strong', null, docs.length ? 'No matching documents' : 'No documents yet'));
    e.appendChild(document.createTextNode(docs.length ? 'Try a different search.' : 'Click “+ Add document” to add the first one.'));
    list.appendChild(e);
  } else {
    shown.forEach(function (d) { list.appendChild(entry(d)); });
  }
  renderBanners();
  renderBulletins();
}

function renderBanners() {
  var cap = Docs.capacity(state);
  if (state.missing > 0) showBanner(Docs.missingMessage());
  else if (cap.full) showBanner(Docs.needCardMessage(cap.nextTitle));
  else if (cap.warn) showBanner('Storage is ' + cap.percent + '% full. Soon you will need to add a card named “' + cap.nextTitle + '” to an open list (never archived).');
  else showBanner('');
}

/* ---------- settings ---------- */
function renderSettings() {
  var cap = Docs.capacity(state);
  var fill = $('meter-fill');
  fill.style.width = Math.max(2, cap.percent) + '%';
  fill.classList.toggle('is-warn', cap.warn || cap.full);
  text($('meter-text'), cap.percent + '% of storage used (' + cap.used.toLocaleString() + ' of ' + cap.limit.toLocaleString() + ' characters)');
  text($('meter-room'), 'Room for about ' + cap.roomFor + ' more documents or signatures.');
  text($('meter-cards'), state.cardIds.length
    ? 'Storage cards found: ' + state.cardNames.join('; ')
    : 'No storage cards yet. They are only needed when this board-level space fills up. Then add a card named “' + cap.nextTitle + '”.');
  text($('ver'), Docs.ASSET_VERSION);

  var actions = $('admin-actions');
  actions.textContent = '';
  var stored = state.admin;
  var adminNow = isAdmin();
  var msg;
  if (adminNow) msg = 'You are the document admin. Only you can see who has signed, mark a document as updated, and delete a document that has signatures.';
  else if (stored) msg = 'The document admin is ' + (stored[1] || 'set') + '. You can see and sign documents, but only the admin sees who has signed.';
  else msg = 'No document admin is set yet. The admin is the person who sees who has signed. Calvin should set this first.';
  if (stored && adminNow && stored[0] !== (me && me.id)) msg += ' (Admin on file: ' + (stored[1] || 'someone else') + '.)';
  text($('admin-text'), msg);

  function adminBtn(label, cls, pair, doneMsg) {
    var b = el('button', cls, label);
    b.type = 'button';
    b.addEventListener('click', function () {
      Docs.mutate(t, function (recs) { return recs; }, function () { return pair; }).then(function (s) {
        state = s; renderAll(); renderSettings(); toast(doneMsg);
      }).catch(function (err) { toast(err.message || 'Could not save'); });
    });
    actions.appendChild(b);
  }
  if (me && !stored) adminBtn('Make me the document admin', 'primary', [me.id, me.name], 'You are now the admin');
  else if (me && Docs.nameMatchesAdmin(me) && (!stored || stored[0] !== me.id)) adminBtn('Take over as admin', 'primary', [me.id, me.name], 'You are now the admin');
  else if (me && stored && stored[0] === me.id) adminBtn('Step down as admin', 'ghost', null, 'Admin cleared');
}

/* ---------- storage plumbing ---------- */
function guardWrite() {
  if (!canWrite) { toast('You do not have permission to change this board.'); return false; }
  return true;
}
function refresh(s) { state = s; renderAll(); }
function renderAll() { renderList(); }

/* ---------- add / edit ---------- */
function openForm(id) {
  editId = id || null;
  var d = null;
  if (id) {
    Docs.docsOf(state.records).forEach(function (x) { if (x.id === id) d = x; });
    if (!d) return;
  }
  text($('form-title'), d ? 'Edit document' : 'Add document');
  $('f-title').value = d ? d.title : '';
  $('f-url').value = d ? d.url : '';
  $('f-desc').value = d ? d.desc : '';
  $('f-cat').value = d ? d.cat : '';
  $('f-sign').checked = d ? d.sign : false;
  var locked = !!(d && Docs.hasSigs(state.records, d.id) && !isAdmin());
  $('f-sign').disabled = locked;
  $('f-sign-note').hidden = !locked;
  $('f-bump').checked = false;
  $('f-bump-wrap').hidden = !(d && d.sign && isAdmin());
  text($('form-error'), '');
  $('form-overlay').hidden = false;
  $('f-title').focus();
}
function closeForm() { $('form-overlay').hidden = true; editId = null; }

(function buildCats() {
  var sel = $('f-cat');
  var none = el('option', null, 'None'); none.value = '';
  sel.appendChild(none);
  Docs.CATEGORIES.forEach(function (c) { var o = el('option', null, c); o.value = c; sel.appendChild(o); });
})();

$('btn-add').addEventListener('click', function () { if (guardWrite()) openForm(null); });
$('f-cancel').addEventListener('click', closeForm);

$('doc-form').addEventListener('submit', function (e) {
  e.preventDefault();
  if (!guardWrite()) return;
  var title = $('f-title').value.trim();
  if (!title) { text($('form-error'), 'Please enter a title.'); return; }
  var u = Docs.normalizeUrl($('f-url').value);
  if (u.error) { text($('form-error'), u.error); return; }
  var desc = $('f-desc').value.trim();
  var cat = $('f-cat').value;
  var sign = $('f-sign').checked;
  var bump = !$('f-bump-wrap').hidden && $('f-bump').checked && isAdmin();
  var id = editId;
  var admin = isAdmin();
  Docs.mutate(t, function (recs) {
    if (id) {
      var at = -1;
      recs.forEach(function (r, k) { if (r[0] === 'd' && r[1] === id) at = k; });
      if (at < 0) return null;
      var old = recs[at];
      var keepSign = (!admin && Docs.hasSigs(recs, id)) ? true : sign;
      var version = Number(old[8]) || 1, updated = old[9] || '';
      if (bump) { version += 1; updated = Docs.today(); }
      recs[at] = Docs.docRecord({ id: id, title: title, url: u.url, desc: desc, date: old[5], sign: keepSign, cat: cat, version: version, updated: updated });
    } else {
      recs.push(Docs.docRecord({ title: title, url: u.url, desc: desc, sign: sign, cat: cat }));
    }
    return recs;
  }).then(function (s) {
    closeForm(); refresh(s);
    toast(bump ? 'Saved. Everyone must sign again.' : 'Saved');
  }).catch(function (err) { text($('form-error'), err.message || 'Could not save. Please try again.'); });
});

/* ---------- sign ---------- */
function openSign(id) {
  var d = null;
  Docs.docsOf(state.records).forEach(function (x) { if (x.id === id) d = x; });
  if (!d || !me) return;
  signId = id;
  text($('sign-title'), 'Sign: ' + d.title);
  $('s-name').value = '';
  text($('sign-error'), '');
  $('sign-overlay').hidden = false;
  $('s-name').focus();
}
function closeSign() { $('sign-overlay').hidden = true; signId = null; }
$('s-cancel').addEventListener('click', closeSign);

$('sign-form').addEventListener('submit', function (e) {
  e.preventDefault();
  if (!guardWrite() || !me) return;
  var typed = $('s-name').value.trim().replace(/\s+/g, ' ');
  if (typed.length < 3) { text($('sign-error'), 'Please type your full name.'); return; }
  var id = signId;
  var seenVersion = null;
  Docs.docsOf(state.records).forEach(function (x) { if (x.id === id) seenVersion = x.version; });
  var problem = '';
  Docs.mutate(t, function (recs) {
    var cur = null;
    Docs.docsOf(recs).forEach(function (x) { if (x.id === id) cur = x; });
    if (!cur) { problem = 'This document was removed.'; return null; }
    if (cur.version !== seenVersion) { problem = 'This document was just updated. Close this window, reopen it, and read the new version first.'; return null; }
    if (Docs.findSig(recs, id, me.id, cur.version)) { problem = 'You have already signed this document.'; return null; }
    recs.push(Docs.sigRecord(id, me, typed, cur.version));
    return recs;
  }).then(function (s) {
    closeSign(); refresh(s);
    toast(problem || 'Signed. Thank you.');
  }).catch(function (err) { text($('sign-error'), err.message || 'Could not save your signature. Please try again.'); });
});

/* ---------- delete ---------- */
function askDelete(id) {
  if (!guardWrite()) return;
  var d = null;
  Docs.docsOf(state.records).forEach(function (x) { if (x.id === id) d = x; });
  if (!d) return;
  if (Docs.hasSigs(state.records, id) && !isAdmin()) {
    toast('Only the document admin can delete a document that has signatures.');
    return;
  }
  deleteId = id;
  text($('confirm-text'), '“' + d.title + '” will be removed for everyone on this board' + (Docs.hasSigs(state.records, id) ? ', along with all of its signatures and signature history' : '') + '. The file in Google Drive is not touched. This cannot be undone.');
  $('confirm-overlay').hidden = false;
}
$('c-cancel').addEventListener('click', function () { $('confirm-overlay').hidden = true; });
$('c-ok').addEventListener('click', function () {
  var id = deleteId;
  var admin = isAdmin();
  var problem = '';
  Docs.mutate(t, function (recs) {
    if (!admin && Docs.hasSigs(recs, id)) { problem = 'Only the document admin can delete a document that has signatures.'; return null; }
    return recs.filter(function (r) { return !((r[0] === 'd' && r[1] === id) || (r[0] === 's' && r[1] === id)); });
  }).then(function (s) {
    $('confirm-overlay').hidden = true; refresh(s); toast(problem || 'Deleted');
  }).catch(function (err) { $('confirm-overlay').hidden = true; toast(err.message || 'Could not delete'); });
});

/* ---------- search / keys ---------- */
$('search').addEventListener('input', function () { query = $('search').value; renderList(); });
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape') return;
  if (!$('confirm-overlay').hidden) $('confirm-overlay').hidden = true;
  else if (!$('bull-form-overlay').hidden) closeBullForm();
  else if (!$('bulletin-overlay').hidden) $('bp-later').click();
  else if (!$('sign-overlay').hidden) closeSign();
  else if (!$('form-overlay').hidden) closeForm();
});



/* ---------- bulletins ---------- */
var bulletinEditId = null;
var popQueue = [];
var popIndex = 0;
var skipPop = false;
var popShown = false;

function renderBulletins() {
  var wrap = $('bulletin-banners');
  if (!wrap) return;
  wrap.textContent = '';
  $('btn-bulletin').hidden = !isAdmin();
  var list = me ? Docs.unackedBulletins(state.records, me.id) : [];
  list.forEach(function (b) { wrap.appendChild(bannerEl(b)); });
  if (!skipPop && !popShown && list.length) { popShown = true; openBulletinPop(list); }
}

function bannerEl(b) {
  var box = el('div', 'bulletin-banner');
  box.appendChild(el('p', 'bb-kicker', 'Office Bulletin'));
  box.appendChild(el('h3', null, b.title));
  if (b.message) box.appendChild(el('div', 'bb-msg', b.message));
  var acts = el('div', 'bb-actions');
  if (b.url) {
    var a = el('a', 'primary', 'Click here');
    a.href = b.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    acts.appendChild(a);
  }
  var ack = el('button', 'ghost', 'Acknowledge');
  ack.type = 'button';
  ack.addEventListener('click', function () { acknowledge(b.id); });
  acts.appendChild(ack);
  box.appendChild(acts);
  return box;
}

function openBulletinPop(list) {
  popQueue = list; popIndex = 0;
  showPop();
}
function showPop() {
  var b = popQueue[popIndex];
  if (!b) { $('bulletin-overlay').hidden = true; return; }
  text($('bp-title'), b.title);
  text($('bp-msg'), b.message || '');
  var link = $('bp-link');
  if (b.url) { link.href = b.url; link.hidden = false; }
  else { link.hidden = true; }
  $('bulletin-overlay').hidden = false;
}
function closePop() { $('bulletin-overlay').hidden = true; }
$('bp-later').addEventListener('click', function () {
  popIndex += 1;
  if (popIndex < popQueue.length) showPop();
  else { skipPop = true; closePop(); }
});
$('bp-ack').addEventListener('click', function () {
  var b = popQueue[popIndex];
  if (!b) { closePop(); return; }
  acknowledge(b.id, function () {
    popIndex += 1;
    if (popIndex < popQueue.length) showPop();
    else closePop();
  });
});

function acknowledge(id, then) {
  if (!guardWrite() || !me) return;
  var problem = '';
  Docs.mutate(t, function (recs) {
    if (Docs.findAck(recs, id, me.id)) return recs;
    recs.push(Docs.ackRecord(id, me));
    return recs;
  }).then(function (s) {
    refresh(s);
    toast(problem || 'Acknowledged');
    if (then) then();
  }).catch(function (err) { toast(err.message || 'Could not save'); });
}

function openBullForm(id) {
  if (!isAdmin()) return;
  bulletinEditId = id || null;
  var b = null;
  if (id) Docs.bulletinsOf(state.records).forEach(function (x) { if (x.id === id) b = x; });
  text($('bull-form-title'), b ? 'Edit bulletin' : 'Post bulletin');
  $('b-title').value = b ? b.title : '';
  $('b-msg').value = b ? b.message : '';
  $('b-url').value = b ? b.url : '';
  text($('bull-form-error'), '');
  $('bull-form').querySelector('button[type=submit]').textContent = b ? 'Save' : 'Post';
  $('bull-form-overlay').hidden = false;
  $('b-title').focus();
}
function closeBullForm() { $('bull-form-overlay').hidden = true; bulletinEditId = null; }
$('btn-bulletin').addEventListener('click', function () { if (guardWrite()) openBullForm(null); });
$('b-cancel').addEventListener('click', closeBullForm);
$('bull-form').addEventListener('submit', function (e) {
  e.preventDefault();
  if (!guardWrite() || !isAdmin()) return;
  var title = $('b-title').value.trim();
  if (!title) { text($('bull-form-error'), 'Please enter a title.'); return; }
  var message = $('b-msg').value.trim();
  if (!message) { text($('bull-form-error'), 'Please enter a message.'); return; }
  if (message.length > Docs.MAX.message) { text($('bull-form-error'), 'That message is too long.'); return; }
  var url = $('b-url').value.trim();
  if (url) {
    var u = Docs.normalizeUrl(url);
    if (u.error) { text($('bull-form-error'), u.error); return; }
    url = u.url;
  }
  var id = bulletinEditId;
  Docs.mutate(t, function (recs) {
    if (id) {
      var at = -1;
      recs.forEach(function (r, k) { if (r[0] === 'b' && r[1] === id) at = k; });
      if (at < 0) return null;
      recs[at] = Docs.bulletinRecord({ id: id, title: title, message: message, url: url, date: recs[at][5], active: recs[at][6] });
    } else {
      recs.push(Docs.bulletinRecord({ title: title, message: message, url: url, active: 1 }));
    }
    return recs;
  }).then(function (s) {
    closeBullForm(); skipPop = false; popShown = false; refresh(s); toast(id ? 'Saved' : 'Bulletin posted');
  }).catch(function (err) { text($('bull-form-error'), err.message || 'Could not save.'); });
});

function endBulletin(id) {
  if (!isAdmin() || !guardWrite()) return;
  Docs.mutate(t, function (recs) {
    recs.forEach(function (r, k) {
      if (r[0] === 'b' && r[1] === id) recs[k] = Docs.bulletinRecord({ id: r[1], title: r[2], message: r[3], url: r[4], date: r[5], active: 0 });
    });
    return recs;
  }).then(function (s) { refresh(s); renderSettings(); toast('Bulletin ended'); })
    .catch(function (err) { toast(err.message || 'Could not end bulletin'); });
}

function renderBulletinAdmin() {
  var card = $('bulletin-admin-card');
  var wrap = $('bulletin-admin');
  if (!card || !wrap) return;
  if (!isAdmin()) { card.hidden = true; return; }
  card.hidden = false;
  wrap.textContent = '';
  var list = Docs.bulletinsOf(state.records, false);
  if (!list.length) { wrap.appendChild(el('p', 'muted', 'No bulletins yet. Click “+ Post bulletin” to post one.')); return; }
  list.forEach(function (b) {
    var box = el('div', 'admin-bull' + (b.active ? '' : ' ended'));
    var title = el('h3', null, b.title + (b.active ? '' : ' (ended)'));
    box.appendChild(title);
    if (b.message) box.appendChild(el('div', 'bb-msg', b.message));
    if (b.url) {
      var a = el('a', null, 'Click here');
      a.href = b.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      box.appendChild(a);
    }
    box.appendChild(el('div', 'e-meta', 'Posted ' + fmtDate(b.date)));
    var acks = Docs.acksOf(state.records, b.id);
    var ad = el('div', 'acks');
    ad.appendChild(el('h4', null, 'Acknowledged by'));
    if (!acks.length) ad.appendChild(el('div', 'none', 'No one has acknowledged this yet.'));
    else {
      var ul = el('ul');
      acks.forEach(function (k) { ul.appendChild(el('li', null, (k.memberName || 'Someone') + ', ' + fmtStampTime(k.at))); });
      ad.appendChild(ul);
    }
    if (members.length && b.active) {
      var done = {};
      acks.forEach(function (k) { done[k.memberId] = true; });
      var pending = members.filter(function (m) { return !done[m.id]; }).map(function (m) { return m.name; });
      ad.appendChild(el('h4', null, 'Not yet acknowledged'));
      ad.appendChild(el('div', pending.length ? 'none' : null, pending.length ? pending.join(', ') : 'Everyone on the board has acknowledged this.'));
    }
    box.appendChild(ad);
    if (b.active) {
      var acts = el('div', 'bb-actions');
      var ed = el('button', 'ghost', 'Edit'); ed.type = 'button';
      ed.addEventListener('click', function () { openBullForm(b.id); });
      var en = el('button', 'danger', 'End bulletin'); en.type = 'button';
      en.addEventListener('click', function () { endBulletin(b.id); });
      acts.appendChild(ed); acts.appendChild(en);
      box.appendChild(acts);
    }
    wrap.appendChild(box);
  });
}

/* ---------- start ---------- */
t.render(function () {
  canWrite = typeof t.memberCanWriteToModel === 'function' ? t.memberCanWriteToModel('board') : true;
  renderChips();
  return Promise.all([Docs.load(t), Docs.whoAmI(t)]).then(function (res) {
    state = res[0]; me = res[1];
    text($('ver'), Docs.ASSET_VERSION);
    var first = Promise.resolve();
    // The first time Calvin (name contains "Callahan") opens the app, remember him as the admin.
    if (me && !state.admin && Docs.nameMatchesAdmin(me) && canWrite && state.missing === 0) {
      first = Docs.mutate(t, function (recs) { return recs; }, function () { return [me.id, me.name]; })
        .then(function (s) { state = s; }).catch(function () {});
    }
    return first;
  }).then(function () {
    if (me) Docs.rememberOpen(t, state.records, me.id);
    renderList();
    if (isAdmin()) return Docs.boardMembers(t).then(function (m) { members = m; renderList(); });
  }).catch(function () {
    showBanner('Could not load documents. Close and reopen this window.');
  });
});
