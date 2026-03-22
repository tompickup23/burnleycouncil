/**
 * CanvasserPackPDF — Per-ward 2-page canvassing sheet using @react-pdf/renderer.
 *
 * Council-agnostic: works across all 15 Lancashire councils.
 * Uses pdfDataPrep.js for normalised ward data, PDFDesignSystem.js for styles,
 * and PDFComponents.jsx for shared components.
 *
 * Critical @react-pdf constraints:
 * - NEVER use {condition && <Component>} — always ternary with <View /> fallback
 * - .filter(Boolean) before all .map() calls
 * - No React hooks inside PDF components
 */
import React from 'react'
import { Document, Page, View, Text } from '@react-pdf/renderer'
import { styles, COLORS, FONT, SPACE, formatPct, formatNumber, daysUntil } from './PDFDesignSystem.js'
import {
  PDFHeader, PDFFooter, ConfidentialBanner, SectionHeading,
  Card, StatCard, StatsRow, BulletList, TierBadge, Divider,
  KeyValue, TalkingPoint, Table, partyColor,
} from './PDFComponents.jsx'

// ── Tier derivation ──

function deriveTier(dossier) {
  const score = dossier?.overallScore
  if (score != null) {
    if (score >= 80) return 'must_win'
    if (score >= 60) return 'competitive'
    if (score >= 40) return 'building'
    return 'long_shot'
  }
  return dossier?.wardStrategy?.archetype || dossier?.wardStrategy?.tier || 'unknown'
}

function tierLabel(tier) {
  const labels = {
    must_win: 'MUST WIN',
    competitive: 'COMPETITIVE',
    building: 'BUILDING',
    long_shot: 'LONG SHOT',
    defend: 'DEFEND',
    unknown: 'UNCLASSIFIED',
  }
  return labels[tier] || (tier || 'UNCLASSIFIED').replace(/_/g, ' ').toUpperCase()
}

// ── Current party / margin from dossier ──

function getCurrentParty(dossier) {
  const holders = dossier?.election?.current_holders || []
  return holders[0]?.party || null
}

function getLastMargin(dossier) {
  const history = dossier?.election?.history || []
  if (!history.length) return null
  const latest = history[0]
  const candidates = latest?.candidates || latest?.results || []
  const sorted = [...candidates].sort((a, b) => (b.votes || 0) - (a.votes || 0))
  if (sorted.length < 2) return null
  return (sorted[0].votes || 0) - (sorted[1].votes || 0)
}

function getLastTurnout(dossier) {
  const history = dossier?.election?.history || []
  if (!history.length) return null
  const latest = history[0]
  if (latest.turnout) return +(latest.turnout * 100).toFixed(1)
  if (latest.turnout_pct) return +latest.turnout_pct.toFixed(1)
  return null
}

// ── Election history rows ──

function buildHistoryRows(dossier) {
  const history = dossier?.election?.history || []
  return history.slice(0, 4).map(e => {
    const candidates = e.candidates || e.results || []
    const sorted = [...candidates].sort((a, b) => (b.votes || 0) - (a.votes || 0))
    const winner = sorted[0] || {}
    const runnerUp = sorted[1] || {}
    const margin = sorted.length >= 2 ? (winner.votes || 0) - (runnerUp.votes || 0) : null
    return {
      year: String(e.year || e.date || '-'),
      winner: `${(winner.name || '-').substring(0, 16)} (${(winner.party || '?').substring(0, 8)})`,
      votes: winner.votes != null ? winner.votes.toLocaleString() : '-',
      runnerUp: runnerUp.name ? `${runnerUp.name.substring(0, 16)} (${(runnerUp.party || '?').substring(0, 8)})` : '-',
      margin: margin != null ? margin.toLocaleString() : '-',
      _colors: { winner: partyColor(winner.party), runnerUp: partyColor(runnerUp.party) },
    }
  }).filter(Boolean)
}

// ── Councillor names ──

function getCurrentCouncillors(dossier) {
  const holders = dossier?.election?.current_holders || dossier?.councillors || []
  return holders.map(h => `${h.name || 'Unknown'} (${h.party || '?'})`).filter(Boolean)
}

// ── Talking points extraction ──

function getTalkingPoints(playbook, dossier) {
  const points = playbook?.localIssues || dossier?.talkingPoints || []
  if (Array.isArray(points)) {
    return points.slice(0, 5).map(p => (typeof p === 'string' ? p : p.text || p.issue || p.point || ''))
  }
  return []
}

