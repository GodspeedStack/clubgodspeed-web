#!/usr/bin/env python3
"""Fix broken Select Program links in index.html."""

from __future__ import annotations

import re
from pathlib import Path

INDEX_PATH = Path(__file__).resolve().parent / "index.html"

ANCHOR_PATTERN = re.compile(
    r"<a\b[^>]*>(?:(?!<a\b).)*?Select\s+Program(?:(?!<a\b).)*?</a>",
    re.IGNORECASE | re.DOTALL,
)
HREF_PATTERN = re.compile(r"href=\"[^\"]*\"")


def fix_links(html: str) -> str:
    def replace_anchor(match: re.Match[str]) -> str:
        anchor = match.group(0)
        return HREF_PATTERN.sub('href="training.html#pricing"', anchor, count=1)

    return ANCHOR_PATTERN.sub(replace_anchor, html)


def main() -> None:
    html = INDEX_PATH.read_text(encoding="utf-8")
    updated_html = fix_links(html)
    INDEX_PATH.write_text(updated_html, encoding="utf-8")


if __name__ == "__main__":
    main()
