"use client";

import { TileView } from "./Tile";
import { tileDisplay } from "@/lib/mahjong/tiles";
import type { TileId } from "@/lib/mahjong/types";
import type {
  ActionRecommendation,
  EvaluationResult,
} from "@/lib/ai/evaluator";

interface Props {
  evaluation: EvaluationResult;
  recommendation: ActionRecommendation;
  doraTiles: TileId[];
}

export function AIPanel({ evaluation, recommendation, doraTiles }: Props) {
  const isDora = (t: TileId) => doraTiles.includes(t);
  return (
    <div className="panel">
      <h2>AI 推奨</h2>
      <div>
        <span className={`tag ${recommendation.attack}`}>{labelFor(recommendation.attack)}</span>
        {recommendation.riichi && <span className="tag riichi">リーチ</span>}
        <span className="tag">{recommendation.action}</span>
      </div>

      <div className="recommend-headline">
        <span className="muted">おすすめ:</span>
        {recommendation.tile !== undefined && (
          <TileView
            tile={recommendation.tile}
            recommended
            dora={isDora(recommendation.tile)}
            size="small"
          />
        )}
        {recommendation.tile !== undefined && (
          <span>{tileDisplay(recommendation.tile)} を切る</span>
        )}
      </div>
      <p className="recommend-reason">{recommendation.reason}</p>

      <div className="section-spacer" />

      <h2>候補比較</h2>
      <div>
        {evaluation.candidates.map((c, i) => (
          <div className={`candidate-row ${i === 0 ? "best" : ""}`} key={c.tile}>
            <span className="candidate-rank">#{i + 1}</span>
            <TileView tile={c.tile} size="small" dora={isDora(c.tile)} />
            <span className="candidate-meta">
              シャンテン {c.resultingShanten} / 受け {c.ukeireCount}枚 ({c.ukeireKinds}種)
              {c.doraCount > 0 && (
                <span className="warning"> · ドラ{c.doraCount}</span>
              )}
              {c.hanPotential > 0 && (
                <span> · 期待打点 +{c.hanPotential}han</span>
              )}
            </span>
            <span className="candidate-score">{Math.round(c.score)}</span>
            <div className="candidate-reason">
              <strong>{tileDisplay(c.tile)}:</strong> {c.reason}
              <UkeireList ukeire={c.ukeire} />
            </div>
          </div>
        ))}
      </div>

      {evaluation.notes.length > 0 && (
        <div className="notes">
          {evaluation.notes.map((n, i) => (
            <div className="note-line" key={i}>
              · {n}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UkeireList({ ukeire }: { ukeire: { tile: TileId; remaining: number }[] }) {
  if (ukeire.length === 0) {
    return <div className="muted" style={{ marginTop: 4 }}>受け入れ無し</div>;
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4, marginTop: 6 }}>
      <span className="muted" style={{ marginRight: 4 }}>受け:</span>
      {ukeire.map((u, i) => (
        <div key={`${u.tile}-${i}`} style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <TileView tile={u.tile} size="tiny" />
          <span className="muted" style={{ fontSize: 11 }}>×{u.remaining}</span>
        </div>
      ))}
    </div>
  );
}

function labelFor(a: "attack" | "balance" | "defense") {
  switch (a) {
    case "attack":
      return "攻撃";
    case "defense":
      return "守備";
    case "balance":
    default:
      return "バランス";
  }
}
