/**
 * SyncSales.gs
 * Pulls orders from Shopify and Amazon, deduplicates against existing data,
 * and appends new rows to the Sales_Fact tab.
 */

var SALES_FACT_TAB = 'Sales_Fact';

var SALES_FACT_HEADERS = [
  'date',           // A
  'channel',        // B
  'order_id',       // C
  'line_id',        // D
  'order_number',   // E
  'sku',            // F
  'product_name',   // G
  'variant',        // H
  'quantity',       // I
  'unit_price',     // J
  'gross_revenue',  // K
  'discounts',      // L
  'net_revenue',    // M
  'fee_fulfillment',// N
  'fee_referral',   // O
  'fee_transaction',// P
  'fee_storage',    // Q
  'fee_other',      // R
  'currency',       // S
  'region',         // T
  'year',           // U
  'quarter',        // V
  'iso_week',       // W
  'month',          // X
  'customer_id',    // Y
  'customer_name',  // Z
  'customer_email', // AA
  'city',           // AB
  'state',          // AC
  'zip',            // AD
  'country',        // AE
  'financial_status', // AF
];

// Dedup key: channel + order_id + line_id (columns B, C, D → 0-based indexes 1, 2, 3)
var SALES_KEY_COLS = [1, 2, 3];

/**
 * Main entry point — sync last N days of sales from all channels.
 * Called from the menu or a time-based trigger.
 *
 * @param {number} daysBack  Number of days to look back (default 35)
 * @param {string} channels  Comma-separated: 'shopify,amazon' (default: both)
 */
function syncSales(daysBack, channels) {
  daysBack = daysBack || 35;
  channels = channels ? channels.split(',').map(function(c) { return c.trim().toLowerCase(); })
                      : ['shopify', 'amazon'];

  var startISO = daysAgoISO(daysBack);
  var endISO   = new Date().toISOString();

  log('=== syncSales start | ' + startISO + ' → ' + endISO + ' | channels: ' + channels.join(','));

  ensureHeaders(SALES_FACT_TAB, SALES_FACT_HEADERS);
  var existingKeys = getExistingKeys(SALES_FACT_TAB, SALES_KEY_COLS);
  var existingCount = Object.keys(existingKeys).length;
  log('Existing rows in Sales_Fact: ' + existingCount);

  var allNewRows = [];

  if (channels.indexOf('shopify') !== -1) {
    try {
      var shopifyRows = getShopifyOrders(startISO, endISO);
      var newShopify  = filterNewRows(shopifyRows, existingKeys, SALES_KEY_COLS);
      log('Shopify new rows: ' + newShopify.length + ' (skipped ' + (shopifyRows.length - newShopify.length) + ' dupes)');
      allNewRows = allNewRows.concat(newShopify);
      // Add new rows to existingKeys so Amazon dupes against same-order cross-sync don't slip through
      newShopify.forEach(function(row) {
        var key = SALES_KEY_COLS.map(function(i) { return String(row[i] || ''); }).join('|');
        existingKeys[key] = true;
      });
    } catch (e) {
      log('ERROR syncing Shopify: ' + e.message);
      SpreadsheetApp.getActiveSpreadsheet().toast('Shopify sync error: ' + e.message, 'Sync Warning', 10);
    }
  }

  if (channels.indexOf('amazon') !== -1) {
    try {
      var amazonRows = getAmazonOrders(startISO, endISO);
      var newAmazon  = filterNewRows(amazonRows, existingKeys, SALES_KEY_COLS);
      log('Amazon new rows: ' + newAmazon.length + ' (skipped ' + (amazonRows.length - newAmazon.length) + ' dupes)');
      allNewRows = allNewRows.concat(newAmazon);
    } catch (e) {
      log('ERROR syncing Amazon: ' + e.message);
      SpreadsheetApp.getActiveSpreadsheet().toast('Amazon sync error: ' + e.message, 'Sync Warning', 10);
    }
  }

  if (allNewRows.length > 0) {
    // Sort by date before appending
    allNewRows.sort(function(a, b) {
      return String(a[0]).localeCompare(String(b[0]));
    });
    appendRows(SALES_FACT_TAB, allNewRows);
    applyColumnFormats_SalesFact();
  } else {
    log('No new rows to append.');
  }

  log('=== syncSales complete | appended ' + allNewRows.length + ' rows');
  return allNewRows.length;
}

