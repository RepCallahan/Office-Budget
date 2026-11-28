/* global TrelloPowerUp, Docs */
'use strict';
var t = TrelloPowerUp.iframe();

var state = null;      // { records, admin, cardIds, ... }
var me = null;         // { id, name, username } or null
var members = [];      // board members (used for the admin's "not yet signed" list)
var canWrite = true;
var store = Docs.createStore(t, {
  canWrite: function () { return canWrite; },
  link: function () { return (typeof OfficeCloud !== 'undefined' && OfficeCloud.rememberedUrl) ? OfficeCloud.rememberedUrl() : ''; }
});
var query = '';
var catFilter = '';
var editId = null;     // id of document being edited, or null when adding
var signId = null;     // id of document being signed
var deleteId = null;
var confirmKind = 'doc'; // 'doc' | 'ann'
var viewId = null;     // id of document open in the in-app viewer
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

function submitBtn(event) {
  var form = event && event.target;
  return (event && event.submitter) || (form && form.querySelector ? form.querySelector('button[type="submit"]') : null);
}
function isBusy(btn) { return !!(btn && btn.getAttribute('data-busy') === '1'); }
function withDots(btn, promise) {
  if (!btn) return promise;
  var label = btn.innerHTML;
  var wasDisabled = btn.disabled;
  var box = btn.getBoundingClientRect();
  btn.setAttribute('data-busy', '1');
  btn.setAttribute('aria-busy', 'true');
  if (box.width) btn.style.width = box.width + 'px';
  if (box.height) btn.style.height = box.height + 'px';
  btn.classList.add('is-saving');
  btn.disabled = true;
  btn.innerHTML = '<span class="saving-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="sr-only">Saving…</span>';
  function done() {
    btn.innerHTML = label;
    btn.style.width = '';
    btn.style.height = '';
    btn.classList.remove('is-saving');
    btn.removeAttribute('aria-busy');
    btn.removeAttribute('data-busy');
    btn.disabled = wasDisabled;
  }
  return Promise.resolve(promise).then(function (v) { done(); return v; }, function (e) { done(); throw e; });
}
function hideLoader() {
  var loader = $('app-loader');
  if (!loader || loader.classList.contains('is-done')) return;
  loader.classList.add('is-done');
  setTimeout(function () { if (loader.parentNode) loader.parentNode.removeChild(loader); }, 400);
}

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
  closeViewer();
  document.querySelectorAll('.nav-btn').forEach(function (b) {
    var on = b.getAttribute('data-section') === name;
    b.classList.toggle('is-active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  document.querySelectorAll('[data-section-panel]').forEach(function (s) {
    s.hidden = s.getAttribute('data-section-panel') !== name;
  });
  if (name === 'settings') renderSettings();
  if (name === 'announcements') renderAnnouncements();
}
document.querySelectorAll('.nav-btn').forEach(function (b) {
  b.addEventListener('click', function () { showSection(b.getAttribute('data-section')); });
});

/* ---------- in-app document viewer ---------- */
function fillViewerSign(d) {
  var slot = $('viewer-sign');
  if (!slot) return;
  slot.textContent = '';
  if (!d || !d.sign) return;
  if (!me) {
    slot.appendChild(el('span', 'need', 'Cannot tell who you are in Trello, so signing is off.'));
    return;
  }
  var mine = Docs.findSig(state.records, d.id, me.id, d.version);
  if (mine) {
    slot.appendChild(el('span', 'signed-note', '✓ You signed on ' + fmtStampTime(mine.at)));
    return;
  }
  slot.appendChild(el('span', 'need', 'Signature needed'));
  var sb = el('button', 'ghost sign-btn', 'Sign');
  sb.type = 'button';
  sb.addEventListener('click', function () { openSign(d.id); });
  slot.appendChild(sb);
}

