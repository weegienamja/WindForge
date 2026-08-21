import Link from 'next/link';
import type { CSSProperties } from 'react';
import { Footer } from '../../components/Footer';

export default function ReanalysisPage() {
  return (
    <main
      style={{ minHeight: '100vh', background: 'var(--surface-0)', color: 'var(--text-primary)' }}
    >
      <article
        style={{ maxWidth: 820, margin: '0 auto', padding: 'var(--space-9) var(--space-5)' }}
      >
        <Link
          href="/"
          className="t-mono-data"
          style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}
        >
          ← WindForge
        </Link>
        <div className="t-eyebrow" style={{ marginTop: 'var(--space-7)' }}>
          Optional advanced workflow
        </div>
        <h1 className="t-h1" style={{ margin: 'var(--space-2) 0 var(--space-4)' }}>
          Reanalysis reconciliation
        </h1>
        <p className="t-body" style={{ color: 'var(--text-secondary)' }}>
          The public point analysis uses raw NASA POWER data. It does not silently run ERA5 or CERRA
          jobs, and no CDS credential is sent to the browser.
        </p>

        <section style={cardStyle}>
          <h2 className="t-h3" style={{ marginTop: 0 }}>
            What is available
          </h2>
          <p className="t-body" style={{ color: 'var(--text-secondary)' }}>
            Advanced server-side callers can explicitly retrieve ERA5 monthly history through the
            current Copernicus job API, inspect it, and supply it to WindForge's reconciliation
            pipeline. The result preserves raw and resolved wind resources plus overlap and
            before/after diagnostics.
          </p>
        </section>

        <section style={cardStyle}>
          <h2 className="t-h3" style={{ marginTop: 0 }}>
            Current limitation
          </h2>
          <p className="t-body" style={{ color: 'var(--text-secondary)' }}>
            Automated CERRA correction is disabled. The former sampling request did not produce a
            defensible monthly climatology. WindForge now returns an explicit disabled state instead
            of displaying a synthetic or placeholder live result.
          </p>
        </section>

        <p className="t-body" style={{ color: 'var(--text-secondary)' }}>
          Read the{' '}
          <a
            href="https://github.com/weegienamja/WindForge/blob/main/docs/BIAS-CORRECTION.md"
            style={{ color: 'var(--accent-cool)' }}
          >
            reconciliation methodology and acceptance limits
          </a>{' '}
          before using this optional path. Reanalysis-to-reanalysis agreement is not validation
          against site measurements.
        </p>

        <Link
          href="/analyse"
          style={{ color: 'var(--accent-cool)', fontFamily: 'var(--font-sans)' }}
        >
          Run the default public-data screen →
        </Link>
      </article>
      <Footer />
    </main>
  );
}

const cardStyle: CSSProperties = {
  margin: 'var(--space-5) 0',
  padding: 'var(--space-5)',
  background: 'var(--surface-1)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 4,
};
