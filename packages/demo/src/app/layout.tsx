import type { Metadata } from 'next';
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${fraunces.variable} ${jetbrainsMono.variable}`}>
      <head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body>{children}</body>
    </html>
  );
}
