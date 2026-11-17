'use client';
import { useEffect, useState, useRef } from 'react';
import type { LatLng } from '@jamieblair/windforge-core';
import {
  createProject,
  DRAFT_PREFIX,
  evidenceFrom,
  EXAMPLE,
  readProject,
  RECENT,
  rounded,
  samePoint,
  siteKey,
  validEvidence,
  validSite,
  type Project,
} from '../../lib/designer/project';
import type { LayoutResult } from '../../lib/designer/evaluate';

export function useProject() {
  const lastSaved = useRef<string | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [savedSites, setSavedSites] = useState<string[]>([]);
  const [storage, setStorage] = useState('');
  const [protect, setProtect] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [evidenceStatus, setEvidenceStatus] = useState('');
  const [fetching, setFetching] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    let site = EXAMPLE,
      data: Project | null = null;
    try {
      const previous = localStorage.getItem(RECENT)?.split(',');
      const raw =
        params.has('lat') || params.has('lng') ? [params.get('lat'), params.get('lng')] : previous;
      if (raw) {
        const candidate = { lat: Number(raw[0]), lng: Number(raw[1]) };
        if (raw.length === 2 && raw.every((v) => v?.trim()) && validSite(candidate))
          site = rounded(candidate);
      }
      const key = siteKey(site);
      setSavedSites(
        Object.keys(localStorage)
          .filter((k) => k.startsWith(DRAFT_PREFIX))
          .map((k) => k.slice(DRAFT_PREFIX.length)),
      );
      const text = localStorage.getItem(DRAFT_PREFIX + key);
      lastSaved.current = text;
      if (text) data = readProject(text, site);
    } catch {
      setProtect(true);
      setStorage('Local storage could not be read. This session is temporary.');
    }
    const initial = data ?? createProject(site);
    try {
      const handoff = JSON.parse(sessionStorage.getItem('wf-handoff') ?? 'null');
      if (handoff?.site && samePoint(site, handoff.site.coordinate)) {
        const incoming = evidenceFrom(handoff.site);
        if (
          validEvidence(incoming, site) &&
          (!initial.evidence || Date.parse(incoming.at) > Date.parse(initial.evidence.at))
        )
          initial.evidence = incoming;
      }
    } catch {
      /* Site analysis also works without a session handoff. */
    }
    setProject(initial);
  }, []);
  useEffect(() => {
    if (!project || protect) return;
    try {
      const key = siteKey(project.site);
      if (localStorage.getItem(DRAFT_PREFIX + key) !== lastSaved.current) {
        setProtect(true);
        setStorage('Another tab saved this site. Edits here are temporary.');
        return;
      }
      const serialized = JSON.stringify(project);
      localStorage.setItem(DRAFT_PREFIX + key, serialized);
      lastSaved.current = serialized;
      localStorage.setItem(RECENT, key);
      setStorage('Saved in this browser');
    } catch {
      setStorage('Browser storage is unavailable. Edits are temporary.');
    }
  }, [project, protect]);
  const coord = project ? siteKey(project.site) : null;
  const initialNeedsEvidence = useRef(false);
  useEffect(() => {
    initialNeedsEvidence.current = !!project && !project.evidence;
  }, [project]);
  useEffect(() => {
    if (!coord || (!initialNeedsEvidence.current && refresh === 0)) return;
    const [lat, lng] = coord.split(',').map(Number) as [number, number];
    const coordinate: LatLng = { lat, lng };
    const controller = new AbortController();
    setFetching(true);
    setEvidenceStatus('');
    (async () => {
      try {
        const response = await fetch('/api/analyse', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ coordinate, hubHeightM: 100, turbineId: 'vestas-v90-2000' }),
          signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message || 'Site analysis failed.');
        const next = evidenceFrom(body.analysis);
        if (!validEvidence(next, coordinate))
          throw new Error('Site analysis returned incomplete or mismatched data.');
        if (!controller.signal.aborted)
          setProject((p) => (p && samePoint(p.site, coordinate) ? { ...p, evidence: next } : p));
      } catch (error) {
        if (!controller.signal.aborted)
          setEvidenceStatus(error instanceof Error ? error.message : 'Site analysis failed.');
      } finally {
        if (!controller.signal.aborted) setFetching(false);
      }
    })();
    return () => controller.abort();
  }, [coord, refresh]);
  return {
    project,
    setProject,
    savedSites,
    storage,
    refreshEvidence: () => setRefresh((n) => n + 1),
    fetching,
    evidenceStatus,
  };
}

export function useResults(project: Project | null) {
  const [answer, setAnswer] = useState<{
    input: Project;
    results: LayoutResult[] | null;
    error: string;
  } | null>(null);
  useEffect(() => {
    if (!project) return;
    let worker: Worker | undefined;
    const fail = () =>
      setAnswer({
        input: project,
        results: null,
        error: 'Calculation failed. Reload the designer to retry.',
      });
    try {
      worker = new Worker(new URL('./calculate.worker.ts', import.meta.url));
      worker.onmessage = ({ data }: MessageEvent<LayoutResult[]>) =>
        setAnswer({ input: project, results: data, error: '' });
      worker.onerror = fail;
      worker.postMessage(project);
    } catch {
      fail();
    }
    return () => worker?.terminate();
  }, [project]);
  const current = answer?.input === project ? answer : null;
  return { results: current?.results ?? null, busy: !current, error: current?.error ?? '' };
}
