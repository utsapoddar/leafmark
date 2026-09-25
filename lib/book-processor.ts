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

type BookSentence = { sentence: string; segment: SourceSegment; offset: number; score: number };

// Scores every sentence against whole-book word frequencies, with no bonus for appearing early in the book.
function bookSentences(segments: SourceSegment[], fullText: string): BookSentence[] {
  const frequencies = new Map<string, number>();
  wordsOf(fullText).forEach((word) => frequencies.set(word, (frequencies.get(word) ?? 0) + 1));
  const maxFrequency = Math.max(...frequencies.values(), 1);
  let segmentOffset = 0;
  return segments.flatMap((segment) => {
    const segmentWords = countWords(segment.text);
    const sentences = sentencesOf(segment.text);
    const scored = sentences.map((sentence, index) => {
      const words = wordsOf(sentence);
      const lexical = words.reduce((sum, word) => sum + (frequencies.get(word) ?? 0) / maxFrequency, 0) / Math.max(words.length, 1);
      const usableLength = sentence.length >= 80 && sentence.length <= 280 ? .08 : 0;
      return { sentence, segment, offset: segmentOffset + segmentWords * (index / sentences.length), score: lexical + usableLength };
    });
    segmentOffset += segmentWords;
    return scored;
  });
}

// Takes the best sentence from each of `count` equal slices of the book, so selections span beginning to end.
function spreadAcrossBook(sentences: BookSentence[], totalWords: number, count: number, exclude = new Set<string>()) {
  const chosen = new Set<BookSentence>();
  const available = (candidate: BookSentence) => !chosen.has(candidate) && !exclude.has(candidate.sentence);
  const best = (candidates: BookSentence[]) => candidates.reduce<BookSentence | undefined>((top, candidate) => (!top || candidate.score > top.score ? candidate : top), undefined);
  for (let slice = 0; slice < count; slice += 1) {
    const from = totalWords * slice / count;
    const to = totalWords * (slice + 1) / count;
    const pick = best(sentences.filter((candidate) => candidate.offset >= from && candidate.offset < to && available(candidate)));
    if (pick) chosen.add(pick);
  }
  // Slices without usable sentences fall back to the best remaining sentences anywhere.
  while (chosen.size < count) {
    const pick = best(sentences.filter(available));
    if (!pick) break;
    chosen.add(pick);
  }
  return [...chosen].sort((a, b) => a.offset - b.offset);
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

// Front and back matter that is not the author's argument or story. Matched as a prefix for PDF outline entries and as a
// whole title for EPUB section headings, where a real chapter may begin with one of these words.
const NON_CONTENT_NAMES = String.raw`cover|title ?page|half[- ]?title|copyright(?: page)?|uncopyright|imprint|colophon|dedication|epigraph|(?:table of )?contents|acknowledge?ments?|about the (?:author|authors|publisher)|also by\b.*|praise for\b.*|appendix(?:es)?|(?:end|foot)?notes?|index|glossary|bibliography|references?|further reading|licen[cs]e|the full project gutenberg licen[cs]e`;
const nonContentOutline = new RegExp(`^(?:${NON_CONTENT_NAMES})\\b`, 'i');
const nonContentHeading = new RegExp(`^(?:${NON_CONTENT_NAMES})[\\s.:]*$`, 'i');

const NUMBER_WORDS = 'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|twenty-one|twenty-two|twenty-three|twenty-four|twenty-five|twenty-six|twenty-seven|twenty-eight|twenty-nine|thirty';
const ROMAN = '(?=[MDCLXVI])M{0,3}(?:C[MD]|D?C{0,3})(?:X[CL]|L?X{0,3})(?:I[XV]|V?I{0,3})';
const AFTER_NUMBER = String.raw`(?:\s*[:.)\-–—]|$)`;
const numberedChapterPatterns = [
  new RegExp(`^(?:chapter|book)\\s+(?:\\d{1,3}|${ROMAN}|${NUMBER_WORDS})\\b`, 'i'),
  new RegExp(String.raw`^\d{1,3}(?:\s*[:.)\-–—]|\s+|$)`),
  // Bare numerals and number words need punctuation or nothing after them, so "Civil War" and "Two Cities" are not chapters.
  new RegExp(`^${ROMAN}${AFTER_NUMBER}`),
  new RegExp(`^(?:${NUMBER_WORDS})${AFTER_NUMBER}`, 'i'),
];
export const isNumberedChapterTitle = (title: string) => numberedChapterPatterns.some((pattern) => pattern.test(title));
const partTitle = new RegExp(`^(?:part|volume)\\s+(?:\\d{1,3}|${ROMAN}|${NUMBER_WORDS})\\b`, 'i');
const openingMatter = /^(?:introduction|prologue|preface|foreword)\b/i;
const closingMatter = /^(?:epilogue|conclusion|afterword)\b/i;

export type OutlineEntry = { title: string; page: number; depth: number };
export type ChapterPlan = { markers: OutlineEntry[]; start: number; end: number };

/** Chooses chapter boundaries from a PDF outline, or returns null when the outline does not describe chapters. */
export function planChapters(entries: OutlineEntry[], numPages: number): ChapterPlan | null {
  const byPage = (a: OutlineEntry, b: OutlineEntry) => a.page - b.page;
  const content = entries.filter((entry) => !nonContentOutline.test(entry.title));
  let markers: OutlineEntry[] = [];

  const numbered = content.filter((entry) => isNumberedChapterTitle(entry.title));
  const depthCounts = new Map<number, number>();
  numbered.forEach((entry) => depthCounts.set(entry.depth, (depthCounts.get(entry.depth) ?? 0) + 1));
  const chapterDepth = [...depthCounts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
  const chapters = numbered.filter((entry) => entry.depth === chapterDepth).sort(byPage);
  if (chapters.length >= 2) {
    // Keep every same-level section from the opening matter through the closing matter, e.g. Frankenstein's
    // Introduction, Preface and Letters I–IV before Chapter I, each as its own section.
    const sameDepth = content.filter((entry) => entry.depth === chapterDepth).sort(byPage);
    const first = sameDepth.find((entry) => entry.page < chapters[0].page && openingMatter.test(entry.title)) ?? chapters[0];
    const last = sameDepth.filter((entry) => entry.page > chapters.at(-1)!.page && closingMatter.test(entry.title)).at(-1) ?? chapters.at(-1)!;
    markers = sameDepth.filter((entry) => entry.page >= first.page && entry.page <= last.page);
  } else {
    // Named chapters such as Walden's "Economy" and "Solitude": use the shallowest outline level with several sections.
    // "Part One"-style entries group chapters, so they never count as chapters themselves.
    const named = content.filter((entry) => !partTitle.test(entry.title));
    const depths = [...new Set(named.map((entry) => entry.depth))].sort((a, b) => a - b);
    const namedDepth = depths.find((depth) => named.filter((entry) => entry.depth === depth).length >= 3);
    if (namedDepth !== undefined) markers = named.filter((entry) => entry.depth === namedDepth).sort(byPage);
  }

  markers = markers.filter((entry, index) => index === 0 || entry.page !== markers[index - 1].page);
  // Per-page bookmarks are navigation, not chapters.
  if (markers.length < 2 || markers.length > numPages / 2) return null;
  const tail = markers.at(-1)!;
  const nextBoundary = [...entries].sort(byPage).find((entry) => entry.page > tail.page && entry.depth <= tail.depth);
  const end = nextBoundary ? nextBoundary.page - 1 : closingMatter.test(tail.title) ? tail.page + 20 : numPages;
  return { markers, start: markers[0].page, end: Math.min(numPages, end) };
}

async function extractPdf(file: File, onProgress?: (progress: SemanticProgress) => void, maxPages?: number): Promise<{ title?: string; segments: SourceSegment[] }> {
  const runningInBrowser = typeof window !== 'undefined';
  // The legacy build polyfills recent JS APIs (e.g. Map.prototype.getOrInsertComputed) that the modern build requires natively.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (runningInBrowser) pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const metadata = await pdf.getMetadata().catch(() => null);
  type OutlineItem = { title?: string; dest?: string | unknown[] | null; items?: OutlineItem[] };
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
  const plan = maxPages ? null : planChapters(outlineEntries, pdf.numPages);
  const chapterMarkers = plan?.markers ?? [];
  const useChapterOutline = Boolean(plan);
  const extractionStart = plan?.start ?? 1;
  const extractionEnd = plan?.end ?? (maxPages ? Math.min(pdf.numPages, Math.max(1, Math.floor(maxPages))) : pdf.numPages);
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

// EPUB 3 structural semantics (epub:type, or DPUB-ARIA roles without the "doc-" prefix) for non-content sections.
const NON_CONTENT_EPUB_TYPES = new Set(['cover', 'titlepage', 'halftitlepage', 'seriespage', 'imprint', 'colophon', 'copyright-page', 'dedication', 'epigraph', 'toc', 'landmarks', 'loi', 'lot', 'acknowledgments', 'contributors', 'other-credits', 'errata', 'index', 'endnotes', 'footnotes', 'rearnotes', 'bibliography', 'glossary']);

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
    if (spine[index].getAttribute('linear') === 'no') continue;
    const id = spine[index].getAttribute('idref');
    const href = id ? manifest.get(id) : undefined;
    if (!href) continue;
    const html = await zip.file(zipPath(opfPath, href))?.async('text');
    if (!html) continue;
    const doc = parser.parseFromString(html, 'text/html');
    doc.querySelectorAll('script, style, nav, svg, #pg-header, #pg-footer, .pg-boilerplate').forEach((node) => node.remove());
    doc.querySelectorAll('[epub\\:type], [role]').forEach((node) => {
      const roles = `${node.getAttribute('epub:type') ?? ''} ${node.getAttribute('role') ?? ''}`.split(/\s+/).map((role) => role.replace(/^doc-/, ''));
      if (roles.some((role) => NON_CONTENT_EPUB_TYPES.has(role))) node.remove();
    });
    const heading = normalize((doc.body?.querySelector('h1, h2, h3') ?? doc.querySelector('title'))?.textContent ?? '');
    if (nonContentHeading.test(heading)) continue;
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

  const sentences = bookSentences(segments, fullText);
  const snapshotSentences = spreadAcrossBook(sentences, wordCount, 7);
  const snapshot = snapshotSentences.map((item) => item.sentence).join(' ');
  const ideaCandidates = spreadAcrossBook(sentences, wordCount, 10, new Set(snapshotSentences.map((item) => item.sentence)));
  const keyIdeas = ideaCandidates.map(({ sentence, segment }, index) => ({
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
