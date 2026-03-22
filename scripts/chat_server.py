#!/usr/bin/env python3
"""
Ask Lancashire — AI DOGE Chat Server

FastAPI backend that answers natural language questions about Lancashire council data.
Uses smart context selection (not RAG) — picks the right JSON files based on query keywords,
extracts relevant stats, and sends to free LLM APIs via llm_router.py cascade.

Usage:
    uvicorn chat_server:app --host 0.0.0.0 --port 8430
    # or: python3 chat_server.py

Deployment: systemd service on vps-main, port 8430
"""

import json
import os
import re
import sys
import time
import uuid
import logging
from datetime import datetime, timezone
from pathlib import Path
from collections import defaultdict

# Add scripts dir to path for llm_router
SCRIPT_DIR = Path(__file__).parent
sys.path.insert(0, str(SCRIPT_DIR.parent / "burnley-council" / "scripts"))

try:
    from fastapi import FastAPI, HTTPException, Request
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse
    from pydantic import BaseModel
except ImportError:
    os.system("pip3 install fastapi uvicorn pydantic 2>/dev/null")
    from fastapi import FastAPI, HTTPException, Request
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse
    from pydantic import BaseModel

from llm_router import PROVIDERS, _call_provider

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")
log = logging.getLogger("AskLancashire")

# --- Config ---
DATA_ROOT = Path(__file__).parent.parent / "burnley-council" / "data"
ALLOWED_ORIGINS = ["https://aidoge.co.uk", "http://localhost:5173", "http://localhost:4173"]
MAX_CONTEXT_TOKENS = 3000  # rough char estimate: 1 token ≈ 4 chars → 12K chars
MAX_HISTORY = 5
SESSION_TIMEOUT = 1800  # 30 min
RATE_LIMIT_PER_MIN = 10
RATE_LIMIT_PER_DAY = 200

# All 15 councils
COUNCILS = [
    "burnley", "hyndburn", "pendle", "rossendale", "lancaster", "ribble_valley",
    "chorley", "south_ribble", "lancashire_cc", "blackpool", "west_lancashire",
    "blackburn", "wyre", "preston", "fylde"
]

SYSTEM_PROMPT = """You are Ask Lancashire, an AI transparency analyst for Lancashire council data.

Rules:
- Answer using ONLY the data provided in the context below. Never invent figures.
- Cite specific numbers, names, and dates from the data.
- If the data doesn't contain the answer, say "I don't have that data" and suggest what page on AI DOGE might help.
- Keep answers concise but informative. Use bullet points for lists.
- When discussing money, format as £X,XXX. When discussing percentages, use one decimal place.
- You cover all 15 Lancashire councils: 12 districts (Burnley, Hyndburn, Pendle, Rossendale, Lancaster, Ribble Valley, Chorley, South Ribble, Preston, West Lancashire, Wyre, Fylde), 1 county council (Lancashire CC), and 2 unitaries (Blackpool, Blackburn with Darwen).
- Districts handle housing, planning, waste collection. LCC handles education, social care, highways. Unitaries do everything.
"""

# --- Query Classification ---
TOPIC_PATTERNS = {
    "spending": r"\b(spend(ing)?|payment|supplier|vendor|contract|procur|waste.*(money|cost)|cost|paid|invoice|transaction|expenditure|categor)\b",
    "councillors": r"\b(councillor|member|council\s*member|who\s*(is|are)|representative|elected|seat)\b",
    "integrity": r"\b(integrity|conflict|interest|declaration|compan(y|ies)\s*house|dodg|corrupt|flag)\b",
    "budgets": r"\b(budget|council\s*tax|band\s*d|reserve|revenue|capital|financ|fund|deficit|surplus)\b",
    "elections": r"\b(election|vote|swing|turnout|ballot|candidate|ward\s*result|majority|poll)\b",
    "roads": r"\b(road|highway|pothole|roadwork|traffic|closure|lane|resurfac|gritting|overdue|operator.*league|longest.*(running|work))\b",
    "planning": r"\b(planning|application|develop|hmo|hous(e|ing)|build|permit|dwelling)\b",
    "health": r"\b(health|life\s*expectan|obesity|mortality|disabled|deprivat|imd|depriv)\b",
    "demographics": r"\b(population|census|ethnic|religion|age\s*(group|profile)|demograph|migra)\b",
    "economy": r"\b(econom|employment|unemploy|claimant|benefit|job|wage|earning|industr)\b",
    "meetings": r"\b(meeting|motion|debate|minute|agenda|committee|cabinet|full\s*council|transcript)\b",
    "mp": r"\b(mp|parliament|constituency|westminster|commons|expense|ipsa)\b",
}


