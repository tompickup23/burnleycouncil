#!/usr/bin/env python3
"""
Burnley Council Budget Book PDF Extractor
Extracts Revenue Budget Summary pages from 5 Budget Book PDFs (2021-22 through 2025-26).
Uses pdfplumber with adaptive x_tolerance to handle both clean and garbled PDFs.
"""

import pdfplumber
import os
import re
import sys

PDF_DIR = "/Users/tompickup/Documents/BBC/Budgets"
OUTPUT_FILE = "/Users/tompickup/clawd/burnley-council/budget_extraction.txt"

PDF_FILES = [
    ("Budget-Book-2021-22.pdf", "2021/22"),
    ("Budget-Book-2022-23.pdf", "2022/23"),
    ("Budget-Book-2023-24.pdf", "2023/24"),
    ("Budget-Book-2024-25.pdf", "2024/25"),
    ("Budget-Book-2025-26.pdf", "2025/26"),
]

REVENUE_KEYWORDS = [
    "revenue budget summary",
    "revenue expenditure summary",
    "revenue summary",
    "general fund revenue",
    "net revenue budget",
    "summary of revenue",
    "summary by service unit",
    "net cost of services",
]

CONFIRMATION_KEYWORDS = [
    "original estimate",
    "revised estimate",
    "actual",
    "outturn",
    "net expenditure",
    "council tax",
    "total net",
    "budget requirement",
    "net cost of services",
    "financed by",
    "total funding",
    "earmarked reserves",
]

DEPT_NAMES = [
    "management team", "chief executive", "economy", "environment",
    "housing", "leisure", "finance", "governance", "people",
    "place", "resources", "communities", "growth", "green spaces",
    "streetscene", "policy", "regeneration", "corporate budgets",
    "strategic partnership", "revenues and benefits", "leisure trust",
    "legal", "democratic",
]


def score_page(text_lower):
    score = 0
    for kw in REVENUE_KEYWORDS:
        if kw in text_lower:
            score += 10
    for kw in CONFIRMATION_KEYWORDS:
        if kw in text_lower:
            score += 3
    dept_count = sum(1 for d in DEPT_NAMES if d in text_lower)
    if dept_count >= 3:
        score += 15
    return score


def extract_page_text(page, x_tolerances=[3, 5, 7]):
    """Try multiple x_tolerance values and return the best result."""
    best_text = ""
    best_score = -1
    for xt in x_tolerances:
        text = page.extract_text(x_tolerance=xt, y_tolerance=3) or ""
        score = score_page(text.lower())
        if score > best_score:
            best_score = score
            best_text = text
    return best_text, best_score


def extract_tables_from_page(page):
    """Try to extract structured tables from a page."""
    result = []
    tables = page.extract_tables()
    if tables:
        for ti, table in enumerate(tables):
            result.append(f"\n  --- Structured Table {ti+1} ---")
            for row in table:
                cleaned = [str(cell).strip() if cell else "" for cell in row]
                result.append("    " + "  |  ".join(cleaned))
    return "\n".join(result) if result else None


