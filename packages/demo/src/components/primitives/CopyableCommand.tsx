'use client';

import { useState } from 'react';

export interface CopyableCommandProps {
  command: string;
  className?: string;
}

/**
 * Mono command block with a copy-to-clipboard button. Used by the
 * MCP cross-link strip on the landing and analyse pages.
 */
export function CopyableCommand({ command, className }: CopyableCommandProps) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      data-testid="copyable-command"
      className={className}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        background: 'var(--surface-0)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 4,
        overflow: 'hidden',
      }}
    >
      <code
        style={{
          flex: 1,
          padding: '14px 18px',
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          color: 'var(--text-primary)',
          whiteSpace: 'nowrap',
          overflowX: 'auto',
        }}
      >
        $ {command}
      </code>
      <button
        type="button"
        onClick={onCopy}
        aria-label="Copy command to clipboard"
        style={{
          padding: '0 18px',
          background: 'var(--surface-elevated)',
          border: 'none',
          borderLeft: '1px solid var(--border-subtle)',
          color: copied ? 'var(--accent-cool)' : 'var(--text-secondary)',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          cursor: 'pointer',
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
