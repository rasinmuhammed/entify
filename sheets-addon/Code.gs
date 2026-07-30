/**
 * Entify for Google Sheets.
 *
 * Finds rows that refer to the same person or company and explains why,
 * which is the part a formula cannot do. COUNTIF tells you two cells are
 * identical; it has nothing to say about "Barbra" and "Barbara" sharing a
 * phone number written two different ways.
 *
 * Apps Script cannot run the matching itself, so the selection is sent to
 * the Entify backend and the results are painted back onto the sheet.
 *
 * @OnlyCurrentDoc
 *
 * The annotation above is load-bearing, not decoration. It restricts the
 * script to the spreadsheet it is bound to, which keeps the add-on on the
 * narrow spreadsheets.currentonly scope instead of requesting access to
 * everything in the user's Drive. That is the difference between a light
 * brand review and a full security assessment when publishing, and it is
 * also the honest scope for what this does.
 */

// Overridden per-install via Script Properties so a self-hosted backend does
// not require editing source.
var DEFAULT_API_BASE = 'http://localhost:8000';

// Highlight palette. Deliberately desaturated: these sit behind the user's
// own data, and saturated fills make a sheet unreadable.
var GROUP_COLOURS = [
  '#fdf2f2', '#f2f7fd', '#f3fdf2', '#fdfaf2',
  '#f8f2fd', '#f2fdfb', '#fdf2f9', '#f7fdf2'
];

var STATUS_COLUMN_HEADER = 'Entify group';


function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Entify')
    .addItem('Find duplicates', 'showSidebar')
    .addItem('Clear highlighting', 'clearHighlighting')
    .addSeparator()
    .addItem('Settings', 'showSettings')
    .addToUi();
}


function onInstall() {
  onOpen();
}


function showSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('Entify');
  SpreadsheetApp.getUi().showSidebar(html);
}


function showSettings() {
  var current = getApiBase();
  var response = SpreadsheetApp.getUi().prompt(
    'Entify backend',
    'URL of your Entify backend:',
    SpreadsheetApp.getUi().ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() === SpreadsheetApp.getUi().Button.OK) {
    var value = response.getResponseText().trim();
    if (value) {
      PropertiesService.getUserProperties().setProperty('ENTIFY_API_BASE', value);
    }
  }
}


function getApiBase() {
  return PropertiesService.getUserProperties()
    .getProperty('ENTIFY_API_BASE') || DEFAULT_API_BASE;
}


/**
 * Read the used range of the active sheet.
 *
 * The first row is treated as headers. Values are stringified because the
 * backend compares text, and a phone number that Sheets has decided is a
 * number would otherwise arrive as 8.0115652874e+11.
 */
function readSelection() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var range = sheet.getDataRange();
  var values = range.getDisplayValues();

  if (values.length < 2) {
    throw new Error('This sheet needs a header row and at least two rows of data.');
  }

  return {
    header: values[0].map(function (h) { return String(h).trim(); }),
    rows: values.slice(1),
    firstDataRow: range.getRow() + 1,
    sheetName: sheet.getName()
  };
}


/**
 * Called from the sidebar. Sends the sheet to the backend and returns the
 * result for rendering, after painting the groups onto the sheet.
 */
function findDuplicates(threshold) {
  var selection = readSelection();

  // Trailing blank columns are common and produce empty headers, which the
  // backend rejects. Trim them here rather than making the user do it.
  var lastNamed = selection.header.length;
  while (lastNamed > 0 && !selection.header[lastNamed - 1]) {
    lastNamed--;
  }
  if (lastNamed === 0) {
    throw new Error('No column headers found in the first row.');
  }
  var header = selection.header.slice(0, lastNamed);
  var rows = selection.rows.map(function (r) { return r.slice(0, lastNamed); });

  // Drop rows that are entirely empty; blank trailing rows are otherwise
  // reported back as a large duplicate group of nothing.
  var kept = [];
  var originalIndex = [];
  rows.forEach(function (row, i) {
    var hasValue = row.some(function (cell) { return String(cell).trim() !== ''; });
    if (hasValue) {
      kept.push(row);
      originalIndex.push(i);
    }
  });

  if (kept.length < 2) {
    throw new Error('Found fewer than two non-empty rows to compare.');
  }

  var response = UrlFetchApp.fetch(getApiBase() + '/api/sheets/dedupe', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      header: header,
      rows: kept,
      threshold: threshold || 0.9
    }),
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  var body = response.getContentText();

  if (code === 400) {
    throw new Error(JSON.parse(body).detail);
  }
  if (code !== 200) {
    throw new Error(
      'The Entify backend returned ' + code + '. Check it is running and ' +
      'reachable at ' + getApiBase() + '.'
    );
  }

  var result = JSON.parse(body);

  // Map backend row indices back to sheet rows, undoing the blank-row filter.
  result.groups.forEach(function (group) {
    group.sheetRows = group.rows.map(function (i) {
      return selection.firstDataRow + originalIndex[i];
    });
  });

  highlightGroups(result.groups);
  return result;
}


/**
 * Paint each duplicate group in its own colour and label it.
 *
 * Colour alone is not enough: it is invisible to a screen reader, lost when
 * the sheet is exported, and indistinguishable if two groups happen to sit
 * next to each other. The label column carries the same information as text.
 */
function highlightGroups(groups) {
  var sheet = SpreadsheetApp.getActiveSheet();
  clearHighlighting();

  if (!groups.length) {
    return;
  }

  var statusColumn = sheet.getLastColumn() + 1;
  sheet.getRange(1, statusColumn).setValue(STATUS_COLUMN_HEADER).setFontWeight('bold');

  groups.forEach(function (group, index) {
    var colour = GROUP_COLOURS[index % GROUP_COLOURS.length];
    var label = 'Group ' + (index + 1) + ' of ' + groups.length;

    group.sheetRows.forEach(function (rowNumber, position) {
      sheet.getRange(rowNumber, 1, 1, statusColumn - 1).setBackground(colour);
      sheet.getRange(rowNumber, statusColumn).setValue(
        // Naming the survivor makes the next action obvious.
        position === 0 ? label + ' (keep)' : label + ' (duplicate)'
      );
    });
  });

  sheet.autoResizeColumn(statusColumn);
}


function clearHighlighting() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  if (lastRow < 1 || lastColumn < 1) {
    return;
  }

  sheet.getRange(1, 1, lastRow, lastColumn).setBackground(null);

  // Remove a status column left by a previous run so repeated runs do not
  // accumulate columns.
  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  for (var i = headers.length - 1; i >= 0; i--) {
    if (String(headers[i]).trim() === STATUS_COLUMN_HEADER) {
      sheet.deleteColumn(i + 1);
    }
  }
}


/** Scroll to a group's first row. Called from the sidebar. */
function jumpToRow(rowNumber) {
  var sheet = SpreadsheetApp.getActiveSheet();
  sheet.setActiveRange(sheet.getRange(rowNumber, 1));
}
