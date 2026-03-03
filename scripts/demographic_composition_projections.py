#!/usr/bin/env python3
"""
demographic_composition_projections.py — Ethnic, religion & sex composition projections.

Generates forward projections (2021→2032→2042) for:
- Ethnicity composition (5 groups + detailed sub-groups)
- Religion composition (9 categories)
- Sex ratio (male/female by age band)

Method:
1. Uses Census 2021 as base year
2. Applies differential fertility rates (TFR) by ethnic group
3. Applies ONS SNPP total population envelope
4. Models age-structure-driven composition shift (younger groups grow faster)
5. Generates council-level AND ward-level projections

Output per council: burnley-council/data/{council_id}/composition_projections.json
Output shared:      burnley-council/data/shared/composition_projections_summary.json

Usage:
    python3 scripts/demographic_composition_projections.py                    # All councils
    python3 scripts/demographic_composition_projections.py --council burnley  # Single
"""

import json
import sys
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "burnley-council" / "data"

PROJECTION_YEARS = [2027, 2032, 2037, 2042]

# ---- Total Fertility Rates by ethnic group (ONS / DfE estimates) ----
# Used to model differential growth: higher TFR → faster younger cohort growth
TFR = {
    "White": 1.55,
    "Asian": 2.10,  # Weighted: Pakistani 2.3, Bangladeshi 2.3, Indian 1.8, Chinese 1.5
    "Black": 1.85,
    "Mixed": 1.75,
    "Other": 1.80,
}

# Detailed sub-group TFRs for finer projections
TFR_DETAILED = {
    "Pakistani": 2.30,
    "Bangladeshi": 2.30,
    "Indian": 1.80,
    "Chinese": 1.50,
    "Other Asian": 1.90,
    "African": 2.10,
    "Caribbean": 1.60,
    "Other Black": 1.70,
    "White and Black Caribbean": 1.70,
    "White and Black African": 1.80,
    "White and Asian": 1.75,
    "Other Mixed": 1.75,
    "Arab": 2.20,
    "Roma": 2.80,
    "Gypsy or Irish Traveller": 2.80,
    "White: English, Welsh, Scottish, Northern Irish or British": 1.52,
    "White: Irish": 1.55,
    "White: Other White": 1.65,
}

# National replacement fertility rate
REPLACEMENT_TFR = 2.1

# Religion growth factors (relative to population growth)
# Based on Census 2011→2021 observed trends nationally
RELIGION_GROWTH_FACTOR = {
    "Christian": 0.80,     # Declining faster than population
    "Muslim": 1.45,        # Growing faster (younger age profile + higher fertility)
    "Hindu": 1.15,         # Slight growth (migration-driven)
    "Sikh": 0.95,          # Stable
    "Buddhist": 1.05,      # Stable
    "Jewish": 0.90,        # Slight decline
    "Other religion": 1.10,
    "No religion": 1.20,   # Growing (secularisation trend)
    "Not answered": 1.00,  # Stable
}

# Sex ratio at birth (males per 100 females)
SEX_RATIO_AT_BIRTH = 105.0

COUNCILS = {
    "burnley": "Burnley",
    "hyndburn": "Hyndburn",
    "pendle": "Pendle",
    "rossendale": "Rossendale",
    "lancaster": "Lancaster",
    "ribble_valley": "Ribble Valley",
    "chorley": "Chorley",
    "south_ribble": "South Ribble",
    "blackpool": "Blackpool",
    "west_lancashire": "West Lancashire",
    "blackburn": "Blackburn with Darwen",
    "wyre": "Wyre",
    "preston": "Preston",
    "fylde": "Fylde",
    "lancashire_cc": "Lancashire",
}


def load_json(path):
    """Load JSON file, return None if not found."""
    try:
        with open(path) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def get_population_envelope(council_id):
    """Get SNPP population projections as growth multipliers."""
    proj_path = DATA_DIR / council_id / "demographic_projections.json"
    proj = load_json(proj_path)
    if not proj or not proj.get("population_projections"):
        return None

    pop_proj = proj["population_projections"]
    base_pop = pop_proj.get("2022") or pop_proj.get(2022)
    if not base_pop:
        return None

    multipliers = {}
    for year in PROJECTION_YEARS:
        y_pop = pop_proj.get(str(year)) or pop_proj.get(year)
        if y_pop:
            multipliers[year] = y_pop / base_pop
    return multipliers, base_pop


