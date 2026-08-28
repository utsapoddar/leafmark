import { File as NodeFile } from 'node:buffer';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, resolve } from 'node:path';
import { processBook } from '../lib/book-processor';
import { providers, type ModelConnection, type ProviderId } from '../lib/model-providers';

type Arguments = {
  file: string;
  provider: ProviderId;
  model: string;
  baseUrl: string;
  output: string;
  maxPages?: number;
};

function valueAfter(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? '' : '';
}

function parseArguments(): Arguments {
  const file = valueAfter('--file');
  const provider = (valueAfter('--provider') || 'local') as ProviderId;
  const model = valueAfter('--model');
  const baseUrl = valueAfter('--base-url');
  const output = valueAfter('--output');
  const maxPagesValue = valueAfter('--max-pages');
  const maxPages = maxPagesValue ? Number(maxPagesValue) : undefined;
  if (!file) throw new Error('Pass a PDF or EPUB with --file "path/to/book.pdf".');
  if (!providers.some((candidate) => candidate.id === provider)) throw new Error(`Unknown provider: ${provider}`);
  if (provider !== 'local' && !model) throw new Error('Pass the exact provider model ID with --model.');
  if (maxPages !== undefined && (!Number.isInteger(maxPages) || maxPages < 1)) throw new Error('--max-pages must be a positive whole number.');
  return { file: resolve(file), provider, model, baseUrl, output, maxPages };
}

function keyFor(provider: ProviderId) {
  const environmentNames: Partial<Record<ProviderId, string[]>> = {
    kimi: ['KIMI_API_KEY', 'MOONSHOT_API_KEY'],
    gemini: ['GEMINI_API_KEY'],
    groq: ['GROQ_API_KEY'],
    cerebras: ['CEREBRAS_API_KEY'],
    nvidia: ['NVIDIA_API_KEY'],
    custom: ['MODEL_API_KEY'],
  };
  return (environmentNames[provider] ?? []).map((name) => process.env[name]?.trim()).find(Boolean) ?? '';
}

function connectionFor(args: Arguments): ModelConnection | null {
  if (args.provider === 'local') return null;
  const definition = providers.find((candidate) => candidate.id === args.provider);
  if (!definition) throw new Error(`Unknown provider: ${args.provider}`);
  const apiKey = keyFor(args.provider);
  if (!apiKey && args.provider !== 'custom') {
    const expected = args.provider === 'kimi' ? 'KIMI_API_KEY' : `${args.provider.toUpperCase()}_API_KEY`;
    throw new Error(`Set ${expected} in this terminal session. Keys are read from the environment and never written to the result.`);
  }
  const baseUrl = args.baseUrl || definition.baseUrl;
  if (!baseUrl) throw new Error('Pass the provider API root with --base-url.');
  return { provider: args.provider, providerName: definition.name, apiKey, baseUrl, model: args.model };
}

function log(message: string) {
  const time = new Date().toISOString().slice(11, 19);
  process.stdout.write(`[${time}] ${message}\n`);
}

async function main() {
  const args = parseArguments();
  const extension = extname(args.file).toLowerCase();
  if (!['.pdf', '.epub'].includes(extension)) throw new Error('Leafmark accepts PDF and EPUB files.');
  const bytes = await readFile(args.file);
  const mimeType = extension === '.pdf' ? 'application/pdf' : 'application/epub+zip';
  const file = new NodeFile([bytes], basename(args.file), { type: mimeType });
  const connection = connectionFor(args);
  const startedAt = Date.now();
  let lastExtractLog = -25;

  log(`Input: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
  log(connection ? `Provider: ${connection.providerName} | model: ${connection.model}` : 'Provider: local extractor');
  if (connection) log(`API key: ${connection.apiKey ? 'loaded from environment (value hidden)' : 'not required by this endpoint'}`);

  const guide = await processBook(file as unknown as File, {
    connection,
    maxPdfPages: args.maxPages,
    onProgress(progress) {
      if (progress.phase === 'extracting' && progress.completed !== 0 && progress.completed + 1 !== progress.total && progress.completed - lastExtractLog < 25) return;
      if (progress.phase === 'extracting') lastExtractLog = progress.completed;
      log(`${progress.phase.toUpperCase()} ${progress.completed}/${progress.total} | ${progress.message}`);
    },
  });

  const defaultOutput = resolve('artifacts', `${basename(args.file, extension)}-${args.provider}-${args.model || 'local'}.json`);
  const output = resolve(args.output || defaultOutput);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify({
    run: {
      provider: connection?.providerName ?? 'Local',
      model: connection?.model ?? 'leafmark-extractive',
      elapsedSeconds: Math.round((Date.now() - startedAt) / 100) / 10,
      completedAt: new Date().toISOString(),
    },
    guide,
  }, null, 2)}\n`, 'utf8');

  log(`PASS | ${guide.wordCount.toLocaleString()} source words | ${guide.keyIdeas.length} key ideas | ${guide.chapters.length} chapters`);
  log(`Saved: ${output}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`FAIL · ${message}\n`);
  process.exitCode = 1;
});
