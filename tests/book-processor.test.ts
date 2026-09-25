import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import { JSDOM } from 'jsdom';
import { isNumberedChapterTitle, planChapters, processBook, type OutlineEntry } from '../lib/book-processor';

globalThis.DOMParser ??= new JSDOM().window.DOMParser;

const chapterText = (chapter: number) => Array.from({ length: 12 }, (_, index) => (
  `The traveller recorded in chapter ${chapter} that observation ${index + 1} about the river, the harbour, and the long winter changed his plans for the journey ahead.`
)).join(' ');

const xhtml = (body: string, bodyType = 'bodymatter') => `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Section</title></head>
<body epub:type="${bodyType}">${body}</body></html>`;

async function makeEpub() {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file('META-INF/container.xml', '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  const files: Array<{ id: string; body: string; linear?: 'no' }> = [
    { id: 'imprint', body: xhtml(`<section epub:type="imprint"><h2>Imprint</h2><p>${'This ebook was produced by volunteers and is released into the public domain for anyone to use. '.repeat(4)}</p></section>`, 'frontmatter') },
    { id: 'dedication', body: xhtml(`<section><h2>Dedication</h2><p>${'To my sister, who waited patiently at home through every long and difficult season. '.repeat(3)}</p></section>`, 'frontmatter') },
    { id: 'notes', linear: 'no', body: xhtml(`<section><h2>Translator Remarks</h2><p>${'An auxiliary page that readers reach only through links from the text itself. '.repeat(4)}</p></section>`, 'backmatter') },
    ...Array.from({ length: 10 }, (_, index) => ({
      id: `chapter-${index + 1}`,
      body: xhtml(`${index === 0 ? `<section id="pg-header"><p>${'The Project Gutenberg eBook of a sample journey, available at no cost and with almost no restrictions. '.repeat(3)}</p></section>` : ''}<section epub:type="chapter"><h2>Chapter ${index + 1}</h2><p>${chapterText(index + 1)}</p></section>`),
    })),
    { id: 'colophon', body: xhtml(`<section epub:type="colophon"><h2>Colophon</h2><p>${'This book was typeset in a classic serif face and proofread by many careful hands. '.repeat(4)}</p></section>`, 'backmatter') },
  ];
  zip.file('OEBPS/content.opf', `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Sample Journey</dc:title></metadata>
<manifest>${files.map((file) => `<item href="text/${file.id}.xhtml" id="${file.id}" media-type="application/xhtml+xml"/>`).join('')}</manifest>
<spine>${files.map((file) => `<itemref idref="${file.id}"${file.linear ? ` linear="${file.linear}"` : ''}/>`).join('')}</spine></package>`);
  files.forEach((file) => zip.file(`OEBPS/text/${file.id}.xhtml`, file.body));
  return new File([await zip.generateAsync({ type: 'arraybuffer' })], 'sample-journey.epub', { type: 'application/epub+zip' });
}

test('EPUB guides skip front matter, back matter, non-linear items, and Gutenberg boilerplate', async () => {
  const guide = await processBook(await makeEpub());
  assert.equal(guide.title, 'Sample Journey');
  assert.deepEqual(guide.chapters.map((chapter) => chapter.title), Array.from({ length: 10 }, (_, index) => `Chapter ${index + 1}`));
  const everything = JSON.stringify(guide);
  for (const excluded of ['public domain for anyone', 'my sister', 'auxiliary page', 'Project Gutenberg', 'typeset']) {
    assert.ok(!everything.includes(excluded), `guide should not contain "${excluded}"`);
  }
});

