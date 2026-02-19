import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useCouncilConfig } from '../context/CouncilConfig'
import { useData } from '../hooks/useData'
import { formatCurrency, formatNumber } from '../utils/format'
import { TOOLTIP_STYLE } from '../utils/constants'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, ReferenceLine } from 'recharts'
import { Search, Loader2, AlertCircle, PoundSterling, Home, TrendingDown, TrendingUp, ArrowRight, Calculator, MapPin, Building, Users, ChevronDown, ChevronRight, Check, X as XIcon, HelpCircle, ExternalLink, Calendar, AlertTriangle, Brain, BookOpen } from 'lucide-react'
import { LoadingState } from '../components/ui'
import './LGRCostCalculator.css'

const PROPOSAL_COLORS = ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#ff453a']

// Map postcodes.io admin_district names to our council IDs
const DISTRICT_NAME_MAP = {
  'burnley': 'burnley',
  'hyndburn': 'hyndburn',
  'pendle': 'pendle',
  'rossendale': 'rossendale',
  'lancaster': 'lancaster',
  'ribble valley': 'ribble_valley',
  'chorley': 'chorley',
  'south ribble': 'south_ribble',
  'west lancashire': 'west_lancashire',
  'wyre': 'wyre',
  'preston': 'preston',
  'fylde': 'fylde',
  'blackpool': 'blackpool',
  'blackburn with darwen': 'blackburn',
}

// Band to multiplier (relative to Band D = 1.0)
const BAND_MULTIPLIERS = {
  'A': 6 / 9,
  'B': 7 / 9,
  'C': 8 / 9,
  'D': 1,
  'E': 11 / 9,
  'F': 13 / 9,
  'G': 15 / 9,
  'H': 18 / 9,
}

// Map model IDs to harmonisation keys
const MODEL_TO_HARMONISATION_KEY = {
  'two_unitary': 'two_unitary',
  'three_unitary': 'three_unitary',
  'four_unitary': 'four_unitary',
  'four_unitary_alt': 'four_unitary_alt',
  'five_unitary': 'five_unitary',
}

