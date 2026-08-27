import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chunkSourceSentences,
  clearSemanticCheckpoints,
  createProviderAdapter,
  createSemanticGuide,
  createSourceSentences,
  type CompletionRequest,
  type SemanticAdapter,
} from '../lib/semantic-kernel';
import type { ModelConnection } from '../lib/model-providers';

const connection: ModelConnection = {
  provider: 'custom',
  providerName: 'Test model',
  apiKey: 'test-key',
  baseUrl: 'https://models.example/v1',
  model: 'reader-test',
};

function words(value: string) {
  return value.split(/\s+/).filter(Boolean).length;
}

function makeBookText(sentenceCount = 100) {
  return Array.from({ length: sentenceCount }, (_, index) => (
    `Sentence ${index + 1} explains principle ${index % 9 + 1} with enough concrete context, evidence, qualification, and practical detail to support careful book analysis.`
  )).join(' ');
}

const fakeAdapter: SemanticAdapter = {
  async complete(request: CompletionRequest) {
    if (request.prompt.includes('LEAFMARK_TASK: LEDGER_CHUNK')) {
      const ids = [...request.prompt.matchAll(/\[(S\d{6}) \|/g)].map((match) => match[1]);
      return JSON.stringify({
        summary: 'This excerpt develops connected principles through concrete evidence, qualifications, and practical detail.',
        scores: Object.fromEntries(ids.map((id, index) => [id, index % 5])),
        insights: [{
          title: 'Evidence changes the practical lesson',
          explanation: 'The excerpt connects its principle to evidence and preserves the qualification that limits the conclusion.',
          sourceIds: ids.slice(0, 2),
          importance: 4,
        }],
      });
    }
    if (request.prompt.includes('LEAFMARK_TASK: SYNTHESIS')) {
      const ids = [...request.prompt.matchAll(/S\d{6}/g)].map((match) => match[0]);
      return JSON.stringify({
        snapshot: 'The book develops a set of connected principles, tests them against evidence, and turns the qualified conclusions into practical lessons.',
        keyIdeas: [{
          title: 'Evidence shapes the lesson',
          explanation: 'The central principles matter because the examples reveal both their practical value and their limits.',
          sourceIds: ids.slice(0, 2),
        }],
      });
    }
    throw new Error('Unexpected fake-adapter task.');
  },
};

test('stable sentence IDs and chunks preserve source order', () => {
  const sentences = createSourceSentences([
    { title: 'One', source: 'p. 1', text: makeBookText(8) },
    { title: 'Two', source: 'p. 2', text: makeBookText(8) },
  ]);
  assert.equal(sentences[0].id, 'S000001');
  assert.equal(sentences.at(-1)?.id, 'S000016');
  assert.equal(sentences[8].segmentIndex, 1);
  const chunks = chunkSourceSentences(sentences, 700, 5);
  assert.ok(chunks.length > 1);
  assert.deepEqual(chunks.flat().map((sentence) => sentence.id), sentences.map((sentence) => sentence.id));
});

test('default chunks stay within a compact provider-friendly sentence budget', () => {
  const sentences = createSourceSentences([{ title: 'One', source: 'p. 1', text: makeBookText(190) }]);
  const chunks = chunkSourceSentences(sentences);
  assert.ok(chunks.length > 2);
  assert.ok(chunks.every((chunk) => chunk.length <= 80));
});

test('semantic guide validates a ledger and assembles all four depths', async () => {
  clearSemanticCheckpoints();
  const segments = [
    { title: 'Part one', source: 'pp. 1–8', text: makeBookText(55) },
    { title: 'Part two', source: 'pp. 9–16', text: makeBookText(55) },
  ];
  const progress: string[] = [];
  const guide = await createSemanticGuide(
    { title: 'Fixture book', fileName: 'fixture.pdf', segments },
    connection,
    (event) => progress.push(event.phase),
    fakeAdapter,
  );
  const originalWords = words(segments.map((segment) => segment.text).join(' '));
  const chapterWords = words(guide.chapters.map((item) => item.text).join(' '));
  const deepWords = words(guide.deepDive.map((item) => item.text).join(' '));
  assert.equal(guide.title, 'Fixture book');
  assert.ok(guide.snapshot.length > 60);
  assert.equal(guide.keyIdeas[0].source, 'pp. 1–8');
  assert.ok(chapterWords / originalWords >= 0.53 && chapterWords / originalWords <= 0.60);
  assert.ok(deepWords / originalWords >= 0.78 && deepWords / originalWords <= 0.84);
  assert.ok(deepWords > chapterWords);
  assert.ok(progress.includes('analyzing') && progress.includes('synthesizing') && progress.includes('assembling'));
});

test('weak models can fall back from grounded chunk summaries without empty guides', async () => {
  clearSemanticCheckpoints();
  const summaryOnlyAdapter: SemanticAdapter = {
    async complete(request) {
      if (request.prompt.includes('LEAFMARK_TASK: LEDGER_CHUNK')) {
        return JSON.stringify({
          summary: 'The excerpt develops its events in sequence and preserves the concrete evidence that explains the result.',
          essentialIds: [],
          importantIds: [],
          insights: [],
        });
      }
      return JSON.stringify({ snapshot: 'A grounded snapshot assembled only from the supplied ledger.' });
    },
  };
  const guide = await createSemanticGuide(
    { title: 'Weak model fixture', fileName: 'weak.epub', segments: [{ title: 'Part', source: 'Section 1', text: makeBookText(100) }] },
    connection,
    undefined,
    summaryOnlyAdapter,
  );
  assert.ok(guide.snapshot.includes('excerpt develops'));
  assert.ok(guide.keyIdeas.length > 0);
  assert.equal(guide.keyIdeas[0].source, 'Section 1');
  assert.ok(guide.deepDiveMinutes > guide.chapterGuideMinutes);
});

test('successful ledger chunks resume from an in-memory checkpoint', async () => {
  clearSemanticCheckpoints();
  let ledgerCalls = 0;
  const countingAdapter: SemanticAdapter = {
    async complete(request) {
      if (request.prompt.includes('LEAFMARK_TASK: LEDGER_CHUNK')) ledgerCalls += 1;
      return fakeAdapter.complete(request);
    },
  };
  const source = { title: 'Resume fixture', fileName: 'resume.pdf', segments: [{ title: 'Part', source: 'pp. 1–8', text: makeBookText(70) }] };
  await createSemanticGuide(source, connection, undefined, countingAdapter);
  const firstPassCalls = ledgerCalls;
  const messages: string[] = [];
  await createSemanticGuide(source, connection, (event) => messages.push(event.message), countingAdapter);
  assert.ok(firstPassCalls > 0);
  assert.equal(ledgerCalls, firstPassCalls);
  assert.ok(messages.some((message) => message.includes('Resuming from the in-memory ledger')));
});

test('OpenAI-compatible adapter sends the common chat-completions request', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const adapter = createProviderAdapter(connection, fetcher);
  const result = await adapter.complete({ system: 'System', prompt: 'Prompt', maxOutputTokens: 500 });
  const body = JSON.parse(String(capturedInit?.body));
  assert.equal(capturedUrl, 'https://models.example/v1/chat/completions');
  assert.equal((capturedInit?.headers as Record<string, string>).Authorization, 'Bearer test-key');
  assert.equal(body.model, 'reader-test');
  assert.equal(body.messages[1].content, 'Prompt');
  assert.equal(body.chat_template_kwargs, undefined);
  assert.equal(result, '{"ok":true}');
});

