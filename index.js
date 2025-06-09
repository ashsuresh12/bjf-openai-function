import express from 'express';
import dotenv from 'dotenv';
import { google } from 'googleapis';
import { OpenAI } from 'openai';

dotenv.config();
const app = express();
const BATCH_SIZE = 400;
const SHEET_NAME = 'NewTagging';
const TRACKER_CELL = 'CG1';
const OUTPUT_COLUMN = 'H';
const SHEET_ID = process.env.SPREADSHEET_ID;

const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
const auth = new google.auth.JWT(
  credentials.client_email,
  null,
  credentials.private_key,
  ['https://www.googleapis.com/auth/spreadsheets']
);
const sheets = google.sheets({ version: 'v4', auth });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function getLastProcessedRow() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!${TRACKER_CELL}`
  });
  const raw = res.data.values?.[0]?.[0];
  const row = parseInt(raw, 10);
  if (!row || isNaN(row)) return 2;
  return row;
}

async function updateProgress(row) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!${TRACKER_CELL}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[row]] }
  });
}

async function getSheetData(startRow, numRows) {
  const range = `${SHEET_NAME}!A${startRow}:H${startRow + numRows}`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range
  });
  return res.data.values || [];
}

function getFirstVariantIndexes(rows) {
  const seen = new Set();
  return rows.map((row, i) => {
    const handle = row[0];
    if (!seen.has(handle)) {
      seen.add(handle);
      return i;
    }
    return null;
  }).filter(i => i !== null);
}

async function generateTags(title, description, oldTags) {
  const prompt = `
You're a product classification expert for an online wholefoods retailer. Based on the following product details, assign the most relevant tags from this fixed list (no made-up tags). If the old tags are relevant, you may keep or adjust them. Respond with a comma-separated list only.

Available Tags:
Pantry Staples, Baking Essentials, Wholefood Snacks, High Protein, Chocolate, Sweeteners & Syrups, Body & Beauty, Cleaning & Essential Oils, Easy Meals, Bulk Buys, Gluten-Free, Dairy-Free, Vegan, Vegetarian, Organic, Keto Friendly Low Carb, Nut-Free, Low Sugar, Soy-Free, Grain-Free, FODMAP-Friendly, AIP (Autoimmune Protocol), Gut Health, Energy & Focus, Immunity Support, Stress & Sleep, Women’s Wellness, Skin & Hair Health, Pregnancy & Postnatal, Mood Support, Fitness & Recovery, Herbal Teas, Coffee & Alternatives, Chai & Matcha, Kombucha & Kefir, Functional Beverages, Superfoods & Powders.

Product Title: ${title}
Description: ${description}
Old Tags: ${oldTags}
`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2
  });

  return response.choices[0].message.content.trim();
}

async function writeTags(startRow, updates) {
  const values = updates.map(tag => [tag]);
  const range = `${SHEET_NAME}!${OUTPUT_COLUMN}${startRow}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range,
    valueInputOption: 'RAW',
    requestBody: { values }
  });
}

app.get('/debug-sheet', async (req, res) => {
  try {
    const testRange = `${SHEET_NAME}!A2:H2`;
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: testRange
    });
    console.log('✅ Sheet read succeeded:', result.data.values);
    res.send(`✅ Able to read test range: ${testRange}`);
  } catch (error) {
    console.error('❌ Sheet read failed:', error.response?.data || error.message || error);
    res.status(500).send('❌ Failed to read test range');
  }
});

app.get('/generate-tags', async (req, res) => {
  try {
    const startRow = await getLastProcessedRow();
    const data = await getSheetData(startRow, BATCH_SIZE);
    if (data.length === 0) return res.send('✅ No more data to process.');

    const firstIndexes = getFirstVariantIndexes(data);

    const tagPromises = firstIndexes.map(i => {
      const row = data[i];
      const title = row[1] || '';
      const description = row[2] || '';
      const oldTags = row[6] || '';
      return generateTags(title, description, oldTags);
    });

    const tagResults = await Promise.all(tagPromises);
    const outputArray = data.map((_, i) =>
      firstIndexes.includes(i) ? tagResults.shift() : ''
    );

    await writeTags(startRow, outputArray);
    await updateProgress(startRow + data.length);
    res.send(`✅ Processed rows ${startRow} to ${startRow + data.length - 1}`);
  } catch (err) {
    console.error('❌ Error in tag generation:', err.response?.data || err.message || err);
    res.status(500).send('❌ Failed to generate tags');
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Tag generator running on port ${PORT}`);
});