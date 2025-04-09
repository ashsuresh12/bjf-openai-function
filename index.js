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
const BATCH_SIZE = 500;

const ALLERGENS = {
  "Wheat": "https://cdn.shopify.com/s/files/1/0474/3446/5442/files/wheat-256.png?v=1744181466",
  "Fish": "https://cdn.shopify.com/s/files/1/0474/3446/5442/files/fish-256.png?v=1741856283",
  "Crustacean": "https://cdn.shopify.com/s/files/1/0474/3446/5442/files/crustaceans-256.png?v=1741856282",
  "Mollusc": "https://cdn.shopify.com/s/files/1/0474/3446/5442/files/molluscs-256.png?v=1741856282",
  "Egg": "https://cdn.shopify.com/s/files/1/0474/3446/5442/files/eggs-256.png?v=1741856282",
  "Milk": "https://cdn.shopify.com/s/files/1/0474/3446/5442/files/milk-256.png?v=1741856282",
  "Lupin": "https://cdn.shopify.com/s/files/1/0474/3446/5442/files/lupin-256.png?v=1741856282",
  "Peanut": "https://cdn.shopify.com/s/files/1/0474/3446/5442/files/peanuts-256.png?v=1741856282",
  "Soy": "https://cdn.shopify.com/s/files/1/0474/3446/5442/files/soya-256.png?v=1741856282",
  "Sesame": "https://cdn.shopify.com/s/files/1/0474/3446/5442/files/seasame-256.png?v=1741856282",
  "Almond": "https://cdn.shopify.com/s/files/1/0474/3446/5442/files/nuts-256.png?v=1741856282",
  "Brazil Nut": "https://cdn.shopify.com/s/files/1/0474/3446/5442/files/nuts-256.png?v=1741856282",
  "Cashew": "https://cdn.shopify.com/s/files/1/0474/3446/5442/files/nuts-256.png?v=1741856282",
  "Hazelnut": "https://cdn.shopify.com/s/files/1/0474/3446/5442/files/nuts-256.png?v=1741856282",
  "Macadamia": "https://cdn.shopify.com/s/files/1/0474/3446/5442/files/nuts-256.png?v=1741856282",
  "Pecan": "https://cdn.shopify.com/s/files/1/0474/3446/5442/files/nuts-256.png?v=1741856282",
  "Pistachio": "https://cdn.shopify.com/s/files/1/0474/3446/5442/files/nuts-256.png?v=1741856282",
  "Pine Nut": "https://cdn.shopify.com/s/files/1/0474/3446/5442/files/nuts-256.png?v=1741856282",
  "Walnut": "https://cdn.shopify.com/s/files/1/0474/3446/5442/files/nuts-256.png?v=1741856282",
  "Barley": "https://cdn.shopify.com/s/files/1/0474/3446/5442/files/wheat-256.png?v=1744181466",
  "Oats": "https://cdn.shopify.com/s/files/1/0474/3446/5442/files/wheat-256.png?v=1744181466",
  "Rye": "https://cdn.shopify.com/s/files/1/0474/3446/5442/files/wheat-256.png?v=1744181466",
  "Sulphites": "https://cdn.shopify.com/s/files/1/0474/3446/5442/files/sulphites-256.png?v=1741856282",
  "Gluten": "https://cdn.shopify.com/s/files/1/0474/3446/5442/files/gluten-256.png?v=1741856282"
};

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

async function writeAllergenColumns(startRow, rowsOfAllergens) {
  const sheets = await getSheetsClient();
  const range = `${SHEET_NAME}!D${startRow}:ZZ${startRow + rowsOfAllergens.length - 1}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueInputOption: "RAW",
    requestBody: { values: rowsOfAllergens },
  });
}

function normaliseAllergen(term) {
  const lower = term.toLowerCase();
  if (["soy", "soya", "soybean"].includes(lower)) return "Soy";
  const match = Object.keys(ALLERGENS).find(
    a => a.toLowerCase() === lower || lower.includes(a.toLowerCase())
  );
  return match || null;
}

async function generateAllergenList(title, description) {
  const prompt = `List any of the following allergens that may apply to this food product: ${Object.keys(ALLERGENS).join(", ")}. 
Title: "${title}". 
Return only the allergen names, comma-separated. If none apply, return "None".`;

  const payload = {
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "Return valid allergens only from a predefined list. Comma-separated. No commentary.",
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

    const raw = response.data.choices[0].message.content.trim();
    if (raw.toLowerCase().startsWith("none")) return [];

    const parsed = raw
      .split(",")
      .map(a => normaliseAllergen(a.trim()))
      .filter(Boolean);

    return [...new Set(parsed)];
  } catch (error) {
    console.error("OpenAI error:", error.message);
    return [];
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
        output.push([""]);
        continue;
      }

      if (seenHandles[handle]) {
        output.push(seenHandles[handle]);
      } else {
        console.log("🔍 Checking allergens for:", title);
        const allergens = await generateAllergenList(title, description);
        const structured = [];

        allergens.forEach(allergen => {
          structured.push(allergen);
          structured.push(ALLERGENS[allergen] || "");
        });

        seenHandles[handle] = structured;
        output.push(structured);
      }
    }

    await writeAllergenColumns(startRow, output);
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
  console.log(`🟢 Allergen icon+label batch service running on port ${PORT}`);
});