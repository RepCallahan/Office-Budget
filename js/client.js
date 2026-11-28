/* global TrelloPowerUp, BudgetSync */
/**
 * Connector script. Trello loads index.html as a hidden iframe and talks to
 * this initialize() call. Office Budget is a board-level Power-Up: one header
 * button opens a fullscreen modal with the whole budget workspace.
 */

TrelloPowerUp.initialize({
  'board-buttons': function (t) {
    return [{
      icon: BudgetSync.iconUrl(),
      text: 'Office Budget',
      condition: 'edit',
      callback: function (t2) {
        return t2.modal({
          url: './budget.html?v=' + BudgetSync.ASSET_VERSION,
          fullscreen: true,
          title: 'Office Budget'
        });
      }
    }];
  }
});
