# DVE Sales Pipeline Documentation

This directory contains comprehensive documentation for the DVE Sales Pipeline project.

## 📚 Documentation Structure

### 🚀 Getting Started
- **[Setup Guide](setup-guide.md)** - Complete setup instructions for the pipeline
- **[Amazon Credentials Guide](amazon-credentials-guide.md)** - Amazon SP-API setup and authentication

### 🏗️ Architecture & Design
- **[MCF Architecture](mcf-architecture.md)** - Multi-Channel Fulfillment architecture overview
- **[Formulas Reference](formulas-reference.md)** - Google Sheets formulas and calculations

### 📊 Data Pipeline
- **Sales Sync** - Automated syncing of Shopify and Amazon orders
- **Customer Data** - Customer information and demographics
- **Inventory Management** - Amazon FBA/MCF inventory tracking
- **Profitability Analysis** - Revenue and margin calculations

### 🔧 Technical Details
- **Cloud Run Deployment** - Google Cloud Run service configuration
- **Google Sheets Integration** - Sheets API setup and usage
- **Amazon SP-API** - Amazon Selling Partner API integration
- **Shopify API** - Shopify Admin API integration

## 🎯 Quick Reference

### Essential Commands
```bash
# Sync sales data
npm run sync:sales -- --start=2024-01-01 --end=2025-12-31

# Initialize sheets
npm run init:sheets

# Deploy to Cloud Run
gcloud run deploy sales-sync --image gcr.io/dvesales-pipeline/js-dvesales-pipeline:latest

# Clear sales data
npm run clear:sales
```

### Key Files
- `src/server.js` - Main Cloud Run service
- `src/jobs/sync_sales.js` - Sales synchronization
- `src/clients/sheets.js` - Google Sheets integration
- `src/clients/shopify.js` - Shopify API client
- `src/clients/amazon.js` - Amazon SP-API client

## 📈 Current Status
- ✅ **Sales Sync**: Working (Shopify + Amazon)
- ✅ **Customer Data**: Complete (names, emails, addresses)
- ✅ **Cloud Run**: Deployed and healthy
- ✅ **Google Sheets**: All columns A-AF populated
- ⚠️ **Amazon Auth**: Needs refresh token update

## 🔄 Ongoing Development
This project is actively maintained and enhanced. Check the main README.md for the latest updates and deployment status.
