import { NUM_TILES, type TileId } from "./types";
import { sortTiles, tilesToCounts, doraFromIndicator } from "./tiles";
import { Mulberry32, buildWall, shuffle } from "./wall";
import { isWin, isFuriten, waitingTiles } from "./win";
import { detectYaku, type YakuResult } from "./yaku";
import { shantenAllFromCounts } from "./shanten";

export interface MatchPlayer {
  closed: TileId[];          // sorted, length 13 (pre-draw) or 14 (post-draw, with drawn)
  drawn: TileId | null;
  river: TileId[];
  riichi: boolean;
  riichiJunme: number;       // -1 if not declared
  ippatsu: boolean;
  /** True if the hand is closed (no open calls). Always true in v1. */
  isClosed: boolean;
  score: number;
}

export interface MatchState {
  players: MatchPlayer[];
  /** Which player is about to act. Starts at the dealer. */
  currentPlayer: number;
  /** Live wall as a flat array. wallIdx points to the next tile to draw. */
  wall: TileId[];
  wallIdx: number;
  /** Dead wall (rinshan + dora indicators). */
  deadWall: TileId[];
  doraIndicators: TileId[];
  uradoraIndicators: TileId[];
  /** Round wind 1=E,2=S,3=W,4=N (kept at 1 for v1) */
  roundWind: number;
  /** seat winds for each player (cycling: dealer is East=1) */
  seatWinds: number[];
  honba: number;
  kyotaku: number;
  junme: number;
  /** Dealer index */
  dealer: number;
  finished: boolean;
  result: MatchResult | null;
  /** Tiles seen by all (for safety/ukeire calculations): river + dora indicators */
  seenCounts: number[];
  /** event log */
  log: MatchEvent[];
}

export type MatchEvent =
  | { kind: "deal"; seed: number }
  | { kind: "draw"; player: number; tile: TileId; junme: number }
  | { kind: "discard"; player: number; tile: TileId; riichi: boolean; junme: number }
  | { kind: "tsumo"; player: number; yaku: YakuResult }
  | { kind: "ron"; winner: number; loser: number; tile: TileId; yaku: YakuResult }
  | { kind: "ryukyoku"; tenpai: boolean[] };

export interface MatchResult {
  kind: "tsumo" | "ron" | "ryukyoku";
  winner?: number;
  loser?: number;
  tile?: TileId;
  yaku?: YakuResult;
  /** Score deltas applied to each seat (length 4). */
  deltas: number[];
  /** Was each player tenpai at ryukyoku? */
  tenpai?: boolean[];
}

export interface PlayerView {
  seatIndex: number;
  ownClosed: TileId[];      // 13 tiles
  ownDrawn: TileId | null;  // current draw, null after discard
  ownRiver: TileId[];
  ownRiichi: boolean;
  ownRiichiJunme: number;
  ownIsClosed: boolean;
  opponentRivers: TileId[][]; // 4-length, opponentRivers[seatIndex] = own
  opponentRiichi: boolean[];
  opponentRiichiJunme: number[];
  doraIndicators: TileId[];
  doraTiles: TileId[];
  roundWind: number;
  seatWind: number;
  junme: number;
  wallRemaining: number;
  /** Counts of tiles seen outside the player's own hand (rivers + dora indicators) */
  seenCounts: number[];
}

export interface Agent4 {
  name: string;
  /** Choose which tile to discard, and whether to declare riichi. */
  decideDiscard(view: PlayerView): { tile: TileId; riichi: boolean };
  /** Decide whether to declare a tsumo win (only called if win is legal). */
  decideTsumo(view: PlayerView, winTile: TileId, yaku: YakuResult): boolean;
  /** Decide whether to declare a ron (only called if win is legal). */
  decideRon(view: PlayerView, winTile: TileId, fromSeat: number, yaku: YakuResult): boolean;
}

