/* global TrelloPowerUp, Docs */
/** Connector: one board-header button that opens the fullscreen Office Documents window. */
TrelloPowerUp.initialize({
  'board-buttons': function () {
    return [{
      icon: Docs.iconUrl(),
      text: 'Office Documents',
      condition: 'always',
      callback: function (t) {
        return t.modal({
          url: './documents.html?v=' + Docs.ASSET_VERSION,
          fullscreen: true,
          title: 'Office Documents'
        });
      }
    }];
  }
});
