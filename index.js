const express = require('express');
const bodyParser = require('body-parser');
const OpenAI = require('openai');

const app = express();
const port = process.env.PORT || 8080;

app.use(bodyParser.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.post('/generate', async (req, res) => {
  try {
    const { products } = req.body;

    if (!Array.isArray(products)) {
      return res.status(400).json({ error: 'Invalid payload. Expected array of products.' });
    }

    const messages = [
      {
        role: 'system',
        content:
          "You are a UK English product content writer. Keep descriptions authentic, neutral, and practical. Avoid repeating 'Discover' or 'Indulge'.",
      },
    ];

    products.forEach((product) => {
      const cleanedTitle = product.title.replace(/\(.*?\)/g, '').trim();

      messages.push({
        role: 'user',
        content: `Product: ${cleanedTitle}\n\nWrite a concise, neutral product description in UK English. Avoid repeating the title at the start. Do not include any reference to product sizes. Keep it under 400 characters.`,
      });

      messages.push({
        role: 'user',
        content: `Product: ${cleanedTitle}\n\nWrite an SEO-friendly description under 160 characters. Avoid repeating the title or mentioning sizes. Use a natural, varied tone.`,
      });
    });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      temperature: 0.7,
      max_tokens: 400 * products.length,
    });

    const responses = completion.choices.map((choice) => choice.message.content.trim());
    const structured = [];

    for (let i = 0; i < responses.length; i += 2) {
      structured.push({
        description: responses[i],
        seo: responses[i + 1],
      });
    }

    res.status(200).json(structured);
  } catch (error) {
    console.error('OpenAI error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/', (req, res) => {
  res.status(200).send('BJF Cloud Run OpenAI function is running.');
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