// ── Opening lines extraction ──

function getOpeningLines(playbook) {
  const lines = playbook?.openingLines || []
  return lines.slice(0, 3).map(l => {
    if (typeof l === 'string') return l
    return l.script || l.line || l.text || ''
  }).filter(Boolean)
}

// ── Objection handling extraction ──

function getObjections(playbook) {
  const objs = playbook?.objectionHandling || []
  return objs.slice(0, 4).map(o => {
    if (typeof o === 'string') return { objection: o, response: '' }
    return {
      objection: o.objection || o.question || '',
      response: o.response || o.answer || '',
    }
  }).filter(o => o.objection)
}

// ── GOTV approach ──

function getGotv(playbook, dossier) {
  const gotv = playbook?.gotv || dossier?.wardStrategy?.gotvApproach
  if (!gotv) return null
  if (typeof gotv === 'string') return gotv
  if (Array.isArray(gotv)) return gotv.join('. ')
  if (gotv.strategy) return gotv.strategy
  return null
}

// ── Do's / Don'ts ──

function getDos(playbook) {
  return playbook?.dos || playbook?.doorstepDos || [
    'Listen before you speak',
    'Smile, introduce yourself by name',
    'Leave a leaflet even if not home',
    'Note their top concern for follow-up',
    'Thank them for their time',
  ]
}

function getDonts(playbook) {
  return playbook?.donts || playbook?.doorstepDonts || [
    'Argue or get drawn into debate',
    'Promise things you cannot deliver',
    'Criticise other voters',
    'Stay longer than 2 minutes',
    'Enter the property',
  ]
}

// ── Main component ──

