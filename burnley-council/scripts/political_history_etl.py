#!/usr/bin/env python3
"""
political_history_etl.py — Build political history profiles for past and current councillors/candidates.

Merges data from:
  - elections.json (candidate history, party per-election, votes)
  - councillors.json (current councillors)
  - voting.json (recorded votes per councillor)
  - integrity.json (conflict detections)
  - constituencies.json (MP cross-reference)
  - councillor_profiles.json (enriched profiles)

Generates political_history.json per council with:
  - All historical candidates (deduplicated by name)
  - Party history tracking (party switches flagged)
  - Electoral record (wins, losses, vote counts, margins)
  - Voting record links (for those with recorded division data)
  - Current status: serving, former, now_mp, defeated
  - Cross-references to integrity findings

Usage:
    python3 political_history_etl.py                          # All councils
    python3 political_history_etl.py --council burnley        # Single council
    python3 political_history_etl.py --council lancashire_cc  # LCC
"""

import json
import logging
import argparse
import sys
from pathlib import Path
from datetime import datetime
from collections import defaultdict

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
log = logging.getLogger('PoliticalHistory')

DATA_DIR = Path(__file__).resolve().parent.parent / 'data'

# All councils with elections data
COUNCILS = [
    'burnley', 'hyndburn', 'pendle', 'rossendale', 'lancaster',
    'ribble_valley', 'chorley', 'south_ribble', 'lancashire_cc',
    'blackpool', 'west_lancashire', 'blackburn', 'wyre', 'preston', 'fylde'
]


def normalise_name(name):
    """Normalise a councillor name for matching (handles title prefixes, whitespace)."""
    import re
    n = name.strip()
    # Remove common titles
    n = re.sub(
        r'^(County\s+)?Councillor\s+(Mr|Mrs|Ms|Miss|Dr|Prof|Cllr|Sir|Dame|Lord|Lady|Reverend|Rev)?\s*',
        '', n, flags=re.IGNORECASE
    ).strip()
    # Remove double spaces
    n = re.sub(r'\s+', ' ', n)
    return n


