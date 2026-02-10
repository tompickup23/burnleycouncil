#!/usr/bin/env python3
"""
police_etl.py — UK Police API Crime Data ETL for Lancashire Councils

Pulls monthly crime statistics from data.police.uk for Burnley, Hyndburn,
and Pendle. Generates ward-level and borough-level crime JSON for:
  - AI DOGE spending/crime correlation analysis
  - News Lancashire monthly crime roundup articles

Usage:
    python3 police_etl.py                          # Latest month, all councils
    python3 police_etl.py --council burnley         # Specific council
    python3 police_etl.py --date 2025-12            # Specific month
    python3 police_etl.py --historical 6            # Last 6 months
    python3 police_etl.py --news                    # Generate article drafts

API: https://data.police.uk/api/ — Free, no auth, 15 req/sec sustained.
Lancashire Constabulary covers all 3 councils.

Author: Claude Code (Gaius) for Tom Pickup
"""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path

BASE_URL = "https://data.police.uk/api"
FORCE = "lancashire"

# Ward prefixes in Lancashire Constabulary neighbourhood IDs
BOROUGH_CONFIG = {
    "burnley": {
        "name": "Burnley",
        "prefix": "BU",
        "ons_code": "E07000117",
    },
    "hyndburn": {
        "name": "Hyndburn",
        "prefix": "HY",
        "ons_code": "E07000120",
    },
    "pendle": {
        "name": "Pendle",
        "prefix": "PE",
        "ons_code": "E07000122",
    },
    "rossendale": {
        "name": "Rossendale",
        "prefix": "RO",
        "ons_code": "E07000125",
    },
}

# Crime category display names
CRIME_CATEGORIES = {
    "anti-social-behaviour": "Anti-social behaviour",
    "bicycle-theft": "Bicycle theft",
    "burglary": "Burglary",
    "criminal-damage-arson": "Criminal damage & arson",
    "drugs": "Drugs",
    "other-crime": "Other crime",
    "other-theft": "Other theft",
    "possession-of-weapons": "Weapons possession",
    "public-order": "Public order",
    "robbery": "Robbery",
    "shoplifting": "Shoplifting",
    "theft-from-the-person": "Theft from person",
    "vehicle-crime": "Vehicle crime",
    "violent-crime": "Violence & sexual offences",
}

# DOGE spending correlation categories
SPENDING_CORRELATION = {
    "anti-social-behaviour": ["Community Safety", "Environmental Services", "CCTV"],
    "criminal-damage-arson": ["Environmental Services", "Street Lighting"],
    "drugs": ["Community Safety", "Public Health"],
    "public-order": ["Licensing", "Night-time Economy"],
    "shoplifting": ["Town Centre Management", "Regeneration"],
    "violent-crime": ["Domestic Violence Services", "Community Safety"],
    "burglary": ["Community Safety", "Housing"],
}


def api_get(path, params=None, _retries=0):
    """Make a GET request to the Police API with rate limiting and retry."""
    url = f"{BASE_URL}/{path}"
    if params:
        query = "&".join(f"{k}={v}" for k, v in params.items())
        url = f"{url}?{query}"

    try:
        req = urllib.request.Request(url)
        req.add_header("User-Agent", "AIDOGE-Lancashire/1.0")
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
        time.sleep(0.08)  # ~12 req/sec, well under 15/sec limit
        return data
    except urllib.error.HTTPError as e:
        if e.code == 429:
            print(f"  Rate limited, waiting 5s...")
            time.sleep(5)
            return api_get(path, params, _retries)
        elif e.code == 503:
            if _retries < 3:
                wait = 5 * (2 ** _retries)  # 5s, 10s, 20s backoff
                print(f"  503 Service Unavailable for {path} — retry {_retries + 1}/3 in {wait}s...")
                time.sleep(wait)
                return api_get(path, params, _retries + 1)
            print(f"  WARNING: 503 for {path} after 3 retries — data gap for this request")
            return []
        elif e.code == 404:
            return []  # No data for this area/date
        else:
            print(f"  API error {e.code} for {path}")
            return []
    except Exception as e:
        print(f"  Error fetching {url}: {e}")
        return []


