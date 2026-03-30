import type { ReactNode } from 'react';
import React, { useState, useCallback, useEffect } from 'react';
import type { LatLng, ScoringWeights, SiteAnalysis } from '@jamieblair/wind-site-intelligence-core';
import { DEFAULT_WEIGHTS } from '@jamieblair/wind-site-intelligence-core';
import { useSiteScore } from '../hooks/use-site-score.js';
import { useMapInteraction } from '../hooks/use-map-interaction.js';
import { ScoreCard } from './ScoreCard.js';
import { SiteMap } from './SiteMap.js';
import { WeightSliders } from './WeightSliders.js';
import type { WindSiteTheme } from '../styles/theme.js';
import { themeToCSS } from '../styles/theme.js';

interface WindSiteScorerProps {
  defaultCenter?: LatLng;
  defaultZoom?: number;
  weights?: Partial<ScoringWeights>;
  hubHeightM?: number;
  theme?: Partial<WindSiteTheme>;
  onAnalysisComplete?: (analysis: SiteAnalysis) => void;
  className?: string;
}

export function WindSiteScorer({
  defaultCenter = { lat: 55.86, lng: -4.25 },
  defaultZoom = 8,
  weights: initialWeights,
  hubHeightM,
  theme,
  onAnalysisComplete,
  className,
}: WindSiteScorerProps): ReactNode {
  const [currentWeights, setCurrentWeights] = useState<ScoringWeights>({
    ...DEFAULT_WEIGHTS,
    ...initialWeights,
  });
  const [inputLat, setInputLat] = useState(String(defaultCenter.lat));
  const [inputLng, setInputLng] = useState(String(defaultCenter.lng));
  const { analysis, loading, error, analyse } = useSiteScore();
  const { pin, setSelectedCoordinate, setLoading } = useMapInteraction();

  const runAnalysis = useCallback(
    async (coord: LatLng) => {
      setSelectedCoordinate(coord);
      setInputLat(String(coord.lat.toFixed(4)));
      setInputLng(String(coord.lng.toFixed(4)));

      await analyse({
        coordinate: coord,
        weights: currentWeights,
        hubHeightM,
      });
    },
    [currentWeights, hubHeightM, analyse, setSelectedCoordinate],
  );

  // Sync pin loading state with analysis loading
  useEffect(() => {
    if (!loading && pin) {
      setLoading(false);
    }
  }, [loading, pin, setLoading]);

  const handleMapClick = useCallback(
    (coord: LatLng) => {
      runAnalysis(coord);
    },
    [runAnalysis],
  );

  const handleFormAnalyse = useCallback(() => {
    const lat = Number.parseFloat(inputLat);
    const lng = Number.parseFloat(inputLng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;
    runAnalysis({ lat, lng });
  }, [inputLat, inputLng, runAnalysis]);

  // Notify parent on analysis completion
  useEffect(() => {
    if (analysis && onAnalysisComplete) {
      onAnalysisComplete(analysis);
    }
  }, [analysis, onAnalysisComplete]);

  const cssVars = themeToCSS(theme ?? {});

  return React.createElement(
    'div',
    {
      className,
      style: {
        ...cssVars,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '24px',
        color: 'var(--wsi-text, #0f172a)',
      } as React.CSSProperties,
      role: 'main',
      'aria-label': 'Wind Site Intelligence Scorer',
    },
    React.createElement('style', null, '@keyframes wsi-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }'),
    React.createElement(
      'h1',
      { style: { fontSize: '24px', marginBottom: '24px' } },
      'Wind Site Intelligence',
    ),
    // Map section
    React.createElement(SiteMap, {
      center: defaultCenter,
      zoom: defaultZoom,
      pin,
      onMapClick: handleMapClick,
      popupContent: analysis
        ? React.createElement(
            'div',
            { style: { minWidth: '200px' } },
            React.createElement(
              'strong',
              null,
              `Score: ${analysis.compositeScore}/100`,
            ),
            React.createElement(
              'p',
              { style: { margin: '4px 0 0', fontSize: '12px' } },
              `${analysis.coordinate.lat.toFixed(4)}, ${analysis.coordinate.lng.toFixed(4)}`,
            ),
          )
        : undefined,
      style: { height: '400px', marginBottom: '24px' },
    }),
    // Coordinate inputs
    React.createElement(
      'div',
      {
        style: {
          display: 'grid',
          gridTemplateColumns: '1fr 1fr auto',
          gap: '16px',
          marginBottom: '24px',
          alignItems: 'end',
        },
      },
      React.createElement(
        'div',
        null,
        React.createElement(
          'label',
          { htmlFor: 'wsi-lat', style: { display: 'block', fontSize: '14px', marginBottom: '4px' } },
          'Latitude',
        ),
        React.createElement('input', {
          id: 'wsi-lat',
          type: 'number',
          step: '0.0001',
          min: -90,
          max: 90,
          value: inputLat,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => setInputLat(e.target.value),
          style: {
            width: '100%',
            padding: '8px 12px',
            border: '1px solid var(--wsi-border, #e2e8f0)',
            borderRadius: '6px',
            fontSize: '14px',
            boxSizing: 'border-box' as const,
          },
          'aria-label': 'Site latitude',
        }),
      ),
      React.createElement(
        'div',
        null,
        React.createElement(
          'label',
          { htmlFor: 'wsi-lng', style: { display: 'block', fontSize: '14px', marginBottom: '4px' } },
          'Longitude',
        ),
        React.createElement('input', {
          id: 'wsi-lng',
          type: 'number',
          step: '0.0001',
          min: -180,
          max: 180,
          value: inputLng,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => setInputLng(e.target.value),
          style: {
            width: '100%',
            padding: '8px 12px',
            border: '1px solid var(--wsi-border, #e2e8f0)',
            borderRadius: '6px',
            fontSize: '14px',
            boxSizing: 'border-box' as const,
          },
          'aria-label': 'Site longitude',
        }),
      ),
      React.createElement(
        'button',
        {
          onClick: handleFormAnalyse,
          disabled: loading,
          style: {
            padding: '8px 24px',
            backgroundColor: loading ? 'var(--wsi-text-secondary, #64748b)' : 'var(--wsi-accent, #22c55e)',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: loading ? 'wait' : 'pointer',
            height: '38px',
          },
          'aria-label': loading ? 'Analysing site...' : 'Analyse site suitability',
        },
        loading ? 'Analysing...' : 'Analyse Site',
      ),
    ),
    error &&
      React.createElement(
        'div',
        {
          role: 'alert',
          style: {
            padding: '12px',
            marginBottom: '16px',
            borderRadius: '6px',
            backgroundColor: 'var(--wsi-error, #ef4444)',
            color: '#fff',
            fontSize: '14px',
          },
        },
        `Error: ${error.message}`,
      ),
    // Results grid
    React.createElement(
      'div',
      {
        style: {
          display: 'grid',
          gridTemplateColumns: '1fr 300px',
          gap: '24px',
          alignItems: 'start',
        },
      },
      analysis
        ? React.createElement(ScoreCard, { analysis })
        : React.createElement(
            'div',
            {
              style: {
                padding: '48px 24px',
                textAlign: 'center' as const,
                color: 'var(--wsi-text-secondary, #64748b)',
                border: '2px dashed var(--wsi-border, #e2e8f0)',
                borderRadius: '8px',
              },
            },
            loading
              ? 'Fetching data and calculating scores...'
              : 'Click the map or enter coordinates to analyse a site.',
          ),
      React.createElement(WeightSliders, {
        weights: currentWeights,
        onChange: setCurrentWeights,
      }),
    ),
  );
}
