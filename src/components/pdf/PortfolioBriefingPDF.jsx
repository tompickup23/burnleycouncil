/**
 * PortfolioBriefingPDF — Per-portfolio Cabinet Command briefing.
 *
 * Contains: portfolio overview, savings pipeline, service intelligence,
 * key directives, risk assessment, PR material, reform playbook.
 */
import React from 'react'
import { Document, Page, View, Text } from '@react-pdf/renderer'
import { styles, COLORS, FONT, SPACE } from './PDFDesignSystem.js'
import {
  PDFHeader, PDFFooter, ConfidentialBanner, CoverPage, SectionHeading, SubsectionHeading,
  Card, StatCard, StatsRow, BulletList, Table, Divider,
  KeyValue, ProgressBar,
  formatCurrency, formatPct, formatNumber,
} from './PDFComponents.jsx'

export function PortfolioBriefingPDF({ portfolio, directives, narrative, serviceIntel, fiscalOverview, councilName }) {
  if (!portfolio) return null

  const title = portfolio.short_title || portfolio.title || portfolio.id
  const totalSavings = (directives || []).reduce((s, d) => s + (d.save_central || 0), 0)
  const immediateSavings = (directives || []).filter(d => /immediate|0-3/i.test(d.timeline || '')).reduce((s, d) => s + (d.save_central || 0), 0)
  const budget = portfolio.budget_total || portfolio.budget?.total || 0

  // Group directives by category
  const byCategory = {}
  ;(directives || []).forEach(d => {
    const cat = d.category || 'general'
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push(d)
  })

  return (
    <Document>
      {/* Cover */}
      <CoverPage
        title={title}
        subtitle="Portfolio Intelligence Briefing"
        meta={`${portfolio.cabinet_member?.name || 'Cabinet Member'} • Budget: ${formatCurrency(budget)} • Savings Pipeline: ${formatCurrency(totalSavings)}`}
        classification="CONFIDENTIAL — CABINET USE ONLY"
        councilName={councilName || 'Lancashire County Council'}
      />

      {/* ─── PAGE 2: Portfolio Overview ─── */}
      <Page size="A4" style={styles.page}>
        <ConfidentialBanner text="CABINET BRIEFING — RESTRICTED DISTRIBUTION" />
        <PDFHeader title={title} subtitle="Portfolio Overview" classification="CABINET" />

        <StatsRow>
          <StatCard value={formatCurrency(budget)} label="Total Budget" />
          <StatCard value={formatCurrency(totalSavings)} label="Savings Identified" color={COLORS.success} />
          <StatCard value={formatCurrency(immediateSavings)} label="Immediate Wins" color={COLORS.warning} />
          <StatCard value={(directives || []).length.toString()} label="Active Directives" />
        </StatsRow>

        {/* Portfolio Details */}
        <Card>
          <KeyValue label="Cabinet Member" value={portfolio.cabinet_member?.name || '—'} color={COLORS.accent} />
          <KeyValue label="Lead Officer" value={portfolio.lead_officer?.name || '—'} />
          <KeyValue label="Directorate" value={portfolio.directorate || '—'} />
          {portfolio.statutory_duties?.length > 0 && (
            <>
              <Divider />
              <SubsectionHeading title="Statutory Duties" />
              <BulletList items={portfolio.statutory_duties.slice(0, 6).map(d => typeof d === 'string' ? d : d.duty || d.description || '')} />
            </>
          )}
        </Card>

        {/* Demand Pressures */}
        {portfolio.demand_pressures?.length > 0 && (
          <>
            <SectionHeading title="Demand Pressures" />
            {portfolio.demand_pressures.slice(0, 6).map((dp, i) => (
              <Card key={i}>
                <Text style={{ fontSize: FONT.h4, fontFamily: FONT.bold, color: COLORS.warning }}>
                  {typeof dp === 'string' ? dp : dp.pressure || dp.title || ''}
                </Text>
                {typeof dp === 'object' && dp.detail && (
                  <Text style={{ fontSize: FONT.small, color: COLORS.textSecondary, marginTop: 2 }}>{dp.detail}</Text>
                )}
                {typeof dp === 'object' && dp.trend && (
                  <Text style={{ fontSize: FONT.micro, color: dp.trend === 'increasing' ? COLORS.danger : COLORS.success }}>
                    Trend: {dp.trend}
                  </Text>
                )}
              </Card>
            ))}
          </>
        )}

        <PDFFooter councilName={councilName} classification="PORTFOLIO BRIEFING" />
      </Page>

      {/* ─── PAGE 3: Savings Pipeline ─── */}
      <Page size="A4" style={styles.page}>
        <ConfidentialBanner text="CABINET BRIEFING — RESTRICTED DISTRIBUTION" />
        <PDFHeader title={title} subtitle="Savings Pipeline & Directives" classification="CABINET" />

        {/* Top Directives Table */}
        <SectionHeading title="Priority Directives" />
        <Table
          columns={[
            { key: 'action', label: 'Action', flex: 3 },
            { key: 'savings', label: 'Savings', width: 65, align: 'right', bold: true },
            { key: 'timeline', label: 'Timeline', width: 70 },
            { key: 'category', label: 'Category', width: 70 },
          ]}
          rows={(directives || []).sort((a, b) => (b.save_central || 0) - (a.save_central || 0)).slice(0, 15).map(d => ({
            action: d.action?.substring(0, 80) || '—',
            savings: formatCurrency((d.save_central || 0) * 1e6),
            timeline: d.timeline || '—',
            category: d.category?.replace(/_/g, ' ') || '—',
          }))}
        />

        {/* By Category */}
        {Object.entries(byCategory).map(([cat, items]) => {
          const catSavings = items.reduce((s, d) => s + (d.save_central || 0), 0)
          return (
            <Card key={cat}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACE.xs }}>
                <Text style={{ fontSize: FONT.h4, fontFamily: FONT.bold, color: COLORS.textPrimary }}>
                  {cat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </Text>
                <Text style={{ fontSize: FONT.h4, fontFamily: FONT.bold, color: COLORS.success }}>
                  {formatCurrency(catSavings * 1e6)}
                </Text>
              </View>
              <Text style={{ fontSize: FONT.micro, color: COLORS.textMuted }}>
                {items.length} directive{items.length !== 1 ? 's' : ''}
              </Text>
              <ProgressBar value={catSavings} max={totalSavings || 1} color={COLORS.accent} showPct={false} />
            </Card>
          )
        })}

        <PDFFooter councilName={councilName} classification="PORTFOLIO BRIEFING" />
      </Page>

      {/* ─── PAGE 4: Service Intelligence ─── */}
      {serviceIntel && (
        <Page size="A4" style={styles.page}>
          <ConfidentialBanner text="CABINET BRIEFING — RESTRICTED DISTRIBUTION" />
          <PDFHeader title={title} subtitle="Service Intelligence" classification="CABINET" />

          {serviceIntel.sendProjection && (
            <>
              <SectionHeading title="SEND Cost Intelligence" />
              <Card highlight>
                <KeyValue label="Base SEND Cost" value={formatCurrency(serviceIntel.sendProjection.base_cost)} />
                <KeyValue label="5yr Growth" value={formatCurrency(serviceIntel.sendProjection.total_growth)} color={COLORS.danger} />
                {serviceIntel.sendProjection.cost_breakdown && Object.entries(serviceIntel.sendProjection.cost_breakdown).map(([k, v]) => (
                  <KeyValue key={k} label={k.replace(/_/g, ' ')} value={formatCurrency(v)} />
                ))}
              </Card>
            </>
          )}

          {serviceIntel.ascProjection && (
            <>
              <SectionHeading title="ASC Demand Intelligence" />
              <Card highlight>
                <KeyValue label="Demographic Pressure" value={serviceIntel.ascProjection.demographic_pressure || '—'} />
                <KeyValue label="Market Sustainability" value={serviceIntel.ascProjection.market_sustainability || '—'} />
                {serviceIntel.ascProjection.yearly?.slice(0, 3).map((y, i) => (
                  <KeyValue key={i} label={`Year ${y.year || i + 1}`} value={formatCurrency(y.total_cost)} />
                ))}
              </Card>
            </>
          )}

          {serviceIntel.highwayTrajectory && (
            <>
              <SectionHeading title="Highway Asset Intelligence" />
              <Card highlight>
                <KeyValue label="Maintenance Backlog" value={formatCurrency(serviceIntel.highwayTrajectory.maintenance_gap)} color={COLORS.danger} />
                <KeyValue label="LED Conversion" value={formatPct(serviceIntel.highwayTrajectory.led?.conversion_pct)} />
              </Card>
            </>
          )}

          {serviceIntel.wasteComparison && (
            <>
              <SectionHeading title="Waste Disposal Intelligence" />
              <Card highlight>
                <KeyValue label="Market HHI" value={formatNumber(serviceIntel.wasteComparison.market_hhi)} />
                {serviceIntel.wasteComparison.scenarios?.slice(0, 3).map((s, i) => (
                  <KeyValue key={i} label={s.name || `Scenario ${i + 1}`} value={formatCurrency(s.annual_cost)} />
                ))}
              </Card>
            </>
          )}

          <PDFFooter councilName={councilName} classification="PORTFOLIO BRIEFING" />
        </Page>
      )}

      {/* ─── PAGE 5: PR & Reform Narrative ─── */}
      {narrative && (
        <Page size="A4" style={styles.page}>
          <ConfidentialBanner text="CABINET BRIEFING — RESTRICTED DISTRIBUTION" />
          <PDFHeader title={title} subtitle="Reform Narrative & PR Material" classification="CABINET" />

          {/* Press Releases */}
          {narrative.press_releases?.length > 0 && (
            <>
              <SectionHeading title="Draft Press Releases" />
              {narrative.press_releases.map((pr, i) => (
                <Card key={i} accent>
                  <Text style={{ fontSize: FONT.h3, fontFamily: FONT.bold, color: COLORS.accent }}>{pr.headline}</Text>
                  <Text style={{ fontSize: FONT.body, color: COLORS.textSecondary, marginTop: 3 }}>{pr.standfirst}</Text>
                  <Text style={{ fontSize: FONT.small, color: COLORS.textPrimary, marginTop: 3 }}>Key fact: {pr.key_fact}</Text>
                  <Text style={{ fontSize: FONT.micro, color: COLORS.warning, marginTop: 3 }}>{pr.timing}</Text>
                </Card>
              ))}
            </>
          )}

          {/* Borough Campaign Material */}
          {narrative.borough_campaign && (
            <>
              <SectionHeading title="Borough Election Material" />
              <Card>
                <SubsectionHeading title="Social Media Post" />
                <Text style={{ fontSize: FONT.body, color: COLORS.textPrimary, fontStyle: 'italic', lineHeight: 1.5 }}>
                  {narrative.borough_campaign.social_media}
                </Text>
              </Card>
              <Card>
                <SubsectionHeading title="Leaflet Line" />
                <Text style={{ fontSize: FONT.body, color: COLORS.textPrimary, lineHeight: 1.5 }}>
                  {narrative.borough_campaign.leaflet_line}
                </Text>
              </Card>
              <Card>
                <SubsectionHeading title="Canvassing Script" />
                <Text style={{ fontSize: FONT.body, color: COLORS.textPrimary, fontStyle: 'italic', lineHeight: 1.5 }}>
                  "{narrative.borough_campaign.canvassing_script}"
                </Text>
              </Card>
            </>
          )}

          {/* Constituency Talking Points */}
          {narrative.constituency_talking_points?.length > 0 && (
            <>
              <SectionHeading title="Constituency Talking Points" />
              <BulletList items={narrative.constituency_talking_points} color={COLORS.accent} />
            </>
          )}

          <PDFFooter councilName={councilName} classification="PORTFOLIO BRIEFING" />
        </Page>
      )}

      {/* ─── Key Contracts ─── */}
      {portfolio.key_contracts?.length > 0 && (
        <Page size="A4" style={styles.page}>
          <ConfidentialBanner text="CABINET BRIEFING — RESTRICTED DISTRIBUTION" />
          <PDFHeader title={title} subtitle="Key Contracts & Risk Register" classification="CABINET" />

          <SectionHeading title="Key Contracts" />
          <Table
            columns={[
              { key: 'supplier', label: 'Supplier', flex: 2, bold: true },
              { key: 'value', label: 'Value', width: 70, align: 'right' },
              { key: 'scope', label: 'Scope', flex: 2 },
              { key: 'risk', label: 'Risk', width: 50 },
            ]}
            rows={(portfolio.key_contracts || []).map(c => ({
              supplier: c.supplier || c.name || '—',
              value: c.value || c.annual_value || '—',
              scope: c.scope || c.description || '—',
              risk: c.risk_level || c.risk || '—',
              _colors: { risk: c.risk_level === 'high' ? COLORS.danger : c.risk_level === 'medium' ? COLORS.warning : COLORS.textPrimary },
            }))}
          />

          {/* Savings Levers */}
          {portfolio.savings_levers?.length > 0 && (
            <>
              <SectionHeading title="Savings Levers" />
              <Table
                columns={[
                  { key: 'action', label: 'Lever', flex: 3 },
                  { key: 'saving', label: 'Est. Saving', width: 80, align: 'right', bold: true },
                  { key: 'timeline', label: 'Timeline', width: 80 },
                  { key: 'owner', label: 'Owner', width: 60 },
                ]}
                rows={(portfolio.savings_levers || []).map(l => ({
                  action: l.action?.substring(0, 70) || '—',
                  saving: l.est_saving || l.saving || '—',
                  timeline: l.timeline || '—',
                  owner: l.owner || '—',
                }))}
              />
            </>
          )}

          <PDFFooter councilName={councilName} classification="PORTFOLIO BRIEFING" />
        </Page>
      )}
    </Document>
  )
}
