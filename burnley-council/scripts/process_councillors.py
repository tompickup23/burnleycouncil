#!/usr/bin/env python3
"""
Process councillor data extracted from ModernGov.
Creates structured JSON for the Politics section.
"""

import json
import re
from pathlib import Path

OUTPUT_PATH = Path("/Users/tompickup/clawd/burnley-council/public/data")

# Raw data extracted from ModernGov page
RAW_COUNCILLORS = """
Councillor Shiraz Ahmed|31 Highfield Avenue, Burnley, BB10 2PS|07549 360474|shahmed@burnley.gov.uk||Independent|Burnley Independent Group|Lanehead
Councillor Aurangzeb Ali|Town Hall, Manchester Road, Burnley, BB11 9SA|07815 035356|aurangzebali@burnley.gov.uk||Independent|Burnley Independent Group|Queensgate
Councillor Afrasiab Anwar|C/O Burnley Borough Council, Town Hall, Manchester Rd, Burnley, BB11 9SA|07790 009552|aanwar@burnley.gov.uk|Leader of the Council; Leader Burnley Independents Group|Independent|Burnley Independent Group|Bank Hall
Councillor Lee Ashworth|c/o Burnley Town Hall, Manchester Road, Burnley, BB11 9SA|07791 086649|lashworth@burnley.gov.uk||Conservative|Conservative Group|Whittlefield with Ightenhill
Councillor Howard Baker|c/o Town Hall, Manchester Road, Burnley, BB11 9SA|07919 920910|hbaker@burnley.gov.uk|Executive Member for Community & Environmental Services; Leader Liberal Democrat Group|Liberal Democrats|Liberal Democrat Group|Coalclough with Deerplay
Councillor Gail Barton|9 Carlton Road, Burnley, BB11 4JE|07525 464840|gbarton@burnley.gov.uk||Labour|Labour Group|Rosegrove with Lowerhouse
Councillor Gordon Birtwistle|19 Glen View Road, Burnley, BB11 2QL|07836 364416|gbirtwistle@burnley.gov.uk||Liberal Democrats|Liberal Democrat Group|Coalclough with Deerplay
Councillor Helen Bridges|45 Printers Fold, Burnley, BB12 6PH|07875 517267|hbridges@burnley.gov.uk||Green Party|Green Group|Trinity
Councillor Charlie Briggs|96 Lowerhouse Lane, Rosegrove, Burnley, BB12 6JA|07816 510668|cbriggs@burnley.gov.uk||Liberal Democrats|Liberal Democrat Group|Gannow
Councillor Margaret Brindle|18 Rosehill Mount, Burnley, BB11 4HW|07891 938671|mbrindle@burnley.gov.uk||Labour|Labour Group|Rosehill with Burnley Wood
Councillor Joanne Broughton|c/o Burnley Town Hall, Manchester Road, Burnley, BB11 9SA||jbroughton@burnley.gov.uk||Conservative|Conservative Group|Hapton with Park
Councillor Ashley Brown|Town Hall, Manchester Road, Burnley, BB11 9SA|07429 384951|ashley.brown@burnley.gov.uk||Labour|Labour Group|Rosegrove with Lowerhouse
Councillor Saeed Chaudhary|47 Windermere Avenue, Burnley, BB10 2AB|07737 009910|schaudhary@burnley.gov.uk|Deputy Mayor|Independent|Burnley Independent Group|Daneshouse with Stoneyholme
Councillor Barbara Dole|154 Victoria Road, Padiham, Burnley, BB12 8TA|07732857815|bdole@burnley.gov.uk||Labour|Labour Group|Gawthorpe
Councillor Ivor Emo|5 Sunnyfield Avenue, Cliviger, BB10 4TE|07964 593175|iemo@burnley.gov.uk||Conservative|Conservative Group|Cliviger with Worsthorne
Councillor Sue Graham|90 Marsden Road, Burnley, BB10 2BL|07802 889058|sgraham@burnley.gov.uk||Labour|Labour Group|Lanehead
Councillor Gemma Haigh|Town Hall, Manchester Road, Burnley, BB11 9SA|07772819212|ghaigh@burnley.gov.uk||Labour & Co-operative Party|Labour Group|Gannow
Councillor Alex Hall|C/o Town Hall, Manchester Road, Burnley, BB11 9SA|07487 518863|ahall@burnley.gov.uk||Green Party|Green Group|Trinity
Councillor John Harbour|17 Town Hill Bank, Padiham, Burnley, BB12 8DH|01onal82 771132|jharbour@burnley.gov.uk||Labour|Labour Group|Gawthorpe
Councillor Bill Horrocks|18 Sussex Street, Burnley, BB11 3NQ|07929035297|bhorrocks@burnley.gov.uk||Labour|Labour Group|Rosehill with Burnley Wood
Councillor Alan Hosker|2 Bright Street, Padiham, Burnley, BB12 8RA|07724 223565|ahosker@burnley.gov.uk|Leader, Reform UK Group|Reform UK|Reform UK|Hapton with Park
Councillor Beki Hughes|c/o Burnley Town Hall, Manchester Road, Burnley, BB11 9SA|07761 070367|bhughes@burnley.gov.uk||Green Party|Green Group|Cliviger with Worsthorne
Councillor Martyn Hurt|c/o Burnley Town Hall, Manchester Road, Burnley, BB11 9SA|07387 683655|mhurt@burnley.gov.uk|Vice-Chair of Development Control Committee|Green Party|Green Group|Trinity
Councillor Shah Hussain|c/o Burnley Town Hall, Manchester Road, Burnley, BB11 9SA|07980 000941|smhussain@burnley.gov.uk||Independent|Burnley Independent Group|Daneshouse with Stoneyholme
Councillor Jacqueline Inckle|c/o Town Hall, Manchester Road, Burnley, BB11 9SA|07789 540 812|jinckle@burnley.gov.uk||Liberal Democrats|Liberal Democrat Group|Coalclough with Deerplay
Councillor Mohammed Ishtiaq|154 Casterton Avenue, Burnley, BB10 2PR|07738 607514|mishtiaq@burnley.gov.uk|Chair of Development Control Committee|Independent|Burnley Independent Group|Queensgate
Councillor Nussrat Kazmi|123 Barden Lane, BB10 1JF|07886675179|nkazmi@burnley.gov.uk|Vice-chair of Licensing Committee|Independent|Burnley Independent Group|Daneshouse with Stoneyholme
Councillor Anne Kelly|46 Halifax Road, Briercliffe, Burnley, BB10 3QN|07753 253040|annekelly@burnley.gov.uk|Chair of Licensing Committee|Liberal Democrats|Liberal Democrat Group|Briercliffe
Councillor Lubna Khan|c/o Burnley Town Hall, Manchester Road, Burnley, BB11 9SA|07486 390574|lkhan@burnley.gov.uk|Executive Member for Development & Growth|Independent|Burnley Independent Group|Bank Hall
Councillor Jack Launer|c/o Burnley Town Hall, Manchester Road, Burnley, BB11 9SA|07736897663|jlauner@burnley.gov.uk|Executive Member for Housing, Health & Culture; Leader Green Group|Green Party|Green Group|Cliviger with Worsthorne
Councillor Alun Lewis|16 Grasmere Avenue, Padiham, BB12 8PG|07942 389359|alewis@burnley.gov.uk||Labour|Labour Group|Gawthorpe
Councillor Gordon Lishman|42 Halifax Road, Briercliffe, Burnley, BB10 3QN|07778 271177|glishman@burnley.gov.uk||Liberal Democrats|Liberal Democrat Group|Briercliffe
Councillor Margaret Lishman|42 Halifax Road, Briercliffe, Burnley, BB10 3QN|07977 218622|mlishman@burnley.gov.uk|Deputy Leader and Executive Member for Resources and Performance Management|Liberal Democrats|Liberal Democrat Group|Briercliffe
Councillor Sehrish Lone|c/o Burnley Town Hall, Manchester Road, Burnley, BB11 9SA|07448 702406|slone@burnley.gov.uk||Independent|Burnley Independent Group|Bank Hall
Councillor Jamie McGowan|c/o Town Hall, Manchester Road, Burnley, BB11 9SA||jmcgowan@burnley.gov.uk|Leader Conservative Group, Chair of Scrutiny Committee|Conservative|Conservative Group|Hapton with Park
Councillor Neil Mottershead|12 Hambledon View, Burnley, BB12 6NY|07488 355190|nmottershead@burnley.gov.uk||Conservative|Conservative Group|Gannow
Councillor Musharaf Parvez|c/o Burnley Council, Town Hall, Manchester Road, Burnley, BB11 9SA|07557 111372|mparvez@burnley.gov.uk||Independent|Burnley Independent Group|Queensgate
Councillor Paul Reynolds|112A Westgate, Burnley, BB11 1SD|07926 470644|preynolds@burnley.gov.uk|Mayor|Labour|Labour Group|Rosegrove with Lowerhouse
Councillor Christine Sollis|216 Brownhill Avenue, Burnley, BB10 4QH|01282 459703|csollis@burnley.gov.uk|Vice-chair of Audit & Standards Committee|Independent|Burnley Independent Group|Brunshaw
Councillor Shaun Sproule|Town Hall, Manchester Road, Burnley, BB11 9SA|07887 953535|ssproule@burnley.gov.uk||Labour|Labour Group|Brunshaw
Councillor Mike Steel|418 Burnley Road, Cliviger, BB10 4SU|07912 886607|msteel@burnley.gov.uk|Vice-chair of Scrutiny Committee|Conservative|Conservative Group|Whittlefield with Ightenhill
Councillor Jeff Sumner|69 Rosehill Road, Burnley, BB11 2HJ|07787 005667|jsumner@burnley.gov.uk||Reform UK|Reform UK|Rosehill with Burnley Wood
Councillor Mark Townsend|c/o Burnley Town Hall, Burnley, BB11 9SA|07531 481917|mtownsend@burnley.gov.uk|Leader Labour Group|Labour & Co-operative Party|Labour Group|Brunshaw
Councillor Andy Waddington|c/o Burnley Town Hall, Manchester Road, Burnley, BB11 9SA|07930 394050|awaddington@burnley.gov.uk||Labour|Labour Group|Lanehead
Councillor Don Whitaker|12 Cartmel Drive, Burnley, BB12 8UX|07917 363528|dwhitaker@burnley.gov.uk|Chair of Audit and Standards Committee|Conservative|Conservative Group|Whittlefield with Ightenhill
"""

