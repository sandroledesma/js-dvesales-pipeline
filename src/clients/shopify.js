/**
 * Shopify API client
 */
class ShopifyClient {
  constructor(shopName, accessToken, apiVersion = '2024-10') {
    this.shopName = shopName;
    this.accessToken = accessToken;
    this.apiVersion = apiVersion;
    this.baseUrl = `https://${shopName}.myshopify.com/admin/api/${apiVersion}`;
  }

  /**
   * Make a request to the Shopify API
   * @param {string} endpoint - The API endpoint
   * @param {Object} options - Fetch options
   * @returns {Promise<Object>} The JSON response
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'X-Shopify-Access-Token': this.accessToken,
      'Content-Type': 'application/json',
      ...options.headers,
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error making Shopify API request:', error.message);
      throw error;
    }
  }

  /**
   * Get orders from Shopify
   * @param {Object} params - Query parameters
   * @returns {Promise<Array>} Array of orders
   */
  async getOrders(params = {}) {
    const queryParams = new URLSearchParams(params);
    const endpoint = `/orders.json?${queryParams}`;
    const response = await this.request(endpoint);
    return response.orders || [];
  }

  /**
   * Get a specific order by ID
   * @param {string} orderId - The order ID
   * @returns {Promise<Object>} The order object
   */
  async getOrder(orderId) {
    const endpoint = `/orders/${orderId}.json`;
    const response = await this.request(endpoint);
    return response.order;
  }

  /**
   * Get products from Shopify
   * @param {Object} params - Query parameters
   * @returns {Promise<Array>} Array of products
   */
  async getProducts(params = {}) {
    const queryParams = new URLSearchParams(params);
    const endpoint = `/products.json?${queryParams}`;
    const response = await this.request(endpoint);
    return response.products || [];
  }

  /**
   * Get sales data for a date range
   * @param {string} startDate - Start date (ISO format)
   * @param {string} endDate - End date (ISO format)
   * @returns {Promise<Array>} Array of orders with sales data
   */
  async getSales(startDate, endDate) {
    const params = {
      status: 'any',
      created_at_min: startDate,
      created_at_max: endDate,
      limit: 250,
    };

    const orders = await this.getOrders(params);
    
    return orders.map(order => ({
      id: order.id,
      orderNumber: order.order_number,
      createdAt: order.created_at,
      totalPrice: order.total_price,
      subtotalPrice: order.subtotal_price,
      totalTax: order.total_tax,
      currency: order.currency,
      financialStatus: order.financial_status,
      fulfillmentStatus: order.fulfillment_status,
      customerEmail: order.customer?.email,
      lineItems: order.line_items?.length || 0,
    }));
  }
}

/**
 * Get Shopify orders for a date range
 * @param {string} startISO - Start date in ISO format
 * @param {string} endISO - End date in ISO format
 * @returns {Promise<Array>} Array of orders
 */
async function getShopifyOrders(startISO, endISO) {
  const shopDomain = process.env.SHOPIFY_STORE_DOMAIN;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!shopDomain || !accessToken) {
    throw new Error('SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN environment variables must be set');
  }

  // shopDomain already includes .myshopify.com
  const shopName = shopDomain.replace(/\.myshopify\.com$/, '');

  const client = new ShopifyClient(shopName, accessToken);

  const params = {
    status: 'any',
    created_at_min: startISO,
    created_at_max: endISO,
    limit: 250,
  };

  const orders = await client.getOrders(params);
  return orders;
}


module.exports = { ShopifyClient, getShopifyOrders };

