/**
 * Pre-download a job's map tiles + API data so crews can work offline.
 * Tiles are fetched through the service worker, which caches them.
 */
import axios from 'axios';

const TILE_LAYERS = [
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile',
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile',
];

const ZOOMS = [13, 14, 15, 16, 17, 18, 19];
const MAX_TILES = 3000;

const latLngToTile = (lat, lng, z) => {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return [x, y];
};

const buildTileUrls = (points) => {
  const lats = points.map((p) => p[0]);
  const lngs = points.map((p) => p[1]);
  const padLat = Math.max((Math.max(...lats) - Math.min(...lats)) * 0.2, 0.003);
  const padLng = Math.max((Math.max(...lngs) - Math.min(...lngs)) * 0.2, 0.003);
  const minLat = Math.min(...lats) - padLat, maxLat = Math.max(...lats) + padLat;
  const minLng = Math.min(...lngs) - padLng, maxLng = Math.max(...lngs) + padLng;

  const perZoom = ZOOMS.map((z) => {
    const [x1, y1] = latLngToTile(maxLat, minLng, z);
    const [x2, y2] = latLngToTile(minLat, maxLng, z);
    const urls = [];
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
        TILE_LAYERS.forEach((base) => urls.push(`${base}/${z}/${y}/${x}`));
      }
    }
    return { z, urls };
  });

  // Drop the highest zooms until under the cap
  let urls = [];
  const kept = [...perZoom];
  while (kept.length && kept.reduce((s, g) => s + g.urls.length, 0) > MAX_TILES) {
    kept.pop();
  }
  kept.forEach((g) => { urls = urls.concat(g.urls); });
  return urls;
};

export const cacheJobForOffline = async (jobId, points, onProgress) => {
  // 1) Warm the API cache (service worker caches these GETs)
  const apiPaths = [
    `/jobs/${jobId}`,
    `/jobs/${jobId}/poles`,
    `/jobs/${jobId}/underground`,
    `/jobs/${jobId}/routes`,
    `/jobs/${jobId}/annotations`,
    `/jobs/${jobId}/connections`,
    `/jobs/${jobId}/ase-data`,
  ];
  await Promise.all(apiPaths.map((p) => axios.get(p).catch(() => null)));

  if (!points.length) return { tiles: 0 };

  // 2) Pre-fetch map tiles with limited concurrency
  const urls = buildTileUrls(points);
  let done = 0;
  const workers = Array.from({ length: 8 }, async (_, w) => {
    for (let i = w; i < urls.length; i += 8) {
      try { await fetch(urls[i], { mode: 'no-cors' }); } catch (e) { /* ignore */ }
      done++;
      if (onProgress && done % 20 === 0) onProgress(Math.round((done / urls.length) * 100));
    }
  });
  await Promise.all(workers);
  if (onProgress) onProgress(100);
  return { tiles: urls.length };
};
