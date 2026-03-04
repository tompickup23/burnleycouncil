import { useState, useMemo, useEffect, useCallback, lazy, Suspense } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Building, Download, Search, ChevronLeft, ChevronRight, ArrowUpDown, Lock, MapPin, Landmark, TreePine, Home, Info, Lightbulb, TrendingUp, Clock, DollarSign, PoundSterling, Gavel, BarChart3, Calendar } from 'lucide-react'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { useAuth } from '../context/AuthContext'
import { isFirebaseEnabled } from '../firebase'
import { LoadingState } from '../components/ui'
import { formatNumber, formatCurrency } from '../utils/format'
import { isQuickWin } from '../utils/strategyEngine'

const WardMap = lazy(() => import('../components/WardMap'))

const PAGE_SIZE = 50

// District name → council_id mapping (LCC CEDs span all 14 districts)
const DISTRICT_TO_COUNCIL = {
  'Blackpool': 'blackpool', 'Burnley': 'burnley', 'Chorley': 'chorley',
  'Fylde': 'fylde', 'Hyndburn': 'hyndburn', 'Lancaster': 'lancaster',
  'Pendle': 'pendle', 'Preston': 'preston', 'Ribble Valley': 'ribble_valley',
  'Rossendale': 'rossendale', 'South Ribble': 'south_ribble',
  'West Lancashire': 'west_lancashire', 'Wyre': 'wyre',
}

const DISTRICT_COLORS = {
  'Blackpool': '#ff453a', 'Burnley': '#ff9f0a', 'Chorley': '#30d158',
  'Fylde': '#0a84ff', 'Hyndburn': '#bf5af2', 'Lancaster': '#64d2ff',
  'Pendle': '#ffd60a', 'Preston': '#5e5ce6', 'Ribble Valley': '#ff6482',
  'Rossendale': '#ac8e68', 'South Ribble': '#34c759',
  'West Lancashire': '#ff375f', 'Wyre': '#00c7be',
}

const LGR_AUTH_COLORS = ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#ff453a', '#64d2ff', '#ffd60a', '#ff6482']

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

const EPC_COLORS = { A: '#00c853', B: '#30d158', C: '#ffd60a', D: '#ff9f0a', E: '#ff6d3b', F: '#ff453a', G: '#b71c1c' }
const BAND_COLORS = { high: '#ff453a', medium: '#ff9f0a', low: '#30d158' }
const PATHWAY_MAP_COLORS = {
  quick_win_auction: '#00c853', private_treaty_sale: '#30d158',
  development_partnership: '#0a84ff', community_asset_transfer: '#bf5af2',
  long_lease_income: '#ff9f0a', meanwhile_use: '#64d2ff',
  energy_generation: '#ffd60a', carbon_offset_woodland: '#34c759',
  housing_partnership: '#ff6d3b', co_locate_consolidate: '#5e5ce6',
  strategic_hold: '#8e8e93', governance_review: '#636366',
  refurbish_relet: '#ac8e68',
}
const OCCUPANCY_MAP_COLORS = {
  occupied: '#0a84ff', school_grounds: '#5e5ce6', likely_vacant: '#ff9f0a',
  vacant_land: '#30d158', third_party: '#bf5af2', unknown: '#8e8e93',
}
const HERITAGE_COLORS = { 'I': '#c41e3a', 'II*': '#e8662e', 'II': '#ffa500', none: '#8e8e93' }
const HERITAGE_LABELS = { 'I': 'Grade I Listed', 'II*': 'Grade II* Listed', 'II': 'Grade II Listed', none: 'No Listing' }
const CONSTRAINT_COLORS = { sssi: '#2d5016', aonb: '#70ad47', flood3: '#002060', flood2: '#4472c4', none: '#8e8e93' }
const CONSTRAINT_LABELS = { sssi: 'SSSI', aonb: 'AONB / National Landscape', flood3: 'Flood Zone 3', flood2: 'Flood Zone 2', none: 'No Constraint' }

const PATHWAY_LABELS = {
  quick_win_auction: 'Quick Win — Auction',
  private_treaty_sale: 'Private Treaty Sale',
  development_partnership: 'Development Partnership',
  community_asset_transfer: 'Community Asset Transfer',
  long_lease_income: 'Long Lease Income',
  meanwhile_use: 'Meanwhile Use',
  energy_generation: 'Energy Generation',
  carbon_offset_woodland: 'Carbon Offset Woodland',
  housing_partnership: 'Housing Partnership',
  co_locate_consolidate: 'Co-locate & Consolidate',
  strategic_hold: 'Strategic Hold',
  governance_review: 'Governance Review',
  refurbish_relet: 'Refurbish & Re-let',
}

const PATHWAY_TIMELINES = {
  quick_win_auction: { months: 6, label: '3-6 months', type: 'capital' },
  private_treaty_sale: { months: 9, label: '6-12 months', type: 'capital' },
  development_partnership: { months: 24, label: '12-24 months', type: 'capital' },
  community_asset_transfer: { months: 12, label: '6-12 months', type: 'transfer' },
  long_lease_income: { months: 6, label: '3-6 months', type: 'income' },
  meanwhile_use: { months: 3, label: '1-3 months', type: 'income' },
  energy_generation: { months: 18, label: '12-24 months', type: 'income' },
  carbon_offset_woodland: { months: 24, label: '24+ months', type: 'income' },
  housing_partnership: { months: 24, label: '12-24 months', type: 'capital' },
  co_locate_consolidate: { months: 18, label: '12-24 months', type: 'savings' },
  strategic_hold: { months: 0, label: 'Ongoing', type: 'hold' },
  governance_review: { months: 6, label: '3-6 months', type: 'review' },
  refurbish_relet: { months: 12, label: '6-12 months', type: 'income' },
}

const OCCUPANCY_LABELS = {
  occupied: 'Operationally Active',
  school_grounds: 'School Grounds',
  likely_vacant: 'Likely Vacant',
  vacant_land: 'Vacant Land',
  third_party: 'Third-Party Occupied',
  unknown: 'Unknown',
}

