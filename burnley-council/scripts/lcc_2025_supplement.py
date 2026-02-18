#!/usr/bin/env python3
"""
lcc_2025_supplement.py — Add LCC 2025 county council election results to elections.json

The DCLEAPIL dataset only covers 2006-2024. LCC had elections on 1 May 2025
where Reform UK won 52 of 84 seats in a historic landslide.

This script parses the official results PDF (already downloaded) and injects
2025 results into lancashire_cc/elections.json.

Usage:
    python3 lcc_2025_supplement.py
"""

import json
import os
import re
from collections import defaultdict

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, '..', 'data')
ELECTIONS_PATH = os.path.join(DATA_DIR, 'lancashire_cc', 'elections.json')

# Party normalisation (matching elections_etl.py)
PARTY_MAP = {
    'Reform UK': 'Reform UK',
    'Conservative': 'Conservative',
    'The Conservative Party': 'Conservative',
    'Labour Party': 'Labour',
    'Labour': 'Labour',
    'Labour and Co-operative': 'Labour & Co-operative',
    'Liberal Democrat': 'Liberal Democrats',
    'Liberal Democrats': 'Liberal Democrats',
    'Green': 'Green Party',
    'Green Party': 'Green Party',
    'The Green Party': 'Green Party',
    'Independent': 'Independent',
    'UK Independence Party': 'UKIP',
    'Trade Unionist and Socialist Coalition': 'TUSC',
    'Our West Lancashire': 'Our West Lancashire',
    'Workers Party of Britain': 'Workers Party',
    'Alliance for Democracy and Freedom': 'Alliance for Democracy and Freedom',
}

def normalise_party(raw):
    raw = raw.strip()
    if raw in PARTY_MAP:
        return PARTY_MAP[raw]
    if 'independent' in raw.lower():
        return 'Independent'
    return raw

# ----- ALL 84 DIVISION RESULTS (parsed from official Lancashire CC PDF) -----
# Source: https://www.lancashire.gov.uk/media/962973/2025-05-01-results-per-division-1.pdf

