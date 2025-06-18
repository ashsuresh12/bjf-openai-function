import { OpenAI } from "openai";
import { uploadImageToDrive } from "./driveUploader.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const BACKGROUNDS = [
  "#F3C7AA", // Apricot
  "#ED997D", // Atomic Tangerine
  "#F5A877", // Sandy Brown
  "#F8F4EC", // Almond Cream
  "#D7B98E"  // Golden Almond
];

export async function generateImagesForPrompt(basePrompt) {
  const results = [];

  for (const hex of BACKGROUNDS) {
    const fullPrompt = `${basePrompt}, soft natural light, non-timber benchtop, on a ${hex} background`;
    console.log(`🎨 Generating: ${fullPrompt}`);

    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: fullPrompt,
      n: 1,
      size: "1024x1024"
    });

    const imageUrl = response.data[0].url;
    const uploaded = await uploadImageToDrive(imageUrl, basePrompt, hex);
    results.push({ hex, url: uploaded.webViewLink });
  }

  return results;
}