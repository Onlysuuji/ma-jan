import { test } from "node:test";
import assert from "node:assert/strict";
import { NUM_TILES, SUIT_M } from "../src/lib/mahjong/types";
import { makeTile } from "../src/lib/mahjong/tiles";
import {
  dangerAgainstOpponent,
  totalDanger,
  type OpponentInfo,
} from "../src/lib/ai/defense";

function riichiOpp(river: number[]): OpponentInfo {
  return {
    river,
    riichi: true,
    riichiJunme: 8,
  };
}

test("genbutsu against riichi opponent is completely safe", () => {
  const fiveMan = makeTile(SUIT_M, 5);
  const seen = new Array(NUM_TILES).fill(0);
  const danger = dangerAgainstOpponent(fiveMan, riichiOpp([fiveMan]), seen);
  assert.equal(danger, 0);
});

test("own hand visibility contributes to kabe danger reduction", () => {
  const threeMan = makeTile(SUIT_M, 3);
  const fiveMan = makeTile(SUIT_M, 5);
  const seen = new Array(NUM_TILES).fill(0);
  const own = new Array(NUM_TILES).fill(0);
  seen[fiveMan] = 3;
  own[fiveMan] = 1;

  const withoutOwn = dangerAgainstOpponent(threeMan, riichiOpp([]), seen);
  const withOwn = dangerAgainstOpponent(threeMan, riichiOpp([]), seen, own);

  assert.ok(withOwn < withoutOwn);
  assert.equal(withOwn, 0.3);
});

test("non-riichi opponents are weighted much lower in aggregate danger", () => {
  const fiveMan = makeTile(SUIT_M, 5);
  const seen = new Array(NUM_TILES).fill(0);
  const riichi = riichiOpp([]);
  const quiet: OpponentInfo = { river: [], riichi: false, riichiJunme: -1 };

  const riichiOnly = totalDanger(fiveMan, {
    opponents: [riichi],
    seenCounts: seen,
    ownRiver: [],
  });
  const quietOnly = totalDanger(fiveMan, {
    opponents: [quiet],
    seenCounts: seen,
    ownRiver: [],
  });

  assert.ok(quietOnly < riichiOnly);
});
