#!/usr/bin/env python3
"""Fix broken "Select Program" links in index.html."""

from __future__ import annotations

import re
from pathlib import Path

INDEX_PATH = Path("index.html")
TARGET_HREF = "training.html#pricing"


ANCHOR_RE = re.compile(r"<a\b[^>]*>.*?</a>", re.IGNORECASE | re.DOTALL)
HREF_RE = re.compile(r"href\s*=\s*([\"'])(.*?)(\1)", re.IGNORECASE | re.DOTALL)


def normalize_text(html_fragment: str) -> str:
    text = re.sub(r"<[^>]+>", " ", html_fragment)
    return re.sub(r"\s+", " ", text).strip().lower()


def update_anchor(match: re.Match[str]) -> str:
    anchor = match.group(0)
    if "select program" not in normalize_text(anchor):
        return anchor

    def replace_href(href_match: re.Match[str]) -> str:
        quote = href_match.group(1)
        return f"href={quote}{TARGET_HREF}{quote}"

    if HREF_RE.search(anchor):
        return HREF_RE.sub(replace_href, anchor, count=1)

    parts = anchor.split(">", 1)
    if len(parts) == 2:
        return f"{parts[0]} href=\"{TARGET_HREF}\">{parts[1]}"
    return anchor


def main() -> None:
    content = INDEX_PATH.read_text(encoding="utf-8")
    updated = ANCHOR_RE.sub(update_anchor, content)
    INDEX_PATH.write_text(updated, encoding="utf-8")


if __name__ == "__main__":
    main()
