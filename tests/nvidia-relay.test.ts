import assert from 'node:assert/strict';
import test from 'node:test';
import { handleRequest } from '../relay/worker';

const allowedOrigin = 'https://utsapoddar.github.io';

test('NVIDIA relay answers allowed CORS preflights without touching the upstream', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls += 1; return new Response(); };
  const response = await handleRequest(new Request('https://relay.example/v1/chat/completions', {
    method: 'OPTIONS',
    headers: { Origin: allowedOrigin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' },
  }), {}, fetcher);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), allowedOrigin);
  assert.equal(calls, 0);
});

test('NVIDIA relay rejects unknown origins and missing bearer keys', async () => {
  const blocked = await handleRequest(new Request('https://relay.example/v1/models', { headers: { Origin: 'https://attacker.example', Authorization: 'Bearer key' } }));
  assert.equal(blocked.status, 403);
  assert.equal(blocked.headers.get('Access-Control-Allow-Origin'), null);

  const unauthenticated = await handleRequest(new Request('https://relay.example/v1/models', { headers: { Origin: allowedOrigin } }));
  assert.equal(unauthenticated.status, 401);
});

test('NVIDIA relay forwards only the fixed completion route and streams the response', async () => {
  let forwardedUrl = '';
  let forwardedAuthorization = '';
  let forwardedBody = '';
  const fetcher: typeof fetch = async (input) => {
    const request = input instanceof Request ? input : new Request(input);
    forwardedUrl = request.url;
    forwardedAuthorization = request.headers.get('Authorization') || '';
    forwardedBody = await request.text();
    return new Response('{"choices":[{"message":{"content":"OK"}}]}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const body = '{"model":"nvidia/test","messages":[]}';
  const response = await handleRequest(new Request('https://relay.example/v1/chat/completions', {
    method: 'POST',
    headers: { Origin: allowedOrigin, Authorization: 'Bearer reader-key', 'Content-Type': 'application/json' },
    body,
  }), {}, fetcher);
  assert.equal(forwardedUrl, 'https://integrate.api.nvidia.com/v1/chat/completions');
  assert.equal(forwardedAuthorization, 'Bearer reader-key');
  assert.equal(forwardedBody, body);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), allowedOrigin);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(await response.text(), '{"choices":[{"message":{"content":"OK"}}]}');
});

test('NVIDIA relay does not become a general-purpose proxy', async () => {
  const response = await handleRequest(new Request('https://relay.example/v1/embeddings', {
    method: 'POST',
    headers: { Origin: allowedOrigin, Authorization: 'Bearer reader-key' },
  }));
  assert.equal(response.status, 404);
});
