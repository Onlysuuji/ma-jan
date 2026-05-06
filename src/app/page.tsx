"use client";

import { useCallback, useMemo, useState } from "react";
import { Hand } from "@/components/Hand";
import { River } from "@/components/River";
import { GameInfo } from "@/components/GameInfo";
import { AIPanel } from "@/components/AIPanel";
import {
  createTrainer,
  discard as applyDiscard,
  fullHand,
  seenCounts,
  type TrainerState,
} from "@/lib/game/trainer";
import { recommend } from "@/lib/ai/evaluator";

export default function Page() {
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
      opponentRiichi: false,
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
    <div className="container">
      <h1 className="title">麻雀AIトレーナー</h1>
      <p className="subtitle">
        手牌を持ち、AIの推奨打牌・評価値・受け入れを確認しながら捨て牌を選びます。
      </p>

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
    </div>
  );
}