export function createMatch(seed: number, dealer = 0): MatchState {
  const rng = new Mulberry32(seed);
  const all = shuffle(buildWall(), rng);

  const players: MatchPlayer[] = Array.from({ length: 4 }, () => ({
    closed: [],
    drawn: null,
    river: [],
    riichi: false,
    riichiJunme: -1,
    ippatsu: false,
    isClosed: true,
    score: 25000,
  }));

  // Deal 13 tiles to each player (dealer first)
  let cursor = 0;
  for (let i = 0; i < 4; i++) {
    const seat = (dealer + i) % 4;
    players[seat].closed = sortTiles(all.slice(cursor, cursor + 13));
    cursor += 13;
  }

  // Dead wall: 14 tiles at the end
  const deadWall = all.slice(all.length - 14);
  // Dora indicator is dead-wall tile index 4 (5th tile)
  const doraIndicators = [deadWall[4]];
  const uradoraIndicators = [deadWall[5]];

  const wall = all.slice(cursor, all.length - 14);
  const seatWinds = [1, 2, 3, 4]; // East South West North; player 0 is East dealer

  const seenCounts = new Array(NUM_TILES).fill(0);
  for (const t of doraIndicators) seenCounts[t]++;

  return {
    players,
    currentPlayer: dealer,
    wall,
    wallIdx: 0,
    deadWall,
    doraIndicators,
    uradoraIndicators,
    roundWind: 1,
    seatWinds,
    honba: 0,
    kyotaku: 0,
    junme: 1,
    dealer,
    finished: false,
    result: null,
    seenCounts,
    log: [{ kind: "deal", seed }],
  };
}

function makeView(state: MatchState, seat: number): PlayerView {
  const p = state.players[seat];
  return {
    seatIndex: seat,
    ownClosed: p.closed.slice(),
    ownDrawn: p.drawn,
    ownRiver: p.river.slice(),
    ownRiichi: p.riichi,
    ownRiichiJunme: p.riichiJunme,
    ownIsClosed: p.isClosed,
    opponentRivers: state.players.map((q) => q.river.slice()),
    opponentRiichi: state.players.map((q) => q.riichi),
    opponentRiichiJunme: state.players.map((q) => q.riichiJunme),
    doraIndicators: state.doraIndicators.slice(),
    doraTiles: state.doraIndicators.map(doraFromIndicator),
    roundWind: state.roundWind,
    seatWind: state.seatWinds[seat],
    junme: state.junme,
    wallRemaining: state.wall.length - state.wallIdx,
    seenCounts: state.seenCounts.slice(),
  };
}

/** Convert tenpai shanten to bool for ryukyoku checks. */
function isTenpaiNow(closed: TileId[]): boolean {
  return shantenAllFromCounts(tilesToCounts(closed)).shanten <= 0;
}

/**
 * Run an entire hand (no calls) until someone wins or the wall exhausts.
 * Returns the final state.
 */
export function playHand(state: MatchState, agents: Agent4[]): MatchState {
  let cur = state;
  while (!cur.finished) {
    cur = stepHand(cur, agents);
  }
  return cur;
}

