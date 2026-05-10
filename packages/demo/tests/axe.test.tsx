import { describe, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { expectNoAxeViolations } from './axe-helper';
import { DataCard } from '../src/components/primitives/DataCard';
import { NumericReadout } from '../src/components/primitives/NumericReadout';
import { ScaleLegend } from '../src/components/primitives/ScaleLegend';
import { SectionHeading } from '../src/components/primitives/SectionHeading';
import { ConfidenceBadge } from '../src/components/primitives/ConfidenceBadge';
import { NumberTicker } from '../src/components/primitives/NumberTicker';
import { ParticleField } from '../src/components/primitives/ParticleField';
import LandingPage from '../src/app/page';

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }));

describe('axe-core sweeps', () => {
  it('DataCard has no violations', async () => {
    const { container } = render(
      <DataCard eyebrow="WIND" title="Resource">
        <p>body</p>
      </DataCard>,
    );
    await expectNoAxeViolations(container);
  });

  it('NumericReadout has no violations', async () => {
    const { container } = render(
      <NumericReadout value={7.4} unit="m/s" confidence="high" trend="up" />,
    );
    await expectNoAxeViolations(container);
  });

  it('ScaleLegend has no violations', async () => {
    const { container } = render(
      <ScaleLegend
        min={0}
        max={12}
        unit="m/s"
        colors={['#1a2238', '#6ba9ff']}
        label="Wind speed"
      />,
    );
    await expectNoAxeViolations(container);
  });

  it('SectionHeading has no violations', async () => {
    const { container } = render(
      <SectionHeading eyebrow="Section">A heading</SectionHeading>,
    );
    await expectNoAxeViolations(container);
  });

  it('ConfidenceBadge has no violations', async () => {
    const { container } = render(<ConfidenceBadge confidence="medium" />);
    await expectNoAxeViolations(container);
  });

  it('NumberTicker has no violations', async () => {
    const { container } = render(<NumberTicker value={853} />);
    await expectNoAxeViolations(container);
  });

  it('ParticleField has no violations', async () => {
    const { container } = render(
      <ParticleField vectors={[{ lat: 0, lng: 0, u: 1, v: 0 }]} ariaLabel="wind field" />,
    );
    await expectNoAxeViolations(container);
  });

  it('Landing page has no violations', async () => {
    const { container } = render(<LandingPage />);
    await expectNoAxeViolations(container);
  });
});
