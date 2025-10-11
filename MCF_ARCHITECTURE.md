# Amazon MCF Architecture Summary

## Overview

Your sales pipeline has been updated to fully support **Amazon Multi-Channel Fulfillment (MCF)** workflows where:
- All inventory is stored in Amazon FBA
- Orders come from both Shopify (fulfilled by Amazon MCF) and Amazon.com
- Actual marketplace fees are automatically captured from both platforms

## What Changed

### ✅ Inventory Now Comes from Amazon SP-API

**Before**: Inventory was fetched from Shopify  
**Now**: Inventory is fetched from Amazon FBA/MCF via SP-API

**New Features**:
- Shows fulfillable, inbound, and reserved quantities
- Tracks inventory across all fulfillment types (FBA and MCF)
- Uses FNSKU and ASIN identifiers
- Calculates weeks of supply based on sales from both channels

### ✅ Fees Are Automatically Captured

**Before**: Fees required manual input  
**Now**: Fees are automatically fetched from Amazon Financial Events API

**Amazon Orders**:
- FBA fees
- Referral fees
- Storage fees
- All captured automatically during sales sync

**Shopify Orders**:
- Can be calculated or manually populated in Sales_Fact
- Future enhancement opportunity

### ✅ Profitability Uses Actual Fees

**Before**: Required manual shipment cost input  
**Now**: Uses actual marketplace fees from Sales_Fact

**Benefits**:
- No manual input required for fees
- Accurate profit margins per transaction
- Channel-level profitability comparison
- Real-time visibility into Amazon fees

## Architecture Diagram

```
┌──────────────────────────────────────────────────────┐
│                   SALES SOURCES                       │
│                                                       │
│  Shopify Orders          Amazon Orders               │
│  (fulfilled by MCF)      (fulfilled by FBA)          │
└───────────┬──────────────────────┬───────────────────┘
            │                      │
            ▼                      ▼
    ┌───────────────┐      ┌──────────────┐
    │ Sales Sync    │      │ Sales Sync   │
    │               │      │ + Fees API   │
    └───────┬───────┘      └──────┬───────┘
            │                     │
            │  ┌──────────────────┘
            │  │
            ▼  ▼
    ┌─────────────────┐
    │   Sales_Fact    │
    │  (with fees)    │
    └─────────────────┘
            │
            ├──────────────────────┐
            │                      │
            ▼                      ▼
    ┌──────────────┐      ┌──────────────┐
    │ Profitability│      │   Reports    │
    │    Sync      │      │   Analytics  │
    └──────────────┘      └──────────────┘

┌──────────────────────────────────────────────────────┐
│              INVENTORY SOURCE                         │
│                                                       │
│               Amazon FBA/MCF                          │
│     (single source of truth for inventory)           │
└───────────────────────┬──────────────────────────────┘
                        │
                        ▼
                ┌───────────────┐
                │  Inventory    │
                │    Sync       │
                └───────┬───────┘
                        │
                        ▼
                ┌───────────────┐
                │ Inventory_Feed│
                │ (reorder      │
                │  tracking)    │
                └───────────────┘
```

## Key Files Modified

### 1. `src/clients/amazon.js`
**Added**:
- `getAmazonInventory()` - Fetch inventory from FBA/MCF
- `getAmazonFinancialEvents()` - Fetch marketplace fees

### 2. `src/jobs/sync_inventory.js`
**Changed**: Now uses Amazon SP-API instead of Shopify
- Fetches from Amazon FBA/MCF
- Shows fulfillable, inbound, reserved quantities
- Calculates sales velocity from both Shopify and Amazon orders

### 3. `src/jobs/sync_sales.js`
**Enhanced**: Now captures Amazon fees automatically
- Fetches financial events during sales sync
- Enriches Amazon orders with actual fees
- Stores fees in Sales_Fact

### 4. `src/jobs/sync_profitability.js`
**Simplified**: Uses fees directly from Sales_Fact
- No manual shipment cost input needed
- Reads marketplace fees from Sales_Fact
- Calculates profit using actual fees
- Provides channel breakdown

### 5. `src/jobs/init_sheets.js`
**Updated**: New sheet structure
- Inventory_Feed columns updated for Amazon data
- Model_Profitability columns updated for fee breakdown
- Removed Shipment_Costs sheet (no longer needed)

## New Sheet Structures

### Inventory_Feed (13 columns)
```
A: last_updated
B: sku (your SKU)
C: fnsku (Amazon's fulfillment SKU)
D: asin (Amazon product identifier)
E: product_name
F: condition
G: total_quantity (all inventory)
H: fulfillable_quantity (available to sell)
I: inbound_quantity (in transit to Amazon)
J: reserved_quantity (reserved for orders)
K: avg_daily_sales (last 30 days, all channels)
L: weeks_of_supply
M: reorder_date
```

### Model_Profitability (22 columns)
```
A: date
B: channel (Shopify or Amazon)
C: order_id
D: line_id
E: sku
F: title
G: qty
H: revenue
I: model_cost (per unit)
J: total_cost (model_cost × qty)
K: marketplace_fees (from Amazon API or Shopify)
L: shipping (pass-through)
M: tax (pass-through)
N: refund
O: gross_profit
P: net_profit
Q: gross_margin_%
R: net_margin_%
S: unit_revenue
T: unit_profit
U: currency
V: region
```

### Model_Costs (3 columns - Manual Input)
```
A: sku
B: model_cost (COGS)
C: notes
```

## Usage After Amazon Credentials Are Set

Once you have your Amazon SP-API credentials:

### 1. Initial Setup
```bash
npm run init:sheets
```

### 2. Sync Sales (with fees)
```bash
# Backfill last 30 days with fee data
npm run sync:sales -- --days=30
```

### 3. Populate Model Costs
Manually add product costs to the Model_Costs sheet

### 4. Sync Inventory
```bash
npm run sync:inventory
```

### 5. Calculate Profitability
```bash
npm run sync:profitability
```

## Benefits of This Architecture

### ✅ Single Source of Truth
Amazon FBA is your inventory system - no need to sync between platforms

### ✅ Automatic Fee Capture
Amazon fees are automatically pulled from Financial Events API

### ✅ Unified Sales Velocity
Sales from both channels contribute to reorder calculations

### ✅ Channel Comparison
Easily compare profitability between Shopify MCF and Amazon.com orders

### ✅ No Manual Data Entry
Only need to maintain Model_Costs (product COGS)

### ✅ Real-Time Visibility
See actual fees and costs, not estimates

## Future Enhancements

Potential additions:
- Shopify transaction fee calculator
- MCF vs FBA fee comparison
- Storage fee tracking
- Inventory aging analysis
- Automated reorder quantities
- Email alerts for low inventory

## Questions?

- **Why not use Shopify inventory?**  
  You use Amazon MCF to fulfill Shopify orders, so Amazon is your actual inventory system

- **Why fetch fees from Amazon?**  
  Amazon fees are complex (FBA, referral, storage, etc.) and change frequently. The Financial Events API provides the actual fees charged

- **Do I need to manually enter Shopify fees?**  
  For now, yes (or leave as 0). A future enhancement could calculate based on your payment processor

- **What if I don't have Amazon credentials yet?**  
  Everything is ready - just add credentials to `.env` when you have them and run the syncs

---

This architecture gives you complete visibility into your Amazon MCF operation with minimal manual effort! 🚀

