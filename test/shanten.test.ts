import { test } from "node:test";
import assert from "node:assert/strict";
import { shanten, shantenAll } from "../src/lib/mahjong/shanten";
import { SUIT_M, SUIT_P, SUIT_S, SUIT_Z } from "../src/lib/mahjong/types";
import { makeTile } from "../src/lib/mahjong/tiles";

// Helpers to construct hands by short notation
function tiles(spec: string): number[] {
  // e.g. "123m 456p 789s 11z" -> tile id list
  const out: number[] = [];
  for (const group of spec.trim().split(/\s+/)) {
    const m = /^([0-9]+)([mpsz])$/.exec(group);
    if (!m) throw new Error(`bad spec: ${group}`);
    const ranks = m[1].split("").map((d) => parseInt(d, 10));
    const suitChar = m[2];
    const suit = suitChar === "m" ? SUIT_M : suitChar === "p" ? SUIT_P : suitChar === "s" ? SUIT_S : SUIT_Z;
    for (const r of ranks) {
      out.push(makeTile(suit as any, r));
    }
  }
  return out;
}

test("complete hand has shanten -1", () => {
  // 123m 456m 789m 123p 11s -> 4 sets + 1 pair = winning
  const hand = tiles("123456789m 123p 11s");
  assert.equal(hand.length, 14);
  assert.equal(shanten(hand), -1);
});

test("tenpai hand (waiting on 1 tile) has shanten 0", () => {
  // 12m 456m 789m 123p 11s -> 13 tiles, ryanmen wait on 3m
  const hand = tiles("12m 456789m 123p 11s");
  assert.equal(hand.length, 13);
  assert.equal(shanten(hand), 0);
});

test("1-shanten hand has shanten 1", () => {
  // 2 mentsu + 2 taatsu + 1 pair + floating = 1-shanten (need to complete one taatsu)
  const hand = tiles("13m 45m 789m 123p 11s 9p");
  assert.equal(hand.length, 13);
  assert.equal(shanten(hand), 1);
});

test("chiitoitsu tenpai", () => {
  // 6 pairs + 1 single -> chiitoi tenpai
  const hand = tiles("11m 22m 33m 44p 55p 66p 7s");
  assert.equal(hand.length, 13);
  const r = shantenAll(hand);
  assert.equal(r.shanten, 0);
  assert.equal(r.forms.chiitoi, 0);
});

test("kokushi tenpai", () => {
  // 13 yaochuu types, 1 pair = kokushi musou agari (-1) — try tenpai instead:
  // 12 different yaochuu + 1 pair -> kokushi shanten 0 with 1 wait
  const hand = tiles("19m 19p 19s 1234567z 1m");
  assert.equal(hand.length, 14);
  // 14 tiles: this is kokushi 13-wait win actually with 1m being an extra terminal
  // Simpler: 13-tile kokushi tenpai
  const t13 = tiles("19m 19p 19s 1234567z");
  assert.equal(t13.length, 13);
  const r = shantenAll(t13);
  assert.equal(r.forms.kokushi, 0);
});

test("starting random hand has reasonable shanten", () => {
  // 13 honor tiles all different - extreme case
  const hand = tiles("1234567z 1m 2m 3m 4p 5p 6p");
  assert.equal(hand.length, 13);
  const s = shanten(hand);
  // not exact value but should be < 8
  assert.ok(s >= 0 && s <= 8);
});
