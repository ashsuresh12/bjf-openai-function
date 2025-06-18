// index.js
import express from "express";
import dotenv from "dotenv";
import { generateImagesForPrompt } from "./services/imageGenerator.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

app.get("/generate-image-test", async (req, res) => {
  try {
    const prompt =
      "Four women in their 20s gathered around a kitchen island, packing stainless steel lunchboxes with protein balls, nuts, and fruit. One is sealing a kraft pouch. A water bottle and cloth napkins are visible. Casual tees, relaxed vibe.";

    const result = await generateImagesForPrompt(prompt);
    res.json({ success: true, result });
  } catch (error) {
    console.error("❌ Error generating image batch:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Image generator running on port ${PORT}`);
});