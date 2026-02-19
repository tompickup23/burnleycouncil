import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search, Filter, ChevronDown, ChevronUp, X, Download, TrendingUp, TrendingDown, BarChart3, Activity, Building, ArrowUpRight, ArrowDownRight, ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight, Shield, Flag, AlertTriangle } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts'
import { useSpendingWorker } from '../hooks/useSpendingWorker'
import { useCouncilConfig } from '../context/CouncilConfig'
import { SearchableSelect, LoadingState, DataFreshness } from '../components/ui'
import { formatCurrency, formatDate, truncate } from '../utils/format'
import { CHART_COLORS, SPENDING_TYPE_LABELS, TOOLTIP_STYLE } from '../utils/constants'
import './Spending.css'

const PAGE_SIZE_OPTIONS = [50, 100, 200, 500]
const DEFAULT_PAGE_SIZE_MOBILE = 100
const DEFAULT_PAGE_SIZE_DESKTOP = 200
const MOBILE_BREAKPOINT = 768

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT)
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const handler = (e) => setIsMobile(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])
  return isMobile
}

const typeLabel = (t) => SPENDING_TYPE_LABELS[t] || t

const FILTER_KEYS = ['financial_year', 'quarter', 'month', 'type', 'service_division', 'expenditure_category', 'capital_revenue', 'supplier', 'min_amount', 'max_amount']

function SortIcon({ field, sortField, sortDir }) {
  if (sortField !== field) return <ChevronDown size={14} className="sort-inactive" />
  return sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
}

