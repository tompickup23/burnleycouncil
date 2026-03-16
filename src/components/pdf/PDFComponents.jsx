/**
 * PDFComponents - Shared reusable components for all AI DOGE PDF exports.
 *
 * These components provide the visual building blocks: headers, footers,
 * stat cards, tables, talking point cards, progress bars, tier badges, etc.
 */
import React from 'react'
import { View, Text, Page, Svg, Rect, Line, G, Circle, Path } from '@react-pdf/renderer'
import { styles, COLORS, FONT, SPACE, PAGE, tierColor, partyColor, severityColor, formatCurrency, formatPct, formatNumber, formatDate, daysUntil } from './PDFDesignSystem.js'

// ── Page Header ──
export function PDFHeader({ title, subtitle, classification, date }) {
  return (
    <View style={styles.header} fixed>
      <View>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
      </View>
      <View style={styles.headerRight}>
        <Text style={styles.headerBrand}>AI DOGE Intelligence</Text>
        {classification && (
          <Text style={{ fontSize: FONT.tiny, color: COLORS.danger, fontFamily: FONT.bold, marginTop: 2 }}>
            {classification}
          </Text>
        )}
        <Text style={{ fontSize: FONT.micro, color: COLORS.textMuted, marginTop: 2 }}>
          {date || new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
        </Text>
      </View>
    </View>
  )
}

// ── Page Footer ──
export function PDFFooter({ councilName, classification }) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>
        {classification || 'CONFIDENTIAL'} | {councilName || 'AI DOGE'} | Generated {new Date().toLocaleDateString('en-GB')}
      </Text>
      <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  )
}

// ── Confidential Banner ──
export function ConfidentialBanner({ text }) {
  return (
    <View style={styles.confidentialBanner} fixed>
      <Text style={styles.confidentialText}>{text || 'CONFIDENTIAL - FOR REFORM UK INTERNAL USE ONLY'}</Text>
    </View>
  )
}

// ── Section Heading ──
export function SectionHeading({ title, subtitle }) {
  return (
    <View wrap={false}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle && <Text style={{ ...styles.textSmall, marginTop: -SPACE.sm, marginBottom: SPACE.sm }}>{subtitle}</Text>}
    </View>
  )
}

// ── Subsection Heading ──
export function SubsectionHeading({ title }) {
  return <Text style={styles.subsectionTitle}>{title}</Text>
}

// ── Stat Card ──
export function StatCard({ value, label, detail, color }) {
  return (
    <View style={styles.statCard}>
      <Text style={{ ...styles.statValue, color: color || COLORS.accent }}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {detail && <Text style={styles.statDetail}>{detail}</Text>}
    </View>
  )
}

// ── Stats Row (grid of stat cards) ──
export function StatsRow({ children }) {
  return <View style={styles.statsRow}>{children}</View>
}

// ── Card ──
export function Card({ children, accent, highlight, style }) {
  const baseStyle = accent ? styles.cardAccent : highlight ? styles.cardHighlight : styles.card
  return <View style={{ ...baseStyle, ...style }} wrap={false}>{children}</View>
}

// ── Table ──
export function Table({ columns, rows, striped = true }) {
  return (
    <View style={styles.table}>
      <View style={styles.tableHeader}>
        {columns.map((col, i) => (
          <Text key={i} style={{ ...styles.tableHeaderCell, width: col.width || 'auto', flex: col.flex || 1, textAlign: col.align || 'left' }}>
            {col.label}
          </Text>
        ))}
      </View>
      {rows.map((row, ri) => (
        <View key={ri} style={striped && ri % 2 === 1 ? styles.tableRowAlt : styles.tableRow}>
          {columns.map((col, ci) => (
            <Text key={ci} style={{
              ...(col.muted ? styles.tableCellMuted : styles.tableCell),
              width: col.width || 'auto',
              flex: col.flex || 1,
              textAlign: col.align || 'left',
              fontFamily: col.bold ? FONT.bold : FONT.regular,
              color: row._colors?.[col.key] || (col.muted ? COLORS.textSecondary : COLORS.textPrimary),
            }}>
              {row[col.key] ?? '-'}
            </Text>
          ))}
        </View>
      ))}
    </View>
  )
}

// ── Bullet List ──
export function BulletList({ items, color }) {
  return (
    <View>
      {items.map((item, i) => (
        <View key={i} style={styles.bulletItem}>
          <Text style={{ ...styles.bulletDot, color: color || COLORS.accent }}>•</Text>
          <Text style={styles.bulletText}>{typeof item === 'string' ? item : item.text || ''}</Text>
        </View>
      ))}
    </View>
  )
}

// ── Talking Point Card ──
export function TalkingPoint({ text, category, priority, borderColor }) {
  const color = borderColor || (priority === 0 ? COLORS.danger : priority === 1 ? COLORS.warning : COLORS.accent)
  return (
    <View style={{ ...styles.talkingPoint, borderLeftColor: color }} wrap={false}>
      <View style={{ flex: 1 }}>
        {category && <Text style={styles.talkingPointCategory}>{category}</Text>}
        <Text style={styles.talkingPointText}>{text}</Text>
      </View>
    </View>
  )
}

