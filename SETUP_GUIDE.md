# Setup Guide for Inventory Feed & Model Profitability

## Overview

Your sales pipeline now supports **Amazon Multi-Channel Fulfillment (MCF)** workflows with two powerful features:

1. **Inventory Feed** - Track Amazon FBA/MCF inventory levels, calculate weeks of supply, and get reorder date recommendations
2. **Model Profitability** - Analyze transaction-level profitability with actual marketplace fees from Amazon and Shopify

## Amazon MCF Architecture

This pipeline is designed for businesses using Amazon to fulfill both Amazon.com orders and Shopify orders:

- **Inventory**: All inventory is stored in Amazon FBA and tracked via Amazon SP-API
- **Orders**: Orders come from both Shopify (fulfilled by Amazon MCF) and Amazon.com
- **Fees**: Actual marketplace fees are automatically captured:
  - **Amazon**: FBA fees, referral fees, storage fees (from Financial Events API)
  - **Shopify**: Transaction fees, payment processing fees
- **Profitability**: Net profit includes all actual costs and fees

## What's New

### New Sheets Created

When you run `npm run init:sheets`, the following new sheets will be created:

1. **Inventory_Feed** - Auto-populated with Amazon FBA/MCF inventory data and reorder calculations
2. **Model_Profitability** - Auto-populated with profit analysis using actual marketplace fees
3. **Model_Costs** - Manual input: Add your SKU costs here (COGS)

### New Jobs

1. **Inventory Sync** (`src/jobs/sync_inventory.js`)
   - Fetches inventory from Amazon FBA/MCF via SP-API
   - Shows total, fulfillable, inbound, and reserved quantities
   - Calculates average daily sales over the last 30 days (from both Shopify and Amazon orders)
   - Calculates weeks of supply based on fulfillable quantity
   - Generates reorder dates based on:
     - Lead time (14 days default)
     - Safety stock (7 days default)
     - Current fulfillable inventory
     - Sales velocity across all channels

2. **Profitability Sync** (`src/jobs/sync_profitability.js`)
   - Reads all sales from Sales_Fact (with marketplace fees already captured)
   - Joins with Model_Costs for product costs
   - Calculates for each transaction:
     - Revenue (gross - discounts)
     - Total costs (model cost × qty)
     - Gross profit (revenue - costs)
     - Net profit (gross profit - marketplace fees - refunds)
     - Gross and net margin percentages
     - Unit economics (revenue and profit per unit)
   - Provides channel-level profitability breakdown

3. **Enhanced Sales Sync** (`src/jobs/sync_sales.js`)
   - Now fetches Amazon fees from Financial Events API
   - Automatically enriches Amazon orders with actual FBA/referral fees
   - Shopify fees can be populated manually or calculated

### New API Endpoints

- `GET /sync/inventory` - Trigger inventory sync from Amazon
- `GET /sync/profitability` - Trigger profitability calculation

## Quick Start Guide

### Step 1: Ensure Amazon Credentials Are Set

Make sure your `.env` has all Amazon SP-API credentials:

```bash
AMAZON_SELLER_ID=your_seller_id
AMAZON_REFRESH_TOKEN=your_lwa_refresh_token
LWA_CLIENT_ID=amzn1.application-oa2-client.xxxxx
LWA_CLIENT_SECRET=your_lwa_client_secret
AWS_SELLING_PARTNER_ROLE_ARN=arn:aws:iam::XXXXXXXXXXXX:role/YourSpApiRole
AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXXXXX
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
SPAPI_REGION=na
AMAZON_MARKETPLACE_ID=ATVPDKIKX0DER
```

**Note**: You mentioned you'll get these credentials later this week. The inventory and fee features will work once you have them configured.

### Step 2: Initialize New Sheets

```bash
npm run init:sheets
```

This will create/update all sheets including the new ones.

### Step 3: Sync Sales (with Fees)

