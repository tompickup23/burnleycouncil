import { useState, useMemo } from 'react'
import { Search, FileText, Building, TrendingUp, Users, ExternalLink, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { formatCurrency, formatNumber, formatDate } from '../utils/format'
import { CHART_COLORS, TOOLTIP_STYLE } from '../utils/constants'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { LoadingState } from '../components/ui'
import { ChartCard } from '../components/ui/ChartCard'
import './Procurement.css'

const ITEMS_PER_PAGE = 25

const STATUS_LABELS = {
  awarded: 'Awarded',
  open: 'Open',
  closed: 'Closed',
  withdrawn: 'Withdrawn',
  cancelled: 'Cancelled',
}

const STATUS_COLORS = {
  awarded: '#30d158',
  open: '#0a84ff',
  closed: '#8e8e93',
  withdrawn: '#ff9f0a',
  cancelled: '#ff453a',
}

function StatusBadge({ status }) {
  const label = STATUS_LABELS[status] || status || 'Unknown'
  const color = STATUS_COLORS[status] || '#8e8e93'
  return (
    <span className="procurement-status-badge" style={{ background: `${color}22`, color }}>
      {label}
    </span>
  )
}

function SortHeader({ field, label, sortField, sortDir, onSort }) {
  const isActive = sortField === field
  return (
    <th
      className="sortable"
      onClick={() => onSort(field)}
      scope="col"
      aria-sort={isActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      aria-label={`Sort by ${label}`}
      role="columnheader"
    >
      <span className="sort-header-content">
        {label}
        <ArrowUpDown
          size={14}
          className={`sort-icon ${isActive ? 'sort-active' : 'sort-inactive'}`}
          aria-hidden="true"
        />
      </span>
      {isActive && (
        <span className="sort-direction">{sortDir === 'asc' ? '\u25B2' : '\u25BC'}</span>
      )}
    </th>
  )
}

function Procurement() {
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'

  const { data: procurementData, loading, error } = useData('/data/procurement.json')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sortField, setSortField] = useState('published_date')
  const [sortDir, setSortDir] = useState('desc')
  const [page, setPage] = useState(1)

  const stats = procurementData?.stats || {}
  const contracts = procurementData?.contracts || []
  const meta = procurementData?.meta || {}

  // Charts data
  const yearChartData = useMemo(() => {
    const byYear = stats.by_year || {}
    return Object.entries(byYear)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([year, count]) => ({ year, count }))
  }, [stats.by_year])

  const statusChartData = useMemo(() => {
    const counts = {}
    for (const c of contracts) {
      const s = c.status || 'unknown'
      counts[s] = (counts[s] || 0) + 1
    }
    return Object.entries(counts)
      .map(([status, count]) => ({
        name: STATUS_LABELS[status] || status,
        value: count,
        color: STATUS_COLORS[status] || '#8e8e93',
      }))
      .sort((a, b) => b.value - a.value)
  }, [contracts])

  // Top suppliers (from pre-computed stats)
  const topSuppliers = useMemo(() => {
    return (stats.top_suppliers || []).filter(s => s.name !== 'NOT AWARDED TO SUPPLIER')
  }, [stats.top_suppliers])

  // Filter + sort + paginate
  const filtered = useMemo(() => {
    let result = contracts

    if (search) {
      const q = search.toLowerCase()
      result = result.filter(c =>
        (c.title || '').toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q) ||
        (c.awarded_supplier || '').toLowerCase().includes(q) ||
        (c.cpv_description || '').toLowerCase().includes(q)
      )
    }

    if (statusFilter) {
      result = result.filter(c => c.status === statusFilter)
    }

    // Sort
    result = [...result].sort((a, b) => {
      let aVal, bVal
      switch (sortField) {
        case 'title':
          aVal = (a.title || '').toLowerCase()
          bVal = (b.title || '').toLowerCase()
          return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
        case 'awarded_value':
          aVal = a.awarded_value || 0
          bVal = b.awarded_value || 0
          break
        case 'published_date':
        default:
          aVal = a.published_date || ''
          bVal = b.published_date || ''
          return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal
    })

    return result
  }, [contracts, search, statusFilter, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const paged = filtered.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE)

  function handleSort(field) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
    setPage(1)
  }

  // Unique statuses for filter dropdown
  const availableStatuses = useMemo(() => {
    const set = new Set(contracts.map(c => c.status).filter(Boolean))
    return [...set].sort()
  }, [contracts])

  if (loading) return <LoadingState />
  if (error) return <div className="error-state">Failed to load procurement data: {error.message}</div>
  if (!contracts.length) return <div className="empty-state">No procurement data available for {councilName}.</div>

  return (
    <div className="procurement-page">
      {/* Header */}
      <header className="procurement-header">
        <div className="header-content">
          <h1>Public Contracts</h1>
          <p className="procurement-subtitle">
            {formatNumber(stats.total_notices)} contracts published by {councilName} on Contracts Finder.
            {stats.awarded_count > 0 && ` ${formatNumber(stats.awarded_count)} awarded, totalling ${formatCurrency(stats.total_awarded_value, true)}.`}
          </p>
        </div>
      </header>

      {/* Stats Grid */}
      <div className="procurement-stats-grid">
        <div className="procurement-stat-card">
          <div className="procurement-stat-icon stat-icon-blue">
            <FileText size={20} />
          </div>
          <div className="procurement-stat-body">
            <span className="procurement-stat-value">{formatNumber(stats.total_notices)}</span>
            <span className="procurement-stat-label">Total Notices</span>
          </div>
        </div>
        <div className="procurement-stat-card">
          <div className="procurement-stat-icon stat-icon-green">
            <TrendingUp size={20} />
          </div>
          <div className="procurement-stat-body">
            <span className="procurement-stat-value">{formatCurrency(stats.total_awarded_value, true)}</span>
            <span className="procurement-stat-label">Awarded Value</span>
          </div>
        </div>
        <div className="procurement-stat-card">
          <div className="procurement-stat-icon stat-icon-purple">
            <Building size={20} />
          </div>
          <div className="procurement-stat-body">
            <span className="procurement-stat-value">{formatPercent(stats.sme_awarded_pct)}</span>
            <span className="procurement-stat-label">SME Awards</span>
          </div>
        </div>
        <div className="procurement-stat-card">
          <div className="procurement-stat-icon stat-icon-orange">
            <Users size={20} />
          </div>
          <div className="procurement-stat-body">
            <span className="procurement-stat-value">{formatNumber(stats.awarded_count)}</span>
            <span className="procurement-stat-label">Contracts Awarded</span>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="procurement-charts-row">
        {yearChartData.length > 1 && (
          <ChartCard
            title="Contracts by Year"
            description="Number of contract notices published per year"
            dataTable={{
              headers: ['Year', 'Contracts'],
              rows: yearChartData.map(d => [d.year, d.count]),
            }}
          >
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={yearChartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <XAxis dataKey="year" tick={{ fill: '#8e8e93', fontSize: 12 }} />
                <YAxis tick={{ fill: '#8e8e93', fontSize: 12 }} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="count" fill="#0a84ff" radius={[4, 4, 0, 0]} name="Contracts" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
        {statusChartData.length > 1 && (
          <ChartCard
            title="By Status"
            description="Breakdown of contract notice statuses"
            dataTable={{
              headers: ['Status', 'Count'],
              rows: statusChartData.map(d => [d.name, d.value]),
            }}
          >
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={statusChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {statusChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>

      {/* Top Suppliers */}
      {topSuppliers.length > 0 && (
        <div className="procurement-top-suppliers">
          <h2>Top Suppliers</h2>
          <div className="procurement-supplier-cards">
            {topSuppliers.slice(0, 6).map((s, i) => (
              <div key={i} className="procurement-supplier-card">
                <span className="procurement-supplier-rank">#{i + 1}</span>
                <div className="procurement-supplier-info">
                  <span className="procurement-supplier-name">{decodeHtmlEntities(s.name)}</span>
                  <span className="procurement-supplier-detail">
                    {s.contracts} contract{s.contracts !== 1 ? 's' : ''} &middot; {formatCurrency(s.total_value, true)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search + Filters */}
      <div className="procurement-controls">
        <div className="procurement-search-bar">
          <Search className="procurement-search-icon" size={18} />
          <input
            type="text"
            placeholder="Search contracts by title, supplier, or description..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="procurement-search-input"
          />
          {search && (
            <button className="procurement-search-clear" onClick={() => { setSearch(''); setPage(1) }} aria-label="Clear search">
              &times;
            </button>
          )}
        </div>
        <div className="procurement-filter-row">
          <div className="procurement-filter-group">
            <label htmlFor="status-filter">Status</label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
            >
              <option value="">All Statuses</option>
              {availableStatuses.map(s => (
                <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>
              ))}
            </select>
          </div>
          <span className="procurement-filter-results">
            {formatNumber(filtered.length)} contract{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Contracts Table */}
      <div className="procurement-table-container">
        <table className="procurement-table" role="table">
          <thead>
            <tr>
              <SortHeader field="title" label="Contract" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <th scope="col">Status</th>
              <SortHeader field="published_date" label="Published" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <SortHeader field="awarded_value" label="Value" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <th scope="col">Supplier</th>
              <th scope="col" className="procurement-link-col">Link</th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr><td colSpan={6} className="procurement-empty">No contracts match your search.</td></tr>
            ) : (
              paged.map((c) => (
                <tr key={c.id}>
                  <td className="procurement-title-cell">
                    <span className="procurement-contract-title">{c.title}</span>
                    {c.cpv_description && (
                      <span className="procurement-cpv">{c.cpv_description}</span>
                    )}
                  </td>
                  <td><StatusBadge status={c.status} /></td>
                  <td className="procurement-date-cell">{formatDate(c.published_date)}</td>
                  <td className="amount-cell">
                    {c.awarded_value && c.awarded_value > 0
                      ? formatCurrency(c.awarded_value, c.awarded_value >= 100000)
                      : c.value_low && c.value_low > 0
                        ? <span className="text-secondary">{formatCurrency(c.value_low, true)} est.</span>
                        : '-'}
                  </td>
                  <td className="procurement-supplier-cell">
                    {c.awarded_supplier ? decodeHtmlEntities(c.awarded_supplier) : <span className="text-secondary">-</span>}
                  </td>
                  <td className="procurement-link-col">
                    {c.url && (
                      <a href={c.url} target="_blank" rel="noopener noreferrer" className="procurement-external-link" aria-label={`View ${c.title} on Contracts Finder`}>
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="procurement-pagination">
          <button
            className="procurement-page-btn"
            disabled={safePage <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >
            <ChevronLeft size={16} /> Prev
          </button>
          <span className="procurement-page-info">
            Page {safePage} of {totalPages}
          </span>
          <button
            className="procurement-page-btn"
            disabled={safePage >= totalPages}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* Data Source Note */}
      <p className="procurement-source-note">
        Data from <a href="https://www.contractsfinder.service.gov.uk" target="_blank" rel="noopener noreferrer">Contracts Finder</a>.
        {meta.generated && ` Last updated ${formatDate(meta.generated)}.`}
      </p>
    </div>
  )
}

/** Decode HTML entities like &amp; that come from the API */
function decodeHtmlEntities(str) {
  if (!str) return str
  const textarea = typeof document !== 'undefined' ? document.createElement('textarea') : null
  if (textarea) {
    textarea.innerHTML = str
    return textarea.value
  }
  return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
}

function formatPercent(val) {
  if (val === null || val === undefined) return '-'
  return `${Number(val).toFixed(1)}%`
}

export default Procurement
