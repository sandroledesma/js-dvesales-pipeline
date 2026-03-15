/**
 * SyncInventory.gs
 * Fetches Amazon FBA/MCF inventory and writes it to the Inventory_Feed tab.
 * Calculates weeks-of-supply and reorder recommendations.
 */

var INVENTORY_TAB = 'Inventory_Feed';

var INVENTORY_HEADERS = [
  'last_updated',      // A
  'sku',               // B
  'asin',              // C
  'product_name',      // D
  'condition',         // E
  'fulfillable_qty',   // F
  'inbound_qty',       // G
  'reserved_qty',      // H
  'total_qty',         // I
  'avg_daily_sales_30d',// J
  'weeks_of_supply',   // K
  'reorder_point',     // L  (units)
  'days_until_reorder',// M
  'reorder_flag',      // N  (YES/NO)
];

/**
 * Main entry — fetch all Amazon FBA inventory and overwrite Inventory_Feed.
 */
function syncInventory() {
  log('=== syncInventory start');

  var inventoryItems = getAllAmazonInventory();
  if (!inventoryItems || inventoryItems.length === 0) {
    log('No inventory data returned from Amazon.');
    return;
  }

  // Build a lookup of avg daily sales from Sales_Fact (last 30 days)
  var salesVelocity = buildSalesVelocity(30);

  var now    = new Date().toISOString();
  var rows   = inventoryItems.map(function(item) {
    return normaliseInventoryRow(item, now, salesVelocity);
  });

  // Sort by reorder flag then SKU
  rows.sort(function(a, b) {
    if (a[13] !== b[13]) return a[13] === 'YES' ? -1 : 1; // reorder flag col N (index 13)
    return String(a[1]).localeCompare(String(b[1]));         // sku col B
  });

  writeSheet(INVENTORY_TAB, INVENTORY_HEADERS, rows);
  applyColumnFormats_Inventory();
  log('=== syncInventory complete | ' + rows.length + ' SKUs written');
  return rows.length;
}

/**
 * Normalise a single SP-API inventory summary record into a row array.
 */
function normaliseInventoryRow(item, timestamp, salesVelocity) {
  var sku             = item.sellerSku || '';
  var asin            = item.asin || '';
  var productName     = item.productName || '';
  var condition       = item.condition || '';

  var inventoryDetails = item.inventoryDetails || {};
  var fulfillableQty  = num(item.totalQuantity || 0);
  var inboundQty      = num(
    (inventoryDetails.inboundReceivingQuantity && inventoryDetails.inboundReceivingQuantity.totalQuantity) ||
    (inventoryDetails.inboundWorkingQuantity && inventoryDetails.inboundWorkingQuantity.totalQuantity) || 0
  ) + num(
    (inventoryDetails.inboundShippedQuantity && inventoryDetails.inboundShippedQuantity.totalQuantity) || 0
  );
  var reservedQty     = num(
    (inventoryDetails.reservedQuantity && inventoryDetails.reservedQuantity.totalReservedQuantity) || 0
  );
  var totalQty        = fulfillableQty + inboundQty;

  var avgDailySales   = salesVelocity[sku] || salesVelocity[asin] || 0;

  // Weeks of supply = fulfillable / (avgDaily * 7)
  var weeksOfSupply   = avgDailySales > 0
    ? (fulfillableQty / (avgDailySales * 7))
    : null;

  // Reorder point = 14 days of demand + 7 days safety stock
  var reorderPoint    = avgDailySales * 21;

  // Days until reorder = (fulfillable - reorderPoint) / avgDaily
  var daysUntilReorder = avgDailySales > 0
    ? ((fulfillableQty - reorderPoint) / avgDailySales)
    : null;

  var reorderFlag = (daysUntilReorder !== null && daysUntilReorder <= 0) ? 'YES' : 'NO';

  return [
    timestamp,                                    // A last_updated
    sku,                                          // B sku
    asin,                                         // C asin
    productName,                                  // D product_name
    condition,                                    // E condition
    fulfillableQty,                               // F fulfillable_qty
    inboundQty,                                   // G inbound_qty
    reservedQty,                                  // H reserved_qty
    totalQty,                                     // I total_qty
    avgDailySales !== 0 ? avgDailySales.toFixed(2) : '', // J avg_daily_sales_30d
    weeksOfSupply !== null ? weeksOfSupply.toFixed(1) : '', // K weeks_of_supply
    avgDailySales > 0 ? reorderPoint.toFixed(0) : '',       // L reorder_point
    daysUntilReorder !== null ? daysUntilReorder.toFixed(0) : '', // M days_until_reorder
    reorderFlag,                                  // N reorder_flag
  ];
}

/**
 * Build a lookup of { sku/asin -> avgDailySales } from the last N days of Sales_Fact.
 */
function buildSalesVelocity(days) {
  var data = getSheetData(SALES_FACT_TAB);
  if (!data || data.length === 0) return {};

  var cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  var cutoffStr = toDateStr(cutoff);

  // channel(1)=amazon, sku(5), date(0), qty(8)
  var qtySumBySku = {};
  var minDateBySku = {};

  data.forEach(function(row) {
    if (String(row[1]).toLowerCase() !== 'amazon') return;
    var dateStr = String(row[0] || '');
    if (dateStr < cutoffStr) return;

    var sku = String(row[5] || '');
    if (!sku) return;
    var qty = num(row[8]);

    qtySumBySku[sku]  = (qtySumBySku[sku]  || 0) + qty;
    if (!minDateBySku[sku] || dateStr < minDateBySku[sku]) {
      minDateBySku[sku] = dateStr;
    }
  });

  var velocity = {};
  Object.keys(qtySumBySku).forEach(function(sku) {
    velocity[sku] = qtySumBySku[sku] / days;
  });

  return velocity;
}

/**
 * Apply number formats to Inventory_Feed.
 */
function applyColumnFormats_Inventory() {
  // No currency cols, just ensure numeric columns look clean
  var sheet   = getOrCreateSheet(INVENTORY_TAB);
  var lastRow = Math.max(sheet.getLastRow(), 2);
  // Col J (10) - avg daily sales: 2 decimal places
  sheet.getRange(2, 10, lastRow - 1, 1).setNumberFormat('0.00');
  // Col K (11) - weeks of supply
  sheet.getRange(2, 11, lastRow - 1, 1).setNumberFormat('0.0');

  // Highlight reorder rows (col N = 14)
  var ss = getSpreadsheet();
  // Clear existing conditional formatting rules on this sheet first
  sheet.clearConditionalFormatRules();
  var rule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('YES')
    .setBackground('#fce8e6')
    .setFontColor('#d93025')
    .setRanges([sheet.getRange(2, 1, Math.max(lastRow - 1, 1), INVENTORY_HEADERS.length)])
    .build();
  sheet.setConditionalFormatRules([rule]);
}
