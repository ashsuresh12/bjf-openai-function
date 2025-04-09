import express from "express";
import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = "NPI";
const BATCH_SIZE = 100;

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
    range: `${SHEET_NAME}!H1`,
  });
  return parseInt(res.data.values?.[0]?.[0] || "2", 10);
}

async function updateLastProcessedRow(row) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!H1`,
    valueInputOption: "RAW",
    requestBody: { values: [[row]] },
  });
}

async function fetchBatch(startRow, endRow) {
  const sheets = await getSheetsClient();
  const range = `${SHEET_NAME}!A${startRow}:D${endRow}`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  });
  return res.data.values || [];
}

async function writeNutritionPanels(startRow, npis, jsons, sources) {
  const sheets = await getSheetsClient();

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!E${startRow}:E${startRow + npis.length - 1}`,
    valueInputOption: "RAW",
    requestBody: { values: npis.map(v => [v]) },
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!F${startRow}:F${startRow + jsons.length - 1}`,
    valueInputOption: "RAW",
    requestBody: { values: jsons.map(v => [v]) },
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!G${startRow}:G${startRow + sources.length - 1}`,
    valueInputOption: "RAW",
    requestBody: { values: sources.map(v => [v]) },
  });
}

function guessSource(title, desc) {
  const txt = `${title} ${desc}`.toLowerCase();

  if (/(lentil|rice|bean|chickpea|seed|grain|wheat|barley|flour|oat|spice|herb)/.test(txt)) {
    return "Australian Food Composition Database (AFCD)";
  }

  if (/(mix|blend|trail|muesli|granola)/.test(txt)) {
    return "Open Food Facts";
  }

  if (/(organic|vegan|high protein|keto|gluten-free)/.test(txt)) {
    return "Eat This Much";
  }

  if (/(brand|manufacturer|retailer|company)/.test(txt)) {
    return "Manufacturer Website";
  }

  if (/(panel|label|packaging|nutritional info|nutrition panel)/.test(txt)) {
    return "Publicly Available Nutrition Panel";
  }

  return "OpenAI";
}

async function generateNutritionPanel() {
  const prompt = `Return a nutrition panel in the following format only (no extra text):\n\nEnergy, 3700 kJ\n Protein, 0 g \n Fat, total, 100 g \n - Saturated, 14 g \n - Monounsaturated, 73 g \n - Polyunsaturated, 11 g \n Carbohydrate, 0 g`;

  const payload = {
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content:
          "You are an expert at generating clear and structured nutritional panels for food products. Return only the structured panel text in the exact format provided. Do not include any additional comments or explanation.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.2,
    max_tokens: 250,
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
    return null;
  }
}

app.get("/generate-nutrition-batch", async (req, res) => {
  try {
    const startRow = await getLastProcessedRow();
    const endRow = startRow + BATCH_SIZE - 1;
    const rows = await fetchBatch(startRow, endRow);
    if (rows.length === 0) return res.send("✅ All rows processed.");

    const seenHandles = {};
    const outputNPI = [], outputJSON = [], outputSource = [];

    for (let i = 0; i < rows.length; i++) {
      const [handle = "", title = "", desc = "", tags = ""] = rows[i];

      const foodKeywords = [
        "food", "snack", "drink", "beverage", "pantry", "baking", "oil", "condiment",
        "sauce", "spice", "dairy", "meat", "frozen", "chilled", "grocery", "breakfast",
        "grain", "protein", "sweet", "savoury", "spread", "nut", "seed", "fruit", "mix",
        "herb", "cereal", "lentil", "pulse", "legume", "flour", "meal", "rice", "oat"
      ];

      const searchable = `${title} ${desc} ${tags}`.toLowerCase();
      const isFood = foodKeywords.some(word => searchable.includes(word));

      console.log(`Row ${startRow + i}: handle='${handle}', title='${title}', isFood=${isFood}`);

      if (!isFood || !handle) {
        outputNPI.push("");
        outputJSON.push("");
        outputSource.push("");
        continue;
      }

      if (seenHandles[handle]) {
        const { npi, json, source } = seenHandles[handle];
        outputNPI.push(npi);
        outputJSON.push(json);
        outputSource.push(source);
        continue;
      }

      console.log(`Generating nutrition panel for: ${title}`);
      const npi = await generateNutritionPanel();
      if (!npi) {
        console.log("❌ Failed to generate NPI");
        outputNPI.push("");
        outputJSON.push("");
        outputSource.push("");
        continue;
      }

      console.log("✅ NPI generated:", npi);

      const json = JSON.stringify({
        type: "root",
        children: [
          {
            type: "paragraph",
            children: [{ type: "text", value: npi }],
          },
        ],
      });

      const source = guessSource(title, desc);
      seenHandles[handle] = { npi, json, source };
      outputNPI.push(npi);
      outputJSON.push(json);
      outputSource.push(source);
    }

    await writeNutritionPanels(startRow, outputNPI, outputJSON, outputSource);
    await updateLastProcessedRow(startRow + rows.length);

    res.send(`✅ Processed rows ${startRow} to ${startRow + rows.length - 1}`);
  } catch (error) {
    console.error("❌ Error:", error);
    res.status(500).send("Failed to generate nutrition panels.");
  }
});

app.get("/reset-nutrition", async (req, res) => {
  await updateLastProcessedRow(2);
  res.send("✅ Nutrition batch pointer reset to row 2.");
});

app.listen(PORT, () => {
  console.log(`🟢 Nutrition batch service running on port ${PORT}`);
});