def project_ethnicity(base_ethnicity, total_pop, pop_multipliers):
    """
    Project ethnic composition forward using differential fertility rates.

    Higher-TFR groups grow their share; lower-TFR groups shrink.
    Constrained to SNPP total population envelope.
    """
    results = {}
    base_year = 2021

    for year in PROJECTION_YEARS:
        mult = pop_multipliers.get(year, 1.0)
        years_forward = year - base_year
        target_pop = total_pop * mult

        projected = {}
        raw_total = 0

        for group, data in base_ethnicity.items():
            count = data.get("count", 0) if isinstance(data, dict) else data
            if count <= 0:
                projected[group] = 0
                continue

            tfr = TFR.get(group, 1.7)
            # Annual growth rate relative to replacement
            growth_rate = 1 + (tfr - REPLACEMENT_TFR) * 0.004 * (years_forward / 5)
            # Compound over period
            raw_count = count * (growth_rate ** (years_forward / 5))
            projected[group] = raw_count
            raw_total += raw_count

        # Normalise to target population
        if raw_total > 0:
            scale = target_pop / raw_total
            for group in projected:
                projected[group] = round(projected[group] * scale)

        # Build output with counts and percentages
        year_data = {}
        for group in projected:
            pct = round(projected[group] / target_pop * 100, 1) if target_pop else 0
            year_data[group] = {"count": projected[group], "pct": pct}

        results[str(year)] = year_data

    return results


def project_ethnicity_detailed(ward_ethnicity, ward_pop, pop_multipliers):
    """Project detailed ethnic sub-groups at ward level."""
    results = {}
    base_year = 2021

    # Build group→count mapping from ward ethnicity
    groups = {}
    total = 0
    for key, val in ward_ethnicity.items():
        if key == "Total: All usual residents":
            total = val
            continue
        count = val if isinstance(val, (int, float)) else 0
        if count > 0:
            groups[key] = count

    if total <= 0:
        total = sum(groups.values())

    for year in PROJECTION_YEARS:
        mult = pop_multipliers.get(year, 1.0)
        years_forward = year - base_year
        target_pop = round(total * mult)

        projected = {}
        raw_total = 0

        for group_name, count in groups.items():
            # Find best matching TFR
            tfr = 1.7  # default
            for tfr_key, tfr_val in TFR_DETAILED.items():
                if tfr_key.lower() in group_name.lower():
                    tfr = tfr_val
                    break
            else:
                # Fall back to broad group
                for broad_key, broad_tfr in TFR.items():
                    if broad_key.lower() in group_name.lower():
                        tfr = broad_tfr
                        break

            growth_rate = 1 + (tfr - REPLACEMENT_TFR) * 0.004 * (years_forward / 5)
            raw_count = count * (growth_rate ** (years_forward / 5))
            projected[group_name] = raw_count
            raw_total += raw_count

        # Normalise
        if raw_total > 0:
            scale = target_pop / raw_total
            for g in projected:
                projected[g] = round(projected[g] * scale)

        year_data = {}
        for g, c in projected.items():
            pct = round(c / target_pop * 100, 1) if target_pop else 0
            year_data[g] = {"count": c, "pct": pct}
        year_data["_total"] = target_pop

        results[str(year)] = year_data

    return results


