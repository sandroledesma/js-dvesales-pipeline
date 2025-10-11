require('dotenv').config();

const { getSheetsClient, appendRows } = require('../clients/sheets');

/**
 * Sync historical sales and create 2025 targets (10% growth vs PY)
 * Source: SALES tab in Product Pricing sheet
 * Target: Sales_Targets tab in sales pipeline sheet
 */
async function syncTargets() {
  try {
    console.log('Starting targets sync from historical sales data...');

    const sheets = getSheetsClient();
    
    // Source: Your product pricing spreadsheet
    const sourceSpreadsheetId = '1VMJjwxAoREHFamnK8jYTcMu11ZA3XMjb63kdr_hNCMs';
    
    // Get sheet names to find the SALES tab
    const metaResponse = await sheets.spreadsheets.get({
      spreadsheetId: sourceSpreadsheetId,
    });
    
    const sheetNames = metaResponse.data.sheets.map(s => s.properties.title);
    console.log(`Available sheets: ${sheetNames.join(', ')}`);
    
    const salesSheetName = sheetNames.find(name => name.toUpperCase() === 'SALES') || sheetNames[1]; // Try to find SALES tab
    console.log(`Reading from sheet: ${salesSheetName}`);
    
    // Read historical sales data (2024 Amazon + Shopify data)
    // Based on your sheet structure: Column A=Month, D=2024 Amazon, H=2024 Shopify
    const sourceResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: sourceSpreadsheetId,
      range: `'${salesSheetName}'!A4:O15`, // Rows 4-15 (Jan-Dec plus total)
    });

    const sourceRows = sourceResponse.data.values || [];
    console.log(`Found ${sourceRows.length} months of historical data`);

    // Parse 2024 data and create 2025 targets (10% growth)
    const monthlyTargets = [];
    
    for (const row of sourceRows) {
      const month = row[0] || '';
      
      // Skip if not a month name or is a total row
      if (!month || month.includes('$') || month.length < 3) continue;
      
      // Get 2024 actuals (Amazon in column D, Shopify in column G)
      const amazon2024 = row[3] || '0'; // Column D
      const shopify2024 = row[6] || '0'; // Column G
      
      // Clean currency values
      const cleanAmazon = typeof amazon2024 === 'string' ? parseFloat(amazon2024.replace(/[$,]/g, '')) || 0 : parseFloat(amazon2024) || 0;
      const cleanShopify = typeof shopify2024 === 'string' ? parseFloat(shopify2024.replace(/[$,]/g, '')) || 0 : parseFloat(shopify2024) || 0;
      
      const total2024 = cleanAmazon + cleanShopify;
      
      // Calculate 2025 targets (10% growth)
      const amazonTarget = cleanAmazon * 1.10;
      const shopifyTarget = cleanShopify * 1.10;
      const totalTarget = total2024 * 1.10;
      
      monthlyTargets.push({
        month: month.trim(),
        amazon2024: cleanAmazon,
        shopify2024: cleanShopify,
        total2024: total2024,
        amazonTarget: amazonTarget,
        shopifyTarget: shopifyTarget,
        totalTarget: totalTarget,
      });
    }

    console.log(`Extracted ${monthlyTargets.length} months of targets`);

    if (monthlyTargets.length === 0) {
      console.log('No target data to sync');
      return { updated: 0 };
    }

    // Target: Your sales pipeline spreadsheet
    const targetSpreadsheetId = process.env.GOOGLE_SHEET_ID;

    // Clear existing Sales_Targets data (keep headers)
    await sheets.spreadsheets.values.clear({
      spreadsheetId: targetSpreadsheetId,
      range: 'Sales_Targets!A2:H',
    });

    console.log('Cleared existing targets');

    // Write new data to Sales_Targets
    const rows = monthlyTargets.map(item => [
      item.month,           // A: month
      item.amazon2024,      // B: amazon_2024_actual
      item.shopify2024,     // C: shopify_2024_actual
      item.total2024,       // D: total_2024_actual
      item.amazonTarget,    // E: amazon_2025_target
      item.shopifyTarget,   // F: shopify_2025_target
      item.totalTarget,     // G: total_2025_target
      '10%',                // H: growth_rate
    ]);

    await appendRows('Sales_Targets', rows);
    console.log(`✅ Synced ${rows.length} monthly targets to Sales_Targets sheet`);

    // Calculate annual totals
    const totalAmazon2024 = monthlyTargets.reduce((sum, m) => sum + m.amazon2024, 0);
    const totalShopify2024 = monthlyTargets.reduce((sum, m) => sum + m.shopify2024, 0);
    const totalAll2024 = monthlyTargets.reduce((sum, m) => sum + m.total2024, 0);
    const totalAmazonTarget = monthlyTargets.reduce((sum, m) => sum + m.amazonTarget, 0);
    const totalShopifyTarget = monthlyTargets.reduce((sum, m) => sum + m.shopifyTarget, 0);
    const totalAllTarget = monthlyTargets.reduce((sum, m) => sum + m.totalTarget, 0);

    // Display summary
    console.log('\n📊 2024 Actuals vs 2025 Targets:');
    console.log(`  Amazon:  $${totalAmazon2024.toFixed(2)} → $${totalAmazonTarget.toFixed(2)} (+10%)`);
    console.log(`  Shopify: $${totalShopify2024.toFixed(2)} → $${totalShopifyTarget.toFixed(2)} (+10%)`);
    console.log(`  Total:   $${totalAll2024.toFixed(2)} → $${totalAllTarget.toFixed(2)} (+10%)`);

    console.log('\nTargets sync completed');
    return { updated: rows.length };

  } catch (error) {
    console.error('Error syncing targets:', error.message);
    throw error;
  }
}

// CLI support
if (require.main === module) {
  syncTargets()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = syncTargets;

