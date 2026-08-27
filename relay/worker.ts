export type RelayEnv = {
  ALLOWED_ORIGINS?: string;
  NVIDIA_API_ORIGIN?: string;
};

const defaultOrigins = 'https://utsapoddar.github.io,http://localhost:3000,http://127.0.0.1:3000';
const defaultNvidiaOrigin = 'https://integrate.api.nvidia.com';
const maximumKnownBodyBytes = 2_000_000;

function allowedOrigins(env: RelayEnv) {
  return new Set((env.ALLOWED_ORIGINS || defaultOrigins).split(',').map((value) => value.trim()).filter(Boolean));
}

function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
  };
}

function json(status: number, payload: object, origin = '') {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  if (origin) Object.entries(corsHeaders(origin)).forEach(([name, value]) => headers.set(name, value));
  return new Response(JSON.stringify(payload), { status, headers });
}

export async function handleRequest(request: Request, env: RelayEnv = {}, fetcher: typeof fetch = fetch) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin') || '';
  const allowed = origin && allowedOrigins(env).has(origin);

  if (url.pathname === '/' || url.pathname === '/health') {
    if (request.method !== 'GET') return json(405, { error: 'Method not allowed.' }, allowed ? origin : '');
    return json(200, { ok: true, service: 'Leafmark NVIDIA relay', storesData: false }, allowed ? origin : '');
  }

  if (!allowed) return json(403, { error: 'This origin is not allowed.' });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });

  const isModels = url.pathname === '/v1/models' && request.method === 'GET';
  const isCompletion = url.pathname === '/v1/chat/completions' && request.method === 'POST';
  if (!isModels && !isCompletion) return json(404, { error: 'Route not found.' }, origin);

  const authorization = request.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ') || authorization.length > 8192) {
    return json(401, { error: 'A bearer API key is required.' }, origin);
  }

  const contentLength = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(contentLength) && contentLength > maximumKnownBodyBytes) {
    return json(413, { error: 'Request body is too large.' }, origin);
  }
  const requestBody = isCompletion ? await request.arrayBuffer() : undefined;
  if (requestBody && requestBody.byteLength > maximumKnownBodyBytes) {
    return json(413, { error: 'Request body is too large.' }, origin);
  }

  const upstreamOrigin = (env.NVIDIA_API_ORIGIN || defaultNvidiaOrigin).replace(/\/+$/, '');
  const upstreamUrl = `${upstreamOrigin}${url.pathname}`;
  const upstreamHeaders = new Headers({ Authorization: authorization, Accept: 'application/json' });
  if (isCompletion) upstreamHeaders.set('Content-Type', 'application/json');

  try {
    const upstream = await fetcher(new Request(upstreamUrl, {
      method: request.method,
      headers: upstreamHeaders,
      body: requestBody,
      redirect: 'manual',
    }));
    if (upstream.status >= 300 && upstream.status < 400) {
      return json(502, { error: 'NVIDIA returned an unexpected redirect.' }, origin);
    }
    const responseHeaders = new Headers(corsHeaders(origin));
    responseHeaders.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json');
    ['Retry-After', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'].forEach((name) => {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    });
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
  } catch {
    return json(502, { error: 'NVIDIA could not be reached.' }, origin);
  }
}

const worker = {
  fetch(request: Request, env: RelayEnv) {
    return handleRequest(request, env);
  },
};

export default worker;
