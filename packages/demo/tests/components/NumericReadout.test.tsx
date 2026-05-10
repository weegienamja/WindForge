import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NumericReadout } from '../../src/components/primitives/NumericReadout';

describe('NumericReadout', () => {
  it('formats a number to the requested precision', () => {
    render(<NumericReadout value={7.2345} precision={2} unit="m/s" />);
    expect(screen.getByText('7.23')).toBeInTheDocument();
    expect(screen.getByTestId('readout-unit')).toHaveTextContent('m/s');
  });

  it('passes string values through unchanged', () => {
    render(<NumericReadout value="ISO 9613-2" />);
    expect(screen.getByText('ISO 9613-2')).toBeInTheDocument();
  });

  it('renders a confidence badge when provided', () => {
    render(<NumericReadout value={42} confidence="high" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'High confidence');
  });

  it('renders a trend glyph', () => {
    render(<NumericReadout value={42} trend="up" />);
    expect(screen.getByLabelText('trend up')).toBeInTheDocument();
  });
});
