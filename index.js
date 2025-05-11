app.get('/generate-diet-tags-23', async (req, res) => {
  const sheetName = 'Copy of Sheet23';
  const startRow = 2;
  const batchSize = 669;

  try {
    // B = Title (2), C = Description (3), AO = Ingredients (41)
    const data = await getRows(sheetName, startRow, startRow + batchSize - 1, ['B', 'C', 'AO']);

    const updatesAR = []; // Tags → Column AR (44)
    const updatesAS = []; // Rationale → Column AS (45)

    for (let i = 0; i < data.length; i++) {
      const rowNum = startRow + i;
      const [title, description, ingredients] = data[i];

      if (!title && !description && !ingredients) continue;

      const prompt = `
You are a dietary compliance assistant for a whole foods retailer. Based on the product title, description, and ingredients below, identify which of the following diets apply:

Vegan, Vegetarian, Plant Based, High Protein, Low Carb, Keto Friendly, Gluten Free, Dairy Free, Nut Free, Soy Free, Organic, Non GMO

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

      updatesAR.push({ row: rowNum, values: [tags] });
      updatesAS.push({ row: rowNum, values: [rationale] });
    }

    await batchUpdate(sheetName, updatesAR, ['AR']);
    await batchUpdate(sheetName, updatesAS, ['AS']);

    res.send(`✅ Diet tags and rationale updated for ${updatesAR.length} rows in "${sheetName}".`);
  } catch (err) {
    console.error('❌ Error in /generate-diet-tags-23:', err.message);
    res.status(500).send('Failed to generate diet tags for Sheet23.');
  }
});