def api_post(path, data_dict, _retries=0):
    """Make a POST request (for large polygon queries) with retry."""
    url = f"{BASE_URL}/{path}"
    data = urllib.parse.urlencode(data_dict).encode()

    try:
        req = urllib.request.Request(url, data=data, method="POST")
        req.add_header("User-Agent", "AIDOGE-Lancashire/1.0")
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode())
        time.sleep(0.08)
        return result
    except urllib.error.HTTPError as e:
        if e.code == 429:
            time.sleep(5)
            return api_post(path, data_dict, _retries)
        elif e.code == 503:
            if _retries < 3:
                wait = 5 * (2 ** _retries)
                print(f"  503 Service Unavailable for POST {path} — retry {_retries + 1}/3 in {wait}s...")
                time.sleep(wait)
                return api_post(path, data_dict, _retries + 1)
            print(f"  WARNING: 503 for POST {path} after 3 retries — data gap for this request")
            return []
        else:
            print(f"  POST error {e.code} for {path}")
            return []
    except Exception as e:
        print(f"  Error posting to {url}: {e}")
        return []



def get_latest_date():
    """Get the latest available crime data month."""
    data = api_get("crime-last-updated")
    if data and "date" in data:
        return data["date"][:7]  # "2025-12"
    # Fallback: 2 months ago (data is usually ~2 months behind)
    d = datetime.now() - timedelta(days=60)
    return d.strftime("%Y-%m")


def get_neighbourhoods():
    """Get all neighbourhoods for Lancashire Constabulary."""
    return api_get(f"{FORCE}/neighbourhoods")


def get_borough_wards(prefix, all_neighbourhoods):
    """Filter neighbourhoods by prefix to get borough wards."""
    return [n for n in all_neighbourhoods if n["id"].startswith(prefix)]


def get_ward_boundary(ward_id):
    """Get the boundary polygon for a ward."""
    return api_get(f"{FORCE}/{ward_id}/boundary")


def get_ward_details(ward_id):
    """Get neighbourhood details (name, population, etc.)."""
    return api_get(f"{FORCE}/{ward_id}")


def get_ward_priorities(ward_id):
    """Get policing priorities for a ward (narrative text)."""
    return api_get(f"{FORCE}/{ward_id}/priorities")


def boundary_to_poly(boundary):
    """Convert boundary coords to poly parameter string."""
    return ":".join(f"{p['latitude']},{p['longitude']}" for p in boundary)


def get_crimes_for_poly(poly, date, category="all-crime"):
    """Get crimes within a polygon boundary."""
    if len(poly) > 3500:
        return api_post(f"crimes-street/{category}", {"poly": poly, "date": date})
    else:
        return api_get(f"crimes-street/{category}", {"poly": poly, "date": date})


def get_stops_for_poly(poly, date):
    """Get stop & search data within a polygon boundary."""
    if len(poly) > 3500:
        return api_post("stops-street", {"poly": poly, "date": date})
    else:
        return api_get("stops-street", {"poly": poly, "date": date})


def build_ward_stats(ward_id, ward_name, poly, date):
    """Build complete crime stats for a single ward."""
    crimes = get_crimes_for_poly(poly, date)
    stops = get_stops_for_poly(poly, date)

    # Category breakdown
    categories = Counter(c.get("category", "unknown") for c in crimes)

    # Outcome breakdown (from crimes that have outcomes)
    outcomes = Counter()
    for c in crimes:
        outcome = c.get("outcome_status")
        if outcome and "category" in outcome:
            outcomes[outcome["category"]] += 1

    return {
        "ward_id": ward_id,
        "name": ward_name,
        "total_crimes": len(crimes),
        "by_category": dict(categories),
        "outcomes": dict(outcomes),
        "stop_and_search": {
            "total": len(stops),
        },
    }


