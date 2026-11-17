import type { Metadata } from 'next';
import { SiteHeader } from '../../components/SiteHeader';
import Designer from './Designer';
import './designer.css';

export const metadata: Metadata = {
  title: 'Wind farm designer · WindForge',
  description:
    'Draw a parcel, place turbines and compare wind farm layouts using site evidence, directional wakes and project finance.',
  alternates: { canonical: '/designer' },
};
export default function Page() {
  return (
    <>
      <SiteHeader active="/designer" />
      <main className="farm-shell">
        <div className="farm-intro">
          <h1>
            Wind farm <em>designer</em>
          </h1>
          <p>
            Place turbines on a shared parcel. Compare what each layout produces, costs and means
            for the people nearby.
          </p>
        </div>
        <Designer />
      </main>
    </>
  );
}
