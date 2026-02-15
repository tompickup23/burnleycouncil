import { useState, useMemo } from 'react'
import { TrendingDown, Percent, AlertTriangle, ShieldCheck, Heart, Ban, Cpu, Construction, GraduationCap, ChevronDown, ChevronUp, CheckCircle2, XCircle, ArrowRight } from 'lucide-react'
import { formatCurrency } from '../utils/format'
import './ReformShowcase.css'

const ICON_MAP = {
  'trending-down': TrendingDown,
  'percent': Percent,
  'alert-triangle': AlertTriangle,
  'shield-check': ShieldCheck,
  'heart': Heart,
  'ban': Ban,
  'cpu': Cpu,
  'construction': Construction,
  'graduation-cap': GraduationCap,
}

function ReformShowcase({ data }) {
  const [expandedSection, setExpandedSection] = useState(null)

  if (!data?.achievements) return null

  const achievements = data.achievements
  const inherited = data.inherited_problems || {}
  const comparison = data.comparison_table

  const sections = [
    'financial_turnaround', 'council_tax', 'bonds_scandal_exposed',
    'pension_fund_reform', 'care_homes_saved', 'councillor_allowances',
    'ai_innovation', 'roads', 'send_improvement'
  ].filter(key => achievements[key])

  return (
    <div className="reform-showcase">
      {/* Hero */}
      <div className="reform-hero">
        <span className="reform-eyebrow">Reform UK — Lancashire County Council</span>
        <h2>{data.headline || 'Transforming Lancashire County Council'}</h2>
        <p className="reform-tagline">{data.tagline}</p>
      </div>

      {/* Inherited Crisis */}
      <div className="inherited-crisis">
        <h3>What Reform Inherited (May 2025)</h3>
        <div className="crisis-grid">
          <div className="crisis-card">
            <span className="crisis-number">{formatCurrency(inherited.projected_overspend)}</span>
            <span className="crisis-label">Projected overspend</span>
          </div>
          <div className="crisis-card">
            <span className="crisis-number">{Math.round(inherited.tory_savings_delivery_rate * 100)}%</span>
            <span className="crisis-label">Savings delivery rate under Conservatives</span>
          </div>
          <div className="crisis-card">
            <span className="crisis-number">{formatCurrency(inherited.veltip_bond_loss)}</span>
            <span className="crisis-label">VeLTIP bond portfolio paper loss (concealed)</span>
          </div>
          <div className="crisis-card">
            <span className="crisis-number">{inherited.cqc_score}</span>
            <span className="crisis-label">CQC adult social care rating (joint lowest county)</span>
          </div>
          <div className="crisis-card">
            <span className="crisis-number">{formatCurrency(inherited.dsg_deficit)}</span>
            <span className="crisis-label">DSG deficit (rising to £420M by 2029)</span>
          </div>
          <div className="crisis-card">
            <span className="crisis-number">{formatCurrency(inherited.debt_level)}</span>
            <span className="crisis-label">Council debt</span>
          </div>
        </div>
      </div>

      {/* Achievement Sections */}
      <div className="reform-achievements">
        <h3>What Reform Has Delivered</h3>
        {sections.map(key => {
          const section = achievements[key]
          const IconComponent = ICON_MAP[section.icon] || ShieldCheck
          const isExpanded = expandedSection === key

          return (
            <div key={key} className={`reform-section ${isExpanded ? 'expanded' : ''}`}>
              <div
                className="reform-section-header"
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                onClick={() => setExpandedSection(isExpanded ? null : key)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedSection(isExpanded ? null : key) } }}
              >
                <div className="reform-section-title">
                  <IconComponent size={20} className="reform-section-icon" />
                  <h4>{section.headline}</h4>
                </div>
                <div className="reform-section-preview">
                  {section.items?.slice(0, 2).map((item, i) => (
                    <span key={i} className="preview-metric">{item.metric}</span>
                  ))}
                </div>
                {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </div>

              {isExpanded && (
                <div className="reform-section-body">
                  {section.items?.map((item, i) => (
                    <div key={i} className="reform-item">
                      <div className="reform-item-metric">{item.metric}</div>
                      <div className="reform-item-content">
                        <span className="reform-item-label">{item.label}</span>
                        <span className="reform-item-detail">{item.detail}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Comparison Table */}
      {comparison && (
        <div className="reform-comparison">
          <h3>{comparison.title}</h3>
          <div className="comparison-table-wrapper">
            <table className="comparison-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th className="reform-col">Reform UK</th>
                  <th className="tory-col">Conservative</th>
                  <th>Verdict</th>
                </tr>
              </thead>
              <tbody>
                {comparison.rows?.map((row, i) => (
                  <tr key={i}>
                    <td className="metric-cell">{row.metric}</td>
                    <td className="reform-cell">{row.reform}</td>
                    <td className="tory-cell">{row.conservative}</td>
                    <td className="verdict-cell">
                      <span className="verdict-badge">{row.verdict}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default ReformShowcase
