import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import HomePage from '../src/app/page';
import { expectNoAxeViolations } from './axe-helper';

const root = '../../engineering/';
const catalogue = JSON.parse(readFileSync(root + 'catalogue.json', 'utf8'));
const geometry = JSON.parse(
  readFileSync(root + 'geometry/' + catalogue.models[0].bladeAsset + '.json', 'utf8'),
);
afterEach(() => vi.unstubAllGlobals());
it('opens the working blade viewer at the home URL and exposes site tools', async () => {
  const requests = vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.method === 'POST' ? [] : url.includes('?blade=') ? geometry : catalogue;
    return Response.json(body);
  });
  vi.stubGlobal('fetch', requests);
  const { container } = render(<HomePage />);
  expect(await screen.findByLabelText('Reference section', { exact: true })).toHaveValue('2');
  expect(
    screen.getByRole('img', { name: geometry.stations[2].name + ' normalised airfoil section' }),
  ).toBeVisible();
  expect(screen.getByRole('button', { name: 'Source library' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Site analysis' })).toHaveAttribute('href', '/analyse');
  expect(screen.getByRole('link', { name: 'UK map' })).toHaveAttribute('href', '/map');
  await expectNoAxeViolations(container);
});
