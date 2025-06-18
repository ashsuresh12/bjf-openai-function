const fetch = require('node-fetch');

/**
 * Generates an image using the OpenAI API based on the given prompt.
 * @param {string} prompt - The text prompt to generate the image from.
 * @returns {Promise<string>} - The URL of the generated image.
 */
async function generateImage(prompt) {
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
      const errorData = await response.json();
      console.error('❌ OpenAI API error:', errorData);
      throw new Error(errorData.error?.message || 'Unknown error from OpenAI API');
    }

    const data = await response.json();
    return data.data[0].url;
  } catch (error) {
    console.error('❌ Failed to generate image:', error.message);
    throw error;
  }
}

module.exports = generateImage;