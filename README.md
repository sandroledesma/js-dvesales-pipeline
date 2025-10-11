# DVE Sales Pipeline

Node.js 20 data pipeline that syncs sales from Shopify and Amazon SP-API to Google Sheets.

## Features

- ✅ **Multi-channel ingestion**: Shopify + Amazon SP-API
- ✅ **Idempotent**: Safe to re-run with overlapping date ranges
- ✅ **Pre-deduplication**: Filters existing records before appending
- ✅ **HTTP API**: Trigger syncs via REST endpoint
- ✅ **Docker support**: Production-ready containerization
- ✅ **Inventory Feed**: Track Amazon FBA/MCF inventory levels, weeks of supply, and reorder dates
- ✅ **Profitability Dashboard**: Calculate profit margins with actual marketplace fees from Amazon & Shopify
- ✅ **Amazon MCF Support**: Full support for Multi-Channel Fulfillment workflows

## Quick Start

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env` file with the following variables:

```bash
# Server
PORT=8080
SYNC_TOKEN=your-secret-token-here

# Shopify
SHOPIFY_STORE_DOMAIN=yourstore.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxxxxxxxxxx

# Google Sheets
GOOGLE_SA_JSON_BASE64=base64_encoded_service_account_json
GOOGLE_SHEET_ID=your-spreadsheet-id

# Amazon SP-API (optional - if not set, Amazon sync will be skipped)
AMAZON_SELLER_ID=your_seller_id
AMAZON_REFRESH_TOKEN=your_lwa_refresh_token
LWA_CLIENT_ID=amzn1.application-oa2-client.xxxxx
LWA_CLIENT_SECRET=your_lwa_client_secret
AWS_SELLING_PARTNER_ROLE_ARN=arn:aws:iam::XXXXXXXXXXXX:role/YourSpApiRole
AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXXXXX
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
SPAPI_REGION=na
AMAZON_MARKETPLACE_ID=ATVPDKIKX0DER

# Defaults
START_DAYS_BACK=35
```

### Initialize Google Sheets

```bash
npm run init:sheets
```

This creates the following sheets with proper headers:
- `Sales_Fact` - Sales transactions from all channels (with marketplace fees)
- `Customer_Dim` - Customer dimension data
- `Inventory_Feed` - Amazon FBA/MCF inventory with reorder tracking
- `Model_Profitability` - Transaction profitability analysis with actual fees
- `Model_Costs` - Product cost mapping (manual input)

## Usage

### CLI - Direct Sync

#### Sales Sync
```bash
# Sync last 7 days from all channels (Shopify + Amazon)
npm run sync:sales -- --days=7

# Sync only Shopify
npm run sync:sales -- --days=7 --channels=shopify

# Sync only Amazon
npm run sync:sales -- --days=7 --channels=amazon

# Custom date range
npm run sync:sales -- --start=2025-09-01 --end=2025-09-30

# Multiple channels explicitly
npm run sync:sales -- --days=7 --channels=shopify,amazon
```

#### Inventory Sync
```bash
# Sync current inventory from Amazon FBA/MCF
npm run sync:inventory
```

This will:
- Fetch all inventory from Amazon FBA/MCF (including fulfillable, inbound, and reserved quantities)
- Calculate average daily sales across both Shopify and Amazon orders (last 30 days)
- Calculate weeks of supply based on fulfillable quantity
- Generate reorder dates based on lead time (14 days) and safety stock (7 days)

**Note**: This uses Amazon SP-API and requires Amazon credentials to be configured.

#### Profitability Sync
```bash
# Calculate profitability for all transactions
npm run sync:profitability
```

This will:
- Read all sales from `Sales_Fact` (with marketplace fees already captured)
- Join with `Model_Costs` (SKU costs)
- Calculate gross profit, net profit, and margins for each transaction
- Calculate unit economics (revenue and profit per unit)
- Write results to `Model_Profitability`
- Display profitability breakdown by channel

**Fee Breakdown**:
- **Amazon Orders**: Fees automatically fetched from Amazon Financial Events API
  - Fulfillment fees (FBA/MCF)
  - Referral fees (commission)
  - Storage fees
  - Other fees
- **Shopify Orders**: Transaction fees calculated based on payment processor
  - Default: 2.9% + $0.30 (Shopify Payments)
  - Customizable in `sync_sales.js`

**Note**: For accurate profitability calculations, populate the `Model_Costs` sheet with your product costs (SKU → cost mapping)

### HTTP Server

Start the server:

```bash
npm start
```

Trigger sync via HTTP:

```bash
# Health check
curl http://localhost:8080/health

