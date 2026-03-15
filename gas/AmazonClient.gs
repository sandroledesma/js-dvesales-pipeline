/**
 * AmazonClient.gs
 * Amazon Selling Partner API client for Google Apps Script.
 *
 * Implements:
 *  - LWA (Login with Amazon) access token retrieval + caching
 *  - AWS Signature V4 signed requests via awsSigV4Headers() in Utils.gs
 *  - getAmazonOrders()       — order + line item fetch
 *  - getAmazonFinancialEvents() — actual marketplace fees
 *  - getAmazonInventory()    — FBA/MCF inventory summaries
 */

// Cache LWA token in script cache for 55 minutes (token lives 60 min)
var LWA_CACHE_KEY = 'lwa_access_token';
var LWA_CACHE_TTL = 55 * 60; // seconds

// ---------------------------------------------------------------------------
// LWA Token
// ---------------------------------------------------------------------------

/**
 * Get a valid LWA access token. Uses CacheService to avoid redundant calls.
 */
function getLwaToken() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(LWA_CACHE_KEY);
  if (cached) return cached;

  var payload = {
    grant_type:    'refresh_token',
    refresh_token: getConfig(CONFIG_KEYS.AMAZON_REFRESH_TOKEN),
    client_id:     getConfig(CONFIG_KEYS.LWA_CLIENT_ID),
    client_secret: getConfig(CONFIG_KEYS.LWA_CLIENT_SECRET),
  };

  var response = fetchWithRetry('https://api.amazon.com/auth/o2/token', {
    method:  'post',
    payload: Object.keys(payload).map(function(k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(payload[k]);
    }).join('&'),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  var data  = parseJson(response);
  var token = data.access_token;
  if (!token) throw new Error('LWA token exchange failed: ' + JSON.stringify(data));

  cache.put(LWA_CACHE_KEY, token, LWA_CACHE_TTL);
  log('LWA token refreshed');
  return token;
}

// ---------------------------------------------------------------------------
// Core signed SP-API request
// ---------------------------------------------------------------------------

/**
 * Make a signed GET request to the SP-API.
 *
 * @param {string} path         e.g. '/orders/v0/orders'
 * @param {Object} queryParams  key/value pairs
 * @returns {Object}            Parsed JSON response
 */
function spapiGet(path, queryParams) {
  var host        = getSpapiEndpoint();
  var accessKey   = getConfig(CONFIG_KEYS.AWS_ACCESS_KEY_ID);
  var secretKey   = getConfig(CONFIG_KEYS.AWS_SECRET_ACCESS_KEY);
  var lwaToken    = getLwaToken();

  var extraHeaders = { 'x-amz-access-token': lwaToken };

  var signedHeaders = awsSigV4Headers(
    'GET', host, path, queryParams || {}, extraHeaders,
    '', accessKey, secretKey, null, getAwsRegion(), 'execute-api'
  );

  var qs = Object.keys(queryParams || {}).sort().map(function(k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(queryParams[k]);
  }).join('&');

  var url = 'https://' + host + path + (qs ? '?' + qs : '');

  var response = fetchWithRetry(url, {
    method:  'get',
    headers: signedHeaders,
  });

  return parseJson(response);
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

/**
 * Fetch and normalise Amazon orders within a date range.
 * Returns flat line-item rows matching Sales_Fact column schema.
 *
 * @param {string} startISO
 * @param {string} endISO
 * @returns {Array}
 */
function getAmazonOrders(startISO, endISO) {
  var marketplaceId = getConfig(CONFIG_KEYS.AMAZON_MARKETPLACE_ID, false) || 'ATVPDKIKX0DER';
  var sellerId      = getConfig(CONFIG_KEYS.AMAZON_SELLER_ID);

  var params = {
    MarketplaceIds:     marketplaceId,
    CreatedAfter:       startISO,
    CreatedBefore:      endISO,
    OrderStatuses:      'Unshipped,PartiallyShipped,Shipped,Canceled',
    MaxResultsPerPage:  '100',
  };

  var allOrders = [];
  var nextToken = null;

  do {
    var queryParams = Object.assign({}, params);
    if (nextToken) {
      queryParams = { NextToken: nextToken, MarketplaceIds: marketplaceId };
    }

    var data = spapiGet('/orders/v0/orders', queryParams);
    var orders = (data.payload && data.payload.Orders) || [];
    allOrders = allOrders.concat(orders);
    nextToken = data.payload && data.payload.NextToken;

    if (nextToken) Utilities.sleep(500);
  } while (nextToken);

  log('Amazon: fetched ' + allOrders.length + ' orders');

  // Fetch line items and financial events
  var feesByOrder = buildFeeLookup(startISO, endISO);
  var rows = [];

  allOrders.forEach(function(order) {
    try {
      var lineRows = fetchOrderLines(order, feesByOrder, sellerId, marketplaceId);
      rows = rows.concat(lineRows);
    } catch (e) {
      log('Error fetching lines for order ' + order.AmazonOrderId + ': ' + e.message);
    }
    Utilities.sleep(300); // SP-API rate limit: ~1 req/s for order items
  });

  log('Amazon: normalised ' + rows.length + ' line-item rows');
  return rows;
}

/**
 * Fetch line items for a single order and return Sales_Fact rows.
 */
function fetchOrderLines(order, feesByOrder, sellerId, marketplaceId) {
  var orderId   = order.AmazonOrderId;
  var orderDate = new Date(order.PurchaseDate);
  var currency  = (order.OrderTotal && order.OrderTotal.CurrencyCode) || 'USD';
  var status    = order.OrderStatus || '';
  var fees      = feesByOrder[orderId] || { fulfillment: 0, referral: 0, storage: 0, other: 0 };

  var data     = spapiGet('/orders/v0/orders/' + orderId + '/orderItems', {});
  var items    = (data.payload && data.payload.OrderItems) || [];

  var totalRevenue = items.reduce(function(sum, item) {
    return sum + num(item.ItemPrice && item.ItemPrice.Amount);
  }, 0);

  var rows = [];
  var itemCount = items.length;

  items.forEach(function(item) {
    var qty        = num(item.QuantityOrdered);
    var unitPrice  = num(item.ItemPrice && item.ItemPrice.Amount) / Math.max(qty, 1);
    var lineRev    = num(item.ItemPrice && item.ItemPrice.Amount);
    var discount   = num(item.PromotionDiscount && item.PromotionDiscount.Amount);
    var netRev     = lineRev - discount;

    var share = totalRevenue > 0 ? lineRev / totalRevenue : 1 / itemCount;

    var d = orderDate;
    rows.push([
      toDateStr(d),                        // A  date
      'amazon',                            // B  channel
      orderId,                             // C  order_id
      item.OrderItemId || '',              // D  line_id
      orderId,                             // E  order_number
      item.SellerSKU || item.ASIN || '',   // F  sku
      item.Title || '',                    // G  product_name
      '',                                  // H  variant
      qty,                                 // I  quantity
      unitPrice,                           // J  unit_price
      lineRev,                             // K  gross_revenue
      discount,                            // L  discounts
      netRev,                              // M  net_revenue
      fees.fulfillment * share,            // N  fee_fulfillment
      fees.referral    * share,            // O  fee_referral
      0,                                   // P  fee_transaction
      fees.storage     * share,            // Q  fee_storage
      fees.other       * share,            // R  fee_other
      currency,                            // S  currency
      'US',                                // T  region
      d.getUTCFullYear(),                  // U  year
      quarter(d),                          // V  quarter
      isoWeek(d),                          // W  iso_week
      d.getUTCMonth() + 1,                 // X  month
      '',                                  // Y  customer_id  (Amazon: PII restricted)
      '',                                  // Z  customer_name
      order.BuyerEmail || '',              // AA email
      order.ShippingAddress && order.ShippingAddress.City || '',   // AB city
      order.ShippingAddress && order.ShippingAddress.StateOrRegion || '', // AC state
      order.ShippingAddress && order.ShippingAddress.PostalCode || '',    // AD zip
      order.ShippingAddress && order.ShippingAddress.CountryCode || '',   // AE country
      status,                              // AF financial_status
    ]);
  });

  return rows;
}

// ---------------------------------------------------------------------------
// Financial Events (fees)
// ---------------------------------------------------------------------------

/**
 * Build a lookup of { orderId -> { fulfillment, referral, storage, other } }
 * from Amazon Financial Events for the given date range.
 */
function buildFeeLookup(startISO, endISO) {
  var events = getAmazonFinancialEvents(startISO, endISO);
  var lookup = {};

  events.forEach(function(e) {
    var id = e.orderId;
    if (!id) return;
    if (!lookup[id]) lookup[id] = { fulfillment: 0, referral: 0, storage: 0, other: 0 };
    lookup[id].fulfillment += e.fulfillmentFee;
    lookup[id].referral    += e.referralFee;
    lookup[id].storage     += e.storageFee;
    lookup[id].other       += e.otherFee;
  });

  return lookup;
}

/**
 * Fetch Amazon Financial Events and return normalised fee records.
 */
function getAmazonFinancialEvents(startISO, endISO) {
  var params = {
    PostedAfter:  startISO,
    PostedBefore: endISO,
    MaxResultsPerPage: '100',
  };

  var allEvents = [];
  var nextToken = null;

  do {
    var queryParams = nextToken ? { NextToken: nextToken } : params;
    var data = spapiGet('/finances/v0/financialEvents', queryParams);
    var payload  = (data.payload && data.payload.FinancialEvents) || {};
    var shipmentEvents = payload.ShipmentEventList || [];

    shipmentEvents.forEach(function(event) {
      var orderId = event.AmazonOrderId || '';
      var fees = { orderId: orderId, fulfillmentFee: 0, referralFee: 0, storageFee: 0, otherFee: 0 };

      (event.ShipmentItemList || []).forEach(function(item) {
        (item.ItemFeeList || []).forEach(function(fee) {
          var amount = num(fee.FeeAmount && fee.FeeAmount.Amount);
          var type   = (fee.FeeType || '').toLowerCase();
          if (type.includes('fbaperunit') || type.includes('fulfillment') || type.includes('mcf')) {
            fees.fulfillmentFee += Math.abs(amount);
          } else if (type.includes('referral') || type.includes('commission')) {
            fees.referralFee += Math.abs(amount);
          } else if (type.includes('storage')) {
            fees.storageFee += Math.abs(amount);
          } else {
            fees.otherFee += Math.abs(amount);
          }
        });
      });

      allEvents.push(fees);
    });

    nextToken = data.payload && data.payload.NextToken;
    if (nextToken) Utilities.sleep(500);
  } while (nextToken);

  log('Amazon Financial Events: ' + allEvents.length + ' shipment records');
  return allEvents;
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

/**
 * Fetch FBA/MCF inventory summaries.
 * Returns array of inventory objects.
 */
function getAmazonInventory(skus) {
  var marketplaceId = getConfig(CONFIG_KEYS.AMAZON_MARKETPLACE_ID, false) || 'ATVPDKIKX0DER';

  var params = {
    details:        'true',
    granularityType: 'Marketplace',
    granularityId:  marketplaceId,
    marketplaceIds: marketplaceId,
  };

  if (skus && skus.length) {
    // SP-API accepts up to 50 SKUs per call
    params.sellerSkus = skus.slice(0, 50).join(',');
  }

  var allItems  = [];
  var nextToken = null;

  do {
    var queryParams = Object.assign({}, params);
    if (nextToken) queryParams.nextToken = nextToken;

    var data  = spapiGet('/fba/inventory/v1/summaries', queryParams);
    var items = (data.payload && data.payload.inventorySummaries) || [];
    allItems  = allItems.concat(items);
    nextToken = data.pagination && data.pagination.nextToken;
    if (nextToken) Utilities.sleep(500);
  } while (nextToken);

  log('Amazon Inventory: ' + allItems.length + ' SKU records');
  return allItems;
}

/**
 * Fetch all seller SKUs from inventory (no filter).
 */
function getAllAmazonInventory() {
  return getAmazonInventory(null);
}
