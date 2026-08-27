'use client';

import Link from 'next/link';
import { ChangeEvent, DragEvent, useRef, useState } from 'react';
import { BookGuide, processBook, SummaryItem } from '../lib/book-processor';
import { discoverModels, ModelConnection, ModelOption, ProviderId, providers, verifyCustomModel } from '../lib/model-providers';
import type { SemanticProgress } from '../lib/semantic-kernel';

const summaryModes = [
  { name: 'Snapshot', time: '2 min', description: 'The book in one clear page' },
  { name: 'Key ideas', time: '8 min', description: 'The arguments worth remembering' },
  { name: 'Chapter guide', time: '1–3 hr', description: 'Every chapter, with arguments, examples, and context' },
  { name: 'Deep dive', time: '3–5 hr', description: 'The fullest guide: substance preserved, repetition removed' },
];

const formatDuration = (minutes: number) => {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
};

type Status = 'idle' | 'processing' | 'ready' | 'error';
type ConnectionStatus = 'idle' | 'testing' | 'ready' | 'error';

function Brand() {
  return (
    <a className="brand" href="#" aria-label="Leafmark home">
      <span className="brand-mark" aria-hidden="true">L</span>
      <span>Leafmark</span>
    </a>
  );
}

function AppHeader({ connection, onAbout, onAi }: { connection: ModelConnection | null; onAbout: () => void; onAi: () => void }) {
  return (
    <header className="topbar">
      <Brand />
      <div className="privacy-note"><span className="privacy-dot" />Your book stays local until you use AI</div>
      <div className="topbar-actions">
        <button className={`ai-button ${connection ? 'connected' : ''}`} type="button" onClick={onAi}>
          <span aria-hidden="true">{connection ? '●' : '✦'}</span>{connection ? `${connection.providerName} ready` : 'Connect AI'}
        </button>
        <button className="quiet-button" type="button" onClick={onAbout}>How it works</button>
      </div>
    </header>
  );
}