# Sync with header authentication
curl -H "X-Sync-Token: your-secret-token-here" \
  "http://localhost:8080/sync?days=7"

# Sync specific channels
curl -H "X-Sync-Token: your-secret-token-here" \
  "http://localhost:8080/sync?days=7&channels=shopify,amazon"

# Custom date range
curl -H "X-Sync-Token: your-secret-token-here" \
  "http://localhost:8080/sync?start=2025-09-01&end=2025-09-30"

# Query param authentication
curl "http://localhost:8080/sync?token=your-secret-token-here&days=7"

# Sync inventory
curl -H "X-Sync-Token: your-secret-token-here" \
  "http://localhost:8080/sync/inventory"

# Sync profitability
curl -H "X-Sync-Token: your-secret-token-here" \
  "http://localhost:8080/sync/profitability"
```

### Docker

Build and run:

```bash
# Build image
docker build -t js-dvesales-pipeline .

# Run with env file
docker run -p 8080:8080 --env-file .env js-dvesales-pipeline

# Run with environment variables
docker run -p 8080:8080 \
  -e SYNC_TOKEN="your-token" \
  -e SHOPIFY_STORE_DOMAIN="yourstore.myshopify.com" \
  -e SHOPIFY_ACCESS_TOKEN="shpat_xxx" \
  -e GOOGLE_SA_JSON_BASE64="base64string" \
  -e GOOGLE_SHEET_ID="your-sheet-id" \
  js-dvesales-pipeline
```

## Architecture

### Data Flow

```
Sales Flow (with fees):
┌─────────┐       ┌─────────────┐       ┌──────────────────────┐
│ Shopify │──────▶│ Sales Sync  │──────▶│ Sales_Fact           │
│ Orders  │       │             │       │ (with Shopify fees)  │
└─────────┘       └─────────────┘       └──────────────────────┘
                                         
┌─────────┐       ┌─────────────┐       ┌──────────────────────┐
│ Amazon  │──────▶│ Sales Sync  │──────▶│ Sales_Fact           │
│ Orders  │       │ + Fees API  │       │ (with Amazon fees)   │
└─────────┘       └─────────────┘       └──────────────────────┘

Inventory Flow (Amazon MCF):
┌─────────┐       ┌──────────────┐      ┌──────────────────────┐
│ Amazon  │──────▶│ Inventory    │──────▶│ Inventory_Feed       │
│ FBA/MCF │       │ Sync         │       │ (Reorder Tracking)   │
└─────────┘       └──────────────┘      └──────────────────────┘

