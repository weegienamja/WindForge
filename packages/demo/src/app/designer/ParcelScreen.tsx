'use client';
import { useEffect, useRef, useState } from 'react';
import { validScreen, type ParcelEvidence, type Project } from '../../lib/designer/project';
export default function ParcelScreen({
  project,
  onResult,
}: {
  project: Project;
  onResult: (screen: ParcelEvidence) => void;
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function check() {
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError('');
    try {
      const parcel = [...project.boundary, project.boundary[0]!].map((p) => [p.lng, p.lat]);
      const params = new URLSearchParams({
        site: JSON.stringify(project.site),
        parcel: JSON.stringify(parcel),
      });
      const response = await fetch('/api/designer/constraints?' + params, {
        signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok || !validScreen(body))
        throw new Error(body.error || 'Parcel evidence unavailable.');
      if (!controller.signal.aborted) onResult(body);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : 'Parcel evidence unavailable.');
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }
  const screen = project.screen;
  return (
    <section className="farm-parcel" aria-label="Siting evidence">
      <div>
        <h3>Siting evidence</h3>
        {project.evidence?.blockers?.map((msg, i) => (
          <p key={i} className="farm-blocker">
            {msg}
          </p>
        ))}
        <p>
          {screen
            ? 'OpenStreetMap · ' +
              screen.at.slice(0, 10) +
              ' · ' +
              screen.zones.length +
              ' mapped exclusion areas. ' +
              screen.summary
            : 'Layouts are hypothetical. Parcel exclusions have yet to be checked.'}
        </p>
        <p role="status">
          {error || (pending ? 'Checking the drawn parcel against OpenStreetMap…' : '')}
        </p>
      </div>
      <button type="button" disabled={pending} onClick={check}>
        {screen ? 'Refresh parcel check' : 'Check parcel constraints'}
      </button>
    </section>
  );
}
