app.get('/generate-nutriscore-batch', async (req, res) => {
  const sheetName = 'Upload2NS';
  const trackingCell = 'AZ1';
  const batchSize = 200;

  try {
    const currentRow = parseInt(await getCell(sheetName, trackingCell)) || 2;
    const endRow = currentRow + batchSize - 1;

    const data = await getRows(sheetName, currentRow, endRow, ['A', 'B']); // A: Handle, B: Description
    const updates = [];
    const handleMap = new Map();

    for (let i = 0; i < data.length; i++) {
      const row = currentRow + i;
      const [handle, description] = data[i];
      if (!handle) continue;

      if (handleMap.has(handle)) {
        // Reuse existing score/explanation for same handle
        const { score, explanation } = handleMap.get(handle);
        updates.push({ row, values: [score, explanation] });
        continue;
      }

      const prompt = `
You're a nutrition labelling expert.

Give a NutriScore for the following food product, using the A to E system (A = healthiest, E = least healthy). Then write a tactful explanation that highlights any positive attributes without calling the food unhealthy, even if it's a lower score.

Product Handle: ${handle}
Product Description: ${description || '[No description provided]'}

Respond in the following format:
NutriScore: [A-E]
Explanation: [1–2 sentence explanation]
      `;

      const result = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
      });

      const output = result.choices?.[0]?.message?.content || '';
      const match = output.match(/NutriScore:\s*([A-E])[\s\S]*?Explanation:\s*(.*)/i);

      if (match) {
        const score = match[1].toUpperCase();
        const explanation = match[2].trim();
        handleMap.set(handle, { score, explanation });
        updates.push({ row, values: [score, explanation] });
      }
    }

    await batchUpdate(sheetName, updates, ['AD', 'AE']);
    await setCell(sheetName, trackingCell, endRow + 1);

    res.send(`✅ NutriScore batch processed. Rows ${currentRow} to ${endRow}.`);
  } catch (error) {
    console.error('❌ NutriScore error:', error.message);
    res.status(500).send('Failed to generate NutriScore batch.');
  }
});