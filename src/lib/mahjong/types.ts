// Tile encoding (0-33):
//   0-8   : 1m..9m (manzu)
//   9-17  : 1p..9p (pinzu)
//   18-26 : 1s..9s (souzu)
//   27-30 : E, S, W, N (winds)
//   31-33 : P (haku), F (hatsu), C (chun)
export type TileId = number;

export const NUM_TILES = 34;
export const TILES_PER_KIND = 4;

export const SUIT_M = 0;
export const SUIT_P = 1;
export const SUIT_S = 2;
export const SUIT_Z = 3;

export type Suit = 0 | 1 | 2 | 3;

export interface TileMeta {
  id: TileId;
  suit: Suit;
  rank: number; // 1-9 for m/p/s; 1-7 for honors (E=1..N=4, P=5, F=6, C=7)
  isHonor: boolean;
  isTerminal: boolean; // 1 or 9
  isYaochuu: boolean;  // terminal or honor
  isWind: boolean;
  isDragon: boolean;
}

export interface PlayerSeat {
  /** Round wind 1=E,2=S,3=W,4=N */
  roundWind: number;
  /** Seat wind 1=E,2=S,3=W,4=N */
  seatWind: number;
}

export interface HandState {
  /** 13 or 14 closed tiles */
  closed: TileId[];
  /** drawn tile when present (the 14th) */
  drawn: TileId | null;
  /** discards by self (river) */
  discards: TileId[];
  /** melds (calls) - kept simple for now */
  melds: Meld[];
  /** declared riichi */
  riichi: boolean;
}

export interface Meld {
  kind: "chi" | "pon" | "kan" | "ankan";
  tiles: TileId[];
}

export interface RoundInfo {
  round: number;       // 1=東1, 2=東2, ...
  honba: number;
  kyotaku: number;
  doraIndicators: TileId[];
  uradoraIndicators: TileId[];
  junme: number;       // current turn (1..)
  wallRemaining: number;
}

export interface GameState {
  hand: HandState;
  seat: PlayerSeat;
  round: RoundInfo;
  /** other players' rivers (for defense AI later) */
  opponentDiscards: TileId[][];
  opponentRiichi: boolean[];
}
