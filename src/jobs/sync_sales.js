require('dotenv').config();

const { windowDaysBack } = require('../utils/dates');
const { getShopifyOrders } = require('../clients/shopify');
const { getAmazonOrders, getAmazonFinancialEvents } = require('../clients/amazon');
const { appendRows, getColumnValues, deleteDuplicatesByColumns, sortSheet } = require('../clients/sheets');

/**
 * Calculate ISO week number for a given date
 * @param {Date} date - The date to calculate ISO week for
 * @returns {number} ISO week number
 */
function getISOWeek(date) {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  return 1 + Math.ceil((firstThursday - target) / 604800000);
}

// parse CLI args like --start=YYYY-MM-DD --end=YYYY-MM-DD --days=90 --channels=shopify,amazon
function parseCliArgs() {
  return Object.fromEntries(
    process.argv.slice(2).map(s => {
      const [k, v] = s.replace(/^--/, '').split('=');
      return [k, v ?? true];
    })
  );
}

function buildRangeFromArgs(options = {}) {
  if (options.start && options.end) return { startISO: `${options.start}T00:00:00Z`, endISO: `${options.end}T23:59:59Z` };
  if (options.days) return windowDaysBack(Number(options.days));
  return windowDaysBack(Number(process.env.START_DAYS_BACK || 35));
}

function makeKey(channel, orderId, lineId) {
  return `${channel}|${orderId}|${lineId}`;
}

/**
 * Parse channels argument: --channels=shopify,amazon or --channels=all
 */
function parseChannels(channelsArg = 'all') {
  if (!channelsArg || channelsArg === 'all') {
    return ['shopify', 'amazon'];
  }
  return channelsArg.split(',').map(s => s.trim().toLowerCase());
}

