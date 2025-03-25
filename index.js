import express from "express";
import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import dotenv from "dotenv";
import { OpenAI } from "openai";

dotenv.config();
const app = express();
const port = process.env.PORT || 10000;

const sheets = google.sheets("v4");
const auth = new GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = "Nutriscore";

app.get("/generate-nutriscore-batch", async (req, res) => {
  try {
    const authClient = await auth.getClient();

    // Step 1: Get current F1 (last processed row)
    const f1Res = await sheets.spreadsheets.values.get({
      auth: authClient,
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!F1`,
    });

    let startRow = parseInt(f1Res.data.values?.[0]?.[0]) || 2;
    const batchSize = 500;
    const endRow = startRow + batchSize - 1;

    console.log(`🔁 Processing rows ${startRow} to ${endRow}...`);

    // Step 2: Fetch batch data
    const readRange = `${SHEET_NAME}!A${startRow}:B${endRow}`;
    const readRes = await sheets.spreadsheets.values.get({
      auth: authClient,
      spreadsheetId: SPREADSHEET_ID,
      range: readRange,
    });

    const rows = readRes.data.values || [];
    if (rows.length === 0) {
      console.log("✅ All done — no more rows to process.");
      return res.status(200).send("All done.");
    }

    // Step 3: Group by handle (Column A)
    const uniqueScores = {};
    for (let i = 0; i < rows.length; i++) {
      const handle = rows[i][0]?.trim();
      const title = rows[i][1]?.trim();
      if (!handle || !title) continue;
      if (!uniqueScores[handle]) uniqueScores[handle] = title;
    }

    // Step 4: Call OpenAI for each unique handle
    const handleToResult = {};
    for (const [handle, title] of Object.entries(uniqueScores)) {
      console.log(`🔍 Scoring ${handle}: ${title}`);

      try {
        const messages = [
          {
            role: "system",
            content:
              "You are a nutrition labelling assistant. Based on the product name, assign a NutriScore from A (healthiest) to E (least healthy).",
          },
          {
            role: "user",
            content: `Product: "${title}"\n\nReturn a NutriScore (A-E) and a short explanation suitable for customers.`,
          },
        ];

        const completion = await openai.chat.completions.create({
          model: "gpt-4o",
          messages,
          max_tokens: 150,
          temperature: 0.5,
        });

        const result = completion.choices[0].message.content.trim();
        const scoreMatch = result.match(/\b([A-E])\b/);
        const score = scoreMatch ? scoreMatch[1] : "C";
        const explanation = result.replace(/^.*?[A-E]\b[^\w]*/, "").trim();

        handleToResult[handle] = { score, explanation };
        await new Promise((r) => setTimeout(r, 1000)); // 1s delay

      } catch (err) {
        console.error(`❌ OpenAI error for ${handle}:`, err.message);
        handleToResult[handle] = { score: "", explanation: "Error" };
      }
    }

    // Step 5: Write results back to Columns C and D
    const output = rows.map(([handle]) => {
      const entry = handleToResult[handle] || { score: "", explanation: "" };
      return [entry.score, entry.explanation];
    });

    const writeRange = `${SHEET_NAME}!C${startRow}:D${startRow + output.length - 1}`;
    await sheets.spreadsheets.values.update({
      auth: authClient,
      spreadsheetId: SPREADSHEET_ID,
      range: writeRange,
      valueInputOption: "RAW",
      requestBody: { values: output },
    });

    // Step 6: Update F1 with new position
    const newF1 = [[(startRow + output.length).toString()]];
    await sheets.spreadsheets.values.update({
      auth: authClient,
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!F1`,
      valueInputOption: "RAW",
      requestBody: { values: newF1 },
    });

    console.log(`✅ Finished rows ${startRow} to ${startRow + output.length - 1}`);
    res.status(200).send(`Processed ${output.length} rows.`);

  } catch (err) {
    console.error("❌ Unexpected error:", err.message);
    res.status(500).send("Something went wrong.");
  }
});

app.listen(port, () => {
  console.log(`🟢 Server running on port ${port}`);
});