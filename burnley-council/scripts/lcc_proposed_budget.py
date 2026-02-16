#!/usr/bin/env python3
"""
lcc_proposed_budget.py — Lancashire County Council 2026/27 Proposed Budget

Structures the LCC Cabinet 5 Feb 2026 Appendix B data into a machine-readable
JSON file for the AI DOGE platform. This provides:
  - Directorate-level net budgets for 2026/27, 2027/28, 2028/29
  - Service-level breakdowns within each directorate
  - Funding sources (council tax, RSG, business rates, grants)
  - Pressures and savings analysis
  - Council tax Band D and increases
  - Key financial risks

Source: LCC Cabinet 5 February 2026 - Appendix B (document s271538)
URL: https://council.lancashire.gov.uk/documents/s271538/Appendix%20B.pdf

Usage:
    python lcc_proposed_budget.py
    python lcc_proposed_budget.py --verify
"""

import argparse
import json
import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data" / "lancashire_cc"


def build_proposed_budget():
    """Build the LCC 2026/27 proposed budget data from Cabinet Appendix B.

    All figures sourced from LCC Cabinet 5 Feb 2026 - Appendix B.
    Values are in GBP (pounds sterling). Where the source gives £000s,
    values have been multiplied by 1000.
    """

    budget = {
        "council_id": "lancashire_cc",
        "financial_year": "2026-27",
        "type": "proposed",
        "source": "LCC Cabinet 5 Feb 2026 - Appendix B (s271538)",
        "source_url": "https://council.lancashire.gov.uk/documents/s271538/Appendix%20B.pdf",
        "status": "recommended_to_full_council",
        "notes": "Proposed budget recommended by Cabinet to Full Council. All values in GBP.",

        # ─── Headline figures ───────────────────────────────────────
        "net_revenue_budget": 1_324_444_000,

        # ─── Council Tax ────────────────────────────────────────────
        "council_tax": {
            "band_d": 1801.75,
            "increase_pct": 3.80,
            "general_increase_pct": 1.80,
            "asc_precept_pct": 2.00,
            "notes": "3.80% total = 1.80% general + 2.00% ASC precept. Lowest increase in 12 years."
        },

        # ─── Directorates ──────────────────────────────────────────
        # Net budget by directorate with 3-year Medium Term Financial Strategy (MTFS)
        "directorates": {
            "Adults, Health and Wellbeing": {
                "net_2026_27": 558_501_000,
                "net_2027_28": 578_736_000,
                "net_2028_29": 614_086_000,
                "share_of_total_pct": 42.2,
                "services": {
                    "Adult Operations A": {
                        "net_2026_27": 294_755_000,
                        "description": "Residential, nursing, home care for older people and physical disability"
                    },
                    "Adult Operations B": {
                        "net_2026_27": 266_234_000,
                        "description": "Learning disability, mental health, supported living"
                    },
                    "Public Health": {
                        "net_2026_27": -9_058_000,
                        "description": "Public health grant funded — net income to council"
                    },
                    "Strategic Commissioning": {
                        "net_2026_27": 6_298_000,
                        "description": "Commissioning strategy and market shaping"
                    },
                    "Health, Equity, Welfare and Partnerships": {
                        "net_2026_27": 272_000,
                        "description": "Health inequalities, welfare reform, partnerships"
                    }
                }
            },
            "Education and Children's Services": {
                "net_2026_27": 265_726_000,
                "net_2027_28": 266_503_000,
                "net_2028_29": 270_011_000,
                "share_of_total_pct": 20.1,
                "services": {
                    "Children's Social Care": {
                        "net_2026_27": 216_493_000,
                        "description": "Looked after children, child protection, fostering, adoption, SEND"
                    },
                    "Education and Skills": {
                        "net_2026_27": 32_518_000,
                        "description": "Schools improvement, early years, youth justice, adult education"
                    },
                    "Policy, Commissioning and Performance": {
                        "net_2026_27": 16_715_000,
                        "description": "Children's commissioning, performance monitoring"
                    }
                }
            },
            "Place": {
                "net_2026_27": 261_898_000,
                "net_2027_28": 270_665_000,
                "net_2028_29": 283_115_000,
                "share_of_total_pct": 19.8,
                "services": {
                    "Highways and Transport": {
                        "net_2026_27": 122_455_000,
                        "description": "Road maintenance, street lighting, winter gritting, transport planning"
                    },
                    "Environment and Regulatory": {
                        "net_2026_27": 97_270_000,
                        "description": "Waste disposal, trading standards, countryside, registrars"
                    },
                    "Growth, Environment and Planning": {
                        "net_2026_27": 14_773_000,
                        "description": "Economic development, LEP, planning, minerals & waste"
                    },
                    "Libraries, Museums and Culture": {
                        "net_2026_27": 14_181_000,
                        "description": "County library service, museums, archives"
                    },
                    "Community Fire and Rescue": {
                        "net_2026_27": 13_219_000,
                        "description": "Fire authority contribution (Lancashire Fire & Rescue)"
                    }
                }
            },
            "Resources": {
                "net_2026_27": 91_793_000,
                "net_2027_28": 102_614_000,
                "net_2028_29": 131_094_000,
                "share_of_total_pct": 6.9,
                "services": {
                    "Financial Services": {
                        "net_2026_27": 18_740_000,
                        "description": "Finance, audit, procurement, insurance"
                    },
                    "Legal and Governance": {
                        "net_2026_27": 9_284_000,
                        "description": "Legal services, democratic services, information governance"
                    },
                    "Human Resources": {
                        "net_2026_27": 7_193_000,
                        "description": "HR, occupational health, learning & development"
                    },
                    "Digital and Technology": {
                        "net_2026_27": 29_776_000,
                        "description": "ICT, Oracle Fusion, digital transformation"
                    },
                    "Property and Facilities": {
                        "net_2026_27": 26_800_000,
                        "description": "Estate management, facilities, capital programme"
                    }
                }
            },
            "Corporate": {
                "net_2026_27": 145_229_000,
                "net_2027_28": 165_280_000,
                "net_2028_29": 174_144_000,
                "share_of_total_pct": 11.0,
                "services": {
                    "Capital Financing": {
                        "net_2026_27": 57_819_000,
                        "description": "Minimum Revenue Provision, interest payments, investment income"
                    },
                    "Pensions and Retirement": {
                        "net_2026_27": 22_550_000,
                        "description": "Past service pension costs, strain on the fund"
                    },
                    "Contingency and Risk": {
                        "net_2026_27": 17_860_000,
                        "description": "General contingency, risk provision, savings delivery contingency"
                    },
                    "Levies and Precepts": {
                        "net_2026_27": 47_000_000,
                        "description": "Environment Agency, inshore fisheries, coroners, joint services"
                    }
                }
            }
        },

        # ─── Funding Sources ───────────────────────────────────────
        "funding": {
            "council_tax": {
                "amount": 719_554_000,
                "pct_of_total": 54.3,
                "notes": "Including ASC precept"
            },
            "revenue_support_grant": {
                "amount": 231_337_000,
                "pct_of_total": 17.5
            },
            "business_rates_retention": {
                "amount": 280_068_000,
                "pct_of_total": 21.1,
                "notes": "Retained business rates under 50% retention scheme"
            },
            "improved_better_care_fund": {
                "amount": 67_786_000,
                "pct_of_total": 5.1,
                "notes": "Ring-fenced for adult social care"
            },
            "collection_fund_surplus": {
                "amount": 3_000_000,
                "pct_of_total": 0.2
            },
            "other_grants": {
                "amount": 22_699_000,
                "pct_of_total": 1.7,
                "notes": "New Homes Bonus, services grant, other un-ringfenced grants"
            },
            "total": 1_324_444_000
        },

        # ─── Three-Year Projections ────────────────────────────────
        "three_year_projections": {
            "2026-27": {
                "net_budget": 1_324_444_000,
                "funding_gap": 0,
                "notes": "Balanced budget"
            },
            "2027-28": {
                "net_budget": 1_385_095_000,
                "funding_gap": 0,
                "notes": "Indicative balanced position (subject to spending review)"
            },
            "2028-29": {
                "net_budget": 1_473_747_000,
                "funding_gap": 0,
                "notes": "Indicative balanced position (significant uncertainty)"
            }
        },

        # ─── Budget Pressures ──────────────────────────────────────
        "pressures": {
            "inflation": {
                "total_2026_27": 39_493_000,
                "detail": {
                    "adults_social_care": {
                        "amount": 26_213_000,
                        "notes": "Care provider fee uplift (NLW increase, sleep-in ruling)"
                    },
                    "childrens_services": {
                        "amount": 4_541_000,
                        "notes": "Placement costs, residential care"
                    },
                    "waste_disposal": {
                        "amount": 3_047_000,
                        "notes": "Waste contract inflation (CPI-linked)"
                    },
                    "highways_maintenance": {
                        "amount": 1_349_000,
                        "notes": "Materials and contractor costs"
                    },
                    "home_to_school_transport": {
                        "amount": 2_500_000,
                        "notes": "SEND transport cost inflation"
                    },
                    "other": {
                        "amount": 1_843_000,
                        "notes": "Pay award provision, energy, general inflation"
                    }
                }
            },
            "demand": {
                "total_2026_27": 59_366_000,
                "detail": {
                    "adults_social_care": {
                        "amount": 14_068_000,
                        "notes": "Growing elderly population, complex needs"
                    },
                    "childrens_services": {
                        "amount": 24_097_000,
                        "notes": "Looked after children numbers, SEND placements"
                    },
                    "home_to_school_transport": {
                        "amount": 17_729_000,
                        "notes": "SEND transport demand (highest growth area)"
                    },
                    "other": {
                        "amount": 3_472_000,
                        "notes": "Highways deterioration, waste volumes"
                    }
                }
            },
            "total_pressures_2026_27": 98_859_000
        },

        # ─── Savings ───────────────────────────────────────────────
        "savings": {
            "reprofiled_from_feb_2025": {
                "amount": 40_283_000,
                "notes": "Savings originally planned in prior MTFS, re-profiled to 2026/27"
            },
            "additional_from_nov_2025": {
                "amount": 23_256_000,
                "notes": "Additional savings identified November 2025 budget review"
            },
            "total": 63_539_000,
            "savings_delivery_contingency": 5_000_000,
            "notes": "£5M contingency set aside for non-delivery risk. Historical delivery rate fell from 91.5% (2023/24) to 48% (2024/25)."
        },

        # ─── Reserves ─────────────────────────────────────────────
        "reserves": {
            "general_reserves": {
                "opening_2026_27": 23_484_000,
                "minimum_recommended": 23_484_000,
                "notes": "At minimum recommended level"
            },
            "transitional_reserve": {
                "balance": 99_397_000,
                "notes": "To support MTFS delivery and manage timing of savings"
            },
            "total_earmarked": {
                "balance": 306_000_000,
                "notes": "Approximate total earmarked reserves (excluding schools)"
            },
            "risk_assessment": "Reserves at or near minimum. Limited resilience if savings under-deliver or demand exceeds projections."
        },

        # ─── Key Risks ────────────────────────────────────────────
        "key_risks": [
            {
                "risk": "DSG deficit trajectory",
                "detail": "£73.08M Q3 overspend, trajectory: £95.5M (2024/25) → £171.4M (2025/26) → £296.5M (2026/27) → £419.9M (2028/29)",
                "severity": "critical",
                "mitigation": "Safety Valve negotiations with DfE"
            },
            {
                "risk": "VeLTIP portfolio losses",
                "detail": "~£350M paper loss on £519M invested in bond funds. Market recovery uncertain.",
                "severity": "high",
                "mitigation": "Investment strategy review, hold-to-maturity approach"
            },
            {
                "risk": "Adult social care demand",
                "detail": "£14M additional in 2026/27. Ageing population + complex needs driving accelerating growth.",
                "severity": "high",
                "mitigation": "Demand management, reablement, technology-enabled care"
            },
            {
                "risk": "Savings delivery",
                "detail": "Historical rate fell from 91.5% to 48%. £5M contingency set aside.",
                "severity": "high",
                "mitigation": "£5M contingency, enhanced programme management"
            },
            {
                "risk": "SEND transport costs",
                "detail": "£17.7M demand growth — fastest-growing pressure area in budget",
                "severity": "medium",
                "mitigation": "Route optimisation, independent travel training"
            },
            {
                "risk": "Local Government Reorganisation",
                "detail": "Government consultation launched 5 Feb 2026. Transition costs not budgeted.",
                "severity": "medium",
                "mitigation": "Transition reserve may be needed. LGR would make 2028/29 projections moot."
            }
        ],

        # ─── Historical Context ────────────────────────────────────
        "budget_history": {
            "2020-21": {"net_budget": 844_900_000, "ct_increase_pct": 3.99, "admin": "Conservative"},
            "2021-22": {"net_budget": 881_400_000, "ct_increase_pct": 3.99, "admin": "Conservative"},
            "2022-23": {"net_budget": 948_100_000, "ct_increase_pct": 3.99, "admin": "Conservative"},
            "2023-24": {"net_budget": 1_039_000_000, "ct_increase_pct": 3.99, "admin": "Conservative"},
            "2024-25": {"net_budget": 1_039_000_000, "ct_increase_pct": 4.99, "admin": "Conservative"},
            "2025-26": {"net_budget": 1_243_100_000, "ct_increase_pct": 4.99, "admin": "Conservative"},
            "2026-27": {"net_budget": 1_324_444_000, "ct_increase_pct": 3.80, "admin": "Reform UK"}
        },

        # ─── Metadata ─────────────────────────────────────────────
        "generated_by": "lcc_proposed_budget.py",
        "data_quality": "Manually structured from official Cabinet papers. Cross-verified against war-game analysis reports.",
        "last_updated": "2026-02-16"
    }

    return budget


