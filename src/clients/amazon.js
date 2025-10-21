const SellingPartnerAPI = require('amazon-sp-api');
const pLimit = require('p-limit');

/**
 * Safe number coercion
 */
function toNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Extract amount from monetary object
 */
function amt(m) {
  return toNum(m?.Amount || 0);
}

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

/**
 * Create SP-API client with credentials from environment
 */
async function makeClient() {
  const required = [
    'AMAZON_SELLER_ID',
    'AMAZON_REFRESH_TOKEN',
    'LWA_CLIENT_ID',
    'LWA_CLIENT_SECRET',
    'AWS_SELLING_PARTNER_ROLE_ARN',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'SPAPI_REGION'
  ];
  
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing Amazon SP-API env vars: ${missing.join(', ')}`);
  }

  return new SellingPartnerAPI({
    region: process.env.SPAPI_REGION || 'na',
    refresh_token: process.env.AMAZON_REFRESH_TOKEN,
    credentials: {
      SELLING_PARTNER_APP_CLIENT_ID: process.env.LWA_CLIENT_ID,
      SELLING_PARTNER_APP_CLIENT_SECRET: process.env.LWA_CLIENT_SECRET,
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
      AWS_SELLING_PARTNER_ROLE: process.env.AWS_SELLING_PARTNER_ROLE_ARN
    }
  });
}

/**
 * List orders with pagination
 */
async function listOrders(sp, startISO, endISO) {
  const marketplaceIds = [process.env.AMAZON_MARKETPLACE_ID || 'ATVPDKIKX0DER'];
  const params = {
    CreatedAfter: startISO,
    CreatedBefore: endISO,
    MarketplaceIds: marketplaceIds,
    // Statuses to include
    OrderStatuses: ['Unshipped', 'PartiallyShipped', 'Shipped', 'Canceled']
  };

  let orders = [];
  let nextToken;
  
  do {
    const res = nextToken
      ? await sp.callAPI({
          api_path: '/orders/v0/orders',
          method: 'GET',
          query: { NextToken: nextToken }
        })
      : await sp.callAPI({
          api_path: '/orders/v0/orders',
          method: 'GET',
          query: params
        });

    orders = orders.concat(res?.Orders || []);
    nextToken = res?.NextToken;
  } while (nextToken);

  return orders;
}

/**
 * List order items with pagination
 */
async function listOrderItems(sp, amazonOrderId) {
  let items = [];
  let nextToken;
  
  do {
    const res = nextToken
      ? await sp.callAPI({
          api_path: `/orders/v0/orders/${amazonOrderId}/orderItems`,
          method: 'GET',
          query: { NextToken: nextToken }
        })
      : await sp.callAPI({
          api_path: `/orders/v0/orders/${amazonOrderId}/orderItems`,
          method: 'GET'
        });

    items = items.concat(res?.OrderItems || []);
    nextToken = res?.NextToken;
  } while (nextToken);

  return items;
}

/**
 * Get Amazon orders and normalize to our Sales_Fact format
 * @param {string} startISO - Start date in ISO format
 * @param {string} endISO - End date in ISO format
 * @returns {Promise<Array>} Array of normalized line-level objects
 */
async function getAmazonOrders(startISO, endISO) {
  const sp = await makeClient();
  const orders = await listOrders(sp, startISO, endISO);
  
  if (!orders.length) {
    console.log('No Amazon orders found for date range');
    return [];
  }

  console.log(`Fetched ${orders.length} Amazon orders`);

  // Rate limit: start conservative with 1 concurrent request
  const limit = pLimit(1);
  const all = [];

  await Promise.all(
    orders.map(o => limit(async () => {
      try {
        const items = await listOrderItems(sp, o.AmazonOrderId);
        
        for (const it of items) {
          const purchaseDate = o.PurchaseDate;
          const currency = o.OrderTotal?.CurrencyCode || it.ItemPrice?.CurrencyCode || 'USD';
          const itemGross = amt(it.ItemPrice);            // line total
          const shipping = amt(it.ShippingPrice);         // per line
          const itemTax = amt(it.ItemTax);
          const shippingTax = amt(it.ShippingTax);
          const discount = Math.abs(amt(it.PromotionDiscount));
          const tax = itemTax + shippingTax;

          // Calculate date components for Amazon orders
          const orderDate = new Date(purchaseDate);
          const isoWeek = getISOWeek(orderDate);
          const isoYear = orderDate.getFullYear();
          const yearWeek = `${isoYear}-W${isoWeek.toString().padStart(2, '0')}`;
          const quarter = Math.ceil((orderDate.getMonth() + 1) / 3);

          all.push({
            date: purchaseDate,
            channel: 'Amazon',
            order_id: o.AmazonOrderId,
            line_id: it.OrderItemId,
            sku: it.SellerSKU || '',
            title: it.Title || '',
            qty: Number(it.QuantityOrdered || 0),
            item_gross: itemGross,
            item_discount: discount,
            shipping: shipping,
            tax: tax,
            refund: 0,
            fulfillment_fee: 0,    // Will be populated from Financial Events
            referral_fee: 0,       // Will be populated from Financial Events
            transaction_fee: 0,    // Not applicable for Amazon
            storage_fee: 0,        // Will be populated from Financial Events
            other_fees: 0,         // Will be populated from Financial Events
            total_fees: '',        // Will be calculated by ARRAYFORMULA
            currency,
            region: o.ShippingAddress?.CountryCode || 'US',
            iso_week: isoWeek,
            iso_year: isoYear,
            year_week: yearWeek,
            qtr: quarter,
            shopify_order_number: '', // Not applicable for Amazon
            customer_id: '',         // Amazon doesn't provide customer IDs
            customer_email: '',      // Amazon doesn't provide customer emails
            customer_name: '',       // Amazon doesn't provide customer names
            customer_city: o.ShippingAddress?.City || '',
            customer_region: o.ShippingAddress?.StateOrRegion || '',
            customer_country: o.ShippingAddress?.CountryCode || '',
            customer_zip: o.ShippingAddress?.PostalCode || '',
          });
        }
      } catch (error) {
        console.warn(`Failed to fetch items for order ${o.AmazonOrderId}:`, error.message);
      }
    }))
  );

  console.log(`Prepared ${all.length} Amazon line items`);
  return all;
}

/**
 * Get inventory summaries from Amazon FBA/MCF
 * @param {Array<string>} skus - Optional array of SKUs to filter (leave empty for all)
 * @returns {Promise<Array>} Array of inventory items
 */
async function getAmazonInventory(skus = []) {
  const sp = await makeClient();
  const marketplaceIds = [process.env.AMAZON_MARKETPLACE_ID || 'ATVPDKIKX0DER'];
  
  let inventoryItems = [];
  let nextToken;
  
  try {
    do {
      const query = {
        granularityType: 'Marketplace',
        granularityId: marketplaceIds[0],
        marketplaceIds: marketplaceIds
      };
      
      if (nextToken) {
        query.nextToken = nextToken;
      }
      
      if (skus.length > 0) {
        query.sellerSkus = skus.join(',');
      }

      const res = await sp.callAPI({
        api_path: '/fba/inventory/v1/summaries',
        method: 'GET',
        query: query
      });

      const items = res?.inventorySummaries || [];
      inventoryItems = inventoryItems.concat(items);
      nextToken = res?.nextToken;
      
      // Rate limiting - wait between pagination calls
      if (nextToken) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } while (nextToken);

    console.log(`Fetched ${inventoryItems.length} inventory items from Amazon`);
    return inventoryItems;
  } catch (error) {
    console.error('Error fetching Amazon inventory:', error.message);
    throw error;
  }
}

/**
 * Get financial events for orders to extract fees with breakdown
 * @param {string} startISO - Start date in ISO format
 * @param {string} endISO - End date in ISO format
 * @returns {Promise<Map>} Map of order_id to fee breakdown object
 */
async function getAmazonFinancialEvents(startISO, endISO) {
  const sp = await makeClient();
  const feesByOrder = new Map();
  
  try {
    let nextToken;
    
    do {
      const query = {
        PostedAfter: startISO,
        PostedBefore: endISO
      };
      
      if (nextToken) {
        query.NextToken = nextToken;
      }

      const res = await sp.callAPI({
        api_path: '/finances/v0/financialEvents',
        method: 'GET',
        query: query
      });

      // Process shipment events
      const shipmentEvents = res?.FinancialEvents?.ShipmentEventList || [];
      
      for (const event of shipmentEvents) {
        const orderId = event.AmazonOrderId;
        if (!orderId) continue;
        
        // Initialize fee breakdown
        const feeBreakdown = {
          fulfillment_fee: 0,   // FBA/MCF fulfillment fees
          referral_fee: 0,      // Referral/commission fees
          storage_fee: 0,       // Storage fees
          other_fees: 0,        // Other miscellaneous fees
          total_fees: 0         // Total of all fees
        };
        
        // Categorize fees by type
        for (const item of event.ShipmentItemList || []) {
          const fees = item.ItemFeeList || [];
          for (const fee of fees) {
            const feeType = fee.FeeType || '';
            const feeAmount = Math.abs(amt(fee.FeeAmount));
            
            // Categorize based on fee type
            if (feeType.includes('FBA') || feeType.includes('Fulfillment')) {
              feeBreakdown.fulfillment_fee += feeAmount;
            } else if (feeType.includes('Commission') || feeType.includes('Referral')) {
              feeBreakdown.referral_fee += feeAmount;
            } else if (feeType.includes('Storage')) {
              feeBreakdown.storage_fee += feeAmount;
            } else {
              feeBreakdown.other_fees += feeAmount;
            }
            
            feeBreakdown.total_fees += feeAmount;
          }
        }
        
        feesByOrder.set(orderId, feeBreakdown);
      }
      
      nextToken = res?.NextToken;
      
      // Rate limiting
      if (nextToken) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } while (nextToken);

    console.log(`Fetched fee breakdowns for ${feesByOrder.size} Amazon orders`);
    return feesByOrder;
  } catch (error) {
    console.warn('Error fetching Amazon financial events:', error.message);
    return new Map();
  }
}

module.exports = { 
  getAmazonOrders, 
  getAmazonInventory,
  getAmazonFinancialEvents 
};


