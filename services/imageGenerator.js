// services/imageGenerator.js

const fetch = require('node-fetch');

async function generateImagesForPrompt(prompt) {
  try {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: prompt,
        n: 1,
        size: '1024x1024',
        response_format: 'url',
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ OpenAI API error:', error);
      throw new Error(error.error?.message || 'Unknown error');
    }

    const data = await response.json();
    return data.data[0].url;
  } catch (err) {
    console.error('❌ Image generation failed:', err.message);
    throw err;
  }
}

module.exports = {
  generateImagesForPrompt,
};