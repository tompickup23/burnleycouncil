#!/usr/bin/env python3
"""
fts_etl.py — Fetch above-threshold contract data from Find a Tender Service (FTS).

Find a Tender is the UK government portal for public procurement above the threshold
(~£139K for goods/services, ~£5.37M for works). It publishes data in OCDS format
and includes bid counts, procedure types, and supplier details.

IMPORTANT: Requires a CDP API key from Find a Tender.
Set FTS_API_KEY environment variable or create .env file.
To register: https://www.find-tender.service.gov.uk

Usage:
    python3 fts_etl.py                     # All councils
    python3 fts_etl.py --council burnley   # Single council
    python3 fts_etl.py --dry-run           # Preview without saving

Output:
    burnley-council/data/{council_id}/fts_contracts.json

Data source: https://www.find-tender.service.gov.uk
API: GET /api/1.0/ocdsReleasePackages (requires CDP-Api-Key header)
"""

import argparse
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from collections import defaultdict

SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR.parent / "data"

# Find a Tender API base
FTS_API_BASE = "https://www.find-tender.service.gov.uk/api/1.0"

# Council buyer names (as they appear in FTS)
COUNCILS = {
    "burnley": {
        "buyer_names": ["Burnley Borough Council"],
    },
    "hyndburn": {
        "buyer_names": ["Hyndburn Borough Council", "Borough of Hyndburn"],
    },
    "pendle": {
        "buyer_names": ["Pendle Borough Council", "Borough of Pendle"],
    },
    "rossendale": {
        "buyer_names": ["Rossendale Borough Council", "Borough of Rossendale"],
    },
    "lancaster": {
        "buyer_names": ["Lancaster City Council"],
    },
    "ribble_valley": {
        "buyer_names": ["Ribble Valley Borough Council"],
    },
    "chorley": {
        "buyer_names": ["Chorley Borough Council", "Chorley Council"],
    },
    "south_ribble": {
        "buyer_names": ["South Ribble Borough Council"],
    },
}

REQUEST_DELAY = 1.0
MAX_RETRIES = 3


def log(msg):
    print(f'[{datetime.now().strftime("%H:%M:%S")}] {msg}')


def fetch_fts(endpoint, api_key, params=None):
    """Fetch from FTS API with retry logic."""
    url = f"{FTS_API_BASE}/{endpoint}"
    if params:
        query = "&".join(f"{k}={v}" for k, v in params.items())
        url = f"{url}?{query}"

    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(url, headers={
                "CDP-Api-Key": api_key,
                "User-Agent": "Mozilla/5.0 AI-DOGE-ETL/1.0",
                "Accept": "application/json",
            })
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = min(300, 30 * (attempt + 1))
                log(f"  Rate limited (429), waiting {wait}s...")
                time.sleep(wait)
                continue
            elif e.code == 401:
                log("  ERROR: Invalid API key. Check FTS_API_KEY environment variable.")
                sys.exit(1)
            else:
                log(f"  HTTP error {e.code} (attempt {attempt + 1})")
                time.sleep(5 * (attempt + 1))
        except Exception as e:
            log(f"  Error (attempt {attempt + 1}): {e}")
            time.sleep(5 * (attempt + 1))

    return None


def parse_release(release):
    """Extract key fields from an OCDS release."""
    tender = release.get("tender", {})
    awards = release.get("awards", [])
    bids = release.get("bids", {})
    parties = release.get("parties", [])

    # Find buyer
    buyer = next(
        (p for p in parties if "buyer" in p.get("roles", [])),
        release.get("buyer", {})
    )

    # Find suppliers
    suppliers = [p for p in parties if "supplier" in p.get("roles", [])]

    # Bid statistics
    bid_stats = bids.get("statistics", [])
    valid_bids = None
    for stat in bid_stats:
        if stat.get("measure") == "validBids":
            valid_bids = stat.get("value")
            break

    # If no statistics, try counting bid details
    bid_details = bids.get("details", [])
    if valid_bids is None and bid_details:
        valid_bids = len([b for b in bid_details if b.get("status") != "disqualified"])

    # Awards
    awarded_value = None
    awarded_supplier = None
    awarded_date = None
    if awards:
        award = awards[0]
        awarded_value = award.get("value", {}).get("amount")
        awarded_date = award.get("date", "")[:10] if award.get("date") else None
        award_suppliers = award.get("suppliers", [])
        if award_suppliers:
            awarded_supplier = award_suppliers[0].get("name", "Unknown")

    return {
        "ocid": release.get("ocid", ""),
        "title": tender.get("title", "")[:200],
        "description": tender.get("description", "")[:500],
        "status": tender.get("status", ""),
        "procedure": tender.get("procurementMethod", ""),
        "procedure_detail": tender.get("procurementMethodDetails", ""),
        "buyer": buyer.get("name", ""),
        "published_date": release.get("date", "")[:10] if release.get("date") else None,
        "tender_period_end": tender.get("tenderPeriod", {}).get("endDate", "")[:10] if tender.get("tenderPeriod", {}).get("endDate") else None,
        "value_amount": tender.get("value", {}).get("amount"),
        "value_currency": tender.get("value", {}).get("currency", "GBP"),
        "awarded_value": awarded_value,
        "awarded_supplier": awarded_supplier,
        "awarded_date": awarded_date,
        "valid_bids": valid_bids,
        "total_bidders": len(bid_details) if bid_details else valid_bids,
        "suppliers": [{"name": s.get("name", ""), "id": s.get("id", "")} for s in suppliers],
        "url": f"https://www.find-tender.service.gov.uk/Notice/{release.get('ocid', '')}",
    }


