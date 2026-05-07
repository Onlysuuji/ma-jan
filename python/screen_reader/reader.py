from __future__ import annotations

import argparse
import dataclasses
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import cv2
import mss
import numpy as np
import requests
import yaml


TILE_KEYS = (
    [f"{rank}m" for rank in range(1, 10)]
    + [f"{rank}p" for rank in range(1, 10)]
    + [f"{rank}s" for rank in range(1, 10)]
    + [f"{rank}z" for rank in range(1, 8)]
)
TILE_ID_BY_KEY = {key: tile_id for tile_id, key in enumerate(TILE_KEYS)}
RED_FIVE_KEYS = ("0m", "0p", "0s")
TEMPLATE_KEYS = TILE_KEYS + RED_FIVE_KEYS
RED_FIVE_BASE_KEY = {"0m": "5m", "0p": "5p", "0s": "5s"}
TEMPLATE_FILE_CANDIDATES = {
    **{f"{rank}m": [f"{rank}m.png", f"man/{rank}man_self.png"] for rank in range(1, 10)},
    **{f"{rank}p": [f"{rank}p.png", f"pin/{rank}pin_self.png"] for rank in range(1, 10)},
    **{f"{rank}s": [f"{rank}s.png", f"sou/{rank}sou_self.png"] for rank in range(1, 10)},
    "1z": ["1z.png", "jihai/ton_self.png"],
    "2z": ["2z.png", "jihai/nan_self.png"],
    "3z": ["3z.png", "jihai/sha_self.png"],
    "4z": ["4z.png", "jihai/pei_self.png"],
    "5z": ["5z.png", "jihai/haku_self.png"],
    "6z": ["6z.png", "jihai/hatsu_self.png"],
    "7z": ["7z.png", "jihai/chun_self.png"],
    "0m": ["0m.png", "aka/5wan_self.png"],
    "0p": ["0p.png", "aka/5pin_self.png"],
    "0s": ["0s.png", "aka/5sou_self.png"],
}


@dataclasses.dataclass(frozen=True)
class Slot:
    x: int
    y: int
    w: int
    h: int


@dataclasses.dataclass(frozen=True)
class Match:
    tile_key: str
    tile_id: int
    red: bool
    score: float


def main() -> None:
    parser = argparse.ArgumentParser(description="Read mahjong tiles from a fixed screen region.")
    parser.add_argument("--config", required=True, help="Path to config.yml")
    parser.add_argument("--once", action="store_true", help="Capture and send at most one payload")
    parser.add_argument("--debug-dir", help="Write captured ROIs and match decisions to this directory")
    args = parser.parse_args()

    config_path = Path(args.config).resolve()
    config = load_config(config_path)
    template_dir = resolve_path(config_path.parent, config.get("template_dir", "./templates"))
    templates = load_templates(template_dir)
    debug_dir = Path(args.debug_dir).resolve() if args.debug_dir else None
    if debug_dir:
      debug_dir.mkdir(parents=True, exist_ok=True)

    interval = float(config.get("interval_seconds", 0.5))
    threshold = float(config.get("match_threshold", 0.82))
    api_url = str(config["api_url"])
    region = read_region(config["capture_region"])
    layout = read_layout(config)

    last_signature = ""
    with mss.mss() as screen:
        while True:
            frame = grab_frame(screen, region)
            result = read_frame(frame, layout, templates, threshold, debug_dir)

            if result["ok"]:
                payload = result["payload"]
                signature = json.dumps(payload, sort_keys=True, ensure_ascii=True)
                if signature != last_signature:
                    post_payload(api_url, payload)
                    last_signature = signature
                    print(f"sent confidence={payload['confidence']:.2f} hand={payload['hand']}")
            else:
                print("skip:", "; ".join(result["errors"]))

            if args.once:
                break
            time.sleep(interval)


