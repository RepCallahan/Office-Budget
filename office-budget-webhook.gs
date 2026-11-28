/**
 * Office Budget monthly email
 *
 * Office Budget POSTs a JSON snapshot when someone opens the app (and
 * after an expense is added, edited, or deleted). This script stores
 * that snapshot and emails a readable summary on the last day of the
 * month. It does not use Google Sheets.
 *
 * Setup:
 *  1. Open https://script.google.com and click New project.
 *  2. Delete any starter code and paste this entire file. Click Save.
 *     (A project name like “Office Budget monthly email” is fine.)
 *  3. At the top of this file, set RECIPIENT to the email address that
 *     should get the summary. Click Save.
 *  4. Select the function testSend and click Run. Authorize the script
 *     when Google asks. You should get a test email.
 *  5. Select the function setupTrigger and click Run. Authorize if
 *     Google asks. This creates a daily check at about 4 PM. In Project
 *     settings, set the time zone to America/Chicago if it is not
 *     already.
 *  6. Click Deploy > New deployment. Choose type Web app.
 *       Execute as: Me
 *       Who has access: Anyone
 *     Copy the web app URL. It should look like
 *     https://script.google.com/macros/s/…/exec
 *     The URL is the secret — do not post it publicly.
 *  7. In Trello, open Office Budget > Settings > Monthly update, paste
 *     the URL, and click Save URL. Click Send update now to send one
 *     from the app.
 *
 * After that, each time someone opens Office Budget, a snapshot of the
 * current month is saved. On the last day of the month, this script
 * emails that snapshot. Expenses entered after the last open will not
 * be in the email until someone opens the app.
 *
 * To update an existing deployment: paste the new code, Save, run
 * setupTrigger once (and testSend if you want a sample email), then
 * Deploy > Manage deployments > edit (pencil) > Version: New version >
 * Deploy. The web app URL stays the same. Update this script before
 * uploading the new Power-Up files.
 */

var RECIPIENT = 'rep.callahan@legis.wisconsin.gov,calvin.callahan@legis.wisconsin.gov';

var TZ = 'America/Chicago';
var NAVY = '#1b365d';
var SNAP_CHUNK = 8000;
var SNAP_META = 'snap_meta';
var SNAP_PREFIX = 'snap_';
var SENT_MONTH = 'sent_month';

function doGet() {
  return ContentService
    .createTextOutput('Office Budget email webhook is ready.')
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '';
  var data = {};
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error('Could not read the Office Budget snapshot. ' + err);
  }
  var mode = String((data && data.mode) || '').toLowerCase();
  if (mode === 'snapshot') {
    saveSnapshot_(data);
  } else {
    sendBudgetEmail_(data);
  }
  return ContentService
    .createTextOutput('OK')
    .setMimeType(ContentService.MimeType.TEXT);
}

function testSend() {
  doPost({
    postData: {
      contents: JSON.stringify(samplePayload_())
    }
  });
}

function setupTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var i;
  for (i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'lastDayCheck') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  // atHour uses the Apps Script project time zone. Set it to America/Chicago
  // in Project settings so this runs at about 4 PM Chicago.
  ScriptApp.newTrigger('lastDayCheck')
    .timeBased()
    .everyDays(1)
    .atHour(16)
    .create();
}

function lastDayCheck(now) {
  now = now || new Date();
  if (!isLastCalendarDay_(now)) return;
  var month = currentYearMonth_(now);
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(SENT_MONTH) === month) return;
  var data = loadSnapshot_();
  if (!data) return;
  var emailData = copyForEmail_(data);
  if (snapshotIsFromMonth_(emailData, month)) {
    emailData.reportMonth = month;
  }
  sendBudgetEmail_(emailData);
  props.setProperty(SENT_MONTH, month);
}

