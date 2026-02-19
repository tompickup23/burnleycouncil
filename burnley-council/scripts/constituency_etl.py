#!/usr/bin/env python3
"""
constituency_etl.py — Parliamentary constituency data for AI DOGE Lancashire

Fetches MP data, voting records, parliamentary activity, and GE history for
all 16 Lancashire constituencies (2024 boundaries).

Data sources (all free, no auth):
  - Parliament Members API (members-api.parliament.uk/api/Location/Constituency/Search)
  - Commons Votes API (commonsvotes-api.parliament.uk/data/divisions.json/search)
  - Written Questions API (questions-statements-api.parliament.uk/api/writtenquestions/questions)
  - Oral Questions & Motions API (oralquestionsandmotions-api.parliament.uk/oralquestions/list)

Usage:
    python3 constituency_etl.py                    # All constituencies
    python3 constituency_etl.py --constituency burnley  # Single constituency
    python3 constituency_etl.py --dry-run          # Preview without saving
    python3 constituency_etl.py --stdout           # Print JSON to stdout

Output: burnley-council/data/shared/constituencies.json
"""

import argparse
import json
import sys
import time
import urllib.request
import urllib.parse
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR.parent / 'data'
SHARED_DIR = DATA_DIR / 'shared'

# ---------------------------------------------------------------------------
# Lancashire constituencies (2024 boundaries)
# ---------------------------------------------------------------------------

CONSTITUENCIES = {
    'burnley': {
        'name': 'Burnley',
        'ons_code': 'E14001118',
        'overlapping_councils': ['burnley'],
        'partial': False,
    },
    'hyndburn': {
        'name': 'Hyndburn',
        'ons_code': 'E14001351',
        'overlapping_councils': ['hyndburn'],
        'partial': False,
    },
    'pendle_and_clitheroe': {
        'name': 'Pendle and Clitheroe',
        'ons_code': 'E14001476',
        'overlapping_councils': ['pendle', 'ribble_valley'],
        'partial': False,
    },
    'rossendale_and_darwen': {
        'name': 'Rossendale and Darwen',
        'ons_code': 'E14001528',
        'overlapping_councils': ['rossendale', 'blackburn'],
        'partial': False,
    },
    'lancaster_and_wyre': {
        'name': 'Lancaster and Wyre',
        'ons_code': 'E14001377',
        'overlapping_councils': ['lancaster', 'wyre'],
        'partial': False,
    },
    'morecambe_and_lunesdale': {
        'name': 'Morecambe and Lunesdale',
        'ons_code': 'E14001431',
        'overlapping_councils': ['lancaster'],
        'partial': False,
    },
    'ribble_valley': {
        'name': 'Ribble Valley',
        'ons_code': 'E14001512',
        'overlapping_councils': ['ribble_valley', 'south_ribble'],
        'partial': False,
    },
    'chorley': {
        'name': 'Chorley',
        'ons_code': 'E14001140',
        'overlapping_councils': ['chorley'],
        'partial': False,
    },
    'south_ribble': {
        'name': 'South Ribble',
        'ons_code': 'E14001555',
        'overlapping_councils': ['south_ribble'],
        'partial': False,
    },
    'preston': {
        'name': 'Preston',
        'ons_code': 'E14001494',
        'overlapping_councils': ['preston'],
        'partial': False,
    },
    'west_lancashire': {
        'name': 'West Lancashire',
        'ons_code': 'E14001616',
        'overlapping_councils': ['west_lancashire'],
        'partial': False,
    },
    'fylde': {
        'name': 'Fylde',
        'ons_code': 'E14001256',
        'overlapping_councils': ['fylde'],
        'partial': False,
    },
    'blackpool_north_and_fleetwood': {
        'name': 'Blackpool North and Fleetwood',
        'ons_code': 'E14001086',
        'overlapping_councils': ['blackpool', 'wyre'],
        'partial': False,
    },
    'blackpool_south': {
        'name': 'Blackpool South',
        'ons_code': 'E14001087',
        'overlapping_councils': ['blackpool', 'fylde'],
        'partial': False,
    },
    'blackburn': {
        'name': 'Blackburn',
        'ons_code': 'E14001078',
        'overlapping_councils': ['blackburn'],
        'partial': False,
    },
    'southport': {
        'name': 'Southport',
        'ons_code': 'E14001557',
        'overlapping_councils': ['west_lancashire'],
        'partial': True,  # Primarily Sefton (outside Lancashire scope)
    },
}

