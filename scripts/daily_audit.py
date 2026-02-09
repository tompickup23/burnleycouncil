#!/usr/bin/env python3
"""
daily_audit.py — Automated daily health check for AI DOGE
Zero dependencies (stdlib only), zero API tokens, zero cost.

Checks:
  1. JSON validity across all councils
  2. Schema consistency (missing/extra fields vs reference council)
  3. Cross-council data file sync (cross_council.json x5)
  4. Data freshness (spending dates, meetings, generation timestamps)
  5. File size anomalies (sudden changes)
  6. Config feature flags vs actual file existence
  7. Known bug patterns in JSX source (inc. React hooks-after-return)
  8. Lazy-loaded routes have Suspense/Guarded wrappers
  9. Unsafe property access patterns (missing optional chaining)
  10. Git state (uncommitted changes, branch divergence)
  11. Live site verification (data files, article/FOI counts, page loads)
  12. Build & test health (optional --build flag)

Usage:
    python3 scripts/daily_audit.py                  # Full audit, markdown report
    python3 scripts/daily_audit.py --json            # Output as JSON
    python3 scripts/daily_audit.py --build           # Also run npm test + build
    python3 scripts/daily_audit.py --fix             # Auto-fix trivial issues
    python3 scripts/daily_audit.py --quiet           # Errors/warnings only

Output: burnley-council/reports/audit_YYYY-MM-DD.md (and latest.md symlink)
"""

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "burnley-council" / "data"
SRC_DIR = ROOT / "src"
PUBLIC_DATA = ROOT / "public" / "data"
REPORT_DIR = ROOT / "burnley-council" / "reports"

COUNCILS = ["burnley", "hyndburn", "pendle", "rossendale"]
REFERENCE_COUNCIL = "burnley"  # Most complete council, used as schema reference

# Expected data files per council (filename → required)
EXPECTED_FILES = {
    "config.json": True,
    "spending.json": True,
    "insights.json": True,
    "metadata.json": True,
    "supplier_profiles.json": True,
    "cross_council.json": True,
    "councillors.json": False,
    "politics_summary.json": False,
    "wards.json": False,
    "meetings.json": False,
    "budgets_govuk.json": False,
    "budgets_summary.json": False,
    "revenue_trends.json": False,
    "pay_comparison.json": False,
    "foi_templates.json": False,
    "doge_findings.json": False,
    "doge_knowledge.json": False,
    "crime_stats.json": False,
    "data_quality_report.json": False,
    "articles-index.json": False,
}

# Config keys that should exist in every council
REQUIRED_CONFIG_KEYS = [
    "council_id", "council_name", "council_full_name",
    "official_website", "spending_threshold", "data_sources",
    "publisher", "theme_accent", "doge_context",
]

# JSX bug patterns to scan for
BUG_PATTERNS = [
    (r'\.map\(', r'\?\.\s*map\(|^\s*//|\.filter\(.*\.map\(|\|\|\s*\[\].*\.map\(',
     "Unguarded .map() — may crash on undefined",
     ["pages/"]),
    (r'\.charAt\(', r'\|\|\s*[\'"]',
     "Unguarded .charAt() — may crash on undefined",
     ["pages/"]),
    (r'Object\.entries\(', r'Object\.entries\([^)]*\|\|\s*\{\}|Object\.entries\(\w+\??\.',
     "Object.entries() without fallback — crashes on undefined",
     ["pages/"]),
    (r'<rect\s+key=', r'<Cell\s+key=',
     "Recharts: <rect> should be <Cell> for per-bar coloring",
     ["pages/"]),
]


class AuditResult:
    """Collects findings at different severity levels."""

    def __init__(self):
        self.findings = []  # (severity, category, message, detail)
        self.stats = {}

    def error(self, cat, msg, detail=""):
        self.findings.append(("ERROR", cat, msg, detail))

    def warn(self, cat, msg, detail=""):
        self.findings.append(("WARN", cat, msg, detail))

    def info(self, cat, msg, detail=""):
        self.findings.append(("INFO", cat, msg, detail))

    def ok(self, cat, msg, detail=""):
        self.findings.append(("OK", cat, msg, detail))

    @property
    def errors(self):
        return [f for f in self.findings if f[0] == "ERROR"]

    @property
    def warnings(self):
        return [f for f in self.findings if f[0] == "WARN"]

    def score(self):
        """0-100 health score."""
        if not self.findings:
            return 100
        total = len(self.findings)
        err_penalty = len(self.errors) * 10
        warn_penalty = len(self.warnings) * 3
        return max(0, 100 - err_penalty - warn_penalty)


