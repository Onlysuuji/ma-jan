"use client";

import { TileView } from "./Tile";
import type { TileId } from "@/lib/mahjong/types";

interface Props {
  closed: TileId[];
  drawn: TileId | null;
  recommended?: TileId | null;
  doraTiles?: TileId[];
  onDiscard?: (tile: TileId) => void;
}

export function Hand({ closed, drawn, recommended, doraTiles = [], onDiscard }: Props) {
  const isDora = (t: TileId) => doraTiles.includes(t);
  return (
    <div className="hand-row">
      {closed.map((tile, i) => (
        <TileView
          key={`c-${i}-${tile}`}
          tile={tile}
          dora={isDora(tile)}
          recommended={recommended === tile && (drawn === null || tile !== drawn)}
          onClick={onDiscard}
        />
      ))}
      {drawn !== null && (
        <TileView
          tile={drawn}
          drawn
          dora={isDora(drawn)}
          recommended={recommended === drawn}
          onClick={onDiscard}
        />
      )}
    </div>
  );
}
