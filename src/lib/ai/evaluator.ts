import {
  NUM_TILES,
  type TileId,
} from "../mahjong/types";
import { tilesToCounts, tileDisplay, isYaochuu, isHonor } from "../mahjong/tiles";
import { shantenAllFromCounts } from "../mahjong/shanten";
import { ukeireFromCounts, type UkeireTile } from "../mahjong/ukeire";
import {
  countDora,
  evaluateYakuPotential,
  isYakuhai,
} from "../mahjong/score";
import {
  anyRiichi,
  totalDanger,
  type DefenseContext,
  type OpponentInfo,
} from "./defense";

export interface DiscardCandidate {
  tile: TileId;
  resultingShanten: number;
  ukeire: UkeireTile[];
  ukeireCount: number;
  ukeireKinds: number;
  doraCount: number;
  hanPotential: number;
  /** total danger (sum across opponents, weighted by riichi). 0..~1+. */
  danger: number;
  /** total composite score (higher = better) */
  score: number;
  reason: string;
}

export interface EvaluatorContext {
  doraTiles: TileId[];
  /** seen counts outside hand (river, dora indicators, melds, opponents' melds) */
  seenCounts?: number[];
  roundWind: number;
  seatWind: number;
  junme?: number;
  /** opponents (3 in 4-player; can be empty for solitaire). */
  opponents?: OpponentInfo[];
  /** own river (used for some defense heuristics) */
  ownRiver?: TileId[];
  /** Whether closed hand (no calls). Default true. */
  isClosed?: boolean;
  /** Whether we're already in riichi (cannot change discard) */
  alreadyRiichi?: boolean;
  /** Force a play mode. "auto" picks based on game state. */
  mode?: "auto" | "attack" | "defense";
}

export interface EvaluationResult {
  candidates: DiscardCandidate[];
  best: DiscardCandidate;
  currentShanten: number;
  /** active mode used for scoring */
  mode: "attack" | "defense" | "balance";
  notes: string[];
}

