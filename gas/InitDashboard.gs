/**
 * InitDashboard.gs
 * Sets up the Google Sheets workbook structure:
 *   - Creates all required tabs
 *   - Writes headers and formatting
 *   - Builds a Summary dashboard tab with QUERY/SUMIF formulas
 *   - Adds named ranges and protections
 *
 * Run initAll() once to bootstrap a fresh spreadsheet.
 */

var DASHBOARD_TAB = 'Dashboard';

// Tab order in the spreadsheet
var TAB_ORDER = [
  DASHBOARD_TAB,
  SALES_FACT_TAB,
  INVENTORY_TAB,
  PROFITABILITY_TAB,
  COSTS_TAB,
];

// ---------------------------------------------------------------------------
// Master init
// ---------------------------------------------------------------------------

/**
 * Bootstrap the entire workbook. Safe to re-run — won't clear existing data.
 */
function initAll() {
  log('=== initAll start');

  ensureTabOrder();
  initSalesFact();
  initInventoryFeed();
  initProfitability();
  initModelCosts();
  buildDashboard();

  log('=== initAll complete');
  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Workbook initialised! Fill in Script Properties then run Setup Credentials.',
    'DVE Sales Pipeline', 8
  );
}

// ---------------------------------------------------------------------------
// Tab initialisation helpers
// ---------------------------------------------------------------------------

function initSalesFact() {
  ensureHeaders(SALES_FACT_TAB, SALES_FACT_HEADERS);
  var sheet = getOrCreateSheet(SALES_FACT_TAB);
  sheet.setTabColor('#1a73e8');
  // Set column widths
  var widths = { 1:90, 2:80, 3:160, 4:160, 5:110, 6:120, 7:220, 8:120,
                 9:70, 10:90, 11:110, 12:100, 13:110, 14:120, 15:110,
                 16:120, 17:100, 18:90, 19:80, 20:60 };
  Object.keys(widths).forEach(function(c) {
    sheet.setColumnWidth(parseInt(c), widths[c]);
  });
}

function initInventoryFeed() {
  ensureHeaders(INVENTORY_TAB, INVENTORY_HEADERS);
  var sheet = getOrCreateSheet(INVENTORY_TAB);
  sheet.setTabColor('#34a853');
}

function initProfitabilityTab() {
  ensureHeaders(PROFITABILITY_TAB, PROFITABILITY_HEADERS);
  var sheet = getOrCreateSheet(PROFITABILITY_TAB);
  sheet.setTabColor('#fbbc04');
}

// ---------------------------------------------------------------------------
// Dashboard tab
// ---------------------------------------------------------------------------

/**
 * Build (or rebuild) the Dashboard summary tab using Google Sheets formulas.
 * All calculations are done in-spreadsheet via QUERY/SUMIF/etc. — no script data.
 */
