import { test } from "node:test";
import assert from "node:assert/strict";
import { createMatch, playHand, stepHand } from "../src/lib/mahjong/match";
import { simpleShantenAgent4 } from "../src/lib/ai/agents4";

test("createMatch deals a legal 4-player hand", () => {
  const state = createMatch(42);

  assert.equal(state.players.length, 4);
  assert.equal(state.wall.length, 70);
  assert.equal(state.deadWall.length, 14);
  assert.equal(state.doraIndicators.length, 1);
  for (const player of state.players) {
    assert.equal(player.closed.length, 13);
    assert.equal(player.drawn, null);
    assert.equal(player.score, 25000);
  }
});

test("playHand finishes one no-call 4-player hand with zero-sum deltas", () => {
  const agents = [
    simpleShantenAgent4,
    simpleShantenAgent4,
    simpleShantenAgent4,
    simpleShantenAgent4,
  ];
  const final = playHand(createMatch(7), agents);

  assert.equal(final.finished, true);
  assert.ok(final.result);
  assert.equal(final.result.deltas.reduce((sum, v) => sum + v, 0), 0);
  assert.ok(final.log.some((ev) => ev.kind === "discard" || ev.kind === "tsumo"));
});

test("riichi player is forced to tsumogiri", () => {
  const state = createMatch(42);
  const drawn = state.wall[state.wallIdx];
  state.players[0].riichi = true;
  state.players[0].riichiJunme = 1;

  const illegalHandChangeAgent = {
    name: "illegal",
    decideDiscard: () => ({ tile: state.players[0].closed[0], riichi: false }),
    decidePon: () => ({ call: false }),
    decideTsumo: () => false,
    decideRon: () => false,
  };
  const final = stepHand(state, [
    illegalHandChangeAgent,
    illegalHandChangeAgent,
    illegalHandChangeAgent,
    illegalHandChangeAgent,
  ]);
  const discard = final.log.findLast((ev) => ev.kind === "discard");

  if (!discard || discard.kind !== "discard") {
    throw new Error("expected a discard event");
  }
  assert.equal(discard.tile, drawn);
});

test("yakuhai pon opens the caller and advances after the call discard", () => {
  const state = createMatch(99);
  state.currentPlayer = 0;
  state.wall = [0, ...state.wall.slice(1)];
  state.wallIdx = 0;
  state.players[0].closed = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 31];
  state.players[1].closed = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 31, 31];
  state.players[2].closed = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  state.players[3].closed = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  const baseAgent = {
    name: "base",
    decideDiscard: () => ({ tile: 31, riichi: false }),
    decidePon: () => ({ call: false }),
    decideTsumo: () => false,
    decideRon: () => false,
  };
  const ponAgent = {
    ...baseAgent,
    name: "pon",
    decideDiscard: () => ({ tile: 0, riichi: false }),
    decidePon: () => ({ call: true, discard: 0 }),
  };

  const final = stepHand(state, [baseAgent, ponAgent, baseAgent, baseAgent]);
  const pon = final.log.find((ev) => ev.kind === "pon");

  assert.ok(pon);
  assert.equal(final.players[1].isClosed, false);
  assert.equal(final.players[1].melds.length, 1);
  assert.deepEqual(final.players[1].melds[0].tiles, [31, 31, 31]);
  assert.equal(final.players[1].closed.length, 10);
  assert.equal(final.currentPlayer, 2);
});
