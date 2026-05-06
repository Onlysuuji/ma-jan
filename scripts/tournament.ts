/**
 * 4-player tournament: each agent occupies one seat, hands are dealt, played, and stats logged.
 * Each "match" is one hand (no calls). After each hand, we record:
 *   - winner / loser
 *   - score deltas
 *   - tenpai counts at ryukyoku
 *
 * Agent placement is rotated so seat-bias is averaged out. Every block of 4 hands uses
 * the same wall seed and rotates the 4 agents through all seats.
 *
 * Usage:
 *   npx tsx scripts/tournament.ts [hands] [seed] [agentList]
 *   npm run tournament -- 200 1 random,simple-shanten,attacker,world
 */

import { createMatch, playHand, type Agent4 } from "../src/lib/mahjong/match";
import {
  attackerAgent4,
  balancedAgent4,
  patientAgent4,
  pushFoldAgent4,
  randomAgent4,
  riskAwareAgent4,
  seatAwareAgent4,
  simpleShantenAgent4,
  solidAgent4,
  valueAgent4,
  worldAgent4,
} from "../src/lib/ai/agents4";

const AGENT_REGISTRY: Record<string, Agent4> = {
  random: randomAgent4,
  "simple-shanten": simpleShantenAgent4,
  attacker: attackerAgent4,
  "risk-aware": riskAwareAgent4,
  "seat-aware": seatAwareAgent4,
  value: valueAgent4,
  solid: solidAgent4,
  world: worldAgent4,
  patient: patientAgent4,
  balanced: balancedAgent4,
  "push-fold": pushFoldAgent4,
};

interface AgentStats {
  name: string;
  matches: number;
  wins: number;
  dealIns: number;        // we dealt into someone's ron
  tsumoWins: number;
  ronWins: number;
  ryukyokuTenpai: number;
  totalScoreDelta: number;
  avgPositionRank: number; // 1..4 (1 = winner of hand or tenpai-receiver), best=lowest
  positionRanks: number[]; // raw counts of finishing rank 1..4
  sumDanger: number;       // for diagnostic: avg danger per discard
  discards: number;
}

function defaultStats(name: string): AgentStats {
  return {
    name,
    matches: 0,
    wins: 0,
    dealIns: 0,
    tsumoWins: 0,
    ronWins: 0,
    ryukyokuTenpai: 0,
    totalScoreDelta: 0,
    avgPositionRank: 0,
    positionRanks: [0, 0, 0, 0],
    sumDanger: 0,
    discards: 0,
  };
}

function rankSeats(deltas: number[]): number[] {
  // Returns rank[seat] (1 = best, 4 = worst). Ties broken by seat index.
  const seats = [0, 1, 2, 3];
  const sorted = seats.slice().sort((a, b) => deltas[b] - deltas[a]);
  const rank = [0, 0, 0, 0];
  sorted.forEach((seat, i) => {
    rank[seat] = i + 1;
  });
  return rank;
}

function main() {
  const handsArg = process.argv[2] ? parseInt(process.argv[2], 10) : 200;
  const seedArg = process.argv[3] ? parseInt(process.argv[3], 10) : 1;
  const listArg = process.argv[4];

  const agents: Agent4[] = listArg
    ? listArg.split(",").map((n) => {
        const a = AGENT_REGISTRY[n.trim()];
        if (!a) throw new Error(`unknown agent: ${n}`);
        return a;
      })
    : [randomAgent4, simpleShantenAgent4, attackerAgent4, worldAgent4];

  if (agents.length !== 4) throw new Error("must specify exactly 4 agents");

  const stats: Record<string, AgentStats> = {};
  for (const a of agents) {
    if (!stats[a.name]) stats[a.name] = defaultStats(a.name);
  }

  // Fair rotation: every block of four uses the same wall seed, while each agent
  // occupies every seat exactly once within that block.
  const t0 = Date.now();
  for (let i = 0; i < handsArg; i++) {
    const block = Math.floor(i / 4);
    const rotation = i % 4;
    const seatAgents: Agent4[] = [];
    for (let s = 0; s < 4; s++) {
      seatAgents.push(agents[(rotation + s) % 4]);
    }
    const seed = (seedArg * 1_000_003 + block * 7919) & 0x7fffffff;
    const initial = createMatch(seed);
    const final = playHand(initial, seatAgents);
    const result = final.result!;
    const ranks = rankSeats(result.deltas);

    for (let s = 0; s < 4; s++) {
      const a = seatAgents[s];
      const sn = stats[a.name];
      sn.matches++;
      sn.totalScoreDelta += result.deltas[s];
      sn.positionRanks[ranks[s] - 1]++;

      if (result.kind === "tsumo" && result.winner === s) {
        sn.wins++;
        sn.tsumoWins++;
      } else if (result.kind === "ron") {
        if (result.winner === s) {
          sn.wins++;
          sn.ronWins++;
        } else if (result.loser === s) {
          sn.dealIns++;
        }
      } else if (result.kind === "ryukyoku" && result.tenpai && result.tenpai[s]) {
        sn.ryukyokuTenpai++;
      }

      // Track per-discard danger via match log
      for (const ev of final.log) {
        if (ev.kind === "discard" && ev.player === s) {
          sn.discards++;
        }
      }
    }
  }

  for (const sn of Object.values(stats)) {
    let sumRanks = 0;
    sn.positionRanks.forEach((c, i) => (sumRanks += c * (i + 1)));
    sn.avgPositionRank = sumRanks / Math.max(1, sn.matches);
  }

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.error(`\nplayed ${handsArg} hands in ${dt}s`);
  printReport(Object.values(stats), handsArg);
}

function fmt(n: number, w = 6, d = 2): string {
  return Number.isFinite(n) ? n.toFixed(d).padStart(w) : "  N/A";
}

function fmtPct(p: number, w = 6): string {
  return ((p * 100).toFixed(1) + "%").padStart(w);
}

function printReport(stats: AgentStats[], hands: number) {
  console.log("\n=== 4P Tournament ===");
  console.log(`hands per seat per agent: ~${Math.floor(hands / stats.length)}`);
  console.log("");
  const colW = 16;
  const header =
    "agent".padEnd(colW) +
    "win%".padStart(7) +
    "tsumo%".padStart(8) +
    "ron%".padStart(7) +
    "deal-in%".padStart(10) +
    "tenpai%".padStart(9) +
    "avgRank".padStart(9) +
    "avgScore".padStart(11);
  console.log(header);
  console.log("-".repeat(header.length));
  for (const s of stats) {
    const m = s.matches || 1;
    console.log(
      s.name.padEnd(colW) +
        fmtPct(s.wins / m).padStart(7) +
        fmtPct(s.tsumoWins / m).padStart(8) +
        fmtPct(s.ronWins / m).padStart(7) +
        fmtPct(s.dealIns / m).padStart(10) +
        fmtPct(s.ryukyokuTenpai / m).padStart(9) +
        fmt(s.avgPositionRank, 7, 2).padStart(9) +
        fmt(s.totalScoreDelta / m, 9, 0).padStart(11)
    );
  }
  console.log("");
  console.log("position distribution (1st .. 4th):");
  for (const s of stats) {
    const m = s.matches || 1;
    const dist = s.positionRanks
      .map((c) => fmtPct(c / m, 7))
      .join("");
    console.log(s.name.padEnd(colW) + dist);
  }
  console.log("");
}

main();
