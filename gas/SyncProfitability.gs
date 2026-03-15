/**
 * SyncProfitability.gs
 * Reads Sales_Fact + Model_Costs and writes calculated profitability
 * rows to Model_Profitability. Also maintains a Model_Costs input tab.
 */

var PROFITABILITY_TAB = 'Model_Profitability';
var COSTS_TAB         = 'Model_Costs';

var PROFITABILITY_HEADERS = [
  'date',             // A
  'channel',          // B
  'order_id',         // C
  'line_id',          // D
  'sku',              // E
  'product_name',     // F
  'quantity',         // G
  'unit_price',       // H
  'gross_revenue',    // I
  'discounts',        // J
  'net_revenue',      // K
  'total_fees',       // L
  'cogs',             // M  (qty * unit_cost from Model_Costs)
  'gross_profit',     // N  net_revenue - cogs
  'gross_margin_pct', // O
  'net_profit',       // P  net_revenue - cogs - total_fees
  'net_margin_pct',   // Q
  'revenue_per_unit', // R
  'profit_per_unit',  // S
  'year',             // T
  'quarter',          // U
  'iso_week',         // V
  'month',            // W
];

var COSTS_HEADERS = [
  'sku',        // A
  'product_name', // B
  'unit_cost',  // C  — enter manually
];

/**
 * Ensure Model_Costs tab exists with headers.
 * Users fill in unit_cost manually.
 */
function initModelCosts() {
  ensureHeaders(COSTS_TAB, COSTS_HEADERS);
  log('Model_Costs tab ready.');
}

/**
 * Rebuild Model_Profitability from Sales_Fact + Model_Costs.
 * Overwrites the entire tab on each run (deterministic from source data).
 */
function syncProfitability() {
  log('=== syncProfitability start');

  // Build cost lookup: sku -> unit_cost
  var costLookup = buildCostLookup();
  log('Cost lookup: ' + Object.keys(costLookup).length + ' SKUs with costs');

  // Read all Sales_Fact data
  var salesData = getSheetData(SALES_FACT_TAB);
  if (!salesData || salesData.length === 0) {
    log('Sales_Fact is empty — run syncSales first.');
    return 0;
  }
  log('Sales_Fact rows: ' + salesData.length);

  var rows = salesData.map(function(row) {
    return calcProfitabilityRow(row, costLookup);
  }).filter(function(r) { return r !== null; });

  writeSheet(PROFITABILITY_TAB, PROFITABILITY_HEADERS, rows);
  applyColumnFormats_Profitability();

  log('=== syncProfitability complete | ' + rows.length + ' rows');
  return rows.length;
}

/**
 * Build { sku -> unitCost } from Model_Costs tab.
 */
function buildCostLookup() {
  var data = getSheetData(COSTS_TAB);
  var lookup = {};
  data.forEach(function(row) {
    var sku  = String(row[0] || '').trim();
    var cost = num(row[2]);
    if (sku) lookup[sku] = cost;
  });
  return lookup;
}

/**
 * Convert a Sales_Fact row into a Profitability row.
 * Returns null if the row is invalid.
 *
 * Sales_Fact column mapping (0-based):
 *  0=date, 1=channel, 2=order_id, 3=line_id, 4=order_number,
 *  5=sku, 6=product_name, 7=variant, 8=qty, 9=unit_price,
 *  10=gross_revenue, 11=discounts, 12=net_revenue,
 *  13=fee_fulfillment, 14=fee_referral, 15=fee_transaction, 16=fee_storage, 17=fee_other,
 *  18=currency, 19=region, 20=year, 21=quarter, 22=iso_week, 23=month
 */
function calcProfitabilityRow(row, costLookup) {
  var sku         = String(row[5] || '').trim();
  var qty         = num(row[8]);
  var unitPrice   = num(row[9]);
  var grossRev    = num(row[10]);
  var discounts   = num(row[11]);
  var netRev      = num(row[12]);
  var feeTotal    = num(row[13]) + num(row[14]) + num(row[15]) + num(row[16]) + num(row[17]);

  var unitCost    = costLookup[sku] || 0;
  var cogs        = qty * unitCost;
  var grossProfit = netRev - cogs;
  var netProfit   = netRev - cogs - feeTotal;

  return [
    row[0],               // A date
    row[1],               // B channel
    row[2],               // C order_id
    row[3],               // D line_id
    sku,                  // E sku
    row[6],               // F product_name
    qty,                  // G quantity
    unitPrice,            // H unit_price
    grossRev,             // I gross_revenue
    discounts,            // J discounts
    netRev,               // K net_revenue
    feeTotal,             // L total_fees
    cogs,                 // M cogs
    grossProfit,          // N gross_profit
    netRev > 0 ? grossProfit / netRev : 0,  // O gross_margin_pct
    netProfit,            // P net_profit
    netRev > 0 ? netProfit  / netRev : 0,   // Q net_margin_pct
    qty > 0 ? netRev  / qty : 0,            // R revenue_per_unit
    qty > 0 ? netProfit / qty : 0,          // S profit_per_unit
    row[20],              // T year
    row[21],              // U quarter
    row[22],              // V iso_week
    row[23],              // W month
  ];
}

/**
 * Apply number formats to Model_Profitability.
 */
function applyColumnFormats_Profitability() {
  // Currency: H(8), I(9), J(10), K(11), L(12), M(13), N(14), P(16), R(18), S(19)
  applyCurrencyFormat(PROFITABILITY_TAB, [8, 9, 10, 11, 12, 13, 14, 16, 18, 19]);
  // Percent: O(15), Q(17)
  applyPercentFormat(PROFITABILITY_TAB, [15, 17]);
}

/**
 * Seed Model_Costs with all unique SKUs found in Sales_Fact (unit_cost = 0).
 * Existing rows are not overwritten.
 */
function seedModelCosts() {
  initModelCosts();
  var existingSkus = getColumnValues(COSTS_TAB, 1).reduce(function(acc, v) {
    acc[String(v).trim()] = true;
    return acc;
  }, {});

  var salesData = getSheetData(SALES_FACT_TAB);
  var newSkus   = {};
  salesData.forEach(function(row) {
    var sku  = String(row[5] || '').trim();
    var name = String(row[6] || '').trim();
    if (sku && !existingSkus[sku]) {
      newSkus[sku] = name;
    }
  });

  var newRows = Object.keys(newSkus).sort().map(function(sku) {
    return [sku, newSkus[sku], 0];
  });

  if (newRows.length > 0) {
    appendRows(COSTS_TAB, newRows);
    log('Seeded ' + newRows.length + ' new SKUs into Model_Costs');
  } else {
    log('Model_Costs already up to date');
  }
  return newRows.length;
}
