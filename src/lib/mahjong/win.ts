import { NUM_TILES, TILES_PER_KIND, type TileId } from "./types";
import { tilesToCounts } from "./tiles";
import { shantenAllFromCounts } from "./shanten";

/** Whether a 14-tile (closed) hand is a winning shape (any form: standard / chiitoi / kokushi). */
export function isWin(tiles14: TileId[]): boolean {
  const counts = tilesToCounts(tiles14);
  return shantenAllFromCounts(counts).shanten === -1;
}

export function isWinFromCounts(counts: number[]): boolean {
  return shantenAllFromCounts(counts).shanten === -1;
}

/** Tiles that, when added to a 13-tile hand, complete the win. */
export function waitingTiles(tiles13: TileId[]): TileId[] {
  const counts = tilesToCounts(tiles13);
  const out: TileId[] = [];
  for (let id = 0; id < NUM_TILES; id++) {
    if (counts[id] >= TILES_PER_KIND) continue;
    counts[id]++;
    if (shantenAllFromCounts(counts).shanten === -1) out.push(id);
    counts[id]--;
  }
  return out;
}

/** Furiten check: if any wait tile is already in the player's river, ron is illegal. */
export function isFuriten(tiles13: TileId[], river: TileId[]): boolean {
  const waits = new Set(waitingTiles(tiles13));
  if (waits.size === 0) return false;
  for (const t of river) {
    if (waits.has(t)) return true;
  }
  return false;
}