def classify_query(query: str, council: str = None) -> list[str]:
    """Return list of topic tags matching the query."""
    q = query.lower()
    topics = []
    for topic, pattern in TOPIC_PATTERNS.items():
        if re.search(pattern, q):
            topics.append(topic)
    # Name-based detection: if query mentions a person's name, check councillor data
    if not topics or "councillors" not in topics:
        if council and _looks_like_name_query(q, council):
            topics.append("councillors")
            if "integrity" not in topics:
                topics.append("integrity")
    return topics or ["general"]


def _looks_like_name_query(query: str, council: str) -> bool:
    """Check if query mentions a councillor name."""
    raw = safe_load(council, "councillors.json")
    if not raw:
        return False
    councillors = raw if isinstance(raw, list) else raw.get("councillors", [])
    for c in councillors:
        name = (c.get("name") or "").lower()
        # Strip title prefixes
        clean = re.sub(r"^(county |borough )?councillor\s+", "", name)
        parts = clean.split()
        # Match if surname appears in query, or full name
        if parts and len(parts[-1]) > 3 and parts[-1] in query:
            return True
        if clean and clean in query:
            return True
    # Also check "tell me about X" / "who is X" patterns
    if re.search(r"\b(tell me|who is|about|know about)\b", query):
        words = [w for w in query.split() if len(w) > 3 and w not in ("tell", "about", "know", "everything", "what", "does", "their")]
        if words:
            return True  # Assume it's a person query, include councillor context
    return False


# --- Data Loading & Caching ---
_data_cache = {}  # path → (data, load_time)
CACHE_TTL = 300  # 5 min


def load_json(path: Path):
    """Load JSON with 5-min cache."""
    key = str(path)
    now = time.time()
    if key in _data_cache:
        data, loaded_at = _data_cache[key]
        if now - loaded_at < CACHE_TTL:
            return data
    try:
        with open(path) as f:
            data = json.load(f)
        _data_cache[key] = (data, now)
        return data
    except (FileNotFoundError, json.JSONDecodeError) as e:
        log.warning(f"Failed to load {path}: {e}")
        return None


def safe_load(council: str, filename: str):
    """Load a council data file, return None if missing."""
    return load_json(DATA_ROOT / council / filename)


# --- Context Builders ---
def build_spending_context(council: str, query: str) -> str:
    """Extract spending stats relevant to query."""
    idx = safe_load(council, "spending-index.json")
    lines = [f"SPENDING DATA ({council}):"]
    if not idx:
        # No spending index — still try budget_mapping for categories
        bm = safe_load(council, "budget_mapping.json")
        if bm and isinstance(bm, dict):
            cats = bm.get("category_summary", {})
            if isinstance(cats, dict) and cats:
                lines.append("Spending categories (from budget mapping):")
                for cat, total in sorted(cats.items(), key=lambda x: -(x[1] if isinstance(x[1], (int, float)) else 0)):
                    if isinstance(total, (int, float)):
                        lines.append(f"  - {cat}: £{total:,.0f}")
            cov = bm.get("coverage", {})
            if cov:
                lines.append(f"Coverage: {cov.get('mapped_pct', '?')}% of departments mapped")
        return "\n".join(l for l in lines if l) if len(lines) > 1 else ""
    meta = idx.get("meta", {})
    fo = idx.get("filterOptions", {})
    lines = [
        f"SPENDING DATA ({council}):",
        f"Total transactions: {meta.get('totalRecords', '?')}",
        f"Date range: {meta.get('dateRange', {}).get('earliest', '?')} to {meta.get('dateRange', {}).get('latest', '?')}",
        f"Total amount: £{meta.get('totalAmount', 0):,.0f}" if meta.get('totalAmount') else "",
    ]
    # Top departments
    depts = fo.get("departments", [])
    if depts:
        lines.append(f"Departments ({len(depts)}): {', '.join(depts[:15])}")
    # Top suppliers from stats
    stats = meta.get("stats", {})
    if stats.get("topSuppliers"):
        lines.append("Top suppliers:")
        for s in stats["topSuppliers"][:10]:
            lines.append(f"  - {s.get('name', '?')}: £{s.get('total', 0):,.0f} ({s.get('count', 0)} txns)")
    # Budget mapping if available
    bm = safe_load(council, "budget_mapping.json")
    if bm and isinstance(bm, dict):
        cats = bm.get("category_summary", bm.get("categories", {}))
        if isinstance(cats, dict):
            lines.append("Spending categories:")
            for cat, total in sorted(cats.items(), key=lambda x: -(x[1] if isinstance(x[1], (int, float)) else 0)):
                if isinstance(total, (int, float)):
                    lines.append(f"  - {cat}: £{total:,.0f}")
        elif isinstance(cats, list):
            lines.append("Spending categories:")
            for c in cats[:10]:
                if isinstance(c, dict):
                    lines.append(f"  - {c.get('category', '?')}: £{c.get('total', 0):,.0f}")
    return "\n".join(l for l in lines if l)


