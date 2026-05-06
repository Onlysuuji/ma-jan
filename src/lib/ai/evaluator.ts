import {
  NUM_TILES,
  TILES_PER_KIND,
  type TileId,
} from "../mahjong/types";
import { tilesToCounts, sortTiles, tileDisplay, isYaochuu, isHonor } from "../mahjong/tiles";
import { shantenAllFromCounts } from "../mahjong/shanten";
import { ukeireFromCounts, type UkeireTile } from "../mahjong/ukeire";
import {
  countDora,
  evaluateYakuPotential,
  isYakuhai,
} from "../mahjong/score";

export interface DiscardCandidate {
  /** the tile we'd discard */
  tile: TileId;
  /** resulting 13-tile hand after discard */
  resultingShanten: number;
  /** ukeire tiles of resulting hand */
  ukeire: UkeireTile[];
  /** total ukeire (sum of remaining counts) */
  ukeireCount: number;
  /** distinct ukeire kinds */
  ukeireKinds: number;
  /** dora count of resulting closed tiles */
  doraCount: number;
  /** estimated han potential after this discard */
  hanPotential: number;
  /** safety score: lower = more dangerous, higher = safer (rough placeholder until defense AI is wired) */
  safety: number;
  /** total composite score (higher = better) */
  score: number;
  /** human-readable reason for this candidate */
  reason: string;
}

export interface EvaluatorContext {
  /** dora tiles (not indicators) */
  doraTiles: TileId[];
  /** seen counts outside hand (river, dora indicators, melds, opponents' melds) */
  seenCounts?: number[];
  /** round wind: 1=E,2=S,3=W,4=N */
  roundWind: number;
  /** seat wind */
  seatWind: number;
  /** turn number (1..18) for tempo decisions */
  junme?: number;
}

export interface EvaluationResult {
  /** ranked candidates, best first */
  candidates: DiscardCandidate[];
  /** the recommended discard (candidates[0]) */
  best: DiscardCandidate;
  /** current 14-tile shanten (after draw, before discard) */
  currentShanten: number;
  /** notes about the position */
  notes: string[];
}

/**
 * Evaluate every possible discard from the 14-tile hand.
 * Returns ranked candidates with a recommendation and reasoning.
 */
