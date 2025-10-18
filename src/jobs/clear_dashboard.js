require('dotenv').config();

const { getSheetsClient } = require('../clients/sheets');

/**
 * Clear Sales_Summary dashboard completely
 */
async function clearDashboard() {
  try {
    console.log('Clearing Sales_Summary dashboard...');

    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) {
      throw new Error('GOOGLE_SHEET_ID environment variable is not set');
    }

    const sheets = getSheetsClient();

    // Clear all data in Sales_Summary
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'Sales_Summary!A1:Z',
    });

    console.log('✅ Sales_Summary cleared');
    console.log('\nNow run: npm run init:dashboard');

  } catch (error) {
    console.error('Error clearing dashboard:', error.message);
    throw error;
  }
}

// CLI support
if (require.main === module) {
  clearDashboard()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = clearDashboard;


