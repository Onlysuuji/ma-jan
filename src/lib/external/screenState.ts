import { NUM_TILES, TILES_PER_KIND, type TileId } from "@/lib/mahjong/types";

export interface ExternalScreenState {
  source: "screen-reader";
  capturedAt: string;
  receivedAt: string;
  hand: TileId[];
  drawn: TileId | null;
  redHandIndices: number[];
  redDrawn: boolean;
  doraIndicators: TileId[];
  ownRiver: TileId[];
  opponentRivers: TileId[][];
  currentPlayer: number | null;
  riichiPlayers: boolean[];
  confidence: number;
  warnings: string[];
}

export interface ExternalScreenPayload {
  source?: unknown;
  capturedAt?: unknown;
  hand?: unknown;
  drawn?: unknown;
  redHandIndices?: unknown;
  redDrawn?: unknown;
  doraIndicators?: unknown;
  ownRiver?: unknown;
  opponentRivers?: unknown;
  currentPlayer?: unknown;
  riichiPlayers?: unknown;
  confidence?: unknown;
}

export interface ParseResult {
  ok: boolean;
  state?: ExternalScreenState;
  errors: string[];
}

const MAX_RIVER_TILES = 30;
const MAX_DORA_INDICATORS = 5;

export function parseExternalScreenPayload(
  payload: ExternalScreenPayload,
  receivedAt = new Date().toISOString()
): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!payload || typeof payload !== "object") {
    return { ok: false, errors: ["payload must be an object"] };
  }

  if (payload.source !== "screen-reader") {
    errors.push("source must be screen-reader");
  }

  const capturedAt =
    typeof payload.capturedAt === "string" && payload.capturedAt.trim()
      ? payload.capturedAt
      : receivedAt;

  const hand = readTileArray(payload.hand, "hand", 14, errors);
  const drawn = readOptionalTile(payload.drawn, "drawn", errors);
  const redHandIndices = readIndexArray(payload.redHandIndices ?? [], "redHandIndices", hand.length, errors);
  const redDrawn = readOptionalBoolean(payload.redDrawn, "redDrawn", errors);
  const doraIndicators = readTileArray(
    payload.doraIndicators ?? [],
    "doraIndicators",
    MAX_DORA_INDICATORS,
    errors
  );
  const ownRiver = readTileArray(payload.ownRiver ?? [], "ownRiver", MAX_RIVER_TILES, errors);
  const opponentRivers = readOpponentRivers(payload.opponentRivers ?? [[], [], []], errors);
  const currentPlayer = readOptionalSeat(payload.currentPlayer, "currentPlayer", errors);
  const riichiPlayers = readSeatBooleanArray(payload.riichiPlayers ?? [false, false, false, false], "riichiPlayers", errors);
  const confidence = readConfidence(payload.confidence, errors);

  const fullHandLength = hand.length + (drawn === null ? 0 : 1);
  if (fullHandLength !== 13 && fullHandLength !== 14) {
    warnings.push(`hand + drawn should contain 13 or 14 tiles, got ${fullHandLength}`);
  }

  const counts = new Array(NUM_TILES).fill(0);
  for (const tile of [...hand, ...(drawn === null ? [] : [drawn])]) {
    counts[tile]++;
    if (counts[tile] > TILES_PER_KIND) {
      errors.push(`tile ${tile} appears more than ${TILES_PER_KIND} times in hand`);
      break;
    }
  }

  if (confidence < 0.75) {
    warnings.push(`confidence is below recommended threshold: ${confidence.toFixed(2)}`);
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    state: {
      source: "screen-reader",
      capturedAt,
      receivedAt,
      hand,
      drawn,
      redHandIndices,
      redDrawn,
      doraIndicators,
      ownRiver,
      opponentRivers,
      currentPlayer,
      riichiPlayers,
      confidence,
      warnings,
    },
  };
}

export function externalFullHand(state: ExternalScreenState): TileId[] {
  return state.drawn === null ? state.hand : [...state.hand, state.drawn];
}

function readTileArray(
  value: unknown,
  field: string,
  maxLength: number,
  errors: string[]
): TileId[] {
  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array`);
    return [];
  }
  if (value.length > maxLength) {
    errors.push(`${field} must have at most ${maxLength} tiles`);
    return [];
  }
  const tiles: TileId[] = [];
  value.forEach((item, index) => {
    if (!isTileId(item)) {
      errors.push(`${field}[${index}] must be a tile id from 0 to ${NUM_TILES - 1}`);
      return;
    }
    tiles.push(item);
  });
  return tiles;
}

function readOptionalTile(value: unknown, field: string, errors: string[]): TileId | null {
  if (value === undefined || value === null) return null;
  if (!isTileId(value)) {
    errors.push(`${field} must be null or a tile id from 0 to ${NUM_TILES - 1}`);
    return null;
  }
  return value;
}

function readOpponentRivers(value: unknown, errors: string[]): TileId[][] {
  if (!Array.isArray(value)) {
    errors.push("opponentRivers must be an array");
    return [[], [], []];
  }
  if (value.length !== 3) {
    errors.push("opponentRivers must contain exactly 3 arrays");
    return [[], [], []];
  }
  return value.map((river, index) =>
    readTileArray(river, `opponentRivers[${index}]`, MAX_RIVER_TILES, errors)
  );
}

function readConfidence(value: unknown, errors: string[]): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push("confidence must be a finite number");
    return 0;
  }
  if (value < 0 || value > 1) {
    errors.push("confidence must be between 0 and 1");
    return 0;
  }
  return value;
}

function readIndexArray(
  value: unknown,
  field: string,
  maxExclusive: number,
  errors: string[]
): number[] {
  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array`);
    return [];
  }
  const indices: number[] = [];
  value.forEach((item, index) => {
    if (
      typeof item !== "number" ||
      !Number.isInteger(item) ||
      item < 0 ||
      item >= maxExclusive
    ) {
      errors.push(`${field}[${index}] must be a hand index from 0 to ${maxExclusive - 1}`);
      return;
    }
    if (!indices.includes(item)) indices.push(item);
  });
  return indices;
}

function readOptionalBoolean(value: unknown, field: string, errors: string[]): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value !== "boolean") {
    errors.push(`${field} must be a boolean`);
    return false;
  }
  return value;
}

function readOptionalSeat(value: unknown, field: string, errors: string[]): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 3) {
    errors.push(`${field} must be null or a seat index from 0 to 3`);
    return null;
  }
  return value;
}

function readSeatBooleanArray(value: unknown, field: string, errors: string[]): boolean[] {
  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array`);
    return [false, false, false, false];
  }
  if (value.length !== 4) {
    errors.push(`${field} must contain exactly 4 booleans`);
    return [false, false, false, false];
  }
  return value.map((item, index) => {
    if (typeof item !== "boolean") {
      errors.push(`${field}[${index}] must be a boolean`);
      return false;
    }
    return item;
  });
}

function isTileId(value: unknown): value is TileId {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < NUM_TILES;
}
