export type ProviderId = 'local' | 'gemini' | 'groq' | 'cerebras' | 'nvidia' | 'custom';

export type ProviderDefinition = {
  id: ProviderId;
  name: string;
  mark: string;
  description: string;
  baseUrl: string;
  keyUrl?: string;
  keyPlaceholder?: string;
};

export type ModelOption = {
  id: string;
  label: string;
};

export type ModelConnection = {
  provider: ProviderId;
  providerName: string;
  apiKey: string;
  baseUrl: string;
  model: string;
};

export const providers: ProviderDefinition[] = [
  { id: 'local', name: 'Local', mark: 'L', description: 'No key. Keep every page on this device.', baseUrl: '' },
  { id: 'gemini', name: 'Gemini', mark: 'G', description: 'Google AI Studio models and free or paid keys.', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', keyUrl: 'https://aistudio.google.com/app/apikey', keyPlaceholder: 'AIza…' },
  { id: 'groq', name: 'Groq', mark: 'Q', description: 'Fast hosted models through GroqCloud.', baseUrl: 'https://api.groq.com/openai/v1', keyUrl: 'https://console.groq.com/keys', keyPlaceholder: 'gsk_…' },
  { id: 'cerebras', name: 'Cerebras', mark: 'C', description: 'Fast inference with free and paid access.', baseUrl: 'https://api.cerebras.ai/v1', keyUrl: 'https://cloud.cerebras.ai/', keyPlaceholder: 'csk-…' },
  { id: 'nvidia', name: 'NVIDIA', mark: 'N', description: 'Hosted NIM requires a user-controlled relay when Leafmark runs on GitHub Pages.', baseUrl: 'https://integrate.api.nvidia.com/v1', keyUrl: 'https://docs.api.nvidia.com/nim/docs/api-quickstart', keyPlaceholder: 'nvapi-…' },
  { id: 'custom', name: 'Custom', mark: '+', description: 'Any browser-accessible OpenAI-compatible endpoint.', baseUrl: '', keyPlaceholder: 'Optional bearer key' },
];

const trimSlash = (value: string) => value.trim().replace(/\/+$/, '');

function validateCustomUrl(value: string) {
  const parsed = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) {
    throw new Error('Use an HTTPS endpoint, or HTTP only for a model running on this device.');
  }
}

export async function discoverModels(connection: Omit<ModelConnection, 'model'>): Promise<ModelOption[]> {
  if (connection.provider === 'local') return [{ id: 'leafmark-extractive', label: 'Leafmark local extractor' }];
  if (connection.provider === 'nvidia') throw new Error('NVIDIA blocks direct requests from GitHub Pages. Use Custom with a relay or local NIM endpoint you control.');
  if (!connection.apiKey.trim() && connection.provider !== 'custom') throw new Error('Enter an API key first.');

  const baseUrl = trimSlash(connection.baseUrl);
  if (!baseUrl) throw new Error('Enter the API base URL.');
  if (connection.provider === 'custom') validateCustomUrl(baseUrl);

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (connection.provider === 'gemini') headers['x-goog-api-key'] = connection.apiKey.trim();
  else if (connection.apiKey.trim()) headers.Authorization = `Bearer ${connection.apiKey.trim()}`;

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/models`, { headers, signal: AbortSignal.timeout(15000) });
  } catch {
    throw new Error('The provider could not be reached from this browser. It may block direct browser connections.');
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('The provider rejected this key. Check it or create a new one.');
    if (response.status === 429) throw new Error('This key has reached its current rate limit.');
    throw new Error(`The provider returned ${response.status}. Check the endpoint and try again.`);
  }

  const payload = await response.json() as {
    data?: Array<{ id?: string }>;
    models?: Array<{ name?: string; displayName?: string; supportedGenerationMethods?: string[] }>;
  };

  const models = connection.provider === 'gemini'
    ? (payload.models ?? [])
        .filter((model) => !model.supportedGenerationMethods || model.supportedGenerationMethods.includes('generateContent'))
        .map((model) => ({ id: (model.name ?? '').replace(/^models\//, ''), label: model.displayName || (model.name ?? '').replace(/^models\//, '') }))
    : (payload.data ?? []).map((model) => ({ id: model.id ?? '', label: model.id ?? '' }));

  const nonChatModel = /(?:^|[-_/.])(whisper|embed(?:ding)?s?|tts|speech|transcri(?:be|ption)|rerank)(?:$|[-_/.])/i;
  const usable = models.filter((model) => model.id && !nonChatModel.test(model.id));
  if (!usable.length) throw new Error('The connection worked, but it returned no text-generation models.');
  return usable.sort((a, b) => a.label.localeCompare(b.label));
}

export async function verifyCustomModel(connection: ModelConnection): Promise<ModelOption[]> {
  const baseUrl = trimSlash(connection.baseUrl);
  if (!baseUrl) throw new Error('Enter the API base URL.');
  if (!connection.model.trim()) throw new Error('Enter the model ID used by this endpoint.');
  validateCustomUrl(baseUrl);

  const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (connection.apiKey.trim()) headers.Authorization = `Bearer ${connection.apiKey.trim()}`;

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: connection.model.trim(), messages: [{ role: 'user', content: 'Reply with OK.' }], max_tokens: 3, temperature: 0 }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new Error('The endpoint could not be reached from this browser. Check CORS and the base URL.');
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('The endpoint rejected this key.');
    if (response.status === 404) throw new Error('No OpenAI-compatible chat-completions route was found at this URL.');
    if (response.status === 429) throw new Error('This endpoint has reached its current rate limit.');
    throw new Error(`The endpoint returned ${response.status}. Check the model ID and configuration.`);
  }

  return [{ id: connection.model.trim(), label: connection.model.trim() }];
}
