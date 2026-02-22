#!/usr/bin/env python3
"""
enrich_voting.py — Add manually researched recorded votes to voting.json.

These votes were researched from LCC Full Council meeting minutes on ModernGov.
The mgListRecordedVotes.aspx page shows no votes for the Reform era, but the
minutes contain full recorded divisions with named councillor votes.

Usage:
    python3 enrich_voting.py
"""

import json
import re
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / 'data' / 'lancashire_cc'

# ── Load councillors for name matching ──────────────────────────────
with open(DATA_DIR / 'councillors.json') as f:
    COUNCILLORS = json.load(f)

# Build surname → full name mapping
SURNAME_MAP = {}
for c in COUNCILLORS:
    raw = c.get('name', '')
    clean = re.sub(
        r'^(County\s+)?Councillor\s+(Mr|Mrs|Ms|Miss|Dr|Prof|Cllr|Sir|Dame|Lord|Lady|Reverend|Rev|JP)?\s*',
        '', raw, flags=re.I
    ).strip()
    # Remove trailing suffixes like OBE, MBE, JP
    base = re.sub(r'\s+(OBE|MBE|JP|CBE|KBE)$', '', clean, flags=re.I).strip()
    parts = base.split()
    if parts:
        surname = parts[-1]
        # Handle duplicate surnames with first initial
        key = surname.lower()
        if key in SURNAME_MAP:
            # Disambiguate: store with first initial
            existing = SURNAME_MAP.pop(key)
            ex_parts = existing['clean'].split()
            SURNAME_MAP[f"{key}_{ex_parts[0][0].lower()}"] = existing
            SURNAME_MAP[f"{key}_{parts[0][0].lower()}"] = {
                'raw': raw, 'clean': clean, 'party': c.get('party', 'Unknown')
            }
        else:
            SURNAME_MAP[key] = {
                'raw': raw, 'clean': clean, 'party': c.get('party', 'Unknown')
            }

# Manual overrides for tricky names
NAME_OVERRIDES = {
    'Atkinson M': 'County Councillor Mrs Marion Atkinson',
    'Atkinson S': 'County Councillor Stephen Atkinson',
    'Jones A': 'County Councillor Alice Jones',
    'Jones M': 'County Councillor Maria Jones',
    'Owens': 'County Councillor Adrian Owens',
    'Singleton': 'County Councillor John R Singleton JP',
    'Iqbal': 'County Councillor Mohammed Iqbal MBE',
    'Crawford': 'County Councillor James Crawford',
    'Schofield': 'County Councillor Jan Schofield',
}


def resolve_name(short_name):
    """Resolve a short name (surname or 'Surname X') to full councillor name."""
    if short_name in NAME_OVERRIDES:
        return NAME_OVERRIDES[short_name]

    # Check if it's "Surname Initial" format
    parts = short_name.strip().split()
    if len(parts) == 2 and len(parts[1]) == 1:
        key = f"{parts[0].lower()}_{parts[1].lower()}"
        if key in SURNAME_MAP:
            return SURNAME_MAP[key]['raw']

    # Simple surname lookup
    key = short_name.strip().lower()
    if key in SURNAME_MAP:
        return SURNAME_MAP[key]['raw']

    # Try partial match
    for c in COUNCILLORS:
        if short_name.lower() in c.get('name', '').lower():
            return c['name']

    print(f"  WARNING: Could not resolve '{short_name}'")
    return short_name


def build_vote_list(names_str, vote_type):
    """Build list of {name, uid, vote} from comma-separated short names."""
    names = [n.strip() for n in names_str.split(',') if n.strip()]
    result = []
    for name in names:
        full_name = resolve_name(name)
        # Find UID
        uid = ''
        for c in COUNCILLORS:
            if c['name'] == full_name:
                uid = c.get('moderngov_uid', '')
                break
        result.append({'name': full_name, 'uid': uid, 'vote': vote_type})
    return result


def compute_votes_by_party(votes_by_councillor):
    """Compute party vote breakdown from individual votes."""
    name_to_party = {}
    for c in COUNCILLORS:
        name_to_party[c['name']] = c.get('party', 'Unknown')

    by_party = {}
    for v in votes_by_councillor:
        party = name_to_party.get(v['name'], 'Unknown')
        if party not in by_party:
            by_party[party] = {'for': 0, 'against': 0, 'abstain': 0, 'absent': 0}
        if v['vote'] in by_party[party]:
            by_party[party][v['vote']] += 1

    return by_party


# ── Define all new recorded votes ──────────────────────────────────

NEW_VOTES = []

