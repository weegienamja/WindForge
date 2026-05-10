import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const alt = 'WindForge - Wind site suitability, computed.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Fraunces SemiBold (600) loaded once at module scope. Bundled with the
 * demo package via packages/demo/public/fonts/Fraunces-600.ttf so the OG
 * route renders the headline in the brand display face rather than a
 * generic system serif.
 */
const FRAUNCES_TTF: Buffer = readFileSync(
  join(process.cwd(), 'public/fonts/Fraunces-600.ttf'),
);

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#0a0e1a',
          color: '#e8eaef',
          padding: '64px 80px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          fontFamily: 'sans-serif',
          backgroundImage:
            'radial-gradient(circle at 20% 30%, rgba(56,189,248,0.08), transparent 50%), radial-gradient(circle at 80% 80%, rgba(251,191,36,0.06), transparent 50%)',
        }}
      >
        {/* Eyebrow */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            color: '#9ca3b0',
            fontSize: 18,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: '#38bdf8',
            }}
          />
          WindForge
        </div>

        {/* Headline + sub */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div
            style={{
              fontFamily: 'Fraunces',
              fontSize: 96,
              lineHeight: 1.05,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              color: '#f5f7fa',
              maxWidth: 980,
            }}
          >
            Wind site suitability, computed.
          </div>
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 22,
              color: '#9ca3b0',
              letterSpacing: '0.04em',
              display: 'flex',
              gap: 16,
            }}
          >
            <span>Bias-corrected</span>
            <span>·</span>
            <span>ERA5 + CERRA</span>
            <span>·</span>
            <span>Open source</span>
          </div>
        </div>

        {/* Bottom-right URL */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            color: '#5b6478',
            fontFamily: 'monospace',
            fontSize: 18,
          }}
        >
          <div style={{ display: 'flex', gap: 16 }}>
            <span>6 factors</span>
            <span>·</span>
            <span>900+ tests</span>
            <span>·</span>
            <span>MCP-ready</span>
          </div>
          <div>wind.jamieblair.co.uk</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: 'Fraunces',
          data: FRAUNCES_TTF,
          weight: 600,
          style: 'normal',
        },
      ],
    },
  );
}