test('Nemotron requests disable visible reasoning so structured output reaches the parser', async () => {
  let capturedInit: RequestInit | undefined;
  const fetcher: typeof fetch = async (_input, init) => {
    capturedInit = init;
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const adapter = createProviderAdapter({ ...connection, model: 'nvidia/nemotron-3-nano-30b-a3b' }, fetcher);
  await adapter.complete({ system: 'System', prompt: 'Prompt', maxOutputTokens: 500 });
  const body = JSON.parse(String(capturedInit?.body));
  assert.deepEqual(body.chat_template_kwargs, { enable_thinking: false });
});

test('Gemini adapter uses native generateContent and x-goog-api-key', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const adapter = createProviderAdapter({ ...connection, provider: 'gemini', providerName: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-test' }, fetcher);
  await adapter.complete({ system: 'System', prompt: 'Prompt', maxOutputTokens: 500 });
  const body = JSON.parse(String(capturedInit?.body));
  assert.equal(capturedUrl, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent');
  assert.equal((capturedInit?.headers as Record<string, string>)['x-goog-api-key'], 'test-key');
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.equal(body.contents[0].parts[0].text, 'Prompt');
});

test('NVIDIA uses the configured relay through the common chat-completions adapter', async () => {
  let capturedUrl = '';
  const fetcher: typeof fetch = async (input) => {
    capturedUrl = String(input);
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const adapter = createProviderAdapter({ ...connection, provider: 'nvidia', providerName: 'NVIDIA', baseUrl: 'https://relay.example/v1', model: 'nvidia/nemotron-test' }, fetcher);
  await adapter.complete({ system: 'System', prompt: 'Prompt', maxOutputTokens: 500 });
  assert.equal(capturedUrl, 'https://relay.example/v1/chat/completions');
});
