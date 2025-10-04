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
    const rows = orders.flatMap(order =>
      order.line_items.map(item => [
        order.created_at,                                        // date
        "Shopify",                                               // channel
        order.id,                                                // order_id
        item.id,                                                 // line_id
        item.sku || "",                                          // sku
        item.title,                                              // title
        item.quantity,                                           // qty
        parseFloat(item.price) * item.quantity,                  // item_gross
        parseFloat(item.total_discount || 0),                    // item_discount
        parseFloat(order.total_shipping_price_set?.shop_money?.amount || 0), // shipping
        parseFloat(order.total_tax || 0),                        // tax
        0,                                                       // refund (future logic)
        0,                                                       // marketplace_fees
        order.currency,                                          // currency
        "US",                                                    // region (hardcoded for now)
      ])
    );
    
    await appendRows("Sales_Fact", rows);
    console.log(`✅ Appended ${rows.length} rows to Sales_Fact`);
    

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
