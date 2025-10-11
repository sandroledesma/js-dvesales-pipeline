require('dotenv').config();

const { getSheetsClient, appendRows } = require('../clients/sheets');

/**
 * Fetch model costs from Model_Costs sheet (SKU -> Cost mapping)
 * Returns a Map of SKU to cost
 */
async function getModelCosts() {
  try {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheets = getSheetsClient();
    
    // Read Model_Costs sheet (A: sku, B: model_cost)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Model_Costs!A2:B',
    });

    const rows = response.data.values || [];
    const costMap = new Map();
    
    for (const row of rows) {
      const sku = row[0] || '';
      const cost = parseFloat(row[1]) || 0;
      if (sku) {
        costMap.set(sku, cost);
      }
    }
    
    console.log(`Loaded ${costMap.size} model costs`);
    return costMap;
  } catch (error) {
    console.warn('Error loading model costs (sheet may not exist yet):', error.message);
    return new Map();
  }
}

/**
 * Read all sales data from Sales_Fact
 */
async function getSalesData() {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const sheets = getSheetsClient();
  
  // Read Sales_Fact (A:O) - includes marketplace_fees in column M
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Sales_Fact!A2:O',
  });

  return response.data.values || [];
}

/**
 * Calculate profitability for each transaction
 * Fees come directly from Sales_Fact (Amazon fees from Financial Events API, Shopify fees calculated)
 */
function calculateProfitability(salesRow, modelCosts) {
  // Parse sales data
  const date = salesRow[0] || '';
  const channel = salesRow[1] || '';
  const orderId = String(salesRow[2] || '');
  const lineId = String(salesRow[3] || '');
  const sku = salesRow[4] || '';
  const title = salesRow[5] || '';
  const qty = parseFloat(salesRow[6]) || 0;
  const itemGross = parseFloat(salesRow[7]) || 0;
  const itemDiscount = parseFloat(salesRow[8]) || 0;
  const shipping = parseFloat(salesRow[9]) || 0;
  const tax = parseFloat(salesRow[10]) || 0;
  const refund = parseFloat(salesRow[11]) || 0;
  const marketplaceFees = parseFloat(salesRow[12]) || 0; // From Sales_Fact
  const currency = salesRow[13] || 'USD';
  const region = salesRow[14] || '';

  // Get model cost
  const modelCost = modelCosts.get(sku) || 0;

  // Calculate metrics
  const revenue = itemGross - itemDiscount; // Net revenue after discounts
  const totalCost = (modelCost * qty); // Total product cost
  const grossProfit = revenue - totalCost;
  
  // Net profit accounts for marketplace fees and refunds
  // Shipping and tax are typically pass-through costs (customer pays)
  const netProfit = grossProfit - marketplaceFees - refund;
  
  // Calculate margins
  const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
  const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

  // Calculate unit economics
  const unitRevenue = qty > 0 ? revenue / qty : 0;
  const unitProfit = qty > 0 ? netProfit / qty : 0;

  return {
    date,
    channel,
    orderId,
    lineId,
    sku,
    title,
    qty,
    revenue,
    modelCost,
    totalCost,
    marketplaceFees,
    shipping,
    tax,
    refund,
    grossProfit,
    netProfit,
    grossMargin,
    netMargin,
    unitRevenue,
    unitProfit,
    currency,
    region,
  };
}

/**
 * Sync profitability data to Google Sheets
 * Reads fees directly from Sales_Fact (Amazon fees from Financial Events API)
 */
async function syncProfitability(options = {}) {
  try {
    console.log('Starting profitability sync...');

    // Load reference data
    const modelCosts = await getModelCosts();

    // Read sales data (with fees already included)
    console.log('Reading sales data with fee information...');
    const salesRows = await getSalesData();
    console.log(`Processing ${salesRows.length} sales transactions`);

    if (salesRows.length === 0) {
      console.log('No sales data to process');
      return { updated: 0 };
    }

    // Calculate profitability for each transaction
    const profitabilityData = salesRows.map(row => 
      calculateProfitability(row, modelCosts)
    );

    console.log(`Calculated profitability for ${profitabilityData.length} transactions`);

    // Clear existing data and write new data
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheets = getSheetsClient();

    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'Model_Profitability!A2:Z',
    });

    console.log('Cleared existing profitability data');

    // Write new data
    const rows = profitabilityData.map(item => [
      item.date,            // A: date
      item.channel,         // B: channel
      item.orderId,         // C: order_id
      item.lineId,          // D: line_id
      item.sku,             // E: sku
      item.title,           // F: title
      item.qty,             // G: qty
      item.revenue,         // H: revenue
      item.modelCost,       // I: model_cost (per unit)
      item.totalCost,       // J: total_cost (model_cost × qty)
      item.marketplaceFees, // K: marketplace_fees (from Amazon Financial Events or Shopify)
      item.shipping,        // L: shipping (pass-through)
      item.tax,             // M: tax (pass-through)
      item.refund,          // N: refund
      item.grossProfit,     // O: gross_profit
      item.netProfit,       // P: net_profit
      item.grossMargin,     // Q: gross_margin_%
      item.netMargin,       // R: net_margin_%
      item.unitRevenue,     // S: unit_revenue
      item.unitProfit,      // T: unit_profit
      item.currency,        // U: currency
      item.region,          // V: region
    ]);

    if (rows.length > 0) {
      await appendRows('Model_Profitability', rows);
      console.log(`✅ Updated ${rows.length} profitability records`);
    }

    // Calculate and log summary statistics
    const totalRevenue = profitabilityData.reduce((sum, item) => sum + item.revenue, 0);
    const totalNetProfit = profitabilityData.reduce((sum, item) => sum + item.netProfit, 0);
    const totalFees = profitabilityData.reduce((sum, item) => sum + item.marketplaceFees, 0);
    const avgNetMargin = totalRevenue > 0 ? (totalNetProfit / totalRevenue) * 100 : 0;

    console.log('\n📊 Profitability Summary:');
    console.log(`  Total Revenue: $${totalRevenue.toFixed(2)}`);
    console.log(`  Total Marketplace Fees: $${totalFees.toFixed(2)}`);
    console.log(`  Total Net Profit: $${totalNetProfit.toFixed(2)}`);
    console.log(`  Average Net Margin: ${avgNetMargin.toFixed(2)}%`);

    // Channel breakdown
    const byChannel = {};
    for (const item of profitabilityData) {
      if (!byChannel[item.channel]) {
        byChannel[item.channel] = { revenue: 0, profit: 0, fees: 0 };
      }
      byChannel[item.channel].revenue += item.revenue;
      byChannel[item.channel].profit += item.netProfit;
      byChannel[item.channel].fees += item.marketplaceFees;
    }

    console.log('\n📈 By Channel:');
    for (const [channel, stats] of Object.entries(byChannel)) {
      const margin = stats.revenue > 0 ? (stats.profit / stats.revenue) * 100 : 0;
      console.log(`  ${channel}:`);
      console.log(`    Revenue: $${stats.revenue.toFixed(2)}`);
      console.log(`    Fees: $${stats.fees.toFixed(2)}`);
      console.log(`    Profit: $${stats.profit.toFixed(2)} (${margin.toFixed(2)}%)`);
    }

    console.log('\nProfitability sync completed');
    return { updated: rows.length };

  } catch (error) {
    console.error('Error syncing profitability:', error.message);
    throw error;
  }
}

// CLI support
if (require.main === module) {
  syncProfitability()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = syncProfitability;
