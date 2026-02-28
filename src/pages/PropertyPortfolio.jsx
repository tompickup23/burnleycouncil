import { useState, useMemo, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building, Download, Search, ChevronLeft, ChevronRight, ArrowUpDown, Lock, MapPin, Landmark, TreePine, Home, Info, Lightbulb } from 'lucide-react'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { useAuth } from '../context/AuthContext'
import { isFirebaseEnabled } from '../firebase'
import { LoadingState } from '../components/ui'
import { formatNumber, formatCurrency } from '../utils/format'

const PAGE_SIZE = 50

const CATEGORY_COLORS = {
  education: '#2196F3',
  library: '#9C27B0',
  children_social_care: '#E91E63',
  office_civic: '#607D8B',
  operations_depot_waste: '#795548',
  transport_highways: '#FF9800',
  land_general: '#4CAF50',
  land_woodland: '#388E3C',
  land_open_space: '#66BB6A',
  other_building: '#9E9E9E',
}

const CATEGORY_LABELS = {
  education: 'Education',
  library: 'Library',
  children_social_care: 'Children & Social Care',
  office_civic: 'Office / Civic',
  operations_depot_waste: 'Operations / Depot',
  transport_highways: 'Transport / Highways',
  land_general: 'Land (General)',
  land_woodland: 'Land (Woodland)',
  land_open_space: 'Land (Open Space)',
  other_building: 'Other Building',
}

const CATEGORY_ICONS = {
  education: '🎓',
  library: '📚',
  children_social_care: '👶',
  office_civic: '🏛️',
  operations_depot_waste: '🏭',
  transport_highways: '🚗',
  land_general: '🌍',
  land_woodland: '🌲',
  land_open_space: '🌳',
  other_building: '🏠',
}

function CategoryBadge({ category }) {
  const color = CATEGORY_COLORS[category] || '#9E9E9E'
  const label = CATEGORY_LABELS[category] || category?.replace(/_/g, ' ') || 'Unknown'
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '4px',
      fontSize: '0.75rem',
      fontWeight: 600,
      color: '#fff',
      background: color,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

function DisposalBadge({ priority }) {
  if (priority == null) return <span style={{ color: '#8e8e93' }}>-</span>
  const p = Number(priority)
  let color = '#30d158'
  let label = 'Low'
  if (p >= 80) { color = '#ff453a'; label = 'High' }
  else if (p >= 50) { color = '#ff9f0a'; label = 'Medium' }
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '4px',
      fontSize: '0.75rem',
      fontWeight: 600,
      color: '#fff',
      background: color,
      whiteSpace: 'nowrap',
    }}>
      {label} ({p})
    </span>
  )
}

function BandBadge({ band }) {
  if (!band) return <span style={{ color: '#8e8e93' }}>-</span>
  const colors = { high: '#ff453a', medium: '#ff9f0a', low: '#30d158' }
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '4px',
      fontSize: '0.72rem',
      fontWeight: 600,
      color: '#fff',
      background: colors[band] || '#607D8B',
      textTransform: 'capitalize',
      whiteSpace: 'nowrap',
    }}>
      {band}
    </span>
  )
}