function saveSnapshot_(data) {
  var json = JSON.stringify(data || {});
  var props = PropertiesService.getScriptProperties();
  var oldN = 0;
  try {
    var oldMeta = props.getProperty(SNAP_META);
    if (oldMeta) oldN = Number(JSON.parse(oldMeta).n) || 0;
  } catch (err) {
    oldN = 0;
  }
  var chunks = [];
  var i;
  for (i = 0; i < json.length; i += SNAP_CHUNK) {
    chunks.push(json.substring(i, i + SNAP_CHUNK));
  }
  var payload = {};
  payload[SNAP_META] = JSON.stringify({
    n: chunks.length,
    at: new Date().toISOString(),
    month: (data && data.reportMonth) || ''
  });
  for (i = 0; i < chunks.length; i++) {
    payload[SNAP_PREFIX + i] = chunks[i];
  }
  props.setProperties(payload);
  for (i = chunks.length; i < oldN; i++) {
    props.deleteProperty(SNAP_PREFIX + i);
  }
}

function loadSnapshot_() {
  var props = PropertiesService.getScriptProperties();
  var metaRaw = props.getProperty(SNAP_META);
  if (!metaRaw) return null;
  var meta;
  try {
    meta = JSON.parse(metaRaw);
  } catch (err) {
    return null;
  }
  var n = Number(meta && meta.n) || 0;
  if (n < 1) return null;
  var parts = [];
  var i;
  for (i = 0; i < n; i++) {
    var part = props.getProperty(SNAP_PREFIX + i);
    if (part == null) return null;
    parts.push(part);
  }
  try {
    return JSON.parse(parts.join(''));
  } catch (err) {
    return null;
  }
}

function copyForEmail_(data) {
  var copy = {};
  var key;
  data = data || {};
  for (key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key) && key !== 'mode') {
      copy[key] = data[key];
    }
  }
  return copy;
}

function snapshotIsFromMonth_(data, month) {
  month = String(month || '');
  if (!month) return false;
  if (data && String(data.reportMonth || '').slice(0, 7) === month) return true;
  if (data && data.generatedAt) {
    try {
      return currentYearMonth_(new Date(data.generatedAt)) === month;
    } catch (err) {
      return false;
    }
  }
  return false;
}

function chicagoDateParts_(date) {
  var d = date || new Date();
  return {
    year: Number(Utilities.formatDate(d, TZ, 'yyyy')),
    month: Number(Utilities.formatDate(d, TZ, 'MM')),
    day: Number(Utilities.formatDate(d, TZ, 'dd'))
  };
}

function currentYearMonth_(date) {
  var p = chicagoDateParts_(date);
  var m = p.month < 10 ? '0' + p.month : String(p.month);
  return p.year + '-' + m;
}

function isLeapYear_(year) {
  var y = Number(year);
  return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
}

function lastDayOfMonth_(year, month) {
  var y = Number(year);
  var m = Number(month);
  var lengths = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (m === 2 && isLeapYear_(y)) return 29;
  if (m < 1 || m > 12) return 0;
  return lengths[m];
}

function isLastCalendarDay_(date) {
  var p = chicagoDateParts_(date);
  return p.day === lastDayOfMonth_(p.year, p.month);
}

function sendBudgetEmail_(data) {
  var to = String(RECIPIENT || '').trim();
  if (!to) {
    throw new Error('Set the RECIPIENT email address at the top of this script, then save and run testSend again.');
  }
  data = data || {};
  var monthLabel = formatMonth_(data.reportMonth);
  var subject = 'Office Budget: ' + monthLabel;
  var seal = sealBlob_();
  var html = buildHtml_(data, monthLabel, !!seal);
  var plain = buildPlain_(data, monthLabel);
  var options = {
    to: to,
    subject: subject,
    body: plain,
    htmlBody: html,
    name: 'Callahan Office Budget'
  };
  if (seal) {
    options.inlineImages = { seal: seal };
  }
  MailApp.sendEmail(options);
}

