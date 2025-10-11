require('dotenv').config();

const { getAmazonInventory } = require('../clients/amazon');
const { appendRows, getSheetsClient } = require('../clients/sheets');

/**
 * Calculate sales velocity (avg units sold per day over the last N days)
 */
async function calculateSalesVelocity(sku, lookbackDays = 30) {
  try {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheets = getSheetsClient();
    
    // Read Sales_Fact data (A: date, E: sku, G: qty)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sales_Fact!A2:G',
    });

    const rows = response.data.values || [];
    
    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);
    
    // Filter and sum quantities for this SKU
    let totalQty = 0;
    let count = 0;
    
    for (const row of rows) {
      const date = new Date(row[0]);
      const rowSku = row[4] || '';
      const qty = parseFloat(row[6]) || 0;
      
      if (rowSku === sku && date >= cutoffDate) {
        totalQty += qty;
        count++;
      }
    }
    
    // Calculate average daily sales
    const avgDailySales = lookbackDays > 0 ? totalQty / lookbackDays : 0;
    
    return avgDailySales;
  } catch (error) {
    console.warn(`Error calculating velocity for SKU ${sku}:`, error.message);
    return 0;
  }
}

/**
 * Calculate weeks of supply and reorder date
 */
function calculateInventoryMetrics(inventoryQty, avgDailySales, safetyStock = 7, leadTimeDays = 14) {
  // Weeks of supply = inventory / (avg daily sales * 7)
  const weeksOfSupply = avgDailySales > 0 
    ? inventoryQty / (avgDailySales * 7) 
    : 999; // essentially infinite if no sales

  // Reorder point = (avg daily sales * lead time) + safety stock days
  const reorderPoint = (avgDailySales * leadTimeDays) + (avgDailySales * safetyStock);
  
  // Days until reorder = (current inventory - reorder point) / avg daily sales
  const daysUntilReorder = avgDailySales > 0
    ? (inventoryQty - reorderPoint) / avgDailySales
    : 999;
  
  // Reorder date
  let reorderDate = '';
  if (daysUntilReorder <= 0) {
    reorderDate = 'REORDER NOW';
  } else if (daysUntilReorder < 999) {
    const date = new Date();
    date.setDate(date.getDate() + Math.floor(daysUntilReorder));
    reorderDate = date.toISOString().split('T')[0];
  } else {
    reorderDate = 'N/A';
  }

  return {
    weeksOfSupply: Math.round(weeksOfSupply * 10) / 10, // Round to 1 decimal
    reorderDate,
    avgDailySales: Math.round(avgDailySales * 100) / 100, // Round to 2 decimals
  };
}

/**
 * Sync inventory feed to Google Sheets (from Amazon FBA/MCF)
 */
async function syncInventory(options = {}) {
  try {
    console.log('Starting inventory sync from Amazon FBA/MCF...');

    // Fetch current inventory from Amazon
    const amazonInventory = await getAmazonInventory();
    console.log(`Fetched inventory for ${amazonInventory.length} SKUs from Amazon`);

    if (amazonInventory.length === 0) {
      console.log('No inventory data to sync');
      return { updated: 0 };
    }

    // Transform Amazon inventory data
    const inventoryData = amazonInventory.map(item => ({
      sku: item.sellerSku || '',
      fnsku: item.fnSku || '',
      asin: item.asin || '',
      product_name: item.productName || '',
      condition: item.condition || 'NewItem',
      // Total available quantity (fulfillable + reserved)
      inventory_quantity: (item.totalQuantity || 0),
      fulfillable_quantity: (item.fulfillableQuantity || 0),
      inbound_quantity: (item.inboundWorkingQuantity || 0) + (item.inboundShippedQuantity || 0),
      reserved_quantity: (item.reservedQuantity?.totalReservedQuantity || 0),
      last_updated_time: item.lastUpdatedTime || new Date().toISOString(),
    }));

    // Calculate sales velocity and metrics for each SKU
    console.log('Calculating sales velocity and inventory metrics...');
    const enrichedData = [];

    for (const item of inventoryData) {
      if (!item.sku) continue; // Skip items without SKU

      const avgDailySales = await calculateSalesVelocity(item.sku, 30);
      const metrics = calculateInventoryMetrics(
        item.fulfillable_quantity, // Use fulfillable qty for reorder calculations
        avgDailySales,
        7,  // safety stock days
        14  // lead time days
      );

      enrichedData.push({
        ...item,
        ...metrics,
      });
    }

    console.log(`Calculated metrics for ${enrichedData.length} items`);

    // Clear existing data and write new data
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheets = getSheetsClient();

    // Clear existing data (keep headers)
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'Inventory_Feed!A2:Z',
    });

    console.log('Cleared existing inventory data');

    // Write new data
    const rows = enrichedData.map(item => [
      new Date().toISOString(),          // A: last_updated
      item.sku,                          // B: sku
      item.fnsku,                        // C: fnsku (Amazon's identifier)
      item.asin,                         // D: asin
      item.product_name,                 // E: product_name
      item.condition,                    // F: condition
      item.inventory_quantity,           // G: total_quantity
      item.fulfillable_quantity,         // H: fulfillable_quantity
      item.inbound_quantity,             // I: inbound_quantity
      item.reserved_quantity,            // J: reserved_quantity
      item.avgDailySales,                // K: avg_daily_sales
      item.weeksOfSupply,                // L: weeks_of_supply
      item.reorderDate,                  // M: reorder_date
    ]);

    if (rows.length > 0) {
      await appendRows('Inventory_Feed', rows);
      console.log(`✅ Updated ${rows.length} inventory items`);
    }

    console.log('Inventory sync completed');
    return { updated: rows.length };

  } catch (error) {
    console.error('Error syncing inventory:', error.message);
    throw error;
  }
}

// CLI support
if (require.main === module) {
  syncInventory()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = syncInventory;