# === 17 July 2025: Flags Policy Amendment (RECORDED VOTE) ===
flags_for = "Ali,Arif,Asghar,Ashton,Barnes,Brown,Buckley,Clempson,Clifford,de Freitas,Dowding,Duke,Hartley,Howarth,Jewell,Johnson,Kamran,Lavalette,Mills,Potter,Razakazi,Rigby,Riggott,Snape,Snow,Stubbins,Whipp"
flags_against = "Alderson,Ash,Atkinson M,Atkinson S,Austin,Balchin,Blake,Clemson,Close,Cottam,Crimmins,Dalton,Duxbury,Dwyer,Edwards,Evans,Fox,Goldsworthy,Graham,Gummer,Hargreaves,Hutchinson,Jones A,Jones M,Joynes,Kniveton,Kutavicius,Lord,Matchett,McCollum,Mirfin,More,Moore,Owens,Parker,Parkinson,Pickup,Poulton,Ritson,Roberts,Salter,Shaw,Sutton,Swales,Tetlow,Thomson,Tomlinson,Topp,Wade,Walsh,Whalley,Worthington"

flags_vbc = build_vote_list(flags_for, 'for') + build_vote_list(flags_against, 'against')
NEW_VOTES.append({
    'id': '2025-07-17-flags-policy-amendment',
    'meeting': 'Full Council, Thursday, 17th July, 2025',
    'meeting_date': '2025-07-17',
    'title': 'Flags Policy — Amendment to Refer to Scrutiny',
    'type': 'motion',
    'is_amendment': True,
    'amendment_by': 'Progressive Lancashire',
    'description': 'Amendment by CC Azhar Ali (Progressive Lancashire) to refer the flag policy review to the Community, Cultural, and Corporate Services Scrutiny Committee instead of Cabinet. The substantive motion proposed that only the Union Flag, Flag of England, Lancashire Flag, royal flags, and military flags should be flown on council property.',
    'policy_area': ['governance_constitution'],
    'significance': 'high',
    'council_tax_change': None,
    'proposer': 'CC Azhar Ali OBE (Progressive Lancashire)',
    'seconder': 'CC Hamish Mills (Green)',
    'key_facts': [
        'Amendment sought to refer flag policy to scrutiny rather than Cabinet decision',
        'Substantive motion effectively bans pride flags and political/campaign flags from council buildings',
        '52-27 demonstrates strength of Reform majority — only OWL\'s Adrian Owens voted with Reform',
        'All Conservative, Labour, Lib Dem, Green and Independent (except Owens) voted for the amendment',
    ],
    'quotes': [],
    'minutes_url': 'https://council.lancashire.gov.uk/ieListDocuments.aspx?CId=138&MId=15359',
    'outcome': 'rejected',
    'for_count': 27,
    'against_count': 52,
    'abstain_count': 0,
    'absent_count': 5,
    'votes_by_councillor': flags_vbc,
    'votes_by_party': compute_votes_by_party(flags_vbc),
})

# === 16 October 2025: Members' Allowance Freeze (RECORDED VOTE) ===
# 75 for, 0 against, 2 abstain (Duke, Howarth)
# Near-unanimous — build from all councillors minus absent/abstain
allowance_abstain = build_vote_list("Duke,Howarth", 'abstain')
# Everyone else present voted for — 75 for out of 84 total, minus 2 abstain = 7 absent
absent_allowance = "Crawford,Iqbal,Motala,Schofield,Singleton,Parkinson,Kamran"
allowance_absent = build_vote_list(absent_allowance, 'absent')
allowance_for_names = [c['name'] for c in COUNCILLORS
                       if c['name'] not in [v['name'] for v in allowance_abstain + allowance_absent]]
allowance_for = [{'name': n, 'uid': next((c.get('moderngov_uid','') for c in COUNCILLORS if c['name']==n), ''), 'vote': 'for'} for n in allowance_for_names]
allowance_vbc = allowance_for + allowance_abstain + allowance_absent

NEW_VOTES.append({
    'id': '2025-10-16-members-allowance-freeze',
    'meeting': 'Full Council, Thursday, 16th October, 2025',
    'meeting_date': '2025-10-16',
    'title': "Members' Allowance Scheme 2025/26 — Freeze at 2024/25 Levels",
    'type': 'budget',
    'is_amendment': False,
    'amendment_by': None,
    'description': 'Motion to freeze basic allowance, Special Responsibility Allowances, and Chair/Vice-Chair allowances at 2024/25 levels. Near-unanimous cross-party support demonstrated fiscal restraint. Only CC Duke and CC Howarth (both Lib Dem) abstained.',
    'policy_area': ['budget_finance', 'governance_constitution'],
    'significance': 'medium',
    'council_tax_change': None,
    'proposer': 'CC Ged Mirfin (Reform UK)',
    'seconder': 'CC Russell Walsh (Reform UK)',
    'key_facts': [
        'All councillor allowances frozen at 2024/25 levels',
        'Near-unanimous 75-0-2 vote — cross-party support for fiscal restraint',
        'Only 2 Lib Dem abstentions (Duke, Howarth)',
        'Reform demonstrating lead-by-example on public spending',
    ],
    'quotes': [],
    'minutes_url': 'https://council.lancashire.gov.uk/ieListDocuments.aspx?CId=138&MId=15384',
    'outcome': 'carried',
    'for_count': 75,
    'against_count': 0,
    'abstain_count': 2,
    'absent_count': 7,
    'votes_by_councillor': allowance_vbc,
    'votes_by_party': compute_votes_by_party(allowance_vbc),
})

