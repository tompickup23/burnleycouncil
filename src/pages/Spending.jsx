import { useState, useMemo, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, Filter, ChevronDown, ChevronUp, X, Download, TrendingUp, TrendingDown, BarChart3, Activity, Building, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { SearchableSelect, LoadingState, DataFreshness } from '../components/ui'
import { formatCurrency, formatDate, truncate } from '../utils/format'
import './Spending.css'

const ITEMS_PER_PAGE = 50
const CHART_COLORS = ['#0a84ff', '#30d158', '#ff9f0a', '#ff453a', '#bf5af2', '#64d2ff', '#ff375f', '#ffd60a', '#ac8e68', '#8e8e93']
const TOOLTIP_STYLE = { background: 'rgba(28, 28, 30, 0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', padding: '12px 16px' }

const TYPE_LABELS = {
  spend: 'Spend',
  contracts: 'Contracts',
  purchase_cards: 'Purchase Cards',
}
const typeLabel = (t) => TYPE_LABELS[t] || t

const FILTER_KEYS = ['financial_year', 'quarter', 'month', 'type', 'service_division', 'expenditure_category', 'capital_revenue', 'supplier', 'min_amount', 'max_amount']

function SortIcon({ field, sortField, sortDir }) {
  if (sortField !== field) return <ChevronDown size={14} className="sort-inactive" />
  return sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
}

function Spending() {
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'
  const councilId = config.council_id || 'council'
  const { data: spending, loading } = useData('/data/spending.json')
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState('table')
  const [showFilters, setShowFilters] = useState(true)

  // Read filters from URL params (or default to empty)
  const search = searchParams.get('q') || ''
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

  const activeFilterCount = Object.values(filters).filter(Boolean).length + (search ? 1 : 0)
  const spendingData = useMemo(() => spending || [], [spending])

  // Extract unique values for filter dropdowns
  const filterOptions = useMemo(() => {
    if (!spendingData.length) return {}
    const unique = (arr) => [...new Set(arr.filter(Boolean))].sort()
    const months = spendingData.map(item => {
      if (!item.date) return null
      const d = new Date(item.date)
      return d.toLocaleString('en-GB', { month: 'long', year: 'numeric' })
    })
    return {
      financial_years: unique(spendingData.map(s => s.financial_year)),
      quarters: ['Q1', 'Q2', 'Q3', 'Q4'],
      months: unique(months),
      types: unique(spendingData.map(s => s.type)),
      service_divisions: unique(spendingData.map(s => s.service_division)),
      expenditure_categories: unique(spendingData.map(s => s.expenditure_category)),
      capital_revenue: unique(spendingData.map(s => s.capital_revenue)),
      suppliers: unique(spendingData.map(s => s.supplier)),
    }
  }, [spendingData])

  // Filter and sort data
  const filteredData = useMemo(() => {
    let result = spendingData

    if (search) {
      const searchLower = search.toLowerCase()
      result = result.filter(item =>
        item.supplier?.toLowerCase().includes(searchLower) ||
        item.organisational_unit?.toLowerCase().includes(searchLower) ||
        item.service_division?.toLowerCase().includes(searchLower) ||
        item.expenditure_category?.toLowerCase().includes(searchLower) ||
        item.transaction_number?.toLowerCase().includes(searchLower)
      )
    }

    if (filters.financial_year) result = result.filter(item => item.financial_year === filters.financial_year)
    if (filters.quarter) {
      const qNum = parseInt(filters.quarter.replace('Q', ''))
      result = result.filter(item => item.quarter === qNum)
    }
    if (filters.month) {
      result = result.filter(item => {
        if (!item.date) return false
        const d = new Date(item.date)
        return d.toLocaleString('en-GB', { month: 'long', year: 'numeric' }) === filters.month
      })
    }
    if (filters.type) result = result.filter(item => item.type === filters.type)
    if (filters.service_division) result = result.filter(item => item.service_division === filters.service_division)
    if (filters.expenditure_category) result = result.filter(item => item.expenditure_category === filters.expenditure_category)
    if (filters.capital_revenue) result = result.filter(item => item.capital_revenue === filters.capital_revenue)
    if (filters.supplier) result = result.filter(item => item.supplier === filters.supplier)
    if (filters.min_amount) result = result.filter(item => (item.amount || 0) >= parseFloat(filters.min_amount))
    if (filters.max_amount) result = result.filter(item => (item.amount || 0) <= parseFloat(filters.max_amount))

    // Sort (create a copy first to avoid mutating cached data)
    result = [...result].sort((a, b) => {
      let aVal = a[sortField], bVal = b[sortField]
      if (sortField === 'amount') { aVal = Number(aVal) || 0; bVal = Number(bVal) || 0 }
      else if (sortField === 'date') { aVal = new Date(aVal || '1970-01-01').getTime(); bVal = new Date(bVal || '1970-01-01').getTime() }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    return result
  }, [spendingData, search, filters, sortField, sortDir])

  // Paginated data
  const paginatedData = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE
    return filteredData.slice(start, start + ITEMS_PER_PAGE)
  }, [filteredData, page])

  const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE)

  // Summary stats with comparisons
  const stats = useMemo(() => {
    const total = filteredData.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
    const suppliers = new Set(filteredData.map(item => item.supplier)).size
    const avgTransaction = filteredData.length > 0 ? total / filteredData.length : 0
    const medianAmount = (() => {
      if (!filteredData.length) return 0
      const sorted = filteredData.map(i => Number(i.amount) || 0).sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
    })()
    const maxTransaction = filteredData.reduce((max, i) => Math.max(max, Number(i.amount) || 0), 0)
    // Type breakdown
    const byType = {}
    filteredData.forEach(i => {
      const t = i.type || 'other'
      byType[t] = (byType[t] || 0) + (Number(i.amount) || 0)
    })
    return { total, count: filteredData.length, suppliers, avgTransaction, medianAmount, maxTransaction, byType }
  }, [filteredData])

  // Chart data - enriched
  const chartData = useMemo(() => {
    const aggregate = (keyFn) => {
      const map = {}
      filteredData.forEach(item => {
        const key = keyFn(item)
        if (key) map[key] = (map[key] || 0) + (item.amount || 0)
      })
      return map
    }
    const aggregateCount = (keyFn) => {
      const map = {}
      filteredData.forEach(item => {
        const key = keyFn(item)
        if (key) map[key] = (map[key] || 0) + 1
      })
      return map
    }

    const byYear = aggregate(i => i.financial_year || 'Unknown')
    const byYearCount = aggregateCount(i => i.financial_year || 'Unknown')
    const byCategory = aggregate(i => i.expenditure_category || 'Other')
    const byService = aggregate(i => i.service_division || 'Other')
    const bySupplier = aggregate(i => i.supplier || 'Unknown')
    const bySupplierCount = aggregateCount(i => i.supplier || 'Unknown')
    const byType = aggregate(i => i.type || 'other')
    const byMonth = {}
    const byMonthCount = {}
    filteredData.forEach(i => {
      if (!i.date) return
      const d = new Date(i.date)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      byMonth[key] = (byMonth[key] || 0) + (i.amount || 0)
      byMonthCount[key] = (byMonthCount[key] || 0) + 1
    })

    // Monthly data with running average
    const monthlyRaw = Object.entries(byMonth).map(([month, amount]) => ({
      month,
      amount,
      count: byMonthCount[month] || 0,
      label: (() => {
        const [y, m] = month.split('-')
        return new Date(y, m - 1).toLocaleString('en-GB', { month: 'short', year: '2-digit' })
      })(),
    })).sort((a, b) => a.month.localeCompare(b.month)).slice(-36)

    // 3-month rolling average
    const monthlyData = monthlyRaw.map((d, i, arr) => {
      const window = arr.slice(Math.max(0, i - 2), i + 1)
      return { ...d, avg: window.reduce((s, w) => s + w.amount, 0) / window.length }
    })

    return {
      yearData: Object.entries(byYear).map(([year, amount]) => ({
        year, amount, count: byYearCount[year] || 0,
        avg: (byYearCount[year] || 1) > 0 ? amount / byYearCount[year] : 0,
      })).sort((a, b) => a.year.localeCompare(b.year)),
      categoryData: Object.entries(byCategory).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10),
      serviceData: Object.entries(byService).map(([name, value]) => ({
        name: name.split(' - ')[1] || name, fullName: name, value,
      })).sort((a, b) => b.value - a.value).slice(0, 10),
      supplierData: Object.entries(bySupplier).map(([name, value]) => ({
        name: truncate(name, 25), fullName: name, value,
        count: bySupplierCount[name] || 0,
      })).sort((a, b) => b.value - a.value).slice(0, 10),
      typeData: Object.entries(byType).map(([name, value]) => ({
        name: typeLabel(name), value, rawType: name,
      })).sort((a, b) => b.value - a.value),
      monthlyData,
    }
  }, [filteredData])

  const exportCSV = () => {
    const headers = ['Date', 'Supplier', 'Amount', 'Type', 'Service', 'Category', 'Org Unit', 'Transaction']
    const rows = filteredData.map(item => [
      item.date, item.supplier, item.amount, item.type,
      item.service_division, item.expenditure_category, item.organisational_unit, item.transaction_number,
    ])
    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell || ''}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${councilId}-spending-export-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return <LoadingState message="Loading spending data..." />
  }

  return (
    <div className="spending-page animate-fade-in">
      <header className="page-header">
        <div className="header-content">
          <h1>Spending Explorer</h1>
          <p className="subtitle">
            Search and analyse {spendingData.length.toLocaleString()} council transactions
          </p>
          <DataFreshness source="Spending data" compact />
        </div>
        <div className="header-actions">
          <button className="export-btn" onClick={exportCSV}>
            <Download size={18} />
            Export CSV
          </button>
        </div>
      </header>

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
            <SearchableSelect label="Financial Year" value={filters.financial_year} options={filterOptions.financial_years || []} onChange={(v) => updateFilter('financial_year', v)} placeholder="All Years" />
            <SearchableSelect label="Quarter" value={filters.quarter} options={filterOptions.quarters || []} onChange={(v) => updateFilter('quarter', v)} placeholder="All Quarters" />
            <SearchableSelect label="Month" value={filters.month} options={filterOptions.months || []} onChange={(v) => updateFilter('month', v)} placeholder="All Months" />
            <SearchableSelect label="Data Type" value={filters.type} options={filterOptions.types || []} onChange={(v) => updateFilter('type', v)} placeholder="All Types" />
            <SearchableSelect label="Service Division" value={filters.service_division} options={filterOptions.service_divisions || []} onChange={(v) => updateFilter('service_division', v)} placeholder="All Services" />
            <SearchableSelect label="Expenditure Category" value={filters.expenditure_category} options={filterOptions.expenditure_categories || []} onChange={(v) => updateFilter('expenditure_category', v)} placeholder="All Categories" />
            <SearchableSelect label="Capital/Revenue" value={filters.capital_revenue} options={filterOptions.capital_revenue || []} onChange={(v) => updateFilter('capital_revenue', v)} placeholder="All" />
            <SearchableSelect label="Supplier" value={filters.supplier} options={filterOptions.suppliers || []} onChange={(v) => updateFilter('supplier', v)} placeholder="All Suppliers" />

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

      {/* Summary Stats - redesigned */}
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
          <div className="table-container">
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
                    <td className="amount-col">{formatCurrency(item.amount)}</td>
                    <td className="type-col">
                      <span className={`type-badge ${item.type}`}>
                        {typeLabel(item.type)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button className="page-btn" disabled={page === 1} onClick={() => setPage(1)}>First</button>
              <button className="page-btn" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
              <span className="page-info">Page {page} of {totalPages}</span>
              <button className="page-btn" disabled={page === totalPages} onClick={() => setPage(page + 1)}>Next</button>
              <button className="page-btn" disabled={page === totalPages} onClick={() => setPage(totalPages)}>Last</button>
            </div>
          )}
        </>
      )}

      {/* Charts View - upgraded */}
      {activeTab === 'charts' && (
        <div className="charts-grid">
          {/* Monthly Spending Trend - hero chart with area gradient + rolling avg */}
          <div className="chart-card wide hero-chart">
            <div className="chart-header">
              <div>
                <h3>Monthly Spending Trend</h3>
                <p className="chart-subtitle">Last {chartData.monthlyData.length} months with 3-month rolling average</p>
              </div>
              {chartData.monthlyData.length >= 2 && (() => {
                const last = chartData.monthlyData[chartData.monthlyData.length - 1]?.amount || 0
                const prev = chartData.monthlyData[chartData.monthlyData.length - 2]?.amount || 0
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

          {/* Spending by Financial Year - with avg per transaction */}
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
                  {chartData.yearData.map((_, i) => (
                    <Cell key={i} fill={i === chartData.yearData.length - 1 ? '#0a84ff' : 'rgba(10, 132, 255, 0.35)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {/* Year summary underneath */}
            <div className="chart-year-footer">
              {chartData.yearData.slice(-3).map(y => (
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
                  {chartData.typeData.map((entry) => (
                    <Cell key={entry.rawType} fill={entry.rawType === 'spend' ? '#0a84ff' : entry.rawType === 'contracts' ? '#bf5af2' : '#30d158'} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => [formatCurrency(value, true), 'Total']} />
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-legend">
              {chartData.typeData.map(t => (
                <div key={t.rawType} className="donut-legend-item">
                  <span className={`type-dot ${t.rawType}`} />
                  <span className="donut-legend-name">{t.name}</span>
                  <span className="donut-legend-value">{formatCurrency(t.value, true)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top 10 Suppliers - enhanced horizontal */}
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
                  {chartData.supplierData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Top Categories - horizontal bar */}
          <div className="chart-card">
            <div className="chart-header">
              <h3>Top Expenditure Categories</h3>
            </div>
            <div className="inline-bar-list">
              {chartData.categoryData.slice(0, 8).map((cat, i) => {
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

          {/* Services - horizontal bar */}
          <div className="chart-card">
            <div className="chart-header">
              <h3>Spending by Service Division</h3>
            </div>
            <div className="inline-bar-list">
              {chartData.serviceData.slice(0, 8).map((svc, i) => {
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
