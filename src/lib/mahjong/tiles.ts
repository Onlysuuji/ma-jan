import {
  NUM_TILES,
  TILES_PER_KIND,
  SUIT_M,
  SUIT_P,
  SUIT_S,
  SUIT_Z,
  type Suit,
  type TileId,
  type TileMeta,
} from "./types";

const SUIT_LETTERS = ["m", "p", "s", "z"];

const HONOR_KANJI: Record<number, string> = {
  1: "東",
  2: "南",
  3: "西",
  4: "北",
  5: "白",
  6: "發",
  7: "中",
};

export function tileSuit(id: TileId): Suit {
  if (id < 9) return SUIT_M;
  if (id < 18) return SUIT_P;
  if (id < 27) return SUIT_S;
  return SUIT_Z;
}

export function tileRank(id: TileId): number {
  if (id < 27) return (id % 9) + 1;
  return id - 26; // honors 1..7
}

export function makeTile(suit: Suit, rank: number): TileId {
  if (suit === SUIT_Z) return 26 + rank;
  return suit * 9 + (rank - 1);
}

export function isHonor(id: TileId): boolean {
  return id >= 27;
}

export function isTerminal(id: TileId): boolean {
  if (id >= 27) return false;
  const r = (id % 9) + 1;
  return r === 1 || r === 9;
}

export function isYaochuu(id: TileId): boolean {
  return isHonor(id) || isTerminal(id);
}

export function isWind(id: TileId): boolean {
  return id >= 27 && id <= 30;
}

export function isDragon(id: TileId): boolean {
  return id >= 31 && id <= 33;
}

export function tileMeta(id: TileId): TileMeta {
  return {
    id,
    suit: tileSuit(id),
    rank: tileRank(id),
    isHonor: isHonor(id),
    isTerminal: isTerminal(id),
    isYaochuu: isYaochuu(id),
    isWind: isWind(id),
    isDragon: isDragon(id),
  };
}

/** Short notation: 1m, 5p, 9s, 1z (=東), 5z (=白), etc. */
export function tileShort(id: TileId): string {
  const r = tileRank(id);
  return `${r}${SUIT_LETTERS[tileSuit(id)]}`;
}

/** Pretty Japanese-ish display: 一, 二, ..., 1p, 1s, 東, 白, 中 */
export function tileDisplay(id: TileId): string {
  if (id >= 27) return HONOR_KANJI[id - 26];
  const r = (id % 9) + 1;
  const s = SUIT_LETTERS[tileSuit(id)];
  return `${r}${s}`;
}

/** Unicode mahjong tile glyph (U+1F000 plane). Not always rendered well, but useful for fallback. */
export function tileUnicode(id: TileId): string {
  // Mapping: 0..33 -> codepoints
  const map = [
    // m 1..9
    0x1f007, 0x1f008, 0x1f009, 0x1f00a, 0x1f00b, 0x1f00c, 0x1f00d, 0x1f00e, 0x1f00f,
    // p 1..9
    0x1f019, 0x1f01a, 0x1f01b, 0x1f01c, 0x1f01d, 0x1f01e, 0x1f01f, 0x1f020, 0x1f021,
    // s 1..9
    0x1f010, 0x1f011, 0x1f012, 0x1f013, 0x1f014, 0x1f015, 0x1f016, 0x1f017, 0x1f018,
    // E S W N
    0x1f000, 0x1f001, 0x1f002, 0x1f003,
    // White Green Red
    0x1f006, 0x1f005, 0x1f004,
  ];
  return String.fromCodePoint(map[id]);
}

export function compareTiles(a: TileId, b: TileId): number {
  return a - b;
}

export function sortTiles(tiles: TileId[]): TileId[] {
  return [...tiles].sort(compareTiles);
}

export function tilesToCounts(tiles: TileId[]): number[] {
  const c = new Array(NUM_TILES).fill(0);
  for (const t of tiles) c[t]++;
  return c;
}

export function countsToTiles(counts: number[]): TileId[] {
  const out: TileId[] = [];
  for (let i = 0; i < NUM_TILES; i++) {
    for (let j = 0; j < counts[i]; j++) out.push(i);
  }
  return out;
}

/** Dora tile derived from indicator. */
export function doraFromIndicator(indicator: TileId): TileId {
  if (indicator < 27) {
    const suit = tileSuit(indicator);
    const rank = tileRank(indicator);
    const next = rank === 9 ? 1 : rank + 1;
    return makeTile(suit, next);
  }
  // Honors
  if (indicator <= 30) {
    // winds: E -> S -> W -> N -> E
    const r = indicator - 27; // 0..3
    return 27 + ((r + 1) % 4);
  }
  // dragons P(31) -> F(32) -> C(33) -> P(31)
  const r = indicator - 31; // 0..2
  return 31 + ((r + 1) % 3);
}

export const ALL_TILE_IDS: TileId[] = Array.from({ length: NUM_TILES }, (_, i) => i);

export { TILES_PER_KIND, NUM_TILES };
