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

    for js in (ROOT / "core.js", ROOT / "game.js", ROOT / "backend.js", ROOT / "plinko.js", ROOT / "content-pack.js", ROOT / "daily-mix.js", ROOT / "shop-rotation.js"):
        if js.exists():
            check_node(js, issues)

    regression = ROOT / "scripts" / "test-level-consistency.cjs"
    if regression.exists():
        try:
            proc = subprocess.run(
                ["node", str(regression)], capture_output=True, text=True, timeout=20
            )
            if proc.returncode:
                fail(
                    "Leaderboard level consistency regression failed:\\n"
                    + (proc.stderr.strip() or proc.stdout.strip()),
                    issues,
                )
            else:
                print(proc.stdout.strip())
        except subprocess.TimeoutExpired:
            fail("Leaderboard level consistency regression timed out.", issues)

    daily_mix_test = ROOT / "scripts" / "test-daily-mix.cjs"
    if daily_mix_test.exists():
        proc = subprocess.run(["node", str(daily_mix_test)], capture_output=True, text=True, timeout=20)
        if proc.returncode:
            fail("Daily Mix regression failed:\n" + (proc.stderr.strip() or proc.stdout.strip()), issues)
        else:
            print(proc.stdout.strip())

    rotation_test = ROOT / "scripts" / "test-shop-rotation.cjs"
    if rotation_test.exists():
        proc = subprocess.run(["node", str(rotation_test)], capture_output=True, text=True, timeout=20)
        if proc.returncode:
            fail("Shop rotation regression failed:\n" + (proc.stderr.strip() or proc.stdout.strip()), issues)
        else:
            print(proc.stdout.strip())

    admin_level_test = ROOT / "scripts" / "test-admin-progression.cjs"
    if admin_level_test.exists():
        proc = subprocess.run(["node", str(admin_level_test)], capture_output=True, text=True, timeout=20)
        if proc.returncode:
            fail("Admin progression regression failed:\\n" + (proc.stderr.strip() or proc.stdout.strip()), issues)
        else:
            print(proc.stdout.strip())

    crate_test = ROOT / "scripts" / "test-crate-variety.cjs"
    if crate_test.exists():
        proc = subprocess.run(["node", str(crate_test)], capture_output=True, text=True, timeout=20)
        if proc.returncode:
            fail("Crate variety regression failed:\\n" + (proc.stderr.strip() or proc.stdout.strip()), issues)
        else:
            print(proc.stdout.strip())

    crate_progress_test = ROOT / "scripts" / "test-mode-crate-progress.cjs"
    if crate_progress_test.exists():
        proc = subprocess.run(["node", str(crate_progress_test)], capture_output=True, text=True, timeout=20)
        if proc.returncode:
            fail("Mode crate progress regression failed:\\n" + (proc.stderr.strip() or proc.stdout.strip()), issues)
        else:
            print(proc.stdout.strip())

    post_round_test = ROOT / "scripts" / "test-post-round-crate.cjs"
    if post_round_test.exists():
        proc = subprocess.run(["node", str(post_round_test)], capture_output=True, text=True, timeout=20)
        if proc.returncode:
            fail("Post-round crate regression failed:\\n" + (proc.stderr.strip() or proc.stdout.strip()), issues)
        else:
            print(proc.stdout.strip())

    canonical_more = [
        "predictions.html", "leaderboard.html", "how-to.html", "explore.html", "settings.html"
    ]
    canonical_mobile = [
        "feedback.html", "index.html", "play.html", "tournaments.html", "shop.html",
        "friends.html", "chat.html", "notifications.html", "predictions.html",
        "leaderboard.html", "how-to.html", "explore.html", "settings.html"
    ]
    special_pages = {"404.html", "backend-test.html"}
    # Daily Mix CSS must be cache-busted on both screens when its layout changes.
    mix_stylesheet_version = "styles.css?v=20261008-per-mode-crates-v1"
    mix_script_version = "daily-mix.js?v=20261008-daily-mix-v2"

    for page in html_files:
        text = page.read_text(encoding="utf-8")
        parser = PageParser()
        parser.feed(text)

        if not parser.has_title:
            fail(f"{page.name}: missing <title>", issues)
        if not parser.has_viewport:
            fail(f"{page.name}: missing viewport meta tag", issues)

        # All shared headers must have the same features, without a "lost" More tab.
        if page.name not in special_pages:
            more_match = re.search(
                r'<div class="nav-more-menu">((?s:.*?))</div>', text
            )
            mobile_match = re.search(
                r'<nav class="mobile-nav" id="mobileNav">((?s:.*?))</nav>', text
            )
            for label, match, expected in (
                ("More", more_match, canonical_more),
                ("mobile", mobile_match, canonical_mobile),
            ):
                actual = re.findall(r'href="([^"]+)"', match.group(1)) if match else []
                if actual != expected:
                    fail(
                        f"{page.name}: {label} navigation drift: expected {expected}, got {actual}",
                        issues,
                    )
            for header_url in ("chat.html", "notifications.html", "feedback.html"):
                if not re.search(
                    r'class="header-[^"]+-link"[^>]*href="' + re.escape(header_url) + r'"',
                    text,
                ):
                    fail(f"{page.name}: missing persistent header shortcut to {header_url}", issues)

        if page.name in {"index.html", "play.html"}:
            if mix_stylesheet_version not in text:
                fail(f"{page.name}: Daily Mix CSS cache version is outdated", issues)
            if mix_script_version not in text:
                fail(f"{page.name}: Daily Mix script cache version is outdated", issues)

        if page.name == "shop.html":
            for required in (
                'shop-rotation.js?v=20261008-et-limited',
                'styles.css?v=20261008-per-mode-crates-v1',
                'id="shopDailyGrid"', 'id="shopRotationClock"',
                'href="profile.html#inventory"',
            ):
                if required not in text:
                    fail("Limited shop missing current assets or markup: "+required, issues)
            for removed in (
                'data-shop-view="cosmetics"', 'id="shopGrid"',
                'id="collectionGrid"', 'data-open-cosmetics'
            ):
                if removed in text:
                    fail("Limited shop still exposes full catalog: "+removed, issues)

        if page.name == "play.html":
            mode_grid = re.search(r'<div class="mode-card-grid">([\s\S]*?)</div>\s*<div class="special-mode-strip">', text)
            if not mode_grid:
                fail("play.html: missing mode selection grid", issues)
            else:
                first_tile = re.search(r'<a class="([^"]+)"[^>]*>', mode_grid.group(1))
                if not first_tile or "surprise-mode" not in first_tile.group(1).split() or "plinko-mode" not in first_tile.group(1).split():
                    fail("play.html: Surprise Me must lead the mode grid as a full-width Plinko-style tile", issues)
                if len(re.findall(r'class="mode-tile[^"]*"', mode_grid.group(1))) != 6:
                    fail("play.html: expected six mode selection tiles", issues)

        if page.name == "play.html":
            for required in ("resultModeCrate", "resultModeCrateMeter",
                             "resultModeCrateCount", "game.js?v=20261008-result-crate-progress-v1"):
                if required not in text:
                    fail(f"play.html: post-round crate feedback missing {required}", issues)

        if page.name == "play.html":
            for required_id in (
                "mobileStartButton", "mobileTypingInput", "mobileEraseButton",
                "mobileLockButton", "scoreExplainer", "scoreNextWord"
            ):
                if required_id not in parser.ids:
                    fail(f"play.html: missing mobile/scoring control #{required_id}", issues)
            if 'type="text" inputmode="text"' not in text:
                fail("play.html: native mobile keyboard input is missing", issues)

        if page.name == "profile.html":
            for expected in ('id="inventory"', 'inventoryAccordion.open=true',
                             'styles.css?v=20261008-per-mode-crates-v1'):
                if expected not in text:
                    fail(f"profile.html: missing inventory accordion detail {expected}", issues)
            if 'id="developerPanel"' in text:
                fail("Developer controls must live in Admin Console, not Profile", issues)
        if page.name == "admin.html":
            if 'backend.js?v=20261008-per-mode-crates-v1' not in text:
                fail("Admin level code is not cache-busted", issues)
            if 'achievements:m.achievements[profile.id]||{}' not in text:
                fail("Admin player levels are ignoring achievements", issues)

        # Keep all pages on the same live JS/CSS build, rather than silently
        # mixing old cached components with new HTML markup.
        for path_or_script in ("styles.css", "core.js", "backend.js"):
            for match in re.finditer(re.escape(path_or_script) + r'\?v=([^"]+)', text):
                if match.group(1) != "20261008-per-mode-crates-v1":
                    fail(f"{page.name}: stale shared asset build {match.group(0)}", issues)

        # Check cross-page fragment targets, including Inventory deep links.
        for ref in parser.refs:
            if ".html#" not in ref or ref.startswith(("http://", "https://")):
                continue
            target_path, fragment = ref.split("#", 1)
            target_path = target_path.split("?", 1)[0]
            if (target_path,fragment) == ("shop.html","crates"):
                continue  # JS-driven shop tab supports this hash without a static id.
            if not target_path or not fragment:
                continue
            target_file = ROOT / target_path
            if target_file.is_file():
                target_html = target_file.read_text(encoding="utf-8")
                if (f'id="{fragment}"' not in target_html and
                        f"id='{fragment}'" not in target_html):
                    fail(f"{page.name}: broken fragment link {ref}", issues)

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

    # Reject duplicate migration timestamps and mismatched client/server game actions.
    migration_dir = ROOT / "supabase" / "migrations"
    versions: dict[str, str] = {}
    if migration_dir.exists():
        for path in sorted(migration_dir.glob("*.sql")):
            match = re.fullmatch(r"(\d{14})_[a-z0-9_]+\.sql", path.name)
            if not match:
                fail(f"Invalid migration filename: {path.name}", issues)
                continue
            version = match.group(1)
            if version in versions:
                fail(f"Duplicate migration version {version}: {versions[version]} and {path.name}", issues)
            versions[version] = path.name

    client = ROOT / "backend.js"
    gateway = ROOT / "supabase" / "functions" / "game-api" / "index.ts"
    if client.exists() and gateway.exists():
        client_actions = set(re.findall(r'api\(\s*"([a-z_]+)"', client.read_text(encoding="utf-8")))
        handler_actions = set(re.findall(r'case\s+"([a-z_]+)"', gateway.read_text(encoding="utf-8")))
        missing = sorted(client_actions - handler_actions)
        if missing:
            fail("Missing game-api handlers: " + ", ".join(missing), issues)

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
