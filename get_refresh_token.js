const https = require('https');
const querystring = require('querystring');

/**
 * Helper script to get Amazon SP-API refresh token
 * Run this after completing the OAuth authorization flow
 */

// Configuration - Update these with your values
const config = {
  clientId: 'YOUR_AMAZON_CLIENT_ID_HERE',
  clientSecret: 'YOUR_AMAZON_CLIENT_SECRET_HERE',
  redirectUri: 'https://example.com/callback', // Or your preferred redirect URI
  authorizationCode: 'YOUR_AUTHORIZATION_CODE_HERE' // Get this from the redirect URL
};

/**
 * Exchange authorization code for refresh token
 */
async function getRefreshToken() {
  const postData = querystring.stringify({
    grant_type: 'authorization_code',
    code: config.authorizationCode,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret
  });

  const options = {
    hostname: 'api.amazon.com',
    port: 443,
    path: '/auth/o2/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.refresh_token) {
            console.log('✅ Success! Your refresh token:');
            console.log(response.refresh_token);
            console.log('\n📝 Add this to your .env file as:');
            console.log(`AMAZON_REFRESH_TOKEN=${response.refresh_token}`);
          } else {
            console.error('❌ Error getting refresh token:');
            console.error(response);
          }
          resolve(response);
        } catch (error) {
          console.error('❌ Error parsing response:', error);
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ Request error:', error);
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Generate authorization URL
 */
function generateAuthUrl() {
  const state = Math.random().toString(36).substring(7);
  
  // Try multiple authorization URLs
  const authUrls = [
    `https://sellercentral.amazon.com/apps/authorize/consent?application_id=${config.clientId}&redirect_uri=${encodeURIComponent(config.redirectUri)}&state=${state}`,
    `https://sellercentral.amazon.com/apps/authorize?application_id=${config.clientId}&redirect_uri=${encodeURIComponent(config.redirectUri)}&state=${state}`,
    `https://www.amazon.com/ap/oa?client_id=${config.clientId}&redirect_uri=${encodeURIComponent(config.redirectUri)}&response_type=code&scope=profile&state=${state}`
  ];
  
  console.log('🔗 Try these authorization URLs (in order):');
  authUrls.forEach((url, index) => {
    console.log(`\n${index + 1}. ${url}`);
  });
  
  console.log('\n📋 Steps:');
  console.log('1. Try each URL above until one works');
  console.log('2. Log in with your Amazon seller account');
  console.log('3. Grant permissions to your app');
  console.log('4. Copy the "code" parameter from the redirect URL');
  console.log('5. Update the authorizationCode in this script');
  console.log('6. Run: node get_refresh_token.js');
  
  console.log('\n⚠️  If all URLs show blank pages:');
  console.log('- Make sure your Security Profile has the redirect URI added');
  console.log('- Try using a different redirect URI like: https://example.com/callback');
  console.log('- Clear your browser cache and cookies');
}

// Main execution
if (require.main === module) {
  console.log('🚀 Amazon SP-API Refresh Token Helper\n');
  
  if (config.clientId === 'YOUR_LWA_CLIENT_ID_HERE') {
    console.log('❌ Please update the config with your actual values first!');
    console.log('1. Update clientId with your LWA Client ID');
    console.log('2. Update clientSecret with your LWA Client Secret');
    console.log('3. Update redirectUri if needed');
    console.log('\nThen run this script again.\n');
    generateAuthUrl();
  } else if (config.authorizationCode === 'YOUR_AUTHORIZATION_CODE_HERE') {
    console.log('📝 Config looks good! Generating authorization URL...\n');
    generateAuthUrl();
  } else {
    console.log('🔄 Exchanging authorization code for refresh token...\n');
    getRefreshToken().catch(console.error);
  }
}

module.exports = { getRefreshToken, generateAuthUrl };