function AiSetupModal({ activeConnection, onClose, onConnect, onDisconnect }: { activeConnection: ModelConnection | null; onClose: () => void; onConnect: (connection: ModelConnection) => void; onDisconnect: () => void }) {
  const [providerId, setProviderId] = useState<ProviderId>(activeConnection?.provider ?? 'gemini');
  const provider = providers.find((item) => item.id === providerId)!;
  const [apiKey, setApiKey] = useState(activeConnection?.apiKey ?? '');
  const [baseUrl, setBaseUrl] = useState(activeConnection?.baseUrl ?? provider.baseUrl);
  const [models, setModels] = useState<ModelOption[]>(activeConnection ? [{ id: activeConnection.model, label: activeConnection.model }] : []);
  const [model, setModel] = useState(activeConnection?.model ?? '');
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>(activeConnection ? 'ready' : 'idle');
  const [message, setMessage] = useState(activeConnection ? `${activeConnection.providerName} is connected for this tab.` : '');
  const [showKey, setShowKey] = useState(false);

  const selectProvider = (nextId: ProviderId) => {
    const next = providers.find((item) => item.id === nextId)!;
    const active = activeConnection?.provider === nextId ? activeConnection : null;
    setProviderId(nextId);
    setApiKey(active?.apiKey ?? '');
    setBaseUrl(active?.baseUrl ?? next.baseUrl);
    setModels(active ? [{ id: active.model, label: active.model }] : []);
    setModel(active?.model ?? '');
    setConsent(false);
    setStatus(active ? 'ready' : 'idle');
    setMessage(active ? `${active.providerName} is connected for this tab.` : '');
  };

  const testConnection = async () => {
    setStatus('testing'); setMessage('Checking the key and finding available models…');
    try {
      const found = provider.id === 'custom' && model.trim()
        ? await verifyCustomModel({ provider: provider.id, providerName: provider.name, apiKey, baseUrl, model })
        : await discoverModels({ provider: provider.id, providerName: provider.name, apiKey, baseUrl });
      setModels(found); setModel((current) => current && found.some((item) => item.id === current) ? current : found[0].id);
      setStatus('ready'); setMessage(`${found.length} model${found.length === 1 ? '' : 's'} available. Choose one to finish.`);
    } catch (caught) {
      setStatus('error'); setMessage(caught instanceof Error ? caught.message : 'The connection could not be tested.');
    }
  };

  const useLocal = () => {
    onDisconnect(); onClose();
  };

  const saveConnection = () => {
    if (!model || !consent) return;
    onConnect({ provider: provider.id, providerName: provider.name, apiKey: apiKey.trim(), baseUrl: baseUrl.trim(), model });
    onClose();
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="ai-modal" role="dialog" aria-modal="true" aria-labelledby="ai-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        <div className="ai-modal-heading">
          <div><p className="eyebrow">Your model, your account</p><h2 id="ai-title">Connect a reading brain.</h2></div>
          <p>Free key, paid key, or your own endpoint. Leafmark never includes your credential in the public site.</p>
        </div>

        <div className="provider-tabs" role="tablist" aria-label="AI providers">
          {providers.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={providerId === item.id} className={providerId === item.id ? 'selected' : ''} onClick={() => selectProvider(item.id)}>
              <span>{item.mark}</span><b>{item.name}</b>
            </button>
          ))}
        </div>

        {provider.id === 'local' ? (
          <div className="provider-workspace local-choice">
            <div className="provider-copy"><span className="provider-mark">L</span><div><h3>Keep the whole book here.</h3><p>Use Leafmark’s current extractive reader. No account, key, or network request.</p></div></div>
            <button className="primary-button" type="button" onClick={useLocal}>Use local reading</button>
          </div>
        ) : provider.id === 'nvidia' ? (
          <div className="provider-workspace provider-limit">
            <div className="provider-copy"><span className="provider-mark">N</span><div><h3>NVIDIA needs a route you control.</h3><p>NVIDIA&apos;s hosted NIM endpoint does not permit credentialed requests from GitHub Pages. Leafmark will not send your key through an unknown public CORS proxy.</p></div><a href={provider.keyUrl} target="_blank" rel="noreferrer">NVIDIA guide ↗</a></div>
            <div className="provider-limit-note"><span aria-hidden="true">i</span><p>Run a local NIM or private relay with an OpenAI-compatible URL, then add that URL and its key under Custom.</p></div>
            <button className="primary-button" type="button" onClick={() => selectProvider('custom')}>Set up my endpoint</button>
          </div>
        ) : (
          <div className="provider-workspace">
            <div className="provider-copy"><span className="provider-mark">{provider.mark}</span><div><h3>{provider.name}</h3><p>{provider.description}</p></div>{provider.keyUrl && <a href={provider.keyUrl} target="_blank" rel="noreferrer">Get a key ↗</a>}</div>

            <div className="connection-form">
              {provider.id === 'custom' && <label><span>API base URL</span><input value={baseUrl} onChange={(event) => { setBaseUrl(event.target.value); setStatus('idle'); }} placeholder="https://your-provider.example/v1" /></label>}
              {provider.id === 'custom' && <label><span>Model ID</span><input value={model} onChange={(event) => { setModel(event.target.value); setStatus('idle'); }} placeholder="your-model-name" /></label>}
              <label><span>{provider.id === 'custom' ? 'Bearer key (optional)' : 'API key'}</span><div className="secret-field"><input type={showKey ? 'text' : 'password'} value={apiKey} onChange={(event) => { setApiKey(event.target.value); setStatus('idle'); }} placeholder={provider.keyPlaceholder} autoComplete="off" spellCheck={false} /><button type="button" onClick={() => setShowKey((value) => !value)}>{showKey ? 'Hide' : 'Show'}</button></div></label>
              <p className="key-privacy">Leafmark does not store your API key or send it anywhere except the provider you choose. <Link href="/privacy/" target="_blank" rel="noreferrer">Read our Privacy Policy.</Link></p>
              {provider.id !== 'custom' && models.length > 0 && <label><span>Model</span><select value={model} onChange={(event) => setModel(event.target.value)}>{models.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
            </div>

            <div className={`connection-status ${status}`} role="status"><span>{status === 'testing' ? '↻' : status === 'ready' ? '✓' : status === 'error' ? '!' : 'i'}</span><p>{message || 'The key stays in memory and disappears when this tab closes.'}</p></div>

            {status === 'ready' && <label className="consent-row"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>I understand that book excerpts will be sent to {provider.name} when AI reading is enabled.</span></label>}

            <div className="ai-actions">
              <button className="test-button" type="button" onClick={testConnection} disabled={status === 'testing'}>{status === 'testing' ? 'Testing…' : models.length ? 'Test again' : 'Test & find models'}</button>
              <button className="primary-button" type="button" onClick={saveConnection} disabled={status !== 'ready' || !model || !consent}>Use this model</button>
            </div>
          </div>
        )}
        <p className="ai-footnote"><b>How it works:</b> Leafmark extracts the book locally, sends bounded excerpts to your selected model, validates a source ledger, then assembles every reading depth on this device.</p>
      </section>
    </div>
  );
}