# GE2024 results — hardcoded from official results (Electoral Commission / HoC Library)
# These are definitive and won't change, so embedding them avoids an API dependency.
GE2024_RESULTS = {
    'burnley': {
        'turnout_pct': 0.534, 'electorate': 69872, 'turnout': 37368,
        'result': 'Lab Gain from Con',
        'results': [
            {'candidate': 'Oliver Ryan', 'party': 'Labour', 'votes': 16234, 'pct': 0.435, 'elected': True},
            {'candidate': 'Mark Hindle', 'party': 'Reform UK', 'votes': 9259, 'pct': 0.248},
            {'candidate': 'Antony Higginbotham', 'party': 'Conservative', 'votes': 5431, 'pct': 0.145},
            {'candidate': 'Janice Shersby', 'party': 'Green Party', 'votes': 2675, 'pct': 0.072},
            {'candidate': 'Kate Shersby', 'party': 'Liberal Democrats', 'votes': 1952, 'pct': 0.052},
            {'candidate': 'Aziz Akhtar', 'party': 'Independent', 'votes': 1817, 'pct': 0.049},
        ],
    },
    'hyndburn': {
        'turnout_pct': 0.545, 'electorate': 67147, 'turnout': 36570,
        'result': 'Lab Gain from Con',
        'results': [
            {'candidate': 'Sarah Smith', 'party': 'Labour', 'votes': 12186, 'pct': 0.335, 'elected': True},
            {'candidate': 'Sara Britcliffe', 'party': 'Conservative', 'votes': 10499, 'pct': 0.289},
            {'candidate': 'Richard Oakley', 'party': 'Reform UK', 'votes': 7541, 'pct': 0.207},
            {'candidate': 'Shabir Fazal', 'party': 'Green', 'votes': 4938, 'pct': 0.136},
            {'candidate': 'Beth Waller-Slack', 'party': 'Liberal Democrats', 'votes': 1210, 'pct': 0.033},
        ],
    },
    'pendle_and_clitheroe': {
        'turnout_pct': 0.593, 'electorate': 78796, 'turnout': 46754,
        'result': 'Lab Gain from Con',
        'results': [
            {'candidate': 'Jonathan Hinder', 'party': 'Labour', 'votes': 16129, 'pct': 0.345, 'elected': True},
            {'candidate': 'Andrew Stephenson', 'party': 'Conservative', 'votes': 15227, 'pct': 0.326},
            {'candidate': 'Victoria Fletcher', 'party': 'Reform UK', 'votes': 8171, 'pct': 0.175},
            {'candidate': 'Zulfikar Ali Khan', 'party': 'Independent', 'votes': 3108, 'pct': 0.066},
            {'candidate': 'Anna Fryer', 'party': 'Liberal Democrats', 'votes': 2039, 'pct': 0.044},
            {'candidate': 'Lex Kristan', 'party': 'Green', 'votes': 1421, 'pct': 0.030},
            {'candidate': 'Syed Muarif Hashmi', 'party': 'Workers Party', 'votes': 336, 'pct': 0.007},
            {'candidate': 'Christopher Thompson', 'party': 'Rejoin EU', 'votes': 190, 'pct': 0.004},
            {'candidate': 'Tony Johnson', 'party': 'Independent', 'votes': 133, 'pct': 0.003},
        ],
    },
    'rossendale_and_darwen': {
        'turnout_pct': 0.599, 'electorate': 74440, 'turnout': 44618,
        'result': 'Lab Gain from Con',
        'results': [
            {'candidate': 'Andy MacNae', 'party': 'Labour', 'votes': 18247, 'pct': 0.409, 'elected': True},
            {'candidate': 'Jake Berry', 'party': 'Conservative', 'votes': 12619, 'pct': 0.283},
            {'candidate': 'Daniel Matchett', 'party': 'Reform UK', 'votes': 9695, 'pct': 0.217},
            {'candidate': 'Bob Bauld', 'party': 'Green', 'votes': 2325, 'pct': 0.052},
            {'candidate': 'Rowan Fitton', 'party': 'Liberal Democrats', 'votes': 1241, 'pct': 0.028},
            {'candidate': 'Tayub Ali', 'party': 'Workers Party', 'votes': 491, 'pct': 0.011},
        ],
    },
    'lancaster_and_wyre': {
        'turnout_pct': 0.575, 'electorate': 74760, 'turnout': 43008,
        'result': 'Lab Win (new seat)',
        'results': [
            {'candidate': 'Cat Smith', 'party': 'Labour', 'votes': 19315, 'pct': 0.449, 'elected': True},
            {'candidate': 'Peter Cartridge', 'party': 'Conservative', 'votes': 10062, 'pct': 0.234},
            {'candidate': 'Nigel Alderson', 'party': 'Reform UK', 'votes': 6866, 'pct': 0.160},
            {'candidate': 'Jack Lenox', 'party': 'Green', 'votes': 5236, 'pct': 0.122},
            {'candidate': 'Matt Severn', 'party': 'Liberal Democrats', 'votes': 1529, 'pct': 0.036},
        ],
    },
    'morecambe_and_lunesdale': {
        'turnout_pct': 0.629, 'electorate': 76424, 'turnout': 48059,
        'result': 'Lab Gain from Con',
        'results': [
            {'candidate': 'Lizzi Collinge', 'party': 'Labour', 'votes': 19603, 'pct': 0.408, 'elected': True},
            {'candidate': 'David Morris', 'party': 'Conservative', 'votes': 13788, 'pct': 0.287},
            {'candidate': 'Barry Parsons', 'party': 'Reform UK', 'votes': 7810, 'pct': 0.163},
            {'candidate': 'Peter Jackson', 'party': 'Liberal Democrats', 'votes': 4769, 'pct': 0.099},
            {'candidate': 'Gina Dowding', 'party': 'Green', 'votes': 2089, 'pct': 0.043},
        ],
    },
    'ribble_valley': {
        'turnout_pct': 0.646, 'electorate': 80484, 'turnout': 52023,
        'result': 'Lab Gain from Con',
        'results': [
            {'candidate': 'Maya Ellis', 'party': 'Labour', 'votes': 18177, 'pct': 0.349, 'elected': True},
            {'candidate': 'Nigel Evans', 'party': 'Conservative', 'votes': 17321, 'pct': 0.333},
            {'candidate': 'John Carroll', 'party': 'Reform UK', 'votes': 8524, 'pct': 0.164},
            {'candidate': 'John Potter', 'party': 'Liberal Democrats', 'votes': 5001, 'pct': 0.096},
            {'candidate': 'Caroline Montague', 'party': 'Green', 'votes': 1727, 'pct': 0.033},
            {'candidate': 'Qasim Ajmi', 'party': 'Independent', 'votes': 1273, 'pct': 0.024},
        ],
    },
    'chorley': {
        'turnout_pct': 0.454, 'electorate': 74801, 'turnout': 33964,
        'result': 'Speaker Hold',
        'results': [
            {'candidate': 'Lindsay Hoyle', 'party': 'Speaker', 'votes': 25238, 'pct': 0.743, 'elected': True},
            {'candidate': 'Mark Tebbutt', 'party': 'Green', 'votes': 4663, 'pct': 0.137},
            {'candidate': 'Ben Holden-Crowther', 'party': 'Democracy for Chorley', 'votes': 2424, 'pct': 0.071},
            {'candidate': 'Graham Moore', 'party': 'English Constitution Party', 'votes': 1007, 'pct': 0.030},
            {'candidate': 'Martin Powell-Davies', 'party': 'TUSC', 'votes': 632, 'pct': 0.019},
        ],
    },
    'south_ribble': {
        'turnout_pct': 0.636, 'electorate': 73420, 'turnout': 46720,
        'result': 'Lab Gain from Con',
        'results': [
            {'candidate': 'Paul Foster', 'party': 'Labour', 'votes': 19840, 'pct': 0.425, 'elected': True},
            {'candidate': 'Katherine Fletcher', 'party': 'Conservative', 'votes': 13339, 'pct': 0.286},
            {'candidate': 'Andy Hunter', 'party': 'Reform UK', 'votes': 8995, 'pct': 0.193},
            {'candidate': 'Angela Turner', 'party': 'Liberal Democrats', 'votes': 2972, 'pct': 0.064},
            {'candidate': 'Stephani Mok', 'party': 'Green', 'votes': 1574, 'pct': 0.034},
        ],
    },
    'preston': {
        'turnout_pct': 0.517, 'electorate': 77400, 'turnout': 39993,
        'result': 'Lab Hold',
        'results': [
            {'candidate': 'Mark Hendrick', 'party': 'Labour', 'votes': 14006, 'pct': 0.350, 'elected': True},
            {'candidate': 'Michael Lavalette', 'party': 'Independent', 'votes': 8715, 'pct': 0.218},
            {'candidate': 'James Elliot', 'party': 'Reform UK', 'votes': 5738, 'pct': 0.143},
            {'candidate': 'Trevor Hart', 'party': 'Conservative', 'votes': 5212, 'pct': 0.130},
            {'candidate': 'Neil Darby', 'party': 'Liberal Democrats', 'votes': 3195, 'pct': 0.080},
            {'candidate': 'Isabella Metcalf-Riener', 'party': 'Green', 'votes': 1751, 'pct': 0.044},
            {'candidate': 'Yousuf Bhailok', 'party': 'Independent', 'votes': 891, 'pct': 0.022},
            {'candidate': "Joseph O'Meachair", 'party': 'Rejoin EU', 'votes': 216, 'pct': 0.005},
            {'candidate': 'David Brooks', 'party': 'Alliance for Democracy and Freedom', 'votes': 145, 'pct': 0.004},
            {'candidate': 'Derek Kileen', 'party': 'UKIP', 'votes': 124, 'pct': 0.003},
        ],
    },
    'west_lancashire': {
        'turnout_pct': 0.597, 'electorate': 74081, 'turnout': 44200,
        'result': 'Lab Hold',
        'results': [
            {'candidate': 'Ashley Dalton', 'party': 'Labour', 'votes': 22305, 'pct': 0.505, 'elected': True},
            {'candidate': 'Mike Prendergast', 'party': 'Conservative', 'votes': 8680, 'pct': 0.196},
            {'candidate': 'Simon Evans', 'party': 'Reform UK', 'votes': 7909, 'pct': 0.179},
            {'candidate': 'Charlotte Houltram', 'party': 'Green', 'votes': 3263, 'pct': 0.074},
            {'candidate': 'Graham Smith', 'party': 'Liberal Democrats', 'votes': 2043, 'pct': 0.046},
        ],
    },
    'fylde': {
        'turnout_pct': 0.624, 'electorate': 77100, 'turnout': 48105,
        'result': 'Con Hold',
        'results': [
            {'candidate': 'Andrew Snowden', 'party': 'Conservative', 'votes': 15917, 'pct': 0.332, 'elected': True},
            {'candidate': 'Tom Calver', 'party': 'Labour', 'votes': 15356, 'pct': 0.320},
            {'candidate': 'Brook Wimbury', 'party': 'Reform UK', 'votes': 8295, 'pct': 0.173},
            {'candidate': 'Anne Aitken', 'party': 'Independent', 'votes': 4513, 'pct': 0.094},
            {'candidate': 'Mark Jewell', 'party': 'Liberal Democrats', 'votes': 2120, 'pct': 0.044},
            {'candidate': 'Brenden Wilkinson', 'party': 'Green', 'votes': 1560, 'pct': 0.033},
            {'candidate': 'Cheryl Morrison', 'party': 'Alliance for Democracy and Freedom', 'votes': 199, 'pct': 0.004},
        ],
    },
    'blackpool_north_and_fleetwood': {
        'turnout_pct': 0.570, 'electorate': 73339, 'turnout': 41810,
        'result': 'Lab Gain from Con',
        'results': [
            {'candidate': 'Lorraine Beavers', 'party': 'Labour', 'votes': 16744, 'pct': 0.400, 'elected': True},
            {'candidate': 'Paul Maynard', 'party': 'Conservative', 'votes': 12097, 'pct': 0.289},
            {'candidate': 'Dan Barker', 'party': 'Reform UK', 'votes': 9913, 'pct': 0.237},
            {'candidate': 'Bill Greene', 'party': 'Liberal Democrats', 'votes': 1318, 'pct': 0.032},
            {'candidate': 'Tina Rothery', 'party': 'Green', 'votes': 1269, 'pct': 0.030},
            {'candidate': 'James Rust', 'party': 'Monster Raving Loony', 'votes': 174, 'pct': 0.004},
            {'candidate': 'Gita Gordon', 'party': 'Independent', 'votes': 148, 'pct': 0.004},
            {'candidate': 'Jeannine Cresswell', 'party': 'SDP', 'votes': 147, 'pct': 0.004},
        ],
    },
    'blackpool_south': {
        'turnout_pct': 0.454, 'electorate': 77460, 'turnout': 35180,
        'result': 'Lab Hold',
        'results': [
            {'candidate': 'Chris Webb', 'party': 'Labour', 'votes': 16916, 'pct': 0.481, 'elected': True},
            {'candidate': 'Mark Butcher', 'party': 'Reform UK', 'votes': 10068, 'pct': 0.286},
            {'candidate': 'Zak Khan', 'party': 'Conservative', 'votes': 5504, 'pct': 0.156},
            {'candidate': 'Ben Thomas', 'party': 'Green', 'votes': 1207, 'pct': 0.034},
            {'candidate': 'Andy Cregan', 'party': 'Liberal Democrats', 'votes': 1041, 'pct': 0.030},
            {'candidate': 'Stephen Black', 'party': 'Independent', 'votes': 261, 'pct': 0.007},
            {'candidate': 'Kim Knight', 'party': 'Alliance for Democracy and Freedom', 'votes': 183, 'pct': 0.005},
        ],
    },
    'blackburn': {
        'turnout_pct': 0.531, 'electorate': 73263, 'turnout': 38887,
        'result': 'Ind Gain from Lab',
        'results': [
            {'candidate': 'Adnan Hussain', 'party': 'Independent', 'votes': 10518, 'pct': 0.270, 'elected': True},
            {'candidate': 'Kate Hollern', 'party': 'Labour', 'votes': 10386, 'pct': 0.267},
            {'candidate': 'Craig Murray', 'party': 'Workers Party', 'votes': 7105, 'pct': 0.183},
            {'candidate': 'Tommy Temperley', 'party': 'Reform UK', 'votes': 4844, 'pct': 0.125},
            {'candidate': 'Jamie McGowan', 'party': 'Conservative', 'votes': 3474, 'pct': 0.089},
            {'candidate': 'Denise Morgan', 'party': 'Green', 'votes': 1416, 'pct': 0.036},
            {'candidate': 'Adam Waller-Slack', 'party': 'Liberal Democrats', 'votes': 689, 'pct': 0.018},
            {'candidate': 'Altaf Patel', 'party': 'Independent', 'votes': 369, 'pct': 0.009},
            {'candidate': 'Natasha Shah', 'party': 'Independent', 'votes': 86, 'pct': 0.002},
        ],
    },
    'southport': {
        'turnout_pct': 0.612, 'electorate': 73641, 'turnout': 45059,
        'result': 'Lab Gain from Con',
        'results': [
            {'candidate': 'Patrick Hurley', 'party': 'Labour', 'votes': 17252, 'pct': 0.383, 'elected': True},
            {'candidate': 'Damien Moore', 'party': 'Conservative', 'votes': 11463, 'pct': 0.254},
            {'candidate': 'Andrew Lynn', 'party': 'Reform UK', 'votes': 7395, 'pct': 0.164},
            {'candidate': 'Erin Harvey', 'party': 'Liberal Democrats', 'votes': 5868, 'pct': 0.130},
            {'candidate': 'Edwin Black', 'party': 'Green', 'votes': 2159, 'pct': 0.048},
            {'candidate': 'Sean Halsall', 'party': 'Independent', 'votes': 922, 'pct': 0.021},
        ],
    },
}