export const CanvasserPackPDF = ({ wardName, councilName, electionDate, dossier, wardData, playbook }) => {
  if (!wardName) {
    return (
      <Document>
        <Page size="A4" style={styles.page}>
          <Text style={{ color: COLORS.textPrimary }}>No ward specified for canvassing sheet.</Text>
        </Page>
      </Document>
    )
  }

  const tier = deriveTier(dossier)
  const currentParty = getCurrentParty(dossier)
  const lastMargin = getLastMargin(dossier)
  const lastTurnout = getLastTurnout(dossier)
  const days = daysUntil(electionDate)
  const historyRows = buildHistoryRows(dossier)
  const councillors = getCurrentCouncillors(dossier)
  const talkingPoints = getTalkingPoints(playbook, dossier)
  const openingLines = getOpeningLines(playbook)
  const objections = getObjections(playbook)
  const gotvText = getGotv(playbook, dossier)
  const dosList = getDos(playbook)
  const dontsList = getDonts(playbook)

  const historyColumns = [
    { key: 'year', label: 'Year', flex: 0.8, bold: true },
    { key: 'winner', label: 'Winner', flex: 2 },
    { key: 'votes', label: 'Votes', flex: 0.8, align: 'right' },
    { key: 'runnerUp', label: 'Runner-up', flex: 2, muted: true },
    { key: 'margin', label: 'Margin', flex: 0.8, align: 'right' },
  ]

  return (
    <Document>
      {/* PAGE 1: Know Your Ward */}
      <Page size="A4" style={styles.page}>
        <ConfidentialBanner text="CANVASSING SHEET - FOR INTERNAL USE ONLY" />
        <PDFHeader
          title={wardName}
          subtitle={`Canvassing Sheet - ${councilName || 'Council'}`}
          classification="CANVASSER"
        />

        {/* Tier badge + election date + days remaining */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.sm }}>
          <TierBadge tier={tier} label={tierLabel(tier)} />
          <View style={{ flexDirection: 'row', gap: SPACE.md }}>
            {electionDate ? (
              <Text style={{ fontSize: FONT.small, color: COLORS.textSecondary }}>
                Election: {electionDate}
              </Text>
            ) : <View />}
            {days != null ? (
              <Text style={{ fontSize: FONT.small, fontFamily: FONT.bold, color: days <= 14 ? COLORS.danger : COLORS.accent }}>
                {days} days to go
              </Text>
            ) : <View />}
          </View>
        </View>

        {/* Stats row: Population | IMD Decile | Current Party | Last Margin */}
        <StatsRow>
          <StatCard
            value={wardData?.population != null ? formatNumber(wardData.population) : '-'}
            label="Population"
          />
          <StatCard
            value={wardData?.imdDecile != null ? String(Math.round(wardData.imdDecile)) : '-'}
            label="IMD Decile"
            detail={wardData?.imdScore != null ? `Score: ${wardData.imdScore.toFixed(1)}` : undefined}
            color={wardData?.imdDecile != null && wardData.imdDecile <= 2 ? COLORS.danger : COLORS.accent}
          />
          <StatCard
            value={currentParty || '-'}
            label="Current Party"
            color={partyColor(currentParty)}
          />
          <StatCard
            value={lastMargin != null ? lastMargin.toLocaleString() : '-'}
            label="Last Margin"
            detail={lastTurnout != null ? `Turnout: ${lastTurnout}%` : undefined}
            color={lastMargin != null && lastMargin < 100 ? COLORS.danger : lastMargin != null && lastMargin < 300 ? COLORS.warning : COLORS.accent}
          />
        </StatsRow>

        {/* Housing section */}
        {wardData?.tenure ? (
          <Card>
            <Text style={styles.subsectionTitle}>Housing</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <KeyValue label="Owner-occupied" value={`${wardData.tenure.pctOwned}%`} />
              <KeyValue label="Private rent" value={`${(wardData.tenure.privateRent / wardData.tenure.total * 100).toFixed(1)}%`} />
              <KeyValue label="Social rent" value={`${(wardData.tenure.socialRent / wardData.tenure.total * 100).toFixed(1)}%`} />
            </View>
            {wardData.houseType ? (
              <Text style={{ fontSize: FONT.tiny, color: COLORS.textMuted, marginTop: 2 }}>
                Predominant type: {wardData.houseType.predominant}
                {wardData.overcrowding?.pct > 3 ? ` | Overcrowding: ${wardData.overcrowding.pct}%` : ''}
              </Text>
            ) : <View />}
          </Card>
        ) : <View />}

        {/* Economy section */}
        {wardData?.economy?.claimantRate != null ? (
          <Card>
            <Text style={styles.subsectionTitle}>Economy</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <KeyValue
                label="Claimant rate"
                value={`${wardData.economy.claimantRate}%`}
                color={wardData.economy.claimantRate > 5 ? COLORS.danger : COLORS.textPrimary}
              />
              {wardData.economy.claimantCount != null ? (
                <KeyValue label="Claimant count" value={formatNumber(wardData.economy.claimantCount)} />
              ) : <View />}
              {wardData.economy.medianEarnings != null ? (
                <KeyValue label="Median earnings (area)" value={`£${formatNumber(wardData.economy.medianEarnings)}`} />
              ) : <View />}
              {wardData.economy.topIndustry ? (
                <KeyValue label="Top industry" value={wardData.economy.topIndustry.substring(0, 20)} />
              ) : <View />}
            </View>
          </Card>
        ) : <View />}

        {/* Demographics section */}
        {wardData?.ethnicity ? (
          <Card>
            <Text style={styles.subsectionTitle}>Demographics</Text>
            <View style={{ flexDirection: 'row', gap: SPACE.md }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: FONT.tiny, color: COLORS.textMuted, marginBottom: 2 }}>Ethnicity</Text>
                {wardData.ethnicity.topGroups.slice(0, 4).filter(Boolean).map((g, i) => (
                  <Text key={i} style={{ fontSize: FONT.tiny, color: COLORS.textPrimary }}>
                    {g.name}: {g.pct}%
                  </Text>
                ))}
              </View>
              {wardData.age ? (
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: FONT.tiny, color: COLORS.textMuted, marginBottom: 2 }}>Age Profile</Text>
                  <Text style={{ fontSize: FONT.tiny, color: COLORS.textPrimary }}>Median age: ~{wardData.age.median}</Text>
                  <Text style={{ fontSize: FONT.tiny, color: COLORS.textPrimary }}>Under 18: {wardData.age.under18pct}%</Text>
                  <Text style={{ fontSize: FONT.tiny, color: COLORS.textPrimary }}>Over 65: {wardData.age.over65pct}%</Text>
                  <Text style={{ fontSize: FONT.tiny, color: COLORS.textPrimary }}>Working age: {wardData.age.workingAgePct}%</Text>
                </View>
              ) : <View />}
              {wardData.health?.goodHealthPct != null ? (
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: FONT.tiny, color: COLORS.textMuted, marginBottom: 2 }}>Health</Text>
                  <Text style={{ fontSize: FONT.tiny, color: COLORS.textPrimary }}>Good/Very good: {wardData.health.goodHealthPct}%</Text>
                  {wardData.health.lifeExpMale != null ? (
                    <Text style={{ fontSize: FONT.tiny, color: COLORS.textPrimary }}>
                      Life exp (area): M {wardData.health.lifeExpMale} / F {wardData.health.lifeExpFemale}
                    </Text>
                  ) : <View />}
                </View>
              ) : <View />}
            </View>
          </Card>
        ) : <View />}

        {/* Electoral History table: last 3-4 elections */}
        {historyRows.length > 0 ? (
          <View>
            <Text style={styles.subsectionTitle}>Electoral History</Text>
            <Table columns={historyColumns} rows={historyRows} />
          </View>
        ) : <View />}

        {/* Current councillor(s) */}
        {councillors.length > 0 ? (
          <View style={{ marginTop: SPACE.xs }}>
            <Text style={{ fontSize: FONT.tiny, color: COLORS.textMuted }}>
              Current councillor{councillors.length > 1 ? 's' : ''}: {councillors.join(', ')}
            </Text>
          </View>
        ) : <View />}

        <PDFFooter councilName={councilName} classification="CANVASSING SHEET" />
      </Page>

      {/* PAGE 2: Doorstep Guide */}
      <Page size="A4" style={styles.page}>
        <ConfidentialBanner text="CANVASSING SHEET - FOR INTERNAL USE ONLY" />
        <PDFHeader title={`${wardName} - Doorstep Guide`} subtitle={councilName || 'Council'} classification="CANVASSER" />

        {/* Top 5 Talking Points */}
        {talkingPoints.length > 0 ? (
          <View>
            <SectionHeading title="Talking Points" />
            {talkingPoints.filter(Boolean).map((point, i) => (
              <TalkingPoint key={i} text={point} priority={i} />
            ))}
          </View>
        ) : <View />}

        {/* Opening Lines */}
        {openingLines.length > 0 ? (
          <View>
            <SectionHeading title="Opening Lines" />
            {openingLines.filter(Boolean).map((line, i) => (
              <Card key={i}>
                <Text style={{ fontSize: FONT.small, color: COLORS.textPrimary, fontStyle: 'italic', lineHeight: 1.5 }}>
                  "{line}"
                </Text>
              </Card>
            ))}
          </View>
        ) : <View />}

        {/* Quick Objection Handling */}
        {objections.length > 0 ? (
          <View>
            <SectionHeading title="Objection Handling" />
            {objections.filter(Boolean).map((obj, i) => (
              <View key={i} style={{ marginBottom: SPACE.sm }} wrap={false}>
                <Text style={{ fontSize: FONT.small, fontFamily: FONT.bold, color: COLORS.danger }}>
                  {obj.objection}
                </Text>
                {obj.response ? (
                  <Text style={{ fontSize: FONT.small, color: COLORS.textPrimary, lineHeight: 1.4, paddingLeft: SPACE.sm, marginTop: 2 }}>
                    {obj.response}
                  </Text>
                ) : <View />}
              </View>
            ))}
          </View>
        ) : <View />}

        {/* GOTV Approach */}
        {gotvText ? (
          <View>
            <SectionHeading title="GOTV Approach" />
            <Card accent>
              <Text style={{ fontSize: FONT.small, color: COLORS.textPrimary, lineHeight: 1.5 }}>
                {gotvText}
              </Text>
            </Card>
          </View>
        ) : <View />}

        {/* Do / Don't columns */}
        <View style={{ ...styles.row, marginTop: SPACE.sm }}>
          <View style={styles.col2}>
            <Text style={{ ...styles.sectionSubtitle, color: COLORS.success }}>DO</Text>
            <BulletList items={dosList.filter(Boolean)} color={COLORS.success} />
          </View>
          <View style={styles.col2}>
            <Text style={{ ...styles.sectionSubtitle, color: COLORS.danger }}>DO NOT</Text>
            <BulletList items={dontsList.filter(Boolean)} color={COLORS.danger} />
          </View>
        </View>

        <PDFFooter councilName={councilName} classification="CANVASSING SHEET" />
      </Page>
    </Document>
  )
}

export default CanvasserPackPDF