function sealBlob_() {
  try {
    if (!SEAL_B64) return null;
    return Utilities.newBlob(Utilities.base64Decode(SEAL_B64), 'image/png', 'seal.png');
  } catch (err) {
    return null;
  }
}

function samplePayload_() {
  return {
    office: 'Callahan Office',
    generatedAt: new Date().toISOString(),
    reportMonth: '2026-10',
    periodStart: '2025-01-06',
    periodEnd: '2027-01-04',
    bienniumBudget: 25000,
    alreadySpent: 14789.92,
    totalSpent: 15078.47,
    left: 9921.53,
    percentUsed: 60,
    percentRemaining: 40,
    planned: [
      { group: 'Spring Survey', name: 'Spring Survey - Postage', planned: 0, spent: 2494.85, left: -2494.85, percentUsed: 0 },
      { group: 'Internet + Social Media', name: 'Social Media Boosting', planned: 2000, spent: 1765.82, left: 234.18, percentUsed: 88 },
      { group: 'Postage', name: 'Postage - Metered', planned: 400, spent: 186.4, left: 213.6, percentUsed: 47 },
      { group: 'Maintenance / Unallocated', name: 'Unallocated / Contingency', planned: 0, spent: 0, left: 0, percentUsed: 0 }
    ],
    unplanned: { total: 0, unitemized: 0, groups: [] },
    expensesThisMonth: 288.55,
    expenseCountThisMonth: 2,
    expenseCount: 3,
    expenses: [
      { date: '2026-10-28', desc: 'Facebook boost', category: 'Social Media Boosting', amount: 50, by: 'Amy-Rose' },
      { date: '2026-10-12', desc: 'District postage', category: 'Postage - Metered', amount: 186.4, by: 'Calvin Callahan' },
      { date: '2026-09-18', desc: 'Office paper', category: 'Material and Office Supplies', amount: 42.15, by: 'Amy-Rose' }
    ],
    sentBy: 'Test send'
  };
}

function buildPlain_(data, monthLabel) {
  var lines = [];
  lines.push((data.office || 'Callahan Office') + ' — Office Budget');
  lines.push('Monthly summary for ' + monthLabel);
  lines.push('Period: ' + formatDate_(data.periodStart) + ' – ' + formatDate_(data.periodEnd));
  lines.push('');
  lines.push('Biennium budget: ' + money_(data.bienniumBudget));
  lines.push('Spent: ' + money_(data.totalSpent));
  lines.push('Left: ' + money_(data.left));
  lines.push('% remaining: ' + remaining_(data) + '%');
  lines.push('');
  lines.push('Planned vs spent');
  var planned = data.planned || [];
  var i;
  var lastGroup = null;
  for (i = 0; i < planned.length; i++) {
    var row = planned[i] || {};
    var group = row.group || '';
    if (group && group !== lastGroup) {
      lines.push('');
      lines.push(group);
      lastGroup = group;
    }
    lines.push(
      '  ' + (row.name || 'Category') +
      '  planned ' + money_(row.planned) +
      '  spent ' + money_(row.spent) +
      '  left ' + money_(row.left)
    );
  }
  var unplanned = data.unplanned || {};
  if (unplanned.total) {
    lines.push('');
    lines.push('Unplanned / unitemized: ' + money_(unplanned.total));
  }
  lines.push('');
  lines.push('Recent expenses');
  var expenses = recentExpenses_(data);
  if (!expenses.length) {
    lines.push('  None logged.');
  } else {
    for (i = 0; i < expenses.length; i++) {
      var exp = expenses[i] || {};
      lines.push(
        '  ' + formatDate_(exp.date) + '  ' + (exp.desc || '') +
        '  ' + (exp.category || '') + '  ' + money_(exp.amount) +
        (exp.by ? '  (' + exp.by + ')' : '')
      );
    }
  }
  if (data.sentBy) lines.push('\nSent by: ' + data.sentBy);
  return lines.join('\n');
}

