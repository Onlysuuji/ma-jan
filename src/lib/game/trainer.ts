import type { TileId } from "../mahjong/types";
import { Mulberry32, dealInitial, type RNG } from "../mahjong/wall";
import { sortTiles } from "../mahjong/tiles";
import { doraFromIndicator } from "../mahjong/tiles";

export interface TrainerState {
  /** 13 closed tiles, sorted */
  closed: TileId[];
  /** the most recently drawn tile (14th) — null when waiting to draw */
  drawn: TileId | null;
  /** discard river */
  river: TileId[];
  /** remaining live wall */
  wall: TileId[];
  /** dora indicator(s) */
  doraIndicators: TileId[];
  /** dora tiles (derived) */
  doraTiles: TileId[];
  /** turn count (1-based; increments after each discard) */
  junme: number;
  /** seed used (for reproducibility / display) */
  seed: number;
  /** round info */
  round: number;
  roundWind: number;
  seatWind: number;
  /** when the wall is empty / hand is otherwise terminated */
  finished: boolean;
}

export function createTrainer(seed = Date.now() & 0x7fffffff): TrainerState {
  const rng = new Mulberry32(seed);
  const deal = dealInitial(rng);
  const closed = sortTiles(deal.hand);
  // After deal, the dealer (player) draws first to make 14 tiles
  const drawn = deal.wall[0];
  const wall = deal.wall.slice(1);
  return {
    closed,
    drawn,
    river: [],
    wall,
    doraIndicators: [deal.doraIndicator],
    doraTiles: [doraFromIndicator(deal.doraIndicator)],
    junme: 1,
    seed,
    round: 1,
    roundWind: 1,
    seatWind: 1,
    finished: false,
  };
}

/** Make a 14-tile array from the trainer state. */
export function fullHand(state: TrainerState): TileId[] {
  return state.drawn !== null ? sortTiles([...state.closed, state.drawn]) : state.closed.slice();
}

/**
 * Discard a tile. The tile must currently be present in closed+drawn.
 * After discard, automatically draws the next wall tile if possible.
 */
export function discard(state: TrainerState, tile: TileId): TrainerState {
  const all = fullHand(state);
  const idx = all.indexOf(tile);
  if (idx < 0) {
    throw new Error(`Tile ${tile} not in hand`);
  }
  const remaining = all.slice();
  remaining.splice(idx, 1);
  const closed = sortTiles(remaining); // 13 tiles

  const river = [...state.river, tile];

  if (state.wall.length === 0) {
    return {
      ...state,
      closed,
      drawn: null,
      river,
      junme: state.junme + 1,
      finished: true,
    };
  }

  const drawn = state.wall[0];
  const wall = state.wall.slice(1);

  return {
    ...state,
    closed,
    drawn,
    river,
    wall,
    junme: state.junme + 1,
  };
}

/** "Seen" tile counts outside the closed hand: river + dora indicators. */
export function seenCounts(state: TrainerState): number[] {
  const c = new Array(34).fill(0);
  for (const t of state.river) c[t]++;
  for (const t of state.doraIndicators) c[t]++;
  return c;
}
