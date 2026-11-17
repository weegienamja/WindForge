import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { WindMark } from '../components/SiteHeader';

export const runtime = 'nodejs';
export const alt = 'WindForge · Wind turbine engineering';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const displayFont = readFileSync(join(process.cwd(), 'public/fonts/Fraunces-600.ttf'));

export default function OgImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#113d40',
        color: '#f9fcf3',
        padding: '58px 70px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
      }}
    >
      <svg
        width="1200"
        height="630"
        viewBox="0 0 1200 630"
        style={{ position: 'absolute', left: 0, top: 0 }}
        fill="none"
      >
        {Array.from({ length: 22 }, (_, i) => (
          <path
            key={i}
            stroke="#46736a"
            strokeWidth="2"
            d={`M-20 ${370 + i * 8} C230 ${330 + i * 7}, 280 ${640 + i * 5}, 600 ${480 + i * 5} S900 ${80 + i * 10}, 1230 ${175 + i * 9}`}
          />
        ))}
      </svg>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 38 }}>
        <WindMark />
        WindForge
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'Fraunces',
          fontSize: 108,
          lineHeight: 1.02,
          letterSpacing: '-0.03em',
        }}
      >
        <span>Wind turbine</span>
        <span style={{ color: '#d7efa7' }}>engineering</span>
      </div>
      <div style={{ display: 'flex', gap: 28, fontSize: 24, color: '#d5e7de' }}>
        <span>Turbine explorer</span>
        <span>Site analysis</span>
        <span>UK wind map</span>
      </div>
    </div>,
    { ...size, fonts: [{ name: 'Fraunces', data: displayFont, weight: 600, style: 'normal' }] },
  );
}