function LGRCostCalculator() {
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'
  const councilId = config.council_id || ''
  const councilTier = config.council_tier || 'district'

  // Load LGR tracker + budget summary + budget model (has harmonised CT data)
  const { data, loading, error } = useData([
    '/data/shared/lgr_tracker.json',
    '/data/budgets_summary.json',
    '/data/shared/lgr_budget_model.json',
  ])
  const [lgrData, budgetsSummary, budgetModel] = data || [null, null, null]

  const [postcode, setPostcode] = useState('')
  const [postcodeLoading, setPostcodeLoading] = useState(false)
  const [postcodeError, setPostcodeError] = useState(null)
  const [postcodeResult, setPostcodeResult] = useState(null)
  const [selectedBand, setSelectedBand] = useState('D')
  const [expandedProposal, setExpandedProposal] = useState(null)
  const [showMethodology, setShowMethodology] = useState(false)
  const scrollTimerRef = useRef(null)

  useEffect(() => {
    document.title = `LGR Cost Calculator | ${councilName} Council Transparency`
    return () => { document.title = `${councilName} Council Transparency` }
  }, [councilName])

  useEffect(() => {
    return () => { if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current) }
  }, [])

  // --- Get current Band D costs ---
  const currentCosts = useMemo(() => {
    if (!budgetsSummary?.council_tax?.band_d_by_year) return null

    const years = Object.keys(budgetsSummary.council_tax.band_d_by_year).sort()
    const latestYear = years[years.length - 1]
    const districtBandD = budgetsSummary.council_tax.band_d_by_year[latestYear]

    // For unitaries, the Band D is already the total
    if (councilTier === 'unitary') {
      return {
        districtBandD,
        countyBandD: 0,
        councilOnlyBandD: districtBandD, // same for unitaries
        totalBandD: districtBandD,
        year: latestYear,
        isUnitary: true,
        totalSpend: budgetsSummary.headline?.total_service_expenditure || 0,
        netRevenue: budgetsSummary.headline?.net_revenue_expenditure || 0,
        serviceBreakdown: budgetsSummary.service_breakdown || {},
        reserves: budgetsSummary.reserves?.total_closing || 0,
      }
    }

    // For districts, total includes county + police + fire
    const totalYears = Object.keys(budgetsSummary.council_tax.band_d_total_by_year || {}).sort()
    const latestTotalYear = totalYears[totalYears.length - 1]
    const totalBandD = budgetsSummary.council_tax.band_d_total_by_year?.[latestTotalYear] || districtBandD

    // County portion = total - district - police - fire. We know district+county from budget model
    const countyBandD = totalBandD - districtBandD
    // Council-only = district + LCC county (excl. police + fire) — from budget model data
    const lccBandD = budgetModel?.council_tax_harmonisation?.two_unitary?.lcc_band_d_element || 1735.79
    const councilOnlyBandD = districtBandD + lccBandD

    return {
      districtBandD,
      countyBandD,
      lccBandD,
      councilOnlyBandD, // district + county only (what harmonisation compares against)
      totalBandD,       // includes police + fire
      policeFire: totalBandD - councilOnlyBandD, // police + fire precepts
      year: latestYear,
      isUnitary: false,
      totalSpend: budgetsSummary.headline?.total_service_expenditure || 0,
      netRevenue: budgetsSummary.headline?.net_revenue_expenditure || 0,
      serviceBreakdown: budgetsSummary.service_breakdown || {},
      reserves: budgetsSummary.reserves?.total_closing || 0,
    }
  }, [budgetsSummary, councilTier, budgetModel])

  // --- Get harmonised Band D from proper budget model data ---
  const proposalCosts = useMemo(() => {
    if (!lgrData?.proposed_models || !currentCosts) return []

    return lgrData.proposed_models.map((model, idx) => {
      // Find which authority this council would be in
      let myAuthority
      if (councilTier === 'county') {
        myAuthority = model.authorities.reduce((largest, a) =>
          (a.population || 0) > (largest?.population || 0) ? a : largest, model.authorities[0])
      } else {
        myAuthority = model.authorities.find(a => a.councils.includes(councilId))
      }
      if (!myAuthority) return { ...model, myAuthority: null, harmonisedBandD: null, color: PROPOSAL_COLORS[idx] }

      // Use PROPER harmonised Band D from lgr_budget_model.json
      // This is the weighted-average council tax for the new unitary authority
      const harmKey = MODEL_TO_HARMONISATION_KEY[model.id]
      const ctData = budgetModel?.council_tax_harmonisation?.[harmKey]
      let harmonisedBandD = null
      let currentCombined = null
      let delta = null
      let isWinner = null
      let ccnSavings = model.ccn_annual_savings

      if (ctData) {
        // Find this council's authority in the harmonisation data
        const harmAuth = ctData.authorities.find(a =>
          a.councils.some(c => c.council_id === councilId)
        )
        if (harmAuth) {
          harmonisedBandD = harmAuth.harmonised_band_d
          // Find this specific council's delta
          const myCouncilCT = harmAuth.councils.find(c => c.council_id === councilId)
          if (myCouncilCT) {
            currentCombined = myCouncilCT.current_combined_element
            delta = myCouncilCT.delta
            isWinner = myCouncilCT.winner
          }
        }
      }

      // Fallback: if no harmonisation data, estimate using the old method (but fixed)
      if (harmonisedBandD === null && currentCosts.councilOnlyBandD > 0) {
        const population = myAuthority.population || 500000
        const totalLancPopulation = 1601555
        // Pro-rata share of savings for THIS authority based on population share
        const authorityShare = population / totalLancPopulation
        const authoritySavings = (model.doge_annual_savings || 0) * authorityShare
        const bandDEquivalents = population * 0.41
        const savingsPerHousehold = authoritySavings > 0 ? authoritySavings / bandDEquivalents : 0
        harmonisedBandD = currentCosts.councilOnlyBandD - savingsPerHousehold
        delta = currentCosts.councilOnlyBandD - harmonisedBandD
        currentCombined = currentCosts.councilOnlyBandD
        isWinner = delta < 0
      }

      // The total bill under LGR = harmonised council rate + police + fire (unchanged)
      const policeFire = currentCosts.policeFire || 0
      const totalNewBandD = harmonisedBandD !== null ? harmonisedBandD + policeFire : null

      return {
        ...model,
        myAuthority,
        harmonisedBandD,      // New unitary council rate (district+county combined)
        currentCombined,       // Current district+county combined
        totalNewBandD,         // New total including police+fire
        delta,                 // Change in council element (+/- from current)
        isWinner,              // Does this council's bill go down?
        annualSaving: delta ? -delta : 0, // Positive = saves money (delta is negative for winners)
        color: PROPOSAL_COLORS[idx],
        populationText: formatNumber(myAuthority.population || 0),
        numCouncils: myAuthority.councils.length,
        ccnSavings,
      }
    })
  }, [lgrData, currentCosts, councilId, councilTier, budgetModel])

  // --- Apply band multiplier ---
  const adjustForBand = useCallback((bandDAmount) => {
    if (bandDAmount == null) return null
    const multiplier = BAND_MULTIPLIERS[selectedBand] || 1
    return bandDAmount * multiplier
  }, [selectedBand])

  // --- Postcode lookup ---
  const lookupPostcode = useCallback(async (pc) => {
    const cleaned = pc.replace(/\s+/g, '').toUpperCase()
    if (cleaned.length < 5) {
      setPostcodeError('Please enter a valid postcode')
      return
    }
    setPostcodeLoading(true)
    setPostcodeError(null)
    setPostcodeResult(null)

    try {
      const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(cleaned)}`)
      const json = await res.json()

      if (json.status !== 200 || !json.result) {
        setPostcodeError('Postcode not found. Please check and try again.')
        return
      }

      const { admin_ward, admin_district } = json.result
      const districtLower = (admin_district || '').toLowerCase()
      const matchedCouncil = DISTRICT_NAME_MAP[districtLower]

      const isLancashire = !!matchedCouncil
      const isThisCouncil = matchedCouncil === councilId

      setPostcodeResult({
        ward: admin_ward,
        district: admin_district,
        postcode: json.result.postcode,
        councilId: matchedCouncil,
        isLancashire,
        isThisCouncil,
      })

      if (!isLancashire) {
        setPostcodeError(`That postcode is in ${admin_district}, not in Lancashire. This calculator covers Lancashire councils only.`)
      }

      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)
      scrollTimerRef.current = setTimeout(() => {
        document.querySelector('.lgr-comparison')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    } catch {
      setPostcodeError('Unable to look up postcode. Please try again.')
    } finally {
      setPostcodeLoading(false)
    }
  }, [councilId])

  const handlePostcodeSubmit = (e) => {
    e.preventDefault()
    lookupPostcode(postcode)
  }

  // --- Chart data: use total bill (council + police + fire) for like-for-like comparison ---
  const comparisonChartData = useMemo(() => {
    if (!currentCosts || !proposalCosts.length) return []

    const items = [{
      name: 'Now (2025/26)',
      cost: adjustForBand(currentCosts.totalBandD),
      fill: '#636366',
    }]

    proposalCosts.forEach(p => {
      if (p.totalNewBandD != null) {
        items.push({
          name: p.short_name,
          cost: adjustForBand(p.totalNewBandD),
          fill: p.color,
        })
      }
    })

    return items
  }, [currentCosts, proposalCosts, adjustForBand])

  const serviceChartData = useMemo(() => {
    if (!currentCosts?.serviceBreakdown) return []
    return Object.entries(currentCosts.serviceBreakdown)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({
        name: name.replace(/ services?$/i, '').replace(/ \(GFRA only\)$/i, ''),
        value,
      }))
  }, [currentCosts])

  const PIE_COLORS = ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#ff453a', '#5ac8fa', '#ff6b6b', '#ffd60a', '#64d2ff']

  // --- Loading / Error states ---
  if (loading) return <LoadingState message="Loading cost data..." />
  if (error) return (
    <div className="page-error">
      <h2>Unable to load data</h2>
      <p>Please try refreshing the page.</p>
    </div>
  )

  const hasResults = currentCosts && postcodeResult?.isLancashire

  return (
    <div className="cost-calc-page animate-fade-in">
      <header className="page-header">
        <h1><Calculator size={28} /> LGR Cost <span className="accent">Calculator</span></h1>
        <p className="subtitle">
          What you pay now vs what you&apos;d pay under each LGR proposal.
          Compares your {currentCosts?.year || '2025/26'} council tax bill with estimated rates after reorganisation (from April 2028).
        </p>
      </header>

      {/* Context banner */}
      <div className="calc-context-banner">
        <Calendar size={16} />
        <span>
          <strong>Now</strong> = your {currentCosts?.year || '2025/26'} council tax (district + county + police + fire).{' '}
          <strong>After LGR</strong> = estimated unitary rate from April 2028, when all 15 current councils are abolished
          and replaced by new unitary authorities. Police and fire precepts stay the same.
        </span>
      </div>

      {/* Postcode + Band selector */}
      <section className="cost-inputs">
        <div className="input-row">
          <div className="postcode-section">
            <form onSubmit={handlePostcodeSubmit} className="cost-postcode-form" aria-label="Postcode lookup">
              <label htmlFor="cost-postcode">Your postcode</label>
              <div className="cost-input-row">
                <div className="cost-input-wrapper">
                  <Search size={18} className="cost-search-icon" />
                  <input
                    id="cost-postcode"
                    type="text"
                    placeholder="e.g. BB11 3DF"
                    value={postcode}
                    onChange={(e) => {
                      setPostcode(e.target.value)
                      setPostcodeError(null)
                      setPostcodeResult(null)
                    }}
                    maxLength={10}
                    autoComplete="postal-code"
                  />
                </div>
                <button
                  type="submit"
                  className="cost-btn"
                  disabled={postcodeLoading || !postcode.trim()}
                >
                  {postcodeLoading ? <Loader2 size={18} className="spin" /> : 'Calculate'}
                </button>
              </div>
            </form>
          </div>

          <div className="band-section">
            <label htmlFor="band-select">Council tax band</label>
            <select
              id="band-select"
              value={selectedBand}
              onChange={(e) => setSelectedBand(e.target.value)}
              className="band-select"
            >
              {Object.keys(BAND_MULTIPLIERS).map(band => (
                <option key={band} value={band}>
                  Band {band} {band === 'D' ? '(average)' : `(×${BAND_MULTIPLIERS[band].toFixed(2)})`}
                </option>
              ))}
            </select>
          </div>
        </div>

        {postcodeError && (
          <div className="cost-message error">
            <AlertCircle size={16} />
            <span>{postcodeError}</span>
          </div>
        )}

        {postcodeResult && !postcodeError && (
          <div className="cost-message success">
            <MapPin size={16} />
            <span>
              <strong>{postcodeResult.postcode}</strong> is in <strong>{postcodeResult.ward}</strong> ward, {postcodeResult.district}
              {!postcodeResult.isThisCouncil && postcodeResult.isLancashire && (
                <> — showing costs for {councilName}</>
              )}
            </span>
          </div>
        )}
      </section>

      {/* Current costs */}
      {currentCosts && (
        <section className="cost-results">
          <h2><PoundSterling size={22} /> What You Pay Now ({currentCosts.year})</h2>
          <p className="section-desc">
            Your current annual council tax bill for {councilName}.
            {!currentCosts.isUnitary && councilTier !== 'county' && (
              <> This includes your district council ({councilName}), Lancashire County Council,
              police and fire precepts.</>
            )}
          </p>

          <div className="cost-cards">
            <div className="cost-card total-card">
              <div className="cost-card-label">
                <Home size={18} />
                Total Bill (Band {selectedBand})
              </div>
              <div className="cost-card-value">
                {formatCurrency(adjustForBand(currentCosts.totalBandD))}
              </div>
              <div className="cost-card-sub">
                {formatCurrency(adjustForBand(currentCosts.totalBandD) / 52)} per week
              </div>
            </div>

            {!currentCosts.isUnitary && councilTier !== 'county' && (
              <>
                <div className="cost-card">
                  <div className="cost-card-label">
                    <Building size={16} />
                    {councilName} (District)
                  </div>
                  <div className="cost-card-value">
                    {formatCurrency(adjustForBand(currentCosts.districtBandD))}
                  </div>
                  <div className="cost-card-sub">
                    {currentCosts.totalBandD > 0 ? ((currentCosts.districtBandD / currentCosts.totalBandD) * 100).toFixed(0) : '0'}% of total
                  </div>
                </div>

                <div className="cost-card">
                  <div className="cost-card-label">
                    <Building size={16} />
                    Lancashire CC (County)
                  </div>
                  <div className="cost-card-value">
                    {formatCurrency(adjustForBand(currentCosts.lccBandD || currentCosts.countyBandD))}
                  </div>
                  <div className="cost-card-sub">
                    {currentCosts.totalBandD > 0 ? (((currentCosts.lccBandD || currentCosts.countyBandD) / currentCosts.totalBandD) * 100).toFixed(0) : '0'}% of total
                  </div>
                </div>

                {currentCosts.policeFire > 0 && (
                  <div className="cost-card">
                    <div className="cost-card-label">
                      <Building size={16} />
                      Police + Fire
                    </div>
                    <div className="cost-card-value">
                      {formatCurrency(adjustForBand(currentCosts.policeFire))}
                    </div>
                    <div className="cost-card-sub">
                      Unchanged under LGR
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Where your money goes — pie chart */}
          {serviceChartData.length > 0 && (
            <div className="cost-chart-section">
              <h3>Where your {councilName} council tax goes</h3>
              <div className="cost-pie-container">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={serviceChartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={110}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {serviceChartData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v) => formatCurrency(v, true)}
                      contentStyle={TOOLTIP_STYLE}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </section>
      )}

      {/* LGR Proposal Comparison — only shown after successful postcode lookup */}
      {proposalCosts.length > 0 && currentCosts && postcodeResult?.isLancashire && (
        <section className="lgr-comparison">
          <h2><Calculator size={22} /> After LGR: Your Estimated Bill (from April 2028)</h2>
          <p className="section-desc">
            What your total council tax bill would be under each proposal.
            The council element (district + county) is replaced by a single harmonised unitary rate.
            Police and fire precepts ({formatCurrency(adjustForBand(currentCosts.policeFire || 0))}) stay the same.
          </p>

          {/* Bar chart comparison */}
          <div className="cost-chart-section">
            <h3>Total Annual Bill Comparison (Band {selectedBand})</h3>
            <p className="chart-desc">Your {currentCosts.year} bill vs estimated bill under each proposal. Lower = better for you.</p>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={comparisonChartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="name" tick={{ fill: '#8e8e93', fontSize: 12 }} />
                <YAxis
                  tick={{ fill: '#8e8e93', fontSize: 12 }}
                  tickFormatter={v => `£${v.toFixed(0)}`}
                  domain={['dataMin - 100', 'dataMax + 50']}
                />
                <Tooltip
                  formatter={(v) => [formatCurrency(v), `Annual bill (Band ${selectedBand})`]}
                  contentStyle={TOOLTIP_STYLE}
                />
                <Bar dataKey="cost" radius={[6, 6, 0, 0]}>
                  {comparisonChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Proposal detail cards */}
          <div className="proposal-cost-cards">
            {proposalCosts.map((proposal) => {
              if (!proposal.myAuthority || proposal.totalNewBandD == null) return null
              const saving = proposal.annualSaving || 0
              const isSaving = saving > 0
              const isExpanded = expandedProposal === proposal.id
              const adjustedTotalNew = adjustForBand(proposal.totalNewBandD)
              const adjustedTotalNow = adjustForBand(currentCosts.totalBandD)
              const adjustedSaving = adjustedTotalNow - adjustedTotalNew

              return (
                <div
                  key={proposal.id}
                  className={`proposal-cost-card ${isSaving ? 'saving' : 'increase'}`}
                  style={{ borderTopColor: proposal.color }}
                >
                  <div
                    className="proposal-cost-header"
                    role="button"
                    tabIndex={0}
                    onClick={() => setExpandedProposal(isExpanded ? null : proposal.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedProposal(isExpanded ? null : proposal.id) } }}
                  >
                    <div className="proposal-cost-title">
                      <span className="proposal-number" style={{ background: proposal.color }}>
                        {proposal.short_name}
                      </span>
                      <div>
                        <h3>{proposal.name}</h3>
                        <span className="proposal-submitted">{proposal.submitted_by}</span>
                      </div>
                    </div>
                    <div className="proposal-cost-summary">
                      <div className="proposal-estimated">
                        <span className="est-label">Est. Band {selectedBand}</span>
                        <span className="est-value">{formatCurrency(adjustedTotalNew)}</span>
                      </div>
                      <div className={`proposal-saving ${isSaving ? 'positive' : 'negative'}`}>
                        {isSaving ? <TrendingDown size={16} /> : <TrendingUp size={16} />}
                        <span>{isSaving ? 'Save' : 'Costs'} {formatCurrency(Math.abs(adjustedSaving))}/yr</span>
                      </div>
                      {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="proposal-cost-detail animate-fade-in">
                      {/* Two-column: AI DOGE estimate and Gov figures */}
                      <div className="estimate-comparison">
                        <div className="estimate-box doge">
                          <h4><Brain size={14} /> AI DOGE Estimate</h4>
                          <div className="estimate-row">
                            <span>New council rate (Band D)</span>
                            <strong>{proposal.harmonisedBandD != null ? formatCurrency(proposal.harmonisedBandD) : '—'}</strong>
                          </div>
                          <div className="estimate-row">
                            <span>Change from current</span>
                            <strong className={isSaving ? 'text-green' : 'text-red'}>
                              {proposal.delta != null ? (proposal.delta > 0 ? `+${formatCurrency(proposal.delta)}` : `−${formatCurrency(Math.abs(proposal.delta))}`) : '—'}
                            </strong>
                          </div>
                          <div className="estimate-row">
                            <span>Total savings (all Lancashire)</span>
                            <strong>
                              {proposal.doge_annual_savings > 0
                                ? <>{formatCurrency(proposal.doge_annual_savings, true)}/yr</>
                                : <span className="text-red">Net cost</span>
                              }
                            </strong>
                          </div>
                          <div className="estimate-row">
                            <span>Transition cost</span>
                            <strong>{formatCurrency(proposal.doge_transition_cost, true)}</strong>
                          </div>
                          <div className="estimate-row">
                            <span>Payback</span>
                            <strong>{proposal.doge_payback_years ? `${proposal.doge_payback_years} years` : 'Never'}</strong>
                          </div>
                          <p className="estimate-source">Based on £2.9B GOV.UK outturn data, 75% realisation rate</p>
                        </div>

                        <div className="estimate-box gov">
                          <h4><BookOpen size={14} /> Government Figures (CCN/PwC)</h4>
                          {proposal.ccnSavings != null ? (
                            <>
                              <div className="estimate-row">
                                <span>Annual savings</span>
                                <strong className={proposal.ccnSavings >= 0 ? 'text-green' : 'text-red'}>
                                  {proposal.ccnSavings >= 0
                                    ? `${formatCurrency(proposal.ccnSavings, true)}/yr`
                                    : `Costs ${formatCurrency(Math.abs(proposal.ccnSavings), true)}/yr MORE`
                                  }
                                </strong>
                              </div>
                              <div className="estimate-row">
                                <span>Transition cost</span>
                                <strong>{proposal.ccn_transition_cost ? formatCurrency(proposal.ccn_transition_cost, true) : '—'}</strong>
                              </div>
                              <p className="estimate-source">CCN/PwC proprietary model — assumptions not published</p>
                            </>
                          ) : (
                            <p className="estimate-source">Not modelled by CCN/PwC</p>
                          )}
                        </div>
                      </div>

                      <div className="detail-grid">
                        <div className="detail-item">
                          <span className="detail-label">Your new authority</span>
                          <span className="detail-value">{proposal.myAuthority.name}</span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Councils merging</span>
                          <span className="detail-value">{proposal.numCouncils} councils</span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Population</span>
                          <span className="detail-value">{proposal.populationText}</span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Meets 500K threshold?</span>
                          <span className="detail-value">
                            {(proposal.myAuthority.population || 0) >= 500000
                              ? <><Check size={14} className="text-green" /> Yes</>
                              : <><XIcon size={14} className="text-red" /> No ({formatNumber(proposal.myAuthority.population)})</>
                            }
                          </span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Weekly change (Band {selectedBand})</span>
                          <span className="detail-value">
                            {adjustedSaving > 0
                              ? <span className="text-green">Save {formatCurrency(adjustedSaving / 52)}/week</span>
                              : <span className="text-red">Costs {formatCurrency(Math.abs(adjustedSaving) / 52)}/week more</span>
                            }
                          </span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">When</span>
                          <span className="detail-value">From April 2028 (if this proposal chosen)</span>
                        </div>
                      </div>

                      <div className="detail-councils">
                        <span className="detail-label">Councils in {proposal.myAuthority.name}:</span>
                        <div className="council-list">
                          {proposal.myAuthority.councils.map(c => (
                            <span key={c} className={`council-chip ${c === councilId ? 'current' : ''}`}>
                              {c === councilId && <MapPin size={12} />}
                              {c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
                                .replace('Lancashire Cc', 'Lancashire CC')
                              }
                            </span>
                          ))}
                        </div>
                      </div>

                      {proposal.myAuthority.notes && (
                        <p className="detail-notes">{proposal.myAuthority.notes}</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Key insight box */}
          <div className="calc-insight-box">
            <AlertTriangle size={16} />
            <div>
              <strong>Why does the saving differ by proposal?</strong>
              <p>
                Each proposal groups different councils together. The harmonised rate is a weighted average
                of all councils in the group — so your saving depends on which councils you&apos;re merged with
                and their current tax rates. Fewer, larger authorities achieve greater economies of scale
                (bigger savings), but the council tax averaging effect varies by area.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Prompt to enter postcode if not done yet */}
      {currentCosts && !postcodeResult?.isLancashire && (
        <section className="cost-prompt">
          <div className="prompt-card">
            <Search size={24} />
            <h3>Enter your postcode above to compare your council tax bill under each LGR proposal</h3>
            <p className="text-secondary">
              We&apos;ll show your {currentCosts.year} bill vs estimated costs after reorganisation in April 2028,
              with both AI DOGE and Government (CCN/PwC) figures.
            </p>
          </div>
        </section>
      )}

      {/* Key caveats / methodology */}
      <section className="methodology-section">
        <button
          className="methodology-toggle"
          onClick={() => setShowMethodology(!showMethodology)}
        >
          <HelpCircle size={18} />
          How is this calculated?
          {showMethodology ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>

        {showMethodology && (
          <div className="methodology-content animate-fade-in">
            <div className="method-grid">
              <div className="method-item">
                <h4>Current costs ({currentCosts?.year || '2025/26'})</h4>
                <p>
                  Band D council tax from GOV.UK MHCLG data. For districts, the total includes
                  the Lancashire County Council precept, plus police and fire precepts.
                  Other bands use the statutory multiplier (Band A = 6/9, Band H = 18/9 of Band D).
                </p>
              </div>
              <div className="method-item">
                <h4>After LGR (from April 2028)</h4>
                <p>
                  The new unitary council tax is a <strong>harmonised rate</strong> — a weighted average
                  of all constituent councils&apos; current district + county elements, weighted by tax base size.
                  Councils currently paying above the average see their bill fall; those below see it rise.
                  AI DOGE additionally factors in projected savings to reduce the harmonised rate.
                </p>
              </div>
              <div className="method-item">
                <h4>Government (CCN/PwC) figures</h4>
                <p>
                  The County Councils Network commissioned PwC to model savings for each option.
                  These figures are shown for comparison, but the underlying assumptions are proprietary
                  and not publicly available. CCN represents county councils, who benefit from fewer unitaries.
                </p>
              </div>
              <div className="method-item">
                <h4>What&apos;s included and excluded</h4>
                <p>
                  <strong>Included:</strong> District council element, Lancashire County Council element,
                  police precept, fire precept — your full council tax bill.<br />
                  <strong>Excluded:</strong> Parish precepts (varies by parish, unchanged under LGR).
                  Actual rates will depend on government decisions about harmonisation periods and transition funding.
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* CTA to LGR Tracker */}
      <section className="cost-cta">
        <div className="cta-card">
          <h3>Want the full picture?</h3>
          <p>
            See detailed financial models, political analysis, demographics and
            AI DOGE&apos;s independent critique of all 5 proposals.
          </p>
          <Link to="/lgr" className="cta-link">
            View LGR Tracker <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </div>
  )
}

export default LGRCostCalculator
