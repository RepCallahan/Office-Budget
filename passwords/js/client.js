/* global TrelloPowerUp, Vault */
/** Connector: one board-header button that opens the fullscreen Office Passwords window. */
TrelloPowerUp.initialize({
  'board-buttons': function () {
    return [{
      icon: Vault.iconUrl(),
      text: 'Office Passwords',
      condition: 'edit',
      callback: function (t) {
        return t.modal({
          url: './logins.html?v=' + Vault.ASSET_VERSION,
          fullscreen: true,
          title: 'Office Passwords'
        });
      }
    }];
  }
});