# Party colors (standard UK political colors)
PARTY_COLORS = {
    "Independent": "#808080",  # Grey
    "Burnley Independent Group": "#800080",  # Purple
    "Conservative": "#0087DC",  # Blue
    "Labour": "#DC241F",  # Red
    "Labour & Co-operative Party": "#DC241F",  # Red
    "Liberal Democrats": "#FAA61A",  # Orange/Yellow
    "Green Party": "#6AB023",  # Green
    "Reform UK": "#12B6CF",  # Teal
}

# Wards in Burnley
WARDS = [
    "Bank Hall",
    "Briercliffe",
    "Brunshaw",
    "Cliviger with Worsthorne",
    "Coalclough with Deerplay",
    "Daneshouse with Stoneyholme",
    "Gannow",
    "Gawthorpe",
    "Hapton with Park",
    "Lanehead",
    "Queensgate",
    "Rosehill with Burnley Wood",
    "Rosegrove with Lowerhouse",
    "Trinity",
    "Whittlefield with Ightenhill"
]

def parse_councillors():
    """Parse raw councillor data into structured format."""
    councillors = []

    for line in RAW_COUNCILLORS.strip().split('\n'):
        if not line.strip():
            continue

        parts = line.split('|')
        if len(parts) < 8:
            continue

        name_full = parts[0].replace('Councillor ', '').strip()
        address = parts[1].strip()
        phone = parts[2].strip()
        email = parts[3].strip()
        roles = parts[4].strip()
        party = parts[5].strip()
        group = parts[6].strip()
        ward = parts[7].strip()

        # Split name
        name_parts = name_full.split(' ', 1)
        first_name = name_parts[0]
        last_name = name_parts[1] if len(name_parts) > 1 else ''

        councillor = {
            "id": email.split('@')[0] if email else name_full.lower().replace(' ', '_'),
            "name": name_full,
            "first_name": first_name,
            "last_name": last_name,
            "address": address,
            "phone": phone,
            "email": email,
            "roles": [r.strip() for r in roles.split(';') if r.strip()] if roles else [],
            "party": party,
            "group": group,
            "ward": ward,
            "party_color": PARTY_COLORS.get(party, "#808080")
        }

        councillors.append(councillor)

    return councillors

