import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy — Leafmark',
  description: 'How Leafmark handles books, API keys, and AI-provider requests.',
};

export default function PrivacyPage() {
  return (
    <main className="privacy-page">
      <nav className="privacy-nav" aria-label="Privacy page navigation">
        <Link className="brand" href="/" aria-label="Leafmark home">
          <span className="brand-mark" aria-hidden="true">L</span>
          <span>Leafmark</span>
        </Link>
        <Link className="privacy-back" href="/">← Back to the reader</Link>
      </nav>

      <article className="privacy-document">
        <header className="privacy-hero">
          <p className="eyebrow">Plain-language privacy</p>
          <h1>Your book is yours.<br /><em>Your key is yours.</em></h1>
          <p className="privacy-summary">Leafmark is a static, local-first reader. It has no Leafmark account system, database, advertising tracker, or server that stores your uploaded book or API key.</p>
          <p className="privacy-effective">Effective August 27, 2026</p>
        </header>

        <section className="privacy-callout" aria-label="Privacy at a glance">
          <div><span>01</span><b>Books stay local</b><p>PDF and EPUB text is extracted in your browser in the current release.</p></div>
          <div><span>02</span><b>Keys stay temporary</b><p>Your key is held only in this tab&apos;s memory and disappears on refresh or close.</p></div>
          <div><span>03</span><b>You choose the provider</b><p>A key or excerpt goes only to the provider or custom endpoint you select.</p></div>
        </section>

        <div className="privacy-sections">
          <section>
            <h2>1. What Leafmark processes</h2>
            <p>When you choose a PDF or EPUB, Leafmark reads its selectable text in your browser to make a reading guide. The file is not uploaded to a Leafmark server. You should only use books you are legally allowed to access and process.</p>
          </section>

          <section>
            <h2>2. How API keys are handled</h2>
            <p>Entering a key is optional. Leafmark keeps it in the current browser tab&apos;s memory by default; it is not written into the site, exported with a guide, or intentionally sent to analytics or logging services. Refreshing or closing the tab removes it.</p>
            <p>When you test a connection or use an AI model, the browser sends the key directly to the provider or custom endpoint you selected so that service can authenticate the request. Leafmark does not receive or retain a copy. Use a dedicated, revocable key with a spending limit whenever your provider supports those controls.</p>
          </section>

          <section>
            <h2>3. When an AI provider receives content</h2>
            <p>Leafmark asks for explicit consent before enabling AI reading. Once enabled, the selected service may receive your API key, book excerpts needed for the request, model settings, and ordinary network metadata. That provider&apos;s own terms, privacy practices, retention rules, training policies, and charges apply. Leafmark does not control them.</p>
            <p>For AI reading, Leafmark sends bounded, source-labeled excerpts rather than the uploaded file itself. The provider classifies those excerpts into a content ledger; Leafmark validates the returned source IDs and assembles the reading depths locally.</p>
          </section>

          <section>
            <h2>4. Custom endpoints</h2>
            <p>If you enter a custom OpenAI-compatible endpoint, requests go to that address. Leafmark permits HTTPS endpoints and local HTTP addresses. You are responsible for trusting the operator, reviewing its policy, and confirming that the endpoint is appropriate for the book you are processing.</p>
          </section>

          <section>
            <h2>5. Hosting, cookies, and analytics</h2>
            <p>Leafmark is served through GitHub Pages. GitHub may process technical information involved in delivering the site under its <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noreferrer">General Privacy Statement</a>. Leafmark itself currently uses no advertising cookies, behavioral analytics, or user accounts.</p>
          </section>

          <section>
            <h2>6. Provider policies</h2>
            <p>Review the policy for the service you connect: <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google</a>, <a href="https://groq.com/privacy-policy" target="_blank" rel="noreferrer">Groq</a>, <a href="https://www.cerebras.ai/privacy-policy" target="_blank" rel="noreferrer">Cerebras</a>, or <a href="https://www.nvidia.com/en-us/about-nvidia/privacy-center/" target="_blank" rel="noreferrer">NVIDIA</a>. For any other provider, use the policy published by that provider.</p>
          </section>

          <section>
            <h2>7. Security and changes</h2>
            <p>No browser application can promise absolute security. A malicious browser extension, compromised device, or untrusted endpoint could expose information displayed or entered in the browser. Keep your browser and device secure, restrict API-key permissions, and revoke a key if you suspect exposure.</p>
            <p>If Leafmark later adds optional saved settings, analytics, accounts, or server-side processing, this page will be updated before those features are treated as part of the normal service.</p>
          </section>

          <section>
            <h2>8. Questions</h2>
            <p>For a privacy question or correction, open an issue in the <a href="https://github.com/utsapoddar/leafmark/issues" target="_blank" rel="noreferrer">Leafmark GitHub repository</a>. Issues are public, so do not include an API key, private book text, or other sensitive information.</p>
          </section>
        </div>
      </article>
    </main>
  );
}