def build_councillor_context(council: str, query: str) -> str:
    """Extract councillor info."""
    raw = safe_load(council, "councillors.json")
    if not raw:
        return ""
    councillors = raw if isinstance(raw, list) else raw.get("councillors", [])
    lines = [f"COUNCILLORS ({council}): {len(councillors)} total"]
    # Party breakdown
    parties = defaultdict(int)
    for c in councillors:
        parties[c.get("party", "Unknown")] += 1
    lines.append("By party: " + ", ".join(f"{p}: {n}" for p, n in sorted(parties.items(), key=lambda x: -x[1])))
    # Search for specific councillor mentioned in query
    q = query.lower()
    matched = []
    for c in councillors:
        name = (c.get("name") or "").lower()
        clean = re.sub(r"^(county |borough )?councillor\s+", "", name)
        if any(word in clean for word in q.split() if len(word) > 3):
            matched.append(c)
    for c in matched:
        lines.append(f"\nMATCHED COUNCILLOR: {c.get('name')}")
        lines.append(f"  Party: {c.get('party', '?')}")
        lines.append(f"  Ward/Division: {c.get('ward', c.get('division', '?'))}")
        if c.get("email"):
            lines.append(f"  Email: {c['email']}")
        if c.get("phone"):
            lines.append(f"  Phone: {c['phone']}")
        # Add any extra fields
        for key in ["committees", "roles", "appointed", "biography"]:
            if c.get(key):
                val = c[key] if isinstance(c[key], str) else json.dumps(c[key], default=str)[:300]
                lines.append(f"  {key.title()}: {val}")
    # Also check councillor_profiles.json for more detail
    if matched:
        profiles = safe_load(council, "councillor_profiles.json")
        if profiles and isinstance(profiles, list):
            for p in profiles:
                pname = (p.get("name") or "").lower()
                if any(word in pname for word in q.split() if len(word) > 3):
                    lines.append(f"\nPROFILE DETAIL: {p.get('name')}")
                    for key in ["occupation", "dob", "biography", "committees", "electoral_history", "employment", "land_interests", "securities"]:
                        if p.get(key):
                            val = p[key] if isinstance(p[key], str) else json.dumps(p[key], default=str)[:400]
                            lines.append(f"  {key.replace('_', ' ').title()}: {val}")
                    break
    return "\n".join(lines)


def build_integrity_context(council: str, query: str) -> str:
    """Extract integrity findings."""
    data = safe_load(council, "integrity.json")
    if not data:
        return ""
    councillors = data if isinstance(data, list) else data.get("councillors", data.get("results", []))
    if not isinstance(councillors, list):
        return ""
    flagged = [c for c in councillors if c.get("flags") or c.get("score", 0) > 0]
    lines = [f"INTEGRITY ({council}): {len(flagged)} councillors with flags out of {len(councillors)}"]
    for c in sorted(flagged, key=lambda x: -(x.get("score", 0) or 0))[:10]:
        lines.append(f"  - {c.get('name', '?')}: score {c.get('score', 0)}, flags: {c.get('flag_count', len(c.get('flags', [])))}")
    return "\n".join(lines)


