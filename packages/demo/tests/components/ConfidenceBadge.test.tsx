import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfidenceBadge } from '../../src/components/primitives/ConfidenceBadge';

describe('ConfidenceBadge', () => {
  it.each(['high', 'medium', 'low'] as const)('renders the %s level', (level) => {
    render(<ConfidenceBadge confidence={level} />);
    const badge = screen.getByRole('status');
    expect(badge).toHaveAttribute('aria-label', `${level[0].toUpperCase()}${level.slice(1)} confidence`);
    expect(badge).toHaveTextContent(level);
  });
});