function Spending() {
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'
  const councilId = config.council_id || 'council'

  // Web Worker handles all heavy computation off the main thread
  const {
    loading, error, filterOptions, results, totalRecords, query, exportCSV,
    yearManifest, loadedYears, yearLoading, allYearsLoaded, latestYear, chunked, loadYear, loadAllYears,
    monthly, loadedMonths, monthLoading, latestMonth, loadMonth,
  } = useSpendingWorker()

  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState('table')
  const [showFilters, setShowFilters] = useState(true)
  const isMobile = useIsMobile()
  const [pageSize, setPageSize] = useState(() => {
    const saved = searchParams.get('pageSize')
    if (saved && PAGE_SIZE_OPTIONS.includes(Number(saved))) return Number(saved)
    return typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT
      ? DEFAULT_PAGE_SIZE_MOBILE
      : DEFAULT_PAGE_SIZE_DESKTOP
  })
  const tableTopRef = useRef(null)

  // Read filters from URL params (or default to empty)
  const search = searchParams.get('q') || ''
  const dogeRef = searchParams.get('ref') // 'doge' when navigated from DOGE investigation page
  const sortField = searchParams.get('sort') || 'date'
  const sortDir = searchParams.get('dir') || 'desc'
  const page = parseInt(searchParams.get('page') || '1', 10)

  const filters = useMemo(() => {
    const f = {}
    FILTER_KEYS.forEach(key => { f[key] = searchParams.get(key) || '' })
    return f
  }, [searchParams])

  // Update URL params without polluting history
  const setParam = useCallback((key, value) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (value) {
        next.set(key, value)
      } else {
        next.delete(key)
      }
      // Reset to page 1 when filters change
      if (key !== 'page') next.delete('page')
      return next
    }, { replace: true })
  }, [setSearchParams])

  const setSearch = useCallback((v) => setParam('q', v), [setParam])
  const setPage = useCallback((p) => setParam('page', p > 1 ? String(p) : ''), [setParam])
  const updateFilter = useCallback((key, value) => setParam(key, value), [setParam])

  const handleSort = useCallback((field) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (next.get('sort') === field) {
        next.set('dir', next.get('dir') === 'asc' ? 'desc' : 'asc')
      } else {
        next.set('sort', field)
        next.set('dir', 'desc')
      }
      next.delete('page')
      return next
    }, { replace: true })
  }, [setSearchParams])

  const clearFilters = useCallback(() => {
    setSearchParams({}, { replace: true })
  }, [setSearchParams])

  // Set page title
  useEffect(() => {
    document.title = `Spending Explorer | ${councilName} Council Transparency`
    return () => { document.title = `${councilName} Council Transparency | Where Your Money Goes` }
  }, [councilName])

  // JSON-LD structured data for SEO (schema.org/Dataset)
  useEffect(() => {
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: `${councilName} Council Spending Data`,
      description: `Public spending records for ${councilName} Borough Council including invoices, contracts, and purchase card transactions over £${config.spending_threshold || 500}.`,
      url: window.location.href,
      creator: { '@type': 'Organization', name: `${councilName} Borough Council` },
      publisher: { '@type': 'Organization', name: 'AI DOGE' },
      license: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
      isAccessibleForFree: true,
    }
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.textContent = JSON.stringify(jsonLd)
    document.head.appendChild(script)
    return () => { document.head.removeChild(script) }
  }, [councilName, config.spending_threshold])

  // v3 chunked: default to latest financial year for fast initial load
  const hasSetDefaultYear = useRef(false)
  useEffect(() => {
    if (chunked && latestYear && !hasSetDefaultYear.current && !searchParams.get('financial_year')) {
      hasSetDefaultYear.current = true
      setParam('financial_year', latestYear)
    }
  }, [chunked, latestYear, searchParams, setParam])

  // v3/v4 chunked: auto-load year when user selects one that isn't loaded yet
  useEffect(() => {
    if (!chunked || !yearManifest) return
    if (yearLoading) return  // Don't trigger new loads while a year is still loading
    const fy = filters.financial_year
    if (fy && !loadedYears.includes(fy)) {
      loadYear(fy)
    }
    if (!fy && !allYearsLoaded) {
      // "All Years" selected — load remaining years
      loadAllYears()
    }
  }, [filters.financial_year, chunked, yearManifest, loadedYears, allYearsLoaded, yearLoading, loadYear, loadAllYears])

  // v4 monthly: auto-load month chunk when user selects a specific month filter
  useEffect(() => {
    if (!monthly || !yearManifest) return
    const monthFilter = filters.month  // "January 2025" format
    if (!monthFilter) return

    // Parse "January 2025" → "2025-01" (manual parsing avoids browser Date.parse inconsistencies)
    const MONTHS = { january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
      july: '07', august: '08', september: '09', october: '10', november: '11', december: '12' }
    const parts = monthFilter.trim().split(/\s+/)
    if (parts.length < 2) return
    const mm = MONTHS[parts[0].toLowerCase()]
    const yyyy = parts[1]
    if (!mm || !yyyy || !/^\d{4}$/.test(yyyy)) return
    const monthKey = `${yyyy}-${mm}`

    if (loadedMonths.includes(monthKey)) return

    // Find which financial year this month belongs to
    for (const [fy, yearInfo] of Object.entries(yearManifest)) {
      if (yearInfo.months && yearInfo.months[monthKey]) {
        loadMonth(fy, monthKey)
        return
      }
    }
  }, [filters.month, monthly, yearManifest, loadedMonths, loadMonth])

  // Send query to worker whenever filter state changes or new data loads
  const prevLoadedCount = useRef(0)
  useEffect(() => {
    // Track year/month loading for ref bookkeeping (prevents stale closure issues)
    if (loadedYears.length > prevLoadedCount.current) {
      prevLoadedCount.current = loadedYears.length
    }
    query({ filters, search, sortField, sortDir, page, pageSize })
  }, [loadedYears, loadedMonths, filters, search, sortField, sortDir, page, pageSize, query])

  const activeFilterCount = Object.values(filters).filter(Boolean).length + (search ? 1 : 0)

  // Extract data from worker results (or defaults while loading)
  const paginatedData = results?.paginatedData || []
  const filteredCount = results?.filteredCount || 0
  const totalPages = results?.totalPages || 0
  const stats = results?.stats || { total: 0, count: 0, suppliers: 0, avgTransaction: 0, medianAmount: 0, maxTransaction: 0, byType: {} }
  const chartData = results?.chartData || { yearData: [], categoryData: [], serviceData: [], supplierData: [], typeData: [], monthlyData: [] }

  // Handle page size changes - persist to URL and reset page
  const handlePageSizeChange = useCallback((newSize) => {
    setPageSize(newSize)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('pageSize', String(newSize))
      next.delete('page') // reset to page 1
      return next
    }, { replace: true })
  }, [setSearchParams])

  // Scroll to table top when page changes
  const scrollToTable = useCallback(() => {
    if (tableTopRef.current) {
      tableTopRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  const goToPage = useCallback((p) => {
    setPage(p)
    scrollToTable()
  }, [setPage, scrollToTable])

  // Compute visible range text
  const rangeStart = (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, filteredCount)

  const handleExportCSV = useCallback(() => {
    exportCSV({
      filters,
      search,
      sortField,
      sortDir,
      filename: `${councilId}-spending-export-${new Date().toISOString().split('T')[0]}.csv`,
    })
  }, [exportCSV, filters, search, sortField, sortDir, councilId])

  if (loading && !results) {
    return <LoadingState message="Loading spending data..." />
  }

  if (error) {
    return (
      <div className="page-error">
        <h2>Unable to load spending data</h2>
        <p>Please try refreshing the page.</p>
      </div>
    )
  }

  return (
    <div className="spending-page animate-fade-in" aria-live="polite" aria-busy={loading}>
      <header className="page-header">
        <div className="header-content">
          <h1>Spending Explorer</h1>
          <p className="subtitle">
            Search and analyse {(totalRecords || 0).toLocaleString()} council transactions
          </p>
          <DataFreshness source="Spending data" compact />
        </div>
        <div className="header-actions">
          <button className="export-btn" onClick={handleExportCSV}>
            <Download size={18} />
            Export CSV
          </button>
        </div>
      </header>

      {/* Limited Data Warning */}
      {!loading && totalRecords > 0 && totalRecords < 5000 && (
        <div className="limited-data-banner">
          <AlertTriangle size={16} />
          <span>
            This council has limited spending data ({totalRecords.toLocaleString()} records{config.spending_data_period ? ` from ${config.spending_data_period}` : ''}).
            Analysis may be less comprehensive than councils with fuller datasets.
          </span>
        </div>
      )}

      {/* DOGE Evidence Trail Banner */}
      {dogeRef === 'doge' && (
        <div className="doge-evidence-banner">
          <Shield size={16} />
          <span>
            Viewing evidence from <Link to="/doge">DOGE Investigation</Link>
            {filters.supplier && <> — filtered to <strong>{filters.supplier}</strong></>}
          </span>
          <Link to="/doge" className="evidence-back-link">← Back to Investigation</Link>
        </div>
      )}

      {/* Search Bar */}
      <div className="search-section">
        <div className="search-bar">
          <Search size={20} className="search-icon" />
          <input
            type="text"
            placeholder="Search suppliers, services, transaction numbers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search spending records"
          />
          {search && (
            <button className="search-clear" onClick={() => setSearch('')} aria-label="Clear search">
              <X size={16} />
            </button>
          )}
        </div>

        <button
          className={`filter-toggle ${showFilters ? 'active' : ''}`}
          onClick={() => setShowFilters(!showFilters)}
          aria-expanded={showFilters}
        >
          <Filter size={18} />
          Filters
          {activeFilterCount > 0 && (
            <span className="filter-count">{activeFilterCount}</span>
          )}
        </button>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="filter-panel">
          <div className="filter-grid">
            <SearchableSelect label="Financial Year" value={filters.financial_year} options={filterOptions?.financial_years || []} onChange={(v) => updateFilter('financial_year', v)} placeholder="All Years" />
            <SearchableSelect label="Quarter" value={filters.quarter} options={filterOptions?.quarters || []} onChange={(v) => updateFilter('quarter', v)} placeholder="All Quarters" />
            <SearchableSelect label="Month" value={filters.month} options={filterOptions?.months || []} onChange={(v) => updateFilter('month', v)} placeholder="All Months" />
            <SearchableSelect label="Data Type" value={filters.type} options={filterOptions?.types || []} onChange={(v) => updateFilter('type', v)} placeholder="All Types" />
            <SearchableSelect label="Service Division" value={filters.service_division} options={filterOptions?.service_divisions || []} onChange={(v) => updateFilter('service_division', v)} placeholder="All Services" />
            <SearchableSelect label="Expenditure Category" value={filters.expenditure_category} options={filterOptions?.expenditure_categories || []} onChange={(v) => updateFilter('expenditure_category', v)} placeholder="All Categories" />
            <SearchableSelect label="Capital/Revenue" value={filters.capital_revenue} options={filterOptions?.capital_revenue || []} onChange={(v) => updateFilter('capital_revenue', v)} placeholder="All" />
            <SearchableSelect label="Supplier" value={filters.supplier} options={filterOptions?.suppliers || []} onChange={(v) => updateFilter('supplier', v)} placeholder="All Suppliers" />

            <div className="filter-group amount-filter">
              <label>Amount Range</label>
              <div className="amount-inputs">
                <input type="number" placeholder="Min £" value={filters.min_amount} onChange={(e) => updateFilter('min_amount', e.target.value)} aria-label="Minimum amount" />
                <span>to</span>
                <input type="number" placeholder="Max £" value={filters.max_amount} onChange={(e) => updateFilter('max_amount', e.target.value)} aria-label="Maximum amount" />
              </div>
            </div>
          </div>

          {activeFilterCount > 0 && (
            <button className="clear-filters" onClick={clearFilters}>
              <X size={16} />
              Clear all filters
            </button>
          )}
        </div>
      )}

      {/* Loading indicator (v3 year-chunked / v4 monthly-chunked) */}
      {(yearLoading || monthLoading) && !monthLoading && (
        <div className="year-loading-banner">
          <div className="year-loading-spinner" />
          Loading {yearLoading} data...
        </div>
      )}
      {monthLoading && (
        <div className="year-loading-banner">
          <div className="year-loading-spinner" />
          Loading {monthLoading} data...
        </div>
      )}
      {chunked && !filters.financial_year && !allYearsLoaded && !yearLoading && !monthLoading && loadedYears.length > 0 && (
        <div className="year-loading-banner year-loading-info">
          Showing {loadedYears.length} of {yearManifest ? Object.keys(yearManifest).length : '?'} years — loading remaining data...
        </div>
      )}

      {/* Summary Stats */}
      <div className="stats-grid">
        <div className="stat-card stat-primary">
          <div className="stat-card-icon"><Activity size={20} /></div>
          <div className="stat-card-body">
            <span className="stat-card-value">{formatCurrency(stats.total, true)}</span>
            <span className="stat-card-label">Total Spend</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon"><BarChart3 size={20} /></div>
          <div className="stat-card-body">
            <span className="stat-card-value">{stats.count.toLocaleString()}</span>
            <span className="stat-card-label">Transactions</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon"><Building size={20} /></div>
          <div className="stat-card-body">
            <span className="stat-card-value">{stats.suppliers.toLocaleString()}</span>
            <span className="stat-card-label">Suppliers</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon"><TrendingUp size={20} /></div>
          <div className="stat-card-body">
            <span className="stat-card-value">{formatCurrency(stats.avgTransaction, true)}</span>
            <span className="stat-card-label">Average</span>
            <span className="stat-card-sub">Median: {formatCurrency(stats.medianAmount, true)}</span>
          </div>
        </div>

        {/* Inline type breakdown */}
        {Object.keys(stats.byType).length > 0 && (
          <div className="stat-card stat-wide type-breakdown-card">
            <div className="type-breakdown-bar">
              {Object.entries(stats.byType).sort((a, b) => b[1] - a[1]).map(([type, amount]) => (
                <div
                  key={type}
                  className={`type-segment ${type}`}
                  style={{ flex: amount }}
                  title={`${typeLabel(type)}: ${formatCurrency(amount, true)}`}
                />
              ))}
            </div>
            <div className="type-breakdown-legend">
              {Object.entries(stats.byType).sort((a, b) => b[1] - a[1]).map(([type, amount]) => (
                <span key={type} className="type-legend-item">
                  <span className={`type-dot ${type}`} />
                  {typeLabel(type)}: {formatCurrency(amount, true)}
                  <span className="type-pct">({stats.total > 0 ? ((amount / stats.total) * 100).toFixed(1) : 0}%)</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Analytics Stats Row */}
      {stats.count > 10 && stats.stdDev > 0 && (
        <div className="stats-grid stats-analytics">
          <div className="stat-card stat-compact">
            <div className="stat-card-body">
              <span className="stat-card-value">{formatCurrency(stats.stdDev, true)}</span>
              <span className="stat-card-label">Std Dev</span>
              <span className="stat-card-sub">CV: {stats.avgTransaction > 0 ? ((stats.stdDev / stats.avgTransaction) * 100).toFixed(0) : 0}%</span>
            </div>
          </div>
          <div className="stat-card stat-compact">
            <div className="stat-card-body">
              <span className="stat-card-value">{formatCurrency(stats.p90, true)}</span>
              <span className="stat-card-label">P90</span>
              <span className="stat-card-sub">Top 10% above this</span>
            </div>
          </div>
          <div className="stat-card stat-compact">
            <div className="stat-card-body">
              <span className="stat-card-value">{stats.supplierGini != null ? stats.supplierGini.toFixed(2) : '-'}</span>
              <span className="stat-card-label">Supplier Gini</span>
              <span className="stat-card-sub" style={{ color: stats.supplierGini > 0.7 ? '#dc3545' : stats.supplierGini > 0.5 ? '#fd7e14' : '#28a745' }}>
                {stats.supplierGini > 0.7 ? 'Concentrated' : stats.supplierGini > 0.5 ? 'Moderate' : 'Diverse'}
              </span>
            </div>
          </div>
          <div className="stat-card stat-compact">
            <div className="stat-card-body">
              <span className="stat-card-value">{formatCurrency((stats.p75 || 0) - (stats.p25 || 0), true)}</span>
              <span className="stat-card-label">IQR</span>
              <span className="stat-card-sub">P25–P75 range</span>
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="tab-nav" role="tablist">
        <button role="tab" aria-selected={activeTab === 'table'} className={`tab-btn ${activeTab === 'table' ? 'active' : ''}`} onClick={() => setActiveTab('table')}>
          Data Table
        </button>
        <button role="tab" aria-selected={activeTab === 'charts'} className={`tab-btn ${activeTab === 'charts' ? 'active' : ''}`} onClick={() => setActiveTab('charts')}>
          Visualisations
        </button>
      </div>

      {/* Table View */}
      {activeTab === 'table' && (
        <>
          <div className="table-container" ref={tableTopRef}>
            {loading && results && (
              <div className="table-loading-overlay">
                <div className="table-loading-spinner" />
              </div>
            )}
            <table className="spending-table" role="table" aria-label="Spending records">
              <thead>
                <tr>
                  <th scope="col" className="sortable" onClick={() => handleSort('date')} aria-label="Sort by date">
                    Date <SortIcon field="date" sortField={sortField} sortDir={sortDir} />
                  </th>
                  <th scope="col" className="sortable" onClick={() => handleSort('supplier')} aria-label="Sort by supplier">
                    Supplier <SortIcon field="supplier" sortField={sortField} sortDir={sortDir} />
                  </th>
                  <th scope="col">Service</th>
                  <th scope="col">Category</th>
                  <th scope="col" className="sortable amount-col" onClick={() => handleSort('amount')} aria-label="Sort by amount">
                    Amount <SortIcon field="amount" sortField={sortField} sortDir={sortDir} />
                  </th>
                  <th scope="col">Type</th>
                  <th scope="col" className="flag-col" aria-label="Flag transaction"></th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((item, i) => (
                  <tr key={`${item.transaction_number}-${i}`}>
                    <td className="date-col">{formatDate(item.date)}</td>
                    <td className="supplier-col">
                      <span className="supplier-name">{truncate(item.supplier, 35)}</span>
                      {item.is_covid_related && <span className="covid-badge">COVID</span>}
                    </td>
                    <td className="service-col text-secondary">{truncate(item.service_division?.split(' - ')[1] || item.service_division, 20)}</td>
                    <td className="category-col text-secondary">{truncate(item.expenditure_category, 25)}</td>
                    <td className="amount-col">
                      {formatCurrency(item.amount)}
                      {stats.stdDev > 0 && stats.avgTransaction > 0 && Math.abs(((item.amount || 0) - stats.avgTransaction) / stats.stdDev) > 3 && (
                        <span className="outlier-icon" title={`Outlier: z-score ${(((item.amount || 0) - stats.avgTransaction) / stats.stdDev).toFixed(1)}σ`}>
                          <AlertTriangle size={12} />
                        </span>
                      )}
                    </td>
                    <td className="type-col">
                      <span className={`type-badge ${item.type}`}>
                        {typeLabel(item.type)}
                      </span>
                    </td>
                    <td className="flag-col">
                      <a
                        href={`mailto:press@aidoge.co.uk?subject=${encodeURIComponent(`Flag: ${item.supplier} — ${formatCurrency(item.amount)}`)}&body=${encodeURIComponent(`I'd like to flag this transaction for investigation:\n\nCouncil: ${councilName}\nSupplier: ${item.supplier}\nAmount: ${formatCurrency(item.amount)}\nDate: ${formatDate(item.date)}\nService: ${item.service_division || 'N/A'}\nCategory: ${item.expenditure_category || 'N/A'}\nRef: ${item.transaction_number || 'N/A'}\n\nReason for flagging:\n[Please describe why you think this transaction warrants investigation]\n`)}`}
                        className="flag-btn"
                        title="Flag this transaction for investigation"
                        aria-label={`Flag transaction to ${item.supplier} for ${formatCurrency(item.amount)}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Flag size={14} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <div className="pagination-size">
                <label htmlFor="page-size">Rows:</label>
                <select id="page-size" value={pageSize} onChange={(e) => handlePageSizeChange(Number(e.target.value))}>
                  {PAGE_SIZE_OPTIONS.map(size => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </div>
              <div className="pagination-nav">
                <button className="page-btn" disabled={page === 1} onClick={() => goToPage(1)} aria-label="First page"><ChevronsLeft size={16} /></button>
                <button className="page-btn" disabled={page === 1} onClick={() => goToPage(page - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button>
                <span className="page-info">
                  <span className="page-range">{rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()}</span>
                  {' of '}
                  <span className="page-total">{(filteredCount || 0).toLocaleString()}</span>
                </span>
                <button className="page-btn" disabled={page === totalPages} onClick={() => goToPage(page + 1)} aria-label="Next page"><ChevronRight size={16} /></button>
                <button className="page-btn" disabled={page === totalPages} onClick={() => goToPage(totalPages)} aria-label="Last page"><ChevronsRight size={16} /></button>
              </div>
              <span className="pagination-page-count">Page {page} of {totalPages}</span>
            </div>
          )}
        </>
      )}

      {/* Charts View */}
      {activeTab === 'charts' && (
        <div className="charts-grid">
          {/* Monthly Spending Trend - hero chart with area gradient + rolling avg */}
          <div className="chart-card wide hero-chart">
            <div className="chart-header">
              <div>
                <h3>Monthly Spending Trend</h3>
                <p className="chart-subtitle">Last {chartData?.monthlyData?.length || 0} months with 3-month rolling average</p>
              </div>
              {(chartData?.monthlyData?.length || 0) >= 2 && (() => {
                const last = chartData?.monthlyData?.[chartData.monthlyData.length - 1]?.amount || 0
                const prev = chartData?.monthlyData?.[chartData.monthlyData.length - 2]?.amount || 0
                const change = prev > 0 ? ((last - prev) / prev * 100) : 0
                const isUp = change >= 0
                return (
                  <div className={`chart-trend ${isUp ? 'up' : 'down'}`}>
                    {isUp ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                    <span>{Math.abs(change).toFixed(1)}%</span>
                    <span className="chart-trend-label">vs prior month</span>
                  </div>
                )
              })()}
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={chartData.monthlyData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                <defs>
                  <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0a84ff" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#0a84ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="label" tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} interval={2} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} tickFormatter={(v) => `£${(v/1000000).toFixed(1)}M`} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value, name) => [formatCurrency(value, true), name === 'avg' ? '3-Mo Average' : 'Monthly Spend']}
                  labelFormatter={(label) => label}
                />
                <Area type="monotone" dataKey="amount" stroke="#0a84ff" strokeWidth={2} fill="url(#spendGradient)" />
                <Area type="monotone" dataKey="avg" stroke="#ff9f0a" strokeWidth={2} strokeDasharray="6 3" fill="none" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Spending by Financial Year */}
          <div className="chart-card">
            <div className="chart-header">
              <h3>Spend by Financial Year</h3>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData.yearData} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="year" tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} tickFormatter={(v) => `£${(v/1000000).toFixed(0)}M`} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value) => [formatCurrency(value, true), 'Total']}
                  labelFormatter={(l) => `FY ${l}`}
                />
                <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                  {(chartData?.yearData || []).map((_, i) => (
                    <Cell key={i} fill={i === (chartData?.yearData?.length || 0) - 1 ? '#0a84ff' : 'rgba(10, 132, 255, 0.35)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="chart-year-footer">
              {(chartData?.yearData || []).slice(-3).map(y => (
                <div key={y.year} className="year-stat">
                  <span className="year-stat-label">{y.year}</span>
                  <span className="year-stat-value">{formatCurrency(y.amount, true)}</span>
                  <span className="year-stat-sub">{y.count.toLocaleString()} txns</span>
                </div>
              ))}
            </div>
          </div>

          {/* Type Breakdown - donut */}
          <div className="chart-card">
            <div className="chart-header">
              <h3>Spending by Type</h3>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={chartData.typeData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  strokeWidth={0}
                >
                  {(chartData?.typeData || []).map((entry) => (
                    <Cell key={entry.rawType} fill={entry.rawType === 'spend' ? '#0a84ff' : entry.rawType === 'contracts' ? '#bf5af2' : '#30d158'} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => [formatCurrency(value, true), 'Total']} />
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-legend">
              {(chartData?.typeData || []).map(t => (
                <div key={t.rawType} className="donut-legend-item">
                  <span className={`type-dot ${t.rawType}`} />
                  <span className="donut-legend-name">{t.name}</span>
                  <span className="donut-legend-value">{formatCurrency(t.value, true)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top 10 Suppliers */}
          <div className="chart-card wide">
            <div className="chart-header">
              <h3>Top 10 Suppliers by Value</h3>
              <p className="chart-subtitle">Hover for transaction count</p>
            </div>
            <ResponsiveContainer width="100%" height={380}>
              <BarChart data={chartData.supplierData} layout="vertical" margin={{ top: 10, right: 40, left: 130, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                <XAxis type="number" tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} tickFormatter={(v) => `£${(v/1000000).toFixed(1)}M`} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} width={120} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value, _name, props) => {
                    const entry = props.payload
                    return [`${formatCurrency(value, true)} (${entry.count} transactions)`, entry.fullName]
                  }}
                />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {(chartData?.supplierData || []).map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Top Categories */}
          <div className="chart-card">
            <div className="chart-header">
              <h3>Top Expenditure Categories</h3>
            </div>
            <div className="inline-bar-list">
              {(chartData?.categoryData || []).slice(0, 8).map((cat, i) => {
                const maxVal = chartData.categoryData[0]?.value || 1
                const pct = (cat.value / maxVal) * 100
                return (
                  <div key={cat.name} className="inline-bar-item">
                    <span className="inline-bar-label" title={cat.name}>{truncate(cat.name, 22)}</span>
                    <div className="inline-bar-track">
                      <div
                        className="inline-bar-fill"
                        style={{ width: `${pct}%`, background: CHART_COLORS[i % CHART_COLORS.length] }}
                      />
                    </div>
                    <span className="inline-bar-value">{formatCurrency(cat.value, true)}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Services */}
          <div className="chart-card">
            <div className="chart-header">
              <h3>Spending by Service Division</h3>
            </div>
            <div className="inline-bar-list">
              {(chartData?.serviceData || []).slice(0, 8).map((svc, i) => {
                const maxVal = chartData.serviceData[0]?.value || 1
                const pct = (svc.value / maxVal) * 100
                return (
                  <div key={svc.name} className="inline-bar-item">
                    <span className="inline-bar-label" title={svc.fullName}>{truncate(svc.name, 22)}</span>
                    <div className="inline-bar-track">
                      <div
                        className="inline-bar-fill"
                        style={{ width: `${pct}%`, background: CHART_COLORS[(i + 2) % CHART_COLORS.length] }}
                      />
                    </div>
                    <span className="inline-bar-value">{formatCurrency(svc.value, true)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Spending
