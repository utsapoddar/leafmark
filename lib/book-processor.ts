import JSZip from 'jszip';
import type { ModelConnection } from './model-providers';
import type { SemanticProgress } from './semantic-kernel';

export type SourceSegment = {
  title: string;
  text: string;
  source: string;
  pageStart?: number;
  pageEnd?: number;
};

export type SummaryItem = {
  title: string;
  text: string;
  source: string;
};

export type BookGuide = {
  title: string;
  fileName: string;
  wordCount: number;
  readingMinutes: number;
  chapterGuideMinutes: number;
  deepDiveMinutes: number;
  snapshot: string;
  keyIdeas: SummaryItem[];
  chapters: SummaryItem[];
  deepDive: SummaryItem[];
};

const STOP_WORDS = new Set(`a an and are as at be been but by can could did do does for from had has have he her hers him his how i if in into is it its may me might more most my no not of on one or our ours she should so some than that the their theirs them then there these they this those through to too under up us very was we were what when where which while who why will with would you your yours`.split(' '));

const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();

const sentencesOf = (text: string) => {
  const normalized = normalize(text);
  const matches = normalized.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [];
  return matches.map(normalize).filter((sentence) => sentence.length >= 45 && sentence.length <= 520);
};

const wordsOf = (text: string) => (text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? []).filter((word) => !STOP_WORDS.has(word));
const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;

function rankedSentenceCandidates(text: string) {
  const sentences = sentencesOf(text);
  if (!sentences.length) return [];
  const frequencies = new Map<string, number>();
  wordsOf(text).forEach((word) => frequencies.set(word, (frequencies.get(word) ?? 0) + 1));
  const maxFrequency = Math.max(...frequencies.values(), 1);

  return sentences
    .map((sentence, index) => {
      const words = wordsOf(sentence);
      const lexical = words.reduce((sum, word) => sum + (frequencies.get(word) ?? 0) / maxFrequency, 0) / Math.max(words.length, 1);
      const position = index < Math.max(2, sentences.length * .15) ? .16 : 0;
      const usableLength = sentence.length >= 80 && sentence.length <= 280 ? .08 : 0;
      return { sentence, index, score: lexical + position + usableLength };
    })
    .sort((a, b) => b.score - a.score);
}

function rankedSentences(text: string, limit: number) {
  return rankedSentenceCandidates(text)
    .slice(0, limit)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.sentence);
}

function rankedSentencesToWords(text: string, targetWords: number) {
  const selected: ReturnType<typeof rankedSentenceCandidates> = [];
  let selectedWords = 0;

  for (const candidate of rankedSentenceCandidates(text)) {
    if (selectedWords >= targetWords && selected.length) break;
    selected.push(candidate);
    selectedWords += countWords(candidate.sentence);
  }

  return selected
    .sort((a, b) => a.index - b.index)
    .map((item) => item.sentence);
}

const depthWordTarget = (bookWords: number, share: number) => Math.min(bookWords, Math.round(bookWords * share));

const makeTitle = (sentence: string, fallback: string) => {
  const clean = sentence.replace(/^[-–—\d.)\s]+/, '').split(/[;:.!?]/)[0].trim();
  const words = clean.split(/\s+/).slice(0, 9);
  if (words.length < 3) return fallback;
  const title = words.join(' ');
  return `${title.charAt(0).toUpperCase()}${title.slice(1)}${clean.split(/\s+/).length > 9 ? '…' : ''}`;
};

const zipPath = (baseFile: string, relative: string) => {
  const base = baseFile.split('/').slice(0, -1);
  const parts = [...base, ...decodeURIComponent(relative).split('/')];
  const resolved: string[] = [];
  parts.forEach((part) => {
    if (!part || part === '.') return;
    if (part === '..') resolved.pop();
    else resolved.push(part);
  });
  return resolved.join('/');
};

