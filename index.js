const express = require("express");
const { google } = require("googleapis");
const { GoogleAuth } = require("google-auth-library");
const { Configuration, OpenAIApi } = require("openai");

const app = express();
const port = process.env.PORT || 10000;

// Setup OpenAI
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// Setup Google Sheets
const auth = new GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

const SPREADSHEET_ID = "1xSOYyVlQJfi64ZyCJ0pnhdqOKeO5cX02F1RnIZ1eHeo";
const SHEET_NAME = "Nutriscore";

// NutriScore prompt
async function getNutriScoreAndExplanation(title) {
  const prompt = `Give a NutriScore (A to E) and a tactful explanation for the product "${title}". Respond in this format:
NutriScore: X
Explanation: <short explanation>`;

  const response = await openai.createChatCompletion({
    model: "gpt-4o", // You can change to 'gpt-4o' or 'gpt-4o-mini'
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

  const text = response.data.choices[0].message.content;
  const scoreMatch = text.match(/NutriScore:\s*([A-E])/i);
  const explanationMatch = text.match(/Explanation:\s*(.+)/i);

  return {
    score: scoreMatch ? scoreMatch[1].toUpperCase() : "",
    explanation: explanationMatch ? explanationMatch[1].trim() : "",
  };
}

// Route for NutriScore test batch
app.get("/generate-nutriscore-test", async (req, res) => {
  try {
    const readRange = `${SHEET_NAME}!A2:A101`;
    const sheetData = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: readRange,
    });

    const titles = sheetData.data.values || [];
    const results = [];

    for (let i = 0; i < titles.length; i++) {
      const title = titles[i][0];
      if (!title) {
        results.push(["", ""]);
        continue;
      }

      console.log(`🔍 Processing: ${title}`);
      try {
        const { score, explanation } = await getNutriScoreAndExplanation(title);
        results.push([score, explanation]);
      } catch (err) {
        console.error(`❌ Failed for "${title}":`, err.message);
        results.push(["Error", ""]);
      }

      await new Promise((resolve) => setTimeout(resolve, 1000)); // 1s delay
    }

    const writeRange = `${SHEET_NAME}!B2:C${results.length + 1}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: writeRange,
      valueInputOption: "RAW",
      requestBody: { values: results },
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