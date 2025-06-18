// services/imageGenerator.js

import OpenAI from 'openai';
import { uploadToDrive } from './uploadToDrive.js';

const openai = new OpenAI();

export async function generateImagesForPrompt(prompt) {
  const backgroundColors = [
    '#F3C7AA', // Apricot
    '#ED997D', // Atomic Tangerine
    '#F5A877', // Sandy Brown
    '#F8F4EC', // Almond Cream
    '#D7B98E'  // Golden Almond
  ];

  const images = [];

  for (const hex of backgroundColors) {
    const response = await openai.images.generate({
      prompt: `${prompt}, background in ${hex}, soft natural light, realistic home setting`,
      n: 1,
      size: '1024x1024',
      response_format: 'url'
    });

    const imageUrl = response.data[0].url;
    const uploadedFile = await uploadImageToDrive(imageUrl, prompt, hex);

    images.push({ hex, imageUrl, uploadedFile });
  }

  return images;
}