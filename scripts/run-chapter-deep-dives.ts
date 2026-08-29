import { access, appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { createProviderAdapter, createSemanticGuide, type SemanticProgress, type SemanticSource } from '../lib/semantic-kernel';
import type { BookGuide, SourceSegment } from '../lib/book-processor';
import type { ModelConnection } from '../lib/model-providers';

type ChapterDefinition = {
  number: number;
  title: string;
  pageStart: number;
  pageEnd: number;
  includes?: string;
};

const chapters: ChapterDefinition[] = [
  { number: 1, title: 'The Behavior', pageStart: 8, pageEnd: 23, includes: 'Introduction (pp. 8-19)' },
  { number: 2, title: 'One Second Before', pageStart: 24, pageEnd: 77 },
  { number: 3, title: 'Seconds to Minutes Before', pageStart: 78, pageEnd: 93 },
  { number: 4, title: 'Hours to Days Before', pageStart: 94, pageEnd: 128 },
  { number: 5, title: 'Days to Months Before', pageStart: 129, pageEnd: 144 },
  { number: 6, title: "Adolescence; or, Dude, Where's My Frontal Cortex?", pageStart: 145, pageEnd: 165 },
  { number: 7, title: 'Back to the Crib, Back to the Womb', pageStart: 166, pageEnd: 215 },
  { number: 8, title: 'Back to When You Were Just a Fertilized Egg', pageStart: 216, pageEnd: 252 },
  { number: 9, title: 'Centuries to Millennia Before', pageStart: 253, pageEnd: 315 },
  { number: 10, title: 'The Evolution of Behavior', pageStart: 316, pageEnd: 372 },
  { number: 11, title: 'Us Versus Them', pageStart: 373, pageEnd: 405 },
  { number: 12, title: 'Hierarchy, Obedience, and Resistance', pageStart: 406, pageEnd: 453 },
  { number: 13, title: "Morality and Doing the Right Thing, Once You've Figured Out What That Is", pageStart: 454, pageEnd: 492 },
  { number: 14, title: "Feeling Someone's Pain, Understanding Someone's Pain, Alleviating Someone's Pain", pageStart: 493, pageEnd: 522 },
  { number: 15, title: 'Metaphors We Kill By', pageStart: 523, pageEnd: 552 },
  { number: 16, title: 'Biology, the Criminal Justice System, and (Oh, Why Not?) Free Will', pageStart: 553, pageEnd: 584 },
  { number: 17, title: 'War and Peace', pageStart: 585, pageEnd: 643, includes: 'Epilogue (pp. 640-643)' },
];

type Arguments = {
  file: string;
  outputDir: string;
  model: string;
  baseUrl: string;
};

function valueAfter(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? '' : '';
}

function parseArguments(): Arguments {
  const file = valueAfter('--file');
  if (!file) throw new Error('Pass the book with --file "path/to/book.pdf".');
  return {
    file: resolve(file),
    outputDir: resolve(valueAfter('--output-dir') || 'artifacts/behave-deep-dives'),
    model: valueAfter('--model') || 'nvidia/nemotron-3-nano-30b-a3b',
    baseUrl: (valueAfter('--base-url') || 'https://integrate.api.nvidia.com/v1').replace(/\/+$/, ''),
  };
}

const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
const safeName = (chapter: ChapterDefinition) => `${String(chapter.number).padStart(2, '0')}-${chapter.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

function stamp() {
  return new Date().toISOString();
}

function sourceSegments(pages: Map<number, string>, chapter: ChapterDefinition): SourceSegment[] {
  const result: SourceSegment[] = [];
  for (let start = chapter.pageStart; start <= chapter.pageEnd; start += 4) {
    const end = Math.min(chapter.pageEnd, start + 3);
    const text = Array.from({ length: end - start + 1 }, (_, offset) => pages.get(start + offset) ?? '').filter(Boolean).join(' ');
    if (!text) continue;
    result.push({
      title: `Pages ${start}-${end}`,
      text,
      source: start === end ? `PDF p. ${start}` : `PDF pp. ${start}-${end}`,
      pageStart: start,
      pageEnd: end,
    });
  }
  return result;
}

function paragraphize(value: string) {
  const sentences = value.match(/[^.!?]+(?:[.!?]+[”’"')\]]?|$)/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [value];
  const paragraphs: string[] = [];
  for (let index = 0; index < sentences.length; index += 5) paragraphs.push(sentences.slice(index, index + 5).join(' '));
  return paragraphs.join('\n\n');
}

function renderGuide(chapter: ChapterDefinition, guide: BookGuide, model: string) {
  const details = chapter.includes ? ` Includes ${chapter.includes}.` : '';
  return [
    `# Chapter ${chapter.number}: ${chapter.title}`,
    '',
    `> Leafmark Deep Dive - ${guide.deepDiveMinutes} min estimated reading time - source PDF pp. ${chapter.pageStart}-${chapter.pageEnd}.${details}`,
    '',
    `Generated with ${model}. Source words analyzed: ${guide.wordCount.toLocaleString()}.`,
    '',
    '## Chapter overview',
    '',
    paragraphize(guide.snapshot),
    '',
    '## Key ideas',
    '',
    ...guide.keyIdeas.flatMap((idea) => [`### ${idea.title}`, '', paragraphize(idea.text), '', `Source: ${idea.source}`, '']),
    '## Detailed deep dive',
    '',
    ...guide.deepDive.flatMap((section) => [`### ${section.title}`, '', paragraphize(section.text), '', `Source: ${section.source}`, '']),
  ].join('\n').trimEnd() + '\n';
}

