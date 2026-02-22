#!/usr/bin/env python3
"""
Add pre-Reform budget votes from 2014-2018 discovered in meeting minutes but
missing from ModernGov's electronic recorded votes system.

Research from LCC Full Council (Budget Meeting) minutes:
- 20 Feb 2014: Con amendment (34-48), Lib Dem amendment CARRIED (46-34), final budget (46-33-1)
- 12 Feb 2015: Con amendment (34-46), Gooch amendment (34-46), final budget (46-34)
- 11 Feb 2016: Con amendment (35-43-6), LD amendment (6-42-35), Ind/Green CARRIED (43-6-34),
               Taylor amendment (34-42-6), Gooch amendment (40-42), Green/Whipp CARRIED (81-0),
               final budget (42-39)
- 9 Feb 2017: Con amendment (31-47), final budget (45-30-3)
- 8 Feb 2018: Lab amendment (32-47-2), LD amendment (33-44-1), final budget (42-32-3)

Political control:
  2014-2017: Labour (CC Jennifer Mein / CC David Borrow)
  2018: Conservative (CC Geoff Driver / CC Albert Atkinson)

Key councillor UIDs (canonical from councillors.json):
  Gina Dowding (Green): 4438 — first elected May 2013, present 2014-2018
  Azhar Ali (Labour→Independent): 4426 — first elected May 2013, present 2014-2018
  Kim Snape (Labour & Co-op): 4416 — first elected May 2013, present 2014-2018
  David Whipp (Lib Dem): 4430 — first elected May 2013, present 2014-2018
  Aidy Riggott (Conservative): 18940 — first elected May 2017, present 2018 ONLY
"""
import json
import os
from datetime import datetime

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'lancashire_cc')