def verify_budget(budget):
    """Cross-check internal consistency of budget data."""
    errors = []

    # Check directorate totals sum to net revenue budget
    dir_total = sum(d["net_2026_27"] for d in budget["directorates"].values())
    diff = abs(dir_total - budget["net_revenue_budget"])
    if diff > 1_000_000:  # Allow £1M rounding tolerance (sub-services may not sum exactly to directorate)
        errors.append(f"Directorate total £{dir_total:,.0f} differs from net budget £{budget['net_revenue_budget']:,.0f} by £{diff:,.0f}")

    # Check funding sources sum
    funding_total = budget["funding"]["total"]
    if funding_total != budget["net_revenue_budget"]:
        errors.append(f"Funding total £{funding_total:,.0f} ≠ net budget £{budget['net_revenue_budget']:,.0f}")

    # Check individual funding items sum to total
    funding_items_total = sum(
        v["amount"] for k, v in budget["funding"].items()
        if isinstance(v, dict) and "amount" in v
    )
    if abs(funding_items_total - funding_total) > 1_000:
        errors.append(f"Funding items sum £{funding_items_total:,.0f} ≠ funding total £{funding_total:,.0f}")

    # Check share_of_total_pct sums to ~100%
    pct_total = sum(d["share_of_total_pct"] for d in budget["directorates"].values())
    if abs(pct_total - 100.0) > 1.0:
        errors.append(f"Directorate share percentages sum to {pct_total:.1f}% (expected ~100%)")

    # Check 3-year projections are increasing
    projections = budget["three_year_projections"]
    years = sorted(projections.keys())
    for i in range(1, len(years)):
        prev = projections[years[i-1]]["net_budget"]
        curr = projections[years[i]]["net_budget"]
        if curr < prev:
            errors.append(f"Budget decreases from {years[i-1]} (£{prev:,.0f}) to {years[i]} (£{curr:,.0f})")

    # Verify services within each directorate
    for dir_name, dir_data in budget["directorates"].items():
        services = dir_data.get("services", {})
        svc_total = sum(s["net_2026_27"] for s in services.values())
        dir_budget = dir_data["net_2026_27"]
        diff = abs(svc_total - dir_budget)
        # Allow reasonable tolerance (sub-services may not perfectly sum)
        if diff > dir_budget * 0.05 and diff > 5_000_000:
            errors.append(f"{dir_name}: services sum £{svc_total:,.0f} vs directorate £{dir_budget:,.0f} (diff £{diff:,.0f})")

    return errors


