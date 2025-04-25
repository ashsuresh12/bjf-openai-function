import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import dotenv from 'dotenv';

dotenv.config();

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

const auth = new JWT({
  email: process.env.GOOGLE_CLIENT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  scopes: SCOPES,
});

const sheets = google.sheets({ version: 'v4', auth });
const spreadsheetId = process.env.GOOGLE_SHEET_ID;

export async function getCell(sheetName, cell) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!${cell}`,
  });
  return res.data.values?.[0]?.[0] || '';
}

export async function setCell(sheetName, cell, value) {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!${cell}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[value]] },
  });
}

export async function getRows(sheetName, startRow, endRow, columns) {
  const range = `${sheetName}!${columns[0]}${startRow}:${columns[columns.length - 1]}${endRow}`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });
  return res.data.values || [];
}

export async function batchUpdate(sheetName, updates, targetColumns) {
  const data = updates.map(({ row, values }) => {
    return {
      range: `${sheetName}!${targetColumns[0]}${row}:${targetColumns[targetColumns.length - 1]}${row}`,
      values: [values.map((val) => val || '')],
    };
  });

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data,
    },
  });
}