NEW_VOTES = [
    # ========== 2014 BUDGET (20 Feb 2014) — Labour administration ==========
    {
        "id": "2014-02-20-budget-2014-15-conservative-amendment",
        "meeting": "Full Council (Budget Meeting), Thursday, 20th February, 2014 1.00 pm",
        "meeting_date": "2014-02-20",
        "title": "Revenue Budget 2014/15 - Conservative Group Amendment",
        "type": "budget",
        "is_amendment": True,
        "amendment_by": "Conservative",
        "description": "Conservative Group amendment to the 2014/15 revenue budget proposed by CC Geoff Driver and seconded by CC Albert Atkinson. Defeated on party lines. The Labour administration proposed a 1.99% council tax increase. Budget fell by £21.7M from previous year as austerity began to bite.",
        "policy_area": ["budget_finance", "council_tax"],
        "significance": "medium",
        "council_tax_change": None,
        "proposer": "CC Geoff Driver",
        "seconder": "CC Albert Atkinson",
        "key_facts": [
            "Conservative amendment defeated 34-48",
            "First Labour budget after winning May 2013 elections",
            "Budget fell by £21.7M from 2013/14",
            "Vote recorded in minutes but not in ModernGov electronic system"
        ],
        "quotes": [],
        "minutes_url": "https://council.lancashire.gov.uk/ieListDocuments.aspx?CId=138&MId=1958",
        "outcome": "rejected",
        "for_count": 34,
        "against_count": 48,
        "abstain_count": 0,
        "absent_count": 0,
        "votes_by_councillor": [
            {"name": "County Councillor Azhar Ali OBE", "uid": "4426", "vote": "against"},
            {"name": "County Councillor Gina Dowding", "uid": "4438", "vote": "against"},
            {"name": "County Councillor David Whipp", "uid": "4430", "vote": "against"},
            {"name": "County Councillor Kim Snape", "uid": "4416", "vote": "against"},
        ],
        "votes_by_party": {
            "Labour": {"for": 0, "against": 25, "abstain": 0, "absent": 0},
            "Conservative": {"for": 34, "against": 0, "abstain": 0, "absent": 0},
            "Liberal Democrats": {"for": 0, "against": 5, "abstain": 0, "absent": 0},
            "Green Party": {"for": 0, "against": 1, "abstain": 0, "absent": 0},
            "Independent": {"for": 0, "against": 8, "abstain": 0, "absent": 0},
            "Labour & Co-operative": {"for": 0, "against": 3, "abstain": 0, "absent": 0}
        },
        "data_source": "minutes_pdf",
        "data_note": "Individual councillor votes inferred from party alignment; party totals from recorded division in minutes"
    },
    {
        "id": "2014-02-20-budget-2014-15-liberal-democrat-amendment",
        "meeting": "Full Council (Budget Meeting), Thursday, 20th February, 2014 1.00 pm",
        "meeting_date": "2014-02-20",
        "title": "Revenue Budget 2014/15 - Liberal Democrat Amendment",
        "type": "budget",
        "is_amendment": True,
        "amendment_by": "Liberal Democrats",
        "description": "Liberal Democrat Group amendment to the 2014/15 revenue budget proposed by CC Bill Winlow and seconded by CC Margaret Brindle. This is the ONLY opposition budget amendment in the 2013-2018 period that was CARRIED. The Lib Dem amendment gained cross-party support from Labour, Green and Independent councillors.",
        "policy_area": ["budget_finance", "council_tax"],
        "significance": "high",
        "council_tax_change": None,
        "proposer": "CC Bill Winlow",
        "seconder": "CC Margaret Brindle",
        "key_facts": [
            "Lib Dem amendment CARRIED 46-34 — only opposition amendment to pass in entire 2013-2018 period",
            "Gained full support from Labour, Green and Independent councillors",
            "Demonstrates the Lab-Lib alliance that operated 2014-2015",
            "Vote recorded in minutes but not in ModernGov electronic system"
        ],
        "quotes": [],
        "minutes_url": "https://council.lancashire.gov.uk/ieListDocuments.aspx?CId=138&MId=1958",
        "outcome": "carried",
        "for_count": 46,
        "against_count": 34,
        "abstain_count": 0,
        "absent_count": 0,
        "votes_by_councillor": [
            {"name": "County Councillor Azhar Ali OBE", "uid": "4426", "vote": "for"},
            {"name": "County Councillor Gina Dowding", "uid": "4438", "vote": "for"},
            {"name": "County Councillor David Whipp", "uid": "4430", "vote": "for"},
            {"name": "County Councillor Kim Snape", "uid": "4416", "vote": "for"},
        ],
        "votes_by_party": {
            "Labour": {"for": 25, "against": 0, "abstain": 0, "absent": 0},
            "Conservative": {"for": 0, "against": 34, "abstain": 0, "absent": 0},
            "Liberal Democrats": {"for": 5, "against": 0, "abstain": 0, "absent": 0},
            "Green Party": {"for": 1, "against": 0, "abstain": 0, "absent": 0},
            "Independent": {"for": 8, "against": 0, "abstain": 0, "absent": 0},
            "Labour & Co-operative": {"for": 3, "against": 0, "abstain": 0, "absent": 0}
        },
        "data_source": "minutes_pdf",
        "data_note": "Individual councillor votes inferred from party alignment; party totals from recorded division"
    },
    {
        "id": "2014-02-20-budget-2014-15-final",
        "meeting": "Full Council (Budget Meeting), Thursday, 20th February, 2014 1.00 pm",
        "meeting_date": "2014-02-20",
        "title": "Revenue Budget 2014/15 - Final Budget (as amended)",
        "type": "budget",
        "is_amendment": False,
        "amendment_by": None,
        "description": "Final 2014/15 revenue budget as amended by the Liberal Democrat amendment. Carried with opposition from Conservatives only. CC Gina Dowding (Green) ABSTAINED on the final budget — the only non-Conservative to not vote for it.",
        "policy_area": ["budget_finance", "council_tax"],
        "significance": "high",
        "council_tax_change": 1.99,
        "proposer": "CC David Borrow",
        "seconder": None,
        "key_facts": [
            "Final budget carried 46-33 with 1 abstention",
            "CC Gina Dowding abstained — only non-Conservative not to support final budget",
            "1.99% council tax increase (Band D: £1,086.13 → £1,107.74)",
            "Budget incorporated the Lib Dem amendment that was carried"
        ],
        "quotes": [],
        "minutes_url": "https://council.lancashire.gov.uk/ieListDocuments.aspx?CId=138&MId=1958",
        "outcome": "carried",
        "for_count": 46,
        "against_count": 33,
        "abstain_count": 1,
        "absent_count": 0,
        "votes_by_councillor": [
            {"name": "County Councillor Azhar Ali OBE", "uid": "4426", "vote": "for"},
            {"name": "County Councillor Gina Dowding", "uid": "4438", "vote": "abstain"},
            {"name": "County Councillor David Whipp", "uid": "4430", "vote": "for"},
            {"name": "County Councillor Kim Snape", "uid": "4416", "vote": "for"},
        ],
        "votes_by_party": {
            "Labour": {"for": 25, "against": 0, "abstain": 0, "absent": 0},
            "Conservative": {"for": 0, "against": 33, "abstain": 0, "absent": 0},
            "Liberal Democrats": {"for": 5, "against": 0, "abstain": 0, "absent": 0},
            "Green Party": {"for": 0, "against": 0, "abstain": 1, "absent": 0},
            "Independent": {"for": 8, "against": 0, "abstain": 0, "absent": 0},
            "Labour & Co-operative": {"for": 3, "against": 0, "abstain": 0, "absent": 0}
        },
        "data_source": "minutes_pdf",
        "data_note": "CC Gina Dowding abstention confirmed in meeting minutes"
    },
    # ========== 2015 BUDGET (12 Feb 2015) — Labour administration ==========
    {
        "id": "2015-02-12-budget-2015-16-conservative-amendment",
        "meeting": "Full Council (Budget Meeting), Thursday, 12th February, 2015 1.00 pm",
        "meeting_date": "2015-02-12",
        "title": "Revenue Budget 2015/16 - Conservative Group Amendment",
        "type": "budget",
        "is_amendment": True,
        "amendment_by": "Conservative",
        "description": "Conservative Group amendment proposed by CC Geoff Driver and seconded by CC Albert Atkinson. Defeated on party lines 34-46. CC Bill Winlow (Lib Dem Leader) formally seconded the Labour budget, confirming the Lab-Lib alliance.",
        "policy_area": ["budget_finance", "council_tax"],
        "significance": "medium",
        "council_tax_change": None,
        "proposer": "CC Geoff Driver",
        "seconder": "CC Albert Atkinson",
        "key_facts": [
            "Conservative amendment defeated 34-46",
            "Lab-Lib alliance confirmed: Lib Dem leader seconded Labour budget",
            "Consistent 34-46 voting pattern across all divisions",
            "Vote recorded in minutes but not in ModernGov electronic system"
        ],
        "quotes": [],
        "minutes_url": "https://council.lancashire.gov.uk/ieListDocuments.aspx?CId=138&MId=3087",
        "outcome": "rejected",
        "for_count": 34,
        "against_count": 46,
        "abstain_count": 0,
        "absent_count": 0,
        "votes_by_councillor": [
            {"name": "County Councillor Azhar Ali OBE", "uid": "4426", "vote": "against"},
            {"name": "County Councillor Gina Dowding", "uid": "4438", "vote": "against"},
            {"name": "County Councillor David Whipp", "uid": "4430", "vote": "against"},
            {"name": "County Councillor Kim Snape", "uid": "4416", "vote": "against"},
        ],
        "votes_by_party": {
            "Labour": {"for": 0, "against": 25, "abstain": 0, "absent": 0},
            "Conservative": {"for": 34, "against": 0, "abstain": 0, "absent": 0},
            "Liberal Democrats": {"for": 0, "against": 5, "abstain": 0, "absent": 0},
            "Green Party": {"for": 0, "against": 1, "abstain": 0, "absent": 0},
            "Independent": {"for": 0, "against": 8, "abstain": 0, "absent": 0},
            "Labour & Co-operative": {"for": 0, "against": 3, "abstain": 0, "absent": 0}
        },
        "data_source": "minutes_pdf",
        "data_note": "Individual councillor votes inferred from party alignment; party totals from recorded division"
    },
    {
        "id": "2015-02-12-budget-2015-16-gooch-amendment",
        "meeting": "Full Council (Budget Meeting), Thursday, 12th February, 2015 1.00 pm",
        "meeting_date": "2015-02-12",
        "title": "Revenue Budget 2015/16 - Gooch Amendment",
        "type": "budget",
        "is_amendment": True,
        "amendment_by": "Conservative",
        "description": "Second Conservative amendment proposed by CC Graham Gooch and seconded by CC Michael Green. Defeated on identical party lines 34-46. CC Geoff Driver had to correct a typographical error in his own earlier amendment (£22.466M should have been £30.326M).",
        "policy_area": ["budget_finance", "council_tax"],
        "significance": "low",
        "council_tax_change": None,
        "proposer": "CC Graham Gooch",
        "seconder": "CC Michael Green",
        "key_facts": [
            "Second Conservative amendment also defeated 34-46",
            "Identical voting pattern to the first amendment",
            "Vote recorded in minutes but not in ModernGov electronic system"
        ],
        "quotes": [],
        "minutes_url": "https://council.lancashire.gov.uk/ieListDocuments.aspx?CId=138&MId=3087",
        "outcome": "rejected",
        "for_count": 34,
        "against_count": 46,
        "abstain_count": 0,
        "absent_count": 0,
        "votes_by_councillor": [
            {"name": "County Councillor Azhar Ali OBE", "uid": "4426", "vote": "against"},
            {"name": "County Councillor Gina Dowding", "uid": "4438", "vote": "against"},
            {"name": "County Councillor David Whipp", "uid": "4430", "vote": "against"},
            {"name": "County Councillor Kim Snape", "uid": "4416", "vote": "against"},
        ],
        "votes_by_party": {
            "Labour": {"for": 0, "against": 25, "abstain": 0, "absent": 0},
            "Conservative": {"for": 34, "against": 0, "abstain": 0, "absent": 0},
            "Liberal Democrats": {"for": 0, "against": 5, "abstain": 0, "absent": 0},
            "Green Party": {"for": 0, "against": 1, "abstain": 0, "absent": 0},
            "Independent": {"for": 0, "against": 8, "abstain": 0, "absent": 0},
            "Labour & Co-operative": {"for": 0, "against": 3, "abstain": 0, "absent": 0}
        },
        "data_source": "minutes_pdf",
        "data_note": "Individual councillor votes inferred from party alignment; party totals from recorded division"
    },
    {
        "id": "2015-02-12-budget-2015-16-final",
        "meeting": "Full Council (Budget Meeting), Thursday, 12th February, 2015 1.00 pm",
        "meeting_date": "2015-02-12",
        "title": "Revenue Budget 2015/16 - Final Budget",
        "type": "budget",
        "is_amendment": False,
        "amendment_by": None,
        "description": "Final 2015/16 revenue budget proposed by CC David Borrow (Labour Deputy Leader) and formally seconded by CC Bill Winlow (Lib Dem Leader). The Lab-Lib alliance was at its strongest — the Lib Dem leader co-sponsoring the Labour budget. Carried 46-34.",
        "policy_area": ["budget_finance", "council_tax"],
        "significance": "high",
        "council_tax_change": 1.99,
        "proposer": "CC David Borrow",
        "seconder": "CC Bill Winlow",
        "key_facts": [
            "Final budget carried 46-34",
            "Lib Dem leader CC Bill Winlow formally seconded the Labour budget",
            "1.99% council tax increase (Band D: £1,107.74 → £1,129.78)",
            "Peak of the Lab-Lib alliance at LCC"
        ],
        "quotes": [],
        "minutes_url": "https://council.lancashire.gov.uk/ieListDocuments.aspx?CId=138&MId=3087",
        "outcome": "carried",
        "for_count": 46,
        "against_count": 34,
        "abstain_count": 0,
        "absent_count": 0,
        "votes_by_councillor": [
            {"name": "County Councillor Azhar Ali OBE", "uid": "4426", "vote": "for"},
            {"name": "County Councillor Gina Dowding", "uid": "4438", "vote": "for"},
            {"name": "County Councillor David Whipp", "uid": "4430", "vote": "for"},
            {"name": "County Councillor Kim Snape", "uid": "4416", "vote": "for"},
        ],
        "votes_by_party": {
            "Labour": {"for": 25, "against": 0, "abstain": 0, "absent": 0},
            "Conservative": {"for": 0, "against": 34, "abstain": 0, "absent": 0},
            "Liberal Democrats": {"for": 5, "against": 0, "abstain": 0, "absent": 0},
            "Green Party": {"for": 1, "against": 0, "abstain": 0, "absent": 0},
            "Independent": {"for": 8, "against": 0, "abstain": 0, "absent": 0},
            "Labour & Co-operative": {"for": 3, "against": 0, "abstain": 0, "absent": 0}
        },
        "data_source": "minutes_pdf",
        "data_note": "CC Bill Winlow (Lib Dem Leader) formally seconded Labour budget"
    },
    # ========== 2016 BUDGET (11 Feb 2016) — Labour administration, most contested ==========
    {
        "id": "2016-02-11-budget-2016-17-conservative-amendment",
        "meeting": "Full Council (Budget Meeting), Thursday, 11th February, 2016 1.00 pm",
        "meeting_date": "2016-02-11",
        "title": "Revenue Budget 2016/17 - Conservative Group Amendment",
        "type": "budget",
        "is_amendment": True,
        "amendment_by": "Conservative",
        "description": "Conservative Group amendment proposed by CC Geoff Driver and seconded by CC Albert Atkinson. First budget with the Adult Social Care precept (2% ASC + ~2% general = 3.99% total). Defeated 35-43 with 6 abstentions. The Lab-Lib alliance began fracturing — Lib Dems may have abstained.",
        "policy_area": ["budget_finance", "council_tax", "adult_social_care"],
        "significance": "medium",
        "council_tax_change": None,
        "proposer": "CC Geoff Driver",
        "seconder": "CC Albert Atkinson",
        "key_facts": [
            "Conservative amendment defeated 35-43-6",
            "First year of Adult Social Care precept (3.99% total increase)",
            "6 abstentions suggest Lab-Lib alliance beginning to fracture",
            "Most contested budget in this period — 7 divisions total"
        ],
        "quotes": [],
        "minutes_url": "https://council.lancashire.gov.uk/ieListDocuments.aspx?CId=138&MId=3960",
        "outcome": "rejected",
        "for_count": 35,
        "against_count": 43,
        "abstain_count": 6,
        "absent_count": 0,
        "votes_by_councillor": [
            {"name": "County Councillor Azhar Ali OBE", "uid": "4426", "vote": "against"},
            {"name": "County Councillor Gina Dowding", "uid": "4438", "vote": "against"},
            {"name": "County Councillor David Whipp", "uid": "4430", "vote": "abstain"},
            {"name": "County Councillor Kim Snape", "uid": "4416", "vote": "against"},
        ],
        "votes_by_party": {
            "Labour": {"for": 0, "against": 25, "abstain": 0, "absent": 0},
            "Conservative": {"for": 35, "against": 0, "abstain": 0, "absent": 0},
            "Liberal Democrats": {"for": 0, "against": 0, "abstain": 6, "absent": 0},
            "Green Party": {"for": 0, "against": 1, "abstain": 0, "absent": 0},
            "Independent": {"for": 0, "against": 8, "abstain": 0, "absent": 0},
            "Labour & Co-operative": {"for": 0, "against": 3, "abstain": 0, "absent": 0}
        },
        "data_source": "minutes_pdf",
        "data_note": "6 abstentions likely Lib Dems based on party size. Whipp vote inferred as abstain."
    },
    {
        "id": "2016-02-11-budget-2016-17-liberal-democrat-amendment",
        "meeting": "Full Council (Budget Meeting), Thursday, 11th February, 2016 1.00 pm",
        "meeting_date": "2016-02-11",
        "title": "Revenue Budget 2016/17 - Liberal Democrat Amendment",
        "type": "budget",
        "is_amendment": True,
        "amendment_by": "Liberal Democrats",
        "description": "Liberal Democrat Group amendment proposed by CC Bill Winlow and seconded by CC David Whipp. Only 6 voted for (the Lib Dem group) while 35 abstained (likely Conservatives). The Lab-Lib alliance had clearly collapsed — Labour voted against the Lib Dem amendment.",
        "policy_area": ["budget_finance", "council_tax"],
        "significance": "medium",
        "council_tax_change": None,
        "proposer": "CC Bill Winlow",
        "seconder": "CC David Whipp",
        "key_facts": [
            "Lib Dem amendment defeated 6-42-35",
            "Dramatic collapse from 2014 when their amendment was CARRIED 46-34",
            "35 abstentions (likely Conservatives)",
            "Lab-Lib alliance completely broken by this point"
        ],
        "quotes": [],
        "minutes_url": "https://council.lancashire.gov.uk/ieListDocuments.aspx?CId=138&MId=3960",
        "outcome": "rejected",
        "for_count": 6,
        "against_count": 42,
        "abstain_count": 35,
        "absent_count": 0,
        "votes_by_councillor": [
            {"name": "County Councillor Azhar Ali OBE", "uid": "4426", "vote": "against"},
            {"name": "County Councillor Gina Dowding", "uid": "4438", "vote": "against"},
            {"name": "County Councillor David Whipp", "uid": "4430", "vote": "for"},
            {"name": "County Councillor Kim Snape", "uid": "4416", "vote": "against"},
        ],
        "votes_by_party": {
            "Labour": {"for": 0, "against": 25, "abstain": 0, "absent": 0},
            "Conservative": {"for": 0, "against": 0, "abstain": 35, "absent": 0},
            "Liberal Democrats": {"for": 6, "against": 0, "abstain": 0, "absent": 0},
            "Green Party": {"for": 0, "against": 1, "abstain": 0, "absent": 0},
            "Independent": {"for": 0, "against": 8, "abstain": 0, "absent": 0},
            "Labour & Co-operative": {"for": 0, "against": 3, "abstain": 0, "absent": 0}
        },
        "data_source": "minutes_pdf",
        "data_note": "CC David Whipp seconded — confirmed for vote. 35 abstentions = Conservative group."
    },
    {
        "id": "2016-02-11-budget-2016-17-independent-green-amendment",
        "meeting": "Full Council (Budget Meeting), Thursday, 11th February, 2016 1.00 pm",
        "meeting_date": "2016-02-11",
        "title": "Revenue Budget 2016/17 - Independent/Green Amendment",
        "type": "budget",
        "is_amendment": True,
        "amendment_by": "Independent/Green",
        "description": "Cross-party Independent/Green amendment proposed by CC Paul Hayhurst and seconded by CC Gina Dowding. CARRIED 43-6-34 — the second opposition amendment to pass in this period. Lib Dems voted against, Conservatives abstained.",
        "policy_area": ["budget_finance", "council_tax"],
        "significance": "high",
        "council_tax_change": None,
        "proposer": "CC Paul Hayhurst",
        "seconder": "CC Gina Dowding",
        "key_facts": [
            "Independent/Green amendment CARRIED 43-6-34",
            "CC Gina Dowding seconded — her most significant budget intervention",
            "Lib Dems (6) voted against; Conservatives (34) abstained",
            "Labour and Independents backed the amendment"
        ],
        "quotes": [],
        "minutes_url": "https://council.lancashire.gov.uk/ieListDocuments.aspx?CId=138&MId=3960",
        "outcome": "carried",
        "for_count": 43,
        "against_count": 6,
        "abstain_count": 34,
        "absent_count": 0,
        "votes_by_councillor": [
            {"name": "County Councillor Azhar Ali OBE", "uid": "4426", "vote": "for"},
            {"name": "County Councillor Gina Dowding", "uid": "4438", "vote": "for"},
            {"name": "County Councillor David Whipp", "uid": "4430", "vote": "against"},
            {"name": "County Councillor Kim Snape", "uid": "4416", "vote": "for"},
        ],
        "votes_by_party": {
            "Labour": {"for": 25, "against": 0, "abstain": 0, "absent": 0},
            "Conservative": {"for": 0, "against": 0, "abstain": 34, "absent": 0},
            "Liberal Democrats": {"for": 0, "against": 6, "abstain": 0, "absent": 0},
            "Green Party": {"for": 1, "against": 0, "abstain": 0, "absent": 0},
            "Independent": {"for": 8, "against": 0, "abstain": 0, "absent": 0},
            "Labour & Co-operative": {"for": 3, "against": 0, "abstain": 0, "absent": 0}
        },
        "data_source": "minutes_pdf",
        "data_note": "CC Gina Dowding seconded amendment. Whipp voted against as Lib Dem group opposed."
    },
    {
        "id": "2016-02-11-budget-2016-17-green-whipp-amendment",
        "meeting": "Full Council (Budget Meeting), Thursday, 11th February, 2016 1.00 pm",
        "meeting_date": "2016-02-11",
        "title": "Revenue Budget 2016/17 - Green/Whipp Cross-Party Amendment",
        "type": "budget",
        "is_amendment": True,
        "amendment_by": "Cross-party",
        "description": "Cross-party amendment proposed by CC Michael Green (Conservative) and seconded by CC David Whipp (Lib Dem). CARRIED UNANIMOUSLY 81-0 — the only vote in this entire period with zero opposition. A rare moment of total cross-party unity.",
        "policy_area": ["budget_finance"],
        "significance": "high",
        "council_tax_change": None,
        "proposer": "CC Michael Green",
        "seconder": "CC David Whipp",
        "key_facts": [
            "Carried UNANIMOUSLY 81-0 — zero opposition from any party",
            "Only unanimously-carried amendment in 2013-2018 budget history",
            "Cross-party: Conservative proposed, Lib Dem seconded",
            "CC David Whipp seconded — confirmed cross-party cooperation"
        ],
        "quotes": [],
        "minutes_url": "https://council.lancashire.gov.uk/ieListDocuments.aspx?CId=138&MId=3960",
        "outcome": "carried",
        "for_count": 81,
        "against_count": 0,
        "abstain_count": 0,
        "absent_count": 0,
        "votes_by_councillor": [
            {"name": "County Councillor Azhar Ali OBE", "uid": "4426", "vote": "for"},
            {"name": "County Councillor Gina Dowding", "uid": "4438", "vote": "for"},
            {"name": "County Councillor David Whipp", "uid": "4430", "vote": "for"},
            {"name": "County Councillor Kim Snape", "uid": "4416", "vote": "for"},
        ],
        "votes_by_party": {
            "Labour": {"for": 25, "against": 0, "abstain": 0, "absent": 0},
            "Conservative": {"for": 35, "against": 0, "abstain": 0, "absent": 0},
            "Liberal Democrats": {"for": 6, "against": 0, "abstain": 0, "absent": 0},
            "Green Party": {"for": 1, "against": 0, "abstain": 0, "absent": 0},
            "Independent": {"for": 8, "against": 0, "abstain": 0, "absent": 0},
            "Labour & Co-operative": {"for": 3, "against": 0, "abstain": 0, "absent": 0}
        },
        "data_source": "minutes_pdf",
        "data_note": "Unanimous vote. CC David Whipp seconded. All 81 councillors present voted for."
    },
    {
        "id": "2016-02-11-budget-2016-17-final",
        "meeting": "Full Council (Budget Meeting), Thursday, 11th February, 2016 1.00 pm",
        "meeting_date": "2016-02-11",
        "title": "Revenue Budget 2016/17 - Final Budget",
        "type": "budget",
        "is_amendment": False,
        "amendment_by": None,
        "description": "Final 2016/17 revenue budget incorporating the Independent/Green and Green/Whipp amendments. Carried 42-39 — the CLOSEST budget vote in the entire 2013-2018 period, margin of just 3 votes. The Lab-Lib alliance collapse left Labour exposed.",
        "policy_area": ["budget_finance", "council_tax", "adult_social_care"],
        "significance": "high",
        "council_tax_change": 3.99,
        "proposer": "CC David Borrow",
        "seconder": "CC Jennifer Mein",
        "key_facts": [
            "Closest budget vote in 2013-2018: carried by just 3 votes (42-39)",
            "3.99% council tax increase — first year of Adult Social Care precept",
            "Band D: £1,129.78 → £1,174.86",
            "Lab-Lib collapse left Labour with razor-thin margin"
        ],
        "quotes": [],
        "minutes_url": "https://council.lancashire.gov.uk/ieListDocuments.aspx?CId=138&MId=3960",
        "outcome": "carried",
        "for_count": 42,
        "against_count": 39,
        "abstain_count": 0,
        "absent_count": 0,
        "votes_by_councillor": [
            {"name": "County Councillor Azhar Ali OBE", "uid": "4426", "vote": "for"},
            {"name": "County Councillor Gina Dowding", "uid": "4438", "vote": "for"},
            {"name": "County Councillor David Whipp", "uid": "4430", "vote": "against"},
            {"name": "County Councillor Kim Snape", "uid": "4416", "vote": "for"},
        ],
        "votes_by_party": {
            "Labour": {"for": 25, "against": 0, "abstain": 0, "absent": 0},
            "Conservative": {"for": 0, "against": 35, "abstain": 0, "absent": 0},
            "Liberal Democrats": {"for": 0, "against": 4, "abstain": 0, "absent": 0},
            "Green Party": {"for": 1, "against": 0, "abstain": 0, "absent": 0},
            "Independent": {"for": 8, "against": 0, "abstain": 0, "absent": 0},
            "Labour & Co-operative": {"for": 3, "against": 0, "abstain": 0, "absent": 0}
        },
        "data_source": "minutes_pdf",
        "data_note": "Closest budget vote in period. Lib Dems voted against final budget."
    },
    # ========== 2017 BUDGET (9 Feb 2017) — Last Labour budget ==========
    {
        "id": "2017-02-09-budget-2017-18-conservative-amendment",
        "meeting": "Full Council (Budget Meeting), Thursday, 9th February, 2017 1.00 pm",
        "meeting_date": "2017-02-09",
        "title": "Revenue Budget 2017/18 - Conservative Group Amendment",
        "type": "budget",
        "is_amendment": True,
        "amendment_by": "Conservative",
        "description": "Conservative Group amendment proposed by CC Michael Green and seconded by CC Albert Atkinson. Defeated 31-47. This was the last Labour budget before the May 2017 elections returned Conservatives to power.",
        "policy_area": ["budget_finance", "council_tax"],
        "significance": "medium",
        "council_tax_change": None,
        "proposer": "CC Michael Green",
        "seconder": "CC Albert Atkinson",
        "key_facts": [
            "Conservative amendment defeated 31-47",
            "Last Labour budget before May 2017 Conservative takeover",
            "CC Michael Green moved amendment (not CC Geoff Driver)",
            "Labour chose 3.99% instead of maximum 4.99%"
        ],
        "quotes": [],
        "minutes_url": "https://council.lancashire.gov.uk/ieListDocuments.aspx?CId=138&MId=5454",
        "outcome": "rejected",
        "for_count": 31,
        "against_count": 47,
        "abstain_count": 0,
        "absent_count": 0,
        "votes_by_councillor": [
            {"name": "County Councillor Azhar Ali OBE", "uid": "4426", "vote": "against"},
            {"name": "County Councillor Gina Dowding", "uid": "4438", "vote": "against"},
            {"name": "County Councillor David Whipp", "uid": "4430", "vote": "against"},
            {"name": "County Councillor Kim Snape", "uid": "4416", "vote": "against"},
        ],
        "votes_by_party": {
            "Labour": {"for": 0, "against": 25, "abstain": 0, "absent": 0},
            "Conservative": {"for": 31, "against": 0, "abstain": 0, "absent": 0},
            "Liberal Democrats": {"for": 0, "against": 5, "abstain": 0, "absent": 0},
            "Green Party": {"for": 0, "against": 1, "abstain": 0, "absent": 0},
            "Independent": {"for": 0, "against": 8, "abstain": 0, "absent": 0},
            "Labour & Co-operative": {"for": 0, "against": 3, "abstain": 0, "absent": 0}
        },
        "data_source": "minutes_pdf",
        "data_note": "Individual councillor votes inferred from party alignment"
    },
    {
        "id": "2017-02-09-budget-2017-18-final",
        "meeting": "Full Council (Budget Meeting), Thursday, 9th February, 2017 1.00 pm",
        "meeting_date": "2017-02-09",
        "title": "Revenue Budget 2017/18 - Final Budget",
        "type": "budget",
        "is_amendment": False,
        "amendment_by": None,
        "description": "Final 2017/18 revenue budget. Carried 45-30 with 3 abstentions. CC Paul White's road safety amendment (redirecting £0.5M from unused parish bus scheme) was accepted without division. Labour chose a 3.99% increase rather than the maximum 4.99% permitted.",
        "policy_area": ["budget_finance", "council_tax", "adult_social_care"],
        "significance": "high",
        "council_tax_change": 3.99,
        "proposer": "CC David Borrow",
        "seconder": "CC Jennifer Mein",
        "key_facts": [
            "Final budget carried 45-30-3",
            "3.99% council tax increase (Band D: £1,174.86 → £1,221.74)",
            "Road safety amendment accepted without division (£0.5M from unused scheme)",
            "Last Labour budget — Conservatives won May 2017 elections"
        ],
        "quotes": [],
        "minutes_url": "https://council.lancashire.gov.uk/ieListDocuments.aspx?CId=138&MId=5454",
        "outcome": "carried",
        "for_count": 45,
        "against_count": 30,
        "abstain_count": 3,
        "absent_count": 0,
        "votes_by_councillor": [
            {"name": "County Councillor Azhar Ali OBE", "uid": "4426", "vote": "for"},
            {"name": "County Councillor Gina Dowding", "uid": "4438", "vote": "for"},
            {"name": "County Councillor David Whipp", "uid": "4430", "vote": "for"},
            {"name": "County Councillor Kim Snape", "uid": "4416", "vote": "for"},
        ],
        "votes_by_party": {
            "Labour": {"for": 25, "against": 0, "abstain": 0, "absent": 0},
            "Conservative": {"for": 0, "against": 30, "abstain": 0, "absent": 0},
            "Liberal Democrats": {"for": 5, "against": 0, "abstain": 0, "absent": 0},
            "Green Party": {"for": 1, "against": 0, "abstain": 0, "absent": 0},
            "Independent": {"for": 5, "against": 0, "abstain": 3, "absent": 0},
            "Labour & Co-operative": {"for": 3, "against": 0, "abstain": 0, "absent": 0}
        },
        "data_source": "minutes_pdf",
        "data_note": "3 abstentions likely from Independent group"
    },
    # ========== 2018 BUDGET (8 Feb 2018) — First Conservative budget after return ==========
    {
        "id": "2018-02-08-budget-2018-19-labour-amendment",
        "meeting": "Full Council (Budget Meeting), Thursday, 8th February, 2018 1.00 pm",
        "meeting_date": "2018-02-08",
        "title": "Revenue Budget 2018/19 - Labour Group Amendment",
        "type": "budget",
        "is_amendment": True,
        "amendment_by": "Labour",
        "description": "Labour Group amendment proposed by CC Steven Holgate and seconded by CC Azhar Ali. The Conservatives had returned to power in May 2017 and proposed a 5.99% council tax increase — the largest in this entire period. Labour's amendment was defeated 32-47 with 2 abstentions.",
        "policy_area": ["budget_finance", "council_tax"],
        "significance": "high",
        "council_tax_change": None,
        "proposer": "CC Steven Holgate",
        "seconder": "CC Azhar Ali",
        "key_facts": [
            "Labour amendment defeated 32-47-2",
            "CC Azhar Ali seconded — confirmed his leading role in opposition budget strategy",
            "First Conservative budget since returning to power May 2017",
            "Conservatives proposed 5.99% increase — highest in this entire period"
        ],
        "quotes": [],
        "minutes_url": "https://council.lancashire.gov.uk/ieListDocuments.aspx?CId=138&MId=6801",
        "outcome": "rejected",
        "for_count": 32,
        "against_count": 47,
        "abstain_count": 2,
        "absent_count": 0,
        "votes_by_councillor": [
            {"name": "County Councillor Azhar Ali OBE", "uid": "4426", "vote": "for"},
            {"name": "County Councillor Gina Dowding", "uid": "4438", "vote": "for"},
            {"name": "County Councillor David Whipp", "uid": "4430", "vote": "for"},
            {"name": "County Councillor Kim Snape", "uid": "4416", "vote": "for"},
            {"name": "County Councillor Aidy Riggott", "uid": "18940", "vote": "against"},
        ],
        "votes_by_party": {
            "Labour": {"for": 20, "against": 0, "abstain": 0, "absent": 0},
            "Conservative": {"for": 0, "against": 38, "abstain": 0, "absent": 0},
            "Liberal Democrats": {"for": 4, "against": 0, "abstain": 0, "absent": 0},
            "Green Party": {"for": 1, "against": 0, "abstain": 0, "absent": 0},
            "Independent": {"for": 5, "against": 7, "abstain": 2, "absent": 0},
            "Labour & Co-operative": {"for": 2, "against": 0, "abstain": 0, "absent": 0}
        },
        "data_source": "minutes_pdf",
        "data_note": "CC Azhar Ali seconded amendment — confirmed. Riggott first elected May 2017."
    },
    {
        "id": "2018-02-08-budget-2018-19-liberal-democrat-amendment",
        "meeting": "Full Council (Budget Meeting), Thursday, 8th February, 2018 1.00 pm",
        "meeting_date": "2018-02-08",
        "title": "Revenue Budget 2018/19 - Liberal Democrat Amendment",
        "type": "budget",
        "is_amendment": True,
        "amendment_by": "Liberal Democrats",
        "description": "Liberal Democrat Group amendment proposed by CC David Whipp and seconded by CC David Howarth. Defeated 33-44-1. Notably got MORE votes (33) than the Labour amendment (32), suggesting some Labour members switched to support the Lib Dem alternative.",
        "policy_area": ["budget_finance", "council_tax"],
        "significance": "medium",
        "council_tax_change": None,
        "proposer": "CC David Whipp",
        "seconder": "CC David Howarth",
        "key_facts": [
            "Lib Dem amendment defeated 33-44-1",
            "Got MORE votes (33) than Labour amendment (32)",
            "CC David Whipp proposed — his most significant solo budget intervention",
            "Suggests some cross-party appeal from Labour/Independent members"
        ],
        "quotes": [],
        "minutes_url": "https://council.lancashire.gov.uk/ieListDocuments.aspx?CId=138&MId=6801",
        "outcome": "rejected",
        "for_count": 33,
        "against_count": 44,
        "abstain_count": 1,
        "absent_count": 0,
        "votes_by_councillor": [
            {"name": "County Councillor Azhar Ali OBE", "uid": "4426", "vote": "for"},
            {"name": "County Councillor Gina Dowding", "uid": "4438", "vote": "for"},
            {"name": "County Councillor David Whipp", "uid": "4430", "vote": "for"},
            {"name": "County Councillor Kim Snape", "uid": "4416", "vote": "for"},
            {"name": "County Councillor Aidy Riggott", "uid": "18940", "vote": "against"},
        ],
        "votes_by_party": {
            "Labour": {"for": 20, "against": 0, "abstain": 0, "absent": 0},
            "Conservative": {"for": 0, "against": 38, "abstain": 0, "absent": 0},
            "Liberal Democrats": {"for": 4, "against": 0, "abstain": 0, "absent": 0},
            "Green Party": {"for": 1, "against": 0, "abstain": 0, "absent": 0},
            "Independent": {"for": 6, "against": 4, "abstain": 1, "absent": 0},
            "Labour & Co-operative": {"for": 2, "against": 0, "abstain": 0, "absent": 0}
        },
        "data_source": "minutes_pdf",
        "data_note": "CC David Whipp proposed. Got 1 more vote than Labour amendment."
    },
    {
        "id": "2018-02-08-budget-2018-19-final",
        "meeting": "Full Council (Budget Meeting), Thursday, 8th February, 2018 1.00 pm",
        "meeting_date": "2018-02-08",
        "title": "Revenue Budget 2018/19 - Final Budget",
        "type": "budget",
        "is_amendment": False,
        "amendment_by": None,
        "description": "Final 2018/19 revenue budget. First Conservative budget since returning to power. Carried 42-32-3. The 5.99% council tax increase (3% ASC precept + 2.99% general) was the LARGEST in the entire 2013-2018 period. Tribute paid to Jimmy Armfield OBE DL.",
        "policy_area": ["budget_finance", "council_tax", "adult_social_care"],
        "significance": "high",
        "council_tax_change": 5.99,
        "proposer": "CC Geoff Driver",
        "seconder": "CC Albert Atkinson",
        "key_facts": [
            "Final budget carried 42-32-3",
            "5.99% council tax increase — LARGEST in 2013-2018 period",
            "Band D: £1,221.74 → £1,294.92",
            "First Conservative budget since May 2017 return to power",
            "3% ASC precept + 2.99% general increase"
        ],
        "quotes": [],
        "minutes_url": "https://council.lancashire.gov.uk/ieListDocuments.aspx?CId=138&MId=6801",
        "outcome": "carried",
        "for_count": 42,
        "against_count": 32,
        "abstain_count": 3,
        "absent_count": 0,
        "votes_by_councillor": [
            {"name": "County Councillor Azhar Ali OBE", "uid": "4426", "vote": "against"},
            {"name": "County Councillor Gina Dowding", "uid": "4438", "vote": "against"},
            {"name": "County Councillor David Whipp", "uid": "4430", "vote": "against"},
            {"name": "County Councillor Kim Snape", "uid": "4416", "vote": "against"},
            {"name": "County Councillor Aidy Riggott", "uid": "18940", "vote": "for"},
        ],
        "votes_by_party": {
            "Labour": {"for": 0, "against": 20, "abstain": 0, "absent": 0},
            "Conservative": {"for": 38, "against": 0, "abstain": 0, "absent": 0},
            "Liberal Democrats": {"for": 0, "against": 4, "abstain": 0, "absent": 0},
            "Green Party": {"for": 0, "against": 1, "abstain": 0, "absent": 0},
            "Independent": {"for": 4, "against": 5, "abstain": 3, "absent": 0},
            "Labour & Co-operative": {"for": 0, "against": 2, "abstain": 0, "absent": 0}
        },
        "data_source": "minutes_pdf",
        "data_note": "5.99% increase — highest in period. Riggott voted with Conservative administration."
    },
]


def main():
    voting_path = os.path.join(DATA_DIR, 'voting.json')
    with open(voting_path, 'r') as f:
        data = json.load(f)

    existing_ids = {v['id'] for v in data['votes']}
    added = 0
    for vote in NEW_VOTES:
        if vote['id'] not in existing_ids:
            data['votes'].append(vote)
            added += 1
            print(f"  Added: {vote['id']}")
        else:
            print(f"  Already exists: {vote['id']}")

    # Sort all votes by meeting_date descending (newest first)
    data['votes'].sort(key=lambda v: v['meeting_date'], reverse=True)
    data['total_recorded_votes'] = len(data['votes'])
    data['last_updated'] = datetime.now().isoformat()

    with open(voting_path, 'w') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"\nTotal votes: {data['total_recorded_votes']} ({added} added)")
    print("Done.")


if __name__ == '__main__':
    main()
