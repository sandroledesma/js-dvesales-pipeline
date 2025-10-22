# Amazon SP-API Credentials Setup Guide

## Required Environment Variables

You need to create a `.env` file in your project root with these variables:

```bash
# LWA (Login with Amazon) Credentials
LWA_CLIENT_ID=your_lwa_client_id_here
LWA_CLIENT_SECRET=your_lwa_client_secret_here

# AWS Credentials
AWS_ACCESS_KEY_ID=your_aws_access_key_id_here
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key_here

# AWS IAM Role for Selling Partner API
AWS_SELLING_PARTNER_ROLE_ARN=arn:aws:iam::123456789012:role/your-role-name

# Amazon Seller Credentials
AMAZON_SELLER_ID=your_seller_id_here
AMAZON_REFRESH_TOKEN=your_refresh_token_here

# Marketplace Configuration
AMAZON_MARKETPLACE_ID=ATVPDKIKX0DER
SPAPI_REGION=na
```

## Step-by-Step Credential Collection

### 1. Amazon Developer Console Setup
1. Go to https://developer.amazon.com/
2. Sign in with your Amazon seller account
3. Create a new Security Profile:
   - Name: "DVE Sales Pipeline"
   - Description: "API access for sales data synchronization"
4. Save the Client ID and Client Secret

### 2. AWS IAM Setup
1. Go to https://console.aws.amazon.com/
2. Create IAM User:
   - Username: "amazon-sp-api-user"
   - Attach policy: "AmazonSellingPartnerAPIReadOnly"
   - Create access key and save credentials
3. Create IAM Role:
   - Trusted entity: AWS account
   - Account ID: Your Amazon account ID
   - Attach policy: "AmazonSellingPartnerAPIReadOnly"
   - Save the Role ARN

### 3. Seller Credentials
1. Go to https://sellercentral.amazon.com/
2. Find your Seller ID in account settings
3. Note your Marketplace ID (default: ATVPDKIKX0DER for North America)

### 4. Refresh Token (Most Complex)
The refresh token requires OAuth2 authorization flow:

1. Create authorization URL:
   ```
   https://sellercentral.amazon.com/apps/authorize/consent?application_id=YOUR_CLIENT_ID&redirect_uri=YOUR_REDIRECT_URI&state=RANDOM_STATE
   ```

2. Complete authorization in browser
3. Exchange authorization code for refresh token

## Marketplace IDs by Region
- North America: ATVPDKIKX0DER
- Europe: A1PA6795UKMFR9
- Japan: A1VC38T7YXB528
- India: A21TJRUUN4KGV

## SP-API Regions
- na (North America)
- eu (Europe)
- fe (Far East)

## Testing Your Credentials
Once you have all credentials, test with:
```bash
npm run sync:sales
```

This will attempt to fetch Amazon orders and validate your credentials.

