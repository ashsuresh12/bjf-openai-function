import express from "express";
import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = "Allergens";
const BATCH_SIZE = 300;

const auth = new GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

async function getSheetsClient() {
  const client = await auth.getClient();
  return google.sheets({ version: "v4", auth });
}

async function getLastProcessedRow() {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!F1`,
  });
  return parseInt(res.data.values?.[0]?.[0] || "1", 10);
}

async function updateLastProcessedRow(row) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!F1`,
    valueInputOption: "RAW",
    requestBody: { values: [[row]] },
  });
}

async function fetchBatch(startRow, endRow) {
  const sheets = await getSheetsClient();
  const range = `${SHEET_NAME}!A${startRow}:C${endRow}`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  });
  return res.data.values || [];
}

async function writeAllergens(startRow, values) {
  const sheets = await getSheetsClient();
  const range = `${SHEET_NAME}!D${startRow}:D${startRow + values.length - 1}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueInputOption: "RAW",
    requestBody: { values: values.map(val => [val]) },
  });
}

async function generateAllergens(title, description) {
  const prompt = `List any common allergens that might be present in this food product: "${title}". Base your answer on typical ingredients and cross-contamination risks. Only list known allergens such as: Gluten, Soy, Dairy, Eggs, Tree Nuts, Peanuts, Sesame, Sulphites, Fish, Shellfish. Separate multiple allergens with commas. If no common allergens apply, return "None". Be concise.`;

  const payload = {
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are a food labeling expert. Only provide accurate, concise allergen lists for consumers, using comma-separated terms and 'None' where applicable.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.3,
    max_tokens: 100,
  };

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error("OpenAI error:", error.message);
    return "Error";
  }
}

app.get("/generate-allergen-batch", async (req, res) => {
  try {
    const startRow = await getLastProcessedRow();
    const endRow = startRow + BATCH_SIZE - 1;

    const data = await fetchBatch(startRow, endRow);
    if (data.length === 0) {
      return res.send("✅ All rows processed.");
    }

    const seenHandles = {};
    const output = [];

    for (let i = 0; i < data.length; i++) {
      const [handle, title, description] = data[i];

      if (!handle) {
        output.push("None");
        continue;
      }

      if (seenHandles[handle]) {
        output.push(seenHandles[handle]);
      } else {
        console.log("🔍 Checking allergens for:", title);
        const allergens = await generateAllergens(title, description);
        seenHandles[handle] = allergens;
        output.push(allergens);
      }
    }

    await writeAllergens(startRow, output);
    await updateLastProcessedRow(startRow + output.length);
    res.send(`✅ Processed rows ${startRow} to ${startRow + output.length - 1}`);
  } catch (error) {
    console.error("❌ Error:", error.message);
    res.status(500).send("Failed to generate allergens.");
  }
});

app.get("/reset-allergens", async (req, res) => {
  await updateLastProcessedRow(1);
  res.send("✅ Allergen batch pointer reset to row 2.");
});

app.listen(PORT, () => {
  console.log(`🟢 Allergen batch service running on port ${PORT}`);
});