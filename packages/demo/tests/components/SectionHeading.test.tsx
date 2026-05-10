import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SectionHeading } from '../../src/components/primitives/SectionHeading';

describe('SectionHeading', () => {
  it('renders eyebrow and heading children', () => {
    render(<SectionHeading eyebrow="ABOUT">Body title</SectionHeading>);
    expect(screen.getByText('ABOUT')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Body title' })).toBeInTheDocument();
  });

  it('honours the centre alignment variant', () => {
    const { container } = render(
      <SectionHeading eyebrow="X" align="center">
        Centred
      </SectionHeading>,
    );
    const header = container.querySelector('header') as HTMLElement;
    expect(header.style.textAlign).toBe('center');
  });
});