async function extractPdf(file: File, onProgress?: (progress: SemanticProgress) => void, maxPages?: number): Promise<{ title?: string; segments: SourceSegment[] }> {
  const runningInBrowser = typeof window !== 'undefined';
  const pdfjs = runningInBrowser ? await import('pdfjs-dist') : await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (runningInBrowser) pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const metadata = await pdf.getMetadata().catch(() => null);
  type OutlineItem = { title?: string; dest?: string | unknown[] | null; items?: OutlineItem[] };
  type OutlineEntry = { title: string; page: number; depth: number };
  const outline = maxPages ? null : await pdf.getOutline().catch(() => null) as OutlineItem[] | null;
  const outlineItems: Array<{ item: OutlineItem; depth: number }> = [];
  const flattenOutline = (items: OutlineItem[], depth = 0) => items.forEach((item) => {
    outlineItems.push({ item, depth });
    if (item.items?.length) flattenOutline(item.items, depth + 1);
  });
  if (outline) flattenOutline(outline);
  const outlineEntries: OutlineEntry[] = [];
  for (const { item, depth } of outlineItems) {
    try {
      const destination = typeof item.dest === 'string' ? await pdf.getDestination(item.dest) : item.dest;
      const reference = Array.isArray(destination) ? destination[0] : undefined;
      if (!reference || typeof reference !== 'object') continue;
      const page = await pdf.getPageIndex(reference as Parameters<typeof pdf.getPageIndex>[0]) + 1;
      const title = normalize(item.title ?? '');
      if (title) outlineEntries.push({ title, page, depth });
    } catch {
      // Ignore malformed outline destinations and retain the page-group fallback.
    }
  }
  const numberWord = 'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|twenty-one|twenty-two|twenty-three|twenty-four|twenty-five|twenty-six|twenty-seven|twenty-eight|twenty-nine|thirty';
  const chapterTitle = new RegExp(`^(?:(?:chapter|book)\\s+)?(?:\\d{1,3}|[ivxlcdm]+|${numberWord})(?:\\s*[:.)-]|\\s+)`, 'i');
  const excludedOutline = /^(?:appendix|notes?|index|contents?|acknowledg|glossary|bibliography|references?)\b/i;
  const chapterMarkers = outlineEntries
    .filter((entry) => chapterTitle.test(entry.title) && !excludedOutline.test(entry.title))
    .filter((entry, index, entries) => index === 0 || entry.page !== entries[index - 1].page)
    .sort((a, b) => a.page - b.page);
  const useChapterOutline = chapterMarkers.length >= 2;
  let extractionStart = 1;
  let extractionEnd = maxPages ? Math.min(pdf.numPages, Math.max(1, Math.floor(maxPages))) : pdf.numPages;
  if (useChapterOutline) {
    const firstChapter = chapterMarkers[0];
    const introduction = outlineEntries.filter((entry) => entry.page < firstChapter.page && /^(?:introduction|prologue|preface)\b/i.test(entry.title)).at(-1);
    extractionStart = introduction?.page ?? firstChapter.page;
    const lastChapter = chapterMarkers.at(-1)!;
    const epilogue = outlineEntries.find((entry) => entry.page > lastChapter.page && /^(?:epilogue|conclusion|afterword)\b/i.test(entry.title));
    const tail = epilogue ?? lastChapter;
    const nextBoundary = outlineEntries.find((entry) => entry.page > tail.page && entry.depth <= tail.depth);
    extractionEnd = Math.min(pdf.numPages, nextBoundary ? nextBoundary.page - 1 : tail === lastChapter ? pdf.numPages : tail.page + 20);
  }
  const pages: SourceSegment[] = [];
  const pageCount = extractionEnd - extractionStart + 1;

  for (let pageNumber = extractionStart; pageNumber <= extractionEnd; pageNumber += 1) {
    onProgress?.({ phase: 'extracting', completed: pageNumber - extractionStart, total: pageCount, message: `Reading PDF page ${pageNumber} locally` });
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = normalize(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
    if (text) pages.push({ title: `Pages ${pageNumber}`, text, source: `p. ${pageNumber}`, pageStart: pageNumber, pageEnd: pageNumber });
  }

  const segments: SourceSegment[] = [];
  if (useChapterOutline) {
    chapterMarkers.forEach((marker, index) => {
      const start = index === 0 ? extractionStart : marker.page;
      const end = index < chapterMarkers.length - 1 ? chapterMarkers[index + 1].page - 1 : extractionEnd;
      const group = pages.filter((page) => page.pageStart! >= start && page.pageEnd! <= end);
      if (!group.length) return;
      segments.push({
        title: marker.title,
        text: group.map((page) => page.text).join(' '),
        source: start === end ? `p. ${start}` : `pp. ${start}–${end}`,
        pageStart: start,
        pageEnd: end,
      });
    });
  } else {
    for (let index = 0; index < pages.length; index += 8) {
      const group = pages.slice(index, index + 8);
      const start = group[0].pageStart!;
      const end = group[group.length - 1].pageEnd!;
      segments.push({
        title: `Pages ${start}–${end}`,
        text: group.map((page) => page.text).join(' '),
        source: start === end ? `p. ${start}` : `pp. ${start}–${end}`,
        pageStart: start,
        pageEnd: end,
      });
    }
  }

  const info = metadata?.info as { Title?: string } | undefined;
  return { title: info?.Title, segments };
}

async function extractEpub(file: File, onProgress?: (progress: SemanticProgress) => void): Promise<{ title?: string; segments: SourceSegment[] }> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const containerText = await zip.file('META-INF/container.xml')?.async('text');
  if (!containerText) throw new Error('This EPUB is missing its book index.');
  const parser = new DOMParser();
  const container = parser.parseFromString(containerText, 'application/xml');
  const opfPath = container.querySelector('rootfile')?.getAttribute('full-path');
  if (!opfPath) throw new Error('This EPUB has no readable content package.');
  const opfText = await zip.file(opfPath)?.async('text');
  if (!opfText) throw new Error('The EPUB content package could not be read.');
  const opf = parser.parseFromString(opfText, 'application/xml');
  const title = normalize(opf.querySelector('title')?.textContent ?? '');
  const manifest = new Map<string, string>();
  opf.querySelectorAll('manifest item').forEach((item) => {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (id && href) manifest.set(id, href);
  });

  const segments: SourceSegment[] = [];
  const spine = [...opf.querySelectorAll('spine itemref')];
  for (let index = 0; index < spine.length; index += 1) {
    onProgress?.({ phase: 'extracting', completed: index, total: spine.length, message: `Reading EPUB section ${index + 1} of ${spine.length} locally` });
    const id = spine[index].getAttribute('idref');
    const href = id ? manifest.get(id) : undefined;
    if (!href) continue;
    const html = await zip.file(zipPath(opfPath, href))?.async('text');
    if (!html) continue;
    const doc = parser.parseFromString(html, 'text/html');
    doc.querySelectorAll('script, style, nav, svg').forEach((node) => node.remove());
    const heading = normalize(doc.querySelector('h1, h2, h3, title')?.textContent ?? '');
    doc.querySelectorAll('br, p, div, li, blockquote, h1, h2, h3, h4, h5, h6, section, article, td, th').forEach((node) => node.append(' '));
    const text = normalize(doc.body?.textContent ?? '');
    if (text.length < 120) continue;
    const chapterNumber = segments.length + 1;
    segments.push({ title: heading || `Section ${chapterNumber}`, text, source: `Section ${chapterNumber}` });
  }
  return { title: title || undefined, segments };
}