# API rate limiting
REQUEST_DELAY = 0.5  # seconds between requests
MAX_RETRIES = 3

# Current parliament start date (2024 General Election)
PARLIAMENT_START = '2024-07-04'

# ---------------------------------------------------------------------------
# API Helpers
# ---------------------------------------------------------------------------

def log(msg):
    print(f'[{datetime.now().strftime("%H:%M:%S")}] {msg}', file=sys.stderr)


def api_get(url, desc='data'):
    """Fetch JSON from a URL with retry logic."""
    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(url, headers={
                'Accept': 'application/json',
                'User-Agent': 'AI-DOGE-Lancashire/1.0 (transparency platform)',
            })
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode('utf-8'))
        except Exception as e:
            if attempt < MAX_RETRIES - 1:
                wait = 2 ** (attempt + 1)
                log(f'  Retry {attempt + 1}/{MAX_RETRIES} for {desc}: {e}. Waiting {wait}s...')
                time.sleep(wait)
            else:
                log(f'  FAILED to fetch {desc}: {e}')
                return None
    return None


# ---------------------------------------------------------------------------
# Parliament Members API
# ---------------------------------------------------------------------------

def fetch_mp(constituency_name):
    """Fetch current MP for a constituency from Parliament Members API.

    Uses the Location/Constituency/Search endpoint — the Members/Search
    constituency parameter is BROKEN (silently ignored by the API).
    """
    encoded = urllib.parse.quote(constituency_name)
    url = f'https://members-api.parliament.uk/api/Location/Constituency/Search?searchText={encoded}&skip=0&take=5'
    data = api_get(url, f'MP for {constituency_name}')
    time.sleep(REQUEST_DELAY)

    if not data or not data.get('items'):
        log(f'  No MP found for {constituency_name}')
        return None

    # Find the exact constituency match from results
    target = constituency_name.lower().strip()
    matched = None
    for item in data['items']:
        cname = item.get('value', {}).get('name', '')
        if cname.lower().strip() == target:
            matched = item
            break

    # Fall back to first result if no exact match
    if not matched:
        matched = data['items'][0]

    constituency_data = matched.get('value', {})
    current_rep = constituency_data.get('currentRepresentation')
    if not current_rep:
        log(f'  No current MP for {constituency_name}')
        return None

    member = current_rep.get('member', {}).get('value', {})
    party = member.get('latestParty', {})
    membership = member.get('latestHouseMembership', {})

    return {
        'name': member.get('nameDisplayAs', ''),
        'parliament_id': member.get('id'),
        'party': party.get('name', 'Unknown'),
        'party_abbreviation': party.get('abbreviation', ''),
        'photo_url': member.get('thumbnailUrl', ''),
        'elected': (membership.get('membershipStartDate', '') or '')[:10],
        'constituency_name': membership.get('membershipFrom', ''),
        'gender': member.get('gender', ''),
    }


