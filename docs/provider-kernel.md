# Leafmark provider kernel

## Purpose

Leafmark's book-understanding workflow must not depend on one company, model, price tier, or authentication scheme. Every reader supplies their own connection: a free API key, a paid API key, a local model, or a self-hosted endpoint. Leafmark supplies the reading workflow; the selected model supplies the semantic reasoning.

The percentage and duration rules belong to Leafmark, not to the provider. Snapshot, Key Ideas, Chapter Guide, Deep Dive, and Lecture Mode must behave consistently when the reader changes models.

## Compatibility boundary

The first-class compatibility target is any text model exposed through an OpenAI-compatible chat-completions endpoint. Native adapters cover APIs whose request or response shape differs materially, starting with Gemini. Local OpenAI-compatible servers such as Ollama can use the same generic adapter without an API key.

“Almost any model” means a model that can:

- accept text instructions and book excerpts;
- return text or structured JSON;
- provide enough context for at least one Leafmark chunk; and
- be reached directly from the browser or through a user-controlled endpoint.

Models that cannot satisfy those capabilities remain unavailable for semantic processing, while the local extractive engine stays available as a fallback.

## Kernel contract

Every provider adapter implements the same small contract:

```ts
type ModelProfile = {
  id: string;
  label: string;
  contextTokens?: number;
  maxOutputTokens?: number;
  supportsJsonSchema: boolean;
  supportsStreaming: boolean;
};

type ModelConnection = {
  provider: string;
  baseUrl?: string;
  apiKey?: string;
  model: string;
};

interface ModelAdapter {
  test(connection: ModelConnection): Promise<void>;
  listModels(connection: Omit<ModelConnection, 'model'>): Promise<ModelProfile[]>;
  complete(request: KernelRequest, signal: AbortSignal): Promise<KernelResponse>;
  normalizeError(error: unknown): KernelError;
}
```

The kernel owns token budgeting, chunking, retries, concurrency, structured-output validation, checkpointing, and provider switching. Adapters only translate the common request into a provider-specific API call.

## Reader setup

1. The reader selects a provider or **Custom endpoint**.
2. Leafmark links to the provider's official key-creation page.
3. The reader pastes their own key and optionally changes the API base URL.
4. Leafmark tests the connection and retrieves models when the provider supports discovery.
5. The reader selects a model and sees its known capabilities.
6. Before processing begins, Leafmark states clearly that book excerpts will leave the device and names the destination provider.

Keys are held in memory by default. Leafmark never places a key in source code, a URL, analytics, logs, exports, or GitHub. NVIDIA keys pass transiently through Leafmark's disclosed stateless relay because NVIDIA blocks credentialed browser requests; every other built-in provider remains direct where its CORS policy permits. Persistent storage can only be an explicit reader choice and must explain that a browser cannot protect a long-lived key as strongly as a private server can.

## Semantic processing pipeline

1. Extract and clean the book locally.
2. Remove licenses, tables of contents, repeated headers, page furniture, and obvious publisher matter.
3. Detect real chapter boundaries and give every source sentence a stable ID.
4. Size chunks from the chosen model's context budget.
5. Ask the model for a structured content ledger: claims, lessons, events, evidence, examples, qualifications, conclusions, repetition, and removable connective prose.
6. Validate the response and retry or repair malformed output.
7. Assemble source-grounded views locally using sentence IDs and short model-written bridges.
8. Run an omission audit against the ledger before marking a guide complete.
9. Save a local checkpoint after every successful chunk so work can resume after a quota limit, network failure, or provider switch.

For Chapter Guide and Deep Dive, the model should classify and compress material instead of regenerating 55% or 80% of the book from scratch. This reduces token usage, preserves the author's meaning, and keeps source references intact.

## Rate limits and portability

The scheduler reads rate-limit headers when available, uses bounded concurrency, applies exponential backoff, and shows the reader what is waiting. A `429` pauses rather than destroys progress. Provider-specific failures are normalized into actionable messages such as invalid key, unsupported model, context too large, quota exhausted, or browser connection blocked.

Changing providers never invalidates completed ledger entries. A new model continues from the next unfinished chunk, with an optional consistency pass at the end.

## Testing credentials

Repository tests use deterministic fake adapters by default. Optional live contract tests read developer-owned keys from ignored local environment variables or protected GitHub Actions secrets. Keys are never committed, printed, embedded in static output, attached to test artifacts, or made available to pull requests from forks.

Each live adapter test uses a short public-domain fixture and a strict token ceiling. A successful test must verify model discovery or configuration, one structured ledger response, schema validation, normalized usage metadata, and safe handling of an invalid key and a simulated rate limit.

One developer's key is used only for that developer's test. Every Leafmark reader connects with a separate key belonging to them.

## Initial adapters

1. Gemini native API.
2. Direct OpenAI-compatible adapters for Groq, Cerebras, Kimi, and similar services whose endpoints permit browser access.
3. Provider-specific overrides only where model discovery, authentication, or structured output differs.
4. WebLLM as a keyless on-device adapter.
5. Existing extractive processor as the universal offline fallback.

NVIDIA's hosted API currently does not grant the credentialed browser CORS access required by a GitHub Pages app. When `NEXT_PUBLIC_LEAFMARK_NVIDIA_RELAY_URL` is configured, Leafmark exposes NVIDIA as a first-class provider through the repository's narrowly scoped stateless relay. That relay has no application key, storage, cache, analytics code, or general-purpose proxy route; it accepts only Leafmark origins and NVIDIA model-discovery/chat-completions requests. If no relay URL is configured, NVIDIA remains available through a user-controlled relay or local NIM endpoint under Custom.

## Implemented browser kernel

The current GitHub Pages release implements the first production slice of this design:

- native Gemini `generateContent` and generic OpenAI-compatible chat-completions adapters, including Kimi's direct browser route;
- conservative, source-labeled chunking that works without a provider-specific context database;
- a validated ledger of sentence importance and source-grounded insights;
- JSON repair, bounded transient-error retries, and actionable provider errors;
- an in-memory per-chunk checkpoint that survives retries and provider changes within the tab;
- a separate ledger synthesis pass for Snapshot and Key Ideas; and
- local assembly of Chapter Guide and Deep Dive at approximately 55% and 80% source coverage.

The checkpoint deliberately does not persist book material to browser storage. A future encrypted or explicitly enabled persistent checkpoint requires a corresponding privacy-policy and deletion-control update.
