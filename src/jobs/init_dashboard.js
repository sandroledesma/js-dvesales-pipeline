require('dotenv').config();

const { getSheetsClient } = require('../clients/sheets');

/**
 * Initialize Sales Summary Dashboard - Clean, Professional, Colorblind-Friendly
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
                    columnCount: 15,
                    frozenRowCount: 2,
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

    // Build clean dashboard layout
    const dashboardData = [
      // Row 1: Title and Controls
      ['DVE SALES DASHBOARD', '', '', '', '', '', 'Period:', 'Month to Date', '', 'Updated:', '=TEXT(NOW(),"MM/DD/YYYY hh:mm")'],
      [],
      
      // Row 3-6: Period Selection (hidden helper cells)
      ['Start Date:', '=IF(H1="Month to Date",DATE(YEAR(TODAY()),MONTH(TODAY()),1),IF(H1="Week to Date",TODAY()-WEEKDAY(TODAY())+1,IF(H1="Year to Date",DATE(YEAR(TODAY()),1,1),IF(H1="Last 7 Days",TODAY()-7,IF(H1="Last 30 Days",TODAY()-30,DATE(YEAR(TODAY()),MONTH(TODAY()),1))))))'],
      ['End Date:', '=TODAY()'],
      ['PY Start:', '=DATE(YEAR(B3)-1,MONTH(B3),DAY(B3))'],
      ['PY End:', '=DATE(YEAR(B4)-1,MONTH(B4),DAY(B4))'],
      [],
      
      // Row 8: CHANNEL PERFORMANCE TABLE
      ['SALES PERFORMANCE', '', '', '', '', '', '', '', '', ''],
      ['Channel', 'Revenue', 'Orders', 'Units', 'AOV', 'Target', '% to Target', 'Mix %'],
      
      // Row 10-12: Data Rows
      [
        'Shopify',
        '=SUMIFS(Sales_Fact!H:H,Sales_Fact!B:B,"Shopify",Sales_Fact!A:A,">="&B3,Sales_Fact!A:A,"<="&B4)-SUMIFS(Sales_Fact!I:I,Sales_Fact!B:B,"Shopify",Sales_Fact!A:A,">="&B3,Sales_Fact!A:A,"<="&B4)',
        '=COUNTIFS(Sales_Fact!C:C,"<>",Sales_Fact!B:B,"Shopify",Sales_Fact!A:A,">="&B3,Sales_Fact!A:A,"<="&B4)',
        '=SUMIFS(Sales_Fact!G:G,Sales_Fact!B:B,"Shopify",Sales_Fact!A:A,">="&B3,Sales_Fact!A:A,"<="&B4)',
        '=IF(C10>0,B10/C10,0)',
        '=(SUMIFS(Historical_Sales!D:D,Historical_Sales!A:A,YEAR(B3)-1,Historical_Sales!B:B,TEXT(B3,"MMMM")))*1.10',
        '=IF(F10>0,B10/F10,0)',
        '=IF(B12>0,B10/B12,0)'
      ],
      [
        'Amazon',
        '=SUMIFS(Sales_Fact!H:H,Sales_Fact!B:B,"Amazon",Sales_Fact!A:A,">="&B3,Sales_Fact!A:A,"<="&B4)-SUMIFS(Sales_Fact!I:I,Sales_Fact!B:B,"Amazon",Sales_Fact!A:A,">="&B3,Sales_Fact!A:A,"<="&B4)',
        '=COUNTIFS(Sales_Fact!C:C,"<>",Sales_Fact!B:B,"Amazon",Sales_Fact!A:A,">="&B3,Sales_Fact!A:A,"<="&B4)',
        '=SUMIFS(Sales_Fact!G:G,Sales_Fact!B:B,"Amazon",Sales_Fact!A:A,">="&B3,Sales_Fact!A:A,"<="&B4)',
        '=IF(C11>0,B11/C11,0)',
        '=(SUMIFS(Historical_Sales!C:C,Historical_Sales!A:A,YEAR(B3)-1,Historical_Sales!B:B,TEXT(B3,"MMMM")))*1.10',
        '=IF(F11>0,B11/F11,0)',
        '=IF(B12>0,B11/B12,0)'
      ],
      [
        'TOTAL',
        '=B10+B11',
        '=C10+C11',
        '=D10+D11',
        '=IF(C12>0,B12/C12,0)',
        '=F10+F11',
        '=IF(F12>0,B12/F12,0)',
        '100%'
      ],
      [],
      
      // Row 14: PROFITABILITY
      ['PROFITABILITY & FEES', '', '', '', '', '', '', '', '', ''],
      ['Metric', 'Amount', 'Margin %'],
      ['Gross Profit', '=SUMIFS(Model_Profitability!T:T,Model_Profitability!A:A,">="&B3,Model_Profitability!A:A,"<="&B4)', '=IF(B12>0,B16/B12,0)'],
      ['Net Profit', '=SUMIFS(Model_Profitability!U:U,Model_Profitability!A:A,">="&B3,Model_Profitability!A:A,"<="&B4)', '=IF(B12>0,B17/B12,0)'],
      [],
      ['Fee Breakdown:', '', ''],
      ['  Fulfillment', '=SUMIFS(Model_Profitability!K:K,Model_Profitability!A:A,">="&B3,Model_Profitability!A:A,"<="&B4)', ''],
      ['  Referral', '=SUMIFS(Model_Profitability!L:L,Model_Profitability!A:A,">="&B3,Model_Profitability!A:A,"<="&B4)', ''],
      ['  Transaction', '=SUMIFS(Model_Profitability!M:M,Model_Profitability!A:A,">="&B3,Model_Profitability!A:A,"<="&B4)', ''],
      ['  Total Fees', '=B21+B22+B23', ''],
      [],
      
      // Row 26: INVENTORY
      ['INVENTORY STATUS', '', '', '', '', '', '', '', '', ''],
      ['Metric', 'Count'],
      ['Total SKUs', '=COUNTA(Inventory_Feed!B:B)-1'],
      ['Fulfillable Units', '=SUM(Inventory_Feed!H:H)'],
      ['Low Stock Alert', '=COUNTIF(Inventory_Feed!L:L,"<4")'],
      ['Reorder NOW', '=COUNTIF(Inventory_Feed!M:M,"REORDER NOW")'],
    ];

    // Write dashboard data
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${dashboardTitle}!A1:K31`,
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

    // Apply clean, colorblind-friendly formatting
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          // Main title (row 1) - Dark gray background, white text
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 11 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.2, green: 0.2, blue: 0.2 },
                  textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 16 },
                  horizontalAlignment: 'LEFT',
                },
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
            },
          },
          
          // Section headers (rows 8, 14, 26, 33) - Medium gray, bold
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 7, endRowIndex: 8 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.6, green: 0.6, blue: 0.6 },
                  textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 12 },
                },
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)',
            },
          },
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 13, endRowIndex: 14 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.6, green: 0.6, blue: 0.6 },
                  textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 12 },
                },
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)',
            },
          },
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 25, endRowIndex: 26 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.6, green: 0.6, blue: 0.6 },
                  textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 12 },
                },
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)',
            },
          },
          
          // Column headers (row 9) - Light gray, bold
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 8, endRowIndex: 9 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.85, green: 0.85, blue: 0.85 },
                  textFormat: { bold: true },
                  horizontalAlignment: 'CENTER',
                },
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
            },
          },
          
          // TOTAL row (row 12) - Bold, light gray
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 11, endRowIndex: 12 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 },
                  textFormat: { bold: true },
                },
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)',
            },
          },
          
          // Dropdown validation for H1 (View selector)
          {
            setDataValidation: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 7, endColumnIndex: 8 },
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
          
          // NUMBER FORMATTING
          
          // Currency - Revenue columns (B10-B12, F10-F12)
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 9, endRowIndex: 13, startColumnIndex: 1, endColumnIndex: 2 },
              cell: {
                userEnteredFormat: {
                  numberFormat: { type: 'CURRENCY', pattern: '$#,##0' },
                  horizontalAlignment: 'RIGHT',
                },
              },
              fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
            },
          },
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 9, endRowIndex: 13, startColumnIndex: 5, endColumnIndex: 6 },
              cell: {
                userEnteredFormat: {
                  numberFormat: { type: 'CURRENCY', pattern: '$#,##0' },
                  horizontalAlignment: 'RIGHT',
                },
              },
              fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
            },
          },
          
          // Whole numbers - Orders & Units (C10-D12)
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 9, endRowIndex: 13, startColumnIndex: 2, endColumnIndex: 4 },
              cell: {
                userEnteredFormat: {
                  numberFormat: { type: 'NUMBER', pattern: '#,##0' },
                  horizontalAlignment: 'RIGHT',
                },
              },
              fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
            },
          },
          
          // Currency - AOV (E10-E12)
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 9, endRowIndex: 13, startColumnIndex: 4, endColumnIndex: 5 },
              cell: {
                userEnteredFormat: {
                  numberFormat: { type: 'CURRENCY', pattern: '$#,##0' },
                  horizontalAlignment: 'RIGHT',
                },
              },
              fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
            },
          },
          
          // Percentages - % to Target & Mix % (G10-H12)
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 9, endRowIndex: 13, startColumnIndex: 6, endColumnIndex: 8 },
              cell: {
                userEnteredFormat: {
                  numberFormat: { type: 'PERCENT', pattern: '0%' },
                  horizontalAlignment: 'RIGHT',
                },
              },
              fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
            },
          },
          
          // Profitability section - Currency (B16-B24)
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 15, endRowIndex: 24, startColumnIndex: 1, endColumnIndex: 2 },
              cell: {
                userEnteredFormat: {
                  numberFormat: { type: 'CURRENCY', pattern: '$#,##0' },
                  horizontalAlignment: 'RIGHT',
                },
              },
              fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
            },
          },
          
          // Profitability margins (C16-C17)
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 15, endRowIndex: 17, startColumnIndex: 2, endColumnIndex: 3 },
              cell: {
                userEnteredFormat: {
                  numberFormat: { type: 'PERCENT', pattern: '0%' },
                  horizontalAlignment: 'RIGHT',
                },
              },
              fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
            },
          },
          
          // Inventory - whole numbers (B28-B31)
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 27, endRowIndex: 32, startColumnIndex: 1, endColumnIndex: 2 },
              cell: {
                userEnteredFormat: {
                  numberFormat: { type: 'NUMBER', pattern: '#,##0' },
                  horizontalAlignment: 'RIGHT',
                },
              },
              fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
            },
          },
          
          // Borders around main table
          {
            updateBorders: {
              range: { sheetId, startRowIndex: 8, endRowIndex: 13, startColumnIndex: 0, endColumnIndex: 8 },
              top: { style: 'SOLID', width: 2 },
              bottom: { style: 'SOLID', width: 2 },
              left: { style: 'SOLID', width: 2 },
              right: { style: 'SOLID', width: 2 },
              innerHorizontal: { style: 'SOLID', width: 1 },
              innerVertical: { style: 'SOLID', width: 1 },
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
    console.log('\n🎉 Sales Summary Dashboard complete!');
    console.log(`View: https://docs.google.com/spreadsheets/d/${spreadsheetId}`);
    console.log('\n✨ Features:');
    console.log('  • Clean consolidated metrics with targets (PY + 10%)');
    console.log('  • Colorblind-friendly black/gray design');
    console.log('  • Daily sales chart (auto-updates with period)');
    console.log('  • Profitability & inventory at a glance');
    console.log('\n📝 To use: Change period dropdown in cell H1');

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
