/**
 * ShopifyClient.gs
 * Shopify Admin REST API client for Google Apps Script.
 *
 * Fetches orders (with line items) from Shopify within a date range.
 * Normalises each line item to a flat row matching the Sales_Fact schema.
 */

var SHOPIFY_API_VERSION = '2024-10';

/**
 * Build the base URL for the Shopify Admin REST API.
 */
function shopifyBaseUrl() {
  var domain = getConfig(CONFIG_KEYS.SHOPIFY_STORE_DOMAIN);
  return 'https://' + domain + '/admin/api/' + SHOPIFY_API_VERSION;
}

/**
 * Common request headers for Shopify.
 */
function shopifyHeaders() {
  return {
    'X-Shopify-Access-Token': getConfig(CONFIG_KEYS.SHOPIFY_ACCESS_TOKEN),
    'Content-Type': 'application/json',
  };
}

/**
 * Fetch all Shopify orders between startISO and endISO (inclusive).
 * Handles cursor-based pagination automatically.
 *
 * @param {string} startISO  e.g. "2024-01-01T00:00:00Z"
 * @param {string} endISO    e.g. "2024-01-31T23:59:59Z"
 * @returns {Array} Normalised line-item rows
 */
function getShopifyOrders(startISO, endISO) {
  var url = shopifyBaseUrl() + '/orders.json?' + [
    'status=any',
    'limit=250',
    'created_at_min=' + encodeURIComponent(startISO),
    'created_at_max=' + encodeURIComponent(endISO),
    'fields=id,name,created_at,financial_status,fulfillment_status,' +
      'total_price,subtotal_price,total_discounts,total_tax,' +
      'total_shipping_price_set,currency,line_items,customer,' +
      'billing_address,shipping_address,transactions',
  ].join('&');

  var rows = [];
  var feeRate = num(getConfig(CONFIG_KEYS.SHOPIFY_TRANSACTION_FEE_RATE, false) || '0.029');
  var feeFlat = num(getConfig(CONFIG_KEYS.SHOPIFY_TRANSACTION_FEE_FLAT, false) || '0.30');

  while (url) {
    log('Shopify fetch: ' + url.split('?')[0]);
    var response = fetchWithRetry(url, { headers: shopifyHeaders() });
    var data     = parseJson(response);
    var orders   = data.orders || [];

    orders.forEach(function(order) {
      var orderRows = normaliseShopifyOrder(order, feeRate, feeFlat);
      rows = rows.concat(orderRows);
    });

    // Pagination: follow the Link header if present
    url = extractNextPageUrl(response.getHeaders());
  }

  log('Shopify: fetched ' + rows.length + ' line-item rows');
  return rows;
}

/**
 * Extract the "next" URL from the Shopify Link header.
 * Link: <https://...page_info=xxx>; rel="next"
 */
function extractNextPageUrl(headers) {
  var link = headers['Link'] || headers['link'] || '';
  if (!link) return null;
  var match = link.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}

/**
 * Normalise a single Shopify order into one row per line item.
 * Returns an array of flat row arrays matching Sales_Fact column order.
 */
function normaliseShopifyOrder(order, feeRate, feeFlat) {
  var lineItems = order.line_items || [];
  var orderDate = new Date(order.created_at);
  var currency  = order.currency || 'USD';

  // Order-level shipping (split proportionally across lines)
  var shippingTotal = num(
    order.total_shipping_price_set &&
    order.total_shipping_price_set.shop_money &&
    order.total_shipping_price_set.shop_money.amount
  );

  // Per-line transaction fee (applied once per order on first line, rest $0)
  // More accurate: prorate fee across revenue
  var orderRevenue = num(order.total_price);
  var transactionFee = orderRevenue > 0 ? (orderRevenue * feeRate + feeFlat) : 0;

  var rows = [];
  var lineCount = lineItems.length;

  lineItems.forEach(function(line, idx) {
    var qty      = num(line.quantity);
    var unitPrice = num(line.price);
    var lineRevenue = qty * unitPrice;
    var discount    = num(line.total_discount);
    var netRevenue  = lineRevenue - discount;

    // Prorate shipping and fee across lines by revenue share
    var share       = orderRevenue > 0 ? (lineRevenue / orderRevenue) : (1 / lineCount);
    var lineShipping = shippingTotal * share;
    var lineFee      = transactionFee * share;

    var customer = order.customer || {};
    var shipping = order.shipping_address || order.billing_address || {};

    var d = orderDate;
    rows.push([
      toDateStr(d),                    // A  date
      'shopify',                       // B  channel
      String(order.id),                // C  order_id
      String(line.id),                 // D  line_id
      order.name || '',                // E  order_number
      line.sku || line.variant_id || '',// F  sku
      line.title || '',                // G  product_name
      line.variant_title || '',        // H  variant
      qty,                             // I  quantity
      unitPrice,                       // J  unit_price
      lineRevenue,                     // K  gross_revenue
      discount,                        // L  discounts
      netRevenue,                      // M  net_revenue
      lineFee,                         // N  fee_fulfillment   (Shopify: transaction fee)
      0,                               // O  fee_referral
      lineFee,                         // P  fee_transaction
      0,                               // Q  fee_storage
      0,                               // R  fee_other
      currency,                        // S  currency
      'US',                            // T  region
      d.getUTCFullYear(),              // U  year
      quarter(d),                      // V  quarter
      isoWeek(d),                      // W  iso_week
      d.getUTCMonth() + 1,             // X  month
      customer.id || '',               // Y  customer_id
      (customer.first_name || '') + ' ' + (customer.last_name || ''), // Z name
      customer.email || '',            // AA email
      shipping.city || '',             // AB city
      shipping.province_code || '',    // AC state
      shipping.zip || '',              // AD zip
      shipping.country_code || '',     // AE country
      order.financial_status || '',    // AF financial_status
    ]);
  });

  return rows;
}

/**
 * Fetch Shopify products (for cost lookup / SKU mapping).
 */
function getShopifyProducts() {
  var url  = shopifyBaseUrl() + '/products.json?limit=250&fields=id,title,variants';
  var products = [];

  while (url) {
    var response = fetchWithRetry(url, { headers: shopifyHeaders() });
    var data     = parseJson(response);
    (data.products || []).forEach(function(p) {
      (p.variants || []).forEach(function(v) {
        products.push({
          product_id:   p.id,
          title:        p.title,
          variant_id:   v.id,
          sku:          v.sku,
          price:        num(v.price),
          cost:         num(v.cost || 0),
        });
      });
    });
    url = extractNextPageUrl(response.getHeaders());
  }

  return products;
}