# ---------------------------------------------------------------------------
# Commons Votes API
# ---------------------------------------------------------------------------

def fetch_voting_record(parliament_id, mp_name):
    """Fetch voting record from Commons Votes API. Returns summary + notable votes.

    The search endpoint with memberId returns only divisions the MP participated in.
    The Ayes/Noes arrays are EMPTY in search results (they're only populated when
    fetching a single division). So we infer the MP's vote from the division metadata:
    if it appears in the search, they voted. We then fetch a small number of individual
    divisions to determine Aye/No for notable votes.
    """
    if not parliament_id:
        return None

    log(f'  Fetching votes for {mp_name} (ID: {parliament_id})...')

    all_divisions = []
    skip = 0
    take = 25  # API max per page

    while True:
        url = (
            f'https://commonsvotes-api.parliament.uk/data/divisions.json/search'
            f'?queryParameters.memberId={parliament_id}'
            f'&queryParameters.skip={skip}&queryParameters.take={take}'
        )
        data = api_get(url, f'votes page {skip // take + 1}')
        time.sleep(REQUEST_DELAY)

        if not data or len(data) == 0:
            break

        all_divisions.extend(data)
        if len(data) < take:
            break
        skip += take

        # Safety limit — most MPs have 300-600 divisions this parliament
        if skip > 2000:
            log(f'    Hit safety limit at {skip} divisions')
            break

    if not all_divisions:
        return None

    total_career = len(all_divisions)

    # Filter to current parliament only (from July 2024)
    all_divisions = [
        d for d in all_divisions
        if (d.get('Date', '') or '')[:10] >= PARLIAMENT_START
    ]

    voted_in = len(all_divisions)
    log(f'    Voted in {voted_in} divisions this parliament ({total_career} career total)')

    # The search API only returns divisions the MP participated in.
    # Total divisions available for attendance % requires a separate call.
    # For now, use voted_in — attendance_pct is set to 1.0 below (by definition).
    total_divisions = voted_in

    # Build notable votes from the most recent divisions
    # Sort by date (most recent first)
    all_divisions.sort(key=lambda d: d.get('Date', ''), reverse=True)

    notable_votes = []
    # For the 20 most recent divisions, fetch full details to see Aye/No
    for div in all_divisions[:20]:
        div_id = div.get('DivisionId')
        title = div.get('Title', '')
        date = (div.get('Date', '') or '')[:10]

        # Fetch individual division to get Aye/No vote
        # NOTE: Detail URL is /data/division/{id}.json (singular, .json suffix)
        # NOT /data/divisions.json/{id} (which returns 404)
        vote = None
        if div_id:
            detail_url = f'https://commonsvotes-api.parliament.uk/data/division/{div_id}.json'
            detail = api_get(detail_url, f'division {div_id}')
            time.sleep(REQUEST_DELAY)

            if detail:
                aye_ids = [m.get('MemberId') for m in (detail.get('Ayes', []) or [])]
                noe_ids = [m.get('MemberId') for m in (detail.get('Noes', []) or [])]
                teller_aye = [m.get('MemberId') for m in (detail.get('AyeTellers', []) or [])]
                teller_noe = [m.get('MemberId') for m in (detail.get('NoTellers', []) or [])]

                if parliament_id in aye_ids or parliament_id in teller_aye:
                    vote = 'Aye'
                elif parliament_id in noe_ids or parliament_id in teller_noe:
                    vote = 'No'

        notable_votes.append({
            'division_id': div_id,
            'title': title[:120],
            'date': date,
            'voted': vote,
            'aye_count': div.get('AyeCount', 0),
            'noe_count': div.get('NoCount', 0),
        })

    return {
        'total_divisions': total_divisions,
        'voted_in': voted_in,
        'attendance_pct': 1.0,  # By definition — search only returns divisions MP voted in
        'rebellions': 0,  # TODO: Calculate from party whip data
        'rebellion_rate': 0,
        'notable_votes_count': len(notable_votes),
        'notable_votes': notable_votes,
    }


