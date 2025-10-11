require('dotenv').config();

const { getSheetsClient } = require('../clients/sheets');

/**
 * Clear all data from Sales_Fact (keep headers)
 */
async function clearSales() {
  try {
    console.log('Clearing Sales_Fact data...');

    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) {
      throw new Error('GOOGLE_SHEET_ID environment variable is not set');
    }

    const sheets = getSheetsClient();

    // Clear all data rows (keep row 1 headers)
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'Sales_Fact!A2:T',
    });

    console.log('✅ Sales_Fact data cleared (headers preserved)');
    console.log('\nNow run: npm run sync:sales -- --start=2024-01-01 --end=2024-12-31 --channels=shopify');

  } catch (error) {
    console.error('Error clearing sales:', error.message);
    throw error;
  }
}

// CLI support
if (require.main === module) {
  clearSales()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = clearSales;

