#!/usr/bin/env python3
"""
AI DOGE Newsletter Generator

Generates weekly HTML and plain-text email newsletters from articles-index.json data.
Outputs responsive HTML and plain-text versions for each council.

Usage:
    python3 newsletter_generator.py                           # All councils, last 7 days
    python3 newsletter_generator.py --council burnley         # Single council
    python3 newsletter_generator.py --days 14 --council pendle  # 14 days, Pendle only
    python3 newsletter_generator.py --output-dir /tmp/news    # Custom output path
"""

import json
import argparse
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Optional
import re
import html


# Configuration
BASE_URL_TEMPLATE = "https://aidoge.co.uk/lancashire/{council}council/"
COUNCILS = ["burnley", "hyndburn", "pendle", "rossendale"]
BRAND_COLOR = "#0a84ff"
BRAND_SECONDARY = "#0066cc"
PUBLISHER = "AI DOGE — East Lancashire Transparency"

# Email template constants
SUMMARY_MAX_CHARS = 150
ARTICLE_MAX_DISPLAY = 10


def parse_args():
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Generate weekly newsletters from articles-index.json data"
    )
    parser.add_argument(
        "--council",
        type=str,
        choices=COUNCILS,
        default=None,
        help="Specific council to generate (default: all)",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=7,
        help="Number of days to include in digest (default: 7)",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Custom output directory (default: burnley-council/data/{council}/)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview output without writing files",
    )
    return parser.parse_args()


def get_data_dir() -> Path:
    """Get the burnley-council/data directory."""
    script_path = Path(__file__).resolve()
    return script_path.parent.parent / "data"


