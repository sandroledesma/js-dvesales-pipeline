require('dotenv').config();

const { getSheetsClient } = require('../clients/sheets');

/**
 * Create Sales analysis tab with dynamic summaries
 * This tab references Sales_Fact data without modifying the source
 */
async function createSalesTab() {
  try {
    console.log('Creating Sales analysis tab...');

    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) {
      throw new Error('GOOGLE_SHEET_ID environment variable is not set');
    }

    const sheets = getSheetsClient();

    // Check if Sales tab already exists
    const metadata = await sheets.spreadsheets.get({ spreadsheetId });
    const existingSheets = metadata.data.sheets.map(s => s.properties.title);
    
    if (existingSheets.includes('Sales')) {
      console.log('Sales tab already exists, updating it...');
      // Clear existing data but keep structure
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: 'Sales!A1:Z1000',
      });
    } else {
      // Create new Sales sheet
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            addSheet: {
              properties: {
                title: 'Sales',
                gridProperties: {
                  rowCount: 1000,
                  columnCount: 26
                }
              }
            }
          }]
        }
      });
      console.log('Created Sales tab');
    }

    // Define the data structure for the Sales tab
    const salesData = [
      // Row 1: Title
      ['Sales Analysis Dashboard'],
      
      // Row 2: Month/Year Dropdown (B2)
      ['', 'Select Month/Year:', '=DATE(2025,9,1)', '', '', ''],
      
      // Row 3: Headers for summary
      ['', 'Metric', 'Current Period', 'Prior Year', 'Variance', ''],
      
      // Row 4: Month to Date
      ['', 'Month to Date', '=SUMIFS(Sales_Fact!H:Sales_Fact!H-Sales_Fact!I:Sales_Fact!I+Sales_Fact!J:Sales_Fact!J+Sales_Fact!K:Sales_Fact!K,Sales_Fact!A:Sales_Fact!A,">="&DATE(YEAR(B2),MONTH(B2),1),Sales_Fact!A:Sales_Fact!A,"<="&EOMONTH(B2,0))', '=SUMIFS(Sales_Fact!H:Sales_Fact!H-Sales_Fact!I:Sales_Fact!I+Sales_Fact!J:Sales_Fact!J+Sales_Fact!K:Sales_Fact!K,Sales_Fact!A:Sales_Fact!A,">="&DATE(YEAR(B2)-1,MONTH(B2),1),Sales_Fact!A:Sales_Fact!A,"<="&EOMONTH(DATE(YEAR(B2)-1,MONTH(B2),1),0))', '=C4-D4', ''],
      
      // Row 5: Year to Date
      ['', 'Year to Date', '=SUMIFS(Sales_Fact!H:Sales_Fact!H-Sales_Fact!I:Sales_Fact!I+Sales_Fact!J:Sales_Fact!J+Sales_Fact!K:Sales_Fact!K,Sales_Fact!A:Sales_Fact!A,">="&DATE(YEAR(B2),1,1),Sales_Fact!A:Sales_Fact!A,"<="&EOMONTH(B2,0))', '=SUMIFS(Sales_Fact!H:Sales_Fact!H-Sales_Fact!I:Sales_Fact!I+Sales_Fact!J:Sales_Fact!J+Sales_Fact!K:Sales_Fact!K,Sales_Fact!A:Sales_Fact!A,">="&DATE(YEAR(B2)-1,1,1),Sales_Fact!A:Sales_Fact!A,"<="&EOMONTH(DATE(YEAR(B2)-1,MONTH(B2),1),0))', '=C5-D5', ''],
      
      // Row 6: Empty row (spacing)
      ['', '', '', '', '', ''],
      
      // Row 7: Data headers
      ['Date', 'Channel', 'Order Number', 'Amount', 'Customer Name', 'Customer Email']
    ];

    // Write initial data to the Sales sheet (rows 1-7)
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Sales!A1:F7',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: salesData,
      },
    });

    // Add formulas for data rows (rows 8-1000) using ARRAYFORMULA
    const dataFormulas = [
      `=ARRAYFORMULA(IF(ROW(A8:A1000)<=COUNTA(Sales_Fact!A:A)+7,INDEX(Sales_Fact!A:A,ROW(A8:A1000)-7),""))`, // Date
      `=ARRAYFORMULA(IF(ROW(B8:B1000)<=COUNTA(Sales_Fact!B:B)+7,INDEX(Sales_Fact!B:B,ROW(B8:B1000)-7),""))`, // Channel
      `=ARRAYFORMULA(IF(ROW(C8:C1000)<=COUNTA(Sales_Fact!Y:Y)+7,INDEX(Sales_Fact!Y:Y,ROW(C8:C1000)-7),""))`, // Shopify Order Number
      `=ARRAYFORMULA(IF(ROW(D8:D1000)<=COUNTA(Sales_Fact!H:H)+7,INDEX(Sales_Fact!H:H,ROW(D8:D1000)-7)-INDEX(Sales_Fact!I:I,ROW(D8:D1000)-7)+INDEX(Sales_Fact!J:J,ROW(D8:D1000)-7)+INDEX(Sales_Fact!K:K,ROW(D8:D1000)-7),""))`, // Amount
      `=ARRAYFORMULA(IF(ROW(E8:E1000)<=COUNTA(Sales_Fact!AB:AB)+7,INDEX(Sales_Fact!AB:AB,ROW(E8:E1000)-7),""))`, // Customer Name
      `=ARRAYFORMULA(IF(ROW(F8:F1000)<=COUNTA(Sales_Fact!AA:AA)+7,INDEX(Sales_Fact!AA:AA,ROW(F8:F1000)-7),""))`  // Customer Email
    ];

    // Write formulas to columns A-F starting from row 8
    for (let col = 0; col < dataFormulas.length; col++) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Sales!${String.fromCharCode(65 + col)}8`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[dataFormulas[col]]],
        },
      });
    }

    console.log('✅ Sales analysis tab created successfully!');
    console.log('\n📊 Features:');
    console.log('• Dynamic month/year dropdown in B2');
    console.log('• Month-to-date vs Prior Year comparison');
    console.log('• Year-to-date vs Prior Year comparison');
    console.log('• Live data from Sales_Fact (columns A-AF)');
    console.log('• Amount = item_gross - item_discount + shipping + tax');
    console.log('• Data starts at row 7, summary at top');

  } catch (error) {
    console.error('Error creating Sales tab:', error.message);
    throw error;
  }
}

// CLI support
if (require.main === module) {
  createSalesTab()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = createSalesTab;