/**
 * BoroughBriefingPDF - Per-council strategist/branch briefing PDF.
 *
 * 10-20 page comprehensive borough strategy briefing covering executive summary,
 * borough overview, battleground table, per-ward spreads (must_win + competitive),
 * coalition modelling, competitor analysis, resource allocation, and key decisions.
 *
 * Uses @react-pdf/renderer with AI DOGE dark theme design system.
 */
import React from 'react'
import { Document, Page, View, Text } from '@react-pdf/renderer'
import { styles, COLORS, FONT, SPACE } from './PDFDesignSystem.js'
import {
  PDFHeader, PDFFooter, ConfidentialBanner, CoverPage, SectionHeading, SubsectionHeading,
  Card, StatCard, StatsRow, BulletList, Table, Divider, TierBadge, TalkingPoint,
  KeyValue, ProgressBar, PartyBadge, ElectionHistoryTable,
  partyColor, tierColor, formatPct, formatNumber, formatDate, formatCurrency, daysUntil,
} from './PDFComponents.jsx'

// ── Safe accessors ──

function safeNum(v, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function safePct(numerator, denominator, decimals = 1) {
  const d = safeNum(denominator)
  if (d === 0) return '-'
  return ((safeNum(numerator) / d) * 100).toFixed(decimals) + '%'
}

function tierLabel(tier) {
  if (!tier) return '-'
  return tier.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function truncate(str, len = 20) {
  if (!str) return '-'
  return str.length > len ? str.substring(0, len - 1) + '...' : str
}

// ── Main Component ──

export function BoroughBriefingPDF({
  councilName,
  councilId,
  electionDate,
  ourParty = 'Reform UK',
  wardsUp = [],
  dossiers = {},
  rankedWards = [],
  pathToControl = {},
  councilPrediction = {},
  politicsSummary = {},
  wardDataMap = {},
  boroughAggregates = {},
  competitorAnalysis = {},
  timeline = [],
  resourceAllocation = {},
  votingData = null,
  councilDocuments = null,
}) {
  const elDate = electionDate || '2026-05-07'
  const daysLeft = daysUntil(elDate)
  const totalWards = wardsUp.length || Object.keys(dossiers).length

  // ── Derived data ──
  const currentSeats = politicsSummary?.seats || {}
  const ourSeats = safeNum(currentSeats[ourParty] || currentSeats['Reform'])
  const totalSeats = politicsSummary?.total_seats || Object.values(currentSeats).reduce((s, v) => s + safeNum(v), 0) || 1
  const majorityTarget = politicsSummary?.majority_threshold || (Math.ceil(totalSeats / 2) + 1)
  const seatsNeeded = Math.max(0, majorityTarget - ourSeats)

  // Predicted seats from councilPrediction
  const predictedSeats = councilPrediction?.parties || councilPrediction?.predicted || {}
  const ourPredicted = safeNum(predictedSeats[ourParty] || predictedSeats['Reform'])
  const ourChange = ourPredicted - ourSeats

  // Must-win and competitive wards for per-ward spreads (limit 10)
  const priorityWards = rankedWards
    .filter(w => w && (w.tier === 'must_win' || w.tier === 'competitive'))
    .slice(0, 10)

  // Key risks
  const risks = buildKeyRisks(rankedWards, pathToControl, ourSeats, majorityTarget, dossiers)

  // Parties for coalition section
  const partyList = Object.entries(currentSeats)
    .filter(([, seats]) => safeNum(seats) > 0)
    .sort((a, b) => safeNum(b[1]) - safeNum(a[1]))

  // Has decisions data
  const hasDecisions = (Array.isArray(councilDocuments) && councilDocuments.length > 0) ||
    (Array.isArray(votingData) && votingData.length > 0)

  return (
    <Document>
      {/* ─── PAGE 1: Cover ─── */}
      <CoverPage
        title={councilName || 'Borough Strategy Briefing'}
        subtitle="Borough Strategy Briefing"
        meta={`${totalWards} wards contested | Election: ${formatDate(elDate)} | Generated ${new Date().toLocaleDateString('en-GB')}`}
        classification="CONFIDENTIAL - FOR REFORM UK INTERNAL USE ONLY"
        councilName={councilName}
      />

      {/* ─── PAGE 2: Executive Summary ─── */}
      <Page size="A4" style={styles.page}>
        <ConfidentialBanner />
        <PDFHeader title="Executive Summary" subtitle={councilName} />

        <StatsRow>
          <StatCard
            value={daysLeft != null ? String(daysLeft) : '-'}
            label="Days to Election"
            color={daysLeft != null && daysLeft < 30 ? COLORS.danger : COLORS.warning}
          />
          <StatCard value={String(totalWards)} label="Wards Contested" />
          <StatCard value={String(ourSeats)} label="Current Seats" detail={ourParty} color={COLORS.accent} />
          <StatCard value={String(majorityTarget)} label="Majority Target" detail={`of ${totalSeats} total`} />
        </StatsRow>

        {/* Path to Control */}
        <SectionHeading title="Path to Control" />
        <Card accent>
          <Text style={styles.text}>
            {ourParty} currently holds {ourSeats} of {totalSeats} seats.
            {seatsNeeded > 0
              ? ` Need ${seatsNeeded} additional seat${seatsNeeded > 1 ? 's' : ''} for majority control.`
              : ' Already at or above majority threshold.'}
          </Text>
          {pathToControl?.must_win_count ? (
            <Text style={{ ...styles.textSmall, marginTop: SPACE.xs }}>
              {pathToControl.must_win_count} must-win wards identified.
              {pathToControl.realistic_gains ? ` Realistic gains: ${pathToControl.realistic_gains}.` : ''}
            </Text>
          ) : <View />}
        </Card>

        {/* Overall Prediction */}
        <SectionHeading title="Overall Prediction" />
        <StatsRow>
          <StatCard
            value={ourPredicted > 0 ? String(ourPredicted) : '-'}
            label={`Predicted ${ourParty} Seats`}
            color={ourChange > 0 ? COLORS.success : ourChange < 0 ? COLORS.danger : COLORS.accent}
          />
          <StatCard
            value={ourChange > 0 ? `+${ourChange}` : String(ourChange)}
            label="Seat Change"
            color={ourChange > 0 ? COLORS.success : ourChange < 0 ? COLORS.danger : COLORS.textMuted}
          />
        </StatsRow>

        {/* Key Risks */}
        {risks.length > 0 ? (
          <View>
            <SubsectionHeading title="Key Risks" />
            <BulletList items={risks} color={COLORS.danger} />
          </View>
        ) : <View />}

        <PDFFooter councilName={councilName} classification="CONFIDENTIAL" />
      </Page>

      {/* ─── PAGE 3: Borough Overview ─── */}
      <Page size="A4" style={styles.page}>
        <ConfidentialBanner />
        <PDFHeader title="Borough Overview" subtitle={councilName} />

        <StatsRow>
          <StatCard
            value={boroughAggregates?.population ? formatNumber(boroughAggregates.population) : '-'}
            label="Population"
          />
          <StatCard
            value={boroughAggregates?.avg_imd_decile != null ? String(safeNum(boroughAggregates.avg_imd_decile).toFixed(1)) : '-'}
            label="Avg IMD Decile"
            detail="1=most deprived"
          />
          <StatCard
            value={boroughAggregates?.claimant_rate != null ? formatPct(boroughAggregates.claimant_rate) : '-'}
            label="Claimant Rate"
          />
          <StatCard
            value={boroughAggregates?.tenure_own_pct != null ? formatPct(boroughAggregates.tenure_own_pct) : '-'}
            label="Home Ownership"
          />
        </StatsRow>

        {/* Economy */}
        <SectionHeading title="Economy" />
        <Card>
          <KeyValue label="Claimant Rate" value={boroughAggregates?.claimant_rate != null ? formatPct(boroughAggregates.claimant_rate) : '-'} />
          <KeyValue label="Median Earnings" value={boroughAggregates?.median_earnings ? formatCurrency(boroughAggregates.median_earnings) : '-'} />
          <KeyValue label="Top Industry" value={truncate(boroughAggregates?.top_industry, 40) || '-'} />
        </Card>

        {/* Demographics */}
        <SectionHeading title="Demographics" />
        <Card>
          <KeyValue label="Age Profile" value={truncate(boroughAggregates?.age_profile, 40) || '-'} />
          <KeyValue label="Ethnic Composition" value={truncate(boroughAggregates?.ethnic_composition, 40) || '-'} />
        </Card>

        {/* Housing */}
        <SectionHeading title="Housing" />
        <Card>
          <KeyValue label="Tenure Split" value={truncate(boroughAggregates?.tenure_split, 40) || '-'} />
          <KeyValue label="Predominant Type" value={truncate(boroughAggregates?.predominant_house_type, 40) || '-'} />
        </Card>

        <PDFFooter councilName={councilName} classification="CONFIDENTIAL" />
      </Page>

      {/* ─── PAGE 4-5: Battleground Table ─── */}
      <Page size="A4" style={styles.page}>
        <ConfidentialBanner />
        <PDFHeader title="Battleground Rankings" subtitle={`${totalWards} wards`} />

        <Table
          columns={[
            { label: '#', key: 'rank', width: 20, align: 'center', bold: true },
            { label: 'Ward', key: 'ward', flex: 3, bold: true },
            { label: 'Tier', key: 'tierLabel', flex: 1.5 },
            { label: 'Defender', key: 'defender', flex: 1.5, muted: true },
            { label: 'Our %', key: 'ourPct', width: 40, align: 'right' },
            { label: 'Swing', key: 'swing', width: 40, align: 'right' },
            { label: 'Score', key: 'score', width: 35, align: 'right', bold: true },
          ]}
          rows={rankedWards.filter(Boolean).map((w, i) => ({
            rank: String(i + 1),
            ward: truncate(w.wardName || w.ward, 22),
            tierLabel: tierLabel(w.tier),
            defender: truncate(w.defenderParty || w.defender, 14),
            ourPct: w.ourPct != null ? formatPct(w.ourPct) : '-',
            swing: w.swingNeeded != null ? formatPct(w.swingNeeded) : '-',
            score: w.score != null ? String(safeNum(w.score).toFixed(0)) : '-',
            _colors: {
              tierLabel: tierColor(w.tier),
              defender: partyColor(w.defenderParty || w.defender),
              score: w.score >= 70 ? COLORS.success : w.score >= 40 ? COLORS.warning : COLORS.textMuted,
            },
          }))}
        />

        <PDFFooter councilName={councilName} classification="CONFIDENTIAL" />
      </Page>

      {/* ─── PAGES: Per-Ward Spreads (must_win + competitive, max 10) ─── */}
      {priorityWards.filter(Boolean).map((rw) => {
        const wardName = rw.wardName || rw.ward || ''
        const dossier = dossiers[wardName] || {}
        const wData = wardDataMap[wardName] || {}
        const profile = dossier.profile || {}
        const election = dossier.election || {}
        const entrenchment = dossier.entrenchment || {}
        const strategy = dossier.wardStrategy || {}
        const talkingPoints = Array.isArray(dossier.talkingPoints) ? dossier.talkingPoints : []

        // Current holders
        const holders = Array.isArray(election.current_holders)
          ? election.current_holders
          : election.current_holders
            ? [election.current_holders]
            : []
        const currentParty = holders[0]?.party || rw.defenderParty || '-'
        const currentName = holders[0]?.name || '-'

        // Election history (last 3)
        const history = Array.isArray(election.history)
          ? election.history.slice(0, 3)
          : []

        // Attack vectors
        const attacks = Array.isArray(strategy.attackVectors)
          ? strategy.attackVectors.filter(Boolean).slice(0, 3)
          : []

        // Entrenchment factors
        const entFactors = Array.isArray(entrenchment.factors)
          ? entrenchment.factors.filter(Boolean).slice(0, 4)
          : []

        // Top talking points
        const topTalking = talkingPoints.filter(Boolean).slice(0, 3)

        // Voting records for incumbent
        const incumbentVotes = findIncumbentVotes(votingData, currentName, wardName)

        return (
          <Page key={wardName} size="A4" style={styles.page}>
            <ConfidentialBanner />
            <PDFHeader title={wardName} subtitle={`${councilName} - Ward Detail`} />

            {/* Ward header with tier */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.md }}>
              <TierBadge tier={rw.tier} />
              <Text style={{ ...styles.textSmall, flex: 1 }}>
                Score: {safeNum(rw.score).toFixed(0)} | Swing needed: {rw.swingNeeded != null ? formatPct(rw.swingNeeded) : '-'}
              </Text>
            </View>

            {/* Key stats */}
            <StatsRow>
              <StatCard
                value={wData.population ? formatNumber(wData.population) : profile.population ? formatNumber(profile.population) : '-'}
                label="Population"
              />
              <StatCard
                value={wData.imd_decile != null ? String(wData.imd_decile) : profile.imd_decile != null ? String(profile.imd_decile) : '-'}
                label="IMD Decile"
              />
              <StatCard
                value={truncate(currentParty, 14)}
                label="Current Party"
                color={partyColor(currentParty)}
              />
              <StatCard
                value={rw.margin != null ? formatPct(rw.margin) : '-'}
                label="Margin"
                color={safeNum(rw.margin) < 10 ? COLORS.danger : COLORS.textPrimary}
              />
            </StatsRow>

            {/* Electoral History */}
            {history.length > 0 ? (
              <View>
                <SubsectionHeading title="Electoral History" />
                <ElectionHistoryTable history={history} wardName={wardName} />
              </View>
            ) : <View />}

            {/* Attack Vectors */}
            {attacks.length > 0 ? (
              <View wrap={false}>
                <SubsectionHeading title="Attack Vectors" />
                {attacks.map((av, ai) => (
                  <TalkingPoint
                    key={ai}
                    category={typeof av === 'object' ? av.vector : null}
                    text={typeof av === 'object' ? (av.detail || av.vector || '') : String(av)}
                    borderColor={COLORS.danger}
                  />
                ))}
              </View>
            ) : <View />}

            {/* Entrenchment Analysis */}
            {(entrenchment.score != null || entFactors.length > 0) ? (
              <View wrap={false}>
                <SubsectionHeading title="Entrenchment Analysis" />
                <Card>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACE.xs }}>
                    <Text style={styles.textSmall}>
                      Level: <Text style={styles.textBold}>{entrenchment.level || '-'}</Text>
                    </Text>
                    <Text style={{ ...styles.textSmall, color: COLORS.accent }}>
                      Score: {safeNum(entrenchment.score).toFixed(0)}/100
                    </Text>
                  </View>
                  <ProgressBar
                    value={safeNum(entrenchment.score)}
                    max={100}
                    color={safeNum(entrenchment.score) > 70 ? COLORS.danger : safeNum(entrenchment.score) > 40 ? COLORS.warning : COLORS.success}
                  />
                  {entFactors.length > 0 ? (
                    <BulletList
                      items={entFactors.map(f =>
                        typeof f === 'object' ? `${f.factor || ''}: ${f.detail || f.value || ''}` : String(f)
                      )}
                      color={COLORS.textSecondary}
                    />
                  ) : <View />}
                </Card>
              </View>
            ) : <View />}

            {/* Key Talking Points */}
            {topTalking.length > 0 ? (
              <View wrap={false}>
                <SubsectionHeading title="Key Talking Points" />
                {topTalking.map((tp, ti) => (
                  <TalkingPoint
                    key={ti}
                    category={typeof tp === 'object' ? tp.source : null}
                    text={typeof tp === 'object' ? (tp.point || tp.detail || '') : String(tp)}
                    borderColor={COLORS.accent}
                  />
                ))}
              </View>
            ) : <View />}

            {/* Incumbent Voting Record */}
            {incumbentVotes.length > 0 ? (
              <View wrap={false}>
                <SubsectionHeading title="Incumbent Voting Record" />
                <Table
                  columns={[
                    { label: 'Issue', key: 'issue', flex: 3 },
                    { label: 'Vote', key: 'vote', flex: 1 },
                    { label: 'Date', key: 'date', flex: 1, muted: true },
                  ]}
                  rows={incumbentVotes.slice(0, 5)}
                />
              </View>
            ) : <View />}

            <PDFFooter councilName={councilName} classification="CONFIDENTIAL" />
          </Page>
        )
      })}

      {/* ─── Coalition Modelling ─── */}
      <Page size="A4" style={styles.page}>
        <ConfidentialBanner />
        <PDFHeader title="Coalition Modelling" subtitle={councilName} />

        {/* Current Seat Breakdown */}
        <SectionHeading title="Current Seat Breakdown" />
        <Table
          columns={[
            { label: 'Party', key: 'party', flex: 3, bold: true },
            { label: 'Seats', key: 'seats', width: 50, align: 'right', bold: true },
            { label: '%', key: 'pct', width: 50, align: 'right', muted: true },
          ]}
          rows={partyList.map(([party, seats]) => ({
            party,
            seats: String(safeNum(seats)),
            pct: safePct(seats, totalSeats),
            _colors: { party: partyColor(party) },
          }))}
        />

        <Divider />

        {/* Predicted Seat Breakdown */}
        <SectionHeading title="Predicted Seat Breakdown" />
        {Object.keys(predictedSeats).length > 0 ? (
          <Table
            columns={[
              { label: 'Party', key: 'party', flex: 3, bold: true },
              { label: 'Predicted', key: 'predicted', width: 55, align: 'right', bold: true },
              { label: 'Change', key: 'change', width: 55, align: 'right' },
            ]}
            rows={Object.entries(predictedSeats)
              .filter(([, v]) => safeNum(v) > 0)
              .sort((a, b) => safeNum(b[1]) - safeNum(a[1]))
              .map(([party, seats]) => {
                const current = safeNum(currentSeats[party])
                const change = safeNum(seats) - current
                return {
                  party,
                  predicted: String(safeNum(seats)),
                  change: change > 0 ? `+${change}` : String(change),
                  _colors: {
                    party: partyColor(party),
                    change: change > 0 ? COLORS.success : change < 0 ? COLORS.danger : COLORS.textMuted,
                  },
                }
              })}
          />
        ) : (
          <Card>
            <Text style={styles.textSmall}>No prediction data available.</Text>
          </Card>
        )}

        <Divider />

        {/* Scenarios */}
        <SectionHeading title="Scenarios" />
        <View style={styles.row}>
          <View style={styles.col3}>
            <Card highlight>
              <Text style={{ ...styles.sectionSubtitle, color: COLORS.success, fontSize: FONT.h4 }}>Best Case</Text>
              <Text style={styles.textSmall}>
                Win all must-win + competitive wards.
                {pathToControl?.best_case ? ` ${ourParty}: ${pathToControl.best_case} seats.` : ''}
              </Text>
            </Card>
          </View>
          <View style={styles.col3}>
            <Card highlight>
              <Text style={{ ...styles.sectionSubtitle, color: COLORS.warning, fontSize: FONT.h4 }}>Expected</Text>
              <Text style={styles.textSmall}>
                Win must-win wards, split competitive.
                {ourPredicted > 0 ? ` ${ourParty}: ${ourPredicted} seats.` : ''}
              </Text>
            </Card>
          </View>
          <View style={styles.col3}>
            <Card highlight>
              <Text style={{ ...styles.sectionSubtitle, color: COLORS.danger, fontSize: FONT.h4 }}>Worst Case</Text>
              <Text style={styles.textSmall}>
                Lose competitive wards, hold current seats only.
                {pathToControl?.worst_case ? ` ${ourParty}: ${pathToControl.worst_case} seats.` : ''}
              </Text>
            </Card>
          </View>
        </View>

        <PDFFooter councilName={councilName} classification="CONFIDENTIAL" />
      </Page>

      {/* ─── Competitor Analysis ─── */}
      <Page size="A4" style={styles.page}>
        <ConfidentialBanner />
        <PDFHeader title="Competitor Analysis" subtitle={councilName} />

        {Object.keys(competitorAnalysis).length > 0 ? (
          Object.entries(competitorAnalysis)
            .filter(([party]) => party !== ourParty)
            .filter(Boolean)
            .map(([party, analysis]) => {
              const a = analysis || {}
              const strongWards = Array.isArray(a.strongest_wards) ? a.strongest_wards.filter(Boolean).slice(0, 3) : []
              const weakWards = Array.isArray(a.weakest_wards) ? a.weakest_wards.filter(Boolean).slice(0, 3) : []
              return (
                <Card key={party} style={{ marginBottom: SPACE.md }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.sm }}>
                    <PartyBadge party={party} />
                    <Text style={{ ...styles.textSmall, color: COLORS.textSecondary }}>
                      {safeNum(a.current_seats || currentSeats[party])} seats
                    </Text>
                  </View>

                  {strongWards.length > 0 ? (
                    <View style={{ marginBottom: SPACE.xs }}>
                      <Text style={{ fontSize: FONT.tiny, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
                        Strongest Wards
                      </Text>
                      <BulletList items={strongWards.map(w => typeof w === 'object' ? (w.ward || w.wardName || '') : String(w))} color={partyColor(party)} />
                    </View>
                  ) : <View />}

                  {weakWards.length > 0 ? (
                    <View style={{ marginBottom: SPACE.xs }}>
                      <Text style={{ fontSize: FONT.tiny, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
                        Vulnerabilities
                      </Text>
                      <BulletList items={weakWards.map(w => typeof w === 'object' ? (w.ward || w.wardName || '') : String(w))} color={COLORS.warning} />
                    </View>
                  ) : <View />}

                  {a.trend ? (
                    <Text style={{ ...styles.textSmall, marginTop: SPACE.xs }}>{a.trend}</Text>
                  ) : <View />}
                </Card>
              )
            })
        ) : (
          <Card>
            <Text style={styles.textSmall}>No competitor analysis data available.</Text>
          </Card>
        )}

        <PDFFooter councilName={councilName} classification="CONFIDENTIAL" />
      </Page>

      {/* ─── Resource Allocation ─── */}
      <Page size="A4" style={styles.page}>
        <ConfidentialBanner />
        <PDFHeader title="Resource Allocation" subtitle={councilName} />

        {/* Ward Resource Table */}
        <SectionHeading title="Ward Deployment Plan" />
        {Array.isArray(resourceAllocation?.wards) && resourceAllocation.wards.length > 0 ? (
          <Table
            columns={[
              { label: 'Ward', key: 'ward', flex: 3, bold: true },
              { label: 'Tier', key: 'tierLabel', flex: 1.5 },
              { label: 'Hours', key: 'hours', width: 40, align: 'right' },
              { label: 'Priority Wk', key: 'priorityWeek', width: 55, align: 'center' },
              { label: 'Canvassers', key: 'canvassers', width: 55, align: 'right' },
            ]}
            rows={resourceAllocation.wards.filter(Boolean).map(w => ({
              ward: truncate(w.ward || w.wardName, 22),
              tierLabel: tierLabel(w.tier),
              hours: w.recommended_hours != null ? String(w.recommended_hours) : '-',
              priorityWeek: w.priority_week != null ? `Wk ${w.priority_week}` : '-',
              canvassers: w.canvassers_needed != null ? String(w.canvassers_needed) : '-',
              _colors: { tierLabel: tierColor(w.tier) },
            }))}
          />
        ) : (
          <Card>
            <Text style={styles.textSmall}>No resource allocation data available. Use allocateResources() to generate.</Text>
          </Card>
        )}

        <Divider />

        {/* 8-Week Timeline */}
        <SectionHeading title="Campaign Timeline" />
        {timeline.length > 0 ? (
          <View>
            {timeline.filter(Boolean).map((week, wi) => (
              <View key={wi} style={{ flexDirection: 'row', marginBottom: SPACE.xs }} wrap={false}>
                <View style={{ width: 55 }}>
                  <Text style={{ fontSize: FONT.tiny, fontFamily: FONT.bold, color: COLORS.accent }}>
                    {week.label || `Week ${wi + 1}`}
                  </Text>
                  {week.date ? (
                    <Text style={{ fontSize: FONT.micro, color: COLORS.textMuted }}>{formatDate(week.date)}</Text>
                  ) : <View />}
                </View>
                <View style={{ flex: 1, borderLeftWidth: 2, borderLeftColor: COLORS.accent, paddingLeft: SPACE.sm }}>
                  <Text style={styles.textSmall}>{week.focus || week.description || '-'}</Text>
                  {Array.isArray(week.tasks) && week.tasks.length > 0 ? (
                    <BulletList items={week.tasks.filter(Boolean).slice(0, 3)} color={COLORS.textMuted} />
                  ) : <View />}
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Card>
            <Text style={styles.textSmall}>No campaign timeline data available.</Text>
          </Card>
        )}

        <PDFFooter councilName={councilName} classification="CONFIDENTIAL" />
      </Page>

      {/* ─── Key Decisions (conditional) ─── */}
      {hasDecisions ? (
        <Page size="A4" style={styles.page}>
          <ConfidentialBanner />
          <PDFHeader title="Key Decisions & Votes" subtitle={councilName} />

          {/* Council Documents */}
          {Array.isArray(councilDocuments) && councilDocuments.length > 0 ? (
            <View>
              <SectionHeading title="Significant Council Decisions" />
              <Table
                columns={[
                  { label: 'Date', key: 'date', width: 60, muted: true },
                  { label: 'Decision', key: 'decision', flex: 4 },
                  { label: 'Committee', key: 'committee', flex: 2, muted: true },
                  { label: 'Significance', key: 'significance', flex: 1, align: 'center' },
                ]}
                rows={councilDocuments
                  .filter(Boolean)
                  .sort((a, b) => safeNum(b.significance || b.score) - safeNum(a.significance || a.score))
                  .slice(0, 8)
                  .map(doc => ({
                    date: formatDate(doc.date || doc.meeting_date),
                    decision: truncate(doc.title || doc.decision || doc.description, 45),
                    committee: truncate(doc.committee || doc.committee_name, 20),
                    significance: doc.significance != null ? String(doc.significance) : doc.score != null ? String(doc.score) : '-',
                    _colors: {
                      significance: safeNum(doc.significance || doc.score) >= 4 ? COLORS.danger
                        : safeNum(doc.significance || doc.score) >= 3 ? COLORS.warning
                        : COLORS.textMuted,
                    },
                  }))}
              />
            </View>
          ) : <View />}

          {/* Voting Records */}
          {Array.isArray(votingData) && votingData.length > 0 ? (
            <View>
              <SectionHeading title="Key Votes" />
              {votingData
                .filter(Boolean)
                .filter(v => v.controversial || v.significance === 'high' || safeNum(v.council_tax_change) !== 0)
                .slice(0, 6)
                .map((vote, vi) => (
                  <Card key={vi}>
                    <Text style={{ fontSize: FONT.h4, fontFamily: FONT.bold, color: COLORS.textPrimary, marginBottom: 2 }}>
                      {truncate(vote.title || vote.description, 50)}
                    </Text>
                    {vote.date ? (
                      <Text style={{ fontSize: FONT.micro, color: COLORS.textMuted, marginBottom: SPACE.xs }}>
                        {formatDate(vote.date)}
                        {vote.committee ? ` | ${truncate(vote.committee, 25)}` : ''}
                      </Text>
                    ) : <View />}
                    {vote.council_tax_change ? (
                      <Text style={{ fontSize: FONT.small, color: COLORS.warning }}>
                        Council Tax Impact: {vote.council_tax_change}
                      </Text>
                    ) : <View />}
                    {vote.key_facts ? (
                      <Text style={{ ...styles.textSmall, marginTop: 2 }}>{truncate(vote.key_facts, 80)}</Text>
                    ) : <View />}
                    {/* Party vote breakdown */}
                    {vote.party_votes ? (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.xs, marginTop: SPACE.xs }}>
                        {Object.entries(vote.party_votes).filter(Boolean).map(([party, stance], pi) => (
                          <View key={pi} style={{ ...styles.badge, backgroundColor: partyColor(party) + '22', borderWidth: 1, borderColor: partyColor(party) }}>
                            <Text style={{ fontSize: FONT.micro, color: partyColor(party), fontFamily: FONT.bold }}>
                              {truncate(party, 10)}: {typeof stance === 'object' ? (stance.for || 0) : String(stance)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : <View />}
                  </Card>
                ))}
            </View>
          ) : <View />}

          <PDFFooter councilName={councilName} classification="CONFIDENTIAL" />
        </Page>
      ) : <View />}
    </Document>
  )
}

// ── Helper: Build key risks ──

function buildKeyRisks(rankedWards, pathToControl, ourSeats, majorityTarget, dossiers) {
  const risks = []

  // Low-margin defences
  const defends = (rankedWards || []).filter(w => w && w.tier === 'defend' && safeNum(w.margin) < 5)
  if (defends.length > 0) {
    risks.push(`${defends.length} seat${defends.length > 1 ? 's' : ''} to defend with margin under 5%`)
  }

  // Not enough must-wins for majority
  const mustWins = (rankedWards || []).filter(w => w && w.tier === 'must_win')
  if (mustWins.length > 0 && mustWins.length < (majorityTarget - ourSeats)) {
    risks.push(`Only ${mustWins.length} must-win wards identified but ${majorityTarget - ourSeats} seats needed for majority`)
  }

  // High entrenchment targets
  const entrenched = Object.values(dossiers || {}).filter(d =>
    d && d.entrenchment && safeNum(d.entrenchment.score) > 75
  )
  if (entrenched.length > 0) {
    risks.push(`${entrenched.length} target ward${entrenched.length > 1 ? 's' : ''} with high incumbent entrenchment (>75)`)
  }

  // Low swing feasibility
  const hardSwing = (rankedWards || []).filter(w =>
    w && (w.tier === 'must_win' || w.tier === 'competitive') && safeNum(w.swingNeeded) > 15
  )
  if (hardSwing.length > 0) {
    risks.push(`${hardSwing.length} priority ward${hardSwing.length > 1 ? 's' : ''} requiring >15% swing`)
  }

  return risks.slice(0, 4)
}

// ── Helper: Find incumbent votes ──

function findIncumbentVotes(votingData, councillorName, wardName) {
  if (!Array.isArray(votingData) || !councillorName || councillorName === '-') return []

  const results = []
  const nameLC = councillorName.toLowerCase()

  for (const vote of votingData) {
    if (!vote || !vote.votes) continue
    const councillorVote = Object.entries(vote.votes || {}).find(([name]) =>
      name.toLowerCase().includes(nameLC)
    )
    if (councillorVote) {
      results.push({
        issue: truncate(vote.title || vote.description, 35),
        vote: String(councillorVote[1] || '-'),
        date: formatDate(vote.date),
      })
    }
    if (results.length >= 5) break
  }

  return results
}

export default BoroughBriefingPDF
