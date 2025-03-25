import express from "express";
import { google } from "googleapis";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 8080;
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

app.get("/generate-batch", async (req, res) => {
  console.log("🔥 /generate-batch triggered");

  try {
    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheetId = "1xSOYyVlQJfi64ZyCJ0pnhdqOKeO5cX02F1RnIZ1eHeo";

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "v2 Output!Z1",
      valueInputOption: "RAW",
      resource: {
        values: [["TEST OK"]]
      }
    });

    console.log("✅ Smoke test write successful.");
    res.status(200).send("✅ Smoke test completed successfully.");
  } catch (err) {
    console.error("❌ Smoke test failed:", err.message);
    res.status(500).send("❌ Failed to write to sheet.");
  }
});

app.listen(PORT, () => {
  console.log(`🟢 Server running on port ${PORT}`);
});