function openViewer(d) {
  if (!d) return;
  var preview = Docs.previewUrl(d.url);
  if (!preview) {
    window.open(d.url, '_blank', 'noopener,noreferrer');
    return;
  }
  viewId = d.id;
  text($('viewer-title'), d.title);
  $('viewer-frame').title = d.title;
  $('viewer-frame').src = preview;
  var ext = $('viewer-external');
  ext.href = d.url;
  fillViewerSign(d);
  $('doc-viewer').hidden = false;
  $('main').classList.add('is-viewing');
  if (typeof t.sizeTo === 'function') { try { t.sizeTo('#app'); } catch (e) {} }
}

function closeViewer() {
  if (!viewId && $('doc-viewer') && $('doc-viewer').hidden) return;
  viewId = null;
  var frame = $('viewer-frame');
  if (frame) frame.src = 'about:blank';
  if ($('doc-viewer')) $('doc-viewer').hidden = true;
  if ($('main')) $('main').classList.remove('is-viewing');
}

$('viewer-back').addEventListener('click', function () { closeViewer(); });

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
  open.addEventListener('click', function (e) {
    if (Docs.previewUrl(d.url)) { e.preventDefault(); openViewer(d); }
  });
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
  var ban = $('banner');
  if (state.cloudError) {
    showBanner('Office Hub could not move to Google storage yet, so it is still using Trello and works as before. ' + Docs.saveErrorMessage(state.cloudError));
    if (ban) ban.className = 'banner is-full';
  } else if (state.missing > 0) showBanner(Docs.missingMessage());
  else if (cap.full) showBanner(Docs.needCardMessage(cap.nextTitle));
  else if (cap.warn && cap.google) showBanner('Google storage is ' + cap.percent + '% full. Room for about ' + cap.roomFor + ' more items.');
  else if (cap.warn) showBanner('Storage is ' + cap.percent + '% full. Soon you will need to add a card named “' + cap.nextTitle + '” to an open list (never archived).');
  else showBanner('');
}

/* ---------- settings ---------- */
function renderSettings() {
  var cap = Docs.capacity(state);
  var google = !!(state && state.google);
  var fill = $('meter-fill');
  fill.style.width = Math.max(2, cap.percent) + '%';
  fill.classList.toggle('is-warn', cap.warn || cap.full);
  text($('meter-text'), Docs.storageLineText(cap));
  text($('meter-room'), 'Room for about ' + cap.roomFor + ' more documents, signatures, or announcements.');
  if ($('meter-cards')) {
    $('meter-cards').hidden = google;
    if (!google) {
      text($('meter-cards'), state.cardIds.length
        ? 'Storage cards found: ' + state.cardNames.join('; ')
        : 'No storage cards yet. They are only needed when this board-level space fills up. Then add a card named “' + cap.nextTitle + '”.');
    }
  }
  if ($('storage-card-note')) $('storage-card-note').hidden = google;
  text($('ver'), Docs.ASSET_VERSION);
  if ($('cloud-status')) {
    text($('cloud-status'), google
      ? 'Documents, signatures, and announcements are stored in Google.'
      : 'Data is still on Trello. If you have already opened Office Budget on this computer, Office Hub will pick up the script link and move by itself. Otherwise paste the same Apps Script link (the Webhook URL from Office Budget’s Settings) and click Save link.');
  }
  if ($('cloud-form')) $('cloud-form').hidden = google || !canWrite;
  if ($('about-text')) {
    text($('about-text'), google
      ? 'Documents live on Google Drive. Titles, links, signatures, and announcements are stored in Google, in the Office Budget Email script, and only people with access to this board can open them. Staff see only their own signature and acknowledgements. That is hidden from view, not encrypted.'
      : 'Documents live on Google Drive. This app only keeps the titles, links, signatures, and announcements, and stores them on this Trello board. Staff see only their own signature and acknowledgements. That is hidden from view, not encrypted: someone technical with board access could read the raw Trello data.');
  }

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
      if (isBusy(b)) return;
      withDots(b, Docs.mutate(t, function (recs) { return recs; }, function () { return pair; }).then(function (s) {
        state = s; renderAll(); renderSettings(); toast(doneMsg);
      })).catch(function (err) { toast(Docs.saveErrorMessage(err)); });
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
function refresh(s) {
  state = s;
  renderAll();
  if (viewId) {
    var d = null;
    Docs.docsOf(state.records).forEach(function (x) { if (x.id === viewId) d = x; });
    if (d) fillViewerSign(d);
    else closeViewer();
  }
}
function renderAll() { renderList(); renderAnnouncements(); }

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
  var btn = submitBtn(e);
  if (isBusy(btn)) return;
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
  withDots(btn, Docs.mutate(t, function (recs) {
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
  })).catch(function (err) { text($('form-error'), Docs.saveErrorMessage(err)); });
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
  var btn = submitBtn(e);
  if (isBusy(btn)) return;
  if (!guardWrite() || !me) return;
  var typed = $('s-name').value.trim().replace(/\s+/g, ' ');
  if (typed.length < 3) { text($('sign-error'), 'Please type your full name.'); return; }
  var id = signId;
  var seenVersion = null;
  Docs.docsOf(state.records).forEach(function (x) { if (x.id === id) seenVersion = x.version; });
  var problem = '';
  withDots(btn, Docs.mutate(t, function (recs) {
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
  })).catch(function (err) { text($('sign-error'), Docs.saveErrorMessage(err)); });
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
  confirmKind = 'doc';
  deleteId = id;
  text($('confirm-title'), 'Delete this document?');
  text($('confirm-text'), '“' + d.title + '” will be removed for everyone on this board' + (Docs.hasSigs(state.records, id) ? ', along with all of its signatures and signature history' : '') + '. The file in Google Drive is not touched. This cannot be undone.');
  $('confirm-overlay').hidden = false;
}

