#!/usr/bin/env python3
"""Social & API Crawler for News Lancashire
Fetches content about Lancashire politicians from Google News RSS,
UK Parliament API, and Police API. Runs alongside crawler_v3.py."""

import hashlib
import json
import logging
import os
import re
import sqlite3
import time
import urllib.request
import urllib.error
from datetime import datetime, timedelta

# ─── Paths ───────────────────────────────────────────────────────────────────
BASE     = '/home/ubuntu/newslancashire'
DB_PATH  = BASE + '/db/news.db'
CONFIG   = BASE + '/config'
LOG_DIR  = BASE + '/logs'

os.makedirs(LOG_DIR, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    handlers=[
        logging.FileHandler(LOG_DIR + '/social_crawler.log'),
        logging.StreamHandler()
    ]
)
log = logging.getLogger('social_crawler')

UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

# ─── Import shared functions from crawler_v3 ─────────────────────────────────
import sys
sys.path.insert(0, os.path.dirname(__file__))
from crawler_v3 import (
    detect_boroughs, borough_names_for_article, load_categories,
    detect_category, calc_interest_score, calc_trending_score,
    get_db, article_exists, insert_article
)

try:
    import feedparser
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'feedparser'])
    import feedparser


def fetch_json_url(url, timeout=15):
    """Fetch JSON from a URL."""
    req = urllib.request.Request(url, headers={
        'User-Agent': UA,
        'Accept': 'application/json',
    })
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode('utf-8'))


# ═══════════════════════════════════════════════════════════════════════════════
# GOOGLE NEWS RSS — Politician-specific searches
# ═══════════════════════════════════════════════════════════════════════════════

# Search queries for Lancashire politicians and topics
GOOGLE_NEWS_SEARCHES = [
    # Reform UK councillors (CRITICAL priority)
    {
        'query': '"Tom Pickup" lancashire',
        'source_name': 'Tom Pickup News',
        'category': 'politics',
        'borough': 'burnley',
        'priority': 'critical',
    },
    {
        'query': '"Luke Parker" reform lancashire',
        'source_name': 'Luke Parker News',
        'category': 'politics',
        'borough': 'preston',
        'priority': 'critical',
    },
    {
        'query': '"Stephen Atkinson" lancashire council',
        'source_name': 'Stephen Atkinson News',
        'category': 'politics',
        'borough': 'ribble_valley',
        'priority': 'high',
    },
    # Reform UK Lancashire general
    {
        'query': 'reform UK lancashire county council',
        'source_name': 'Reform UK LCC News',
        'category': 'politics',
        'borough': '',
        'priority': 'high',
    },
    # Lancashire politics general
    {
        'query': 'lancashire county council politics',
        'source_name': 'LCC Politics',
        'category': 'politics',
        'borough': '',
        'priority': 'medium',
    },
    # Lancashire crime
    {
        'query': 'lancashire police crime',
        'source_name': 'Lancashire Crime News',
        'category': 'crime',
        'borough': '',
        'priority': 'medium',
    },
    # Burnley specific
    {
        'query': 'burnley council news',
        'source_name': 'Burnley Council News',
        'category': 'politics',
        'borough': 'burnley',
        'priority': 'medium',
    },
]


