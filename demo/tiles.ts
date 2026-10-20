// Where the map's tiles are kept between runs: OpenStreetMap's Shortbread
// vector tiles, one file a tile, so a second run reads the whole flight
// from disk and asks OSM's servers for nothing. The same directory as
// react-x11-components' map bench, so the two share a cache.
import os from 'node:os';
import path from 'node:path';

export interface TileId {
  z: number;
  x: number;
  y: number;
}

export function cacheDir(): string {
  return (
    process.env.REACT_X11_MAPS_TILE_CACHE ??
    path.join(os.tmpdir(), 'react-x11-maps-tiles', 'shortbread_v1')
  );
}

export function cachePath(tile: TileId): string {
  return path.join(cacheDir(), String(tile.z), String(tile.x), `${tile.y}.mvt`);
}
