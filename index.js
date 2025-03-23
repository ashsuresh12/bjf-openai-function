import express from "express";
import { google } from "googleapis";
import axios from "axios";
import cors from "cors";
import fs from "fs";

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 8080;

// Load service account credentials
const credentials = JSON.parse(fs.readFileSync("bjf-service-account.json"));

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

    // IDs and sheet names
    const spreadsheetId = "1xSOYyVlQJfi64ZyCJ0pnhdqOKeO5cX02F1RnIZ1eHeo";
    const sourceSheet = "Raw Data 22Mar";
    const outputSheet = "v2 Output";

    // Read data from Row 2 down
    const readRange = `${sourceSheet}!B2:I101`;
    const response = await sheets.spreadsheets.values.get({
      auth: authClient,
      spreadsheetId,
      range: readRange
    });

    const rows = response.data.values || [];
    if (rows.length === 0) return res.status(400).send("No data found.");

    const output = [];

    for (const row of rows) {
      const productTitle = row[1] || "";
      const collections = row[2] || "";
      const websiteTitle = row[3] || productTitle;
      const variantsRaw = row[4] || "";
      const extraCollection = row[6] || "";

      if (!productTitle || !variantsRaw) continue;

      const variants = variantsRaw.split(",").map(v => v.trim());
      const tags = formatTags(collections + "," + extraCollection);
      const handle = productTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

      for (const variant of variants) {
        const title = `${websiteTitle} - ${variant}`;
        const description = await generateDescription(websiteTitle);
        const seoDescription = await generateSEODescription(websiteTitle);
        const seoTitle = getSeoTitle(websiteTitle, variant);

        const rowOutput = Array(106).fill("");
        rowOutput[0] = handle;
        rowOutput[1] = title;
        rowOutput[2] = description;
        rowOutput[3] = "BJF";
        rowOutput[4] = "Oil";
        rowOutput[5] = tags;
        rowOutput[9] = "TRUE";
        rowOutput[34] = "Size";
        rowOutput[35] = variant;
        rowOutput[65] = seoTitle;
        rowOutput[66] = seoDescription;

        output.push(rowOutput);
      }
    }

    // Write to v2 Output, starting at row 4
    await sheets.spreadsheets.values.update({
      auth: authClient,
      spreadsheetId,
      range: `${outputSheet}!A4`,
      valueInputOption: "RAW",
      resource: {
        values: output
      }
    });

    res.status(200).json({ message: "Batch processed", rows: output.length });
  } catch (err) {
    console.error("Error:", err.message);
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
  let base = `${product} ${variant}`;
  return base.length > 60 ? base.slice(0, 57) + "..." : base;
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
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              "You are a UK English product content writer. Keep descriptions authentic, neutral, and practical. Avoid repeating 'Discover' or 'Indulge'."
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
    console.error("OpenAI error:", err.message);
    return "Error: Unable to generate content";
  }
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