def load_config(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as file:
        data = yaml.safe_load(file)
    if not isinstance(data, dict):
        raise ValueError("config must be a mapping")
    return data


def resolve_path(base: Path, value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else (base / path).resolve()


def load_templates(template_dir: Path) -> dict[str, np.ndarray]:
    templates: dict[str, np.ndarray] = {}
    missing: list[str] = []
    for key in TEMPLATE_KEYS:
        path = find_template_path(template_dir, key)
        if path is None:
            if key in RED_FIVE_KEYS:
                continue
            missing.append(f"{key}.png")
            continue
        image = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
        if image is None:
            if key in RED_FIVE_KEYS:
                continue
            missing.append(str(path.relative_to(template_dir)))
            continue
        templates[key] = image
    if missing:
        raise FileNotFoundError(
            f"missing template images in {template_dir}: {', '.join(missing[:8])}"
            + (" ..." if len(missing) > 8 else "")
        )
    return templates


def find_template_path(template_dir: Path, key: str) -> Path | None:
    for relative in TEMPLATE_FILE_CANDIDATES[key]:
        path = template_dir / relative
        if path.exists():
            return path
    return None


def read_region(value: Any) -> dict[str, int]:
    required = ("left", "top", "width", "height")
    if not isinstance(value, dict) or any(key not in value for key in required):
        raise ValueError("capture_region must contain left, top, width, and height")
    return {key: int(value[key]) for key in required}


def read_layout(config: dict[str, Any]) -> dict[str, Any]:
    if "areas" in config:
        areas = config["areas"]
        players = areas.get("players", {})
        table = areas.get("table", {})
        own = players.get("self", {})
        return {
            "hand": own.get("hand", []),
            "drawn": own.get("drawn"),
            "dora_indicators": table.get("dora_indicators", []),
            "own_river": own.get("river", []),
            "opponent_rivers": [
                players.get("right", {}).get("river", []),
                players.get("across", {}).get("river", []),
                players.get("left", {}).get("river", []),
            ],
            "areas": areas,
        }
    return config["slots"]


def grab_frame(screen: mss.mss, region: dict[str, int]) -> np.ndarray:
    raw = np.array(screen.grab(region))
    return cv2.cvtColor(raw, cv2.COLOR_BGRA2BGR)


def read_frame(
    frame: np.ndarray,
    slots: dict[str, Any],
    templates: dict[str, np.ndarray],
    threshold: float,
    debug_dir: Path | None,
) -> dict[str, Any]:
    errors: list[str] = []
    confidences: list[float] = []

    hand, red_hand_indices, hand_scores, hand_errors = read_required_slots(
        frame, slots.get("hand", []), templates, threshold, "hand", debug_dir
    )
    errors.extend(hand_errors)
    confidences.extend(hand_scores)

    drawn = None
    red_drawn = False
    drawn_slot = slots.get("drawn")
    if drawn_slot:
        match = match_slot(frame, Slot(**drawn_slot), templates)
        if match.score >= threshold:
            drawn = match.tile_id
            red_drawn = match.red
            confidences.append(match.score)
            write_debug_roi(frame, Slot(**drawn_slot), debug_dir, f"drawn-{match.tile_key}-{match.score:.3f}")

    dora_indicators, dora_scores = read_optional_slots(
        frame, slots.get("dora_indicators", []), templates, threshold, debug_dir, "dora"
    )
    own_river, own_river_scores = read_optional_slots(
        frame, slots.get("own_river", []), templates, threshold, debug_dir, "own-river"
    )
    opponent_rivers: list[list[int]] = []
    opponent_scores: list[float] = []
    for index, river_slots in enumerate(slots.get("opponent_rivers", [[], [], []])):
        river, river_scores = read_optional_slots(
            frame, river_slots, templates, threshold, debug_dir, f"opponent-{index + 1}"
        )
        opponent_rivers.append(river)
        opponent_scores.extend(river_scores)

    confidences.extend(dora_scores)
    confidences.extend(own_river_scores)
    confidences.extend(opponent_scores)
    current_player, turn_marker_scores = read_current_player_marker(frame, slots.get("areas", {}))
    riichi_players, riichi_marker_scores = read_player_markers(frame, slots.get("areas", {}), "riichi_marker")
    confidences.extend(turn_marker_scores)
    confidences.extend(riichi_marker_scores)

    if errors:
        return {"ok": False, "errors": errors}

    confidence = min(confidences) if confidences else 0.0
    payload = {
        "source": "screen-reader",
        "capturedAt": datetime.now(timezone.utc).isoformat(),
        "hand": hand,
        "drawn": drawn,
        "redHandIndices": red_hand_indices,
        "redDrawn": red_drawn,
        "doraIndicators": dora_indicators,
        "ownRiver": own_river,
        "opponentRivers": normalize_opponent_rivers(opponent_rivers),
        "currentPlayer": current_player,
        "riichiPlayers": riichi_players,
        "confidence": round(float(confidence), 4),
    }
    return {"ok": True, "payload": payload}


def read_required_slots(
    frame: np.ndarray,
    slot_values: list[dict[str, int]],
    templates: dict[str, np.ndarray],
    threshold: float,
    label: str,
    debug_dir: Path | None,
) -> tuple[list[int], list[int], list[float], list[str]]:
    tiles: list[int] = []
    red_indices: list[int] = []
    scores: list[float] = []
    errors: list[str] = []
    for index, value in enumerate(slot_values):
        slot = Slot(**value)
        match = match_slot(frame, slot, templates)
        write_debug_roi(frame, slot, debug_dir, f"{label}-{index}-{match.tile_key}-{match.score:.3f}")
        if match.score < threshold:
            errors.append(f"{label}[{index}] below threshold: {match.tile_key} {match.score:.3f}")
            continue
        tiles.append(match.tile_id)
        if match.red:
            red_indices.append(index)
        scores.append(match.score)
    return tiles, red_indices, scores, errors


def read_optional_slots(
    frame: np.ndarray,
    slot_values: list[dict[str, int]],
    templates: dict[str, np.ndarray],
    threshold: float,
    debug_dir: Path | None,
    label: str,
) -> tuple[list[int], list[float]]:
    tiles: list[int] = []
    scores: list[float] = []
    for index, value in enumerate(slot_values):
        slot = Slot(**value)
        match = match_slot(frame, slot, templates)
        write_debug_roi(frame, slot, debug_dir, f"{label}-{index}-{match.tile_key}-{match.score:.3f}")
        if match.score >= threshold:
            tiles.append(match.tile_id)
            scores.append(match.score)
    return tiles, scores


def match_slot(frame: np.ndarray, slot: Slot, templates: dict[str, np.ndarray]) -> Match:
    roi = frame[slot.y : slot.y + slot.h, slot.x : slot.x + slot.w]
    if roi.size == 0:
        raise ValueError(f"slot is outside capture region: {slot}")
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)

    best_key = ""
    best_score = -1.0
    for key, template in templates.items():
        resized = cv2.resize(template, (slot.w, slot.h), interpolation=cv2.INTER_AREA)
        score = float(cv2.matchTemplate(gray, resized, cv2.TM_CCOEFF_NORMED)[0][0])
        if score > best_score:
            best_key = key
            best_score = score

    tile_key = RED_FIVE_BASE_KEY.get(best_key, best_key)
    return Match(best_key, TILE_ID_BY_KEY[tile_key], best_key in RED_FIVE_KEYS, best_score)


def write_debug_roi(frame: np.ndarray, slot: Slot, debug_dir: Path | None, name: str) -> None:
    if not debug_dir:
        return
    roi = frame[slot.y : slot.y + slot.h, slot.x : slot.x + slot.w]
    safe_name = name.replace("/", "_").replace(" ", "_")
    cv2.imwrite(str(debug_dir / f"{safe_name}.png"), roi)


def read_current_player_marker(frame: np.ndarray, areas: dict[str, Any]) -> tuple[int | None, list[float]]:
    active_players, scores = read_player_markers(frame, areas, "turn_marker")
    active_indices = [index for index, active in enumerate(active_players) if active]
    if len(active_indices) != 1:
        return None, scores
    return active_indices[0], scores


def read_player_markers(frame: np.ndarray, areas: dict[str, Any], field: str) -> tuple[list[bool], list[float]]:
    players = areas.get("players", {}) if isinstance(areas, dict) else {}
    values: list[bool] = []
    scores: list[float] = []
    for name in ("self", "right", "across", "left"):
        marker = players.get(name, {}).get(field) if isinstance(players, dict) else None
        if marker is None:
            values.append(False)
            continue
        active, score = read_color_marker(frame, marker)
        values.append(active)
        scores.append(score)
    return values, scores


def read_color_marker(frame: np.ndarray, marker: dict[str, Any]) -> tuple[bool, float]:
    slot = Slot(
        x=int(marker["x"]),
        y=int(marker["y"]),
        w=int(marker.get("w", 1)),
        h=int(marker.get("h", 1)),
    )
    roi = frame[slot.y : slot.y + slot.h, slot.x : slot.x + slot.w]
    if roi.size == 0:
        raise ValueError(f"marker is outside capture region: {slot}")

    active_rgb = marker.get("active_rgb")
    if not isinstance(active_rgb, (list, tuple)) or len(active_rgb) != 3:
        raise ValueError("color marker must contain active_rgb: [r, g, b]")
    target = np.array([float(active_rgb[2]), float(active_rgb[1]), float(active_rgb[0])])
    tolerance = float(marker.get("tolerance", 35))
    min_ratio = float(marker.get("min_ratio", 0.4))

    distances = np.linalg.norm(roi.astype(np.float32) - target, axis=2)
    ratio = float(np.count_nonzero(distances <= tolerance) / distances.size)
    return ratio >= min_ratio, ratio


def normalize_opponent_rivers(rivers: list[list[int]]) -> list[list[int]]:
    normalized = rivers[:3]
    while len(normalized) < 3:
        normalized.append([])
    return normalized


def post_payload(api_url: str, payload: dict[str, Any]) -> None:
    response = requests.post(api_url, json=payload, timeout=2)
    if response.status_code >= 400:
        raise RuntimeError(f"API rejected payload: {response.status_code} {response.text}")


if __name__ == "__main__":
    main()