function buildDashboard() {
  var sheet = getOrCreateSheet(DASHBOARD_TAB);
  sheet.clearContents();
  sheet.clearFormats();
  sheet.setTabColor('#ea4335');

  // ---- Title ----
  sheet.getRange('A1').setValue('DVE Sales Pipeline — Dashboard');
  sheet.getRange('A1').setFontSize(16).setFontWeight('bold').setFontColor('#1a73e8');
  sheet.getRange('A2').setValue('Auto-refreshed by Apps Script triggers · Last run: ')
    .setFontColor('#666666').setFontSize(10);
  sheet.getRange('B2').setFormula('=NOW()').setNumberFormat('m/d/yyyy h:mm AM/PM')
    .setFontColor('#333333').setFontSize(10);

  // ---- Section: Revenue Summary ----
  writeSectionHeader(sheet, 'A4', 'REVENUE SUMMARY (Last 30 Days)');

  var kpiLabels = [
    ['Total Revenue',         '=IFERROR(SUMPRODUCT((DATEVALUE(Sales_Fact!A2:A)>=TODAY()-30)*(Sales_Fact!K2:K)),0)'],
    ['Shopify Revenue',       '=IFERROR(SUMPRODUCT((Sales_Fact!B2:B="shopify")*(DATEVALUE(Sales_Fact!A2:A)>=TODAY()-30)*Sales_Fact!K2:K),0)'],
    ['Amazon Revenue',        '=IFERROR(SUMPRODUCT((Sales_Fact!B2:B="amazon")*(DATEVALUE(Sales_Fact!A2:A)>=TODAY()-30)*Sales_Fact!K2:K),0)'],
    ['Total Fees',            '=IFERROR(SUMPRODUCT((DATEVALUE(Sales_Fact!A2:A)>=TODAY()-30)*(Sales_Fact!N2:N+Sales_Fact!O2:O+Sales_Fact!P2:P+Sales_Fact!Q2:Q+Sales_Fact!R2:R)),0)'],
    ['Units Sold',            '=IFERROR(SUMPRODUCT((DATEVALUE(Sales_Fact!A2:A)>=TODAY()-30)*(Sales_Fact!I2:I)),0)'],
    ['Avg Order Value',       '=IFERROR(SUMPRODUCT((DATEVALUE(Sales_Fact!A2:A)>=TODAY()-30)*Sales_Fact!K2:K)/SUMPRODUCT((DATEVALUE(Sales_Fact!A2:A)>=TODAY()-30)*(Sales_Fact!C2:C<>"")),0)'],
  ];
  writeKpiBlock(sheet, 5, kpiLabels, '"$"#,##0.00', [1, 2, 3, 4, 6]);

  // ---- Section: Profitability ----
  writeSectionHeader(sheet, 'A12', 'PROFITABILITY (All Time)');

  var profitKpis = [
    ['Gross Profit',          '=IFERROR(SUM(Model_Profitability!N2:N),0)'],
    ['Net Profit',            '=IFERROR(SUM(Model_Profitability!P2:P),0)'],
    ['Gross Margin %',        '=IFERROR(SUM(Model_Profitability!N2:N)/SUM(Model_Profitability!K2:K),0)'],
    ['Net Margin %',          '=IFERROR(SUM(Model_Profitability!P2:P)/SUM(Model_Profitability!K2:K),0)'],
    ['COGS Total',            '=IFERROR(SUM(Model_Profitability!M2:M),0)'],
    ['Profit / Unit',         '=IFERROR(SUM(Model_Profitability!P2:P)/SUM(Model_Profitability!G2:G),0)'],
  ];
  writeKpiBlock(sheet, 13, profitKpis, '"$"#,##0.00', [1, 2, 5, 6]);
  // Percent format for rows 15 and 16 (gross margin, net margin)
  sheet.getRange('B15').setNumberFormat('0.0%');
  sheet.getRange('B16').setNumberFormat('0.0%');

  // ---- Section: Inventory Alerts ----
  writeSectionHeader(sheet, 'A20', 'INVENTORY ALERTS');
  sheet.getRange('A21').setValue('SKUs needing reorder:');
  sheet.getRange('A21').setFontWeight('bold');
  sheet.getRange('B21').setFormula('=IFERROR(COUNTIF(Inventory_Feed!N2:N,"YES"),0)');
  sheet.getRange('B21').setFontWeight('bold').setFontColor('#d93025').setFontSize(14);

  sheet.getRange('A22').setValue('Total fulfillable units:');
  sheet.getRange('B22').setFormula('=IFERROR(SUM(Inventory_Feed!F2:F),0)');

  sheet.getRange('A23').setValue('Total inbound units:');
  sheet.getRange('B23').setFormula('=IFERROR(SUM(Inventory_Feed!G2:G),0)');

  // ---- Section: Weekly Revenue Trend (mini table) ----
  writeSectionHeader(sheet, 'D4', 'WEEKLY REVENUE (Last 8 Weeks)');
  writeWeeklyTrendTable(sheet, 5);

  // ---- Section: Channel Mix ----
  writeSectionHeader(sheet, 'D14', 'CHANNEL MIX (Last 30 Days)');
  sheet.getRange('D15').setValue('Channel');
  sheet.getRange('E15').setValue('Revenue');
  sheet.getRange('F15').setValue('% Share');
  [['D15','E15','F15']].forEach(function(cols) {
    cols.forEach(function(c) {
      sheet.getRange(c).setFontWeight('bold').setBackground('#e8f0fe');
    });
  });
  sheet.getRange('D16').setValue('Shopify');
  sheet.getRange('E16').setFormula('=IFERROR(SUMPRODUCT((Sales_Fact!B2:B="shopify")*(DATEVALUE(Sales_Fact!A2:A)>=TODAY()-30)*Sales_Fact!K2:K),0)');
  sheet.getRange('F16').setFormula('=IFERROR(E16/(E16+E17),0)').setNumberFormat('0.0%');
  sheet.getRange('D17').setValue('Amazon');
  sheet.getRange('E17').setFormula('=IFERROR(SUMPRODUCT((Sales_Fact!B2:B="amazon")*(DATEVALUE(Sales_Fact!A2:A)>=TODAY()-30)*Sales_Fact!K2:K),0)');
  sheet.getRange('F17').setFormula('=IFERROR(E17/(E16+E17),0)').setNumberFormat('0.0%');
  sheet.getRange('E16:E17').setNumberFormat('"$"#,##0.00');

  // ---- Top SKUs ----
  writeSectionHeader(sheet, 'D20', 'TOP 10 SKUs BY REVENUE (All Time)');
  var topSkuFormula =
    '=IFERROR(QUERY(Sales_Fact!F2:K,' +
    '"SELECT F, SUM(K) WHERE F <> \'\' GROUP BY F ORDER BY SUM(K) DESC LIMIT 10 LABEL F \'SKU\', SUM(K) \'Revenue\'"' +
    '),{"SKU","Revenue";"(no data)",0})';
  sheet.getRange('D21').setFormula(topSkuFormula);

  // General formatting
  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 150);
  sheet.setColumnWidth(3, 20);
  sheet.setColumnWidth(4, 200);
  sheet.setColumnWidth(5, 150);
  sheet.setColumnWidth(6, 100);

  log('Dashboard built');
}

