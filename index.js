import express from 'express';
import dotenv from 'dotenv';
import axios from 'axios';
import { getRows, batchUpdate } from './sheets.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const sheetName = 'Copy of Sheet24';
const batchSize = 669; // Full sheet
const startRow = 2;

const DIET_TAGS = [
  'Vegan',
  'Vegetarian',
  'Plant Based',
  'High Protein',
  'Low Carb',
  'Keto Friendly',
  'Gluten Free',
  'Dairy Free',
  'Nut Free',
  'Soy Free',
  'Organic',
  'Non GMO'
];

app.get('/', (req, res) => {
  res.send('✅ Diet Tagging Service is live.<br><br>Use <code>/generate-diet-tags</code> to start tagging.');
});

app.get('/generate-diet-tags', async (req, res) => {
  try {
    const data = await getRows(sheetName, startRow, startRow + batchSize - 1, ['B', 'C', 'AV']);

    const updatesAY = [];
    const updatesAZ = [];

    for (let i = 0; i < data.length; i++) {
      const rowNum = startRow + i;
      const [title, description, ingredients] = data[i];

      if (!title && !description && !ingredients) continue;

      const prompt = `
You are a dietary compliance assistant for a whole foods retailer. Based on the product title, description, and ingredients below, identify which of the following diets apply:

${DIET_TAGS.join(', ')}

Respond with two fields:
1. **Tags**: A comma-separated list of applicable diets using the exact wording above (e.g. Vegan, Gluten Free). Do not hyphenate.
2. **Rationale**: A brief justification, citing keywords, claims, or ingredient exclusions that support the tag selections.

Product Title: ${title}
Product Description: ${description}
Ingredients: ${ingredients}
`;

      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o',
          messages: [{ role: 'user', content: prompt }],
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const content = response.data.choices[0].message.content;
      const tagMatch = content.match(/\*\*Tags\*\*:\s*(.+)/i);
      const rationaleMatch = content.match(/\*\*Rationale\*\*:\s*(.+)/i);

      const tags = tagMatch ? tagMatch[1].trim() : '';
      const rationale = rationaleMatch ? rationaleMatch[1].trim() : '';

      updatesAY.push({ row: rowNum, values: [tags] });
      updatesAZ.push({ row: rowNum, values: [rationale] });
    }

    await batchUpdate(sheetName, updatesAY, ['AY']);
    await batchUpdate(sheetName, updatesAZ, ['AZ']);

    res.send(`✅ Diet tags and rationale updated for ${updatesAY.length} rows in "${sheetName}".`);
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).send('Failed to generate diet tags.');
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔗 Endpoint: http://localhost:${PORT}/generate-diet-tags`);
});