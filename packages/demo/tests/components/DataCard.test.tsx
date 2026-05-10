import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataCard } from '../../src/components/primitives/DataCard';

describe('DataCard', () => {
  it('renders children', () => {
    render(
      <DataCard eyebrow="WIND" title="Resource">
        <p>body copy</p>
      </DataCard>,
    );
    expect(screen.getByText('WIND')).toBeInTheDocument();
    expect(screen.getByText('Resource')).toBeInTheDocument();
    expect(screen.getByText('body copy')).toBeInTheDocument();
  });

  it('shows the unit suffix when provided', () => {
    render(<DataCard title="Mean speed" unit="m/s" />);
    expect(screen.getByText('m/s')).toBeInTheDocument();
  });

  it('marks itself interactive when requested', () => {
    const { container } = render(<DataCard title="Hover me" interactive />);
    expect(container.firstElementChild).toHaveAttribute('data-interactive', 'true');
  });

  it('renders without an eyebrow or title', () => {
    render(<DataCard>{<span>raw</span>}</DataCard>);
    expect(screen.getByText('raw')).toBeInTheDocument();
  });
});