# ---------------------------------------------------------------------------
# Written Questions API
# ---------------------------------------------------------------------------

def fetch_written_questions(parliament_id, mp_name):
    """Fetch written questions count and top topics (current parliament only)."""
    if not parliament_id:
        return None

    log(f'  Fetching written questions for {mp_name}...')
    # NOTE: writtenquestions-api.parliament.uk 301-redirects to questions-statements-api.
    # Use the new URL directly to avoid redirect issues.
    # Filter to current parliament only with tabledWhenFrom

    all_results = []
    skip = 0
    take = 100

    while True:
        url = (
            f'https://questions-statements-api.parliament.uk/api/writtenquestions/questions'
            f'?askingMemberId={parliament_id}&take={take}&skip={skip}'
            f'&tabledWhenFrom={PARLIAMENT_START}'
        )
        data = api_get(url, f'written questions (skip={skip})')
        time.sleep(REQUEST_DELAY)

        if not data:
            break

        total = data.get('totalResults', 0)
        results = data.get('results', [])
        all_results.extend(results)

        if len(all_results) >= total or not results:
            break
        skip += take

        # Safety cap
        if skip > 500:
            log(f'    Hit written questions safety limit at {skip}')
            break

    total = len(all_results) if all_results else 0

    # Extract topics from answering bodies (departments)
    dept_counts = Counter()
    for q in all_results:
        val = q.get('value', {})
        dept = val.get('answeringBodyName', '')
        if dept:
            dept_counts[dept] += 1

    # Top 10 departments
    top_topics = [{'department': dept, 'count': cnt} for dept, cnt in dept_counts.most_common(10)]

    return {
        'count': total,
        'topics': top_topics,
    }


