require('dotenv').config();

const http = require('http');
const url = require('url');
const syncSales = require('./jobs/sync_sales');
const syncInventory = require('./jobs/sync_inventory');
const syncProfitability = require('./jobs/sync_profitability');
const syncModelCosts = require('./jobs/sync_model_costs');

const PORT = process.env.PORT || 8080;
const SYNC_TOKEN = process.env.SYNC_TOKEN;

if (!SYNC_TOKEN) {
  console.error('Error: SYNC_TOKEN environment variable is required');
  process.exit(1);
}

// Simple concurrency lock
let isRunning = false;

/**
 * Parse query string from URL
 */
function parseQuery(requestUrl) {
  const parsedUrl = url.parse(requestUrl, true);
  return parsedUrl.query;
}

/**
 * Verify authentication token
 */
function verifyToken(req, query) {
  const headerToken = req.headers['x-sync-token'];
  const queryToken = query.token;
  return headerToken === SYNC_TOKEN || queryToken === SYNC_TOKEN;
}

/**
 * Send JSON response
 */
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Handle /sync endpoint (sales sync)
 */
async function handleSync(req, res, query) {
  // Check authentication
  if (!verifyToken(req, query)) {
    return sendJson(res, 401, { ok: false, error: 'Unauthorized: invalid or missing token' });
  }

  // Check concurrency lock
  if (isRunning) {
    return sendJson(res, 409, { ok: false, error: 'Sync already in progress' });
  }

  try {
    isRunning = true;

    // Build options from query params
    const options = {};
    if (query.days) {
      options.days = query.days;
    }
    if (query.start && query.end) {
      options.start = query.start;
      options.end = query.end;
    }
    if (query.channels) {
      options.channels = query.channels;
    }

    console.log(`[${new Date().toISOString()}] Starting sync with options:`, options);

    // Call sync function
    const result = await syncSales(options);

    console.log(`[${new Date().toISOString()}] Sync completed successfully`);

    sendJson(res, 200, {
      ok: true,
      appended: result?.appended || 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Sync failed:`, error.message);
    sendJson(res, 500, {
      ok: false,
      error: error.message,
    });
  } finally {
    isRunning = false;
  }
}

/**
 * Handle /sync/inventory endpoint
 */
async function handleInventorySync(req, res, query) {
  // Check authentication
  if (!verifyToken(req, query)) {
    return sendJson(res, 401, { ok: false, error: 'Unauthorized: invalid or missing token' });
  }

  // Check concurrency lock
  if (isRunning) {
    return sendJson(res, 409, { ok: false, error: 'Sync already in progress' });
  }

  try {
    isRunning = true;

    console.log(`[${new Date().toISOString()}] Starting inventory sync`);

    // Call inventory sync function
    const result = await syncInventory();

    console.log(`[${new Date().toISOString()}] Inventory sync completed successfully`);

    sendJson(res, 200, {
      ok: true,
      updated: result?.updated || 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Inventory sync failed:`, error.message);
    sendJson(res, 500, {
      ok: false,
      error: error.message,
    });
  } finally {
    isRunning = false;
  }
}

/**
 * Handle /sync/profitability endpoint
 */
async function handleProfitabilitySync(req, res, query) {
  // Check authentication
  if (!verifyToken(req, query)) {
    return sendJson(res, 401, { ok: false, error: 'Unauthorized: invalid or missing token' });
  }

  // Check concurrency lock
  if (isRunning) {
    return sendJson(res, 409, { ok: false, error: 'Sync already in progress' });
  }

  try {
    isRunning = true;

    console.log(`[${new Date().toISOString()}] Starting profitability sync`);

    // Call profitability sync function
    const result = await syncProfitability();

    console.log(`[${new Date().toISOString()}] Profitability sync completed successfully`);

    sendJson(res, 200, {
      ok: true,
      updated: result?.updated || 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Profitability sync failed:`, error.message);
    sendJson(res, 500, {
      ok: false,
      error: error.message,
    });
  } finally {
    isRunning = false;
  }
}

/**
 * Handle /sync/model-costs endpoint
 */
async function handleModelCostsSync(req, res, query) {
  // Check authentication
  if (!verifyToken(req, query)) {
    return sendJson(res, 401, { ok: false, error: 'Unauthorized: invalid or missing token' });
  }

  // Check concurrency lock
  if (isRunning) {
    return sendJson(res, 409, { ok: false, error: 'Sync already in progress' });
  }

  try {
    isRunning = true;

    console.log(`[${new Date().toISOString()}] Starting model costs sync`);

    // Call model costs sync function
    const result = await syncModelCosts();

    console.log(`[${new Date().toISOString()}] Model costs sync completed successfully`);

    sendJson(res, 200, {
      ok: true,
      updated: result?.updated || 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Model costs sync failed:`, error.message);
    sendJson(res, 500, {
      ok: false,
      error: error.message,
    });
  } finally {
    isRunning = false;
  }
}

/**
 * Request handler
 */
async function requestHandler(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  // Only support GET method
  if (req.method !== 'GET') {
    return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  }

  // Route handling
  if (pathname === '/sync') {
    return await handleSync(req, res, query);
  }

  if (pathname === '/sync/inventory') {
    return await handleInventorySync(req, res, query);
  }

  if (pathname === '/sync/profitability') {
    return await handleProfitabilitySync(req, res, query);
  }

  if (pathname === '/sync/model-costs') {
    return await handleModelCostsSync(req, res, query);
  }

  if (pathname === '/health' || pathname === '/') {
    return sendJson(res, 200, { ok: true, status: 'healthy', running: isRunning });
  }

  // 404 for unknown routes
  sendJson(res, 404, { ok: false, error: 'Not found' });
}

// Create and start server
const server = http.createServer(requestHandler);

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Endpoints:`);
  console.log(`  GET /sync?days=7`);
  console.log(`  GET /sync?start=YYYY-MM-DD&end=YYYY-MM-DD`);
  console.log(`  GET /sync?days=7&channels=shopify,amazon`);
  console.log(`  GET /sync/inventory`);
  console.log(`  GET /sync/profitability`);
  console.log(`  GET /sync/model-costs`);
  console.log(`  GET /health`);
  console.log(`Authentication: X-Sync-Token header or ?token=... query param`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = server;

