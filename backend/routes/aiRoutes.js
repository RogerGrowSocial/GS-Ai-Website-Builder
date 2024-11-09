const express = require('express');
const router = express.Router();
const axios = require('axios');

// Route voor AI content generatie met axios
router.get('/generate', async (req, res) => {
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/completions',
      {
        model: 'text-davinci-003',
        prompt: 'Maak een introductietekst voor een kledingwebsite',
        max_tokens: 100,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      }
    );

    res.json({ content: response.data.choices[0].text.trim() });
  } catch (error) {
    console.error('Error generating content:', error);
    res.status(500).json({ error: 'Failed to generate content' });
  }
});

module.exports = router;