# ---------------------------------------------------------------------------
# Oral Questions API
# ---------------------------------------------------------------------------

def fetch_oral_questions(parliament_id, mp_name):
    """Fetch oral questions count.

    NOTE: The oralquestionsandmotions API does NOT support filtering by member
    (the askingMemberId parameter is silently ignored and returns all oral questions).
    This is a known API limitation. We return 0 for now — oral question counts can
    be added later via TheyWorkForYou API which does support per-MP filtering.
    """
    if not parliament_id:
        return None

    log(f'  Oral questions: skipping (API does not support member filtering)')
    return {'count': 0, 'note': 'Oral questions API does not filter by member — data gap'}


# ---------------------------------------------------------------------------
# Early Day Motions API
# ---------------------------------------------------------------------------

def fetch_edms(parliament_id, mp_name):
    """Fetch EDM count (sponsored and signed)."""
    if not parliament_id:
        return None

    log(f'  Fetching EDMs for {mp_name}...')

    # Sponsored EDMs
    url = (
        f'https://oralquestionsandmotions-api.parliament.uk/EarlyDayMotions/list'
        f'?parameters.memberId={parliament_id}&parameters.take=1'
    )
    data = api_get(url, 'EDMs')
    time.sleep(REQUEST_DELAY)

    sponsored = 0
    signed = 0
    if data:
        sponsored = data.get('PagingInfo', {}).get('Total', 0)

    return {
        'sponsored': sponsored,
        'signed': signed,  # TODO: EDM signatures require different endpoint
    }


