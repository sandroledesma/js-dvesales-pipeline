const { google } = require('googleapis');

/**
 * Initialize Google Sheets API client
 */
function getAuthClient() {
  const saJsonBase64 = process.env.GOOGLE_SA_JSON_BASE64;
  
  if (!saJsonBase64) {
    throw new Error('GOOGLE_SA_JSON_BASE64 environment variable is not set');
  }

  // Decode base64 and parse JSON
  const saJson = JSON.parse(Buffer.from(saJsonBase64, 'base64').toString('utf-8'));

  const auth = new google.auth.GoogleAuth({
    credentials: saJson,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return auth;
}

/**
 * Append rows to a Google Sheet tab
 * @param {string} tab - The name of the sheet tab
 * @param {Array<Array>} rows - 2D array of values to append
 */
async function appendRows(tab, rows) {
  // Do nothing if rows is empty
  if (!rows || rows.length === 0) {
    return;
  }

  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  
  if (!spreadsheetId) {
    throw new Error('GOOGLE_SHEET_ID environment variable is not set');
  }

  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const range = `${tab}!A:Z`;

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    resource: {
      values: rows,
    },
  });
}

module.exports = { appendRows };