def generate_summary(councillors):
    """Generate summary statistics."""
    # Count by party
    party_counts = {}
    for c in councillors:
        party = c['party']
        party_counts[party] = party_counts.get(party, 0) + 1

    # Count by group (coalition groupings)
    group_counts = {}
    for c in councillors:
        group = c['group']
        group_counts[group] = group_counts.get(group, 0) + 1

    # Count by ward
    ward_counts = {}
    for c in councillors:
        ward = c['ward']
        ward_counts[ward] = ward_counts.get(ward, 0) + 1

    # Coalition composition (BIG + LibDem + Green)
    coalition_groups = ['Burnley Independent Group', 'Liberal Democrat Group', 'Green Group']
    coalition_total = sum(group_counts.get(g, 0) for g in coalition_groups)

    # Opposition
    opposition_total = len(councillors) - coalition_total

    return {
        "total_councillors": len(councillors),
        "total_wards": len(WARDS),
        "councillors_per_ward": 3,
        "by_party": [
            {"party": k, "count": v, "color": PARTY_COLORS.get(k, "#808080")}
            for k, v in sorted(party_counts.items(), key=lambda x: -x[1])
        ],
        "by_group": [
            {"group": k, "count": v}
            for k, v in sorted(group_counts.items(), key=lambda x: -x[1])
        ],
        "coalition": {
            "name": "Ruling Coalition",
            "groups": coalition_groups,
            "total_seats": coalition_total,
            "majority": coalition_total > 22  # 23+ is majority of 45
        },
        "opposition_seats": opposition_total,
        "majority_threshold": 23,
        "council_leader": next((c['name'] for c in councillors if 'Leader of the Council' in c.get('roles', [])), None),
        "mayor": next((c['name'] for c in councillors if 'Mayor' in c.get('roles', [])), None),
        "deputy_mayor": next((c['name'] for c in councillors if 'Deputy Mayor' in c.get('roles', [])), None)
    }

