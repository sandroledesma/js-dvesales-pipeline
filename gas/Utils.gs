/**
 * Utils.gs
 * Date helpers, HTTP retry logic, hex encoding, and AWS Signature Version 4.
 */

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Returns an ISO-8601 date string N days ago (UTC midnight).
 */
function daysAgoISO(n) {
  var d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Format a Date as YYYY-MM-DD in UTC.
 */
function toDateStr(date) {
  return Utilities.formatDate(date, 'UTC', 'yyyy-MM-dd');
}

/**
 * Parse an ISO string and return a Date.
 */
function parseISO(str) {
  return new Date(str);
}

/**
 * Get ISO week number (1-53) for a date.
 */
function isoWeek(date) {
  var d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  var dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/**
 * Get quarter (1-4) for a date.
 */
function quarter(date) {
  return Math.floor(date.getUTCMonth() / 3) + 1;
}

// ---------------------------------------------------------------------------
// Byte / hex helpers (needed for AWS Sig v4)
// ---------------------------------------------------------------------------

/**
 * Convert a byte array (from Utilities.computeDigest / computeHmac) to hex string.
 */
function bytesToHex(bytes) {
  return bytes.map(function(b) {
    return ('0' + (b & 0xff).toString(16)).slice(-2);
  }).join('');
}

/**
 * SHA-256 hex digest of a string.
 */
function sha256Hex(str) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    str,
    Utilities.Charset.UTF_8
  );
  return bytesToHex(bytes);
}

/**
 * HMAC-SHA256 returning a byte array.
 * GAS signature: computeHmacSha256Signature(value, key) — key can be byte array.
 */
function hmacSha256Bytes(key, msg) {
  return Utilities.computeHmacSha256Signature(
    Utilities.newBlob(msg, 'text/plain').getBytes(),
    typeof key === 'string' ? Utilities.newBlob(key, 'text/plain').getBytes() : key
  );
}

/**
 * HMAC-SHA256 returning a hex string.
 */
function hmacSha256Hex(key, msg) {
  return bytesToHex(hmacSha256Bytes(key, msg));
}

// ---------------------------------------------------------------------------
// AWS Signature Version 4
// ---------------------------------------------------------------------------

/**
 * Build an Authorization header and signed headers for an AWS SP-API request.
 *
 * @param {string} method      HTTP method (GET, POST, etc.)
 * @param {string} host        Hostname (e.g. sellingpartnerapi-na.amazon.com)
 * @param {string} path        URL path (e.g. /orders/v0/orders)
 * @param {Object} queryParams Key/value query parameters (already decided, no encoding needed here)
 * @param {Object} extraHeaders Additional headers to sign (e.g. x-amz-security-token)
 * @param {string} body        Request body ('' for GET)
 * @param {string} accessKey
 * @param {string} secretKey
 * @param {string} sessionToken  (optional, for temporary credentials)
 * @param {string} region       AWS region (us-east-1)
 * @param {string} service      AWS service (execute-api for SP-API)
 * @returns {Object} headers object ready to pass to UrlFetchApp
 */
function awsSigV4Headers(method, host, path, queryParams, extraHeaders, body,
                          accessKey, secretKey, sessionToken, region, service) {
  region  = region  || 'us-east-1';
  service = service || 'execute-api';
  body    = body    || '';

  var now = new Date();
  var amzDate  = Utilities.formatDate(now, 'UTC', "yyyyMMdd'T'HHmmss'Z'");
  var dateStamp = Utilities.formatDate(now, 'UTC', 'yyyyMMdd');

  // --- Canonical query string ---
  var sortedParams = Object.keys(queryParams || {}).sort();
  var canonicalQuerystring = sortedParams.map(function(k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(queryParams[k]);
  }).join('&');

  // --- Canonical headers ---
  var headers = Object.assign({}, extraHeaders || {});
  headers['host']       = host;
  headers['x-amz-date'] = amzDate;
  if (sessionToken) headers['x-amz-security-token'] = sessionToken;

  var sortedHeaderKeys = Object.keys(headers).sort(function(a, b) {
    return a.toLowerCase().localeCompare(b.toLowerCase());
  });
  var canonicalHeaders = sortedHeaderKeys.map(function(k) {
    return k.toLowerCase() + ':' + headers[k].trim();
  }).join('\n') + '\n';
  var signedHeaders = sortedHeaderKeys.map(function(k) { return k.toLowerCase(); }).join(';');

  // --- Payload hash ---
  var payloadHash = sha256Hex(body);

  // --- Canonical request ---
  var canonicalRequest = [
    method,
    path,
    canonicalQuerystring,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');

  // --- String to sign ---
  var credentialScope = dateStamp + '/' + region + '/' + service + '/aws4_request';
  var stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join('\n');

  // --- Signing key ---
  var kDate    = hmacSha256Bytes('AWS4' + secretKey, dateStamp);
  var kRegion  = hmacSha256Bytes(kDate, region);
  var kService = hmacSha256Bytes(kRegion, service);
  var kSigning = hmacSha256Bytes(kService, 'aws4_request');

  var signature = hmacSha256Hex(kSigning, stringToSign);

  // --- Authorization header ---
  var authHeader = 'AWS4-HMAC-SHA256 Credential=' + accessKey + '/' + credentialScope +
    ', SignedHeaders=' + signedHeaders +
    ', Signature=' + signature;

  var finalHeaders = {};
  sortedHeaderKeys.forEach(function(k) { finalHeaders[k] = headers[k]; });
  finalHeaders['Authorization'] = authHeader;

  return finalHeaders;
}

// ---------------------------------------------------------------------------
// HTTP with retry
// ---------------------------------------------------------------------------

/**
 * Fetch a URL with exponential backoff retry (handles 429 and 5xx).
 * @param {string} url
 * @param {Object} options  UrlFetchApp options
 * @param {number} maxTries
 * @returns {HTTPResponse}
 */
function fetchWithRetry(url, options, maxTries) {
  maxTries = maxTries || 4;
  options = Object.assign({ muteHttpExceptions: true }, options);

  var delay = 1000;
  for (var attempt = 1; attempt <= maxTries; attempt++) {
    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();

    if (code === 200 || code === 201) return response;

    // 429 rate limit or 5xx server error → retry
    if ((code === 429 || code >= 500) && attempt < maxTries) {
      Logger.log('HTTP ' + code + ' on attempt ' + attempt + '. Retrying in ' + (delay / 1000) + 's…');
      Utilities.sleep(delay);
      delay *= 2;
      continue;
    }

    // Non-retryable error
    throw new Error('HTTP ' + code + ' from ' + url + ': ' + response.getContentText().substring(0, 500));
  }
}

/**
 * Parse JSON from an HTTPResponse, with a helpful error on failure.
 */
function parseJson(response) {
  try {
    return JSON.parse(response.getContentText());
  } catch (e) {
    throw new Error('JSON parse error: ' + response.getContentText().substring(0, 300));
  }
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

/**
 * Safe number coercion — returns 0 if NaN or null.
 */
function num(v) {
  var n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

/**
 * Format a number as currency string.
 */
function fmtCurrency(v) {
  return num(v).toFixed(2);
}

/**
 * Deduplicate an array of objects by a key function.
 */
function dedupeBy(arr, keyFn) {
  var seen = {};
  return arr.filter(function(item) {
    var k = keyFn(item);
    if (seen[k]) return false;
    seen[k] = true;
    return true;
  });
}

/**
 * Log with timestamp to Apps Script Logger.
 */
function log(msg) {
  Logger.log('[' + new Date().toISOString() + '] ' + msg);
}
