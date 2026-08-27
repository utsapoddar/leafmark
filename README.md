# Leafmark

Leafmark is a free, privacy-first book-summary web app. A reader brings a PDF or EPUB they have the right to use; the browser extracts its selectable text and builds four views without sending the book to a server.

Public site: https://utsapoddar.github.io/leafmark/

## Product model

- **Snapshot:** a two-minute overview of the whole book.
- **Key ideas:** the arguments and claims worth retaining.
- **Chapter guide:** a detailed, sequential companion targeting at least 55% of the uploaded book where that fits within the 1–3 hour reading range.
- **Deep dive:** the fullest source-grounded guide, targeting 80% of the uploaded book where that fits within the 3–5 hour reading range.
- **Source trail:** each item retains a page or EPUB-section reference.
- **Export:** the generated reading guide can be downloaded as Markdown.

The initial engine is deliberately extractive. It ranks and assembles sentences from the source locally, which makes it free, fast, private, and less prone to invented claims. It does not yet OCR scanned/image-only PDFs.

For unusually short books, a guide never claims to be longer than its source. For long books, Chapter Guide is capped at about three hours and Deep Dive at about five. The result screen reports the actual estimated reading time generated from the uploaded text.

## Why this shape

- Blinkist packages nonfiction books into editorial 15-minute text and audio summaries organized around several key insights.
- Deepstash packages knowledge as short, independent idea cards that people can save and revisit.
- Shortform goes deeper with chapter-level guides, analysis, and exercises.

Leafmark combines the useful interaction patterns—quick overview, idea cards, and chapter depth—but uses a bring-your-own-book model so it does not need to license, host, or distribute a commercial catalog.

## Free architecture

The current release has no metered API and no app database. PDF parsing uses PDF.js, EPUB parsing uses JSZip and browser DOM APIs, and summarization runs on the reader's device. Static hosting can therefore stay within common free tiers.

Future improvements should preserve the same boundary:

1. Add opt-in browser OCR for scanned pages.
2. Add an optional on-device language model for abstractive summaries on capable hardware.
3. Add a question mode whose answers always cite extracted sections.
4. Store a local library in IndexedDB, with explicit delete controls.
5. Add [Lecture Mode](docs/lecture-mode.md): a source-grounded teaching sequence that explains one idea at a time, checks recall, adapts the next explanation, and never advances silently past a misunderstanding.

Do not build a public repository of user-generated summaries for copyrighted books without a separate rights and legal review. Keep uploads and generated guides private by default.

## Development

```bash
npm install
npm run dev
npm run build
```
