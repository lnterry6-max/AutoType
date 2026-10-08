#!/usr/bin/env python3
"""Static release audit for the AutoType browser prototype."""

from __future__ import annotations

import re
import subprocess
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IGNORED_DIRS = {".git", ".github", "docs", "scripts", "__pycache__"}

SECRET_PATTERNS = {
    "Stripe secret key": re.compile(r"sk_(?:live|test)_[A-Za-z0-9]{20,}"),
    "Stripe webhook secret": re.compile(r"whsec_[A-Za-z0-9]{20,}"),
    "Supabase secret key": re.compile(r"sb_secret_[A-Za-z0-9_-]{20,}"),
}


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: list[str] = []
        self.refs: list[str] = []
        self.has_title = False
        self.has_viewport = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == "title":
            self.has_title = True
        if tag == "meta" and values.get("name", "").lower() == "viewport":
            self.has_viewport = True
        if values.get("id"):
            self.ids.append(values["id"])
        if tag in {"a", "link"} and values.get("href"):
            self.refs.append(values["href"])
        if tag in {"script", "img"} and values.get("src"):
            self.refs.append(values["src"])


def fail(message: str, issues: list[str]) -> None:
    issues.append(message)


def check_node(path: Path, issues: list[str]) -> None:
    proc = subprocess.run(["node", "--check", str(path)], capture_output=True, text=True)
    if proc.returncode:
        fail(f"{path.name}: JavaScript syntax error:\n{proc.stderr.strip()}", issues)


def main() -> int:
    issues: list[str] = []
    html_files = sorted(ROOT.glob("*.html"))

    for js in (ROOT / "core.js", ROOT / "game.js", ROOT / "backend.js"):
        if js.exists():
            check_node(js, issues)

    for page in html_files:
        text = page.read_text(encoding="utf-8")
        parser = PageParser()
        parser.feed(text)

        if not parser.has_title:
            fail(f"{page.name}: missing <title>", issues)
        if not parser.has_viewport:
            fail(f"{page.name}: missing viewport meta tag", issues)

        duplicates = sorted({value for value in parser.ids if parser.ids.count(value) > 1})
        if duplicates:
            fail(f"{page.name}: duplicate IDs: {', '.join(duplicates)}", issues)

        for ref in parser.refs:
            if ref.startswith(("http://", "https://", "#", "data:", "mailto:", "javascript:", "${")):
                continue
            clean = ref.split("?", 1)[0].split("#", 1)[0]
            if clean and not (ROOT / clean).exists():
                fail(f"{page.name}: missing local reference {ref}", issues)

        for index, script in enumerate(re.findall(r"<script>([\s\S]*?)</script>", text)):
            temp = ROOT / f".__audit_{page.stem}_{index}.js"
            temp.write_text(script, encoding="utf-8")
            try:
                check_node(temp, issues)
            finally:
                temp.unlink(missing_ok=True)

    calls: set[str] = set()
    for path in [*html_files, ROOT / "game.js"]:
        calls.update(re.findall(r"AutoType\.([A-Za-z_][A-Za-z0-9_]*)", path.read_text(encoding="utf-8")))

    core = (ROOT / "core.js").read_text(encoding="utf-8")
    match = re.search(r"window\.AutoType=\{([\s\S]*?)\n\s*\};", core)
    if not match:
        fail("core.js: could not find window.AutoType export object", issues)
    else:
        exports: set[str] = set()
        for part in match.group(1).replace("\n", " ").split(","):
            part = part.strip()
            if not part:
                continue
            exports.add(part.split(":", 1)[0].strip() if ":" in part else part)
        missing = sorted(calls - exports)
        if missing:
            fail("Missing AutoType exports: " + ", ".join(missing), issues)

    secret_scan_files = [
        *(p for p in ROOT.glob("*.js") if p.is_file()),
        *(p for p in ROOT.glob("*.html") if p.is_file()),
        *(ROOT / "supabase" / "functions").glob("**/*.ts"),
        *(ROOT / "supabase" / "functions").glob("**/*.js"),
    ]
    for path in secret_scan_files:
        text = path.read_text(encoding="utf-8")
        for label, pattern in SECRET_PATTERNS.items():
            if pattern.search(text):
                fail(f"{path.relative_to(ROOT)}: possible {label} committed", issues)

    leftovers = sorted(p.name for p in ROOT.iterdir() if p.is_file() and (".before_" in p.name or "before-home-fix" in p.name))
    if leftovers:
        fail("Historical snapshot files remain in site root: " + ", ".join(leftovers), issues)

    if issues:
        print("AutoType release audit FAILED\n")
        for issue in issues:
            print(f"- {issue}")
        return 1

    print(f"AutoType release audit passed: {len(html_files)} HTML pages checked.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