# === 16 October 2025: Fracking/Shale Gas Amendment (RECORDED VOTE) ===
frack_for = "Alderson,Ash,Atkinson M,Atkinson S,Austin,Balchin,Blake,Clemson,Close,Cottam,Crimmins,Dalton,Duxbury,Dwyer,Edwards,Evans,Fox,Goldsworthy,Graham,Gummer,Hargreaves,Hutchinson,Jones A,Jones M,Joynes,Kniveton,Kutavicius,Lord,Matchett,McCollum,Mirfin,More,Moore,Parker,Pickup,Poulton,Ritson,Roberts,Salter,Shaw,Sutton,Swales,Tetlow,Thomson,Tomlinson,Topp,Wade,Walsh,Whalley,Worthington"
frack_against = "Ali,Arif,Asghar,Ashton,Barnes,Buckley,Clempson,Clifford,de Freitas,Dowding,Howarth,Johnson,Kamran,Lavalette,Mills,Owens,Razakazi,Rigby,Riggott,Singleton,Snape,Snow,Stubbins,Whipp"

frack_vbc = build_vote_list(frack_for, 'for') + build_vote_list(frack_against, 'against')
NEW_VOTES.append({
    'id': '2025-10-16-fracking-shale-gas-amendment',
    'meeting': 'Full Council, Thursday, 16th October, 2025',
    'meeting_date': '2025-10-16',
    'title': 'Fracking/Shale Gas — Reform Amendment (Moratorium + Review vs Permanent Ban)',
    'type': 'motion',
    'is_amendment': True,
    'amendment_by': 'Reform',
    'description': "Reform amendment to Labour/Green motion on fracking. Original motion called for LCC to write to government requesting a permanent national ban on fracking. Reform's amendment replaced 'permanent ban' with 'continuation of the moratorium while commissioning a full, independent review of domestic energy sources, including shale gas, renewables, and nuclear'. Conservative CC Riggott voted against the Reform amendment alongside the opposition.",
    'policy_area': ['environment_climate', 'devolution_lgr'],
    'significance': 'high',
    'council_tax_change': None,
    'proposer': 'CC Joel Tetlow (Reform UK)',
    'seconder': 'CC Tom Pickup (Reform UK)',
    'key_facts': [
        'Original Labour/Green motion sought permanent national fracking ban',
        "Reform amendment replaced 'permanent ban' with 'evidence-based review of all energy sources'",
        'CC Aidy Riggott (Conservative) voted against the Reform amendment — siding with opposition',
        'Reflects Reform national position on keeping energy options open despite local opposition to fracking',
    ],
    'quotes': [],
    'minutes_url': 'https://council.lancashire.gov.uk/ieListDocuments.aspx?CId=138&MId=15384',
    'outcome': 'carried',
    'for_count': 50,
    'against_count': 24,
    'abstain_count': 0,
    'absent_count': 10,
    'votes_by_councillor': frack_vbc,
    'votes_by_party': compute_votes_by_party(frack_vbc),
})

# === 20 November 2025: LGR Two-Unitary Proposal (RECORDED VOTE — MAJOR) ===
lgr_for = "Alderson,Ash,Atkinson S,Austin,Balchin,Blake,Clemson,Close,Cottam,Crimmins,Dalton,Duxbury,Dwyer,Edwards,Evans,Fox,Graham,Gummer,Hargreaves,Hutchinson,Jones A,Jones M,Joynes,Kniveton,Kutavicius,Lord,Matchett,Mirfin,Moore,More,Parker,Poulton,Ritson,Roberts,Salter,Schofield,Shaw,Sutton,Tetlow,Thomson,Tomlinson,Wade,Walsh,Whalley,Worthington"
lgr_against = "Ali,Arif,Ashton,Barnes,Brown,Buckley,Clempson,Clifford,de Freitas,Dowding,Duke,Hartley,Howarth,Iqbal,Jewell,Johnson,Kamran,Lavalette,Mills,Owens,Potter,Razakazi,Rigby,Riggott,Singleton,Snape,Snow,Stubbins,Whipp"

