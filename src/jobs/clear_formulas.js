require('dotenv').config();

const { getSheetsClient } = require('../clients/sheets');

/**
 * Clear formulas from columns U onwards in Sales_Fact
 * These columns should only contain actual data, not formulas
 */
async function clearFormulas() {
  try {
    console.log('Clearing formulas from Sales_Fact columns U onwards...');

    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) {
      throw new Error('GOOGLE_SHEET_ID environment variable is not set');
    }

    const sheets = getSheetsClient();

    // Clear columns U onwards (U, V, W, X, Y, Z, AA, AB, etc.)
    // This will remove any formulas that were manually added
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'Sales_Fact!U:ZZ', // Clear from column U to ZZ (covers all possible columns)
    });

    console.log('✅ Cleared formulas from Sales_Fact columns U onwards');
    console.log('These columns should now be empty until actual data is added');

  } catch (error) {
    console.error('Error clearing formulas:', error.message);
    throw error;
  }
}

// CLI support
if (require.main === module) {
  clearFormulas()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = clearFormulas;
