"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Hand } from "@/components/Hand";
import { River } from "@/components/River";
import { GameInfo } from "@/components/GameInfo";
import { AIPanel } from "@/components/AIPanel";
import { TileView } from "@/components/Tile";
import {
  createTrainer,
  discard as applyDiscard,
  fullHand,
  seenCounts,
  type TrainerState,
} from "@/lib/game/trainer";
import { recommend } from "@/lib/ai/evaluator";
import { evaluateDiscards, type EvaluatorContext } from "@/lib/ai/evaluator";
import {
  createMatch,
  makeView,
  stepHand,
  type Agent4,
  type MatchState,
  type PlayerView,
} from "@/lib/mahjong/match";
import { worldAgent4 } from "@/lib/ai/agents4";
import { doraFromIndicator, sortTiles, tileDisplay } from "@/lib/mahjong/tiles";
import { waitingTiles } from "@/lib/mahjong/win";
import type { TileId } from "@/lib/mahjong/types";

type ScreenMode = "trainer" | "match4";
type SeatMode = "assist" | "ai";

const SEAT_NAMES = ["あなた", "下家", "対面", "上家"];
const WIND_LABELS = ["", "東", "南", "西", "北"];

const passAgent: Agent4 = {
  name: "human-pass",
  decideDiscard: () => ({ tile: -1, riichi: false }),
  decidePon: () => ({ call: false }),
  decideChi: () => ({ call: false }),
  decideKan: () => ({ call: false }),
  decideTsumo: () => true,
  decideRon: () => true,
};

export default function Page() {
  const [mode, setMode] = useState<ScreenMode>("trainer");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="container">
      <div className="topbar">
        <div>
          <h1 className="title">麻雀AIトレーナー</h1>
          <p className="subtitle">
            1人練習と、AI相手の4人対戦を切り替えて使えます。
          </p>
        </div>
        <div className="segmented">
          <button
            className={mode === "trainer" ? "active" : ""}
            onClick={() => setMode("trainer")}
          >
            1人練習
          </button>
          <button
            className={mode === "match4" ? "active" : ""}
            onClick={() => setMode("match4")}
          >
            4人対戦
          </button>
        </div>
      </div>
      {mounted ? (
        mode === "trainer" ? <TrainerView /> : <FourPlayerView />
      ) : (
        <div className="panel">
          <p className="muted">Loading...</p>
        </div>
      )}
    </div>
  );
}

function TrainerView() {
  const [state, setState] = useState<TrainerState>(() => createTrainer());

  const hand14 = useMemo(() => fullHand(state), [state]);

  const evalResult = useMemo(() => {
    if (state.finished || hand14.length !== 14) return null;
    const seen = seenCounts(state);
    return recommend(hand14, {
      doraTiles: state.doraTiles,
      seenCounts: seen,
      roundWind: state.roundWind,
      seatWind: state.seatWind,
      junme: state.junme,
      isClosed: true,
      canRiichi: true,
    });
  }, [state, hand14]);

  const handleDiscard = useCallback((tile: number) => {
    setState((s) => (s.finished ? s : applyDiscard(s, tile)));
  }, []);

  const handleNewHand = useCallback(() => {
    setState(createTrainer());
  }, []);

  const handleAutoDiscard = useCallback(() => {
    if (!evalResult) return;
    setState((s) => (s.finished ? s : applyDiscard(s, evalResult.recommendation.tile!)));
  }, [evalResult]);

  return (
      <div className="layout">
        <div className="panel">
          <h2>場況</h2>
          <GameInfo
            round={state.round}
            roundWind={state.roundWind}
            seatWind={state.seatWind}
            junme={state.junme}
            wallRemaining={state.wall.length}
            doraIndicators={state.doraIndicators}
            doraTiles={state.doraTiles}
            shanten={evalResult?.evaluation.currentShanten ?? -1}
            ukeireCount={
              evalResult?.evaluation.candidates[0]?.ukeireCount ?? 0
            }
          />

          <div className="section-spacer" />

          <h2>手牌 (クリックで打牌)</h2>
          <Hand
            closed={state.closed}
            drawn={state.drawn}
            recommended={evalResult?.recommendation.tile ?? null}
            doraTiles={state.doraTiles}
            onDiscard={state.finished ? undefined : handleDiscard}
          />

          <div className="section-spacer" />

          <div className="controls">
            <button
              className="btn primary"
              disabled={state.finished || !evalResult}
              onClick={handleAutoDiscard}
            >
              AIの推奨で打つ
            </button>
            <button className="btn" onClick={handleNewHand}>
              新しい配牌
            </button>
            {state.finished && (
              <span className="warning">局終了 (流局): 「新しい配牌」で再開してください</span>
            )}
          </div>

          <div className="section-spacer" />

          <h2>河 (自分の捨て牌)</h2>
          <River tiles={state.river} />
        </div>

        <div>
          {evalResult && (
            <AIPanel
              evaluation={evalResult.evaluation}
              recommendation={evalResult.recommendation}
              doraTiles={state.doraTiles}
            />
          )}
          {!evalResult && (
            <div className="panel">
              <h2>AI 推奨</h2>
              <p className="muted">局が終了しました。新しい配牌を引いてください。</p>
            </div>
          )}
        </div>
      </div>
  );
}

