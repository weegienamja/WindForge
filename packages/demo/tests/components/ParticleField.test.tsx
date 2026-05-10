import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { ParticleField } from '../../src/components/primitives/ParticleField';

const VECTORS = [
  { lat: 0, lng: 0, u: 1, v: 0 },
  { lat: 5, lng: 0, u: 1, v: 0 },
];

describe('ParticleField', () => {
  beforeEach(() => {
    // Mock fetch: the field is provided directly so this should not be hit,
    // but provide a stub regardless.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }));
  });

  it('renders a labelled canvas element', () => {
    const { container } = render(<ParticleField vectors={VECTORS} ariaLabel="test field" />);
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas).toHaveAttribute('aria-label', 'test field');
    expect(canvas).toHaveAttribute('role', 'img');
  });

  it('renders a static frame and skips rAF when prefers-reduced-motion is set', () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame');
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });

    render(<ParticleField vectors={VECTORS} />);
    // step() is called twice in the reduce-motion branch but no rAF loop.
    expect(rafSpy).not.toHaveBeenCalled();
    rafSpy.mockRestore();
  });

  it('cancels animation frames on unmount', () => {
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
    const { unmount } = render(<ParticleField vectors={VECTORS} />);
    unmount();
    expect(cancelSpy).toHaveBeenCalled();
    cancelSpy.mockRestore();
  });
});
