import OpenAI from "openai";
import { uploadImageToDrive } from "./uploadToDrive.js";
import sharp from "sharp";

const openai = new OpenAI();

export async function generateSingleImage(prompt) {
  const backgroundHex = "#F3C7AA"; // test colour

  const fullPrompt = `${prompt}, soft natural light, peach background (${backgroundHex}), no label`;

  const imageResponse = await openai.images.generate({
    model: "dall-e-3",
    prompt: fullPrompt,
    n: 1,
    size: "1024x1024",
    response_format: "b64_json",
  });

  const imageBase64 = imageResponse.data[0].b64_json;
  const buffer = Buffer.from(imageBase64, "base64");

  const filename = `image-${Date.now()}.png`;
  const uploadUrl = await uploadImageToDrive(buffer, filename);

  return uploadUrl;
}