lgr_vbc = build_vote_list(lgr_for, 'for') + build_vote_list(lgr_against, 'against')
NEW_VOTES.append({
    'id': '2025-11-20-lgr-two-unitary-proposal',
    'meeting': 'Full Council, Thursday, 20th November, 2025',
    'meeting_date': '2025-11-20',
    'title': 'Local Government Reorganisation — Two-Unitary Proposal',
    'type': 'motion',
    'is_amendment': False,
    'amendment_by': None,
    'description': "The defining strategic vote of the Reform administration. Endorsed splitting Lancashire into two unitary councils, replacing the current three-tier structure. CC Azhar Ali's friendly amendment requesting shadow elections not before May 2028 was accepted. All opposition groups plus Conservatives voted against. CC Riggott (Conservative, Chorley) voted against despite his party's national support for unitarisation.",
    'policy_area': ['devolution_lgr', 'governance_constitution', 'budget_finance'],
    'significance': 'high',
    'council_tax_change': None,
    'proposer': 'CC Stephen Atkinson (Reform UK, Leader)',
    'seconder': None,
    'key_facts': [
        'Endorsed the two-unitary proposal for Lancashire — the key structural reform',
        "CC Azhar Ali's friendly amendment (shadow elections not before May 2028) was accepted",
        '45-29 split: Reform voted as bloc, all other parties voted against',
        'CC Riggott (Conservative) voted against despite national Conservative support for LGR',
        'This vote directly shapes the future governance of Lancashire',
    ],
    'quotes': [],
    'minutes_url': 'https://council.lancashire.gov.uk/ieListDocuments.aspx?CId=138&MId=15468',
    'outcome': 'carried',
    'for_count': 45,
    'against_count': 29,
    'abstain_count': 0,
    'absent_count': 10,
    'votes_by_councillor': lgr_vbc,
    'votes_by_party': compute_votes_by_party(lgr_vbc),
})

# === 20 November 2025: Northern Powerhouse Rail (RECORDED VOTE) ===
npr_for = "Ali,Arif,Ashton,Barnes,Brown,Buckley,Clempson,Clifford,de Freitas,Dowding,Duke,Hartley,Howarth,Jewell,Johnson,Kamran,Lavalette,Mills,Owens,Potter,Razakazi,Rigby,Riggott,Singleton,Snape,Snow,Stubbins,Whipp"
npr_against = "Alderson,Ash,Atkinson M,Atkinson S,Austin,Balchin,Blake,Clemson,Close,Cottam,Crimmins,Dalton,Duxbury,Dwyer,Edwards,Evans,Fox,Goldsworthy,Graham,Gummer,Hargreaves,Hutchinson,Jones A,Jones M,Joynes,Kniveton,Kutavicius,Lord,Matchett,McCollum,Mirfin,More,Moore,Parker,Poulton,Ritson,Roberts,Salter,Sutton,Swales,Tetlow,Thomson,Tomlinson,Walsh"

npr_vbc = build_vote_list(npr_for, 'for') + build_vote_list(npr_against, 'against')
NEW_VOTES.append({
    'id': '2025-11-20-northern-powerhouse-rail',
    'meeting': 'Full Council, Thursday, 20th November, 2025',
    'meeting_date': '2025-11-20',
    'title': 'Northern Powerhouse Rail — Motion to Condemn Scrapping',
    'type': 'motion',
    'is_amendment': False,
    'amendment_by': None,
    'description': "Cross-party opposition motion (Progressive Lancashire + Conservative) condemning any attempt to scrap Northern Powerhouse Rail. Originally named Richard Tice MP directly, softened by friendly amendment from CC Lavalette to condemn 'any attempt'. Reform voted as a bloc against, refusing to criticise their national party's position on scrapping NPR — despite the motion also calling for specific Lancashire rail investments (Poulton-Fleetwood, Colne-Skipton, Skelmersdale, Coppull, Hyndburn freight).",
    'policy_area': ['transport_highways', 'devolution_lgr'],
    'significance': 'high',
    'council_tax_change': None,
    'proposer': 'CC Azhar Ali OBE (Progressive Lancashire)',
    'seconder': 'CC Aidy Riggott (Conservative)',
    'key_facts': [
        'All opposition groups including Conservatives voted FOR the motion',
        'Reform voted as a bloc AGAINST — refusing to condemn national party position',
        'Motion also called for specific rail investments: Poulton-Fleetwood, Colne-Skipton, Skelmersdale, Coppull, Hyndburn freight',
        'Directly pitted Reform councillors against their own constituents\' transport interests',
        'CC Lavalette (Labour) softened wording from naming Tice to "any attempt to scrap"',
    ],
    'quotes': [],
    'minutes_url': 'https://council.lancashire.gov.uk/ieListDocuments.aspx?CId=138&MId=15468',
    'outcome': 'rejected',
    'for_count': 28,
    'against_count': 44,
    'abstain_count': 0,
    'absent_count': 12,
    'votes_by_councillor': npr_vbc,
    'votes_by_party': compute_votes_by_party(npr_vbc),
})

# === 20 November 2025: Civic Pride / National Anthem (RECORDED VOTE) ===
civic_abstain_names = "Duke,Howarth,Jewell,Lavalette,Mills,Potter,Razakazi,Whipp"
civic_abstain = build_vote_list(civic_abstain_names, 'abstain')
# 63 for, 0 against, 8 abstain = 71 present, 13 absent
absent_civic_names = "Asghar,Arif,Brown,Crawford,Iqbal,Kamran,Motala,Parkinson,Schofield,Singleton,Snape,Snow,Topp"
civic_absent = build_vote_list(absent_civic_names, 'absent')
civic_for_names = [c['name'] for c in COUNCILLORS
                   if c['name'] not in [v['name'] for v in civic_abstain + civic_absent]]
