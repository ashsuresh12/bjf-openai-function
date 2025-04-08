import express from "express";
import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const port = process.env.PORT || 10000;

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = "Nutriscore";

const BATCH_SIZE = 200;

const auth = new GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

async function getSheetsClient() {
  const client = await auth.getClient();
  return google.sheets({ version: "v4", auth: client });
}

async function fetchSheetData() {
  const sheets = await getSheetsClient();
  const range = `${SHEET_NAME}!A2:D`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  });
  return res.data.values || [];
}

async function getLastProcessedRow() {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!F1`,
  });
  return parseInt(res.data.values?.[0]?.[0] || "1", 10);
}

async function updateLastProcessedRow(rowNum) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!F1`,
    valueInputOption: "RAW",
    requestBody: { values: [[rowNum]] },
  });
}

async function writeNutriScores(startIndex, scores) {
  const sheets = await getSheetsClient();
  const startRow = startIndex + 2; // offset A2 = index 0
  const endRow = startRow + scores.length - 1;
  const range = `${SHEET_NAME}!C${startRow}:D${endRow}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueInputOption: "RAW",
    requestBody: { values: scores },
  });
}

async function getNutriScore(title) {
  const prompt = `Assign a NutriScore (A to E, where A is healthiest) to this food product: "${title}". Then explain your reasoning clearly but tactfully in 1–2 sentences. Avoid using negative terms like "unhealthy".`;

  const payload = {
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content:
          "You are a nutritionist rating foods with NutriScores. A = healthiest, E = least. Be tactful, concise, and informative. No negative language.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.5,
    max_tokens: 200,
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

    const message = response.data.choices[0].message.content;
    const match = message.match(/([A-E])\b/);
    const score = match ? match[1] : "";
    const explanation = message.replace(/^([A-E])\b[\s:\-]*/i, "").trim();
    return [score, explanation];
  } catch (err) {
    console.error("❌ OpenAI error:", err.message);
    return ["", "❌ Error"];
  }
}

app.get("/generate-nutriscore-batch", async (req, res) => {
  try {
    const allData = await fetchSheetData();
    const startIndex = await getLastProcessedRow();

    const batch = allData.slice(startIndex, startIndex + BATCH_SIZE);
    if (batch.length === 0) {
      res.send("✅ All products processed.");
      return;
    }

    console.log(`🚀 Starting NutriScore batch from row ${startIndex + 2}`);

    const output = [];

    for (const row of batch) {
      const title = row[0]?.trim();
      if (!title) {
        output.push(["", ""]);
        continue;
      }
      console.log("🔎 Processing:", title);
      const [score, explanation] = await getNutriScore(title);
      output.push([score, explanation]);
    }

    await writeNutriScores(startIndex, output);
    await updateLastProcessedRow(startIndex + BATCH_SIZE);
    res.send(`✅ Processed rows ${startIndex + 2} to ${startIndex + BATCH_SIZE + 1}`);
  } catch (err) {
    console.error("❌ Unexpected error:", err.message);
    res.status(500).send("❌ Error: " + err.message);
  }
});

app.get("/reset-nutriscore", async (req, res) => {
  await updateLastProcessedRow(0);
  res.send("✅ NutriScore batch pointer reset to Row 2");
});

app.listen(port, () => {
  console.log(`🟢 NutriScore server running on port ${port}`);
});