import { NUM_TILES, TILES_PER_KIND, type TileId } from "./types";

export interface RNG {
  next(): number; // 0..1
}

export class Mulberry32 implements RNG {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

export function buildWall(): TileId[] {
  const wall: TileId[] = [];
  for (let id = 0; id < NUM_TILES; id++) {
    for (let k = 0; k < TILES_PER_KIND; k++) wall.push(id);
  }
  return wall;
}

export function shuffle(arr: TileId[], rng: RNG): TileId[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface DealResult {
  hand: TileId[];        // 13 tiles
  wall: TileId[];        // remaining wall (live wall)
  doraIndicator: TileId; // initial dora indicator
  deadWall: TileId[];    // 14-tile dead wall (excluding doraIndicator pulled here for convenience)
}

export function dealInitial(rng: RNG): DealResult {
  const all = shuffle(buildWall(), rng);
  // Hand: 13 tiles
  const hand = all.slice(0, 13);
  // Reserve dead wall (last 14 tiles)
  const deadWall = all.slice(all.length - 14);
  // Dora indicator is the 5th tile of the dead wall (as is convention; close enough for our use)
  const doraIndicator = deadWall[4];
  // Live wall: between hand and dead wall
  const wall = all.slice(13, all.length - 14);
  return { hand, wall, doraIndicator, deadWall };
}
