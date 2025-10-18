require('dotenv').config();

const { getSheetsClient, appendRows } = require('../clients/sheets');

/**
 * Sync historical monthly sales from Product Pricing sheet
 * Source: SALES tab in Product Pricing sheet (2022-2024 data)
 * Target: Historical_Sales tab in sales pipeline sheet
 */
async function syncHistorical() {
  try {
    console.log('Starting historical sales sync...');

    const sheets = getSheetsClient();
    
    // Source: Your product pricing spreadsheet
    const sourceSpreadsheetId = '1VMJjwxAoREHFamnK8jYTcMu11ZA3XMjb63kdr_hNCMs';
    
    // Get sheet names to find the SALES tab
    const metaResponse = await sheets.spreadsheets.get({
      spreadsheetId: sourceSpreadsheetId,
    });
    
    const sheetNames = metaResponse.data.sheets.map(s => s.properties.title);
    const salesSheetName = sheetNames.find(name => name.toUpperCase() === 'SALES') || sheetNames[1];
    console.log(`Reading from sheet: ${salesSheetName}`);
    
    // Read historical sales data (rows 4-15 have Jan-Dec data)
    // Columns: A=Month, B=2022 Amazon, C=2023 Amazon, D=2024 Amazon, E=2025 Units, F=ASP, G=2024 Shopify
    const sourceResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: sourceSpreadsheetId,
      range: `'${salesSheetName}'!A4:O15`, // Jan-Dec rows
    });

    const sourceRows = sourceResponse.data.values || [];
    console.log(`Found ${sourceRows.length} months of historical data`);

    // Parse historical data by month
    const monthlyData = [];
    
    for (const row of sourceRows) {
      const month = row[0] || '';
      
      // Skip if not a valid month name
      if (!month || month.includes('$') || month.length < 3) continue;
      
      // Parse each year's data
      const amazon2022 = parseFloat((row[1] || '0').toString().replace(/[$,]/g, '')) || 0;
      const amazon2023 = parseFloat((row[2] || '0').toString().replace(/[$,]/g, '')) || 0;
      const amazon2024 = parseFloat((row[3] || '0').toString().replace(/[$,]/g, '')) || 0;
      const shopify2024 = parseFloat((row[6] || '0').toString().replace(/[$,]/g, '')) || 0;
      
      // 2022 data (Amazon only - Shopify didn't exist yet)
      monthlyData.push({
        year: 2022,
        month: month.trim(),
        amazon: amazon2022,
        shopify: 0,
        total: amazon2022
      });
      
      // 2023 data (Amazon only - Shopify didn't exist yet)
      monthlyData.push({
        year: 2023,
        month: month.trim(),
        amazon: amazon2023,
        shopify: 0,
        total: amazon2023
      });
      
      // 2024 data (Amazon + Shopify)
      monthlyData.push({
        year: 2024,
        month: month.trim(),
        amazon: amazon2024,
        shopify: shopify2024,
        total: amazon2024 + shopify2024
      });
    }

    console.log(`Extracted ${monthlyData.length} month records`);

    // Target: Your sales pipeline spreadsheet
    const targetSpreadsheetId = process.env.GOOGLE_SHEET_ID;

    // Clear existing Historical_Sales data (keep headers)
    await sheets.spreadsheets.values.clear({
      spreadsheetId: targetSpreadsheetId,
      range: 'Historical_Sales!A2:E',
    });

    console.log('Cleared existing historical sales');

    // Write historical data
    const rows = monthlyData.map(item => [
      item.year,      // A: year
      item.month,     // B: month
      item.amazon,    // C: amazon_sales
      item.shopify,   // D: shopify_sales
      item.total,     // E: total_sales
    ]);

    await appendRows('Historical_Sales', rows);
    console.log(`✅ Synced ${rows.length} monthly records to Historical_Sales sheet`);

    // Display summary
    const by2024 = monthlyData.filter(m => m.year === 2024);
    const total2024 = by2024.reduce((sum, m) => sum + m.total, 0);
    
    console.log('\n📊 Historical Data Summary:');
    console.log(`  2022 Total: $${monthlyData.filter(m => m.year === 2022).reduce((s, m) => s + m.total, 0).toFixed(2)}`);
    console.log(`  2023 Total: $${monthlyData.filter(m => m.year === 2023).reduce((s, m) => s + m.total, 0).toFixed(2)}`);
    console.log(`  2024 Total: $${total2024.toFixed(2)}`);

    console.log('\nHistorical sales sync completed');
    return { updated: rows.length };

  } catch (error) {
    console.error('Error syncing historical sales:', error.message);
    throw error;
  }
}

// CLI support
if (require.main === module) {
  syncHistorical()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = syncHistorical;


