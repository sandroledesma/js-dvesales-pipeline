/**
 * Code.gs
 * Main entry point for the DVE Sales Pipeline Google Apps Script.
 *
 * Responsibilities:
 *  - onOpen(): Add "DVE Sales" custom menu to the spreadsheet
 *  - Trigger management: install/remove time-based triggers
 *  - Top-level runner functions (called by menu or triggers)
 */

// ---------------------------------------------------------------------------
// Custom menu
// ---------------------------------------------------------------------------

/**
 * Runs automatically when the spreadsheet is opened.
 * Adds the DVE Sales menu.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('DVE Sales')
    .addItem('🚀 Run Full Sync (35 days)', 'menuFullSync')
    .addSeparator()
    .addSubMenu(SpreadsheetApp.getUi().createMenu('Sync')
      .addItem('Sync Sales (35 days)', 'menuSyncSales')
      .addItem('Sync Sales — Custom Date Range…', 'syncSalesPrompt')
      .addItem('Sync Shopify Only', 'menuSyncShopify')
      .addItem('Sync Amazon Only', 'menuSyncAmazon')
      .addItem('Sync Inventory', 'menuSyncInventory')
      .addItem('Rebuild Profitability', 'menuSyncProfitability')
    )
    .addSubMenu(SpreadsheetApp.getUi().createMenu('Setup')
      .addItem('📋 Initialise Workbook (first run)', 'initAll')
      .addItem('🔑 Enter Credentials…', 'setupConfig')
      .addItem('🌱 Seed Model Costs from SKUs', 'seedModelCosts')
      .addItem('🔄 Rebuild Dashboard', 'buildDashboard')
    )
    .addSubMenu(SpreadsheetApp.getUi().createMenu('Triggers')
      .addItem('⏰ Install Daily Sync Trigger', 'installDailyTrigger')
      .addItem('⏰ Install Hourly Sales Trigger', 'installHourlyTrigger')
      .addItem('🗑️  Remove All Triggers', 'removeAllTriggers')
      .addItem('📋 List Active Triggers', 'listTriggers')
    )
    .addToUi();
}

// ---------------------------------------------------------------------------
// Menu action wrappers
// (thin wrappers so menu items show friendly names in execution logs)
// ---------------------------------------------------------------------------

function menuFullSync() {
  var ui = SpreadsheetApp.getUi();
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    ss.toast('Starting full sync (sales + inventory + profitability)…', 'DVE Sales', -1);

    var salesCount = syncSales(35, 'shopify,amazon');
    ss.toast('Sales synced (' + salesCount + ' new rows). Syncing inventory…', 'DVE Sales', -1);

    var invCount = syncInventory();
    ss.toast('Inventory synced (' + invCount + ' SKUs). Rebuilding profitability…', 'DVE Sales', -1);

    syncProfitability();
    ss.toast('Full sync complete!', 'DVE Sales', 5);
  } catch (e) {
    ui.alert('Sync Error', e.message, ui.ButtonSet.OK);
    log('menuFullSync error: ' + e.message + '\n' + e.stack);
  }
}

function menuSyncSales() {
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast('Syncing sales (35 days)…', 'DVE Sales', -1);
    var count = syncSales(35, 'shopify,amazon');
    SpreadsheetApp.getActiveSpreadsheet().toast('Done! ' + count + ' new rows added.', 'DVE Sales', 5);
  } catch (e) {
    SpreadsheetApp.getUi().alert('Error: ' + e.message);
  }
}

function menuSyncShopify() {
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast('Syncing Shopify…', 'DVE Sales', -1);
    var count = syncSales(35, 'shopify');
    SpreadsheetApp.getActiveSpreadsheet().toast('Done! ' + count + ' new Shopify rows.', 'DVE Sales', 5);
  } catch (e) {
    SpreadsheetApp.getUi().alert('Error: ' + e.message);
  }
}

function menuSyncAmazon() {
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast('Syncing Amazon…', 'DVE Sales', -1);
    var count = syncSales(35, 'amazon');
    SpreadsheetApp.getActiveSpreadsheet().toast('Done! ' + count + ' new Amazon rows.', 'DVE Sales', 5);
  } catch (e) {
    SpreadsheetApp.getUi().alert('Error: ' + e.message);
  }
}

function menuSyncInventory() {
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast('Syncing Amazon inventory…', 'DVE Sales', -1);
    var count = syncInventory();
    SpreadsheetApp.getActiveSpreadsheet().toast('Done! ' + count + ' SKUs updated.', 'DVE Sales', 5);
  } catch (e) {
    SpreadsheetApp.getUi().alert('Error: ' + e.message);
  }
}

function menuSyncProfitability() {
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast('Rebuilding profitability…', 'DVE Sales', -1);
    var count = syncProfitability();
    SpreadsheetApp.getActiveSpreadsheet().toast('Done! ' + count + ' rows written.', 'DVE Sales', 5);
  } catch (e) {
    SpreadsheetApp.getUi().alert('Error: ' + e.message);
  }
}

// ---------------------------------------------------------------------------
// Trigger-called functions
// (must be top-level named functions — triggers can't call anonymous fns)
// ---------------------------------------------------------------------------

/**
 * Called by the daily time-based trigger.
 * Runs the full sync pipeline.
 */