# ---------------------------------------------------------------------------
# Main ETL
# ---------------------------------------------------------------------------

def process_constituency(cid, config):
    """Process a single constituency."""
    name = config['name']
    log(f'\n=== {name} ({cid}) ===')

    # 1. Fetch MP
    mp = fetch_mp(name)
    if not mp:
        log(f'  Skipping {name} — no MP found')
        return None

    parliament_id = mp.get('parliament_id')
    mp_name = mp.get('name', name)

    # 2. Fetch voting record
    voting = fetch_voting_record(parliament_id, mp_name)

    # 3. Fetch written questions
    written = fetch_written_questions(parliament_id, mp_name)

    # 4. Fetch oral questions
    oral = fetch_oral_questions(parliament_id, mp_name)

    # 5. Fetch EDMs
    edms = fetch_edms(parliament_id, mp_name)

    # 6. GE2024 results (hardcoded or from embedded data)
    ge2024 = GE2024_RESULTS.get(cid)
    ge_majority = None
    ge_majority_pct = None
    if ge2024 and ge2024.get('results'):
        results = ge2024['results']
        if len(results) >= 2:
            ge_majority = results[0].get('votes', 0) - results[1].get('votes', 0)
            ge_majority_pct = round(results[0].get('pct', 0) - results[1].get('pct', 0), 3)

    # Build constituency record
    record = {
        'id': cid,
        'ons_code': config['ons_code'],
        'name': name,
        'partial': config.get('partial', False),
        'mp': {
            'name': mp['name'],
            'party': mp['party'],
            'party_abbreviation': mp.get('party_abbreviation', ''),
            'photo_url': mp.get('photo_url', ''),
            'elected': mp.get('elected', ''),
            'parliament_id': parliament_id,
            'gender': mp.get('gender', ''),
            'majority': ge_majority,
            'majority_pct': ge_majority_pct,
        },
        'ge2024': ge2024,
        'ge_history': [],  # Populated in A5
        'voting_record': voting,
        'parliamentary_activity': {
            'written_questions': written.get('count', 0) if written else 0,
            'oral_questions': oral.get('count', 0) if oral else 0,
            'edms_sponsored': edms.get('sponsored', 0) if edms else 0,
            'edms_signed': edms.get('signed', 0) if edms else 0,
            'top_topics': (written or {}).get('topics', []),
        },
        'overlapping_councils': config['overlapping_councils'],
        'overlapping_wards': {},  # Populated in A4
    }

    log(f'  Done: {mp_name} ({mp["party"]}), {voting.get("total_divisions", 0) if voting else 0} divisions')
    return record


