import express from "express";
import { google } from "googleapis";
import axios from "axios";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 8080;
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"]
});

app.get("/generate-batch", async (req, res) => {
  try {
    const sheets = google.sheets({ version: "v4", auth });

    const spreadsheetId = "1xSOYyVlQJfi64ZyCJ0pnhdqOKeO5cX02F1RnIZ1eHeo";
    const sourceSheet = "Raw Data 22Mar";
    const outputSheet = "v2 Output";
    const logCol = 107; // Column DC
    const batchSize = 100;

    const a1res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${outputSheet}!A1`
    });
    let startRow = parseInt(a1res.data.values?.[0]?.[0]) || 2;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sourceSheet}!B${startRow}:I${startRow + batchSize - 1}`
    });

    const rows = response.data.values || [];
    if (rows.length === 0) {
      return res.status(200).send("✅ No more products to process.");
    }

    const output = [];
    let processedCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const productRow = startRow + i;

      const sku = row[0]?.trim() || "";
      const productTitle = row[1]?.trim() || "";
      const collections = row[2] || "";
      const websiteTitle = row[3]?.trim() || productTitle;
      const variantsRaw = row[4] || "";
      const extraCollection = row[6] || "";

      if (!productTitle || !variantsRaw) continue;

      const variants = variantsRaw.split(",").map(v => v.trim());
      const handle = productTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const type = inferTypeFromCollections(collections + "," + extraCollection);
      const tags = formatTags(collections + "," + extraCollection);

      const description = await generateDescription(websiteTitle);
      await sleep(1000);
      const seoDescription = await generateSEODescription(websiteTitle);
      await sleep(1000);

      for (const variant of variants) {
        const fullTitle = `${websiteTitle} - ${variant}`;
        const { weight, unit } = extractWeightAndUnit(variant);
        const seoTitle = getSeoTitle(websiteTitle, variant);

        const rowOutput = Array(106).fill("");
        rowOutput[0] = handle;
        rowOutput[1] = fullTitle;
        rowOutput[2] = description;
        rowOutput[3] = "BJF";
        rowOutput[4] = type;
        rowOutput[5] = tags;
        rowOutput[44] = weight;
        rowOutput[45] = unit;
        rowOutput[64] = seoTitle;
        rowOutput[65] = seoDescription;
        rowOutput[logCol - 1] = `✅ ${productTitle}`;

        output.push(rowOutput);
        processedCount++;
      }
    }

    const outputStartRow = 4;
    const rangeStart = outputStartRow + (startRow - 2) * 3;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${outputSheet}!A${rangeStart}`,
      valueInputOption: "RAW",
      resource: { values: output }
    });

    const newStartRow = startRow + rows.length;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${outputSheet}!A1`,
      valueInputOption: "RAW",
      resource: { values: [[newStartRow.toString()]] }
    });

    res.status(200).json({ message: `✅ Processed ${processedCount} variant rows.` });
  } catch (err) {
    console.error("❌ ERROR:", err.message);
    res.status(500).send("Something went wrong");
  }
});

app.get("/reset", async (req, res) => {
  try {
    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheetId = "1xSOYyVlQJfi64ZyCJ0pnhdqOKeO5cX02F1RnIZ1eHeo";
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "v2 Output!A1",
      valueInputOption: "RAW",
      resource: { values: [["2"]] }
    });
    res.status(200).send("🔄 Reset A1 to 2 (start from top)");
  } catch (err) {
    console.error("❌ Reset error:", err.message);
    res.status(500).send("❌ Failed to reset A1");
  }
});

// ----- UTILITIES -----

function formatTags(raw) {
  return raw
    .split(",")
    .map(t => t.trim())
    .filter(Boolean)
    .map(tag =>
      tag
        .split(" ")
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ")
    )
    .join(", ");
}

function inferTypeFromCollections(input) {
  const cleaned = input.toLowerCase();
  if (cleaned.includes("nuts")) return "Nuts";
  if (cleaned.includes("grains")) return "Grains";
  if (cleaned.includes("seeds")) return "Seeds";
  if (cleaned.includes("snacks")) return "Snacks";
  return "Pantry";
}

function extractWeightAndUnit(text) {
  const match = text.match(/(\d+(?:\.\d+)?)(g|kg|ml|l)/i);
  if (!match) return { weight: "", unit: "" };

  let [_, num, unit] = match;
  let value = parseFloat(num);
  unit = unit.toLowerCase();

  let normalised = "";
  let unitOut = "";

  if (unit === "g" || unit === "ml") {
    normalised = (value / 1000).toFixed(3).replace(/\.?0+$/, "");
    unitOut = unit === "g" ? "kgs" : "Litre";
  } else if (unit === "kg" || unit === "l") {
    normalised = value.toString();
    unitOut = unit === "kg" ? "kgs" : "Litre";
  }

  return { weight: normalised, unit: unitOut };
}

function getSeoTitle(product, variant) {
  let title = `${product} ${variant}`.replace(/\(.*?\)/g, "").trim();
  return title.length > 60 ? title.slice(0, 57) + "..." : title;
}

async function generateDescription(title) {
  const prompt = `Write a concise, neutral product description in UK English for '${title}'. Avoid repeating the title at the start. Do not include any reference to product sizes like '250g' or '1L'. Keep it under 400 characters, avoid salesy tone, and ensure natural, flowing copy. No headers or bullet points.`;
  return await callOpenAI(prompt);
}

async function generateSEODescription(title) {
  const prompt = `Write an SEO-friendly description in UK English under 160 characters for a food or pantry item called '${title}'. Do not mention the product title or size. Start with a natural phrase and include a real-world benefit or use.`;
  return await callOpenAI(prompt);
}

async function callOpenAI(prompt) {
  try {
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a UK English product content writer. Keep descriptions authentic, neutral, and practical. Avoid repeating 'Discover' or 'Indulge'."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 200,
        temperature: 0.7
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );
    return res.data.choices[0].message.content.trim();
  } catch (err) {
    console.error("❌ OpenAI error:", err.message);
    return "TEMP – content skipped due to rate limit (429)";
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

app.listen(PORT, () => {
  console.log(`🟢 Server running on port ${PORT}`);
});