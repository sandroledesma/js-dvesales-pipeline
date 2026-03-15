# DVE Sales Pipeline — Google Apps Script Setup Guide

A serverless Shopify + Amazon → Google Sheets dashboard, built entirely in Google Apps Script.
No server, no Node.js, no cron jobs — everything runs inside your spreadsheet.

---

## Architecture

```
Google Sheets Spreadsheet
├── Dashboard         ← Auto-calculated KPIs + weekly trend (formulas)
├── Sales_Fact        ← All orders, line-item level (Shopify + Amazon)
├── Inventory_Feed    ← Amazon FBA inventory + reorder flags
├── Model_Profitability ← Profit calculations (rebuilt from Sales_Fact)
└── Model_Costs       ← Manual cost input (SKU → unit cost)

Apps Script Files
├── Code.gs           ← Menu, triggers, orchestration
├── Config.gs         ← Script Properties wrapper + setup wizard
├── Utils.gs          ← Date helpers, AWS Sig v4, HTTP retry
├── ShopifyClient.gs  ← Shopify Admin REST API
├── AmazonClient.gs   ← Amazon SP-API (LWA + Sig v4)
├── SheetsHelper.gs   ← Sheet read/write/format utilities
├── SyncSales.gs      ← Sync sales → Sales_Fact
├── SyncInventory.gs  ← Sync FBA inventory → Inventory_Feed
├── SyncProfitability.gs ← Rebuild Model_Profitability
└── InitDashboard.gs  ← Workbook structure + Dashboard formulas
```

---

## Step 1 — Create the Google Sheets file

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet.
2. Name it something like **"DVE Sales Pipeline"**.
3. Note the **Spreadsheet ID** from the URL:
   `https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit`

---

## Step 2 — Open the Apps Script editor

**Option A — Paste manually (no CLASP needed):**

1. In your spreadsheet: **Extensions → Apps Script**
2. Delete the default `Code.gs` content
3. For each `.gs` file in this folder, create a new script file with the same name and paste its contents
4. Also replace `appsscript.json` (View → Show manifest file in left sidebar)

**Option B — Deploy via CLASP (command line):**

```bash
# Install CLASP globally
npm install -g @google/clasp

# Log in to Google
clasp login

# Clone your script (get Script ID from Apps Script URL)
# URL format: https://script.google.com/home/projects/SCRIPT_ID/edit
clasp clone SCRIPT_ID --rootDir ./gas

# Or create a brand-new bound script
# First, open the spreadsheet > Extensions > Apps Script, then copy the Script ID

# Push all files
cd gas
clasp push
```

---

## Step 3 — Enter credentials

In the Apps Script editor, run `setupConfig()` **OR** go to:

**Project Settings → Script Properties** and add these keys manually:

| Key | Value |
|-----|-------|
| `SHOPIFY_STORE_DOMAIN` | `mystore.myshopify.com` |
| `SHOPIFY_ACCESS_TOKEN` | `shpat_xxxxxxxx` |
| `AMAZON_SELLER_ID` | Your Seller ID |
| `AMAZON_REFRESH_TOKEN` | LWA refresh token (`Artz|...`) |
| `LWA_CLIENT_ID` | App client ID |
| `LWA_CLIENT_SECRET` | App client secret |
| `AWS_ACCESS_KEY_ID` | IAM user access key |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret key |
| `AWS_ROLE_ARN` | `arn:aws:iam::xxx:role/SPAPIRole` *(optional)* |
| `AMAZON_MARKETPLACE_ID` | `ATVPDKIKX0DER` (US) |
| `SPAPI_REGION` | `na` |
| `SHOPIFY_TRANSACTION_FEE_RATE` | `0.029` |
| `SHOPIFY_TRANSACTION_FEE_FLAT` | `0.30` |

### Getting Shopify credentials
- Go to your Shopify admin → **Apps → Develop apps**
- Create a private app with **Orders (read)**, **Products (read)** scopes
- Copy the Admin API access token

### Getting Amazon SP-API credentials
See the [AMAZON_CREDENTIALS_GUIDE.md](../AMAZON_CREDENTIALS_GUIDE.md) in this repo.
Short version:
1. Register as a developer at [developer.amazon.com](https://developer.amazon.com)
2. Create a Self-Authorized SP-API app
3. Authorize it with your seller account → get the refresh token
4. Create an IAM user + role with `AmazonSellingPartnerAPIFullAccess` policy

---

## Step 4 — Initialise the workbook

Back in your spreadsheet, **refresh the page** to load the custom menu, then:

1. **DVE Sales → Setup → Initialise Workbook (first run)**
   - Creates all tabs with correct headers and formatting
   - Builds the Dashboard tab with live formulas

2. **DVE Sales → Setup → Seed Model Costs from SKUs**
   - Populates the `Model_Costs` tab with all SKUs
   - Then manually fill in the `unit_cost` column

---

## Step 5 — Run your first sync

1. **DVE Sales → 🚀 Run Full Sync (35 days)**
   - Pulls 35 days of Shopify orders + Amazon orders
   - Fetches Amazon FBA inventory
   - Calculates profitability

2. Check the **Dashboard** tab for KPIs

---

## Step 6 — Set up automatic triggers

1. **DVE Sales → Triggers → Install Daily Sync Trigger**
   - Runs a full sync every day at ~6 AM

Or for more frequent updates:
- **DVE Sales → Triggers → Install Hourly Sales Trigger**
  - Syncs last 24 hours of sales every hour (no inventory)

---

## Tabs Reference

### Sales_Fact
One row per order line item. Never edit manually — data is managed by sync.

| Column | Field |
|--------|-------|
| A | date |
| B | channel (shopify / amazon) |
| C | order_id |
| D | line_id |
| E | order_number |
| F | sku |
| G | product_name |
| H | variant |
| I | quantity |
| J | unit_price |
| K | gross_revenue |
| L | discounts |
| M | net_revenue |
| N | fee_fulfillment |
| O | fee_referral |
| P | fee_transaction |
| Q | fee_storage |
| R | fee_other |
| S | currency |
| T | region |
| U | year |
| V | quarter |
| W | iso_week |
| X | month |
| Y-AE | customer info |
| AF | financial_status |

### Model_Costs
**Edit this tab manually.** Add your unit COGS per SKU.

### Dashboard
Live formulas — do not edit cells with formulas. Refreshes automatically.

---

## Troubleshooting

**"Missing required config" error**
→ Open Apps Script editor, run `setupConfig()` or add Script Properties manually.

**"HTTP 403" from Amazon**
→ Your IAM credentials or role ARN are incorrect. Check `AMAZON_CREDENTIALS_GUIDE.md`.

**"HTTP 401" from Shopify**
→ Your access token is expired or has incorrect scopes.

**Execution time exceeded (6 min limit)**
→ GAS has a 6-minute execution limit. If syncing many orders, use smaller date ranges or run channels separately via the sub-menus.

**Trigger not firing**
→ GAS triggers run on Google's servers in the script owner's account. Ensure the script is saved and the trigger appears under **DVE Sales → Triggers → List Active Triggers**.