function askDeleteAnnouncement(id) {
  if (!isAdmin() || !guardWrite()) return;
  var b = null;
  Docs.bulletinsOf(state.records, false).forEach(function (x) { if (x.id === id) b = x; });
  if (!b) return;
  confirmKind = 'ann';
  deleteId = id;
  text($('confirm-title'), 'Delete this announcement?');
  text($('confirm-text'), '“' + b.title + '” will be removed for everyone on this board, along with who has acknowledged it' + (b.active ? '. It will also stop popping up' : '') + '. This cannot be undone.');
  $('confirm-overlay').hidden = false;
}
$('c-cancel').addEventListener('click', function () { $('confirm-overlay').hidden = true; deleteId = null; });
$('c-ok').addEventListener('click', function () {
  var btn = $('c-ok');
  if (isBusy(btn)) return;
  var id = deleteId;
  var kind = confirmKind;
  var admin = isAdmin();
  var problem = '';
  withDots(btn, Docs.mutate(t, function (recs) {
    if (kind === 'ann') {
      if (!admin) { problem = 'Only the admin can delete an announcement.'; return null; }
      return Docs.removeAnnouncement(recs, id);
    }
    if (!admin && Docs.hasSigs(recs, id)) { problem = 'Only the document admin can delete a document that has signatures.'; return null; }
    return recs.filter(function (r) { return !((r[0] === 'd' && r[1] === id) || (r[0] === 's' && r[1] === id)); });
  }).then(function (s) {
    $('confirm-overlay').hidden = true; deleteId = null; refresh(s); toast(problem || 'Deleted');
  })).catch(function (err) { $('confirm-overlay').hidden = true; toast(Docs.saveErrorMessage(err)); });
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
  else if (viewId) closeViewer();
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
  ack.addEventListener('click', function () { acknowledge(b.id, null, ack); });
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
  }, $('bp-ack'));
});

function acknowledge(id, then, btn) {
  if (!guardWrite() || !me) return;
  if (isBusy(btn)) return;
  var problem = '';
  withDots(btn, Docs.mutate(t, function (recs) {
    if (Docs.findAck(recs, id, me.id)) return recs;
    recs.push(Docs.ackRecord(id, me));
    return recs;
  }).then(function (s) {
    refresh(s);
    toast(problem || 'Acknowledged');
    if (then) then();
  })).catch(function (err) { toast(Docs.saveErrorMessage(err)); });
}


