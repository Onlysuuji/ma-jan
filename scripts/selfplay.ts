/**
 * Solitaire shanten race: each agent plays many hands of "draw 14, discard 1, draw 1, ..."
 * until the wall is exhausted. We track:
 *   - tenpai rate (reached shanten <= 0 at any point)
 *   - agari rate (reached shanten = -1 at any point, i.e. would have won)
 *   - average final shanten
 *   - average shanten at fixed junme checkpoints (6, 12, 17)
 *
 * This is not a 4-player simulation — there's no opponent — but it's a clean
 * benchmark for "given equal draws, which AI advances the hand fastest?"
 *
 * Usage:
 *   npx tsx scripts/selfplay.ts [hands] [seed]
 *   npm run selfplay -- 200
 */

import { Mulberry32, dealInitial } from "../src/lib/mahjong/wall";
import { sortTiles, doraFromIndicator } from "../src/lib/mahjong/tiles";
import { shanten as calcShanten } from "../src/lib/mahjong/shanten";
import {
  ALL_AGENTS,
  type Agent,
  type AgentContext,
} from "../src/lib/ai/agents";

interface HandResult {
  reachedTenpai: boolean;
  reachedAgari: boolean;
  finalShanten: number;
  shantenAt: number[]; // by junme index 0..maxJunme-1
  junmeAtTenpai: number; // -1 if never
}

function playOneHand(agent: Agent, seed: number, maxJunme = 18): HandResult {
  const rng = new Mulberry32(seed);
  const deal = dealInitial(rng);
  let closed = sortTiles(deal.hand);
  let drawn = deal.wall[0];
  const wall = deal.wall.slice();
  let wallIdx = 1;

  const doraTiles = [doraFromIndicator(deal.doraIndicator)];

  const shantenAt: number[] = [];
  let reachedTenpai = false;
  let reachedAgari = false;
  let junmeAtTenpai = -1;

  for (let junme = 1; junme <= maxJunme; junme++) {
    const hand14 = sortTiles([...closed, drawn]);

    // Did we hit agari (winning) on this draw?
    const sh14 = calcShanten(hand14);
    if (sh14 === -1) {
      reachedAgari = true;
      reachedTenpai = true;
      shantenAt.push(-1);
      if (junmeAtTenpai < 0) junmeAtTenpai = junme;
      break;
    }

    const ctx: AgentContext = {
      rand: () => rng.next(),
      doraTiles,
      roundWind: 1,
      seatWind: 1,
      junme,
    };
    const tile = agent.pickDiscard(hand14, ctx);

    // remove tile from hand14
    const remIdx = hand14.indexOf(tile);
    const remaining = hand14.slice();
    remaining.splice(remIdx, 1);
    closed = sortTiles(remaining);

    // shanten of the resulting 13-tile hand
    const sh13 = calcShanten(closed);
    shantenAt.push(sh13);
    if (sh13 <= 0) {
      reachedTenpai = true;
      if (junmeAtTenpai < 0) junmeAtTenpai = junme;
    }

    if (wallIdx >= wall.length) break;
    drawn = wall[wallIdx++];
  }

  const finalShanten = shantenAt.length > 0 ? shantenAt[shantenAt.length - 1] : 8;
  return { reachedTenpai, reachedAgari, finalShanten, shantenAt, junmeAtTenpai };
}

interface AgentStats {
  name: string;
  hands: number;
  tenpaiRate: number;
  agariRate: number;
  avgFinalShanten: number;
  avgJunmeAtTenpai: number; // among tenpai hands
  avgShantenAt: { junme: number; avg: number }[];
}

function summarize(name: string, results: HandResult[]): AgentStats {
  const n = results.length;
  const tenpai = results.filter((r) => r.reachedTenpai).length;
  const agari = results.filter((r) => r.reachedAgari).length;
  const avgFinal =
    results.reduce((s, r) => s + r.finalShanten, 0) / n;
  const tenpaiHands = results.filter((r) => r.junmeAtTenpai >= 0);
  const avgJunmeAtTenpai =
    tenpaiHands.length > 0
      ? tenpaiHands.reduce((s, r) => s + r.junmeAtTenpai, 0) / tenpaiHands.length
      : 0;

  const checkpoints = [3, 6, 9, 12, 15, 18];
  const avgShantenAt = checkpoints.map((j) => {
    const samples = results
      .map((r) => r.shantenAt[j - 1])
      .filter((v) => v !== undefined);
    const avg =
      samples.length > 0
        ? samples.reduce((s, v) => s + v, 0) / samples.length
        : NaN;
    return { junme: j, avg };
  });

  return {
    name,
    hands: n,
    tenpaiRate: tenpai / n,
    agariRate: agari / n,
    avgFinalShanten: avgFinal,
    avgJunmeAtTenpai,
    avgShantenAt,
  };
}

function fmtPct(p: number): string {
  return (p * 100).toFixed(1).padStart(5) + "%";
}

function fmtNum(n: number, w = 5): string {
  return Number.isFinite(n) ? n.toFixed(2).padStart(w) : "  N/A";
}

function printReport(stats: AgentStats[]) {
  const colW = 18;
  console.log("\n=== Solitaire Shanten Race ===");
  console.log(`hands per agent: ${stats[0].hands}`);
  console.log("");

  const header =
    "agent".padEnd(colW) +
    "tenpai%".padStart(8) +
    "agari%".padStart(8) +
    "avgFinal".padStart(10) +
    "tenpai巡目".padStart(12);
  console.log(header);
  console.log("-".repeat(header.length));
  for (const s of stats) {
    console.log(
      s.name.padEnd(colW) +
        fmtPct(s.tenpaiRate).padStart(8) +
        fmtPct(s.agariRate).padStart(8) +
        fmtNum(s.avgFinalShanten).padStart(10) +
        fmtNum(s.avgJunmeAtTenpai).padStart(12)
    );
  }

  console.log("\nAvg shanten by junme:");
  const cps = stats[0].avgShantenAt.map((x) => x.junme);
  const head =
    "agent".padEnd(colW) + cps.map((j) => `j${j}`.padStart(7)).join("");
  console.log(head);
  console.log("-".repeat(head.length));
  for (const s of stats) {
    console.log(
      s.name.padEnd(colW) +
        s.avgShantenAt.map((x) => fmtNum(x.avg, 6).padStart(7)).join("")
    );
  }
  console.log("");
}

function main() {
  const handsArg = process.argv[2] ? parseInt(process.argv[2], 10) : 200;
  const seedArg = process.argv[3] ? parseInt(process.argv[3], 10) : 1;

  const allStats: AgentStats[] = [];
  for (const agent of ALL_AGENTS) {
    const t0 = Date.now();
    const results: HandResult[] = [];
    for (let i = 0; i < handsArg; i++) {
      // same per-hand seed across agents → fair comparison (identical draws & discards opportunities)
      const seed = (seedArg * 1_000_003 + i * 7919) & 0x7fffffff;
      results.push(playOneHand(agent, seed));
    }
    const stats = summarize(agent.name, results);
    allStats.push(stats);
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    console.error(`[${agent.name}] ${handsArg} hands in ${dt}s`);
  }
  printReport(allStats);
}

main();