// ── Tier Badge ──
export function TierBadge({ tier, label }) {
  const color = tierColor(tier)
  return (
    <View style={{ ...styles.tierBadge, backgroundColor: color + '22', borderWidth: 1, borderColor: color }}>
      <Text style={{ ...styles.tierText, color }}>{label || tier?.replace(/_/g, ' ')}</Text>
    </View>
  )
}

// ── Party Badge ──
export function PartyBadge({ party }) {
  const color = partyColor(party)
  return (
    <View style={{ ...styles.badge, backgroundColor: color + '22', borderWidth: 1, borderColor: color }}>
      <Text style={{ ...styles.badgeText, color }}>{party}</Text>
    </View>
  )
}

// ── Progress Bar ──
export function ProgressBar({ value, max = 100, color, label, showPct = true }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  const fillColor = color || COLORS.accent
  return (
    <View style={{ marginBottom: SPACE.xs }}>
      {label && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
          <Text style={{ fontSize: FONT.micro, color: COLORS.textSecondary }}>{label}</Text>
          {showPct && <Text style={{ fontSize: FONT.micro, color: fillColor }}>{pct.toFixed(0)}%</Text>}
        </View>
      )}
      <View style={styles.progressBg}>
        <View style={{ ...styles.progressFill, width: `${pct}%`, backgroundColor: fillColor }} />
      </View>
    </View>
  )
}

// ── Divider ──
export function Divider({ accent }) {
  return <View style={accent ? styles.dividerAccent : styles.divider} />
}

// ── Key-Value Row ──
export function KeyValue({ label, value, color }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
      <Text style={{ fontSize: FONT.small, color: COLORS.textSecondary }}>{label}</Text>
      <Text style={{ fontSize: FONT.small, fontFamily: FONT.bold, color: color || COLORS.textPrimary }}>{value}</Text>
    </View>
  )
}

// ── Horizontal Bar Chart (pure View/Text, no SVG) ──
export function HorizontalBarChart({ data, maxBars = 10 }) {
  const items = data.slice(0, maxBars)
  const maxVal = Math.max(...items.map(d => d.value), 1)

  return (
    <View>
      {items.map((d, i) => {
        const pct = Math.min(100, (d.value / maxVal) * 100)
        const color = d.color || COLORS.chart[i % COLORS.chart.length]
        return (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3 }}>
            <Text style={{ fontSize: FONT.tiny, color: COLORS.textSecondary, width: 120 }}>{d.label?.substring(0, 22)}</Text>
            <View style={{ flex: 1, height: 12, backgroundColor: COLORS.bgCardAlt, borderRadius: 3, overflow: 'hidden' }}>
              <View style={{ height: 12, width: `${pct}%`, backgroundColor: color, borderRadius: 3 }} />
            </View>
            <Text style={{ fontSize: FONT.tiny, fontFamily: FONT.bold, color: COLORS.textPrimary, width: 55, textAlign: 'right' }}>
              {typeof d.value === 'number' ? (d.value > 1000 ? formatCurrency(d.value) : d.value.toLocaleString()) : d.value}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

// ── Vertical Bar Chart (pure View/Text, no SVG) ──
export function VerticalBarChart({ data, maxBars = 15 }) {
  const items = data.slice(0, maxBars)
  const maxVal = Math.max(...items.map(d => d.value), 1)

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 120 }}>
      {items.map((d, i) => {
        const pct = Math.min(100, (d.value / maxVal) * 100)
        const color = d.color || COLORS.chart[i % COLORS.chart.length]
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ width: '80%', height: `${pct}%`, backgroundColor: color, borderRadius: 2, minHeight: 2 }} />
            <Text style={{ fontSize: 5, color: COLORS.textMuted, marginTop: 2 }}>{d.label?.substring(0, 6)}</Text>
          </View>
        )
      })}
    </View>
  )
}

