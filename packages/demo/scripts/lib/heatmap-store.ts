/**
 * WindForge datapoint database (built-in `node:sqlite`, no native build).
 *
 * Normalised so each upstream API has its own table reflecting what it returns,
 * plus a denormalised `site_assessment` table — the data the app/page consumes.
 * Open the .db in DBeaver to browse.
 *
 *   cells            grid registry (coordinate, offshore, land class, status)
 *   wind_resource    NASA POWER summary (mean speed, variability, Weibull…)
 *   terrain          Open-Elevation (elevation, slope, aspect, roughness)
 *   grid_access      OSM Overpass (nearest line/substation/road)
 *   geocode          Nominatim (country, region, display name)
 *   reanalysis       ERA5/CERRA bias-correction diagnostics
 *   energy_yield     calculateAep (capacity factor, AEP, P50/75/90, losses)
 *   economics        calculateLcoe/Irr/Payback (LCOE, IRR, payback, subsidy-free)
 *   factor_scores    six-factor scores (one row per factor)
 *   constraints      hard constraints + warnings (one row each)
 *   site_assessment  ← the required, query-ready summary per cell
 *   runs / meta      worker run log + schema metadata
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { HeatmapCell } from '../../src/lib/heatmap';

export const SCHEMA_VERSION = 1;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS cells (
  id TEXT PRIMARY KEY, lat REAL NOT NULL, lng REAL NOT NULL,
  offshore INTEGER, land_class TEXT, status TEXT,
  first_seen TEXT, last_updated TEXT
);
CREATE INDEX IF NOT EXISTS idx_cells_latlng ON cells (lat, lng);

CREATE TABLE IF NOT EXISTS wind_resource (
  cell_id TEXT PRIMARY KEY REFERENCES cells(id) ON DELETE CASCADE,
  annual_avg_speed_ms REAL, speed_stddev_ms REAL, prevailing_dir_deg REAL,
  directional_consistency REAL, data_years REAL, reference_height_m REAL,
  weibull_k REAL, weibull_c REAL
);

CREATE TABLE IF NOT EXISTS terrain (
  cell_id TEXT PRIMARY KEY REFERENCES cells(id) ON DELETE CASCADE,
  elevation_m REAL, slope_percent REAL, aspect_deg REAL, roughness_class REAL
);

CREATE TABLE IF NOT EXISTS grid_access (
  cell_id TEXT PRIMARY KEY REFERENCES cells(id) ON DELETE CASCADE,
  nearest_line_km REAL, nearest_substation_km REAL, line_count INTEGER, substation_count INTEGER,
  nearest_road_km REAL, road_type TEXT, road_category TEXT
);

CREATE TABLE IF NOT EXISTS geocode (
  cell_id TEXT PRIMARY KEY REFERENCES cells(id) ON DELETE CASCADE,
  country_code TEXT, country TEXT, region TEXT, display_name TEXT
);

CREATE TABLE IF NOT EXISTS reanalysis (
  cell_id TEXT PRIMARY KEY REFERENCES cells(id) ON DELETE CASCADE,
  method TEXT, reference TEXT, bias_before_ms REAL, bias_after_ms REAL,
  rmse_before_ms REAL, rmse_after_ms REAL, r_squared REAL, ks_statistic REAL, confidence TEXT
);

CREATE TABLE IF NOT EXISTS energy_yield (
  cell_id TEXT PRIMARY KEY REFERENCES cells(id) ON DELETE CASCADE,
  turbine_id TEXT, hub_height_m REAL, gross_capacity_factor REAL, net_capacity_factor REAL,
  gross_aep_mwh REAL, net_aep_mwh REAL, p50_mwh REAL, p75_mwh REAL, p90_mwh REAL,
  total_loss_pct REAL, wake_loss_pct REAL
);

CREATE TABLE IF NOT EXISTS economics (
  cell_id TEXT PRIMARY KEY REFERENCES cells(id) ON DELETE CASCADE,
  lcoe_per_mwh REAL, irr_pct REAL, simple_payback_years REAL, capex_gbp REAL,
  energy_price_per_mwh REAL, subsidy_free INTEGER
);

CREATE TABLE IF NOT EXISTS factor_scores (
  cell_id TEXT REFERENCES cells(id) ON DELETE CASCADE,
  factor TEXT, score REAL, weight REAL, confidence TEXT, detail TEXT,
  PRIMARY KEY (cell_id, factor)
);

CREATE TABLE IF NOT EXISTS constraints (
  cell_id TEXT REFERENCES cells(id) ON DELETE CASCADE,
  seq INTEGER, kind TEXT, factor TEXT, severity TEXT, description TEXT,
  PRIMARY KEY (cell_id, seq)
);

CREATE TABLE IF NOT EXISTS site_assessment (
  cell_id TEXT PRIMARY KEY REFERENCES cells(id) ON DELETE CASCADE,
  lat REAL, lng REAL, offshore INTEGER, land_class TEXT,
  composite_score INTEGER, overall_confidence TEXT, hard_constraint_count INTEGER,
  wind_score INTEGER, terrain_score INTEGER, grid_score INTEGER,
  landuse_score INTEGER, planning_score INTEGER, access_score INTEGER,
  wind_speed_ms REAL, capacity_factor REAL, lcoe_per_mwh INTEGER, subsidy_free INTEGER,
  error TEXT, analysed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sa_score ON site_assessment (composite_score);
CREATE INDEX IF NOT EXISTS idx_sa_lcoe ON site_assessment (lcoe_per_mwh);
CREATE INDEX IF NOT EXISTS idx_sa_subsidy ON site_assessment (subsidy_free);

CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT, bbox TEXT, spacing_km REAL, acres REAL, hub_m REAL, total_planned INTEGER, notes TEXT
);

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
`;

export interface CellRecord {
  id: string;
  lat: number;
  lng: number;
  offshore: boolean;
  landClass?: string | null;
  error?: string | null;
  wind?: {
    annualAvgSpeedMs: number;
    speedStdDevMs: number;
    prevailingDirectionDeg: number;
    directionalConsistency: number;
    dataYears: number;
    referenceHeightM?: number | null;
    weibullK?: number | null;
    weibullC?: number | null;
  } | null;
  terrain?: { elevationM: number; slopePercent: number; aspectDeg: number; roughnessClass: number } | null;
  grid?: {
    nearestLineDistanceKm: number;
    nearestSubstationDistanceKm: number;
    lineCount: number;
    substationCount: number;
  } | null;
  road?: { nearestMajorRoadDistanceKm: number; nearestMajorRoadType: string; bestRoadCategory: string } | null;
  geocode?: { countryCode: string; country: string; region: string; displayName: string } | null;
  reanalysis?: {
    method: string;
    reference: string | null;
    biasBeforeMs: number;
    biasAfterMs: number;
    rmseBeforeMs: number;
    rmseAfterMs: number;
    rSquared: number;
    ksStatistic: number;
    confidence: string;
  } | null;
  energy?: {
    turbineId: string;
    hubHeightM: number;
    grossCapacityFactor: number;
    netCapacityFactor: number;
    grossAepMwh: number;
    netAepMwh: number;
    p50Mwh: number;
    p75Mwh: number;
    p90Mwh: number;
    totalLossPct: number;
    wakeLossPct: number;
  } | null;
  economics?: {
    lcoePerMwh: number;
    irrPct: number | null;
    simplePaybackYears: number | null;
    capexGbp: number;
    energyPricePerMwh: number;
    subsidyFree: boolean;
  } | null;
  factors?: Array<{ factor: string; score: number; weight: number; confidence: string; detail: string }>;
  constraints?: Array<{ kind: 'hard' | 'warning'; factor: string | null; severity: string | null; description: string }>;
  // site_assessment summary fields
  compositeScore?: number | null;
  overallConfidence?: string | null;
  hardConstraintCount?: number | null;
  windScore?: number | null;
  terrainScore?: number | null;
  gridScore?: number | null;
  landuseScore?: number | null;
  planningScore?: number | null;
  accessScore?: number | null;
  windSpeedMs?: number | null;
  capacityFactor?: number | null;
  lcoePerMwh?: number | null;
  subsidyFree?: boolean | null;
}

const bit = (v: boolean | null | undefined) => (v ? 1 : 0);
const orNull = (v: number | string | null | undefined) => (v === undefined ? null : v);

export class WindForgeDB {
  private db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    // Rollback-journal mode (not WAL): every commit lands directly in the .db
    // file, so the single file is always self-contained for DBeaver / copying.
    // busy_timeout lets DBeaver read while the worker writes.
    this.db.exec('PRAGMA journal_mode = DELETE; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 8000; PRAGMA foreign_keys = ON;');
    this.db.exec(SCHEMA);
    this.db.prepare('INSERT OR REPLACE INTO meta(key,value) VALUES (?,?)').run('schema_version', String(SCHEMA_VERSION));
  }

  has(id: string): boolean {
    return this.db.prepare('SELECT 1 FROM site_assessment WHERE cell_id = ?').get(id) !== undefined;
  }

  count(): number {
    return Number((this.db.prepare('SELECT COUNT(*) AS c FROM site_assessment').get() as { c: number }).c);
  }

  countWithLcoe(): number {
    return Number(
      (this.db.prepare('SELECT COUNT(*) AS c FROM site_assessment WHERE lcoe_per_mwh IS NOT NULL').get() as { c: number }).c,
    );
  }

  startRun(info: { bbox: string; spacingKm: number; acres: number; hubM: number; totalPlanned: number; notes?: string }): void {
    this.db
      .prepare('INSERT INTO runs (started_at, bbox, spacing_km, acres, hub_m, total_planned, notes) VALUES (?,?,?,?,?,?,?)')
      .run(new Date().toISOString(), info.bbox, info.spacingKm, info.acres, info.hubM, info.totalPlanned, info.notes ?? '');
  }

  upsertCell(r: CellRecord): void {
    const now = new Date().toISOString();
    this.db.exec('BEGIN');
    try {
      this.db
        .prepare(
          `INSERT INTO cells (id,lat,lng,offshore,land_class,status,first_seen,last_updated)
           VALUES (?,?,?,?,?,?,?,?)
           ON CONFLICT(id) DO UPDATE SET offshore=excluded.offshore, land_class=excluded.land_class,
             status=excluded.status, last_updated=excluded.last_updated`,
        )
        .run(r.id, r.lat, r.lng, bit(r.offshore), r.landClass ?? null, r.error ? 'error' : 'ok', now, now);

      if (r.wind) {
        this.db
          .prepare(
            `INSERT OR REPLACE INTO wind_resource
             (cell_id,annual_avg_speed_ms,speed_stddev_ms,prevailing_dir_deg,directional_consistency,data_years,reference_height_m,weibull_k,weibull_c)
             VALUES (?,?,?,?,?,?,?,?,?)`,
          )
          .run(
            r.id, r.wind.annualAvgSpeedMs, r.wind.speedStdDevMs, r.wind.prevailingDirectionDeg,
            r.wind.directionalConsistency, r.wind.dataYears, orNull(r.wind.referenceHeightM),
            orNull(r.wind.weibullK), orNull(r.wind.weibullC),
          );
      }
      if (r.terrain) {
        this.db
          .prepare('INSERT OR REPLACE INTO terrain (cell_id,elevation_m,slope_percent,aspect_deg,roughness_class) VALUES (?,?,?,?,?)')
          .run(r.id, r.terrain.elevationM, r.terrain.slopePercent, r.terrain.aspectDeg, r.terrain.roughnessClass);
      }
      if (r.grid || r.road) {
        this.db
          .prepare(
            `INSERT OR REPLACE INTO grid_access
             (cell_id,nearest_line_km,nearest_substation_km,line_count,substation_count,nearest_road_km,road_type,road_category)
             VALUES (?,?,?,?,?,?,?,?)`,
          )
          .run(
            r.id, orNull(r.grid?.nearestLineDistanceKm), orNull(r.grid?.nearestSubstationDistanceKm),
            orNull(r.grid?.lineCount), orNull(r.grid?.substationCount),
            orNull(r.road?.nearestMajorRoadDistanceKm), r.road?.nearestMajorRoadType ?? null, r.road?.bestRoadCategory ?? null,
          );
      }
      if (r.geocode) {
        this.db
          .prepare('INSERT OR REPLACE INTO geocode (cell_id,country_code,country,region,display_name) VALUES (?,?,?,?,?)')
          .run(r.id, r.geocode.countryCode, r.geocode.country, r.geocode.region, r.geocode.displayName);
      }
      if (r.reanalysis) {
        this.db
          .prepare(
            `INSERT OR REPLACE INTO reanalysis
             (cell_id,method,reference,bias_before_ms,bias_after_ms,rmse_before_ms,rmse_after_ms,r_squared,ks_statistic,confidence)
             VALUES (?,?,?,?,?,?,?,?,?,?)`,
          )
          .run(
            r.id, r.reanalysis.method, r.reanalysis.reference, r.reanalysis.biasBeforeMs, r.reanalysis.biasAfterMs,
            r.reanalysis.rmseBeforeMs, r.reanalysis.rmseAfterMs, r.reanalysis.rSquared, r.reanalysis.ksStatistic, r.reanalysis.confidence,
          );
      }
      if (r.energy) {
        this.db
          .prepare(
            `INSERT OR REPLACE INTO energy_yield
             (cell_id,turbine_id,hub_height_m,gross_capacity_factor,net_capacity_factor,gross_aep_mwh,net_aep_mwh,p50_mwh,p75_mwh,p90_mwh,total_loss_pct,wake_loss_pct)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .run(
            r.id, r.energy.turbineId, r.energy.hubHeightM, r.energy.grossCapacityFactor, r.energy.netCapacityFactor,
            r.energy.grossAepMwh, r.energy.netAepMwh, r.energy.p50Mwh, r.energy.p75Mwh, r.energy.p90Mwh,
            r.energy.totalLossPct, r.energy.wakeLossPct,
          );
      }
      if (r.economics) {
        this.db
          .prepare(
            `INSERT OR REPLACE INTO economics
             (cell_id,lcoe_per_mwh,irr_pct,simple_payback_years,capex_gbp,energy_price_per_mwh,subsidy_free)
             VALUES (?,?,?,?,?,?,?)`,
          )
          .run(
            r.id, r.economics.lcoePerMwh, orNull(r.economics.irrPct), orNull(r.economics.simplePaybackYears),
            r.economics.capexGbp, r.economics.energyPricePerMwh, bit(r.economics.subsidyFree),
          );
      }

      this.db.prepare('DELETE FROM factor_scores WHERE cell_id = ?').run(r.id);
      const fs = this.db.prepare('INSERT INTO factor_scores (cell_id,factor,score,weight,confidence,detail) VALUES (?,?,?,?,?,?)');
      for (const f of r.factors ?? []) fs.run(r.id, f.factor, f.score, f.weight, f.confidence, f.detail);

      this.db.prepare('DELETE FROM constraints WHERE cell_id = ?').run(r.id);
      const cs = this.db.prepare('INSERT INTO constraints (cell_id,seq,kind,factor,severity,description) VALUES (?,?,?,?,?,?)');
      (r.constraints ?? []).forEach((c, i) => cs.run(r.id, i, c.kind, c.factor, c.severity, c.description));

      this.db
        .prepare(
          `INSERT OR REPLACE INTO site_assessment
           (cell_id,lat,lng,offshore,land_class,composite_score,overall_confidence,hard_constraint_count,
            wind_score,terrain_score,grid_score,landuse_score,planning_score,access_score,
            wind_speed_ms,capacity_factor,lcoe_per_mwh,subsidy_free,error,analysed_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          r.id, r.lat, r.lng, bit(r.offshore), r.landClass ?? null,
          orNull(r.compositeScore), r.overallConfidence ?? null, orNull(r.hardConstraintCount),
          orNull(r.windScore), orNull(r.terrainScore), orNull(r.gridScore),
          orNull(r.landuseScore), orNull(r.planningScore), orNull(r.accessScore),
          orNull(r.windSpeedMs), orNull(r.capacityFactor), orNull(r.lcoePerMwh), bit(r.subsidyFree), r.error ?? null, now,
        );
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  /** Decimated cells for the live feed / committed snapshot. */
  sample(max: number): HeatmapCell[] {
    const total = this.count();
    const rows = (
      total <= max
        ? this.db.prepare('SELECT * FROM site_assessment').all()
        : this.db.prepare('SELECT * FROM site_assessment WHERE (rowid % ?) = 0 LIMIT ?').all(Math.ceil(total / max), max)
    ) as unknown as Array<Record<string, number | string | null>>;
    return rows.map((r) => ({
      lat: r.lat as number,
      lng: r.lng as number,
      offshore: r.offshore === 1,
      landuse: (r.land_class as string) ?? undefined,
      score: (r.composite_score as number) ?? null,
      windScore: (r.wind_score as number) ?? null,
      windSpeedMs: (r.wind_speed_ms as number) ?? null,
      capacityFactor: (r.capacity_factor as number) ?? null,
      lcoePerMwh: (r.lcoe_per_mwh as number) ?? null,
      subsidyFree: r.subsidy_free === 1,
      hardConstraints: (r.hard_constraint_count as number) ?? undefined,
      confidence: (r.overall_confidence as HeatmapCell['confidence']) ?? undefined,
      error: (r.error as string) ?? undefined,
    }));
  }

  /** One-off import of a legacy uk.json snapshot so prior progress isn't lost. */
  migrateFromJson(jsonPath: string): number {
    if (this.count() > 0 || !existsSync(jsonPath)) return 0;
    try {
      const data = JSON.parse(readFileSync(jsonPath, 'utf8')) as { cells?: HeatmapCell[] };
      let n = 0;
      for (const c of data.cells ?? []) {
        this.upsertCell({
          id: `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`,
          lat: c.lat,
          lng: c.lng,
          offshore: !!c.offshore,
          landClass: c.landuse ?? null,
          compositeScore: c.score ?? null,
          overallConfidence: c.confidence ?? null,
          hardConstraintCount: c.hardConstraints ?? null,
          windScore: c.windScore ?? null,
          windSpeedMs: c.windSpeedMs ?? null,
          capacityFactor: c.capacityFactor ?? null,
          lcoePerMwh: c.lcoePerMwh ?? null,
          subsidyFree: !!c.subsidyFree,
          error: c.error ?? null,
        });
        n += 1;
      }
      return n;
    } catch {
      return 0;
    }
  }

  close(): void {
    this.db.close();
  }
}
