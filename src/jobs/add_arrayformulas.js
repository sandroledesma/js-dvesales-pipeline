require('dotenv').config();

const { getSheetsClient } = require('../clients/sheets');

/**
 * Add ARRAYFORMULA to Sales_Fact for calculated columns
 */
async function addArrayFormulas() {
  try {
    console.log('Adding ARRAYFORMULA to Sales_Fact...');

    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) {
      throw new Error('GOOGLE_SHEET_ID environment variable is not set');
    }

    const sheets = getSheetsClient();

    // Clear column R (total_fees) first - we'll replace with arrayformula
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'Sales_Fact!R2:R',
    });

    console.log('Cleared existing total_fees column');

    // Add ARRAYFORMULA in R2 that only calculates for rows with data
    // Formula: =ARRAYFORMULA(IF(A2:A="","",IF(ROW(A2:A)>COUNTA(A2:A)+1,"",M2:M+N2:N+O2:O+P2:P+Q2:Q)))
    // This sums: fulfillment_fee + referral_fee + transaction_fee + storage_fee + other_fees
    // Only calculates for rows that have data in column A
    const arrayFormula = '=ARRAYFORMULA(IF(A2:A="","",IF(ROW(A2:A)>COUNTA(A2:A)+1,"",M2:M+N2:N+O2:O+P2:P+Q2:Q)))';
    
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Sales_Fact!R2',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[arrayFormula]],
      },
    });

    console.log('✅ Added ARRAYFORMULA to total_fees column (R)');
    console.log('Formula: =ARRAYFORMULA(IF(A2:A="","",IF(ROW(A2:A)>COUNTA(A2:A)+1,"",M2:M+N2:N+O2:O+P2:P+Q2:Q)))');
    console.log('\nThis will automatically calculate total_fees only for rows with data!');

  } catch (error) {
    console.error('Error adding arrayformulas:', error.message);
    throw error;
  }
}

// CLI support
if (require.main === module) {
  addArrayFormulas()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = addArrayFormulas;