def main():
    parser = argparse.ArgumentParser(description='Constituency data ETL for AI DOGE Lancashire')
    parser.add_argument('--constituency', choices=list(CONSTITUENCIES.keys()),
                        help='Single constituency to fetch')
    parser.add_argument('--dry-run', action='store_true',
                        help='Preview without saving')
    parser.add_argument('--stdout', action='store_true',
                        help='Print JSON to stdout')
    args = parser.parse_args()

    constituencies_to_process = (
        [args.constituency] if args.constituency
        else list(CONSTITUENCIES.keys())
    )

    log(f'Constituency ETL starting — {len(constituencies_to_process)} constituency(ies)')
    log(f'Sources: Parliament Members API, Commons Votes API, Written/Oral Questions API, EDMs API')
    log('')

    records = []
    for cid in constituencies_to_process:
        config = CONSTITUENCIES[cid]
        record = process_constituency(cid, config)
        if record:
            records.append(record)

    # Build output
    output = {
        'meta': {
            'generated': datetime.now().isoformat(timespec='seconds'),
            'constituencies_count': len(records),
            'boundary_revision': '2024',
            'data_sources': [
                'Parliament Members API',
                'Commons Votes API',
                'Written Questions API',
                'Oral Questions API',
                'Early Day Motions API',
            ],
        },
        'constituencies': records,
    }

    output_json = json.dumps(output, indent=2, ensure_ascii=False)

    if args.stdout or args.dry_run:
        print(output_json)
        if args.dry_run:
            log(f'\n--- DRY RUN: Would write to {SHARED_DIR / "constituencies.json"} ---')
        return

    # Save
    SHARED_DIR.mkdir(parents=True, exist_ok=True)
    out_path = SHARED_DIR / 'constituencies.json'
    out_path.write_text(output_json, encoding='utf-8')
    log(f'\nWritten: {out_path}')
    log(f'Records: {len(records)} constituencies')

    # Summary
    for r in records:
        mp = r.get('mp', {})
        voting = r.get('voting_record') or {}
        activity = r.get('parliamentary_activity', {})
        log(f'  {r["name"]}: {mp.get("name")} ({mp.get("party")})'
            f' | Divisions: {voting.get("total_divisions", 0)}'
            f' | WQs: {activity.get("written_questions", 0)}'
            f' | OQs: {activity.get("oral_questions", 0)}')


if __name__ == '__main__':
    main()
