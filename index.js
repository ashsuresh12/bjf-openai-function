import express from "express";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import { generateSingleImage } from "./services/imageGenerator.js";

dotenv.config();

const app = express();
app.use(bodyParser.json());

app.post("/generate-image-test", async (req, res) => {
  try {
    const prompt = req.body.prompt || "Default image prompt";

    const imageUrl = await generateSingleImage(prompt);

    res.json({ message: "✅ Image generated and uploaded", url: imageUrl });
  } catch (err) {
    console.error("❌ Error generating image:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(10000, () => {
  console.log("🚀 Image generator running on port 10000");
});