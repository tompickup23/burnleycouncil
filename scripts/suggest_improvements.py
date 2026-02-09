#!/usr/bin/env python3
"""
suggest_improvements.py — Rule-based improvement suggester for AI DOGE
Zero dependencies (stdlib only), zero API tokens, zero cost.

Reads the latest audit report + scans source code and data directly.
Merges findings into IMPROVEMENTS.md, preserving manual entries.
Auto-resolves issues when the underlying problem is fixed.

Categories:
  - Security: XSS, CSP, injection, credentials, permissions
  - Data Quality: schema mismatches, zero/null placeholders, freshness, completeness
  - Process Efficiency: ETL gaps, duplication, validation, automation
  - App Development: error handling, test coverage, performance, accessibility

Usage:
    python3 scripts/suggest_improvements.py              # Update IMPROVEMENTS.md
    python3 scripts/suggest_improvements.py --dry-run    # Show what would change
    python3 scripts/suggest_improvements.py --json       # Output findings as JSON

Output: Updates IMPROVEMENTS.md in-place (preserves manual entries)
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "burnley-council" / "data"
SRC_DIR = ROOT / "src"
PUBLIC_DATA = ROOT / "public" / "data"
REPORT_DIR = ROOT / "burnley-council" / "reports"
IMPROVEMENTS_FILE = ROOT / "IMPROVEMENTS.md"

COUNCILS = ["burnley", "hyndburn", "pendle", "rossendale"]
TODAY = datetime.now().strftime("%Y-%m-%d")


# ── Helpers ───────────────────────────────────────────────────────────

def load_json(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f), None
    except Exception as e:
        return None, str(e)


def file_exists(path):
    return Path(path).exists()


def read_text(path):
    try:
        return Path(path).read_text(encoding="utf-8")
    except Exception:
        return ""


def grep_files(directory, pattern, glob_pat="*.jsx"):
    """Search files matching glob for regex pattern. Returns [(file, line_no, line)]."""
    hits = []
    d = Path(directory)
    if not d.is_dir():
        return hits
    for f in sorted(d.rglob(glob_pat)):
        try:
            for i, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
                if re.search(pattern, line):
                    hits.append((str(f.relative_to(ROOT)), i, line.strip()))
        except Exception:
            continue
    return hits


def count_test_files(src_dir):
    """Return set of basenames that have test files."""
    tested = set()
    for f in Path(src_dir).rglob("*.test.*"):
        # "About.test.jsx" -> "About"
        base = f.stem.replace(".test", "")
        tested.add(base)
    return tested


# ── Finding Class ─────────────────────────────────────────────────────

class Finding:
    def __init__(self, fid, category, severity, title, detail, auto=True):
        self.id = fid
        self.category = category    # security | data | process | app
        self.severity = severity    # critical | high | medium | low
        self.title = title
        self.detail = detail
        self.auto = auto            # [auto] tag
        self.status = "open"

    def __repr__(self):
        tag = " [auto]" if self.auto else ""
        return f"{self.id} ({self.severity}): {self.title}{tag}"


# ── Rule Engine ───────────────────────────────────────────────────────
# Each rule is a function that returns a list of Findings (empty = issue resolved)

def _next_id(category, existing_ids):
    """Generate next ID like S7, D13, P7, A15."""
    prefix = {"security": "S", "data": "D", "process": "P", "app": "A"}[category]
    nums = [int(i[1:]) for i in existing_ids if i.startswith(prefix) and i[1:].isdigit()]
    return f"{prefix}{max(nums) + 1 if nums else 1}"


# ── Security Rules ────────────────────────────────────────────────────

def rule_xss_dangerously_set(ctx):
    hits = grep_files(SRC_DIR, r"dangerouslySetInnerHTML")
    # Check if DOMPurify is installed
    pkg = load_json(ROOT / "package.json")[0] or {}
    deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
    has_sanitizer = "dompurify" in deps or "isomorphic-dompurify" in deps or "sanitize-html" in deps

    if hits and not has_sanitizer:
        files = ", ".join(set(f"`{h[0]}:{h[1]}`" for h in hits))
        return [Finding("S1", "security", "critical",
                        "XSS via `dangerouslySetInnerHTML`",
                        f"Unsanitized HTML injection at {files}. Install DOMPurify.")]
    return []


def rule_csp_headers(ctx):
    index = read_text(ROOT / "index.html")
    if "Content-Security-Policy" not in index:
        return [Finding("S2", "security", "high",
                        "No Content Security Policy",
                        "`index.html` has no CSP meta tag — allows inline scripts, arbitrary resource loading.")]
    return []


def rule_shell_true(ctx):
    hits = grep_files(ROOT / "scripts", r"shell\s*=\s*True", "*.py")
    if hits:
        files = ", ".join(set(f"`{h[0]}:{h[1]}`" for h in hits))
        return [Finding("S3", "security", "medium",
                        "`shell=True` in subprocess",
                        f"Command injection risk at {files}. Use array syntax with `shell=False`.")]
    return []


def rule_actions_interpolation(ctx):
    hits = grep_files(ROOT / ".github", r"\$\{\{.*steps\.", "*.yml")
    unguarded = [h for h in hits if "outputs." in h[2] and "if:" not in h[2]]
    if unguarded:
        files = ", ".join(set(f"`{h[0]}:{h[1]}`" for h in unguarded))
        return [Finding("S4", "security", "medium",
                        "GitHub Actions string interpolation",
                        f"Unvalidated output interpolation at {files}. Add numeric guard.")]
    return []


def rule_actions_permissions(ctx):
    findings = []
    for yml in (ROOT / ".github" / "workflows").rglob("*.yml") if (ROOT / ".github" / "workflows").is_dir() else []:
        content = read_text(yml)
        if "contents: write" in content:
            name = yml.relative_to(ROOT)
            findings.append(Finding("S5", "security", "medium",
                                    "Workflow permissions too broad",
                                    f"`{name}` has `contents: write` — can push directly to main."))
            break  # One finding covers all
    return findings


def rule_npm_audit_ci(ctx):
    for yml in (ROOT / ".github" / "workflows").rglob("*.yml") if (ROOT / ".github" / "workflows").is_dir() else []:
        if "npm audit" in read_text(yml):
            return []
    return [Finding("S6", "security", "low",
                    "No `npm audit` in CI",
                    "No automated dependency vulnerability scanning in workflows.")]


def rule_env_files_committed(ctx):
    for name in [".env", ".env.local", ".env.production"]:
        if file_exists(ROOT / name):
            content = read_text(ROOT / name)
            if any(k in content.lower() for k in ["api_key", "secret", "token", "password"]):
                return [Finding("S7", "security", "critical",
                                "Secrets committed to repo",
                                f"`{name}` contains sensitive values. Add to .gitignore immediately.")]
    return []


# ── Data Quality Rules ────────────────────────────────────────────────

def rule_zero_avg_transaction(ctx):
    cc, _ = load_json(PUBLIC_DATA / "cross_council.json")
    if not cc:
        return []
    councils = cc.get("councils", [])
    zeros = [c["council_name"] for c in councils if c.get("avg_transaction", 0) == 0]
    if zeros:
        return [Finding("D1", "data", "high",
                        "`avg_transaction` is 0",
                        f"Councils with zero avg_transaction: {', '.join(zeros)}. ETL should calculate `total_spend / total_records`.")]
    return []


def rule_zero_budget_summary(ctx):
    cc, _ = load_json(PUBLIC_DATA / "cross_council.json")
    if not cc:
        return []
    councils = cc.get("councils", [])
    zeros = [c["council_name"] for c in councils
             if c.get("budget_summary", {}).get("council_tax_band_d", 0) == 0]
    if zeros:
        return [Finding("D2", "data", "high",
                        "`budget_summary` fields all zeros",
                        f"Councils with zero `council_tax_band_d`: {', '.join(zeros)}. Real data exists in `budgets_summary.json`.")]
    return []


def rule_zero_top10_pct(ctx):
    cc, _ = load_json(PUBLIC_DATA / "cross_council.json")
    if not cc:
        return []
    councils = cc.get("councils", [])
    zeros = [c["council_name"] for c in councils if c.get("top10_supplier_pct", -1) == 0]
    if zeros:
        return [Finding("D3", "data", "high",
                        "Zero `top10_supplier_pct`",
                        f"Councils: {', '.join(zeros)}. Placeholder — not calculated unlike others (0.5–0.7).")]
    return []


def rule_insights_schema_mismatch(ctx):
    schemas = {}
    for council in COUNCILS:
        data, _ = load_json(DATA_DIR / council / "insights.json")
        if data and isinstance(data, dict):
            schemas[council] = sorted(data.keys())
    if len(schemas) >= 2:
        ref = schemas.get("burnley", [])
        mismatched = [c for c, keys in schemas.items() if keys != ref and c != "burnley"]
        if mismatched:
            return [Finding("D4", "data", "high",
                            "`insights.json` schema mismatch",
                            f"Councils with different schema than Burnley: {', '.join(mismatched)}. Normalize in ETL.")]
    return []


def rule_wards_schema_mismatch(ctx):
    types = {}
    for council in COUNCILS:
        data, _ = load_json(DATA_DIR / council / "wards.json")
        if data is not None:
            types[council] = type(data).__name__
    unique = set(types.values())
    if len(unique) > 1:
        detail = ", ".join(f"{c}: {t}" for c, t in types.items())
        return [Finding("D5", "data", "high",
                        "`wards.json` structure mismatch",
                        f"Mixed types: {detail}. Normalize to consistent schema.")]
    return []


def rule_metadata_key_inconsistency(ctx):
    keys_used = {}
    for council in COUNCILS:
        meta, _ = load_json(DATA_DIR / council / "metadata.json")
        if meta:
            if "total_records" in meta:
                keys_used[council] = "total_records"
            elif "record_count" in meta:
                keys_used[council] = "record_count"
    unique = set(keys_used.values())
    if len(unique) > 1:
        detail = ", ".join(f"{c}: `{k}`" for c, k in keys_used.items())
        return [Finding("D6", "data", "medium",
                        "`metadata.json` key inconsistency",
                        f"Mixed keys: {detail}. Standardize to one name.")]
    return []


def rule_future_dates(ctx):
    now = datetime.now()
    issues = []
    for council in COUNCILS:
        meta, _ = load_json(DATA_DIR / council / "metadata.json")
        if meta:
            max_d = meta.get("date_range", {}).get("max", "")
            if max_d:
                try:
                    d = datetime.strptime(max_d, "%Y-%m-%d")
                    if d > now + timedelta(days=30):
                        issues.append(f"{council}: max date {max_d}")
                except ValueError:
                    pass
    if issues:
        return [Finding("D7", "data", "medium",
                        "Spending date range extends far into future",
                        f"Potential import error: {'; '.join(issues)}.")]
    return []


def rule_missing_council_files(ctx):
    issues = []
    expected_optional = ["crime_stats.json", "meetings.json", "wards.json"]
    for fname in expected_optional:
        have = [c for c in COUNCILS if (DATA_DIR / c / fname).exists()]
        missing = [c for c in COUNCILS if c not in have]
        if 0 < len(have) < len(COUNCILS):
            issues.append(f"`{fname}` missing for: {', '.join(missing)}")
    if issues:
        return [Finding("D8", "data", "medium",
                        "Inconsistent optional files across councils",
                        " | ".join(issues) + ". Add feature flag or generate data.")]
    return []


def rule_feature_flag_mismatch(ctx):
    flag_to_file = {
        "budgets": "budgets_summary.json",
        "meetings": "meetings.json",
        "politics": "councillors.json",
        "pay_comparison": "pay_comparison.json",
    }
    mismatches = []
    for council in COUNCILS:
        cfg, _ = load_json(DATA_DIR / council / "config.json")
        if not cfg:
            continue
        ds = cfg.get("data_sources", {})
        for flag, fname in flag_to_file.items():
            flag_val = ds.get(flag, False)
            exists = (DATA_DIR / council / fname).exists()
            if not flag_val and exists:
                mismatches.append(f"{council}: `{flag}=false` but `{fname}` exists")
    if mismatches:
        return [Finding("D9", "data", "medium",
                        "Feature flag / file existence mismatch",
                        " | ".join(mismatches[:4]) + ". UI hides available data.")]
    return []


def rule_withheld_suppliers(ctx):
    for council in COUNCILS:
        findings_data, _ = load_json(DATA_DIR / council / "doge_findings.json")
        if not findings_data:
            continue
        text = json.dumps(findings_data).lower()
        if "name withheld" in text or "redacted" in text:
            return [Finding("D10", "data", "medium",
                            "Withheld supplier names in spending data",
                            f"Found 'NAME WITHHELD' entries. Transparency concern for public scrutiny.")]
    return []


def rule_duplicate_count_zero(ctx):
    cc, _ = load_json(PUBLIC_DATA / "cross_council.json")
    if not cc:
        return []
    councils = cc.get("councils", [])
    zeros = [c["council_name"] for c in councils
             if c.get("duplicate_count", -1) == 0 and c.get("total_records", 0) > 10000]
    if zeros:
        return [Finding("D12", "data", "low",
                        "Duplicate count = 0 for large dataset",
                        f"Councils: {', '.join(zeros)}. Likely not calculated rather than truly zero.")]
    return []


# ── Process Rules ─────────────────────────────────────────────────────

def rule_cross_council_copies(ctx):
    paths = [DATA_DIR / c / "cross_council.json" for c in COUNCILS]
    paths.append(PUBLIC_DATA / "cross_council.json")
    existing = sum(1 for p in paths if p.exists())
    if existing > 1:
        return [Finding("P2", "process", "high",
                        "cross_council.json maintained in multiple places",
                        f"{existing} copies found. Single source of truth should generate and copy to all locations.")]
    return []


def rule_no_schema_validation(ctx):
    # Check if any JSON schema validation exists in scripts/
    scripts_dir = ROOT / "scripts"
    if scripts_dir.is_dir():
        for f in scripts_dir.rglob("*"):
            content = read_text(f)
            if "jsonschema" in content or "json_schema" in content or "validate_schema" in content:
                return []
    return [Finding("P3", "process", "medium",
                    "No schema validation in ETL pipeline",
                    "No JSON schema checks in scripts/. Add validation to catch data mismatches before they reach the app.")]


def rule_no_retry_meetings(ctx):
    meetings_script = ROOT / "scripts" / "update-meetings.js"
    if meetings_script.exists():
        content = read_text(meetings_script)
        if "retry" not in content.lower() and "backoff" not in content.lower():
            return [Finding("P4", "process", "medium",
                            "No retry logic in `update-meetings.js`",
                            "ModernGov scraper silently fails on network errors. Add retry with backoff.")]
    return []


def rule_no_sitemap(ctx):
    public = ROOT / "public"
    if not (public / "sitemap.xml").exists() and not (public / "robots.txt").exists():
        return [Finding("P6", "process", "low",
                        "No sitemap.xml or robots.txt",
                        "Missing from public/ directory. Add to build for SEO crawling.")]
    return []


def rule_derived_fields_not_populated(ctx):
    cc, _ = load_json(PUBLIC_DATA / "cross_council.json")
    if not cc:
        return []
    councils = cc.get("councils", [])
    zero_fields = set()
    for c in councils:
        if c.get("avg_transaction", 0) == 0:
            zero_fields.add("avg_transaction")
        bs = c.get("budget_summary", {})
        if bs.get("council_tax_band_d", 0) == 0:
            zero_fields.add("council_tax_band_d")
        if bs.get("reserves_total", 0) == 0:
            zero_fields.add("reserves_total")
    if zero_fields:
        return [Finding("P1", "process", "high",
                        "ETL doesn't populate derived fields",
                        f"Zero-value fields in cross_council.json: {', '.join(sorted(zero_fields))}. Calculate from source data.")]
    return []


# ── App Development Rules ─────────────────────────────────────────────

def rule_usedata_error_ignored(ctx):
    pages_dir = SRC_DIR / "pages"
    if not pages_dir.is_dir():
        return []
    ignoring = []
    for jsx in sorted(pages_dir.glob("*.jsx")):
        if ".test." in jsx.name:
            continue
        content = read_text(jsx)
        # Has useData destructuring with error
        if re.search(r"error\s*[,}]", content) and "useData" in content:
            # Check if error is actually used in JSX/conditionals
            # Look for: if (error) or error && or error ? or {error.
            if not re.search(r"if\s*\(\s*error|error\s*&&|error\s*\?|\{error\b|error\.message", content):
                ignoring.append(jsx.stem)
    if ignoring:
        return [Finding("A1", "app", "high",
                        f"{len(ignoring)} pages ignore `useData` errors",
                        f"Pages: {', '.join(ignoring)}. Add error fallback UI.")]
    return []


def rule_untested_pages(ctx):
    pages_dir = SRC_DIR / "pages"
    if not pages_dir.is_dir():
        return []
    tested = count_test_files(SRC_DIR)
    untested = []
    for jsx in sorted(pages_dir.glob("*.jsx")):
        if ".test." in jsx.name:
            continue
        base = jsx.stem
        if base not in tested:
            size = len(read_text(jsx).splitlines())
            untested.append(f"{base} ({size}L)")
    if untested:
        return [Finding("A2", "app", "high",
                        f"{len(untested)} pages have zero tests",
                        f"Untested: {', '.join(untested[:8])}{'...' if len(untested) > 8 else ''}.")]
    return []


def rule_missing_usememo(ctx):
    pages_dir = SRC_DIR / "pages"
    if not pages_dir.is_dir():
        return []
    issues = []
    for jsx in sorted(pages_dir.glob("*.jsx")):
        if ".test." in jsx.name:
            continue
        content = read_text(jsx)
        # Count .map() calls that create chart data arrays outside useMemo
        # Heuristic: look for chartData or ChartData patterns not inside useMemo
        map_calls = len(re.findall(r"\.map\(", content))
        usememo_count = len(re.findall(r"useMemo\(", content))
        lines = len(content.splitlines())
        # Large file with many maps but few memoizations
        if lines > 300 and map_calls > 3 and usememo_count < 2:
            issues.append(f"{jsx.stem} ({map_calls} .map(), {usememo_count} useMemo)")
    if issues:
        return [Finding("A3", "app", "medium",
                        "Missing `useMemo` on data transforms",
                        f"Pages with many unmemoized transforms: {', '.join(issues[:4])}.")]
    return []


def rule_accessibility_gaps(ctx):
    pages_dir = SRC_DIR / "pages"
    if not pages_dir.is_dir():
        return []
    no_aria = []
    for jsx in sorted(pages_dir.glob("*.jsx")):
        if ".test." in jsx.name:
            continue
        content = read_text(jsx)
        lines = len(content.splitlines())
        if lines > 100 and "aria-" not in content and "role=" not in content:
            no_aria.append(jsx.stem)
    if no_aria:
        return [Finding("A4", "app", "medium",
                        f"Accessibility gaps in {len(no_aria)} pages",
                        f"Pages with no ARIA attributes: {', '.join(no_aria[:6])}.")]
    return []


def rule_settimeout_no_cleanup(ctx):
    hits = grep_files(SRC_DIR / "pages", r"setTimeout\(", "*.jsx")
    # Check if there's a corresponding clearTimeout
    issues = []
    for fpath, line_no, line in hits:
        content = read_text(ROOT / fpath)
        if "clearTimeout" not in content:
            issues.append(f"`{fpath}:{line_no}`")
    if issues:
        return [Finding("A5", "app", "medium",
                        "setTimeout without cleanup",
                        f"Memory leak risk at {', '.join(issues[:3])}. Add clearTimeout in useEffect cleanup.")]
    return []


def rule_no_e2e_tests(ctx):
    for d in ["e2e", "tests/e2e", "cypress", "playwright"]:
        if (ROOT / d).is_dir():
            return []
    pkg = load_json(ROOT / "package.json")[0] or {}
    deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
    if any(k in deps for k in ["playwright", "@playwright/test", "cypress"]):
        return []
    return [Finding("A6", "app", "medium",
                    "No E2E or integration tests",
                    "No Playwright/Cypress setup found. Cross-page workflows untested.")]


def rule_home_not_lazy(ctx):
    app_jsx = read_text(SRC_DIR / "App.jsx")
    if "import Home from" in app_jsx and "lazy(" not in app_jsx.split("import Home")[0].split("\n")[-1]:
        # Check if Home import is static
        if re.search(r"^import Home from", app_jsx, re.MULTILINE):
            return [Finding("A7", "app", "low",
                            "Home.jsx not lazy-loaded",
                            "Home is statically imported despite being 500+ lines. Lazy-load for faster initial bundle.")]
    return []


def rule_no_react_memo(ctx):
    components_dir = SRC_DIR / "components"
    if not components_dir.is_dir():
        return []
    content_all = ""
    for f in components_dir.rglob("*.jsx"):
        content_all += read_text(f)
    for f in (SRC_DIR / "pages").rglob("*.jsx") if (SRC_DIR / "pages").is_dir() else []:
        content_all += read_text(f)
    if "React.memo" not in content_all and "memo(" not in content_all:
        return [Finding("A8", "app", "low",
                        "No `React.memo` on any component",
                        "Stat cards, chart wrappers, table rows would benefit from memoization.")]
    return []


def rule_errorboundary_untested(ctx):
    tested = count_test_files(SRC_DIR)
    if "ErrorBoundary" not in tested:
        if (SRC_DIR / "components" / "ui" / "ErrorBoundary.jsx").exists() or \
           (SRC_DIR / "components" / "ErrorBoundary.jsx").exists():
            return [Finding("A13", "app", "low",
                            "ErrorBoundary untested",
                            "Safety-net component has no test coverage.")]
    return []


def rule_dangerously_set_alt_text(ctx):
    hits = grep_files(SRC_DIR / "pages", r'alt=""', "*.jsx")
    if hits:
        files = ", ".join(set(f"`{h[0]}:{h[1]}`" for h in hits[:3]))
        return [Finding("A11", "app", "low",
                        "Images with empty `alt` text",
                        f"Found at {files}. Use descriptive alt text for accessibility.")]
    return []


# ── All Rules Registry ────────────────────────────────────────────────

ALL_RULES = [
    # Security
    rule_xss_dangerously_set,
    rule_csp_headers,
    rule_shell_true,
    rule_actions_interpolation,
    rule_actions_permissions,
    rule_npm_audit_ci,
    rule_env_files_committed,
    # Data Quality
    rule_zero_avg_transaction,
    rule_zero_budget_summary,
    rule_zero_top10_pct,
    rule_insights_schema_mismatch,
    rule_wards_schema_mismatch,
    rule_metadata_key_inconsistency,
    rule_future_dates,
    rule_missing_council_files,
    rule_feature_flag_mismatch,
    rule_withheld_suppliers,
    rule_duplicate_count_zero,
    # Process
    rule_derived_fields_not_populated,
    rule_cross_council_copies,
    rule_no_schema_validation,
    rule_no_retry_meetings,
    rule_no_sitemap,
    # App
    rule_usedata_error_ignored,
    rule_untested_pages,
    rule_missing_usememo,
    rule_accessibility_gaps,
    rule_settimeout_no_cleanup,
    rule_no_e2e_tests,
    rule_home_not_lazy,
    rule_no_react_memo,
    rule_errorboundary_untested,
    rule_dangerously_set_alt_text,
]


# ── Markdown Merge ────────────────────────────────────────────────────

def parse_existing_improvements(content):
    """Parse existing IMPROVEMENTS.md, return dict of {id: {status, is_manual, line}}."""
    entries = {}
    for line in content.splitlines():
        m = re.match(r"\|\s*(\w+\d+)\s*\|.*\|\s*(open|fixed|wontfix)\s*\|", line)
        if m:
            fid = m.group(1)
            status = m.group(2)
            is_manual = "[auto]" not in line
            entries[fid] = {"status": status, "is_manual": is_manual, "line": line}
    return entries


def build_section(title, findings, existing):
    """Build a markdown table section for one category."""
    lines = [
        f"## {title}",
        "",
        "| ID | Severity | Issue | Detail | Status |",
        "|----|----------|-------|--------|--------|",
    ]

    # Collect IDs we'll write
    seen_ids = set()

    # First: existing manual entries (preserve as-is)
    category_prefix = {"Security": "S", "Data Quality": "D",
                       "Process Efficiency": "P", "App Development": "A"}[title]
    for fid, info in sorted(existing.items()):
        if fid.startswith(category_prefix) and info["is_manual"]:
            lines.append(info["line"])
            seen_ids.add(fid)

    # Then: automated findings
    for f in sorted(findings, key=lambda x: (
        {"critical": 0, "high": 1, "medium": 2, "low": 3}[x.severity], x.id)):
        if f.id in seen_ids:
            continue
        seen_ids.add(f.id)
        sev = f.severity.capitalize()
        tag = " [auto]" if f.auto else ""
        lines.append(f"| {f.id} | {sev} | {f.title}{tag} | {f.detail} | {f.status} |")

    # Mark auto entries that are no longer found as resolved
    auto_ids_found = {f.id for f in findings}
    for fid, info in existing.items():
        if (fid.startswith(category_prefix) and not info["is_manual"]
                and fid not in auto_ids_found and info["status"] == "open"):
            # Auto-resolve: issue no longer detected
            resolved_line = re.sub(r"\|\s*open\s*\|$", "| fixed |", info["line"])
            resolved_line = resolved_line.replace("| open |", "| fixed |")
            if fid not in seen_ids:
                lines.append(resolved_line)
                seen_ids.add(fid)

    lines.append("")
    return lines


def generate_improvements_md(all_findings, existing_content=""):
    """Generate full IMPROVEMENTS.md content."""
    existing = parse_existing_improvements(existing_content)

    # Group findings by category
    categories = {
        "security": [],
        "data": [],
        "process": [],
        "app": [],
    }
    for f in all_findings:
        categories[f.category].append(f)

    # Count stats
    total = len(all_findings)
    by_sev = {}
    for f in all_findings:
        by_sev[f.severity] = by_sev.get(f.severity, 0) + 1
    resolved = sum(1 for fid, info in existing.items()
                   if not info["is_manual"] and info["status"] == "open"
                   and fid not in {f.id for f in all_findings})

    lines = [
        "# AI DOGE — Suggested Improvements",
        "",
        "> Auto-maintained by `scripts/suggest_improvements.py`.",
        "> Manual entries are preserved; automated entries are marked `[auto]`.",
        f"> Last updated: {TODAY}",
        "",
        f"**Summary**: {total} open issues"
        + (f" | {resolved} auto-resolved this run" if resolved else "")
        + f" | Critical: {by_sev.get('critical', 0)}"
        + f" | High: {by_sev.get('high', 0)}"
        + f" | Medium: {by_sev.get('medium', 0)}"
        + f" | Low: {by_sev.get('low', 0)}",
        "",
        "---",
        "",
    ]

    lines.extend(build_section("Security", categories["security"], existing))
    lines.extend(build_section("Data Quality", categories["data"], existing))
    lines.extend(build_section("Process Efficiency", categories["process"], existing))
    lines.extend(build_section("App Development", categories["app"], existing))

    # Changelog — append to existing
    lines.append("---")
    lines.append("")
    lines.append("## Changelog")
    lines.append("")

    # Preserve existing changelog entries
    in_changelog = False
    for line in existing_content.splitlines():
        if line.strip() == "## Changelog":
            in_changelog = True
            continue
        if in_changelog and line.startswith("- **"):
            lines.append(line)

    lines.append(f"- **{TODAY}** — Auto-scan: {total} issues found"
                 + (f", {resolved} resolved" if resolved else ""))
    lines.append("")

    return "\n".join(lines)


# ── Main ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="AI DOGE improvement suggester")
    parser.add_argument("--dry-run", action="store_true", help="Show changes without writing")
    parser.add_argument("--json", action="store_true", help="Output findings as JSON")
    args = parser.parse_args()

    print("Scanning for improvements...", file=sys.stderr)

    ctx = {}  # Shared context (could cache loaded files, etc.)
    all_findings = []

    for rule_fn in ALL_RULES:
        try:
            findings = rule_fn(ctx)
            all_findings.extend(findings)
        except Exception as e:
            print(f"  Warning: rule {rule_fn.__name__} failed: {e}", file=sys.stderr)

    print(f"  Found {len(all_findings)} issues", file=sys.stderr)

    if args.json:
        output = json.dumps([{
            "id": f.id, "category": f.category, "severity": f.severity,
            "title": f.title, "detail": f.detail, "status": f.status,
        } for f in all_findings], indent=2)
        print(output)
        return

    # Read existing IMPROVEMENTS.md
    existing_content = read_text(IMPROVEMENTS_FILE)

    # Generate new content
    new_content = generate_improvements_md(all_findings, existing_content)

    if args.dry_run:
        print(new_content)
        print(f"\n--- DRY RUN: Would write {len(new_content)} bytes to IMPROVEMENTS.md ---",
              file=sys.stderr)
    else:
        IMPROVEMENTS_FILE.write_text(new_content, encoding="utf-8")
        print(f"Updated: {IMPROVEMENTS_FILE}", file=sys.stderr)
        print(f"Issues: {len(all_findings)} open", file=sys.stderr)

        # Also print summary
        for f in sorted(all_findings, key=lambda x: (
            {"critical": 0, "high": 1, "medium": 2, "low": 3}[x.severity], x.id)):
            icon = {"critical": "!!", "high": "! ", "medium": "- ", "low": "  "}[f.severity]
            print(f"  {icon} {f.id}: {f.title}")


if __name__ == "__main__":
    main()
