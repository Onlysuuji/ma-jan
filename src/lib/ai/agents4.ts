import type {
  Agent4,
  PlayerView,
} from "../mahjong/match";
import type { TileId } from "../mahjong/types";
import type { YakuResult } from "../mahjong/yaku";
import { sortTiles, tilesToCounts } from "../mahjong/tiles";
import { shantenAllFromCounts } from "../mahjong/shanten";
import { ukeireFromCounts } from "../mahjong/ukeire";
import { evaluateDiscards, type EvaluatorContext } from "./evaluator";
import type { OpponentInfo } from "./defense";

function buildOpponents(view: PlayerView): OpponentInfo[] {
  const out: OpponentInfo[] = [];
  for (let i = 0; i < 4; i++) {
    if (i === view.seatIndex) continue;
    out.push({
      river: view.opponentRivers[i],
      riichi: view.opponentRiichi[i],
      riichiJunme: view.opponentRiichiJunme[i],
    });
  }
  return out;
}

function fullHand(view: PlayerView): TileId[] {
  if (view.ownDrawn === null) return view.ownClosed.slice();
  return sortTiles([...view.ownClosed, view.ownDrawn]);
}

/** Always wins when offered (tsumo/ron). */
const alwaysWin = {
  decideTsumo: (_v: PlayerView, _t: TileId, _y: YakuResult) => true,
  decideRon: (_v: PlayerView, _t: TileId, _f: number, _y: YakuResult) => true,
};

/** Random discard, never riichi. Wins when possible. */
export const randomAgent4: Agent4 = {
  name: "random",
  decideDiscard(view) {
    const locked = riichiTsumogiri(view);
    if (locked) return locked;
    const hand = fullHand(view);
    const tile = hand[deterministicIndex(view, hand.length)];
    return { tile, riichi: false };
  },
  ...alwaysWin,
};

/** Pick the discard that minimizes shanten (ties → max ukeire). Auto-riichi on tenpai. */
export const simpleShantenAgent4: Agent4 = {
  name: "simple-shanten",
  decideDiscard(view) {
    const locked = riichiTsumogiri(view);
    if (locked) return locked;
    const hand = fullHand(view);
    const counts = tilesToCounts(hand);
    let bestTile = hand[0];
    let bestShanten = Infinity;
    let bestUkeire = -1;
    const tried = new Set<number>();
    for (const id of hand) {
      if (tried.has(id)) continue;
      tried.add(id);
      counts[id]--;
      const sh = shantenAllFromCounts(counts).shanten;
      let uk = -1;
      if (sh <= bestShanten) uk = ukeireFromCounts(counts, view.seenCounts).total;
      counts[id]++;
      if (sh < bestShanten || (sh === bestShanten && uk > bestUkeire)) {
        bestTile = id;
        bestShanten = sh;
        bestUkeire = uk;
      }
    }
    const becomesTenpai = bestShanten === 0;
    const isClosed = view.ownIsClosed && !view.ownRiichi;
    return { tile: bestTile, riichi: becomesTenpai && isClosed };
  },
  ...alwaysWin,
};

/** Full offensive evaluator, no defense. */
export const attackerAgent4: Agent4 = {
  name: "attacker",
  decideDiscard(view) {
    const locked = riichiTsumogiri(view);
    if (locked) return locked;
    const hand = fullHand(view);
    const ctx: EvaluatorContext = {
      doraTiles: view.doraTiles,
      seenCounts: view.seenCounts,
      roundWind: view.roundWind,
      seatWind: view.seatWind,
      junme: view.junme,
      mode: "attack",
      isClosed: view.ownIsClosed,
      alreadyRiichi: view.ownRiichi,
    };
    const r = evaluateDiscards(hand, ctx);
    const becomesTenpai = r.best.resultingShanten === 0;
    return {
      tile: r.best.tile,
      riichi: becomesTenpai && view.ownIsClosed && !view.ownRiichi,
    };
  },
  ...alwaysWin,
};

