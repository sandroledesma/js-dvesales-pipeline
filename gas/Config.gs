/**
 * Config.gs
 * Centralized configuration management via Script Properties.
 *
 * First-time setup: Extensions > Apps Script > Project Settings > Script Properties
 * Or run setupConfig() to populate via UI prompts.
 *
 * Required properties:
 *   SHOPIFY_STORE_DOMAIN     e.g. mystore.myshopify.com
 *   SHOPIFY_ACCESS_TOKEN     shpat_xxxxx
 *   AMAZON_SELLER_ID
 *   AMAZON_REFRESH_TOKEN     Artz|xxx (LWA refresh token)
 *   LWA_CLIENT_ID
 *   LWA_CLIENT_SECRET
 *   AWS_ACCESS_KEY_ID
 *   AWS_SECRET_ACCESS_KEY
 *   AWS_ROLE_ARN             arn:aws:iam::xxx:role/SellingPartnerAPIRole (optional, for role assumption)
 *   AMAZON_MARKETPLACE_ID    ATVPDKIKX0DER (US default)
 *   SPAPI_REGION             na | eu | fe
 *   GOOGLE_SHEET_ID          (optional; defaults to active spreadsheet)
 */

var CONFIG_KEYS = {
  SHOPIFY_STORE_DOMAIN: 'SHOPIFY_STORE_DOMAIN',
  SHOPIFY_ACCESS_TOKEN: 'SHOPIFY_ACCESS_TOKEN',
  AMAZON_SELLER_ID: 'AMAZON_SELLER_ID',
  AMAZON_REFRESH_TOKEN: 'AMAZON_REFRESH_TOKEN',
  LWA_CLIENT_ID: 'LWA_CLIENT_ID',
  LWA_CLIENT_SECRET: 'LWA_CLIENT_SECRET',
  AWS_ACCESS_KEY_ID: 'AWS_ACCESS_KEY_ID',
  AWS_SECRET_ACCESS_KEY: 'AWS_SECRET_ACCESS_KEY',
  AWS_ROLE_ARN: 'AWS_ROLE_ARN',
  AMAZON_MARKETPLACE_ID: 'AMAZON_MARKETPLACE_ID',
  SPAPI_REGION: 'SPAPI_REGION',
  GOOGLE_SHEET_ID: 'GOOGLE_SHEET_ID',
  SHOPIFY_TRANSACTION_FEE_RATE: 'SHOPIFY_TRANSACTION_FEE_RATE',
  SHOPIFY_TRANSACTION_FEE_FLAT: 'SHOPIFY_TRANSACTION_FEE_FLAT',
};

var SPAPI_ENDPOINTS = {
  na: 'sellingpartnerapi-na.amazon.com',
  eu: 'sellingpartnerapi-eu.amazon.com',
  fe: 'sellingpartnerapi-fe.amazon.com',
};

var MARKETPLACE_REGIONS = {
  ATVPDKIKX0DER: 'na',  // US
  A2EUQ1WTGCTBG2: 'na', // CA
  A1AM78C64UM0Y8: 'na', // MX
  A1RKKUPIHCS9HS: 'eu', // ES
  A13V1IB3VIYZZH: 'eu', // FR
  A1F83G8C2ARO7P: 'eu', // UK
  A1PA6795UKMFR9: 'eu', // DE
  APJ6JRA9NG5V4:  'eu', // IT
  A21TJRUUN4KGV:  'fe', // IN
  A1VC38T7YXB528: 'fe', // JP
  AAHKV2X7AFYLW:  'fe', // CN
};

/**
 * Get a single config value. Throws if required key is missing.
 */
function getConfig(key, required) {
  var props = PropertiesService.getScriptProperties();
  var value = props.getProperty(key);
  if (required !== false && !value) {
    throw new Error('Missing required config: ' + key + '. Set it in Extensions > Apps Script > Project Settings > Script Properties.');
  }
  return value;
}

/**
 * Get all config values as an object.
 */
function getAllConfig() {
  var props = PropertiesService.getScriptProperties();
  return props.getProperties();
}

/**
 * Set a config value programmatically.
 */
function setConfig(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, value);
}

