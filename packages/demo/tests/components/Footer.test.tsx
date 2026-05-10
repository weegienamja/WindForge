import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Footer } from '../../src/components/Footer';

describe('Footer', () => {
  it('renders the three column headings', () => {
    render(<Footer />);
    expect(screen.getByText('Project')).toBeInTheDocument();
    expect(screen.getByText('Data sources')).toBeInTheDocument();
    expect(screen.getByText('About')).toBeInTheDocument();
  });

  it('exposes the GitHub, npm, and MCP links', () => {
    render(<Footer />);
    const githubLink = screen
      .getAllByText(/GitHub/)
      .find((el) => el.tagName === 'A') as HTMLAnchorElement;
    expect(githubLink.href).toContain('github.com');

    const coreLink = screen.getByText(/windforge-core/i).closest('a') as HTMLAnchorElement;
    expect(coreLink.href).toContain('npmjs.com');

    const mcpLink = screen.getByText(/windforge-mcp/i).closest('a') as HTMLAnchorElement;
    expect(mcpLink.href).toContain('npmjs.com');
  });

  it('shows the package version pulled from package.json', () => {
    render(<Footer />);
    const version = screen.getByTestId('footer-version');
    expect(version.textContent).toMatch(/^v\d+\.\d+\.\d+$/);
  });
});
