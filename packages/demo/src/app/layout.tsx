import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Geist, Fraunces, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const geist = Geist({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-geist',
  display: 'swap',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
  axes: ['opsz'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'WindForge · Wind site screening',
  description:
    'Open-source, six-factor pre-feasibility screening for wind-energy sites using public evidence and explicit completeness.',
  authors: [{ name: 'Jamie Blair', url: 'https://jamieblair.co.uk' }],
  keywords: [
    'wind energy',
    'wind site assessment',
    'wind turbine siting',
    'wind resource screening',
    'ERA5',
    'NASA POWER',
    'MCP',
    'open source',
  ],
  alternates: { canonical: 'https://wind-forge-demo.vercel.app' },
  openGraph: {
    title: 'WindForge · Wind site screening',
    description:
      'Open-source, six-factor pre-feasibility screening with explicit evidence provenance and completeness.',
    type: 'website',
    url: 'https://wind-forge-demo.vercel.app',
    siteName: 'WindForge',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WindForge · Wind site screening',
    description:
      'Open-source pre-feasibility screening with explicit evidence provenance and completeness.',
  },
  metadataBase: new URL('https://wind-forge-demo.vercel.app'),
};

// Mobile-first viewport. Leaflet's CSS is imported by the LeafletMap component
// (loaded client-side via `next/dynamic`), so it no longer needs a render-blocking
// <link> in <head>; the favicon is served automatically from `app/icon.svg`.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a0e1a',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${fraunces.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