function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="about-modal" role="dialog" aria-modal="true" aria-labelledby="about-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        <p className="eyebrow">No hidden meter</p>
        <h2 id="about-title">The book stays with you.</h2>
        <p>Leafmark extracts selectable text inside your browser. Local reading stays entirely on this device; if you connect AI, bounded excerpts go directly to the provider you chose and nowhere else.</p>
        <ol>
          <li><b>Choose</b><span>Bring a PDF or EPUB you have the right to use.</span></li>
          <li><b>Choose the brain</b><span>Stay local or explicitly connect your own AI provider and key.</span></li>
          <li><b>Explore</b><span>Leafmark validates source IDs, builds four depths, and exports your notes.</span></li>
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
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className="guide-layout">
      <aside className="guide-sidebar">
        <div>
          <p className="rail-label">This book</p>
          <div className="mini-book"><span>{guide.fileName.toLowerCase().endsWith('.epub') ? 'EPUB' : 'PDF'}</span><div><b>{guide.title}</b><small>{guide.fileName}</small></div></div>
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
  const [showAiSetup, setShowAiSetup] = useState(false);
  const [aiConnection, setAiConnection] = useState<ModelConnection | null>(null);
  const [processingProgress, setProcessingProgress] = useState<SemanticProgress | null>(null);

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
    setProcessingProgress({ phase: 'extracting', completed: 0, total: 1, message: 'Opening the book locally' });
    try {
      const result = await processBook(file, { connection: aiConnection, onProgress: setProcessingProgress });
      setGuide(result);
      setStatus('ready');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'This book could not be read.');
      setStatus('error');
    }
  };

  const reset = () => {
    setGuide(null); setFile(null); setStatus('idle'); setError(''); setProcessingProgress(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  if (status === 'ready' && guide) {
    return <main className="app-shell result-app"><AppHeader connection={aiConnection} onAbout={() => setShowAbout(true)} onAi={() => setShowAiSetup(true)} /><GuideView guide={guide} mode={mode} setMode={setMode} onReset={reset} />{showAbout && <AboutModal onClose={() => setShowAbout(false)} />}{showAiSetup && <AiSetupModal activeConnection={aiConnection} onClose={() => setShowAiSetup(false)} onConnect={setAiConnection} onDisconnect={() => setAiConnection(null)} />}</main>;
  }

  return (
    <main className="app-shell">
      <AppHeader connection={aiConnection} onAbout={() => setShowAbout(true)} onAi={() => setShowAiSetup(true)} />

      <div className="workspace">
        <aside className="sidebar">
          <div><p className="rail-label">Library</p><button className="rail-item active" type="button"><span aria-hidden="true">⌂</span> My books <b>0</b></button><button className="rail-item" type="button"><span aria-hidden="true">✦</span> Saved ideas</button></div>
          <button className={`model-card ${aiConnection ? 'connected' : ''}`} type="button" onClick={() => setShowAiSetup(true)}><span className="local-icon" aria-hidden="true">{aiConnection ? '✓' : '✦'}</span><strong>{aiConnection ? `${aiConnection.providerName} ready` : 'Bring your own AI'}</strong><p>{aiConnection ? `${aiConnection.model} is connected for this tab.` : 'Use your free, paid, local, or self-hosted model.'}</p><b>{aiConnection ? 'Change model →' : 'Connect a model →'}</b></button>
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
          {status === 'processing' && <div className="processing-bar" role="status"><span /><p><b>{aiConnection ? `Building with ${aiConnection.providerName}…` : 'Reading your book locally…'}</b> {processingProgress?.message || 'Tracing every insight back to its source.'}{processingProgress && processingProgress.total > 1 ? ` · ${Math.min(processingProgress.completed + 1, processingProgress.total)} of ${processingProgress.total}` : ''}</p></div>}
          {status === 'error' && <div className="error-message" role="alert"><b>Couldn’t build this guide.</b><span>{error}</span><button type="button" onClick={buildGuide}>Try again</button></div>}
          <div className="trust-row" aria-label="Product promises"><span><b>01</b> No account needed</span><span><b>02</b> Page-linked insights</span><span><b>03</b> Export your notes</span></div>
        </section>

        <aside className="preview-rail"><div className="preview-label"><span>What you’ll get</span><span>Preview</span></div><article className="summary-sheet"><div className="sheet-topline"><span>KEY IDEA 03</span><span>p. 74–81</span></div><h2>Make the environment carry the burden.</h2><p>Lasting behavior change relies less on willpower than on making the desired action the easiest available choice.</p><div className="highlight-strip"><span>In practice</span><p>Reduce the number of decisions between intention and action.</p></div><div className="sheet-footer"><span>3 of 9 ideas</span><span>→</span></div></article><p className="preview-caption">Every claim points back to the pages it came from.</p></aside>
      </div>

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
      {showAiSetup && <AiSetupModal activeConnection={aiConnection} onClose={() => setShowAiSetup(false)} onConnect={setAiConnection} onDisconnect={() => setAiConnection(null)} />}
    </main>
  );
}
