# Leafmark

Leafmark is a privacy-first book-summary web app. A reader brings a PDF or EPUB they have the right to use and chooses local processing or connects their own free, paid, local, or self-hosted AI model.

Public site: https://utsapoddar.github.io/leafmark/

## Product model

- **Snapshot:** a two-minute overview of the whole book.
- **Key ideas:** the arguments and claims worth retaining.
- **Chapter guide:** a detailed, sequential companion targeting roughly 55% of the uploaded book.
- **Deep dive:** the fullest source-grounded guide, targeting roughly 80% while preserving substantive material and removing repetition, transitions, and other nonessential prose.
- **Source trail:** each item retains a page or EPUB-section reference.
- **Export:** the generated reading guide can be downloaded as Markdown.

The initial engine is deliberately extractive. It ranks and assembles sentences from the source locally, which makes it free, fast, private, and less prone to invented claims. It does not yet OCR scanned/image-only PDFs.

Reading times are estimates, not limits. A short story can produce a guide under an hour; an unusually long work can produce one well beyond five hours. Depth is determined by the share of substantive source material retained, and the result screen reports the actual estimated reading time generated from the uploaded text.

## Why this shape

- Blinkist packages nonfiction books into editorial 15-minute text and audio summaries organized around several key insights.
- Deepstash packages knowledge as short, independent idea cards that people can save and revisit.
- Shortform goes deeper with chapter-level guides, analysis, and exercises.

Leafmark combines the useful interaction patterns—quick overview, idea cards, and chapter depth—but uses a bring-your-own-book model so it does not need to license, host, or distribute a commercial catalog.

## Bring your own model

The current release has no metered API and no app database. PDF parsing uses PDF.js, EPUB parsing uses JSZip and browser DOM APIs, and the current extractive engine runs on the reader's device. Static hosting can therefore stay within common free tiers.

The planned [provider kernel](docs/provider-kernel.md) lets each reader connect a free API key, paid API key, local model, or self-hosted OpenAI-compatible endpoint. Leafmark owns the summarization mechanics while provider adapters translate them for the selected model. Credentials belong to each reader and are never included in the public site.

Future improvements should preserve the same boundary:

1. Add opt-in browser OCR for scanned pages.
2. Add an optional on-device language model for abstractive summaries on capable hardware.
3. Implement the provider kernel and source-grounded content ledger.
4. Add a question mode whose answers always cite extracted sections.
5. Store a local library in IndexedDB, with explicit delete controls.
6. Add [Lecture Mode](docs/lecture-mode.md): a source-grounded teaching sequence that explains one idea at a time, checks recall, adapts the next explanation, and never advances silently past a misunderstanding.

Do not build a public repository of user-generated summaries for copyrighted books without a separate rights and legal review. Keep uploads and generated guides private by default.

## Development

```bash
npm install
npm run dev
npm run build
```
