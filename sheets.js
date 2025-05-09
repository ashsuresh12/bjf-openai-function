import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import dotenv from 'dotenv';

dotenv.config();

// 🛡️ Load credentials from environment variable
const rawCredentials = process.env.GOOGLE_CREDENTIALS_JSON;
if (!rawCredentials) {
  throw new Error('❌ GOOGLE_CREDENTIALS_JSON is not defined.');
}

const credentials = JSON.parse(rawCredentials);

const auth = new JWT({
  email: credentials.client_email,
  key: credentials.private_key,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
const spreadsheetId = process.env.SPREADSHEET_ID;

export async function getRows(sheetName, startRow, endRow, columns) {
  const range = `${sheetName}!${columns[0]}${startRow}:${columns[columns.length - 1]}${endRow}`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return res.data.values || [];
}

export async function batchUpdate(sheetName, updates, targetColumns) {
  const data = updates.map(({ row, values }) => ({
    range: `${sheetName}!${targetColumns[0]}${row}:${targetColumns[targetColumns.length - 1]}${row}`,
    values: [values.map(v => v || '')],
  }));

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data,
    },
  });
}

export async function setCell(sheetName, cell, value) {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!${cell}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[value]],
    },
  });
}