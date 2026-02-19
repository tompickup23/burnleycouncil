#!/usr/bin/env python3
"""
calibrate_model.py — Empirical Election Model Calibration

Fits OLS regression on DCLEAPIL ward-level election results (2018-2024)
combined with Census 2021 demographics + IMD 2019 deprivation data.

Outputs: burnley-council/data/shared/model_coefficients.json

Academic basis:
  - Rallings & Thrasher (Plymouth): National-to-local dampening methodology
  - Fieldhouse et al. (Manchester/BES): Ecological inference for ward-level modelling
  - Ford & Sobolewska (Manchester): "Left behind" voter profiling for Reform/UKIP
  - Curtice (Strathclyde/NatCen): Census regression approach for prediction

Usage:
    python3 calibrate_model.py
    python3 calibrate_model.py --min-year 2018 --verbose
"""

import argparse
import csv
import json
import os
import sys
import math
from datetime import datetime
from collections import defaultdict
from pathlib import Path

# -----------------------------------------------------------------
# Constants
# -----------------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR.parent / "data"
SHARED_DIR = DATA_DIR / "shared"
DCLEAPIL_PATH = SCRIPT_DIR / "election_data_cache" / "dcleapil_results.csv"

# Lancashire councils in DCLEAPIL (excluding LCC — county elections are different tier)
LANCASHIRE_COUNCILS = {
    "Burnley", "Hyndburn", "Pendle", "Rossendale",
    "Lancaster", "Ribble Valley", "Chorley", "South Ribble",
    "Preston", "West Lancashire", "Fylde", "Wyre",
    "Blackpool", "Blackburn with Darwen",
}

# Map DCLEAPIL council names to our council_id
COUNCIL_NAME_TO_ID = {
    "Burnley": "burnley", "Hyndburn": "hyndburn", "Pendle": "pendle",
    "Rossendale": "rossendale", "Lancaster": "lancaster",
    "Ribble Valley": "ribble_valley", "Chorley": "chorley",
    "South Ribble": "south_ribble", "Preston": "preston",
    "West Lancashire": "west_lancashire", "Fylde": "fylde", "Wyre": "wyre",
    "Blackpool": "blackpool", "Blackburn with Darwen": "blackburn",
}

# Standard party groupings — map DCLEAPIL party names to our standard parties
PARTY_MAP = {
    "Labour Party": "Labour",
    "Labour and Co-operative Party": "Labour",
    "Labour Co-operative": "Labour",
    "Conservative and Unionist Party": "Conservative",
    "Conservative Party": "Conservative",
    "Liberal Democrats": "Liberal Democrats",
    "Liberal Democrat": "Liberal Democrats",
    "Green Party": "Green Party",
    "Green Party of England and Wales": "Green Party",
    "UKIP": "Reform UK",  # Predecessor
    "UK Independence Party (UKIP)": "Reform UK",
    "UK Independence Party": "Reform UK",
    "Reform UK": "Reform UK",
    "British National Party": "BNP",
    "Independent": "Independent",
}

# Parties we model (have enough data for regression)
MODELLED_PARTIES = ["Labour", "Conservative", "Liberal Democrats", "Reform UK", "Green Party"]

# -----------------------------------------------------------------
# Data loading
# -----------------------------------------------------------------