/** Offensive evaluator with only the evaluator's light discard-risk penalty enabled. */
export const riskAwareAgent4: Agent4 = {
  name: "risk-aware",
  decideDiscard(view) {
    const locked = riichiTsumogiri(view);
    if (locked) return locked;
    const hand = fullHand(view);
    const ctx: EvaluatorContext = {
      doraTiles: view.doraTiles,
      seenCounts: view.seenCounts,
      roundWind: view.roundWind,
      seatWind: view.seatWind,
      junme: view.junme,
      mode: "attack",
      isClosed: view.ownIsClosed,
      alreadyRiichi: view.ownRiichi,
      opponents: buildOpponents(view),
      ownRiver: view.ownRiver,
    };
    const r = evaluateDiscards(hand, ctx);
    const best = chooseMildRiskCandidate(r.candidates, view);
    const becomesTenpai = best.resultingShanten === 0;
    return {
      tile: best.tile,
      riichi: becomesTenpai && view.ownIsClosed && !view.ownRiichi,
    };
  },
  ...alwaysWin,
};

/** Offensive evaluator that rewards immediate waits and hand value more than the baseline attacker. */
export const valueAgent4: Agent4 = {
  name: "value",
  decideDiscard(view) {
    const locked = riichiTsumogiri(view);
    if (locked) return locked;
    const hand = fullHand(view);
    const ctx: EvaluatorContext = {
      doraTiles: view.doraTiles,
      seenCounts: view.seenCounts,
      roundWind: view.roundWind,
      seatWind: view.seatWind,
      junme: view.junme,
      mode: "attack",
      isClosed: view.ownIsClosed,
      alreadyRiichi: view.ownRiichi,
    };
    const r = evaluateDiscards(hand, ctx);
    const best = chooseValueCandidate(r.candidates, view);
    const becomesTenpai = best.resultingShanten === 0;
    return {
      tile: best.tile,
      riichi: becomesTenpai && view.ownIsClosed && !view.ownRiichi,
    };
  },
  ...alwaysWin,
};

/** Shanten/ukeire-safe attacker: only takes value when it does not give up too much speed. */
export const solidAgent4: Agent4 = {
  name: "solid",
  decideDiscard(view) {
    const locked = riichiTsumogiri(view);
    if (locked) return locked;
    const hand = fullHand(view);
    const ctx: EvaluatorContext = {
      doraTiles: view.doraTiles,
      seenCounts: view.seenCounts,
      roundWind: view.roundWind,
      seatWind: view.seatWind,
      junme: view.junme,
      mode: "attack",
      isClosed: view.ownIsClosed,
      alreadyRiichi: view.ownRiichi,
    };
    const r = evaluateDiscards(hand, ctx);
    const best = chooseSolidCandidate(r.candidates, view);
    const becomesTenpai = best.resultingShanten === 0;
    return {
      tile: best.tile,
      riichi: becomesTenpai && view.ownIsClosed && !view.ownRiichi,
    };
  },
  ...alwaysWin,
};

/** World candidate v1: attack-first, with light riichi-risk awareness for top-rate play. */
export const worldAgent4: Agent4 = {
  name: "world",
  decideDiscard(view) {
    const locked = riichiTsumogiri(view);
    if (locked) return locked;
    const hand = fullHand(view);
    const ctx: EvaluatorContext = {
      doraTiles: view.doraTiles,
      seenCounts: view.seenCounts,
      roundWind: view.roundWind,
      seatWind: view.seatWind,
      junme: view.junme,
      mode: "attack",
      isClosed: view.ownIsClosed,
      alreadyRiichi: view.ownRiichi,
      opponents: buildOpponents(view),
      ownRiver: view.ownRiver,
    };
    const r = evaluateDiscards(hand, ctx);
    const best = chooseMildRiskCandidate(r.candidates, view);
    const becomesTenpai = best.resultingShanten === 0;
    return {
      tile: best.tile,
      riichi: becomesTenpai && view.ownIsClosed && !view.ownRiichi,
    };
  },
  ...alwaysWin,
};

