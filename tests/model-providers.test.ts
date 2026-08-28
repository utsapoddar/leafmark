import assert from 'node:assert/strict';
import test from 'node:test';
import { discoverModels, type ModelConnection } from '../lib/model-providers';

const kimiConnection: Omit<ModelConnection, 'model'> = {
  provider: 'kimi',
  providerName: 'Kimi',
  apiKey: 'sk-test',
  baseUrl: 'https://api.moonshot.cn/v1',
};

test('Kimi model discovery uses the official endpoint and bearer key', async () => {
  let capturedUrl = '';
  let capturedHeaders: HeadersInit | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedHeaders = init?.headers;
    return new Response(JSON.stringify({ data: [{ id: 'kimi-k2.6' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const models = await discoverModels(kimiConnection, fetcher);
  assert.equal(capturedUrl, 'https://api.moonshot.cn/v1/models');
  assert.equal((capturedHeaders as Record<string, string>).Authorization, 'Bearer sk-test');
  assert.deepEqual(models, [{ id: 'kimi-k2.6', label: 'kimi-k2.6' }]);
});

test('Kimi authentication errors identify the required key type', async () => {
  const fetcher: typeof fetch = async () => new Response('{}', { status: 401 });
  await assert.rejects(discoverModels(kimiConnection, fetcher), /platform\.kimi\.com.*Kimi Code or membership key/);
});

test('Kimi permission errors explain its separate API balance', async () => {
  const fetcher: typeof fetch = async () => new Response('{}', { status: 403 });
  await assert.rejects(discoverModels(kimiConnection, fetcher), /developer API balance is separate/);
});