def crawl_google_news(searches, categories, boosters, conn):
    """Crawl Google News RSS for politician-specific and topic searches."""
    total_new = 0

    for search in searches:
        query = search['query']
        source_name = search['source_name']
        category_hint = search.get('category', '')
        borough = search.get('borough', '')
        priority = search.get('priority', 'medium')

        try:
            encoded_query = urllib.request.quote(query)
            url = 'https://news.google.com/rss/search?q=' + encoded_query + '&hl=en-GB&gl=GB&ceid=GB:en'

            log.info('Google News: Searching "%s"', query)
            feed = feedparser.parse(url)

            new_count = 0
            for entry in feed.entries[:8]:  # Max 8 per search
                try:
                    title = entry.get('title', '').strip()
                    if not title:
                        continue

                    # Google News links redirect — get the actual link
                    link = entry.get('link', '')
                    if not link:
                        continue

                    # Remove " - Source Name" from title
                    title_clean = re.sub(r'\s*-\s*[^-]+$', '', title).strip()
                    if not title_clean:
                        title_clean = title

                    if article_exists(conn, link):
                        continue

                    # Extract source from title suffix
                    source_suffix = ''
                    m = re.search(r'\s*-\s*([^-]+)$', title)
                    if m:
                        source_suffix = m.group(1).strip()

                    # Published time
                    published = entry.get('published', '')
                    if not published:
                        published = datetime.now().isoformat()
                    else:
                        try:
                            from email.utils import parsedate_to_datetime
                            dt = parsedate_to_datetime(published)
                            published = dt.isoformat()
                        except Exception:
                            published = datetime.now().isoformat()

                    # Summary from description
                    desc = entry.get('description', '')
                    from html.parser import HTMLParser
                    class TagStripper(HTMLParser):
                        def __init__(self):
                            super().__init__()
                            self.result = []
                        def handle_data(self, d):
                            self.result.append(d)
                    stripper = TagStripper()
                    stripper.feed(desc)
                    summary = ' '.join(stripper.result).strip()[:500]
                    if not summary:
                        summary = title_clean

                    full_text = title_clean + ' ' + summary

                    # Category
                    category, _ = detect_category(full_text, categories)
                    if category == 'general' and category_hint:
                        category = category_hint

                    # Borough
                    boroughs = detect_boroughs(full_text)
                    if borough and borough != 'all' and borough:
                        flag = 'is_' + borough
                        if flag in boroughs:
                            boroughs[flag] = 1
                    borough_list = borough_names_for_article(boroughs)

                    # Scoring with priority boost
                    interest = calc_interest_score(full_text, category, boosters)
                    if priority == 'critical':
                        interest = min(interest + 20, 100)
                    elif priority == 'high':
                        interest = min(interest + 10, 100)
                    trending = calc_trending_score(published, source_name, interest, 0)

                    source_label = source_suffix if source_suffix else source_name
                    search_text = ' '.join([title_clean, summary, category] + borough_list)

                    article = {
                        'id': hashlib.md5(link.encode()).hexdigest(),
                        'title': title_clean,
                        'link': link,
                        'source': source_label,
                        'source_type': 'google_news',
                        'published': published,
                        'summary': summary,
                        'category': category,
                        'interest_score': interest,
                        'trending_score': trending,
                        'social_handle': '',
                        'social_avatar': '',
                        'social_platform': '',
                        'social_engagement': 0,
                        'search_text': search_text,
                        'boroughs': boroughs,
                    }

                    insert_article(conn, article)
                    new_count += 1

                except Exception as ex:
                    log.debug('Google News: Parse error: %s', ex)
                    continue

            conn.commit()
            total_new += new_count
            if new_count:
                log.info('Google News: "%s" -> %d new articles', query, new_count)

        except Exception as ex:
            log.error('Google News: "%s" error: %s', query, ex)

        time.sleep(1)  # Be gentle with Google

    return total_new


# ═══════════════════════════════════════════════════════════════════════════════
# UK PARLIAMENT API — Lancashire MP activity
# ═══════════════════════════════════════════════════════════════════════════════

# Lancashire MP IDs (Parliament API) — map of name to member ID
LANCASHIRE_MPS = {
    'Oliver Ryan': {'id': 5055, 'borough': 'burnley', 'party': 'Independent'},
    'Sarah Smith': {'id': 5054, 'borough': 'hyndburn', 'party': 'Labour'},
    'Andy MacNae': {'id': 5057, 'borough': 'rossendale', 'party': 'Labour'},
    'Mark Hendrick': {'id': 473, 'borough': 'preston', 'party': 'Labour'},
    'Cat Smith': {'id': 4436, 'borough': 'lancaster', 'party': 'Labour'},
    'Chris Webb': {'id': 5047, 'borough': 'blackpool', 'party': 'Labour'},
    'Lindsay Hoyle': {'id': 467, 'borough': 'chorley', 'party': 'Speaker'},
}


def crawl_parliament_api(categories, boosters, conn):
    """Fetch recent questions and debates from Lancashire MPs via Parliament API."""
    total_new = 0

    # Recent oral/written questions from Lancashire MPs
    for mp_name, mp_info in LANCASHIRE_MPS.items():
        mp_id = mp_info['id']
        borough = mp_info['borough']

        try:
            # Written questions (most active)
            url = ('https://oralquestionsandmotions-api.parliament.uk/oralquestions/list'
                   '?parameters.memberId=' + str(mp_id) +
                   '&parameters.take=5')

            try:
                data = fetch_json_url(url)
                questions = data.get('Response', [])
            except Exception:
                # Try written questions API instead
                url = ('https://writtenquestions-api.parliament.uk/api/writtenquestions/questions'
                       '?askingMemberId=' + str(mp_id) +
                       '&take=5')
                try:
                    data = fetch_json_url(url)
                    questions = data.get('results', [])
                except Exception:
                    questions = []

            for q in questions[:5]:
                try:
                    if isinstance(q, dict):
                        title = q.get('QuestionText', q.get('questionText', q.get('value', {}).get('questionText', '')))
                        if not title:
                            continue
                        title = title[:200]

                        q_id = str(q.get('Id', q.get('id', q.get('value', {}).get('id', ''))))
                        link = 'https://questions-statements.parliament.uk/written-questions/detail/' + q_id if q_id else ''
                        if not link:
                            link = 'https://parliament.uk/question/' + hashlib.md5(title.encode()).hexdigest()[:10]

                        if article_exists(conn, link):
                            continue

                        date_str = q.get('DateTabled', q.get('dateTabled', q.get('value', {}).get('dateTabled', '')))
                        if date_str:
                            try:
                                published = date_str[:19]  # ISO format
                            except Exception:
                                published = datetime.now().isoformat()
                        else:
                            published = datetime.now().isoformat()

                        full_text = mp_name + ' asked: ' + title

                        boroughs = detect_boroughs(full_text)
                        flag = 'is_' + borough
                        if flag in boroughs:
                            boroughs[flag] = 1
                        borough_list = borough_names_for_article(boroughs)

                        interest = calc_interest_score(full_text, 'politics', boosters)
                        interest = min(interest + 10, 100)
                        trending = calc_trending_score(published, mp_name, interest, 0)

                        search_text = ' '.join([mp_name, title, 'politics'] + borough_list)

                        article = {
                            'id': hashlib.md5(link.encode()).hexdigest(),
                            'title': mp_name + ' MP: ' + title[:150],
                            'link': link,
                            'source': mp_name + ' MP (Parliament)',
                            'source_type': 'parliament',
                            'published': published,
                            'summary': full_text[:500],
                            'category': 'politics',
                            'interest_score': interest,
                            'trending_score': trending,
                            'social_handle': '',
                            'social_avatar': '',
                            'social_platform': 'parliament',
                            'social_engagement': 0,
                            'search_text': search_text,
                            'boroughs': boroughs,
                        }

                        insert_article(conn, article)
                        total_new += 1

                except Exception as ex:
                    log.debug('Parliament: Question parse error for %s: %s', mp_name, ex)

            conn.commit()

        except Exception as ex:
            log.debug('Parliament: %s API error: %s', mp_name, ex)

        time.sleep(0.5)

    if total_new:
        log.info('Parliament: %d new questions/items', total_new)
    return total_new