/**
 * Returns the active spreadsheet (or the one specified in config).
 */
function getSpreadsheet() {
  var sheetId = getConfig(CONFIG_KEYS.GOOGLE_SHEET_ID, false);
  if (sheetId) {
    return SpreadsheetApp.openById(sheetId);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * Return the SP-API hostname for the configured region.
 */
function getSpapiEndpoint() {
  var region = getConfig(CONFIG_KEYS.SPAPI_REGION, false) || 'na';
  return SPAPI_ENDPOINTS[region] || SPAPI_ENDPOINTS.na;
}

/**
 * Return the AWS region string used for signing (always us-east-1 for SP-API).
 */
function getAwsRegion() {
  return 'us-east-1';
}

/**
 * UI helper – walk the user through entering credentials.
 * Run once from the Apps Script editor.
 */
function setupConfig() {
  var ui = SpreadsheetApp.getUi();
  var fields = [
    { key: CONFIG_KEYS.SHOPIFY_STORE_DOMAIN,  label: 'Shopify store domain (e.g. mystore.myshopify.com)' },
    { key: CONFIG_KEYS.SHOPIFY_ACCESS_TOKEN,  label: 'Shopify Admin API access token (shpat_...)' },
    { key: CONFIG_KEYS.AMAZON_SELLER_ID,      label: 'Amazon Seller ID' },
    { key: CONFIG_KEYS.AMAZON_REFRESH_TOKEN,  label: 'Amazon LWA Refresh Token' },
    { key: CONFIG_KEYS.LWA_CLIENT_ID,         label: 'Amazon LWA Client ID' },
    { key: CONFIG_KEYS.LWA_CLIENT_SECRET,     label: 'Amazon LWA Client Secret' },
    { key: CONFIG_KEYS.AWS_ACCESS_KEY_ID,     label: 'AWS Access Key ID' },
    { key: CONFIG_KEYS.AWS_SECRET_ACCESS_KEY, label: 'AWS Secret Access Key' },
    { key: CONFIG_KEYS.AWS_ROLE_ARN,          label: 'AWS Role ARN for SP-API (leave blank if not using role)' },
    { key: CONFIG_KEYS.AMAZON_MARKETPLACE_ID, label: 'Amazon Marketplace ID (default: ATVPDKIKX0DER for US)' },
    { key: CONFIG_KEYS.SPAPI_REGION,          label: 'SP-API region: na | eu | fe (default: na)' },
  ];

  var props = PropertiesService.getScriptProperties();

  for (var i = 0; i < fields.length; i++) {
    var f = fields[i];
    var existing = props.getProperty(f.key) || '';
    var hint = existing ? ' [current: ' + existing.substring(0, 6) + '***]' : '';
    var result = ui.prompt(
      'Setup (' + (i + 1) + '/' + fields.length + ')',
      f.label + hint + '\n(Press Cancel to skip this field)',
      ui.ButtonSet.OK_CANCEL
    );
    if (result.getSelectedButton() === ui.Button.OK) {
      var val = result.getResponseText().trim();
      if (val) props.setProperty(f.key, val);
    }
  }

  // Set defaults
  if (!props.getProperty(CONFIG_KEYS.AMAZON_MARKETPLACE_ID)) {
    props.setProperty(CONFIG_KEYS.AMAZON_MARKETPLACE_ID, 'ATVPDKIKX0DER');
  }
  if (!props.getProperty(CONFIG_KEYS.SPAPI_REGION)) {
    props.setProperty(CONFIG_KEYS.SPAPI_REGION, 'na');
  }
  if (!props.getProperty(CONFIG_KEYS.SHOPIFY_TRANSACTION_FEE_RATE)) {
    props.setProperty(CONFIG_KEYS.SHOPIFY_TRANSACTION_FEE_RATE, '0.029');
  }
  if (!props.getProperty(CONFIG_KEYS.SHOPIFY_TRANSACTION_FEE_FLAT)) {
    props.setProperty(CONFIG_KEYS.SHOPIFY_TRANSACTION_FEE_FLAT, '0.30');
  }

  ui.alert('Setup complete! You can now run the sync functions from the DVE Sales menu.');
}
