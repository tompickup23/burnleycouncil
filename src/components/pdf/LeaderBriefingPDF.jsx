/**
 * LeaderBriefingPDF — Comprehensive leader overview covering all portfolios.
 *
 * The "Monday Morning" document: fiscal system overview, all directorates,
 * top savings opportunities, MTFS comparison, political impact, key actions.
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

export function LeaderBriefingPDF({
  portfolios, directorates, allDirectives, fiscalOverview,
  mtfsComparison, politicalImpact, mondayMorningList, councilName,
}) {
  // Aggregate stats
  const totalSavings = (allDirectives || []).reduce((s, d) => s + (d.save_central || 0), 0)
  const immediateDirectives = (allDirectives || []).filter(d => /immediate|0-3/i.test(d.timeline || ''))
  const immediateSavings = immediateDirectives.reduce((s, d) => s + (d.save_central || 0), 0)
  const totalBudget = (portfolios || []).reduce((s, p) => s + (p.budget_total || p.budget?.total || 0), 0)

  // Fiscal system coverage
  const coveragePct = fiscalOverview?.coverage_pct || 0
  const modelsComplete = fiscalOverview?.models_complete || 0
  const modelsTotal = fiscalOverview?.models_total || 10

  return (
    <Document>
      {/* Cover */}
      <CoverPage
        title="Leader's Briefing"
        subtitle="Lancashire County Council — Reform Operations Command"
        meta={`${(portfolios || []).length} portfolios • ${formatCurrency(totalSavings * 1e6)} savings pipeline • Generated ${new Date().toLocaleDateString('en-GB')}`}
        classification="CONFIDENTIAL — LEADER USE ONLY"
        councilName={councilName || 'Lancashire County Council'}
      />

      {/* ─── PAGE 2: Fiscal System Overview ─── */}
      <Page size="A4" style={styles.page}>
        <ConfidentialBanner text="LEADER BRIEFING — MOST RESTRICTED" />
        <PDFHeader title="Fiscal System Overview" subtitle="Reform Operations Command" classification="LEADER" />

        <StatsRow>
          <StatCard value={formatCurrency(totalBudget)} label="Total Budget" />
          <StatCard value={formatCurrency(totalSavings * 1e6)} label="Savings Pipeline" color={COLORS.success} />
          <StatCard value={formatCurrency(immediateSavings * 1e6)} label="Immediate Wins" color={COLORS.warning} />
          <StatCard value={`${coveragePct}%`} label="Model Coverage" color={coveragePct > 60 ? COLORS.success : COLORS.warning} detail={`${modelsComplete}/${modelsTotal} modelled`} />
        </StatsRow>

        {/* Directorate Summary */}
        <SectionHeading title="Directorate Summary" />
        <Table
          columns={[
            { key: 'name', label: 'Directorate', flex: 2, bold: true },
            { key: 'portfolios', label: 'Portfolios', width: 55, align: 'right' },
            { key: 'budget', label: 'Budget', width: 70, align: 'right' },
            { key: 'savings', label: 'Savings', width: 70, align: 'right' },
            { key: 'directives', label: 'Directives', width: 55, align: 'right' },
            { key: 'risk', label: 'Risk', width: 50 },
          ]}
          rows={(directorates || []).map(d => ({
            name: d.name || d.id || '—',
            portfolios: d.portfolio_count?.toString() || '—',
            budget: formatCurrency(d.total_budget),
            savings: formatCurrency((d.total_savings || 0) * 1e6),
            directives: d.directive_count?.toString() || '—',
            risk: d.risk_level || '—',
            _colors: { risk: d.risk_level === 'high' ? COLORS.danger : d.risk_level === 'medium' ? COLORS.warning : COLORS.success },
          }))}
        />

        {/* Fiscal Health */}
        {fiscalOverview && (
          <Card highlight>
            <SubsectionHeading title="Fiscal Health Assessment" />
            {fiscalOverview.demand_growth && <KeyValue label="Demand Growth" value={formatPct(fiscalOverview.demand_growth)} color={COLORS.danger} />}
            {fiscalOverview.savings_coverage && <KeyValue label="Savings vs Demand" value={formatPct(fiscalOverview.savings_coverage)} color={COLORS.accent} />}
            {fiscalOverview.net_trajectory && <KeyValue label="Net Fiscal Trajectory" value={fiscalOverview.net_trajectory} />}
            {fiscalOverview.breakeven_year && <KeyValue label="Breakeven Year" value={fiscalOverview.breakeven_year.toString()} />}
          </Card>
        )}

        <PDFFooter councilName={councilName} classification="LEADER BRIEFING" />
      </Page>

      {/* ─── PAGE 3: Monday Morning List ─── */}
      <Page size="A4" style={styles.page}>
        <ConfidentialBanner text="LEADER BRIEFING — MOST RESTRICTED" />
        <PDFHeader title="Monday Morning List" subtitle="Priority Actions This Week" classification="LEADER" />

        {(mondayMorningList || immediateDirectives).slice(0, 15).map((d, i) => (
          <Card key={i} accent={i < 3}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 3 }}>
                <Text style={{ fontSize: FONT.h4, fontFamily: FONT.bold, color: i < 3 ? COLORS.accent : COLORS.textPrimary }}>
                  {i + 1}. {d.action?.substring(0, 80) || '—'}
                </Text>
                <Text style={{ fontSize: FONT.micro, color: COLORS.textMuted, marginTop: 2 }}>
                  {d.portfolio_title || d.portfolio || '—'} • {d.category?.replace(/_/g, ' ') || '—'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: FONT.h4, fontFamily: FONT.bold, color: COLORS.success }}>
                  {formatCurrency((d.save_central || 0) * 1e6)}
                </Text>
                <Text style={{ fontSize: FONT.micro, color: COLORS.textMuted }}>{d.timeline || '—'}</Text>
              </View>
            </View>
            {d.how && (
              <Text style={{ fontSize: FONT.tiny, color: COLORS.textSecondary, marginTop: 3 }}>
                HOW: {d.how.substring(0, 120)}
              </Text>
            )}
            {d.route && (
              <Text style={{ fontSize: FONT.micro, color: COLORS.accent, marginTop: 2 }}>
                ROUTE: {d.route}
              </Text>
            )}
          </Card>
        ))}

        <PDFFooter councilName={councilName} classification="LEADER BRIEFING" />
      </Page>

      {/* ─── PAGE 4: Per-Portfolio Summary ─── */}
      <Page size="A4" style={styles.page}>
        <ConfidentialBanner text="LEADER BRIEFING — MOST RESTRICTED" />
        <PDFHeader title="Portfolio Summary" subtitle="All 10 Portfolios at a Glance" classification="LEADER" />

        {(portfolios || []).map((p, i) => {
          const pDirectives = (allDirectives || []).filter(d => d.portfolio_id === p.id || d.portfolio === p.id)
          const pSavings = pDirectives.reduce((s, d) => s + (d.save_central || 0), 0)
          const pBudget = p.budget_total || p.budget?.total || 0

          return (
            <Card key={i}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                <View style={{ flex: 2 }}>
                  <Text style={{ fontSize: FONT.h4, fontFamily: FONT.bold, color: COLORS.accent }}>
                    {p.short_title || p.title || p.id}
                  </Text>
                  <Text style={{ fontSize: FONT.micro, color: COLORS.textMuted }}>
                    {p.cabinet_member?.name || '—'} • {p.lead_officer?.name || '—'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: FONT.small, fontFamily: FONT.bold, color: COLORS.success }}>
                    {formatCurrency(pSavings * 1e6)}
                  </Text>
                  <Text style={{ fontSize: FONT.micro, color: COLORS.textMuted }}>
                    of {formatCurrency(pBudget)} budget
                  </Text>
                </View>
              </View>
              <ProgressBar
                value={pSavings}
                max={totalSavings || 1}
                label={`${pDirectives.length} directives`}
                color={COLORS.chart[i % COLORS.chart.length]}
                showPct={false}
              />
              {/* Top directive for this portfolio */}
              {pDirectives[0] && (
                <Text style={{ fontSize: FONT.micro, color: COLORS.textSecondary, marginTop: 2 }}>
                  Top: {pDirectives[0].action?.substring(0, 100)}
                </Text>
              )}
            </Card>
          )
        })}

        <PDFFooter councilName={councilName} classification="LEADER BRIEFING" />
      </Page>

      {/* ─── PAGE 5: MTFS Comparison ─── */}
      {mtfsComparison && (
        <Page size="A4" style={styles.page}>
          <ConfidentialBanner text="LEADER BRIEFING — MOST RESTRICTED" />
          <PDFHeader title="MTFS Comparison" subtitle="AI DOGE vs Official Medium Term Financial Strategy" classification="LEADER" />

          <Card highlight>
            <SubsectionHeading title="Key Differences" />
            {mtfsComparison.gaps?.map((gap, i) => (
              <View key={i} style={{ marginBottom: SPACE.sm }}>
                <Text style={{ fontSize: FONT.h4, fontFamily: FONT.bold, color: COLORS.warning }}>{gap.area || gap.title}</Text>
                <View style={styles.row}>
                  <View style={styles.col2}>
                    <KeyValue label="MTFS Says" value={gap.mtfs_value || '—'} />
                  </View>
                  <View style={styles.col2}>
                    <KeyValue label="AI DOGE Says" value={gap.doge_value || '—'} color={COLORS.accent} />
                  </View>
                </View>
                {gap.implication && (
                  <Text style={{ fontSize: FONT.tiny, color: COLORS.textSecondary, marginTop: 2 }}>
                    Implication: {gap.implication}
                  </Text>
                )}
              </View>
            ))}
          </Card>

          {mtfsComparison.overall_assessment && (
            <Card accent>
              <SubsectionHeading title="Overall Assessment" />
              <Text style={{ fontSize: FONT.body, color: COLORS.textPrimary, lineHeight: 1.5 }}>
                {mtfsComparison.overall_assessment}
              </Text>
            </Card>
          )}

          <PDFFooter councilName={councilName} classification="LEADER BRIEFING" />
        </Page>
      )}

      {/* ─── PAGE 6: Political Impact & Electoral Ripple ─── */}
      {politicalImpact && (
        <Page size="A4" style={styles.page}>
          <ConfidentialBanner text="LEADER BRIEFING — MOST RESTRICTED" />
          <PDFHeader title="Political Impact Assessment" subtitle="Electoral Ripple from LCC Reform Operations" classification="LEADER" />

          <Card highlight>
            <SubsectionHeading title="Borough Election Impact" />
            <Text style={{ fontSize: FONT.body, color: COLORS.textPrimary, lineHeight: 1.5, marginBottom: SPACE.sm }}>
              Every Reform action at LCC ripples across 12 borough districts. Reform as a new governing party gets 2-3x media scrutiny — use this, don't fear it.
            </Text>
            <KeyValue label="Total Savings Narrative" value={formatCurrency(totalSavings * 1e6)} color={COLORS.accent} />
            <KeyValue label="Directive Count" value={(allDirectives || []).length.toString()} />
          </Card>

          {/* Key District Impact */}
          {politicalImpact.district_impact?.slice(0, 8).map((di, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight }}>
              <Text style={{ fontSize: FONT.small, color: COLORS.textPrimary }}>{di.district || di.name}</Text>
              <Text style={{ fontSize: FONT.small, fontFamily: FONT.bold, color: COLORS.accent }}>{di.impact_score || di.score}/100</Text>
              <Text style={{ fontSize: FONT.tiny, color: COLORS.textSecondary, flex: 2, textAlign: 'right' }}>{di.talking_point || ''}</Text>
            </View>
          ))}

          {/* National Narrative */}
          {politicalImpact.constituency_impact?.national_narrative && (
            <Card accent style={{ marginTop: SPACE.md }}>
              <SubsectionHeading title="National Narrative" />
              <Text style={{ fontSize: FONT.body, color: COLORS.textPrimary, fontStyle: 'italic', lineHeight: 1.5 }}>
                "{politicalImpact.constituency_impact.national_narrative}"
              </Text>
            </Card>
          )}

          <PDFFooter councilName={councilName} classification="LEADER BRIEFING" />
        </Page>
      )}

      {/* ─── PAGE 7: Inspection & Risk Summary ─── */}
      <Page size="A4" style={styles.page}>
        <ConfidentialBanner text="LEADER BRIEFING — MOST RESTRICTED" />
        <PDFHeader title="Risk Register & Inspections" subtitle="Key Risk Exposures Across All Portfolios" classification="LEADER" />

        <SectionHeading title="Top Risks by Portfolio" />
        {(portfolios || []).map((p, i) => {
          const risks = p.known_pressures || p.demand_pressures || []
          if (risks.length === 0) return null
          return (
            <Card key={i}>
              <Text style={{ fontSize: FONT.h4, fontFamily: FONT.bold, color: COLORS.accent }}>
                {p.short_title || p.title}
              </Text>
              <BulletList
                items={risks.slice(0, 3).map(r => typeof r === 'string' ? r : r.pressure || r.title || '')}
                color={COLORS.warning}
              />
            </Card>
          )
        }).filter(Boolean)}

        {/* Cross-Cutting Risks */}
        <SectionHeading title="Cross-Cutting Exposures" />
        <Card highlight>
          <BulletList items={[
            'Demand growth outpacing savings in social care — net fiscal trajectory must be monitored quarterly',
            'MTFS optimism bias risk — AI DOGE savings estimates are more conservative than official projections',
            'Inspection remediation costs could absorb 30-50% of identified savings if not managed proactively',
            'Reform scrutiny premium means any operational failure gets 2-3x normal coverage',
            'Borough election proximity creates political pressure to prioritise visible wins over structural reform',
          ]} color={COLORS.danger} />
        </Card>

        <PDFFooter councilName={councilName} classification="LEADER BRIEFING" />
      </Page>
    </Document>
  )
}