function queueSignalAnnouncement(item) {
  function go(url, key) {
    if (!url || !key || !item || !item.id) return;
    var opts = {};
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') opts.sendBeacon = navigator.sendBeacon.bind(navigator);
    if (typeof fetch === 'function') opts.fetch = fetch;
    if (typeof Blob === 'function') opts.Blob = Blob;
    Docs.postSignalAnnouncement(url, key, item, opts);
  }
  if (typeof OfficeCloud === 'undefined' || typeof OfficeCloud.getConfig !== 'function') return;
  OfficeCloud.getConfig(t).then(function (cfg) {
    if (cfg && OfficeCloud.isOn(cfg)) go(cfg.u, cfg.s);
  }).catch(function () {});
}

function openBullForm(id) {
  if (!isAdmin()) return;
  bulletinEditId = id || null;
  var b = null;
  if (id) Docs.bulletinsOf(state.records).forEach(function (x) { if (x.id === id) b = x; });
  text($('bull-form-title'), b ? 'Edit announcement' : 'Post announcement');
  $('b-title').value = b ? b.title : '';
  $('b-msg').value = b ? b.message : '';
  $('b-url').value = b ? b.url : '';
  if ($('b-send-signal-wrap')) $('b-send-signal-wrap').hidden = !!id;
  if ($('b-send-signal')) $('b-send-signal').checked = true;
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
  var btn = submitBtn(e);
  if (isBusy(btn)) return;
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
  var sendToSignal = !id && (!$('b-send-signal') || $('b-send-signal').checked);
  var queued = null;
  withDots(btn, Docs.mutate(t, function (recs) {
    if (id) {
      var at = -1;
      recs.forEach(function (r, k) { if (r[0] === 'b' && r[1] === id) at = k; });
      if (at < 0) return null;
      recs[at] = Docs.bulletinRecord({
        id: id, title: title, message: message, url: url,
        date: recs[at][5], active: recs[at][6],
        authorId: recs[at][7], authorName: recs[at][8], created: recs[at][9]
      });
    } else {
      var rec = Docs.bulletinRecord({
        title: title, message: message, url: url, active: 1,
        authorId: me && me.id, authorName: me && me.name
      });
      queued = { id: rec[1], title: rec[2], message: rec[3], url: rec[4] };
      recs.push(rec);
    }
    return recs;
  }).then(function (s) {
    closeBullForm(); skipPop = false; popShown = false; refresh(s); toast(id ? 'Saved' : 'Announcement posted');
    if (Docs.shouldQueueSignal(!id, sendToSignal) && queued) queueSignalAnnouncement(queued);
  })).catch(function (err) { text($('bull-form-error'), Docs.saveErrorMessage(err)); });
});

function endBulletin(id, btn) {
  if (!isAdmin() || !guardWrite()) return;
  if (isBusy(btn)) return;
  withDots(btn, Docs.mutate(t, function (recs) {
    recs.forEach(function (r, k) {
      if (r[0] === 'b' && r[1] === id) recs[k] = Docs.bulletinRecord({
        id: r[1], title: r[2], message: r[3], url: r[4], date: r[5], active: 0,
        authorId: r[7], authorName: r[8], created: r[9]
      });
    });
    return recs;
  }).then(function (s) { refresh(s); toast('Announcement ended'); })
    ).catch(function (err) { toast(Docs.saveErrorMessage(err)); });
}

function renderAnnouncements() {
  var wrap = $('announcements-list');
  var badge = $('ann-nav-count');
  if ($('btn-bulletin')) $('btn-bulletin').hidden = !isAdmin();
  var unacked = me ? Docs.unackedBulletins(state.records, me.id) : [];
  if (badge) {
    if (unacked.length) { text(badge, String(unacked.length)); badge.hidden = false; }
    else { badge.hidden = true; }
  }
  if (!wrap) return;
  wrap.textContent = '';
  var list = Docs.bulletinsOf(state.records, false);
  if (!list.length) {
    var empty = el('div', 'empty');
    empty.appendChild(el('strong', null, 'No announcements yet'));
    empty.appendChild(document.createTextNode(isAdmin() ? 'Click “+ Post announcement” to post the first one. It will pop up for everyone on the board until they acknowledge it.' : 'When the office posts an announcement, it will show up here.'));
    wrap.appendChild(empty);
    return;
  }
  list.forEach(function (b) { wrap.appendChild(announcementEl(b)); });
}

