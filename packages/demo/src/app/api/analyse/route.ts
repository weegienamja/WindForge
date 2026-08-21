import {
  analyseSite,
  calculateAep,
  fetchMonthlyWindHistory,
  getTurbineById,
  ScoringErrorCode,
} from '@jamieblair/windforge-core';
import type {
  AnalysisApiError,
  AnalysisApiRequest,
  AnalysisApiResponse,
} from '../../../lib/analysis-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BODY_BYTES = 2_048;
const ANALYSIS_TIMEOUT_MS = 45_000;
const ALLOWED_HUB_HEIGHTS = new Set([80, 100, 120, 140]);

function apiError(code: ScoringErrorCode, message: string, status: number): Response {
  const payload: AnalysisApiError = { error: { code, message } };
  return Response.json(payload, {
    status,
    headers: { 'cache-control': 'private, no-store, max-age=0' },
  });
}

function parseRequest(value: unknown): AnalysisApiRequest | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  if (!input.coordinate || typeof input.coordinate !== 'object') return null;
  const coordinate = input.coordinate as Record<string, unknown>;
  const { lat, lng } = coordinate;
  const { hubHeightM, turbineId } = input;
  if (
    typeof lat !== 'number' ||
    !Number.isFinite(lat) ||
    lat < -90 ||
    lat > 90 ||
    typeof lng !== 'number' ||
    !Number.isFinite(lng) ||
    lng < -180 ||
    lng > 180 ||
    typeof hubHeightM !== 'number' ||
    !ALLOWED_HUB_HEIGHTS.has(hubHeightM) ||
    typeof turbineId !== 'string' ||
    turbineId.length === 0 ||
    turbineId.length > 100
  )
    return null;
  return { coordinate: { lat, lng }, hubHeightM, turbineId };
}

export async function POST(request: Request): Promise<Response> {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return apiError(ScoringErrorCode.OutOfRange, 'Request body is too large.', 413);
  }
  let body: unknown;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return apiError(ScoringErrorCode.OutOfRange, 'Request body is too large.', 413);
    }
    body = JSON.parse(rawBody);
  } catch {
    return apiError(ScoringErrorCode.ParseError, 'Request body must be valid JSON.', 400);
  }
  const input = parseRequest(body);
  if (!input) {
    return apiError(
      ScoringErrorCode.InvalidCoordinate,
      'Invalid coordinate, hub height, or turbine model.',
      400,
    );
  }
  const turbine = getTurbineById(input.turbineId);
  if (!turbine) return apiError(ScoringErrorCode.OutOfRange, 'Unknown turbine model.', 400);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS);
  try {
    const [analysisResult, historyResult] = await Promise.all([
      analyseSite({
        coordinate: input.coordinate,
        hubHeightM: input.hubHeightM,
        signal: controller.signal,
      }),
      fetchMonthlyWindHistory(input.coordinate, 10, controller.signal),
    ]);
    if (!analysisResult.ok) {
      return apiError(analysisResult.error.code, analysisResult.error.message, 502);
    }

    const auxiliaryErrors: AnalysisApiResponse['auxiliaryErrors'] = {
      windHistory: historyResult.ok ? null : historyResult.error,
      energyYield: null,
    };
    let energyYield: AnalysisApiResponse['energyYield'] = null;
    const canonicalWind = analysisResult.value.windResource?.resolved;
    if (canonicalWind) {
      const aepResult = calculateAep(canonicalWind, turbine, {
        hubHeightM: input.hubHeightM,
        windShearAlpha: analysisResult.value.metadata.windShearAlpha,
      });
      if (aepResult.ok) energyYield = aepResult.value;
      else auxiliaryErrors.energyYield = aepResult.error;
    }

    const payload: AnalysisApiResponse = {
      analysis: analysisResult.value,
      windHistory: historyResult.ok ? { raw: historyResult.value, corrected: null } : null,
      energyYield,
      auxiliaryErrors,
    };
    return Response.json(payload, { headers: { 'cache-control': 'private, no-store, max-age=0' } });
  } catch {
    return apiError(
      controller.signal.aborted ? ScoringErrorCode.Timeout : ScoringErrorCode.Unknown,
      controller.signal.aborted
        ? 'Analysis did not complete within 45 seconds.'
        : 'Analysis failed unexpectedly.',
      controller.signal.aborted ? 504 : 500,
    );
  } finally {
    clearTimeout(timeout);
  }
}