function triggerDailySync() {
  log('=== triggerDailySync fired');
  try {
    syncSales(2, 'shopify,amazon');   // last 2 days for daily catch-up
    syncInventory();
    syncProfitability();
    log('=== triggerDailySync complete');
  } catch (e) {
    log('triggerDailySync ERROR: ' + e.message + '\n' + e.stack);
    // Optionally send email alert
    sendErrorEmail('DVE Sales: Daily sync failed', e.message + '\n\n' + e.stack);
  }
}

/**
 * Called by the hourly time-based trigger (sales only, no inventory).
 */
function triggerHourlySalesSync() {
  log('=== triggerHourlySalesSync fired');
  try {
    syncSales(1, 'shopify,amazon');
    log('=== triggerHourlySalesSync complete');
  } catch (e) {
    log('triggerHourlySalesSync ERROR: ' + e.message);
  }
}

// ---------------------------------------------------------------------------
// Trigger management
// ---------------------------------------------------------------------------

var DAILY_TRIGGER_HANDLER  = 'triggerDailySync';
var HOURLY_TRIGGER_HANDLER = 'triggerHourlySalesSync';

/**
 * Install a daily trigger that fires at 6 AM in the spreadsheet timezone.
 */
function installDailyTrigger() {
  removeTriggersByHandler(DAILY_TRIGGER_HANDLER);

  ScriptApp.newTrigger(DAILY_TRIGGER_HANDLER)
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .create();

  log('Installed daily trigger for ' + DAILY_TRIGGER_HANDLER + ' at 6 AM');
  SpreadsheetApp.getUi().alert('Daily sync trigger installed (runs at ~6 AM every day).');
}

/**
 * Install an hourly trigger for sales only.
 */
function installHourlyTrigger() {
  removeTriggersByHandler(HOURLY_TRIGGER_HANDLER);

  ScriptApp.newTrigger(HOURLY_TRIGGER_HANDLER)
    .timeBased()
    .everyHours(1)
    .create();

  log('Installed hourly trigger for ' + HOURLY_TRIGGER_HANDLER);
  SpreadsheetApp.getUi().alert('Hourly sales sync trigger installed.');
}

/**
 * Remove all project triggers.
 */
function removeAllTriggers() {
  var ui = SpreadsheetApp.getUi();
  var result = ui.alert('Remove Triggers', 'Remove ALL time-based triggers?', ui.ButtonSet.YES_NO);
  if (result !== ui.Button.YES) return;

  ScriptApp.getProjectTriggers().forEach(function(t) {
    ScriptApp.deleteTrigger(t);
  });
  log('All triggers removed');
  ui.alert('All triggers removed.');
}

/**
 * List active triggers in an alert.
 */
function listTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  if (triggers.length === 0) {
    SpreadsheetApp.getUi().alert('No active triggers.');
    return;
  }
  var msg = triggers.map(function(t) {
    return '• ' + t.getHandlerFunction() + ' (' + t.getTriggerSourceId() + ')';
  }).join('\n');
  SpreadsheetApp.getUi().alert('Active Triggers (' + triggers.length + '):\n\n' + msg);
}

/**
 * Remove triggers for a specific handler function name.
 */
function removeTriggersByHandler(handlerName) {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === handlerName) {
      ScriptApp.deleteTrigger(t);
    }
  });
}

// ---------------------------------------------------------------------------
// Error notifications
// ---------------------------------------------------------------------------

/**
 * Send a basic email alert on trigger failures.
 * Uses the script owner's email.
 */
function sendErrorEmail(subject, body) {
  try {
    var email = Session.getEffectiveUser().getEmail();
    if (email) {
      GmailApp.sendEmail(email, subject, body);
    }
  } catch (e) {
    log('Could not send error email: ' + e.message);
  }
}
