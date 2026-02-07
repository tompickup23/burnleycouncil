#!/usr/bin/env python3
"""
Optimized News Crawler for News Lancashire
Features: Caching, duplicate detection, batch operations, rate limiting
"""

import feedparser
import sqlite3
import hashlib
import json
import time
import os
from datetime import datetime, timedelta
from urllib.parse import urlparse
import logging

# Configuration
DB_PATH = '/home/ubuntu/newslancashire/db/news.db'
CACHE_DIR = '/home/ubuntu/newslancashire/.cache'
LOG_FILE = '/home/ubuntu/newslancashire/logs/crawler.log'
STATE_FILE = '/home/ubuntu/newslancashire/.crawler_state.json'

# Rate limiting (seconds between requests to same domain)
RATE_LIMIT = 2

# Feed sources with their domains for rate limiting
FEEDS = [
    ('http://feeds.bbci.co.uk/news/england/lancashire/rss.xml', 'BBC Lancashire', 'bbc.co.uk'),
    ('https://www.lancashiretelegraph.co.uk/rss/', 'Lancashire Telegraph', 'lancashiretelegraph.co.uk'),
    ('https://www.burnleyexpress.net/rss/', 'Burnley Express', 'burnleyexpress.net'),
    ('https://www.blackpoolgazette.co.uk/rss/', 'Blackpool Gazette', 'blackpoolgazette.co.uk'),
    ('https://www.lancasterguardian.co.uk/rss/', 'Lancaster Guardian', 'lancasterguardian.co.uk'),
    ('https://www.lep.co.uk/rss/', 'LEP Preston', 'lep.co.uk'),
]

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger('crawler')

# Ensure cache directory exists
os.makedirs(CACHE_DIR, exist_ok=True)

