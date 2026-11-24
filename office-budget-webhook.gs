/**
 * Office Budget monthly webhook
 *
 * This script receives the monthly snapshot that Office Budget sends
 * from Trello and appends it to a Google Sheet.
 *
 * Setup (about 5 minutes):
 *  1. In Google Drive (repcallahan@gmail.com), create a Google Sheet.
 *     A name like "Office Budget monthly updates" is fine.
 *  2. In that sheet, open Extensions > Apps Script.
 *  3. Delete any starter code and paste this entire file. Click Save.
 *  4. Click Deploy > New deployment. For type, choose Web app.
 *       - Execute as: Me
 *       - Who has access: Anyone
 *     (The Power-Up cannot sign in as you, so the web app has to accept
 *     a POST from Trello. The URL itself is the secret — do not post it
 *     publicly.)
 *  5. Authorize when Google asks, then copy the Web app URL. It should
 *     look like: https://script.google.com/macros/s/…/exec
 *  6. In Trello, open Office Budget > Settings > Monthly update, paste
 *     that URL, and click Save URL. You can click Send update now to
 *     confirm a row appears in the sheet.
 *
 * The Power-Up POSTs a JSON string as text/plain so the browser does
 * not have to do a CORS preflight. This doPost handler still parses
 * that JSON and writes two tabs: Monthly Updates and Categories.
 */

function doGet() {
  return ContentService
    .createTextOutput('Office Budget webhook is ready.')
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '';
  var data = {};
  try {
    data = JSON.parse(raw);
  } catch (err) {
    data = { raw: raw, parseError: String(err) };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    ss = SpreadsheetApp.create('Office Budget monthly updates');
  }

  var monthly = getOrCreateSheet_(ss, 'Monthly Updates', [
    'Date',
    'Month',
    'Office',
    'Period start',
    'Period end',
    'Biennium budget',
    'Already spent',
    'Total spent',
    'Left',
    '% used',
    'Unplanned',
    'Unitemized',
    'Expenses this month',
    'Expense count',
    'Sent by',
    'Raw JSON'
  ]);
  monthly.appendRow([
    data.generatedAt || new Date().toISOString(),
    data.reportMonth || '',
    data.office || '',
    data.periodStart || '',
    data.periodEnd || '',
    data.bienniumBudget || '',
    data.alreadySpent || '',
    data.totalSpent || '',
    data.left || '',
    data.percentUsed || '',
    (data.unplanned && data.unplanned.total) || '',
    (data.unplanned && data.unplanned.unitemized) || '',
    data.expensesThisMonth || '',
    data.expenseCountThisMonth || '',
    data.sentBy || '',
    JSON.stringify(data)
  ]);

  var cats = getOrCreateSheet_(ss, 'Categories', [
    'Date',
    'Month',
    'Category',
    'Planned',
    'Spent',
    'Left',
    '% used'
  ]);
  var list = data.planned || [];
  var i;
  for (i = 0; i < list.length; i++) {
    var c = list[i] || {};
    cats.appendRow([
      data.generatedAt || '',
      data.reportMonth || '',
      c.name || '',
      c.planned || 0,
      c.spent || 0,
      c.left || 0,
      c.percentUsed || 0
    ]);
  }

  return ContentService
    .createTextOutput('OK')
    .setMimeType(ContentService.MimeType.TEXT);
}

function getOrCreateSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  return sheet;
}
