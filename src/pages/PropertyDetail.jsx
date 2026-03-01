/**
 * PropertyDetail -- Individual LCC property asset detail page.
 *
 * Route: /property/:propertyId
 *
 * Strategist-only page with 7 tabs:
 *   1. Overview -- Ownership, category, deprivation, Google Maps link
 *   2. Financials -- Linked spend, supplier breakdown
 *   3. Energy -- EPC rating, heating, floor area
 *   4. Disposal -- Recommendation, priority, reasoning, risks
 *   5. Assessment -- World-class scores, innovative uses, sales evidence
 *   6. Valuation -- Green Book options appraisal, market value, LR comparables
 *   7. Location -- District, constituency, co-location, flood, crime
 *
 * Data: /data/property_assets_detail.json
 */
import { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Building, MapPin, Zap, Trash2, Navigation, ArrowLeft,
  ExternalLink, AlertTriangle, Shield, Thermometer,
  ClipboardCheck, Tag, Lightbulb, TrendingUp, DollarSign,
  BarChart3, Scale,
} from 'lucide-react'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { useAuth } from '../context/AuthContext'
import { isFirebaseEnabled } from '../firebase'
import { LoadingState } from '../components/ui'
import { formatCurrency, formatNumber } from '../utils/format'
import './PropertyDetail.css'

// ── Constants ──────────────────────────────────────────────────────────────────

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

const CATEGORY_COLORS = {
  education: '#0a84ff',
  library: '#bf5af2',
  children_social_care: '#ff453a',
  office_civic: '#30d158',
  operations_depot_waste: '#ff9f0a',
  transport_highways: '#64d2ff',
  land_general: '#8e8e93',
  land_woodland: '#34c759',
  land_open_space: '#a2d149',
  other_building: '#ffd60a',
}

const EPC_COLORS = {
  A: '#00c853', B: '#64dd17', C: '#ffd600',
  D: '#ff9100', E: '#ff5722', F: '#d50000', G: '#b71c1c',
}

const DEPRIVATION_DOMAINS = [
  { key: 'imd_decile', label: 'Overall IMD' },
  { key: 'income_decile', label: 'Income' },
  { key: 'employment_decile', label: 'Employment' },
  { key: 'education_decile', label: 'Education' },
  { key: 'health_decile', label: 'Health' },
  { key: 'crime_decile', label: 'Crime' },
  { key: 'housing_decile', label: 'Housing' },
  { key: 'living_env_decile', label: 'Living Environment' },
]

const TABS = [
  { id: 'overview', label: 'Overview', icon: Building },
  { id: 'financials', label: 'Financials', icon: Shield },
  { id: 'energy', label: 'Energy', icon: Zap },
  { id: 'disposal', label: 'Disposal', icon: Trash2 },
  { id: 'assessment', label: 'Assessment', icon: ClipboardCheck },
  { id: 'valuation', label: 'Valuation', icon: Scale },
  { id: 'location', label: 'Location', icon: Navigation },
]

const RECOMMENDATION_COLORS = {
  Retain: '#30d158',
  Sell: '#ff453a',
  'Co-locate': '#ff9f0a',
  Review: '#ffd60a',
  Transfer: '#0a84ff',
  Dispose: '#ff453a',
  Repurpose: '#bf5af2',
  Governance: '#8e8e93',
}

const PATHWAY_COLORS = {
  quick_win_auction:       '#00c853',
  private_treaty_sale:     '#30d158',
  development_partnership: '#0a84ff',
  community_asset_transfer:'#bf5af2',
  long_lease_income:       '#ff9f0a',
  meanwhile_use:           '#64d2ff',
  energy_generation:       '#ffd60a',
  carbon_offset_woodland:  '#34c759',
  housing_partnership:     '#ff6d3b',
  co_locate_consolidate:   '#5e5ce6',
  strategic_hold:          '#8e8e93',
  governance_review:       '#636366',
  refurbish_relet:         '#ac8e68',
}

const OCCUPANCY_LABELS = {
  occupied: 'Service-Occupied',
  school_grounds: 'School Grounds',
  likely_vacant: 'Likely Vacant',
  vacant_land: 'Vacant Land',
  third_party: 'Third-Party Use',
  unknown: 'Unknown',
}

const OCCUPANCY_COLORS = {
  occupied: '#0a84ff',
  school_grounds: '#5e5ce6',
  likely_vacant: '#ff9f0a',
  vacant_land: '#30d158',
  third_party: '#bf5af2',
  unknown: '#8e8e93',
}

const BAND_COLORS = {
  high: '#ff453a',
  medium: '#ff9f0a',
  low: '#30d158',
}

const WORLD_CLASS_DIMENSIONS = [
  { key: 'disposal_readiness', bandKey: 'disposal_band', label: 'Disposal Readiness' },
  { key: 'repurpose_potential', bandKey: 'repurpose_band', label: 'Repurpose Potential' },
  { key: 'service_criticality', bandKey: 'service_band', label: 'Service Criticality' },
  { key: 'net_zero_priority', bandKey: 'net_zero_band', label: 'Net Zero Priority' },
  { key: 'resilience_need', bandKey: 'resilience_band', label: 'Resilience Need' },
]

// ── Helpers ────────────────────────────────────────────────────────────────────

function deprivationColor(decile) {
  if (decile == null) return '#8e8e93'
  if (decile <= 2) return '#ff453a'
  if (decile <= 4) return '#ff9f0a'
  if (decile <= 6) return '#ffd60a'
  if (decile <= 8) return '#30d158'
  return '#00c853'
}

function scoreColor(score) {
  if (score == null) return '#8e8e93'
  if (score >= 70) return '#ff453a'
  if (score >= 50) return '#ff9f0a'
  if (score >= 30) return '#ffd60a'
  return '#30d158'
}

/** Match recommendation text (e.g. "Dispose (active listing...)") to a color key. */
function recommendationColor(rec) {
  if (!rec) return '#8e8e93'
  const lower = rec.toLowerCase()
  if (lower.startsWith('dispose')) return RECOMMENDATION_COLORS.Dispose
  if (lower.startsWith('retain')) return RECOMMENDATION_COLORS.Retain
  if (lower.startsWith('repurpose')) return RECOMMENDATION_COLORS.Repurpose
  if (lower.startsWith('governance')) return RECOMMENDATION_COLORS.Governance
  if (lower.includes('sell')) return RECOMMENDATION_COLORS.Sell
  if (lower.includes('co-locate')) return RECOMMENDATION_COLORS['Co-locate']
  if (lower.includes('review')) return RECOMMENDATION_COLORS.Review
  return '#0a84ff'
}

function confidenceColor(conf) {
  if (!conf) return '#8e8e93'
  const lower = conf.toLowerCase()
  if (lower === 'high') return '#30d158'
  if (lower === 'medium') return '#ff9f0a'
  return '#8e8e93'
}

function Badge({ label, color, bg }) {
  return (
    <span
      className="property-badge"
      style={{
        color: color || '#e2e8f0',
        background: bg || 'rgba(255,255,255,0.08)',
        padding: '3px 10px',
        borderRadius: '6px',
        fontSize: '0.75rem',
        fontWeight: 600,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  )
}

// ── Score Card ──────────────────────────────────────────────────────────────────

function ScoreCard({ label, score, icon: Icon }) {
  const color = scoreColor(score)
  return (
    <div className="glass-card" style={{ padding: 'var(--space-lg)', textAlign: 'center', flex: 1 }}>
      {Icon && <Icon size={18} style={{ color, marginBottom: '6px' }} />}
      <div style={{ fontSize: '2rem', fontWeight: 700, color, lineHeight: 1.1 }}>
        {score ?? '-'}
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #94a3b8)', marginTop: '4px' }}>
        {label}
      </div>
    </div>
  )
}

// ── Deprivation Bar ────────────────────────────────────────────────────────────

function DeprivationBar({ label, decile }) {
  const pct = decile != null ? (decile / 10) * 100 : 0
  const color = deprivationColor(decile)
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '3px' }}>
        <span style={{ color: 'var(--text-secondary, #94a3b8)' }}>{label}</span>
        <span style={{ color, fontWeight: 600 }}>{decile != null ? `${decile}/10` : '-'}</span>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '4px', transition: 'width 0.4s ease' }} />
      </div>
    </div>
  )
}

// ── World-Class Score Bar ─────────────────────────────────────────────────────