LCC_2025_RESULTS = [
    # Burnley divisions
    {"division": "Burnley Central East", "electorate": 11882, "candidates": [
        {"name": "Alex Hall", "party": "Green Party", "votes": 292, "elected": False},
        {"name": "Gavin Theaker", "party": "Reform UK", "votes": 1089, "elected": False},
        {"name": "Hannah Till", "party": "Labour", "votes": 485, "elected": False},
        {"name": "Javad Mokhammad", "party": "Independent", "votes": 68, "elected": False},
        {"name": "Maheen Kamran", "party": "Independent", "votes": 1357, "elected": True},
        {"name": "Rayyan Fiass", "party": "Workers Party", "votes": 39, "elected": False},
        {"name": "Simon John Bonney", "party": "Conservative", "votes": 255, "elected": False},
    ]},
    {"division": "Burnley Central West", "electorate": 10655, "candidates": [
        {"name": "Don Whitaker", "party": "Conservative", "votes": 770, "elected": False},
        {"name": "Dylan Manning", "party": "Labour", "votes": 375, "elected": False},
        {"name": "Frank Bartram", "party": "Liberal Democrats", "votes": 153, "elected": False},
        {"name": "Liam Thomson", "party": "Reform UK", "votes": 1387, "elected": True},
        {"name": "Martyn Hurt", "party": "Green Party", "votes": 516, "elected": False},
    ]},
    {"division": "Burnley North East", "electorate": 11085, "candidates": [
        {"name": "Cheryl Louise Semple", "party": "Labour", "votes": 372, "elected": False},
        {"name": "Jim Halstead", "party": "Reform UK", "votes": 903, "elected": False},
        {"name": "Julie Ann Hurt", "party": "Green Party", "votes": 168, "elected": False},
        {"name": "Susan Nutter", "party": "Conservative", "votes": 242, "elected": False},
        {"name": "Usman Arif", "party": "Independent", "votes": 2430, "elected": True},
    ]},
    {"division": "Burnley Rural", "electorate": 11357, "candidates": [
        {"name": "Cosima Towneley", "party": "Conservative", "votes": 846, "elected": False},
        {"name": "Gemma Haigh", "party": "Labour", "votes": 281, "elected": False},
        {"name": "Gordon Birtwistle", "party": "Liberal Democrats", "votes": 823, "elected": False},
        {"name": "Jack Simon Launer", "party": "Green Party", "votes": 447, "elected": False},
        {"name": "Mark Poulton", "party": "Reform UK", "votes": 1798, "elected": True},
    ]},
    {"division": "Burnley South West", "electorate": 11844, "candidates": [
        {"name": "Daniel Thomas Andrew Tierney", "party": "Labour", "votes": 494, "elected": False},
        {"name": "Eddie Kutavicius", "party": "Reform UK", "votes": 1659, "elected": True},
        {"name": "Jane Curran", "party": "Green Party", "votes": 194, "elected": False},
        {"name": "Jeff Sumner", "party": "Liberal Democrats", "votes": 588, "elected": False},
        {"name": "Neil Mottershead", "party": "Conservative", "votes": 505, "elected": False},
    ]},
    {"division": "Padiham and Burnley West", "electorate": 10612, "candidates": [
        {"name": "Alan Hosker", "party": "Conservative", "votes": 1151, "elected": False},
        {"name": "Daniel Armitage", "party": "Labour", "votes": 489, "elected": False},
        {"name": "Janet Hall", "party": "Green Party", "votes": 225, "elected": False},
        {"name": "Melissa Semmens", "party": "Independent", "votes": 41, "elected": False},
        {"name": "Thomas Pickup", "party": "Reform UK", "votes": 1483, "elected": True},
    ]},
    # Chorley divisions
    {"division": "Chorley Central", "electorate": 11434, "candidates": [
        {"name": "Chris Snow", "party": "Labour", "votes": 1307, "elected": True},
        {"name": "Debbie Brotherton", "party": "Green Party", "votes": 383, "elected": False},
        {"name": "Jennifer Jane Hurley", "party": "TUSC", "votes": 96, "elected": False},
        {"name": "Michaela Cmorej", "party": "Reform UK", "votes": 1300, "elected": False},
        {"name": "Peter Malpas", "party": "Conservative", "votes": 594, "elected": False},
    ]},
    {"division": "Chorley North", "electorate": 9937, "candidates": [
        {"name": "Aamir Khansaheb", "party": "TUSC", "votes": 72, "elected": False},
        {"name": "Anne Calderbank", "party": "Green Party", "votes": 251, "elected": False},
        {"name": "Hasina Khan", "party": "Labour", "votes": 984, "elected": False},
        {"name": "Martin Topp", "party": "Reform UK", "votes": 1140, "elected": True},
        {"name": "Moira Crawford", "party": "Independent", "votes": 23, "elected": False},
        {"name": "Sam Chapman", "party": "Conservative", "votes": 306, "elected": False},
    ]},
    {"division": "Chorley Rural East", "electorate": 9944, "candidates": [
        {"name": "David Golden", "party": "Liberal Democrats", "votes": 118, "elected": False},
        {"name": "Greg Heath", "party": "Reform UK", "votes": 1263, "elected": False},
        {"name": "Kim Snape", "party": "Labour", "votes": 1667, "elected": True},
        {"name": "Simon Cash", "party": "Green Party", "votes": 179, "elected": False},
        {"name": "Sue Baines", "party": "Conservative", "votes": 414, "elected": False},
    ]},
    {"division": "Chorley Rural West", "electorate": 10832, "candidates": [
        {"name": "Alan Whittaker", "party": "Labour", "votes": 1249, "elected": False},
        {"name": "Braeden Irvine", "party": "Conservative", "votes": 931, "elected": False},
        {"name": "Mark Wade", "party": "Reform UK", "votes": 1614, "elected": True},
        {"name": "Rowan Patrick Power", "party": "Liberal Democrats", "votes": 252, "elected": False},
        {"name": "Sef Churchill", "party": "Green Party", "votes": 182, "elected": False},
    ]},
    {"division": "Chorley South", "electorate": 11883, "candidates": [
        {"name": "Christine Turner", "party": "Conservative", "votes": 206, "elected": False},
        {"name": "Julia Louise Berry", "party": "Labour", "votes": 825, "elected": False},
        {"name": "Lee Hutchinson", "party": "Reform UK", "votes": 1472, "elected": True},
        {"name": "Olga Cash", "party": "Green Party", "votes": 1009, "elected": False},
        {"name": "Zoe Anastasia Curtis", "party": "Liberal Democrats", "votes": 98, "elected": False},
    ]},
    {"division": "Clayton with Whittle", "electorate": 11219, "candidates": [
        {"name": "Amy Louise Coxley", "party": "Green Party", "votes": 187, "elected": False},
        {"name": "Carole Ann Sasaki", "party": "TUSC", "votes": 22, "elected": False},
        {"name": "Gail Patricia Ormston", "party": "Liberal Democrats", "votes": 198, "elected": False},
        {"name": "George David Ikin", "party": "Reform UK", "votes": 1320, "elected": False},
        {"name": "Greg Morgan", "party": "Conservative", "votes": 653, "elected": False},
        {"name": "Mark Edward Clifford", "party": "Labour", "votes": 1411, "elected": True},
    ]},
    {"division": "Euxton, Buckshaw & Astley", "electorate": 12921, "candidates": [
        {"name": "Aidy Riggott", "party": "Conservative", "votes": 1507, "elected": True},
        {"name": "Gillian Frances Sharples", "party": "Labour", "votes": 1167, "elected": False},
        {"name": "Jacob Neal", "party": "TUSC", "votes": 30, "elected": False},
        {"name": "Jonathan Close", "party": "Reform UK", "votes": 1477, "elected": False},
        {"name": "Mark Frost", "party": "Liberal Democrats", "votes": 147, "elected": False},
        {"name": "Pauline Margaret Summers", "party": "Green Party", "votes": 240, "elected": False},
    ]},
    {"division": "Hoghton with Wheelton", "electorate": 9744, "candidates": [
        {"name": "Alan Cullens", "party": "Conservative", "votes": 679, "elected": False},
        {"name": "John Clemson", "party": "Reform UK", "votes": 1277, "elected": True},
        {"name": "Jon Royle", "party": "Green Party", "votes": 227, "elected": False},
        {"name": "Mike Graham", "party": "Labour", "votes": 1029, "elected": False},
        {"name": "Penelope Dawber", "party": "TUSC", "votes": 52, "elected": False},
        {"name": "Stephen John Fenn", "party": "Liberal Democrats", "votes": 175, "elected": False},
    ]},
    # Fylde divisions
    {"division": "Fylde East", "electorate": 11836, "candidates": [
        {"name": "Brenden Wilkinson", "party": "Green Party", "votes": 148, "elected": False},
        {"name": "Edward Oldfield", "party": "Independent", "votes": 455, "elected": False},
        {"name": "Joshua Connor Roberts", "party": "Reform UK", "votes": 1314, "elected": True},
        {"name": "Peter Collins", "party": "Independent", "votes": 820, "elected": False},
        {"name": "Phil Glaysher", "party": "Labour", "votes": 325, "elected": False},
        {"name": "Tony Wellings", "party": "Conservative", "votes": 767, "elected": False},
    ]},
    {"division": "Fylde South", "electorate": 10532, "candidates": [
        {"name": "David Michael Dwyer", "party": "Reform UK", "votes": 1310, "elected": True},
        {"name": "Jayne Walsh", "party": "Green Party", "votes": 306, "elected": False},
        {"name": "Jed Sullivan", "party": "Labour", "votes": 327, "elected": False},
        {"name": "Noreen Griffiths", "party": "Independent", "votes": 477, "elected": False},
        {"name": "Sandra Pitman", "party": "Conservative", "votes": 1126, "elected": False},
    ]},
    {"division": "Fylde West", "electorate": 10693, "candidates": [
        {"name": "John Rossall Singleton", "party": "Conservative", "votes": 1563, "elected": True},
        {"name": "Mark St. John Qualter", "party": "Reform UK", "votes": 1381, "elected": False},
        {"name": "Natalya Kristen Ganley Stone", "party": "Labour", "votes": 447, "elected": False},
        {"name": "Peter Walsh", "party": "Green Party", "votes": 272, "elected": False},
    ]},
    {"division": "Lytham", "electorate": 10264, "candidates": [
        {"name": "Alan Norris", "party": "Labour", "votes": 262, "elected": False},
        {"name": "Carole Elaine Harrison", "party": "Independent", "votes": 90, "elected": False},
        {"name": "Christine Marshall", "party": "Liberal Democrats", "votes": 115, "elected": False},
        {"name": "David Green", "party": "Reform UK", "votes": 728, "elected": False},
        {"name": "Mark Bamforth", "party": "Independent", "votes": 1516, "elected": False},
        {"name": "Robin Darling", "party": "Green Party", "votes": 84, "elected": False},
        {"name": "Tim Ashton", "party": "Conservative", "votes": 1868, "elected": True},
    ]},
    {"division": "St Annes North", "electorate": 10781, "candidates": [
        {"name": "Debra Karen Challinor", "party": "Reform UK", "votes": 1223, "elected": False},
        {"name": "Joanne Gardner", "party": "Liberal Democrats", "votes": 618, "elected": False},
        {"name": "Peter Andrew Cranie", "party": "Green Party", "votes": 97, "elected": False},
        {"name": "Peter Ian Buckley", "party": "Conservative", "votes": 1224, "elected": True},
        {"name": "Peter Tavernor", "party": "Labour", "votes": 411, "elected": False},
        {"name": "Valerie Lewis-Williams", "party": "Alliance for Democracy and Freedom", "votes": 29, "elected": False},
    ]},
    {"division": "St Annes South", "electorate": 11230, "candidates": [
        {"name": "Cheryl Morrison", "party": "Alliance for Democracy and Freedom", "votes": 42, "elected": False},
        {"name": "Gus Scott", "party": "Reform UK", "votes": 1204, "elected": False},
        {"name": "Maria Deery", "party": "Green Party", "votes": 147, "elected": False},
        {"name": "Stephen Robert Edward Phillips", "party": "Liberal Democrats", "votes": 475, "elected": False},
        {"name": "Steve Rigby", "party": "Conservative", "votes": 1375, "elected": True},
        {"name": "Viki Miller", "party": "Labour", "votes": 618, "elected": False},
    ]},
    # Hyndburn divisions
    {"division": "Accrington North", "electorate": 10330, "candidates": [
        {"name": "Clare Pritchard", "party": "Labour", "votes": 683, "elected": False},
        {"name": "Joel Michael Tetlow", "party": "Reform UK", "votes": 1615, "elected": True},
        {"name": "Julie Carole Stubbins", "party": "Green Party", "votes": 355, "elected": False},
        {"name": "Shahed Mahmood", "party": "Conservative", "votes": 444, "elected": False},
    ]},
    {"division": "Accrington South", "electorate": 9919, "candidates": [
        {"name": "Ashley Joynes", "party": "Reform UK", "votes": 1297, "elected": True},
        {"name": "Charlie Derry Kerans", "party": "Green Party", "votes": 292, "elected": False},
        {"name": "David James Heap", "party": "Conservative", "votes": 1000, "elected": False},
        {"name": "Graham Jones", "party": "Labour", "votes": 967, "elected": False},
    ]},
    {"division": "Accrington West & Oswaldtwistle Central", "electorate": 11144, "candidates": [
        {"name": "Isaac John Cowans", "party": "Reform UK", "votes": 765, "elected": False},
        {"name": "Mohammed Younis", "party": "Conservative", "votes": 1204, "elected": False},
        {"name": "Munsif Dad", "party": "Labour", "votes": 1058, "elected": False},
        {"name": "Sohail Asghar", "party": "Green Party", "votes": 1337, "elected": True},
    ]},
    {"division": "Great Harwood, Rishton & Clayton-le-Moors", "electorate": 19723, "seats": 2, "candidates": [
        {"name": "Andy Hunter-Rossall", "party": "Green Party", "votes": 308, "elected": False},
        {"name": "Carole Anne Haythornthwaite", "party": "Conservative", "votes": 1208, "elected": False},
        {"name": "Jordan John Fox", "party": "Reform UK", "votes": 3292, "elected": True},
        {"name": "Kate Walsh", "party": "Labour", "votes": 1797, "elected": False},
        {"name": "Lance Miles Lee Parkinson", "party": "Reform UK", "votes": 3184, "elected": True},
        {"name": "Noordad Aziz", "party": "Labour", "votes": 2153, "elected": False},
        {"name": "Wayne Fitzharris", "party": "Green Party", "votes": 582, "elected": False},
        {"name": "Zak Khan", "party": "Conservative", "votes": 836, "elected": False},
    ]},
    {"division": "Oswaldtwistle", "electorate": 9650, "candidates": [
        {"name": "Caitlin Pritchard", "party": "Labour", "votes": 406, "elected": False},
        {"name": "Gaynor Louise Hargreaves", "party": "Reform UK", "votes": 1475, "elected": True},
        {"name": "Nancy Mills", "party": "Green Party", "votes": 157, "elected": False},
        {"name": "Peter Britcliffe", "party": "Conservative", "votes": 1467, "elected": False},
    ]},
    # Lancaster divisions
    {"division": "Heysham", "electorate": 11319, "candidates": [
        {"name": "Andrew Paul Gardiner", "party": "Conservative", "votes": 511, "elected": False},
        {"name": "Catherine Potter", "party": "Labour", "votes": 906, "elected": False},
        {"name": "George Paul Thomson", "party": "Green Party", "votes": 159, "elected": False},
        {"name": "Graeme Paul Austin", "party": "Reform UK", "votes": 1633, "elected": True},
        {"name": "Sheldon Kent", "party": "Liberal Democrats", "votes": 149, "elected": False},
    ]},
    {"division": "Lancaster Central", "electorate": 10837, "candidates": [
        {"name": "Derek Kaye", "party": "Liberal Democrats", "votes": 112, "elected": False},
        {"name": "Fran Wild", "party": "Labour", "votes": 500, "elected": False},
        {"name": "Gina Dowding", "party": "Green Party", "votes": 2157, "elected": True},
        {"name": "Rob Kelly", "party": "Reform UK", "votes": 765, "elected": False},
        {"name": "Thomas William Inman", "party": "Conservative", "votes": 235, "elected": False},
    ]},
    {"division": "Lancaster East", "electorate": 11907, "candidates": [
        {"name": "Connor James Winter", "party": "Conservative", "votes": 118, "elected": False},
        {"name": "Michael Sean Kershaw", "party": "Reform UK", "votes": 496, "elected": False},
        {"name": "Paul Byron Stubbins", "party": "Green Party", "votes": 1822, "elected": True},
        {"name": "Phil Dunster", "party": "Liberal Democrats", "votes": 87, "elected": False},
        {"name": "Sam Elliot Charlesworth", "party": "Labour", "votes": 850, "elected": False},
    ]},
    {"division": "Lancaster Rural East", "electorate": 10700, "candidates": [
        {"name": "Geoff Eales", "party": "Labour", "votes": 445, "elected": False},
        {"name": "Matthew Joseph Maxwell-Scott", "party": "Conservative", "votes": 920, "elected": False},
        {"name": "Peter James Jackson", "party": "Liberal Democrats", "votes": 1118, "elected": False},
        {"name": "Sally Ann Shelley Maddocks", "party": "Green Party", "votes": 742, "elected": False},
        {"name": "Shaun Patrick Crimmins", "party": "Reform UK", "votes": 1149, "elected": True},
    ]},
    {"division": "Lancaster Rural North", "electorate": 10080, "candidates": [
        {"name": "Alan Greenwell", "party": "Liberal Democrats", "votes": 391, "elected": False},
        {"name": "Graham John Dalton", "party": "Reform UK", "votes": 1159, "elected": True},
        {"name": "Phillippa Williamson", "party": "Conservative", "votes": 1130, "elected": False},
        {"name": "Sonny Remmer-Riley", "party": "Labour", "votes": 440, "elected": False},
        {"name": "Sue Tyldesley", "party": "Green Party", "votes": 713, "elected": False},
    ]},
    {"division": "Lancaster South East", "electorate": 11564, "candidates": [
        {"name": "Daniel Robert Kirk", "party": "Conservative", "votes": 193, "elected": False},
        {"name": "Erica Ruth Estelle Lewis", "party": "Labour", "votes": 809, "elected": False},
        {"name": "Hamish Mills", "party": "Green Party", "votes": 1719, "elected": True},
        {"name": "Lee David Garner", "party": "Reform UK", "votes": 590, "elected": False},
        {"name": "Malcolm Martin", "party": "Liberal Democrats", "votes": 102, "elected": False},
    ]},
    {"division": "Morecambe Central", "electorate": 11781, "candidates": [
        {"name": "Connor Frazer William Graham", "party": "Conservative", "votes": 119, "elected": False},
        {"name": "Gary Andrew Kniveton", "party": "Reform UK", "votes": 1104, "elected": True},
        {"name": "Margaret Pattison", "party": "Labour", "votes": 656, "elected": False},
        {"name": "Patrick McMurray", "party": "Green Party", "votes": 118, "elected": False},
        {"name": "Paul Bernard Hart", "party": "Liberal Democrats", "votes": 919, "elected": False},
    ]},
    {"division": "Morecambe North", "electorate": 10279, "candidates": [
        {"name": "Jackson Stubbs", "party": "Labour", "votes": 696, "elected": False},
        {"name": "James Pilling", "party": "Liberal Democrats", "votes": 449, "elected": False},
        {"name": "Russell Robert Walsh", "party": "Reform UK", "votes": 1613, "elected": True},
        {"name": "Sara-Louise Dobson", "party": "Green Party", "votes": 355, "elected": False},
        {"name": "Stuart Morris", "party": "Conservative", "votes": 752, "elected": False},
    ]},
    {"division": "Morecambe South", "electorate": 11564, "candidates": [
        {"name": "Bill Jackson", "party": "Liberal Democrats", "votes": 429, "elected": False},
        {"name": "Brian Edward Moore", "party": "Reform UK", "votes": 1407, "elected": True},
        {"name": "Keith William Budden", "party": "Conservative", "votes": 453, "elected": False},
        {"name": "Martin Gawith", "party": "Labour", "votes": 619, "elected": False},
        {"name": "Melanie Forrest", "party": "Green Party", "votes": 174, "elected": False},
    ]},
    {"division": "Skerton", "electorate": 10162, "candidates": [
        {"name": "Andrew Robert Otway", "party": "Green Party", "votes": 740, "elected": False},
        {"name": "Charles Edwards", "party": "Conservative", "votes": 261, "elected": False},
        {"name": "Hilda Jean Parr", "party": "Labour", "votes": 584, "elected": False},
        {"name": "James Harvey", "party": "Liberal Democrats", "votes": 118, "elected": False},
        {"name": "Martyn Sutton", "party": "Reform UK", "votes": 1068, "elected": True},
    ]},
    # Pendle divisions
    {"division": "Brierfield and Nelson West", "electorate": 12586, "candidates": [
        {"name": "Christine Stables", "party": "Reform UK", "votes": 532, "elected": False},
        {"name": "Irfan Ayub", "party": "Conservative", "votes": 518, "elected": False},
        {"name": "Karl Peter Barnsley", "party": "Labour", "votes": 262, "elected": False},
        {"name": "Mohammed Iqbal", "party": "Independent", "votes": 2928, "elected": True},
        {"name": "Scott Cunliffe", "party": "Green Party", "votes": 113, "elected": False},
        {"name": "Susan Land", "party": "Liberal Democrats", "votes": 105, "elected": False},
    ]},
    {"division": "Nelson East", "electorate": 12250, "candidates": [
        {"name": "Azhar Ali", "party": "Independent", "votes": 1976, "elected": True},
        {"name": "Les Beswick", "party": "UKIP", "votes": 18, "elected": False},
        {"name": "Mary Elizabeth Thomas", "party": "Liberal Democrats", "votes": 122, "elected": False},
        {"name": "Mohammad Aslam", "party": "Conservative", "votes": 1102, "elected": False},
        {"name": "Nicki James Shepherd", "party": "Labour", "votes": 305, "elected": False},
        {"name": "Rebecca Aimee Lanyon Willmott", "party": "Green Party", "votes": 101, "elected": False},
        {"name": "Vanessa Maria Robinson", "party": "Reform UK", "votes": 772, "elected": False},
    ]},
    {"division": "Pendle Central", "electorate": 10881, "candidates": [
        {"name": "Andy Bell", "party": "Liberal Democrats", "votes": 694, "elected": False},
        {"name": "Ash Sutcliffe", "party": "Conservative", "votes": 868, "elected": False},
        {"name": "Benjamin Daniel Harrop", "party": "Green Party", "votes": 118, "elected": False},
        {"name": "Marion Ellen Atkinson", "party": "Reform UK", "votes": 1417, "elected": True},
        {"name": "Philip Heyworth", "party": "Labour", "votes": 245, "elected": False},
    ]},
    {"division": "Pendle Hill", "electorate": 11549, "candidates": [
        {"name": "Annette Marti", "party": "Green Party", "votes": 206, "elected": False},
        {"name": "Brian Newman", "party": "Liberal Democrats", "votes": 467, "elected": False},
        {"name": "Howard Hartley", "party": "Conservative", "votes": 1599, "elected": True},
        {"name": "John Metcalfe", "party": "Reform UK", "votes": 1352, "elected": False},
        {"name": "Mark Benjamin Dawson", "party": "Labour", "votes": 551, "elected": False},
    ]},
    {"division": "Pendle Rural", "electorate": 21315, "seats": 2, "candidates": [
        {"name": "David Hartley", "party": "Liberal Democrats", "votes": 2314, "elected": False},
        {"name": "David Michael Baxter Whipp", "party": "Liberal Democrats", "votes": 2869, "elected": True},
        {"name": "Euan Robert Clouston", "party": "Labour", "votes": 431, "elected": False},
        {"name": "Jane Pratt", "party": "Conservative", "votes": 1689, "elected": False},
        {"name": "Jane Wood", "party": "Green Party", "votes": 293, "elected": False},
        {"name": "Jenny Purcell", "party": "Conservative", "votes": 1977, "elected": False},
        {"name": "Lynn Marie Hannon", "party": "Labour", "votes": 399, "elected": False},
        {"name": "Nathan Thomas McCollum", "party": "Reform UK", "votes": 2454, "elected": True},
        {"name": "Sylvia Joyce Godfrey", "party": "Green Party", "votes": 327, "elected": False},
        {"name": "Victoria Fletcher", "party": "Reform UK", "votes": 2416, "elected": False},
    ]},
    # Preston divisions
    {"division": "Preston Central East", "electorate": 12116, "candidates": [
        {"name": "Al-Yasa Khan", "party": "Conservative", "votes": 189, "elected": False},
        {"name": "Callum Taylor", "party": "Green Party", "votes": 107, "elected": False},
        {"name": "Darrin Anthony Greggans", "party": "Reform UK", "votes": 556, "elected": False},
        {"name": "Frank De Molfetta", "party": "Labour", "votes": 884, "elected": False},
        {"name": "George Kulbacki", "party": "Liberal Democrats", "votes": 204, "elected": False},
        {"name": "Michael Lavalette", "party": "Independent", "votes": 1782, "elected": True},
    ]},
    {"division": "Preston Central West", "electorate": 13282, "candidates": [
        {"name": "Frankie Kennedy", "party": "Conservative", "votes": 264, "elected": False},
        {"name": "Jennifer Robinson", "party": "Green Party", "votes": 209, "elected": False},
        {"name": "Joe Custodio", "party": "Reform UK", "votes": 713, "elected": False},
        {"name": "Matthew John Brown", "party": "Labour & Co-operative", "votes": 799, "elected": True},
        {"name": "Mike Peak", "party": "Liberal Democrats", "votes": 578, "elected": False},
    ]},
    {"division": "Preston City", "electorate": 12692, "candidates": [
        {"name": "Connor Joseph Dwyer", "party": "Labour & Co-operative", "votes": 893, "elected": False},
        {"name": "Holly Harrison", "party": "Green Party", "votes": 194, "elected": False},
        {"name": "Julie Van Mierlo", "party": "Liberal Democrats", "votes": 186, "elected": False},
        {"name": "Scott Andrew Pye", "party": "Reform UK", "votes": 476, "elected": False},
        {"name": "Tayo Korede", "party": "Conservative", "votes": 193, "elected": False},
        {"name": "Yousuf Motala", "party": "Independent", "votes": 989, "elected": True},
    ]},
    {"division": "Preston East", "electorate": 10927, "candidates": [
        {"name": "Anna Josephine Hindle", "party": "Labour & Co-operative", "votes": 748, "elected": False},
        {"name": "Edward Craven", "party": "Liberal Democrats", "votes": 242, "elected": False},
        {"name": "Geoffrey Allan Fielden", "party": "TUSC", "votes": 48, "elected": False},
        {"name": "John Paul Ross", "party": "Green Party", "votes": 146, "elected": False},
        {"name": "Keith Sedgewick", "party": "Conservative", "votes": 364, "elected": False},
        {"name": "Luke Parker", "party": "Reform UK", "votes": 1181, "elected": True},
    ]},
    {"division": "Preston North", "electorate": 11325, "candidates": [
        {"name": "Alex Harry Charles Sharples", "party": "Reform UK", "votes": 938, "elected": False},
        {"name": "Charles Parkinson", "party": "Green Party", "votes": 122, "elected": False},
        {"name": "Fiona Duke", "party": "Liberal Democrats", "votes": 1601, "elected": True},
        {"name": "Maxwell Owen Green", "party": "Conservative", "votes": 736, "elected": False},
        {"name": "Qasim Silman Ajmi", "party": "Independent", "votes": 220, "elected": False},
        {"name": "Samir Vohra", "party": "Labour", "votes": 513, "elected": False},
    ]},
    {"division": "Preston Rural", "electorate": 15876, "candidates": [
        {"name": "Daniel Guise", "party": "Liberal Democrats", "votes": 1496, "elected": False},
        {"name": "Maria Jones", "party": "Reform UK", "votes": 1876, "elected": True},
        {"name": "Millie Barber", "party": "Green Party", "votes": 245, "elected": False},
        {"name": "Sue Whittam", "party": "Conservative", "votes": 1253, "elected": False},
        {"name": "Valerie Wise", "party": "Labour & Co-operative", "votes": 559, "elected": False},
    ]},
    {"division": "Preston South East", "electorate": 11928, "candidates": [
        {"name": "Almas Razakazi", "party": "Independent", "votes": 750, "elected": True},
        {"name": "Andy Pratt", "party": "Conservative", "votes": 152, "elected": False},
        {"name": "Jenny Mein", "party": "Labour & Co-operative", "votes": 709, "elected": False},
        {"name": "John Rutter", "party": "Liberal Democrats", "votes": 128, "elected": False},
        {"name": "Marion Seed", "party": "Green Party", "votes": 104, "elected": False},
        {"name": "Nigel Leith Wilson", "party": "Reform UK", "votes": 714, "elected": False},
    ]},
    {"division": "Preston South West", "electorate": 10950, "candidates": [
        {"name": "Emma Ruth Mead", "party": "Independent", "votes": 58, "elected": False},
        {"name": "Kevin Brockbank", "party": "Conservative", "votes": 183, "elected": False},
        {"name": "Laura Jane Dalton", "party": "Green Party", "votes": 116, "elected": False},
        {"name": "Lee Slater", "party": "Reform UK", "votes": 1145, "elected": False},
        {"name": "Mark Jewell", "party": "Liberal Democrats", "votes": 1411, "elected": True},
        {"name": "Nweeda Khan", "party": "Labour", "votes": 638, "elected": False},
    ]},
    {"division": "Preston West", "electorate": 12201, "candidates": [
        {"name": "Dan Thompson", "party": "Green Party", "votes": 134, "elected": False},
        {"name": "Jemma Louise Rushe", "party": "Reform UK", "votes": 1150, "elected": False},
        {"name": "John Potter", "party": "Liberal Democrats", "votes": 1652, "elected": True},
        {"name": "Michael Christopher McGowan", "party": "Labour", "votes": 321, "elected": False},
        {"name": "Trevor Hart", "party": "Conservative", "votes": 597, "elected": False},
    ]},
    # Ribble Valley divisions
    {"division": "Clitheroe", "electorate": 13553, "candidates": [
        {"name": "Anne Elizabeth Peplow", "party": "Green Party", "votes": 225, "elected": False},
        {"name": "Ian Frank Brown", "party": "Independent", "votes": 472, "elected": False},
        {"name": "Mike Graveston", "party": "Labour", "votes": 720, "elected": False},
        {"name": "Simon O'Rourke", "party": "Liberal Democrats", "votes": 1099, "elected": False},
        {"name": "Sue Hind", "party": "Conservative", "votes": 778, "elected": False},
        {"name": "Warren Goldsworthy", "party": "Reform UK", "votes": 1516, "elected": True},
    ]},
    {"division": "Longridge with Bowland", "electorate": 11333, "candidates": [
        {"name": "Adam McMeekin", "party": "Green Party", "votes": 160, "elected": False},
        {"name": "Ian Duxbury", "party": "Reform UK", "votes": 1534, "elected": True},
        {"name": "Kieren Spencer", "party": "Labour", "votes": 1020, "elected": False},
        {"name": "Peter Lawrence", "party": "Liberal Democrats", "votes": 136, "elected": False},
        {"name": "Robert Walker", "party": "Independent", "votes": 666, "elected": False},
        {"name": "Stuart Hirst", "party": "Conservative", "votes": 940, "elected": False},
    ]},
    {"division": "Ribble Valley North East", "electorate": 13054, "candidates": [
        {"name": "David Berryman", "party": "Conservative", "votes": 1285, "elected": False},
        {"name": "David Birtwhistle", "party": "Independent", "votes": 476, "elected": False},
        {"name": "Ged Mirfin", "party": "Reform UK", "votes": 1959, "elected": True},
        {"name": "Malcolm Charles Peplow", "party": "Green Party", "votes": 582, "elected": False},
        {"name": "Mike Willcox", "party": "Labour", "votes": 557, "elected": False},
        {"name": "Stephen Mark Sutcliffe", "party": "Liberal Democrats", "votes": 239, "elected": False},
    ]},
    {"division": "Ribble Valley South West", "electorate": 11480, "candidates": [
        {"name": "Alan Schofield", "party": "Conservative", "votes": 1142, "elected": False},
        {"name": "Gaye Tomasine McCrum", "party": "Green Party", "votes": 216, "elected": False},
        {"name": "John Russell Fletcher", "party": "Independent", "votes": 301, "elected": False},
        {"name": "Mary Robinson", "party": "Liberal Democrats", "votes": 226, "elected": False},
        {"name": "Richard Ian Charles Horton", "party": "Labour", "votes": 552, "elected": False},
        {"name": "Steve Atkinson", "party": "Reform UK", "votes": 2174, "elected": True},
    ]},
    # Rossendale divisions
    {"division": "Mid Rossendale", "electorate": 11623, "candidates": [
        {"name": "Bob Bauld", "party": "Green Party", "votes": 466, "elected": False},
        {"name": "Clive Balchin", "party": "Reform UK", "votes": 1895, "elected": True},
        {"name": "John Peter Greenwood", "party": "Conservative", "votes": 682, "elected": False},
        {"name": "Sean Joseph Michael Serridge", "party": "Labour", "votes": 1292, "elected": False},
    ]},
    {"division": "Rossendale East", "electorate": 10182, "candidates": [
        {"name": "Jackie Oakes", "party": "Labour", "votes": 799, "elected": False},
        {"name": "Jenny Rigby", "party": "Conservative", "votes": 333, "elected": False},
        {"name": "Julie Adshead", "party": "Green Party", "votes": 516, "elected": False},
        {"name": "Mackenzie Lee Ritson", "party": "Reform UK", "votes": 1963, "elected": True},
        {"name": "Mark Dexter Hillier", "party": "Liberal Democrats", "votes": 196, "elected": False},
    ]},
    {"division": "Rossendale South", "electorate": 9680, "candidates": [
        {"name": "Joanne Ash", "party": "Reform UK", "votes": 1512, "elected": True},
        {"name": "John Payne", "party": "Green Party", "votes": 346, "elected": False},
        {"name": "Liz McInnes", "party": "Labour", "votes": 1022, "elected": False},
        {"name": "Simon Holland", "party": "Conservative", "votes": 802, "elected": False},
    ]},
    {"division": "Rossendale West", "electorate": 10557, "candidates": [
        {"name": "Jacob Rorke", "party": "Green Party", "votes": 276, "elected": False},
        {"name": "Jamie Warren Rippingale", "party": "Reform UK", "votes": 1334, "elected": False},
        {"name": "Margaret Pendlebury", "party": "Conservative", "votes": 636, "elected": False},
        {"name": "Samara Barnes", "party": "Labour", "votes": 1364, "elected": True},
    ]},
    {"division": "Whitworth & Bacup", "electorate": 10133, "candidates": [
        {"name": "Daniel Robert Matchett", "party": "Reform UK", "votes": 1533, "elected": True},
        {"name": "Michelle Christianne Smith", "party": "Labour", "votes": 452, "elected": False},
        {"name": "Scott Smith", "party": "Conservative", "votes": 1292, "elected": False},
        {"name": "Vivienne Hall", "party": "Green Party", "votes": 210, "elected": False},
    ]},
    # South Ribble divisions
    {"division": "Leyland Central", "electorate": 10731, "candidates": [
        {"name": "Alan Swindells", "party": "Liberal Democrats", "votes": 195, "elected": False},
        {"name": "Arif Khansaheb", "party": "TUSC", "votes": 23, "elected": False},
        {"name": "Emma Elisabeth Winterleigh", "party": "Green Party", "votes": 118, "elected": False},
        {"name": "Hannah Alice Whalley", "party": "Reform UK", "votes": 1539, "elected": True},
        {"name": "Mary Green", "party": "Conservative", "votes": 399, "elected": False},
        {"name": "Matthew Vincent Tomlinson", "party": "Labour", "votes": 1099, "elected": False},
    ]},
    {"division": "Leyland South", "electorate": 10642, "candidates": [
        {"name": "Ceri Sian Turner", "party": "Green Party", "votes": 153, "elected": False},
        {"name": "Ellie Close", "party": "Reform UK", "votes": 1456, "elected": True},
        {"name": "Jayne Louise Rear", "party": "Conservative", "votes": 756, "elected": False},
        {"name": "Stephen Philip McHugh", "party": "Liberal Democrats", "votes": 271, "elected": False},
        {"name": "Tahir Khansaheb", "party": "TUSC", "votes": 26, "elected": False},
        {"name": "Wes Roberts", "party": "Labour", "votes": 959, "elected": False},
    ]},
    {"division": "Lostock Hall & Bamber Bridge", "electorate": 10976, "candidates": [
        {"name": "Clare Hunter", "party": "Labour", "votes": 846, "elected": False},
        {"name": "Jeff Couperthwaite", "party": "Conservative", "votes": 1089, "elected": False},
        {"name": "Samuel Paul Winterleigh", "party": "Green Party", "votes": 149, "elected": False},
        {"name": "Simon Gummer", "party": "Reform UK", "votes": 1331, "elected": True},
        {"name": "Tim Young", "party": "Liberal Democrats", "votes": 148, "elected": False},
    ]},
    {"division": "Moss Side and Farington", "electorate": 11191, "candidates": [
        {"name": "Andy Blake", "party": "Reform UK", "votes": 1371, "elected": True},
        {"name": "Anthony Sims", "party": "Green Party", "votes": 121, "elected": False},
        {"name": "Graham Michael Smith", "party": "Liberal Democrats", "votes": 157, "elected": False},
        {"name": "Michael Anthony Green", "party": "Conservative", "votes": 1196, "elected": False},
        {"name": "Paul Wharton-Hardman", "party": "Labour", "votes": 881, "elected": False},
    ]},
    {"division": "Penwortham East & Walton-le-Dale", "electorate": 10627, "candidates": [
        {"name": "Clare Burton-Johnson", "party": "Liberal Democrats", "votes": 191, "elected": False},
        {"name": "Elaine Stringfellow", "party": "Labour", "votes": 720, "elected": False},
        {"name": "Joan Mary Burrows", "party": "Conservative", "votes": 1056, "elected": False},
        {"name": "Lorenzo More", "party": "Reform UK", "votes": 1223, "elected": True},
        {"name": "Sue Broady", "party": "Green Party", "votes": 214, "elected": False},
    ]},
    {"division": "Penwortham West", "electorate": 11435, "candidates": [
        {"name": "David Howarth", "party": "Liberal Democrats", "votes": 2281, "elected": True},
        {"name": "Heike McMurray", "party": "Green Party", "votes": 158, "elected": False},
        {"name": "Ian Danny Watkinson", "party": "Labour", "votes": 549, "elected": False},
        {"name": "Paul Watson", "party": "Conservative", "votes": 310, "elected": False},
        {"name": "Wayne Griffiths", "party": "Reform UK", "votes": 1229, "elected": False},
    ]},
    {"division": "South Ribble East", "electorate": 11777, "candidates": [
        {"name": "Barrie Yates", "party": "Conservative", "votes": 982, "elected": False},
        {"name": "Chris Lomax", "party": "Labour", "votes": 940, "elected": False},
        {"name": "Clare Hales", "party": "Green Party", "votes": 184, "elected": False},
        {"name": "Fred Cottam", "party": "Reform UK", "votes": 1560, "elected": True},
        {"name": "Paul Anthony Valentine", "party": "Liberal Democrats", "votes": 190, "elected": False},
    ]},
    {"division": "South Ribble West", "electorate": 10962, "candidates": [
        {"name": "Angela Turner", "party": "Liberal Democrats", "votes": 458, "elected": False},
        {"name": "Christine Jane Winter", "party": "Green Party", "votes": 207, "elected": False},
        {"name": "Gareth Paul Watson", "party": "Conservative", "votes": 1382, "elected": False},
        {"name": "James Joseph Gleeson", "party": "Labour", "votes": 630, "elected": False},
        {"name": "Tom Lord", "party": "Reform UK", "votes": 1818, "elected": True},
    ]},
    # West Lancashire divisions
    {"division": "Burscough & Rufford", "electorate": 11015, "candidates": [
        {"name": "Eddie Pope", "party": "Conservative", "votes": 996, "elected": False},
        {"name": "Gareth Dowling", "party": "Labour", "votes": 1026, "elected": False},
        {"name": "Jeanette M Rimmer", "party": "Green Party", "votes": 243, "elected": False},
        {"name": "Neil Pollington", "party": "Liberal Democrats", "votes": 313, "elected": False},
        {"name": "Richard Edwards", "party": "Reform UK", "votes": 1416, "elected": True},
    ]},
    {"division": "Ormskirk", "electorate": 11134, "candidates": [
        {"name": "Bruce Porteous", "party": "Conservative", "votes": 287, "elected": False},
        {"name": "Gordon Paul Johnson", "party": "Our West Lancashire", "votes": 1585, "elected": True},
        {"name": "Nikki Hennessy", "party": "Labour", "votes": 1049, "elected": False},
        {"name": "Paul Greenall", "party": "Reform UK", "votes": 851, "elected": False},
        {"name": "Paul Hamby", "party": "Green Party", "votes": 206, "elected": False},
    ]},
    {"division": "Skelmersdale Central", "electorate": 11092, "candidates": [
        {"name": "Neil D Jackson", "party": "Green Party", "votes": 285, "elected": False},
        {"name": "Simon Evans", "party": "Reform UK", "votes": 1171, "elected": True},
        {"name": "Susan Carole Brake", "party": "Conservative", "votes": 101, "elected": False},
        {"name": "Terence Aldridge", "party": "Labour", "votes": 730, "elected": False},
        {"name": "Vincent John Lucker", "party": "Liberal Democrats", "votes": 191, "elected": False},
    ]},
    {"division": "Skelmersdale East", "electorate": 11019, "candidates": [
        {"name": "John Fillis", "party": "Labour", "votes": 830, "elected": False},
        {"name": "Julie Ann Peel", "party": "Conservative", "votes": 408, "elected": False},
        {"name": "Neil Ronald Pye", "party": "Our West Lancashire", "votes": 465, "elected": False},
        {"name": "Nigel Swales", "party": "Reform UK", "votes": 1420, "elected": True},
        {"name": "Paul French", "party": "Green Party", "votes": 290, "elected": False},
    ]},
    {"division": "Skelmersdale West", "electorate": 11355, "candidates": [
        {"name": "Edwin G Black", "party": "Green Party", "votes": 205, "elected": False},
        {"name": "Ella Worthington", "party": "Reform UK", "votes": 1304, "elected": True},
        {"name": "Julie Patricia Gibson", "party": "Labour", "votes": 744, "elected": False},
        {"name": "Peter John Chandler", "party": "Liberal Democrats", "votes": 205, "elected": False},
        {"name": "Ruth Melling", "party": "Conservative", "votes": 119, "elected": False},
        {"name": "Tom Marsh-Pritchard", "party": "Our West Lancashire", "votes": 544, "elected": False},
    ]},
    {"division": "West Lancashire East", "electorate": 10893, "candidates": [
        {"name": "Adrian Edward Owens", "party": "Our West Lancashire", "votes": 1472, "elected": True},
        {"name": "Damian John Owen", "party": "Labour", "votes": 632, "elected": False},
        {"name": "Ellis Thomas Newton", "party": "Reform UK", "votes": 898, "elected": False},
        {"name": "Richard S Taylor", "party": "Green Party", "votes": 222, "elected": False},
        {"name": "Robert Murrin Bailey", "party": "Conservative", "votes": 729, "elected": False},
    ]},
    {"division": "West Lancashire North", "electorate": 12113, "candidates": [
        {"name": "Anne Mary Fennell", "party": "Labour", "votes": 498, "elected": False},
        {"name": "Charlotte M Houltram", "party": "Green Party", "votes": 169, "elected": False},
        {"name": "Mike Harris", "party": "Reform UK", "votes": 1638, "elected": False},
        {"name": "Thomas Andrew De Freitas", "party": "Conservative", "votes": 2000, "elected": True},
        {"name": "Tina Maria Stringfellow", "party": "Liberal Democrats", "votes": 400, "elected": False},
    ]},
    {"division": "West Lancashire West", "electorate": 10472, "candidates": [
        {"name": "Ben I Lowe", "party": "Green Party", "votes": 235, "elected": False},
        {"name": "David Alexander Westley", "party": "Conservative", "votes": 978, "elected": False},
        {"name": "Leon Graham", "party": "Reform UK", "votes": 1320, "elected": True},
        {"name": "Paul Hennessy", "party": "Labour", "votes": 730, "elected": False},
        {"name": "Ruxandra Trandafoiu", "party": "Liberal Democrats", "votes": 198, "elected": False},
    ]},
    # Wyre divisions
    {"division": "Cleveleys East", "electorate": 10399, "candidates": [
        {"name": "Andrea Kay", "party": "Conservative", "votes": 1102, "elected": False},
        {"name": "Harry Thomas Swatton", "party": "Labour", "votes": 557, "elected": False},
        {"name": "James Crawford", "party": "Reform UK", "votes": 1631, "elected": True},
        {"name": "Sarah Punshon", "party": "Green Party", "votes": 168, "elected": False},
    ]},
    {"division": "Cleveleys South & Carleton", "electorate": 10400, "candidates": [
        {"name": "Ian Northwood", "party": "Conservative", "votes": 941, "elected": False},
        {"name": "Jan Schofield", "party": "Reform UK", "votes": 1764, "elected": True},
        {"name": "Luke Meeks", "party": "Green Party", "votes": 227, "elected": False},
        {"name": "Peter David Wright", "party": "Labour", "votes": 781, "elected": False},
        {"name": "Rebecca Potter", "party": "Liberal Democrats", "votes": 127, "elected": False},
    ]},
    {"division": "Fleetwood East", "electorate": 10528, "candidates": [
        {"name": "Daniel Neil Bye", "party": "Green Party", "votes": 127, "elected": False},
        {"name": "David Charles Shaw", "party": "Reform UK", "votes": 1782, "elected": True},
        {"name": "JJ Fitzgerald", "party": "Conservative", "votes": 535, "elected": False},
        {"name": "Sandra Finch", "party": "Liberal Democrats", "votes": 75, "elected": False},
        {"name": "Victoria Jane Ruth Wells", "party": "Labour", "votes": 800, "elected": False},
    ]},
    {"division": "Fleetwood West & Cleveleys West", "electorate": 10736, "candidates": [
        {"name": "Alice Jones", "party": "Reform UK", "votes": 1928, "elected": True},
        {"name": "Georgia Everill", "party": "Green Party", "votes": 139, "elected": False},
        {"name": "Joanne Joyner", "party": "Liberal Democrats", "votes": 108, "elected": False},
        {"name": "Mary Juliet Belshaw", "party": "Labour", "votes": 643, "elected": False},
        {"name": "Stephen Clarke", "party": "Conservative", "votes": 706, "elected": False},
    ]},
    {"division": "Poulton le Fylde", "electorate": 11959, "candidates": [
        {"name": "Alf Clempson", "party": "Conservative", "votes": 1857, "elected": True},
        {"name": "Barbara Ann Mead-Mason", "party": "Green Party", "votes": 250, "elected": False},
        {"name": "Cheryl Jane Raynor", "party": "Labour", "votes": 597, "elected": False},
        {"name": "Jayden Gaskin", "party": "Independent", "votes": 50, "elected": False},
        {"name": "Paul Ellison", "party": "Reform UK", "votes": 1223, "elected": False},
        {"name": "Sean Little", "party": "Liberal Democrats", "votes": 127, "elected": False},
    ]},
    {"division": "Thornton & Hambleton", "electorate": 10722, "candidates": [
        {"name": "James Matthew Mason", "party": "Labour", "votes": 664, "elected": False},
        {"name": "Jeremy Dable", "party": "Liberal Democrats", "votes": 144, "elected": False},
        {"name": "John Samuel Clarke Shedwick", "party": "Conservative", "votes": 1009, "elected": False},
        {"name": "Monique Rembowski", "party": "Green Party", "votes": 184, "elected": False},
        {"name": "Nigel Alderson", "party": "Reform UK", "votes": 1816, "elected": True},
    ]},
    {"division": "Wyre Rural Central", "electorate": 10828, "candidates": [
        {"name": "John Stephen Moore", "party": "Labour", "votes": 483, "elected": False},
        {"name": "Matthew Jacques Salter", "party": "Reform UK", "votes": 1830, "elected": True},
        {"name": "Paul Lambert Fairhurst", "party": "Conservative", "votes": 1651, "elected": False},
        {"name": "Rene Van Mierlo", "party": "Liberal Democrats", "votes": 112, "elected": False},
        {"name": "Sarah Collinge", "party": "Independent", "votes": 79, "elected": False},
        {"name": "Tom Briggs", "party": "Green Party", "votes": 270, "elected": False},
    ]},
    {"division": "Wyre Rural East", "electorate": 12696, "candidates": [
        {"name": "Caroline Elizabeth Montague", "party": "Green Party", "votes": 310, "elected": False},
        {"name": "James David Tomlinson", "party": "Reform UK", "votes": 2122, "elected": True},
        {"name": "Neil Darby", "party": "Liberal Democrats", "votes": 236, "elected": False},
        {"name": "Oliver James Bonser", "party": "Labour", "votes": 897, "elected": False},
        {"name": "Shaun Gerard Turner", "party": "Conservative", "votes": 1752, "elected": False},
    ]},
]


