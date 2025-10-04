require('dotenv').config();

const { windowDaysBack } = require('../utils/dates');
const { getShopifyOrders } = require('../clients/shopify');
const { appendRows } = require('../clients/sheets');

/**
 * Sync sales data from Shopify to Google Sheets
 */
async function syncSales() {
  try {
    console.log('Starting sales sync...');

    // Get date range for last 35 days
    const { startISO, endISO } = windowDaysBack(35);
    console.log(`Fetching orders from ${startISO} to ${endISO}`);

    // Fetch orders from Shopify
    const orders = await getShopifyOrders(startISO, endISO);
    console.log(`Fetched ${orders.length} orders from Shopify`);

    if (orders.length === 0) {
      console.log('No orders to sync');
      return;
    }

    // Map orders to Sales_Fact format (first 15 columns)
    const rows = orders.map(order => [
      order.id,                           // Column 1: Order ID
      order.order_number,                 // Column 2: Order Number
      order.created_at,                   // Column 3: Created At
      order.updated_at,                   // Column 4: Updated At
      order.financial_status,             // Column 5: Financial Status
      order.fulfillment_status,           // Column 6: Fulfillment Status
      order.total_price,                  // Column 7: Total Price
      order.subtotal_price,               // Column 8: Subtotal Price
      order.total_tax,                    // Column 9: Total Tax
      order.total_discounts,              // Column 10: Total Discounts
      order.currency,                     // Column 11: Currency
      order.customer?.id || '',           // Column 12: Customer ID
      order.customer?.email || '',        // Column 13: Customer Email
      order.line_items?.length || 0,      // Column 14: Line Items Count
      order.tags || '',                   // Column 15: Tags
    ]);

    // Append to Google Sheets
    await appendRows('Sales_Fact', rows);
    console.log(`Successfully synced ${rows.length} orders to Sales_Fact sheet`);

  } catch (error) {
    console.error('Error syncing sales:', error.message);
    process.exit(1);
  }
}

// Run the sync job
if (require.main === module) {
  syncSales()
    .then(() => {
      console.log('Sales sync completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Sales sync failed:', error);
      process.exit(1);
    });
}

module.exports = syncSales;
