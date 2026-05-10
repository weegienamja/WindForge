import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { NumberTicker } from '../../src/components/primitives/NumberTicker';

describe('NumberTicker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the target value (the IO stub fires immediately)', () => {
    render(<NumberTicker value={853} duration={500} precision={0} />);
    // Drive the rAF loop to completion.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByLabelText('853')).toBeInTheDocument();
  });

  it('formats with the requested precision', () => {
    render(<NumberTicker value={12.5} duration={100} precision={1} />);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    const node = screen.getByLabelText('12.5');
    expect(node.textContent).toContain('12.5');
  });
});
