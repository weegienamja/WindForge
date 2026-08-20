/**
 * SQLite datapoint store for the heatmap worker (built-in `node:sqlite`, no
 * native dependency). One row per analysed grid cell, keyed by a precise
 * coordinate id so runs resume and scale to millions of points without
 * rewriting a JSON blob each save.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { HeatmapCell } from '../../src/lib/heatmap';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS cells (
  id TEXT PRIMARY KEY,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  offshore INTEGER,
  landuse TEXT,
  score INTEGER,
  wind_score INTEGER,
  wind_speed_ms REAL,
  capacity_factor REAL,
  lcoe_per_mwh INTEGER,
  subsidy_free INTEGER,
  hard_constraints INTEGER,
  confidence TEXT,
  error TEXT,
  analysed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_cells_latlng ON cells (lat, lng);
CREATE INDEX IF NOT EXISTS idx_cells_lcoe ON cells (lcoe_per_mwh);
`;

interface Row {
  id: string;
  lat: number;
  lng: number;
  offshore: number | null;
  landuse: string | null;
  score: number | null;
  wind_score: number | null;
  wind_speed_ms: number | null;
  capacity_factor: number | null;
  lcoe_per_mwh: number | null;
  subsidy_free: number | null;
  hard_constraints: number | null;
  confidence: string | null;
  error: string | null;
}

function rowToCell(r: Row): HeatmapCell {
  return {
    lat: r.lat,
    lng: r.lng,
    offshore: r.offshore === 1,
    landuse: r.landuse ?? undefined,
    score: r.score,
    windScore: r.wind_score,
    windSpeedMs: r.wind_speed_ms,
    capacityFactor: r.capacity_factor,
    lcoePerMwh: r.lcoe_per_mwh,
    subsidyFree: r.subsidy_free === 1,
    hardConstraints: r.hard_constraints ?? undefined,
    confidence: (r.confidence as HeatmapCell['confidence']) ?? undefined,
    error: r.error ?? undefined,
  };
}

export class HeatmapStore {
  private db: DatabaseSync;
  private insertStmt;
  private hasStmt;
  private countStmt;
  private countLcoeStmt;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
    this.db.exec(SCHEMA);
    this.insertStmt = this.db.prepare(
      `INSERT OR REPLACE INTO cells
        (id, lat, lng, offshore, landuse, score, wind_score, wind_speed_ms, capacity_factor,
         lcoe_per_mwh, subsidy_free, hard_constraints, confidence, error, analysed_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    this.hasStmt = this.db.prepare('SELECT 1 FROM cells WHERE id = ?');
    this.countStmt = this.db.prepare('SELECT COUNT(*) AS c FROM cells');
    this.countLcoeStmt = this.db.prepare('SELECT COUNT(*) AS c FROM cells WHERE lcoe_per_mwh IS NOT NULL');
  }

  has(id: string): boolean {
    return this.hasStmt.get(id) !== undefined;
  }

  count(): number {
    return Number((this.countStmt.get() as { c: number }).c);
  }

  countWithLcoe(): number {
    return Number((this.countLcoeStmt.get() as { c: number }).c);
  }

  upsert(id: string, cell: HeatmapCell): void {
    const b = (v: boolean | undefined) => (v ? 1 : 0);
    const n = (v: number | null | undefined) => (v === undefined ? null : v);
    this.insertStmt.run(
      id,
      cell.lat,
      cell.lng,
      b(cell.offshore),
      cell.landuse ?? null,
      n(cell.score),
      n(cell.windScore),
      n(cell.windSpeedMs),
      n(cell.capacityFactor),
      n(cell.lcoePerMwh),
      b(cell.subsidyFree),
      n(cell.hardConstraints),
      cell.confidence ?? null,
      cell.error ?? null,
      new Date().toISOString(),
    );
  }

  /**
   * A decimated set of cells for the live feed / committed snapshot — capped so
   * the browser can render it even when the DB holds millions of rows.
   */
  sample(max: number): HeatmapCell[] {
    const total = this.count();
    const rows =
      total <= max
        ? (this.db.prepare('SELECT * FROM cells').all() as unknown as Row[])
        : (this.db
            .prepare('SELECT * FROM cells WHERE (rowid % ?) = 0 LIMIT ?')
            .all(Math.ceil(total / max), max) as unknown as Row[]);
    return rows.map(rowToCell);
  }

  /** One-off import of a legacy uk.json checkpoint so progress isn't lost. */
  migrateFromJson(jsonPath: string, idFor: (lat: number, lng: number) => string): number {
    if (this.count() > 0 || !existsSync(jsonPath)) return 0;
    try {
      const data = JSON.parse(readFileSync(jsonPath, 'utf8')) as { cells?: HeatmapCell[] };
      let n = 0;
      for (const cell of data.cells ?? []) {
        this.upsert(idFor(cell.lat, cell.lng), cell);
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