const DANGER_WEIGHT_ATTACK = 800;
const DANGER_WEIGHT_BALANCE = 4000;
const DANGER_WEIGHT_DEFENSE = 50000;

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
  const opponents = ctx.opponents ?? [];
  const defenseCtx: DefenseContext = {
    opponents,
    seenCounts: seen,
    ownRiver: ctx.ownRiver ?? [],
  };
  const opponentRiichi = anyRiichi(defenseCtx);

  const mode = decideMode(ctx.mode, currentShanten, opponentRiichi);
  const dangerWeight =
    mode === "defense" ? DANGER_WEIGHT_DEFENSE : mode === "balance" ? DANGER_WEIGHT_BALANCE : DANGER_WEIGHT_ATTACK;

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
    const danger = totalDanger(id, { ...defenseCtx, ownCounts: counts });

    counts[id]++;

    const ukeireKinds = ukeire.tiles.length;
    const ukeireCount = ukeire.total;
    const shantenDelta = currentShanten - ukeire.shanten;

    let score = 0;

    if (mode === "defense") {
      // Pure safety: minimize danger; offense barely matters.
      score -= danger * dangerWeight;
      // Tie-breaker: small preference for not breaking shape.
      score -= ukeire.shanten * 50;
      score += ukeireCount * 5;
    } else {
      // Offense + safety blend
      score -= ukeire.shanten * 100000;
      score += ukeireCount * 200;
      score += ukeireKinds * 30;
      score += yp.hanPotential * 80;
      score += doraCount * 60;
      // Penalty for breaking a useful structure (shanten went up).
      if (shantenDelta < 0) score -= 50000;
      // Slight bonus for keeping yakuhai pair if no other yaku
      if (
        yp.yakuhaiPairs > 0 &&
        !yp.tanyao &&
        yp.honitsuSuit === null &&
        yp.chinitsuSuit === null
      ) {
        score += 30;
      }
      // Defense penalty proportional to danger
      score -= danger * dangerWeight;
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
      danger,
      mode,
    });

    candidates.push({
      tile: id,
      resultingShanten: ukeire.shanten,
      ukeire: ukeire.tiles,
      ukeireCount,
      ukeireKinds,
      doraCount,
      hanPotential: yp.hanPotential,
      danger,
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
  if (mode === "defense") {
    notes.push("守備優先モードです (相手リーチに対して安牌の棚を優先)。");
  } else if (mode === "balance") {
    notes.push("攻守バランスモードです (速度と打点の天秤で押し引き)。");
  }

  return {
    candidates,
    best: candidates[0],
    currentShanten,
    mode,
    notes,
  };
}

function decideMode(
  forced: EvaluatorContext["mode"],
  currentShanten: number,
  opponentRiichi: boolean
): "attack" | "defense" | "balance" {
  if (forced && forced !== "auto") return forced;
  if (!opponentRiichi) return "attack";
  if (currentShanten >= 3) return "defense";
  if (currentShanten === 2) return "defense";
  if (currentShanten <= 1) return "balance";
  return "balance";
}

function isIsolated(id: TileId, counts: number[]): boolean {
  if (counts[id] >= 2) return false;
  if (id >= 27) return counts[id] === 1;
  const r = id % 9;
  const left2 = r >= 2 ? counts[id - 2] : 0;
  const left1 = r >= 1 ? counts[id - 1] : 0;
  const right1 = r <= 7 ? counts[id + 1] : 0;
  const right2 = r <= 6 ? counts[id + 2] : 0;
  return counts[id] === 1 && left2 + left1 + right1 + right2 === 0;
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
  danger: number;
  mode: "attack" | "defense" | "balance";
}

function buildReason(rc: ReasonContext): string {
  const parts: string[] = [];
  const name = tileDisplay(rc.tile);
  if (rc.mode === "defense") {
    parts.push(`安牌の棚: ${name} の危険度 ${rc.danger.toFixed(2)}`);
    if (rc.danger === 0) parts.push("現物で安全");
    else if (rc.danger < 0.2) parts.push("ほぼ安牌");
    else if (rc.danger < 0.5) parts.push("中程度の危険");
    else parts.push("危険牌");
    if (rc.isHonor && !rc.isYakuhaiTile) parts.push("不要な字牌で外しやすい");
    return parts.join("。 ") + "。";
  }

  if (rc.newShanten < rc.currentShanten) {
    parts.push(`手牌の骨格を進める ${name} 切り (${rc.currentShanten} → ${rc.newShanten})`);
  } else if (rc.newShanten === rc.currentShanten) {
    parts.push(`手牌の骨格を崩さず ${name} を切れます (${rc.newShanten})`);
  } else {
    parts.push(`${name}を切ると手牌の骨格が後退します (${rc.currentShanten} → ${rc.newShanten})`);
  }

  parts.push(`速度の材料: 受け入れ ${rc.ukeireCount} 枚 / ${rc.ukeireKinds} 種`);

  if (rc.danger > 0.5) parts.push(`危険度 ${rc.danger.toFixed(2)}`);
  else if (rc.danger > 0.2) parts.push(`やや危険 (${rc.danger.toFixed(2)})`);

  if (rc.isolated) {
    if (rc.isHonor && !rc.isYakuhaiTile) parts.push("孤立した役なし字牌で安全に外せます");
    else parts.push("孤立牌で他の塔子に絡みません");
  }

  if (rc.doraCount > 0) parts.push(`打点の芯としてドラ ${rc.doraCount} 枚を残します`);

  if (rc.yp.tanyao) parts.push("タンヤオの目があります");
  if (rc.yp.chinitsuSuit !== null) parts.push("清一色を狙えます");
  else if (rc.yp.honitsuSuit !== null) parts.push("混一色を狙えます");
  if (rc.yp.yakuhaiTriplets >= 1) parts.push(`役牌${rc.yp.yakuhaiTriplets}組を確定`);
  else if (rc.yp.yakuhaiPairs >= 1) parts.push("役牌の対子を残しています");
  if (rc.yp.pinfuLikely && rc.yp.honitsuSuit === null && rc.yp.chinitsuSuit === null)
    parts.push("平和形に向かいます");
  if (rc.yp.toitoiLikely) parts.push("対々の目があります");

  return parts.join("。 ") + "。";
}

export interface ActionRecommendation {
  action: string;
  tile?: TileId;
  riichi: boolean;
  attack: "attack" | "balance" | "defense";
  reason: string;
}

export function recommend(
  closed14: TileId[],
  ctx: EvaluatorContext & {
    canRiichi?: boolean;
  }
): { evaluation: EvaluationResult; recommendation: ActionRecommendation } {
  const evalRes = evaluateDiscards(closed14, ctx);
  const best = evalRes.best;

  let action = "打牌";
  let riichi = false;
  let attack: "attack" | "balance" | "defense" = evalRes.mode;
  let reason = best.reason;

  const becomesTenpai = best.resultingShanten === 0;
  const isClosed = ctx.isClosed ?? true;
  const canRiichi = ctx.canRiichi ?? true;
  const alreadyRiichi = ctx.alreadyRiichi ?? false;

  if (
    becomesTenpai &&
    isClosed &&
    canRiichi &&
    !alreadyRiichi &&
    evalRes.mode !== "defense" &&
    best.danger < 0.5
  ) {
    riichi = true;
    action = "リーチ + 打牌";
    reason = `テンパイ + 打点期待のためリーチを推奨します。${best.reason}`;
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
