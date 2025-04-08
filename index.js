import express from "express";
import cors from "cors";
import { google } from "googleapis";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());

const PORT = process.env.PORT || 10000;
const SHEET_ID = process.env.SPREADSHEET_ID;
const GOOGLE_CREDENTIALS = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const auth = new google.auth.GoogleAuth({
  credentials: GOOGLE_CREDENTIALS,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

async function getSheetClient() {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client });
  return sheets;
}

async function generateNutriScore(title) {
  const prompt = `Give a NutriScore (A to E) and a brief explanation (1-2 lines) for a food product titled "${title}". NutriScore A is healthiest, E is least. Use a tactful and customer-facing explanation, avoid negative wording like "unhealthy".`;

  const payload = {
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are a nutritionist generating NutriScores and tactful customer-facing explanations for food products in UK English.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.4,
    max_tokens: 200,
  };

  const response = await axios.post("https://api.openai.com/v1/chat/completions", payload, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
  });

  const content = response.data.choices[0].message.content.trim();
  const match = content.match(/NutriScore\s*[:\-]?\s*([A-E])\s*[\n\-:,\.]?\s*(.+)/i);

  if (!match) {
    console.warn("❌ Unexpected format:", content);
    return ["", ""];
  }

  return [match[1].toUpperCase(), match[2].trim()];
}

app.get("/generate-nutriscore-batch", async (req, res) => {
  try {
    const sheets = await getSheetClient();

    const meta = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: "Nutriscore!F1",
    });

    let row = parseInt(meta.data.values?.[0]?.[0] || "2");
    const batchSize = 100;
    const titlesRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `Nutriscore!A${row}:A${row + batchSize - 1}`,
    });

    const titles = titlesRes.data.values?.map(r => r[0]).filter(Boolean) || [];
    const results = [];

    for (const title of titles) {
      console.log("⚙️ Generating NutriScore for:", title);
      const [score, explanation] = await generateNutriScore(title);
      results.push(["", score, explanation]);
    }

    const updateRange = `Nutriscore!B${row}:D${row + results.length - 1}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: updateRange,
      valueInputOption: "RAW",
      requestBody: {
        values: results,
      },
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: "Nutriscore!F1",
      valueInputOption: "RAW",
      requestBody: {
        values: [[row + results.length]],
      },
    });

    res.send(`✅ Successfully processed ${results.length} NutriScores from row ${row}`);
  } catch (error) {
    console.error("❌ Error:", error.message);
    res.status(500).send("Error generating NutriScores.");
  }
});

app.listen(PORT, () => {
  console.log(`🟢 Server running on port ${PORT}`);
});