import { NUM_TILES, TILES_PER_KIND, type TileId } from "./types";
import { tilesToCounts } from "./tiles";
import { shantenAllFromCounts } from "./shanten";

export interface UkeireTile {
  tile: TileId;
  /** number of copies remaining unseen in the wall + opponents' hands */
  remaining: number;
}

export interface UkeireResult {
  shanten: number;
  tiles: UkeireTile[];
  total: number;
}

/**
 * Compute ukeire for a 13-tile hand:
 * Tiles which, when drawn, reduce shanten by 1.
 *
 * @param tiles13 13-tile hand
 * @param knownCounts optional: visible tiles outside hand (river, dora indicator, melds)
 *                    expressed as counts[34] (already seen, not including the 13 in hand).
 *                    Used to compute "remaining" copies (4 - inHand - seen).
 */
export function ukeireOf13(
  tiles13: TileId[],
  knownCounts?: number[]
): UkeireResult {
  const counts = tilesToCounts(tiles13);
  const base = shantenAllFromCounts(counts).shanten;
  const result: UkeireTile[] = [];
  let total = 0;

  for (let id = 0; id < NUM_TILES; id++) {
    if (counts[id] >= TILES_PER_KIND) continue;
    counts[id]++;
    const next = shantenAllFromCounts(counts).shanten;
    counts[id]--;
    if (next < base) {
      const seen = knownCounts ? knownCounts[id] : 0;
      const remaining = TILES_PER_KIND - counts[id] - seen;
      if (remaining > 0) {
        result.push({ tile: id, remaining });
        total += remaining;
      }
    }
  }
  return { shanten: base, tiles: result, total };
}

/**
 * Ukeire from explicit counts (length 34). Same semantics as above.
 */
export function ukeireFromCounts(
  counts: number[],
  knownCounts?: number[]
): UkeireResult {
  const c = counts.slice();
  const base = shantenAllFromCounts(c).shanten;
  const result: UkeireTile[] = [];
  let total = 0;

  for (let id = 0; id < NUM_TILES; id++) {
    if (c[id] >= TILES_PER_KIND) continue;
    c[id]++;
    const next = shantenAllFromCounts(c).shanten;
    c[id]--;
    if (next < base) {
      const seen = knownCounts ? knownCounts[id] : 0;
      const remaining = TILES_PER_KIND - c[id] - seen;
      if (remaining > 0) {
        result.push({ tile: id, remaining });
        total += remaining;
      }
    }
  }
  return { shanten: base, tiles: result, total };
}
