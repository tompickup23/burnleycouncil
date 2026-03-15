/**
 * AllWardsStrategyPDF — Complete multi-ward strategist overview.
 *
 * Executive summary, battleground rankings, path to control, resource allocation,
 * per-ward summary cards, coalition scenarios.
 */
import React from 'react'
import { Document, Page, View, Text } from '@react-pdf/renderer'
import { styles, COLORS, FONT, SPACE } from './PDFDesignSystem.js'
import {
  PDFHeader, PDFFooter, ConfidentialBanner, CoverPage, SectionHeading, SubsectionHeading,
  Card, StatCard, StatsRow, BulletList, Table, Divider, TierBadge,
  KeyValue, ProgressBar, VerticalBarChart,
  partyColor, formatPct, formatNumber, daysUntil,
} from './PDFComponents.jsx'
import { BURNLEY_WARD_INTEL } from '../../utils/strategyEngine.js'

export function AllWardsStrategyPDF({
  councilName, electionDate, wardsUp, dossiers, rankedWards, pathToControl,
  resourceAllocation, politicsSummary, councilPrediction, electionBriefing, ourParty = 'Reform UK',
}) {
  const elDate = electionDate || '2026-05-07'
  const daysLeft = daysUntil(elDate)
  const totalWards = wardsUp?.length || Object.keys(dossiers || {}).length

  // Build ward summary data
  const wardSummaries = (wardsUp || Object.keys(dossiers || {})).map(w => {
    const d = dossiers?.[w]
    const intel = BURNLEY_WARD_INTEL[w] || {}
    const ranked = rankedWards?.find(r => r.ward === w)
    return {
      ward: w,
      tier: intel.tier || ranked?.tier || 'unknown',
      opportunity: intel.opportunity || ranked?.score || 0,
      defender: d?.election?.defender?.party || '—',
      defenderName: d?.election?.defender?.name || '—',
      ourPct: d?.election?.prediction?.ourPct || 0,
      swingReq: d?.election?.prediction?.swingRequired || Infinity,
      winProb: d?.election?.prediction?.winProbability || 0,
      entrenchment: d?.entrenchment?.level || '—',
      score: d?.overallScore || 0,
    }
  }).sort((a, b) => b.opportunity - a.opportunity)

  // Tiers
  const tiers = {
    must_win: wardSummaries.filter(w => w.tier === 'must_win'),
    competitive: wardSummaries.filter(w => w.tier === 'competitive'),
    building: wardSummaries.filter(w => w.tier === 'building'),
    defend: wardSummaries.filter(w => w.tier === 'defend'),
    long_shot: wardSummaries.filter(w => w.tier === 'long_shot'),
  }

  // Current seat counts
  const currentSeats = politicsSummary?.seats || {}
  const reformSeats = currentSeats['Reform UK'] || currentSeats['Reform'] || 0
  const totalSeats = Object.values(currentSeats).reduce((s, v) => s + v, 0) || 45
  const majorityTarget = Math.ceil(totalSeats / 2) + 1

  return (
    <Document>
      {/* Cover Page */}
      <CoverPage
        title={`${councilName || 'Burnley'} Election Strategy`}
        subtitle={`Borough Elections — ${elDate}`}
        meta={`${totalWards} wards contested • ${daysLeft} days to election • Generated ${new Date().toLocaleDateString('en-GB')}`}
        classification="CONFIDENTIAL — STRATEGIST USE ONLY"
        councilName={councilName}
      />

      {/* ─── PAGE 2: Executive Summary ─── */}
      <Page size="A4" style={styles.page}>
        <ConfidentialBanner />
        <PDFHeader title="Executive Summary" subtitle={councilName} classification="STRATEGIST" />

        <StatsRow>
          <StatCard value={daysLeft?.toString() || '—'} label="Days Left" color={daysLeft < 30 ? COLORS.danger : COLORS.warning} />
          <StatCard value={totalWards.toString()} label="Wards Contested" />
          <StatCard value={reformSeats.toString()} label="Current Seats" color={COLORS.accent} />
          <StatCard value={majorityTarget.toString()} label="Majority Target" />
        </StatsRow>

        {/* Path to Control */}
        {pathToControl && (
          <Card highlight>
            <SubsectionHeading title="Path to Control" />
            <KeyValue label="Seats Needed for Majority" value={pathToControl.seatsNeeded?.toString() || '—'} color={COLORS.accent} />
            <KeyValue label="Most Likely Outcome" value={`${pathToControl.expectedSeats || '—'} seats`} />
            <KeyValue label="Best Case" value={`${pathToControl.bestCase || '—'} seats`} color={COLORS.success} />
            <KeyValue label="Assessment" value={pathToControl.assessment || '—'} />
            <ProgressBar
              value={pathToControl.expectedSeats || 0}
              max={totalSeats}
              label={`Projected seat share: ${pathToControl.expectedSeats || 0}/${totalSeats}`}
              color={COLORS.accent}
            />
          </Card>
        )}

        {/* Tier Summary */}
        <SectionHeading title="Ward Classification" />
        <Table
          columns={[
            { key: 'tier', label: 'Tier', width: 90, bold: true },
            { key: 'count', label: 'Wards', width: 40, align: 'right' },
            { key: 'resource', label: 'Resource %', width: 70, align: 'right' },
            { key: 'wards', label: 'Wards', flex: 2 },
          ]}
          rows={[
            { tier: 'MUST WIN', count: tiers.must_win.length, resource: '50%', wards: tiers.must_win.map(w => w.ward).join(', ') || '—', _colors: { tier: COLORS.must_win } },
            { tier: 'COMPETITIVE', count: tiers.competitive.length, resource: '30%', wards: tiers.competitive.map(w => w.ward).join(', ') || '—', _colors: { tier: COLORS.competitive } },
            { tier: 'BUILDING', count: tiers.building.length, resource: '15%', wards: tiers.building.map(w => w.ward).join(', ') || '—', _colors: { tier: COLORS.building } },
            { tier: 'DEFEND', count: tiers.defend.length, resource: '3%', wards: tiers.defend.map(w => w.ward).join(', ') || '—', _colors: { tier: COLORS.defend } },
            { tier: 'LONG SHOT', count: tiers.long_shot.length, resource: '2%', wards: tiers.long_shot.map(w => w.ward).join(', ') || '—', _colors: { tier: COLORS.long_shot } },
          ]}
        />

        {/* Current Political Makeup */}
        {politicsSummary?.seats && (
          <>
            <SectionHeading title="Current Political Makeup" />
            <Table
              columns={[
                { key: 'party', label: 'Party', flex: 2 },
                { key: 'seats', label: 'Seats', width: 50, align: 'right', bold: true },
                { key: 'pct', label: '% of Council', width: 70, align: 'right' },
              ]}
              rows={Object.entries(politicsSummary.seats)
                .sort((a, b) => b[1] - a[1])
                .map(([party, seats]) => ({
                  party,
                  seats: seats.toString(),
                  pct: formatPct((seats / totalSeats) * 100, 0),
                  _colors: { party: partyColor(party) },
                }))}
            />
          </>
        )}

        <PDFFooter councilName={councilName} classification="ALL-WARDS STRATEGY" />
      </Page>

      {/* ─── PAGE 3: Battleground Rankings ─── */}
      <Page size="A4" style={styles.page}>
        <ConfidentialBanner />
        <PDFHeader title="Battleground Rankings" subtitle="All Wards by Priority" classification="STRATEGIST" />

        <Table
          columns={[
            { key: 'rank', label: '#', width: 20 },
            { key: 'ward', label: 'Ward', flex: 2, bold: true },
            { key: 'tier', label: 'Tier', width: 65 },
            { key: 'defender', label: 'Defender', width: 60 },
            { key: 'ourPct', label: 'Our %', width: 40, align: 'right' },
            { key: 'swingReq', label: 'Swing', width: 40, align: 'right' },
            { key: 'winProb', label: 'Win %', width: 40, align: 'right' },
            { key: 'score', label: 'Score', width: 35, align: 'right' },
          ]}
          rows={wardSummaries.map((w, i) => ({
            rank: (i + 1).toString(),
            ward: w.ward,
            tier: w.tier?.replace(/_/g, ' ').toUpperCase(),
            defender: w.defender,
            ourPct: formatPct(w.ourPct, 0),
            swingReq: w.swingReq === Infinity ? '—' : formatPct(w.swingReq, 1),
            winProb: formatPct(w.winProb * 100, 0),
            score: w.score?.toFixed(0) || '—',
            _colors: {
              tier: COLORS[w.tier] || COLORS.textMuted,
              defender: partyColor(w.defender),
              winProb: w.winProb > 0.5 ? COLORS.success : w.winProb > 0.2 ? COLORS.warning : COLORS.danger,
            },
          }))}
        />

        {/* Resource Allocation */}
        {resourceAllocation && (
          <>
            <SectionHeading title="Resource Allocation" />
            <Card>
              {Object.entries(resourceAllocation).slice(0, 10).map(([ward, alloc], i) => (
                <ProgressBar
                  key={i}
                  value={alloc?.hours || alloc?.pct || 0}
                  max={Math.max(...Object.values(resourceAllocation).map(a => a?.hours || a?.pct || 0), 1)}
                  label={`${ward}: ${alloc?.hours || alloc?.pct || 0}${alloc?.hours ? ' hours' : '%'}`}
                  color={COLORS.chart[i % COLORS.chart.length]}
                />
              ))}
            </Card>
          </>
        )}

        <PDFFooter councilName={councilName} classification="ALL-WARDS STRATEGY" />
      </Page>

      {/* ─── PAGES 4+: Per-Ward Summary Cards ─── */}
      {['must_win', 'competitive', 'building', 'defend'].map(tierKey => {
        const tierWards = tiers[tierKey]
        if (!tierWards?.length) return null

        return (
          <Page key={tierKey} size="A4" style={styles.page}>
            <ConfidentialBanner />
            <PDFHeader
              title={`${tierKey.replace(/_/g, ' ').toUpperCase()} Wards`}
              subtitle={`${tierWards.length} wards — ${tierKey === 'must_win' ? '50%' : tierKey === 'competitive' ? '30%' : tierKey === 'building' ? '15%' : '3%'} of resource`}
              classification="STRATEGIST"
            />

            {tierWards.map((w, i) => {
              const d = dossiers?.[w.ward]
              const intel = BURNLEY_WARD_INTEL[w.ward] || {}
              return (
                <Card key={i} accent={tierKey === 'must_win'}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACE.xs }}>
                    <View>
                      <Text style={{ fontSize: FONT.h3, fontFamily: FONT.bold, color: COLORS.textPrimary }}>
                        {w.ward}
                      </Text>
                      <Text style={{ fontSize: FONT.tiny, color: partyColor(w.defender) }}>
                        Defender: {w.defenderName} ({w.defender})
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: FONT.h4, fontFamily: FONT.bold, color: COLORS.accent }}>
                        {formatPct(w.winProb * 100, 0)} win
                      </Text>
                      <Text style={{ fontSize: FONT.micro, color: COLORS.textMuted }}>
                        Swing: {w.swingReq === Infinity ? '—' : formatPct(w.swingReq, 1)}
                      </Text>
                    </View>
                  </View>

                  {/* Key intel line */}
                  {intel.messaging && (
                    <Text style={{ fontSize: FONT.small, color: COLORS.accent, marginBottom: 3 }}>
                      {intel.messaging}
                    </Text>
                  )}

                  {/* Local issues */}
                  {(intel.local_issues || []).length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2, marginTop: 2 }}>
                      {intel.local_issues.slice(0, 3).map((issue, j) => (
                        <Text key={j} style={{ fontSize: FONT.micro, color: COLORS.textSecondary, backgroundColor: COLORS.bgCardAlt, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2 }}>
                          {issue}
                        </Text>
                      ))}
                    </View>
                  )}

                  {/* Quick strategy */}
                  {d?.wardStrategy?.headline && (
                    <Text style={{ fontSize: FONT.tiny, color: COLORS.textPrimary, marginTop: 3 }}>
                      Strategy: {d.wardStrategy.headline}
                    </Text>
                  )}
                </Card>
              )
            })}

            <PDFFooter councilName={councilName} classification="ALL-WARDS STRATEGY" />
          </Page>
        )
      })}

      {/* ─── Election Briefing Deep Dive ─── */}
      {electionBriefing?.coalcloughDeepDive && (
        <Page size="A4" style={styles.page}>
          <ConfidentialBanner />
          <PDFHeader title="Coalclough Deep Dive" subtitle="43-Year Lib Dem Fortress Analysis" classification="STRATEGIST" />

          <Card highlight>
            <SubsectionHeading title="Gordon Birtwistle — Lib Dem (since 1983)" />
            <Text style={{ fontSize: FONT.body, color: COLORS.textPrimary, lineHeight: 1.5 }}>
              {electionBriefing.coalcloughDeepDive.recommended_approach}
            </Text>
          </Card>

          <SubsectionHeading title="Vulnerability Analysis" />
          <BulletList items={electionBriefing.coalcloughDeepDive.vulnerability_analysis} color={COLORS.danger} />

          <SubsectionHeading title="Margin Trajectory" />
          <Table
            columns={[
              { key: 'year', label: 'Year', width: 50 },
              { key: 'margin', label: 'Margin %', width: 60, align: 'right' },
              { key: 'winner', label: 'Winner', flex: 1 },
            ]}
            rows={(electionBriefing.coalcloughDeepDive.margin_trajectory || []).map(m => ({
              year: m.year?.toString(),
              margin: m.margin_pct != null ? m.margin_pct + '%' : '—',
              winner: m.winner || '—',
              _colors: { winner: partyColor(m.winner) },
            }))}
          />

          <PDFFooter councilName={councilName} classification="ALL-WARDS STRATEGY" />
        </Page>
      )}
    </Document>
  )
}