def generate_ward_data(councillors):
    """Generate ward-level data."""
    wards = {}

    for ward_name in WARDS:
        ward_councillors = [c for c in councillors if c['ward'] == ward_name]
        parties = list(set(c['party'] for c in ward_councillors))

        wards[ward_name] = {
            "name": ward_name,
            "councillors": [c['name'] for c in ward_councillors],
            "councillor_ids": [c['id'] for c in ward_councillors],
            "parties": parties,
            "primary_party": max(set(c['party'] for c in ward_councillors),
                                key=lambda p: sum(1 for c in ward_councillors if c['party'] == p)) if ward_councillors else None,
            "color": ward_councillors[0]['party_color'] if ward_councillors else "#808080"
        }

    return wards

def main():
    print("=" * 60)
    print("Processing Councillor Data")
    print("=" * 60)

    OUTPUT_PATH.mkdir(parents=True, exist_ok=True)

    councillors = parse_councillors()
    print(f"Parsed {len(councillors)} councillors")

    summary = generate_summary(councillors)
    print(f"\nParty breakdown:")
    for p in summary['by_party']:
        print(f"  {p['party']}: {p['count']} seats")

    print(f"\nCoalition: {summary['coalition']['total_seats']} seats")
    print(f"Opposition: {summary['opposition_seats']} seats")
    print(f"Majority threshold: {summary['majority_threshold']}")

    wards = generate_ward_data(councillors)

    # Save files
    with open(OUTPUT_PATH / "councillors.json", 'w') as f:
        json.dump(councillors, f, indent=2)
    print(f"\nSaved councillors.json")

    with open(OUTPUT_PATH / "politics_summary.json", 'w') as f:
        json.dump(summary, f, indent=2)
    print(f"Saved politics_summary.json")

    with open(OUTPUT_PATH / "wards.json", 'w') as f:
        json.dump(wards, f, indent=2)
    print(f"Saved wards.json")

    print("\nDone!")

if __name__ == "__main__":
    main()
