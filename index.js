// index.js

const express = require('express');
const { generateImagesForPrompt } = require('./services/imageGenerator');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

app.get('/generate-image-test', async (req, res) => {
  const prompt = `Four women in their 20s gathered around a kitchen island, packing stainless steel lunchboxes with protein balls, nuts, and fruit. One is sealing a kraft pouch. A water bottle and cloth napkins are visible. Casual tees, relaxed vibe.`;

  try {
    const imageUrl = await generateImagesForPrompt(prompt);
    res.status(200).json({ imageUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Image generator running on port ${PORT}`);
});