# Screen Reader

External mahjong screen reader for ma-jan.

## Setup

```bash
cd /home/ubuntu/ma-jan
python3 -m venv .venv
. .venv/bin/activate
python3 -m pip install -r python/screen_reader/requirements.txt
python3 -m playwright install chromium
cp python/screen_reader/config.example.yml python/screen_reader/config.yml
```

Tile templates are in `python/screen_reader/templates/` using canonical names:

```text
1m.png ... 9m.png
1p.png ... 9p.png
1s.png ... 9s.png
1z.png ... 7z.png
```

If the target site uses red fives, also place these optional templates:

```text
0m.png 0p.png 0s.png
```

Red fives are posted to the app as normal `5m/5p/5s` tile ids plus red metadata
(`redHandIndices`, `redDrawn`), so the current AI can evaluate them without changing
the 34-kind tile model.

The honor tiles follow the app convention: `1z=東`, `2z=南`, `3z=西`, `4z=北`,
`5z=白`, `6z=發`, `7z=中`.

## Run

Start the Next.js app first, then run:

```bash
python3 python/screen_reader/reader.py --config python/screen_reader/config.yml
```

Use `--once --debug-dir /tmp/mahjong-reader` while tuning coordinates.

## Web Screenshots

Use Playwright screenshots as the coordinate source for web mahjong sites:

```bash
python3 python/screen_reader/capture_web.py \
  --url "https://example.com" \
  --out /tmp/mahjong-screen.png \
  --width 1280 \
  --height 720
```

For sites that need login, use a persistent browser profile:

```bash
python3 python/screen_reader/capture_web.py \
  --url "https://example.com" \
  --out /tmp/mahjong-screen.png \
  --profile .playwright-profile \
  --headed
```

Log in in the opened browser once, then reuse the same `--profile` later.
When using Playwright screenshots as the source, keep:

```yaml
capture_region:
  left: 0
  top: 0
  width: 1280
  height: 720
```

Open `python/screen_reader/coordinate_picker.html` in a browser, load the saved
PNG, and pick coordinates from the image. Rect mode outputs tile slots like
`{ x: 120, y: 610, w: 42, h: 58 }`. Point/color mode outputs marker settings
including `active_rgb`.

## Layout

`config.yml` can group coordinates by screen meaning:

```yaml
areas:
  table:
    dora_indicators: []
  players:
    self:
      hand: []
      drawn: null
      river: []
      melds: []
      riichi_marker: null
      dealer_marker: null
      turn_marker: null
    right:
      river: []
    across:
      river: []
    left:
      river: []
```

The current reader recognizes tiles from `self.hand`, `self.drawn`, each player's
`river`, and `table.dora_indicators`. It also recognizes `turn_marker` and
`riichi_marker` by color:

```yaml
areas:
  players:
    self:
      turn_marker:
        x: 100
        y: 100
        w: 8
        h: 8
        active_rgb: [255, 220, 80]
        tolerance: 45
        min_ratio: 0.35
      riichi_marker:
        x: 120
        y: 100
        w: 8
        h: 8
        active_rgb: [230, 40, 40]
        tolerance: 45
        min_ratio: 0.35
```

`active_rgb` is the color when the marker is on. The reader sends
`currentPlayer` (`0=self`, `1=right`, `2=across`, `3=left`) and `riichiPlayers`
to the app. `dealer_marker`, calls, honba, kyotaku, and wall remaining are still
placeholders for later recognition passes.
