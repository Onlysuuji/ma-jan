"use client";

import { TileView } from "./Tile";
import type { TileId } from "@/lib/mahjong/types";

interface Props {
  round: number;
  roundWind: number;
  seatWind: number;
  junme: number;
  wallRemaining: number;
  doraIndicators: TileId[];
  doraTiles: TileId[];
  shanten: number;
  ukeireCount: number;
}

const WINDS = ["", "東", "南", "西", "北"];

export function GameInfo({
  round,
  roundWind,
  seatWind,
  junme,
  wallRemaining,
  doraIndicators,
  doraTiles,
  shanten,
  ukeireCount,
}: Props) {
  const shantenLabel =
    shanten === -1 ? "和了" : shanten === 0 ? "テンパイ" : `${shanten}シャンテン`;

  return (
    <div className="info-grid">
      <div className="info-cell">
        <div className="info-label">局</div>
        <div className="info-value">
          {WINDS[roundWind]}{round}局
        </div>
      </div>
      <div className="info-cell">
        <div className="info-label">自風</div>
        <div className="info-value">{WINDS[seatWind]}</div>
      </div>
      <div className="info-cell">
        <div className="info-label">巡目</div>
        <div className="info-value">{junme}</div>
      </div>
      <div className="info-cell">
        <div className="info-label">山残り</div>
        <div className="info-value">{wallRemaining}</div>
      </div>
      <div className="info-cell">
        <div className="info-label">ドラ表示</div>
        <div className="row" style={{ marginTop: 4 }}>
          {doraIndicators.map((t, i) => (
            <TileView key={i} tile={t} size="small" />
          ))}
        </div>
      </div>
      <div className="info-cell">
        <div className="info-label">ドラ</div>
        <div className="row" style={{ marginTop: 4 }}>
          {doraTiles.map((t, i) => (
            <TileView key={i} tile={t} size="small" dora />
          ))}
        </div>
      </div>
      <div className="info-cell">
        <div className="info-label">シャンテン</div>
        <div className="info-value">{shantenLabel}</div>
      </div>
      <div className="info-cell">
        <div className="info-label">受け入れ</div>
        <div className="info-value">{ukeireCount} 枚</div>
      </div>
    </div>
  );
}
