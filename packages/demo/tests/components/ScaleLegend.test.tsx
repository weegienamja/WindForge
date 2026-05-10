import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScaleLegend } from '../../src/components/primitives/ScaleLegend';

describe('ScaleLegend', () => {
  it('renders min, midpoint and max labels', () => {
    render(
      <ScaleLegend
        min={0}
        max={20}
        unit="m/s"
        colors={['#000', '#fff']}
        label="Wind speed"
      />,
    );
    expect(screen.getByText('Wind speed')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
  });

  it('exposes an aria label', () => {
    render(<ScaleLegend min={0} max={5} unit="m/s" colors={['#000', '#fff']} />);
    expect(screen.getByRole('group')).toHaveAttribute('aria-label');
  });
});
