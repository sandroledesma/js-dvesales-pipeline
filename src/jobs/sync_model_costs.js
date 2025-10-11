require('dotenv').config();

const { getSheetsClient, appendRows } = require('../clients/sheets');

/**
 * Sync model costs from your Product Pricing sheet to Model_Costs
 * Source: DVE Product Pricing and Specs_2025 sheet
 * Target: Model_Costs tab in your sales pipeline sheet
 */
async function syncModelCosts() {
  try {
    console.log('Starting model costs sync from Product Pricing sheet...');

    const sheets = getSheetsClient();
    
    // Source: Your product pricing spreadsheet
    const sourceSpreadsheetId = '1VMJjwxAoREHFamnK8jYTcMu11ZA3XMjb63kdr_hNCMs';
    
    // First, let's get the sheet metadata to find the correct tab name
    const metaResponse = await sheets.spreadsheets.get({
      spreadsheetId: sourceSpreadsheetId,
    });
    
    const sheetNames = metaResponse.data.sheets.map(s => s.properties.title);
    console.log(`Available sheets: ${sheetNames.join(', ')}`);
    
    // Use the first sheet (or find the one that matches)
    const firstSheetName = sheetNames[0];
    console.log(`Reading from sheet: ${firstSheetName}`);
    
    // Read product data - using a larger range to be safe
    // Column B: Model Number, Column D: Cost
    const sourceResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: sourceSpreadsheetId,
      range: `'${firstSheetName}'!B:D`, // Read all rows, columns B-D
    });

    const sourceRows = sourceResponse.data.values || [];
    console.log(`Found ${sourceRows.length} total rows in source sheet`);

    // Extract model costs (Model Number in col B, Cost in col D)
    // Skip header rows and look for rows with valid model numbers starting with "DVE"
    const modelCosts = [];
    for (let i = 0; i < sourceRows.length; i++) {
      const row = sourceRows[i];
      const modelNumber = row[0] || ''; // Column B
      const productName = row[1] || ''; // Column C
      const cost = row[2] || '';         // Column D
      
      // Skip header rows or empty rows
      if (!modelNumber || modelNumber === 'Model Number') continue;
      
      // Only process rows that look like model numbers (start with DVE)
      if (!modelNumber.trim().startsWith('DVE')) continue;
      
      // Skip if no cost
      if (!cost) continue;
      
      // Clean cost (remove $ and convert to number)
      const cleanCost = typeof cost === 'string' ? cost.replace(/[$,]/g, '') : cost;
      
      // Skip if cost is not a valid number
      if (isNaN(parseFloat(cleanCost))) continue;
      
      console.log(`  Found: ${modelNumber.trim()} = $${cleanCost} (${productName})`);
      
      modelCosts.push({
        modelNumber: modelNumber.trim(),
        cost: parseFloat(cleanCost),
        productName: productName.trim()
      });
    }

    console.log(`Extracted ${modelCosts.length} valid model costs`);

    if (modelCosts.length === 0) {
      console.log('No model costs to sync');
      return { updated: 0 };
    }

    // Target: Your sales pipeline spreadsheet
    const targetSpreadsheetId = process.env.GOOGLE_SHEET_ID;

    // Clear existing Model_Costs data (keep headers)
    await sheets.spreadsheets.values.clear({
      spreadsheetId: targetSpreadsheetId,
      range: 'Model_Costs!A2:C',
    });

    console.log('Cleared existing model costs');

    // Write new data to Model_Costs
    const rows = modelCosts.map(item => [
      item.modelNumber,  // A: sku (model number)
      item.cost,         // B: model_cost
      item.productName   // C: notes (product name)
    ]);

    await appendRows('Model_Costs', rows);
    console.log(`✅ Synced ${rows.length} model costs to Model_Costs sheet`);

    // Display summary
    console.log('\n📦 Model Costs Summary:');
    for (const item of modelCosts) {
      console.log(`  ${item.modelNumber}: $${item.cost.toFixed(2)} - ${item.productName}`);
    }

    console.log('\nModel costs sync completed');
    return { updated: rows.length };

  } catch (error) {
    console.error('Error syncing model costs:', error.message);
    throw error;
  }
}

// CLI support
if (require.main === module) {
  syncModelCosts()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = syncModelCosts;

