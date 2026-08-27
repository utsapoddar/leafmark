import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Leafmark — Understand any book at your depth',
  description: 'Private, local-first book summaries from your own PDF or EPUB. No subscription required.',
  openGraph: {
    title: 'Leafmark — Understand any book at your depth',
    description: 'Private, local-first book summaries from your own PDF or EPUB. No subscription required.',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Leafmark — Understand any book at your depth',
    description: 'Private, local-first book summaries from your own PDF or EPUB. No subscription required.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
