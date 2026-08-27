'use client';

import { ChangeEvent, DragEvent, useRef, useState } from 'react';
import { BookGuide, processBook, SummaryItem } from '../lib/book-processor';

const summaryModes = [
  { name: 'Snapshot', time: '2 min', description: 'The book in one clear page' },
  { name: 'Key ideas', time: '8 min', description: 'The arguments worth remembering' },
  { name: 'Chapter guide', time: '≈55% of book', description: 'Every chapter, with arguments, examples, and context' },
  { name: 'Deep dive', time: '≈80% of book', description: 'The fullest guide: substance preserved, repetition removed' },
];

const formatDuration = (minutes: number) => {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
};

type Status = 'idle' | 'processing' | 'ready' | 'error';

function Brand() {
  return (
    <a className="brand" href="#" aria-label="Leafmark home">
      <span className="brand-mark" aria-hidden="true">L</span>
      <span>Leafmark</span>
    </a>
  );
}

function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="about-modal" role="dialog" aria-modal="true" aria-labelledby="about-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        <p className="eyebrow">No hidden meter</p>
        <h2 id="about-title">The book stays with you.</h2>
        <p>Leafmark extracts selectable text inside your browser and creates a private, extractive reading guide. Nothing is sent to a book library or AI API.</p>
        <ol>
          <li><b>Choose</b><span>Bring a PDF or EPUB you have the right to use.</span></li>
          <li><b>Read locally</b><span>The browser identifies sections and useful sentences.</span></li>
          <li><b>Explore</b><span>Switch between four depths and export your notes.</span></li>
        </ol>
      </section>
    </div>
  );
}

function ResultList({ items, deep = false }: { items: SummaryItem[]; deep?: boolean }) {
  return (
    <div className={deep ? 'deep-list' : 'idea-grid'}>
      {items.map((item, index) => deep ? (
        <details className="chapter-row" key={`${item.source}-${index}`} open={index === 0}>
          <summary>
            <span className="chapter-number">{String(index + 1).padStart(2, '0')}</span>
            <span><b>{item.title}</b><small>{item.source}</small></span>
            <span className="expand-mark" aria-hidden="true">+</span>
          </summary>
          <p>{item.text}</p>
        </details>
      ) : (
        <article className="idea-card" key={`${item.source}-${index}`}>
          <div className="idea-card-top"><span>IDEA {String(index + 1).padStart(2, '0')}</span><span>{item.source}</span></div>
          <h3>{item.title}</h3>
          <p>{item.text}</p>
        </article>
      ))}
    </div>
  );
}

