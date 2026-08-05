const env = require('./env');

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';
const PLACEHOLDER_KEY = 'your_mistral_key_here';
const MAX_RETRIES = 3; // réessais sur 429 (trop de requêtes) et 5xx transitoires

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function callMistral(messages) {
  return fetch(MISTRAL_API_URL, {
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
}

async function askMistral(messages) {
  if (!env.mistralApiKey || env.mistralApiKey === PLACEHOLDER_KEY) {
    const err = new Error("Assistant IA indisponible : aucune clé API Mistral n'est configurée (MISTRAL_API_KEY)");
    err.status = 503;
    throw err;
  }

  let response;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      response = await callMistral(messages);
    } catch (err) {
      const networkError = new Error("Impossible de contacter l'API Mistral (problème réseau)");
      networkError.status = 502;
      throw networkError;
    }

    // 429 (quota / trop de requêtes) ou 5xx transitoire : on patiente puis on réessaie.
    // On respecte l'en-tête Retry-After si Mistral le fournit, sinon backoff 1s / 2s / 4s.
    const retriable = response.status === 429 || response.status >= 500;
    if (retriable && attempt < MAX_RETRIES) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000;
      await sleep(waitMs);
      continue;
    }
    break;
  }

  if (!response.ok) {
    const body = await response.text();
    let message = `Mistral API error (${response.status})`;
    if (response.status === 429) {
      message = "L'assistant est momentanément saturé (limite de requêtes atteinte). Patientez quelques secondes puis réessayez.";
    } else if (response.status === 401) {
      message = 'Clé API Mistral invalide ou expirée (MISTRAL_API_KEY).';
    }
    const err = new Error(message);
    err.status = response.status === 429 ? 429 : 502;
    err.details = body;
    throw err;
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

module.exports = { askMistral };