/** Single step: one player's draw + discard, plus ron checks. */
export function stepHand(state: MatchState, agents: Agent4[]): MatchState {
  if (state.finished) return state;

  const seat = state.currentPlayer;
  const player = state.players[seat];

  // Out of wall → ryukyoku
  if (state.wallIdx >= state.wall.length) {
    const tenpai = state.players.map((p) => isTenpaiNow(p.closed));
    const tenpaiCount = tenpai.filter(Boolean).length;
    const deltas = computeNoTenDeltas(tenpai);
    return {
      ...state,
      finished: true,
      result: {
        kind: "ryukyoku",
        deltas,
        tenpai,
      },
      log: [...state.log, { kind: "ryukyoku", tenpai }],
    };
  }

  const drawnTile = state.wall[state.wallIdx];
  const newWallIdx = state.wallIdx + 1;
  player.drawn = drawnTile;
  let log: MatchEvent[] = [
    ...state.log,
    { kind: "draw", player: seat, tile: drawnTile, junme: state.junme },
  ];

  // Tsumo check
  const candidate14 = sortTiles([...player.closed, drawnTile]);
  if (isWin(candidate14)) {
    const yaku = detectYaku({
      closed14: candidate14,
      agariTile: drawnTile,
      isTsumo: true,
      isClosed: player.isClosed,
      isRiichi: player.riichi,
      isIppatsu: player.riichi && player.ippatsu,
      isHaitei: newWallIdx === state.wall.length,
      isHoutei: false,
      roundWind: state.roundWind,
      seatWind: state.seatWinds[seat],
      doraTiles: state.doraIndicators.map(doraFromIndicator),
      uradoraTiles: player.riichi
        ? state.uradoraIndicators.map(doraFromIndicator)
        : undefined,
    });
    if (yaku.hasYaku || yaku.yakumanCount > 0) {
      const view = makeView({ ...state, wallIdx: newWallIdx }, seat);
      const decision = agents[seat].decideTsumo(view, drawnTile, yaku);
      if (decision) {
        const deltas = computeTsumoDeltas(yaku, seat, state.dealer);
        return {
          ...state,
          wallIdx: newWallIdx,
          finished: true,
          result: { kind: "tsumo", winner: seat, tile: drawnTile, yaku, deltas },
          log: [...log, { kind: "tsumo", player: seat, yaku }],
        };
      }
    }
  }

  // Discard decision
  const view = makeView({ ...state, wallIdx: newWallIdx }, seat);
  const decision = agents[seat].decideDiscard(view);
  let { tile: discardTile, riichi: requestRiichi } = decision;

  // Validate discard tile is in hand
  const handAfterDraw = [...player.closed, drawnTile];
  if (player.riichi) {
    // After riichi, the player is locked into tsumogiri in this no-call model.
    discardTile = drawnTile;
    requestRiichi = false;
  } else if (!handAfterDraw.includes(discardTile)) {
    // Fallback: discard the drawn tile (tsumogiri)
    discardTile = drawnTile;
    requestRiichi = false;
  }

  // Riichi gating: hand must be closed, not already riichi'd, and 13-tile-hand-after-discard is tenpai
  let didRiichi = false;
  if (requestRiichi && !player.riichi && player.isClosed) {
    const remaining = removeOnce(handAfterDraw, discardTile);
    if (shantenAllFromCounts(tilesToCounts(remaining)).shanten === 0) {
      didRiichi = true;
    }
  }

  // Apply discard
  const newClosed = sortTiles(removeOnce(handAfterDraw, discardTile));
  player.closed = newClosed;
  player.drawn = null;
  player.river.push(discardTile);
  state.seenCounts[discardTile]++;

  if (didRiichi) {
    player.riichi = true;
    player.riichiJunme = state.junme;
    player.ippatsu = true;
    state.kyotaku += 1; // we'll count in kyotaku 1000-units when scoring
  }

  log = [
    ...log,
    { kind: "discard", player: seat, tile: discardTile, riichi: didRiichi, junme: state.junme },
  ];

  // Check ron from other players
  for (let i = 1; i <= 3; i++) {
    const oppSeat = (seat + i) % 4;
    const opp = state.players[oppSeat];
    const oppHand = sortTiles([...opp.closed, discardTile]);
    if (!isWin(oppHand)) continue;
    if (isFuriten(opp.closed, opp.river)) continue;
    // Riichi-imposed furiten not modeled deeply; basic furiten only
    const yaku = detectYaku({
      closed14: oppHand,
      agariTile: discardTile,
      isTsumo: false,
      isClosed: opp.isClosed,
      isRiichi: opp.riichi,
      isIppatsu: opp.riichi && opp.ippatsu,
      isHaitei: false,
      isHoutei: newWallIdx === state.wall.length,
      roundWind: state.roundWind,
      seatWind: state.seatWinds[oppSeat],
      doraTiles: state.doraIndicators.map(doraFromIndicator),
      uradoraTiles: opp.riichi
        ? state.uradoraIndicators.map(doraFromIndicator)
        : undefined,
    });
    if (!yaku.hasYaku && yaku.yakumanCount === 0) continue;
    const ronView = makeView({ ...state, wallIdx: newWallIdx }, oppSeat);
    const ronDecision = agents[oppSeat].decideRon(ronView, discardTile, seat, yaku);
    if (ronDecision) {
      const deltas = computeRonDeltas(yaku, oppSeat, seat, state.dealer);
      return {
        ...state,
        wallIdx: newWallIdx,
        finished: true,
        result: { kind: "ron", winner: oppSeat, loser: seat, tile: discardTile, yaku, deltas },
        log: [...log, { kind: "ron", winner: oppSeat, loser: seat, tile: discardTile, yaku }],
      };
    }
  }

  // Cancel all opponents' ippatsu after this discard (anyone who'd previously declared riichi loses ippatsu after a single round)
  for (const p of state.players) {
    if (p.riichi && state.players.indexOf(p) !== seat) {
      // Ippatsu actually expires when its declarer's next draw occurs without a win.
      // Simpler model: ippatsu expires after one full round of any discard; since we're stepping per-discard,
      // expire it here for non-self players. Ippatsu of self (seat) remains until next round of own draws.
      p.ippatsu = false;
    }
  }
  // Also expire own ippatsu after the player's own discard (it's only valid for the immediate next own win)
  // Actually ippatsu = win within one go-round of riichi. We'll set ippatsu=false for the riichi declarer
  // on their next draw where they don't win. For simplicity, expire ippatsu of the discarding player too,
  // since after they discard a non-winning tile, ippatsu was already only for the just-drawn tile (which we did check).

  // Advance turn
  const nextSeat = (seat + 1) % 4;
  const nextJunme = nextSeat === state.dealer ? state.junme + 1 : state.junme;
  return {
    ...state,
    wallIdx: newWallIdx,
    currentPlayer: nextSeat,
    junme: nextJunme,
    log,
  };
}

