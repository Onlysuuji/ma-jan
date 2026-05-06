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
  balancedAgent4,
  pushFoldAgent4,
];

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
