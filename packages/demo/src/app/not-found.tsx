import Link from 'next/link';

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--surface-0)',
        color: 'var(--text-primary)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 'var(--space-7) var(--space-5)',
      }}
    >
      <div style={{ maxWidth: 640, width: '100%' }}>
        <div className="t-eyebrow" style={{ color: 'var(--text-tertiary)' }}>
          404
        </div>
        <h1
          className="t-display"
          style={{
            margin: 'var(--space-3) 0 var(--space-4)',
            fontSize: 'clamp(36px, 6vw, 64px)',
            lineHeight: 1.05,
          }}
        >
          No wind data at this URL.
        </h1>
        <p
          className="t-body"
          style={{
            color: 'var(--text-secondary)',
            margin: 0,
            fontSize: 15,
            maxWidth: 520,
          }}
        >
          The page you requested does not exist in this domain.
        </p>
        <p
          className="t-mono-data"
          style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: 'var(--space-4)' }}
        >
          status: 404 · not_found
        </p>
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-3)',
            flexWrap: 'wrap',
            marginTop: 'var(--space-6)',
          }}
        >
          <Link
            href="/"
            style={{
              padding: '12px 22px',
              background: 'var(--accent-cool)',
              color: '#0a0e1a',
              fontFamily: 'var(--font-sans)',
              fontWeight: 500,
              fontSize: 14,
              textDecoration: 'none',
              borderRadius: 4,
            }}
          >
            Return to landing
          </Link>
          <Link
            href="/analyse"
            style={{
              padding: '12px 22px',
              background: 'transparent',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-sans)',
              fontWeight: 500,
              fontSize: 14,
              textDecoration: 'none',
              border: '1px solid var(--border-strong)',
              borderRadius: 4,
            }}
          >
            Run an analysis
          </Link>
        </div>
      </div>
    </main>
  );
}
