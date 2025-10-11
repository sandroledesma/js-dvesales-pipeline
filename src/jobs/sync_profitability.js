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
  
  // Read Sales_Fact (A:T) - includes fee breakdown columns
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Sales_Fact!A2:T',
  });

  return response.data.values || [];
}

/**
 * Calculate profitability for each transaction
 * Fees come directly from Sales_Fact with detailed breakdown
 */
function calculateProfitability(salesRow, modelCosts) {
  // Parse sales data (updated column positions)
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
  
  // Fee breakdown from Sales_Fact
  const fulfillmentFee = parseFloat(salesRow[12]) || 0;   // M
  const referralFee = parseFloat(salesRow[13]) || 0;      // N
  const transactionFee = parseFloat(salesRow[14]) || 0;   // O
  const storageFee = parseFloat(salesRow[15]) || 0;       // P
  const otherFees = parseFloat(salesRow[16]) || 0;        // Q
  const totalFees = parseFloat(salesRow[17]) || 0;        // R
  
  const currency = salesRow[18] || 'USD';                  // S
  const region = salesRow[19] || '';                       // T

  // Get model cost
  const modelCost = modelCosts.get(sku) || 0;

  // Calculate metrics
  const revenue = itemGross - itemDiscount; // Net revenue after discounts
  const totalCost = (modelCost * qty); // Total product cost
  const grossProfit = revenue - totalCost;
  
  // Net profit accounts for all fees and refunds
  // Shipping and tax are typically pass-through costs (customer pays)
  const netProfit = grossProfit - totalFees - refund;
  
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
    fulfillmentFee,
    referralFee,
    transactionFee,
    storageFee,
    otherFees,
    totalFees,
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

    // Write new data with formulas
    const rows = profitabilityData.map((item, index) => {
      const rowNum = index + 2; // +2 because of header row and 1-based indexing
      return [
        item.date,            // A: date
        item.channel,         // B: channel
        item.orderId,         // C: order_id
        item.lineId,          // D: line_id
        item.sku,             // E: sku
        item.title,           // F: title
        item.qty,             // G: qty
        item.revenue,         // H: revenue
        item.modelCost,       // I: model_cost (per unit)
        `=I${rowNum}*G${rowNum}`, // J: total_cost = model_cost × qty
        item.fulfillmentFee,  // K: fulfillment_fee
        item.referralFee,     // L: referral_fee
        item.transactionFee,  // M: transaction_fee
        item.storageFee,      // N: storage_fee
        item.otherFees,       // O: other_fees
        `=K${rowNum}+L${rowNum}+M${rowNum}+N${rowNum}+O${rowNum}`, // P: total_fees
        item.shipping,        // Q: shipping (pass-through)
        item.tax,             // R: tax (pass-through)
        item.refund,          // S: refund
        `=H${rowNum}-J${rowNum}`, // T: gross_profit = revenue - total_cost
        `=T${rowNum}-P${rowNum}-S${rowNum}`, // U: net_profit = gross_profit - total_fees - refund
        `=IF(H${rowNum}>0,T${rowNum}/H${rowNum}*100,0)`, // V: gross_margin_%
        `=IF(H${rowNum}>0,U${rowNum}/H${rowNum}*100,0)`, // W: net_margin_%
        `=IF(G${rowNum}>0,H${rowNum}/G${rowNum},0)`, // X: unit_revenue
        `=IF(G${rowNum}>0,U${rowNum}/G${rowNum},0)`, // Y: unit_profit
        item.currency,        // Z: currency
        item.region,          // AA: region
      ];
    });

    if (rows.length > 0) {
      await appendRows('Model_Profitability', rows);
      console.log(`✅ Updated ${rows.length} profitability records`);
    }

    // Calculate and log summary statistics
    const totalRevenue = profitabilityData.reduce((sum, item) => sum + item.revenue, 0);
    const totalNetProfit = profitabilityData.reduce((sum, item) => sum + item.netProfit, 0);
    const totalFulfillmentFees = profitabilityData.reduce((sum, item) => sum + item.fulfillmentFee, 0);
    const totalReferralFees = profitabilityData.reduce((sum, item) => sum + item.referralFee, 0);
    const totalTransactionFees = profitabilityData.reduce((sum, item) => sum + item.transactionFee, 0);
    const totalStorageFees = profitabilityData.reduce((sum, item) => sum + item.storageFee, 0);
    const totalOtherFees = profitabilityData.reduce((sum, item) => sum + item.otherFees, 0);
    const totalAllFees = profitabilityData.reduce((sum, item) => sum + item.totalFees, 0);
    const avgNetMargin = totalRevenue > 0 ? (totalNetProfit / totalRevenue) * 100 : 0;

    console.log('\n📊 Profitability Summary:');
    console.log(`  Total Revenue: $${totalRevenue.toFixed(2)}`);
    console.log(`  Total Net Profit: $${totalNetProfit.toFixed(2)}`);
    console.log(`  Average Net Margin: ${avgNetMargin.toFixed(2)}%`);
    
    console.log('\n💰 Fee Breakdown:');
    console.log(`  Fulfillment Fees: $${totalFulfillmentFees.toFixed(2)}`);
    console.log(`  Referral Fees: $${totalReferralFees.toFixed(2)}`);
    console.log(`  Transaction Fees: $${totalTransactionFees.toFixed(2)}`);
    console.log(`  Storage Fees: $${totalStorageFees.toFixed(2)}`);
    console.log(`  Other Fees: $${totalOtherFees.toFixed(2)}`);
    console.log(`  Total Fees: $${totalAllFees.toFixed(2)}`);

    // Channel breakdown
    const byChannel = {};
    for (const item of profitabilityData) {
      if (!byChannel[item.channel]) {
        byChannel[item.channel] = { 
          revenue: 0, 
          profit: 0, 
          fulfillmentFee: 0,
          referralFee: 0,
          transactionFee: 0,
          storageFee: 0,
          otherFees: 0,
          totalFees: 0
        };
      }
      byChannel[item.channel].revenue += item.revenue;
      byChannel[item.channel].profit += item.netProfit;
      byChannel[item.channel].fulfillmentFee += item.fulfillmentFee;
      byChannel[item.channel].referralFee += item.referralFee;
      byChannel[item.channel].transactionFee += item.transactionFee;
      byChannel[item.channel].storageFee += item.storageFee;
      byChannel[item.channel].otherFees += item.otherFees;
      byChannel[item.channel].totalFees += item.totalFees;
    }

    console.log('\n📈 By Channel:');
    for (const [channel, stats] of Object.entries(byChannel)) {
      const margin = stats.revenue > 0 ? (stats.profit / stats.revenue) * 100 : 0;
      console.log(`  ${channel}:`);
      console.log(`    Revenue: $${stats.revenue.toFixed(2)}`);
      console.log(`    Total Fees: $${stats.totalFees.toFixed(2)}`);
      console.log(`      - Fulfillment: $${stats.fulfillmentFee.toFixed(2)}`);
      console.log(`      - Referral: $${stats.referralFee.toFixed(2)}`);
      console.log(`      - Transaction: $${stats.transactionFee.toFixed(2)}`);
      console.log(`      - Storage: $${stats.storageFee.toFixed(2)}`);
      console.log(`      - Other: $${stats.otherFees.toFixed(2)}`);
      console.log(`    Net Profit: $${stats.profit.toFixed(2)} (${margin.toFixed(2)}%)`);
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