def build_political_history(council_id):
    """Build political history for a single council."""
    out_dir = DATA_DIR / council_id

    # Load elections.json
    elections_path = out_dir / 'elections.json'
    if not elections_path.exists():
        log.warning(f"No elections.json for {council_id} — skipping")
        return None

    with open(elections_path) as f:
        elections_data = json.load(f)

    wards = elections_data.get('wards', {})
    if not wards:
        log.warning(f"No ward data in elections.json for {council_id}")
        return None

    # Load councillors.json (current serving)
    councillors_path = out_dir / 'councillors.json'
    current_councillors = {}  # normalised name → councillor record
    if councillors_path.exists():
        with open(councillors_path) as f:
            cllr_data = json.load(f)
        cllrs = cllr_data if isinstance(cllr_data, list) else cllr_data.get('councillors', [])
        for c in cllrs:
            name = c.get('name', '')
            norm = normalise_name(name)
            current_councillors[norm] = c
            # Also store with original name
            current_councillors[name] = c

    # Load voting.json (vote records per councillor)
    voting_path = out_dir / 'voting.json'
    councillor_votes = defaultdict(list)  # normalised name → [{vote_id, title, date, vote}]
    if voting_path.exists():
        with open(voting_path) as f:
            voting_data = json.load(f)
        for v in voting_data.get('votes', []):
            for cv in v.get('votes_by_councillor', []):
                norm = normalise_name(cv.get('name', ''))
                councillor_votes[norm].append({
                    'vote_id': v.get('id'),
                    'title': v.get('title'),
                    'date': v.get('meeting_date'),
                    'vote': cv.get('vote'),
                    'outcome': v.get('outcome'),
                })

    # Load integrity.json
    integrity_path = out_dir / 'integrity.json'
    integrity_by_name = {}  # normalised name → integrity record
    if integrity_path.exists():
        with open(integrity_path) as f:
            integrity_data = json.load(f)
        for record in integrity_data.get('councillors', []):
            norm = normalise_name(record.get('name', ''))
            integrity_by_name[norm] = record

    # Load councillor_profiles.json
    profiles_path = out_dir / 'councillor_profiles.json'
    profiles_by_name = {}
    if profiles_path.exists():
        with open(profiles_path) as f:
            profiles_data = json.load(f)
        cllr_profiles = profiles_data.get('councillors', {})
        if isinstance(cllr_profiles, dict):
            for pid, p in cllr_profiles.items():
                if isinstance(p, dict):
                    norm = normalise_name(p.get('name', ''))
                    profiles_by_name[norm] = p
        elif isinstance(cllr_profiles, list):
            for p in cllr_profiles:
                norm = normalise_name(p.get('name', ''))
                profiles_by_name[norm] = p

    # Load constituencies.json for MP cross-reference
    constituencies_path = out_dir / 'constituencies.json'
    mp_names = {}  # normalised name → constituency
    if constituencies_path.exists():
        with open(constituencies_path) as f:
            const_data = json.load(f)
        for c in const_data.get('constituencies', []):
            mp = c.get('mp', {})
            if mp.get('name'):
                mp_names[normalise_name(mp['name'])] = {
                    'constituency': c.get('name'),
                    'party': mp.get('party'),
                    'mp_since': mp.get('first_elected'),
                }

    # ── Build candidate profiles ──
    candidates = defaultdict(lambda: {
        'elections': [],
        'wards_contested': set(),
        'parties': [],
        'total_votes': 0,
        'elections_won': 0,
        'elections_fought': 0,
        'first_election': None,
        'last_election': None,
    })

    for ward_name, ward_data in wards.items():
        for election in ward_data.get('history', []):
            date = election.get('date', '')
            year = election.get('year', 0)
            election_type = election.get('type', 'borough')

            for c in election.get('candidates', []):
                name = c.get('name', '').strip()
                if not name:
                    continue

                norm = normalise_name(name)
                record = candidates[norm]
                record['name'] = name  # Keep original name from most recent election
                record['wards_contested'].add(ward_name)
                record['total_votes'] += c.get('votes', 0)
                record['elections_fought'] += 1
                if c.get('elected'):
                    record['elections_won'] += 1

                record['elections'].append({
                    'date': date,
                    'year': year,
                    'ward': ward_name,
                    'party': c.get('party', 'Unknown'),
                    'votes': c.get('votes', 0),
                    'pct': c.get('pct', 0),
                    'elected': c.get('elected', False),
                    'type': election_type,
                })

                record['parties'].append({
                    'year': year,
                    'party': c.get('party', 'Unknown'),
                })

                if not record['first_election'] or date < record['first_election']:
                    record['first_election'] = date
                if not record['last_election'] or date > record['last_election']:
                    record['last_election'] = date

    # ── Post-process: detect party switches, determine status ──
    people = []
    for norm_name, record in candidates.items():
        # Sort elections by date
        record['elections'].sort(key=lambda e: e.get('date', ''))

        # Determine party history (ordered, deduplicated)
        seen_parties = []
        for p in sorted(record['parties'], key=lambda x: x['year']):
            if not seen_parties or seen_parties[-1]['party'] != p['party']:
                seen_parties.append(p)

        party_switched = len(set(p['party'] for p in seen_parties)) > 1
        current_party = seen_parties[-1]['party'] if seen_parties else 'Unknown'

        # Determine status
        is_current = norm_name in current_councillors or record['name'] in current_councillors
        is_mp = norm_name in mp_names
        last_elected = any(e['elected'] for e in record['elections'][-3:])  # Won any of last 3

        if is_current:
            status = 'serving'
        elif is_mp:
            status = 'now_mp'
        elif record['elections_won'] > 0 and not last_elected:
            status = 'former'
        else:
            status = 'candidate'  # Never won or only stood as candidate

        # Build profile
        profile = {
            'name': record['name'],
            'normalised_name': norm_name,
            'status': status,
            'current_party': current_party,
            'party_switched': party_switched,
            'party_history': [{'year': p['year'], 'party': p['party']} for p in seen_parties],
            'elections_fought': record['elections_fought'],
            'elections_won': record['elections_won'],
            'win_rate': round(record['elections_won'] / record['elections_fought'], 2) if record['elections_fought'] else 0,
            'total_votes_received': record['total_votes'],
            'wards_contested': sorted(record['wards_contested']),
            'first_election': record['first_election'],
            'last_election': record['last_election'],
            'electoral_history': record['elections'],
        }

        # Cross-references
        if is_current:
            cllr = current_councillors.get(norm_name) or current_councillors.get(record['name'], {})
            profile['current_ward'] = cllr.get('ward')
            profile['moderngov_uid'] = cllr.get('moderngov_uid')

        if is_mp:
            profile['mp_info'] = mp_names[norm_name]

        if party_switched:
            profile['party_changes'] = [
                f"{seen_parties[i]['party']} → {seen_parties[i+1]['party']} ({seen_parties[i+1]['year']})"
                for i in range(len(seen_parties) - 1)
            ]

        # Voting record summary (if available)
        votes = councillor_votes.get(norm_name, [])
        if votes:
            profile['voting_record'] = {
                'total_recorded_votes': len(votes),
                'votes_for': sum(1 for v in votes if v['vote'] == 'for'),
                'votes_against': sum(1 for v in votes if v['vote'] == 'against'),
                'votes_abstain': sum(1 for v in votes if v['vote'] == 'abstain'),
            }

        # Integrity cross-reference
        integrity = integrity_by_name.get(norm_name)
        if integrity:
            profile['integrity_score'] = integrity.get('integrity_score')
            profile['integrity_flags'] = integrity.get('total_flags', 0)
            profile['integrity_detections'] = [
                d.get('type') for d in integrity.get('detections', [])
                if d.get('severity') in ('high', 'critical')
            ]

        # Profile enrichment
        enriched = profiles_by_name.get(norm_name)
        if enriched:
            if enriched.get('occupation'):
                profile['occupation'] = enriched['occupation']
            if enriched.get('dob'):
                profile['dob'] = enriched['dob']

        people.append(profile)

    # Sort: serving first, then former, then now_mp, then candidates. Within each: most elections first
    status_order = {'serving': 0, 'now_mp': 1, 'former': 2, 'candidate': 3}
    people.sort(key=lambda p: (status_order.get(p['status'], 9), -p['elections_fought']))

    # ── Build summary stats ──
    summary = {
        'total_people': len(people),
        'serving': sum(1 for p in people if p['status'] == 'serving'),
        'former': sum(1 for p in people if p['status'] == 'former'),
        'now_mp': sum(1 for p in people if p['status'] == 'now_mp'),
        'candidates_only': sum(1 for p in people if p['status'] == 'candidate'),
        'party_switchers': sum(1 for p in people if p['party_switched']),
        'date_range': f"{min(p['first_election'] for p in people if p['first_election'])} to {max(p['last_election'] for p in people if p['last_election'])}",
        'by_party': {},
    }

    party_counts = defaultdict(int)
    for p in people:
        party_counts[p['current_party']] += 1
    summary['by_party'] = dict(sorted(party_counts.items(), key=lambda x: -x[1]))

    result = {
        'council_id': council_id,
        'last_updated': datetime.now().isoformat(),
        'summary': summary,
        'people': people,
    }

    # Write output
    out_path = out_dir / 'political_history.json'
    with open(out_path, 'w') as f:
        json.dump(result, f, indent=2, ensure_ascii=False, default=str)
    log.info(f"Wrote {out_path}: {len(people)} people ({summary['serving']} serving, {summary['former']} former, {summary['party_switchers']} party switchers)")

    return result


def main():
    parser = argparse.ArgumentParser(description='Build political history profiles from election data')
    parser.add_argument('--council', type=str, help='Single council ID')
    args = parser.parse_args()

    councils = [args.council] if args.council else COUNCILS

    for council_id in councils:
        council_dir = DATA_DIR / council_id
        if not council_dir.exists():
            log.warning(f"No data directory for {council_id} — skipping")
            continue
        try:
            build_political_history(council_id)
        except Exception as e:
            log.error(f"Failed to build political history for {council_id}: {e}")


if __name__ == '__main__':
    main()
