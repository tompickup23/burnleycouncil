import { useState, useEffect, useMemo } from 'react'
import { Search, Filter, ChevronDown, ChevronUp, X, Download } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts'
import { formatCurrency, formatDate, truncate } from '../utils/format'
import './Spending.css'

const ITEMS_PER_PAGE = 50
const CHART_COLORS = ['#0a84ff', '#30d158', '#ff9f0a', '#ff453a', '#bf5af2', '#64d2ff', '#ff375f', '#ffd60a']

// Searchable dropdown component
function SearchableSelect({ label, value, options, onChange, placeholder }) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const filteredOptions = options.filter(opt =>
    opt.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const selectedLabel = value || placeholder

  return (
    <div className="searchable-select">
      <label>{label}</label>
      <div className="select-container">
        <button
          type="button"
          className="select-trigger"
          onClick={() => setIsOpen(!isOpen)}
        >
          <span className={value ? '' : 'placeholder'}>{selectedLabel}</span>
          <ChevronDown size={16} />
        </button>

        {isOpen && (
          <>
            <div className="select-backdrop" onClick={() => setIsOpen(false)} />
            <div className="select-dropdown">
              <input
                type="text"
                className="select-search"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus
              />
              <div className="select-options">
                <div
                  className={`select-option ${!value ? 'selected' : ''}`}
                  onClick={() => { onChange(''); setIsOpen(false); setSearchTerm(''); }}
                >
                  {placeholder}
                </div>
                {filteredOptions.map(opt => (
                  <div
                    key={opt}
                    className={`select-option ${value === opt ? 'selected' : ''}`}
                    onClick={() => { onChange(opt); setIsOpen(false); setSearchTerm(''); }}
                  >
                    {opt}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Spending() {
  const [spending, setSpending] = useState([])
  const [metadata, setMetadata] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('table') // 'table' | 'charts'

  // Filters
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({
    financial_year: '',
    quarter: '',
    month: '',
    type: '',
    service_division: '',
    expenditure_category: '',
    capital_revenue: '',
    supplier: '',
    min_amount: '',
    max_amount: '',
  })
  const [showFilters, setShowFilters] = useState(true)

  // Sorting
  const [sortField, setSortField] = useState('date')
  const [sortDir, setSortDir] = useState('desc')

  // Pagination
  const [page, setPage] = useState(1)

  useEffect(() => {
    Promise.all([
      fetch('/data/spending.json').then(r => r.json()),
      fetch('/data/metadata.json').then(r => r.json()),
    ])
      .then(([spendingData, metadataData]) => {
        setSpending(spendingData)
        setMetadata(metadataData)
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to load data:', err)
        setLoading(false)
      })
  }, [])

  // Extract unique values for filters
  const filterOptions = useMemo(() => {
    if (!spending.length) return {}

    const unique = (arr) => [...new Set(arr.filter(Boolean))].sort()

    // Extract month from date
    const months = spending.map(item => {
      if (!item.date) return null
      const d = new Date(item.date)
      return d.toLocaleString('en-GB', { month: 'long', year: 'numeric' })
    })

    return {
      financial_years: unique(spending.map(s => s.financial_year)),
      quarters: ['Q1', 'Q2', 'Q3', 'Q4'],
      months: unique(months),
      types: unique(spending.map(s => s.type)),
      service_divisions: unique(spending.map(s => s.service_division)),
      expenditure_categories: unique(spending.map(s => s.expenditure_category)),
      capital_revenue: unique(spending.map(s => s.capital_revenue)),
      suppliers: unique(spending.map(s => s.supplier)),
      organisational_units: unique(spending.map(s => s.organisational_unit)),
    }
  }, [spending])

  // Filter data
  const filteredData = useMemo(() => {
    let result = [...spending]

    // Text search
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

    // Apply filters
    if (filters.financial_year) {
      result = result.filter(item => item.financial_year === filters.financial_year)
    }
    if (filters.quarter) {
      const qNum = parseInt(filters.quarter.replace('Q', ''))
      result = result.filter(item => item.quarter === qNum)
    }
    if (filters.month) {
      result = result.filter(item => {
        if (!item.date) return false
        const d = new Date(item.date)
        const itemMonth = d.toLocaleString('en-GB', { month: 'long', year: 'numeric' })
        return itemMonth === filters.month
      })
    }
    if (filters.type) {
      result = result.filter(item => item.type === filters.type)
    }
    if (filters.service_division) {
      result = result.filter(item => item.service_division === filters.service_division)
    }
    if (filters.expenditure_category) {
      result = result.filter(item => item.expenditure_category === filters.expenditure_category)
    }
    if (filters.capital_revenue) {
      result = result.filter(item => item.capital_revenue === filters.capital_revenue)
    }
    if (filters.supplier) {
      result = result.filter(item => item.supplier === filters.supplier)
    }
    if (filters.min_amount) {
      const min = parseFloat(filters.min_amount)
      result = result.filter(item => (item.amount || 0) >= min)
    }
    if (filters.max_amount) {
      const max = parseFloat(filters.max_amount)
      result = result.filter(item => (item.amount || 0) <= max)
    }

    // Sort
    result.sort((a, b) => {
      let aVal = a[sortField]
      let bVal = b[sortField]

      if (sortField === 'amount') {
        aVal = Number(aVal) || 0
        bVal = Number(bVal) || 0
      } else if (sortField === 'date') {
        aVal = new Date(aVal || '1970-01-01').getTime()
        bVal = new Date(bVal || '1970-01-01').getTime()
      }

      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    return result
  }, [spending, search, filters, sortField, sortDir])

  // Paginated data
  const paginatedData = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE
    return filteredData.slice(start, start + ITEMS_PER_PAGE)
  }, [filteredData, page])

  const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE)

  // Summary stats
  const stats = useMemo(() => {
    const total = filteredData.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
    const suppliers = new Set(filteredData.map(item => item.supplier)).size
    const avgTransaction = filteredData.length > 0 ? total / filteredData.length : 0
    return { total, count: filteredData.length, suppliers, avgTransaction }
  }, [filteredData])

  // Chart data
  const chartData = useMemo(() => {
    // Spending by year
    const byYear = {}
    filteredData.forEach(item => {
      const year = item.financial_year || 'Unknown'
      byYear[year] = (byYear[year] || 0) + (item.amount || 0)
    })
    const yearData = Object.entries(byYear)
      .map(([year, amount]) => ({ year, amount }))
      .sort((a, b) => a.year.localeCompare(b.year))

    // Spending by category
    const byCategory = {}
    filteredData.forEach(item => {
      const cat = item.expenditure_category || 'Other'
      byCategory[cat] = (byCategory[cat] || 0) + (item.amount || 0)
    })
    const categoryData = Object.entries(byCategory)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)

    // Spending by service
    const byService = {}
    filteredData.forEach(item => {
      const svc = item.service_division || 'Other'
      byService[svc] = (byService[svc] || 0) + (item.amount || 0)
    })
    const serviceData = Object.entries(byService)
      .map(([name, value]) => ({ name: name.split(' - ')[1] || name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)

    // Top suppliers
    const bySupplier = {}
    filteredData.forEach(item => {
      const sup = item.supplier || 'Unknown'
      bySupplier[sup] = (bySupplier[sup] || 0) + (item.amount || 0)
    })
    const supplierData = Object.entries(bySupplier)
      .map(([name, value]) => ({ name: truncate(name, 25), value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)

    // Monthly trend
    const byMonth = {}
    filteredData.forEach(item => {
      if (!item.date) return
      const d = new Date(item.date)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      byMonth[key] = (byMonth[key] || 0) + (item.amount || 0)
    })
    const monthlyData = Object.entries(byMonth)
      .map(([month, amount]) => ({ month, amount }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-24) // Last 24 months

    return { yearData, categoryData, serviceData, supplierData, monthlyData }
  }, [filteredData])

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
    setPage(1)
  }

  const updateFilter = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setPage(1)
  }

  const clearFilters = () => {
    setFilters({
      financial_year: '',
      quarter: '',
      month: '',
      type: '',
      service_division: '',
      expenditure_category: '',
      capital_revenue: '',
      supplier: '',
      min_amount: '',
      max_amount: '',
    })
    setSearch('')
    setPage(1)
  }

  const activeFilterCount = Object.values(filters).filter(Boolean).length + (search ? 1 : 0)

  const exportCSV = () => {
    const headers = ['Date', 'Supplier', 'Amount', 'Type', 'Service', 'Category', 'Org Unit', 'Transaction']
    const rows = filteredData.map(item => [
      item.date,
      item.supplier,
      item.amount,
      item.type,
      item.service_division,
      item.expenditure_category,
      item.organisational_unit,
      item.transaction_number,
    ])
    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell || ''}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `burnley-spending-export-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <ChevronDown size={14} className="sort-inactive" />
    return sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
  }

  if (loading) {
    return <div className="loading">Loading spending data...</div>
  }

  return (
    <div className="spending-page animate-fade-in">
      <header className="page-header">
        <div className="header-content">
          <h1>Spending Explorer</h1>
          <p className="subtitle">
            Search and analyse {spending.length.toLocaleString()} council transactions
          </p>
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
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          {search && (
            <button className="search-clear" onClick={() => setSearch('')}>
              <X size={16} />
            </button>
          )}
        </div>

        <button
          className={`filter-toggle ${showFilters ? 'active' : ''}`}
          onClick={() => setShowFilters(!showFilters)}
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
            <SearchableSelect
              label="Financial Year"
              value={filters.financial_year}
              options={filterOptions.financial_years || []}
              onChange={(v) => updateFilter('financial_year', v)}
              placeholder="All Years"
            />

            <SearchableSelect
              label="Quarter"
              value={filters.quarter}
              options={filterOptions.quarters || []}
              onChange={(v) => updateFilter('quarter', v)}
              placeholder="All Quarters"
            />

            <SearchableSelect
              label="Month"
              value={filters.month}
              options={filterOptions.months || []}
              onChange={(v) => updateFilter('month', v)}
              placeholder="All Months"
            />

            <SearchableSelect
              label="Data Type"
              value={filters.type}
              options={filterOptions.types || []}
              onChange={(v) => updateFilter('type', v)}
              placeholder="All Types"
            />

            <SearchableSelect
              label="Service Division"
              value={filters.service_division}
              options={filterOptions.service_divisions || []}
              onChange={(v) => updateFilter('service_division', v)}
              placeholder="All Services"
            />

            <SearchableSelect
              label="Expenditure Category"
              value={filters.expenditure_category}
              options={filterOptions.expenditure_categories || []}
              onChange={(v) => updateFilter('expenditure_category', v)}
              placeholder="All Categories"
            />

            <SearchableSelect
              label="Capital/Revenue"
              value={filters.capital_revenue}
              options={filterOptions.capital_revenue || []}
              onChange={(v) => updateFilter('capital_revenue', v)}
              placeholder="All"
            />

            <SearchableSelect
              label="Supplier"
              value={filters.supplier}
              options={filterOptions.suppliers || []}
              onChange={(v) => updateFilter('supplier', v)}
              placeholder="All Suppliers"
            />

            <div className="filter-group amount-filter">
              <label>Amount Range</label>
              <div className="amount-inputs">
                <input
                  type="number"
                  placeholder="Min £"
                  value={filters.min_amount}
                  onChange={(e) => updateFilter('min_amount', e.target.value)}
                />
                <span>to</span>
                <input
                  type="number"
                  placeholder="Max £"
                  value={filters.max_amount}
                  onChange={(e) => updateFilter('max_amount', e.target.value)}
                />
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

      {/* Summary Stats */}
      <div className="stats-bar">
        <div className="stat-item">
          <span className="stat-value">{stats.count.toLocaleString()}</span>
          <span className="stat-label">Transactions</span>
        </div>
        <div className="stat-item highlight">
          <span className="stat-value">{formatCurrency(stats.total, true)}</span>
          <span className="stat-label">Total Value</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">{stats.suppliers.toLocaleString()}</span>
          <span className="stat-label">Suppliers</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">{formatCurrency(stats.avgTransaction, true)}</span>
          <span className="stat-label">Avg Transaction</span>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="tab-nav">
        <button
          className={`tab-btn ${activeTab === 'table' ? 'active' : ''}`}
          onClick={() => setActiveTab('table')}
        >
          Data Table
        </button>
        <button
          className={`tab-btn ${activeTab === 'charts' ? 'active' : ''}`}
          onClick={() => setActiveTab('charts')}
        >
          Visualisations
        </button>
      </div>

      {/* Table View */}
      {activeTab === 'table' && (
        <>
          <div className="table-container">
            <table className="spending-table">
              <thead>
                <tr>
                  <th className="sortable" onClick={() => handleSort('date')}>
                    Date <SortIcon field="date" />
                  </th>
                  <th className="sortable" onClick={() => handleSort('supplier')}>
                    Supplier <SortIcon field="supplier" />
                  </th>
                  <th>Service</th>
                  <th>Category</th>
                  <th className="sortable amount-col" onClick={() => handleSort('amount')}>
                    Amount <SortIcon field="amount" />
                  </th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((item, i) => (
                  <tr key={`${item.transaction_number}-${i}`}>
                    <td className="date-col">{formatDate(item.date)}</td>
                    <td className="supplier-col">
                      <span className="supplier-name">{truncate(item.supplier, 35)}</span>
                      {item.is_covid_related && (
                        <span className="covid-badge">COVID</span>
                      )}
                    </td>
                    <td className="service-col text-secondary">
                      {truncate(item.service_division?.split(' - ')[1] || item.service_division, 20)}
                    </td>
                    <td className="category-col text-secondary">
                      {truncate(item.expenditure_category, 25)}
                    </td>
                    <td className="amount-col">{formatCurrency(item.amount)}</td>
                    <td className="type-col">
                      <span className={`type-badge ${item.type}`}>
                        {item.type === 'spend' ? 'Payment' :
                         item.type === 'contracts' ? 'Contract' :
                         item.type === 'purchase_cards' ? 'P-Card' : item.type}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button className="page-btn" disabled={page === 1} onClick={() => setPage(1)}>
                First
              </button>
              <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                Previous
              </button>
              <span className="page-info">Page {page} of {totalPages}</span>
              <button className="page-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                Next
              </button>
              <button className="page-btn" disabled={page === totalPages} onClick={() => setPage(totalPages)}>
                Last
              </button>
            </div>
          )}
        </>
      )}

      {/* Charts View */}
      {activeTab === 'charts' && (
        <div className="charts-grid">
          {/* Spending by Year */}
          <div className="chart-card">
            <h3>Spending by Financial Year</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData.yearData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis dataKey="year" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} tickFormatter={(v) => `£${(v/1000000).toFixed(0)}M`} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                  formatter={(value) => [formatCurrency(value, true), 'Total']}
                />
                <Bar dataKey="amount" fill="var(--accent-blue)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Spending by Category */}
          <div className="chart-card">
            <h3>Top Categories</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={chartData.categoryData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ name, percent }) => `${truncate(name, 15)} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {chartData.categoryData.map((_, index) => (
                    <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                  formatter={(value) => [formatCurrency(value, true), 'Total']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Top Suppliers */}
          <div className="chart-card wide">
            <h3>Top 10 Suppliers</h3>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={chartData.supplierData} layout="vertical" margin={{ top: 20, right: 30, left: 120, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis type="number" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} tickFormatter={(v) => `£${(v/1000000).toFixed(1)}M`} />
                <YAxis type="category" dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} width={110} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                  formatter={(value) => [formatCurrency(value, true), 'Total']}
                />
                <Bar dataKey="value" fill="var(--accent-green)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Monthly Trend */}
          <div className="chart-card wide">
            <h3>Monthly Spending Trend</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData.monthlyData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis dataKey="month" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} interval={2} />
                <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} tickFormatter={(v) => `£${(v/1000000).toFixed(1)}M`} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                  formatter={(value) => [formatCurrency(value, true), 'Total']}
                />
                <Line type="monotone" dataKey="amount" stroke="var(--accent-orange)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* By Service */}
          <div className="chart-card">
            <h3>Spending by Service</h3>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={chartData.serviceData} layout="vertical" margin={{ top: 20, right: 30, left: 100, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis type="number" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} tickFormatter={(v) => `£${(v/1000000).toFixed(1)}M`} />
                <YAxis type="category" dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} width={90} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                  formatter={(value) => [formatCurrency(value, true), 'Total']}
                />
                <Bar dataKey="value" fill="var(--accent-purple)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}

export default Spending
