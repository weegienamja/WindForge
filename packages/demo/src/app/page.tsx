'use client';

import Link from 'next/link';
import { DataCard } from '../components/primitives/DataCard';
import { NumberTicker } from '../components/primitives/NumberTicker';
import { ParticleField } from '../components/primitives/ParticleField';
import { SectionHeading } from '../components/primitives/SectionHeading';
import { CopyableCommand } from '../components/primitives/CopyableCommand';
import { Footer } from '../components/Footer';

const REPO_URL = 'https://github.com/jamieblair/wind-site-intelligence';
const MCP_README_URL = `${REPO_URL}/tree/main/packages/mcp`;
const MCP_TOOLS = [
  'analyse_site',
  'assess_site_polygon',
  'calculate_aep',
  'list_turbines',
  'fetch_wind_history',
  'detect_constraints',
] as const;

export default function LandingPage() {
  return (
    <main style={{ background: 'var(--surface-0)', color: 'var(--text-primary)' }}>
      {/* HERO */}
      <section
        style={{
          position: 'relative',
          minHeight: '100vh',
          width: '100%',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
          }}
        >
          <ParticleField ariaLabel="Animated global wind field, decorative" />
        </div>
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(ellipse at center, transparent 30%, rgba(10,14,26,0.55) 70%, rgba(10,14,26,0.85) 100%)',
            zIndex: 1,
          }}
        />
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '100vh',
            padding: 'var(--space-8) var(--space-5)',
            textAlign: 'center',
            maxWidth: 1100,
            margin: '0 auto',
          }}
        >
          <div className="t-eyebrow" style={{ color: 'var(--text-secondary)' }}>
            Wind site intelligence
          </div>
          <h1
            className="t-display"
            style={{
              margin: 'var(--space-4) 0 var(--space-5)',
              maxWidth: '14ch',
            }}
          >
            Wind site suitability, computed.
          </h1>
          <p
            className="t-body"
            style={{
              color: 'var(--text-secondary)',
              maxWidth: 640,
              margin: '0 0 var(--space-7)',
            }}
          >
            Six-factor scoring. Bias-corrected against ERA5 and CERRA reanalysis. ISO 9613-2 noise modelling. Open source, free APIs, callable from Claude Desktop and Cursor.
          </p>
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-3)',
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            <Link
              href="/analyse"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '14px 28px',
                background: 'var(--accent-cool)',
                color: '#0a0e1a',
                fontFamily: 'var(--font-sans)',
                fontWeight: 500,
                fontSize: 15,
                letterSpacing: '0.01em',
                textDecoration: 'none',
                borderRadius: 4,
                transition: 'background var(--duration-fast) var(--easing-standard)',
              }}
            >
              Run an analysis
            </Link>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer noopener"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '14px 28px',
                background: 'transparent',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-sans)',
                fontWeight: 500,
                fontSize: 15,
                letterSpacing: '0.01em',
                textDecoration: 'none',
                border: '1px solid var(--border-strong)',
                borderRadius: 4,
              }}
            >
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* STAT STRIP */}
      <section
        style={{
          borderTop: '1px solid var(--border-subtle)',
          borderBottom: '1px solid var(--border-subtle)',
          padding: 'var(--space-7) var(--space-5)',
          background: 'var(--surface-1)',
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 'var(--space-6)',
          }}
        >
          <Stat eyebrow="Tests passing" value={<NumberTicker value={925} />} unit="vitest" />
          <Stat eyebrow="Scoring factors" value={<NumberTicker value={6} />} unit="weighted" />
          <Stat
            eyebrow="ERA5 · CERRA"
            value={<NumberTicker value={2} />}
            unit="reanalysis sources"
          />
          <Stat eyebrow="Noise model" value={<span className="t-mono-large">ISO 9613-2</span>} unit="standard" />
        </div>
      </section>

      {/* WHAT IT MEASURES */}
      <section style={{ padding: 'var(--space-10) var(--space-5)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <SectionHeading eyebrow="What it measures" align="left">
            Three layers of evidence per site.
          </SectionHeading>
          <div
            style={{
              marginTop: 'var(--space-7)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 'var(--space-5)',
            }}
          >
            <DataCard eyebrow="WIND" title="Resource and stability" interactive>
              <ThumbnailWindRose />
              <p
                className="t-body"
                style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-3)' }}
              >
                Long-term mean speed, Weibull distribution, directional consistency. NASA POWER raw, ERA5 and CERRA bias-corrected at 50m and extrapolated to hub height.
              </p>
            </DataCard>
            <DataCard eyebrow="TERRAIN" title="Slope, roughness, flow" interactive>
              <ThumbnailContours />
              <p
                className="t-body"
                style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-3)' }}
              >
                Open-Elevation samples, slope and aspect derived locally, surface roughness class informs the wind shear exponent for hub-height extrapolation.
              </p>
            </DataCard>
            <DataCard eyebrow="CONSTRAINTS" title="Grid, land use, planning" interactive>
              <ThumbnailPins />
              <p
                className="t-body"
                style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-3)' }}
              >
                Distance to transmission lines and substations, protected zones and residential buffers, planning precedent from existing wind installations within 20km.
              </p>
            </DataCard>
          </div>
        </div>
      </section>

      {/* MCP STRIP */}
      <section
        style={{
          padding: 'var(--space-9) var(--space-5)',
          background: 'var(--surface-1)',
          borderTop: '1px solid var(--border-subtle)',
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 'var(--space-7)',
            alignItems: 'center',
          }}
        >
          <div>
            <div className="t-eyebrow">Model Context Protocol</div>
            <h2 className="t-h2" style={{ margin: 'var(--space-3) 0' }}>
              Call WindForge from your editor.
            </h2>
            <p className="t-body" style={{ color: 'var(--text-secondary)' }}>
              Six tools served over MCP stdio. Add the package to Claude
              Desktop, Cursor or any MCP-compatible client and ask in plain
              language.
            </p>
            <p
              className="t-body"
              style={{
                color: 'var(--text-secondary)',
                marginTop: 'var(--space-3)',
                fontSize: 13,
              }}
            >
              Six tools exposed:{' '}
              {MCP_TOOLS.map((name, i) => (
                <span key={name}>
                  <code
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      color: 'var(--text-primary)',
                      background: 'var(--surface-0)',
                      padding: '2px 6px',
                      borderRadius: 3,
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    {name}
                  </code>
                  {i < MCP_TOOLS.length - 1 ? ' ' : ''}
                </span>
              ))}
            </p>
            <div style={{ marginTop: 'var(--space-4)' }}>
              <a
                href={MCP_README_URL}
                target="_blank"
                rel="noreferrer noopener"
                style={{ color: 'var(--accent-cool)', fontFamily: 'var(--font-sans)' }}
              >
                Read the MCP setup guide →
              </a>
            </div>
          </div>
          <CopyableCommand command="npx -y @jamieblair/windforge-mcp" />
        </div>
      </section>

      {/* FOOTER */}
      <Footer />
    </main>
  );
}

