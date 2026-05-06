"use client";

import { TileView } from "./Tile";
import type { TileId } from "@/lib/mahjong/types";

interface Props {
  tiles: TileId[];
}

export function River({ tiles }: Props) {
  if (tiles.length === 0) {
    return <div className="muted">(まだ捨て牌はありません)</div>;
  }
  return (
    <div className="river">
      {tiles.map((t, i) => (
        <TileView key={`${t}-${i}`} tile={t} size="small" />
      ))}
    </div>
  );
}