test('key ideas and snapshot span the whole book instead of its opening sections', async () => {
  const guide = await processBook(await makeEpub());
  assert.equal(guide.keyIdeas.length, 10);
  const ideaSections = new Set(guide.keyIdeas.map((idea) => idea.source));
  assert.ok(ideaSections.size >= 8, `key ideas came from only ${ideaSections.size} sections`);
  assert.ok(ideaSections.has('Section 10'), 'key ideas should reach the final chapter');
  const snapshotChapters = new Set([...guide.snapshot.matchAll(/chapter (\d+)/g)].map((match) => Number(match[1])));
  assert.ok(Math.max(...snapshotChapters) >= 9, 'snapshot should draw on the end of the book');
  assert.ok(snapshotChapters.size >= 5, `snapshot drew on only ${snapshotChapters.size} chapters`);
  const ideaTexts = new Set(guide.keyIdeas.map((idea) => idea.text));
  assert.ok(!guide.snapshot.split(/(?<=\.)\s+/).some((sentence) => ideaTexts.has(sentence)), 'key ideas should not repeat snapshot sentences');
});

test('numbered chapter titles include bare headings and exclude roman-looking words', () => {
  for (const title of ['Chapter I', 'Chapter 1', 'Chapter One', 'chapter xii', 'Chapter 4: The Storm', 'Book II', '1. Economy', '12 Rules', 'IV', 'IV. The Harbour', 'Seven.']) {
    assert.ok(isNumberedChapterTitle(title), title);
  }
  for (const title of ['Civil War', 'I Remember', 'Mild Weather', 'Did It Matter', 'Two Cities', 'Letter I', 'Economy', '1984']) {
    assert.ok(!isNumberedChapterTitle(title), title);
  }
});

test('outline plan keeps opening letters as sections before numbered chapters', () => {
  const entries: OutlineEntry[] = [
    { title: 'Title Page', page: 1, depth: 0 },
    { title: 'Introduction', page: 2, depth: 0 },
    { title: 'Preface', page: 6, depth: 0 },
    { title: 'Letter I', page: 8, depth: 0 },
    { title: 'Letter II', page: 11, depth: 0 },
    ...Array.from({ length: 5 }, (_, index) => ({ title: `Chapter ${['I', 'II', 'III', 'IV', 'V'][index]}`, page: 14 + index * 5, depth: 0 })),
    { title: 'Notes', page: 40, depth: 0 },
  ];
  const plan = planChapters(entries, 45);
  assert.deepEqual(plan?.markers.map((marker) => marker.title), ['Introduction', 'Preface', 'Letter I', 'Letter II', 'Chapter I', 'Chapter II', 'Chapter III', 'Chapter IV', 'Chapter V']);
  assert.equal(plan?.start, 2);
  assert.equal(plan?.end, 39);
});

test('outline plan uses named chapters when none are numbered', () => {
  const names = ['Economy', 'Where I Lived', 'Reading', 'Sounds', 'Solitude'];
  const entries: OutlineEntry[] = [
    { title: 'Walden', page: 1, depth: 0 },
    { title: 'Contents', page: 2, depth: 1 },
    ...names.map((title, index) => ({ title, page: 3 + index * 10, depth: 1 })),
    { title: 'Colophon', page: 60, depth: 1 },
  ];
  const plan = planChapters(entries, 61);
  assert.deepEqual(plan?.markers.map((marker) => marker.title), names);
  assert.equal(plan?.start, 3);
  assert.equal(plan?.end, 59);
});

test('outline plan treats numbered parts as containers for named chapters', () => {
  const entries: OutlineEntry[] = ['One', 'Two', 'Three'].flatMap((part, partIndex) => [
    { title: `Part ${part}: Beginnings`, page: 1 + partIndex * 30, depth: 0 },
    ...['The Harbour', 'The River', 'The Winter'].map((name, index) => ({ title: `${name} ${partIndex + 1}`, page: 2 + partIndex * 30 + index * 9, depth: 1 })),
  ]);
  const plan = planChapters(entries, 90);
  assert.equal(plan?.markers.length, 9);
  assert.equal(plan?.markers[0].title, 'The Harbour 1');
});

test('outline plan ignores per-page bookmarks and outlines without sections', () => {
  const pageBookmarks = Array.from({ length: 20 }, (_, index) => ({ title: `Scan ${index + 1}`, page: index + 1, depth: 0 }));
  assert.equal(planChapters(pageBookmarks, 20), null);
  assert.equal(planChapters([{ title: 'Cover', page: 1, depth: 0 }, { title: 'Book', page: 2, depth: 0 }], 90), null);
});
