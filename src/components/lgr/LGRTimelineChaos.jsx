import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { AlertTriangle, Clock, Users, Building, ShieldAlert, Activity } from 'lucide-react'
import { TOOLTIP_STYLE, GRID_STROKE, AXIS_TICK_STYLE } from '../../utils/constants'
import { formatNumber } from '../../utils/format'
import { computeTimelineFeasibility } from '../../utils/lgrModel'
import './LGRTimelineChaos.css'

const SEVERITY_COLORS = { critical: '#ff453a', high: '#ff9f0a', medium: '#ffd60a', low: '#30d158' }

const WORKSTREAMS = [
  { name: 'IT Migration', months: 24, color: '#ff453a', start: 0 },
  { name: 'Staff TUPE', months: 18, color: '#ff9f0a', start: 2 },
  { name: 'Shadow Authorities', months: 6, color: '#12B6CF', start: 10 },
  { name: 'Service Continuity', months: 12, color: '#bf5af2', start: 6 },
  { name: 'Democratic Elections', months: 6, color: '#30d158', start: 16 },
]

const SERVICE_RISKS = [
  {
    service: "Children's Services",
    icon: Users,
    risk: 'critical',
    description: 'Safeguarding caseloads cannot pause during transition. 3 separate children\'s services must merge with no gap in cover.',
    metric: '~4,500 open cases',
  },
  {
    service: 'Adult Social Care',
    icon: Activity,
    risk: 'critical',
    description: 'Care packages, provider contracts and assessment teams across 15 councils. Disruption risks vulnerable adults.',
    metric: '~22,000 service users',
  },
  {
    service: 'Education & SEND',
    icon: Building,
    risk: 'high',
    description: 'DSG deficit transfer, EHCP backlogs, and school place planning must continue uninterrupted.',
    metric: '~8,200 EHCPs',
  },
  {
    service: 'Highways & Waste',
    icon: ShieldAlert,
    risk: 'medium',
    description: 'Contract novation for waste collection, highway maintenance and winter gritting across merged areas.',
    metric: '12 separate contracts',
  },
]

const DEFAULT_PRECEDENTS = [
  { name: 'Buckinghamshire', population: 546000, councils_merged: 5, months: 30, on_budget: true, lessons: 'Strong programme office; 2-year lead time critical' },
  { name: 'Dorset', population: 380000, councils_merged: 6, months: 30, on_budget: true, lessons: 'Rural geography added complexity; IT integration took longest' },
  { name: 'North Yorkshire', population: 615000, councils_merged: 8, months: 36, on_budget: false, lessons: 'Largest by area; cost overrun on IT; staff morale issues' },
  { name: 'Northamptonshire', population: 760000, councils_merged: 7, months: 28, on_budget: false, lessons: 'Financial crisis drove merger; rushed timeline; service gaps' },
]

function FeasibilityGauge({ score, verdict }) {
  const radius = 54
  const circumference = Math.PI * radius
  const offset = circumference - (score / 100) * circumference
  const color = score <= 20 ? '#ff453a' : score <= 40 ? '#ff9f0a' : score <= 60 ? '#ffd60a' : '#30d158'

  return (
    <div className="ltc-gauge" role="img" aria-label={`Feasibility score: ${score} out of 100. ${verdict}`}>
      <svg viewBox="0 0 120 70" className="ltc-gauge-svg">
        <path
          d="M 6 64 A 54 54 0 0 1 114 64"
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d="M 6 64 A 54 54 0 0 1 114 64"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="ltc-gauge-arc"
        />
        <text x="60" y="52" textAnchor="middle" className="ltc-gauge-score" fill={color}>
          {score}
        </text>
        <text x="60" y="66" textAnchor="middle" className="ltc-gauge-label" fill="#8e8e93">
          / 100
        </text>
      </svg>
      <div className="ltc-gauge-verdict" style={{ color }}>{verdict}</div>
    </div>
  )
}

