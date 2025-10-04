const { google } = require('googleapis');

/** Initialize Google Sheets API auth */
function getAuthClient() {
  const saJsonBase64 = process.env.GOOGLE_SA_JSON_BASE64;
  if (!saJsonBase64) throw new Error('GOOGLE_SA_JSON_BASE64 environment variable is not set');
  const saJson = JSON.parse(Buffer.from(saJsonBase64, 'base64').toString('utf-8'));
  return new google.auth.GoogleAuth({
    credentials: saJson,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

/** Build v4 client */
function getSheetsClient() {
  const auth = getAuthClient();
  return google.sheets({ version: 'v4', auth });
}

/** Append rows to a tab (A:Z) */
async function appendRows(tab, rows) {
  if (!rows || rows.length === 0) return;
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID environment variable is not set');
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tab}!A:Z`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });
}

/** Read a single column via A1 range; return flat string array (no blanks) */
async function getColumnValues(rangeA1) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID environment variable is not set');
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: rangeA1,
    majorDimension: 'COLUMNS',
  });
  const col = (res.data.values && res.data.values[0]) || [];
  return col.map(String).filter(v => v !== '');
}

/** Optional: enforce uniqueness by columns (zero-based indexes) */
async function deleteDuplicatesByColumns(sheetTitle, columnIndexes) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID environment variable is not set');

  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = meta.data.sheets.find(s => s.properties.title === sheetTitle);
  if (!sheet) throw new Error(`Sheet "${sheetTitle}" not found`);
  const sheetId = sheet.properties.sheetId;

  const comparisonColumns = columnIndexes.map(i => ({
    sheetId,
    dimension: 'COLUMNS',
    startIndex: i,
    endIndex: i + 1,
  }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDuplicates: {
            range: { sheetId },
            comparisonColumns,
          },
        },
      ],
    },
  });
}

module.exports = {
  appendRows,
  getColumnValues,
  deleteDuplicatesByColumns,
  getSheetsClient,
};
