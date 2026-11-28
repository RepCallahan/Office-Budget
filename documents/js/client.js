/* global TrelloPowerUp, Docs */
/** Connector: one board-header button that opens the fullscreen Office Hub window. */
TrelloPowerUp.initialize({
  'board-buttons': function (t) {
    var fallback = [{
      icon: Docs.iconUrl(),
      text: 'Office Hub',
      condition: 'always',
      callback: openModal
    }];
    function openModal(t2, section) {
      var url = './documents.html?v=' + Docs.ASSET_VERSION;
      if (section && section !== 'announcements') url += '&section=' + encodeURIComponent(section);
      return t2.modal({
        url: url,
        fullscreen: true,
        title: 'Office Hub'
      });
    }
    return Docs.whoAmI(t).then(function (me) {
      var id = me && me.id;
      var boardId = Docs.boardIdOf(t);
      return Docs.loadForAlerts(t, boardId).then(function (state) {
        var recs = state.records;
        var info = Docs.maybeAlert(t, recs, id, boardId);
        // Announcements is the default page. Open All Documents only when the
        // board notice was a document alert (no unacked bulletin taking priority).
        var unacked = Docs.unackedBulletins(recs, id);
        var section = (!unacked.length && info && info.message) ? 'docs' : '';
        return [{
          icon: Docs.iconUrl(),
          text: Docs.buttonTextFor(recs, id),
          condition: 'always',
          callback: function (t2) { return openModal(t2, section); }
        }];
      });
    }).catch(function () { return fallback; });
  }
});
