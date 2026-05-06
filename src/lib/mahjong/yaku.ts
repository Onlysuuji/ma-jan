import { NUM_TILES, type TileId } from "./types";
import { tilesToCounts, isHonor, isYaochuu, isWind, isDragon, tileSuit, tileRank } from "./tiles";
import { decompose14, annotateDecomposition, type Decomposition } from "./decompose";

export interface YakuInput {
  /** all 14 tiles, including the winning tile */
  closed14: TileId[];
  agariTile: TileId;
  isTsumo: boolean;
  isClosed: boolean; // true if no calls (no chi/pon/open kan)
  isRiichi: boolean;
  isIppatsu: boolean;
  isHaitei: boolean; // last tile in wall
  isHoutei: boolean; // win on the discarded last tile
  roundWind: number; // 1=E, 2=S, 3=W, 4=N
  seatWind: number;
  doraTiles: TileId[];
  uradoraTiles?: TileId[];
}

export interface YakuItem {
  name: string;
  han: number;
  yakuman?: boolean;
}

export interface YakuResult {
  yaku: YakuItem[];
  hanTotal: number;
  hasYaku: boolean;
  yakumanCount: number;
  /** chosen decomposition (the highest-han one); null for chiitoi/kokushi */
  decomposition: Decomposition | null;
  /** whether the form is chiitoitsu */
  isChiitoi: boolean;
  isKokushi: boolean;
}

const KOKUSHI_TILES = new Set([0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33]);

export function detectYaku(input: YakuInput): YakuResult {
  const counts = tilesToCounts(input.closed14);

  // Check kokushi musou
  if (isKokushiHand(counts)) {
    const yaku: YakuItem[] = [{ name: "国士無双", han: 13, yakuman: true }];
    return {
      yaku,
      hanTotal: 13,
      hasYaku: true,
      yakumanCount: 1,
      decomposition: null,
      isChiitoi: false,
      isKokushi: true,
    };
  }

  // Check chiitoitsu
  if (isChiitoiHand(counts) && input.isClosed) {
    const yaku: YakuItem[] = [{ name: "七対子", han: 2 }];
    addRiichiAndSituational(yaku, input);
    if (isTanyaoCounts(counts)) yaku.push({ name: "断么九", han: 1 });
    if (isHonitsu(counts) || isChinitsu(counts)) {
      if (isChinitsu(counts)) yaku.push({ name: "清一色", han: input.isClosed ? 6 : 5 });
      else yaku.push({ name: "混一色", han: input.isClosed ? 3 : 2 });
    }
    if (isHonroutou(counts)) yaku.push({ name: "混老頭", han: 2 });
    addDoraAndAka(yaku, input);
    const total = yaku.reduce((s, y) => s + y.han, 0);
    return {
      yaku,
      hanTotal: total,
      hasYaku: yaku.some((y) => !isDoraName(y.name)),
      yakumanCount: 0,
      decomposition: null,
      isChiitoi: true,
      isKokushi: false,
    };
  }

  // Standard form: try every decomposition, pick highest-han
  const decomps = decompose14(counts).map((d) => annotateDecomposition(d, input.agariTile));
  if (decomps.length === 0) {
    return {
      yaku: [],
      hanTotal: 0,
      hasYaku: false,
      yakumanCount: 0,
      decomposition: null,
      isChiitoi: false,
      isKokushi: false,
    };
  }

  let best: YakuResult | null = null;
  for (const d of decomps) {
    const r = scoreDecomposition(d, input);
    if (!best || r.hanTotal > best.hanTotal) best = r;
  }
  return best!;
}

