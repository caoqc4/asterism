import type { RuntimeAiConfig } from '../keychain/ai-config-service.js';

type ReplicatePredictionResponse = {
  id?: string;
  status?: string;
  output?: unknown;
  error?: unknown;
  urls?: {
    get?: string;
  };
};

const DEFAULT_REPLICATE_BASE_URL = 'https://api.replicate.com/v1';
const POLL_INTERVAL_MS = 1000;
const MAX_POLL_ATTEMPTS = 120;

function getReplicateBaseUrl(config: RuntimeAiConfig): string {
  return (config.baseUrl?.trim() || DEFAULT_REPLICATE_BASE_URL).replace(/\/$/, '');
}

function getPredictionPath(model: string): string {
  const [owner, name] = model.split('/');

  if (!owner || !name) {
    throw new Error('Replicate model must use the owner/model format.');
  }

  return `/models/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/predictions`;
}

function formatOutput(output: unknown): string {
  if (typeof output === 'string') {
    return output;
  }

  if (Array.isArray(output)) {
    return output.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join('');
  }

  if (output && typeof output === 'object') {
    const maybeText =
      'text' in output && typeof output.text === 'string'
        ? output.text
        : 'output' in output && typeof output.output === 'string'
          ? output.output
          : null;

    if (maybeText) {
      return maybeText;
    }

    return JSON.stringify(output);
  }

  return '';
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestPrediction(url: string, apiKey: string): Promise<ReplicatePredictionResponse> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Replicate prediction request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as ReplicatePredictionResponse;
}

export async function generateReplicateText(config: RuntimeAiConfig, prompt: string): Promise<string> {
  const response = await fetch(`${getReplicateBaseUrl(config)}${getPredictionPath(config.model)}`, {
    body: JSON.stringify({
      input: {
        prompt,
        system_prompt: 'You are Taskplane, a concise assistant for local-first knowledge work.',
      },
    }),
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      Prefer: 'wait',
    },
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`Replicate prediction create failed: ${response.status} ${response.statusText}`);
  }

  let prediction = (await response.json()) as ReplicatePredictionResponse;

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    if (prediction.status === 'succeeded') {
      return formatOutput(prediction.output).trim();
    }

    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      throw new Error(`Replicate prediction ${prediction.status}: ${String(prediction.error ?? 'unknown error')}`);
    }

    if (!prediction.urls?.get) {
      throw new Error('Replicate prediction did not include a polling URL.');
    }

    await wait(POLL_INTERVAL_MS);
    prediction = await requestPrediction(prediction.urls.get, config.apiKey);
  }

  throw new Error('Replicate prediction timed out.');
}
