import express from "express";
import { google } from "googleapis";
import { config } from "dotenv";
import OpenAI from "openai";

config();

const app = express();
const port = process.env.PORT || 10000;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

const SHEET_NAME = "Ingredients";
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

app.get("/generate-ingredients-batch", async (req, res) => {
  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const readRange = `${SHEET_NAME}!A2:A51`;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: readRange
    });

    const titles = response.data.values?.flat() || [];
    const output = [];
    const sources = [];

    for (const title of titles) {
      if (!title) {
        output.push([""]);
        sources.push([""]);
        continue;
      }

      const isConsumable = await checkIfConsumable(title);
      if (!isConsumable) {
        output.push([""]);
        sources.push([""]);
        continue;
      }

      const formattedPrompt = `Give the ingredients for '${title}' in a human-consumable format. Include percentages like '100%' where applicable. Return only the list of ingredients, no extra info.`;
      const sourcePrompt = `Where did you find the ingredients for '${title}'? Reply with sources like website, packaging, or label.`;

      const [ingredients, source] = await Promise.all([
        getOpenAIResponse(formattedPrompt),
        getOpenAIResponse(sourcePrompt)
      ]);

      const formattedJson = JSON.stringify({
        type: "root",
        children: [
          {
            type: "paragraph",
            children: [
              { type: "text", value: "Ingredients:", bold: true },
              { type: "text", value: ingredients.trim() }
            ]
          }
        ]
      });

      output.push([formattedJson]);
      sources.push([source.trim()]);
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!B2:B${titles.length + 1}`,
      valueInputOption: "RAW",
      requestBody: { values: output }
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!C2:C${titles.length + 1}`,
      valueInputOption: "RAW",
      requestBody: { values: sources }
    });

    res.send("✅ Ingredients written to sheet");
  } catch (error) {
    console.error("❌ Error generating ingredients:", error);
    res.status(500).send("Something went wrong");
  }
});

async function checkIfConsumable(title) {
  const prompt = `Is '${title}' a human-consumable food or drink item? Reply only YES or NO.`;
  const response = await getOpenAIResponse(prompt);
  return response.toLowerCase().includes("yes");
}

async function getOpenAIResponse(prompt) {
  const chat = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are a food product content assistant. Only respond concisely and accurately."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    temperature: 0.2,
    max_tokens: 200
  });

  return chat.choices[0].message.content.trim();
}

app.listen(port, () => {
  console.log(`🟢 Ingredients service live on port ${port}`);
});