def load_articles_index(council: str, data_dir: Path) -> List[Dict]:
    """
    Load articles-index.json for a council.
    Handle both wrapped {articles: [...]} and unwrapped [...] formats.
    """
    index_path = data_dir / council / "articles-index.json"

    if not index_path.exists():
        print(f"⚠️  Articles index not found: {index_path}")
        return []

    try:
        with open(index_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        # Handle wrapped format: {articles: [...]}
        if isinstance(data, dict) and "articles" in data:
            articles = data["articles"]
        elif isinstance(data, list):
            articles = data
        else:
            print(f"⚠️  Unexpected format in {index_path}")
            return []

        return articles if isinstance(articles, list) else []

    except json.JSONDecodeError as e:
        print(f"❌ JSON decode error in {index_path}: {e}")
        return []
    except Exception as e:
        print(f"❌ Error loading {index_path}: {e}")
        return []


def filter_articles_by_date(articles: List[Dict], days: int) -> List[Dict]:
    """Filter articles from the last N days."""
    cutoff_date = datetime.now() - timedelta(days=days)

    filtered = []
    for article in articles:
        try:
            article_date = datetime.strptime(article.get("date", ""), "%Y-%m-%d")
            if article_date >= cutoff_date:
                filtered.append(article)
        except (ValueError, TypeError):
            continue

    # Sort by date, most recent first
    return sorted(filtered, key=lambda x: x.get("date", ""), reverse=True)


def truncate_summary(summary: str, max_chars: int = SUMMARY_MAX_CHARS) -> str:
    """Truncate summary to max chars, ending at word boundary."""
    if not summary:
        return ""

    summary = summary.strip()

    if len(summary) <= max_chars:
        return summary

    truncated = summary[:max_chars].rsplit(" ", 1)[0]
    return truncated + "…"


def generate_html_newsletter(
    council: str,
    articles: List[Dict],
    days: int,
) -> str:
    """Generate responsive HTML email template."""
    base_url = BASE_URL_TEMPLATE.format(council=council)
    article_count = len(articles)
    period_label = f"{days} day{'s' if days != 1 else ''}"
    generated_date = datetime.now().strftime("%B %d, %Y at %I:%M %p")
    council_title = council.replace("_", " ").title()

    # Build article rows HTML
    article_rows = ""
    for i, article in enumerate(articles[:ARTICLE_MAX_DISPLAY]):
        article_id = article.get("id", "").replace('"', "&quot;")
        title = html.escape(article.get("title", "Untitled"))
        category = html.escape(article.get("category", "News"))
        summary = truncate_summary(article.get("summary", ""))
        summary = html.escape(summary)
        article_url = f"{base_url}article/{article_id}"

        article_rows += f"""
                    <tr style="border-bottom: 1px solid #e0e0e0;">
                        <td style="padding: 16px 0; vertical-align: top;">
                            <div style="margin-bottom: 8px;">
                                <span style="background-color: {BRAND_COLOR}; color: white; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 600; text-transform: uppercase;">{category}</span>
                            </div>
                            <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: #1a1a1a; line-height: 1.4;">
                                <a href="{article_url}" style="color: {BRAND_COLOR}; text-decoration: none;">{title}</a>
                            </h3>
                            <p style="margin: 0 0 12px 0; font-size: 14px; color: #555555; line-height: 1.5;">{summary}</p>
                            <a href="{article_url}" style="color: {BRAND_COLOR}; text-decoration: none; font-weight: 600; font-size: 13px;">Read Full Article →</a>
                        </td>
                    </tr>
"""

    # If more articles than display limit, add "View All" note
    view_all_note = ""
    if article_count > ARTICLE_MAX_DISPLAY:
        remaining = article_count - ARTICLE_MAX_DISPLAY
        view_all_note = f"""
                    <tr>
                        <td style="padding: 16px 0; text-align: center;">
                            <p style="margin: 0; font-size: 14px; color: #666666;">
                                <a href="{base_url}" style="color: {BRAND_COLOR}; text-decoration: none; font-weight: 600;">View all {article_count} articles →</a>
                            </p>
                        </td>
                    </tr>
"""

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI DOGE Newsletter - {council_title}</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f9f9f9;
            margin: 0;
            padding: 0;
        }}
        a {{
            color: {BRAND_COLOR};
            text-decoration: none;
        }}
        a:hover {{
            text-decoration: underline;
        }}
        .email-container {{
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border: 1px solid #e0e0e0;
        }}
        .header {{
            background: linear-gradient(135deg, {BRAND_COLOR} 0%, {BRAND_SECONDARY} 100%);
            color: white;
            padding: 24px 20px;
            text-align: center;
        }}
        .header h1 {{
            margin: 0 0 8px 0;
            font-size: 28px;
            font-weight: 700;
        }}
        .header p {{
            margin: 0;
            font-size: 14px;
            opacity: 0.9;
        }}
        .content {{
            padding: 24px 20px;
        }}
        .section {{
            margin-bottom: 24px;
        }}
        .section-title {{
            font-size: 18px;
            font-weight: 600;
            color: #1a1a1a;
            margin: 0 0 16px 0;
            padding-bottom: 12px;
            border-bottom: 2px solid {BRAND_COLOR};
        }}
        .article {{
            margin-bottom: 20px;
            padding-bottom: 20px;
            border-bottom: 1px solid #e0e0e0;
        }}
        .article:last-child {{
            border-bottom: none;
            margin-bottom: 0;
            padding-bottom: 0;
        }}
        .article-category {{
            background-color: {BRAND_COLOR};
            color: white;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            display: inline-block;
            margin-bottom: 8px;
        }}
        .article-title {{
            font-size: 16px;
            font-weight: 600;
            color: #1a1a1a;
            margin: 0 0 8px 0;
            line-height: 1.4;
        }}
        .article-title a {{
            color: {BRAND_COLOR};
        }}
        .article-summary {{
            font-size: 14px;
            color: #555555;
            margin: 0 0 12px 0;
            line-height: 1.5;
        }}
        .article-link {{
            color: {BRAND_COLOR};
            font-weight: 600;
            font-size: 13px;
        }}
        .footer {{
            background-color: #f5f5f5;
            padding: 20px;
            text-align: center;
            border-top: 1px solid #e0e0e0;
            font-size: 12px;
            color: #666666;
        }}
        .footer p {{
            margin: 8px 0;
        }}
        .footer-links a {{
            color: {BRAND_COLOR};
            margin: 0 12px;
            text-decoration: none;
        }}
        .footer-links a:hover {{
            text-decoration: underline;
        }}
        @media (max-width: 600px) {{
            .email-container {{
                max-width: 100%;
            }}
            .header {{
                padding: 16px 16px;
            }}
            .header h1 {{
                font-size: 24px;
            }}
            .content {{
                padding: 16px;
            }}
            .article-title {{
                font-size: 15px;
            }}
            .article-summary {{
                font-size: 13px;
            }}
        }}
    </style>
</head>
<body>
    <div class="email-container">
        <!-- Header -->
        <div class="header">
            <h1>📊 {council_title} Council Spending</h1>
            <p>Weekly Transparency Digest</p>
        </div>

        <!-- Content -->
        <div class="content">
            <div class="section">
                <p style="margin: 0 0 16px 0; color: #666666; font-size: 14px;">
                    Hello,<br><br>
                    Here are the top stories from the last <strong>{period_label}</strong> about {council_title} Council's finances and operations. All data comes from official council spending records and analysis.
                </p>
            </div>

            <div class="section">
                <div class="section-title">📰 Latest Articles ({article_count} found)</div>
                <div>
{article_rows}{view_all_note}
                </div>
            </div>

            <div class="section" style="background-color: #f0f7ff; padding: 16px; border-radius: 8px; border-left: 4px solid {BRAND_COLOR};">
                <p style="margin: 0; font-size: 13px; color: #1a5a96;">
                    <strong>What is AI DOGE?</strong><br>
                    AI DOGE (Detection Of Government Expenditure) is a free, open-source transparency tool that analyzes council spending data to help residents understand where their money goes. No paywalls. No politics. Just data.
                </p>
            </div>
        </div>

        <!-- Footer -->
        <div class="footer">
            <p>
                <strong>{PUBLISHER}</strong><br>
                Transparency for East Lancashire Residents
            </p>
            <p style="margin: 12px 0 0 0; color: #999999;">
                Generated: {generated_date}
            </p>
            <p style="margin: 12px 0 0 0;">
                <a href="{base_url}" style="color: {BRAND_COLOR}; text-decoration: none;">Visit AI DOGE</a> |
                <a href="https://aidoge.co.uk" style="color: {BRAND_COLOR}; text-decoration: none;">All Councils</a> |
                <a href="https://github.com/tompickup23/burnleycouncil" style="color: {BRAND_COLOR}; text-decoration: none;">GitHub</a>
            </p>
            <p style="margin: 12px 0 0 0; color: #999999; font-size: 11px;">
                This is an automated digest from AI DOGE. Unsubscribe or manage preferences at your email provider.
            </p>
        </div>
    </div>