def build_budget_context(council: str, query: str) -> str:
    """Extract budget data."""
    data = safe_load(council, "budgets.json")
    summary = safe_load(council, "budgets_summary.json")
    lines = [f"BUDGET DATA ({council}):"]
    if summary and isinstance(summary, dict):
        lines.append(f"Council: {summary.get('council_name', council)}")
        lines.append(f"Tier: {summary.get('council_tier', '?')}")
        lines.append(f"Financial year: {summary.get('financial_year', '?')}")
        headline = summary.get("headline", {})
        if headline:
            for k, v in headline.items():
                if isinstance(v, (int, float)):
                    lines.append(f"  {k.replace('_', ' ').title()}: £{v:,.0f}")
        svc = summary.get("service_breakdown", {})
        if svc:
            lines.append("Service breakdown:")
            for k, v in svc.items():
                if isinstance(v, (int, float)):
                    lines.append(f"  {k}: £{v:,.0f}")
        ct = summary.get("council_tax", summary.get("band_d", {}))
        if isinstance(ct, dict):
            for k, v in ct.items():
                lines.append(f"  Council tax {k}: £{v}" if isinstance(v, (int, float)) else f"  {k}: {v}")
        elif isinstance(ct, (int, float)):
            lines.append(f"Band D council tax: £{ct:.2f}")
        reserves = summary.get("reserves", {})
        if isinstance(reserves, dict):
            for k, v in reserves.items():
                if isinstance(v, (int, float)):
                    lines.append(f"  Reserves {k}: £{v:,.0f}")
    if data and isinstance(data, dict):
        # Add any insights or narratives
        insights = data.get("insights", data.get("key_points", []))
        if isinstance(insights, list) and insights:
            lines.append("Key insights:")
            for ins in insights[:5]:
                if isinstance(ins, str):
                    lines.append(f"  - {ins[:150]}")
                elif isinstance(ins, dict):
                    lines.append(f"  - {ins.get('text', ins.get('insight', str(ins)))[:150]}")
    return "\n".join(l for l in lines if l)


def build_election_context(council: str, query: str) -> str:
    """Extract election data."""
    data = safe_load(council, "elections.json")
    if not data:
        return ""
    lines = [f"ELECTIONS ({council}):"]
    if isinstance(data, dict):
        for ward, info in list(data.items())[:10]:
            if isinstance(info, dict):
                holder = info.get("holder", info.get("current", {}))
                if isinstance(holder, dict):
                    lines.append(f"  {ward}: {holder.get('party', '?')} ({holder.get('name', '?')})")
                elif isinstance(holder, str):
                    lines.append(f"  {ward}: {holder}")
    return "\n".join(lines)


def build_roads_context(council: str, query: str) -> str:
    """Extract roadworks analytics."""
    analytics = safe_load(council, "roadworks_analytics.json")
    if not analytics:
        # Try lancashire_cc as highways are county-level
        analytics = safe_load("lancashire_cc", "roadworks_analytics.json")
    if not analytics:
        return ""
    meta = analytics.get("meta", {})
    lines = [
        f"ROADWORKS ANALYTICS:",
        f"Active works: {meta.get('live_works', '?')}, Archived: {meta.get('archived_works', '?')}",
    ]
    # Operator league top 5
    league = analytics.get("operator_league", [])
    if league:
        lines.append("Top operators:")
        for op in league[:5]:
            lines.append(f"  - {op['operator']}: {op['total_works']} works, avg {op.get('avg_duration_days', '?')} days")
    # Overdue
    dur = analytics.get("duration_analysis", {})
    if dur.get("overdue_count"):
        lines.append(f"Overdue works: {dur['overdue_count']}")
    return "\n".join(lines)


def build_health_context(council: str, query: str) -> str:
    """Extract health/deprivation data."""
    parts = []
    health = safe_load(council, "health.json")
    if health and isinstance(health, dict):
        meta = health.get("meta", health.get("summary", {}))
        parts.append(f"HEALTH ({council}): {json.dumps(meta, default=str)[:800]}")
    dep = safe_load(council, "deprivation.json")
    if dep and isinstance(dep, dict):
        summary = dep.get("summary", dep.get("meta", {}))
        parts.append(f"DEPRIVATION: {json.dumps(summary, default=str)[:500]}")
    return "\n".join(parts)


def build_meetings_context(council: str, query: str) -> str:
    """Extract meeting/document data."""
    docs = safe_load(council, "council_documents.json")
    if not docs:
        return ""
    items = docs if isinstance(docs, list) else docs.get("documents", docs.get("decisions", []))
    lines = [f"COUNCIL DOCUMENTS ({council}): {len(items)} decisions"]
    for d in items[:8]:
        if isinstance(d, dict):
            lines.append(f"  - {d.get('title', d.get('subject', '?'))[:80]} ({d.get('date', '?')})")
    return "\n".join(lines)


