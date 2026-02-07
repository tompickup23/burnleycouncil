"""
Council Spend Tracker - DOGE Edition
Advanced spending analysis for council finance leaders
Identify waste, find savings, drive efficiency
"""

import streamlit as st
import duckdb
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from pathlib import Path
from datetime import datetime, timedelta
from decimal import Decimal

# ============== PAGE CONFIG ==============
st.set_page_config(
    page_title="Council Spend Tracker",
    page_icon="💷",
    layout="wide",
    initial_sidebar_state="expanded"
)

# ============== APPLE-STYLE DARK THEME ==============
st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=SF+Pro+Display:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap');

    :root {
        --bg-primary: #000000;
        --bg-secondary: #1c1c1e;
        --bg-tertiary: #2c2c2e;
        --bg-elevated: #3a3a3c;
        --text-primary: #ffffff;
        --text-secondary: #98989d;
        --text-tertiary: #636366;
        --accent-blue: #0a84ff;
        --accent-green: #30d158;
        --accent-red: #ff453a;
        --accent-orange: #ff9f0a;
        --accent-purple: #bf5af2;
        --accent-yellow: #ffd60a;
        --border-color: #38383a;
    }

    * {
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif;
        -webkit-font-smoothing: antialiased;
    }

    .stApp { background: var(--bg-primary); }

    /* Glass morphism header */
    .main-header {
        background: linear-gradient(135deg, rgba(10,132,255,0.15) 0%, rgba(191,90,242,0.1) 100%);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        padding: 1.5rem 2rem;
        border-radius: 20px;
        margin-bottom: 1.5rem;
        border: 1px solid rgba(255,255,255,0.1);
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    }
    .main-header h1 {
        color: var(--text-primary);
        font-weight: 600;
        font-size: 1.75rem;
        margin: 0;
        letter-spacing: -0.5px;
    }
    .main-header p {
        color: var(--text-secondary);
        font-size: 0.9rem;
        margin: 0.25rem 0 0 0;
    }

    /* Metric cards */
    .metric-card {
        background: var(--bg-secondary);
        border-radius: 16px;
        padding: 1.25rem;
        border: 1px solid var(--border-color);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        overflow: hidden;
    }
    .metric-card::before {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 3px;
        background: linear-gradient(90deg, var(--accent-blue), var(--accent-purple));
        opacity: 0;
        transition: opacity 0.3s ease;
    }
    .metric-card:hover {
        transform: translateY(-3px);
        border-color: var(--accent-blue);
        box-shadow: 0 12px 40px rgba(10,132,255,0.15);
    }
    .metric-card:hover::before { opacity: 1; }
    .metric-value {
        font-size: 1.75rem;
        font-weight: 700;
        color: var(--text-primary);
        letter-spacing: -1px;
        line-height: 1.2;
    }
    .metric-label {
        font-size: 0.7rem;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.8px;
        font-weight: 500;
        margin-top: 0.4rem;
    }
    .metric-delta-up { color: var(--accent-red); font-size: 0.85rem; font-weight: 500; }
    .metric-delta-down { color: var(--accent-green); font-size: 0.85rem; font-weight: 500; }

    /* Savings card - special highlight */
    .savings-card {
        background: linear-gradient(135deg, rgba(48,209,88,0.15) 0%, rgba(48,209,88,0.05) 100%);
        border: 1px solid rgba(48,209,88,0.4);
        border-radius: 16px;
        padding: 1.25rem;
        margin-bottom: 1rem;
    }
    .savings-card h3 { color: var(--accent-green); margin: 0 0 0.5rem 0; font-size: 1rem; font-weight: 600; }
    .savings-card .amount { font-size: 2rem; font-weight: 700; color: var(--text-primary); }
    .savings-card p { color: var(--text-secondary); margin: 0.5rem 0 0 0; font-size: 0.85rem; }

    /* Alert cards */
    .alert-card {
        background: linear-gradient(135deg, rgba(255,69,58,0.12) 0%, rgba(255,69,58,0.05) 100%);
        border: 1px solid rgba(255,69,58,0.35);
        border-radius: 14px;
        padding: 1rem;
        margin: 0.75rem 0;
    }
    .alert-card h4 { color: var(--accent-red); margin: 0 0 0.4rem 0; font-weight: 600; font-size: 0.9rem; }
    .alert-card p { color: var(--text-primary); margin: 0; font-size: 0.85rem; line-height: 1.4; }

    .insight-card {
        background: linear-gradient(135deg, rgba(48,209,88,0.12) 0%, rgba(48,209,88,0.05) 100%);
        border: 1px solid rgba(48,209,88,0.35);
        border-radius: 14px;
        padding: 1rem;
        margin: 0.75rem 0;
    }
    .insight-card p { color: var(--text-primary); margin: 0; font-size: 0.85rem; }

    .warning-card {
        background: linear-gradient(135deg, rgba(255,159,10,0.12) 0%, rgba(255,159,10,0.05) 100%);
        border: 1px solid rgba(255,159,10,0.35);
        border-radius: 14px;
        padding: 1rem;
        margin: 0.75rem 0;
    }
    .warning-card h4 { color: var(--accent-orange); margin: 0 0 0.4rem 0; font-weight: 600; font-size: 0.9rem; }
    .warning-card p { color: var(--text-primary); margin: 0; font-size: 0.85rem; }

    /* Executive insight card */
    .exec-insight {
        background: linear-gradient(135deg, rgba(28,28,30,0.9) 0%, rgba(44,44,46,0.7) 100%);
        border-left: 4px solid var(--accent-blue);
        border-radius: 0 14px 14px 0;
        padding: 1rem 1.25rem;
        margin: 0.6rem 0;
        backdrop-filter: blur(20px);
    }
    .exec-insight.high { border-left-color: var(--accent-red); }
    .exec-insight.medium { border-left-color: var(--accent-orange); }
    .exec-insight h4 { color: var(--text-primary); margin: 0 0 0.4rem 0; font-weight: 600; font-size: 0.95rem; }
    .exec-insight p { color: var(--text-secondary); margin: 0; font-size: 0.85rem; line-height: 1.5; }
    .exec-insight .badge {
        display: inline-block;
        font-size: 0.7rem;
        padding: 0.15rem 0.5rem;
        border-radius: 6px;
        font-weight: 600;
        margin-bottom: 0.4rem;
        text-transform: uppercase;
    }
    .exec-insight.high .badge { background: rgba(255,69,58,0.2); color: var(--accent-red); }
    .exec-insight.medium .badge { background: rgba(255,159,10,0.2); color: var(--accent-orange); }

    /* Quick action buttons */
    .quick-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin: 1rem 0;
    }
    .quick-btn {
        background: linear-gradient(135deg, var(--bg-tertiary) 0%, rgba(44,44,46,0.8) 100%);
        border: 1px solid var(--border-color);
        border-radius: 12px;
        padding: 0.6rem 1rem;
        color: var(--text-primary);
        font-size: 0.85rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        display: flex;
        align-items: center;
        gap: 0.4rem;
    }
    .quick-btn:hover {
        background: var(--accent-blue);
        border-color: var(--accent-blue);
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(10,132,255,0.3);
    }

    /* Action button style */
    .action-btn {
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: 10px;
        padding: 0.75rem 1rem;
        color: var(--text-primary);
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        display: inline-block;
        text-align: center;
        margin: 0.25rem;
    }
    .action-btn:hover {
        background: var(--accent-blue);
        border-color: var(--accent-blue);
    }

    /* Sidebar */
    section[data-testid="stSidebar"] {
        background: var(--bg-secondary);
        border-right: 1px solid var(--border-color);
    }
    section[data-testid="stSidebar"] h1,
    section[data-testid="stSidebar"] h2,
    section[data-testid="stSidebar"] h3,
    section[data-testid="stSidebar"] label,
    section[data-testid="stSidebar"] p { color: var(--text-primary) !important; }

    .filter-title {
        font-size: 0.65rem;
        font-weight: 600;
        color: var(--accent-blue) !important;
        text-transform: uppercase;
        letter-spacing: 1px;
        margin-bottom: 0.5rem;
    }

    /* Expanders */
    div[data-testid="stExpander"] {
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: 10px;
        margin-bottom: 0.4rem;
    }
    div[data-testid="stExpander"] > details > summary {
        font-weight: 500;
        color: var(--text-primary);
        padding: 0.6rem 0.75rem;
        font-size: 0.85rem;
    }

    /* Buttons */
    .stButton > button {
        background: var(--accent-blue);
        color: var(--text-primary);
        border: none;
        border-radius: 8px;
        font-weight: 500;
        padding: 0.4rem 0.75rem;
        font-size: 0.85rem;
        transition: all 0.2s ease;
    }
    .stButton > button:hover {
        background: #0077ed;
        transform: scale(1.02);
    }

    /* Tabs */
    .stTabs [data-baseweb="tab-list"] {
        gap: 0.25rem;
        background: var(--bg-secondary);
        padding: 0.35rem;
        border-radius: 12px;
        border: 1px solid var(--border-color);
    }
    .stTabs [data-baseweb="tab"] {
        background: transparent;
        border-radius: 8px;
        font-weight: 500;
        color: var(--text-secondary);
        padding: 0.4rem 1rem;
        font-size: 0.85rem;
    }
    .stTabs [aria-selected="true"] {
        background: var(--accent-blue);
        color: var(--text-primary) !important;
    }

    /* Radio - segmented control */
    div[data-testid="stRadio"] > div {
        background: var(--bg-secondary);
        border-radius: 10px;
        padding: 0.2rem;
        border: 1px solid var(--border-color);
        display: inline-flex;
    }
    div[data-testid="stRadio"] label {
        background: transparent;
        border-radius: 8px;
        padding: 0.5rem 1.25rem;
        font-weight: 500;
        border: none;
        color: var(--text-secondary);
        margin: 0;
        font-size: 0.85rem;
    }
    div[data-testid="stRadio"] label:has(input:checked) {
        background: var(--accent-blue);
        color: var(--text-primary);
    }

    /* Inputs */
    input, textarea {
        background: var(--bg-tertiary) !important;
        border: 1px solid var(--border-color) !important;
        color: var(--text-primary) !important;
        border-radius: 8px !important;
        font-size: 0.85rem !important;
    }
    input:focus, textarea:focus {
        border-color: var(--accent-blue) !important;
        box-shadow: 0 0 0 2px rgba(10,132,255,0.2) !important;
    }

    div[data-testid="stSelectbox"] > div > div {
        background: var(--bg-tertiary);
        border-radius: 8px;
        border: 1px solid var(--border-color);
        color: var(--text-primary);
        font-size: 0.85rem;
    }

    span[data-baseweb="tag"] {
        background: var(--accent-blue);
        border-radius: 6px;
        color: var(--text-primary);
        font-size: 0.8rem;
    }

    /* Text */
    .stMarkdown, .stMarkdown p, .stMarkdown h1, .stMarkdown h2, .stMarkdown h3 {
        color: var(--text-primary) !important;
    }
    div[data-testid="stAlert"] {
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        color: var(--text-primary);
        border-radius: 10px;
    }
    hr {
        border: none;
        height: 1px;
        background: var(--border-color);
        margin: 1.5rem 0;
    }

    /* Download button */
    .stDownloadButton > button {
        background: var(--bg-tertiary);
        color: var(--accent-blue);
        border: 1px solid var(--border-color);
        font-size: 0.85rem;
    }

    /* Dataframe */
    .stDataFrame { border-radius: 10px; overflow: hidden; }

    /* Hide branding */
    #MainMenu {visibility: hidden;}
    footer {visibility: hidden;}
    header {visibility: hidden;}

    html { scroll-behavior: smooth; }