Profitability Flow:
┌─────────────┐   ┌──────────────┐      ┌──────────────────────┐
│ Sales_Fact  │──▶│ Profitability│──────▶│ Model_Profitability  │
│ (with fees) │   │ Sync         │       │ (Profit Analysis)    │
│ Model_Costs │──▶│              │       │ (by channel)         │
└─────────────┘   └──────────────┘      └──────────────────────┘
```

### Amazon MCF Architecture

This pipeline is designed for businesses using **Amazon Multi-Channel Fulfillment (MCF)** to fulfill Shopify orders:

1. **Inventory**: All inventory is stored in Amazon FBA and tracked via Amazon SP-API
2. **Orders**: Orders come from both Shopify (fulfilled by Amazon MCF) and Amazon.com
3. **Fees**: Marketplace fees are captured from both platforms:
   - Amazon: FBA fees, referral fees, storage fees (from Financial Events API)
   - Shopify: Transaction fees, payment processing fees
4. **Profitability**: Net profit calculation includes actual marketplace fees from both channels

### Schema Reference

#### Sales_Fact (Columns A-T)

| Column | Name             | Description                                      |
|--------|------------------|--------------------------------------------------|
| A      | date             | Order date (ISO format)                          |
| B      | channel          | "Shopify" or "Amazon"                            |
| C      | order_id         | Platform order ID                                |
| D      | line_id          | Line item ID (unique per order)                  |
| E      | sku              | Product SKU                                      |
| F      | title            | Product title                                    |
| G      | qty              | Quantity ordered                                 |
| H      | item_gross       | Item subtotal (price × qty)                      |
| I      | item_discount    | Discount amount                                  |
| J      | shipping         | Shipping cost                                    |
| K      | tax              | Tax amount                                       |
| L      | refund           | Refund amount                                    |
| M      | fulfillment_fee  | FBA/MCF fulfillment fees (Amazon)                |
| N      | referral_fee     | Amazon referral/commission fees                  |
| O      | transaction_fee  | Shopify payment processing fees                  |
| P      | storage_fee      | Amazon storage fees                              |
| Q      | other_fees       | Miscellaneous fees                               |
| R      | total_fees       | Sum of all fees (M+N+O+P+Q)                      |
| S      | currency         | Currency code (e.g., "USD")                      |
| T      | region           | Country/region code                              |

#### Inventory_Feed (Columns A-M)

| Column | Name                | Description                                    |
|--------|---------------------|------------------------------------------------|
| A      | last_updated        | Last sync timestamp                            |
| B      | sku                 | Seller SKU                                     |
| C      | fnsku               | Amazon FNSKU (Fulfillment Network SKU)         |
| D      | asin                | Amazon ASIN                                    |
| E      | product_name        | Product name                                   |
| F      | condition           | Item condition (NewItem, etc.)                 |
| G      | total_quantity      | Total quantity in Amazon FBA                   |
| H      | fulfillable_quantity| Available to fulfill orders                    |
| I      | inbound_quantity    | Quantity in transit to Amazon                  |
| J      | reserved_quantity   | Reserved for pending orders                    |
| K      | avg_daily_sales     | Average units sold per day (last 30 days)      |
| L      | weeks_of_supply     | Weeks of inventory remaining                   |
| M      | reorder_date        | Suggested reorder date (or "REORDER NOW")      |

#### Model_Profitability (Columns A-AA)

| Column | Name              | Description                                    |
|--------|-------------------|------------------------------------------------|
| A      | date              | Order date                                     |
| B      | channel           | Sales channel (Shopify or Amazon)              |
| C      | order_id          | Order ID                                       |
| D      | line_id           | Line item ID                                   |
| E      | sku               | Product SKU                                    |
| F      | title             | Product title                                  |
| G      | qty               | Quantity sold                                  |
| H      | revenue           | Net revenue (gross - discounts)                |
| I      | model_cost        | Unit cost from Model_Costs sheet               |
| J      | total_cost        | Total product cost (model_cost × qty)          |
| K      | fulfillment_fee   | FBA/MCF fulfillment fees                       |
| L      | referral_fee      | Amazon referral/commission fees                |
| M      | transaction_fee   | Shopify payment processing fees                |
| N      | storage_fee       | Amazon storage fees                            |
| O      | other_fees        | Miscellaneous fees                             |
| P      | total_fees        | Sum of all fees                                |
| Q      | shipping          | Shipping charged (pass-through)                |
| R      | tax               | Tax charged (pass-through)                     |
| S      | refund            | Refund amount                                  |
| T      | gross_profit      | Revenue - total_cost                           |
| U      | net_profit        | Gross profit - total_fees - refunds            |
| V      | gross_margin_%    | Gross profit margin percentage                 |
| W      | net_margin_%      | Net profit margin percentage                   |
| X      | unit_revenue      | Revenue per unit                               |
| Y      | unit_profit       | Net profit per unit                            |
| Z      | currency          | Currency code                                  |
| AA     | region            | Region/country                                 |

#### Model_Costs (Columns A-C)

Manual input sheet for product costs:

| Column | Name       | Description                    |
|--------|------------|--------------------------------|
| A      | sku        | Product SKU                    |
| B      | model_cost | Cost per unit (COGS)           |
| C      | notes      | Optional notes                 |

**Note**: This is the only manual input sheet. Populate this with your product costs to calculate accurate profitability.

### Deduplication

The pipeline is **idempotent** - it can be safely run multiple times with overlapping date ranges.

**Deduplication key**: `(channel, order_id, line_id)` - columns B, C, D

Before appending new rows:
1. Reads existing keys from Sales_Fact
2. Filters out any rows that already exist
3. Appends only new rows

## Amazon SP-API Setup

### Prerequisites

1. **Seller Central Account**: Active Amazon seller account
2. **Developer Account**: Register at https://developer.amazonservices.com
3. **SP-API Application**: Create an app and get LWA credentials
4. **IAM Role**: AWS IAM role with SP-API permissions
5. **IAM User**: AWS IAM user with access to assume the role

### Getting Credentials

1. **LWA Credentials** (Login with Amazon):
   - `LWA_CLIENT_ID`: From your SP-API app
   - `LWA_CLIENT_SECRET`: From your SP-API app
   - `AMAZON_REFRESH_TOKEN`: Generated during authorization flow

2. **AWS Credentials**:
   - `AWS_ACCESS_KEY_ID`: From IAM user
   - `AWS_SECRET_ACCESS_KEY`: From IAM user
   - `AWS_SELLING_PARTNER_ROLE_ARN`: ARN of the SP-API IAM role

3. **Marketplace**:
   - US: `ATVPDKIKX0DER`
   - CA: `A2EUQ1WTGCTBG2`
   - MX: `A1AM78C64UM0Y8`

### Rate Limits

The Amazon client uses `p-limit` with concurrency of 1 to avoid throttling.

Default rate limits for Orders API:
- 0.0167 requests per second (1 per minute)
- Burst: 20 requests

The implementation is conservative. You can increase concurrency in `src/clients/amazon.js` after testing.

## API Endpoints

### `GET /sync`

Trigger a sales sync.

**Query Parameters**:
- `days` - Number of days to sync (e.g., `?days=7`)
- `start` & `end` - Custom date range (e.g., `?start=2025-09-01&end=2025-09-30`)
- `channels` - Comma-separated channels (e.g., `?channels=shopify,amazon` or `?channels=all`)
- `token` - Authentication token (alternative to header)

**Authentication**:
- Header: `X-Sync-Token: your-token`
- Query: `?token=your-token`

**Response**:
```json
{
  "ok": true,
  "appended": 42,
  "timestamp": "2025-10-11T12:34:56.789Z"
}
```

**Status Codes**:
- `200` - Success
- `401` - Unauthorized
- `409` - Sync already in progress
- `500` - Internal server error

### `GET /sync/inventory`

Trigger an inventory sync (Shopify products).

**Authentication**: Same as `/sync`

**Response**:
```json
{
  "ok": true,
  "updated": 156,
  "timestamp": "2025-10-11T12:34:56.789Z"
}
```

### `GET /sync/profitability`

Trigger a profitability calculation.

**Authentication**: Same as `/sync`

**Response**:
```json
{
  "ok": true,
  "updated": 1234,
  "timestamp": "2025-10-11T12:34:56.789Z"
}
```

### `GET /health`

Health check endpoint.

**Response**:
```json
{
  "ok": true,
  "status": "healthy",
  "running": false
}
```

## Concurrency

The server implements a simple concurrency lock:
- Only one sync can run at a time
- Returns `409 Conflict` if sync is already in progress
- Lock is released when sync completes or fails

## Scripts

- `npm start` - Start HTTP server
- `npm run sync:sales` - Run sales sync job directly
- `npm run sync:inventory` - Run inventory sync job directly
- `npm run sync:profitability` - Run profitability calculation job directly
- `npm run init:sheets` - Initialize Google Sheets with all tabs
- `npm run server` - Alias for `npm start`

## Troubleshooting

### "Missing Amazon SP-API env vars"

If Amazon credentials are not configured, the sync will skip Amazon and only process Shopify. This is intentional - you can run Shopify-only syncs without Amazon setup.

To enable Amazon:
1. Set all required `AMAZON_*`, `LWA_*`, and `AWS_*` environment variables
2. Verify credentials are correct
3. Test with: `npm run sync:sales -- --days=2 --channels=amazon`

### "SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN environment variables must be set"

Ensure your `.env` file has:
```
SHOPIFY_STORE_DOMAIN=yourstore.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxx
```

### Rate Limit Errors (Amazon)

If you hit Amazon rate limits:
1. Reduce date range (`--days=2` instead of `--days=30`)
2. Wait a few minutes and retry
3. The client already uses conservative rate limiting (1 concurrent request)

### Duplicate Rows

The pipeline should prevent duplicates automatically. If you see duplicates:

1. **Verify deduplication is working**:
   ```bash
   # Run twice with same window
   npm run sync:sales -- --days=2
   npm run sync:sales -- --days=2
   # Second run should show "Appended 0 rows"
   ```

2. **Optional: Manual cleanup**:
   Uncomment the hard dedupe line in `src/jobs/sync_sales.js`:
   ```javascript
   await deleteDuplicatesByColumns('Sales_Fact', [1,2,3]);
   ```

## License

ISC


