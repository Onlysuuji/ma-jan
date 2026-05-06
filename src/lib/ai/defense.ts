import { NUM_TILES, TILES_PER_KIND, type TileId } from "../mahjong/types";
import { isHonor, isYaochuu, tileSuit, tileRank, makeTile } from "../mahjong/tiles";

export interface OpponentInfo {
  river: TileId[];
  riichi: boolean;
  riichiJunme: number;
  /** Tiles discarded by this opponent after their riichi declaration (for stricter genbutsu). */
  riverAfterRiichi?: TileId[];
}

export interface DefenseContext {
  opponents: OpponentInfo[];
  /** counts of all tiles seen outside our hand (rivers + dora indicators) */
  seenCounts: number[];
  /** counts of our remaining hand after the candidate discard; used for kabe / no-chance reads */
  ownCounts?: number[];
  /** our own river (we cannot deal into ourselves; useful for ura-suji style heuristics) */
  ownRiver: TileId[];
}

/**
 * Estimate the danger (0..1) of a candidate discard tile against a single opponent.
 * 0 = absolutely safe (genbutsu); 1 = very dangerous (no info, riichi, middle tile, no suji).
 */
export function dangerAgainstOpponent(
  tile: TileId,
  opp: OpponentInfo,
  seenCounts: number[],
  ownCounts?: number[]
): number {
  // Genbutsu: 0 danger
  if (opp.river.includes(tile)) return 0;

  // Non-riichi opponent: low constant danger (we don't model their hand)
  if (!opp.riichi) return 0.15;

  // Riichi opponent — full danger model
  // Honor tiles: if 3+ visible, ~0; if 2 visible, low; otherwise medium.
  if (isHonor(tile)) {
    const visible = visibleCount(tile, seenCounts, ownCounts);
    if (visible >= 3) return 0.05;
    if (visible >= 2) return 0.2;
    if (visible >= 1) return 0.4;
    return 0.6;
  }

  // Suit tiles: check kabe and suji
  const suit = tileSuit(tile);
  const rank = tileRank(tile);
  const kabe = isKabeBlocked(tile, seenCounts, ownCounts);

  // Suji safety: a tile is "suji-safe" against ryanmen waits if the corresponding
  // outer tile is in opp's river. For 1m: suji is 4m (blocks 1-4 ryanmen of 23). Etc.
  const sujiSafe = isSujiSafe(tile, opp);

  // Terminal: blocks penchan/kanchan implicitly; ryanmen only on 12 wait.
  if (rank === 1 || rank === 9) {
    // Terminal danger reduced
    if (sujiSafe || kabe) return 0.15;
    return 0.35;
  }

  // 2 or 8: suji-related (suji is 5)
  if (rank === 2 || rank === 8) {
    if (sujiSafe || kabe) return 0.2;
    return 0.5;
  }

  // 3 or 7: medium-dangerous
  if (rank === 3 || rank === 7) {
    if (sujiSafe || kabe) return 0.3;
    return 0.7;
  }

  // 4, 5, 6: most dangerous (middle)
  if (sujiSafe || kabe) return 0.4;
  return 0.85;
}

/** "Kabe" check: a tile X is suji-blocked if both adjacent rank suji-blockers have 4 visible
 *  and the tile X itself can't form a typical wait. Approximation: if 4 of X-3 or X+3 are visible
 *  (within suit), partially block ryanmen waits using X.
 */
function isKabeBlocked(tile: TileId, seenCounts: number[], ownCounts?: number[]): boolean {
  if (tile >= 27) return false;
  const suit = tileSuit(tile);
  const rank = tileRank(tile);
  // For middle tiles, ryanmen waits using X are X-X+1 (waits X-1 and X+2) or X-1-X (waits X-2 and X+1).
  // If X-2 or X+2 has 4 visible (or 3 with rest in our hand), it blocks one side.
  const checkRanks: number[] = [];
  if (rank - 2 >= 1) checkRanks.push(rank - 2);
  if (rank + 2 <= 9) checkRanks.push(rank + 2);
  for (const r of checkRanks) {
    const id = makeTile(suit as 0 | 1 | 2, r);
    if (visibleCount(id, seenCounts, ownCounts) >= 4) return true;
  }
  return false;
}

function visibleCount(tile: TileId, seenCounts: number[], ownCounts?: number[]): number {
  return seenCounts[tile] + (ownCounts?.[tile] ?? 0);
}

function isSujiSafe(tile: TileId, opp: OpponentInfo): boolean {
  if (tile >= 27) return false;
  const suit = tileSuit(tile);
  const rank = tileRank(tile);
  const inRiver = (r: number) => {
    const id = makeTile(suit as 0 | 1 | 2, r);
    return opp.river.includes(id);
  };
  // For an opponent's ryanmen wait, the suji partner blocks it.
  //   Wait 1 or 4: blocked if 4 in river (kata-suji)
  //   Wait 7 or 4: blocked if 4 in river
  //   For full suji safety on 1: need 4 in river (one-sided)
  //   For full suji safety on 4: need both 1 AND 7 (both-sides)
  switch (rank) {
    case 1:
      return inRiver(4);
    case 9:
      return inRiver(6);
    case 2:
      return inRiver(5);
    case 8:
      return inRiver(5);
    case 3:
      return inRiver(6);
    case 7:
      return inRiver(4);
    case 4:
      return inRiver(1) && inRiver(7);
    case 5:
      return inRiver(2) && inRiver(8);
    case 6:
      return inRiver(3) && inRiver(9);
    default:
      return false;
  }
}

/** Aggregate danger score across all opponents (0..1+); mainly weights riichi opponents. */
export function totalDanger(tile: TileId, ctx: DefenseContext): number {
  let total = 0;
  for (const opp of ctx.opponents) {
    const d = dangerAgainstOpponent(tile, opp, ctx.seenCounts, ctx.ownCounts);
    // Riichi opponents matter much more (multiplier captures expected loss when dealing in).
    const weight = opp.riichi ? 1.0 : 0.15;
    total += d * weight;
  }
  return total;
}

/** Whether at least one opponent is currently in riichi. */
export function anyRiichi(ctx: DefenseContext): boolean {
  return ctx.opponents.some((o) => o.riichi);
}