function removeOnce<T>(arr: T[], val: T): T[] {
  const out = arr.slice();
  const idx = out.indexOf(val);
  if (idx >= 0) out.splice(idx, 1);
  return out;
}

/** Score deltas (point change per seat) for a tsumo win. */
function computeTsumoDeltas(yaku: YakuResult, winner: number, dealer: number): number[] {
  const han = yaku.yakumanCount > 0 ? 13 * yaku.yakumanCount : yaku.hanTotal;
  const basePts = baseScore(han);
  const deltas = [0, 0, 0, 0];
  const isDealer = winner === dealer;
  if (isDealer) {
    // Each non-dealer pays 2 * base
    const each = roundUp100(basePts * 2);
    for (let i = 0; i < 4; i++) {
      if (i === winner) deltas[i] = each * 3;
      else deltas[i] = -each;
    }
  } else {
    const dealerPays = roundUp100(basePts * 2);
    const nonDealerPays = roundUp100(basePts * 1);
    for (let i = 0; i < 4; i++) {
      if (i === winner) deltas[i] = dealerPays + nonDealerPays * 2;
      else if (i === dealer) deltas[i] = -dealerPays;
      else deltas[i] = -nonDealerPays;
    }
  }
  return deltas;
}

function computeRonDeltas(
  yaku: YakuResult,
  winner: number,
  loser: number,
  dealer: number
): number[] {
  const han = yaku.yakumanCount > 0 ? 13 * yaku.yakumanCount : yaku.hanTotal;
  const basePts = baseScore(han);
  const isDealer = winner === dealer;
  const total = roundUp100(basePts * (isDealer ? 6 : 4));
  const deltas = [0, 0, 0, 0];
  deltas[winner] = total;
  deltas[loser] = -total;
  return deltas;
}

function computeNoTenDeltas(tenpai: boolean[]): number[] {
  const tenpaiCount = tenpai.filter(Boolean).length;
  if (tenpaiCount === 0 || tenpaiCount === 4) return [0, 0, 0, 0];
  const noten = 4 - tenpaiCount;
  const totalPenalty = 3000;
  const eachPay = totalPenalty / noten;
  const eachReceive = totalPenalty / tenpaiCount;
  return tenpai.map((t) => (t ? eachReceive : -eachPay));
}

/** Approximate base score from han only (treating fu = 30 always). */
function baseScore(han: number): number {
  // Mangan and above
  if (han >= 13) return 8000;
  if (han >= 11) return 6000;
  if (han >= 8) return 4000;
  if (han >= 6) return 3000;
  if (han >= 5) return 2000;
  // Below mangan: fu * 2^(han+2). Use fu=30.
  const fu = 30;
  let bp = fu * Math.pow(2, han + 2);
  if (bp > 2000) bp = 2000;
  return bp;
}

function roundUp100(n: number): number {
  return Math.ceil(n / 100) * 100;
}