// Historic auction records from Barnard Marcus (LCC disposals 2025-2026)
const SALES_HISTORY = [
  { date: '2025-04-15', status: 'Sold', price: 6000, title: 'Land at London Road, Preston', method: 'Auction' },
  { date: '2025-04-15', status: 'Unsold', price: 500000, title: '155 St Andrews Road, Preston', method: 'Auction' },
  { date: '2025-04-15', status: 'Unsold', price: 550000, title: 'Willow Lane Residential Home, Lancaster', method: 'Auction' },
  { date: '2025-05-20', status: 'Unsold', price: 550000, title: 'Willow Lane Residential Home, Lancaster', method: 'Auction' },
  { date: '2025-06-24', status: 'Sold', price: 650000, title: 'Former Mansfield School, Brierfield', method: 'Auction' },
  { date: '2025-06-24', status: 'Sold', price: 300000, title: '44 Union Street, Accrington', method: 'Auction' },
  { date: '2025-06-24', status: 'Unsold', price: 450000, title: 'Willow Lane Residential Home, Lancaster', method: 'Auction' },
  { date: '2025-09-09', status: 'Sold', price: 5000, title: 'Land Adjacent to Morecambe Road', method: 'Auction' },
  { date: '2025-09-09', status: 'Sold', price: 5000, title: 'Land at Pleasant Retreat, Lancaster', method: 'Auction' },
  { date: '2025-11-18', status: 'Sold', price: 2000, title: 'Land at Colne Road, Trawden', method: 'Auction' },
  { date: '2025-11-18', status: 'Sold', price: 9500, title: 'Site at Burnley Road, Colne', method: 'Auction' },
  { date: '2025-11-18', status: 'Sold', price: 116000, title: 'Former Council Building, Thornton-Cleveleys', method: 'Auction' },
  { date: '2026-02-03', status: 'Unsold', price: 40000, title: 'Land at Hole House Farm, Clayton-le-Woods', method: 'Auction' },
  { date: '2026-02-03', status: 'Sold', price: 30000, title: 'Land at Lea Gate, Preston', method: 'Auction' },
  { date: '2026-02-03', status: 'Withdrawn', price: 70000, title: 'Former Council Building, Longridge', method: 'Auction' },
]
const CURRENT_LISTINGS = [
  { date: '2026-03-10', status: 'Listed', price: 300000, title: 'Willow Lane Residential Home, Lancaster' },
  { date: '2026-03-10', status: 'Listed', price: 38000, title: 'Hole House Farm Woodlands, Clayton-le-Woods' },
  { date: '2026-03-10', status: 'Listed', price: 3000, title: 'Land off Whalley Road, Wilpshire' },
  { date: '2026-03-10', status: 'Listed', price: 40000, title: 'Horncliffe Quarry Woodland, Rawtenstall' },
  { date: '2026-03-10', status: 'Listed', price: 25000, title: 'Land at Todmorden Road, Bacup' },
  { date: 'Spring 2026', status: 'Coming Soon', price: null, title: 'Winewall Mill Woodland, Trawden' },
]

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
  const [searchParams, setSearchParams] = useSearchParams()
  const councilName = config.council_name || 'Council'

  const { data, loading, error } = useData('/data/property_assets.json')
  const { data: boundariesData } = useData('/data/ward_boundaries.json')
  const { data: lgrTrackerData } = useData('/data/shared/lgr_tracker.json')

  // --- Page title ---
  useEffect(() => {
    document.title = `Property Estate | ${councilName} Transparency`
    return () => { document.title = `${councilName} Transparency` }
  }, [councilName])

  // --- Strategist gate ---
  const hasAccess = auth?.isStrategist || !isFirebaseEnabled

  // --- State (initialised from URL params for shareable links) ---
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('search') || '')
  const [filterCategory, setFilterCategory] = useState(() => searchParams.get('cat') || '')
  const [filterDistrict, setFilterDistrict] = useState(() => searchParams.get('district') || '')
  const [filterOwnership, setFilterOwnership] = useState(() => searchParams.get('ownership') || '')
  const [filterTier, setFilterTier] = useState(() => searchParams.get('tier') || '')
  const [filterDisposal, setFilterDisposal] = useState(() => searchParams.get('disposal') || '')
  const [filterCED, setFilterCED] = useState(() => searchParams.get('ced') || '')
  const [filterRecommendation, setFilterRecommendation] = useState(() => searchParams.get('rec') || '')
  const [filterOccupancy, setFilterOccupancy] = useState(() => searchParams.get('occ') || '')
  const [filterPathway, setFilterPathway] = useState(() => searchParams.get('pw') || '')
  const [filterServiceStatus, setFilterServiceStatus] = useState(() => searchParams.get('svc') || '')
  const [quickWinsOnly, setQuickWinsOnly] = useState(() => searchParams.get('qw') === '1')
  const [sellableOnly, setSellableOnly] = useState(() => searchParams.get('sell') === '1')
  const [sortField, setSortField] = useState(() => searchParams.get('sort') || 'name')
  const [sortDir, setSortDir] = useState(() => searchParams.get('dir') || 'asc')
  const [page, setPage] = useState(() => parseInt(searchParams.get('page'), 10) || 1)
  const [viewMode, setViewMode] = useState(() => searchParams.get('view') || 'table')
  const [mapOverlay, setMapOverlay] = useState(() => searchParams.get('overlay') || 'category')
  const [lgrModel, setLgrModel] = useState(() => searchParams.get('lgrModel') || 'two_unitary')
  const [hiddenDistricts, setHiddenDistricts] = useState(() => new Set())

  // --- Sync state → URL params (replace, not push — avoids back-button clutter) ---
  useEffect(() => {
    const params = {}
    if (searchTerm) params.search = searchTerm
    if (filterCategory) params.cat = filterCategory
    if (filterDistrict) params.district = filterDistrict
    if (filterOwnership) params.ownership = filterOwnership
    if (filterTier) params.tier = filterTier
    if (filterDisposal) params.disposal = filterDisposal
    if (filterCED) params.ced = filterCED
    if (filterRecommendation) params.rec = filterRecommendation
    if (filterOccupancy) params.occ = filterOccupancy
    if (filterPathway) params.pw = filterPathway
    if (filterServiceStatus) params.svc = filterServiceStatus
    if (quickWinsOnly) params.qw = '1'
    if (sellableOnly) params.sell = '1'
    if (sortField && sortField !== 'name') params.sort = sortField
    if (sortDir && sortDir !== 'asc') params.dir = sortDir
    if (page > 1) params.page = String(page)
    if (viewMode !== 'table') params.view = viewMode
    if (mapOverlay !== 'category') params.overlay = mapOverlay
    if (lgrModel !== 'two_unitary' && mapOverlay === 'lgr_authority') params.lgrModel = lgrModel
    setSearchParams(params, { replace: true })
  }, [searchTerm, filterCategory, filterDistrict, filterOwnership, filterTier, filterDisposal, filterCED, filterRecommendation, filterOccupancy, filterPathway, filterServiceStatus, quickWinsOnly, sellableOnly, sortField, sortDir, page, viewMode, mapOverlay, lgrModel, setSearchParams])

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

  const pathwayOptions = useMemo(() => {
    if (!meta.pathway_breakdown) return []
    return Object.entries(meta.pathway_breakdown)
      .sort((a, b) => b[1] - a[1])
      .map(([pw]) => pw)
  }, [meta.pathway_breakdown])

  const occupancyOptions = useMemo(() => {
    if (!meta.occupancy_breakdown) return []
    return Object.entries(meta.occupancy_breakdown)
      .sort((a, b) => b[1] - a[1])
      .map(([occ]) => occ)
  }, [meta.occupancy_breakdown])

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

    if (filterTier) {
      result = result.filter(a => (a.tier || 'county') === filterTier)
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

    if (filterOccupancy) {
      result = result.filter(a => a.occupancy_status === filterOccupancy)
    }

    if (filterPathway) {
      result = result.filter(a => a.disposal_pathway === filterPathway)
    }

    if (filterServiceStatus) {
      result = result.filter(a => a.service_status === filterServiceStatus)
    }

    if (quickWinsOnly) {
      result = result.filter(isQuickWin)
    }

    if (sellableOnly) {
      result = result.filter(a => a.sellable_by_lcc === true)
    }

    return result
  }, [assets, searchTerm, filterCategory, filterDistrict, filterOwnership, filterTier, filterDisposal, filterCED, filterRecommendation, filterOccupancy, filterPathway, filterServiceStatus, quickWinsOnly, sellableOnly])

  // --- Map assets (geocoded + overlay colour) ---
  const mapAssets = useMemo(() => {
    return filteredAssets
      .filter(a => a.lat && a.lng)
      .map(a => {
        let markerColor
        switch (mapOverlay) {
          case 'disposal':
            markerColor = BAND_COLORS[a.disposal_band] || '#8e8e93'
            break
          case 'netzero':
            markerColor = BAND_COLORS[a.net_zero_band] || '#8e8e93'
            break
          case 'epc':
            markerColor = EPC_COLORS[a.epc_rating] || '#8e8e93'
            break
          case 'complexity': {
            const c = a.disposal_complexity || 0
            markerColor = c >= 60 ? '#ff453a' : c >= 30 ? '#ff9f0a' : '#30d158'
            break
          }
          case 'pathway':
            markerColor = PATHWAY_MAP_COLORS[a.disposal_pathway] || '#8e8e93'
            break
          case 'occupancy':
            markerColor = OCCUPANCY_MAP_COLORS[a.occupancy_status] || '#8e8e93'
            break
          case 'heritage':
            markerColor = a.listed_building_grade ? (HERITAGE_COLORS[a.listed_building_grade] || '#ffa500') : '#8e8e93'
            break
          case 'constraints':
            markerColor = a.sssi_nearby ? CONSTRAINT_COLORS.sssi
              : a.aonb_name ? CONSTRAINT_COLORS.aonb
              : a.flood_zone >= 3 ? CONSTRAINT_COLORS.flood3
              : a.flood_zone >= 2 ? CONSTRAINT_COLORS.flood2
              : '#8e8e93'
            break
          case 'ownership':
            markerColor = a.tier === 'subsidiary' ? '#ff9f0a'
              : a.tier === 'jv' ? '#bf5af2'
              : a.tier === 'third_party' ? '#ff453a'
              : '#0a84ff'  // county (direct LCC)
            break
          case 'sellability':
            markerColor = a.sellable_by_lcc === true ? '#30d158'
              : a.sellable_by_lcc === false ? '#ff453a'
              : '#8e8e93'
            break
          default:
            markerColor = CATEGORY_COLORS[a.category] || '#9E9E9E'
        }
        return {
          ...a,
          linkedSpend: a.linked_spend || 0,
          epcRating: a.epc_rating || '',
          markerColor,
        }
      })
  }, [filteredAssets, mapOverlay])

  // --- CED → district mapping (majority district per CED from asset data) ---
  const cedDistrictMap = useMemo(() => {
    const counts = {}
    assets.forEach(a => {
      if (!a.ced || !a.district) return
      if (!counts[a.ced]) counts[a.ced] = {}
      counts[a.ced][a.district] = (counts[a.ced][a.district] || 0) + 1
    })
    const map = {}
    Object.entries(counts).forEach(([ced, districts]) => {
      map[ced] = Object.entries(districts).sort((a, b) => b[1] - a[1])[0]?.[0]
    })
    return map
  }, [assets])

  // --- Per-CED stats for enhanced tooltips ---
  const cedStats = useMemo(() => {
    const stats = {}
    assets.forEach(a => {
      if (!a.ced) return
      if (!stats[a.ced]) stats[a.ced] = { assetCount: 0, totalSpend: 0, totalValue: 0, categories: {} }
      stats[a.ced].assetCount++
      stats[a.ced].totalSpend += (a.linked_supplier_spend_total || a.linked_spend || 0)
      stats[a.ced].totalValue += (a.rb_market_value || a.gb_market_value || 0)
      const cat = a.category || 'unknown'
      stats[a.ced].categories[cat] = (stats[a.ced].categories[cat] || 0) + 1
    })
    return stats
  }, [assets])

  // --- LGR authority mapping for current model ---
  const lgrModels = lgrTrackerData?.proposed_models || []
  const currentLgrModel = lgrModels.find(m => m.id === lgrModel)
  const lgrAuthorities = currentLgrModel?.authorities || []

  const lgrAuthorityMap = useMemo(() => {
    const map = {}
    lgrAuthorities.forEach((auth, idx) => {
      const councils = auth.councils || []
      councils.forEach(c => {
        map[c] = { authority: auth.name, color: LGR_AUTH_COLORS[idx % LGR_AUTH_COLORS.length], idx }
      })
    })
    return map
  }, [lgrAuthorities])

  // --- Ward overlay data for district/LGR modes ---
  const wardMapOverlayData = useMemo(() => {
    if (mapOverlay !== 'district' && mapOverlay !== 'lgr_authority') return {}
    if (!boundariesData?.features?.length) return {}

    const data = {}
    boundariesData.features.forEach(f => {
      const cedName = f.properties?.name
      if (!cedName) return
      const district = cedDistrictMap[cedName]
      const stats = cedStats[cedName]

      if (mapOverlay === 'district') {
        if (!district || hiddenDistricts.has(district)) return
        data[cedName] = {
          color: DISTRICT_COLORS[district] || '#8e8e93',
          classLabel: district,
          district,
          assetCount: stats?.assetCount || 0,
          totalSpend: stats?.totalSpend || 0,
        }
      } else if (mapOverlay === 'lgr_authority') {
        if (!district) return
        const councilId = DISTRICT_TO_COUNCIL[district]
        if (!councilId) return
        const authInfo = lgrAuthorityMap[councilId]
        if (!authInfo) return
        data[cedName] = {
          color: authInfo.color,
          classLabel: authInfo.authority,
          district,
          assetCount: stats?.assetCount || 0,
          totalSpend: stats?.totalSpend || 0,
        }
      }
    })
    return data
  }, [mapOverlay, boundariesData, cedDistrictMap, cedStats, hiddenDistricts, lgrAuthorityMap])

  // --- Wards to highlight (all CEDs) for boundary coloring modes ---
  const wardsUp = useMemo(() => {
    if (mapOverlay !== 'district' && mapOverlay !== 'lgr_authority') return []
    if (!boundariesData?.features?.length) return []
    return boundariesData.features.map(f => f.properties?.name).filter(Boolean)
  }, [mapOverlay, boundariesData])

  // --- Filter map assets by hidden districts ---
  const visibleMapAssets = useMemo(() => {
    if (mapOverlay !== 'district' || hiddenDistricts.size === 0) return mapAssets
    return mapAssets.filter(a => !hiddenDistricts.has(a.district))
  }, [mapAssets, mapOverlay, hiddenDistricts])

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

  // --- Disposals data (precomputed for the disposals view) ---
  const disposalsData = useMemo(() => {
    const ctx = meta.estate_context || {}
    const totalDisposals = ctx.disposals_since_2016 || 272
    const disposalValue = ctx.disposals_value_since_2016 || '£63.2 million'
    const communityTransfers = ctx.community_transfers_since_2016 || 10
    const yearsSince2016 = new Date().getFullYear() - 2016
    const avgPerYear = Math.round(totalDisposals / yearsSince2016)
    const gbTotal = assets.reduce((s, a) => s + (a.gb_market_value || 0), 0)
    const rbTotal = assets.reduce((s, a) => s + (a.rb_market_value || 0), 0)
    const quarterMap = {}
    for (const sale of SALES_HISTORY) {
      const d = new Date(sale.date)
      const q = `${d.getFullYear()} Q${Math.ceil((d.getMonth() + 1) / 3)}`
      if (!quarterMap[q]) quarterMap[q] = { sold: 0, unsold: 0, withdrawn: 0, soldValue: 0 }
      const key = sale.status.toLowerCase()
      if (key === 'sold') { quarterMap[q].sold++; quarterMap[q].soldValue += sale.price || 0 }
      else if (key === 'withdrawn') quarterMap[q].withdrawn++
      else quarterMap[q].unsold++
    }
    const quarters = Object.entries(quarterMap).sort((a, b) => a[0].localeCompare(b[0]))
    const pipeline = {}
    let pipelineCapital = 0
    let pipelineAnnual = 0
    for (const a of assets) {
      const pw = a.disposal_pathway
      if (!pw || pw === 'strategic_hold') continue
      if (!pipeline[pw]) pipeline[pw] = { count: 0, capital: 0, annual: 0 }
      pipeline[pw].count++
      pipeline[pw].capital += a.revenue_estimate_capital || 0
      pipeline[pw].annual += a.revenue_estimate_annual || 0
      pipelineCapital += a.revenue_estimate_capital || 0
      pipelineAnnual += a.revenue_estimate_annual || 0
    }
    const pipelineEntries = Object.entries(pipeline).sort((a, b) => b[1].count - a[1].count)
    const maxPipelineCount = Math.max(...pipelineEntries.map(([, v]) => v.count), 1)
    const soldCount = SALES_HISTORY.filter(s => s.status === 'Sold').length
    const soldValue = SALES_HISTORY.filter(s => s.status === 'Sold').reduce((s, r) => s + (r.price || 0), 0)
    const listedValue = CURRENT_LISTINGS.reduce((s, r) => s + (r.price || 0), 0)
    return { ctx, totalDisposals, disposalValue, communityTransfers, avgPerYear, gbTotal, rbTotal, quarters, pipelineEntries, maxPipelineCount, pipelineCapital, pipelineAnnual, soldCount, soldValue, listedValue }
  }, [meta, assets])

  // --- Pagination ---
  const totalPages = Math.max(1, Math.ceil(sortedAssets.length / PAGE_SIZE))
  const safePageNum = Math.min(page, totalPages)
  const pageAssets = sortedAssets.slice((safePageNum - 1) * PAGE_SIZE, safePageNum * PAGE_SIZE)

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1)
  }, [searchTerm, filterCategory, filterDistrict, filterOwnership, filterDisposal, filterCED, filterRecommendation, filterOccupancy, filterPathway, quickWinsOnly])

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
    const headers = ['Name', 'Address', 'Postcode', 'District', 'CED', 'Constituency', 'Category', 'Ownership', 'Land Only', 'Active', 'Lat', 'Lng', 'EPC', 'Floor Area (sqm)', 'Sell Score', 'Keep Score', 'Colocate Score', 'Primary Option', 'Disposal Pathway', 'Disposal Pathway (Secondary)', 'Occupancy Status', 'Disposal Complexity', 'Market Readiness', 'Revenue Potential', 'Smart Priority', 'Revenue Estimate Capital', 'Revenue Estimate Annual', 'GB Market Value', 'GB Preferred Option', 'GB Preferred NPV', 'GB Holding Cost/yr', 'GB Confidence', 'Disposal Band', 'Repurpose Band', 'Service Band', 'Net Zero Band', 'Resilience Band', 'Sales Signal Score', 'Sales Total Value', 'Innovative Use', 'Linked Spend', 'Linked Txns', 'Condition Spend', 'Nearby 500m', 'Nearby 1000m', 'Flood Areas 1km', 'Crime Total', 'Listed Building Grade', 'Flood Zone', 'SSSI Nearby', 'AONB', 'Deprivation Level', 'IMD Decile', 'RB Market Value', 'RB EUV', 'RB Basis', 'RB Confidence', 'RB Yield %', 'Owner Entity', 'Ownership Model', 'Ownership %', 'Tier']
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
      `"${(a.disposal_pathway || '').replace(/_/g, ' ')}"`,
      `"${(a.disposal_pathway_secondary || '').replace(/_/g, ' ')}"`,
      `"${(a.occupancy_status || '').replace(/_/g, ' ')}"`,
      a.disposal_complexity ?? '',
      a.market_readiness ?? '',
      a.revenue_potential ?? '',
      a.disposal?.smart_priority ?? '',
      a.revenue_estimate_capital ?? 0,
      a.revenue_estimate_annual ?? 0,
      a.gb_market_value ?? '',
      `"${(a.gb_preferred_option || '').replace(/_/g, ' ')}"`,
      a.gb_preferred_npv ?? '',
      a.gb_holding_cost ?? '',
      a.gb_confidence || '',
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
      a.listed_building_grade || '',
      a.flood_zone ?? '',
      a.sssi_nearby ? 'Yes' : 'No',
      `"${(a.aonb_name || '').replace(/"/g, '""')}"`,
      `"${(a.deprivation_level || '').replace(/_/g, ' ')}"`,
      a.imd_decile ?? '',
      a.rb_market_value ?? '',
      a.rb_euv ?? '',
      a.rb_valuation_basis || '',
      a.rb_confidence || '',
      a.rb_yield_pct ?? '',
      `"${(a.owner_entity || '').replace(/"/g, '""')}"`,
      a.ownership_model || '',
      a.ownership_pct ?? '',
      a.tier || '',
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
    setFilterTier('')
    setFilterRecommendation('')
    setFilterOccupancy('')
    setFilterPathway('')
    setFilterServiceStatus('')
    setQuickWinsOnly(false)
    setSellableOnly(false)
    setPage(1)
  }, [])

  const hasActiveFilters = searchTerm || filterCategory || filterDistrict || filterOwnership || filterTier || filterDisposal || filterCED || filterRecommendation || filterOccupancy || filterPathway || filterServiceStatus || quickWinsOnly || sellableOnly

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
        {meta.red_book?.total_market_value > 0 && (
          <StatCard label="Red Book MV" value={formatCurrency(meta.red_book.total_market_value)} subtitle="RICS Market Value" icon={TrendingUp} />
        )}
        {meta.ownership?.assets_by_tier && Object.keys(meta.ownership.assets_by_tier).length > 1 && (
          <StatCard label="Subsidiaries" value={formatNumber((meta.ownership.assets_by_tier.subsidiary || 0) + (meta.ownership.assets_by_tier.jv || 0))} subtitle={`${Object.keys(meta.ownership.assets_by_entity || {}).length} entities`} icon={Landmark} />
        )}
      </div>

      {/* Financial Summary Dashboard */}
      {(meta.estimated_capital_receipts > 0 || meta.estimated_annual_income > 0) && (
        <div className="glass-card" style={{ padding: '20px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <TrendingUp size={18} style={{ color: '#30d158' }} />
            <h3 style={{ color: '#fff', margin: 0, fontSize: '1rem' }}>Revenue Opportunity</h3>
            <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(48,209,88,0.12)', color: '#30d158', fontWeight: 600 }}>
              Estimated
            </span>
          </div>

          {/* Revenue headline cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(48,209,88,0.08)', border: '1px solid rgba(48,209,88,0.15)' }}>
              <div style={{ fontSize: '0.72rem', color: '#30d158', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                Capital Receipts
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#30d158' }}>
                {formatCurrency(meta.estimated_capital_receipts)}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #aaa)', marginTop: '4px' }}>
                From {assets.filter(a => (a.revenue_estimate_capital || 0) > 0).length} disposal assets
              </div>
            </div>
            <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(10,132,255,0.08)', border: '1px solid rgba(10,132,255,0.15)' }}>
              <div style={{ fontSize: '0.72rem', color: '#0a84ff', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                Annual Income
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#0a84ff' }}>
                {formatCurrency(meta.estimated_annual_income)}<span style={{ fontSize: '0.9rem', fontWeight: 400 }}>/yr</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #aaa)', marginTop: '4px' }}>
                From {assets.filter(a => (a.revenue_estimate_annual || 0) > 0).length} income-generating assets
              </div>
            </div>
            <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(255,159,10,0.08)', border: '1px solid rgba(255,159,10,0.15)' }}>
              <div style={{ fontSize: '0.72rem', color: '#ff9f0a', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                Quick Win Receipts
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#ff9f0a' }}>
                {formatCurrency(assets.filter(isQuickWin).reduce((s, a) => s + (a.revenue_estimate_capital || 0), 0))}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #aaa)', marginTop: '4px' }}>
                {meta.quick_wins || 0} quick-win assets within 6 months
              </div>
            </div>
          </div>

          {/* Revenue by pathway bar chart */}
          {meta.pathway_breakdown && (() => {
            const pathwayRevenue = {}
            for (const a of assets) {
              const pw = a.disposal_pathway
              if (!pw) continue
              if (!pathwayRevenue[pw]) pathwayRevenue[pw] = { capital: 0, annual: 0, count: 0 }
              pathwayRevenue[pw].capital += a.revenue_estimate_capital || 0
              pathwayRevenue[pw].annual += a.revenue_estimate_annual || 0
              pathwayRevenue[pw].count += 1
            }
            const entries = Object.entries(pathwayRevenue)
              .filter(([, v]) => v.capital > 0 || v.annual > 0)
              .sort((a, b) => (b[1].capital + b[1].annual * 10) - (a[1].capital + a[1].annual * 10))
            if (!entries.length) return null
            const maxVal = Math.max(...entries.map(([, v]) => Math.max(v.capital, v.annual * 10)))
            return (
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #aaa)', marginBottom: '8px', fontWeight: 600 }}>
                  Revenue by Disposal Pathway
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {entries.map(([pw, v]) => (
                    <div key={pw} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '160px', flexShrink: 0, fontSize: '0.72rem', color: '#ccc', textAlign: 'right' }}>
                        {PATHWAY_LABELS[pw] || pw.replace(/_/g, ' ')}
                      </div>
                      <div style={{ flex: 1, display: 'flex', gap: '2px', height: '18px' }}>
                        {v.capital > 0 && (
                          <div style={{
                            width: `${Math.max(2, (v.capital / maxVal) * 100)}%`,
                            background: '#30d158',
                            borderRadius: '3px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.62rem',
                            color: '#000',
                            fontWeight: 600,
                            minWidth: v.capital > maxVal * 0.08 ? 'auto' : '0',
                            overflow: 'hidden',
                          }}>
                            {v.capital > maxVal * 0.08 ? formatCurrency(v.capital) : ''}
                          </div>
                        )}
                        {v.annual > 0 && (
                          <div style={{
                            width: `${Math.max(2, (v.annual * 10 / maxVal) * 100)}%`,
                            background: '#0a84ff',
                            borderRadius: '3px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.62rem',
                            color: '#fff',
                            fontWeight: 600,
                            minWidth: v.annual * 10 > maxVal * 0.08 ? 'auto' : '0',
                            overflow: 'hidden',
                          }}>
                            {v.annual * 10 > maxVal * 0.08 ? `${formatCurrency(v.annual)}/yr` : ''}
                          </div>
                        )}
                      </div>
                      <div style={{ width: '50px', flexShrink: 0, fontSize: '0.68rem', color: '#8e8e93', textAlign: 'right' }}>
                        {v.count} assets
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '0.68rem', color: 'var(--text-tertiary, #666)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#30d158' }} /> Capital receipt
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#0a84ff' }} /> Annual income (×10 for scale)
                  </span>
                </div>
              </div>
            )
          })()}

          <div style={{ marginTop: '12px', fontSize: '0.68rem', color: 'var(--text-tertiary, #666)', fontStyle: 'italic' }}>
            Estimates based on Lancashire-level market rates adjusted by location quality (IMD) and energy efficiency (EPC). For indicative purposes — formal valuations required before disposal.
          </div>
        </div>
      )}

      {/* Disposal Timeline Waterfall */}
      {meta.pathway_breakdown && (() => {
        const timelineBands = [
          { label: '0-6 months', pathways: ['quick_win_auction', 'meanwhile_use', 'long_lease_income', 'governance_review'], color: '#30d158' },
          { label: '6-12 months', pathways: ['private_treaty_sale', 'community_asset_transfer', 'refurbish_relet'], color: '#0a84ff' },
          { label: '12-24 months', pathways: ['development_partnership', 'energy_generation', 'co_locate_consolidate', 'housing_partnership'], color: '#ff9f0a' },
          { label: '24+ months', pathways: ['carbon_offset_woodland'], color: '#bf5af2' },
          { label: 'Ongoing', pathways: ['strategic_hold'], color: '#8e8e93' },
        ]
        const bandData = timelineBands.map(band => {
          const count = band.pathways.reduce((s, pw) => s + (meta.pathway_breakdown[pw] || 0), 0)
          const capital = band.pathways.reduce((s, pw) => {
            return s + assets.filter(a => a.disposal_pathway === pw).reduce((t, a) => t + (a.revenue_estimate_capital || 0), 0)
          }, 0)
          const annual = band.pathways.reduce((s, pw) => {
            return s + assets.filter(a => a.disposal_pathway === pw).reduce((t, a) => t + (a.revenue_estimate_annual || 0), 0)
          }, 0)
          return { ...band, count, capital, annual }
        }).filter(b => b.count > 0)
        const maxCount = Math.max(...bandData.map(b => b.count))
        let cumulative = 0

        return (
          <div className="glass-card" style={{ padding: '20px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Clock size={18} style={{ color: '#64d2ff' }} />
              <h3 style={{ color: '#fff', margin: 0, fontSize: '1rem' }}>Disposal Timeline</h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {bandData.map(band => {
                cumulative += band.count
                return (
                  <div key={band.label} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '100px', flexShrink: 0, textAlign: 'right' }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 600, color: band.color }}>{band.label}</div>
                    </div>
                    <div style={{ flex: 1, position: 'relative' }}>
                      <div style={{
                        height: '32px',
                        borderRadius: '6px',
                        background: `${band.color}22`,
                        border: `1px solid ${band.color}33`,
                        position: 'relative',
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          height: '100%',
                          width: `${Math.max(3, (band.count / maxCount) * 100)}%`,
                          background: `${band.color}44`,
                          borderRadius: '5px',
                          display: 'flex',
                          alignItems: 'center',
                          paddingLeft: '8px',
                        }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#fff', whiteSpace: 'nowrap' }}>
                            {band.count} assets
                          </span>
                        </div>
                      </div>
                    </div>
                    <div style={{ width: '140px', flexShrink: 0, textAlign: 'right' }}>
                      {band.capital > 0 && (
                        <div style={{ fontSize: '0.7rem', color: '#30d158' }}>
                          {formatCurrency(band.capital)} capital
                        </div>
                      )}
                      {band.annual > 0 && (
                        <div style={{ fontSize: '0.7rem', color: '#0a84ff' }}>
                          {formatCurrency(band.annual)}/yr income
                        </div>
                      )}
                    </div>
                    <div style={{ width: '80px', flexShrink: 0, textAlign: 'right', fontSize: '0.68rem', color: 'var(--text-tertiary, #666)' }}>
                      {cumulative}/{assets.length} cum.
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Pathway detail grid */}
            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #aaa)', marginBottom: '10px', fontWeight: 600 }}>
                Pathway Breakdown
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
                {Object.entries(meta.pathway_breakdown)
                  .sort((a, b) => b[1] - a[1])
                  .map(([pw, count]) => {
                    const tl = PATHWAY_TIMELINES[pw] || {}
                    const isActive = filterPathway === pw
                    return (
                      <div
                        key={pw}
                        onClick={() => { setFilterPathway(isActive ? '' : pw); setViewMode('table') }}
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
                            width: '10px', height: '10px', borderRadius: '50%',
                            background: PATHWAY_MAP_COLORS[pw] || '#8e8e93', flexShrink: 0,
                          }} />
                          <span>
                            <span style={{ fontSize: '0.78rem', color: '#ccc', display: 'block' }}>
                              {PATHWAY_LABELS[pw] || pw.replace(/_/g, ' ')}
                            </span>
                            {tl.label && (
                              <span style={{ fontSize: '0.65rem', color: 'var(--text-tertiary, #666)' }}>
                                {tl.label} · {tl.type}
                              </span>
                            )}
                          </span>
                        </span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff', marginLeft: '8px' }}>
                          {formatNumber(count)}
                        </span>
                      </div>
                    )
                  })}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Occupancy Summary */}
      {meta.occupancy_breakdown && (
        <div className="glass-card" style={{ padding: '20px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <Building size={18} style={{ color: '#5e5ce6' }} />
            <h3 style={{ color: '#fff', margin: 0, fontSize: '1rem' }}>Occupancy Analysis</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
            {Object.entries(meta.occupancy_breakdown)
              .sort((a, b) => b[1] - a[1])
              .map(([occ, count]) => {
                const pct = meta.total_assets ? ((count / meta.total_assets) * 100).toFixed(1) : '0'
                const isActive = filterOccupancy === occ
                return (
                  <div
                    key={occ}
                    onClick={() => { setFilterOccupancy(isActive ? '' : occ); setViewMode('table') }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: '6px',
                      background: isActive ? 'rgba(10,132,255,0.15)' : 'rgba(255,255,255,0.03)',
                      cursor: 'pointer',
                      transition: 'background 0.15s',
                      border: isActive ? '1px solid rgba(10,132,255,0.3)' : '1px solid transparent',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        width: '10px', height: '10px', borderRadius: '50%',
                        background: OCCUPANCY_MAP_COLORS[occ] || '#8e8e93', flexShrink: 0,
                      }} />
                      <span style={{ fontSize: '0.8rem', color: '#ccc' }}>
                        {OCCUPANCY_LABELS[occ] || occ.replace(/_/g, ' ')}
                      </span>
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary, #666)' }}>{pct}%</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>
                        {formatNumber(count)}
                      </span>
                    </span>
                  </div>
                )
              })}
          </div>
        </div>
      )}

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

          {/* Ownership (Freehold/Leasehold) */}
          <select value={filterOwnership} onChange={e => setFilterOwnership(e.target.value)} style={selectStyle}>
            <option value="">All Tenure</option>
            <option value="Freehold">Freehold</option>
            <option value="Leasehold">Leasehold</option>
            <option value="Other">Other</option>
          </select>

          {/* Tier (multi-entity ownership) */}
          {meta.ownership?.assets_by_tier && Object.keys(meta.ownership.assets_by_tier).length > 1 && (
            <select value={filterTier} onChange={e => setFilterTier(e.target.value)} style={selectStyle}>
              <option value="">All Tiers</option>
              {Object.entries(meta.ownership.assets_by_tier).map(([tier, count]) => (
                <option key={tier} value={tier}>{tier.replace(/_/g, ' ')} ({count})</option>
              ))}
            </select>
          )}

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

          {/* Disposal Pathway */}
          {pathwayOptions.length > 0 && (
            <select value={filterPathway} onChange={e => setFilterPathway(e.target.value)} style={{ ...selectStyle, minWidth: '150px' }}>
              <option value="">All Pathways</option>
              {pathwayOptions.map(pw => (
                <option key={pw} value={pw}>{pw.replace(/_/g, ' ')}</option>
              ))}
            </select>
          )}

          {/* Occupancy */}
          {occupancyOptions.length > 0 && (
            <select value={filterOccupancy} onChange={e => setFilterOccupancy(e.target.value)} style={selectStyle}>
              <option value="">All Occupancy</option>
              {occupancyOptions.map(occ => (
                <option key={occ} value={occ}>{occ.replace(/_/g, ' ')}</option>
              ))}
            </select>
          )}

          {/* Service Status */}
          <select value={filterServiceStatus} onChange={e => setFilterServiceStatus(e.target.value)} style={selectStyle}>
            <option value="">All Service Status</option>
            <option value="active">Active (LCC)</option>
            <option value="community_managed">Community Managed</option>
            <option value="closed">Closed</option>
            <option value="transferred">Transferred</option>
          </select>

          {/* Quick Wins toggle */}
          <button
            onClick={() => setQuickWinsOnly(!quickWinsOnly)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: quickWinsOnly ? '1px solid rgba(0,200,83,0.5)' : '1px solid rgba(255,255,255,0.15)',
              background: quickWinsOnly ? 'rgba(0,200,83,0.15)' : 'rgba(255,255,255,0.05)',
              color: quickWinsOnly ? '#00c853' : 'var(--text-secondary, #aaa)',
              fontSize: '0.8rem',
              cursor: 'pointer',
              fontWeight: quickWinsOnly ? 600 : 400,
              whiteSpace: 'nowrap',
            }}
          >
            ⚡ Quick Wins{meta.quick_wins ? ` (${meta.quick_wins})` : ''}
          </button>

          {/* Sellable by LCC toggle */}
          {meta.ownership?.sellable_by_lcc > 0 && (
            <button
              onClick={() => setSellableOnly(!sellableOnly)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: sellableOnly ? '1px solid rgba(48,209,88,0.5)' : '1px solid rgba(255,255,255,0.15)',
                background: sellableOnly ? 'rgba(48,209,88,0.15)' : 'rgba(255,255,255,0.05)',
                color: sellableOnly ? '#30d158' : 'var(--text-secondary, #aaa)',
                fontSize: '0.8rem',
                cursor: 'pointer',
                fontWeight: sellableOnly ? 600 : 400,
                whiteSpace: 'nowrap',
              }}
            >
              🏷️ Sellable ({meta.ownership.sellable_by_lcc})
            </button>
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
            <button
              onClick={() => setViewMode('disposals')}
              style={{
                padding: '6px 14px',
                border: 'none',
                borderLeft: '1px solid rgba(255,255,255,0.1)',
                background: viewMode === 'disposals' ? 'rgba(10,132,255,0.3)' : 'rgba(255,255,255,0.05)',
                color: viewMode === 'disposals' ? '#0a84ff' : '#aaa',
                fontSize: '0.8rem',
                cursor: 'pointer',
                fontWeight: viewMode === 'disposals' ? 600 : 400,
              }}
            >
              Disposals
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
                  <th style={{
                    padding: '10px 12px',
                    textAlign: 'left',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary, #aaa)',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    whiteSpace: 'nowrap',
                  }}>
                    Status
                  </th>
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
                    <td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: '#8e8e93' }}>
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
                    <td style={{ padding: '10px 12px' }}>
                      {asset.service_status ? (
                        <span style={{
                          fontSize: '0.7rem',
                          padding: '2px 8px',
                          borderRadius: '8px',
                          fontWeight: 500,
                          background: asset.service_status === 'active' ? 'rgba(48,209,88,0.15)' :
                                     asset.service_status === 'community_managed' ? 'rgba(191,90,242,0.15)' :
                                     asset.service_status === 'closed' ? 'rgba(255,69,58,0.15)' :
                                     'rgba(142,142,147,0.15)',
                          color: asset.service_status === 'active' ? '#30d158' :
                                 asset.service_status === 'community_managed' ? '#bf5af2' :
                                 asset.service_status === 'closed' ? '#ff453a' :
                                 '#8e8e93',
                        }}>
                          {asset.service_status === 'community_managed' ? 'Community' :
                           asset.service_status.charAt(0).toUpperCase() + asset.service_status.slice(1)}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: '#8e8e93' }}>-</span>
                      )}
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

      {/* Map View */}
      {viewMode === 'map' && (
        <div className="premium-map-section">
          {/* Overlay Mode Toggles */}
          <div className="premium-map-toggles premium-map-toggles--wrap">
            {[
              { id: 'category', label: 'Category' },
              { id: 'complexity', label: 'Complexity' },
              { id: 'pathway', label: 'Pathway' },
              { id: 'occupancy', label: 'Occupancy' },
              { id: 'disposal', label: 'Disposal' },
              { id: 'netzero', label: 'Net Zero' },
              { id: 'epc', label: 'EPC Rating' },
              { id: 'heritage', label: 'Heritage' },
              { id: 'constraints', label: 'Constraints' },
              { id: 'ownership', label: 'Ownership' },
              { id: 'sellability', label: 'Sellability' },
              { id: 'district', label: 'District' },
              { id: 'lgr_authority', label: 'LGR Authority' },
            ].map(mode => (
              <button
                key={mode.id}
                className={mapOverlay === mode.id ? 'active' : ''}
                onClick={() => setMapOverlay(mode.id)}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {/* LGR model selector (only in lgr_authority mode) */}
          {mapOverlay === 'lgr_authority' && lgrModels.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
              <span style={{ fontSize: '0.8rem', color: '#aaa' }}>Model:</span>
              <select
                value={lgrModel}
                onChange={(e) => setLgrModel(e.target.value)}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  fontSize: '0.8rem',
                }}
              >
                {lgrModels.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* District toggle chips (only in district mode) */}
          {mapOverlay === 'district' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
              {Object.entries(DISTRICT_COLORS).map(([district, color]) => {
                const hidden = hiddenDistricts.has(district)
                return (
                  <button
                    key={district}
                    onClick={() => setHiddenDistricts(prev => {
                      const next = new Set(prev)
                      if (next.has(district)) next.delete(district)
                      else next.add(district)
                      return next
                    })}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '4px 10px',
                      borderRadius: '14px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      border: `1px solid ${hidden ? 'rgba(255,255,255,0.08)' : color}`,
                      background: hidden ? 'transparent' : `${color}22`,
                      color: hidden ? '#666' : color,
                      cursor: 'pointer',
                      opacity: hidden ? 0.5 : 1,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span style={{
                      width: '8px', height: '8px', borderRadius: '50%',
                      background: hidden ? '#444' : color,
                    }} />
                    {district}
                  </button>
                )
              })}
            </div>
          )}

          {/* Asset count */}
          <div className="premium-map-meta">
            Showing {formatNumber(visibleMapAssets.length)} of {formatNumber(filteredAssets.length)} assets on map
            {filteredAssets.length > visibleMapAssets.length && ` (${filteredAssets.length - visibleMapAssets.length} hidden/missing coordinates)`}
          </div>

          {/* Leaflet Map */}
          <div className="premium-map-3d">
            <div className="premium-map-orb premium-map-orb--red" />
            <div className="premium-map-orb premium-map-orb--blue" />
            <div className="premium-map-frame premium-map-frame--compact">
              <Suspense fallback={<div className="premium-map-loading" style={{ minHeight: '600px' }}>Loading map...</div>}>
                <WardMap
                  boundaries={boundariesData}
                  wardData={wardMapOverlayData}
                  wardsUp={wardsUp}
                  overlayMode="classification"
                  assets={visibleMapAssets}
                  onAssetClick={(id) => navigate(`/property/${id}`)}
                  height="600px"
                />
              </Suspense>
            </div>
          </div>

          {/* Legend */}
          <div className="premium-map-legend">
            <div className="premium-map-legend-items">
              <span className="premium-map-legend-label">Legend</span>
              {mapOverlay === 'category' && Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
                <span key={cat} className="premium-map-legend-item">
                  <span className="premium-map-legend-dot" style={{ background: color }} />
                  {CATEGORY_LABELS[cat] || cat.replace(/_/g, ' ')}
                </span>
              ))}
              {mapOverlay === 'disposal' && [
                { label: 'High priority', color: '#ff453a' },
                { label: 'Medium priority', color: '#ff9f0a' },
                { label: 'Low priority', color: '#30d158' },
                { label: 'No data', color: '#8e8e93' },
              ].map(item => (
                <span key={item.label} className="premium-map-legend-item">
                  <span className="premium-map-legend-dot" style={{ background: item.color }} />
                  {item.label}
                </span>
              ))}
              {mapOverlay === 'netzero' && [
                { label: 'High priority', color: '#ff453a' },
                { label: 'Medium priority', color: '#ff9f0a' },
                { label: 'Low priority', color: '#30d158' },
                { label: 'No data', color: '#8e8e93' },
              ].map(item => (
                <span key={item.label} className="premium-map-legend-item">
                  <span className="premium-map-legend-dot" style={{ background: item.color }} />
                  {item.label}
                </span>
              ))}
              {mapOverlay === 'epc' && ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(rating => (
                <span key={rating} className="premium-map-legend-item">
                  <span className="premium-map-legend-dot" style={{ background: EPC_COLORS[rating] }} />
                  {rating}
                </span>
              ))}
              {mapOverlay === 'complexity' && [
                { label: 'Low (<30)', color: '#30d158' },
                { label: 'Medium (30-59)', color: '#ff9f0a' },
                { label: 'High (60+)', color: '#ff453a' },
              ].map(item => (
                <span key={item.label} className="premium-map-legend-item">
                  <span className="premium-map-legend-dot" style={{ background: item.color }} />
                  {item.label}
                </span>
              ))}
              {mapOverlay === 'pathway' && Object.entries(PATHWAY_MAP_COLORS)
                .filter(([pw]) => meta.pathway_breakdown?.[pw])
                .map(([pw, color]) => (
                  <span key={pw} className="premium-map-legend-item">
                    <span className="premium-map-legend-dot" style={{ background: color }} />
                    {PATHWAY_LABELS[pw] || pw.replace(/_/g, ' ')}
                  </span>
                ))}
              {mapOverlay === 'occupancy' && Object.entries(OCCUPANCY_MAP_COLORS)
                .filter(([occ]) => meta.occupancy_breakdown?.[occ])
                .map(([occ, color]) => (
                  <span key={occ} className="premium-map-legend-item">
                    <span className="premium-map-legend-dot" style={{ background: color }} />
                    {OCCUPANCY_LABELS[occ] || occ.replace(/_/g, ' ')}
                  </span>
                ))}
              {mapOverlay === 'heritage' && Object.entries(HERITAGE_COLORS).map(([grade, color]) => (
                <span key={grade} className="premium-map-legend-item">
                  <span className="premium-map-legend-dot" style={{ background: color }} />
                  {HERITAGE_LABELS[grade] || grade}
                </span>
              ))}
              {mapOverlay === 'sellability' && [
                { label: 'Sellable by LCC', color: '#30d158' },
                { label: 'Not sellable', color: '#ff453a' },
                { label: 'Unknown', color: '#8e8e93' },
              ].map(item => (
                <span key={item.label} className="premium-map-legend-item">
                  <span className="premium-map-legend-dot" style={{ background: item.color }} />
                  {item.label}
                </span>
              ))}
              {mapOverlay === 'constraints' && Object.entries(CONSTRAINT_COLORS).map(([key, color]) => (
                <span key={key} className="premium-map-legend-item">
                  <span className="premium-map-legend-dot" style={{ background: color }} />
                  {CONSTRAINT_LABELS[key] || key}
                </span>
              ))}
              {mapOverlay === 'district' && Object.entries(DISTRICT_COLORS)
                .filter(([d]) => !hiddenDistricts.has(d))
                .map(([district, color]) => (
                <span key={district} className="premium-map-legend-item">
                  <span className="premium-map-legend-dot" style={{ background: color }} />
                  {district}
                </span>
              ))}
              {mapOverlay === 'lgr_authority' && lgrAuthorities.map((auth, i) => (
                <span key={auth.name} className="premium-map-legend-item">
                  <span className="premium-map-legend-dot" style={{ background: LGR_AUTH_COLORS[i % LGR_AUTH_COLORS.length] }} />
                  {auth.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Disposals Tracker View */}
      {viewMode === 'disposals' && (() => {
        const { ctx, totalDisposals, disposalValue, communityTransfers, avgPerYear, gbTotal, rbTotal, quarters, pipelineEntries, maxPipelineCount, pipelineCapital, pipelineAnnual, soldCount, soldValue, listedValue } = disposalsData
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Estate Valuation Overview */}
            <div className="glass-card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <PoundSterling size={18} style={{ color: '#0a84ff' }} />
                <h3 style={{ color: '#fff', margin: 0, fontSize: '1rem' }}>Estate Valuation</h3>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(10,132,255,0.08)', border: '1px solid rgba(10,132,255,0.15)' }}>
                  <div style={{ fontSize: '0.68rem', color: '#0a84ff', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Red Book Market Value</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#0a84ff' }}>{formatCurrency(rbTotal)}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary, #aaa)', marginTop: '2px' }}>RICS valuation — {formatNumber(assets.filter(a => a.rb_market_value).length)} assets</div>
                </div>
                <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(48,209,88,0.08)', border: '1px solid rgba(48,209,88,0.15)' }}>
                  <div style={{ fontSize: '0.68rem', color: '#30d158', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Green Book NPV</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#30d158' }}>{formatCurrency(gbTotal)}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary, #aaa)', marginTop: '2px' }}>HM Treasury options appraisal</div>
                </div>
                <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(255,159,10,0.08)', border: '1px solid rgba(255,159,10,0.15)' }}>
                  <div style={{ fontSize: '0.68rem', color: '#ff9f0a', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Portfolio (Strategy)</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#ff9f0a' }}>{ctx.portfolio_value || '£2B'}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary, #aaa)', marginTop: '2px' }}>Per 2020 Asset Management Strategy</div>
                </div>
                <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.15)' }}>
                  <div style={{ fontSize: '0.68rem', color: '#ff453a', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Condition Backlog</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#ff453a' }}>{ctx.condition_backlog || '£56.6M'}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary, #aaa)', marginTop: '2px' }}>Priority 1-4 maintenance liability</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginTop: '12px' }}>
                <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary, #aaa)', fontWeight: 600 }}>Running Cost</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>{ctx.running_cost_annual || '£21M/yr'}</div>
                </div>
                <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary, #aaa)', fontWeight: 600 }}>R&M Budget</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>{ctx.rm_budget || '£4.7M'}</div>
                </div>
                <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary, #aaa)', fontWeight: 600 }}>Gross Internal Area</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>{ctx.gia_sqm ? formatNumber(ctx.gia_sqm) + ' m²' : '332,516 m²'}</div>
                </div>
                <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary, #aaa)', fontWeight: 600 }}>Carbon Emissions</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>{ctx.carbon_tonnes_co2 ? formatNumber(ctx.carbon_tonnes_co2) + ' tCO₂' : '5,581 tCO₂'}</div>
                </div>
              </div>
            </div>

            {/* Historic Disposals Summary */}
            <div className="glass-card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <Gavel size={18} style={{ color: '#ff9f0a' }} />
                <h3 style={{ color: '#fff', margin: 0, fontSize: '1rem' }}>Historic Disposals (Since 2016)</h3>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                <div style={{ textAlign: 'center', padding: '16px', borderRadius: '10px', background: 'rgba(255,159,10,0.08)', border: '1px solid rgba(255,159,10,0.15)' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 700, color: '#ff9f0a' }}>{totalDisposals}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #aaa)' }}>Total Disposals</div>
                </div>
                <div style={{ textAlign: 'center', padding: '16px', borderRadius: '10px', background: 'rgba(48,209,88,0.08)', border: '1px solid rgba(48,209,88,0.15)' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 700, color: '#30d158' }}>{disposalValue}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #aaa)' }}>Total Receipts</div>
                </div>
                <div style={{ textAlign: 'center', padding: '16px', borderRadius: '10px', background: 'rgba(10,132,255,0.08)', border: '1px solid rgba(10,132,255,0.15)' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 700, color: '#0a84ff' }}>{avgPerYear}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #aaa)' }}>Average Per Year</div>
                </div>
                <div style={{ textAlign: 'center', padding: '16px', borderRadius: '10px', background: 'rgba(191,90,242,0.08)', border: '1px solid rgba(191,90,242,0.15)' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 700, color: '#bf5af2' }}>{communityTransfers}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #aaa)' }}>Community Transfers</div>
                </div>
              </div>

              {/* Quarterly Auction Activity Chart */}
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary, #aaa)', marginBottom: '10px', fontWeight: 600 }}>
                Barnard Marcus Auction Activity by Quarter
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', height: '120px', padding: '0 4px', marginBottom: '8px' }}>
                {quarters.map(([q, data]) => {
                  const total = data.sold + data.unsold + data.withdrawn
                  const maxTotal = Math.max(...quarters.map(([, d]) => d.sold + d.unsold + d.withdrawn), 1)
                  const h = (total / maxTotal) * 100
                  const soldPct = total ? (data.sold / total) * 100 : 0
                  const unsoldPct = total ? (data.unsold / total) * 100 : 0
                  return (
                    <div key={q} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '0.65rem', color: '#fff', fontWeight: 600 }}>{total}</span>
                      <div style={{ width: '100%', height: `${h}%`, minHeight: '8px', borderRadius: '4px 4px 0 0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ flex: `${soldPct} 0 0`, background: '#30d158', minHeight: data.sold ? '2px' : 0 }} />
                        <div style={{ flex: `${unsoldPct} 0 0`, background: '#ff9f0a', minHeight: data.unsold ? '2px' : 0 }} />
                        <div style={{ flex: `${100 - soldPct - unsoldPct} 0 0`, background: '#ff453a', minHeight: data.withdrawn ? '2px' : 0 }} />
                      </div>
                      <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary, #aaa)', whiteSpace: 'nowrap' }}>{q}</span>
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', fontSize: '0.68rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#30d158', display: 'inline-block' }} /> Sold ({soldCount})</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff9f0a', display: 'inline-block' }} /> Unsold</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff453a', display: 'inline-block' }} /> Withdrawn</span>
              </div>
            </div>

            {/* Recent Auction Results Table */}
            <div className="glass-card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Calendar size={18} style={{ color: '#64d2ff' }} />
                <h3 style={{ color: '#fff', margin: 0, fontSize: '1rem' }}>Recent Auction Results</h3>
                <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(48,209,88,0.12)', color: '#30d158', fontWeight: 600 }}>
                  £{formatNumber(soldValue)} realised
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      <th style={{ textAlign: 'left', padding: '8px', color: 'var(--text-secondary, #aaa)', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase' }}>Date</th>
                      <th style={{ textAlign: 'left', padding: '8px', color: 'var(--text-secondary, #aaa)', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase' }}>Property</th>
                      <th style={{ textAlign: 'right', padding: '8px', color: 'var(--text-secondary, #aaa)', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase' }}>Guide/Price</th>
                      <th style={{ textAlign: 'center', padding: '8px', color: 'var(--text-secondary, #aaa)', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SALES_HISTORY.slice().reverse().map((sale, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '8px', color: 'var(--text-secondary, #aaa)', whiteSpace: 'nowrap' }}>{new Date(sale.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                        <td style={{ padding: '8px', color: '#fff' }}>{sale.title}</td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#fff', fontWeight: 600 }}>{sale.price ? formatCurrency(sale.price) : '—'}</td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <span style={{
                            padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600,
                            background: sale.status === 'Sold' ? 'rgba(48,209,88,0.15)' : sale.status === 'Withdrawn' ? 'rgba(255,69,58,0.15)' : 'rgba(255,159,10,0.15)',
                            color: sale.status === 'Sold' ? '#30d158' : sale.status === 'Withdrawn' ? '#ff453a' : '#ff9f0a',
                          }}>{sale.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Current Listings */}
            <div className="glass-card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <TrendingUp size={18} style={{ color: '#30d158' }} />
                <h3 style={{ color: '#fff', margin: 0, fontSize: '1rem' }}>Currently Listed for Sale</h3>
                <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(10,132,255,0.12)', color: '#0a84ff', fontWeight: 600 }}>
                  £{formatNumber(listedValue)} guide total
                </span>
              </div>
              <div style={{ display: 'grid', gap: '8px' }}>
                {CURRENT_LISTINGS.map((listing, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 14px', borderRadius: '8px', background: 'rgba(48,209,88,0.05)', border: '1px solid rgba(48,209,88,0.1)',
                  }}>
                    <div>
                      <div style={{ color: '#fff', fontSize: '0.82rem', fontWeight: 500 }}>{listing.title}</div>
                      <div style={{ color: 'var(--text-secondary, #aaa)', fontSize: '0.7rem' }}>{listing.date} — {listing.status}</div>
                    </div>
                    <div style={{ color: '#30d158', fontWeight: 700, fontSize: '0.95rem' }}>
                      {listing.price ? formatCurrency(listing.price) : 'TBC'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Disposal Pipeline */}
            <div className="glass-card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <BarChart3 size={18} style={{ color: '#bf5af2' }} />
                <h3 style={{ color: '#fff', margin: 0, fontSize: '1rem' }}>Forward Disposal Pipeline</h3>
                <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(191,90,242,0.12)', color: '#bf5af2', fontWeight: 600 }}>
                  {pipelineEntries.reduce((s, [, v]) => s + v.count, 0)} assets
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div style={{ padding: '14px', borderRadius: '10px', background: 'rgba(48,209,88,0.08)', border: '1px solid rgba(48,209,88,0.15)', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#30d158' }}>{formatCurrency(pipelineCapital)}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #aaa)' }}>Estimated Capital Receipts</div>
                </div>
                <div style={{ padding: '14px', borderRadius: '10px', background: 'rgba(10,132,255,0.08)', border: '1px solid rgba(10,132,255,0.15)', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0a84ff' }}>{formatCurrency(pipelineAnnual)}<span style={{ fontSize: '0.8rem', fontWeight: 400 }}>/yr</span></div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #aaa)' }}>Estimated Annual Income</div>
                </div>
              </div>
              {pipelineEntries.map(([pw, data]) => {
                const pct = (data.count / maxPipelineCount) * 100
                const color = PATHWAY_MAP_COLORS[pw] || '#8e8e93'
                const timeline = PATHWAY_TIMELINES[pw]
                return (
                  <div key={pw} style={{ marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                      <span style={{ fontSize: '0.78rem', color: '#fff' }}>
                        {PATHWAY_LABELS[pw] || pw.replace(/_/g, ' ')}
                        {timeline && <span style={{ color: 'var(--text-secondary, #aaa)', fontSize: '0.68rem', marginLeft: '8px' }}>{timeline.label}</span>}
                      </span>
                      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#fff' }}>
                        {data.count}
                        {data.capital > 0 && <span style={{ color: '#30d158', marginLeft: '8px', fontSize: '0.7rem' }}>£{formatNumber(data.capital)}</span>}
                        {data.annual > 0 && <span style={{ color: '#0a84ff', marginLeft: '8px', fontSize: '0.7rem' }}>£{formatNumber(data.annual)}/yr</span>}
                      </span>
                    </div>
                    <div style={{ height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.05)' }}>
                      <div style={{ width: `${pct}%`, height: '100%', borderRadius: '3px', background: color }} />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Sources */}
            <div className="glass-card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #aaa)' }}>
                <strong style={{ color: '#fff' }}>Sources:</strong> {(ctx.sources || []).join('; ') || 'LCC Property Asset Management Strategy (Feb 2020), Council Estate Use & Occupancy Report (Sep 2023), LCC Local Authority Land Register (Transparency Code)'}. Auction data from Barnard Marcus (2025-2026). Register coverage: {ctx.register_coverage_pct || 61}% of estimated ~{formatNumber(ctx.strategy_total_assets || 2000)} total estate.
              </div>
            </div>
          </div>
        )
      })()}

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