# ═══════════════════════════════════════════════════════════════════════════════
# POLICE API — Lancashire crime data
# ═══════════════════════════════════════════════════════════════════════════════

LANCASHIRE_FORCE = 'lancashire'


def crawl_police_api(categories, boosters, conn):
    """Fetch Lancashire crime updates from data.police.uk API."""
    total_new = 0

    try:
        # Get force news/events
        url = 'https://data.police.uk/api/forces/' + LANCASHIRE_FORCE
        force_data = fetch_json_url(url)
        force_name = force_data.get('name', 'Lancashire Constabulary')
        log.info('Police API: Fetching data for %s', force_name)

        # Neighbourhood-level crime isn't great for news — focus on force-level
        # Get crime categories
        url = 'https://data.police.uk/api/crime-categories'
        crime_cats = fetch_json_url(url)

        # Get latest available date
        url = 'https://data.police.uk/api/crimes-no-location?category=all-crime&force=' + LANCASHIRE_FORCE
        try:
            crimes = fetch_json_url(url)
            if crimes:
                # Group by category for summary
                cat_counts = {}
                for crime in crimes:
                    cat = crime.get('category', 'other')
                    cat_counts[cat] = cat_counts.get(cat, 0) + 1

                # Create a summary article for notable crime stats
                month = crimes[0].get('month', '') if crimes else ''
                link = 'https://data.police.uk/data/force/' + LANCASHIRE_FORCE + '/' + month

                if not article_exists(conn, link):
                    top_cats = sorted(cat_counts.items(), key=lambda x: x[1], reverse=True)[:5]
                    summary_parts = []
                    for cat, count in top_cats:
                        cat_name = cat.replace('-', ' ').title()
                        summary_parts.append(cat_name + ': ' + str(count))

                    title = 'Lancashire Crime Statistics: ' + month
                    summary = 'Crime reports for ' + month + '. ' + ', '.join(summary_parts)
                    summary += '. Total: ' + str(len(crimes)) + ' incidents without specific location.'

                    boroughs = detect_boroughs(summary)
                    interest = 45
                    trending = calc_trending_score(datetime.now().isoformat(), force_name, interest, 0)

                    article = {
                        'id': hashlib.md5(link.encode()).hexdigest(),
                        'title': title,
                        'link': link,
                        'source': 'Lancashire Police Data',
                        'source_type': 'police_api',
                        'published': datetime.now().isoformat(),
                        'summary': summary,
                        'category': 'crime',
                        'interest_score': interest,
                        'trending_score': trending,
                        'social_handle': '',
                        'social_avatar': '',
                        'social_platform': 'police_api',
                        'social_engagement': 0,
                        'search_text': title + ' ' + summary + ' crime lancashire',
                        'boroughs': boroughs,
                    }

                    insert_article(conn, article)
                    total_new += 1
                    conn.commit()

        except Exception as ex:
            log.debug('Police API: Crime data error: %s', ex)

    except Exception as ex:
        log.error('Police API error: %s', ex)

    if total_new:
        log.info('Police API: %d new items', total_new)
    return total_new


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

def run():
    start = datetime.now()
    log.info('=== Social & API Crawler started ===')

    categories, boosters = load_categories()
    conn = get_db()

    # 1. Google News — politician-specific searches
    gn_new = crawl_google_news(GOOGLE_NEWS_SEARCHES, categories, boosters, conn)

    # 2. Parliament API — Lancashire MP questions
    parl_new = crawl_parliament_api(categories, boosters, conn)

    # 3. Police API — Lancashire crime stats
    police_new = crawl_police_api(categories, boosters, conn)

    elapsed = (datetime.now() - start).total_seconds()
    log.info(
        '=== Social & API Crawler done: Google News +%d, Parliament +%d, Police +%d | %.1fs ===',
        gn_new, parl_new, police_new, elapsed
    )

    conn.close()


if __name__ == '__main__':
    run()
