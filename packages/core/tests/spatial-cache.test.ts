import { describe, it, expect } from 'vitest';
import { createSpatialCache, tileKey } from '../src/cache/spatial-cache.js';

describe('Spatial Cache', () => {
  describe('tileKey', () => {
    it('generates consistent keys for the same location', () => {
      const key1 = tileKey(55.86, -4.25, 10);
      const key2 = tileKey(55.86, -4.25, 10);
      expect(key1).toBe(key2);
    });

    it('generates different keys for different locations', () => {
      const key1 = tileKey(55.86, -4.25, 10);
      const key2 = tileKey(40.71, -74.0, 10);
      expect(key1).not.toBe(key2);
    });

    it('generates different keys for different zoom levels', () => {
      const key1 = tileKey(55.86, -4.25, 8);
      const key2 = tileKey(55.86, -4.25, 12);
      expect(key1).not.toBe(key2);
    });

    it('nearby coordinates within same tile return same key', () => {
      // At zoom 10, tiles are roughly 0.35 degrees wide
      const key1 = tileKey(55.86, -4.25, 10);
      const key2 = tileKey(55.861, -4.251, 10);
      expect(key1).toBe(key2);
    });
  });

  describe('createSpatialCache', () => {
    it('stores and retrieves values', () => {
      const cache = createSpatialCache(100);
      cache.set('test-key', { data: 42 }, 'elevation');
      const result = cache.get('test-key');
      expect(result).toEqual({ data: 42 });
    });

    it('returns undefined for missing keys', () => {
      const cache = createSpatialCache(100);
      const result = cache.get('nonexistent');
      expect(result).toBeUndefined();
    });

    it('reports has correctly', () => {
      const cache = createSpatialCache(100);
      expect(cache.has('k')).toBe(false);
      cache.set('k', { value: 1 }, 'elevation');
      expect(cache.has('k')).toBe(true);
    });

    it('deletes entries', () => {
      const cache = createSpatialCache(100);
      cache.set('k', { value: 1 }, 'elevation');
      expect(cache.has('k')).toBe(true);
      cache.delete('k');
      expect(cache.has('k')).toBe(false);
    });

    it('clears all entries', () => {
      const cache = createSpatialCache(100);
      cache.set('a', 1, 'elevation');
      cache.set('b', 2, 'wind');
      cache.clear();
      expect(cache.has('a')).toBe(false);
      expect(cache.has('b')).toBe(false);
      expect(cache.getStats().totalEntries).toBe(0);
    });

    it('tracks cache stats', () => {
      const cache = createSpatialCache(100);
      cache.set('a', 1, 'elevation');
      cache.set('b', 2, 'wind');
      cache.get('a'); // hit
      cache.get('c'); // miss
      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(2);
      expect(stats.hitCount).toBe(1);
      expect(stats.missCount).toBe(1);
    });

    it('evicts oldest entries when maxEntries exceeded', () => {
      const cache = createSpatialCache(3);
      cache.set('a', 1, 'elevation');
      cache.set('b', 2, 'elevation');
      cache.set('c', 3, 'elevation');
      // Adding a 4th should evict 'a'
      cache.set('d', 4, 'elevation');
      expect(cache.has('a')).toBe(false);
      expect(cache.has('d')).toBe(true);
      expect(cache.getStats().totalEntries).toBe(3);
    });

    it('uses different keys for different data at same tile', () => {
      const cache = createSpatialCache(100);
      // Use composite keys to store different data types for the same tile
      cache.set('tile-1:elev', { elev: 100 }, 'elevation');
      cache.set('tile-1:wind', { speed: 7.5 }, 'wind');
      expect(cache.get('tile-1:elev')).toEqual({ elev: 100 });
      expect(cache.get('tile-1:wind')).toEqual({ speed: 7.5 });
    });
  });
});
