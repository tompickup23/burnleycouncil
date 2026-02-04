import { useState, useEffect, useMemo } from 'react'
import { Search, Filter, Download, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
import { formatCurrency, formatDate, truncate } from '../utils/format'
import './Spending.css'

const ITEMS_PER_PAGE = 50

function Spending() {
  const [spending, setSpending] = useState([])
  const [metadata, setMetadata] = useState(null)
  const [insights, setInsights] = useState(null)
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [yearFilter, setYearFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  // Sorting
  const [sortField, setSortField] = useState('date')
  const [sortDir, setSortDir] = useState('desc')

  // Pagination
  const [page, setPage] = useState(1)

  useEffect(() => {
    Promise.all([
      fetch('/data/spending.json').then(r => r.json()),
      fetch('/data/metadata.json').then(r => r.json()),
      fetch('/data/insights.json').then(r => r.json()),
    ])
      .then(([spendingData, metadataData, insightsData]) => {
        setSpending(spendingData)
        setMetadata(metadataData)
        setInsights(insightsData)
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to load data:', err)
        setLoading(false)
      })
  }, [])

  // Filter and sort data
  const filteredData = useMemo(() => {
    let result = [...spending]

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase()
      result = result.filter(item =>
        item.supplier?.toLowerCase().includes(searchLower) ||
        item.description?.toLowerCase().includes(searchLower) ||
        item.service?.toLowerCase().includes(searchLower)
      )
    }

    // Year filter
    if (yearFilter) {
      result = result.filter(item => item.financial_year === yearFilter)
    }

    // Type filter
    if (typeFilter) {
      result = result.filter(item => item.data_type === typeFilter)
    }

    // Category filter
    if (categoryFilter) {
      result = result.filter(item => item.category === categoryFilter)
    }

    // Sort
    result.sort((a, b) => {
      let aVal = a[sortField]
      let bVal = b[sortField]

      if (sortField === 'amount') {
        aVal = Number(aVal) || 0
        bVal = Number(bVal) || 0
      }

      if (sortField === 'date') {
        aVal = new Date(aVal || '1970-01-01').getTime()
        bVal = new Date(bVal || '1970-01-01').getTime()
      }

      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    return result
  }, [spending, search, yearFilter, typeFilter, categoryFilter, sortField, sortDir])

  // Paginated data
  const paginatedData = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE
    return filteredData.slice(start, start + ITEMS_PER_PAGE)
  }, [filteredData, page])

  const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE)

  // Summary stats for current filter
  const filterStats = useMemo(() => {
    const total = filteredData.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
    const suppliers = new Set(filteredData.map(item => item.supplier)).size
    return { total, count: filteredData.length, suppliers }
  }, [filteredData])

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const clearFilters = () => {
    setSearch('')
    setYearFilter('')
    setTypeFilter('')
    setCategoryFilter('')
    setPage(1)
  }

  const SortIcon = ({ field }) => {
    if (sortField !== field) return null
    return sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
  }

  if (loading) {
    return <div className="loading">Loading spending data...</div>
  }

  return (
    <div className="spending-page animate-fade-in">
      <header className="page-header">
        <h1>Spending Explorer</h1>
        <p className="subtitle">
          Search and analyse {spending.length.toLocaleString()} payments to council suppliers
        </p>
      </header>

      {/* Search and Filters */}
      <div className="search-section">
        <div className="search-bar">
          <Search size={20} className="search-icon" />
          <input
            type="text"
            placeholder="Search suppliers, descriptions..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>

        <button
          className="filter-toggle"
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter size={18} />
          Filters
          {(yearFilter || typeFilter || categoryFilter) && (
            <span className="filter-count">
              {[yearFilter, typeFilter, categoryFilter].filter(Boolean).length}
            </span>
          )}
        </button>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="filter-panel">
          <div className="filter-group">
            <label>Financial Year</label>
            <select
              value={yearFilter}
              onChange={(e) => {
                setYearFilter(e.target.value)
                setPage(1)
              }}
            >
              <option value="">All Years</option>
              {metadata?.years?.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Data Type</label>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value)
                setPage(1)
              }}
            >
              <option value="">All Types</option>
              {metadata?.data_types?.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Category</label>
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value)
                setPage(1)
              }}
            >
              <option value="">All Categories</option>
              {metadata?.categories?.slice(0, 20).map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <button className="clear-filters" onClick={clearFilters}>
            Clear All
          </button>
        </div>
      )}

      {/* Results Summary */}
      <div className="results-summary">
        <div className="summary-stat">
          <span className="stat-label">Showing</span>
          <span className="stat-value">{filterStats.count.toLocaleString()} records</span>
        </div>
        <div className="summary-stat">
          <span className="stat-label">Total Value</span>
          <span className="stat-value">{formatCurrency(filterStats.total, true)}</span>
        </div>
        <div className="summary-stat">
          <span className="stat-label">Suppliers</span>
          <span className="stat-value">{filterStats.suppliers.toLocaleString()}</span>
        </div>
      </div>

      {/* Data Table */}
      <div className="table-container">
        <table className="spending-table">
          <thead>
            <tr>
              <th
                className="sortable"
                onClick={() => handleSort('date')}
              >
                Date <SortIcon field="date" />
              </th>
              <th
                className="sortable"
                onClick={() => handleSort('supplier')}
              >
                Supplier <SortIcon field="supplier" />
              </th>
              <th>Description</th>
              <th
                className="sortable amount-col"
                onClick={() => handleSort('amount')}
              >
                Amount <SortIcon field="amount" />
              </th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((item, i) => (
              <tr key={`${item.supplier}-${item.date}-${item.amount}-${i}`}>
                <td className="date-col">{formatDate(item.date)}</td>
                <td className="supplier-col">
                  {truncate(item.supplier, 40)}
                  {item.is_covid && (
                    <span className="covid-badge" title="COVID-19 related">COVID</span>
                  )}
                </td>
                <td className="desc-col text-secondary">
                  {truncate(item.description || item.service || '-', 50)}
                </td>
                <td className="amount-col">
                  {formatCurrency(item.amount)}
                </td>
                <td className="type-col">
                  <span className={`type-badge ${item.data_type?.toLowerCase().replace(' ', '-')}`}>
                    {item.data_type === 'spend' ? 'Payment' :
                     item.data_type === 'contract' ? 'Contract' :
                     item.data_type === 'pcard' ? 'P-Card' : item.data_type}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <button
            className="page-btn"
            disabled={page === 1}
            onClick={() => setPage(1)}
          >
            First
          </button>
          <button
            className="page-btn"
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
          >
            Previous
          </button>
          <span className="page-info">
            Page {page} of {totalPages}
          </span>
          <button
            className="page-btn"
            disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}
          >
            Next
          </button>
          <button
            className="page-btn"
            disabled={page === totalPages}
            onClick={() => setPage(totalPages)}
          >
            Last
          </button>
        </div>
      )}

      {/* Key Insights */}
      {insights && (
        <section className="insights-section">
          <h2>Key Insights</h2>
          <div className="insights-grid">
            <div className="insight-card">
              <AlertTriangle size={20} className="insight-icon orange" />
              <h3>Top 20 Concentration</h3>
              <p>Top 20 suppliers receive {insights.political_angles?.top_20_concentration?.toFixed(1)}% of all spending</p>
            </div>

            {insights.top_suppliers?.slice(0, 5).map((sup, i) => (
              <div key={i} className="insight-card supplier">
                <span className="rank">#{i + 1}</span>
                <div className="supplier-info">
                  <h4>{truncate(sup.supplier, 30)}</h4>
                  <p>{formatCurrency(sup.total, true)} across {sup.count} payments</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

export default Spending