def project_religion(base_religion, total_pop, pop_multipliers):
    """Project religion composition using observed 2011→2021 trends."""
    results = {}
    base_year = 2021

    for year in PROJECTION_YEARS:
        mult = pop_multipliers.get(year, 1.0)
        years_forward = year - base_year
        target_pop = total_pop * mult

        projected = {}
        raw_total = 0

        for religion, data in base_religion.items():
            count = data.get("count", 0) if isinstance(data, dict) else data
            if count <= 0:
                projected[religion] = 0
                continue

            growth = RELIGION_GROWTH_FACTOR.get(religion, 1.0)
            # Annual compound rate
            annual_rate = growth ** (1 / 10)  # 10-year trend factor → annual
            raw_count = count * (annual_rate ** years_forward)
            projected[religion] = raw_count
            raw_total += raw_count

        # Normalise to target population
        if raw_total > 0:
            scale = target_pop / raw_total
            for r in projected:
                projected[r] = round(projected[r] * scale)

        year_data = {}
        for r in projected:
            pct = round(projected[r] / target_pop * 100, 1) if target_pop else 0
            year_data[r] = {"count": projected[r], "pct": pct}

        results[str(year)] = year_data

    return results


def project_religion_ward(ward_religion, ward_pop, pop_multipliers):
    """Project religion at ward level."""
    results = {}
    base_year = 2021

    total = ward_religion.get("Total: All usual residents", 0)
    if total <= 0:
        total = sum(v for k, v in ward_religion.items()
                    if k != "Total: All usual residents" and isinstance(v, (int, float)))

    groups = {k: v for k, v in ward_religion.items()
              if k != "Total: All usual residents" and isinstance(v, (int, float)) and v > 0}

    for year in PROJECTION_YEARS:
        mult = pop_multipliers.get(year, 1.0)
        years_forward = year - base_year
        target_pop = round(total * mult)

        projected = {}
        raw_total = 0

        for religion, count in groups.items():
            growth = RELIGION_GROWTH_FACTOR.get(religion, 1.0)
            annual_rate = growth ** (1 / 10)
            raw_count = count * (annual_rate ** years_forward)
            projected[religion] = raw_count
            raw_total += raw_count

        if raw_total > 0:
            scale = target_pop / raw_total
            for r in projected:
                projected[r] = round(projected[r] * scale)

        year_data = {}
        for r, c in projected.items():
            pct = round(c / target_pop * 100, 1) if target_pop else 0
            year_data[r] = {"count": c, "pct": pct}
        year_data["_total"] = target_pop

        results[str(year)] = year_data

    return results


def project_sex(base_male, base_female, total_pop, pop_multipliers):
    """Project sex ratio forward (stable ratio with slight aging shift)."""
    results = {}
    base_year = 2021
    base_total = base_male + base_female
    male_pct = base_male / base_total if base_total else 0.5

    for year in PROJECTION_YEARS:
        mult = pop_multipliers.get(year, 1.0)
        target_pop = round(total_pop * mult)
        # Sex ratio shifts slightly towards female as population ages (women live longer)
        years_forward = year - base_year
        aging_shift = years_forward * 0.0003  # ~0.03% per year more female
        adj_male_pct = max(0.46, male_pct - aging_shift)

        male_count = round(target_pop * adj_male_pct)
        female_count = target_pop - male_count

        results[str(year)] = {
            "male": {"count": male_count, "pct": round(adj_male_pct * 100, 1)},
            "female": {"count": female_count, "pct": round((1 - adj_male_pct) * 100, 1)},
        }

    return results


def compute_diversity_index(ethnicity_data):
    """Simpson's Diversity Index: 1 - sum(p_i^2). Higher = more diverse."""
    total = sum(
        d.get("count", 0) if isinstance(d, dict) else d
        for d in ethnicity_data.values()
    )
    if total <= 0:
        return 0
    index = 1 - sum(
        ((d.get("count", 0) if isinstance(d, dict) else d) / total) ** 2
        for d in ethnicity_data.values()
    )
    return round(index, 4)