function Stat({
  eyebrow,
  value,
  unit,
}: {
  eyebrow: string;
  value: React.ReactNode;
  unit: string;
}) {
  return (
    <div>
      <div className="t-eyebrow">{eyebrow}</div>
      <div
        style={{
          marginTop: 'var(--space-2)',
          display: 'flex',
          alignItems: 'baseline',
          gap: 'var(--space-2)',
        }}
      >
        <span className="t-mono-large" style={{ color: 'var(--text-primary)' }}>
          {value}
        </span>
        <span className="t-caption">{unit}</span>
      </div>
    </div>
  );
}

function ThumbnailWindRose() {
  return (
    <svg viewBox="0 0 120 120" width="100%" height="120" aria-hidden="true">
      <circle cx="60" cy="60" r="52" fill="none" stroke="var(--border-strong)" strokeWidth="1" />
      <circle cx="60" cy="60" r="34" fill="none" stroke="var(--border-subtle)" strokeWidth="1" />
      <circle cx="60" cy="60" r="16" fill="none" stroke="var(--border-subtle)" strokeWidth="1" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => {
        const r = (deg * Math.PI) / 180;
        const len = 28 + (i % 3) * 10;
        const x = 60 + Math.sin(r) * len;
        const y = 60 - Math.cos(r) * len;
        return (
          <line
            key={deg}
            x1={60}
            y1={60}
            x2={x}
            y2={y}
            stroke="var(--accent-cool)"
            strokeWidth="2"
            opacity={0.7}
          />
        );
      })}
    </svg>
  );
}

function ThumbnailContours() {
  return (
    <svg viewBox="0 0 200 120" width="100%" height="120" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <path
          key={i}
          d={`M 0 ${100 - i * 14} Q 50 ${80 - i * 12} 100 ${90 - i * 14} T 200 ${85 - i * 12}`}
          fill="none"
          stroke="var(--accent-cool)"
          strokeWidth="1"
          opacity={0.3 + i * 0.1}
        />
      ))}
    </svg>
  );
}

function ThumbnailPins() {
  return (
    <svg viewBox="0 0 200 120" width="100%" height="120" aria-hidden="true">
      <rect x="0" y="0" width="200" height="120" fill="var(--surface-0)" />
      <line x1="0" y1="60" x2="200" y2="60" stroke="var(--border-subtle)" strokeDasharray="2 4" />
      <line x1="100" y1="0" x2="100" y2="120" stroke="var(--border-subtle)" strokeDasharray="2 4" />
      {[
        { x: 40, y: 35, c: 'var(--accent-warm)' },
        { x: 110, y: 70, c: 'var(--accent-cool)' },
        { x: 160, y: 45, c: 'var(--accent-cool)' },
        { x: 75, y: 90, c: 'var(--confidence-medium)' },
      ].map((p) => (
        <circle key={`${p.x}-${p.y}`} cx={p.x} cy={p.y} r="4" fill={p.c} />
      ))}
    </svg>
  );
}
