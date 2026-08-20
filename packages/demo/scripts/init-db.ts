/**
 * Create (or upgrade) the WindForge SQLite database with the full schema, then
 * close it cleanly so the .db file is self-contained and openable in DBeaver.
 *
 *   DB="F:\WindForge database\windforge.db" pnpm --filter @jamieblair/windforge-demo db:init
 */
import { WindForgeDB, SCHEMA_VERSION } from './lib/heatmap-store';

const path = process.env.DB ?? './heatmap-data/uk.db';
const db = new WindForgeDB(path);
const cells = db.count();
db.close();
console.log(`[db] ready: ${path} (schema v${SCHEMA_VERSION}, ${cells} cells)`);
