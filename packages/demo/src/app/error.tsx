'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[windforge] analysis pipeline error', error);
  }, [error]);

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
        <div className="t-eyebrow" style={{ color: 'var(--accent-warm)' }}>
          Error
        </div>
        <h1
          className="t-display"
          style={{
            margin: 'var(--space-3) 0 var(--space-4)',
            fontSize: 'clamp(32px, 5vw, 56px)',
            lineHeight: 1.05,
          }}
        >
          Analysis pipeline error.
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
          An unexpected error occurred. The error has been logged.
        </p>
        {error.digest ? (
          <p
            className="t-mono-data"
            style={{
              color: 'var(--text-tertiary)',
              fontSize: 11,
              marginTop: 'var(--space-4)',
            }}
          >
            digest: {error.digest}
          </p>
        ) : null}
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-3)',
            flexWrap: 'wrap',
            marginTop: 'var(--space-6)',
          }}
        >
          <button
            type="button"
            onClick={reset}
            style={{
              padding: '12px 22px',
              background: 'var(--accent-cool)',
              color: '#0a0e1a',
              fontFamily: 'var(--font-sans)',
              fontWeight: 500,
              fontSize: 14,
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
          <Link
            href="/"
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
            Return to landing
          </Link>
        </div>
      </div>
    </main>
  );
}
