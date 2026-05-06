import { NUM_TILES, type TileId } from "./types";

export interface Mentsu {
  kind: "shuntsu" | "koutsu";
  tiles: [TileId, TileId, TileId];
  /** is this set "open" (came from a call) — for our v1, always false (no calls). */
  open: boolean;
}

export interface Decomposition {
  jantou: TileId;
  mentsu: Mentsu[];
  /** the winning tile that completed the hand, if known */
  agariTile?: TileId;
  /** which mentsu/jantou contains the winning tile */
  agariInMentsu?: number; // -1 if in jantou, else 0..3
  /** wait shape: ryanmen / kanchan / penchan / shanpon / tanki */
  waitShape?: "ryanmen" | "kanchan" | "penchan" | "shanpon" | "tanki";
}

/**
 * Find all decompositions of a 14-tile counts-array into 4 mentsu + 1 jantou.
 * Counts must sum to 14. Returns [] if no decomposition (e.g. chiitoi/kokushi).
 */
export function decompose14(counts: number[]): Decomposition[] {
  const c = counts.slice();
  const total = c.reduce((s, v) => s + v, 0);
  if (total !== 14) return [];

  const results: Decomposition[] = [];

  for (let p = 0; p < NUM_TILES; p++) {
    if (c[p] >= 2) {
      c[p] -= 2;
      const sub = enumerateMentsu(c, 0);
      c[p] += 2;
      for (const m of sub) {
        results.push({ jantou: p, mentsu: m });
      }
    }
  }
  return results;
}

function enumerateMentsu(c: number[], start: number): Mentsu[][] {
  // Find first non-zero index
  let idx = start;
  while (idx < NUM_TILES && c[idx] === 0) idx++;
  if (idx >= NUM_TILES) {
    return [[]];
  }
  const out: Mentsu[][] = [];
  // Triplet
  if (c[idx] >= 3) {
    c[idx] -= 3;
    const rest = enumerateMentsu(c, idx);
    c[idx] += 3;
    for (const r of rest) {
      out.push([
        { kind: "koutsu", tiles: [idx, idx, idx], open: false },
        ...r,
      ]);
    }
  }
  // Sequence (only suits, non-honor, rank 1..7 starting)
  if (idx < 27 && idx % 9 <= 6 && c[idx + 1] > 0 && c[idx + 2] > 0) {
    c[idx]--; c[idx + 1]--; c[idx + 2]--;
    const rest = enumerateMentsu(c, idx);
    c[idx]++; c[idx + 1]++; c[idx + 2]++;
    for (const r of rest) {
      out.push([
        { kind: "shuntsu", tiles: [idx, idx + 1, idx + 2], open: false },
        ...r,
      ]);
    }
  }
  return out;
}

/** Annotate decompositions with the winning tile location and wait shape. */
export function annotateDecomposition(d: Decomposition, agariTile: TileId): Decomposition {
  // Find which mentsu/jantou contains the agariTile and infer wait shape
  if (d.jantou === agariTile) {
    return { ...d, agariTile, agariInMentsu: -1, waitShape: "tanki" };
  }
  for (let i = 0; i < d.mentsu.length; i++) {
    const m = d.mentsu[i];
    if (m.kind === "koutsu" && m.tiles[0] === agariTile) {
      return { ...d, agariTile, agariInMentsu: i, waitShape: "shanpon" };
    }
    if (m.kind === "shuntsu") {
      const [a, b, c2] = m.tiles;
      if (a === agariTile || b === agariTile || c2 === agariTile) {
        let shape: "ryanmen" | "kanchan" | "penchan";
        if (b === agariTile) {
          shape = "kanchan";
        } else {
          // outer ends: penchan if 3rd or 7th completes 1-2-3 / 7-8-9, else ryanmen
          const r = (a % 9) + 1;
          if ((r === 1 && agariTile === c2) || (r === 7 && agariTile === a)) {
            shape = "penchan";
          } else {
            shape = "ryanmen";
          }
        }
        return { ...d, agariTile, agariInMentsu: i, waitShape: shape };
      }
    }
  }
  return d;
}
