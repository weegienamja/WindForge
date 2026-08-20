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
  title: 'WindForge · Wind site suitability, computed.',
  description:
    'Six-factor wind site scoring, bias-corrected against ERA5 and CERRA reanalysis. Open source, free APIs, callable from Claude Desktop and Cursor.',
  authors: [{ name: 'Jamie Blair', url: 'https://jamieblair.co.uk' }],
  keywords: [
    'wind energy',
    'wind site assessment',
    'wind turbine siting',
    'reanalysis bias correction',
    'ERA5',
    'CERRA',
    'NASA POWER',
    'MCP',
    'open source',
  ],
  alternates: { canonical: 'https://wind.jamieblair.co.uk' },
  openGraph: {
    title: 'WindForge · Wind site suitability, computed.',
    description:
      'Six-factor wind site scoring, bias-corrected against ERA5 and CERRA reanalysis. Open source, free APIs.',
    type: 'website',
    url: 'https://wind.jamieblair.co.uk',
    siteName: 'WindForge',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WindForge · Wind site suitability, computed.',
    description: 'Six-factor wind site scoring, bias-corrected against ERA5 and CERRA reanalysis.',
  },
  metadataBase: new URL('https://wind.jamieblair.co.uk'),
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