def build_borough_stats(borough_key, date, all_neighbourhoods, boundary_cache):
    """Build complete crime stats for a borough."""
    config = BOROUGH_CONFIG[borough_key]
    wards = get_borough_wards(config["prefix"], all_neighbourhoods)

    if not wards:
        print(f"  WARNING: No wards found for {borough_key} (prefix {config['prefix']})")
        return None

    print(f"  {config['name']}: {len(wards)} wards")
    ward_stats = {}
    all_crimes_count = 0
    all_stops_count = 0
    borough_categories = Counter()
    borough_outcomes = Counter()

    for ward in wards:
        ward_id = ward["id"]
        ward_name = ward.get("name", ward_id)

        # Get or cache boundary
        if ward_id not in boundary_cache:
            boundary = get_ward_boundary(ward_id)
            if boundary:
                boundary_cache[ward_id] = boundary_to_poly(boundary)
            else:
                print(f"    Skipping {ward_id} — no boundary")
                continue

        poly = boundary_cache[ward_id]
        stats = build_ward_stats(ward_id, ward_name, poly, date)

        ward_stats[ward_id] = stats
        all_crimes_count += stats["total_crimes"]
        all_stops_count += stats["stop_and_search"]["total"]
        borough_categories.update(stats["by_category"])
        borough_outcomes.update(stats["outcomes"])

        print(f"    {ward_id} ({ward_name}): {stats['total_crimes']} crimes")

    # Category display names
    category_display = {}
    for cat, count in sorted(borough_categories.items(), key=lambda x: -x[1]):
        display = CRIME_CATEGORIES.get(cat, cat.replace("-", " ").title())
        category_display[cat] = {"name": display, "count": count}

    return {
        "borough": borough_key,
        "borough_name": config["name"],
        "ons_code": config["ons_code"],
        "date": date,
        "total_crimes": all_crimes_count,
        "total_stop_and_search": all_stops_count,
        "by_category": dict(borough_categories),
        "category_display": category_display,
        "outcomes": dict(borough_outcomes),
        "ward_count": len(ward_stats),
        "wards": ward_stats,
        "generated_at": datetime.now().isoformat(),
    }


def compute_trends(current, previous):
    """Compute month-on-month trends."""
    if not previous:
        return None

    prev_total = previous.get("total_crimes", 0)
    curr_total = current.get("total_crimes", 0)

    if prev_total == 0:
        pct_change = None
    else:
        pct_change = round(((curr_total - prev_total) / prev_total) * 100, 1)

    # Category changes
    cat_changes = {}
    for cat in set(list(current.get("by_category", {}).keys()) +
                   list(previous.get("by_category", {}).keys())):
        curr = current.get("by_category", {}).get(cat, 0)
        prev = previous.get("by_category", {}).get(cat, 0)
        if prev > 0:
            change = round(((curr - prev) / prev) * 100, 1)
        else:
            change = None
        cat_changes[cat] = {
            "current": curr,
            "previous": prev,
            "change_pct": change,
        }

    return {
        "previous_date": previous.get("date"),
        "current_total": curr_total,
        "previous_total": prev_total,
        "change": curr_total - prev_total,
        "change_pct": pct_change,
        "by_category": cat_changes,
    }


def generate_news_article(stats, trends=None):
    """Generate a draft news article from crime stats."""
    borough = stats["borough_name"]
    date_str = stats["date"]
    total = stats["total_crimes"]

    # Parse date for display
    try:
        dt = datetime.strptime(date_str, "%Y-%m")
        month_name = dt.strftime("%B %Y")
    except:
        month_name = date_str

    # Top 3 categories
    sorted_cats = sorted(stats["by_category"].items(), key=lambda x: -x[1])
    top3 = sorted_cats[:3]

    lines = []
    lines.append(f"# {borough} Crime Statistics — {month_name}")
    lines.append("")

    if trends and trends.get("change_pct") is not None:
        direction = "up" if trends["change_pct"] > 0 else "down"
        lines.append(
            f"**{total} crimes** were recorded in {borough} during {month_name}, "
            f"**{direction} {abs(trends['change_pct'])}%** from {trends['previous_total']} "
            f"the previous month."
        )
    else:
        lines.append(
            f"**{total} crimes** were recorded in {borough} during {month_name}."
        )

    lines.append("")
    lines.append("## Breakdown by Category")
    lines.append("")
    for cat, count in sorted_cats:
        display = CRIME_CATEGORIES.get(cat, cat.replace("-", " ").title())
        pct = round((count / total) * 100, 1) if total > 0 else 0
        lines.append(f"- **{display}**: {count} ({pct}%)")

    if stats.get("total_stop_and_search", 0) > 0:
        lines.append("")
        lines.append(f"**Stop and search**: {stats['total_stop_and_search']} recorded.")

    # Ward hotspots
    if stats.get("wards"):
        lines.append("")
        lines.append("## Ward Breakdown")
        lines.append("")
        sorted_wards = sorted(
            stats["wards"].values(), key=lambda w: -w.get("total_crimes", 0)
        )
        for w in sorted_wards[:5]:
            lines.append(f"- **{w['name']}**: {w['total_crimes']} crimes")

    lines.append("")
    lines.append(
        f"*Data source: [data.police.uk](https://data.police.uk/) — "
        f"Lancashire Constabulary. Generated by AI DOGE.*"
    )

    return "\n".join(lines)


