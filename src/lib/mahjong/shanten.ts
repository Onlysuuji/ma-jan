import { NUM_TILES, type TileId } from "./types";
import { tilesToCounts } from "./tiles";

const KOKUSHI_TILES = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

/**
 * Standard form shanten (4 mentsu + 1 jantou).
 * Recursively extracts mentsu/taatsu and computes
 *   shanten = 8 - 2*mentsu - taatsu - (hasJantou ? 1 : 0)
 * with caps mentsu + taatsu <= 4.
 */
export function shantenStandard(counts: number[]): number {
  const c = counts.slice();
  let best = 8;

  // Try each pair as jantou
  for (let i = 0; i < NUM_TILES; i++) {
    if (c[i] >= 2) {
      c[i] -= 2;
      const s = recurse(c, 0, 0, 0, true);
      c[i] += 2;
      if (s < best) best = s;
    }
  }
  // No jantou case
  const s = recurse(c, 0, 0, 0, false);
  if (s < best) best = s;

  return best;
}

function evaluate(mentsu: number, taatsu: number, hasJantou: boolean): number {
  let t = taatsu;
  if (mentsu + t > 4) t = 4 - mentsu;
  return 8 - 2 * mentsu - t - (hasJantou ? 1 : 0);
}

function recurse(
  c: number[],
  startIdx: number,
  mentsu: number,
  taatsu: number,
  hasJantou: boolean
): number {
  let idx = startIdx;
  while (idx < NUM_TILES && c[idx] === 0) idx++;
  if (idx >= NUM_TILES) return evaluate(mentsu, taatsu, hasJantou);

  // Hard prune: once we already have m+t = 4, additional taatsu is wasted; just evaluate.
  if (mentsu + taatsu >= 4) return evaluate(mentsu, taatsu, hasJantou);

  let best = 8;
  const isSuit = idx < 27;
  const inSuit = isSuit ? idx % 9 : -1;

  // Triplet
  if (c[idx] >= 3) {
    c[idx] -= 3;
    const s = recurse(c, idx, mentsu + 1, taatsu, hasJantou);
    c[idx] += 3;
    if (s < best) best = s;
  }

  // Sequence (i, i+1, i+2)
  if (isSuit && inSuit <= 6 && c[idx + 1] > 0 && c[idx + 2] > 0) {
    c[idx]--; c[idx + 1]--; c[idx + 2]--;
    const s = recurse(c, idx, mentsu + 1, taatsu, hasJantou);
    c[idx]++; c[idx + 1]++; c[idx + 2]++;
    if (s < best) best = s;
  }

  // Pair as taatsu
  if (c[idx] >= 2) {
    c[idx] -= 2;
    const s = recurse(c, idx, mentsu, taatsu + 1, hasJantou);
    c[idx] += 2;
    if (s < best) best = s;
  }

  // Adjacent (ryanmen / penchan)
  if (isSuit && inSuit <= 7 && c[idx + 1] > 0) {
    c[idx]--; c[idx + 1]--;
    const s = recurse(c, idx, mentsu, taatsu + 1, hasJantou);
    c[idx]++; c[idx + 1]++;
    if (s < best) best = s;
  }

  // Kanchan (i, i+2)
  if (isSuit && inSuit <= 6 && c[idx + 2] > 0) {
    c[idx]--; c[idx + 2]--;
    const s = recurse(c, idx, mentsu, taatsu + 1, hasJantou);
    c[idx]++; c[idx + 2]++;
    if (s < best) best = s;
  }

  // Skip a single tile (floating)
  c[idx]--;
  const s = recurse(c, idx, mentsu, taatsu, hasJantou);
  c[idx]++;
  if (s < best) best = s;

  return best;
}

/** Chiitoitsu (seven pairs) shanten. */
export function shantenChiitoi(counts: number[]): number {
  let pairs = 0;
  let kinds = 0;
  for (let i = 0; i < NUM_TILES; i++) {
    if (counts[i] >= 2) pairs++;
    if (counts[i] >= 1) kinds++;
  }
  return 6 - pairs + Math.max(0, 7 - kinds);
}

/** Kokushi musou (thirteen orphans) shanten. */
export function shantenKokushi(counts: number[]): number {
  let kinds = 0;
  let hasPair = false;
  for (const id of KOKUSHI_TILES) {
    if (counts[id] >= 1) kinds++;
    if (counts[id] >= 2) hasPair = true;
  }
  return 13 - kinds - (hasPair ? 1 : 0);
}

export interface ShantenResult {
  shanten: number;
  /** which form gives the minimum: 0=standard, 1=chiitoi, 2=kokushi (multiple may share min) */
  forms: { standard: number; chiitoi: number; kokushi: number };
}

export function shantenAll(tiles: TileId[]): ShantenResult {
  const counts = tilesToCounts(tiles);
  return shantenAllFromCounts(counts);
}

export function shantenAllFromCounts(counts: number[]): ShantenResult {
  const std = shantenStandard(counts);
  const chi = shantenChiitoi(counts);
  const kok = shantenKokushi(counts);
  return {
    shanten: Math.min(std, chi, kok),
    forms: { standard: std, chiitoi: chi, kokushi: kok },
  };
}

/** Shorthand returning just the minimum shanten value. */
export function shanten(tiles: TileId[]): number {
  return shantenAll(tiles).shanten;
}