async function syncSales(options = {}) {
  try {
    const { startISO, endISO } = buildRangeFromArgs(options);
    const channels = parseChannels(options.channels);
    
    console.log('Starting sales sync…');
    console.log(`Channels: ${channels.join(', ')}`);
    console.log(`Fetching orders from ${startISO} to ${endISO}`);

    let allObjects = [];

    // ---- Fetch Shopify ----
    if (channels.includes('shopify')) {
      try {
        const orders = await getShopifyOrders(startISO, endISO);
        console.log(`Fetched ${orders.length} Shopify orders`);

        const shopifyObjects = orders.flatMap(order => {
          const shipping = Number(order.total_shipping_price_set?.shop_money?.amount || 0);
          const tax = Number(order.total_tax || 0);
          
          // Calculate Shopify transaction fees
          // Note: These can be customized based on your Shopify plan and payment processor
          const orderTotal = Number(order.total_price || 0);
          const transactionFee = orderTotal * 0.029 + 0.30; // Example: 2.9% + $0.30 (Shopify Payments)
          
          return (order.line_items || []).map(li => {
            // Distribute transaction fee proportionally across line items
            const lineItemPortion = Number(li.price || 0) * Number(li.quantity || 0) / orderTotal;
            const lineTransactionFee = transactionFee * lineItemPortion;
            
            // Calculate date components
            const orderDate = new Date(order.created_at);
            const isoWeek = getISOWeek(orderDate);
            const isoYear = orderDate.getFullYear();
            const yearWeek = `${isoYear}-W${isoWeek.toString().padStart(2, '0')}`;
            const quarter = Math.ceil((orderDate.getMonth() + 1) / 3);
            
            // Customer data
            const customer = order.customer || {};
            const shippingAddress = order.shipping_address || {};
            
            return {
              date: order.created_at,                 // A
              channel: 'Shopify',                     // B
              order_id: String(order.id),             // C
              line_id: String(li.id),                 // D
              sku: li.sku || '',                      // E
              title: li.title || '',                  // F
              qty: Number(li.quantity || 0),          // G
              item_gross: Number(li.price || 0) * Number(li.quantity || 0), // H
              item_discount: Number(li.total_discount || 0),                // I
              shipping,                               // J
              tax,                                    // K
              refund: 0,                              // L
              fulfillment_fee: 0,                     // M - MCF fees come from Amazon
              referral_fee: 0,                        // N - Not applicable for Shopify
              transaction_fee: lineTransactionFee,    // O - Shopify payment processing
              storage_fee: 0,                         // P - Not applicable for Shopify
              other_fees: 0,                          // Q - Other fees if any
              total_fees: '',                         // R - Will be calculated by ARRAYFORMULA
              currency: order.currency || 'USD',      // S
              region: shippingAddress.country_code || 'US', // T
              iso_week: isoWeek,                      // U
              iso_year: isoYear,                      // V
              year_week: yearWeek,                     // W
              qtr: quarter,                           // X
              shopify_order_number: order.order_number || '', // Y - Customer reference number
              customer_id: customer.id ? String(customer.id) : '', // Z
              customer_email: customer.email || '',    // AA
              customer_name: `${customer.first_name || ''} ${customer.last_name || ''}`.trim(), // AB
              customer_city: shippingAddress.city || '', // AC
              customer_region: shippingAddress.province || shippingAddress.state || '', // AD
              customer_country: shippingAddress.country || '', // AE
              customer_zip: shippingAddress.zip || '', // AF
            };
          });
        });

        console.log(`Prepared ${shopifyObjects.length} Shopify line items`);
        allObjects.push(...shopifyObjects);
      } catch (err) {
        console.error('Shopify fetch failed:', err.message);
        // Don't throw - continue with other channels
      }
    }

    // ---- Fetch Amazon ----
    if (channels.includes('amazon')) {
      try {
        const amazonObjects = await getAmazonOrders(startISO, endISO);
        
        // Fetch Amazon fees from Financial Events API
        console.log('Fetching Amazon fees...');
        const amazonFees = await getAmazonFinancialEvents(startISO, endISO);
        
        // Enrich Amazon orders with actual fee breakdown
        for (const obj of amazonObjects) {
          const feeBreakdown = amazonFees.get(obj.order_id) || {
            fulfillment_fee: 0,
            referral_fee: 0,
            storage_fee: 0,
            other_fees: 0,
            total_fees: 0
          };
          
          obj.fulfillment_fee = feeBreakdown.fulfillment_fee;
          obj.referral_fee = feeBreakdown.referral_fee;
          obj.transaction_fee = 0; // Amazon doesn't have separate transaction fees
          obj.storage_fee = feeBreakdown.storage_fee;
          obj.other_fees = feeBreakdown.other_fees;
          // Note: total_fees left empty - ARRAYFORMULA will calculate it
        }
        
        console.log(`Enriched ${amazonObjects.length} Amazon orders with fee data`);
        allObjects.push(...amazonObjects);
      } catch (err) {
        console.warn('Amazon fetch skipped:', err.message);
        // Don't throw - Amazon might not be configured
      }
    }

    console.log(`Total prepared: ${allObjects.length} line objects across all channels`);

    if (allObjects.length === 0) {
      console.log('No orders to sync');
      return { appended: 0 };
    }

    // ---- PRE-DEDUP: skip keys already in Sales_Fact (B,C,D) ----
    // Read existing keys once (channel|order_id|line_id)
    const existingChannels = await getColumnValues('Sales_Fact!B2:B');
    const existingOrderIds = await getColumnValues('Sales_Fact!C2:C');
    const existingLineIds  = await getColumnValues('Sales_Fact!D2:D');

    const existing = new Set();
    const len = Math.min(existingChannels.length, existingOrderIds.length, existingLineIds.length);
    for (let i = 0; i < len; i++) {
      existing.add(makeKey(existingChannels[i], existingOrderIds[i], existingLineIds[i]));
    }

    const fresh = allObjects.filter(r => !existing.has(makeKey(r.channel, r.order_id, r.line_id)));
    console.log(`Skipping ${allObjects.length - fresh.length} duplicates already in Sales_Fact`);
    console.log(`Appending ${fresh.length} new line rows`);

    let appendedCount = 0;
    if (fresh.length) {
      // Convert timestamps to date-only format for proper filtering
      const rows = fresh.map((r) => {
        // Parse ISO timestamp and extract just the date part (YYYY-MM-DD)
        let dateOnly = '';
        if (r.date) {
          // Handle both full timestamps and date-only formats
          if (r.date.includes('T')) {
            // Extract date part from ISO timestamp (e.g., "2025-10-17T23:30:16-04:00" -> "2025-10-17")
            dateOnly = r.date.split('T')[0];
          } else if (r.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
            // Already in correct format
            dateOnly = r.date;
          } else {
            // Fallback: try to parse and format
            const date = new Date(r.date);
            if (!isNaN(date.getTime())) {
              dateOnly = date.toISOString().split('T')[0];
            }
          }
          
          // Ensure we have a valid date format
          if (!dateOnly || !dateOnly.match(/^\d{4}-\d{2}-\d{2}$/)) {
            console.warn(`Invalid date format for order ${r.order_id}: ${r.date} -> ${dateOnly}`);
            // Use current date as fallback
            dateOnly = new Date().toISOString().split('T')[0];
          }
        }
        
        return [
          dateOnly, r.channel, r.order_id, r.line_id, r.sku, r.title, r.qty, r.item_gross, r.item_discount,
          r.shipping, r.tax, r.refund, r.fulfillment_fee, r.referral_fee, r.transaction_fee, 
          r.storage_fee, r.other_fees, 
          '', // R: total_fees - leave blank, ARRAYFORMULA will calculate it
          r.currency, r.region, r.iso_week, r.iso_year, r.year_week, r.qtr,
          r.shopify_order_number, r.customer_id, r.customer_email, r.customer_name,
          r.customer_city, r.customer_region, r.customer_country, r.customer_zip
        ];
      });
      await appendRows('Sales_Fact', rows);
      appendedCount = rows.length;
      console.log(`✅ Appended ${appendedCount} rows to Sales_Fact`);

      // Sort by date column (A = index 0) descending (most recent first)
      console.log('Sorting Sales_Fact by date (most recent first)...');
      try {
        await sortSheet('Sales_Fact', 0, true);
        console.log('✅ Sorted Sales_Fact');
      } catch (sortError) {
        console.error('❌ Failed to sort Sales_Fact:', sortError.message);
        // Continue without sorting rather than failing the entire sync
      }

      // Optional belt-and-suspenders hard dedupe (by columns B,C,D = 1,2,3)
      // await deleteDuplicatesByColumns('Sales_Fact', [1,2,3]);
    } else {
      console.log('No new rows to append');
    }

    console.log('Sales sync completed');
    return { appended: appendedCount };
  } catch (err) {
    console.error('Error syncing sales:', err.message);
    throw err;
  }
}

if (require.main === module) {
  const args = parseCliArgs();
  syncSales(args)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = syncSales;