/** Dealer-aware attacker: folds only far hands against dealer riichi. */
export const seatAwareAgent4: Agent4 = {
  name: "seat-aware",
  decideDiscard(view) {
    const locked = riichiTsumogiri(view);
    if (locked) return locked;
    const hand = fullHand(view);
    const currentShanten = shantenAllFromCounts(tilesToCounts(hand)).shanten;
    const dealerRiichi = view.seatIndex !== 0 && view.opponentRiichi[0];
    const shouldFold = dealerRiichi && currentShanten >= 2 && view.junme >= 8;
    const ctx: EvaluatorContext = {
      doraTiles: view.doraTiles,
      seenCounts: view.seenCounts,
      roundWind: view.roundWind,
      seatWind: view.seatWind,
      junme: view.junme,
      mode: shouldFold ? "defense" : "attack",
      isClosed: view.ownIsClosed,
      alreadyRiichi: view.ownRiichi,
      opponents: shouldFold ? buildOpponents(view) : undefined,
      ownRiver: shouldFold ? view.ownRiver : undefined,
    };
    const r = evaluateDiscards(hand, ctx);
    const best = r.best;
    const becomesTenpai = best.resultingShanten === 0;
    return {
      tile: best.tile,
      riichi:
        becomesTenpai &&
        view.ownIsClosed &&
        !view.ownRiichi &&
        r.mode !== "defense",
    };
  },
  ...alwaysWin,
};

/** Attacker that can defer riichi on weak early tenpai to keep improving the shape. */
export const patientAgent4: Agent4 = {
  name: "patient",
  decideDiscard(view) {
    const locked = riichiTsumogiri(view);
    if (locked) return locked;
    const hand = fullHand(view);
    const ctx: EvaluatorContext = {
      doraTiles: view.doraTiles,
      seenCounts: view.seenCounts,
      roundWind: view.roundWind,
      seatWind: view.seatWind,
      junme: view.junme,
      mode: "attack",
      isClosed: view.ownIsClosed,
      alreadyRiichi: view.ownRiichi,
    };
    const r = evaluateDiscards(hand, ctx);
    const best = r.best;
    const becomesTenpai = best.resultingShanten === 0;
    return {
      tile: best.tile,
      riichi:
        becomesTenpai &&
        view.ownIsClosed &&
        !view.ownRiichi &&
        shouldDeclareRiichi(best, view),
    };
  },
  ...alwaysWin,
};

/** Full evaluator in auto (balance/defense) mode. */
export const balancedAgent4: Agent4 = {
  name: "balanced",
  decideDiscard(view) {
    const locked = riichiTsumogiri(view);
    if (locked) return locked;
    const hand = fullHand(view);
    const ctx: EvaluatorContext = {
      doraTiles: view.doraTiles,
      seenCounts: view.seenCounts,
      roundWind: view.roundWind,
      seatWind: view.seatWind,
      junme: view.junme,
      mode: "auto",
      isClosed: view.ownIsClosed,
      alreadyRiichi: view.ownRiichi,
      opponents: buildOpponents(view),
      ownRiver: view.ownRiver,
    };
    const r = evaluateDiscards(hand, ctx);
    const becomesTenpai = r.best.resultingShanten === 0;
    const isOpenRiichi = view.opponentRiichi.some((b) => b);
    // In defense mode, do not riichi.
    const wantRiichi =
      becomesTenpai &&
      view.ownIsClosed &&
      !view.ownRiichi &&
      r.mode !== "defense" &&
      r.best.danger < 0.5;
    return { tile: r.best.tile, riichi: wantRiichi };
  },
  ...alwaysWin,
};

/** Stricter push/fold agent: folds from 1-shanten or worse against riichi, pushes tenpai. */
export const pushFoldAgent4: Agent4 = {
  name: "push-fold",
  decideDiscard(view) {
    const locked = riichiTsumogiri(view);
    if (locked) return locked;
    const hand = fullHand(view);
    const currentShanten = shantenAllFromCounts(tilesToCounts(hand)).shanten;
    const opponentRiichi = view.opponentRiichi.some((b, i) => i !== view.seatIndex && b);
    const mode =
      opponentRiichi && currentShanten >= 1
        ? "defense"
        : opponentRiichi
          ? "auto"
          : "attack";
    const ctx: EvaluatorContext = {
      doraTiles: view.doraTiles,
      seenCounts: view.seenCounts,
      roundWind: view.roundWind,
      seatWind: view.seatWind,
      junme: view.junme,
      mode,
      isClosed: view.ownIsClosed,
      alreadyRiichi: view.ownRiichi,
      opponents: buildOpponents(view),
      ownRiver: view.ownRiver,
    };
    const r = evaluateDiscards(hand, ctx);
    const becomesTenpai = r.best.resultingShanten === 0;
    const wantRiichi =
      becomesTenpai &&
      view.ownIsClosed &&
      !view.ownRiichi &&
      r.mode !== "defense" &&
      r.best.danger < 0.4;
    return { tile: r.best.tile, riichi: wantRiichi };
  },
  ...alwaysWin,
};