First, sync your sales data. Amazon fees will be automatically captured:

```bash
# Sync last 7 days from all channels (includes fee capture)
npm run sync:sales -- --days=7
```

This will now:
- Fetch Shopify orders
- Fetch Amazon orders
- **Fetch Amazon fees from Financial Events API**
- Populate Sales_Fact with all data including marketplace fees

### Step 4: Populate Model Costs (Manual)

Open your Google Sheet and go to the **Model_Costs** tab. Add your product costs (COGS):

| sku          | model_cost | notes                    |
|--------------|------------|--------------------------|
| SKU-001      | 12.50      | Standard model           |
| SKU-002      | 8.99       | Promotional model        |
| SKU-003      | 25.00      | Premium model            |

**This is the only manual input required.** Everything else is automated.

### Step 5: Run Inventory Sync

```bash
npm run sync:inventory
```

This will populate the **Inventory_Feed** sheet with:
- Current Amazon FBA/MCF inventory (total, fulfillable, inbound, reserved)
- Average daily sales per SKU (across both Shopify and Amazon orders)
- Weeks of supply remaining
- Recommended reorder dates

### Step 6: Run Profitability Sync

```bash
npm run sync:profitability
```

This will populate the **Model_Profitability** sheet with:
- Revenue and costs per transaction
- Gross and net profit
- Margin percentages
- Unit economics
- Channel breakdown (Shopify vs Amazon profitability)

## How It Works

### Inventory Feed

The inventory feed uses Amazon FBA/MCF as the source of truth:

**Weeks of Supply** = Fulfillable Inventory / (Avg Daily Sales × 7)

**Reorder Date** is calculated based on:
- **Reorder Point** = (Avg Daily Sales × Lead Time Days) + (Avg Daily Sales × Safety Stock Days)
- **Days Until Reorder** = (Fulfillable Inventory - Reorder Point) / Avg Daily Sales

If days until reorder is negative or zero, it shows **"REORDER NOW"**

**Example (Amazon MCF)**:
- SKU has 100 units fulfillable in Amazon FBA
- Average daily sales: 5 units/day (across Shopify + Amazon orders)
- Lead time: 14 days
- Safety stock: 7 days
- Reorder point = (5 × 14) + (5 × 7) = 105 units
- Days until reorder = (100 - 105) / 5 = -1 day → **REORDER NOW**

### Marketplace Fees (Automated)

**Amazon Orders**:
- Fees are automatically fetched from Amazon Financial Events API
- Includes: FBA fees, referral fees, storage fees, etc.
- No manual input required

**Shopify Orders**:
- Currently set to 0 (can be calculated or manually populated)
- Future enhancement: Calculate based on payment processor + Shopify transaction fees

### Model Profitability

The profitability calculation uses actual fees from Sales_Fact:

1. **Revenue** = Item Gross - Item Discount
2. **Total Cost** = Model Cost × Quantity
3. **Gross Profit** = Revenue - Total Cost
4. **Net Profit** = Gross Profit - Marketplace Fees - Refunds
5. **Gross Margin %** = (Gross Profit / Revenue) × 100
6. **Net Margin %** = (Net Profit / Revenue) × 100
7. **Unit Profit** = Net Profit / Quantity

**Example (Amazon Order)**:
- Product sold: 2 units @ $50 each = $100 revenue
- Model cost: $15/unit
- Amazon fees: $18 (from Financial Events API)
- Total cost = 2 × $15 = $30
- Gross profit = $100 - $30 = $70
- Net profit = $70 - $18 = $52
- Net margin = 52%

## Automation

### Via HTTP Server

Start the server:
```bash
npm start
```

Schedule sync calls using cron or a scheduler:

