require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

(async () => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: 'Say "Orga API connected!" and nothing else.',
  });

  console.log(response.text);
})();
