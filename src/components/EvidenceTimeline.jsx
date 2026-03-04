/**
 * EvidenceTimeline — Vertical timeline showing data provenance per property.
 *
 * Displays where each piece of information came from, when it was gathered,
 * and how confident the data is. Groups by source for clarity.
 *
 * Props:
 *   trail {array} - Evidence trail entries [{field, value, source, source_label, date, confidence, source_url}]
 */
import { useMemo } from 'react'
import './EvidenceTimeline.css'

const SOURCE_CONFIG = {
  codex_csv:                   { icon: '📋', color: '#3b82f6', label: 'Codex Property Register' },
  epc_register:                { icon: '⚡', color: '#22c55e', label: 'EPC Register' },
  lcc_website:                 { icon: '🌐', color: '#10b981', label: 'LCC Website' },
  lcc_spending_data:           { icon: '💰', color: '#f59e0b', label: 'LCC Spending Data' },
  environment_agency_api:      { icon: '🌊', color: '#06b6d4', label: 'Environment Agency' },
  historic_england_api:        { icon: '🏛️', color: '#8b5cf6', label: 'Historic England' },
  natural_england_api:         { icon: '🌿', color: '#22c55e', label: 'Natural England' },
  disposal_engine:             { icon: '⚙️', color: '#f97316', label: 'Disposal Engine' },
  facility_enrichment_override:{ icon: '🔄', color: '#ef4444', label: 'Enrichment Override' },
}

const CONFIDENCE_DOTS = {
  high:   { color: '#22c55e', label: 'High confidence' },
  medium: { color: '#f59e0b', label: 'Medium confidence' },
  low:    { color: '#ef4444', label: 'Low confidence' },
}

const FIELD_LABELS = {
  name: 'Property Name',
  address: 'Address',
  postcode: 'Postcode',
  category: 'Category',
  ownership: 'Ownership',
  epc_rating: 'EPC Rating',
  service_status: 'Service Status',
  operator: 'Operator',
  service_type: 'Service Type',
  community_managed: 'Community Managed',
  services_provided: 'Services Provided',
  occupancy_override: 'Occupancy Override',
  flood_zone: 'Flood Zone',
  listed_building_grade: 'Listed Building Grade',
  sssi_nearby: 'SSSI Nearby',
  linked_spend: 'Linked Spend',
}

export default function EvidenceTimeline({ trail = [] }) {
  // Group entries by source
  const grouped = useMemo(() => {
    const groups = {}
    for (const entry of trail) {
      const src = entry.source || 'unknown'
      if (!groups[src]) groups[src] = []
      groups[src].push(entry)
    }
    // Sort groups: most recent date first
    const sorted = Object.entries(groups).sort((a, b) => {
      const dateA = a[1][0]?.date || ''
      const dateB = b[1][0]?.date || ''
      return dateB.localeCompare(dateA)
    })
    return sorted
  }, [trail])

  if (!trail.length) {
    return (
      <div className="evidence-timeline-empty">
        <span className="evidence-timeline-empty-icon">📋</span>
        No evidence trail available for this property.
      </div>
    )
  }

  return (
    <div className="evidence-timeline">
      {grouped.map(([source, entries]) => {
        const config = SOURCE_CONFIG[source] || { icon: '📄', color: '#94a3b8', label: source }
        const latestDate = entries[0]?.date || ''
        const sourceUrl = entries.find(e => e.source_url)?.source_url

        return (
          <div key={source} className="evidence-timeline-group">
            {/* Source header */}
            <div className="evidence-timeline-source" style={{ borderLeftColor: config.color }}>
              <span className="evidence-timeline-source-icon">{config.icon}</span>
              <div className="evidence-timeline-source-info">
                <span className="evidence-timeline-source-label">
                  {sourceUrl ? (
                    <a href={sourceUrl} target="_blank" rel="noopener noreferrer"
                       style={{ color: config.color }}>{config.label}</a>
                  ) : (
                    config.label
                  )}
                </span>
                {latestDate && (
                  <span className="evidence-timeline-source-date">{latestDate}</span>
                )}
              </div>
            </div>

            {/* Field entries */}
            <div className="evidence-timeline-entries">
              {entries.map((entry, i) => {
                const conf = CONFIDENCE_DOTS[entry.confidence] || CONFIDENCE_DOTS.medium
                const fieldLabel = FIELD_LABELS[entry.field] || entry.field?.replace(/_/g, ' ')

                return (
                  <div key={i} className="evidence-timeline-entry">
                    <span className="evidence-timeline-field">{fieldLabel}</span>
                    <span className="evidence-timeline-value">{entry.value}</span>
                    <span
                      className="evidence-timeline-confidence"
                      style={{ backgroundColor: conf.color }}
                      title={conf.label}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