</style>
""", unsafe_allow_html=True)

# ============== DATABASE CONFIG ==============
APP_DIR = Path(__file__).parent
LCC_DB_PATH = APP_DIR / "lcc_spending.duckdb"
BBC_DB_PATH = APP_DIR / "bbc_spending.duckdb"

# ============== UTILITIES ==============
def format_currency(value, short=False):
    if pd.isna(value) or value == 0:
        return "£0"
    if short:
        if abs(value) >= 1e9:
            return f"£{value/1e9:.1f}B"
        elif abs(value) >= 1e6:
            return f"£{value/1e6:.1f}M"
        elif abs(value) >= 1e3:
            return f"£{value/1e3:.0f}K"
    return f"£{value:,.0f}"

def get_fy_sort_key(fy_string: str) -> int:
    try:
        return int(fy_string.split('/')[0])
    except:
        return 0

# ============== COUNCIL CONFIG ==============
COUNCILS = {
    "Lancashire County Council": {
        "db_path": LCC_DB_PATH,
        "short_name": "LCC",
        "columns": {
            'service_label': 'Service',
            'organisational_unit': 'Unit',
            'expenditure_category': 'Category',
            'transaction_date': 'Date',
            'amount': 'Amount',
            'supplier_name': 'Supplier',
        },
        "filter_columns": ['supplier_name', 'expenditure_category', 'organisational_unit', 'service_label'],
        "display_columns": ['transaction_date', 'supplier_name', 'amount', 'expenditure_category', 'organisational_unit', 'service_label'],
        "chart_columns": ['supplier_name', 'expenditure_category', 'organisational_unit', 'service_label']
    },
    "Burnley Borough Council": {
        "db_path": BBC_DB_PATH,
        "short_name": "BBC",
        "columns": {
            'service_division': 'Service',
            'organisational_unit': 'Unit',
            'supplier_name': 'Supplier',
            'transaction_date': 'Date',
            'amount': 'Amount',
            'expenditure_category': 'Category',
            'data_type': 'Type',
        },
        "filter_columns": ['supplier_name', 'expenditure_category', 'service_division', 'data_type'],
        "display_columns": ['transaction_date', 'supplier_name', 'amount', 'expenditure_category', 'data_type', 'service_division'],
        "chart_columns": ['supplier_name', 'expenditure_category', 'service_division', 'data_type']
    }
}

# ============== DATABASE FUNCTIONS ==============
@st.cache_resource
def get_db_connection(db_path: str):
    return duckdb.connect(db_path, read_only=True)

@st.cache_data(ttl=3600)
def get_db_columns(db_path_str: str) -> list:
    con = get_db_connection(db_path_str)
    result = con.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'spending'").fetchall()
    return [row[0] for row in result]

@st.cache_data(ttl=3600)
def get_cached_metadata(db_path_str: str) -> dict:
    con = get_db_connection(db_path_str)
    stats = con.execute("""
        SELECT MIN(transaction_date), MAX(transaction_date), MIN(amount), MAX(amount), COUNT(*)
        FROM spending WHERE transaction_date IS NOT NULL
    """).fetchone()
    fy_result = con.execute("""
        SELECT DISTINCT CASE WHEN MONTH(transaction_date) >= 4
            THEN CONCAT(YEAR(transaction_date), '/', RIGHT(CAST(YEAR(transaction_date)+1 AS VARCHAR), 2))
            ELSE CONCAT(YEAR(transaction_date)-1, '/', RIGHT(CAST(YEAR(transaction_date) AS VARCHAR), 2)) END as fy
        FROM spending WHERE transaction_date IS NOT NULL
    """).fetchall()
    return {
        'min_date': stats[0], 'max_date': stats[1],
        'min_amount': float(stats[2]) if stats[2] else 0,
        'max_amount': float(stats[3]) if stats[3] else 1000000,
        'total_count': stats[4],
        'financial_years': sorted([r[0] for r in fy_result if r[0]], key=get_fy_sort_key)
    }

@st.cache_data(ttl=3600)
def get_unique_values(db_path_str: str, column: str) -> list:
    valid_cols = get_db_columns(db_path_str)
    if column not in valid_cols:
        return []
    con = get_db_connection(db_path_str)
    result = con.execute(f"SELECT DISTINCT {column} FROM spending WHERE {column} IS NOT NULL ORDER BY {column}").fetchall()
    return [row[0] for row in result]

def validate_column(db_path_str: str, column: str) -> bool:
    return column in get_db_columns(db_path_str)

def build_where_clause(filters: dict, search_text: str = None, db_path_str: str = None) -> tuple:
    clauses, params = [], []
    valid_cols = get_db_columns(db_path_str) if db_path_str else []

    if search_text:
        search_cols = ['supplier_name', 'expenditure_category', 'organisational_unit']
        valid_search = [c for c in search_cols if c in valid_cols]
        if valid_search:
            clauses.append(f"({' OR '.join([f'{c} ILIKE ?' for c in valid_search])})")
            params.extend([f"%{search_text}%"] * len(valid_search))

    for key, value in filters.items():
        if value is None:
            continue
        if key == "date_range" and len(value) == 2:
            clauses.append("transaction_date >= ? AND transaction_date <= ?")
            params.extend(value)
        elif key == "amount_range" and len(value) == 2:
            clauses.append("amount >= ? AND amount <= ?")
            params.extend(value)
        elif key == "financial_years" and value:
            fy_clauses = []
            for fy in value:
                parts = fy.split('/')
                if len(parts) == 2:
                    start_year = int(parts[0])
                    fy_clauses.append(f"(transaction_date >= '{start_year}-04-01' AND transaction_date <= '{start_year+1}-03-31')")
            if fy_clauses:
                clauses.append(f"({' OR '.join(fy_clauses)})")
        elif key == "financial_quarter" and value:
            q_map = {"Q1": [4,5,6], "Q2": [7,8,9], "Q3": [10,11,12], "Q4": [1,2,3]}
            if months := q_map.get(value, []):
                clauses.append(f"MONTH(transaction_date) IN ({','.join(map(str, months))})")
        elif isinstance(value, list) and value and key in valid_cols:
            clauses.append(f"{key} IN ({', '.join(['?' for _ in value])})")
            params.extend(value)
    return " AND ".join(clauses) if clauses else "1=1", params

def run_query(db_path: Path, filters: dict, search_text: str, columns: list, limit: int = 5000) -> pd.DataFrame:
    db_path_str = str(db_path)
    con = get_db_connection(db_path_str)
    valid_cols = get_db_columns(db_path_str)
    safe_columns = [c for c in columns if c in valid_cols]
    if not safe_columns:
        return pd.DataFrame()
    where_sql, params = build_where_clause(filters, search_text, db_path_str)
    return con.execute(f"SELECT {', '.join(safe_columns)} FROM spending WHERE {where_sql} ORDER BY transaction_date DESC, amount DESC LIMIT {limit}", params).fetchdf()

def get_summary_stats(db_path: Path, filters: dict, search_text: str = None) -> dict:
    db_path_str = str(db_path)
    con = get_db_connection(db_path_str)
    where_sql, params = build_where_clause(filters, search_text, db_path_str)
    result = con.execute(f"SELECT COUNT(*), COALESCE(SUM(amount),0), COALESCE(AVG(amount),0), COUNT(DISTINCT supplier_name) FROM spending WHERE {where_sql}", params).fetchdf()
    return {'transactions': result.iloc[0,0], 'total': result.iloc[0,1], 'average': result.iloc[0,2], 'suppliers': result.iloc[0,3]}

def get_time_aggregated_data(db_path: Path, filters: dict, search_text: str, time_period: str, group_by: str = None) -> pd.DataFrame:
    db_path_str = str(db_path)
    con = get_db_connection(db_path_str)
    valid_cols = get_db_columns(db_path_str)
    if group_by and group_by not in valid_cols:
        group_by = None
    where_sql, params = build_where_clause(filters, search_text, db_path_str)

    time_configs = {
        "Monthly": ("strftime(transaction_date, '%Y-%m')", "strftime(transaction_date, '%b %Y')"),
        "Quarterly": ("""CONCAT(CASE WHEN MONTH(transaction_date)>=4 THEN YEAR(transaction_date) ELSE YEAR(transaction_date)-1 END,'-',
            CASE WHEN MONTH(transaction_date) IN (4,5,6) THEN 'Q1' WHEN MONTH(transaction_date) IN (7,8,9) THEN 'Q2'
            WHEN MONTH(transaction_date) IN (10,11,12) THEN 'Q3' ELSE 'Q4' END)""",
            """CONCAT(CASE WHEN MONTH(transaction_date) IN (4,5,6) THEN 'Q1' WHEN MONTH(transaction_date) IN (7,8,9) THEN 'Q2'
            WHEN MONTH(transaction_date) IN (10,11,12) THEN 'Q3' ELSE 'Q4' END,' ',
            CASE WHEN MONTH(transaction_date)>=4 THEN YEAR(transaction_date) ELSE YEAR(transaction_date)-1 END,'/',
            RIGHT(CAST(CASE WHEN MONTH(transaction_date)>=4 THEN YEAR(transaction_date)+1 ELSE YEAR(transaction_date) END AS VARCHAR),2))"""),
        "Financial Year": ("""CASE WHEN MONTH(transaction_date)>=4 THEN CONCAT(YEAR(transaction_date),'/',RIGHT(CAST(YEAR(transaction_date)+1 AS VARCHAR),2))
            ELSE CONCAT(YEAR(transaction_date)-1,'/',RIGHT(CAST(YEAR(transaction_date) AS VARCHAR),2)) END""", None),
        "Total": ("'Total'", "'All Time'")
    }
    expr, label = time_configs.get(time_period, time_configs["Total"])
    label = label or expr

    if group_by:
        query = f"SELECT {expr} as period, {label} as period_label, {group_by} as category, SUM(amount) as total_spend, COUNT(*) as transactions, COUNT(DISTINCT supplier_name) as suppliers, AVG(amount) as avg_spend FROM spending WHERE {where_sql} AND transaction_date IS NOT NULL AND {group_by} IS NOT NULL GROUP BY 1,2,3 ORDER BY MIN(transaction_date), total_spend DESC"
    else:
        query = f"SELECT {expr} as period, {label} as period_label, SUM(amount) as total_spend, COUNT(*) as transactions, COUNT(DISTINCT supplier_name) as suppliers, AVG(amount) as avg_spend FROM spending WHERE {where_sql} AND transaction_date IS NOT NULL GROUP BY 1,2 ORDER BY MIN(transaction_date)"
    return con.execute(query, params).fetchdf()

def get_yoy_comparison(db_path: Path, filters: dict, search_text: str) -> pd.DataFrame:
    db_path_str = str(db_path)
    con = get_db_connection(db_path_str)
    where_sql, params = build_where_clause(filters, search_text, db_path_str)
    query = f"""WITH fy_data AS (SELECT CASE WHEN MONTH(transaction_date)>=4 THEN CONCAT(YEAR(transaction_date),'/',RIGHT(CAST(YEAR(transaction_date)+1 AS VARCHAR),2))
        ELSE CONCAT(YEAR(transaction_date)-1,'/',RIGHT(CAST(YEAR(transaction_date) AS VARCHAR),2)) END as fy,
        SUM(amount) as total_spend, COUNT(*) as transactions, COUNT(DISTINCT supplier_name) as suppliers
        FROM spending WHERE {where_sql} AND transaction_date IS NOT NULL GROUP BY 1)
        SELECT fy, total_spend, transactions, suppliers, LAG(total_spend) OVER (ORDER BY fy) as prev_spend FROM fy_data ORDER BY fy"""
    return con.execute(query, params).fetchdf()

def get_supplier_analysis(db_path: Path, filters: dict, search_text: str, limit: int = 20) -> pd.DataFrame:
    db_path_str = str(db_path)
    con = get_db_connection(db_path_str)
    where_sql, params = build_where_clause(filters, search_text, db_path_str)
    query = f"""SELECT supplier_name, SUM(amount) as total_spend, COUNT(*) as transaction_count, AVG(amount) as avg_transaction,
        MAX(amount) as largest_transaction, MIN(transaction_date) as first_transaction, MAX(transaction_date) as last_transaction,
        COUNT(DISTINCT strftime(transaction_date, '%Y-%m')) as active_months
        FROM spending WHERE {where_sql} AND supplier_name IS NOT NULL GROUP BY supplier_name ORDER BY total_spend DESC LIMIT {limit}"""
    return con.execute(query, params).fetchdf()

def get_spending_anomalies(db_path: Path, filters: dict, search_text: str) -> pd.DataFrame:
    db_path_str = str(db_path)
    con = get_db_connection(db_path_str)
    where_sql, params = build_where_clause(filters, search_text, db_path_str)
    query = f"""WITH category_stats AS (SELECT expenditure_category, AVG(amount) as avg_amount, STDDEV(amount) as std_amount
        FROM spending WHERE {where_sql} AND amount > 0 AND expenditure_category IS NOT NULL GROUP BY expenditure_category)
        SELECT s.transaction_date, s.supplier_name, s.amount, s.expenditure_category, cs.avg_amount as category_avg
        FROM spending s JOIN category_stats cs ON s.expenditure_category = cs.expenditure_category
        WHERE {where_sql} AND s.amount > cs.avg_amount * 3 AND s.amount > 10000 ORDER BY s.amount DESC LIMIT 50"""
    return con.execute(query, params + params).fetchdf()

def get_category_trends(db_path: Path, filters: dict, search_text: str, category_col: str) -> pd.DataFrame:
    db_path_str = str(db_path)
    if not validate_column(db_path_str, category_col):
        return pd.DataFrame()
    con = get_db_connection(db_path_str)
    where_sql, params = build_where_clause(filters, search_text, db_path_str)
    query = f"""SELECT CASE WHEN MONTH(transaction_date)>=4 THEN CONCAT(YEAR(transaction_date),'/',RIGHT(CAST(YEAR(transaction_date)+1 AS VARCHAR),2))
        ELSE CONCAT(YEAR(transaction_date)-1,'/',RIGHT(CAST(YEAR(transaction_date) AS VARCHAR),2)) END as fy,
        {category_col} as category, SUM(amount) as total_spend FROM spending
        WHERE {where_sql} AND transaction_date IS NOT NULL AND {category_col} IS NOT NULL GROUP BY 1,2 ORDER BY 1, total_spend DESC"""
    return con.execute(query, params).fetchdf()

# ============== DOGE SAVINGS FUNCTIONS ==============
def get_potential_duplicates(db_path: Path, filters: dict, search_text: str) -> pd.DataFrame:
    """Find potential duplicate payments - same supplier, same amount, within 7 days."""
    db_path_str = str(db_path)
    con = get_db_connection(db_path_str)
    where_sql, params = build_where_clause(filters, search_text, db_path_str)
    query = f"""
        WITH potential_dupes AS (
            SELECT supplier_name, amount, transaction_date,
                LAG(transaction_date) OVER (PARTITION BY supplier_name, amount ORDER BY transaction_date) as prev_date,
                COUNT(*) OVER (PARTITION BY supplier_name, amount) as occurrence_count
            FROM spending WHERE {where_sql} AND supplier_name IS NOT NULL AND amount > 500
        )
        SELECT supplier_name, amount, transaction_date, prev_date, occurrence_count,
            transaction_date - prev_date as days_apart
        FROM potential_dupes
        WHERE prev_date IS NOT NULL AND transaction_date - prev_date <= 7
        ORDER BY amount DESC LIMIT 100
    """
    return con.execute(query, params).fetchdf()

def get_supplier_consolidation_opportunities(db_path: Path, filters: dict, search_text: str) -> pd.DataFrame:
    """Find categories with many suppliers - consolidation opportunity."""
    db_path_str = str(db_path)
    con = get_db_connection(db_path_str)
    where_sql, params = build_where_clause(filters, search_text, db_path_str)
    query = f"""
        SELECT expenditure_category, COUNT(DISTINCT supplier_name) as supplier_count,
            SUM(amount) as total_spend, AVG(amount) as avg_transaction,
            COUNT(*) as transaction_count
        FROM spending WHERE {where_sql} AND expenditure_category IS NOT NULL
        GROUP BY expenditure_category
        HAVING COUNT(DISTINCT supplier_name) >= 5
        ORDER BY supplier_count DESC LIMIT 20
    """
    return con.execute(query, params).fetchdf()

def get_small_transaction_waste(db_path: Path, filters: dict, search_text: str) -> pd.DataFrame:
    """Find high volume of small transactions - processing cost may exceed value."""
    db_path_str = str(db_path)
    con = get_db_connection(db_path_str)
    where_sql, params = build_where_clause(filters, search_text, db_path_str)
    query = f"""
        SELECT supplier_name, COUNT(*) as small_txn_count, SUM(amount) as total_small,
            AVG(amount) as avg_small, MIN(amount) as min_amount
        FROM spending WHERE {where_sql} AND supplier_name IS NOT NULL AND amount < 100 AND amount > 0
        GROUP BY supplier_name HAVING COUNT(*) >= 10
        ORDER BY small_txn_count DESC LIMIT 30
    """
    return con.execute(query, params).fetchdf()

def get_spending_spikes(db_path: Path, filters: dict, search_text: str) -> pd.DataFrame:
    """Find months with unusual spending spikes."""
    db_path_str = str(db_path)
    con = get_db_connection(db_path_str)
    where_sql, params = build_where_clause(filters, search_text, db_path_str)
    query = f"""
        WITH monthly AS (
            SELECT strftime(transaction_date, '%Y-%m') as month, SUM(amount) as monthly_spend
            FROM spending WHERE {where_sql} AND transaction_date IS NOT NULL GROUP BY 1
        ),
        stats AS (SELECT AVG(monthly_spend) as avg_spend, STDDEV(monthly_spend) as std_spend FROM monthly)
        SELECT m.month, m.monthly_spend, s.avg_spend,
            (m.monthly_spend - s.avg_spend) / NULLIF(s.std_spend, 0) as z_score
        FROM monthly m, stats s
        WHERE (m.monthly_spend - s.avg_spend) / NULLIF(s.std_spend, 0) > 1.5
        ORDER BY z_score DESC
    """
    return con.execute(query, params).fetchdf()

def get_contract_efficiency(db_path: Path, filters: dict, search_text: str) -> pd.DataFrame:
    """Find suppliers with increasing costs over time - renegotiation candidates."""
    db_path_str = str(db_path)
    con = get_db_connection(db_path_str)
    where_sql, params = build_where_clause(filters, search_text, db_path_str)
    query = f"""
        WITH supplier_fy AS (
            SELECT supplier_name,
                CASE WHEN MONTH(transaction_date)>=4 THEN YEAR(transaction_date) ELSE YEAR(transaction_date)-1 END as fy_year,
                SUM(amount) as fy_spend, COUNT(*) as fy_txns
            FROM spending WHERE {where_sql} AND supplier_name IS NOT NULL AND transaction_date IS NOT NULL
            GROUP BY 1, 2
        ),
        supplier_growth AS (
            SELECT supplier_name, fy_year, fy_spend,
                LAG(fy_spend) OVER (PARTITION BY supplier_name ORDER BY fy_year) as prev_spend
            FROM supplier_fy
        )
        SELECT supplier_name, fy_year, fy_spend, prev_spend,
            ROUND((fy_spend - prev_spend) / NULLIF(prev_spend, 0) * 100, 1) as growth_pct
        FROM supplier_growth
        WHERE prev_spend IS NOT NULL AND fy_spend > prev_spend * 1.15 AND fy_spend > 50000
        ORDER BY (fy_spend - prev_spend) DESC LIMIT 20
    """
    return con.execute(query, params).fetchdf()

def get_budget_variance(db_path: Path, filters: dict, search_text: str) -> pd.DataFrame:
    """Track spending variance against historical averages by category."""
    where, params = build_where_clause(filters, search_text, str(db_path))
    valid_cols = get_db_columns(str(db_path))
    cat_col = 'expenditure_category' if 'expenditure_category' in valid_cols else ('service_label' if 'service_label' in valid_cols else None)
    if not cat_col:
        return pd.DataFrame()
    query = f"""
    WITH monthly_avg AS (
        SELECT {cat_col}, strftime('%Y-%m', transaction_date) as month,
            SUM(amount) as monthly_spend
        FROM spending {where}
        GROUP BY {cat_col}, strftime('%Y-%m', transaction_date)
    ),
    category_stats AS (
        SELECT {cat_col}, AVG(monthly_spend) as avg_monthly, STDDEV(monthly_spend) as std_monthly,
            MAX(monthly_spend) as max_monthly, MIN(monthly_spend) as min_monthly
        FROM monthly_avg GROUP BY {cat_col} HAVING COUNT(*) >= 3
    ),
    current_month AS (
        SELECT {cat_col}, SUM(amount) as current_spend
        FROM spending {where}
        AND strftime('%Y-%m', transaction_date) = strftime('%Y-%m', CURRENT_DATE - INTERVAL '1 month')
        GROUP BY {cat_col}
    )
    SELECT cs.{cat_col} as category, cm.current_spend, cs.avg_monthly,
        CASE WHEN cs.std_monthly > 0 THEN (cm.current_spend - cs.avg_monthly) / cs.std_monthly ELSE 0 END as z_score,
        ((cm.current_spend - cs.avg_monthly) / cs.avg_monthly * 100) as variance_pct
    FROM category_stats cs JOIN current_month cm ON cs.{cat_col} = cm.{cat_col}
    WHERE ABS((cm.current_spend - cs.avg_monthly) / NULLIF(cs.avg_monthly, 0)) > 0.2
    ORDER BY ABS(variance_pct) DESC LIMIT 15
    """
    try:
        with duckdb.connect(str(db_path), read_only=True) as conn:
            return conn.execute(query, params).fetchdf()
    except Exception:
        return pd.DataFrame()

def get_category_yoy_comparison(db_path: Path, filters: dict, search_text: str) -> pd.DataFrame:
    """Compare spending year-over-year by category."""
    where, params = build_where_clause(filters, search_text, str(db_path))
    valid_cols = get_db_columns(str(db_path))
    cat_col = 'expenditure_category' if 'expenditure_category' in valid_cols else ('service_label' if 'service_label' in valid_cols else None)
    if not cat_col:
        return pd.DataFrame()
    query = f"""
    WITH fy_spend AS (
        SELECT {cat_col},
            CASE WHEN EXTRACT(MONTH FROM transaction_date) >= 4
                THEN EXTRACT(YEAR FROM transaction_date)
                ELSE EXTRACT(YEAR FROM transaction_date) - 1 END as fy,
            SUM(amount) as total_spend
        FROM spending {where}
        GROUP BY {cat_col}, fy
    ),
    current_fy AS (
        SELECT * FROM fy_spend WHERE fy = (SELECT MAX(fy) FROM fy_spend)
    ),
    prev_fy AS (
        SELECT * FROM fy_spend WHERE fy = (SELECT MAX(fy) - 1 FROM fy_spend)
    )
    SELECT c.{cat_col} as category, c.total_spend as current_fy_spend,
        COALESCE(p.total_spend, 0) as prev_fy_spend,
        CASE WHEN p.total_spend > 0 THEN ((c.total_spend - p.total_spend) / p.total_spend * 100) ELSE 100 END as change_pct
    FROM current_fy c LEFT JOIN prev_fy p ON c.{cat_col} = p.{cat_col}
    ORDER BY ABS(c.total_spend - COALESCE(p.total_spend, 0)) DESC LIMIT 15
    """
    try:
        with duckdb.connect(str(db_path), read_only=True) as conn:
            return conn.execute(query, params).fetchdf()
    except Exception:
        return pd.DataFrame()

def get_savings_summary(db_path: Path, filters: dict, search_text: str) -> dict:
    """Calculate total potential savings from all efficiency opportunities."""
    duplicates = get_potential_duplicates(db_path, filters, search_text)
    duplicate_savings = duplicates['amount'].sum() if not duplicates.empty else 0

    small_txns = get_small_transaction_waste(db_path, filters, search_text)
    # Estimate £15 processing cost per transaction, save if consolidated
    small_txn_savings = len(small_txns) * small_txns['small_txn_count'].sum() * 15 * 0.7 if not small_txns.empty else 0

    contract_eff = get_contract_efficiency(db_path, filters, search_text)
    # Estimate 5% savings on renegotiation
    contract_savings = contract_eff['fy_spend'].sum() * 0.05 if not contract_eff.empty else 0

    consolidation = get_supplier_consolidation_opportunities(db_path, filters, search_text)
    # Estimate 8% savings from supplier consolidation
    consolidation_savings = consolidation['total_spend'].sum() * 0.08 if not consolidation.empty else 0

    return {
        'duplicate_savings': duplicate_savings,
        'small_txn_savings': small_txn_savings,
        'contract_savings': contract_savings,
        'consolidation_savings': consolidation_savings,
        'total_potential': duplicate_savings + small_txn_savings + contract_savings + consolidation_savings
    }

def generate_executive_insights(stats: dict, savings: dict, yoy_data: pd.DataFrame) -> list:
    """Generate key executive insights based on spending analysis."""
    insights = []
    total_spend = stats.get('total', 0)

    # Overall spending insight with YoY context
    if len(yoy_data) >= 2 and not yoy_data.empty:
        latest = yoy_data.iloc[-1]
        if pd.notna(latest.get('prev_spend')) and latest['prev_spend'] > 0:
            change_pct = ((latest['total_spend'] - latest['prev_spend']) / latest['prev_spend']) * 100
            if change_pct > 10:
                insights.append({
                    'type': 'trend',
                    'priority': 'high',
                    'title': f'Spending Up {change_pct:.0f}% Year-over-Year',
                    'text': f"Total spend increased from {format_currency(latest['prev_spend'])} to {format_currency(latest['total_spend'])}. Review budget allocations and identify cost drivers."
                })
            elif change_pct < -5:
                insights.append({
                    'type': 'trend',
                    'priority': 'medium',
                    'title': f'Spending Down {abs(change_pct):.0f}% Year-over-Year',
                    'text': f"Total spend decreased from {format_currency(latest['prev_spend'])} to {format_currency(latest['total_spend'])}. Efficiency gains or reduced activity."
                })

    # Savings opportunity insight
    if savings['total_potential'] > 0 and total_spend > 0:
        savings_pct = (savings['total_potential'] / total_spend * 100)
        if savings_pct > 0.5:  # Only show if meaningful
            insights.append({
                'type': 'savings',
                'priority': 'high' if savings_pct > 2 else 'medium',
                'title': f'Potential Savings: {format_currency(savings["total_potential"])}',
                'text': f"Identified savings opportunities representing {savings_pct:.1f}% of total spend through duplicate review, contract renegotiation, and process consolidation."
            })

    # Duplicate risk insight - only if significant
    if savings['duplicate_savings'] > 50000:
        insights.append({
            'type': 'risk',
            'priority': 'high',
            'title': 'Duplicate Payment Risk Detected',
            'text': f"{format_currency(savings['duplicate_savings'])} in potential duplicate payments identified. Recommend immediate accounts payable review."
        })

    # Contract cost growth insight
    if savings['contract_savings'] > 100000:
        insights.append({
            'type': 'efficiency',
            'priority': 'medium',
            'title': 'Contract Review Opportunity',
            'text': f"Suppliers with >15% cost increases identified. Estimated {format_currency(savings['contract_savings'])} savings potential through renegotiation."
        })

    return insights

# ============== UI COMPONENTS ==============
def render_metric_card(label: str, value: str, delta: str = None, delta_good: bool = None):
    delta_html = ""
    if delta:
        delta_class = "metric-delta-down" if delta_good else "metric-delta-up"
        delta_html = f'<div class="{delta_class}">{delta}</div>'
    st.markdown(f'<div class="metric-card"><div class="metric-value">{value}</div><div class="metric-label">{label}</div>{delta_html}</div>', unsafe_allow_html=True)

def render_savings_card(title: str, amount: float, description: str):
    st.markdown(f'<div class="savings-card"><h3>💰 {title}</h3><div class="amount">{format_currency(amount)}</div><p>{description}</p></div>', unsafe_allow_html=True)

def compact_filter(label: str, values: list, key: str, max_display: int = 100) -> list:
    if not values:
        return []
    with st.expander(f"{label} ({len(values)})", expanded=False):
        if len(values) > max_display:
            search = st.text_input("Search", key=f"{key}_search", placeholder=f"Filter...")
            filtered = [v for v in values if search.lower() in str(v).lower()] if search else values[:max_display]
            return st.multiselect("Select", options=filtered, key=key, label_visibility="collapsed")
        return st.multiselect(label, options=values, key=key, label_visibility="collapsed")

# ============== CHART THEME ==============
CHART_COLORS = ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#64d2ff', '#5e5ce6', '#ff453a', '#ac8e68']

def style_chart(fig):
    fig.update_layout(
        font_family="-apple-system, BlinkMacSystemFont, sans-serif", font_color="#ffffff",
        paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)',
        margin=dict(t=50, b=50, l=50, r=20),
        legend=dict(orientation="h", yanchor="bottom", y=-0.2, xanchor="center", x=0.5, font=dict(color="#98989d", size=10), bgcolor='rgba(0,0,0,0)'),
        hoverlabel=dict(bgcolor="#1c1c1e", bordercolor="#38383a", font_size=11, font_color="#ffffff")
    )
    fig.update_xaxes(gridcolor='#38383a', linecolor='#38383a', tickfont=dict(color='#98989d', size=9), title_font=dict(color='#ffffff', size=11))
    fig.update_yaxes(gridcolor='#38383a', linecolor='#38383a', tickfont=dict(color='#98989d', size=9), title_font=dict(color='#ffffff', size=11))
    return fig

# ============== MAIN APPLICATION ==============
st.markdown('<div class="main-header"><h1>💷 Council Spend Tracker</h1><p>DOGE-style efficiency analysis · Find waste · Drive savings</p></div>', unsafe_allow_html=True)

council_name = st.radio("Council", options=list(COUNCILS.keys()), horizontal=True, key="council_selector", label_visibility="collapsed")
config = COUNCILS[council_name]
db_path = config["db_path"]
db_path_str = str(db_path)

if not db_path.exists():
    st.error(f"Database not found: {db_path}")
    st.stop()

metadata = get_cached_metadata(db_path_str)

# ============== SIDEBAR ==============
with st.sidebar:
    st.markdown(f"### {config['short_name']} Filters")

    if st.button("Reset", use_container_width=True):
        for key in list(st.session_state.keys()):
            if key.startswith(config['short_name']):
                del st.session_state[key]
        st.rerun()

    st.markdown("---")
    search_text = st.text_input("🔍 Search", placeholder="Supplier, category...", key=f"{config['short_name']}_search")

    st.markdown("---")
    st.markdown('<div class="filter-title">📅 Financial Year</div>', unsafe_allow_html=True)
    selected_fys = st.multiselect("FY", options=metadata['financial_years'], key=f"{config['short_name']}_fy", label_visibility="collapsed", placeholder="All years")
    selected_quarter = st.selectbox("Quarter", options=["All", "Q1 (Apr-Jun)", "Q2 (Jul-Sep)", "Q3 (Oct-Dec)", "Q4 (Jan-Mar)"], key=f"{config['short_name']}_quarter", label_visibility="collapsed")

    st.markdown("---")
    st.markdown('<div class="filter-title">💰 Amount</div>', unsafe_allow_html=True)
    col1, col2 = st.columns(2)
    with col1:
        if st.button("£500+", use_container_width=True, key="p500"):
            st.session_state[f"{config['short_name']}_amt_min"] = 500.0
    with col2:
        if st.button("£10K+", use_container_width=True, key="p10k"):
            st.session_state[f"{config['short_name']}_amt_min"] = 10000.0

    amount_min = st.number_input("Min", min_value=0.0, max_value=metadata['max_amount'], value=st.session_state.get(f"{config['short_name']}_amt_min", 0.0), step=100.0, key=f"{config['short_name']}_amount_min")
    amount_max = st.number_input("Max", min_value=0.0, max_value=metadata['max_amount'], value=metadata['max_amount'], step=100.0, key=f"{config['short_name']}_amount_max")

    st.markdown("---")
    st.markdown('<div class="filter-title">📊 Categories</div>', unsafe_allow_html=True)
    filters = {}
    for col in config['filter_columns']:
        if validate_column(db_path_str, col):
            values = get_unique_values(db_path_str, col)
            selected = compact_filter(config['columns'].get(col, col), values, f"{config['short_name']}_{col}")
            if selected:
                filters[col] = selected

if selected_fys:
    filters["financial_years"] = selected_fys
if selected_quarter and selected_quarter != "All":
    filters["financial_quarter"] = selected_quarter.split(" ")[0]
if amount_min > 0 or amount_max < metadata['max_amount']:
    filters["amount_range"] = [amount_min, amount_max]

# ============== SUMMARY ==============
stats = get_summary_stats(db_path, filters, search_text if search_text else None)
yoy_data = get_yoy_comparison(db_path, filters, search_text if search_text else None)
savings = get_savings_summary(db_path, filters, search_text if search_text else None)

col1, col2, col3, col4, col5, col6 = st.columns(6)
with col1:
    render_metric_card("Transactions", f"{stats['transactions']:,.0f}")
with col2:
    render_metric_card("Total Spend", format_currency(stats['total'], short=True))
with col3:
    render_metric_card("Average", format_currency(stats['average'], short=True))
with col4:
    render_metric_card("Suppliers", f"{stats['suppliers']:,.0f}")
with col5:
    if len(yoy_data) >= 2:
        latest = yoy_data.iloc[-1]
        if pd.notna(latest['prev_spend']) and latest['prev_spend'] > 0:
            change = ((latest['total_spend'] - latest['prev_spend']) / latest['prev_spend']) * 100
            render_metric_card("YoY Change", f"{change:+.1f}%", delta_good=change < 0)
        else:
            render_metric_card("YoY", "N/A")
    else:
        render_metric_card("YoY", "N/A")
with col6:
    st.markdown(f'<div class="metric-card" style="border-color: rgba(48,209,88,0.4);"><div class="metric-value" style="color: #30d158;">{format_currency(savings["total_potential"], short=True)}</div><div class="metric-label">Potential Savings</div></div>', unsafe_allow_html=True)

st.markdown("<br>", unsafe_allow_html=True)

# ============== MAIN TABS ==============
tab1, tab2, tab3, tab4, tab5, tab6 = st.tabs(["💰 Savings", "📊 Trends", "🔍 Analysis", "🏢 Suppliers", "📋 Data", "🗺️ Breakdown"])

with tab1:
    st.markdown("### 💰 Savings Opportunities")
    st.caption("Actionable insights to reduce spending and improve efficiency")

    # Executive Summary
    exec_insights = generate_executive_insights(stats, savings, yoy_data)
    if exec_insights:
        st.markdown("#### 📋 Executive Summary")
        for insight in exec_insights[:4]:
            priority_class = insight['priority']
            badge_text = "⚡ Priority" if insight['priority'] == 'high' else "📊 Review"
            st.markdown(f'''<div class="exec-insight {priority_class}">
                <span class="badge">{badge_text}</span>
                <h4>{insight['title']}</h4>
                <p>{insight['text']}</p>
            </div>''', unsafe_allow_html=True)
        st.markdown("---")

    # Quick Action Buttons
    st.markdown("#### ⚡ Quick Actions")
    qa_col1, qa_col2, qa_col3, qa_col4, qa_col5 = st.columns(5)
    with qa_col1:
        if st.button("🔍 High Value", key="qa_high", help="Filter transactions over £50,000"):
            st.session_state[f"{config['short_name']}_amt_min"] = 50000.0
            st.rerun()
    with qa_col2:
        if st.button("📅 This FY", key="qa_fy", help="Filter to current financial year"):
            current_fy = max(metadata['financial_years']) if metadata['financial_years'] else None
            if current_fy:
                st.session_state[f"{config['short_name']}_fy"] = [current_fy]
            st.rerun()
    with qa_col3:
        if st.button("🏭 Top Suppliers", key="qa_suppliers", help="Jump to supplier analysis"):
            st.session_state['active_tab'] = 'suppliers'
    with qa_col4:
        if st.button("📊 YoY Compare", key="qa_yoy", help="View year-over-year trends"):
            st.session_state['active_tab'] = 'trends'
    with qa_col5:
        if st.button("🔄 Reset Filters", key="qa_reset", help="Clear all filters"):
            for key in list(st.session_state.keys()):
                if key.startswith(config['short_name']):
                    del st.session_state[key]
            st.rerun()
    st.markdown("---")

    # Summary cards
    sav_col1, sav_col2, sav_col3, sav_col4 = st.columns(4)
    with sav_col1:
        render_savings_card("Duplicate Review", savings['duplicate_savings'], "Same supplier/amount within 7 days")
    with sav_col2:
        render_savings_card("Process Efficiency", savings['small_txn_savings'], "Consolidate small transactions")
    with sav_col3:
        render_savings_card("Contract Review", savings['contract_savings'], "Renegotiate growing costs")
    with sav_col4:
        render_savings_card("Consolidation", savings['consolidation_savings'], "Reduce supplier fragmentation")

    st.markdown("---")

    # Detailed analysis sections
    exp_col1, exp_col2 = st.columns(2)

    with exp_col1:
        st.markdown("#### 🔴 Potential Duplicate Payments")
        duplicates = get_potential_duplicates(db_path, filters, search_text if search_text else None)
        if not duplicates.empty:
            dup_display = duplicates[['supplier_name', 'amount', 'transaction_date', 'days_apart']].copy()
            dup_display['amount'] = dup_display['amount'].apply(format_currency)
            dup_display['transaction_date'] = pd.to_datetime(dup_display['transaction_date']).dt.strftime('%d %b %Y')
            dup_display.columns = ['Supplier', 'Amount', 'Date', 'Days Apart']
            st.dataframe(dup_display.head(10), use_container_width=True, hide_index=True)
            st.markdown(f'<div class="alert-card"><h4>⚠️ Action Required</h4><p>{len(duplicates)} potential duplicates found totalling {format_currency(duplicates["amount"].sum())}. Review for possible refunds.</p></div>', unsafe_allow_html=True)
        else:
            st.info("No potential duplicates detected.")

        st.markdown("#### 📉 Contract Cost Increases")
        contract_eff = get_contract_efficiency(db_path, filters, search_text if search_text else None)
        if not contract_eff.empty:
            contract_display = contract_eff[['supplier_name', 'fy_spend', 'prev_spend', 'growth_pct']].copy()
            contract_display['fy_spend'] = contract_display['fy_spend'].apply(format_currency)
            contract_display['prev_spend'] = contract_display['prev_spend'].apply(format_currency)
            contract_display['growth_pct'] = contract_display['growth_pct'].apply(lambda x: f"+{x:.0f}%")
            contract_display.columns = ['Supplier', 'Current FY', 'Previous FY', 'Growth']
            st.dataframe(contract_display.head(10), use_container_width=True, hide_index=True)
            st.markdown(f'<div class="warning-card"><h4>📋 Renegotiation Candidates</h4><p>{len(contract_eff)} suppliers with >15% cost increases. Schedule contract reviews.</p></div>', unsafe_allow_html=True)
        else:
            st.info("No significant cost increases detected.")

    with exp_col2:
        st.markdown("#### 🏭 Supplier Consolidation")
        consolidation = get_supplier_consolidation_opportunities(db_path, filters, search_text if search_text else None)
        if not consolidation.empty:
            cons_display = consolidation[['expenditure_category', 'supplier_count', 'total_spend', 'transaction_count']].copy()
            cons_display['total_spend'] = cons_display['total_spend'].apply(lambda x: format_currency(x, True))
            cons_display.columns = ['Category', 'Suppliers', 'Total Spend', 'Transactions']
            st.dataframe(cons_display.head(10), use_container_width=True, hide_index=True)
            st.markdown(f'<div class="warning-card"><h4>🔄 Consolidation Opportunity</h4><p>{len(consolidation)} categories with 5+ suppliers. Consolidating could save ~8% through better rates.</p></div>', unsafe_allow_html=True)
        else:
            st.info("Supplier concentration looks efficient.")

        st.markdown("#### 📊 Small Transaction Overhead")
        small_txns = get_small_transaction_waste(db_path, filters, search_text if search_text else None)
        if not small_txns.empty:
            small_display = small_txns[['supplier_name', 'small_txn_count', 'total_small', 'avg_small']].copy()
            small_display['total_small'] = small_display['total_small'].apply(format_currency)
            small_display['avg_small'] = small_display['avg_small'].apply(lambda x: f"£{x:.0f}")
            small_display.columns = ['Supplier', 'Small Txns', 'Total', 'Avg']
            st.dataframe(small_display.head(10), use_container_width=True, hide_index=True)
            total_small_txns = small_txns['small_txn_count'].sum()
            st.markdown(f'<div class="insight-card"><p>💡 {total_small_txns:,} transactions under £100. Consider purchase cards or consolidated ordering to reduce processing costs.</p></div>', unsafe_allow_html=True)
        else:
            st.info("Small transaction volume is reasonable.")

    st.markdown("---")
    st.markdown("#### 📈 Spending Spikes")
    spikes = get_spending_spikes(db_path, filters, search_text if search_text else None)
    if not spikes.empty:
        fig_spike = go.Figure()
        fig_spike.add_trace(go.Bar(x=spikes['month'], y=spikes['monthly_spend'], name='Monthly Spend', marker_color=CHART_COLORS[0]))
        fig_spike.add_hline(y=spikes['avg_spend'].iloc[0], line_dash="dash", line_color="#ff453a", annotation_text="Average")
        fig_spike.update_layout(height=300, xaxis_title="Month", yaxis_title="Spend (£)")
        style_chart(fig_spike)
        st.plotly_chart(fig_spike, use_container_width=True)
        st.markdown(f'<div class="alert-card"><h4>⚡ Unusual Spending Months</h4><p>{len(spikes)} months with spending >1.5 standard deviations above average. Review for budget planning.</p></div>', unsafe_allow_html=True)

    st.markdown("---")

    # Year-over-Year Comparison
    yoy_col1, yoy_col2 = st.columns(2)
    with yoy_col1:
        st.markdown("#### 📊 Year-over-Year Changes")
        yoy_compare = get_category_yoy_comparison(db_path, filters, search_text if search_text else None)
        if not yoy_compare.empty:
            yoy_display = yoy_compare.copy()
            yoy_display['current_fy_spend'] = yoy_display['current_fy_spend'].apply(format_currency)
            yoy_display['prev_fy_spend'] = yoy_display['prev_fy_spend'].apply(format_currency)
            yoy_display['change_pct'] = yoy_display['change_pct'].apply(lambda x: f"{x:+.1f}%")
            yoy_display.columns = ['Category', 'Current FY', 'Previous FY', 'Change']
            st.dataframe(yoy_display.head(10), use_container_width=True, hide_index=True)
        else:
            st.info("Insufficient data for year-over-year comparison.")

    with yoy_col2:
        st.markdown("#### 📈 Budget Variance Alerts")
        variance = get_budget_variance(db_path, filters, search_text if search_text else None)
        if not variance.empty:
            var_display = variance.copy()
            var_display['current_spend'] = var_display['current_spend'].apply(format_currency)
            var_display['avg_monthly'] = var_display['avg_monthly'].apply(format_currency)
            var_display['variance_pct'] = var_display['variance_pct'].apply(lambda x: f"{x:+.1f}%")
            var_display.columns = ['Category', 'Last Month', 'Monthly Avg', 'Variance']
            st.dataframe(var_display.head(10), use_container_width=True, hide_index=True)

            over_budget = len(variance[variance['variance_pct'] > 0])
            under_budget = len(variance[variance['variance_pct'] < 0])
            if over_budget > 0:
                st.markdown(f'<div class="warning-card"><h4>⚠️ Variance Alert</h4><p>{over_budget} categories over historical average, {under_budget} under. Review for budget alignment.</p></div>', unsafe_allow_html=True)
        else:
            st.info("No significant budget variances detected.")

with tab2:
    st.markdown("### 📊 Spending Trends")

    trend_col1, trend_col2, trend_col3 = st.columns([1, 1, 2])
    with trend_col1:
        time_period = st.selectbox("Period", ["Monthly", "Quarterly", "Financial Year"], key="trend_time")
    with trend_col2:
        chart_type = st.selectbox("Chart", ["Bar", "Line", "Area"], key="trend_chart")
    with trend_col3:
        valid_chart_cols = [c for c in config['chart_columns'] if validate_column(db_path_str, c)]
        group_by = st.selectbox("Group", ["None"] + valid_chart_cols, format_func=lambda x: config['columns'].get(x, x) if x != "None" else "None", key="trend_group")

    ts_data = get_time_aggregated_data(db_path, filters, search_text if search_text else None, time_period, group_by if group_by != "None" else None)

    if not ts_data.empty:
        if group_by != "None" and 'category' in ts_data.columns:
            top_cats = ts_data.groupby('category')['total_spend'].sum().nlargest(8).index.tolist()
            ts_filtered = ts_data[ts_data['category'].isin(top_cats)]
            if chart_type == "Bar":
                fig = px.bar(ts_filtered, x='period_label', y='total_spend', color='category', barmode='group', color_discrete_sequence=CHART_COLORS)
            elif chart_type == "Line":
                fig = px.line(ts_filtered, x='period_label', y='total_spend', color='category', markers=True, color_discrete_sequence=CHART_COLORS)
            else:
                fig = px.area(ts_filtered, x='period_label', y='total_spend', color='category', color_discrete_sequence=CHART_COLORS)
        else:
            if chart_type == "Bar":
                fig = px.bar(ts_data, x='period_label', y='total_spend', text=ts_data['total_spend'].apply(lambda x: format_currency(x, True)), color_discrete_sequence=[CHART_COLORS[0]])
                fig.update_traces(textposition='outside', textfont=dict(color='#ffffff', size=9))
            elif chart_type == "Line":
                fig = px.line(ts_data, x='period_label', y='total_spend', markers=True, color_discrete_sequence=[CHART_COLORS[0]])
                fig.update_traces(line=dict(width=3), marker=dict(size=7))
            else:
                fig = px.area(ts_data, x='period_label', y='total_spend', color_discrete_sequence=[CHART_COLORS[0]])
                fig.update_traces(fillcolor='rgba(10, 132, 255, 0.2)')
        fig.update_layout(height=400, xaxis_tickangle=-45, showlegend=(group_by != "None"))
        style_chart(fig)
        st.plotly_chart(fig, use_container_width=True)

        if group_by == "None" or 'category' not in ts_data.columns:
            summary = ts_data[['period_label', 'total_spend', 'transactions', 'suppliers']].copy()
            summary.columns = ['Period', 'Total Spend', 'Transactions', 'Suppliers']
            summary['Total Spend'] = summary['Total Spend'].apply(format_currency)
            st.dataframe(summary, use_container_width=True, hide_index=True)
    else:
        st.info("No data for selected filters.")

with tab3:
    st.markdown("### 🔍 Anomaly Detection")

    doge_col1, doge_col2 = st.columns(2)

    with doge_col1:
        st.markdown("#### 🚨 High-Value Outliers")
        anomalies = get_spending_anomalies(db_path, filters, search_text if search_text else None)
        if not anomalies.empty:
            anom_display = anomalies[['transaction_date', 'supplier_name', 'amount', 'expenditure_category', 'category_avg']].copy()
            anom_display['transaction_date'] = pd.to_datetime(anom_display['transaction_date']).dt.strftime('%d %b %Y')
            anom_display['amount'] = anom_display['amount'].apply(format_currency)
            anom_display['category_avg'] = anom_display['category_avg'].apply(format_currency)
            anom_display.columns = ['Date', 'Supplier', 'Amount', 'Category', 'Cat Avg']
            st.dataframe(anom_display.head(12), use_container_width=True, hide_index=True)
            st.markdown(f'<div class="alert-card"><h4>⚠️ Review Required</h4><p>{len(anomalies)} transactions >3x category average totalling {format_currency(anomalies["amount"].sum())}.</p></div>', unsafe_allow_html=True)
        else:
            st.info("No significant anomalies.")

    with doge_col2:
        st.markdown("#### 📈 Year-over-Year")
        if len(yoy_data) > 1:
            yoy_display = yoy_data.copy()
            yoy_display['change'] = ((yoy_display['total_spend'] - yoy_display['prev_spend']) / yoy_display['prev_spend'] * 100).round(1)
            fig_yoy = go.Figure()
            fig_yoy.add_trace(go.Bar(x=yoy_display['fy'], y=yoy_display['total_spend'], name='Spend', marker_color=CHART_COLORS[0]))
            fig_yoy.add_trace(go.Scatter(x=yoy_display['fy'], y=yoy_display['change'], name='YoY %', yaxis='y2', mode='lines+markers', marker_color=CHART_COLORS[2], line=dict(width=2)))
            fig_yoy.update_layout(yaxis=dict(title='Spend (£)'), yaxis2=dict(title='YoY %', side='right', overlaying='y', showgrid=False), height=300)
            style_chart(fig_yoy)
            st.plotly_chart(fig_yoy, use_container_width=True)

            latest_change = yoy_display.iloc[-1]['change'] if pd.notna(yoy_display.iloc[-1]['change']) else 0
            if latest_change > 10:
                st.markdown(f'<div class="alert-card"><h4>📈 Spending Up {latest_change:.0f}%</h4><p>Review budget allocations and cost drivers.</p></div>', unsafe_allow_html=True)
            elif latest_change < -5:
                st.markdown(f'<div class="insight-card"><p>✅ Spending down {abs(latest_change):.0f}% vs previous year.</p></div>', unsafe_allow_html=True)
        else:
            st.info("Insufficient YoY data.")

    st.markdown("---")
    st.markdown("#### 📊 Category Trends")
    valid_cat_cols = [c for c in config['chart_columns'] if validate_column(db_path_str, c)]
    if valid_cat_cols:
        cat_col = st.selectbox("Analyse", valid_cat_cols, format_func=lambda x: config['columns'].get(x, x), key="doge_cat")
        cat_trends = get_category_trends(db_path, filters, search_text if search_text else None, cat_col)
        if not cat_trends.empty:
            top_cats = cat_trends.groupby('category')['total_spend'].sum().nlargest(10).index.tolist()
            cat_filtered = cat_trends[cat_trends['category'].isin(top_cats)]
            fig_cat = px.bar(cat_filtered, x='fy', y='total_spend', color='category', barmode='stack', color_discrete_sequence=CHART_COLORS)
            fig_cat.update_layout(height=400)
            style_chart(fig_cat)
            st.plotly_chart(fig_cat, use_container_width=True)

with tab4:
    st.markdown("### 🏢 Supplier Analysis")

    supp_col1, supp_col2 = st.columns([1, 3])
    with supp_col1:
        top_n = st.slider("Top N", 10, 50, 20, key="supplier_top")

    supplier_data = get_supplier_analysis(db_path, filters, search_text if search_text else None, top_n)

    if not supplier_data.empty:
        fig_supp = px.bar(supplier_data.head(15), x='total_spend', y='supplier_name', orientation='h',
            text=supplier_data.head(15)['total_spend'].apply(lambda x: format_currency(x, True)),
            color='total_spend', color_continuous_scale=[[0, '#0a84ff'], [1, '#bf5af2']])
        fig_supp.update_traces(textposition='outside', textfont=dict(color='#ffffff', size=9))
        fig_supp.update_layout(yaxis_title='', height=450, showlegend=False, coloraxis_showscale=False)
        style_chart(fig_supp)
        st.plotly_chart(fig_supp, use_container_width=True)

        total_supp_spend = supplier_data['total_spend'].sum()
        top5 = supplier_data.head(5)['total_spend'].sum()
        top10 = supplier_data.head(10)['total_spend'].sum()

        conc1, conc2, conc3 = st.columns(3)
        with conc1:
            render_metric_card("Top 5", f"{(top5/total_supp_spend*100):.1f}%")
        with conc2:
            render_metric_card("Top 10", f"{(top10/total_supp_spend*100):.1f}%")
        with conc3:
            render_metric_card("Avg/Supplier", format_currency(supplier_data['total_spend'].mean(), True))

        st.markdown("---")
        supp_display = supplier_data.copy()
        supp_display['total_spend'] = supp_display['total_spend'].apply(format_currency)
        supp_display['avg_transaction'] = supp_display['avg_transaction'].apply(format_currency)
        supp_display['largest_transaction'] = supp_display['largest_transaction'].apply(format_currency)
        supp_display['first_transaction'] = pd.to_datetime(supp_display['first_transaction']).dt.strftime('%b %Y')
        supp_display['last_transaction'] = pd.to_datetime(supp_display['last_transaction']).dt.strftime('%b %Y')
        supp_display.columns = ['Supplier', 'Total', 'Count', 'Avg', 'Largest', 'First', 'Last', 'Months']
        st.dataframe(supp_display, use_container_width=True, hide_index=True)

with tab5:
    st.markdown("### 📋 Transaction Data")

    df = run_query(db_path, filters, search_text if search_text else None, config['display_columns'])

    if df.empty:
        st.info("No transactions match filters.")
    else:
        display_df = df.copy()
        if 'amount' in display_df.columns:
            display_df['amount'] = display_df['amount'].apply(lambda x: f"£{x:,.2f}" if pd.notna(x) else "")
        if 'transaction_date' in display_df.columns:
            display_df['transaction_date'] = pd.to_datetime(display_df['transaction_date']).dt.strftime('%d %b %Y')
        display_df = display_df.rename(columns={k: v for k, v in config['columns'].items() if k in display_df.columns})
        st.dataframe(display_df, use_container_width=True, height=450, hide_index=True)
        st.download_button("📥 Export CSV", data=df.to_csv(index=False), file_name=f"{config['short_name'].lower()}_spending.csv", mime="text/csv")

with tab6:
    st.markdown("### 🗺️ Breakdown")

    brk1, brk2, brk3, brk4 = st.columns(4)
    valid_brk_cols = [c for c in config['chart_columns'] if validate_column(db_path_str, c)]
    with brk1:
        chart_by = st.selectbox("By", valid_brk_cols, format_func=lambda x: config['columns'].get(x, x), key="brk_by") if valid_brk_cols else None
    with brk2:
        agg_type = st.selectbox("Measure", [("sum", "Total"), ("avg", "Average"), ("count", "Count")], format_func=lambda x: x[1], key="brk_agg")
    with brk3:
        brk_time = st.selectbox("Period", ["Total", "Financial Year", "Quarterly", "Monthly"], key="brk_time")
    with brk4:
        brk_top = st.slider("Top", 5, 30, 15, key="brk_top")

    if chart_by:
        brk_data = get_time_aggregated_data(db_path, filters, search_text if search_text else None, brk_time, chart_by)
        if not brk_data.empty and 'category' in brk_data.columns:
            if brk_time == "Total":
                agg_col = 'total_spend' if agg_type[0] == 'sum' else ('avg_spend' if agg_type[0] == 'avg' else 'transactions')
                plot_data = brk_data.groupby('category')[agg_col].sum().nlargest(brk_top).reset_index()
                plot_data.columns = ['category', 'value']

                brk_c1, brk_c2 = st.columns(2)
                with brk_c1:
                    fig_bar = px.bar(plot_data, x='value', y='category', orientation='h',
                        text=plot_data['value'].apply(lambda x: format_currency(x, True) if agg_type[0] != 'count' else f"{x:,.0f}"),
                        color='value', color_continuous_scale=[[0, '#0a84ff'], [1, '#bf5af2']])
                    fig_bar.update_traces(textposition='outside', textfont=dict(color='#ffffff', size=9))
                    fig_bar.update_layout(height=450, showlegend=False, coloraxis_showscale=False, yaxis_title='')
                    style_chart(fig_bar)
                    st.plotly_chart(fig_bar, use_container_width=True)
                with brk_c2:
                    fig_pie = px.pie(plot_data, names='category', values='value', color_discrete_sequence=CHART_COLORS, hole=0.4)
                    fig_pie.update_traces(textposition='inside', textinfo='percent', textfont=dict(size=9, color='#ffffff'))
                    fig_pie.update_layout(height=450)
                    style_chart(fig_pie)
                    st.plotly_chart(fig_pie, use_container_width=True)

                fig_tree = px.treemap(plot_data, path=['category'], values='value', color='value', color_continuous_scale=[[0, '#1c1c1e'], [0.5, '#0a84ff'], [1, '#bf5af2']])
                fig_tree.update_layout(height=350, coloraxis_showscale=False)
                fig_tree.update_traces(textfont=dict(color='#ffffff', size=11), marker=dict(line=dict(color='#000000', width=2)))
                style_chart(fig_tree)
                st.plotly_chart(fig_tree, use_container_width=True)
            else:
                top_cats = brk_data.groupby('category')['total_spend'].sum().nlargest(brk_top).index.tolist()
                filtered = brk_data[brk_data['category'].isin(top_cats)]
                fig_time = px.bar(filtered, x='period_label', y='total_spend', color='category', barmode='stack', color_discrete_sequence=CHART_COLORS)
                fig_time.update_layout(height=450, xaxis_tickangle=-45)
                style_chart(fig_time)
                st.plotly_chart(fig_time, use_container_width=True)
        else:
            st.info("No breakdown data.")

# Footer
st.markdown("---")
st.markdown(f'<div style="text-align:center;color:#636366;font-size:0.8rem;">Council Spend Tracker · {config["short_name"]} · {metadata["total_count"]:,} records · PICKUP PRODUCTIONS</div>', unsafe_allow_html=True)
