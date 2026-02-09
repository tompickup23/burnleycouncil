import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Search, Building, AlertTriangle, Shield, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react'
import { formatCurrency, formatNumber } from '../utils/format'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { LoadingState } from '../components/ui'
import './Suppliers.css'

const ITEMS_PER_PAGE = 50

const RISK_LEVELS = ['clean', 'low', 'medium', 'high', 'critical']
const RISK_LABELS = { clean: 'Clean', low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' }

const SORT_FIELDS = {
  name: { label: 'Name', getter: (p) => (p.name || '').toLowerCase() },
  total_spend: { label: 'Total Spend', getter: (p) => p.spending?.total_all_councils || 0 },
  transactions: { label: 'Transactions', getter: (p) => p.spending?.transaction_count || 0 },
  councils: { label: 'Councils', getter: (p) => p.spending?.councils_count || 0 },
  ch_status: { label: 'CH Status', getter: (p) => p.companies_house ? 1 : 0 },
  risk_level: { label: 'Risk Level', getter: (p) => RISK_LEVELS.indexOf(p.compliance?.risk_level || 'clean') },
  violations: { label: 'Violations', getter: (p) => p.compliance?.violation_count || 0 },
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

function RiskBadge({ level }) {
  if (!level) return <span className="risk-badge clean">Clean</span>
  return (
    <span className={`risk-badge ${level}`}>
      {RISK_LABELS[level] || level}
    </span>
  )
}

function CHStatusBadge({ companiesHouse }) {
  if (companiesHouse) {
    const status = companiesHouse.status || 'unknown'
    return (
      <span className={`ch-badge matched ${status === 'active' ? 'active' : status === 'dissolved' ? 'dissolved' : ''}`}>
        {status === 'active' ? 'Active' : status === 'dissolved' ? 'Dissolved' : status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    )
  }
  return <span className="ch-badge unmatched">Unmatched</span>
}

function Suppliers() {
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'

  const { data: profilesData, loading, error } = useData('/data/supplier_profiles.json')
  const profiles = profilesData?.profiles || []

  const [search, setSearch] = useState('')
  const [riskFilter, setRiskFilter] = useState('')
  const [chFilter, setChFilter] = useState('')
  const [sortField, setSortField] = useState('total_spend')
  const [sortDir, setSortDir] = useState('desc')
  const [page, setPage] = useState(1)

  useEffect(() => {
    document.title = `Supplier Directory | ${councilName} Council Transparency`
    return () => { document.title = `${councilName} Council Transparency` }
  }, [councilName])

  // Reset to page 1 when filters or search change
  useEffect(() => {
    setPage(1)
  }, [search, riskFilter, chFilter, sortField, sortDir])

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  // Summary statistics
  const stats = useMemo(() => {
    const total = profiles.length
    const chMatched = profiles.filter(p => p.companies_house).length
    const withViolations = profiles.filter(p => (p.compliance?.violation_count || 0) > 0).length
    const criticalRisk = profiles.filter(p => p.compliance?.risk_level === 'critical').length
    return { total, chMatched, withViolations, criticalRisk }
  }, [profiles])

  // Filtered and sorted data
  const filteredData = useMemo(() => {
    let result = profiles

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase().trim()
      result = result.filter(p => {
        const nameMatch = p.name?.toLowerCase().includes(searchLower)
        const canonicalMatch = p.canonical?.toLowerCase().includes(searchLower)
        const companyNumberMatch = p.companies_house?.company_number?.toLowerCase().includes(searchLower)
        const legalNameMatch = p.companies_house?.legal_name?.toLowerCase().includes(searchLower)
        return nameMatch || canonicalMatch || companyNumberMatch || legalNameMatch
      })
    }

    // Risk level filter
    if (riskFilter) {
      result = result.filter(p => (p.compliance?.risk_level || 'clean') === riskFilter)
    }

    // Companies House status filter
    if (chFilter === 'matched') {
      result = result.filter(p => p.companies_house)
    } else if (chFilter === 'unmatched') {
      result = result.filter(p => !p.companies_house)
    }

    // Sort
    const sortConfig = SORT_FIELDS[sortField]
    if (sortConfig) {
      result = [...result].sort((a, b) => {
        const aVal = sortConfig.getter(a)
        const bVal = sortConfig.getter(b)
        if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
        if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
        return 0
      })
    }

    return result
  }, [profiles, search, riskFilter, chFilter, sortField, sortDir])

  // Paginated data
  const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE)
  const paginatedData = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE
    return filteredData.slice(start, start + ITEMS_PER_PAGE)
  }, [filteredData, page])

  if (loading) {
    return <LoadingState message="Loading supplier profiles..." />
  }

  if (error) {
    return (
      <div className="page-error">
        <h2>Unable to load data</h2>
        <p>Please try refreshing the page.</p>
      </div>
    )
  }

  return (
    <div className="suppliers-page animate-fade-in" aria-live="polite" aria-busy={loading}>
      {/* Header */}
      <header className="suppliers-header">
        <div className="header-content">
          <h1>Supplier Directory</h1>
          <p className="suppliers-subtitle">
            {formatNumber(profiles.length)} suppliers across all council spending data
          </p>
        </div>
      </header>

      {/* Summary Stats */}
      <div className="suppliers-stats-grid">
        <div className="suppliers-stat-card">
          <div className="suppliers-stat-icon">
            <Building size={20} />
          </div>
          <div className="suppliers-stat-body">
            <span className="suppliers-stat-value">{formatNumber(stats.total)}</span>
            <span className="suppliers-stat-label">Total Suppliers</span>
          </div>
        </div>
        <div className="suppliers-stat-card">
          <div className="suppliers-stat-icon stat-icon-blue">
            <Search size={20} />
          </div>
          <div className="suppliers-stat-body">
            <span className="suppliers-stat-value">{formatNumber(stats.chMatched)}</span>
            <span className="suppliers-stat-label">CH Matched</span>
          </div>
        </div>
        <div className="suppliers-stat-card">
          <div className="suppliers-stat-icon stat-icon-orange">
            <AlertTriangle size={20} />
          </div>
          <div className="suppliers-stat-body">
            <span className="suppliers-stat-value">{formatNumber(stats.withViolations)}</span>
            <span className="suppliers-stat-label">With Violations</span>
          </div>
        </div>
        <div className="suppliers-stat-card">
          <div className="suppliers-stat-icon stat-icon-red">
            <Shield size={20} />
          </div>
          <div className="suppliers-stat-body">
            <span className="suppliers-stat-value">{formatNumber(stats.criticalRisk)}</span>
            <span className="suppliers-stat-label">Critical Risk</span>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="suppliers-controls">
        <div className="suppliers-search-bar">
          <Search size={20} className="suppliers-search-icon" />
          <input
            type="text"
            placeholder="Search by name or company number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search suppliers"
          />
          {search && (
            <button
              className="suppliers-search-clear"
              onClick={() => setSearch('')}
              aria-label="Clear search"
            >
              &times;
            </button>
          )}
        </div>

        <div className="suppliers-filter-row">
          <div className="suppliers-filter-group">
            <label htmlFor="risk-filter">Risk Level</label>
            <select
              id="risk-filter"
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
            >
              <option value="">All</option>
              {RISK_LEVELS.map(level => (
                <option key={level} value={level}>{RISK_LABELS[level]}</option>
              ))}
            </select>
          </div>

          <div className="suppliers-filter-group">
            <label htmlFor="ch-filter">CH Status</label>
            <select
              id="ch-filter"
              value={chFilter}
              onChange={(e) => setChFilter(e.target.value)}
            >
              <option value="">All</option>
              <option value="matched">Matched</option>
              <option value="unmatched">Unmatched</option>
            </select>
          </div>

          <div className="suppliers-filter-results">
            {filteredData.length === profiles.length
              ? `${formatNumber(filteredData.length)} suppliers`
              : `${formatNumber(filteredData.length)} of ${formatNumber(profiles.length)} suppliers`
            }
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="suppliers-table-container">
        <table className="suppliers-table" role="table" aria-label="Supplier directory">
          <thead>
            <tr>
              <SortHeader field="name" label="Name" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <SortHeader field="total_spend" label="Total Spend" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <SortHeader field="transactions" label="Transactions" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <SortHeader field="councils" label="Councils" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <SortHeader field="ch_status" label="CH Status" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <SortHeader field="risk_level" label="Risk Level" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <SortHeader field="violations" label="Violations" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={7} className="suppliers-empty">
                  No suppliers match your search criteria.
                </td>
              </tr>
            ) : (
              paginatedData.map((profile) => (
                <tr key={profile.id}>
                  <td className="supplier-name-cell">
                    <Link to={`/supplier/${profile.id}`} className="supplier-link">
                      {profile.name}
                    </Link>
                    {profile.companies_house?.legal_name &&
                      profile.companies_house.legal_name !== profile.name && (
                        <span className="supplier-legal-name">
                          {profile.companies_house.legal_name}
                        </span>
                      )}
                  </td>
                  <td className="amount-cell">
                    {formatCurrency(profile.spending?.total_all_councils, true)}
                  </td>
                  <td className="number-cell">
                    {formatNumber(profile.spending?.transaction_count)}
                  </td>
                  <td className="number-cell">
                    {formatNumber(profile.spending?.councils_count)}
                  </td>
                  <td>
                    <CHStatusBadge companiesHouse={profile.companies_house} />
                  </td>
                  <td>
                    <RiskBadge level={profile.compliance?.risk_level} />
                  </td>
                  <td className="number-cell">
                    {profile.compliance?.violation_count || 0}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="suppliers-pagination">
          <button
            className="suppliers-page-btn"
            disabled={page === 1}
            onClick={() => setPage(1)}
            aria-label="First page"
          >
            First
          </button>
          <button
            className="suppliers-page-btn"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft size={16} />
            Previous
          </button>
          <span className="suppliers-page-info">
            Page {page} of {totalPages}
          </span>
          <button
            className="suppliers-page-btn"
            disabled={page === totalPages}
            onClick={() => setPage(page + 1)}
            aria-label="Next page"
          >
            Next
            <ChevronRight size={16} />
          </button>
          <button
            className="suppliers-page-btn"
            disabled={page === totalPages}
            onClick={() => setPage(totalPages)}
            aria-label="Last page"
          >
            Last
          </button>
        </div>
      )}
    </div>
  )
}

export default Suppliers
