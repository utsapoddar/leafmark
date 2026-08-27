import JSZip from 'jszip';

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

const depthWordTarget = (bookWords: number, share: number, minMinutes: number, maxMinutes: number) => (
  Math.min(bookWords, Math.max(minMinutes * 230, Math.min(maxMinutes * 230, Math.round(bookWords * share))))
);

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

async function extractPdf(file: File): Promise<{ title?: string; segments: SourceSegment[] }> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const metadata = await pdf.getMetadata().catch(() => null);
  const pages: SourceSegment[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = normalize(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
    if (text) pages.push({ title: `Pages ${pageNumber}`, text, source: `p. ${pageNumber}`, pageStart: pageNumber, pageEnd: pageNumber });
  }

  const segments: SourceSegment[] = [];
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

  const info = metadata?.info as { Title?: string } | undefined;
  return { title: info?.Title, segments };
}

async function extractEpub(file: File): Promise<{ title?: string; segments: SourceSegment[] }> {
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
    const id = spine[index].getAttribute('idref');
    const href = id ? manifest.get(id) : undefined;
    if (!href) continue;
    const html = await zip.file(zipPath(opfPath, href))?.async('text');
    if (!html) continue;
    const doc = parser.parseFromString(html, 'text/html');
    doc.querySelectorAll('script, style, nav, svg').forEach((node) => node.remove());
    const text = normalize(doc.body?.textContent ?? '');
    if (text.length < 120) continue;
    const heading = normalize(doc.querySelector('h1, h2, h3, title')?.textContent ?? '');
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

  const chapterTargetWords = depthWordTarget(wordCount, .55, 60, 180);
  const deepDiveTargetWords = depthWordTarget(wordCount, .72, 180, 300);

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

export async function processBook(file: File): Promise<BookGuide> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const extracted = extension === 'epub' ? await extractEpub(file) : await extractPdf(file);
  return createGuide(file, extracted.title, extracted.segments);
}
