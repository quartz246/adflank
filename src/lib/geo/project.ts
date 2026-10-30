import { US_FIT, US_VIEW, WORLD_VIEW } from "./outlines";

/**
 * Projections for the fan map, matching the baked outlines in ./outlines.ts: the lower 48 in an Albers equal-area
 * conic (standard parallels 29.5/45.5, centre 96W 37.5N), everything else in plain equirectangular.
 */
const R = Math.PI / 180;
const P1 = 29.5 * R, P2 = 45.5 * R, L0 = -96 * R, F0 = 37.5 * R;
const N = (Math.sin(P1) + Math.sin(P2)) / 2;
const C = Math.cos(P1) ** 2 + 2 * N * Math.sin(P1);
const R0 = Math.sqrt(C - 2 * N * Math.sin(F0)) / N;

export function inLower48(lat: number, lon: number): boolean {
  return lat > 24 && lat < 50 && lon > -125.5 && lon < -66;
}

export function projectUS(lat: number, lon: number): [number, number] {
  const r = Math.sqrt(C - 2 * N * Math.sin(lat * R)) / N;
  const t = N * (lon * R - L0);
  const x = r * Math.sin(t), y = R0 - r * Math.cos(t);
  return [US_FIT.pad + (x - US_FIT.minX) * US_FIT.k, US_FIT.pad + (US_FIT.maxY - y) * US_FIT.k];
}

export function projectWorld(lat: number, lon: number): [number, number] {
  return [((lon + 180) / 360) * WORLD_VIEW.w, ((WORLD_VIEW.top - lat) / 360) * WORLD_VIEW.w];
}

export { US_VIEW, WORLD_VIEW };