function WorldClassBar({ label, score, band }) {
  const pct = score != null ? Math.min(score, 100) : 0
  const color = BAND_COLORS[band] || scoreColor(score)
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '3px' }}>
        <span style={{ color: 'var(--text-secondary, #94a3b8)' }}>{label}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {band && (
            <span style={{ fontSize: '0.7rem', color, textTransform: 'capitalize', fontWeight: 500 }}>{band}</span>
          )}
          <span style={{ color, fontWeight: 600 }}>{score != null ? score : '-'}</span>
        </span>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '4px', transition: 'width 0.4s ease' }} />
      </div>
    </div>
  )
}

// ── Tab Content Components ─────────────────────────────────────────────────────

function OverviewTab({ asset }) {
  const dep = asset.deprivation
  return (
    <div>
      {/* Ownership & Category */}
      <div className="glass-card" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-md)' }}>Property Details</h3>
        <div className="property-detail-grid">
          <div className="property-detail-row">
            <span className="property-detail-label">Category</span>
            <span className="property-detail-value">
              {CATEGORY_LABELS[asset.category] || asset.category || '-'}
            </span>
          </div>
          <div className="property-detail-row">
            <span className="property-detail-label">Ownership</span>
            <span className="property-detail-value">{asset.ownership || '-'}</span>
          </div>
          <div className="property-detail-row">
            <span className="property-detail-label">Ownership Scope</span>
            <span className="property-detail-value">{asset.ownership_scope?.replace(/_/g, ' ') || '-'}</span>
          </div>
          {asset.owner_entity && (
            <div className="property-detail-row">
              <span className="property-detail-label">Owner Entity</span>
              <span className="property-detail-value" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {asset.owner_entity}
                {asset.tier && (
                  <Badge
                    label={asset.tier.replace(/_/g, ' ')}
                    color={asset.tier === 'subsidiary' ? '#ff9f0a' : asset.tier === 'jv' ? '#bf5af2' : asset.tier === 'third_party' ? '#ff453a' : '#0a84ff'}
                    bg={`${asset.tier === 'subsidiary' ? '#ff9f0a' : asset.tier === 'jv' ? '#bf5af2' : asset.tier === 'third_party' ? '#ff453a' : '#0a84ff'}22`}
                  />
                )}
              </span>
            </div>
          )}
          {asset.ownership_pct != null && asset.ownership_pct < 1.0 && (
            <div className="property-detail-row">
              <span className="property-detail-label">LCC Stake</span>
              <span className="property-detail-value">{Math.round(asset.ownership_pct * 100)}%</span>
            </div>
          )}
          {asset.sellable_by_lcc != null && (
            <div className="property-detail-row">
              <span className="property-detail-label">Sellable by LCC</span>
              <span className="property-detail-value" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Badge
                  label={asset.sellable_by_lcc ? 'Yes' : 'No'}
                  color={asset.sellable_by_lcc ? '#30d158' : '#ff453a'}
                  bg={asset.sellable_by_lcc ? '#30d15822' : '#ff453a22'}
                />
                {asset.sale_mechanism && asset.sale_mechanism !== 'direct_disposal' && (
                  <span style={{ fontSize: '0.72rem', color: '#8e8e93' }}>
                    via {asset.sale_mechanism.replace(/_/g, ' ')}
                  </span>
                )}
              </span>
            </div>
          )}
          <div className="property-detail-row">
            <span className="property-detail-label">Land Only</span>
            <span className="property-detail-value">{asset.land_only ? 'Yes' : 'No'}</span>
          </div>
          <div className="property-detail-row">
            <span className="property-detail-label">Floor Area</span>
            <span className="property-detail-value">
              {asset.floor_area_sqm ? `${formatNumber(asset.floor_area_sqm)} sqm` : '-'}
            </span>
          </div>
          {asset.flags?.length > 0 && (
            <div className="property-detail-row">
              <span className="property-detail-label">Flags</span>
              <span className="property-detail-value" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {asset.flags.map(f => (
                  <Badge key={f} label={f.replace(/_/g, ' ')} bg="rgba(255,159,10,0.15)" color="#ff9f0a" />
                ))}
              </span>
            </div>
          )}
        </div>
        {asset.google_maps_url && (
          <a
            href={asset.google_maps_url}
            target="_blank"
            rel="noopener noreferrer"
            className="property-external-link"
          >
            <MapPin size={14} /> View on Google Maps <ExternalLink size={12} />
          </a>
        )}
      </div>

      {/* Deprivation */}
      {dep && (
        <div className="glass-card" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-md)' }}>Deprivation Context</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #94a3b8)', marginBottom: 'var(--space-md)' }}>
            IMD 2019 deciles (1 = most deprived, 10 = least deprived)
          </p>
          {DEPRIVATION_DOMAINS.map(d => (
            <DeprivationBar key={d.key} label={d.label} decile={dep[d.key]} />
          ))}
          {dep.imd_rank && (
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 'var(--space-sm)' }}>
              National rank: {formatNumber(dep.imd_rank)} of 32,844
            </p>
          )}
        </div>
      )}

      {/* Ward link */}
      {asset.ward && (
        <div className="glass-card" style={{ padding: 'var(--space-lg)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-sm)' }}>Ward Context</h3>
          <Link to="/my-area" className="property-internal-link">
            <MapPin size={14} /> View {asset.ward} on My Area page
          </Link>
        </div>
      )}
    </div>
  )
}

function FinancialsTab({ asset }) {
  const spending = asset.spending
  const suppliers = asset.supplier_links || []

  if (!spending || (spending.total === 0 && suppliers.length === 0)) {
    return (
      <div className="glass-card" style={{ padding: 'var(--space-2xl)', textAlign: 'center' }}>
        <Shield size={40} style={{ color: 'var(--text-tertiary)', marginBottom: 'var(--space-md)', opacity: 0.4 }} />
        <p style={{ color: 'var(--text-secondary)' }}>No spending data linked to this property.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Spend summary */}
      <div className="glass-card" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-md)' }}>Linked Spending</h3>
        <div style={{ display: 'flex', gap: 'var(--space-xl)', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0a84ff' }}>
              {formatCurrency(spending.total)}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Total Linked Spend</div>
          </div>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{formatNumber(spending.transactions)}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Transactions</div>
          </div>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{formatNumber(spending.unique_suppliers)}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Unique Suppliers</div>
          </div>
        </div>
      </div>

      {/* Supplier links table */}
      {suppliers.length > 0 && (
        <div className="glass-card" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-md)' }}>Supplier Breakdown</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="property-table">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th style={{ textAlign: 'right' }}>Spend</th>
                  <th style={{ textAlign: 'right' }}>Transactions</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s, i) => (
                  <tr key={i}>
                    <td>
                      <Link
                        to={`/supplier/${encodeURIComponent(s.supplier)}`}
                        className="property-internal-link"
                        style={{ padding: 0, background: 'none' }}
                      >
                        {s.supplier}
                      </Link>
                    </td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(s.spend)}</td>
                    <td style={{ textAlign: 'right' }}>{formatNumber(s.transactions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Condition spend */}
      {spending.condition_spend > 0 && (
        <div className="glass-card" style={{ padding: 'var(--space-lg)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-sm)' }}>Condition Expenditure</h3>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ff9f0a' }}>
            {formatCurrency(spending.condition_spend)}
          </div>
          {spending.condition_samples && (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 'var(--space-xs)' }}>
              Samples: {spending.condition_samples}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function EnergyTab({ asset }) {
  const energy = asset.energy

  if (!energy || energy.match_status === 'unmatched') {
    return (
      <div className="glass-card" style={{ padding: 'var(--space-2xl)', textAlign: 'center' }}>
        <Thermometer size={40} style={{ color: 'var(--text-tertiary)', marginBottom: 'var(--space-md)', opacity: 0.4 }} />
        <p style={{ color: 'var(--text-secondary)' }}>No EPC data available for this property.</p>
      </div>
    )
  }

  const currentColor = EPC_COLORS[energy.rating] || '#8e8e93'
  const potentialColor = EPC_COLORS[energy.potential_rating] || '#8e8e93'

  return (
    <div>
      {/* EPC Ratings */}
      <div className="glass-card" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-lg)' }}>Energy Performance Certificate</h3>
        <div style={{ display: 'flex', gap: 'var(--space-2xl)', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                width: 80, height: 80, borderRadius: '12px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '2.5rem', fontWeight: 800, color: currentColor,
                background: `${currentColor}20`, border: `2px solid ${currentColor}40`,
              }}
            >
              {energy.rating || '?'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '6px' }}>Current</div>
          </div>
          {energy.potential_rating && energy.potential_rating !== energy.rating && (
            <>
              <div style={{ fontSize: '1.5rem', color: 'var(--text-tertiary)' }}>→</div>
              <div style={{ textAlign: 'center' }}>
                <div
                  style={{
                    width: 80, height: 80, borderRadius: '12px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '2.5rem', fontWeight: 800, color: potentialColor,
                    background: `${potentialColor}20`, border: `2px solid ${potentialColor}40`,
                  }}
                >
                  {energy.potential_rating}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '6px' }}>Potential</div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Details */}
      <div className="glass-card" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-md)' }}>Certificate Details</h3>
        <div className="property-detail-grid">
          <div className="property-detail-row">
            <span className="property-detail-label">Property Type</span>
            <span className="property-detail-value">{energy.property_type || '-'}</span>
          </div>
          <div className="property-detail-row">
            <span className="property-detail-label">Floor Area</span>
            <span className="property-detail-value">
              {energy.floor_area_sqm ? `${formatNumber(energy.floor_area_sqm)} sqm` : '-'}
            </span>
          </div>
          <div className="property-detail-row">
            <span className="property-detail-label">Main Heating</span>
            <span className="property-detail-value">{energy.main_heating || '-'}</span>
          </div>
          <div className="property-detail-row">
            <span className="property-detail-label">Valid Until</span>
            <span className="property-detail-value">
              {energy.valid_until || '-'}
              {energy.expired && (
                <Badge label="EXPIRED" color="#ff453a" bg="rgba(255,69,58,0.15)" />
              )}
            </span>
          </div>
          <div className="property-detail-row">
            <span className="property-detail-label">Match Quality</span>
            <span className="property-detail-value">
              {energy.match_status?.replace(/_/g, ' ') || '-'}
            </span>
          </div>
        </div>
        {energy.certificate_url && (
          <a
            href={energy.certificate_url}
            target="_blank"
            rel="noopener noreferrer"
            className="property-external-link"
          >
            <Zap size={14} /> View EPC Certificate <ExternalLink size={12} />
          </a>
        )}
      </div>
    </div>
  )
}

function ScoreGauge({ label, score, invert }) {
  const pct = Math.max(0, Math.min(score || 0, 100))
  // For complexity, green=low (good), red=high (bad). For readiness/revenue, green=high.
  let color
  if (invert) {
    color = pct >= 60 ? '#ff453a' : pct >= 30 ? '#ff9f0a' : '#30d158'
  } else {
    color = pct >= 60 ? '#30d158' : pct >= 30 ? '#ff9f0a' : '#ff453a'
  }
  return (
    <div style={{ flex: 1, minWidth: 100 }}>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, color, lineHeight: 1 }}>{score ?? '-'}</div>
      <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, height: 4, marginTop: 6, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  )
}

