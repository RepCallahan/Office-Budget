/* global TrelloPowerUp, Docs */
/** Compact board-load bulletin modal. Acknowledge is saved the same way as in Office Hub. */
(function () {
  var t = TrelloPowerUp.iframe();
  var me = null;
  var canWrite = true;
  var queue = [];
  var index = 0;
  var busy = false;

  function $(id) { return document.getElementById(id); }
  function text(el, v) { if (el) el.textContent = v == null ? '' : String(v); }
  function sizeTo() {
    if (t && typeof t.sizeTo === 'function') {
      Promise.resolve(t.sizeTo('#wrap')).catch(function (resErr) {
        try { t.sizeTo('body'); } catch (e) {}
      });
    }
  }
  function closeModal() {
    if (t && typeof t.closeModal === 'function') t.closeModal();
  }
  function showError(msg) { text($('bp-error'), msg || ''); sizeTo(); }

  function paint() {
    var b = queue[index];
    if (!b) { closeModal(); return; }
    text($('bp-title'), b.title || '');
    text($('bp-msg'), b.message || '');
    var count = $('bp-count');
    if (queue.length > 1) {
      text(count, (index + 1) + ' of ' + queue.length);
      count.hidden = false;
    } else {
      count.hidden = true;
    }
    var link = $('bp-link');
    if (b.url) { link.href = b.url; link.hidden = false; }
    else { link.removeAttribute('href'); link.hidden = true; }
    $('bp-ack').disabled = false;
    showError('');
    sizeTo();
  }

  function acknowledge() {
    var b = queue[index];
    if (!b || busy || !me) return;
    if (!canWrite) { showError('You do not have permission to change this board.'); return; }
    busy = true;
    $('bp-ack').disabled = true;
    Docs.mutate(t, function (recs) {
      if (Docs.findAck(recs, b.id, me.id)) return recs;
      recs.push(Docs.ackRecord(b.id, me));
      return recs;
    }).then(function () {
      busy = false;
      index += 1;
      if (index < queue.length) paint();
      else closeModal();
    }).catch(function (err) {
      busy = false;
      $('bp-ack').disabled = false;
      showError((Docs.saveErrorMessage && Docs.saveErrorMessage(err)) || (err && err.message) || 'Could not save');
    });
  }

  $('bp-ack').addEventListener('click', acknowledge);

  canWrite = typeof t.memberCanWriteToModel === 'function' ? t.memberCanWriteToModel('board') : true;
  Promise.all([Docs.whoAmI(t), Docs.load(t)]).then(function (res) {
    me = res[0];
    var state = res[1];
    queue = me ? Docs.unackedBulletins(state.records, me.id) : [];
    index = 0;
    if (!queue.length) { closeModal(); return; }
    paint();
  }).catch(function (resErr) {
    showError((resErr && Docs.saveErrorMessage && Docs.saveErrorMessage(resErr)) || 'Could not load the bulletin.');
  });
})();
