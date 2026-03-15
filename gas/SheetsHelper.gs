/**
 * SheetsHelper.gs
 * Low-level Google Sheets utilities: get/create tabs, append rows,
 * deduplication, formatting, and column-range reads.
 */

// ---------------------------------------------------------------------------
// Tab management
// ---------------------------------------------------------------------------

/**
 * Get a sheet by name, or create it if it doesn't exist.
 * @param {string} tabName
 * @returns {Sheet}
 */
function getOrCreateSheet(tabName) {
  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
    log('Created tab: ' + tabName);
  }
  return sheet;
}

/**
 * Clear all data from a sheet (keeps the sheet itself).
 */
function clearSheet(tabName) {
  var sheet = getOrCreateSheet(tabName);
  sheet.clearContents();
  sheet.clearFormats();
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Get all values from a sheet as a 2D array (excluding header row).
 * @param {string} tabName
 * @returns {Array[]}
 */
function getSheetData(tabName) {
  var sheet = getOrCreateSheet(tabName);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
}

/**
 * Get a Set of existing key strings for fast deduplication.
 * @param {string} tabName
 * @param {number[]} keyColIndexes  0-based column indexes to combine as key
 * @returns {Object}  hash: key string -> true
 */
function getExistingKeys(tabName, keyColIndexes) {
  var data = getSheetData(tabName);
  var keys = {};
  data.forEach(function(row) {
    var key = keyColIndexes.map(function(i) { return String(row[i] || ''); }).join('|');
    keys[key] = true;
  });
  return keys;
}

/**
 * Read a single column (1-indexed) from a sheet. Returns array of non-empty values.
 */
function getColumnValues(tabName, colIndex) {
  var sheet = getOrCreateSheet(tabName);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, colIndex, lastRow - 1, 1)
    .getValues()
    .map(function(r) { return r[0]; })
    .filter(function(v) { return v !== '' && v !== null && v !== undefined; });
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Append an array of rows to a sheet.
 * Does NOT deduplicate — call filterDuplicates() first if needed.
 * @param {string} tabName
 * @param {Array[]} rows
 */
function appendRows(tabName, rows) {
  if (!rows || rows.length === 0) return;
  var sheet   = getOrCreateSheet(tabName);
  var lastRow = sheet.getLastRow();
  var startRow = lastRow + 1;
  sheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
  log('Appended ' + rows.length + ' rows to ' + tabName);
}

/**
 * Write a header row to row 1 (only if row 1 is empty).
 * @param {string} tabName
 * @param {string[]} headers
 */
function ensureHeaders(tabName, headers) {
  var sheet    = getOrCreateSheet(tabName);
  var existing = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  var hasHeaders = existing.some(function(v) { return v !== ''; });
  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    formatHeaderRow(sheet, headers.length);
  }
}

/**
 * Overwrite the entire content of a sheet (header + rows).
 */
function writeSheet(tabName, headers, rows) {
  var sheet = getOrCreateSheet(tabName);
  sheet.clearContents();
  var all = [headers].concat(rows);
  sheet.getRange(1, 1, all.length, headers.length).setValues(all);
  formatHeaderRow(sheet, headers.length);
  log('Wrote ' + rows.length + ' rows to ' + tabName);
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

/**
 * Filter an array of new rows against existing keys.
 * @param {Array[]} newRows           Rows to filter
 * @param {Object}  existingKeys      Output of getExistingKeys()
 * @param {number[]} keyColIndexes    0-based indexes into newRows
 * @returns {Array[]}                 Only rows whose key is not already in existingKeys
 */
function filterNewRows(newRows, existingKeys, keyColIndexes) {
  return newRows.filter(function(row) {
    var key = keyColIndexes.map(function(i) { return String(row[i] || ''); }).join('|');
    return !existingKeys[key];
  });
}

/**
 * In-place deduplication of an existing sheet by key columns.
 * Keeps the first occurrence of each key.
 * Slow on large sheets — prefer filterNewRows() for incremental loads.
 *
 * @param {string}  tabName
 * @param {number[]} keyColIndexes  1-based column indexes
 */
function deduplicateSheet(tabName, keyColIndexes) {
  var sheet   = getOrCreateSheet(tabName);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var seen = {};
  var toDelete = [];

  data.forEach(function(row, idx) {
    var key = keyColIndexes.map(function(i) { return String(row[i - 1] || ''); }).join('|');
    if (seen[key]) {
      toDelete.push(idx + 2); // +2 for header and 0-base offset
    } else {
      seen[key] = true;
    }
  });

  // Delete rows in reverse order to preserve indices
  for (var i = toDelete.length - 1; i >= 0; i--) {
    sheet.deleteRow(toDelete[i]);
  }

  log('Deduplicated ' + tabName + ': removed ' + toDelete.length + ' duplicate rows');
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Apply bold + background color to header row.
 */
function formatHeaderRow(sheet, numCols) {
  var headerRange = sheet.getRange(1, 1, 1, numCols);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#1a73e8');
  headerRange.setFontColor('#ffffff');
  headerRange.setWrap(false);
  sheet.setFrozenRows(1);
}

/**
 * Auto-resize all columns up to numCols.
 */
function autoResizeColumns(tabName, numCols) {
  var sheet = getOrCreateSheet(tabName);
  for (var i = 1; i <= numCols; i++) {
    sheet.autoResizeColumn(i);
  }
}

/**
 * Set a column range to a given number format.
 * e.g. formatColumn(sheet, 10, 20, 2, '#,##0.00')
 *
 * @param {Sheet}  sheet
 * @param {number} startRow  1-indexed
 * @param {number} endRow    1-indexed (use sheet.getMaxRows() for all)
 * @param {number} col       1-indexed column
 * @param {string} format    Sheets number format string
 */
function formatColumn(sheet, startRow, endRow, col, format) {
  if (endRow < startRow) return;
  sheet.getRange(startRow, col, endRow - startRow + 1, 1).setNumberFormat(format);
}

/**
 * Apply currency format to a list of column indexes (1-based) in a sheet.
 */
function applyCurrencyFormat(tabName, colIndexes) {
  var sheet   = getOrCreateSheet(tabName);
  var lastRow = Math.max(sheet.getLastRow(), 2);
  colIndexes.forEach(function(col) {
    formatColumn(sheet, 2, lastRow, col, '"$"#,##0.00');
  });
}

/**
 * Apply percent format to a list of column indexes (1-based).
 */
function applyPercentFormat(tabName, colIndexes) {
  var sheet   = getOrCreateSheet(tabName);
  var lastRow = Math.max(sheet.getLastRow(), 2);
  colIndexes.forEach(function(col) {
    formatColumn(sheet, 2, lastRow, col, '0.00%');
  });
}

/**
 * Protect a sheet so only the owner can edit it (useful for formula sheets).
 */
function protectSheet(tabName, description) {
  var sheet      = getOrCreateSheet(tabName);
  var protection = sheet.protect().setDescription(description || 'Protected');
  var me = Session.getEffectiveUser();
  protection.addEditor(me);
  protection.removeEditors(protection.getEditors());
  if (protection.canDomainEdit()) {
    protection.setDomainEdit(false);
  }
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

/**
 * Sort a sheet by a column (ascending by default).
 * @param {string}  tabName
 * @param {number}  colIndex  1-based
 * @param {boolean} ascending
 */
function sortSheet(tabName, colIndex, ascending) {
  var sheet   = getOrCreateSheet(tabName);
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2) return;
  sheet.getRange(2, 1, lastRow - 1, lastCol)
    .sort({ column: colIndex, ascending: ascending !== false });
}