civic_for = [{'name': n, 'uid': next((c.get('moderngov_uid','') for c in COUNCILLORS if c['name']==n), ''), 'vote': 'for'} for n in civic_for_names]
civic_vbc = civic_for + civic_abstain + civic_absent

NEW_VOTES.append({
    'id': '2025-11-20-civic-pride-national-anthem',
    'meeting': 'Full Council, Thursday, 20th November, 2025',
    'meeting_date': '2025-11-20',
    'title': 'Civic Pride — National Anthem at Full Council Meetings',
    'type': 'motion',
    'is_amendment': False,
    'amendment_by': None,
    'description': "Reform motion to play the National Anthem at the start of each Full Council meeting, establish a Civic Pride Action Plan with annual Pride of Lancashire Awards, and promote heritage. CC Lavalette's amendment (changing heritage wording to 'celebrating local cultural diversity' and requesting budget allocation) was defeated. 63-0-8 shows even opposition didn't vote against civic pride, though 8 Lib Dem/Labour/Green councillors abstained.",
    'policy_area': ['governance_constitution'],
    'significance': 'medium',
    'council_tax_change': None,
    'proposer': 'CC Ella Worthington (Reform UK)',
    'seconder': 'CC Maria Jones (Reform UK)',
    'key_facts': [
        'National Anthem to be played at start of each Full Council meeting',
        'Annual Pride of Lancashire Awards to be established',
        '63-0-8 — no one voted against, 8 abstentions from Lib Dem/Labour/Green',
        'Labour amendment to add cultural diversity wording and budget was defeated',
        'Highly symbolic Reform-aligned cultural change',
    ],
    'quotes': [],
    'minutes_url': 'https://council.lancashire.gov.uk/ieListDocuments.aspx?CId=138&MId=15468',
    'outcome': 'carried',
    'for_count': 63,
    'against_count': 0,
    'abstain_count': 8,
    'absent_count': 13,
    'votes_by_councillor': civic_vbc,
    'votes_by_party': compute_votes_by_party(civic_vbc),
})

# === 20 November 2025: Cancellation of Local Elections (RECORDED VOTE) ===
elections_abstain_names = "Brown,Clifford,Snape,Snow"
elections_abstain = build_vote_list(elections_abstain_names, 'abstain')
# 63 for, 0 against, 4 abstain = 67 present, 17 absent
absent_elections_names = "Arif,Asghar,Crawford,Iqbal,Kamran,Motala,Parkinson,Schofield,Singleton,Topp,Atkinson M,Goldsworthy,Kutavicius,McCollum,Pickup,Tomlinson,Wade"
elections_absent = build_vote_list(absent_elections_names, 'absent')
elections_for_names = [c['name'] for c in COUNCILLORS
                       if c['name'] not in [v['name'] for v in elections_abstain + elections_absent]]
elections_for = [{'name': n, 'uid': next((c.get('moderngov_uid','') for c in COUNCILLORS if c['name']==n), ''), 'vote': 'for'} for n in elections_for_names]
elections_vbc = elections_for + elections_abstain + elections_absent

NEW_VOTES.append({
    'id': '2025-11-20-cancellation-local-elections',
    'meeting': 'Full Council, Thursday, 20th November, 2025',
    'meeting_date': '2025-11-20',
    'title': 'Cancellation of Local Elections — Motion Against',
    'type': 'motion',
    'is_amendment': False,
    'amendment_by': None,
    'description': "Cross-party motion against the potential cancellation of local elections linked to LGR. Chief Executive to write to Secretary of State seeking assurance that local elections won't be cancelled, requesting repeal of s.87 Local Government Act 2000. Near-unanimous 63-0-4 — only 4 Labour/Chorley councillors abstained.",
    'policy_area': ['governance_constitution', 'devolution_lgr'],
    'significance': 'medium',
    'council_tax_change': None,
    'proposer': 'CC Tom Lord (Reform UK)',
    'seconder': 'CC Luke Parker (Reform UK)',
    'key_facts': [
        'Near-unanimous cross-party support against potential election cancellation',
        'Chief Executive to write to Secretary of State requesting repeal of s.87 LGA 2000',
        'Letter shared with all Lancashire MPs and Council Leaders',
        'Only 4 Labour/Chorley councillors abstained (Brown, Clifford, Snape, Snow)',
        'Demonstrates cross-party consensus on democratic principles',
    ],
    'quotes': [],
    'minutes_url': 'https://council.lancashire.gov.uk/ieListDocuments.aspx?CId=138&MId=15468',
    'outcome': 'carried',
    'for_count': 63,
    'against_count': 0,
    'abstain_count': 4,
    'absent_count': 17,
    'votes_by_councillor': elections_vbc,
    'votes_by_party': compute_votes_by_party(elections_vbc),
})

# ── Also add key non-recorded votes as lower-detail entries ─────────