function announcementEl(b) {
  var acked = me ? Docs.findAck(state.records, b.id, me.id) : null;
  var box = el('div', 'ann-card' + (b.active ? '' : ' ended') + (b.active && me && !acked ? ' needs-ack' : ''));
  var top = el('div', 'ann-top');
  top.appendChild(el('p', 'bb-kicker', b.active ? 'Office Bulletin' : 'Ended'));
  box.appendChild(top);
  box.appendChild(el('h3', null, b.title));
  if (b.message) box.appendChild(el('div', 'bb-msg', b.message));
  var meta = el('p', 'e-meta');
  var when = b.created ? fmtStamp(b.created) : fmtDate(b.date);
  var who = b.authorName || '';
  meta.textContent = who ? (when + ' · ' + who) : when;
  box.appendChild(meta);
  var acts = el('div', 'bb-actions');
  if (b.url) {
    var a = el('a', 'primary', 'Click here');
    a.href = b.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    acts.appendChild(a);
  }
  if (b.active && me && !acked) {
    var ack = el('button', 'ghost', 'Acknowledge');
    ack.type = 'button';
    ack.addEventListener('click', function () { acknowledge(b.id, null, ack); });
    acts.appendChild(ack);
  } else if (acked && !isAdmin()) {
    box.appendChild(el('p', 'ann-acked', 'You acknowledged on ' + fmtStampTime(acked.at)));
  }
  if (isAdmin()) {
    if (b.active) {
      var ed = el('button', 'ghost', 'Edit'); ed.type = 'button';
      ed.addEventListener('click', function () { openBullForm(b.id); });
      var en = el('button', 'danger', 'End'); en.type = 'button';
      en.addEventListener('click', function () { endBulletin(b.id, en); });
      acts.appendChild(ed); acts.appendChild(en);
    }
    var del = el('button', 'danger', 'Delete'); del.type = 'button';
    del.addEventListener('click', function () { askDeleteAnnouncement(b.id); });
    acts.appendChild(del);
  }
  if (acts.childNodes.length) box.appendChild(acts);
  if (isAdmin()) {
    var ad = el('div', 'acks');
    var acks = Docs.acksOf(state.records, b.id);
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
  }
  return box;
}


$('cloud-form').addEventListener('submit', function (e) {
  e.preventDefault();
  text($('cloud-error'), '');
  var btn = submitBtn(e);
  if (isBusy(btn)) return;
  withDots(btn, store.setLink($('cloud-url').value).then(function () {
    return store.load();
  }).then(function (s) {
    state = s;
    renderAll();
    renderSettings();
    if (store.mode() === 'google') { $('cloud-url').value = ''; toast('Moved to Google'); }
    else if (store.error()) text($('cloud-error'), Docs.saveErrorMessage(store.error()));
  }).catch(function (err) {
    text($('cloud-error'), Docs.saveErrorMessage(err));
  }));
});

/* ---------- start ---------- */
t.render(function () {
  canWrite = typeof t.memberCanWriteToModel === 'function' ? t.memberCanWriteToModel('board') : true;
  renderChips();
  return Promise.all([store.load(), Docs.whoAmI(t)]).then(function (res) {
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
    renderAll();
    showSection(Docs.requestedSection());
    hideLoader();
    if (isAdmin()) return Docs.boardMembers(t).then(function (m) { members = m; renderAll(); });
  }).catch(function (err) {
    hideLoader();
    showBanner(err && err.cloud ? Docs.saveErrorMessage(err) : 'Could not load documents. Close and reopen this window.');
    var ban = $('banner');
    if (ban) { ban.className = 'banner is-full'; ban.hidden = false; }
  });
});