function buildHtml_(data, monthLabel, hasSeal) {
  var remaining = remaining_(data);
  var leftNum = Number(data.left) || 0;
  var leftColor = leftNum < 0 ? '#b91c1c' : '#0f7b4a';
  var spentColor = '#b91c1c';
  var rows = [
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#eef1f6;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">',
    '<tr><td align="center">',
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" style="max-width:640px;background:#ffffff;border-radius:8px;overflow:hidden;">',
    '<tr><td align="center" bgcolor="#ffffff" style="background-color:#ffffff;padding:28px 24px 22px;border-bottom:1px solid #e5e7eb;">',
    headerHtml_(monthLabel, hasSeal),
    '</td></tr>',
    '<tr><td style="padding:20px 24px 8px;font-size:14px;color:#4b5563;">Period: ' +
      escape_(formatDate_(data.periodStart)) + ' – ' + escape_(formatDate_(data.periodEnd)) + '</td></tr>',
    '<tr><td style="padding:8px 24px 16px;">',
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #e5e7eb;border-radius:6px;">',
    metricRow_('Biennium budget', money_(data.bienniumBudget), '#111827'),
    metricRow_('Spent', money_(data.totalSpent), spentColor),
    metricRow_('Left', money_(data.left), leftColor),
    metricRow_('% remaining', remaining + '%', leftColor),
    '</table></td></tr>',
    '<tr><td style="padding:8px 24px 4px;font-size:16px;font-weight:700;color:' + NAVY + ';">Planned vs spent</td></tr>',
    '<tr><td style="padding:4px 24px 16px;">',
    categoryTable_(data),
    '</td></tr>',
    '<tr><td style="padding:8px 24px 4px;font-size:16px;font-weight:700;color:' + NAVY + ';">Recent expenses</td></tr>',
    '<tr><td style="padding:4px 24px 24px;">',
    expenseTable_(data),
    '</td></tr>'
  ];
  if (data.sentBy) {
    rows.push('<tr><td style="padding:0 24px 20px;font-size:12px;color:#6b7280;">Sent by ' + escape_(data.sentBy) + '</td></tr>');
  }
  rows.push('</table></td></tr></table>');
  return rows.join('');
}

function headerHtml_(monthLabel, hasSeal) {
  var rows = ['<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">'];
  if (hasSeal) {
    rows.push(
      '<tr><td align="center" style="padding:0 0 14px 0;"><table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr><td align="center">' +
      '<img src="cid:seal" width="120" alt="Coat of arms of Wisconsin" style="display:block;width:120px;height:auto;border:0;outline:none;text-decoration:none;" />' +
      '</td></tr></table></td></tr>'
    );
  }
  rows.push(
    '<tr><td align="center" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:' + NAVY + ';font-weight:600;padding:0;">CALLAHAN OFFICE</td></tr>',
    '<tr><td align="center" style="font-family:Arial,Helvetica,sans-serif;font-size:26px;font-weight:700;color:' + NAVY + ';padding:6px 0 0 0;line-height:1.2;">Office Budget</td></tr>',
    '<tr><td align="center" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#4b5563;padding:8px 0 0 0;">Monthly summary for ' + escape_(monthLabel) + '</td></tr>',
    '</table>'
  );
  return rows.join('');
}

function metricRow_(label, value, color) {
  return '<tr>' +
    '<td style="padding:10px 14px;font-size:13px;color:#4b5563;border-bottom:1px solid #e5e7eb;width:60%;">' + escape_(label) + '</td>' +
    '<td style="padding:10px 14px;font-size:15px;font-weight:700;text-align:right;border-bottom:1px solid #e5e7eb;color:' + color + ';">' + escape_(value) + '</td>' +
    '</tr>';
}