function createGuide(file: File, title: string | undefined, segments: SourceSegment[]): BookGuide {
  const fullText = segments.map((segment) => segment.text).join(' ');
  const wordCount = countWords(fullText);
  if (wordCount < 600) throw new Error('Not enough selectable text was found. This may be a scanned PDF; OCR support is planned next.');

  const snapshot = rankedSentences(fullText, 7).join(' ');
  const ideaCandidates = segments.flatMap((segment) => rankedSentences(segment.text, 2).map((sentence) => ({ sentence, segment })));
  const keyIdeas = ideaCandidates.slice(0, 10).map(({ sentence, segment }, index) => ({
    title: makeTitle(sentence, `Key idea ${index + 1}`),
    text: sentence,
    source: segment.source,
  }));

  const chapterTargetWords = depthWordTarget(wordCount, .55);
  const deepDiveTargetWords = depthWordTarget(wordCount, .80);

  const chapters = segments.map((segment) => {
    const segmentWords = countWords(segment.text);
    const targetWords = Math.max(120, Math.round(chapterTargetWords * (segmentWords / wordCount)));
    const summary = rankedSentencesToWords(segment.text, targetWords).join(' ');
    return { title: segment.title, text: summary || normalize(segment.text).slice(0, targetWords * 6), source: segment.source };
  });

  const deepDive = segments.map((segment) => {
    const segmentWords = countWords(segment.text);
    const targetWords = Math.max(240, Math.round(deepDiveTargetWords * (segmentWords / wordCount)));
    const summary = rankedSentencesToWords(segment.text, targetWords).join(' ');
    return { title: segment.title, text: summary || normalize(segment.text).slice(0, targetWords * 6), source: segment.source };
  });

  const chapterGuideMinutes = Math.max(1, Math.round(chapters.reduce((total, item) => total + countWords(item.text), 0) / 230));
  const deepDiveMinutes = Math.max(1, Math.round(deepDive.reduce((total, item) => total + countWords(item.text), 0) / 230));

  return {
    title: title || file.name.replace(/\.(pdf|epub)$/i, ''),
    fileName: file.name,
    wordCount,
    readingMinutes: Math.max(1, Math.round(wordCount / 230)),
    chapterGuideMinutes,
    deepDiveMinutes,
    snapshot,
    keyIdeas,
    chapters,
    deepDive,
  };
}

export type ProcessBookOptions = {
  connection?: ModelConnection | null;
  onProgress?: (progress: SemanticProgress) => void;
  maxPdfPages?: number;
  semanticConcurrency?: number;
};

export async function processBook(file: File, options: ProcessBookOptions = {}): Promise<BookGuide> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const extracted = extension === 'epub' ? await extractEpub(file, options.onProgress) : await extractPdf(file, options.onProgress, options.maxPdfPages);
  if (options.connection) {
    const { createSemanticGuide } = await import('./semantic-kernel');
    return createSemanticGuide({
      title: extracted.title || file.name.replace(/\.(pdf|epub)$/i, ''),
      fileName: file.name,
      segments: extracted.segments,
    }, options.connection, options.onProgress, undefined, { maxConcurrency: options.semanticConcurrency });
  }
  options.onProgress?.({ phase: 'assembling', completed: 1, total: 1, message: 'Building the local extractive guide on this device' });
  return createGuide(file, extracted.title, extracted.segments);
}
