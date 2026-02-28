/**
 * PropertyDetail -- Individual LCC property asset detail page.
 *
 * Route: /property/:propertyId
 *
 * Strategist-only page with 6 tabs:
 *   1. Overview -- Ownership, category, deprivation, Google Maps link
 *   2. Financials -- Linked spend, supplier breakdown
 *   3. Energy -- EPC rating, heating, floor area
 *   4. Disposal -- Recommendation, priority, reasoning, risks
 *   5. Assessment -- World-class scores, innovative uses, sales evidence
 *   6. Location -- District, constituency, co-location, flood, crime
 *
 * Data: /data/property_assets_detail.json
 */
import { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Building, MapPin, Zap, Trash2, Navigation, ArrowLeft,
  ExternalLink, AlertTriangle, Shield, Thermometer,
  ClipboardCheck, Tag, Lightbulb, TrendingUp,
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

function LocationTab({ asset }) {
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
        <div className="glass-card" style={{ padding: 'var(--space-lg)' }}>
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

  const asset = useMemo(() => {
    if (!data?.assets) return null
    return data.assets.find(a => a.id === propertyId) || null
  }, [data, propertyId])

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
        {activeTab === 'location' && <LocationTab asset={asset} />}
      </div>
    </div>
  )
}

export default PropertyDetail