class NewsCrawler:
    def __init__(self):
        self.conn = None
        self.cursor = None
        self.state = self.load_state()
        self.new_articles = []
        self.batch_size = 50
        
    def load_state(self):
        """Load crawler state from file"""
        if os.path.exists(STATE_FILE):
            try:
                with open(STATE_FILE, 'r') as f:
                    return json.load(f)
            except:
                pass
        return {'last_runs': {}, 'article_hashes': set()}
    
    def save_state(self):
        """Save crawler state to file"""
        # Convert set to list for JSON serialization
        state_to_save = self.state.copy()
        state_to_save['article_hashes'] = list(state_to_save.get('article_hashes', set()))
        with open(STATE_FILE, 'w') as f:
            json.dump(state_to_save, f)
    
    def init_db(self):
        """Initialize database with optimized schema"""
        self.conn = sqlite3.connect(DB_PATH)
        self.conn.execute('PRAGMA journal_mode=WAL')  # Write-Ahead Logging for better concurrency
        self.conn.execute('PRAGMA synchronous=NORMAL')  # Faster writes with good safety
        self.cursor = self.conn.cursor()
        
        self.cursor.execute('''
            CREATE TABLE IF NOT EXISTS articles (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                link TEXT NOT NULL UNIQUE,
                source TEXT NOT NULL,
                published TEXT,
                summary TEXT,
                content TEXT,
                is_processed INTEGER DEFAULT 0,
                is_burnley INTEGER DEFAULT 0,
                is_blackpool INTEGER DEFAULT 0,
                is_preston INTEGER DEFAULT 0,
                is_lancaster INTEGER DEFAULT 0,
                fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Create indexes for faster queries
        self.cursor.execute('CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source)')
        self.cursor.execute('CREATE INDEX IF NOT EXISTS idx_articles_fetched ON articles(fetched_at)')
        self.cursor.execute('CREATE INDEX IF NOT EXISTS idx_articles_location ON articles(is_burnley, is_blackpool, is_preston, is_lancaster)')
        self.cursor.execute('CREATE INDEX IF NOT EXISTS idx_articles_link ON articles(link)')
        
        self.conn.commit()
        logger.info("Database initialized with indexes")
    
    def get_feed_cache_path(self, url):
        """Get cache file path for a feed"""
        feed_hash = hashlib.md5(url.encode()).hexdigest()
        return os.path.join(CACHE_DIR, f'feed_{feed_hash}.json')
    
    def get_cached_feed(self, url, max_age=300):
        """Get cached feed if fresh enough (default 5 minutes)"""
        cache_path = self.get_feed_cache_path(url)
        if os.path.exists(cache_path):
            try:
                with open(cache_path, 'r') as f:
                    cached = json.load(f)
                    cached_time = datetime.fromisoformat(cached['timestamp'])
                    if datetime.now() - cached_time < timedelta(seconds=max_age):
                        return cached['entries']
            except Exception as e:
                logger.warning(f"Cache read error for {url}: {e}")
        return None
    
    def cache_feed(self, url, entries):
        """Cache feed entries"""
        cache_path = self.get_feed_cache_path(url)
        try:
            with open(cache_path, 'w') as f:
                json.dump({
                    'timestamp': datetime.now().isoformat(),
                    'entries': entries
                }, f)
        except Exception as e:
            logger.warning(f"Cache write error for {url}: {e}")
    
    def detect_location(self, title, summary):
        """Detect location keywords in article"""
        text = (title + ' ' + summary).lower()
        locations = {
            'burnley': ['burnley', 'padiham', 'brierfield', 'nelson'],
            'blackpool': ['blackpool', 'lytham', 'st annes'],
            'preston': ['preston', 'fulwood', 'penwortham', 'leyland'],
            'lancaster': ['lancaster', 'morecambe', 'heysham']
        }
        return {loc: 1 if any(kw in text for kw in keywords) else 0 
                for loc, keywords in locations.items()}
    
    def rate_limit_check(self, domain):
        """Check if we should wait before fetching from this domain"""
        last_run = self.state.get('last_runs', {}).get(domain, 0)
        elapsed = time.time() - last_run
        if elapsed < RATE_LIMIT:
            sleep_time = RATE_LIMIT - elapsed
            logger.info(f"Rate limiting {domain}: sleeping {sleep_time:.1f}s")
            time.sleep(sleep_time)
    
    def fetch_feed(self, url, source_name, domain):
        """Fetch a single feed with caching and rate limiting"""
        # Check cache first
        cached_entries = self.get_cached_feed(url)
        if cached_entries is not None:
            logger.info(f"Using cached feed: {source_name}")
            return self.process_entries(cached_entries, source_name)
        
        # Rate limiting
        self.rate_limit_check(domain)
        
        try:
            logger.info(f"Fetching: {source_name}")
            feed = feedparser.parse(url)
            self.state['last_runs'][domain] = time.time()
            
            if feed.bozo:
                logger.warning(f"Feed parsing warning for {source_name}: {feed.bozo_exception}")
            
            # Cache successful fetch
            entries = [
                {
                    'title': entry.get('title', ''),
                    'link': entry.get('link', ''),
                    'summary': entry.get('summary', '')[:800],
                    'published': entry.get('published', datetime.now().isoformat())
                }
                for entry in feed.entries[:15]
            ]
            self.cache_feed(url, entries)
            
            return self.process_entries(entries, source_name)
            
        except Exception as e:
            logger.error(f"Error fetching {source_name}: {e}")
            return 0
    
    def process_entries(self, entries, source_name):
        """Process feed entries and queue for batch insert"""
        new_count = 0
        
        for entry in entries:
            article_id = hashlib.md5(entry['link'].encode()).hexdigest()
            
            # Skip if already seen
            if article_id in self.state.get('article_hashes', set()):
                continue
            
            # Check database for existing link
            self.cursor.execute('SELECT 1 FROM articles WHERE link = ? LIMIT 1', (entry['link'],))
            if self.cursor.fetchone():
                self.state.setdefault('article_hashes', set()).add(article_id)
                continue
            
            locs = self.detect_location(entry['title'], entry['summary'])
            
            self.new_articles.append({
                'id': article_id,
                'title': entry['title'],
                'link': entry['link'],
                'source': source_name,
                'published': entry['published'],
                'summary': entry['summary'],
                'is_burnley': locs['burnley'],
                'is_blackpool': locs['blackpool'],
                'is_preston': locs['preston'],
                'is_lancaster': locs['lancaster']
            })
            
            self.state.setdefault('article_hashes', set()).add(article_id)
            new_count += 1
            
            # Batch insert when threshold reached
            if len(self.new_articles) >= self.batch_size:
                self.flush_batch()
        
        return new_count
    
    def flush_batch(self):
        """Insert queued articles in batch"""
        if not self.new_articles:
            return
        
        try:
            self.cursor.executemany('''
                INSERT INTO articles 
                (id, title, link, source, published, summary, is_burnley, is_blackpool, is_preston, is_lancaster)
                VALUES (:id, :title, :link, :source, :published, :summary, :is_burnley, :is_blackpool, :is_preston, :is_lancaster)
            ''', self.new_articles)
            self.conn.commit()
            logger.info(f"Batch inserted {len(self.new_articles)} articles")
        except sqlite3.IntegrityError:
            # Fallback to individual inserts on conflict
            for article in self.new_articles:
                try:
                    self.cursor.execute('''
                        INSERT INTO articles 
                        (id, title, link, source, published, summary, is_burnley, is_blackpool, is_preston, is_lancaster)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (article['id'], article['title'], article['link'], article['source'],
                          article['published'], article['summary'], article['is_burnley'],
                          article['is_blackpool'], article['is_preston'], article['is_lancaster']))
                except sqlite3.IntegrityError:
                    pass
            self.conn.commit()
        
        self.new_articles = []
    
    def cleanup_old_articles(self, days=30):
        """Remove articles older than specified days"""
        cutoff = datetime.now() - timedelta(days=days)
        self.cursor.execute('DELETE FROM articles WHERE fetched_at < ?', (cutoff.isoformat(),))
        deleted = self.cursor.rowcount
        self.conn.commit()
        logger.info(f"Cleaned up {deleted} old articles")
        return deleted
    
    def run(self):
        """Main crawler run"""
        logger.info(f"=== Crawler started: {datetime.now().strftime('%Y-%m-%d %H:%M')} ===")
        
        self.init_db()
        total_new = 0
        
        # Fetch all feeds
        for url, name, domain in FEEDS:
            count = self.fetch_feed(url, name, domain)
            total_new += count
            logger.info(f"{name}: {count} new articles")
        
        # Flush remaining articles
        self.flush_batch()
        
        # Cleanup old articles
        self.cleanup_old_articles(days=30)
        
        # Save state
        self.save_state()
        
        # Optimize database
        self.cursor.execute('VACUUM')
        self.conn.commit()
        
        # Get stats
        self.cursor.execute('SELECT COUNT(*) FROM articles')
        total_articles = self.cursor.fetchone()[0]
        
        logger.info(f"=== Total: {total_new} new articles | Database: {total_articles} total ===")
        
        self.conn.close()
        return total_new

if __name__ == '__main__':
    crawler = NewsCrawler()
    crawler.run()
