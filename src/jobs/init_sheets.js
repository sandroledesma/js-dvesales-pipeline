require('dotenv').config();

const { getSheetsClient } = require('../clients/sheets');

/**
 * Convert column number to spreadsheet column letter(s)
 * @param {number} num - Column number (1-based: 1=A, 27=AA, etc.)
 * @returns {string} Column letter(s)
 */
function columnToLetter(num) {
  let letter = '';
  while (num > 0) {
    const remainder = (num - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    num = Math.floor((num - 1) / 26);
  }
  return letter;
}

/**
 * Initialize Google Sheets tabs with headers
 */
async function initSheets() {
  try {
    console.log('Initializing Google Sheets...');

    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) {
      throw new Error('GOOGLE_SHEET_ID environment variable is not set');
    }

    const sheets = getSheetsClient();

    // Get existing sheets
    const metadata = await sheets.spreadsheets.get({ spreadsheetId });
    const existingSheets = metadata.data.sheets.map(s => s.properties.title);
    console.log('Existing sheets:', existingSheets.join(', '));

    // Define sheet configurations
    const sheetConfigs = [
      {
        title: 'Sales_Fact',
        headers: [
          'date',              // A
          'channel',           // B
          'order_id',          // C
          'line_id',           // D
          'sku',               // E
          'title',             // F
          'qty',               // G
          'item_gross',        // H
          'item_discount',     // I
          'shipping',          // J
          'tax',               // K
          'refund',            // L
          'fulfillment_fee',   // M - FBA/MCF fulfillment fees
          'referral_fee',      // N - Amazon referral/commission fees
          'transaction_fee',   // O - Shopify transaction/payment processing
          'storage_fee',       // P - Amazon storage fees
          'other_fees',        // Q - Miscellaneous fees
          'total_fees',        // R - Sum of all fees (M+N+O+P+Q)
          'currency',          // S
          'region',            // T
        ],
      },
      {
        title: 'Customer_Dim',
        headers: [
          'customer_id',    // A
          'email',          // B
          'name',           // C
          'phone',          // D
          'city',           // E
          'region',         // F
          'country',        // G
          'zip',            // H
          'first_seen',     // I
          'last_seen',      // J
        ],
      },
      {
        title: 'Inventory_Feed',
        headers: [
          'last_updated',        // A
          'sku',                 // B
          'fnsku',               // C
          'asin',                // D
          'product_name',        // E
          'condition',           // F
          'total_quantity',      // G
          'fulfillable_quantity',// H
          'inbound_quantity',    // I
          'reserved_quantity',   // J
          'avg_daily_sales',     // K
          'weeks_of_supply',     // L
          'reorder_date',        // M
        ],
      },
      {
        title: 'Model_Profitability',
        headers: [
          'date',              // A
          'channel',           // B
          'order_id',          // C
          'line_id',           // D
          'sku',               // E
          'title',             // F
          'qty',               // G
          'revenue',           // H
          'model_cost',        // I
          'total_cost',        // J
          'fulfillment_fee',   // K
          'referral_fee',      // L
          'transaction_fee',   // M
          'storage_fee',       // N
          'other_fees',        // O
          'total_fees',        // P
          'shipping',          // Q
          'tax',               // R
          'refund',            // S
          'gross_profit',      // T
          'net_profit',        // U
          'gross_margin_%',    // V
          'net_margin_%',      // W
          'unit_revenue',      // X
          'unit_profit',       // Y
          'currency',          // Z
          'region',            // AA
        ],
      },
      {
        title: 'Model_Costs',
        headers: [
          'sku',            // A
          'model_cost',     // B
          'notes',          // C
        ],
      },
      {
        title: 'Historical_Sales',
        headers: [
          'year',           // A
          'month',          // B
          'amazon_sales',   // C
          'shopify_sales',  // D
          'total_sales',    // E
        ],
      },
    ];

    // Create sheets and add headers
    for (const config of sheetConfigs) {
      if (!existingSheets.includes(config.title)) {
        console.log(`Creating sheet: ${config.title}`);
        
        // Create the sheet
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: config.title,
                  },
                },
              },
            ],
          },
        });

        console.log(`✅ Created sheet: ${config.title}`);
      } else {
        console.log(`Sheet already exists: ${config.title}`);
      }

      // Add headers (row 1)
      console.log(`Adding headers to ${config.title}...`);
      const lastColumn = columnToLetter(config.headers.length);
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${config.title}!A1:${lastColumn}1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [config.headers],
        },
      });

      console.log(`✅ Added headers to ${config.title}`);
    }

    console.log('\n🎉 Sheet initialization complete!');
    console.log(`View your spreadsheet: https://docs.google.com/spreadsheets/d/${spreadsheetId}`);

  } catch (error) {
    console.error('Error initializing sheets:', error.message);
    process.exit(1);
  }
}

// Run the init job
if (require.main === module) {
  initSheets();
}

module.exports = initSheets;

