// Spatial cache with tile-based storage.
//
// Provides a tile-keyed cache for geographic data. Uses in-memory storage
// (suitable for Node.js and browser). Each data type has its own TTL:
// elevation = 30 days, wind = 7 days, OSM = 24 hours.

export type SpatialDataType = 'elevation' | 'wind' | 'osm' | 'custom';

export interface CacheStats {
  totalEntries: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  oldestEntryMs: number | null;
  newestEntryMs: number | null;
}

interface CacheEntry<T> {
  data: T;
  storedAt: number;
  expiresAt: number;
  tileKey: string;
  dataType: SpatialDataType;
}

/** Default TTLs per data type (milliseconds) */
const DEFAULT_TTLS: Record<SpatialDataType, number> = {
  elevation: 30 * 24 * 60 * 60 * 1000, // 30 days
  wind: 7 * 24 * 60 * 60 * 1000, // 7 days
  osm: 24 * 60 * 60 * 1000, // 24 hours
  custom: 24 * 60 * 60 * 1000, // 24 hours
};

/**
 * Generate a tile key for a coordinate at a given zoom level.
 *
 * Uses a simple grid tiling scheme: at zoom level z, the world is divided
 * into 2^z tiles in each direction. Lower zoom = larger tiles = more coarse.
 *
 * @param lat - Latitude
 * @param lng - Longitude
 * @param zoom - Zoom level (0-18, default 10 for ~150m resolution)
 */
export function tileKey(lat: number, lng: number, zoom: number = 10): string {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return `${zoom}/${x}/${y}`;
}

export interface SpatialCache {
  get<T>(key: string, dataType?: SpatialDataType): T | undefined;
  set<T>(key: string, data: T, dataType?: SpatialDataType, ttlMs?: number): void;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  getStats(): CacheStats;
}

/**
 * Create a spatial cache backed by an in-memory Map.
 *
 * @param maxEntries - Maximum number of entries before LRU eviction (default: 1000)
 */
export function createSpatialCache(maxEntries: number = 1000): SpatialCache {
  const store = new Map<string, CacheEntry<unknown>>();
  let hitCount = 0;
  let missCount = 0;

  function evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.expiresAt <= now) {
        store.delete(key);
      }
    }
  }

  function evictLru(): void {
    if (store.size <= maxEntries) return;

    // Find and remove the oldest entry
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of store) {
      if (entry.storedAt < oldestTime) {
        oldestTime = entry.storedAt;
        oldestKey = key;
      }
    }
    if (oldestKey) store.delete(oldestKey);
  }

  return {
    get<T>(key: string, _dataType?: SpatialDataType): T | undefined {
      const entry = store.get(key);
      if (!entry) {
        missCount++;
        return undefined;
      }
      if (entry.expiresAt <= Date.now()) {
        store.delete(key);
        missCount++;
        return undefined;
      }
      hitCount++;
      return entry.data as T;
    },

    set<T>(key: string, data: T, dataType: SpatialDataType = 'custom', ttlMs?: number): void {
      const ttl = ttlMs ?? DEFAULT_TTLS[dataType];
      const now = Date.now();
      store.set(key, {
        data,
        storedAt: now,
        expiresAt: now + ttl,
        tileKey: key,
        dataType,
      });
      evictExpired();
      evictLru();
    },

    has(key: string): boolean {
      const entry = store.get(key);
      if (!entry) return false;
      if (entry.expiresAt <= Date.now()) {
        store.delete(key);
        return false;
      }
      return true;
    },

    delete(key: string): boolean {
      return store.delete(key);
    },

    clear(): void {
      store.clear();
      hitCount = 0;
      missCount = 0;
    },

    getStats(): CacheStats {
      evictExpired();
      let oldest: number | null = null;
      let newest: number | null = null;
      for (const entry of store.values()) {
        if (oldest === null || entry.storedAt < oldest) oldest = entry.storedAt;
        if (newest === null || entry.storedAt > newest) newest = entry.storedAt;
      }

      const total = hitCount + missCount;
      return {
        totalEntries: store.size,
        hitCount,
        missCount,
        hitRate: total > 0 ? hitCount / total : 0,
        oldestEntryMs: oldest,
        newestEntryMs: newest,
      };
    },
  };
}