function SortHeader({ label, field, sortField, sortDir, onSort }) {
  const active = sortField === field
  return (
    <th
      onClick={() => onSort(field)}
      style={{
        cursor: 'pointer',
        userSelect: 'none',
        padding: '10px 12px',
        textAlign: 'left',
        fontSize: '0.8rem',
        fontWeight: 600,
        color: active ? '#0a84ff' : 'var(--text-secondary, #aaa)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        {label}
        <ArrowUpDown size={12} style={{ opacity: active ? 1 : 0.4 }} />
        {active && <span style={{ fontSize: '0.65rem' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
      </span>
    </th>
  )
}

function StatCard({ label, value, subtitle, icon: Icon }) {
  return (
    <div className="glass-card" style={{ padding: '16px 20px', textAlign: 'center' }}>
      {Icon && <Icon size={20} style={{ color: '#0a84ff', marginBottom: '6px' }} />}
      <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#fff' }}>{value}</div>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #aaa)', marginTop: '2px' }}>{label}</div>
      {subtitle && <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary, #666)', marginTop: '2px' }}>{subtitle}</div>}
    </div>
  )
}

export default function PropertyPortfolio() {
  const config = useCouncilConfig()
  const auth = useAuth()
  const navigate = useNavigate()
  const councilName = config.council_name || 'Council'

  const { data, loading, error } = useData('/data/property_assets.json')

  // --- Page title ---
  useEffect(() => {
    document.title = `Property Estate | ${councilName} Transparency`
    return () => { document.title = `${councilName} Transparency` }
  }, [councilName])

  // --- Strategist gate ---
  const hasAccess = auth?.isStrategist || !isFirebaseEnabled

  // --- State ---
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterDistrict, setFilterDistrict] = useState('')
  const [filterOwnership, setFilterOwnership] = useState('')
  const [filterDisposal, setFilterDisposal] = useState('')
  const [filterCED, setFilterCED] = useState('')
  const [filterRecommendation, setFilterRecommendation] = useState('')
  const [sortField, setSortField] = useState('name')
  const [sortDir, setSortDir] = useState('asc')
  const [page, setPage] = useState(1)
  const [viewMode, setViewMode] = useState('table')

  // --- Parse data ---
  const meta = data?.meta || {}
  const assets = data?.assets || []

  // --- Dropdown options ---
  const categoryOptions = useMemo(() => {
    if (!meta.category_breakdown) return []
    return Object.keys(meta.category_breakdown).sort()
  }, [meta.category_breakdown])

  const districtOptions = useMemo(() => {
    if (!meta.district_breakdown) return []
    return Object.keys(meta.district_breakdown).sort()
  }, [meta.district_breakdown])

  const cedOptions = useMemo(() => {
    if (!meta.ced_summary) return []
    return Object.keys(meta.ced_summary).sort()
  }, [meta.ced_summary])

  const recommendationOptions = useMemo(() => {
    if (!meta.disposal_recommendations) return []
    return Object.entries(meta.disposal_recommendations)
      .sort((a, b) => b[1] - a[1])
      .map(([rec]) => rec)
  }, [meta.disposal_recommendations])

  // --- Filter + Search ---
  const filteredAssets = useMemo(() => {
    let result = assets

    if (searchTerm) {
      const q = searchTerm.toLowerCase()
      result = result.filter(a =>
        (a.name || '').toLowerCase().includes(q) ||
        (a.address || '').toLowerCase().includes(q) ||
        (a.postcode || '').toLowerCase().includes(q) ||
        (a.ced || '').toLowerCase().includes(q) ||
        (a.district || '').toLowerCase().includes(q)
      )
    }

    if (filterCategory) {
      result = result.filter(a => a.category === filterCategory)
    }

    if (filterDistrict) {
      result = result.filter(a => a.district === filterDistrict)
    }

    if (filterOwnership) {
      if (filterOwnership === 'Other') {
        result = result.filter(a => a.ownership !== 'Freehold' && a.ownership !== 'Leasehold')
      } else {
        result = result.filter(a => a.ownership === filterOwnership)
      }
    }

    if (filterDisposal) {
      result = result.filter(a => {
        const p = a.disposal?.priority
        if (p == null) return filterDisposal === 'none'
        if (filterDisposal === 'high') return p >= 80
        if (filterDisposal === 'medium') return p >= 50 && p < 80
        if (filterDisposal === 'low') return p < 50
        return false
      })
    }

    if (filterCED) {
      result = result.filter(a => a.ced === filterCED)
    }

    if (filterRecommendation) {
      result = result.filter(a => a.disposal?.recommendation === filterRecommendation)
    }

    return result
  }, [assets, searchTerm, filterCategory, filterDistrict, filterOwnership, filterDisposal, filterCED, filterRecommendation])

  // --- Sort ---
  const sortedAssets = useMemo(() => {
    const sorted = [...filteredAssets]
    sorted.sort((a, b) => {
      let aVal, bVal
      switch (sortField) {
        case 'name':
          aVal = (a.name || '').toLowerCase()
          bVal = (b.name || '').toLowerCase()
          break
        case 'category':
          aVal = a.category || ''
          bVal = b.category || ''
          break
        case 'district':
          aVal = a.district || ''
          bVal = b.district || ''
          break
        case 'ced':
          aVal = a.ced || ''
          bVal = b.ced || ''
          break
        case 'epc':
          aVal = a.epc_rating || 'Z'
          bVal = b.epc_rating || 'Z'
          break
        case 'sell_score':
          aVal = a.sell_score ?? -1
          bVal = b.sell_score ?? -1
          break
        case 'disposal':
          aVal = a.disposal?.priority ?? -1
          bVal = b.disposal?.priority ?? -1
          break
        case 'disposal_band': {
          const bandOrder = { high: 3, medium: 2, low: 1 }
          aVal = bandOrder[a.disposal_band] || 0
          bVal = bandOrder[b.disposal_band] || 0
          break
        }
        default:
          aVal = a.name || ''
          bVal = b.name || ''
      }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return sorted
  }, [filteredAssets, sortField, sortDir])

  // --- Pagination ---
  const totalPages = Math.max(1, Math.ceil(sortedAssets.length / PAGE_SIZE))
  const safePageNum = Math.min(page, totalPages)
  const pageAssets = sortedAssets.slice((safePageNum - 1) * PAGE_SIZE, safePageNum * PAGE_SIZE)

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1)
  }, [searchTerm, filterCategory, filterDistrict, filterOwnership, filterDisposal, filterCED, filterRecommendation])

  // --- Sort handler ---
  const handleSort = useCallback((field) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
    setPage(1)
  }, [sortField])

  // --- CSV Export ---
  const exportCSV = useCallback(() => {
    const headers = ['Name', 'Address', 'Postcode', 'District', 'CED', 'Constituency', 'Category', 'Ownership', 'Land Only', 'Active', 'Lat', 'Lng', 'EPC', 'Floor Area (sqm)', 'Sell Score', 'Keep Score', 'Colocate Score', 'Primary Option', 'Disposal Recommendation', 'Disposal Category', 'Disposal Priority', 'Disposal Confidence', 'Disposal Band', 'Repurpose Band', 'Service Band', 'Net Zero Band', 'Resilience Band', 'Sales Signal Score', 'Sales Total Value', 'Innovative Use', 'Linked Spend', 'Linked Txns', 'Condition Spend', 'Nearby 500m', 'Nearby 1000m', 'Flood Areas 1km', 'Crime Total']
    const rows = sortedAssets.map(a => [
      `"${(a.name || '').replace(/"/g, '""')}"`,
      `"${(a.address || '').replace(/"/g, '""')}"`,
      a.postcode || '',
      a.district || '',
      a.ced || '',
      a.constituency || '',
      a.category || '',
      a.ownership || '',
      a.land_only ? 'Yes' : 'No',
      a.active ? 'Yes' : 'No',
      a.lat ?? '',
      a.lng ?? '',
      a.epc_rating || '',
      a.floor_area_sqm ?? '',
      a.sell_score ?? '',
      a.keep_score ?? '',
      a.colocate_score ?? '',
      a.primary_option || '',
      `"${(a.disposal?.recommendation || '').replace(/"/g, '""')}"`,
      `"${(a.disposal?.category || '').replace(/"/g, '""')}"`,
      a.disposal?.priority ?? '',
      a.disposal?.confidence || '',
      a.disposal_band || '',
      a.repurpose_band || '',
      a.service_band || '',
      a.net_zero_band || '',
      a.resilience_band || '',
      a.sales_signal_score ?? '',
      a.sales_total_value ?? 0,
      `"${(a.innovative_use || '').replace(/"/g, '""')}"`,
      a.linked_spend ?? 0,
      a.linked_txns ?? 0,
      a.condition_spend ?? 0,
      a.nearby_500m ?? 0,
      a.nearby_1000m ?? 0,
      a.flood_areas_1km ?? 0,
      a.crime_total ?? 0,
    ].join(','))

    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `property_assets_${config.council_id || 'council'}_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }, [sortedAssets, config.council_id])

  // --- Clear filters ---
  const clearFilters = useCallback(() => {
    setSearchTerm('')
    setFilterCategory('')
    setFilterDistrict('')
    setFilterOwnership('')
    setFilterDisposal('')
    setFilterCED('')
    setFilterRecommendation('')
    setPage(1)
  }, [])

  const hasActiveFilters = searchTerm || filterCategory || filterDistrict || filterOwnership || filterDisposal || filterCED || filterRecommendation

  // --- Access gate ---
  if (!hasAccess) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center' }}>
        <Lock size={48} style={{ color: '#ff453a', marginBottom: '16px' }} />
        <h2 style={{ color: '#fff', marginBottom: '8px' }}>Access Restricted</h2>
        <p style={{ color: 'var(--text-secondary, #aaa)' }}>
          You need strategist access to view the Property Estate.
        </p>
      </div>
    )
  }

  if (loading) return <LoadingState />
  if (error) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <p style={{ color: '#ff453a' }}>Failed to load property data.</p>
      </div>
    )
  }
  if (!data || !assets.length) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <Building size={48} style={{ color: '#8e8e93', marginBottom: '16px' }} />
        <h2 style={{ color: '#fff' }}>No Property Data</h2>
        <p style={{ color: 'var(--text-secondary, #aaa)' }}>
          Property asset data is not yet available for {councilName}.
        </p>
      </div>
    )
  }

  const freeholdPct = meta.total_assets ? ((meta.freehold || 0) / meta.total_assets * 100).toFixed(1) : '0'
  const landOnlyPct = meta.total_assets ? ((meta.land_only || 0) / meta.total_assets * 100).toFixed(1) : '0'
  const cedCount = meta.ced_summary ? Object.keys(meta.ced_summary).length : 0

  const selectStyle = {
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.05)',
    color: '#fff',
    fontSize: '0.8rem',
    minWidth: '140px',
    outline: 'none',
  }

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
          <Building size={28} style={{ color: '#0a84ff' }} />
          <h1 style={{ margin: 0, fontSize: '1.8rem', color: '#fff' }}>Property Estate</h1>
        </div>
        <p style={{ color: 'var(--text-secondary, #aaa)', margin: '4px 0 0 40px', fontSize: '0.9rem' }}>
          {formatNumber(meta.total_assets)} council-owned assets across {councilName}
        </p>
      </div>

      {/* Stats Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '12px',
        marginBottom: '24px',
      }}>
        <StatCard label="Total Assets" value={formatNumber(meta.total_assets)} subtitle={meta.owned_assets ? `${formatNumber(meta.owned_assets)} owned` : undefined} icon={Building} />
        <StatCard label="Freehold" value={`${freeholdPct}%`} subtitle={`${formatNumber(meta.freehold)} assets`} icon={Landmark} />
        <StatCard label="Land Only" value={`${landOnlyPct}%`} subtitle={`${formatNumber(meta.land_only)} parcels`} icon={TreePine} />
        <StatCard label="Disposal Candidates" value={formatNumber(meta.disposal_candidates)} icon={Home} />
        <StatCard label="Assessed" value={formatNumber(meta.has_assessment || 0)} subtitle={meta.has_sales_evidence ? `${meta.has_sales_evidence} with market evidence` : undefined} icon={Info} />
        <StatCard label="CEDs Mapped" value={formatNumber(meta.has_ced)} subtitle={`${cedCount} divisions`} icon={MapPin} />
      </div>

      {/* Estate Context */}
      {meta.estate_context && (
        <div className="glass-card" style={{ padding: '20px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <Info size={18} style={{ color: '#0a84ff' }} />
            <h3 style={{ color: '#fff', margin: 0, fontSize: '1rem' }}>Estate Context</h3>
            <span style={{
              fontSize: '0.7rem',
              padding: '2px 8px',
              borderRadius: '4px',
              background: 'rgba(10,132,255,0.15)',
              color: '#0a84ff',
              fontWeight: 600,
            }}>
              {meta.estate_context?.register_coverage_pct ?? 0}% of full estate
            </span>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px',
          }}>
            {[
              { label: 'Portfolio Value', value: meta.estate_context?.portfolio_value || '-' },
              { label: 'Full Estate Size', value: `~${formatNumber(meta.estate_context?.strategy_total_assets || 0)} assets` },
              { label: 'Register Coverage', value: `${formatNumber(meta.total_assets || 0)} of ~${formatNumber(meta.estate_context?.strategy_total_assets || 0)}` },
              { label: 'Running Cost', value: meta.estate_context?.running_cost_annual || '-' },
              { label: 'Condition Backlog', value: meta.estate_context?.condition_backlog || '-' },
              { label: 'Disposals Since 2016', value: `${formatNumber(meta.estate_context?.disposals_since_2016 || 0)} (${meta.estate_context?.disposals_value_since_2016 || '-'})` },
              { label: 'Carbon Emissions', value: `${formatNumber(meta.estate_context?.carbon_tonnes_co2 || 0)} tCO2` },
              { label: 'Gross Internal Area', value: `${formatNumber(meta.estate_context?.gia_sqm || 0)} sqm` },
            ].map(item => (
              <div key={item.label} style={{
                padding: '10px 14px',
                borderRadius: '8px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary, #aaa)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {item.label}
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#fff' }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
          {meta.estate_context?.sources && (
            <div style={{ marginTop: '10px', fontSize: '0.7rem', color: 'var(--text-tertiary, #666)' }}>
              Sources: {meta.estate_context.sources.join(' | ')}
            </div>
          )}
        </div>
      )}

      {/* Disposal Recommendations */}
      {meta.disposal_recommendations && (
        <div className="glass-card" style={{ padding: '20px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <Lightbulb size={18} style={{ color: '#ff9f0a' }} />
            <h3 style={{ color: '#fff', margin: 0, fontSize: '1rem' }}>Disposal Recommendations</h3>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '8px',
          }}>
            {Object.entries(meta.disposal_recommendations)
              .sort((a, b) => b[1] - a[1])
              .map(([rec, count]) => {
                const isDispose = rec.toLowerCase().startsWith('dispose')
                const isRetain = rec.toLowerCase().startsWith('retain')
                const isRepurpose = rec.toLowerCase().startsWith('repurpose')
                const isGovernance = rec.toLowerCase().startsWith('governance')
                let dotColor = '#9E9E9E'
                if (isDispose) dotColor = '#ff453a'
                else if (isRetain) dotColor = '#30d158'
                else if (isRepurpose) dotColor = '#ff9f0a'
                else if (isGovernance) dotColor = '#0a84ff'
                const isActive = filterRecommendation === rec
                return (
                  <div
                    key={rec}
                    onClick={() => {
                      setFilterRecommendation(isActive ? '' : rec)
                      setViewMode('table')
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      background: isActive ? 'rgba(10,132,255,0.15)' : 'rgba(255,255,255,0.03)',
                      cursor: 'pointer',
                      transition: 'background 0.15s',
                      border: isActive ? '1px solid rgba(10,132,255,0.3)' : '1px solid transparent',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        background: dotColor,
                        flexShrink: 0,
                      }} />
                      <span style={{ fontSize: '0.8rem', color: '#ccc' }}>{rec}</span>
                    </span>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#fff', marginLeft: '8px' }}>
                      {formatNumber(count)}
                    </span>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="glass-card" style={{ padding: '16px 20px', marginBottom: '16px' }}>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '10px',
          alignItems: 'center',
        }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: '1 1 200px', minWidth: '180px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#8e8e93' }} />
            <input
              type="text"
              placeholder="Search assets..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{
                ...selectStyle,
                width: '100%',
                paddingLeft: '32px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Category */}
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={selectStyle}>
            <option value="">All Categories</option>
            {categoryOptions.map(c => (
              <option key={c} value={c}>{CATEGORY_LABELS[c] || c.replace(/_/g, ' ')}</option>
            ))}
          </select>

          {/* District */}
          <select value={filterDistrict} onChange={e => setFilterDistrict(e.target.value)} style={selectStyle}>
            <option value="">All Districts</option>
            {districtOptions.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          {/* Ownership */}
          <select value={filterOwnership} onChange={e => setFilterOwnership(e.target.value)} style={selectStyle}>
            <option value="">All Ownership</option>
            <option value="Freehold">Freehold</option>
            <option value="Leasehold">Leasehold</option>
            <option value="Other">Other</option>
          </select>

          {/* Disposal Priority */}
          <select value={filterDisposal} onChange={e => setFilterDisposal(e.target.value)} style={selectStyle}>
            <option value="">All Priorities</option>
            <option value="high">High (80+)</option>
            <option value="medium">Medium (50-79)</option>
            <option value="low">Low (&lt;50)</option>
            <option value="none">No Disposal</option>
          </select>

          {/* CED */}
          <select value={filterCED} onChange={e => setFilterCED(e.target.value)} style={selectStyle}>
            <option value="">All CEDs</option>
            {cedOptions.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* Disposal Recommendation */}
          {recommendationOptions.length > 0 && (
            <select value={filterRecommendation} onChange={e => setFilterRecommendation(e.target.value)} style={{ ...selectStyle, minWidth: '160px' }}>
              <option value="">All Recommendations</option>
              {recommendationOptions.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          )}

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(255,69,58,0.3)',
                background: 'rgba(255,69,58,0.1)',
                color: '#ff453a',
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* View Toggle + Result Count + Export */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
        flexWrap: 'wrap',
        gap: '8px',
      }}>
        <div style={{ color: 'var(--text-secondary, #aaa)', fontSize: '0.85rem' }}>
          {formatNumber(filteredAssets.length)} asset{filteredAssets.length !== 1 ? 's' : ''} found
          {hasActiveFilters && ` (filtered from ${formatNumber(assets.length)})`}
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{
            display: 'flex',
            borderRadius: '8px',
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.1)',
          }}>
            <button
              onClick={() => setViewMode('table')}
              style={{
                padding: '6px 14px',
                border: 'none',
                background: viewMode === 'table' ? 'rgba(10,132,255,0.3)' : 'rgba(255,255,255,0.05)',
                color: viewMode === 'table' ? '#0a84ff' : '#aaa',
                fontSize: '0.8rem',
                cursor: 'pointer',
                fontWeight: viewMode === 'table' ? 600 : 400,
              }}
            >
              Table
            </button>
            <button
              onClick={() => setViewMode('map')}
              style={{
                padding: '6px 14px',
                border: 'none',
                borderLeft: '1px solid rgba(255,255,255,0.1)',
                background: viewMode === 'map' ? 'rgba(10,132,255,0.3)' : 'rgba(255,255,255,0.05)',
                color: viewMode === 'map' ? '#0a84ff' : '#aaa',
                fontSize: '0.8rem',
                cursor: 'pointer',
                fontWeight: viewMode === 'map' ? 600 : 400,
              }}
            >
              Map
            </button>
          </div>

          <button
            onClick={exportCSV}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.05)',
              color: '#0a84ff',
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <SortHeader label="Name" field="name" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Category" field="category" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader label="District" field="district" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader label="CED" field="ced" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader label="EPC" field="epc" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Sell Score" field="sell_score" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Disposal" field="disposal" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Assessment" field="disposal_band" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <th style={{
                    padding: '10px 12px',
                    textAlign: 'left',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary, #aaa)',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    whiteSpace: 'nowrap',
                    minWidth: '180px',
                  }}>
                    Innovative Use
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageAssets.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: '#8e8e93' }}>
                      No assets match your filters.
                    </td>
                  </tr>
                )}
                {pageAssets.map((asset) => (
                  <tr
                    key={asset.id}
                    onClick={() => navigate(`/property/${asset.id}`)}
                    style={{
                      cursor: 'pointer',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <td style={{ padding: '10px 12px', fontSize: '0.85rem', color: '#fff', maxWidth: '300px' }}>
                      <div style={{ fontWeight: 500 }}>{asset.name || 'Unnamed Asset'}</div>
                      {asset.postcode && (
                        <div style={{ fontSize: '0.7rem', color: '#8e8e93', marginTop: '2px' }}>{asset.postcode}</div>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <CategoryBadge category={asset.category} />
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '0.85rem', color: 'var(--text-secondary, #aaa)' }}>
                      {asset.district || '-'}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '0.85rem', color: 'var(--text-secondary, #aaa)', maxWidth: '180px' }}>
                      {asset.ced || '-'}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '0.85rem', color: 'var(--text-secondary, #aaa)', textAlign: 'center' }}>
                      {asset.epc_rating || '-'}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '0.85rem', color: '#fff', textAlign: 'center', fontWeight: 600 }}>
                      {asset.sell_score ?? '-'}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <DisposalBadge priority={asset.disposal?.priority} />
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <BandBadge band={asset.disposal_band} />
                    </td>
                    <td style={{
                      padding: '10px 12px',
                      fontSize: '0.75rem',
                      color: 'var(--text-secondary, #aaa)',
                      maxWidth: '220px',
                    }}>
                      {asset.innovative_use || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '16px',
              padding: '16px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
            }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={safePageNum <= 1}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: safePageNum <= 1 ? 'transparent' : 'rgba(255,255,255,0.05)',
                  color: safePageNum <= 1 ? '#555' : '#aaa',
                  fontSize: '0.8rem',
                  cursor: safePageNum <= 1 ? 'not-allowed' : 'pointer',
                }}
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <span style={{ color: '#aaa', fontSize: '0.8rem' }}>
                Page {safePageNum} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={safePageNum >= totalPages}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: safePageNum >= totalPages ? 'transparent' : 'rgba(255,255,255,0.05)',
                  color: safePageNum >= totalPages ? '#555' : '#aaa',
                  fontSize: '0.8rem',
                  cursor: safePageNum >= totalPages ? 'not-allowed' : 'pointer',
                }}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Map View Placeholder */}
      {viewMode === 'map' && (
        <div className="glass-card" style={{ padding: '60px 20px', textAlign: 'center' }}>
          <MapPin size={48} style={{ color: '#8e8e93', marginBottom: '16px' }} />
          <h3 style={{ color: '#fff', marginBottom: '8px' }}>Map View</h3>
          <p style={{ color: 'var(--text-secondary, #aaa)', maxWidth: '400px', margin: '0 auto' }}>
            Interactive property map coming in Phase 4.
            {filteredAssets.filter(a => a.lat && a.lng).length > 0 && (
              <span> {formatNumber(filteredAssets.filter(a => a.lat && a.lng).length)} assets have coordinates.</span>
            )}
          </p>
        </div>
      )}

      {/* Category Breakdown */}
      {meta.category_breakdown && (
        <div className="glass-card" style={{ padding: '20px', marginTop: '16px' }}>
          <h3 style={{ color: '#fff', margin: '0 0 12px', fontSize: '1rem' }}>Category Breakdown</h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '8px',
          }}>
            {Object.entries(meta.category_breakdown)
              .sort((a, b) => b[1] - a[1])
              .map(([cat, count]) => (
                <div
                  key={cat}
                  onClick={() => { setFilterCategory(cat); setViewMode('table') }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: filterCategory === cat ? 'rgba(10,132,255,0.15)' : 'rgba(255,255,255,0.03)',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                    border: filterCategory === cat ? '1px solid rgba(10,132,255,0.3)' : '1px solid transparent',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '2px',
                      background: CATEGORY_COLORS[cat] || '#9E9E9E',
                      flexShrink: 0,
                    }} />
                    <span style={{ fontSize: '0.8rem', color: '#ccc' }}>
                      {CATEGORY_LABELS[cat] || cat.replace(/_/g, ' ')}
                    </span>
                  </span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#fff' }}>
                    {formatNumber(count)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
