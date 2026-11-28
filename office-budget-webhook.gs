/**
 * Office Budget monthly email
 *
 * Office Budget POSTs a JSON snapshot once a month. This script emails
 * a readable summary. It does not use Google Sheets.
 *
 * Setup:
 *  1. Open https://script.google.com and click New project.
 *  2. Delete any starter code and paste this entire file. Click Save.
 *     (A project name like “Office Budget monthly email” is fine.)
 *  3. At the top of this file, set RECIPIENT to the email address that
 *     should get the summary. Click Save.
 *  4. Select the function testSend and click Run. Authorize the script
 *     when Google asks. You should get a test email.
 *  5. Click Deploy > New deployment. Choose type Web app.
 *       Execute as: Me
 *       Who has access: Anyone
 *     Copy the web app URL. It should look like
 *     https://script.google.com/macros/s/…/exec
 *     The URL is the secret — do not post it publicly.
 *  6. In Trello, open Office Budget > Settings > Monthly update, paste
 *     the URL, and click Save URL. Click Send update now to send one
 *     from the app.
 *
 * After that, the first time someone opens Office Budget in a new
 * calendar month (America/Chicago), a snapshot of the previous month
 * is sent automatically.
 */

var RECIPIENT = ''; // e.g. 'name@example.com'

var TZ = 'America/Chicago';
var NAVY = '#1b365d';

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
  sendBudgetEmail_(data);
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

function sendBudgetEmail_(data) {
  var to = String(RECIPIENT || '').trim();
  if (!to) {
    throw new Error('Set the RECIPIENT email address at the top of this script, then save and run testSend again.');
  }
  data = data || {};
  var monthLabel = formatMonth_(data.reportMonth);
  var subject = 'Office Budget: ' + monthLabel;
  var html = buildHtml_(data, monthLabel);
  var plain = buildPlain_(data, monthLabel);
  MailApp.sendEmail({
    to: to,
    subject: subject,
    body: plain,
    htmlBody: html,
    name: 'Callahan Office Budget'
  });
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

function buildHtml_(data, monthLabel) {
  var remaining = remaining_(data);
  var leftNum = Number(data.left) || 0;
  var leftColor = leftNum < 0 ? '#b91c1c' : '#0f7b4a';
  var spentColor = '#b91c1c';
  var rows = [
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#eef1f6;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">',
    '<tr><td align="center">',
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" style="max-width:640px;background:#ffffff;border-radius:8px;overflow:hidden;">',
    '<tr><td style="background:' + NAVY + ';color:#ffffff;padding:20px 24px;">',
    '<div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">' + escape_(data.office || 'Callahan Office') + '</div>',
    '<div style="font-size:22px;font-weight:700;margin-top:4px;">Office Budget</div>',
    '<div style="font-size:14px;margin-top:8px;opacity:0.9;">Monthly summary for ' + escape_(monthLabel) + '</div>',
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