def build_general_context(council: str, query: str) -> str:
    """General overview context."""
    config = safe_load(council, "config.json")
    if not config:
        return f"Council: {council}"
    lines = [
        f"COUNCIL: {config.get('council_name', council)}",
        f"Type: {config.get('council_type', '?')}",
        f"Population: {config.get('population', '?')}",
    ]
    # Always include budget headline for general context
    summary = safe_load(council, "budgets_summary.json")
    if summary and isinstance(summary, dict):
        headline = summary.get("headline", {})
        if headline.get("total_service_expenditure"):
            lines.append(f"Total service expenditure: £{headline['total_service_expenditure']:,.0f}")
        if headline.get("net_revenue_expenditure"):
            lines.append(f"Net revenue expenditure: £{headline['net_revenue_expenditure']:,.0f}")
        ct = summary.get("council_tax", {})
        if isinstance(ct, dict) and ct.get("band_d"):
            lines.append(f"Band D council tax: £{ct['band_d']}")
    # Politics summary
    pol = safe_load(council, "politics_summary.json")
    if pol and isinstance(pol, dict):
        seats = pol.get("seats", pol.get("party_seats", {}))
        if isinstance(seats, dict):
            lines.append("Political control: " + ", ".join(f"{p}: {n}" for p, n in seats.items()))
    return "\n".join(l for l in lines if l)


# Topic → builder mapping
CONTEXT_BUILDERS = {
    "spending": build_spending_context,
    "councillors": build_councillor_context,
    "integrity": build_integrity_context,
    "budgets": build_budget_context,
    "elections": build_election_context,
    "roads": build_roads_context,
    "planning": lambda c, q: json.dumps(safe_load(c, "planning.json") or {}, default=str)[:2000] if safe_load(c, "planning.json") else "",
    "health": build_health_context,
    "demographics": lambda c, q: json.dumps((safe_load(c, "demographics.json") or {}).get("summary", {}), default=str)[:1500],
    "economy": lambda c, q: json.dumps((safe_load(c, "economy.json") or {}).get("summary", {}), default=str)[:1500],
    "meetings": build_meetings_context,
    "mp": lambda c, q: json.dumps(safe_load(c, "constituencies.json") or {}, default=str)[:2000],
    "general": build_general_context,
}


def build_context(council: str, query: str, topics: list[str]) -> str:
    """Build two-tier context: always-loaded core + topic-specific detail."""
    parts = []

    # Tier 1: Always-loaded core briefing (~130 tokens)
    core = safe_load(council, "chat_briefing_core.json")
    if core and isinstance(core, dict):
        parts.append(core.get("briefing", ""))
    else:
        # Fallback to general context if briefing not generated yet
        parts.append(build_general_context(council, query))

    # Tier 2: Topic-specific detail (~500-800 tokens per topic)
    detail = safe_load(council, "chat_briefing_detail.json")
    if detail and isinstance(detail, dict):
        topic_data = detail.get("topics", {})
        for topic in topics:
            if topic in topic_data:
                parts.append(topic_data[topic])
            # Map some topics to detail keys
            elif topic == "spending" and "budgets" in topic_data:
                parts.append(topic_data["budgets"])
            elif topic == "planning" and "housing" in topic_data:
                parts.append(topic_data["housing"])
    else:
        # Fallback to old builders if briefings not generated
        for topic in topics:
            builder = CONTEXT_BUILDERS.get(topic)
            if builder and topic != "general":
                ctx = builder(council, query)
                if ctx:
                    parts.append(ctx)

    # Name search: if query mentions a specific person, add councillor profile detail
    q = query.lower()
    profiles = safe_load(council, "councillor_profiles.json")
    if profiles and isinstance(profiles, list):
        for p in profiles:
            pname = (p.get("name") or "").lower()
            clean = re.sub(r"^(county |borough )?councillor\s+", "", pname)
            parts_name = clean.split()
            if parts_name and len(parts_name[-1]) > 3 and parts_name[-1] in q:
                profile_lines = [f"\nDETAILED PROFILE: {p.get('name')}"]
                for key in ["party", "ward", "division", "email", "phone", "occupation", "dob",
                            "biography", "committees", "electoral_history", "employment",
                            "land_interests", "securities"]:
                    if p.get(key):
                        val = p[key] if isinstance(p[key], str) else json.dumps(p[key], default=str)[:400]
                        profile_lines.append(f"  {key.replace('_', ' ').title()}: {val}")
                parts.append("\n".join(profile_lines))
                break

    combined = "\n\n".join(p for p in parts if p)
    # Truncate to fit context window
    max_chars = MAX_CONTEXT_TOKENS * 4
    if len(combined) > max_chars:
        combined = combined[:max_chars] + "\n...[truncated]"
    return combined


