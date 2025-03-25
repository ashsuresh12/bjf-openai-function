const express = require("express");
const { google } = require("googleapis");
const { Configuration, OpenAIApi } = require("openai");

const app = express();
const port = process.env.PORT || 10000;

// Auth & Setup
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const spreadsheetId = "1xSOYyVlQJfi64ZyCJ0pnhdqOKeO5cX02F1RnIZ1eHeo";
const outputSheet = "v2 Output";

// === VARIANT OPTION GENERATION ===
app.get("/populate-variant-options", async (req, res) => {
  try {
    const authClient = await auth.getClient();
    const readRange = `${outputSheet}!AS4:AT`;
    const readResp = await sheets.spreadsheets.values.get({
      auth: authClient,
      spreadsheetId,
      range: readRange,
    });

    const weightData = readResp.data.values || [];
    const optionRows = [];

    for (let i = 0; i < weightData.length; i++) {
      const rowNum = i + 4;
      const weight = parseFloat(weightData[i][0] || "");
      const unit = (weightData[i][1] || "").toLowerCase();

      let optionName = "";
      let optionValue = "";

      if (!isNaN(weight)) {
        if (unit === "kgs") {
          optionName = "Weight";
          optionValue = `${Math.round(weight * 1000)}g`;
        } else if (unit === "litre") {
          optionName = "Weight";
          if (weight < 1) {
            optionValue = `${Math.round(weight * 1000)}mL`;
          } else {
            optionValue = `${weight}L`;
          }
        } else if (unit === "each") {
          optionName = "Each";
          optionValue = "";
        }
      } else {
        optionName = "Each";
        optionValue = "";
      }

      console.log(`Row ${rowNum}: AI = ${optionName}, AJ = ${optionValue}`);
      optionRows.push([optionName, optionValue]);
    }

    await sheets.spreadsheets.values.update({
      auth: authClient,
      spreadsheetId,
      range: `${outputSheet}!AI4:AJ${optionRows.length + 3}`,
      valueInputOption: "RAW",
      resource: { values: optionRows },
    });

    res.status(200).send(`✅ Populated AI & AJ for ${optionRows.length} rows`);
  } catch (err) {
    console.error("❌ Error populating variant options:", err.message);
    res.status(500).send("Something went wrong");
  }
});

app.listen(port, () => {
  console.log(`🟢 Server running on port ${port}`);
});