def inject_lcc_2025():
    """Inject LCC 2025 results into elections.json."""
    # Load existing elections.json
    with open(ELECTIONS_PATH, 'r') as f:
        elections = json.load(f)

    print(f"Loaded {ELECTIONS_PATH}")
    print(f"  {len(elections['wards'])} wards, {len(elections['council_history'])} council history entries")

    # Check if 2025 already exists
    existing_years = {e['year'] for e in elections['council_history']}
    if 2025 in existing_years:
        print("  WARNING: 2025 already exists in council_history. Removing old data first.")
        elections['council_history'] = [e for e in elections['council_history'] if e['year'] != 2025]
        # Also remove 2025 from ward histories
        for ward_data in elections['wards'].values():
            ward_data['history'] = [e for e in ward_data.get('history', []) if e.get('year') != 2025]

    matched = 0
    unmatched = []

    for result in LCC_2025_RESULTS:
        division_name = result['division']
        ward_data = elections['wards'].get(division_name)

        if not ward_data:
            # Try fuzzy matching — handle 'and' vs '&' and spacing variants
            norm_div = division_name.lower().replace(' and ', ' & ').replace(' ', '')
            for wn in elections['wards']:
                norm_wn = wn.lower().replace(' and ', ' & ').replace(' ', '')
                if norm_wn == norm_div:
                    ward_data = elections['wards'][wn]
                    division_name = wn
                    break

        if not ward_data:
            unmatched.append(result['division'])
            continue

        # Build candidate list sorted by votes descending
        candidates = sorted(result['candidates'], key=lambda x: x['votes'], reverse=True)
        total_votes = sum(c['votes'] for c in candidates)
        seats = result.get('seats', 1)

        cand_list = []
        for c in candidates:
            cand_list.append({
                'name': c['name'],
                'party': c['party'],
                'votes': c['votes'],
                'pct': round(c['votes'] / total_votes, 4) if total_votes > 0 else 0,
                'elected': c['elected'],
            })

        # Calculate majority
        elected_cands = [c for c in cand_list if c['elected']]
        non_elected = [c for c in cand_list if not c['elected']]
        if seats == 1 and len(cand_list) >= 2:
            majority = cand_list[0]['votes'] - cand_list[1]['votes']
            majority_pct = round(majority / total_votes, 4) if total_votes else None
        elif seats == 2 and elected_cands and non_elected:
            # For 2-seat divisions, majority is lowest elected minus highest non-elected
            lowest_elected = min(c['votes'] for c in elected_cands)
            highest_non = max(c['votes'] for c in non_elected)
            majority = lowest_elected - highest_non
            majority_pct = round(majority / total_votes, 4) if total_votes else None
        else:
            majority = 0
            majority_pct = None

        turnout_pct = round(total_votes / result['electorate'], 4) if result['electorate'] else None

        election_entry = {
            'date': '2025-05-01',
            'year': 2025,
            'type': 'county',
            'seats_contested': seats,
            'turnout_votes': total_votes,
            'turnout': turnout_pct,
            'electorate': result['electorate'],
            'candidates': cand_list,
            'majority': majority,
            'majority_pct': majority_pct,
        }

        ward_data['history'].append(election_entry)
        ward_data['history'].sort(key=lambda x: x['date'])
        # Update electorate
        ward_data['electorate'] = result['electorate']
        matched += 1

    print(f"  Matched {matched} divisions")
    if unmatched:
        print(f"  Unmatched ({len(unmatched)}): {unmatched}")

    # Rebuild council history to include 2025
    # Aggregate 2025 results
    council_2025 = {
        'year': 2025,
        'type': 'county',
        'seats_contested': 0,
        'results_by_party': defaultdict(lambda: {'won': 0, 'votes': 0}),
        'total_votes': 0,
        'turnout_sum': 0,
        'turnout_count': 0,
    }

    for result in LCC_2025_RESULTS:
        seats = result.get('seats', 1)
        council_2025['seats_contested'] += seats
        total_votes = sum(c['votes'] for c in result['candidates'])
        turnout_pct = total_votes / result['electorate'] if result['electorate'] else 0
        council_2025['turnout_sum'] += turnout_pct
        council_2025['turnout_count'] += 1
        council_2025['total_votes'] += total_votes
        for c in result['candidates']:
            party = c['party']
            council_2025['results_by_party'][party]['votes'] += c['votes']
            if c['elected']:
                council_2025['results_by_party'][party]['won'] += 1

    # Format results
    total = council_2025['total_votes'] or 1
    results_formatted = {}
    for party, data in sorted(council_2025['results_by_party'].items(), key=lambda x: -x[1]['won']):
        results_formatted[party] = {
            'won': data['won'],
            'votes': data['votes'],
            'pct': round(data['votes'] / total, 4),
        }

    avg_turnout = round(council_2025['turnout_sum'] / council_2025['turnout_count'], 4) if council_2025['turnout_count'] > 0 else None

    council_history_entry = {
        'year': 2025,
        'type': 'county',
        'seats_contested': council_2025['seats_contested'],
        'results_by_party': results_formatted,
        'turnout': avg_turnout,
        'total_votes': council_2025['total_votes'],
    }

    elections['council_history'].append(council_history_entry)
    elections['council_history'].sort(key=lambda x: x['year'])

    # Update turnout trends
    elections['turnout_trends'].append({
        'year': 2025,
        'type': 'county',
        'turnout': avg_turnout,
        'total_votes': council_2025['total_votes'],
    })
    elections['turnout_trends'].sort(key=lambda x: x['year'])

    # Update data sources
    if 'Lancashire CC Official Results (lancashire.gov.uk)' not in elections['meta']['data_sources']:
        elections['meta']['data_sources'].append('Lancashire CC Official Results (lancashire.gov.uk)')

    # Update generated timestamp
    from datetime import datetime
    elections['meta']['generated'] = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')

    # Write output
    with open(ELECTIONS_PATH, 'w') as f:
        json.dump(elections, f, indent=2, ensure_ascii=False)

    size_kb = os.path.getsize(ELECTIONS_PATH) / 1024
    print(f"\n  Written {ELECTIONS_PATH} ({size_kb:.1f}KB)")
    print(f"  Council history now has {len(elections['council_history'])} entries (years: {[e['year'] for e in elections['council_history']]})")

    # Print summary
    print(f"\n  LCC 2025 Summary:")
    print(f"  Seats contested: {council_2025['seats_contested']}")
    print(f"  Total votes: {council_2025['total_votes']:,}")
    print(f"  Average turnout: {avg_turnout*100:.1f}%")
    for party, data in sorted(results_formatted.items(), key=lambda x: -x[1]['won']):
        if data['won'] > 0:
            print(f"    {party}: {data['won']} seats, {data['votes']:,} votes ({data['pct']*100:.1f}%)")


if __name__ == '__main__':
    inject_lcc_2025()