function DisposalTab({ asset }) {
  const disp = asset.disposal
  const pw = disp?.pathway
  const pwColor = PATHWAY_COLORS[pw] || '#8e8e93'
  const occStatus = disp?.occupancy_inferred || asset.occupancy_status
  const occLabel = OCCUPANCY_LABELS[occStatus] || occStatus || 'Unknown'
  const occColor = OCCUPANCY_COLORS[occStatus] || '#8e8e93'

  // Codex AI analysis (reasoning, risks, next_steps)
  const codex = disp?.codex
  const risks = codex?.key_risks ? codex.key_risks.split(/[|;]/).map(r => r.trim()).filter(Boolean) : []
  const steps = codex?.next_steps ? codex.next_steps.split(/[|;]/).map(s => s.trim()).filter(Boolean) : []

  return (
    <div>
      {/* Quick Win banner */}
      {disp?.quick_win && (
        <div style={{ background: 'rgba(0,200,83,0.12)', border: '1px solid rgba(0,200,83,0.3)', borderRadius: 'var(--radius-md)', padding: 'var(--space-md) var(--space-lg)', marginBottom: 'var(--space-lg)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <TrendingUp size={18} style={{ color: '#00c853' }} />
          <span style={{ fontWeight: 600, color: '#00c853', fontSize: '0.85rem' }}>Quick Win — Low complexity, market-ready, estimated {disp.estimated_timeline || '3-6 months'}</span>
        </div>
      )}

      {/* Pathway + Occupancy Header */}
      <div className="glass-card" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-md)' }}>Recommended Pathway</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 'var(--space-md)' }}>
          <Badge label={disp?.pathway_label || pw || 'Not assessed'} color={pwColor} bg={`${pwColor}20`} />
          {disp?.pathway_secondary_label && (
            <Badge label={`Alt: ${disp.pathway_secondary_label}`} color="#8e8e93" bg="rgba(142,142,147,0.15)" />
          )}
          <Badge label={occLabel} color={occColor} bg={`${occColor}15`} />
          {disp?.estimated_timeline && (
            <Badge label={disp.estimated_timeline} />
          )}
        </div>
        {disp?.pathway_reasoning && (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
            {disp.pathway_reasoning}
          </p>
        )}
      </div>

      {/* Score gauges */}
      <div className="glass-card" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-md)' }}>Intelligence Scores</h3>
        <div style={{ display: 'flex', gap: 'var(--space-xl)', flexWrap: 'wrap' }}>
          <ScoreGauge label="Disposal Complexity" score={disp?.complexity_score} invert />
          <ScoreGauge label="Market Readiness" score={disp?.market_readiness_score} />
          <ScoreGauge label="Revenue Potential" score={disp?.revenue_potential_score} />
          <ScoreGauge label="Smart Priority" score={disp?.smart_priority} />
        </div>
      </div>

      {/* Revenue estimate */}
      {(disp?.revenue_estimate_capital > 0 || disp?.revenue_estimate_annual > 0) && (
        <div className="glass-card" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-md)' }}>Estimated Revenue</h3>
          <div style={{ display: 'flex', gap: 'var(--space-xl)', flexWrap: 'wrap', marginBottom: 'var(--space-sm)' }}>
            {disp.revenue_estimate_capital > 0 && (
              <div>
                <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#30d158' }}>
                  £{(disp.revenue_estimate_capital / 1000).toFixed(0)}k
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Capital Receipt</div>
              </div>
            )}
            {disp.revenue_estimate_capital < 0 && (
              <div>
                <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#ff9f0a' }}>
                  £{(Math.abs(disp.revenue_estimate_capital) / 1000).toFixed(0)}k
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Investment Required</div>
              </div>
            )}
            {disp.revenue_estimate_annual > 0 && (
              <div>
                <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#0a84ff' }}>
                  £{(disp.revenue_estimate_annual / 1000).toFixed(0)}k<span style={{ fontSize: '0.9rem' }}>/yr</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Annual Income</div>
              </div>
            )}
          </div>
          {disp.revenue_method && (
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, fontStyle: 'italic' }}>
              Methodology: {disp.revenue_method}. Estimates use Lancashire-level rates adjusted for location (IMD) and EPC quality. For indicative purposes only.
            </p>
          )}
        </div>
      )}

      {/* Occupancy evidence */}
      {disp?.occupancy_signals?.length > 0 && (
        <div className="glass-card" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-sm)' }}>Occupancy Evidence</h3>
          <ul style={{ margin: 0, paddingLeft: 'var(--space-lg)' }}>
            {disp.occupancy_signals.map((s, i) => (
              <li key={i} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Complexity breakdown */}
      {disp?.complexity_breakdown?.length > 0 && (
        <div className="glass-card" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-sm)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertTriangle size={16} style={{ color: '#ff9f0a' }} /> Complexity Factors
          </h3>
          {disp.complexity_breakdown.map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < disp.complexity_breakdown.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{item.factor}</span>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#ff9f0a', minWidth: 40, textAlign: 'right' }}>+{item.points}</span>
            </div>
          ))}
        </div>
      )}

      {/* Readiness breakdown */}
      {disp?.readiness_breakdown?.length > 0 && (
        <div className="glass-card" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-sm)' }}>Market Readiness Factors</h3>
          {disp.readiness_breakdown.map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < disp.readiness_breakdown.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{item.factor}</span>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: item.points > 0 ? '#30d158' : '#ff453a', minWidth: 40, textAlign: 'right' }}>{item.points > 0 ? '+' : ''}{item.points}</span>
            </div>
          ))}
        </div>
      )}

      {/* Revenue breakdown */}
      {disp?.revenue_breakdown?.length > 0 && (
        <div className="glass-card" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-sm)' }}>Revenue Potential Factors</h3>
          {disp.revenue_breakdown.map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < disp.revenue_breakdown.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{item.factor}</span>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: item.points > 0 ? '#30d158' : '#ff453a', minWidth: 40, textAlign: 'right' }}>{item.points > 0 ? '+' : ''}{item.points}</span>
            </div>
          ))}
        </div>
      )}

      {/* Codex AI Analysis */}
      {codex?.reasoning && (
        <div className="glass-card" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-sm)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Lightbulb size={16} style={{ color: '#ffd60a' }} /> AI Analysis
            {codex.confidence && <Badge label={`${codex.confidence} confidence`} />}
          </h3>
          {codex.reasoning.split(/[\n;]/).filter(Boolean).map((p, i) => (
            <p key={i} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-sm)', lineHeight: 1.6 }}>
              {p.trim()}
            </p>
          ))}
        </div>
      )}

      {/* Risks */}
      {risks.length > 0 && (
        <div className="glass-card" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-sm)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertTriangle size={16} style={{ color: '#ff9f0a' }} /> Key Risks
          </h3>
          <ul style={{ margin: 0, paddingLeft: 'var(--space-lg)' }}>
            {risks.map((r, i) => (
              <li key={i} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Next steps */}
      {steps.length > 0 && (
        <div className="glass-card" style={{ padding: 'var(--space-lg)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-sm)' }}>Next Steps</h3>
          <ul style={{ margin: 0, paddingLeft: 'var(--space-lg)' }}>
            {steps.map((s, i) => (
              <li key={i} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── Green Book Option Labels & Colors ─────────────────────────────────────────

const GB_OPTION_LABELS = {
  do_nothing: 'Do Nothing (BAU)',
  dispose: 'Dispose (Open Market)',
  repurpose: 'Repurpose (Renovate & Rent)',
  community_transfer: 'Community Asset Transfer',
  redevelop: 'Redevelop (Partnership)',
}

const GB_OPTION_COLORS = {
  do_nothing: '#8e8e93',
  dispose: '#30d158',
  repurpose: '#0a84ff',
  community_transfer: '#bf5af2',
  redevelop: '#ff9f0a',
}

const GB_CONFIDENCE_COLORS = {
  high: '#30d158',
  medium: '#ff9f0a',
  low: '#ff453a',
  indicative: '#8e8e93',
}

function NpvBar({ label, npv, maxNpv, color }) {
  const pct = maxNpv > 0 ? Math.max(0, Math.min(100, ((npv + maxNpv) / (2 * maxNpv)) * 100)) : 50
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '3px' }}>
        <span style={{ color: 'var(--text-secondary, #94a3b8)' }}>{label}</span>
        <span style={{ color: npv >= 0 ? '#30d158' : '#ff453a', fontWeight: 600 }}>
          {npv >= 0 ? '+' : ''}{formatCurrency(npv)}
        </span>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color || '#0a84ff', borderRadius: '4px', transition: 'width 0.4s ease' }} />
      </div>
    </div>
  )
}

function CashflowRow({ label, value, indent = false }) {
  const isNeg = value < 0
  return (
    <div className="property-detail-row" style={{ paddingLeft: indent ? '16px' : 0 }}>
      <span className="property-detail-label" style={{ fontSize: indent ? '0.75rem' : '0.8rem' }}>{label}</span>
      <span className="property-detail-value" style={{ color: isNeg ? '#ff453a' : '#30d158', fontWeight: 600 }}>
        {isNeg ? '-' : '+'}{formatCurrency(Math.abs(value))}
      </span>
    </div>
  )
}

function ValuationTab({ asset }) {
  const gb = asset.green_book
  const valuation = asset.valuation

  return (
    <div>
      {/* Market Value Estimate */}
      <div className="glass-card" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <DollarSign size={16} style={{ color: '#30d158' }} /> Market Value Estimate
        </h3>
        {gb ? (
          <>
            <div style={{ display: 'flex', gap: 'var(--space-lg)', flexWrap: 'wrap', marginBottom: 'var(--space-md)' }}>
              <div style={{ flex: 1, minWidth: '120px' }}>
                <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#30d158' }}>
                  {formatCurrency(gb.market_value_estimate)}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Estimated Market Value</div>
              </div>
              <div style={{ flex: 1, minWidth: '120px' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 600, color: '#ff453a' }}>
                  {formatCurrency(gb.annual_holding_cost)}/yr
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Annual Holding Cost</div>
              </div>
              <div style={{ flex: 1, minWidth: '120px' }}>
                <Badge
                  label={`${gb.market_value_confidence} confidence`}
                  color={GB_CONFIDENCE_COLORS[gb.market_value_confidence] || '#8e8e93'}
                  bg={`${GB_CONFIDENCE_COLORS[gb.market_value_confidence] || '#8e8e93'}22`}
                />
                <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                  {gb.market_value_method}
                </div>
              </div>
            </div>
          </>
        ) : (
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
            No valuation data — run ETL with Green Book engine enabled.
          </p>
        )}
      </div>

      {/* Green Book Options Appraisal */}
      {gb?.options && (
        <div className="glass-card" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-sm)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <BarChart3 size={16} style={{ color: '#0a84ff' }} /> Green Book Options Appraisal
          </h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: 'var(--space-md)' }}>
            HM Treasury 5-case model. 10-year NPV at {((gb.discount_rate || 0.035) * 100).toFixed(1)}% Social Time Preference Rate.
          </p>

          {/* Preferred option banner */}
          <div style={{
            background: `${GB_OPTION_COLORS[gb.preferred_option] || '#0a84ff'}18`,
            border: `1px solid ${GB_OPTION_COLORS[gb.preferred_option] || '#0a84ff'}44`,
            borderRadius: '8px', padding: '12px 16px', marginBottom: 'var(--space-lg)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Preferred Option
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: GB_OPTION_COLORS[gb.preferred_option] || '#0a84ff' }}>
                {GB_OPTION_LABELS[gb.preferred_option] || gb.preferred_option_name}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#30d158' }}>
                +{formatCurrency(gb.npv_vs_bau)}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>NPV vs Do Nothing</div>
            </div>
          </div>

          {/* NPV comparison bars */}
          {(() => {
            const opts = Object.values(gb.options).sort((a, b) => b.npv - a.npv)
            const maxAbs = Math.max(...opts.map(o => Math.abs(o.npv)), 1)
            return opts.map(opt => (
              <NpvBar
                key={opt.name}
                label={`${opt.rank}. ${GB_OPTION_LABELS[Object.keys(gb.options).find(k => gb.options[k] === opt)] || opt.name}`}
                npv={opt.npv}
                maxNpv={maxAbs}
                color={GB_OPTION_COLORS[Object.keys(gb.options).find(k => gb.options[k] === opt)] || '#0a84ff'}
              />
            ))
          })()}

          {/* Confidence badge */}
          <div style={{ marginTop: 'var(--space-md)', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Badge
              label={`${gb.confidence} confidence`}
              color={GB_CONFIDENCE_COLORS[gb.confidence] || '#8e8e93'}
              bg={`${GB_CONFIDENCE_COLORS[gb.confidence] || '#8e8e93'}22`}
            />
            <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
              Based on {gb.market_value_method?.toLowerCase() || 'benchmark estimates'}
            </span>
          </div>
        </div>
      )}

      {/* Option Detail Cards */}
      {gb?.options && Object.entries(gb.options).sort(([,a],[,b]) => a.rank - b.rank).map(([code, opt]) => (
        <div key={code} className="glass-card" style={{
          padding: 'var(--space-lg)', marginBottom: 'var(--space-md)',
          borderLeft: `3px solid ${GB_OPTION_COLORS[code] || '#0a84ff'}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-sm)' }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 600, margin: 0, color: GB_OPTION_COLORS[code] }}>
              {opt.rank}. {GB_OPTION_LABELS[code] || opt.name}
            </h4>
            <span style={{ fontSize: '1rem', fontWeight: 700, color: opt.npv >= 0 ? '#30d158' : '#ff453a' }}>
              NPV: {opt.npv >= 0 ? '+' : ''}{formatCurrency(opt.npv)}
            </span>
          </div>

          {/* Cashflows */}
          <div className="property-detail-grid" style={{ marginBottom: opt.non_monetised?.length || opt.constraints?.length ? 'var(--space-sm)' : 0 }}>
            {Object.entries(opt.cashflows || {}).map(([key, val]) => (
              <CashflowRow
                key={key}
                label={key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/Pv /g, 'PV ').replace(/Sqm/g, 'SQM')}
                value={val}
                indent={key.includes('pv_') || key.includes('avoided')}
              />
            ))}
          </div>

          {/* Non-monetised benefits */}
          {opt.non_monetised?.length > 0 && (
            <div style={{ marginTop: '8px' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Non-Monetised:</span>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                {opt.non_monetised.map((b, i) => (
                  <span key={i} style={{
                    fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px',
                    background: 'rgba(48, 209, 88, 0.12)', color: '#30d158',
                  }}>{b}</span>
                ))}
              </div>
            </div>
          )}

          {/* Constraints */}
          {opt.constraints?.length > 0 && (
            <div style={{ marginTop: '8px' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Constraints:</span>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                {opt.constraints.map((c, i) => (
                  <span key={i} style={{
                    fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px',
                    background: 'rgba(255, 69, 58, 0.12)', color: '#ff453a',
                  }}>{c}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Land Registry Comparables (moved from Location tab) */}
      {valuation?.comparables_count > 0 && (
        <div className="glass-card" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <TrendingUp size={16} style={{ color: '#30d158' }} /> Land Registry Comparables
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginBottom: 'var(--space-md)' }}>
            Recent sales in {valuation.area || asset.district || 'this area'}. Area comparables, not direct valuations.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-lg)', flexWrap: 'wrap', marginBottom: 'var(--space-md)' }}>
            <div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#30d158' }}>
                {formatCurrency(valuation.median_price)}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Median</div>
            </div>
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {formatCurrency(valuation.min_price)} — {formatCurrency(valuation.max_price)}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Range</div>
            </div>
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {valuation.comparables_count}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Sales</div>
            </div>
          </div>
          {/* Comparables table */}
          {valuation.comparables?.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-tertiary)' }}>Address</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-tertiary)' }}>Postcode</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-tertiary)' }}>Price</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-tertiary)' }}>Date</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-tertiary)' }}>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {valuation.comparables.slice(0, 10).map((c, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '5px 8px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.address || '-'}
                      </td>
                      <td style={{ padding: '5px 8px' }}>{c.postcode || '-'}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 600, color: '#30d158' }}>
                        {c.price ? formatCurrency(c.price) : '-'}
                      </td>
                      <td style={{ padding: '5px 8px' }}>{c.date || '-'}</td>
                      <td style={{ padding: '5px 8px' }}>{c.type || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Red Book (RICS) Valuation */}
      {asset.red_book && (
        <div className="glass-card" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-sm)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Scale size={16} style={{ color: '#bf5af2' }} /> Red Book (RICS) Valuation
          </h3>
          <div style={{ display: 'flex', gap: 'var(--space-lg)', flexWrap: 'wrap', marginBottom: 'var(--space-md)' }}>
            <div style={{ flex: 1, minWidth: '120px' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#bf5af2' }}>
                {formatCurrency(asset.red_book.market_value)}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Market Value (MV)</div>
            </div>
            <div style={{ flex: 1, minWidth: '120px' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 600, color: '#64d2ff' }}>
                {formatCurrency(asset.red_book.existing_use_value)}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Existing Use Value (EUV)</div>
            </div>
            <div style={{ flex: 1, minWidth: '120px' }}>
              <Badge
                label={`${asset.red_book.confidence} confidence`}
                color={GB_CONFIDENCE_COLORS[asset.red_book.confidence] || '#8e8e93'}
                bg={`${GB_CONFIDENCE_COLORS[asset.red_book.confidence] || '#8e8e93'}22`}
              />
              <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                {asset.red_book.methodology}
              </div>
            </div>
          </div>
          <div className="property-detail-grid">
            <div className="property-detail-row">
              <span className="property-detail-label">Valuation Basis</span>
              <span className="property-detail-value" style={{ textTransform: 'capitalize' }}>{asset.red_book.valuation_basis}</span>
            </div>
            {asset.red_book.yield_pct != null && (
              <div className="property-detail-row">
                <span className="property-detail-label">Capitalisation Yield</span>
                <span className="property-detail-value">{asset.red_book.yield_pct}%</span>
              </div>
            )}
            <div className="property-detail-row">
              <span className="property-detail-label">Location Factor</span>
              <span className="property-detail-value">{asset.red_book.location_factor}</span>
            </div>
            <div className="property-detail-row">
              <span className="property-detail-label">EPC Adjustment</span>
              <span className="property-detail-value">{asset.red_book.epc_adjustment}</span>
            </div>
            <div className="property-detail-row">
              <span className="property-detail-label">Condition</span>
              <span className="property-detail-value" style={{ textTransform: 'capitalize' }}>{asset.red_book.condition_assessed}</span>
            </div>
          </div>
        </div>
      )}

      {/* Ownership Detail */}
      {asset.ownership_detail && (
        <div className="glass-card" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-sm)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Building size={16} style={{ color: '#ff9f0a' }} /> Ownership
            <Badge
              label={asset.tier || 'county'}
              color={asset.tier === 'subsidiary' ? '#ff9f0a' : asset.tier === 'jv' ? '#bf5af2' : asset.tier === 'third_party' ? '#ff453a' : '#0a84ff'}
              bg={`${asset.tier === 'subsidiary' ? '#ff9f0a' : asset.tier === 'jv' ? '#bf5af2' : asset.tier === 'third_party' ? '#ff453a' : '#0a84ff'}22`}
            />
          </h3>
          <div className="property-detail-grid">
            <div className="property-detail-row">
              <span className="property-detail-label">Owner Entity</span>
              <span className="property-detail-value">{asset.ownership_detail.entity_name || '-'}</span>
            </div>
            <div className="property-detail-row">
              <span className="property-detail-label">Entity Type</span>
              <span className="property-detail-value" style={{ textTransform: 'capitalize' }}>{(asset.ownership_detail.entity_type || '').replace(/_/g, ' ')}</span>
            </div>
            {asset.ownership_detail.ch_number && (
              <div className="property-detail-row">
                <span className="property-detail-label">Companies House</span>
                <span className="property-detail-value">
                  <a href={`https://find-and-update.company-information.service.gov.uk/company/${asset.ownership_detail.ch_number}`} target="_blank" rel="noopener noreferrer" style={{ color: '#0a84ff' }}>
                    {asset.ownership_detail.ch_number}
                  </a>
                </span>
              </div>
            )}
            <div className="property-detail-row">
              <span className="property-detail-label">LCC Stake</span>
              <span className="property-detail-value">{asset.ownership_detail.lcc_stake != null ? `${Math.round(asset.ownership_detail.lcc_stake * 100)}%` : '-'}</span>
            </div>
            <div className="property-detail-row">
              <span className="property-detail-label">Governance</span>
              <span className="property-detail-value" style={{ textTransform: 'capitalize' }}>{(asset.ownership_detail.governance || '').replace(/_/g, ' ')}</span>
            </div>
            {asset.ownership_detail.parent_entity && (
              <div className="property-detail-row">
                <span className="property-detail-label">Parent Entity</span>
                <span className="property-detail-value">{asset.ownership_detail.parent_entity}</span>
              </div>
            )}
            {asset.ownership_detail.sellable_by_lcc != null && (
              <div className="property-detail-row">
                <span className="property-detail-label">Sellable by LCC</span>
                <span className="property-detail-value" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Badge
                    label={asset.ownership_detail.sellable_by_lcc ? 'Yes' : 'No'}
                    color={asset.ownership_detail.sellable_by_lcc ? '#30d158' : '#ff453a'}
                    bg={asset.ownership_detail.sellable_by_lcc ? '#30d15822' : '#ff453a22'}
                  />
                  {asset.ownership_detail.sale_mechanism && (
                    <span style={{ fontSize: '0.72rem', color: '#8e8e93' }}>
                      {asset.ownership_detail.sale_mechanism.replace(/_/g, ' ')}
                    </span>
                  )}
                </span>
              </div>
            )}
            {asset.ownership_detail.notes && (
              <div className="property-detail-row">
                <span className="property-detail-label">Notes</span>
                <span className="property-detail-value">{asset.ownership_detail.notes}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Methodology note */}
      <div className="glass-card" style={{ padding: 'var(--space-md)', background: 'rgba(255,255,255,0.03)' }}>
        <p style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.5 }}>
          <strong>Green Book:</strong> HM Treasury 5-case options appraisal, 10-year NPV at 3.5% STPR.{' '}
          <strong>Red Book:</strong> RICS Red Book valuation — comparable, income (investment), or DRC method.{' '}
          Market values estimated from sales evidence, Land Registry comparables, and Lancashire benchmarks.
          All figures are indicative estimates for screening purposes — formal RICS valuations should be commissioned for disposal.
        </p>
      </div>
    </div>
  )
}

function LocationTab({ asset, nearbyPlanning = [] }) {
  const coloc = asset.co_location
  const flood = asset.flood
  const crime = asset.crime

  return (
    <div>
      {/* Geography */}
      <div className="glass-card" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-md)' }}>Administrative Geography</h3>
        <div className="property-detail-grid">
          <div className="property-detail-row">
            <span className="property-detail-label">District</span>
            <span className="property-detail-value">{asset.district || '-'}</span>
          </div>
          <div className="property-detail-row">
            <span className="property-detail-label">Constituency</span>
            <span className="property-detail-value">{asset.constituency || '-'}</span>
          </div>
          <div className="property-detail-row">
            <span className="property-detail-label">County Electoral Division</span>
            <span className="property-detail-value">{asset.ced || '-'}</span>
          </div>
          <div className="property-detail-row">
            <span className="property-detail-label">Ward</span>
            <span className="property-detail-value">{asset.ward || '-'}</span>
          </div>
          {asset.lat != null && asset.lng != null && (
            <div className="property-detail-row">
              <span className="property-detail-label">Coordinates</span>
              <span className="property-detail-value">{asset.lat.toFixed(4)}, {asset.lng.toFixed(4)}</span>
            </div>
          )}
        </div>
        {asset.google_maps_url && (
          <a
            href={asset.google_maps_url}
            target="_blank"
            rel="noopener noreferrer"
            className="property-external-link"
          >
            <MapPin size={14} /> View on Google Maps <ExternalLink size={12} />
          </a>
        )}
      </div>

      {/* Co-location */}
      {coloc && (
        <div className="glass-card" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-md)' }}>Co-location Analysis</h3>
          <div className="property-detail-grid">
            <div className="property-detail-row">
              <span className="property-detail-label">Same Postcode</span>
              <span className="property-detail-value">{formatNumber(coloc.same_postcode)} assets</span>
            </div>
            <div className="property-detail-row">
              <span className="property-detail-label">Within 500m</span>
              <span className="property-detail-value">{formatNumber(coloc.nearby_500m)} assets</span>
            </div>
            <div className="property-detail-row">
              <span className="property-detail-label">Within 1,000m</span>
              <span className="property-detail-value">{formatNumber(coloc.nearby_1000m)} assets</span>
            </div>
            {coloc.nearest_name && (
              <>
                <div className="property-detail-row">
                  <span className="property-detail-label">Nearest Asset</span>
                  <span className="property-detail-value">{coloc.nearest_name}</span>
                </div>
                <div className="property-detail-row">
                  <span className="property-detail-label">Distance</span>
                  <span className="property-detail-value">
                    {coloc.nearest_distance_m != null
                      ? `${formatNumber(coloc.nearest_distance_m, 0)}m`
                      : '-'}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Flood context */}
      {flood && (
        <div className="glass-card" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-md)' }}>Flood Risk Context</h3>
          <div className="property-detail-grid">
            <div className="property-detail-row">
              <span className="property-detail-label">Flood Areas within 1km</span>
              <span className="property-detail-value">{formatNumber(flood.areas_1km)}</span>
            </div>
            <div className="property-detail-row">
              <span className="property-detail-label">Flood Areas within 3km</span>
              <span className="property-detail-value">{formatNumber(flood.areas_3km)}</span>
            </div>
            {flood.nearest_label && (
              <>
                <div className="property-detail-row">
                  <span className="property-detail-label">Nearest Flood Area</span>
                  <span className="property-detail-value">{flood.nearest_label}</span>
                </div>
                <div className="property-detail-row">
                  <span className="property-detail-label">Distance</span>
                  <span className="property-detail-value">
                    {flood.nearest_distance_km != null
                      ? `${flood.nearest_distance_km.toFixed(1)} km`
                      : '-'}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Crime context */}
      {crime && (
        <div className="glass-card" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-md)' }}>Crime Context</h3>
          <div className="property-detail-grid">
            <div className="property-detail-row">
              <span className="property-detail-label">Total (1 mile)</span>
              <span className="property-detail-value">{formatNumber(crime.total_1mi)}</span>
            </div>
            <div className="property-detail-row">
              <span className="property-detail-label">Violent Crime (1 mile)</span>
              <span className="property-detail-value">{formatNumber(crime.violent_1mi)}</span>
            </div>
            <div className="property-detail-row">
              <span className="property-detail-label">Anti-social (1 mile)</span>
              <span className="property-detail-value">{formatNumber(crime.antisocial_1mi)}</span>
            </div>
            <div className="property-detail-row">
              <span className="property-detail-label">Density Band</span>
              <span className="property-detail-value" style={{ textTransform: 'capitalize' }}>
                {crime.density_band || '-'}
              </span>
            </div>
            {crime.snapshot_month && (
              <div className="property-detail-row">
                <span className="property-detail-label">Data Month</span>
                <span className="property-detail-value">{crime.snapshot_month}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Heritage context */}
      {asset.heritage && (asset.heritage.listed_building_grade || asset.heritage.listed_buildings_nearby > 0) && (
        <div className="glass-card" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-md)' }}>Heritage Context</h3>
          <div className="property-detail-grid">
            {asset.heritage.listed_building_grade && (
              <div className="property-detail-row">
                <span className="property-detail-label">Listed Status</span>
                <span className="property-detail-value">
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
                    background: asset.heritage.listed_building_grade === 'I' ? 'rgba(255,59,48,0.15)' :
                      asset.heritage.listed_building_grade === 'II*' ? 'rgba(255,149,0,0.15)' : 'rgba(255,204,0,0.15)',
                    color: asset.heritage.listed_building_grade === 'I' ? '#ff3b30' :
                      asset.heritage.listed_building_grade === 'II*' ? '#ff9500' : '#ffcc00',
                    fontWeight: 600, fontSize: '0.85rem',
                  }}>
                    Grade {asset.heritage.listed_building_grade}
                  </span>
                </span>
              </div>
            )}
            {asset.heritage.listed_building_name && (
              <div className="property-detail-row">
                <span className="property-detail-label">Listed Name</span>
                <span className="property-detail-value">{asset.heritage.listed_building_name}</span>
              </div>
            )}
            {asset.heritage.listed_building_entry && (
              <div className="property-detail-row">
                <span className="property-detail-label">List Entry</span>
                <span className="property-detail-value">
                  <a
                    href={`https://historicengland.org.uk/listing/the-list/list-entry/${asset.heritage.listed_building_entry}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ color: '#0a84ff' }}
                  >
                    #{asset.heritage.listed_building_entry} <ExternalLink size={11} />
                  </a>
                </span>
              </div>
            )}
            <div className="property-detail-row">
              <span className="property-detail-label">Listed Buildings Nearby (200m)</span>
              <span className="property-detail-value">{formatNumber(asset.heritage.listed_buildings_nearby || 0)}</span>
            </div>
            {asset.heritage.nearby_detail?.length > 0 && (
              <div className="property-detail-row" style={{ flexDirection: 'column', gap: '4px' }}>
                <span className="property-detail-label">Nearby Detail</span>
                <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                  {asset.heritage.nearby_detail.slice(0, 5).map((b, i) => (
                    <div key={i} style={{ padding: '2px 0' }}>
                      Grade {b.grade} — {b.name} ({b.distance_m}m)
                    </div>
                  ))}
                  {asset.heritage.nearby_detail.length > 5 && (
                    <div style={{ opacity: 0.6 }}>+ {asset.heritage.nearby_detail.length - 5} more</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Environmental designations */}
      {asset.environment && (asset.environment.sssi_nearby || asset.environment.aonb_name || asset.environment.flood_zone > 0) && (
        <div className="glass-card" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-md)' }}>Environmental Constraints</h3>
          <div className="property-detail-grid">
            {asset.environment.flood_zone > 0 && (
              <div className="property-detail-row">
                <span className="property-detail-label">EA Flood Zone</span>
                <span className="property-detail-value">
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
                    background: asset.environment.flood_zone >= 3 ? 'rgba(255,59,48,0.15)' : 'rgba(255,149,0,0.15)',
                    color: asset.environment.flood_zone >= 3 ? '#ff3b30' : '#ff9500',
                    fontWeight: 600, fontSize: '0.85rem',
                  }}>
                    Zone {asset.environment.flood_zone}
                  </span>
                </span>
              </div>
            )}
            {asset.environment.flood_stations_1km > 0 && (
              <div className="property-detail-row">
                <span className="property-detail-label">Flood Monitoring Stations (1km)</span>
                <span className="property-detail-value">{asset.environment.flood_stations_1km}</span>
              </div>
            )}
            {asset.environment.flood_nearest_river && (
              <div className="property-detail-row">
                <span className="property-detail-label">Nearest River(s)</span>
                <span className="property-detail-value">{asset.environment.flood_nearest_river}</span>
              </div>
            )}
            {asset.environment.sssi_nearby && (
              <div className="property-detail-row">
                <span className="property-detail-label">SSSI</span>
                <span className="property-detail-value">
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
                    background: 'rgba(52,199,89,0.15)', color: '#34c759', fontWeight: 600, fontSize: '0.85rem',
                  }}>
                    {asset.environment.sssi_name || 'Nearby'}
                  </span>
                </span>
              </div>
            )}
            {asset.environment.aonb_name && (
              <div className="property-detail-row">
                <span className="property-detail-label">AONB / National Landscape</span>
                <span className="property-detail-value">
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
                    background: 'rgba(52,199,89,0.15)', color: '#34c759', fontWeight: 600, fontSize: '0.85rem',
                  }}>
                    {asset.environment.aonb_name}
                  </span>
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Deprivation context */}
      {asset.deprivation_level && (
        <div className="glass-card" style={{ padding: 'var(--space-lg)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-md)' }}>Deprivation Context</h3>
          <div className="property-detail-grid">
            <div className="property-detail-row">
              <span className="property-detail-label">Deprivation Level</span>
              <span className="property-detail-value" style={{ textTransform: 'capitalize' }}>
                {(asset.deprivation_level || '').replace(/_/g, ' ')}
              </span>
            </div>
            {asset.imd_decile != null && (
              <div className="property-detail-row">
                <span className="property-detail-label">IMD Decile</span>
                <span className="property-detail-value">
                  {asset.imd_decile} / 10
                  <span style={{ opacity: 0.6, marginLeft: '8px', fontSize: '0.8rem' }}>
                    (1 = most deprived)
                  </span>
                </span>
              </div>
            )}
            {asset.deprivation_score != null && (
              <div className="property-detail-row">
                <span className="property-detail-label">IMD Score (approx)</span>
                <span className="property-detail-value">{asset.deprivation_score.toFixed(1)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Valuation Context — Land Registry Price Paid comparables */}
      {asset.valuation?.comparables_count > 0 && (
        <div className="glass-card" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <TrendingUp size={16} style={{ color: '#30d158' }} /> Valuation Context — Land Registry
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginBottom: 'var(--space-md)' }}>
            Recent sales in {asset.valuation.area || asset.district || 'this area'}. These are area comparables, not direct valuations of this asset.
          </p>
          <div className="property-detail-grid" style={{ marginBottom: 'var(--space-md)' }}>
            <div className="property-detail-row">
              <span className="property-detail-label">Median Sale Price</span>
              <span className="property-detail-value" style={{ color: '#30d158', fontWeight: 600 }}>
                {formatCurrency(asset.valuation.median_price)}
              </span>
            </div>
            <div className="property-detail-row">
              <span className="property-detail-label">Price Range</span>
              <span className="property-detail-value">
                {formatCurrency(asset.valuation.min_price)} – {formatCurrency(asset.valuation.max_price)}
              </span>
            </div>
            <div className="property-detail-row">
              <span className="property-detail-label">Sales Analysed</span>
              <span className="property-detail-value">{asset.valuation.comparables_count}</span>
            </div>
            <div className="property-detail-row">
              <span className="property-detail-label">Date Range</span>
              <span className="property-detail-value">
                {asset.valuation.oldest_date || '?'} to {asset.valuation.most_recent_date || '?'}
              </span>
            </div>
          </div>

          {/* Top 10 comparables table */}
          {asset.valuation.comparables?.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table className="property-table">
                <thead>
                  <tr>
                    <th>Address</th>
                    <th>Postcode</th>
                    <th style={{ textAlign: 'right' }}>Price</th>
                    <th>Date</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {asset.valuation.comparables.slice(0, 10).map((c, i) => (
                    <tr key={i}>
                      <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.address || '-'}
                      </td>
                      <td>{c.postcode || '-'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatCurrency(c.price)}</td>
                      <td>{c.date || '-'}</td>
                      <td style={{ textTransform: 'capitalize' }}>
                        {(c.type || '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {asset.valuation.comparables.length > 10 && (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '8px', textAlign: 'center' }}>
                  Showing 10 of {asset.valuation.comparables.length} comparables
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Nearby Planning Applications */}
      {nearbyPlanning.length > 0 && (
        <div className="glass-card" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-md)' }}>Nearby Planning Activity</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-sm)' }}>
            Recent applications in the {asset.postcode?.split(' ')[0]} postcode area — indicates development pressure and may affect disposal value.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {nearbyPlanning.map((app, i) => (
              <div key={app.uid || i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem',
                fontSize: '0.8rem', padding: '6px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                    {app.description || app.address}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                    {app.address} • {app.start_date || ''}
                  </div>
                </div>
                <span style={{
                  flexShrink: 0, fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px',
                  background: (app.state || '').match(/Approved|Granted/i) ? 'rgba(48,209,88,0.15)' :
                    (app.state || '').match(/Refused|Rejected/i) ? 'rgba(255,69,58,0.15)' : 'rgba(255,255,255,0.08)',
                  color: (app.state || '').match(/Approved|Granted/i) ? '#30d158' :
                    (app.state || '').match(/Refused|Rejected/i) ? '#ff453a' : 'var(--text-secondary)',
                }}>
                  {app.state || 'Pending'}
                </span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '8px' }}>
            Source: PlanIt portal. Matched by outward postcode.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Assessment Tab ────────────────────────────────────────────────────────────

function SalesEvidenceSection({ evidence }) {
  if (!evidence?.length) return null
  return (
    <div className="glass-card" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
      <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <TrendingUp size={16} style={{ color: '#0a84ff' }} /> Sales Evidence
      </h3>
      <div style={{ overflowX: 'auto' }}>
        <table className="property-table">
          <thead>
            <tr>
              <th>Listing</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Price</th>
              <th>Method</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {evidence.map((ev, i) => (
              <tr key={i}>
                <td>
                  {ev.url ? (
                    <a
                      href={ev.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="property-internal-link"
                      style={{ padding: 0, background: 'none' }}
                    >
                      {ev.title || ev.type?.replace(/_/g, ' ') || 'Listing'} <ExternalLink size={11} />
                    </a>
                  ) : (
                    <span>{ev.title || ev.type?.replace(/_/g, ' ') || 'Listing'}</span>
                  )}
                  {ev.confidence && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                      {ev.confidence.replace(/_/g, ' ')}
                    </div>
                  )}
                </td>
                <td>
                  <Badge
                    label={ev.status || '-'}
                    color={ev.status === 'marketed' ? '#30d158' : ev.status === 'sold' ? '#0a84ff' : '#8e8e93'}
                    bg={ev.status === 'marketed' ? 'rgba(48,209,88,0.15)' : ev.status === 'sold' ? 'rgba(10,132,255,0.15)' : 'rgba(142,142,147,0.15)'}
                  />
                </td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{ev.price || '-'}</td>
                <td>{ev.method || '-'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{ev.date || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AssessmentTab({ asset }) {
  const assess = asset.assessment

  if (!assess) {
    return (
      <div className="glass-card" style={{ padding: 'var(--space-2xl)', textAlign: 'center' }}>
        <ClipboardCheck size={40} style={{ color: 'var(--text-tertiary)', marginBottom: 'var(--space-md)', opacity: 0.4 }} />
        <p style={{ color: 'var(--text-secondary)' }}>No assessment data available for this property.</p>
      </div>
    )
  }

  const recColor = recommendationColor(assess.recommendation)
  const confColor = confidenceColor(assess.confidence)
  const risks = assess.key_risks ? assess.key_risks.split(/[|;]/).map(r => r.trim()).filter(Boolean) : []
  const steps = assess.next_steps ? assess.next_steps.split(/[|;]/).map(s => s.trim()).filter(Boolean) : []

  return (
    <div>
      {/* Recommendation header */}
      <div className="glass-card" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-md)' }}>Assessment Recommendation</h3>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: 'var(--space-md)' }}>
          <Badge label={assess.recommendation} color={recColor} bg={`${recColor}20`} />
          {assess.confidence && (
            <Badge
              label={`${assess.confidence} confidence`}
              color={confColor}
              bg={`${confColor}15`}
            />
          )}
        </div>
        {assess.recommendation_category && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: 'var(--space-md)' }}>
            <Tag size={13} style={{ color: 'var(--text-tertiary)' }} />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{assess.recommendation_category}</span>
          </div>
        )}
        {assess.priority_score != null && (
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Priority Score</span>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: scoreColor(assess.priority_score) }}>
              {assess.priority_score}
            </div>
          </div>
        )}
      </div>

      {/* World-class scores */}
      <div className="glass-card" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-md)' }}>World-Class Scores</h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #94a3b8)', marginBottom: 'var(--space-md)' }}>
          Five-dimension assessment (0 = low priority, 100 = high priority)
        </p>
        {WORLD_CLASS_DIMENSIONS.map(d => (
          <WorldClassBar
            key={d.key}
            label={d.label}
            score={assess[d.key]}
            band={assess[d.bandKey]}
          />
        ))}
      </div>

      {/* Innovative uses */}
      {(assess.innovative_use_primary || assess.innovative_use_secondary) && (
        <div className="glass-card" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-sm)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Lightbulb size={16} style={{ color: '#ffd60a' }} /> Innovative Uses
            {assess.innovative_use_count != null && (
              <Badge label={`${assess.innovative_use_count} identified`} />
            )}
          </h3>
          {assess.innovative_use_primary && (
            <div className="assessment-innovative-item" style={{ marginBottom: assess.innovative_use_secondary ? 'var(--space-sm)' : 0 }}>
              <span className="assessment-innovative-tag">Primary</span>
              <span style={{ fontSize: '0.85rem' }}>{assess.innovative_use_primary}</span>
            </div>
          )}
          {assess.innovative_use_secondary && (
            <div className="assessment-innovative-item">
              <span className="assessment-innovative-tag secondary">Secondary</span>
              <span style={{ fontSize: '0.85rem' }}>{assess.innovative_use_secondary}</span>
            </div>
          )}
        </div>
      )}

      {/* Reasoning */}
      {assess.reasoning && (
        <div className="glass-card" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-sm)' }}>Reasoning</h3>
          {assess.reasoning.split(/\n|;\s*/).filter(Boolean).map((p, i) => (
            <p key={i} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-sm)', lineHeight: 1.6 }}>
              {p.trim()}
            </p>
          ))}
        </div>
      )}

      {/* Key risks */}
      {risks.length > 0 && (
        <div className="glass-card" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-sm)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertTriangle size={16} style={{ color: '#ff9f0a' }} /> Key Risks
          </h3>
          <ul style={{ margin: 0, paddingLeft: 'var(--space-lg)' }}>
            {risks.map((r, i) => (
              <li key={i} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Next steps */}
      {steps.length > 0 && (
        <div className="glass-card" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: 'var(--space-sm)' }}>Next Steps</h3>
          <ul style={{ margin: 0, paddingLeft: 'var(--space-lg)' }}>
            {steps.map((s, i) => (
              <li key={i} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Sales evidence */}
      <SalesEvidenceSection evidence={asset.sales_evidence} />
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

function PropertyDetail() {
  const { propertyId } = useParams()
  const config = useCouncilConfig()
  // Hooks must be called unconditionally (React Rules of Hooks)
  const auth = useAuth()
  const [activeTab, setActiveTab] = useState('overview')

  const { data, loading, error } = useData('/data/property_assets_detail.json')
  const { data: planningData } = useData('/data/planning.json')

  const asset = useMemo(() => {
    if (!data?.assets) return null
    return data.assets.find(a => a.id === propertyId) || null
  }, [data, propertyId])

  // Find nearby planning applications by postcode sector (e.g. BB11 3)
  const nearbyPlanning = useMemo(() => {
    if (!asset?.postcode || !planningData?.applications) return []
    const sector = asset.postcode.replace(/\s+/g, ' ').split(' ')[0] // outward code
    return planningData.applications
      .filter(a => a.postcode && a.postcode.startsWith(sector))
      .sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''))
      .slice(0, 10)
  }, [asset, planningData])

  // Strategist gate (same pattern as ProtectedRoute)
  if (isFirebaseEnabled) {
    const isStrategist = auth?.isStrategist || auth?.isAdmin
    if (!isStrategist) {
      return (
        <div style={{ maxWidth: 1200, margin: '0 auto', textAlign: 'center', padding: 'var(--space-2xl)' }}>
          <Shield size={48} style={{ color: 'var(--text-tertiary)', marginBottom: 'var(--space-md)' }} />
          <h2>Access Restricted</h2>
          <p style={{ color: 'var(--text-secondary)' }}>You need strategist access to view property data.</p>
        </div>
      )
    }
  }

  if (loading) return <LoadingState message="Loading property data..." />

  if (error) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', textAlign: 'center', padding: 'var(--space-2xl)' }}>
        <AlertTriangle size={48} style={{ color: '#ff453a', marginBottom: 'var(--space-md)' }} />
        <h2>Error Loading Data</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Could not load property data. Please try again later.</p>
        <Link to="/properties" className="property-internal-link" style={{ marginTop: 'var(--space-md)', display: 'inline-flex' }}>
          <ArrowLeft size={14} /> Back to Property Estate
        </Link>
      </div>
    )
  }

  if (!asset) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', textAlign: 'center', padding: 'var(--space-2xl)' }}>
        <Building size={48} style={{ color: 'var(--text-tertiary)', marginBottom: 'var(--space-md)', opacity: 0.4 }} />
        <h2>Asset Not Found</h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          No property found with ID: {propertyId}
        </p>
        <Link to="/properties" className="property-internal-link" style={{ marginTop: 'var(--space-md)', display: 'inline-flex' }}>
          <ArrowLeft size={14} /> Back to Property Estate
        </Link>
      </div>
    )
  }

  const categoryLabel = CATEGORY_LABELS[asset.category] || asset.category || 'Unknown'
  const categoryColor = CATEGORY_COLORS[asset.category] || '#8e8e93'
  const epcColor = EPC_COLORS[asset.epc_rating] || '#8e8e93'

  return (
    <div className="property-detail-page">
      {/* Back link */}
      <Link to="/properties" className="property-back-link">
        <ArrowLeft size={16} /> Back to Property Estate
      </Link>

      {/* Header */}
      <div className="property-detail-header">
        <h1 style={{ fontSize: '1.6rem', marginBottom: 'var(--space-xs)' }}>
          {asset.name || 'Unnamed Property'}
        </h1>
        {asset.address && (
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-xs)' }}>
            {asset.address}
          </p>
        )}
        {asset.postcode && (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', marginBottom: 'var(--space-md)' }}>
            {asset.postcode}
          </p>
        )}

        {/* Badge row */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Badge label={categoryLabel} color={categoryColor} bg={`${categoryColor}20`} />
          {asset.ownership && <Badge label={asset.ownership} />}
          {asset.epc_rating && (
            <Badge label={`EPC ${asset.epc_rating}`} color={epcColor} bg={`${epcColor}20`} />
          )}
          <Badge
            label={asset.active ? 'Active' : 'Inactive'}
            color={asset.active ? '#30d158' : '#ff453a'}
            bg={asset.active ? 'rgba(48,209,88,0.15)' : 'rgba(255,69,58,0.15)'}
          />
        </div>
      </div>

      {/* Score cards */}
      <div className="property-score-row">
        <ScoreCard label="Sell Score" score={asset.sell_score} icon={Trash2} />
        <ScoreCard label="Keep Score" score={asset.keep_score} icon={Shield} />
        <ScoreCard label="Co-locate Score" score={asset.colocate_score} icon={Navigation} />
      </div>

      {/* Primary recommendation */}
      {asset.primary_option && (
        <div className="glass-card" style={{
          padding: 'var(--space-sm) var(--space-lg)',
          marginBottom: 'var(--space-lg)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-sm)',
          fontSize: '0.85rem',
        }}>
          <span style={{ color: 'var(--text-secondary)' }}>Primary Recommendation:</span>
          <Badge
            label={asset.primary_option.charAt(0).toUpperCase() + asset.primary_option.slice(1)}
            color={RECOMMENDATION_COLORS[asset.primary_option.charAt(0).toUpperCase() + asset.primary_option.slice(1)] || '#0a84ff'}
            bg={`${RECOMMENDATION_COLORS[asset.primary_option.charAt(0).toUpperCase() + asset.primary_option.slice(1)] || '#0a84ff'}20`}
          />
        </div>
      )}

      {/* Tabs */}
      <div className="property-tabs">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              className={`property-tab${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <div className="property-tab-content">
        {activeTab === 'overview' && <OverviewTab asset={asset} />}
        {activeTab === 'financials' && <FinancialsTab asset={asset} />}
        {activeTab === 'energy' && <EnergyTab asset={asset} />}
        {activeTab === 'disposal' && <DisposalTab asset={asset} />}
        {activeTab === 'assessment' && <AssessmentTab asset={asset} />}
        {activeTab === 'valuation' && <ValuationTab asset={asset} />}
        {activeTab === 'location' && <LocationTab asset={asset} nearbyPlanning={nearbyPlanning} />}
      </div>
    </div>
  )
}

export default PropertyDetail