NON_RECORDED_VOTES = [
    {
        'id': '2025-05-22-election-of-leader',
        'meeting': 'Annual General Meeting, Thursday, 22nd May, 2025',
        'meeting_date': '2025-05-22',
        'title': 'Election of Leader of the County Council — Stephen Atkinson',
        'type': 'election',
        'is_amendment': False,
        'amendment_by': None,
        'description': 'CC Stephen Atkinson elected Leader of LCC — no other nominations. Proposed by CC Ged Mirfin, seconded by CC Matthew Salter. First Reform UK council leader in England. Cabinet announced immediately after.',
        'policy_area': ['governance_constitution'],
        'significance': 'high',
        'council_tax_change': None,
        'proposer': 'CC Ged Mirfin (Reform UK)',
        'seconder': 'CC Matthew Salter (Reform UK)',
        'key_facts': [
            'First Reform UK council leader in England',
            'No other nominations — elected unopposed',
            '9-member Cabinet announced: Evans (Deputy/Children), Mirfin (Resources), Dalton (ASC), Matchett (Health), Salter (Education), Moore (Growth), Goldsworthy (Highways), Roberts (Rural), Dwyer (Data/Tech)',
        ],
        'quotes': [],
        'minutes_url': 'https://council.lancashire.gov.uk/ieListDocuments.aspx?CId=138&MId=13657',
        'outcome': 'carried',
        'for_count': None,
        'against_count': None,
        'abstain_count': None,
        'absent_count': None,
        'votes_by_councillor': [],
        'votes_by_party': {},
    },
    {
        'id': '2025-07-17-disestablish-scrutiny-management-board',
        'meeting': 'Full Council, Thursday, 17th July, 2025',
        'meeting_date': '2025-07-17',
        'title': 'Disestablish Scrutiny Management Board — Create Budget & Finance Scrutiny Committee',
        'type': 'motion',
        'is_amendment': False,
        'amendment_by': None,
        'description': 'Major governance restructuring: disestablished the Scrutiny Management Board and established a new Budget and Finance Scrutiny Committee. Proposed by CC Ged Mirfin following recommendations from the Political Governance Working Group.',
        'policy_area': ['governance_constitution', 'budget_finance'],
        'significance': 'high',
        'council_tax_change': None,
        'proposer': 'CC Ged Mirfin (Reform UK)',
        'seconder': None,
        'key_facts': [
            'Scrapped Scrutiny Management Board — replaced with dedicated Budget & Finance Scrutiny Committee',
            'Amended multiple sections of the LCC Constitution (Sections 3, 5, 6, 8, 10B, 10E)',
            'Reform-driven governance restructuring to strengthen budget oversight',
            'CC David Shaw and CC Andy Blake appointed Chair and Deputy Chair of new committee',
        ],
        'quotes': [],
        'minutes_url': 'https://council.lancashire.gov.uk/ieListDocuments.aspx?CId=138&MId=15359',
        'outcome': 'carried',
        'for_count': None,
        'against_count': None,
        'abstain_count': None,
        'absent_count': None,
        'votes_by_councillor': [],
        'votes_by_party': {},
    },
    {
        'id': '2025-07-17-vawg-motion',
        'meeting': 'Full Council, Thursday, 17th July, 2025',
        'meeting_date': '2025-07-17',
        'title': 'Violence Against Women and Girls — Member Champion',
        'type': 'motion',
        'is_amendment': False,
        'amendment_by': None,
        'description': "Green motion (CC Samara Barnes / CC Gina Dowding) on VAWG. Reform's CC Maria Jones proposed a friendly amendment broadening the definition to include coercive control, psychological, financial, cultural and post-separation abuse. Passed with cross-party support.",
        'policy_area': ['community_safety', 'equalities_diversity'],
        'significance': 'medium',
        'council_tax_change': None,
        'proposer': 'CC Samara Barnes (Green Party)',
        'seconder': 'CC Gina Dowding (Green Party)',
        'key_facts': [
            "Reform's friendly amendment broadened VAWG definition significantly",
            'Council resolved to appoint a member champion for combatting VAWG',
            'Cross-party cooperation: Green motion, Reform amendment, universal support',
        ],
        'quotes': [],
        'minutes_url': 'https://council.lancashire.gov.uk/ieListDocuments.aspx?CId=138&MId=15359',
        'outcome': 'carried',
        'for_count': None,
        'against_count': None,
        'abstain_count': None,
        'absent_count': None,
        'votes_by_councillor': [],
        'votes_by_party': {},
    },
    {
        'id': '2025-07-17-free-speech-motion',
        'meeting': 'Full Council, Thursday, 17th July, 2025',
        'meeting_date': '2025-07-17',
        'title': 'Free Speech — Culture of Open Debate',
        'type': 'motion',
        'is_amendment': False,
        'amendment_by': None,
        'description': "Reform motion (CC Simon Evans / CC Daniel Matchett) to foster a culture of freedom of speech. CC Azhar Ali (PL) proposed friendly amendment adding Nolan Principles and 'without inciting hatred and division'. Passed with cross-party support. Referenced Baroness Casey's audit on group-based child sexual exploitation.",
        'policy_area': ['governance_constitution'],
        'significance': 'medium',
        'council_tax_change': None,
        'proposer': 'CC Simon Evans (Reform UK, Deputy Leader)',
        'seconder': 'CC Daniel Matchett (Reform UK, Cabinet)',
        'key_facts': [
            "Reform-PL cross-party cooperation: Ali's amendment accepted as friendly",
            'Chief Executive to ensure compliance in all policy reviews',
            "Referenced Baroness Casey's audit on group-based CSE",
            'Nolan Principles added at PL request',
        ],
        'quotes': [],
        'minutes_url': 'https://council.lancashire.gov.uk/ieListDocuments.aspx?CId=138&MId=15359',
        'outcome': 'carried',
        'for_count': None,
        'against_count': None,
        'abstain_count': None,
        'absent_count': None,
        'votes_by_councillor': [],
        'votes_by_party': {},
    },
    {
        'id': '2025-07-17-proportional-representation',
        'meeting': 'Full Council, Thursday, 17th July, 2025',
        'meeting_date': '2025-07-17',
        'title': 'Replace First Past the Post with Proportional Representation',
        'type': 'motion',
        'is_amendment': False,
        'amendment_by': None,
        'description': "Green/Lib Dem motion (CC Gina Dowding / CC Almas Razakazi) to advocate replacing FPTP with PR. Lib Dem amendment (CC David Whipp) to add AV for mayoral elections and STV for multi-member wards was defeated. Substantive motion also defeated.",
        'policy_area': ['governance_constitution'],
        'significance': 'low',
        'council_tax_change': None,
        'proposer': 'CC Gina Dowding (Green Party)',
        'seconder': 'CC Almas Razakazi (Independent)',
        'key_facts': [
            'Both the amendment and substantive motion were defeated',
            'Reform majority opposed changing the electoral system',
        ],
        'quotes': [],
        'minutes_url': 'https://council.lancashire.gov.uk/ieListDocuments.aspx?CId=138&MId=15359',
        'outcome': 'rejected',
        'for_count': None,
        'against_count': None,
        'abstain_count': None,
        'absent_count': None,
        'votes_by_councillor': [],
        'votes_by_party': {},
    },
    {
        'id': '2025-10-16-net-zero-review',
        'meeting': 'Full Council, Thursday, 16th October, 2025',
        'meeting_date': '2025-10-16',
        'title': 'Net Zero Review — Roll Back Non-Statutory Climate Commitments',
        'type': 'motion',
        'is_amendment': False,
        'amendment_by': None,
        'description': "Arguably the most significant policy motion of the Reform administration. Resolved to: review all non-statutory Net Zero decisions, review procurement policies re Net Zero vs value for money, cease voluntary carbon reporting (Annual Emissions Report, GHG inventories), ensure future policies don't include non-statutory Net Zero commitments, rescind Net Zero goals if national legislation changes, and ask Pension Fund Committee to review ESG/Net Zero targets. Lib Dem amendment to add 'Council believes in man-made climate change' was defeated.",
        'policy_area': ['environment_climate', 'budget_finance', 'governance_constitution'],
        'significance': 'high',
        'council_tax_change': None,
        'proposer': 'CC Martyn Sutton (Reform UK)',
        'seconder': 'CC Russell Walsh (Reform UK)',
        'key_facts': [
            'Effectively rolls back previous administration\'s climate commitments',
            'Stops voluntary carbon reporting and Annual Emissions Report',
            'Reviews ESG/Net Zero targets in Pension Fund',
            'Removes non-statutory Net Zero from procurement and policy',
            'Lib Dem amendment to affirm man-made climate change was defeated',
        ],
        'quotes': [],
        'minutes_url': 'https://council.lancashire.gov.uk/ieListDocuments.aspx?CId=138&MId=15384',
        'outcome': 'carried',
        'for_count': None,
        'against_count': None,
        'abstain_count': None,
        'absent_count': None,
        'votes_by_councillor': [],
        'votes_by_party': {},
    },
    {
        'id': '2025-10-16-educational-attainment',
        'meeting': 'Full Council, Thursday, 16th October, 2025',
        'meeting_date': '2025-10-16',
        'title': 'Educational Attainment of Disadvantaged Pupils — Education Summit',
        'type': 'motion',
        'is_amendment': False,
        'amendment_by': None,
        'description': "Opposition motion (CC Azhar Ali / CC Michael Lavalette) on educational attainment of disadvantaged children. Reform's friendly amendment (CC Joel Tetlow) significantly softened the motion — removed requests to write to Ofsted chair, establish a Poverty Commission, and invite specific individuals. Replaced with a simpler resolution for an education summit chaired by the cabinet member.",
        'policy_area': ['education_schools'],
        'significance': 'medium',
        'council_tax_change': None,
        'proposer': 'CC Azhar Ali OBE (Progressive Lancashire)',
        'seconder': 'CC Michael Lavalette (Labour)',
        'key_facts': [
            "Reform softened the original Labour/PL motion considerably",
            "Removed references to Ofsted chair, Poverty Commission",
            "Passed an education summit commitment chaired by cabinet member",
        ],
        'quotes': [],
        'minutes_url': 'https://council.lancashire.gov.uk/ieListDocuments.aspx?CId=138&MId=15384',
        'outcome': 'carried',
        'for_count': None,
        'against_count': None,
        'abstain_count': None,
        'absent_count': None,
        'votes_by_councillor': [],
        'votes_by_party': {},
    },
    {
        'id': '2025-10-16-inclusion-fairness-policy',
        'meeting': 'Full Council, Thursday, 16th October, 2025',
        'meeting_date': '2025-10-16',
        'title': 'Reformed Inclusion & Fairness Policy — Replace EDI',
        'type': 'motion',
        'is_amendment': False,
        'amendment_by': None,
        'description': "Cross-party Reform/PL motion (CC Ged Mirfin / CC Azhar Ali) to replace the previous EDI approach with a 'practical fairness' framework. Chief Executive to bring within 12 weeks a Reformed Inclusion & Fairness Policy with structural reforms, unbiased recruitment, staff voice, leadership accountability, measurable goals, and a 'What Good Looks Like' toolkit.",
        'policy_area': ['equalities_diversity', 'governance_constitution'],
        'significance': 'medium',
        'council_tax_change': None,
        'proposer': 'CC Ged Mirfin (Reform UK)',
        'seconder': 'CC Azhar Ali OBE (Progressive Lancashire)',
        'key_facts': [
            "Cross-party sponsorship: Reform + Progressive Lancashire",
            "Replaces EDI with 'practical fairness' framework",
            "Includes measurable goals and 'What Good Looks Like' toolkit",
            "Consensus approach: shifts from symbolic to practical inclusion",
        ],
        'quotes': [],
        'minutes_url': 'https://council.lancashire.gov.uk/ieListDocuments.aspx?CId=138&MId=15384',
        'outcome': 'carried',
        'for_count': None,
        'against_count': None,
        'abstain_count': None,
        'absent_count': None,
        'votes_by_councillor': [],
        'votes_by_party': {},
    },
    {
        'id': '2025-11-20-morgan-morecambe-windfarm',
        'meeting': 'Full Council, Thursday, 20th November, 2025',
        'meeting_date': '2025-11-20',
        'title': 'Morgan & Morecambe Offshore Windfarm Cabling Route',
        'type': 'motion',
        'is_amendment': False,
        'amendment_by': None,
        'description': "Cross-party Conservative/Reform motion (CC Peter Buckley / CC John Singleton) on adverse impacts of the offshore windfarm cabling route. Reform's CC Joshua Roberts broadened scope from Fylde to all Lancashire. Chief Executive to write to Secretary of State and MPs.",
        'policy_area': ['environment_climate', 'transport_highways'],
        'significance': 'low',
        'council_tax_change': None,
        'proposer': 'CC Peter Buckley (Conservative)',
        'seconder': 'CC John Singleton (Conservative)',
        'key_facts': [
            "Cross-party cooperation: Conservative motion, Reform amendment",
            "Scope broadened from Fylde to all Lancashire",
            "Chief Executive to write to Secretary of State and MPs",
        ],
        'quotes': [],
        'minutes_url': 'https://council.lancashire.gov.uk/ieListDocuments.aspx?CId=138&MId=15468',
        'outcome': 'carried',
        'for_count': None,
        'against_count': None,
        'abstain_count': None,
        'absent_count': None,
        'votes_by_councillor': [],
        'votes_by_party': {},
    },
]


