import type { TileId } from "../mahjong/types";
import { tilesToCounts } from "../mahjong/tiles";
import { shantenAllFromCounts } from "../mahjong/shanten";
import { ukeireFromCounts } from "../mahjong/ukeire";
import { evaluateDiscards, type EvaluatorContext } from "./evaluator";

export interface AgentContext extends Partial<EvaluatorContext> {
  /** RNG used for tie-breaking and random agents */
  rand: () => number;
}

export interface Agent {
  name: string;
  /** Choose a tile to discard from a 14-tile hand. */
  pickDiscard(hand14: TileId[], ctx: AgentContext): TileId;
}

/** Discards a uniformly random tile from the 14-tile hand. */
export const randomAgent: Agent = {
  name: "random",
  pickDiscard(hand14, ctx) {
    const idx = Math.floor(ctx.rand() * hand14.length);
    return hand14[idx];
  },
};

/**
 * Greedy: pick the discard whose 13-tile hand has the lowest shanten.
 * Ties broken by ukeire count (more is better), then random.
 */
export const simpleShantenAgent: Agent = {
  name: "simple-shanten",
  pickDiscard(hand14, ctx) {
    const counts = tilesToCounts(hand14);
    let bestTile = hand14[0];
    let bestShanten = Infinity;
    let bestUkeire = -1;
    const seen = new Set<number>();

    for (const id of hand14) {
      if (seen.has(id)) continue;
      seen.add(id);
      counts[id]--;
      const sh = shantenAllFromCounts(counts).shanten;
      let uke = 0;
      if (sh <= bestShanten) {
        // only compute ukeire when potentially competitive
        uke = ukeireFromCounts(counts).total;
      }
      counts[id]++;
      if (
        sh < bestShanten ||
        (sh === bestShanten && uke > bestUkeire) ||
        (sh === bestShanten && uke === bestUkeire && ctx.rand() < 0.5)
      ) {
        bestTile = id;
        bestShanten = sh;
        bestUkeire = uke;
      }
    }
    return bestTile;
  },
};

/** Current full evaluator (shanten + ukeire + dora + han + safety). */
export const currentAgent: Agent = {
  name: "current",
  pickDiscard(hand14, ctx) {
    const ec: EvaluatorContext = {
      doraTiles: ctx.doraTiles ?? [],
      seenCounts: ctx.seenCounts,
      roundWind: ctx.roundWind ?? 1,
      seatWind: ctx.seatWind ?? 1,
      junme: ctx.junme,
    };
    const res = evaluateDiscards(hand14, ec);
    return res.best.tile;
  },
};

export const ALL_AGENTS: Agent[] = [randomAgent, simpleShantenAgent, currentAgent];