def save_boundary_cache(cache, output_dir):
    """Save boundary cache to avoid re-fetching."""
    cache_file = output_dir / "ward_boundaries_cache.json"
    with open(cache_file, "w") as f:
        json.dump(cache, f)


def load_boundary_cache(output_dir):
    """Load cached ward boundaries."""
    cache_file = output_dir / "ward_boundaries_cache.json"
    if cache_file.exists():
        with open(cache_file) as f:
            return json.load(f)
    return {}


def main():
    parser = argparse.ArgumentParser(description="Police API Crime ETL for Lancashire")
    parser.add_argument("--council", choices=["burnley", "hyndburn", "pendle", "rossendale"],
                        help="Specific council (default: all)")
    parser.add_argument("--date", help="Crime month YYYY-MM (default: latest)")
    parser.add_argument("--historical", type=int, default=0,
                        help="Fetch N months of historical data")
    parser.add_argument("--news", action="store_true",
                        help="Generate news article drafts")
    parser.add_argument("--output-dir",
                        default=os.path.join(os.path.dirname(os.path.dirname(__file__)), "data"),
                        help="Output directory (default: data/)")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)

    # Determine councils to process
    councils = [args.council] if args.council else list(BOROUGH_CONFIG.keys())

    # Determine dates to process
    if args.date:
        dates = [args.date]
    else:
        latest = get_latest_date()
        print(f"Latest available data: {latest}")
        if args.historical > 0:
            dates = []
            dt = datetime.strptime(latest, "%Y-%m")
            for i in range(args.historical):
                d = dt - timedelta(days=30 * i)
                dates.append(d.strftime("%Y-%m"))
            dates.reverse()
        else:
            dates = [latest]

    # Get all neighbourhoods once
    print(f"Fetching Lancashire neighbourhoods...")
    all_neighbourhoods = get_neighbourhoods()
    if not all_neighbourhoods:
        print("ERROR: Could not fetch neighbourhoods")
        sys.exit(1)
    print(f"  Found {len(all_neighbourhoods)} total neighbourhoods")

    # Load boundary cache
    boundary_cache = load_boundary_cache(output_dir)
    cache_was_empty = len(boundary_cache) == 0

    for council in councils:
        council_dir = output_dir / council
        council_dir.mkdir(parents=True, exist_ok=True)

        all_monthly = []

        for date in dates:
            print(f"\nProcessing {council} for {date}...")
            stats = build_borough_stats(council, date, all_neighbourhoods, boundary_cache)

            if stats is None:
                print(f"  Skipping {council} — no data")
                continue

            all_monthly.append(stats)
            print(f"  Total: {stats['total_crimes']} crimes, "
                  f"{stats['total_stop_and_search']} stops, "
                  f"{stats['ward_count']} wards")

        if not all_monthly:
            continue

        # Save latest month as crime_stats.json
        latest_stats = all_monthly[-1]
        with open(council_dir / "crime_stats.json", "w") as f:
            json.dump(latest_stats, f, indent=2)
        print(f"\n  Saved {council}/crime_stats.json")

        # Save historical if multiple months
        if len(all_monthly) > 1:
            with open(council_dir / "crime_history.json", "w") as f:
                json.dump(all_monthly, f, indent=2)
            print(f"  Saved {council}/crime_history.json ({len(all_monthly)} months)")

        # Compute trends (compare last 2 months if available)
        trends = None
        if len(all_monthly) >= 2:
            trends = compute_trends(all_monthly[-1], all_monthly[-2])
            latest_stats["trends"] = trends
            # Re-save with trends
            with open(council_dir / "crime_stats.json", "w") as f:
                json.dump(latest_stats, f, indent=2)

        # Generate news article
        if args.news:
            article = generate_news_article(latest_stats, trends)
            article_file = council_dir / f"crime_article_{latest_stats['date']}.md"
            with open(article_file, "w") as f:
                f.write(article)
            print(f"  Saved article: {article_file}")

    # Save boundary cache
    if cache_was_empty or len(boundary_cache) > 0:
        save_boundary_cache(boundary_cache, output_dir)
        print(f"\nBoundary cache: {len(boundary_cache)} wards cached")

    print("\nDone!")


if __name__ == "__main__":
    main()