def fetch_council_contracts(council_id, api_key, since="2020-01-01"):
    """Fetch all FTS contracts for a council."""
    config = COUNCILS[council_id]
    all_contracts = []

    for buyer_name in config["buyer_names"]:
        log(f"  Searching FTS for buyer: {buyer_name}")

        # FTS uses date range filtering
        # Paginate through results
        offset = 0
        page_size = 100

        while True:
            params = {
                "updatedFrom": f"{since}T00:00:00Z",
                "updatedTo": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "size": str(page_size),
                "from": str(offset),
            }

            data = fetch_fts("ocdsReleasePackages", api_key, params)
            if not data:
                break

            releases = data.get("releases", [])
            if not releases:
                break

            # Filter by buyer name
            for release in releases:
                buyer = release.get("buyer", {}).get("name", "")
                parties = release.get("parties", [])
                buyer_names = [p.get("name", "") for p in parties if "buyer" in p.get("roles", [])]
                buyer_names.append(buyer)

                if any(buyer_name.lower() in bn.lower() for bn in buyer_names if bn):
                    contract = parse_release(release)
                    all_contracts.append(contract)

            log(f"    Page {offset // page_size + 1}: {len(releases)} releases, {len(all_contracts)} matches so far")

            if len(releases) < page_size:
                break

            offset += page_size
            time.sleep(REQUEST_DELAY)

    # Deduplicate by ocid
    seen = set()
    unique = []
    for c in all_contracts:
        if c["ocid"] not in seen:
            seen.add(c["ocid"])
            unique.append(c)

    return unique


def compute_fts_stats(contracts):
    """Compute summary statistics for FTS contracts."""
    awarded = [c for c in contracts if c.get("awarded_value")]

    # Procedure breakdown
    procedures = defaultdict(int)
    for c in contracts:
        proc = c.get("procedure", "unknown")
        procedures[proc] += 1

    # Bid count analysis
    with_bids = [c for c in contracts if c.get("valid_bids") is not None]
    single_bidder = [c for c in with_bids if c["valid_bids"] == 1]

    # Value stats
    awarded_values = [c["awarded_value"] for c in awarded]
    total_value = sum(awarded_values) if awarded_values else 0

    return {
        "total_notices": len(contracts),
        "total_awarded_value": round(total_value, 2),
        "procedures": dict(procedures),
        "contracts_with_bid_data": len(with_bids),
        "single_bidder_contracts": len(single_bidder),
        "single_bidder_pct": round(len(single_bidder) / len(with_bids) * 100, 1) if with_bids else 0,
        "avg_bidders": round(sum(c["valid_bids"] for c in with_bids) / len(with_bids), 1) if with_bids else 0,
    }


def main():
    parser = argparse.ArgumentParser(description="Fetch FTS above-threshold contract data")
    parser.add_argument("--council", nargs="*", default=list(COUNCILS.keys()),
                        help="Council IDs to process")
    parser.add_argument("--since", default="2020-01-01",
                        help="Fetch contracts published from this date (YYYY-MM-DD)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Preview without saving")
    args = parser.parse_args()

    # Load API key
    api_key = os.environ.get("FTS_API_KEY", "")
    if not api_key:
        env_path = SCRIPT_DIR.parent / ".env"
        if env_path.exists():
            with open(env_path) as f:
                for line in f:
                    if line.startswith("FTS_API_KEY="):
                        api_key = line.strip().split("=", 1)[1].strip('"').strip("'")
                        break

    if not api_key:
        print("=" * 60)
        print("ERROR: FTS_API_KEY not set")
        print("=" * 60)
        print()
        print("Find a Tender requires a CDP API key.")
        print("To get one:")
        print("  1. Register at https://www.find-tender.service.gov.uk")
        print("  2. Generate an API key from your account settings")
        print("  3. Set FTS_API_KEY environment variable or add to .env")
        print()
        print("Example: FTS_API_KEY=your-key-here python3 fts_etl.py")
        sys.exit(1)

    print("=" * 60)
    print("FIND A TENDER ETL: Above-Threshold Contracts")
    print("=" * 60)

    for council_id in args.council:
        if council_id not in COUNCILS:
            log(f"Unknown council: {council_id}")
            continue

        log(f"\n--- {council_id.upper()} ---")
        contracts = fetch_council_contracts(council_id, api_key, args.since)
        stats = compute_fts_stats(contracts)

        log(f"  Found {stats['total_notices']} contracts, "
            f"£{stats['total_awarded_value']:,.0f} total value, "
            f"{stats['single_bidder_contracts']}/{stats['contracts_with_bid_data']} single-bidder")

        if args.dry_run:
            log("  [DRY RUN] Not saving")
            continue

        output = {
            "meta": {
                "council_id": council_id,
                "source": "Find a Tender Service (find-tender.service.gov.uk)",
                "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "total_notices": stats["total_notices"],
            },
            "stats": stats,
            "contracts": contracts,
        }

        output_path = DATA_DIR / council_id / "fts_contracts.json"
        with open(output_path, "w") as f:
            json.dump(output, f, indent=2)
        log(f"  Saved to {output_path}")

    print("\n✓ FTS ETL complete")


if __name__ == "__main__":
    main()