function categoryTable_(data) {
  var planned = data.planned || [];
  if (!planned.length) {
    return '<p style="margin:0;font-size:14px;color:#6b7280;">No planned categories.</p>';
  }
  var html = '<table cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #e5e7eb;border-collapse:collapse;font-size:13px;">';
  html += '<tr style="background:#f3f4f6;color:#4b5563;">' +
    th_('Category', 'left') + th_('Planned', 'right') + th_('Spent', 'right') + th_('Left', 'right') +
    '</tr>';
  var lastGroup = null;
  var i;
  for (i = 0; i < planned.length; i++) {
    var row = planned[i] || {};
    var group = row.group || '';
    if (group && group !== lastGroup) {
      html += '<tr><td colspan="4" style="padding:8px 10px;background:#f8fafc;color:' + NAVY + ';font-weight:700;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;border-top:1px solid #e5e7eb;">' + escape_(group) + '</td></tr>';
      lastGroup = group;
    }
    var leftNum = Number(row.left) || 0;
    var leftColor = leftNum < 0 ? '#b91c1c' : '#111827';
    html += '<tr>' +
      td_(row.name || 'Category', 'left', '#111827') +
      td_(money_(row.planned), 'right', '#111827') +
      td_(money_(row.spent), 'right', '#b91c1c') +
      td_(money_(row.left), 'right', leftColor) +
      '</tr>';
  }
  var unplanned = data.unplanned || {};
  if (unplanned.total) {
    html += '<tr><td colspan="4" style="padding:8px 10px;background:#f8fafc;color:' + NAVY + ';font-weight:700;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;border-top:1px solid #e5e7eb;">Unplanned</td></tr>';
    html += '<tr>' +
      td_('Unplanned / unitemized', 'left', '#111827') +
      td_('—', 'right', '#111827') +
      td_(money_(unplanned.total), 'right', '#b91c1c') +
      td_('—', 'right', '#111827') +
      '</tr>';
  }
  html += '</table>';
  return html;
}

function expenseTable_(data) {
  var expenses = recentExpenses_(data);
  if (!expenses.length) {
    return '<p style="margin:0;font-size:14px;color:#6b7280;">No expenses logged.</p>';
  }
  var html = '<table cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #e5e7eb;border-collapse:collapse;font-size:13px;">';
  html += '<tr style="background:#f3f4f6;color:#4b5563;">' +
    th_('Date', 'left') + th_('Description', 'left') + th_('Category', 'left') + th_('Amount', 'right') + th_('Entered by', 'left') +
    '</tr>';
  var i;
  for (i = 0; i < expenses.length; i++) {
    var exp = expenses[i] || {};
    html += '<tr>' +
      td_(formatDate_(exp.date), 'left', '#111827') +
      td_(exp.desc || '', 'left', '#111827') +
      td_(exp.category || '', 'left', '#4b5563') +
      td_(money_(exp.amount), 'right', '#b91c1c') +
      td_(exp.by || '', 'left', '#4b5563') +
      '</tr>';
  }
  if (data.expenseCountThisMonth || data.expensesThisMonth) {
    html += '<tr><td colspan="5" style="padding:8px 10px;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;">' +
      (Number(data.expenseCountThisMonth) || 0) + ' expense' +
      ((Number(data.expenseCountThisMonth) === 1) ? '' : 's') +
      ' in this report month, totaling ' + money_(data.expensesThisMonth) +
      '.</td></tr>';
  }
  html += '</table>';
  return html;
}

function th_(label, align) {
  return '<th align="' + align + '" style="padding:8px 10px;text-align:' + align + ';font-weight:600;border-bottom:1px solid #e5e7eb;">' + escape_(label) + '</th>';
}

function td_(value, align, color) {
  return '<td align="' + align + '" style="padding:8px 10px;text-align:' + align + ';border-top:1px solid #e5e7eb;color:' + color + ';">' + escape_(value) + '</td>';
}

