import { type TileId } from "./types";
import { isHonor, isYaochuu, isWind, isDragon, tileRank, tileSuit } from "./tiles";

/** Tile value for a "round wind" + "seat wind" check. winds: 1=E,2=S,3=W,4=N */
export function isValueWind(id: TileId, roundWind: number, seatWind: number): boolean {
  if (!isWind(id)) return false;
  const windRank = id - 26; // 1..4 (E=1)
  return windRank === roundWind || windRank === seatWind;
}

export function isYakuhai(id: TileId, roundWind: number, seatWind: number): boolean {
  return isDragon(id) || isValueWind(id, roundWind, seatWind);
}

/** Count dora value of all tiles given dora tiles (not indicators). */
export function countDora(handTiles: TileId[], doraTiles: TileId[]): number {
  if (doraTiles.length === 0) return 0;
  let dora = 0;
  for (const t of handTiles) {
    for (const d of doraTiles) {
      if (t === d) dora++;
    }
  }
  return dora;
}

/** Detect whether a hand could be tanyao (all simples, no terminals/honors). */
export function couldBeTanyao(handTiles: TileId[]): boolean {
  return handTiles.every((t) => !isYaochuu(t));
}

/** Rough "potential yaku" weights (returns expected han bonus). */
export interface YakuPotential {
  tanyao: boolean;
  yakuhaiTriplets: number;       // number of yakuhai triplets (open or closed)
  yakuhaiPairs: number;          // potential yakuhai (could complete to triplet)
  pinfuLikely: boolean;          // very rough: no triplet at all in hand
  toitoiLikely: boolean;         // no sequence-shaped pieces
  honitsuSuit: number | null;    // -1/null if not, else suit index 0/1/2 (m/p/s) for one-suit + honors hand
  chinitsuSuit: number | null;   // single suit only (no honors)
  /** combined potential han. Used as打点 bonus in evaluator. */
  hanPotential: number;
}

export function evaluateYakuPotential(
  closedTiles: TileId[],
  roundWind: number,
  seatWind: number
): YakuPotential {
  const counts = new Array(34).fill(0);
  for (const t of closedTiles) counts[t]++;

  let yakuhaiTriplets = 0;
  let yakuhaiPairs = 0;
  for (let id = 27; id < 34; id++) {
    if (counts[id] === 0) continue;
    if (isYakuhai(id, roundWind, seatWind)) {
      if (counts[id] >= 3) yakuhaiTriplets++;
      else if (counts[id] === 2) yakuhaiPairs++;
    }
  }

  const tanyao = couldBeTanyao(closedTiles);

  // Honitsu / chinitsu: tile distribution
  const suits = [0, 0, 0, 0]; // m, p, s, z
  for (const t of closedTiles) suits[tileSuit(t)]++;
  let usedSuit: number | null = null;
  let suitsUsed = 0;
  for (let s = 0; s < 3; s++) {
    if (suits[s] > 0) {
      suitsUsed++;
      usedSuit = s;
    }
  }
  const honors = suits[3];
  let honitsuSuit: number | null = null;
  let chinitsuSuit: number | null = null;
  if (suitsUsed === 1) {
    if (honors === 0) chinitsuSuit = usedSuit;
    else honitsuSuit = usedSuit;
  }

  let triCount = 0;
  for (let id = 0; id < 34; id++) {
    if (counts[id] >= 3) triCount++;
  }
  const toitoiLikely = triCount >= 2;
  // Pinfu likely: no honor pairs (besides non-yakuhai), no triplets at all
  const pinfuLikely = triCount === 0 && yakuhaiPairs === 0 && yakuhaiTriplets === 0;

  let han = 0;
  han += yakuhaiTriplets * 1;
  if (tanyao) han += 1;
  if (chinitsuSuit !== null) han += 5;
  else if (honitsuSuit !== null) han += 2;
  if (pinfuLikely) han += 1;
  if (toitoiLikely) han += 2;

  return {
    tanyao,
    yakuhaiTriplets,
    yakuhaiPairs,
    pinfuLikely,
    toitoiLikely,
    honitsuSuit,
    chinitsuSuit,
    hanPotential: han,
  };
}
