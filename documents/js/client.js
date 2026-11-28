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
    function openModal(t2) {
      return t2.modal({
        url: './documents.html?v=' + Docs.ASSET_VERSION,
        fullscreen: true,
        title: 'Office Hub'
      });
    }
    return Docs.whoAmI(t).then(function (me) {
      var id = me && me.id;
      var boardId = Docs.boardIdOf(t);
      return Docs.loadForAlerts(t, boardId).then(function (state) {
        Docs.maybeAlert(t, state.records, id, boardId);
        return [{
          icon: Docs.iconUrl(),
          text: Docs.buttonTextFor(state.records, id),
          condition: 'always',
          callback: openModal
        }];
      });
    }).catch(function () { return fallback; });
  }
});