# --- Rate Limiting ---
_rate_limits = {}  # ip → {"minute": [(timestamp, count)], "day": {date: count}}


def check_rate_limit(ip: str) -> bool:
    """Return True if request is allowed."""
    now = time.time()
    today = datetime.now().strftime("%Y-%m-%d")
    if ip not in _rate_limits:
        _rate_limits[ip] = {"requests": [], "daily": {}}
    rl = _rate_limits[ip]
    # Clean old minute entries
    rl["requests"] = [t for t in rl["requests"] if now - t < 60]
    if len(rl["requests"]) >= RATE_LIMIT_PER_MIN:
        return False
    if rl["daily"].get(today, 0) >= RATE_LIMIT_PER_DAY:
        return False
    rl["requests"].append(now)
    rl["daily"][today] = rl["daily"].get(today, 0) + 1
    return True


# --- Session Management ---
_sessions = {}  # session_id → {"messages": [], "last_active": timestamp, "council": str}


def get_session(session_id: str, council: str) -> dict:
    """Get or create session."""
    now = time.time()
    # Clean expired sessions
    expired = [k for k, v in _sessions.items() if now - v["last_active"] > SESSION_TIMEOUT]
    for k in expired:
        del _sessions[k]
    if session_id not in _sessions:
        _sessions[session_id] = {"messages": [], "last_active": now, "council": council}
    session = _sessions[session_id]
    session["last_active"] = now
    session["council"] = council
    return session


# --- LLM Call ---
def call_llm(messages: list[dict], max_tokens: int = 1500) -> tuple[str, str]:
    """Call LLM with full message history. Returns (text, provider)."""
    for provider in PROVIDERS:
        if not provider["enabled"] or not provider["api_key"]:
            continue
        try:
            text = _call_provider(provider, messages, max_tokens, timeout=30)
            if text and len(text.strip()) > 10:
                return text.strip(), provider["name"]
        except Exception as e:
            log.warning(f"{provider['name']} failed: {str(e)[:150]}")
            time.sleep(0.5)
    raise RuntimeError("All LLM providers failed")


# --- FastAPI App ---
app = FastAPI(title="Ask Lancashire", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


class ChatRequest(BaseModel):
    query: str
    council: str = "burnley"
    session_id: str | None = None


class ChatResponse(BaseModel):
    answer: str
    provider: str
    topics: list[str]
    session_id: str


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, request: Request):
    """Handle a chat query."""
    ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(ip):
        raise HTTPException(429, "Rate limit exceeded. Try again in a minute.")

    council = req.council.lower().strip()
    if council not in COUNCILS:
        raise HTTPException(400, f"Unknown council: {council}")

    query = req.query.strip()
    if not query or len(query) > 1000:
        raise HTTPException(400, "Query must be 1-1000 characters")

    session_id = req.session_id or str(uuid.uuid4())
    session = get_session(session_id, council)

    # Classify and build context
    topics = classify_query(query, council)
    context = build_context(council, query, topics)
    log.info(f"[{ip}] council={council} topics={topics} query={query[:80]}")

    # Build messages
    messages = [{"role": "system", "content": SYSTEM_PROMPT + f"\n\nDATA CONTEXT:\n{context}"}]
    # Add conversation history (last N messages)
    for msg in session["messages"][-MAX_HISTORY * 2:]:
        messages.append(msg)
    messages.append({"role": "user", "content": query})

    try:
        answer, provider = call_llm(messages)
    except RuntimeError as e:
        raise HTTPException(503, f"AI service temporarily unavailable: {e}")

    # Store in session
    session["messages"].append({"role": "user", "content": query})
    session["messages"].append({"role": "assistant", "content": answer})
    # Trim history
    if len(session["messages"]) > MAX_HISTORY * 2:
        session["messages"] = session["messages"][-MAX_HISTORY * 2:]

    return ChatResponse(answer=answer, provider=provider, topics=topics, session_id=session_id)


@app.get("/health")
async def health():
    return {"status": "ok", "sessions": len(_sessions), "councils": len(COUNCILS)}


if __name__ == "__main__":
    import uvicorn
    log.info("Starting Ask Lancashire on port 8430...")
    uvicorn.run(app, host="0.0.0.0", port=8430)