/**
 * Sync only Shopify sales.
 */
function syncShopifySales() {
  return syncSales(35, 'shopify');
}

/**
 * Sync only Amazon sales.
 */
function syncAmazonSales() {
  return syncSales(35, 'amazon');
}

/**
 * Sync a custom date range. Dates in YYYY-MM-DD format.
 */
function syncSalesDateRange(startDate, endDate, channels) {
  var startISO = new Date(startDate + 'T00:00:00Z').toISOString();
  var endISO   = new Date(endDate   + 'T23:59:59Z').toISOString();
  channels = channels || 'shopify,amazon';

  log('=== syncSalesDateRange | ' + startISO + ' → ' + endISO);
  ensureHeaders(SALES_FACT_TAB, SALES_FACT_HEADERS);
  var existingKeys = getExistingKeys(SALES_FACT_TAB, SALES_KEY_COLS);

  var allNewRows = [];
  var channelList = channels.split(',').map(function(c) { return c.trim(); });

  if (channelList.indexOf('shopify') !== -1) {
    var shopifyRows = getShopifyOrders(startISO, endISO);
    var newShopify  = filterNewRows(shopifyRows, existingKeys, SALES_KEY_COLS);
    allNewRows = allNewRows.concat(newShopify);
    newShopify.forEach(function(row) {
      var key = SALES_KEY_COLS.map(function(i) { return String(row[i] || ''); }).join('|');
      existingKeys[key] = true;
    });
  }
  if (channelList.indexOf('amazon') !== -1) {
    var amazonRows = getAmazonOrders(startISO, endISO);
    var newAmazon  = filterNewRows(amazonRows, existingKeys, SALES_KEY_COLS);
    allNewRows = allNewRows.concat(newAmazon);
  }

  if (allNewRows.length > 0) {
    allNewRows.sort(function(a, b) { return String(a[0]).localeCompare(String(b[0])); });
    appendRows(SALES_FACT_TAB, allNewRows);
    applyColumnFormats_SalesFact();
  }

  log('syncSalesDateRange complete | appended ' + allNewRows.length + ' rows');
  return allNewRows.length;
}

/**
 * Apply number formats to Sales_Fact currency/numeric columns.
 * Called after any append.
 */
function applyColumnFormats_SalesFact() {
  // Currency columns: J(10), K(11), L(12), M(13), N(14), O(15), P(16), Q(17), R(18)
  applyCurrencyFormat(SALES_FACT_TAB, [10, 11, 12, 13, 14, 15, 16, 17, 18]);
}

/**
 * UI helper — prompt for date range then sync.
 */
function syncSalesPrompt() {
  var ui = SpreadsheetApp.getUi();
  var startResult = ui.prompt('Sync Sales', 'Start date (YYYY-MM-DD):', ui.ButtonSet.OK_CANCEL);
  if (startResult.getSelectedButton() !== ui.Button.OK) return;
  var endResult   = ui.prompt('Sync Sales', 'End date (YYYY-MM-DD):', ui.ButtonSet.OK_CANCEL);
  if (endResult.getSelectedButton()   !== ui.Button.OK) return;

  var start = startResult.getResponseText().trim();
  var end   = endResult.getResponseText().trim();

  ui.alert('Syncing ' + start + ' to ' + end + '…\nCheck the Execution Log for progress.');
  var count = syncSalesDateRange(start, end, 'shopify,amazon');
  ui.alert('Done! Appended ' + count + ' new rows to Sales_Fact.');
}
