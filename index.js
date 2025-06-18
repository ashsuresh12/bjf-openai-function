import express from "express";
import { generateImagesForPrompt } from "./services/imageGenerator.js";

const app = express();

app.get("/generate-image-test", async (req, res) => {
  try {
    const prompt =
      "Four women in their 20s gathered around a kitchen island, packing stainless steel lunchboxes with protein balls, nuts, and fruit. One is sealing a kraft pouch. A water bottle and cloth napkins are visible. Casual tees, relaxed vibe.";

    const results = await generateImagesForPrompt(prompt);
    res.json({ success: true, results });
  } catch (err) {
    console.error("❌ Error generating image batch:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(3000, () => {
  console.log("✅ Server running on port 3000");
});