# ── Merge and write ────────────────────────────────────────────────

def main():
    # Load existing voting.json
    voting_path = DATA_DIR / 'voting.json'
    with open(voting_path) as f:
        voting_data = json.load(f)

    existing_ids = {v['id'] for v in voting_data['votes']}

    # Add new recorded votes
    added = 0
    for vote in NEW_VOTES + NON_RECORDED_VOTES:
        if vote['id'] not in existing_ids:
            voting_data['votes'].append(vote)
            added += 1
            print(f"  + {vote['meeting_date']} | {vote['title'][:70]}")
        else:
            print(f"  = {vote['meeting_date']} | {vote['title'][:70]} (already exists)")

    # Sort: budget votes first, then by date descending
    voting_data['votes'].sort(key=lambda v: (
        0 if v.get('type') == 'budget' else 1,
        v.get('meeting_date', '') or '0000-00-00',
    ), reverse=True)

    voting_data['total_recorded_votes'] = len(voting_data['votes'])
    voting_data['last_updated'] = datetime.now().isoformat()

    # Write
    with open(voting_path, 'w') as f:
        json.dump(voting_data, f, indent=2, ensure_ascii=False)

    print(f"\nDone: {added} new votes added, {voting_data['total_recorded_votes']} total")


if __name__ == '__main__':
    main()