function FourPlayerView() {
  const [seed, setSeed] = useState(42);
  const [state, setState] = useState<MatchState>(() => createMatch(42));
  const [seatModes, setSeatModes] = useState<SeatMode[]>(["assist", "ai", "ai", "ai"]);
  const [revealAllHands, setRevealAllHands] = useState(false);

  const doraTiles = useMemo(
    () => state.doraIndicators.map(doraFromIndicator),
    [state.doraIndicators]
  );
  const currentMode = seatModes[state.currentPlayer];
  const needsHuman = !state.finished && currentMode === "assist";
  const previewDraw = needsHuman ? state.wall[state.wallIdx] ?? null : null;
  const humanHand14 = useMemo(() => {
    if (!needsHuman || previewDraw === null) return null;
    return sortTiles([...state.players[state.currentPlayer].closed, previewDraw]);
  }, [needsHuman, previewDraw, state]);

  const aiSuggestion = useMemo(() => {
    if (!humanHand14 || state.finished) return null;
    const ctx = evaluatorContextForSeat(state, state.currentPlayer);
    return evaluateDiscards(humanHand14, ctx);
  }, [humanHand14, state]);

  const runAiUntilHuman = useCallback(() => {
    const expectedPlayer = state.currentPlayer;
    const expectedWallIdx = state.wallIdx;
    setState((s) => {
      if (s.finished) return s;
      if (s.currentPlayer !== expectedPlayer || s.wallIdx !== expectedWallIdx) return s;
      const first = stepHand(s, buildAgents(seatModes, -1, undefined, true));
      return advanceUntilHuman(first, seatModes);
    });
  }, [seatModes, state.currentPlayer, state.wallIdx]);

  const handleNewMatch = useCallback(() => {
    const nextSeed = seed + 1;
    setSeed(nextSeed);
    setState(createMatch(nextSeed));
  }, [seed]);

  const handleResetSameSeed = useCallback(() => {
    setState(createMatch(seed));
  }, [seed]);

  const handleHumanDiscard = useCallback(
    (tile: TileId, riichi = false) => {
      const expectedPlayer = state.currentPlayer;
      const expectedWallIdx = state.wallIdx;
      setState((s) => {
        if (s.finished) return s;
        if (s.currentPlayer !== expectedPlayer || s.wallIdx !== expectedWallIdx) return s;
        if (seatModes[s.currentPlayer] !== "assist") return s;
        const agents = buildAgents(seatModes, s.currentPlayer, { tile, riichi });
        const next = stepHand(s, agents);
        return advanceUntilHuman(next, seatModes);
      });
    },
    [seatModes, state.currentPlayer, state.wallIdx]
  );

  const handleAiRecommended = useCallback(() => {
    if (!aiSuggestion) return;
    handleHumanDiscard(aiSuggestion.best.tile, aiSuggestion.best.resultingShanten === 0);
  }, [aiSuggestion, handleHumanDiscard]);

  const resultText = formatResult(state);

  return (
    <div className="match-layout">
      <div className="panel">
        <div className="match-header">
          <div>
            <h2>4人対戦</h2>
            <div className="muted">
              {WIND_LABELS[state.roundWind]}1局 / 巡目 {state.junme} / 山残り{" "}
              {state.wall.length - state.wallIdx}
            </div>
          </div>
          <div className="controls">
            <button className="btn primary" onClick={runAiUntilHuman} disabled={state.finished}>
              AIを進める
            </button>
            <button
              className="btn"
              onClick={() => setRevealAllHands((v) => !v)}
              aria-pressed={revealAllHands}
            >
              {revealAllHands ? "手牌を隠す" : "全手牌を見る"}
            </button>
            <button className="btn" onClick={handleResetSameSeed}>同じ配牌</button>
            <button className="btn" onClick={handleNewMatch}>新しい対局</button>
          </div>
        </div>

        <div className="seat-mode-grid">
          {seatModes.map((m, i) => (
            <label className="seat-toggle" key={i}>
              <span>{SEAT_NAMES[i]}</span>
              <select
                value={m}
                onChange={(e) => {
                  const next = seatModes.slice();
                  next[i] = e.target.value as SeatMode;
                  setSeatModes(next);
                }}
              >
                <option value="assist">人間 + AI推奨</option>
                <option value="ai">AI自動</option>
              </select>
            </label>
          ))}
        </div>

        <div className="table-grid">
          {[2, 3, 1, 0].map((seat) => (
            <PlayerPanel
              key={seat}
              state={state}
              seat={seat}
              doraTiles={doraTiles}
              active={state.currentPlayer === seat}
              reveal={state.finished || revealAllHands || seatModes[seat] === "assist"}
              previewDraw={state.currentPlayer === seat ? previewDraw : null}
              recommended={state.currentPlayer === seat ? aiSuggestion?.best.tile ?? null : null}
              onDiscard={
                state.currentPlayer === seat && seatModes[seat] === "assist" && !state.finished
                  ? handleHumanDiscard
                  : undefined
              }
            />
          ))}
        </div>

        {resultText && <div className="result-banner">{resultText}</div>}
        {state.finished && <EndStateDetails state={state} doraTiles={doraTiles} />}
      </div>

      <div className="side-stack">
        <div className="panel">
          <h2>場況</h2>
          <div className="info-grid">
            <Info label="現在手番" value={SEAT_NAMES[state.currentPlayer]} />
            <Info label="ドラ表示" value="" tiles={state.doraIndicators} />
            <Info label="ドラ" value="" tiles={doraTiles} dora />
            <Info label="供託" value={`${state.kyotaku}`} />
          </div>
        </div>

        <div className="panel">
          <h2>AI推奨</h2>
          {aiSuggestion && humanHand14 ? (
            <>
              <div className="recommend-headline">
                <span className="muted">おすすめ:</span>
                <TileView tile={aiSuggestion.best.tile} size="small" recommended />
                <span>{tileDisplay(aiSuggestion.best.tile)} を切る</span>
              </div>
              <div className="controls">
                <button className="btn primary" onClick={handleAiRecommended}>
                  推奨で打つ
                </button>
                {aiSuggestion.best.resultingShanten === 0 && (
                  <span className="tag riichi">リーチ候補</span>
                )}
              </div>
              <div className="candidate-list compact">
                {aiSuggestion.candidates.slice(0, 6).map((c, i) => (
                  <div className={`candidate-row ${i === 0 ? "best" : ""}`} key={c.tile}>
                    <span className="candidate-rank">#{i + 1}</span>
                    <TileView tile={c.tile} size="small" />
                    <span className="candidate-meta">
                      {c.resultingShanten === 0 ? "テンパイ" : `${c.resultingShanten}向聴`} / 受け {c.ukeireCount}
                    </span>
                    <span className="candidate-score">{Math.round(c.score)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="muted">
              「人間 + AI推奨」の席に手番が来ると、ここに推奨打牌が出ます。
            </p>
          )}
        </div>

        <div className="panel">
          <h2>ログ</h2>
          <div className="log-list">
            {state.log.slice(-12).reverse().map((ev, i) => (
              <div key={i}>{eventText(ev)}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayerPanel({
  state,
  seat,
  doraTiles,
  active,
  reveal,
  previewDraw,
  recommended,
  onDiscard,
}: {
  state: MatchState;
  seat: number;
  doraTiles: TileId[];
  active: boolean;
  reveal: boolean;
  previewDraw: TileId | null;
  recommended: TileId | null;
  onDiscard?: (tile: TileId, riichi?: boolean) => void;
}) {
  const player = state.players[seat];
  const closed = player.closed;
  return (
    <div className={`player-panel ${active ? "active" : ""} seat-${seat}`}>
      <div className="player-head">
        <strong>{SEAT_NAMES[seat]}</strong>
        <span className="muted">{WIND_LABELS[state.seatWinds[seat]]} / {player.score}点</span>
        {player.riichi && <span className="tag riichi">リーチ</span>}
      </div>
      <div className="mini-hand">
        {reveal ? (
          <>
            {closed.map((t, i) => (
              <TileView
                key={`${t}-${i}`}
                tile={t}
                size={seat === 0 ? "small" : "tiny"}
                dora={doraTiles.includes(t)}
                recommended={recommended === t}
                onClick={onDiscard}
              />
            ))}
            {previewDraw !== null && (
              <TileView
                tile={previewDraw}
                size={seat === 0 ? "small" : "tiny"}
                drawn
                dora={doraTiles.includes(previewDraw)}
                recommended={recommended === previewDraw}
                onClick={onDiscard}
              />
            )}
          </>
        ) : (
          Array.from({ length: closed.length + (previewDraw !== null ? 1 : 0) }).map((_, i) => (
            <div className="tile-back" key={i} />
          ))
        )}
      </div>
      <div className="river-wrap">
        <River tiles={player.river} />
      </div>
    </div>
  );
}

function EndStateDetails({
  state,
  doraTiles,
}: {
  state: MatchState;
  doraTiles: TileId[];
}) {
  const result = state.result;
  return (
    <div className="end-state">
      {state.players.map((player, seat) => {
        const waits = waitingTiles(player.closed);
        const isWinner = result?.winner === seat;
        const isLoser = result?.loser === seat;
        const hand = sortTiles(
          player.drawn === null ? player.closed : [...player.closed, player.drawn]
        );
        return (
          <div className="end-player" key={seat}>
            <div className="end-player-head">
              <strong>{SEAT_NAMES[seat]}</strong>
              {isWinner && <span className="tag riichi">和了</span>}
              {isLoser && <span className="tag danger-tag">放銃</span>}
              <span className="muted">
                {result ? `${formatDelta(result.deltas[seat])}点` : ""}
              </span>
            </div>
            <div className="mini-hand open">
              {hand.map((t, i) => (
                <TileView
                  key={`${seat}-${t}-${i}`}
                  tile={t}
                  size="tiny"
                  dora={doraTiles.includes(t)}
                />
              ))}
            </div>
            <div className="end-meta">
              <span>待ち</span>
              {waits.length > 0 ? (
                <span className="end-tiles">
                  {waits.map((t) => tileDisplay(t)).join(" ")}
                </span>
              ) : (
                <span className="muted">なし</span>
              )}
              {result?.tile !== undefined && isWinner && (
                <span>和了牌 {tileDisplay(result.tile)}</span>
              )}
              {result?.tile !== undefined && isLoser && (
                <span>放銃牌 {tileDisplay(result.tile)}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  return `${delta}`;
}

function Info({
  label,
  value,
  tiles,
  dora,
}: {
  label: string;
  value: string;
  tiles?: TileId[];
  dora?: boolean;
}) {
  return (
    <div className="info-cell">
      <div className="info-label">{label}</div>
      {tiles ? (
        <div className="row" style={{ marginTop: 4 }}>
          {tiles.map((t, i) => (
            <TileView key={`${t}-${i}`} tile={t} size="small" dora={dora} />
          ))}
        </div>
      ) : (
        <div className="info-value">{value}</div>
      )}
    </div>
  );
}

function advanceUntilHuman(state: MatchState, seatModes: SeatMode[]): MatchState {
  let cur = state;
  let guard = 0;
  while (!cur.finished && seatModes[cur.currentPlayer] === "ai" && guard < 200) {
    cur = stepHand(cur, buildAgents(seatModes, -1));
    guard++;
  }
  return cur;
}

function buildAgents(
  seatModes: SeatMode[],
  humanSeat: number,
  decision?: { tile: TileId; riichi: boolean },
  forceAi = false
): Agent4[] {
  return seatModes.map((mode, seat) => {
    if (seat === humanSeat && decision) {
      return {
        ...passAgent,
        name: "human",
        decideDiscard: () => decision,
      };
    }
    return forceAi || mode === "ai" ? worldAgent4 : passAgent;
  });
}

function evaluatorContextForSeat(state: MatchState, seat: number): EvaluatorContext {
  const view = makeView(
    {
      ...state,
      wallIdx: state.wallIdx + (state.players[seat].drawn === null ? 1 : 0),
      players: state.players.map((p, i) =>
        i === seat && p.drawn === null
          ? { ...p, drawn: state.wall[state.wallIdx] ?? null }
          : p
      ),
    },
    seat
  );
  return contextFromView(view);
}

function contextFromView(view: PlayerView): EvaluatorContext {
  return {
    doraTiles: view.doraTiles,
    seenCounts: view.seenCounts,
    roundWind: view.roundWind,
    seatWind: view.seatWind,
    junme: view.junme,
    isClosed: view.ownIsClosed,
    alreadyRiichi: view.ownRiichi,
    mode: "auto",
    ownRiver: view.ownRiver,
    opponents: [0, 1, 2, 3]
      .filter((i) => i !== view.seatIndex)
      .map((i) => ({
        river: view.opponentRivers[i],
        riichi: view.opponentRiichi[i],
        riichiJunme: view.opponentRiichiJunme[i],
      })),
  };
}

function formatResult(state: MatchState): string {
  const r = state.result;
  if (!r) return "";
  if (r.kind === "ryukyoku") return `流局: ${r.tenpai?.map((t, i) => `${SEAT_NAMES[i]}${t ? "聴牌" : "不聴"}`).join(" / ")}`;
  if (r.kind === "tsumo") return `${SEAT_NAMES[r.winner ?? 0]} のツモ和了`;
  return `${SEAT_NAMES[r.winner ?? 0]} が ${SEAT_NAMES[r.loser ?? 0]} からロン`;
}

function eventText(ev: MatchState["log"][number]): string {
  switch (ev.kind) {
    case "deal":
      return `配牌 seed=${ev.seed}`;
    case "draw":
      return `${SEAT_NAMES[ev.player]} ツモ`;
    case "discard":
      return `${SEAT_NAMES[ev.player]} 打 ${tileDisplay(ev.tile)}${ev.riichi ? " リーチ" : ""}`;
    case "pon":
      return `${SEAT_NAMES[ev.player]} ポン (${tileDisplay(ev.tile)}) → 打 ${tileDisplay(ev.discard)}`;
    case "chi":
      return `${SEAT_NAMES[ev.player]} チー (${ev.tiles.map(tileDisplay).join(" ")}) → 打 ${tileDisplay(ev.discard)}`;
    case "kan":
      return `${SEAT_NAMES[ev.player]} カン (${tileDisplay(ev.tile)})`;
    case "tsumo":
      return `${SEAT_NAMES[ev.player]} ツモ和了`;
    case "ron":
      return `${SEAT_NAMES[ev.winner]} ロン (${SEAT_NAMES[ev.loser]} 打 ${tileDisplay(ev.tile)})`;
    case "ryukyoku":
      return "流局";
  }
}