def process_council(council_id):
    """Generate composition projections for a single council."""
    demo_path = DATA_DIR / council_id / "demographics.json"
    demographics = load_json(demo_path)
    if not demographics:
        print(f"  [SKIP] {council_id}: no demographics.json")
        return None

    envelope = get_population_envelope(council_id)
    if not envelope:
        print(f"  [SKIP] {council_id}: no population projections")
        return None

    pop_multipliers, base_pop = envelope
    summary = demographics.get("summary", {})
    wards = demographics.get("wards", {})

    # ---- Council-level projections ----
    ethnicity_proj = project_ethnicity(
        summary.get("ethnicity", {}),
        summary.get("population", base_pop),
        pop_multipliers,
    )

    religion_proj = project_religion(
        summary.get("religion", {}),
        summary.get("population", base_pop),
        pop_multipliers,
    )

    sex_proj = project_sex(
        summary.get("male", 0),
        summary.get("female", 0),
        summary.get("population", base_pop),
        pop_multipliers,
    )

    # Diversity index trajectory
    diversity_trajectory = {"2021": compute_diversity_index(summary.get("ethnicity", {}))}
    for year, eth_data in ethnicity_proj.items():
        diversity_trajectory[year] = compute_diversity_index(eth_data)

    # ---- Ward-level projections ----
    ward_projections = {}
    for ward_code, ward_data in wards.items():
        ward_name = ward_data.get("name", ward_code)
        ward_eth = ward_data.get("ethnicity", {})
        ward_rel = ward_data.get("religion", {})
        ward_sex = ward_data.get("sex", {})

        wp = {"name": ward_name}

        if ward_eth:
            wp["ethnicity"] = project_ethnicity_detailed(ward_eth, 0, pop_multipliers)

        if ward_rel:
            wp["religion"] = project_religion_ward(ward_rel, 0, pop_multipliers)

        # Ward-level diversity trajectory
        if ward_eth:
            ward_div = {}
            # Base year diversity from raw counts
            base_counts = {k: v for k, v in ward_eth.items()
                          if k != "Total: All usual residents" and isinstance(v, (int, float))}
            base_total = sum(base_counts.values())
            if base_total > 0:
                ward_div["2021"] = round(1 - sum((c / base_total) ** 2 for c in base_counts.values()), 4)
            # Projected diversity
            for year, year_data in wp.get("ethnicity", {}).items():
                counts = {k: v.get("count", 0) if isinstance(v, dict) else 0
                         for k, v in year_data.items() if k != "_total"}
                t = sum(counts.values())
                if t > 0:
                    ward_div[year] = round(1 - sum((c / t) ** 2 for c in counts.values()), 4)
            wp["diversity_index"] = ward_div

        ward_projections[ward_code] = wp

    # ---- Key insights ----
    insights = []

    # Fastest growing ethnic group
    if ethnicity_proj.get("2032"):
        base_eth = summary.get("ethnicity", {})
        proj_2032 = ethnicity_proj["2032"]
        max_growth = 0
        max_group = None
        for group in proj_2032:
            base_pct = base_eth.get(group, {}).get("pct", 0) if isinstance(base_eth.get(group), dict) else 0
            proj_pct = proj_2032[group].get("pct", 0)
            growth = proj_pct - base_pct
            if growth > max_growth:
                max_growth = growth
                max_group = group
        if max_group and max_growth > 0.5:
            insights.append({
                "type": "ethnic_growth",
                "group": max_group,
                "change_pp": round(max_growth, 1),
                "desc": f"{max_group} population projected to grow by {max_growth:.1f}pp by 2032",
            })

    # Religion shift
    if ethnicity_proj.get("2032"):
        base_rel = summary.get("religion", {})
        proj_rel = religion_proj.get("2032", {})
        for rel in ["Muslim", "No religion"]:
            base_pct = base_rel.get(rel, {}).get("pct", 0) if isinstance(base_rel.get(rel), dict) else 0
            proj_pct = proj_rel.get(rel, {}).get("pct", 0) if isinstance(proj_rel.get(rel), dict) else 0
            change = proj_pct - base_pct
            if abs(change) > 0.5:
                direction = "grow" if change > 0 else "decline"
                insights.append({
                    "type": "religion_shift",
                    "group": rel,
                    "change_pp": round(change, 1),
                    "desc": f"{rel} projected to {direction} by {abs(change):.1f}pp by 2032",
                })

    # Diversity trend
    div_2021 = diversity_trajectory.get("2021", 0)
    div_2032 = diversity_trajectory.get("2032", 0)
    if div_2032 > div_2021 + 0.01:
        insights.append({
            "type": "diversity_increase",
            "change": round(div_2032 - div_2021, 4),
            "desc": f"Diversity index projected to increase from {div_2021:.3f} to {div_2032:.3f} by 2032",
        })

    # Most diverse ward in 2032
    most_diverse_ward = None
    max_ward_div = 0
    for wc, wp in ward_projections.items():
        d = wp.get("diversity_index", {}).get("2032", 0)
        if d > max_ward_div:
            max_ward_div = d
            most_diverse_ward = wp.get("name", wc)
    if most_diverse_ward and max_ward_div > 0.3:
        insights.append({
            "type": "most_diverse_ward",
            "ward": most_diverse_ward,
            "diversity_index": max_ward_div,
            "desc": f"{most_diverse_ward} projected as most ethnically diverse ward by 2032 (index: {max_ward_div:.3f})",
        })

    output = {
        "meta": {
            "source": "Census 2021 base + ONS SNPP population envelope + differential fertility model",
            "methodology": "Applies group-specific TFR-based growth rates constrained to ONS SNPP total population projections. Religion trends based on observed 2011-2021 national shifts.",
            "council_id": council_id,
            "council_name": COUNCILS.get(council_id, council_id),
            "base_year": 2021,
            "projection_years": PROJECTION_YEARS,
            "last_updated": datetime.now().strftime("%Y-%m-%d"),
            "caveats": [
                "Projections are modelled estimates, not official ONS forecasts",
                "Assumes continuation of current fertility and migration patterns",
                "Ward-level projections have higher uncertainty than council-level",
                "Religion projections assume continuation of national secularisation trend",
            ],
        },
        "ethnicity_projections": {
            "2021": {k: v if isinstance(v, dict) else {"count": v, "pct": 0}
                     for k, v in summary.get("ethnicity", {}).items()},
            **ethnicity_proj,
        },
        "religion_projections": {
            "2021": {k: v if isinstance(v, dict) else {"count": v, "pct": 0}
                     for k, v in summary.get("religion", {}).items()},
            **religion_proj,
        },
        "sex_projections": sex_proj,
        "diversity_trajectory": diversity_trajectory,
        "ward_projections": ward_projections,
        "insights": insights,
    }

    # Write output
    out_path = DATA_DIR / council_id / "composition_projections.json"
    with open(out_path, "w") as f:
        json.dump(output, f, separators=(",", ":"))
    size_kb = out_path.stat().st_size / 1024
    print(f"  [OK] {council_id}: {len(ward_projections)} wards, {len(insights)} insights ({size_kb:.0f}KB)")

    return {
        "council_id": council_id,
        "council_name": COUNCILS.get(council_id, council_id),
        "diversity_2021": diversity_trajectory.get("2021", 0),
        "diversity_2032": diversity_trajectory.get("2032", 0),
        "insight_count": len(insights),
        "ward_count": len(ward_projections),
    }


def main():
    """Run composition projections for specified or all councils."""
    import argparse
    parser = argparse.ArgumentParser(description="Demographic composition projections")
    parser.add_argument("--council", help="Single council ID")
    args = parser.parse_args()

    councils = [args.council] if args.council else list(COUNCILS.keys())

    print(f"Generating composition projections for {len(councils)} council(s)...")
    summaries = []

    for council_id in councils:
        result = process_council(council_id)
        if result:
            summaries.append(result)

    # Write shared summary
    if summaries:
        summary_path = DATA_DIR / "shared" / "composition_projections_summary.json"
        with open(summary_path, "w") as f:
            json.dump({
                "meta": {
                    "source": "demographic_composition_projections.py",
                    "last_updated": datetime.now().strftime("%Y-%m-%d"),
                    "council_count": len(summaries),
                },
                "councils": summaries,
            }, f, indent=2)
        print(f"\nShared summary: {len(summaries)} councils → {summary_path}")

    print(f"\nDone: {len(summaries)}/{len(councils)} councils processed")


if __name__ == "__main__":
    main()