// ── Donut / Pie Chart (SVG) ──
export function DonutChart({ data, size = 100, innerRadius = 30, label }) {
  const total = data.reduce((s, d) => s + (d.value || 0), 0)
  if (total === 0) return <View />
  const cx = size / 2
  const cy = size / 2
  const r = (size / 2) - 4
  let startAngle = -90

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size}>
        {data.map((d, i) => {
          const pct = d.value / total
          const angle = pct * 360
          const endAngle = startAngle + angle
          const largeArc = angle > 180 ? 1 : 0
          const startRad = (startAngle * Math.PI) / 180
          const endRad = (endAngle * Math.PI) / 180
          const x1 = cx + r * Math.cos(startRad)
          const y1 = cy + r * Math.sin(startRad)
          const x2 = cx + r * Math.cos(endRad)
          const y2 = cy + r * Math.sin(endRad)
          const ix1 = cx + innerRadius * Math.cos(startRad)
          const iy1 = cy + innerRadius * Math.sin(startRad)
          const ix2 = cx + innerRadius * Math.cos(endRad)
          const iy2 = cy + innerRadius * Math.sin(endRad)
          const path = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix1} ${iy1} Z`
          startAngle = endAngle
          const color = d.color || COLORS.chart[i % COLORS.chart.length]
          return <Path key={i} d={path} fill={color} />
        })}
      </Svg>
      {label && <Text style={{ fontSize: FONT.tiny, color: COLORS.textPrimary, marginTop: 2 }}>{label}</Text>}
    </View>
  )
}

// ── Cover Page ──
export function CoverPage({ title, subtitle, meta, classification, councilName }) {
  return (
    <Page size="A4" style={styles.page}>
      <ConfidentialBanner text={classification} />
      <View style={styles.heroSection}>
        <Text style={{ fontSize: 10, color: COLORS.accent, letterSpacing: 3, textTransform: 'uppercase', marginBottom: SPACE.xl }}>
          AI DOGE INTELLIGENCE
        </Text>
        <Text style={styles.heroTitle}>{title}</Text>
        {subtitle && <Text style={styles.heroSubtitle}>{subtitle}</Text>}
        {meta && <Text style={styles.heroMeta}>{meta}</Text>}
      </View>
      <PDFFooter councilName={councilName} classification={classification} />
    </Page>
  )
}

// ── Election History Row ──
export function ElectionHistoryTable({ history, wardName }) {
  if (!history?.length) return <View />
  const rows = history.slice(0, 10).map(e => {
    const sorted = [...(e.candidates || [])].sort((a, b) => b.votes - a.votes)
    const winner = sorted[0]
    const runnerUp = sorted[1]
    const margin = winner && runnerUp ? winner.votes - runnerUp.votes : null
    const turnoutPct = e.turnout ? (e.turnout * 100).toFixed(1) + '%' : e.turnout_pct ? e.turnout_pct.toFixed(1) + '%' : '-'
    return {
      year: String(e.year),
      winner: winner?.name || '-',
      winnerParty: winner?.party || '-',
      votes: winner?.votes?.toLocaleString() || '-',
      margin: margin != null ? margin.toLocaleString() : '-',
      turnout: turnoutPct,
      _colors: { winnerParty: partyColor(winner?.party) },
    }
  })

  return (
    <Table
      columns={[
        { key: 'year', label: 'Year', width: 40 },
        { key: 'winner', label: 'Winner', flex: 2 },
        { key: 'winnerParty', label: 'Party', flex: 1 },
        { key: 'votes', label: 'Votes', width: 50, align: 'right' },
        { key: 'margin', label: 'Margin', width: 50, align: 'right' },
        { key: 'turnout', label: 'Turnout', width: 50, align: 'right' },
      ]}
      rows={rows}
    />
  )
}

// ── Ward Specific Issues (BURNLEY_WARD_INTEL integration) ──
export function WardIssuesCard({ wardName, wardIntel, hmoData, housingData, economyData, articles }) {
  const intel = wardIntel || {}
  const issues = [...(intel.local_issues || [])]

  // Add HMO data for this ward
  if (hmoData?.modelling?.hotspot_wards) {
    const wardHMO = hmoData.modelling.hotspot_wards.find(w => w.ward === wardName)
    if (wardHMO && wardHMO.estimated_hmos > 20) {
      issues.push(`HMO concentration: ~${wardHMO.estimated_hmos} estimated HMOs (${wardHMO.pct_of_ward_stock}% of ward stock)`)
    }
  }

  // Add homelessness pressure
  if (housingData?.homelessness?.enquiries) {
    issues.push(`Borough-wide homelessness pressure: ${housingData.homelessness.enquiries.toLocaleString()} enquiries in current year`)
  }

  // Add economy data
  if (economyData?.claimant_count?.ward_latest) {
    const wardEcon = Object.values(economyData.claimant_count.ward_latest).find(w => w.ward_name === wardName)
    if (wardEcon?.rate && wardEcon.rate > 5) {
      issues.push(`Claimant count ${wardEcon.rate.toFixed(1)}%, above average`)
    }
  }

  // Add article-sourced issues (e.g., Hapton waste)
  if (articles?.length) {
    articles.forEach(a => issues.push(a))
  }

  if (!issues.length) return <View />

  return (
    <Card accent>
      <Text style={styles.sectionSubtitle}>Ward-Specific Issues</Text>
      <BulletList items={issues} color={COLORS.warning} />
      {intel.messaging && (
        <View style={{ marginTop: SPACE.sm }}>
          <Text style={{ fontSize: FONT.micro, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Core Message</Text>
          <Text style={{ fontSize: FONT.small, color: COLORS.accent, fontFamily: FONT.bold, marginTop: 2 }}>{intel.messaging}</Text>
        </View>
      )}
    </Card>
  )
}

// re-export design system for convenience
export { COLORS, FONT, SPACE, PAGE, formatCurrency, formatPct, formatNumber, formatDate, daysUntil, tierColor, partyColor, severityColor }
