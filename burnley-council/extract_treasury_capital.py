#\!/usr/bin/env python3
import pdfplumber, re, os
from datetime import datetime

PDF_DIR = "/Users/tompickup/Documents/BBC/Budgets"
PDF_FILES = ["Budget-Book-2021-22.pdf","Budget-Book-2022-23.pdf","Budget-Book-2023-24.pdf","Budget-Book-2024-25.pdf","Budget-Book-2025-26.pdf"]
OUTPUT_FILE = "/Users/tompickup/clawd/burnley-council/treasury_capital_extraction.txt"

SEARCH_TOPICS = {
    "Capital Programme / Capital Investment": [r"capital\s+programme", r"capital\s+investment", r"capital\s+expenditure", r"capital\s+budget", r"capital\s+plan", r"capital\s+scheme", r"capital\s+spend", r"capital\s+strategy", r"capital\s+receipt", r"capital\s+financing"],
    "Treasury Management": [r"treasury\s+management", r"treasury\s+strategy"],
    "Investment Strategy": [r"investment\s+strategy", r"investment\s+portfolio", r"investment\s+income", r"investment\s+return"],
    "Borrowing / Debt": [r"borrowing", r"external\s+debt", r"debt\s+outstanding", r"long[\s-]+term\s+debt", r"short[\s-]+term\s+debt", r"\bloan\b"],
    "Reserves / Balances": [r"reserves?\s+and\s+balances", r"general\s+fund\s+reserve", r"earmarked\s+reserve", r"reserve\s+balance", r"usable\s+reserve"],
    "Medium Term Financial Strategy (MTFS)": [r"medium\s+term\s+financial\s+strategy", r"medium\s+term\s+financial\s+plan", r"\bMTFS\b"],
    "Prudential Indicators": [r"prudential\s+indicator", r"prudential\s+code", r"prudential\s+framework"],
    "Minimum Revenue Provision (MRP)": [r"minimum\s+revenue\s+provision", r"\bMRP\b"],
}
BROAD_KEYWORDS = [r"\bcapital\b", r"\btreasury\b", r"\bprudential\b"]

def extract_text_adaptive(page):
    for xtol in (3, 5, 7):
        text = page.extract_text(x_tolerance=xtol, y_tolerance=3) or ""
        if len(text.split()) > 5: return text, xtol
    return text, 7

def extract_tables_from_page(page):
    tables = []
    try:
        raw = page.extract_tables({"vertical_strategy":"lines","horizontal_strategy":"lines","snap_tolerance":5,"join_tolerance":5,"edge_min_length":10,"text_x_tolerance":5,"text_y_tolerance":3})
        if not raw: raw = page.extract_tables({"vertical_strategy":"text","horizontal_strategy":"text","snap_tolerance":5,"join_tolerance":5,"text_x_tolerance":5,"text_y_tolerance":3})
    except: raw = []
    for t in (raw or []):
        if not t: continue
        lines = []
        for row in t:
            cells = [(c or "").strip().replace(chr(10)," ") for c in row]
            lines.append(" | ".join(cells))
        if lines: tables.append(chr(10).join(lines))
    return tables

def classify_page(text):
    matched = set()
    tl = text.lower()
    for topic, pats in SEARCH_TOPICS.items():
        for p in pats:
            if re.search(p, tl): matched.add(topic); break
    for p in BROAD_KEYWORDS:
        if re.search(p, tl): matched.add("__broad__"); break
    return matched

def is_cap_table(text):
    tl = text.lower()
    inds = [r"capital\s+programme",r"capital\s+investment\s+programme",r"capital\s+scheme",r"capital\s+expenditure",r"capital\s+budget\s+summary",r"total\s+capital",r"funded\s+by",r"funding\s+source",r"prudential\s+borrowing",r"capital\s+receipt",r"capital\s+grant",r"external\s+funding"]
    return sum(1 for i in inds if re.search(i, tl)) >= 2

def process_pdf(path, out):
    bn = os.path.basename(path)
    yl = bn.replace("Budget-Book-","").replace(".pdf","")
    out.write("="*100+"
  BUDGET BOOK: "+yl+"
  File: "+path+"
"+"="*100+"

")
    try: pdf = pdfplumber.open(path)
    except Exception as e: out.write("  ERROR: "+str(e)+"

"); return
    tp = len(pdf.pages)
    out.write("  Total pages: "+str(tp)+"

")
    tpages = {}; ctp = []; pd = []
    for i, pg in enumerate(pdf.pages):
        pn = i+1; txt, xt = extract_text_adaptive(pg)
        tops = classify_page(txt); ic = is_cap_table(txt)
        pd.append((pn,txt,xt,tops,ic))
        for t in tops:
            if t\!="__broad__": tpages.setdefault(t,[]).append(pn)
        if ic: ctp.append(pn)
    rm = set()
    for pn,txt,xt,tops,ic in pd:
        rt = tops-{"__broad__"}
        if rt or ic: rm.add(pn)
    exp = set(rm)
    for pn,txt,xt,tops,ic in pd:
        if "__broad__" in tops:
            if any(abs(pn-r)<=2 for r in rm): exp.add(pn)
    out.write("  --- TOPIC SUMMARY ---
")
    for t in sorted(tpages): out.write("    "+t+": pages "+", ".join(str(p) for p in tpages[t])+"
")
    if ctp: out.write("    [Capital Programme Tables]: pages "+", ".join(str(p) for p in ctp)+"
")
    out.write("    Total relevant pages: "+str(len(exp))+"
  --- END TOPIC SUMMARY ---

")
    for pn,txt,xt,tops,ic in pd:
        if pn not in exp: continue
        rt = tops-{"__broad__"}
        tl = ", ".join(sorted(rt)) if rt else "Context/Continuation"
        if ic: tl += " [CAPITAL PROGRAMME TABLE]"
        out.write("-"*90+"
  Page "+str(pn)+" of "+str(tp)+"  |  x_tolerance="+str(xt)+"  |  Topics: "+tl+"
"+"-"*90+"

")
        if txt.strip(): out.write(txt+"

")
        else: out.write("  [No text]

")
        tabs = extract_tables_from_page(pdf.pages[pn-1])
        if tabs:
            out.write("  >>> TABLES ("+str(len(tabs))+") <<<

")
            for ti,tb in enumerate(tabs): out.write("  -- Table "+str(ti+1)+" --
"+tb+"

")
        out.write("
")
    pdf.close(); out.write("

")

def main():
    print("Starting extraction...")
    with open(OUTPUT_FILE,"w") as out:
        out.write("BURNLEY COUNCIL BUDGET BOOKS - TREASURY, CAPITAL & INVESTMENT EXTRACTION
")
        out.write("Generated: "+datetime.now().strftime("%Y-%m-%d %H:%M:%S")+"
"+"="*100+"

")
        out.write("Sections: Capital, Treasury, Investment, Borrowing, Reserves, MTFS, Prudential, MRP

"+"="*100+"

")
        for f in PDF_FILES:
            p = os.path.join(PDF_DIR,f)
            if not os.path.exists(p): print("  SKIP:",p); continue
            print("Processing:",f)
            process_pdf(p,out)
            print("  Done.")
        out.write("
"+"="*100+"
END OF EXTRACTION
"+"="*100+"
")
    sz = os.path.getsize(OUTPUT_FILE)
    print("
Complete. Size: {:,} bytes ({:.1f} KB)".format(sz,sz/1024))

if __name__=="__main__": main()