```bash
# Daily at 2 AM: Sync sales (includes fee capture)
curl -H "X-Sync-Token: your-token" \
  "http://localhost:8080/sync?days=2"

# Daily at 3 AM: Sync inventory from Amazon
curl -H "X-Sync-Token: your-token" \
  "http://localhost:8080/sync/inventory"

# Daily at 4 AM: Calculate profitability
curl -H "X-Sync-Token: your-token" \
  "http://localhost:8080/sync/profitability"
```

### Recommended Workflow

1. **Sync Sales** (with fees) → `Sales_Fact` populated
2. **Sync Inventory** (from Amazon) → `Inventory_Feed` populated
3. **Sync Profitability** (using fees from Sales_Fact) → `Model_Profitability` populated

## Customization

### Adjust Inventory Parameters

In `src/jobs/sync_inventory.js`, you can modify:

```javascript
const metrics = calculateInventoryMetrics(
  item.fulfillable_quantity,
  avgDailySales,
  7,  // safety stock days (change this)
  14  // lead time days (change this)
);
```

### Adjust Sales Velocity Lookback

Currently uses 30 days. To change in `src/jobs/sync_inventory.js`:

```javascript
const avgDailySales = await calculateSalesVelocity(item.sku, 30); // change to 60, 90, etc.
```

## Data Flow

```
1. Orders come in from Shopify and Amazon
   ↓
2. Sales Sync captures orders + Amazon fees
   ↓
3. Sales_Fact contains all transactions with fees
   ↓
4. Inventory Sync reads from Amazon FBA/MCF
   ↓
5. Inventory_Feed shows reorder dates
   ↓
6. Profitability Sync calculates profit using actual fees
   ↓
7. Model_Profitability shows margins by channel
```

## Key Insights You Can Now Answer

### Inventory Feed
- Which SKUs are running low in Amazon FBA?
- When should I send more inventory to Amazon?
- What's my inventory turnover rate?
- Which products are selling fastest across all channels?
- How much inventory is in transit vs. fulfillable?

### Model Profitability
- What's my profit margin by SKU?
- Which channel is more profitable (Shopify MCF vs. Amazon.com)?
- What are my actual Amazon FBA/referral fees costing me?
- Which products are most/least profitable?
- What's my average profit per order by channel?
- How much am I paying in total marketplace fees?

## Tips

1. **Keep Model_Costs Updated**: Update your product costs regularly to maintain accurate profitability metrics

2. **Monitor Amazon Fees**: Check the Model_Profitability sheet to see actual Amazon fees per transaction

3. **Run in Sequence**: Always run syncs in order: Sales → Inventory → Profitability

4. **Monitor Reorder Dates**: Check the Inventory_Feed daily to stay on top of reordering needs for Amazon FBA

5. **Compare Channels**: Use the profitability breakdown to understand which channel is more profitable

6. **Track MCF Costs**: Amazon MCF orders (Shopify) vs. FBA orders (Amazon.com) may have different fee structures

## When You Get Amazon Credentials

Once you have your Amazon SP-API credentials (later this week):

1. Add them to your `.env` file
2. Run `npm run sync:sales -- --days=30` to backfill sales with fees
3. Run `npm run sync:inventory` to populate inventory from Amazon
4. Run `npm run sync:profitability` to calculate profit margins

Everything is ready to go - just needs the credentials!

## Need Help?

Common issues:

- **No inventory data**: Ensure Amazon SP-API credentials are set and you have inventory in Amazon FBA
- **No fees showing**: Amazon Financial Events API may have a delay; fees typically appear 1-2 days after order
- **Zero sales velocity**: SKU has no sales in the last 30 days (will show 999 weeks of supply)
- **Missing profitability data**: Ensure Sales_Fact is populated and Model_Costs has data

## Next Steps

Consider adding:
- Shopify transaction fee calculator (based on payment processor)
- Email alerts for low inventory in Amazon FBA
- Automated reorder quantity suggestions
- Trend analysis for sales velocity
- Customer lifetime value calculations
- Storage fee tracking from Amazon

---

Questions? Check the main README.md for full documentation.