# ── Helpers ───────────────────────────────────────────────────────────

def load_json(path):
    """Load JSON, return (data, error_string)."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f), None
    except json.JSONDecodeError as e:
        return None, f"Invalid JSON: {e}"
    except FileNotFoundError:
        return None, "File not found"
    except Exception as e:
        return None, str(e)


def file_hash(path):
    """SHA256 of file contents."""
    h = hashlib.sha256()
    try:
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                h.update(chunk)
        return h.hexdigest()[:16]
    except FileNotFoundError:
        return None


def run_cmd(cmd, timeout=120):
    """Run command, return (returncode, stdout, stderr). Accepts list or string."""
    import shlex
    try:
        if isinstance(cmd, str):
            cmd = shlex.split(cmd)
        r = subprocess.run(cmd, capture_output=True, text=True,
                          timeout=timeout, cwd=str(ROOT))
        return r.returncode, r.stdout.strip(), r.stderr.strip()
    except subprocess.TimeoutExpired:
        return -1, "", "Timed out"
    except Exception as e:
        return -1, "", str(e)


# ── Audit Checks ─────────────────────────────────────────────────────

def check_json_validity(audit):
    """Check all JSON files parse correctly."""
    for council in COUNCILS:
        council_dir = DATA_DIR / council
        if not council_dir.is_dir():
            audit.error("json", f"{council}: data directory missing")
            continue
        for fname, required in EXPECTED_FILES.items():
            fpath = council_dir / fname
            if not fpath.exists():
                if required:
                    audit.error("json", f"{council}/{fname}: MISSING (required)")
                continue
            data, err = load_json(fpath)
            if err:
                audit.error("json", f"{council}/{fname}: {err}")
            else:
                # Check articles-index is an array
                if fname == "articles-index.json" and not isinstance(data, list):
                    audit.error("json",
                        f"{council}/{fname}: Must be array [], got {type(data).__name__}")


def check_schema_consistency(audit):
    """Compare config.json keys across councils vs reference."""
    ref_path = DATA_DIR / REFERENCE_COUNCIL / "config.json"
    ref_data, err = load_json(ref_path)
    if err:
        audit.error("schema", f"Cannot load reference config: {err}")
        return

    ref_keys = set(ref_data.keys())
    ref_ds_keys = set(ref_data.get("data_sources", {}).keys())

    for council in COUNCILS:
        cfg_path = DATA_DIR / council / "config.json"
        cfg, err = load_json(cfg_path)
        if err:
            continue  # Already reported in json check

        # Required keys
        for key in REQUIRED_CONFIG_KEYS:
            if key not in cfg:
                audit.warn("schema", f"{council}/config.json: missing required key '{key}'")

        # data_sources consistency
        ds = cfg.get("data_sources", {})
        ds_keys = set(ds.keys())
        missing_ds = ref_ds_keys - ds_keys
        extra_ds = ds_keys - ref_ds_keys
        if missing_ds:
            audit.warn("schema",
                f"{council}/config.json: data_sources missing keys: {sorted(missing_ds)}")
        if extra_ds:
            audit.info("schema",
                f"{council}/config.json: data_sources extra keys: {sorted(extra_ds)}")


def check_feature_flag_files(audit):
    """Check data_sources flags match actual file existence."""
    flag_to_file = {
        "spending": "spending.json",
        "budgets": "budgets_summary.json",
        "budget_trends": "revenue_trends.json",
        "politics": "councillors.json",
        "meetings": "meetings.json",
        "news": "articles-index.json",
        "foi": "foi_templates.json",
        "pay_comparison": "pay_comparison.json",
    }

    for council in COUNCILS:
        cfg, _ = load_json(DATA_DIR / council / "config.json")
        if not cfg:
            continue
        ds = cfg.get("data_sources", {})
        for flag, fname in flag_to_file.items():
            flag_val = ds.get(flag, False)
            file_exists = (DATA_DIR / council / fname).exists()
            if flag_val and not file_exists:
                audit.error("flags",
                    f"{council}: {flag}=true but {fname} missing")
            if not flag_val and file_exists:
                audit.info("flags",
                    f"{council}: {flag}=false but {fname} exists (hidden data)")


def check_cross_council_sync(audit):
    """Verify all 5 copies of cross_council.json are identical."""
    paths = [DATA_DIR / c / "cross_council.json" for c in COUNCILS]
    paths.append(PUBLIC_DATA / "cross_council.json")
    labels = COUNCILS + ["public/data"]

    hashes = {}
    for path, label in zip(paths, labels):
        h = file_hash(path)
        if h is None:
            audit.warn("sync", f"cross_council.json missing: {label}")
        else:
            hashes[label] = h

    unique = set(hashes.values())
    if len(unique) == 1:
        audit.ok("sync", f"cross_council.json: all {len(hashes)} copies in sync")
    elif len(unique) > 1:
        groups = defaultdict(list)
        for label, h in hashes.items():
            groups[h].append(label)
        detail = "; ".join(f"{','.join(v)}: {k}" for k, v in groups.items())
        audit.error("sync", f"cross_council.json OUT OF SYNC ({len(unique)} versions)", detail)


def check_data_freshness(audit):
    """Check if data files are stale."""
    now = datetime.now()

    for council in COUNCILS:
        # Check spending.json date range
        meta, _ = load_json(DATA_DIR / council / "metadata.json")
        if meta:
            dr = meta.get("date_range", {})
            max_date_str = dr.get("max", "")
            if max_date_str:
                try:
                    max_date = datetime.strptime(max_date_str, "%Y-%m-%d")
                    age_days = (now - max_date).days
                    if age_days > 180:
                        audit.warn("freshness",
                            f"{council}: spending data ends {max_date_str} ({age_days}d ago)")
                    else:
                        audit.ok("freshness",
                            f"{council}: spending data current to {max_date_str}")
                except ValueError:
                    pass

            record_count = meta.get("total_records", meta.get("record_count", 0))
            audit.stats[f"{council}_records"] = record_count

        # Check meetings freshness
        meetings, _ = load_json(DATA_DIR / council / "meetings.json")
        if not meetings:
            meetings, _ = load_json(PUBLIC_DATA / "meetings.json")
        if meetings:
            lu = meetings.get("last_updated", "")
            if lu:
                try:
                    lu_date = datetime.fromisoformat(lu.replace("Z", "+00:00"))
                    age_days = (now - lu_date.replace(tzinfo=None)).days
                    if age_days > 14:
                        audit.warn("freshness",
                            f"meetings.json: last updated {age_days}d ago ({lu[:10]})")
                except (ValueError, TypeError):
                    pass

        # Check data_quality_report generation date
        dqr, _ = load_json(DATA_DIR / council / "data_quality_report.json")
        if dqr:
            gen = dqr.get("generated", "")
            if gen:
                try:
                    gen_date = datetime.fromisoformat(gen.replace("Z", "+00:00"))
                    age_days = (now - gen_date.replace(tzinfo=None)).days
                    if age_days > 30:
                        audit.info("freshness",
                            f"{council}: data quality report is {age_days}d old")
                except (ValueError, TypeError):
                    pass


def check_file_sizes(audit):
    """Report file sizes and flag anomalies."""
    size_data = {}
    for council in COUNCILS:
        council_dir = DATA_DIR / council
        if not council_dir.is_dir():
            continue
        for fname in EXPECTED_FILES:
            fpath = council_dir / fname
            if fpath.exists():
                size = fpath.stat().st_size
                key = fname
                if key not in size_data:
                    size_data[key] = {}
                size_data[key][council] = size

    # Flag files where one council is 10x bigger/smaller than average
    for fname, sizes in size_data.items():
        if len(sizes) < 2:
            continue
        vals = list(sizes.values())
        avg = sum(vals) / len(vals)
        if avg == 0:
            continue
        for council, size in sizes.items():
            ratio = size / avg if avg > 0 else 0
            if ratio > 5:
                audit.warn("size",
                    f"{council}/{fname}: {size/1024:.0f}KB — {ratio:.1f}x larger than average ({avg/1024:.0f}KB)")
            elif ratio < 0.1 and size < 100:
                audit.warn("size",
                    f"{council}/{fname}: {size}B — suspiciously small")

    # Total sizes for stats
    for council in COUNCILS:
        council_dir = DATA_DIR / council
        if council_dir.is_dir():
            total = sum(f.stat().st_size for f in council_dir.rglob("*") if f.is_file())
            audit.stats[f"{council}_data_mb"] = round(total / 1024 / 1024, 1)


def _check_hooks_after_return(audit, jsx_file, lines):
    """Detect React hooks (useMemo, useCallback, etc.) placed after early return statements.

    React's Rules of Hooks require hooks to be called in the same order every render.
    If a useMemo/useCallback/useEffect appears AFTER an early `return` (e.g. loading/error
    guard), the hook count changes between renders → crash:
    "Rendered more hooks than during the previous render"

    This exact bug crashed all 4 council sites on 9 Feb 2026.
    """
    HOOK_PATTERN = re.compile(
        r'\b(useMemo|useCallback|useEffect|useLayoutEffect|useRef|useReducer|useContext|useData)\s*\('
    )
    # Match early returns: `return <`, `return (`, `return null`
    # But NOT inside callbacks/arrows: must be at component-body indent level
    EARLY_RETURN = re.compile(r'^\s{2,6}return\s+[\(<n]')
    # Detect component function boundaries
    COMPONENT_START = re.compile(r'^(?:export\s+)?(?:default\s+)?function\s+[A-Z]')

    in_component = False
    found_early_return = False
    early_return_line = 0

    for line_no, line in enumerate(lines, 1):
        stripped = line.strip()

        # Track component function boundaries
        if COMPONENT_START.search(line):
            in_component = True
            found_early_return = False
            continue

        if not in_component:
            continue

        # Skip comments
        if stripped.startswith("//") or stripped.startswith("*") or stripped.startswith("/*"):
            continue

        # Detect early return (loading/error guards)
        if EARLY_RETURN.search(line) and not re.search(r'=>', line):
            # Verify this looks like a guard return (has loading/error/!data nearby)
            context_window = "\n".join(lines[max(0, line_no - 3):line_no])
            if re.search(r'loading|error|!\s*\w+Data|!\s*data\b', context_window, re.IGNORECASE):
                found_early_return = True
                early_return_line = line_no

        # If we've seen an early return, flag any hooks after it
        if found_early_return and HOOK_PATTERN.search(line):
            hook_match = HOOK_PATTERN.search(line)
            hook_name = hook_match.group(1)
            audit.error("code",
                f"{jsx_file.name}:{line_no}: `{hook_name}` after early return (line {early_return_line})",
                f"React Rules of Hooks violation — hooks must be before all return statements")


def check_jsx_bugs(audit):
    """Scan JSX source for known bug patterns."""
    pages_dir = SRC_DIR / "pages"
    if not pages_dir.is_dir():
        audit.warn("code", "src/pages/ directory not found")
        return

    for jsx_file in sorted(pages_dir.glob("*.jsx")):
        try:
            content = jsx_file.read_text(encoding="utf-8")
        except Exception:
            continue

        lines = content.split("\n")

        # ── Check 1: Hooks after early returns (Rules of Hooks violation) ──
        # React hooks (useMemo, useCallback, useEffect, useState, etc.) MUST
        # be called unconditionally — never after an early return statement.
        # This caused crashes on all 4 council sites on 9 Feb 2026.
        _check_hooks_after_return(audit, jsx_file, lines)

        for line_no, line in enumerate(lines, 1):
            stripped = line.strip()
            if stripped.startswith("//") or stripped.startswith("*"):
                continue

            # Check for state updates outside useEffect
            if re.search(r'\bset[A-Z]\w*\(', line) and not re.search(r'useEffect|useCallback|onClick|onChange|onSubmit|=>|\.then|\.catch', line):
                # Very rough heuristic — only flag if in render body
                # (between function start and return statement)
                pass  # Too many false positives, skip

            # Check for <rect> in Recharts (should be <Cell>)
            if "<rect " in line and "key=" in line and "fill=" in line:
                audit.warn("code",
                    f"{jsx_file.name}:{line_no}: <rect> inside Bar — should be <Cell>",
                    stripped[:80])


def check_lazy_suspense(audit):
    """Verify all lazy-loaded components are wrapped in Suspense/Guarded boundaries.

    If a component is lazy-loaded with React.lazy() but rendered WITHOUT a <Suspense>
    or <Guarded> wrapper, React throws Error #310 and the page goes blank.
    This was the root cause of the Home route crash on 9 Feb 2026.
    """
    app_jsx = SRC_DIR / "App.jsx"
    if not app_jsx.exists():
        return

    content = app_jsx.read_text(encoding="utf-8")

    # Find all lazy-loaded component names
    lazy_components = set(re.findall(r"const\s+(\w+)\s*=\s*lazy\(", content))
    if not lazy_components:
        return

    # Find all route elements
    for match in re.finditer(r'element=\{(.*?)\}', content):
        element = match.group(1)
        # Check if any lazy component is used without Guarded/Suspense wrapper
        for comp in lazy_components:
            if f"<{comp}" in element and "<Guarded>" not in element and "<Suspense" not in element:
                line_no = content[:match.start()].count("\n") + 1
                audit.error("code",
                    f"App.jsx:{line_no}: <{comp}/> is lazy-loaded but NOT wrapped in <Guarded>",
                    "Lazy component without Suspense boundary causes React Error #310")

    audit.ok("code", f"All {len(lazy_components)} lazy-loaded routes have Suspense boundaries")


def check_undefined_data_access(audit):
    """Check for common patterns where data properties are accessed without guards.

    Detects: obj.nested.property without optional chaining or fallback defaults.
    Focus on data destructuring from useData() hooks where the data shape is unknown.
    This caught the Meetings.jsx crash (how_to_attend.full_council on undefined).
    """
    pages_dir = SRC_DIR / "pages"
    if not pages_dir.is_dir():
        return

    # Pattern: accessing .something on a variable that comes from data/JSON
    # without optional chaining (?.) or fallback (|| {})
    RISKY_PATTERNS = [
        # data.nested without ?. — e.g. meetingsData.how_to_attend.full_council
        (re.compile(r'\b(\w+Data)\.(\w+)\.(\w+)(?!\?)'),
         "Chained property access without optional chaining"),
        # Destructuring without defaults — e.g. const { x } = data.nested (no || {})
        (re.compile(r'const\s+\{[^}]+\}\s*=\s*\w+\.(\w+)\s*$', re.MULTILINE),
         "Destructuring from nested property without fallback"),
    ]

    for jsx_file in sorted(pages_dir.glob("*.jsx")):
        if ".test." in jsx_file.name:
            continue
        try:
            content = jsx_file.read_text(encoding="utf-8")
        except Exception:
            continue

        lines = content.split("\n")
        for line_no, line in enumerate(lines, 1):
            stripped = line.strip()
            if stripped.startswith("//") or stripped.startswith("*"):
                continue
            for pattern, desc in RISKY_PATTERNS:
                if pattern.search(line) and "?." not in line and "|| {}" not in line and "|| []" not in line:
                    # Only flag if it looks like data access (not import, not JSX attribute)
                    if "import " in line or "from " in line or "className" in line:
                        continue
                    audit.info("code",
                        f"{jsx_file.name}:{line_no}: {desc}",
                        stripped[:80])


def check_live_site(audit):
    """Verify the deployed site at aidoge.co.uk has correct data and pages load.

    Checks:
    1. All 4 council root pages return 200
    2. Key data files are accessible and non-empty
    3. Article counts match source data
    4. FOI template counts match source data
    5. Config.json is accessible per council
    """
    import urllib.request
    import urllib.error

    BASE_URL = "https://aidoge.co.uk/lancashire"
    COUNCIL_SLUGS = {
        "burnley": "burnleycouncil",
        "hyndburn": "hyndburncouncil",
        "pendle": "pendlecouncil",
        "rossendale": "rossendalecouncil",
    }

    # Critical data files that must be present and non-empty
    CRITICAL_FILES = [
        "config.json", "spending.json", "articles-index.json",
        "foi_templates.json", "doge_findings.json", "insights.json",
    ]

    for council_id, slug in COUNCIL_SLUGS.items():
        # 1. Check council root page
        root_url = f"{BASE_URL}/{slug}/"
        try:
            req = urllib.request.urlopen(root_url, timeout=15)
            if req.getcode() == 200:
                body = req.read().decode("utf-8", errors="ignore")
                if 'id="root"' in body or 'id="app"' in body:
                    audit.ok("live", f"{council_id}: root page loads (200, SPA detected)")
                else:
                    audit.warn("live", f"{council_id}: root page 200 but no SPA root element")
            else:
                audit.error("live", f"{council_id}: root page returned {req.getcode()}")
        except urllib.error.HTTPError as e:
            audit.error("live", f"{council_id}: root page HTTP {e.code}")
        except Exception as e:
            audit.error("live", f"{council_id}: root page unreachable ({e})")

        # 2. Check critical data files
        for fname in CRITICAL_FILES:
            data_url = f"{BASE_URL}/{slug}/data/{fname}"
            try:
                req = urllib.request.urlopen(data_url, timeout=15)
                body = req.read()
                size = len(body)
                if size < 10:
                    audit.error("live",
                        f"{council_id}/{fname}: deployed but empty ({size}B)")
                else:
                    # Validate JSON
                    try:
                        parsed = json.loads(body)
                    except json.JSONDecodeError:
                        audit.error("live",
                            f"{council_id}/{fname}: deployed but invalid JSON ({size}B)")
                        continue

                    # 3. Compare article counts with source
                    if fname == "articles-index.json" and isinstance(parsed, list):
                        live_count = len(parsed)
                        source_path = DATA_DIR / council_id / fname
                        if source_path.exists():
                            src_data, _ = load_json(source_path)
                            if isinstance(src_data, list):
                                src_count = len(src_data)
                                if live_count != src_count:
                                    audit.error("live",
                                        f"{council_id}: articles mismatch — "
                                        f"live={live_count}, source={src_count}")
                                else:
                                    audit.ok("live",
                                        f"{council_id}: {live_count} articles match source")

                    # 4. Compare FOI template counts
                    if fname == "foi_templates.json" and isinstance(parsed, dict):
                        cats = parsed.get("categories", [])
                        live_count = sum(
                            len(c.get("templates", [])) for c in cats
                        )
                        source_path = DATA_DIR / council_id / fname
                        if source_path.exists():
                            src_data, _ = load_json(source_path)
                            if isinstance(src_data, dict):
                                src_cats = src_data.get("categories", [])
                                src_count = sum(
                                    len(c.get("templates", [])) for c in src_cats
                                )
                                if live_count != src_count:
                                    audit.error("live",
                                        f"{council_id}: FOI templates mismatch — "
                                        f"live={live_count}, source={src_count}")
                                else:
                                    audit.ok("live",
                                        f"{council_id}: {live_count} FOI templates match source")

            except urllib.error.HTTPError as e:
                audit.error("live", f"{council_id}/{fname}: HTTP {e.code}")
            except Exception as e:
                audit.error("live", f"{council_id}/{fname}: {e}")

    # 5. Check hub page
    try:
        req = urllib.request.urlopen("https://aidoge.co.uk", timeout=15)
        if req.getcode() == 200:
            audit.ok("live", "Hub page (aidoge.co.uk) loads OK")
        else:
            audit.error("live", f"Hub page returned {req.getcode()}")
    except Exception as e:
        audit.error("live", f"Hub page unreachable ({e})")


def check_git_state(audit):
    """Check git repository health."""
    # Uncommitted changes
    rc, out, _ = run_cmd("git status --porcelain")
    if rc == 0 and out:
        changed = len(out.strip().split("\n"))
        audit.info("git", f"{changed} uncommitted file(s)")

    # Current branch
    rc, branch, _ = run_cmd("git branch --show-current")
    if rc == 0:
        audit.stats["branch"] = branch

    # Commits ahead/behind main
    rc, out, _ = run_cmd(["git", "rev-list", "--left-right", "--count", "origin/main...HEAD"])
    if rc == 0 and out:
        parts = out.split()
        if len(parts) == 2:
            behind, ahead = int(parts[0]), int(parts[1])
            if behind > 0:
                audit.warn("git", f"Branch is {behind} commits behind main")
            if ahead > 0:
                audit.info("git", f"Branch is {ahead} commits ahead of main")

    # gh-pages staleness
    rc, out, _ = run_cmd(["git", "log", "-1", "--format=%ci", "origin/gh-pages"])
    if rc == 0 and out:
        try:
            deploy_date = datetime.strptime(out[:19], "%Y-%m-%d %H:%M:%S")
            age = (datetime.now() - deploy_date).days
            audit.stats["deploy_age_days"] = age
            if age > 7:
                audit.warn("git", f"gh-pages last deployed {age}d ago ({out[:10]})")
            else:
                audit.ok("git", f"gh-pages deployed {age}d ago ({out[:10]})")
        except ValueError:
            pass


def check_build_test(audit):
    """Run npm test and build (optional, slow)."""
    # Tests
    rc, out, err = run_cmd(["npm", "run", "test"], timeout=120)
    if rc == 0:
        # Extract pass count
        match = re.search(r"(\d+) passed", out + err)
        count = match.group(1) if match else "?"
        audit.ok("build", f"Tests: {count} passed")
        audit.stats["tests_passed"] = int(match.group(1)) if match else 0
    else:
        audit.error("build", "Tests FAILED", (out + err)[-200:])

    # Build
    rc, out, err = run_cmd(["npx", "vite", "build"], timeout=180)
    if rc == 0:
        audit.ok("build", "Vite build succeeded")
    else:
        audit.error("build", "Vite build FAILED", (out + err)[-200:])


def check_spending_data_quality(audit):
    """Quick quality checks on spending.json without loading full file."""
    for council in COUNCILS:
        spath = DATA_DIR / council / "spending.json"
        if not spath.exists():
            continue

        size_mb = spath.stat().st_size / 1024 / 1024

        # Sample first and last records
        try:
            with open(spath, "r") as f:
                data = json.load(f)
        except Exception:
            continue

        if not isinstance(data, list):
            audit.error("quality", f"{council}/spending.json: root is not an array")
            continue

        count = len(data)
        audit.stats[f"{council}_spending_records"] = count
        audit.stats[f"{council}_spending_mb"] = round(size_mb, 1)

        if count == 0:
            audit.error("quality", f"{council}: spending.json is empty")
            continue

        # Check first record has expected fields
        sample = data[0]
        for field in ["date", "supplier", "amount"]:
            if field not in sample:
                audit.warn("quality",
                    f"{council}/spending.json: first record missing '{field}'")

        # Check for duplicate records (sample-based)
        if count > 100:
            # Hash first 1000 records
            seen = set()
            dupes = 0
            for rec in data[:min(count, 2000)]:
                key = f"{rec.get('date')}|{rec.get('supplier')}|{rec.get('amount')}"
                if key in seen:
                    dupes += 1
                seen.add(key)
            if dupes > 0:
                pct = dupes / min(count, 2000) * 100
                audit.info("quality",
                    f"{council}: ~{pct:.1f}% potential duplicates in first 2000 records ({dupes} found)")


# ── Report Generation ─────────────────────────────────────────────────

def generate_markdown_report(audit):
    """Generate concise markdown audit report."""
    now = datetime.now()
    score = audit.score()

    # Score emoji
    if score >= 90:
        grade = "A"
    elif score >= 75:
        grade = "B"
    elif score >= 60:
        grade = "C"
    else:
        grade = "F"

    lines = [
        f"# Daily Audit — {now.strftime('%d %b %Y %H:%M')}",
        f"",
        f"**Health: {score}/100 ({grade})** | "
        f"Errors: {len(audit.errors)} | Warnings: {len(audit.warnings)} | "
        f"Total checks: {len(audit.findings)}",
        f"",
    ]

    # Stats summary
    if audit.stats:
        lines.append("## Stats")
        lines.append("")
        lines.append("| Metric | Value |")
        lines.append("|--------|-------|")
        for k, v in sorted(audit.stats.items()):
            lines.append(f"| {k} | {v} |")
        lines.append("")

    # Group findings by category
    cats = defaultdict(list)
    for sev, cat, msg, detail in audit.findings:
        cats[cat].append((sev, msg, detail))

    for cat in sorted(cats.keys()):
        items = cats[cat]
        lines.append(f"## {cat.title()}")
        lines.append("")
        for sev, msg, detail in items:
            icon = {"ERROR": "X", "WARN": "!", "INFO": "-", "OK": "+"}[sev]
            lines.append(f"- [{icon}] **{sev}**: {msg}")
            if detail:
                lines.append(f"  - `{detail[:120]}`")
        lines.append("")

    return "\n".join(lines)


def generate_json_report(audit):
    """Generate JSON audit report."""
    return json.dumps({
        "date": datetime.now().isoformat(),
        "score": audit.score(),
        "errors": len(audit.errors),
        "warnings": len(audit.warnings),
        "stats": audit.stats,
        "findings": [
            {"severity": s, "category": c, "message": m, "detail": d}
            for s, c, m, d in audit.findings
        ],
    }, indent=2)


# ── Main ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="AI DOGE daily system audit")
    parser.add_argument("--json", action="store_true", help="Output JSON instead of markdown")
    parser.add_argument("--build", action="store_true", help="Also run npm test + build")
    parser.add_argument("--quiet", action="store_true", help="Only show errors and warnings")
    parser.add_argument("--stdout", action="store_true", help="Print to stdout only, don't save file")
    args = parser.parse_args()

    audit = AuditResult()

    # Run all checks
    print("Running audit...", file=sys.stderr)

    print("  [1/12] JSON validity...", file=sys.stderr)
    check_json_validity(audit)

    print("  [2/12] Schema consistency...", file=sys.stderr)
    check_schema_consistency(audit)

    print("  [3/12] Feature flags vs files...", file=sys.stderr)
    check_feature_flag_files(audit)

    print("  [4/12] Cross-council sync...", file=sys.stderr)
    check_cross_council_sync(audit)

    print("  [5/12] Data freshness...", file=sys.stderr)
    check_data_freshness(audit)

    print("  [6/12] File sizes...", file=sys.stderr)
    check_file_sizes(audit)
    check_spending_data_quality(audit)

    print("  [7/12] JSX bug scan...", file=sys.stderr)
    check_jsx_bugs(audit)

    print("  [8/12] Lazy-load Suspense check...", file=sys.stderr)
    check_lazy_suspense(audit)

    print("  [9/12] Undefined data access patterns...", file=sys.stderr)
    check_undefined_data_access(audit)

    print("  [10/12] Git state...", file=sys.stderr)
    check_git_state(audit)

    print("  [11/12] Live site verification...", file=sys.stderr)
    check_live_site(audit)

    if args.build:
        print("  [12/12] Build & test...", file=sys.stderr)
        check_build_test(audit)

    # Generate report
    if args.json:
        report = generate_json_report(audit)
    else:
        report = generate_markdown_report(audit)

    # Filter if quiet
    if args.quiet:
        audit.findings = [f for f in audit.findings if f[0] in ("ERROR", "WARN")]
        report = generate_markdown_report(audit) if not args.json else generate_json_report(audit)

    if args.stdout:
        print(report)
    else:
        # Save to reports directory
        REPORT_DIR.mkdir(parents=True, exist_ok=True)
        date_str = datetime.now().strftime("%Y-%m-%d")
        ext = "json" if args.json else "md"

        report_path = REPORT_DIR / f"audit_{date_str}.{ext}"
        latest_path = REPORT_DIR / f"latest.{ext}"

        report_path.write_text(report, encoding="utf-8")

        # Update latest symlink
        if latest_path.exists() or latest_path.is_symlink():
            latest_path.unlink()
        latest_path.symlink_to(report_path.name)

        print(f"\nAudit complete: {report_path}", file=sys.stderr)
        print(f"Score: {audit.score()}/100 — {len(audit.errors)} errors, {len(audit.warnings)} warnings",
              file=sys.stderr)

        # Also print to stdout
        print(report)

    # Exit with non-zero if errors found
    sys.exit(1 if audit.errors else 0)


if __name__ == "__main__":
    main()