function CriticalPathChart({ monthsAvailable }) {
  const data = WORKSTREAMS.map(ws => ({
    name: ws.name,
    start: ws.start,
    duration: ws.months,
    overrun: Math.max(0, (ws.start + ws.months) - monthsAvailable),
    color: ws.color,
  }))

  return (
    <div className="ltc-chart-wrap">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, bottom: 8, left: 120 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
          <XAxis
            type="number"
            tick={AXIS_TICK_STYLE}
            domain={[0, 30]}
            label={{ value: 'Months', position: 'insideBottomRight', offset: -4, fill: '#8e8e93', fontSize: 11 }}
          />
          <YAxis type="category" dataKey="name" tick={AXIS_TICK_STYLE} width={110} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(val, name) => {
              if (name === 'start') return [`${val} months`, 'Start offset']
              if (name === 'overrun') return [`${val} months`, 'Overrun past deadline']
              return [`${val} months`, 'Duration']
            }}
          />
          <Bar dataKey="start" stackId="a" fill="transparent" />
          <Bar dataKey="duration" stackId="a" radius={[0, 4, 4, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} fillOpacity={0.85} />
            ))}
          </Bar>
          {monthsAvailable > 0 && (
            <Bar dataKey="overrun" stackId="a" fill="#ff453a" fillOpacity={0.4} radius={[0, 4, 4, 0]} />
          )}
        </BarChart>
      </ResponsiveContainer>
      {monthsAvailable > 0 && (
        <div className="ltc-deadline-note">
          <Clock size={13} /> Deadline at {monthsAvailable} months — workstreams exceeding this are at risk
        </div>
      )}
    </div>
  )
}

