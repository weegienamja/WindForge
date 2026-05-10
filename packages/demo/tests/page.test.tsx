import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import LandingPage from '../src/app/page';

// Stub matchMedia for the ParticleField branch.
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

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }));

describe('Landing page', () => {
  it('renders the hero copy and primary CTAs', () => {
    render(<LandingPage />);
    expect(
      screen.getByRole('heading', { level: 1, name: /Wind site suitability, computed\./ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Run an analysis/ })).toHaveAttribute('href', '/analyse');
    expect(screen.getByRole('link', { name: /View on GitHub/ })).toBeInTheDocument();
  });

  it('renders all four stat strip eyebrows', () => {
    render(<LandingPage />);
    expect(screen.getByText('Tests passing')).toBeInTheDocument();
    expect(screen.getByText('Scoring factors')).toBeInTheDocument();
    expect(screen.getByText('ERA5 · CERRA')).toBeInTheDocument();
    expect(screen.getByText('Noise model')).toBeInTheDocument();
    expect(screen.getByText('ISO 9613-2')).toBeInTheDocument();
  });

  it('renders the three measurement cards', () => {
    render(<LandingPage />);
    expect(screen.getByText('WIND')).toBeInTheDocument();
    expect(screen.getByText('TERRAIN')).toBeInTheDocument();
    expect(screen.getByText('CONSTRAINTS')).toBeInTheDocument();
  });

  it('shows the MCP install command', () => {
    render(<LandingPage />);
    expect(screen.getByText(/npx -y @jamieblair\/windforge-mcp/)).toBeInTheDocument();
  });
});
