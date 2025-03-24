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
  scopes: [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive"
  ]
});

app.get("/", (req, res) => {
  res.send("🟢 BJF OpenAI Function is live.");
});

app.get("/generate-batch", async (req, res) => {
  try {
    const sheets = google.sheets({ version: "v4", auth });
    const authClient = await auth.getClient();

    const spreadsheetId = "1xSOYyVlQJfi64ZyCJ0pnhdqOKeO5cX02F1RnIZ1eHeo";
    const sourceSheet = "Raw Data 22Mar";
    const outputSheet = "v2 Output";

    console.log("Reading from Raw Data 22Mar...");
    const readRange = `${sourceSheet}!B2:I`;
    const response = await sheets.spreadsheets.values.get({
      auth: authClient,
      spreadsheetId,
      range: readRange
    });

    let rows = response.data.values || [];
    if (rows.length === 0) return res.status(400).send("No data found.");

    // 🔒 LIMIT TO FIRST 5 ROWS ONLY
    rows = rows.slice(0, 5);

    console.log(`Processing ${rows.length} rows...`);
    const output = [];

    for (const row of rows) {
      const productTitle = row[1] || "";
      const collections = row[2] || "";
      const websiteTitle = row[3] || productTitle;
      const variantsRaw = row[4] || "";
      const extraCollection = row[6] || "";

      if (!productTitle || !variantsRaw) continue;

      const variants = variantsRaw.split(",").map(v => v.trim());
      const mergedCollections = formatTags(collections + "," + extraCollection);

      for (const variant of variants) {
        const title = `${websiteTitle} - ${variant}`;
        console.log("⏳ Processing:", title);

        const description = await generateDescription(websiteTitle);
        await sleep(1000);
        const seoDescription = await generateSEODescription(websiteTitle);
        await sleep(1000);
        const seoTitle = getSeoTitle(websiteTitle, variant);

        const rowOutput = Array(106).fill("");
        rowOutput[1] = title;               // Column B
        rowOutput[2] = description;         // Column C
        rowOutput[5] = mergedCollections;   // Column F
        rowOutput[64] = seoTitle;           // Column BN
        rowOutput[65] = seoDescription;     // Column BO

        output.push(rowOutput);
      }
    }

    console.log("✅ Writing to sheet...");
    const startRow = 4;
    const writeResult = await sheets.spreadsheets.values.update({
      auth: authClient,
      spreadsheetId,
      range: `${outputSheet}!A${startRow}`,
      valueInputOption: "RAW",
      resource: { values: output }
    });

    console.log("📝 Sheets write result:", writeResult.status, writeResult.statusText);
    res.status(200).json({ message: "✅ Batch complete", rows: output.length });
  } catch (err) {
    console.error("❌ ERROR:", err.message);
    res.status(500).send("Something went wrong");
  }
});

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

function getSeoTitle(product, variant) {
  let title = `${product} ${variant}`.replace(/\(.*?\)/g, "").trim();
  return title.length > 60 ? title.slice(0, 57) + "..." : title;
}

async function generateDescription(title) {
  console.log("Calling OpenAI for description of:", title);
  const prompt = `Write a concise, neutral product description in UK English for '${title}'. Avoid repeating the title at the start. Do not include any reference to product sizes like '250g' or '1L'. Keep it under 400 characters, avoid salesy tone, and ensure natural, flowing copy. No headers or bullet points.`;

  return await callOpenAI(prompt);
}

async function generateSEODescription(title) {
  console.log("Calling OpenAI for SEO description of:", title);
  const prompt = `Write an SEO-friendly description in UK English under 160 characters for a food or pantry item called '${title}'. Do not mention the product title or size. Start with a natural phrase and include a real-world benefit or use.`;

  return await callOpenAI(prompt);
}

async function callOpenAI(prompt) {
  try {
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o",
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
  console.log(`Server running on port ${PORT}`);
});