export const ALL_AGENTS_4: Agent4[] = [
  randomAgent4,
  simpleShantenAgent4,
  attackerAgent4,
  riskAwareAgent4,
  valueAgent4,
  solidAgent4,
  worldAgent4,
  seatAwareAgent4,
  patientAgent4,
  balancedAgent4,
  pushFoldAgent4,
];

function chooseMildRiskCandidate(
  candidates: ReturnType<typeof evaluateDiscards>["candidates"],
  view: PlayerView
) {
  const opponentRiichiCount = view.opponentRiichi.filter((b, i) => i !== view.seatIndex && b).length;
  if (opponentRiichiCount === 0) return candidates[0];

  let best = candidates[0];
  let bestScore = -Infinity;
  for (const c of candidates) {
    const riskWeight =
      c.resultingShanten <= 1
        ? 600
        : c.resultingShanten === 2
          ? 3500
          : 7000;
    const score = c.score - c.danger * riskWeight * opponentRiichiCount;
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

function chooseValueCandidate(
  candidates: ReturnType<typeof evaluateDiscards>["candidates"],
  view: PlayerView
) {
  let best = candidates[0];
  let bestScore = -Infinity;
  for (const c of candidates) {
    const waitBonus = c.resultingShanten === 0 ? c.ukeireCount * 120 + c.ukeireKinds * 80 : 0;
    const valueBonus = c.hanPotential * 220 + c.doraCount * 180;
    const lateSpeedBonus = view.junme >= 12 && c.resultingShanten <= 1 ? c.ukeireCount * 45 : 0;
    const score = c.score + waitBonus + valueBonus + lateSpeedBonus;
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

function chooseSolidCandidate(
  candidates: ReturnType<typeof evaluateDiscards>["candidates"],
  view: PlayerView
) {
  const bestShanten = Math.min(...candidates.map((c) => c.resultingShanten));
  const sameShanten = candidates.filter((c) => c.resultingShanten === bestShanten);
  const maxUkeire = Math.max(...sameShanten.map((c) => c.ukeireCount));
  const tolerance = bestShanten === 0 ? 2 : view.junme >= 12 ? 3 : 6;
  const viable = sameShanten.filter((c) => c.ukeireCount >= maxUkeire - tolerance);

  let best = viable[0];
  let bestScore = -Infinity;
  for (const c of viable) {
    const score =
      c.score +
      c.ukeireCount * 35 +
      c.ukeireKinds * 20 +
      c.hanPotential * 120 +
      c.doraCount * 100;
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

function shouldDeclareRiichi(
  c: ReturnType<typeof evaluateDiscards>["best"],
  view: PlayerView
): boolean {
  const value = c.hanPotential + c.doraCount;
  if (view.junme >= 10) return true;
  if (c.ukeireCount >= 6) return true;
  if (value >= 2) return true;
  return false;
}

function riichiTsumogiri(view: PlayerView): { tile: TileId; riichi: boolean } | null {
  if (!view.ownRiichi || view.ownDrawn === null) return null;
  return { tile: view.ownDrawn, riichi: false };
}

function deterministicIndex(view: PlayerView, length: number): number {
  let h =
    (view.seatIndex + 1) * 1103515245 +
    view.junme * 12345 +
    view.wallRemaining * 2654435761;
  for (const t of view.ownClosed) h = ((h << 5) - h + t + 97) | 0;
  if (view.ownDrawn !== null) h = ((h << 5) - h + view.ownDrawn + 193) | 0;
  return Math.abs(h) % Math.max(1, length);
}
