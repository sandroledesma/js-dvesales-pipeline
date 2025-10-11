require('dotenv').config();

const { getSheetsClient } = require('../clients/sheets');

/**
 * Initialize Sales Summary Dashboard with formulas
 */
async function initDashboard() {
  try {
    console.log('Initializing Sales Summary Dashboard...');

    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) {
      throw new Error('GOOGLE_SHEET_ID environment variable is not set');
    }

    const sheets = getSheetsClient();

    // Get existing sheets
    const metadata = await sheets.spreadsheets.get({ spreadsheetId });
    const existingSheets = metadata.data.sheets.map(s => s.properties.title);
    
    const dashboardTitle = 'Sales_Summary';

    // Create dashboard sheet if it doesn't exist
    if (!existingSheets.includes(dashboardTitle)) {
      console.log(`Creating ${dashboardTitle} sheet...`);
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: dashboardTitle,
                  gridProperties: {
                    rowCount: 100,
                    columnCount: 20,
                    frozenRowCount: 1,
                  },
                },
              },
            },
          ],
        },
      });
      console.log(`✅ Created ${dashboardTitle}`);
    } else {
      console.log(`${dashboardTitle} already exists`);
    }

    // Build dashboard layout with formulas
    const dashboardData = [
      // Row 1: Title and Date Range Selector
      ['SALES SUMMARY DASHBOARD', '', '', 'View:', 'Month to Date', '', '', '', '', 'Last Updated:', '=NOW()'],
      [],
      
      // Row 3-4: Period Selection Helper (hidden formulas)
      ['Period Start:', '=IF(E1="Month to Date",DATE(YEAR(TODAY()),MONTH(TODAY()),1),IF(E1="Week to Date",TODAY()-WEEKDAY(TODAY())+1,IF(E1="Year to Date",DATE(YEAR(TODAY()),1,1),IF(E1="Last 7 Days",TODAY()-7,IF(E1="Last 30 Days",TODAY()-30,DATE(YEAR(TODAY()),MONTH(TODAY()),1))))))'],
      ['Period End:', '=TODAY()'],
      [],
      
      // Row 6: SALES METRICS HEADER
      ['📊 SALES METRICS', '', '', '', '', '', '', '', '', ''],
      ['Metric', 'Value', '', 'Target', 'vs Target'],
      
      // Row 8-13: Sales Metrics with formulas (clean dates, no INT needed)
      ['Total Revenue', '=SUMIFS(Sales_Fact!H:H,Sales_Fact!A:A,">="&B3,Sales_Fact!A:A,"<="&B4)-SUMIFS(Sales_Fact!I:I,Sales_Fact!A:A,">="&B3,Sales_Fact!A:A,"<="&B4)', '', '=IFERROR(VLOOKUP(TEXT(B3,"MMMM"),Sales_Targets!A:G,7,FALSE),0)', '=IFERROR(B8/D8,0)'],
      ['Total Orders', '=COUNTIFS(Sales_Fact!C:C,"<>",Sales_Fact!A:A,">="&B3,Sales_Fact!A:A,"<="&B4)', '', '', ''],
      ['Total Units', '=SUMIFS(Sales_Fact!G:G,Sales_Fact!A:A,">="&B3,Sales_Fact!A:A,"<="&B4)', '', '', ''],
      ['Avg Order Value', '=IF(B9>0,B8/B9,0)', '', '', ''],
      ['Total Fees', '=SUMIFS(Sales_Fact!R:R,Sales_Fact!A:A,">="&B3,Sales_Fact!A:A,"<="&B4)', '', '', ''],
      [],
      
      // Row 14: CHANNEL BREAKDOWN (simplified)
      ['📈 BY CHANNEL', '', '', '', ''],
      ['Channel', 'Revenue', 'Orders', 'Avg Order', '% of Total'],
      ['Shopify', '=SUMIFS(Sales_Fact!H:H,Sales_Fact!B:B,"Shopify",Sales_Fact!A:A,">="&B3,Sales_Fact!A:A,"<="&B4)-SUMIFS(Sales_Fact!I:I,Sales_Fact!B:B,"Shopify",Sales_Fact!A:A,">="&B3,Sales_Fact!A:A,"<="&B4)', '=COUNTIFS(Sales_Fact!C:C,"<>",Sales_Fact!B:B,"Shopify",Sales_Fact!A:A,">="&B3,Sales_Fact!A:A,"<="&B4)', '=IF(C17>0,B17/C17,0)', '=IF(B8>0,B17/B8,0)'],
      ['Amazon', '=SUMIFS(Sales_Fact!H:H,Sales_Fact!B:B,"Amazon",Sales_Fact!A:A,">="&B3,Sales_Fact!A:A,"<="&B4)-SUMIFS(Sales_Fact!I:I,Sales_Fact!B:B,"Amazon",Sales_Fact!A:A,">="&B3,Sales_Fact!A:A,"<="&B4)', '=COUNTIFS(Sales_Fact!C:C,"<>",Sales_Fact!B:B,"Amazon",Sales_Fact!A:A,">="&B3,Sales_Fact!A:A,"<="&B4)', '=IF(C18>0,B18/C18,0)', '=IF(B8>0,B18/B8,0)'],
      [],
      
      // Row 20: TOP PRODUCTS
      ['🏆 TOP 5 PRODUCTS', '', '', '', ''],
      ['SKU', 'Product', 'Units Sold', 'Revenue'],
      ['Coming Soon...', '', '', ''],
      [],
      
      // Row 24: PROFITABILITY SUMMARY (clean dates, no INT needed)
      ['💰 PROFITABILITY', '', '', '', ''],
      ['Metric', 'Value', '', 'Margin %'],
      ['Gross Profit', '=IF(COUNTIFS(Model_Profitability!A:A,">="&B3,Model_Profitability!A:A,"<="&B4)>0,SUMIFS(Model_Profitability!T:T,Model_Profitability!A:A,">="&B3,Model_Profitability!A:A,"<="&B4),0)', '', '=IF(B8>0,B26/B8*100,0)'],
      ['Net Profit', '=IF(COUNTIFS(Model_Profitability!A:A,">="&B3,Model_Profitability!A:A,"<="&B4)>0,SUMIFS(Model_Profitability!U:U,Model_Profitability!A:A,">="&B3,Model_Profitability!A:A,"<="&B4),0)', '', '=IF(B8>0,B27/B8*100,0)'],
      ['Total Fulfillment Fees', '=IF(COUNTIFS(Model_Profitability!A:A,">="&B3,Model_Profitability!A:A,"<="&B4)>0,SUMIFS(Model_Profitability!K:K,Model_Profitability!A:A,">="&B3,Model_Profitability!A:A,"<="&B4),0)', '', ''],
      ['Total Referral Fees', '=IF(COUNTIFS(Model_Profitability!A:A,">="&B3,Model_Profitability!A:A,"<="&B4)>0,SUMIFS(Model_Profitability!L:L,Model_Profitability!A:A,">="&B3,Model_Profitability!A:A,"<="&B4),0)', '', ''],
      ['Total Transaction Fees', '=IF(COUNTIFS(Model_Profitability!A:A,">="&B3,Model_Profitability!A:A,"<="&B4)>0,SUMIFS(Model_Profitability!M:M,Model_Profitability!A:A,">="&B3,Model_Profitability!A:A,"<="&B4),0)', '', ''],
      [],
      
      // Row 32: INVENTORY STATUS
      ['📦 INVENTORY STATUS', '', '', '', ''],
      ['Status', 'SKU Count', 'Total Units', 'Value'],
      ['Total Inventory', '=COUNTA(Inventory_Feed!B:B)-1', '=SUM(Inventory_Feed!H:H)', ''],
      ['Low Stock (< 4 weeks)', '=COUNTIF(Inventory_Feed!L:L,"<4")', '', ''],
      ['Reorder Now', '=COUNTIF(Inventory_Feed!M:M,"REORDER NOW")', '', ''],
      ['Adequate Stock', '=COUNTIF(Inventory_Feed!L:L,">=4")', '', ''],
      [],
      
      // Row 39: INSTRUCTIONS
      ['ℹ️ HOW TO USE', '', '', '', ''],
      ['1. Change the view in cell E1 (dropdown: Month to Date, Week to Date, Year to Date, Last 7 Days, Last 30 Days)', '', '', '', ''],
      ['2. All metrics update automatically based on the selected view', '', '', '', ''],
      ['3. Refresh by running: npm run sync:sales, npm run sync:profitability, npm run sync:inventory', '', '', '', ''],
    ];

    // Write dashboard data
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${dashboardTitle}!A1:K42`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: dashboardData,
      },
    });

    console.log('✅ Dashboard layout created');

    // Get the sheet ID for formatting
    const sheet = metadata.data.sheets.find(s => s.properties.title === dashboardTitle) ||
                  (await sheets.spreadsheets.get({ spreadsheetId })).data.sheets.find(s => s.properties.title === dashboardTitle);
    const sheetId = sheet.properties.sheetId;

    // Apply formatting
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          // Header row formatting (row 1)
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 11 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.2, green: 0.4, blue: 0.8 },
                  textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 14 },
                  horizontalAlignment: 'LEFT',
                },
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
            },
          },
          // Section headers (rows 6, 14, 20, 24, 32, 39)
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 5, endRowIndex: 6 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 },
                  textFormat: { bold: true, fontSize: 12 },
                },
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)',
            },
          },
          // Data validation for E1 (View selector)
          {
            setDataValidation: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 4, endColumnIndex: 5 },
              rule: {
                condition: {
                  type: 'ONE_OF_LIST',
                  values: [
                    { userEnteredValue: 'Month to Date' },
                    { userEnteredValue: 'Week to Date' },
                    { userEnteredValue: 'Year to Date' },
                    { userEnteredValue: 'Last 7 Days' },
                    { userEnteredValue: 'Last 30 Days' },
                  ],
                },
                showCustomUi: true,
              },
            },
          },
          // Currency formatting for revenue/profit/fees (column B and D in metrics sections)
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 7, endRowIndex: 13, startColumnIndex: 1, endColumnIndex: 2 },
              cell: {
                userEnteredFormat: {
                  numberFormat: { type: 'CURRENCY', pattern: '$#,##0' },
                },
              },
              fields: 'userEnteredFormat.numberFormat',
            },
          },
          // Currency formatting for targets (column D)
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 7, endRowIndex: 8, startColumnIndex: 3, endColumnIndex: 4 },
              cell: {
                userEnteredFormat: {
                  numberFormat: { type: 'CURRENCY', pattern: '$#,##0' },
                },
              },
              fields: 'userEnteredFormat.numberFormat',
            },
          },
          // Whole number formatting for orders and units (rows 9-10, column B)
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 8, endRowIndex: 10, startColumnIndex: 1, endColumnIndex: 2 },
              cell: {
                userEnteredFormat: {
                  numberFormat: { type: 'NUMBER', pattern: '#,##0' },
                },
              },
              fields: 'userEnteredFormat.numberFormat',
            },
          },
          // Currency for channel revenue (column B, rows 17-18)
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 16, endRowIndex: 18, startColumnIndex: 1, endColumnIndex: 2 },
              cell: {
                userEnteredFormat: {
                  numberFormat: { type: 'CURRENCY', pattern: '$#,##0' },
                },
              },
              fields: 'userEnteredFormat.numberFormat',
            },
          },
          // Whole numbers for channel orders (column C, rows 17-18)
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 16, endRowIndex: 18, startColumnIndex: 2, endColumnIndex: 3 },
              cell: {
                userEnteredFormat: {
                  numberFormat: { type: 'NUMBER', pattern: '#,##0' },
                },
              },
              fields: 'userEnteredFormat.numberFormat',
            },
          },
          // Currency for avg order (column D, rows 17-18)
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 16, endRowIndex: 18, startColumnIndex: 3, endColumnIndex: 4 },
              cell: {
                userEnteredFormat: {
                  numberFormat: { type: 'CURRENCY', pattern: '$#,##0' },
                },
              },
              fields: 'userEnteredFormat.numberFormat',
            },
          },
          // Percentage formatting for channel % (column E, rows 17-18)
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 16, endRowIndex: 18, startColumnIndex: 4, endColumnIndex: 5 },
              cell: {
                userEnteredFormat: {
                  numberFormat: { type: 'PERCENT', pattern: '0.0%' },
                },
              },
              fields: 'userEnteredFormat.numberFormat',
            },
          },
          // Currency for profitability section (column B, rows 26-30)
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 25, endRowIndex: 31, startColumnIndex: 1, endColumnIndex: 2 },
              cell: {
                userEnteredFormat: {
                  numberFormat: { type: 'CURRENCY', pattern: '$#,##0' },
                },
              },
              fields: 'userEnteredFormat.numberFormat',
            },
          },
          // Percentage for profitability margins (column D, rows 26-27)
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 25, endRowIndex: 27, startColumnIndex: 3, endColumnIndex: 4 },
              cell: {
                userEnteredFormat: {
                  numberFormat: { type: 'PERCENT', pattern: '0.0%' },
                },
              },
              fields: 'userEnteredFormat.numberFormat',
            },
          },
          // Whole numbers for inventory (column B-C, rows 34-37)
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 33, endRowIndex: 37, startColumnIndex: 1, endColumnIndex: 3 },
              cell: {
                userEnteredFormat: {
                  numberFormat: { type: 'NUMBER', pattern: '#,##0' },
                },
              },
              fields: 'userEnteredFormat.numberFormat',
            },
          },
          // Percentage formatting for vs Target (column E, row 8)
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 7, endRowIndex: 8, startColumnIndex: 4, endColumnIndex: 5 },
              cell: {
                userEnteredFormat: {
                  numberFormat: { type: 'PERCENT', pattern: '0.0%' },
                },
              },
              fields: 'userEnteredFormat.numberFormat',
            },
          },
          // Auto-resize columns
          {
            autoResizeDimensions: {
              dimensions: {
                sheetId,
                dimension: 'COLUMNS',
                startIndex: 0,
                endIndex: 11,
              },
            },
          },
        ],
      },
    });

    console.log('✅ Dashboard formatting applied');
    console.log('\n🎉 Sales Summary Dashboard initialized!');
    console.log(`View your dashboard: https://docs.google.com/spreadsheets/d/${spreadsheetId}`);
    console.log('\nTo use: Change the view dropdown in cell E1');

  } catch (error) {
    console.error('Error initializing dashboard:', error.message);
    throw error;
  }
}

// CLI support
if (require.main === module) {
  initDashboard()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = initDashboard;