export function evaluateDiscards(
  closed14: TileId[],
  ctx: EvaluatorContext
): EvaluationResult {
  if (closed14.length !== 14) {
    throw new Error(`evaluateDiscards expects 14 tiles, got ${closed14.length}`);
  }

  const counts = tilesToCounts(closed14);
  const currentShantenInfo = shantenAllFromCounts(counts);
  const currentShanten = currentShantenInfo.shanten;

  const seen = ctx.seenCounts ?? new Array(NUM_TILES).fill(0);
  const candidates: DiscardCandidate[] = [];

  const uniqueTiles: TileId[] = [];
  for (let id = 0; id < NUM_TILES; id++) {
    if (counts[id] > 0) uniqueTiles.push(id);
  }

  for (const id of uniqueTiles) {
    counts[id]--;
    const remainingTiles: TileId[] = [];
    for (let i = 0; i < NUM_TILES; i++) {
      for (let j = 0; j < counts[i]; j++) remainingTiles.push(i);
    }

    const ukeire = ukeireFromCounts(counts, seen);
    const yp = evaluateYakuPotential(remainingTiles, ctx.roundWind, ctx.seatWind);
    const doraCount = countDora(remainingTiles, ctx.doraTiles);
    const safety = estimateSafety(id, ctx);

    counts[id]++;

    const ukeireKinds = ukeire.tiles.length;
    const ukeireCount = ukeire.total;
    const shantenDelta = currentShanten - ukeire.shanten; // positive if discarding made worse

    // Composite score: prioritize shanten, then ukeire, then打点, then safety.
    let score = 0;
    score -= ukeire.shanten * 100000;
    score += ukeireCount * 200;
    score += ukeireKinds * 30;
    score += yp.hanPotential * 80;
    score += doraCount * 60;
    score += safety * 5;

    // Penalty for breaking a useful structure (shanten went up).
    if (shantenDelta < 0) score -= 50000;

    // Slight bonus for keeping yakuhai pair if no other yaku
    if (yp.yakuhaiPairs > 0 && !yp.tanyao && yp.honitsuSuit === null && yp.chinitsuSuit === null) {
      score += 30;
    }

    const reason = buildReason({
      tile: id,
      currentShanten,
      newShanten: ukeire.shanten,
      ukeireCount,
      ukeireKinds,
      doraCount,
      yp,
      isolated: isIsolated(id, counts),
      isYaochuu: isYaochuu(id),
      isHonor: isHonor(id),
      isYakuhaiTile: isYakuhai(id, ctx.roundWind, ctx.seatWind),
    });

    candidates.push({
      tile: id,
      resultingShanten: ukeire.shanten,
      ukeire: ukeire.tiles,
      ukeireCount,
      ukeireKinds,
      doraCount,
      hanPotential: yp.hanPotential,
      safety,
      score,
      reason,
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  const notes: string[] = [];
  notes.push(`現在シャンテン (14枚): ${currentShanten}`);
  if (currentShantenInfo.forms.chiitoi <= currentShantenInfo.forms.standard - 1) {
    notes.push("七対子が有利な形です。");
  }
  if (currentShantenInfo.forms.kokushi <= currentShantenInfo.forms.standard - 1) {
    notes.push("国士無双が有利な形です。");
  }

  return {
    candidates,
    best: candidates[0],
    currentShanten,
    notes,
  };
}

function isIsolated(id: TileId, counts: number[]): boolean {
  if (counts[id] >= 2) return false;
  if (id >= 27) {
    // honor: isolated means count=1 and no other copy
    return counts[id] === 1;
  }
  const r = id % 9;
  const left2 = r >= 2 ? counts[id - 2] : 0;
  const left1 = r >= 1 ? counts[id - 1] : 0;
  const right1 = r <= 7 ? counts[id + 1] : 0;
  const right2 = r <= 6 ? counts[id + 2] : 0;
  return counts[id] === 1 && left2 + left1 + right1 + right2 === 0;
}

function estimateSafety(id: TileId, ctx: EvaluatorContext): number {
  // Without opponent info this is just a rough heuristic:
  // honors safer than terminals safer than middles
  // Will be replaced by genbutsu / suji logic later.
  if (isHonor(id)) return 4;
  if (isYaochuu(id)) return 3;
  const r = (id % 9) + 1;
  if (r === 2 || r === 8) return 2;
  return 1;
}

interface ReasonContext {
  tile: TileId;
  currentShanten: number;
  newShanten: number;
  ukeireCount: number;
  ukeireKinds: number;
  doraCount: number;
  yp: ReturnType<typeof evaluateYakuPotential>;
  isolated: boolean;
  isYaochuu: boolean;
  isHonor: boolean;
  isYakuhaiTile: boolean;
}

function buildReason(rc: ReasonContext): string {
  const parts: string[] = [];
  const name = tileDisplay(rc.tile);
  if (rc.newShanten < rc.currentShanten) {
    parts.push(`${name}を切るとシャンテンが進みます (${rc.currentShanten} → ${rc.newShanten})`);
  } else if (rc.newShanten === rc.currentShanten) {
    parts.push(`${name}を切ってもシャンテンは維持されます (${rc.newShanten})`);
  } else {
    parts.push(`${name}を切るとシャンテンが後退します (${rc.currentShanten} → ${rc.newShanten})`);
  }

  parts.push(`受け入れ ${rc.ukeireCount} 枚 / ${rc.ukeireKinds} 種`);

  if (rc.isolated) {
    if (rc.isHonor && !rc.isYakuhaiTile) parts.push("孤立した役なし字牌で安全に外せます");
    else if (rc.isolated) parts.push("孤立牌で他の塔子に絡みません");
  }

  if (rc.doraCount > 0) parts.push(`手にドラ ${rc.doraCount} 枚を残します`);

  if (rc.yp.tanyao) parts.push("タンヤオの目があります");
  if (rc.yp.chinitsuSuit !== null) parts.push("清一色を狙えます");
  else if (rc.yp.honitsuSuit !== null) parts.push("混一色を狙えます");
  if (rc.yp.yakuhaiTriplets >= 1) parts.push(`役牌${rc.yp.yakuhaiTriplets}組を確定`);
  else if (rc.yp.yakuhaiPairs >= 1) parts.push("役牌の対子を残しています");
  if (rc.yp.pinfuLikely && rc.yp.honitsuSuit === null && rc.yp.chinitsuSuit === null) parts.push("平和形に向かいます");
  if (rc.yp.toitoiLikely) parts.push("対々の目があります");

  return parts.join("。 ") + "。";
}

export interface ActionRecommendation {
  /** main action label (打牌/リーチ/ツモ和了など) */
  action: string;
  tile?: TileId;
  riichi: boolean;
  attack: "attack" | "balance" | "defense";
  reason: string;
}

/**
 * Top-level recommendation given a 14-tile hand. Suggests:
 *   - which tile to discard
 *   - whether to declare riichi (when tenpai, closed)
 *   - attack/defense bias (placeholder until opponent model exists)
 */
export function recommend(
  closed14: TileId[],
  ctx: EvaluatorContext & {
    isClosed?: boolean;
    canRiichi?: boolean;
    opponentRiichi?: boolean;
  }
): { evaluation: EvaluationResult; recommendation: ActionRecommendation } {
  const evalRes = evaluateDiscards(closed14, ctx);
  const best = evalRes.best;

  let action = "打牌";
  let riichi = false;
  let attack: "attack" | "balance" | "defense" = "balance";
  let reason = best.reason;

  const becomesTenpai = best.resultingShanten === 0;
  const isClosed = ctx.isClosed ?? true;
  const canRiichi = ctx.canRiichi ?? true;

  if (becomesTenpai && isClosed && canRiichi) {
    riichi = true;
    action = "リーチ + 打牌";
    reason = `テンパイになるためリーチを推奨します。${best.reason}`;
    attack = "attack";
  }

  if (ctx.opponentRiichi && evalRes.currentShanten >= 2) {
    attack = "defense";
    reason = `相手リーチかつ手が遠い (${evalRes.currentShanten}シャンテン) ため守備寄りに。${best.reason}`;
  } else if (best.resultingShanten <= 1) {
    attack = "attack";
  }

  return {
    evaluation: evalRes,
    recommendation: {
      action,
      tile: best.tile,
      riichi,
      attack,
      reason,
    },
  };
}