def process_pdf(pdf_path, filename, year_label):
    """Process a single PDF and return text from revenue summary pages."""
    lines = []
    sep = "=" * 100

    lines.append(sep)
    lines.append(f"  PDF: {filename}  (Budget Year: {year_label})")
    lines.append(sep)

    try:
        with pdfplumber.open(pdf_path) as pdf:
            total_pages = len(pdf.pages)
            lines.append(f"  Total pages: {total_pages}")
            lines.append("")

            # ----------------------------------------------------------------
            # PASS 1: quick scan with default tolerance to find pages
            # ----------------------------------------------------------------
            page_data = []
            for i, page in enumerate(pdf.pages):
                text = page.extract_text() or ""
                score = score_page(text.lower())
                page_data.append({"index": i, "text": text, "score": score})

            # ----------------------------------------------------------------
            # PASS 2: for top candidates, also try wider tolerances
            # ----------------------------------------------------------------
            candidates = sorted(page_data, key=lambda p: p["score"], reverse=True)
            # Also specifically check pages 4-8 (common summary location)
            must_check = set(range(3, min(8, total_pages)))
            for c in candidates[:15]:
                must_check.add(c["index"])

            for idx in must_check:
                page = pdf.pages[idx]
                better_text, better_score = extract_page_text(page)
                if better_score > page_data[idx]["score"]:
                    page_data[idx]["text"] = better_text
                    page_data[idx]["score"] = better_score

            # ----------------------------------------------------------------
            # Find the best revenue summary pages
            # ----------------------------------------------------------------
            scored = [(p["index"], p["score"]) for p in page_data if p["score"] >= 10]
            scored.sort(key=lambda x: x[1], reverse=True)

            if not scored:
                lines.append("  WARNING: No revenue summary pages found (score >= 10).")
                scored = [(p["index"], p["score"]) for p in page_data if p["score"] >= 3]
                scored.sort(key=lambda x: x[1], reverse=True)
                scored = scored[:5]

            # ----------------------------------------------------------------
            # Output the top pages
            # ----------------------------------------------------------------
            lines.append(f"  Found {len(scored)} candidate pages (showing top 8):")
            lines.append("")

            for page_idx, score in scored[:8]:
                lines.append(f"  {'~' * 90}")
                lines.append(f"  PAGE {page_idx + 1}  (Relevance Score: {score})")
                lines.append(f"  {'~' * 90}")

                page_text = page_data[page_idx]["text"]
                lines.append("")
                lines.append("  [FULL PAGE TEXT]:")
                lines.append("")
                # Indent each line for readability
                for line in page_text.split("\n"):
                    lines.append(f"    {line}")

                # Try structured table extraction
                page_obj = pdf.pages[page_idx]
                table_text = extract_tables_from_page(page_obj)
                if table_text:
                    lines.append("")
                    lines.append("  [STRUCTURED TABLES]:")
                    lines.append(table_text)
                else:
                    lines.append("")
                    lines.append("  [No structured tables detected by pdfplumber]")

                lines.append("")

            # ----------------------------------------------------------------
            # Page index for reference
            # ----------------------------------------------------------------
            lines.append(f"  {'=' * 90}")
            lines.append(f"  FULL PAGE INDEX")
            lines.append(f"  {'=' * 90}")
            for p in page_data:
                text = p["text"].strip()
                first_lines = text.split("\n")[:2]
                summary = " | ".join(l.strip() for l in first_lines if l.strip())[:120]
                if not summary:
                    summary = "(blank or image-only page)"
                lines.append(f"    Page {p['index']+1:3d} [score:{p['score']:3d}]  {summary}")

    except Exception as e:
        lines.append(f"  ERROR: {e}")
        import traceback
        lines.append(traceback.format_exc())

    return "\n".join(lines)


def main():
    output = []
    output.append("=" * 100)
    output.append("  BURNLEY COUNCIL BUDGET BOOK - REVENUE SUMMARY EXTRACTION")
    output.append("  Generated: 2026-02-05")
    output.append("  Source: " + PDF_DIR)
    output.append("=" * 100)
    output.append("")

    for filename, year_label in PDF_FILES:
        pdf_path = os.path.join(PDF_DIR, filename)
        if not os.path.exists(pdf_path):
            output.append(f"MISSING: {pdf_path}")
            continue
        print(f"Processing {filename}...", flush=True)
        result = process_pdf(pdf_path, filename, year_label)
        output.append(result)
        output.append("")
        output.append("")

    full = "\n".join(output)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write(full)

    print(f"\nDone. Output saved to: {OUTPUT_FILE}")
    print(f"Output size: {len(full):,} characters / {full.count(chr(10)):,} lines")

    # Print to stdout as well
    print("\n" + full)


if __name__ == "__main__":
    main()
