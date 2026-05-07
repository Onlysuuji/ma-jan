import assert from "node:assert/strict";
import test from "node:test";
import { parseExternalScreenPayload } from "../src/lib/external/screenState";

test("accepts a valid external screen payload", () => {
  const result = parseExternalScreenPayload(
    {
      source: "screen-reader",
      capturedAt: "2026-05-07T12:34:56.789+09:00",
      hand: [0, 1, 2, 9, 10, 18, 27, 28, 29, 30, 31, 32, 33],
      drawn: 5,
      redHandIndices: [4],
      redDrawn: true,
      doraIndicators: [31],
      ownRiver: [3, 12],
      opponentRivers: [[], [4], [8, 17]],
      currentPlayer: 2,
      riichiPlayers: [false, true, false, true],
      confidence: 0.92,
    },
    "2026-05-07T03:34:56.789Z"
  );

  assert.equal(result.ok, true);
  assert.equal(result.state?.hand.length, 13);
  assert.equal(result.state?.drawn, 5);
  assert.deepEqual(result.state?.redHandIndices, [4]);
  assert.equal(result.state?.redDrawn, true);
  assert.equal(result.state?.currentPlayer, 2);
  assert.deepEqual(result.state?.riichiPlayers, [false, true, false, true]);
  assert.deepEqual(result.state?.warnings, []);
});

test("rejects invalid tile ids and impossible hand duplicates", () => {
  const badId = parseExternalScreenPayload({
    source: "screen-reader",
    hand: [0, 1, 34],
    confidence: 0.9,
  });
  assert.equal(badId.ok, false);
  assert.match(badId.errors.join("\n"), /hand\[2\]/);

  const duplicate = parseExternalScreenPayload({
    source: "screen-reader",
    hand: [0, 0, 0, 0],
    drawn: 0,
    confidence: 0.9,
  });
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.errors.join("\n"), /appears more than 4 times/);
});

test("keeps low-confidence reads but marks them as warnings", () => {
  const result = parseExternalScreenPayload({
    source: "screen-reader",
    hand: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    confidence: 0.6,
  });

  assert.equal(result.ok, true);
  assert.match(result.state?.warnings.join("\n") ?? "", /confidence/);
});

test("rejects invalid red tile metadata", () => {
  const badIndex = parseExternalScreenPayload({
    source: "screen-reader",
    hand: [0, 1, 2],
    redHandIndices: [3],
    confidence: 0.9,
  });
  assert.equal(badIndex.ok, false);
  assert.match(badIndex.errors.join("\n"), /redHandIndices/);

  const badDrawn = parseExternalScreenPayload({
    source: "screen-reader",
    hand: [0, 1, 2],
    redDrawn: "yes",
    confidence: 0.9,
  });
  assert.equal(badDrawn.ok, false);
  assert.match(badDrawn.errors.join("\n"), /redDrawn/);
});

test("rejects invalid marker metadata", () => {
  const badCurrentPlayer = parseExternalScreenPayload({
    source: "screen-reader",
    hand: [0, 1, 2],
    currentPlayer: 4,
    confidence: 0.9,
  });
  assert.equal(badCurrentPlayer.ok, false);
  assert.match(badCurrentPlayer.errors.join("\n"), /currentPlayer/);

  const badRiichiPlayers = parseExternalScreenPayload({
    source: "screen-reader",
    hand: [0, 1, 2],
    riichiPlayers: [false, true, false],
    confidence: 0.9,
  });
  assert.equal(badRiichiPlayers.ok, false);
  assert.match(badRiichiPlayers.errors.join("\n"), /riichiPlayers/);
});
