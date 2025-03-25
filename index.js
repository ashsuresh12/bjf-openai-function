import express from "express";
import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import OpenAI from "openai";

const app = express();
const port = process.env.PORT || 10000;

// OpenAI Setup
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Google Sheets Setup
const auth = new GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

const SPREADSHEET_ID = "1xSOYyVlQJfi64ZyCJ0pnhdqOKeO5cX02F1RnIZ1eHeo";
const SHEET_NAME = "Nutriscore";

async function getNutriScoreAndExplanation(title) {
  const prompt = `Give a NutriScore (A to E) and a tactful explanation for the product "${title}". Respond in this format:
NutriScore: X
Explanation: <short explanation>`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are a nutritional expert generating customer-facing NutriScores. Be tactful and avoid negative language.",
      },
      { role: "user", content: prompt },
    ],
    max_tokens: 150,
    temperature: 0.7,
  });

  const text = response.choices[0].message.content;
  const scoreMatch = text.match(/NutriScore:\s*([A-E])/i);
  const explanationMatch = text.match(/Explanation:\s*(.+)/i);

  return {
    score: scoreMatch ? scoreMatch[1].toUpperCase() : "",
    explanation: explanationMatch ? explanationMatch[1].trim() : "",
  };
}

app.get("/generate-nutriscore-test", async (req, res) => {
  try {
    const readRange = `${SHEET_NAME}!A2:B1001`; // Handle & Product Title
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: readRange,
    });

    const rows = response.data.values || [];
    const handleMap = new Map();

    // Group by handle
    rows.forEach(([handle, title], i) => {
      if (!handle || !title) return;
      if (!handleMap.has(handle)) {
        handleMap.set(handle, { title, rows: [i] });
      } else {
        handleMap.get(handle).rows.push(i);
      }
    });

    // Build results (C = Score, D = Explanation)
    const scoreResults = Array(rows.length).fill(["", ""]);

    for (const [handle, { title, rows: indices }] of handleMap.entries()) {
      console.log(`🔍 Processing: ${title} (Handle: ${handle})`);
      try {
        const { score, explanation } = await getNutriScoreAndExplanation(title);
        for (const rowIndex of indices) {
          scoreResults[rowIndex] = [score, explanation];
        }
      } catch (err) {
        console.error(`❌ Failed for "${title}":`, err.message);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const writeRange = `${SHEET_NAME}!C2:D${rows.length + 1}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: writeRange,
      valueInputOption: "RAW",
      requestBody: { values: scoreResults },
    });

    res.send("✅ NutriScore test batch completed.");
  } catch (error) {
    console.error("NutriScore Error:", error.message);
    res.status(500).send("Something went wrong.");
  }
});

app.listen(port, () => {
  console.log(`🟢 Server running on port ${port}`);
});