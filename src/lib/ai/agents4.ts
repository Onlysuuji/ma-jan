import type {
  Agent4,
  PlayerView,
} from "../mahjong/match";
import { NUM_TILES, TILES_PER_KIND, type TileId } from "../mahjong/types";
import type { YakuResult } from "../mahjong/yaku";
import { sortTiles, tilesToCounts } from "../mahjong/tiles";
import { countDora, isYakuhai } from "../mahjong/score";
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
  decidePon: (_v: PlayerView, _t: TileId, _f: number) => ({ call: false }),
  decideChi: (_v: PlayerView, _t: TileId, _f: number) => ({ call: false }),
  decideKan: (_v: PlayerView, _t: TileId, _f: number | null) => ({ call: false }),
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
    if (view.ownMelds.length > 0) return { tile: chooseOpenHandDiscard(hand, view), riichi: false };
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
    if (view.ownMelds.length > 0) return { tile: chooseOpenHandDiscard(hand, view), riichi: false };
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
    if (view.ownMelds.length > 0) return { tile: chooseOpenHandDiscard(hand, view), riichi: false };
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
    if (view.ownMelds.length > 0) return { tile: chooseOpenHandDiscard(hand, view), riichi: false };
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

/** World candidate: attack-first, then push/fold by shanten, value, wait quality, and discard danger. */
export const worldAgent4: Agent4 = {
  name: "world",
  ...alwaysWin,
  decidePon(view, tile, _fromSeat) {
    if (view.ownRiichi) return { call: false };
    if (view.ownClosed.filter((t) => t === tile).length < 2) return { call: false };
    const isValueCall = isYakuhai(tile, view.roundWind, view.seatWind);
    const isKuitanCall = canOpenTanyao([...view.ownClosed, tile]);
    if (!isValueCall && !isKuitanCall) return { call: false };
    const currentShanten = shantenAllFromCounts(tilesToCounts(view.ownClosed)).shanten;
    if (currentShanten <= 0 && !isValueCall) return { call: false };

    const afterCall = removeOnce(removeOnce(view.ownClosed, tile), tile);
    const discard = choosePostPonDiscard(afterCall, view);
    return { call: true, discard };
  },
  decideChi(view, tile, fromSeat) {
    if (view.ownRiichi) return { call: false };
    if (fromSeat !== (view.seatIndex + 3) % 4) return { call: false };
    if (!isSimple(tile)) return { call: false };
    if (!canOpenTanyao([...view.ownClosed, tile])) return { call: false };
    const currentShanten = shantenAllFromCounts(tilesToCounts(view.ownClosed)).shanten;
    if (currentShanten <= 0 || currentShanten >= 4) return { call: false };

    const options = possibleChiMelds(view.ownClosed, tile);
    if (options.length === 0) return { call: false };
    let bestTiles = options[0];
    let bestDiscard = chooseOpenHandDiscard(removeChiTiles(view.ownClosed, bestTiles, tile), view);
    let bestScore = -Infinity;
    for (const tiles of options) {
      const afterCall = removeChiTiles(view.ownClosed, tiles, tile);
      const discard = chooseOpenHandDiscard(afterCall, view);
      const kept = removeOnce(afterCall, discard);
      const score = neighborCount(discard, kept) * -40 - (countDora([discard], view.doraTiles) * 500);
      if (score > bestScore) {
        bestTiles = tiles;
        bestDiscard = discard;
        bestScore = score;
      }
    }
    return { call: true, tiles: bestTiles, discard: bestDiscard };
  },
  decideKan(view, tile, fromSeat) {
    if (fromSeat === null || view.ownRiichi) return { call: false };
    if (!isYakuhai(tile, view.roundWind, view.seatWind)) return { call: false };
    if (view.ownClosed.filter((t) => t === tile).length < 3) return { call: false };
    const currentShanten = shantenAllFromCounts(tilesToCounts(view.ownClosed)).shanten;
    return { call: currentShanten >= 2 };
  },
  decideDiscard(view) {
    const locked = riichiTsumogiri(view);
    if (locked) return locked;
    const hand = fullHand(view);
    if (view.ownMelds.length > 0) return { tile: chooseOpenHandDiscard(hand, view), riichi: false };
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
    const best = chooseWorldCandidate(r.candidates, view, hand);
    const becomesTenpai = best.resultingShanten === 0;
    return {
      tile: best.tile,
      riichi:
        becomesTenpai &&
        view.ownIsClosed &&
        !view.ownRiichi &&
        shouldDeclareWorldRiichi(best, view),
    };
  },
};