function scoreDecomposition(d: Decomposition, input: YakuInput): YakuResult {
  const yaku: YakuItem[] = [];

  addRiichiAndSituational(yaku, input);

  if (d.mentsu.every((m) => m.kind === "shuntsu")) {
    // pinfu candidate
    if (
      input.isClosed &&
      d.waitShape === "ryanmen" &&
      !isYakuhai(d.jantou, input.roundWind, input.seatWind)
    ) {
      yaku.push({ name: "平和", han: 1 });
    }
  }

  // Tanyao
  if (isTanyaoDecomp(d)) {
    yaku.push({ name: "断么九", han: 1 });
  }

  // Yakuhai (per triplet)
  for (const m of d.mentsu) {
    if (m.kind === "koutsu") {
      const t = m.tiles[0];
      if (isDragon(t)) {
        const name =
          t === 31 ? "白" : t === 32 ? "發" : "中";
        yaku.push({ name: `役牌(${name})`, han: 1 });
      } else if (isWind(t)) {
        const w = t - 26;
        if (w === input.roundWind) yaku.push({ name: "場風", han: 1 });
        if (w === input.seatWind && w !== input.roundWind)
          yaku.push({ name: "自風", han: 1 });
        if (w === input.roundWind && w === input.seatWind)
          yaku.push({ name: "ダブ風", han: 1 });
      }
    }
  }

  // Toitoi
  if (d.mentsu.every((m) => m.kind === "koutsu")) {
    yaku.push({ name: "対々和", han: 2 });
  }

  // Iipeiko (closed only) — two identical shuntsu
  if (input.isClosed) {
    const shuntsus = d.mentsu.filter((m) => m.kind === "shuntsu");
    const seen = new Map<string, number>();
    for (const s of shuntsus) {
      const key = s.tiles.join(",");
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    if ([...seen.values()].some((v) => v >= 2)) {
      yaku.push({ name: "一盃口", han: 1 });
    }
  }

  // Sanshoku doujun
  if (hasSanshokuDoujun(d.mentsu)) yaku.push({ name: "三色同順", han: input.isClosed ? 2 : 1 });

  // Sanshoku doukou
  if (hasSanshokuDoukou(d.mentsu)) yaku.push({ name: "三色同刻", han: 2 });

  // Ittsu (1-9 same suit straight)
  if (hasIttsu(d.mentsu)) yaku.push({ name: "一気通貫", han: input.isClosed ? 2 : 1 });

  // Chanta (all sets contain yaochuu)
  if (isChanta(d)) yaku.push({ name: "混全帯么九", han: input.isClosed ? 2 : 1 });

  // Honitsu / chinitsu
  const counts = tilesToCounts(input.closed14);
  if (isChinitsu(counts)) yaku.push({ name: "清一色", han: input.isClosed ? 6 : 5 });
  else if (isHonitsu(counts)) yaku.push({ name: "混一色", han: input.isClosed ? 3 : 2 });

  // Honroutou
  if (isHonroutou(counts)) yaku.push({ name: "混老頭", han: 2 });

  // San ankou (3 concealed triplets) — for v1: every koutsu in closed hand counts as ankou
  // (we don't model called pon yet, so all triplets are concealed)
  const koutsuCount = d.mentsu.filter((m) => m.kind === "koutsu").length;
  if (input.isClosed && koutsuCount >= 3) {
    if (koutsuCount === 4) yaku.push({ name: "四暗刻", han: 13, yakuman: true });
    else yaku.push({ name: "三暗刻", han: 2 });
  }

  addDoraAndAka(yaku, input);

  const yakumanCount = yaku.filter((y) => y.yakuman).length;
  const hanTotal = yakumanCount > 0 ? 13 * yakumanCount : yaku.reduce((s, y) => s + y.han, 0);
  const hasRealYaku = yaku.some((y) => !isDoraName(y.name));

  return {
    yaku,
    hanTotal,
    hasYaku: hasRealYaku,
    yakumanCount,
    decomposition: d,
    isChiitoi: false,
    isKokushi: false,
  };
}

function addRiichiAndSituational(yaku: YakuItem[], input: YakuInput) {
  if (input.isRiichi) yaku.push({ name: "立直", han: 1 });
  if (input.isIppatsu) yaku.push({ name: "一発", han: 1 });
  if (input.isTsumo && input.isClosed) yaku.push({ name: "門前清自摸和", han: 1 });
  if (input.isHaitei) yaku.push({ name: "海底撈月", han: 1 });
  if (input.isHoutei) yaku.push({ name: "河底撈魚", han: 1 });
}

function addDoraAndAka(yaku: YakuItem[], input: YakuInput) {
  const counts = tilesToCounts(input.closed14);
  let dora = 0;
  for (const d of input.doraTiles) dora += counts[d];
  if (dora > 0) yaku.push({ name: "ドラ", han: dora });
  if (input.uradoraTiles && input.isRiichi) {
    let ura = 0;
    for (const d of input.uradoraTiles) ura += counts[d];
    if (ura > 0) yaku.push({ name: "裏ドラ", han: ura });
  }
}

function isDoraName(name: string): boolean {
  return name === "ドラ" || name === "裏ドラ" || name === "赤ドラ";
}

function isYakuhai(id: TileId, roundWind: number, seatWind: number): boolean {
  if (isDragon(id)) return true;
  if (!isWind(id)) return false;
  const w = id - 26;
  return w === roundWind || w === seatWind;
}

function isTanyaoCounts(counts: number[]): boolean {
  for (let i = 0; i < NUM_TILES; i++) {
    if (counts[i] === 0) continue;
    if (isYaochuu(i)) return false;
  }
  return true;
}

function isTanyaoDecomp(d: Decomposition): boolean {
  if (isYaochuu(d.jantou)) return false;
  for (const m of d.mentsu) {
    for (const t of m.tiles) if (isYaochuu(t)) return false;
  }
  return true;
}

function isHonitsu(counts: number[]): boolean {
  const suits = [false, false, false];
  let hasHonor = false;
  for (let i = 0; i < NUM_TILES; i++) {
    if (counts[i] === 0) continue;
    const s = tileSuit(i);
    if (s === 3) hasHonor = true;
    else suits[s] = true;
  }
  const suitCount = suits.filter(Boolean).length;
  return suitCount === 1 && hasHonor;
}

function isChinitsu(counts: number[]): boolean {
  const suits = [false, false, false];
  for (let i = 0; i < NUM_TILES; i++) {
    if (counts[i] === 0) continue;
    const s = tileSuit(i);
    if (s === 3) return false;
    suits[s] = true;
  }
  return suits.filter(Boolean).length === 1;
}

function isHonroutou(counts: number[]): boolean {
  for (let i = 0; i < NUM_TILES; i++) {
    if (counts[i] === 0) continue;
    if (!isHonor(i) && (i % 9) !== 0 && (i % 9) !== 8) return false;
  }
  return true;
}

function isKokushiHand(counts: number[]): boolean {
  let pair = false;
  let kinds = 0;
  for (const id of KOKUSHI_TILES) {
    if (counts[id] >= 1) kinds++;
    if (counts[id] >= 2) pair = true;
  }
  // also no non-yaochuu tiles
  for (let i = 0; i < NUM_TILES; i++) {
    if (!KOKUSHI_TILES.has(i) && counts[i] > 0) return false;
  }
  return kinds === 13 && pair;
}

function isChiitoiHand(counts: number[]): boolean {
  let pairs = 0;
  for (let i = 0; i < NUM_TILES; i++) {
    if (counts[i] === 2) pairs++;
    else if (counts[i] !== 0) return false;
  }
  return pairs === 7;
}

function hasSanshokuDoujun(mentsu: { kind: string; tiles: [TileId, TileId, TileId] }[]): boolean {
  // Find shuntsu starting ranks
  const startsBySuit: number[][] = [[], [], []];
  for (const m of mentsu) {
    if (m.kind !== "shuntsu") continue;
    const s = tileSuit(m.tiles[0]);
    if (s === 3) continue;
    startsBySuit[s].push(tileRank(m.tiles[0]));
  }
  for (let r = 1; r <= 7; r++) {
    if (startsBySuit[0].includes(r) && startsBySuit[1].includes(r) && startsBySuit[2].includes(r))
      return true;
  }
  return false;
}

function hasSanshokuDoukou(mentsu: { kind: string; tiles: [TileId, TileId, TileId] }[]): boolean {
  const ranksBySuit: Set<number>[] = [new Set(), new Set(), new Set()];
  for (const m of mentsu) {
    if (m.kind !== "koutsu") continue;
    const t = m.tiles[0];
    const s = tileSuit(t);
    if (s === 3) continue;
    ranksBySuit[s].add(tileRank(t));
  }
  for (let r = 1; r <= 9; r++) {
    if (ranksBySuit[0].has(r) && ranksBySuit[1].has(r) && ranksBySuit[2].has(r)) return true;
  }
  return false;
}

function hasIttsu(mentsu: { kind: string; tiles: [TileId, TileId, TileId] }[]): boolean {
  const suntsuBySuit: Map<number, Set<number>> = new Map();
  for (const m of mentsu) {
    if (m.kind !== "shuntsu") continue;
    const t = m.tiles[0];
    const s = tileSuit(t);
    if (s === 3) continue;
    if (!suntsuBySuit.has(s)) suntsuBySuit.set(s, new Set());
    suntsuBySuit.get(s)!.add(tileRank(t));
  }
  for (const set of suntsuBySuit.values()) {
    if (set.has(1) && set.has(4) && set.has(7)) return true;
  }
  return false;
}

function isChanta(d: Decomposition): boolean {
  // every set contains a yaochuu, jantou is yaochuu
  if (!isYaochuu(d.jantou)) return false;
  for (const m of d.mentsu) {
    if (!m.tiles.some((t) => isYaochuu(t))) return false;
  }
  // not honroutou (already covered) and not jun-chan distinction skipped; classify as 混全帯
  return true;
}
