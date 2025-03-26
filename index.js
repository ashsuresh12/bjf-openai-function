import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { google } from "googleapis";
import { OpenAI } from "openai";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;
const SHEET_NAME = "Ingredients";
const BATCH_SIZE = 500;

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

const sheets = google.sheets({ version: "v4", auth });
const spreadsheetId = process.env.SPREADSHEET_ID;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const disclaimer = "This ingredient list is based on data from suppliers and may vary. Please check product packaging for the most accurate details.";

function isFoodOrBeverage(title) {
  const nonConsumables = ["toothpaste", "mouthwash", "disinfectant", "spray", "detergent", "cleaner"];
  const lower = title.toLowerCase();
  return !nonConsumables.some(term => lower.includes(term));
}

function formatIngredientsJSON(text) {
  return {
    type: "root",
    children: [
      {
        type: "paragraph",
        children: [
          { type: "text", value: "Ingredients:", bold: true },
          { type: "text", value: " " + text }
        ]
      }
    ]
  };
}

async function getOpenAIIngredients(title) {
  const prompt = `List the ingredients for this food or beverage product in natural UK English, ideally with percentages if available: "${title}". Respond with just the ingredients.`;
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are a helpful assistant that provides clean ingredient lists for food and beverage products."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    temperature: 0.5
  });

  return response.choices[0].message.content.trim();
}

app.get("/generate-ingredients-batch", async (req, res) => {
  try {
    const meta = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAME}!F1`
    });

    let startRow = parseInt(meta.data.values?.[0]?.[0] || "2");
    const range = `${SHEET_NAME}!A${startRow}:A${startRow + BATCH_SIZE - 1}`;

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range
    });

    const titles = result.data.values || [];
    if (titles.length === 0) {
      console.log("🛑 No more products to process.");
      return res.status(200).send("No more products to process.");
    }

    const ingredientsOut = [];
    const sourcesOut = [];

    console.log(`🔄 Starting batch at row ${startRow}...`);

    for (let i = 0; i < titles.length; i++) {
      const rowNumber = startRow + i;
      const title = titles[i][0];
      if (!title) {
        ingredientsOut.push([""]);
        sourcesOut.push([""]);
        continue;
      }

      console.log(`📦 Processing: ${title}`);

      if (!isFoodOrBeverage(title)) {
        console.log(`⚠️ Skipped non-consumable: ${title}`);
        ingredientsOut.push([""]);
        sourcesOut.push([""]);
        continue;
      }

      try {
        const ing = await getOpenAIIngredients(title);
        const json = formatIngredientsJSON(ing);
        ingredientsOut.push([JSON.stringify(json)]);
        sourcesOut.push([disclaimer]);
        console.log(`✅ Success for: ${title}`);
      } catch (err) {
        console.error(`❌ Error for ${title}:`, err.message);
        ingredientsOut.push([""]);
        sourcesOut.push([""]);
      }
    }

    const ingredientsRange = `${SHEET_NAME}!B${startRow}:B${startRow + ingredientsOut.length - 1}`;
    const sourcesRange = `${SHEET_NAME}!C${startRow}:C${startRow + sourcesOut.length - 1}`;

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: [
          { range: ingredientsRange, values: ingredientsOut },
          { range: sourcesRange, values: sourcesOut }
        ]
      }
    });

    // Update pointer in F1
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME}!F1`,
      valueInputOption: "RAW",
      requestBody: { values: [[startRow + BATCH_SIZE]] }
    });

    res.status(200).send(`✅ Processed rows ${startRow} to ${startRow + BATCH_SIZE - 1}`);
  } catch (err) {
    console.error("❌ Unexpected error:", err.message);
    res.status(500).send("Error: " + err.message);
  }
});

app.listen(PORT, () => {
  console.log(`🟢 Server running on port ${PORT}`);
});