function GuideView({ guide, mode, setMode, onReset }: { guide: BookGuide; mode: number; setMode: (mode: number) => void; onReset: () => void }) {
  const guideModes = summaryModes.map((item, index) => ({
    ...item,
    time: index === 2 ? formatDuration(guide.chapterGuideMinutes) : index === 3 ? formatDuration(guide.deepDiveMinutes) : item.time,
  }));

  const exportGuide = () => {
    const lines = [
      `# ${guide.title}`,
      '',
      '## Snapshot',
      guide.snapshot,
      '',
      '## Key ideas',
      ...guide.keyIdeas.flatMap((item) => [`### ${item.title}`, `${item.text} (${item.source})`, '']),
      '## Chapter guide',
      ...guide.chapters.flatMap((item) => [`### ${item.title}`, `${item.text} (${item.source})`, '']),
      '## Deep dive',
      ...guide.deepDive.flatMap((item) => [`### ${item.title}`, `${item.text} (${item.source})`, '']),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${guide.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-leafmark.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="guide-layout">
      <aside className="guide-sidebar">
        <div>
          <p className="rail-label">This book</p>
          <div className="mini-book"><span>PDF</span><div><b>{guide.title}</b><small>{guide.fileName}</small></div></div>
          <nav className="guide-nav" aria-label="Summary views">
            {guideModes.map((item, index) => (
              <button className={mode === index ? 'active' : ''} onClick={() => setMode(index)} key={item.name} type="button">
                <span>{index === 0 ? '◐' : index === 1 ? '✦' : index === 2 ? '≡' : '◎'}</span>
                <span>{item.name}<small>{item.time}</small></span>
              </button>
            ))}
          </nav>
        </div>
        <button className="new-book-button" type="button" onClick={onReset}>＋ New book</button>
      </aside>

      <section className="result-stage">
        <div className="result-heading">
          <div>
            <p className="eyebrow">Your private reading guide</p>
            <h1>{guide.title}</h1>
            <p className="book-meta">{guide.wordCount.toLocaleString()} words <span>•</span> about {guide.readingMinutes} min to read <span>•</span> processed locally</p>
          </div>
          <button className="export-button" type="button" onClick={exportGuide}>Export notes ↓</button>
        </div>

        <div className="mobile-mode-tabs" role="tablist" aria-label="Summary views">
          {guideModes.map((item, index) => <button role="tab" aria-selected={mode === index} className={mode === index ? 'active' : ''} onClick={() => setMode(index)} key={item.name}>{item.name}</button>)}
        </div>

        {mode === 0 && (
          <article className="snapshot-view">
            <div className="snapshot-index"><span>THE WHOLE BOOK</span><b>01</b></div>
            <div className="snapshot-copy">
              <h2>The shortest useful version</h2>
              <p>{guide.snapshot}</p>
              <div className="snapshot-note"><span>How to use this</span><p>Read this first to decide whether to explore the key ideas or open the original book.</p></div>
            </div>
          </article>
        )}
        {mode === 1 && <><div className="section-intro"><h2>{guide.keyIdeas.length} ideas worth keeping</h2><p>Each idea is linked to its place in the uploaded book.</p></div><ResultList items={guide.keyIdeas} /></>}
        {mode === 2 && <><div className="section-intro"><h2>Chapter by chapter</h2><p>A detailed, sequential companion with about {formatDuration(guide.chapterGuideMinutes)} of reading.</p></div><ResultList items={guide.chapters} deep /></>}
        {mode === 3 && <><div className="section-intro"><h2>The deep reading pass</h2><p>The fullest source-grounded guide, with about {formatDuration(guide.deepDiveMinutes)} of context, evidence, and connections.</p></div><ResultList items={guide.deepDive} deep /></>}
      </section>
    </div>
  );
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [guide, setGuide] = useState<BookGuide | null>(null);
  const [error, setError] = useState('');
  const [showAbout, setShowAbout] = useState(false);

  const chooseFile = (next?: File) => {
    if (!next) return;
    if (!/\.(pdf|epub)$/i.test(next.name)) {
      setError('Choose a PDF or EPUB file.');
      setStatus('error');
      return;
    }
    setFile(next);
    setError('');
    setStatus('idle');
  };

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => chooseFile(event.target.files?.[0]);
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files?.[0]);
  };

  const buildGuide = async () => {
    if (!file) { inputRef.current?.click(); return; }
    setStatus('processing');
    setError('');
    try {
      const result = await processBook(file);
      setGuide(result);
      setStatus('ready');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'This book could not be read.');
      setStatus('error');
    }
  };

  const reset = () => {
    setGuide(null); setFile(null); setStatus('idle'); setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  if (status === 'ready' && guide) {
    return <main className="app-shell result-app"><header className="topbar"><Brand /><div className="privacy-note"><span className="privacy-dot" />Your books stay on this device</div><button className="quiet-button" type="button" onClick={() => setShowAbout(true)}>How it works</button></header><GuideView guide={guide} mode={mode} setMode={setMode} onReset={reset} />{showAbout && <AboutModal onClose={() => setShowAbout(false)} />}</main>;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <Brand />
        <div className="privacy-note"><span className="privacy-dot" />Your books stay on this device</div>
        <button className="quiet-button" type="button" onClick={() => setShowAbout(true)}>How it works</button>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div><p className="rail-label">Library</p><button className="rail-item active" type="button"><span aria-hidden="true">⌂</span> My books <b>0</b></button><button className="rail-item" type="button"><span aria-hidden="true">✦</span> Saved ideas</button></div>
          <div className="local-card"><span className="local-icon" aria-hidden="true">◎</span><strong>Free means local</strong><p>The reading happens in your browser. No subscription, no upload vault.</p></div>
        </aside>

        <section className="main-stage">
          <div className="stage-heading"><p className="eyebrow">A quieter way through a long book</p><h1>Drop in a book.<br /><em>Choose how deeply</em> you want to understand it.</h1></div>
          <div className="depth-panel" aria-label="Choose summary depth">
            <div className="depth-intro"><span>Reading depth</span><strong>{summaryModes[mode].name}</strong><p>{summaryModes[mode].description}</p></div>
            <div className="depth-scale"><div className="depth-line" aria-hidden="true" />{summaryModes.map((item, index) => (
              <button className={`depth-stop ${index === mode ? 'selected' : ''}`} key={item.name} onClick={() => setMode(index)} type="button" aria-pressed={index === mode}><span className="stop-dot" /><span className="stop-copy"><b>{item.name}</b><small>{item.time}</small></span></button>
            ))}</div>
          </div>

          <div className={`drop-zone ${dragging ? 'dragging' : ''}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={handleDrop}>
            <input ref={inputRef} type="file" accept=".pdf,.epub,application/pdf,application/epub+zip" onChange={handleInput} hidden />
            <div className="file-emblem" aria-hidden="true"><span>{file?.name.toLowerCase().endsWith('.epub') ? 'EPUB' : 'PDF'}</span></div>
            <div className="drop-copy"><strong>{file?.name || 'Bring your own book'}</strong><p>{file ? 'Ready to build your private reading guide.' : 'Drag in a PDF or EPUB, or choose a file from your device.'}</p></div>
            <button className="primary-button" type="button" onClick={buildGuide} disabled={status === 'processing'}>{status === 'processing' ? 'Reading…' : file ? `Build ${summaryModes[mode].name}` : 'Choose a book'}</button>
          </div>
          {status === 'processing' && <div className="processing-bar" role="status"><span /><p><b>Reading your book locally…</b> Extracting sections and tracing every insight back to its source.</p></div>}
          {status === 'error' && <div className="error-message" role="alert"><b>Couldn’t read this file.</b><span>{error}</span><button type="button" onClick={() => inputRef.current?.click()}>Choose another</button></div>}
          <div className="trust-row" aria-label="Product promises"><span><b>01</b> No account needed</span><span><b>02</b> Page-linked insights</span><span><b>03</b> Export your notes</span></div>
        </section>

        <aside className="preview-rail"><div className="preview-label"><span>What you’ll get</span><span>Preview</span></div><article className="summary-sheet"><div className="sheet-topline"><span>KEY IDEA 03</span><span>p. 74–81</span></div><h2>Make the environment carry the burden.</h2><p>Lasting behavior change relies less on willpower than on making the desired action the easiest available choice.</p><div className="highlight-strip"><span>In practice</span><p>Reduce the number of decisions between intention and action.</p></div><div className="sheet-footer"><span>3 of 9 ideas</span><span>→</span></div></article><p className="preview-caption">Every claim points back to the pages it came from.</p></aside>
      </div>

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
    </main>
  );
}