// ---------------------------------------------------------------------------
// Dashboard helpers
// ---------------------------------------------------------------------------

function writeSectionHeader(sheet, a1, label) {
  var range = sheet.getRange(a1);
  range.setValue(label);
  range.setFontWeight('bold').setFontColor('#ffffff').setBackground('#1a73e8')
    .setFontSize(11);
}

function writeKpiBlock(sheet, startRow, kpiPairs, defaultFormat, currencyRows) {
  kpiPairs.forEach(function(pair, i) {
    var row = startRow + i;
    sheet.getRange(row, 1).setValue(pair[0]).setFontWeight('bold');
    var valCell = sheet.getRange(row, 2);
    valCell.setFormula(pair[1]);
    if (currencyRows && currencyRows.indexOf(i + 1) !== -1) {
      valCell.setNumberFormat(defaultFormat);
    } else {
      valCell.setNumberFormat('#,##0');
    }
  });
}

/**
 * Write a mini weekly revenue table starting at given row, columns D-F.
 */
function writeWeeklyTrendTable(sheet, startRow) {
  sheet.getRange(startRow, 4).setValue('Week').setFontWeight('bold').setBackground('#e8f0fe');
  sheet.getRange(startRow, 5).setValue('Revenue').setFontWeight('bold').setBackground('#e8f0fe');
  sheet.getRange(startRow, 6).setValue('Orders').setFontWeight('bold').setBackground('#e8f0fe');

  for (var i = 0; i < 8; i++) {
    var row = startRow + 1 + i;
    var weeksBack = 7 - i; // week 7 (oldest) to week 0 (current)

    // Week label formula
    sheet.getRange(row, 4).setFormula(
      '=TEXT(TODAY()-' + (weeksBack * 7) + ',"yyyy-\\Www")'
    );

    // Revenue for that ISO week
    sheet.getRange(row, 5).setFormula(
      '=IFERROR(SUMPRODUCT((Sales_Fact!W2:W=ISOWEEKNUM(TODAY()-' + (weeksBack * 7) + '))' +
      '*(Sales_Fact!U2:U=YEAR(TODAY()-' + (weeksBack * 7) + '))' +
      '*Sales_Fact!K2:K),0)'
    ).setNumberFormat('"$"#,##0');

    // Order count
    sheet.getRange(row, 6).setFormula(
      '=IFERROR(SUMPRODUCT((Sales_Fact!W2:W=ISOWEEKNUM(TODAY()-' + (weeksBack * 7) + '))' +
      '*(Sales_Fact!U2:U=YEAR(TODAY()-' + (weeksBack * 7) + '))' +
      '*(Sales_Fact!C2:C<>"")/1),0)'
    ).setNumberFormat('#,##0');
  }
}

/**
 * Reorder tabs in the spreadsheet.
 */
function ensureTabOrder() {
  var ss = getSpreadsheet();
  TAB_ORDER.forEach(function(name, idx) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    ss.setActiveSheet(sheet);
    ss.moveActiveSheet(idx + 1);
  });
  // Move back to Dashboard
  ss.setActiveSheet(ss.getSheetByName(DASHBOARD_TAB));
}
