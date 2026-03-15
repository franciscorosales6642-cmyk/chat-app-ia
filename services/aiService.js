const OpenAI = require('openai');

async function askAI(userPrompt) {
  if (!process.env.OPENAI_API_KEY) {
    return 'La integración de IA está lista, pero falta configurar OPENAI_API_KEY en tu archivo .env.';
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: 'Eres un asistente útil, amigable y breve dentro de una app de mensajería.',
      },
      { role: 'user', content: userPrompt },
    ],
  });

  return response.choices?.[0]?.message?.content || 'No hubo respuesta de la IA.';
}

module.exports = { askAI };
