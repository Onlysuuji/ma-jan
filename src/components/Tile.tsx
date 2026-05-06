"use client";

import { tileDisplay, tileSuit, isHonor, tileRank } from "@/lib/mahjong/tiles";
import type { TileId } from "@/lib/mahjong/types";

interface Props {
  tile: TileId;
  size?: "normal" | "small" | "tiny";
  drawn?: boolean;
  recommended?: boolean;
  dora?: boolean;
  onClick?: (tile: TileId) => void;
  title?: string;
}

const SUIT_SUFFIX = ["m", "p", "s", ""] as const;

export function TileView({
  tile,
  size = "normal",
  drawn = false,
  recommended = false,
  dora = false,
  onClick,
  title,
}: Props) {
  const isHnr = isHonor(tile);
  const suit = tileSuit(tile);
  const className = [
    "tile",
    size === "small" ? "small" : size === "tiny" ? "tiny" : "",
    isHnr ? "honor" : `suit-${SUIT_SUFFIX[suit]}`,
    drawn ? "drawn" : "",
    recommended ? "recommended" : "",
    dora ? "dora" : "",
    onClick ? "button" : "",
    isHnr && tile === 33 ? "dragon-c" : "",
    isHnr && tile === 32 ? "dragon-f" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const handleClick = onClick ? () => onClick(tile) : undefined;

  // Display content
  let content: string;
  if (isHnr) {
    content = tileDisplay(tile);
  } else {
    content = String(tileRank(tile));
  }

  return (
    <div
      className={className}
      onClick={handleClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      title={title ?? tileDisplay(tile)}
    >
      {content}
      {!isHnr && <span className="tile-rank-suffix">{SUIT_SUFFIX[suit]}</span>}
    </div>
  );
}
