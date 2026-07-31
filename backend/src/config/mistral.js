const env = require('./env');

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';
const PLACEHOLDER_KEY = 'your_mistral_key_here';

async function askMistral(messages) {
  if (!env.mistralApiKey || env.mistralApiKey === PLACEHOLDER_KEY) {
    const err = new Error("Assistant IA indisponible : aucune clé API Mistral n'est configurée (MISTRAL_API_KEY)");
    err.status = 503;
    throw err;
  }

  let response;
  try {
    response = await fetch(MISTRAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.mistralApiKey}`,
      },
      body: JSON.stringify({
        model: env.mistralModel,
        messages,
        temperature: 0.3,
      }),
    });
  } catch (err) {
    const networkError = new Error("Impossible de contacter l'API Mistral (problème réseau)");
    networkError.status = 502;
    throw networkError;
  }

  if (!response.ok) {
    const body = await response.text();
    const err = new Error(`Mistral API error (${response.status})`);
    err.status = 502;
    err.details = body;
    throw err;
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

module.exports = { askMistral };
