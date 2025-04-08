import express from "express";
import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = "Storage";
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

async function writeStorageInstructions(startRow, values) {
  const sheets = await getSheetsClient();
  const range = `${SHEET_NAME}!D${startRow}:D${startRow + values.length - 1}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueInputOption: "RAW",
    requestBody: { values: values.map(val => [val]) },
  });
}

async function generateInstruction(title, description) {
  const prompt = `Write concise storage instructions suitable for an eCommerce product page. Do not mention the product name. Only include practical advice, such as “Store in a cool, dry place,” or “Keep tightly sealed.” Do not say things like “Use within recommended timeframe on packaging.” Keep it under 30 words.`;

  const payload = {
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are an expert at writing clean, concise storage instructions for product listings. Keep it practical and omit product names or general packaging advice.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.4,
    max_tokens: 150,
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
    return "Storage instructions unavailable.";
  }
}

app.get("/generate-storage-batch", async (req, res) => {
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
      const row = data[i];
      const handle = row[0] || "";
      const title = row[1] || "";
      const desc = row[2] || "";

      if (!handle) {
        output.push("");
        continue;
      }

      if (seenHandles[handle]) {
        output.push(seenHandles[handle]);
      } else {
        console.log("🗃️ Generating storage for:", title);
        const instruction = await generateInstruction(title, desc);
        seenHandles[handle] = instruction;
        output.push(instruction);
      }
    }

    await writeStorageInstructions(startRow, output);
    await updateLastProcessedRow(startRow + output.length);

    res.send(`✅ Processed rows ${startRow} to ${startRow + output.length - 1}`);
  } catch (error) {
    console.error("❌ Error:", error.message);
    res.status(500).send("Failed to generate storage instructions.");
  }
});

app.get("/reset-storage", async (req, res) => {
  await updateLastProcessedRow(1);
  res.send("✅ Storage batch pointer reset to row 2.");
});

app.listen(PORT, () => {
  console.log(`🟢 Storage batch service running on port ${PORT}`);
});