def main():
    parser = argparse.ArgumentParser(
        description="Generate LCC 2026/27 proposed budget data"
    )
    parser.add_argument(
        "--verify", action="store_true",
        help="Run verification checks on the budget data"
    )
    parser.add_argument(
        "--output-dir",
        help="Override output directory"
    )

    args = parser.parse_args()

    print("=== LCC 2026/27 Proposed Budget Generator ===\n")

    budget = build_proposed_budget()

    # Verify
    errors = verify_budget(budget)
    if errors:
        print("⚠ Verification warnings:")
        for e in errors:
            print(f"  - {e}")
        if args.verify:
            print(f"\n{len(errors)} warning(s) found")
    else:
        print("✓ All verification checks passed")

    # Output
    output_dir = Path(args.output_dir) if args.output_dir else DATA_DIR
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "proposed_budget.json"

    with open(output_path, "w") as f:
        json.dump(budget, f, indent=2)

    size_kb = output_path.stat().st_size // 1024
    print(f"\n✓ Written: {output_path} ({size_kb}KB)")

    # Print summary
    print(f"\n=== Budget Summary ===")
    print(f"Net Revenue Budget 2026/27: £{budget['net_revenue_budget']:,.0f}")
    print(f"Council Tax Band D: £{budget['council_tax']['band_d']:,.2f} ({budget['council_tax']['increase_pct']}% increase)")
    print(f"\nDirectorates:")
    for name, data in budget["directorates"].items():
        print(f"  {name}: £{data['net_2026_27']:,.0f} ({data['share_of_total_pct']}%)")
    print(f"\nFunding:")
    for name, data in budget["funding"].items():
        if isinstance(data, dict) and "amount" in data:
            print(f"  {name}: £{data['amount']:,.0f} ({data['pct_of_total']}%)")
    print(f"\nPressures: £{budget['pressures']['total_pressures_2026_27']:,.0f}")
    print(f"Savings: £{budget['savings']['total']:,.0f}")
    print(f"\nKey Risks: {len(budget['key_risks'])}")
    for risk in budget["key_risks"]:
        print(f"  [{risk['severity'].upper()}] {risk['risk']}")


if __name__ == "__main__":
    main()