export default function LGRTimelineChaos({ timeline, selectedModel }) {
  const feasibility = useMemo(() => computeTimelineFeasibility(timeline), [timeline])

  if (!timeline) return null

  const { score, verdict, riskFactors, costOverrun, monthsAvailable, precedentAvgMonths, lancashireComplexity } = feasibility
  const precedents = feasibility.precedents?.length ? feasibility.precedents : DEFAULT_PRECEDENTS

  const lancashirePrecedentRow = {
    name: 'Lancashire (proposed)',
    population: lancashireComplexity?.population || 1530000,
    councils_merged: lancashireComplexity?.councils || 15,
    months: monthsAvailable || 22,
    on_budget: null,
    lessons: 'Unprecedented scale; 3-tier merge; no UK precedent at this complexity',
    isLancashire: true,
  }

  const overrunMedian = costOverrun?.median_overrun_pct || 35
  const onTimeProbability = costOverrun?.on_time_probability_pct || 8

  return (
    <section className="ltc-container" aria-label="LGR Timeline Feasibility Analysis">
      <h2 className="ltc-title">
        <Clock size={20} />
        Timeline Feasibility Analysis
        {selectedModel && <span className="ltc-model-tag">{selectedModel.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>}
      </h2>
      <p className="ltc-subtitle">
        Can Lancashire deliver LGR in the proposed timeframe? Analysis based on UK reorganisation precedents.
      </p>

      {/* Feasibility Gauge + Key Stats */}
      <div className="ltc-top-row">
        <FeasibilityGauge score={score} verdict={verdict} />
        <div className="ltc-stats-grid" role="list" aria-label="Key timeline statistics">
          <div className="ltc-stat-card" role="listitem">
            <span className="ltc-stat-value">{monthsAvailable || 22}</span>
            <span className="ltc-stat-label">Months Available</span>
            <span className="ltc-stat-context">vs ~{precedentAvgMonths || 31} precedent avg</span>
          </div>
          <div className="ltc-stat-card" role="listitem">
            <span className="ltc-stat-value">{lancashireComplexity?.councils || 15}</span>
            <span className="ltc-stat-label">Councils to Merge</span>
            <span className="ltc-stat-context">vs ~4 precedent avg</span>
          </div>
          <div className="ltc-stat-card" role="listitem">
            <span className="ltc-stat-value">{formatNumber((lancashireComplexity?.population || 1530000) / 1000000, 1)}M</span>
            <span className="ltc-stat-label">Population</span>
            <span className="ltc-stat-context">vs ~450K precedent avg</span>
          </div>
          <div className="ltc-stat-card" role="listitem">
            <span className="ltc-stat-value">{formatNumber(lancashireComplexity?.staff || 30000)}+</span>
            <span className="ltc-stat-label">Staff under TUPE</span>
            <span className="ltc-stat-context">Legal minimum 6 months</span>
          </div>
        </div>
      </div>

      {/* Precedent Comparison */}
      <div className="ltc-section">
        <h3><Building size={16} /> Precedent Comparison</h3>
        <div className="ltc-table-wrap" role="region" aria-label="Precedent comparison table" tabIndex={0}>
          <table className="ltc-table" aria-label="UK LGR precedent comparison">
            <thead>
              <tr>
                <th scope="col">Reorganisation</th>
                <th scope="col">Population</th>
                <th scope="col">Councils</th>
                <th scope="col">Months</th>
                <th scope="col">On Budget</th>
                <th scope="col">Key Lessons</th>
              </tr>
            </thead>
            <tbody>
              {precedents.map((p, i) => (
                <tr key={i}>
                  <td>{p.name}</td>
                  <td>{formatNumber(p.population)}</td>
                  <td>{p.councils_merged}</td>
                  <td>{p.months}</td>
                  <td>
                    <span className={`ltc-budget-badge ${p.on_budget ? 'on' : 'over'}`}>
                      {p.on_budget ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="ltc-lessons">{p.lessons_learned || p.lessons}</td>
                </tr>
              ))}
              <tr className="ltc-lancashire-row">
                <td><strong>{lancashirePrecedentRow.name}</strong></td>
                <td><strong>{formatNumber(lancashirePrecedentRow.population)}</strong></td>
                <td><strong>{lancashirePrecedentRow.councils_merged}</strong></td>
                <td><strong>{lancashirePrecedentRow.months}</strong></td>
                <td><span className="ltc-budget-badge unknown">TBD</span></td>
                <td className="ltc-lessons">{lancashirePrecedentRow.lessons}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Critical Path Chart */}
      <div className="ltc-section">
        <h3><Clock size={16} /> Critical Path — Workstream Overlap</h3>
        <p className="ltc-section-desc">
          Multiple workstreams must run in parallel within {monthsAvailable || 22} months. IT migration alone typically takes 24 months.
        </p>
        <CriticalPathChart monthsAvailable={monthsAvailable || 22} />
      </div>

      {/* Risk Factors */}
      {riskFactors?.length > 0 && (
        <div className="ltc-section">
          <h3><AlertTriangle size={16} /> Risk Factors</h3>
          <ul className="ltc-risk-list" aria-label="Risk factors">
            {riskFactors.map((rf, i) => {
              const severity = typeof rf === 'object' ? (rf.severity || 'medium') : 'high'
              const text = typeof rf === 'object' ? (rf.description || rf.text || rf.factor || '') : rf
              return (
                <li key={i} className="ltc-risk-item">
                  <span className="ltc-risk-dot" style={{ background: SEVERITY_COLORS[severity] }} aria-label={severity} />
                  <span className="ltc-risk-text">{text}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Cost Overrun Analysis */}
      <div className="ltc-section">
        <h3><AlertTriangle size={16} /> Cost Overrun Analysis</h3>
        <div className="ltc-overrun-cards">
          <div className="ltc-overrun-card">
            <span className="ltc-overrun-value" style={{ color: '#ff9f0a' }}>{overrunMedian}%</span>
            <span className="ltc-overrun-label">Historical Median Overrun</span>
            <span className="ltc-overrun-context">Based on 4 recent UK reorganisations</span>
          </div>
          <div className="ltc-overrun-card">
            <span className="ltc-overrun-value" style={{ color: '#ff453a' }}>{onTimeProbability}%</span>
            <span className="ltc-overrun-label">On-Time Probability</span>
            <span className="ltc-overrun-context">Given Lancashire's unprecedented scale</span>
          </div>
          <div className="ltc-overrun-card">
            <span className="ltc-overrun-value" style={{ color: '#ffd60a' }}>
              {monthsAvailable ? `${Math.max(0, (precedentAvgMonths || 31) - monthsAvailable)}` : '9'}
            </span>
            <span className="ltc-overrun-label">Month Shortfall vs Precedent</span>
            <span className="ltc-overrun-context">{monthsAvailable || 22} available vs {precedentAvgMonths || 31} avg needed</span>
          </div>
        </div>
      </div>

      {/* Service Continuity Risk */}
      <div className="ltc-section">
        <h3><ShieldAlert size={16} /> Service Continuity Risk During Transition</h3>
        <div className="ltc-service-grid" role="list" aria-label="Service continuity risks">
          {SERVICE_RISKS.map((sr, i) => {
            const Icon = sr.icon
            return (
              <div key={i} className={`ltc-service-card ltc-risk-${sr.risk}`} role="listitem">
                <div className="ltc-service-header">
                  <Icon size={16} />
                  <span className="ltc-service-name">{sr.service}</span>
                  <span className={`ltc-severity-badge ltc-sev-${sr.risk}`}>{sr.risk}</span>
                </div>
                <p className="ltc-service-desc">{sr.description}</p>
                <span className="ltc-service-metric">{sr.metric}</span>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