function recentExpenses_(data) {
  var list = Array.isArray(data.expenses) ? data.expenses.slice() : [];
  list.sort(function (a, b) {
    var da = String((a && a.date) || '');
    var db = String((b && b.date) || '');
    if (da !== db) return da < db ? 1 : -1;
    return 0;
  });
  return list.slice(0, 20);
}

function remaining_(data) {
  if (data.percentRemaining != null && isFinite(Number(data.percentRemaining))) {
    return Math.round(Number(data.percentRemaining));
  }
  var total = Number(data.bienniumBudget) || 0;
  var left = Number(data.left);
  if (total > 0 && isFinite(left)) return Math.round((left / total) * 100);
  var used = Number(data.percentUsed);
  if (isFinite(used)) return Math.round(100 - used);
  return 0;
}

function money_(value) {
  var num = Number(value);
  if (!isFinite(num)) num = 0;
  var negative = num < 0;
  var abs = Math.abs(num);
  var parts = abs.toFixed(2).split('.');
  parts[0] = parts[0].replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,');
  return (negative ? '-$' : '$') + parts.join('.');
}

function formatDate_(value) {
  if (!value) return '—';
  var date = value instanceof Date ? value : new Date(String(value) + (String(value).length <= 10 ? 'T12:00:00' : ''));
  if (isNaN(date.getTime())) return String(value);
  return Utilities.formatDate(date, TZ, 'MMM d, yyyy');
}

function formatMonth_(yearMonth) {
  var raw = String(yearMonth || '');
  var parts = raw.split('-');
  if (parts.length >= 2) {
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
    if (!isNaN(date.getTime())) return Utilities.formatDate(date, TZ, 'MMMM yyyy');
  }
  return raw || 'this period';
}

function escape_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

var SEAL_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAPoAAAEHCAMAAACwSat8AAACNFBMVEVHcEwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAJCAAAAAAAAAAAAAAAAAASEgoAAAALCwcAAAAAAAAAAAAAAAD///////+HdQr///+Oegrz2hb///////+3nw9iUwewmg3///////8zJwFWSwgAAAD7wQb////zM0sDAgH007AJBQMMCQQPDgi8vLwAKIVlFwoYCAYXFxYYEAR1PCjyugYeEwashAQADCjrtQbcqQUAJHe+Ci8pIAGZdQQAETeifQQoJydSPwIAFUa3jAQhGQEACBxJEA34vwYgIB9zc3NMJxoAAwlyWANAIBUxLy4AIGozGhEABhPjrwVDMwI0CwuKagOzs7MxJgEAGVMmCAc/Dg0pFQ5UEwpLOQJpUQKEZQN5XQOXl5c3NTV8fHzGmAWRbwP9/f09LwEAHV/t7e2/kwRlZWU3KgFYRAJsbGzMnQXz8/M8Ozqrq6ulpaVYWFhSUlLZ2dlJSUmJiYljTAKrJDTJwsN+YQPWpAVeXl5ZLR5QTUpAQECHHCnf39+CgoL5+fmenp6QkJBbExxlMyK9JzpeSAJuOCV5GSXR0dHKysrRoQVrFiFERESZIC/n5+frMUjVLEHpy6rBwcGlj3ngwqPhL0VlV0mDcl/QtZjKKj6VgWxLQDZ0ZFTAp4yrP1W2nJOufq4XrhesT2EMXgyub4ClO1GHYodMBBMHNwcRhBFqTGqABh+sCCo3LxUAAABHcEynkeSPAAAAvHRSTlMAWSvBNvy08Ibf+NYg6KcPzGaaTQNCCJB6F3BXI83NrC2yoHXOkpKZ9oX/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////AAwp9XEAACAASURBVHja5Fprj1rXFR0el4GB4c3AII1sKcmHbB8d3XuxuGCa1Kot4rYKkECu84FEQnYDVDQEhfCGipaHYEBICKIRH+a3dh/ek7hxGFtlmJ4vM8DlctZe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';