def load_dcleapil(min_year=2018):
    """Load DCLEAPIL results for Lancashire councils from min_year onwards."""
    if not DCLEAPIL_PATH.exists():
        print(f"ERROR: DCLEAPIL file not found at {DCLEAPIL_PATH}")
        sys.exit(1)

    results = []
    with open(DCLEAPIL_PATH, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            council = row.get("council", "")
            if council not in LANCASHIRE_COUNCILS:
                continue
            try:
                year = int(row["year"])
            except (ValueError, KeyError):
                continue
            if year < min_year:
                continue

            vote_share = row.get("vote_share", "")
            votes_cast = row.get("votes_cast", "")
            try:
                vs = float(vote_share) / 100.0 if vote_share else None
            except ValueError:
                vs = None
            try:
                vc = int(votes_cast) if votes_cast else 0
            except ValueError:
                vc = 0

            party_raw = row.get("party_name", "")
            party = PARTY_MAP.get(party_raw, "Other")

            results.append({
                "council": council,
                "council_id": COUNCIL_NAME_TO_ID.get(council),
                "ward": row.get("ward", ""),
                "year": year,
                "party": party,
                "vote_share": vs,
                "votes_cast": vc,
                "elected": row.get("elected", "") == "t",
                "turnout": float(row["turnout_percentage"]) / 100.0 if row.get("turnout_percentage") else None,
            })

    print(f"  Loaded {len(results)} candidate records from DCLEAPIL (Lancashire, {min_year}+)")
    return results


def load_demographics():
    """Load demographics.json for all councils. Returns {council_id: {ward_name: features}}."""
    demo = {}
    for council_dir in DATA_DIR.iterdir():
        if not council_dir.is_dir() or council_dir.name == "shared":
            continue
        demo_path = council_dir / "demographics.json"
        if not demo_path.exists():
            continue

        with open(demo_path) as f:
            data = json.load(f)

        council_id = data.get("meta", {}).get("council_id", council_dir.name)
        wards = data.get("wards", {})
        ward_features = {}

        for ward_code, ward_data in wards.items():
            ward_name = ward_data.get("name", ward_code)

            # Extract age features
            age = ward_data.get("age", {})
            total_pop = age.get("Total: All usual residents", 0)
            if total_pop == 0:
                continue

            age_65_74 = age.get("Aged 65 to 74 years", 0)
            age_75_84 = age.get("Aged 75 to 84 years", 0)
            age_85_plus = sum(v for k, v in age.items()
                             if isinstance(v, int) and ("85" in k or "90" in k)
                             and "Total" not in k and "to" not in k)
            # Handle "Aged 85 to 89 years" + "Aged 90 years and over" or similar
            age_85_89 = age.get("Aged 85 to 89 years", 0)
            age_90_plus = age.get("Aged 90 years and over", age.get("Aged 90 years", 0))
            over65 = age_65_74 + age_75_84 + age_85_89 + age_90_plus
            pct_over65 = over65 / total_pop if total_pop else 0

            # Young adults 18-34
            age_16_19 = age.get("Aged 16 to 19 years", 0)
            age_20_24 = age.get("Aged 20 to 24 years", 0)
            age_25_34 = age.get("Aged 25 to 34 years", 0)
            young_adults = age_20_24 + age_25_34
            pct_young_adults = young_adults / total_pop if total_pop else 0

            # Extract ethnicity features
            eth = ward_data.get("ethnicity", {})
            eth_total = eth.get("Total: All usual residents", total_pop)
            asian = eth.get("Asian, Asian British or Asian Welsh", 0)
            pct_asian = asian / eth_total if eth_total else 0
            white_british = eth.get("White: English, Welsh, Scottish, Northern Irish or British",
                                   eth.get("White", 0))
            pct_white_british = white_british / eth_total if eth_total else 0

            # Economic activity
            econ = ward_data.get("economic_activity", {})
            econ_total = econ.get("Total: All usual residents aged 16 years and over", 0)
            unemployed = 0
            for k, v in econ.items():
                if isinstance(v, int) and "Unemployed" in k and ":" not in k.split("Unemployed")[1]:
                    unemployed += v
            pct_unemployed = unemployed / econ_total if econ_total else 0

            ward_features[ward_name] = {
                "total_pop": total_pop,
                "pct_over65": pct_over65,
                "pct_young_adults": pct_young_adults,
                "pct_asian": pct_asian,
                "pct_white_british": pct_white_british,
                "pct_unemployed": pct_unemployed,
            }

        demo[council_id] = ward_features

    print(f"  Loaded demographics for {len(demo)} councils ({sum(len(v) for v in demo.values())} wards)")
    return demo


def load_deprivation():
    """Load deprivation.json for all councils. Returns {council_id: {ward_name: features}}."""
    dep = {}
    for council_dir in DATA_DIR.iterdir():
        if not council_dir.is_dir() or council_dir.name == "shared":
            continue
        dep_path = council_dir / "deprivation.json"
        if not dep_path.exists():
            continue

        with open(dep_path) as f:
            data = json.load(f)

        council_id = data.get("meta", {}).get("council_id", council_dir.name)
        wards = data.get("wards", {})
        ward_features = {}

        for ward_name, ward_data in wards.items():
            ward_features[ward_name] = {
                "imd_score": ward_data.get("avg_imd_score", 0),
                "imd_decile": ward_data.get("avg_imd_decile", 5),
                "deprivation_level": ward_data.get("deprivation_level", "Medium"),
                "national_percentile": ward_data.get("national_percentile", 50),
            }

        dep[council_id] = ward_features

    print(f"  Loaded deprivation for {len(dep)} councils ({sum(len(v) for v in dep.values())} wards)")
    return dep


def load_qualifications_tenure():
    """Load qualifications and tenure from demographics.json (added by census_etl.py A3 extension)."""
    qt = {}
    for council_dir in DATA_DIR.iterdir():
        if not council_dir.is_dir() or council_dir.name == "shared":
            continue
        demo_path = council_dir / "demographics.json"
        if not demo_path.exists():
            continue

        with open(demo_path) as f:
            data = json.load(f)

        council_id = data.get("meta", {}).get("council_id", council_dir.name)
        wards = data.get("wards", {})
        ward_features = {}

        for ward_code, ward_data in wards.items():
            ward_name = ward_data.get("name", ward_code)
            quals = ward_data.get("qualifications", {})
            tenure = ward_data.get("tenure", {})

            # Qualifications
            quals_total = 0
            no_quals = 0
            level4_plus = 0
            for k, v in quals.items():
                if not isinstance(v, int):
                    continue
                kl = k.lower()
                if "total" in kl:
                    quals_total = v
                elif "no qualifications" in kl:
                    no_quals = v
                elif "level 4" in kl:
                    level4_plus = v

            pct_no_quals = no_quals / quals_total if quals_total else None
            pct_degree = level4_plus / quals_total if quals_total else None

            # Tenure
            tenure_total = 0
            owned = 0
            social_rented = 0
            private_rented = 0
            for k, v in tenure.items():
                if not isinstance(v, int):
                    continue
                kl = k.lower()
                if "total" in kl and ":" not in kl:
                    tenure_total = v
                elif "owned" in kl and ":" not in kl:
                    owned = v
                elif "social rented" in kl and ":" not in kl:
                    social_rented = v
                elif "private rented" in kl and ":" not in kl:
                    private_rented = v

            pct_owned = owned / tenure_total if tenure_total else None
            pct_social_rented = social_rented / tenure_total if tenure_total else None
            pct_private_rented = private_rented / tenure_total if tenure_total else None

            ward_features[ward_name] = {
                "pct_no_quals": pct_no_quals,
                "pct_degree": pct_degree,
                "pct_owned": pct_owned,
                "pct_social_rented": pct_social_rented,
                "pct_private_rented": pct_private_rented,
            }

        qt[council_id] = ward_features

    total = sum(1 for v in qt.values() for w in v.values() if w.get("pct_no_quals") is not None)
    print(f"  Loaded qualifications/tenure for {len(qt)} councils ({total} wards with data)")
    return qt


def load_elections_reference():
    """Load elections_reference.json for national polling baselines."""
    ref_path = SHARED_DIR / "elections_reference.json"
    if not ref_path.exists():
        return {}
    with open(ref_path) as f:
        return json.load(f)


def load_polling():
    """Load polling.json for current aggregated polling."""
    poll_path = SHARED_DIR / "polling.json"
    if not poll_path.exists():
        return {}
    with open(poll_path) as f:
        return json.load(f)


# -----------------------------------------------------------------
# Feature matrix construction
# -----------------------------------------------------------------

def _normalise_ward_name(name):
    """Normalise ward name for matching: lowercase, strip parenthetical, common substitutions."""
    n = name.lower().strip()
    # Remove parenthetical suffixes like "(Burnley)" or "(Lancaster)"
    import re
    n = re.sub(r'\s*\([^)]*\)\s*$', '', n)
    return n


def _build_ward_lookup(ward_dict):
    """Build case-insensitive lookup from ward dict. Returns {normalised_name: original_key}."""
    lookup = {}
    for key in ward_dict:
        lookup[_normalise_ward_name(key)] = key
    return lookup


def build_feature_matrix(dcleapil, demographics, deprivation, qual_tenure, min_year=2018):
    """
    Build a feature matrix for regression.

    Each row = one ward-election-party observation.
    Features: demographic + deprivation + qualifications + tenure variables.
    Target: party vote share in that election.
    """
    # Aggregate DCLEAPIL to ward-election level: {(council_id, ward, year): {party: vote_share}}
    ward_elections = defaultdict(lambda: defaultdict(float))
    ward_turnouts = {}

    for rec in dcleapil:
        key = (rec["council_id"], rec["ward"], rec["year"])
        if rec["vote_share"] is not None:
            ward_elections[key][rec["party"]] = max(
                ward_elections[key][rec["party"]],
                rec["vote_share"]
            )
        if rec["turnout"] is not None:
            ward_turnouts[key] = rec["turnout"]

    # Build case-insensitive lookups for all ward data
    demo_lookups = {cid: _build_ward_lookup(wards) for cid, wards in demographics.items()}
    dep_lookups = {cid: _build_ward_lookup(wards) for cid, wards in deprivation.items()}
    qt_lookups = {cid: _build_ward_lookup(wards) for cid, wards in qual_tenure.items()}

    rows = []
    skipped_no_demo = 0
    skipped_no_dep = 0

    for (council_id, ward, year), party_shares in ward_elections.items():
        if not council_id:
            continue

        # Look up demographics (case-insensitive matching)
        demo_wards = demographics.get(council_id, {})
        dep_wards = deprivation.get(council_id, {})
        qt_wards = qual_tenure.get(council_id, {})

        # Case-insensitive ward lookup
        norm_ward = _normalise_ward_name(ward)
        demo_lookup = demo_lookups.get(council_id, {})
        dep_lookup = dep_lookups.get(council_id, {})
        qt_lookup = qt_lookups.get(council_id, {})

        demo_key = demo_lookup.get(norm_ward)
        dep_key = dep_lookup.get(norm_ward)
        qt_key = qt_lookup.get(norm_ward)

        demo = demo_wards.get(demo_key) if demo_key else None
        dep = dep_wards.get(dep_key) if dep_key else None
        qt = qt_wards.get(qt_key, {}) if qt_key else {}

        if not demo:
            skipped_no_demo += 1
            continue
        if not dep:
            skipped_no_dep += 1
            continue

        # Normalise IMD score to 0-1 range (max ~80)
        imd_norm = dep["imd_score"] / 80.0

        for party in MODELLED_PARTIES:
            vote_share = party_shares.get(party, 0.0)

            row = {
                "council_id": council_id,
                "ward": ward,
                "year": year,
                "party": party,
                "vote_share": vote_share,
                "turnout": ward_turnouts.get((council_id, ward, year), 0),
                # Features
                "imd_norm": imd_norm,
                "imd_decile": dep["imd_decile"],
                "pct_over65": demo["pct_over65"],
                "pct_young_adults": demo["pct_young_adults"],
                "pct_asian": demo["pct_asian"],
                "pct_white_british": demo["pct_white_british"],
                "pct_unemployed": demo["pct_unemployed"],
                # Qualifications + tenure (may be None)
                "pct_no_quals": qt.get("pct_no_quals"),
                "pct_degree": qt.get("pct_degree"),
                "pct_owned": qt.get("pct_owned"),
                "pct_social_rented": qt.get("pct_social_rented"),
                "pct_private_rented": qt.get("pct_private_rented"),
                # Contested flag (was this party actually standing?)
                "contested": party in party_shares,
            }
            rows.append(row)

    print(f"  Built feature matrix: {len(rows)} observations ({len(rows) // len(MODELLED_PARTIES)} ward-elections)")
    if skipped_no_demo:
        print(f"    Skipped {skipped_no_demo} ward-elections (no demographics match)")
    if skipped_no_dep:
        print(f"    Skipped {skipped_no_dep} ward-elections (no deprivation match)")

    return rows


# -----------------------------------------------------------------
# OLS Regression (pure Python — no external dependencies)
# -----------------------------------------------------------------

def ols_regression(X, y):
    """
    Ordinary Least Squares regression using normal equations.
    X: list of feature vectors (list of lists)
    y: list of target values
    Returns: coefficients, r_squared, mae, residuals
    """
    n = len(y)
    if n == 0:
        return [], 0, 0, []

    k = len(X[0])  # number of features (including intercept)

    # X^T X
    XtX = [[0.0] * k for _ in range(k)]
    for i in range(k):
        for j in range(k):
            for row in X:
                XtX[i][j] += row[i] * row[j]

    # X^T y
    Xty = [0.0] * k
    for i in range(k):
        for idx, row in enumerate(X):
            Xty[i] += row[i] * y[idx]

    # Solve using Gaussian elimination with partial pivoting
    coeffs = solve_linear_system(XtX, Xty)
    if coeffs is None:
        return [0.0] * k, 0, 0, [0.0] * n

    # Calculate predictions, residuals, R², MAE
    y_mean = sum(y) / n
    ss_tot = sum((yi - y_mean) ** 2 for yi in y)
    ss_res = 0.0
    mae_sum = 0.0
    residuals = []

    for idx in range(n):
        pred = sum(coeffs[j] * X[idx][j] for j in range(k))
        resid = y[idx] - pred
        residuals.append(resid)
        ss_res += resid ** 2
        mae_sum += abs(resid)

    r_squared = 1.0 - (ss_res / ss_tot) if ss_tot > 0 else 0.0
    mae = mae_sum / n

    return coeffs, r_squared, mae, residuals


def solve_linear_system(A, b):
    """Solve Ax = b using Gaussian elimination with partial pivoting."""
    n = len(b)
    # Create augmented matrix
    aug = [row[:] + [b[i]] for i, row in enumerate(A)]

    for col in range(n):
        # Partial pivoting
        max_row = col
        for row in range(col + 1, n):
            if abs(aug[row][col]) > abs(aug[max_row][col]):
                max_row = row
        aug[col], aug[max_row] = aug[max_row], aug[col]

        if abs(aug[col][col]) < 1e-12:
            # Near-singular — add small regularisation (ridge)
            aug[col][col] += 1e-6

        # Eliminate below
        for row in range(col + 1, n):
            factor = aug[row][col] / aug[col][col]
            for j in range(col, n + 1):
                aug[row][j] -= factor * aug[col][j]

    # Back substitution
    x = [0.0] * n
    for i in range(n - 1, -1, -1):
        x[i] = aug[i][n]
        for j in range(i + 1, n):
            x[i] -= aug[i][j] * x[j]
        x[i] /= aug[i][i] if abs(aug[i][i]) > 1e-12 else 1e-12

    return x


# -----------------------------------------------------------------
# Regression fitting
# -----------------------------------------------------------------

FEATURE_NAMES = [
    "intercept",
    "imd_norm",
    "pct_over65",
    "pct_young_adults",
    "pct_asian",
    "pct_white_british",
    "pct_unemployed",
    "pct_no_quals",
    "pct_degree",
    "pct_owned",
    "pct_social_rented",
]


def fit_party_models(feature_matrix, verbose=False):
    """Fit OLS regression for each modelled party."""
    coefficients = {}
    validation = {}

    for party in MODELLED_PARTIES:
        # Filter to rows where party was actually contested
        party_rows = [r for r in feature_matrix if r["party"] == party and r["contested"]]

        if len(party_rows) < 20:
            print(f"  {party}: only {len(party_rows)} observations — skipping regression")
            coefficients[party] = {"intercept": 0.0}
            validation[party] = {"n": len(party_rows), "r_squared": 0, "mae": 0}
            continue

        # Build X matrix (with intercept column)
        X = []
        y = []
        for r in party_rows:
            features = [
                1.0,  # intercept
                r["imd_norm"],
                r["pct_over65"],
                r["pct_young_adults"],
                r["pct_asian"],
                r["pct_white_british"],
                r["pct_unemployed"],
                r.get("pct_no_quals") if r.get("pct_no_quals") is not None else 0.0,
                r.get("pct_degree") if r.get("pct_degree") is not None else 0.0,
                r.get("pct_owned") if r.get("pct_owned") is not None else 0.0,
                r.get("pct_social_rented") if r.get("pct_social_rented") is not None else 0.0,
            ]
            X.append(features)
            y.append(r["vote_share"])

        coeffs, r_sq, mae, residuals = ols_regression(X, y)

        # Map coefficients to named dict
        coeff_dict = {}
        for i, name in enumerate(FEATURE_NAMES):
            coeff_dict[name] = round(coeffs[i], 6) if i < len(coeffs) else 0.0

        coefficients[party] = coeff_dict
        validation[party] = {
            "n": len(party_rows),
            "r_squared": round(r_sq, 4),
            "mae": round(mae, 4),
            "rmse": round(math.sqrt(sum(r ** 2 for r in residuals) / len(residuals)), 4) if residuals else 0,
        }

        if verbose:
            print(f"\n  {party} (n={len(party_rows)}):")
            print(f"    R² = {r_sq:.4f}, MAE = {mae:.4f}")
            for name, val in coeff_dict.items():
                if abs(val) > 0.001:
                    print(f"    {name}: {val:+.4f}")

    return coefficients, validation


# -----------------------------------------------------------------
# Party-specific dampening factors
# -----------------------------------------------------------------

def calculate_dampening(feature_matrix, elections_ref):
    """
    Calculate party-specific national-to-local dampening factors.

    Method: Compare actual local vote share changes across elections
    to what national polling would predict. The ratio is the dampening.

    Rallings & Thrasher found this varies 0.55-0.75 by party and region.
    """
    # Group ward-election results by (council_id, ward, party) across years
    ward_party_history = defaultdict(list)
    for r in feature_matrix:
        if r["contested"]:
            ward_party_history[(r["council_id"], r["ward"], r["party"])].append(
                (r["year"], r["vote_share"])
            )

    # For each consecutive pair of elections in same ward, calculate local swing
    party_swings = defaultdict(list)
    for (council_id, ward, party), history in ward_party_history.items():
        history.sort(key=lambda x: x[0])
        for i in range(1, len(history)):
            year_prev, share_prev = history[i - 1]
            year_curr, share_curr = history[i]
            if year_curr - year_prev <= 5:  # Only compare close elections
                local_swing = share_curr - share_prev
                party_swings[party].append(local_swing)

    # Calculate dampening as ratio of local swing variance to assumed national swing variance
    # Since we don't have exact national polling for each historical date,
    # use the distribution of local swings as a proxy
    dampening = {}
    for party in MODELLED_PARTIES:
        swings = party_swings.get(party, [])
        if len(swings) < 10:
            # Default dampening
            dampening[party] = 0.65
            continue

        # Calculate mean absolute swing — larger swings = more responsive to national trends
        mean_abs_swing = sum(abs(s) for s in swings) / len(swings)

        # Rallings & Thrasher (2007) found dampening varies 0.50-0.80:
        # - Reform/UKIP: higher (~0.80) — protest voting amplifies locally
        # - Lib Dems: lower (~0.50) — vote driven by tactical, not national swing
        # - Lab/Con: moderate (~0.60-0.70)
        # - Green: lower (~0.55) — very local/tactical vote
        #
        # We use mean absolute swing as a relative indicator:
        # Higher abs swing → more responsive → higher dampening
        # Scale: 0.05 abs swing → ~0.55 dampening, 0.12 abs swing → ~0.80 dampening
        raw_dampening = 0.45 + (mean_abs_swing / 0.12) * 0.35
        raw_dampening = min(0.85, max(0.45, raw_dampening))

        dampening[party] = round(raw_dampening, 3)

    return dampening


# -----------------------------------------------------------------
# Main
# -----------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Calibrate election prediction model")
    parser.add_argument("--min-year", type=int, default=2018,
                        help="Minimum election year to include (default: 2018)")
    parser.add_argument("--verbose", action="store_true",
                        help="Print detailed regression output")
    args = parser.parse_args()

    print(f"[{datetime.now().strftime('%H:%M:%S')}] Election model calibration starting")
    print(f"  Min year: {args.min_year}")
    print()

    # 1. Load all data sources
    print("Loading data sources:")
    dcleapil = load_dcleapil(min_year=args.min_year)
    demographics = load_demographics()
    deprivation = load_deprivation()
    qual_tenure = load_qualifications_tenure()
    elections_ref = load_elections_reference()
    polling = load_polling()
    print()

    # 2. Build feature matrix
    print("Building feature matrix:")
    feature_matrix = build_feature_matrix(
        dcleapil, demographics, deprivation, qual_tenure,
        min_year=args.min_year
    )
    print()

    # 3. Fit regression models
    print("Fitting regression models:")
    coefficients, validation = fit_party_models(feature_matrix, verbose=args.verbose)
    print()

    # 4. Calculate party-specific dampening
    print("Calculating party-specific dampening factors:")
    dampening = calculate_dampening(feature_matrix, elections_ref)
    for party, d in dampening.items():
        print(f"  {party}: {d}")
    print()

    # 5. Build output JSON
    output = {
        "meta": {
            "generated": datetime.now().isoformat(timespec="seconds"),
            "method": f"OLS regression, DCLEAPIL {args.min_year}-2024 + Census 2021 + IMD 2019",
            "data_sources": [
                f"DCLEAPIL ward results {args.min_year}-2024 (Leman 2025, CC BY-SA 4.0)",
                "ONS Census 2021 via Nomis API (age, ethnicity, qualifications, tenure)",
                "English Indices of Deprivation 2019 (MHCLG)",
            ],
            "academic_basis": [
                "Rallings & Thrasher (Plymouth): national-to-local dampening",
                "Fieldhouse et al. (Manchester/BES): ecological inference",
                "Ford & Sobolewska (Manchester): left-behind voter profiling",
                "Curtice (Strathclyde/NatCen): census regression approach",
            ],
            "feature_names": FEATURE_NAMES,
            "modelled_parties": MODELLED_PARTIES,
        },
        "coefficients": coefficients,
        "dampening_by_party": dampening,
        "validation": validation,
        "ge2024_baseline": polling.get("ge2024_baseline", elections_ref.get("ge2024_result", {})),
        "current_polling": polling.get("aggregate", elections_ref.get("national_polling", {})),
    }

    # 6. Write output
    output_path = SHARED_DIR / "model_coefficients.json"
    SHARED_DIR.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"Written: {output_path}")
    print()

    # Summary
    print("=== Calibration Summary ===")
    for party in MODELLED_PARTIES:
        v = validation.get(party, {})
        d = dampening.get(party, 0.65)
        print(f"  {party:20s}: R²={v.get('r_squared', 0):.3f}  MAE={v.get('mae', 0):.3f}  "
              f"n={v.get('n', 0):4d}  dampening={d:.3f}")


if __name__ == "__main__":
    main()