async function renderIndex(outputDir: string, model: string, states: Map<number, string>) {
  const rows = chapters.map((chapter) => {
    const state = states.get(chapter.number) ?? 'Waiting';
    const finalName = `${safeName(chapter)}.md`;
    const progressName = `${safeName(chapter)}.progress.md`;
    const link = state.startsWith('Complete') ? `[Read deep dive](./${finalName})` : `[Read live notes](./${progressName})`;
    return `| ${chapter.number} | ${chapter.title} | ${chapter.pageStart}-${chapter.pageEnd} | ${state} | ${link} |`;
  });
  const markdown = [
    '# Behave - Parallel Chapter Deep Dives',
    '',
    `Seventeen chapter-level Deep Dives generated independently and concurrently with ${model}.`,
    '',
    `Last updated: ${stamp()}`,
    '',
    '| Chapter | Title | PDF pages | Status | Reading |',
    '|---:|---|---:|---|---|',
    ...rows,
    '',
    'The Introduction is included with Chapter 1. The Epilogue is included with Chapter 17. Appendices, notes, index, and duplicate auxiliary pages are excluded.',
    '',
  ].join('\n');
  await writeFile(resolve(outputDir, 'README.md'), markdown, 'utf8');
}

async function main() {
  const args = parseArguments();
  const apiKey = process.env.NVIDIA_API_KEY?.trim();
  if (!apiKey) throw new Error('Set NVIDIA_API_KEY for this terminal session. The key is never written to output files.');

  await mkdir(args.outputDir, { recursive: true });
  const logPath = resolve(args.outputDir, 'RUN-LOG.md');
  await writeFile(logPath, `# Behave Deep Dive Run Log\n\n- Started: ${stamp()}\n- Model: ${args.model}\n- Jobs: 17 chapter-level Deep Dives in parallel\n\n`, 'utf8');

  const connection: ModelConnection = {
    provider: 'nvidia',
    providerName: 'NVIDIA',
    apiKey,
    baseUrl: args.baseUrl,
    model: args.model,
  };
  let nextRequestAt = 0;
  let requestGate = Promise.resolve();
  const pacedFetch: typeof fetch = async (input, init) => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const turn = requestGate.then(async () => {
        const wait = Math.max(0, nextRequestAt - Date.now());
        if (wait) await new Promise((resolveWait) => setTimeout(resolveWait, wait));
        nextRequestAt = Date.now() + 1800;
      });
      requestGate = turn.catch(() => undefined);
      await turn;
      const response = await fetch(input, { ...init, signal: AbortSignal.timeout(120000) });
      if (response.status !== 429) return response;
      const retryAfter = Number(response.headers.get('retry-after'));
      const cooldown = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 120000) : 30000;
      nextRequestAt = Math.max(nextRequestAt, Date.now() + cooldown);
      process.stdout.write(`[rate-limit] NVIDIA asked the batch to pause for ${Math.round(cooldown / 1000)}s; retrying without failing chapters.\n`);
    }
    throw new Error('NVIDIA continued rate-limiting this request after twelve scheduled retries.');
  };
  const adapter = createProviderAdapter(connection, pacedFetch);

  const bytes = await readFile(args.file);
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages = new Map<number, string>();
  await appendFile(logPath, `- ${stamp()} - Extracting source PDF pages 8-643 once before parallel analysis.\n`, 'utf8');
  for (let pageNumber = 8; pageNumber <= 643; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = normalize(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
    if (text) pages.set(pageNumber, text);
    if (pageNumber === 8 || pageNumber % 25 === 0 || pageNumber === 643) {
      process.stdout.write(`[extract] PDF page ${pageNumber}/643\n`);
    }
  }
  await pdf.cleanup();
  await appendFile(logPath, `- ${stamp()} - Extraction complete. Starting all 17 chapter jobs.\n`, 'utf8');

  const states = new Map(chapters.map((chapter) => [chapter.number, 'Waiting']));
  let indexQueue = Promise.resolve();
  let logQueue = Promise.resolve();
  const queueIndex = () => {
    indexQueue = indexQueue.then(() => renderIndex(args.outputDir, args.model, states));
    return indexQueue;
  };
  const queueLog = (line: string) => {
    logQueue = logQueue.then(() => appendFile(logPath, line, 'utf8'));
    return logQueue;
  };
  await renderIndex(args.outputDir, args.model, states);

  async function runChapter(chapter: ChapterDefinition) {
    const baseName = safeName(chapter);
    const progressPath = resolve(args.outputDir, `${baseName}.progress.md`);
    const finalPath = resolve(args.outputDir, `${baseName}.md`);
    try {
      await access(finalPath);
      states.set(chapter.number, 'Complete - preserved from earlier run');
      await queueIndex();
      process.stdout.write(`[chapter ${String(chapter.number).padStart(2, '0')}] SKIPPED - final Markdown already exists\n`);
      return { chapter, finalPath, skipped: true };
    } catch {
      // No completed artifact yet; start or restart this chapter.
    }
    let writeQueue = Promise.resolve();
    const segments = sourceSegments(pages, chapter);
    const source: SemanticSource = {
      title: `Behave - Chapter ${chapter.number}: ${chapter.title}`,
      fileName: basename(args.file),
      segments,
    };

    states.set(chapter.number, 'Running');
    await queueIndex();
    await writeFile(progressPath, [
      `# Chapter ${chapter.number}: ${chapter.title} - Live Notes`,
      '',
      `Source PDF pp. ${chapter.pageStart}-${chapter.pageEnd}. This file grows as excerpt summaries are validated.`,
      '',
    ].join('\n'), 'utf8');
    await queueLog(`- ${stamp()} - Chapter ${chapter.number} started: ${chapter.title}.\n`);

    const onProgress = (progress: SemanticProgress) => {
      const excerpt = progress.excerpt;
      if (!excerpt || !['saved', 'restored', 'recovered'].includes(excerpt.state) || !excerpt.summary) return;
      writeQueue = writeQueue.then(() => appendFile(progressPath, [
        `## Excerpt ${excerpt.index} of ${excerpt.total} - ${excerpt.source}`,
        '',
        excerpt.summary,
        '',
      ].join('\n'), 'utf8'));
      process.stdout.write(`[chapter ${String(chapter.number).padStart(2, '0')}] excerpt ${excerpt.index}/${excerpt.total} ${excerpt.state}\n`);
    };

    try {
      const guide = await createSemanticGuide(source, connection, onProgress, adapter);
      await writeQueue;
      await writeFile(finalPath, renderGuide(chapter, guide, args.model), 'utf8');
      states.set(chapter.number, `Complete - ${guide.deepDiveMinutes} min`);
      await queueLog(`- ${stamp()} - Chapter ${chapter.number} complete: ${guide.wordCount.toLocaleString()} source words; ${guide.deepDiveMinutes} min Deep Dive; [read it](./${baseName}.md).\n`);
      await queueIndex();
      process.stdout.write(`[chapter ${String(chapter.number).padStart(2, '0')}] COMPLETE -> ${finalPath}\n`);
      return { chapter, guide, finalPath };
    } catch (error) {
      await writeQueue;
      const message = error instanceof Error ? error.message : String(error);
      states.set(chapter.number, `Failed - ${message.replace(/\|/g, '/')}`);
      await queueLog(`- ${stamp()} - Chapter ${chapter.number} failed: ${message}\n`);
      await queueIndex();
      process.stderr.write(`[chapter ${String(chapter.number).padStart(2, '0')}] FAILED - ${message}\n`);
      return { chapter, error: message };
    }
  }

  const results = await Promise.all(chapters.map(runChapter));
  await Promise.all([indexQueue, logQueue]);
  const completed = results.filter((result) => 'guide' in result || 'skipped' in result).length;
  await queueLog(`\n- Finished: ${stamp()}\n- Completed: ${completed}/17 chapters\n`);
  process.stdout.write(`DONE ${completed}/17 chapters. Index: ${resolve(args.outputDir, 'README.md')}\n`);
  if (completed !== chapters.length) process.exitCode = 1;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`FAIL - ${message}\n`);
  process.exitCode = 1;
});
