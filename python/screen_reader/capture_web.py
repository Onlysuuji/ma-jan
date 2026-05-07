from __future__ import annotations

import argparse
from pathlib import Path

from playwright.sync_api import sync_playwright


def main() -> None:
    parser = argparse.ArgumentParser(description="Capture a fixed-size web screenshot for screen_reader coordinates.")
    parser.add_argument("--url", required=True, help="URL to open")
    parser.add_argument("--out", required=True, help="PNG output path")
    parser.add_argument("--width", type=int, default=1280, help="Viewport width")
    parser.add_argument("--height", type=int, default=720, help="Viewport height")
    parser.add_argument("--profile", help="Persistent browser profile directory for logged-in sites")
    parser.add_argument("--wait-ms", type=int, default=1000, help="Extra wait after page load")
    parser.add_argument("--full-page", action="store_true", help="Capture the whole scrollable page")
    parser.add_argument("--headed", action="store_true", help="Show the browser window")
    args = parser.parse_args()

    out_path = Path(args.out).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as playwright:
        if args.profile:
            context = playwright.chromium.launch_persistent_context(
                str(Path(args.profile).resolve()),
                headless=not args.headed,
                viewport={"width": args.width, "height": args.height},
            )
            close_browser = context.close
        else:
            browser = playwright.chromium.launch(headless=not args.headed)
            context = browser.new_context(viewport={"width": args.width, "height": args.height})
            close_browser = browser.close

        try:
            page = context.pages[0] if context.pages else context.new_page()
            page.goto(args.url, wait_until="networkidle")
            if args.wait_ms > 0:
                page.wait_for_timeout(args.wait_ms)
            page.screenshot(path=str(out_path), full_page=args.full_page)
        finally:
            close_browser()

    print(str(out_path))


if __name__ == "__main__":
    main()