</body>
</html>
"""

    return html_content


def generate_text_newsletter(
    council: str,
    articles: List[Dict],
    days: int,
) -> str:
    """Generate plain-text version of newsletter."""
    base_url = BASE_URL_TEMPLATE.format(council=council)
    article_count = len(articles)
    period_label = f"{days} day{'s' if days != 1 else ''}"
    generated_date = datetime.now().strftime("%B %d, %Y at %I:%M %p")
    council_title = council.replace("_", " ").title()

    text_content = f"""{PUBLISHER}
{council_title} Council Spending Digest
{'=' * 70}

Period: Last {period_label}
Generated: {generated_date}
Found: {article_count} article(s)

{'-' * 70}
LATEST ARTICLES
{'-' * 70}

"""

    for i, article in enumerate(articles[:ARTICLE_MAX_DISPLAY], 1):
        article_id = article.get("id", "")
        title = article.get("title", "Untitled")
        category = article.get("category", "News")
        summary = truncate_summary(article.get("summary", ""))
        article_url = f"{base_url}article/{article_id}"

        text_content += f"""
{i}. [{category.upper()}] {title}

   {summary}

   Read more: {article_url}

"""

    if article_count > ARTICLE_MAX_DISPLAY:
        remaining = article_count - ARTICLE_MAX_DISPLAY
        text_content += f"""
{'-' * 70}

View all {article_count} articles: {base_url}

"""

    text_content += f"""
{'-' * 70}
ABOUT AI DOGE

AI DOGE (Detection Of Government Expenditure) is a free, open-source
transparency tool that analyzes council spending data to help residents
understand where their money goes.

• No paywalls
• No politics
• Just data

Visit: https://aidoge.co.uk
GitHub: https://github.com/tompickup23/burnleycouncil

{'-' * 70}

This is an automated digest from AI DOGE. Unsubscribe or manage preferences
at your email provider.
"""

    return text_content


def main():
    """Main entry point."""
    args = parse_args()

    data_dir = get_data_dir()
    if not data_dir.exists():
        print(f"❌ Data directory not found: {data_dir}")
        sys.exit(1)

    councils_to_process = [args.council] if args.council else COUNCILS
    print(f"📧 Generating newsletters for: {', '.join(councils_to_process)}")
    print(f"📅 Period: Last {args.days} day(s)")

    for council in councils_to_process:
        print(f"\n🏛️  Processing {council.upper()}...")

        # Load articles
        articles = load_articles_index(council, data_dir)
        if not articles:
            print(f"   ⚠️  No articles found")
            continue

        # Filter by date
        filtered_articles = filter_articles_by_date(articles, args.days)
        if not filtered_articles:
            print(f"   ⚠️  No articles from the last {args.days} day(s)")
            continue

        print(f"   ✓ Found {len(filtered_articles)} article(s)")

        # Generate HTML and text
        html_content = generate_html_newsletter(council, filtered_articles, args.days)
        text_content = generate_text_newsletter(council, filtered_articles, args.days)

        # Determine output directory
        if args.output_dir:
            output_dir = Path(args.output_dir)
        else:
            output_dir = data_dir / council

        output_dir.mkdir(parents=True, exist_ok=True)

        # Save files
        html_path = output_dir / "newsletter.html"
        text_path = output_dir / "newsletter.txt"

        if args.dry_run:
            print(f"   [DRY RUN] Would write to: {html_path}")
            print(f"   [DRY RUN] Would write to: {text_path}")
        else:
            try:
                with open(html_path, "w", encoding="utf-8") as f:
                    f.write(html_content)
                print(f"   ✓ HTML newsletter: {html_path}")

                with open(text_path, "w", encoding="utf-8") as f:
                    f.write(text_content)
                print(f"   ✓ Text newsletter: {text_path}")

            except Exception as e:
                print(f"   ❌ Error writing files: {e}")
                sys.exit(1)

    print("\n✅ Newsletter generation complete!")


if __name__ == "__main__":
    main()