/** Dealer-aware attacker: folds only far hands against dealer riichi. */
export const seatAwareAgent4: Agent4 = {
  name: "seat-aware",
  decideDiscard(view) {
    const locked = riichiTsumogiri(view);
    if (locked) return locked;
    const hand = fullHand(view);
    if (view.ownMelds.length > 0) return { tile: chooseOpenHandDiscard(hand, view), riichi: false };
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
    if (view.ownMelds.length > 0) return { tile: chooseOpenHandDiscard(hand, view), riichi: false };
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
    if (view.ownMelds.length > 0) return { tile: chooseOpenHandDiscard(hand, view), riichi: false };
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
    if (view.ownMelds.length > 0) return { tile: chooseOpenHandDiscard(hand, view), riichi: false };
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
  for (let idx = 0; idx < candidates.length; idx++) {
    const c = candidates[idx];
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

function chooseWorldCandidate(
  candidates: ReturnType<typeof evaluateDiscards>["candidates"],
  view: PlayerView,
  hand14: TileId[]
) {
  const opponentRiichiCount = view.opponentRiichi.filter((b, i) => i !== view.seatIndex && b).length;
  const dealerRiichi = view.seatIndex !== 0 && view.opponentRiichi[0];
  const lateHand = view.junme >= 12;
  const promiseMemo = new Map<TileId, number>();

  let best = candidates[0];
  let bestScore = -Infinity;
  for (let idx = 0; idx < candidates.length; idx++) {
    const c = candidates[idx];
    const value = c.hanPotential + c.doraCount;
    const tenpaiWait =
      c.resultingShanten === 0
        ? c.ukeireCount * 130 +
          c.ukeireKinds * 90 -
          (c.ukeireKinds === 1 ? 420 : 0) -
          (c.ukeireCount <= 3 ? 300 : 0)
        : 0;
    const oneShantenShape =
      c.resultingShanten === 1
        ? c.ukeireCount * 38 + c.ukeireKinds * 28 + value * 120
        : 0;
    const lateSpeed =
      lateHand && c.resultingShanten <= 1
        ? c.ukeireCount * 35 + c.ukeireKinds * 20
        : 0;
    const monteCarloPromise =
      opponentRiichiCount === 0 && idx < 3 && c.resultingShanten <= 1
        ? worldOneStepPromise(c.tile, hand14, view.seenCounts, promiseMemo)
        : 0;

    let score =
      c.score +
      tenpaiWait +
      oneShantenShape +
      lateSpeed +
      monteCarloPromise +
      value * 170;

    if (opponentRiichiCount > 0) {
      const pressure = opponentRiichiCount * (dealerRiichi ? 1.3 : 1) * (lateHand ? 1.25 : 1);
      const riskWeight = worldRiskWeight(c, value, view);
      score -= c.danger * riskWeight * pressure;

      // Keep a real betaori shelf: when the hand is not ready, exact safety can beat small speed gains.
      if (c.danger === 0 && c.resultingShanten >= 1) score += 2800 * opponentRiichiCount;
      else if (c.danger < 0.18 && c.resultingShanten >= 1) score += 850 * opponentRiichiCount;
    }

    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

function worldOneStepPromise(
  discard: TileId,
  hand14: TileId[],
  seenCounts: number[],
  memo: Map<TileId, number>
): number {
  const cached = memo.get(discard);
  if (cached !== undefined) return cached;

  const tiles13 = removeOnce(hand14, discard);
  const counts = tilesToCounts(tiles13);
  const baseShanten = shantenAllFromCounts(counts).shanten;
  const sampleTiles = deterministicWallSamples(counts, seenCounts, 3);
  if (sampleTiles.length === 0) {
    memo.set(discard, 0);
    return 0;
  }

  let total = 0;
  for (const draw of sampleTiles) {
    counts[draw]++;
    let bestShanten = Infinity;
    for (let id = 0; id < NUM_TILES; id++) {
      if (counts[id] === 0) continue;
      counts[id]--;
      const shanten = shantenAllFromCounts(counts).shanten;
      counts[id]++;
      if (shanten < bestShanten) bestShanten = shanten;
    }
    counts[draw]--;
    total += (baseShanten - bestShanten) * 520 + (bestShanten === 0 ? 160 : 0);
  }

  const value = total / sampleTiles.length;
  memo.set(discard, value);
  return value;
}

function deterministicWallSamples(
  ownCounts: number[],
  seenCounts: number[],
  limit: number
): TileId[] {
  const weighted: { tile: TileId; weight: number }[] = [];
  for (let id = 0; id < NUM_TILES; id++) {
    const remaining = TILES_PER_KIND - ownCounts[id] - (seenCounts[id] ?? 0);
    for (let i = 0; i < remaining; i++) {
      const weight = ((id + 3) * 1103515245 + (i + 1) * 2654435761) >>> 0;
      weighted.push({ tile: id, weight });
    }
  }
  weighted.sort((a, b) => a.weight - b.weight);
  return weighted.slice(0, limit).map((x) => x.tile);
}

function removeOnce<T>(arr: T[], val: T): T[] {
  const out = arr.slice();
  const idx = out.indexOf(val);
  if (idx >= 0) out.splice(idx, 1);
  return out;
}

function worldRiskWeight(
  c: ReturnType<typeof evaluateDiscards>["best"],
  value: number,
  view: PlayerView
): number {
  if (c.resultingShanten <= 0) {
    const goodWait = c.ukeireKinds >= 2 || c.ukeireCount >= 5;
    return Math.max(450, 1250 - value * 180 - (goodWait ? 260 : 0));
  }
  if (c.resultingShanten === 1) {
    const speed = c.ukeireCount * 45 + c.ukeireKinds * 35;
    const base = view.junme >= 12 ? 7600 : 5600;
    return Math.max(1700, base - value * 390 - speed);
  }
  return view.junme >= 10 ? 17000 : 12000;
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

function shouldDeclareWorldRiichi(
  c: ReturnType<typeof evaluateDiscards>["best"],
  view: PlayerView
): boolean {
  const opponentRiichi = view.opponentRiichi.some((b, i) => i !== view.seatIndex && b);
  const value = c.hanPotential + c.doraCount;
  const goodWait = c.ukeireKinds >= 2 || c.ukeireCount >= 5;
  if (opponentRiichi) {
    if (c.danger >= 0.55 && value < 2 && !goodWait) return false;
    return value >= 1 || goodWait || view.junme >= 11;
  }
  if (view.junme <= 6 && !goodWait && value === 0) return false;
  return shouldDeclareRiichi(c, view);
}

function choosePostPonDiscard(tiles11: TileId[], view: PlayerView): TileId {
  return chooseOpenHandDiscard(tiles11, view);
}

function possibleChiMelds(closed: TileId[], called: TileId): TileId[][] {
  if (called >= 27) return [];
  const out: TileId[][] = [];
  const suitStart = Math.floor(called / 9) * 9;
  for (const start of [called - 2, called - 1, called]) {
    if (start < suitStart || start + 2 >= suitStart + 9) continue;
    const tiles = [start, start + 1, start + 2];
    const needed = tiles.filter((t) => t !== called);
    if (needed.every((t) => closed.includes(t)) && tiles.every(isSimple)) out.push(tiles);
  }
  return out;
}

function removeChiTiles(closed: TileId[], meldTiles: TileId[], called: TileId): TileId[] {
  let out = closed.slice();
  for (const tile of meldTiles) {
    if (tile === called) continue;
    out = removeOnce(out, tile);
  }
  return out;
}

function chooseOpenHandDiscard(tiles: TileId[], view: PlayerView): TileId {
  let best = tiles[0];
  let bestScore = Infinity;
  for (const tile of new Set(tiles)) {
    const remaining = removeOnce(tiles, tile);
    const dora = countDora([tile], view.doraTiles);
    let score = 0;
    score += isYakuhai(tile, view.roundWind, view.seatWind) ? 900 : 0;
    score += dora * 700;
    score += keepsPair(tile, remaining) ? 180 : 0;
    score += neighborCount(tile, remaining) * 90;
    score -= tile >= 27 ? 80 : 0;
    score -= tile % 9 === 0 || tile % 9 === 8 ? 30 : 0;
    if (score < bestScore) {
      best = tile;
      bestScore = score;
    }
  }
  return best;
}

function canOpenTanyao(tiles: TileId[]): boolean {
  return tiles.length > 0 && tiles.every(isSimple);
}

function isSimple(tile: TileId): boolean {
  return tile < 27 && tile % 9 !== 0 && tile % 9 !== 8;
}

function keepsPair(tile: TileId, tiles: TileId[]): boolean {
  return tiles.filter((t) => t === tile).length >= 2;
}

function neighborCount(tile: TileId, tiles: TileId[]): number {
  if (tile >= 27) return 0;
  let n = 0;
  for (const other of tiles) {
    if (other >= 27) continue;
    if (Math.floor(other / 9) !== Math.floor(tile / 9)) continue;
    const d = Math.abs((other % 9) - (tile % 9));
    if (d === 1) n += 2;
    else if (d === 2) n += 1;
  }
  return n;
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
