import type { Metadata } from 'next';
import Workspace from './workspace';
export const metadata: Metadata = {
  title: 'Engineering workspace · WindForge',
  description:
    'Investigate reference turbines, compare site configurations and inspect the evidence.',
};
export default function Page() {
  return <Workspace />;
}
