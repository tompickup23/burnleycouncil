import { useMemo } from 'react'
import { formatCurrency } from '../../utils/format'
import { TOOLTIP_STYLE, GRID_STROKE, AXIS_TICK_STYLE } from '../../utils/constants'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { AlertTriangle, ArrowDownRight, Layers } from 'lucide-react'
import './LGRCCAImpact.css'

/**
 * LGR CCA Impact — warns about double-counting risk where services
 * have already been transferred to the Combined County Authority.
 *
 * Props:
 *   ccaData — cca_impact from lgr_enhanced.json
 *     { transfers: [...], total_transferred: N, deduction_from_savings: N }
 */

const TRANSFER_COLORS = [
  '#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#ff453a',
  '#64d2ff', '#ffd60a', '#ff6482',
]

function LGRCCAImpact({ ccaData }) {
  if (!ccaData) return null

  const transfers = ccaData.transfers || []
  const totalTransferred = ccaData.total_transferred || 0
  const deduction = ccaData.deduction_from_savings || 0

  if (transfers.length === 0 && totalTransferred === 0) return null

  // Chart data — transfers sorted by amount descending
  const chartData = useMemo(() => {
    return [...transfers]
      .sort((a, b) => (b.amount || 0) - (a.amount || 0))
      .map(t => ({
        service: t.service || 'Unknown',
        amount: (t.amount || 0) / 1e6,
        description: t.description || '',
      }))
  }, [transfers])

  return (
    <section className="lgr-cca-impact" aria-label="CCA Double-Counting Impact">
      {/* Warning banner */}
      <div className="lgr-cca-warning" role="alert">
        <AlertTriangle size={20} />
        <div className="lgr-cca-warning-content">
          <strong>Double-Counting Risk</strong>
          <p>
            Some services cited in LGR savings estimates have already been transferred
            to the Lancashire Combined County Authority (CCA). Including these in
            reorganisation savings would be double-counting.
          </p>
        </div>
      </div>

      <h2>
        <Layers size={20} />
        CCA Service Transfers
      </h2>
      <p className="lgr-cca-desc">
        Services already operating at combined authority level — not available for LGR savings.
      </p>

      {/* Transfer table */}
      {transfers.length > 0 && (
        <div className="lgr-cca-table-wrap">
          <table className="lgr-cca-table" role="table">
            <thead>
              <tr>
                <th scope="col">Service</th>
                <th scope="col" className="lgr-cca-col-amount">Annual Amount</th>
                <th scope="col">Description</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((t, i) => (
                <tr key={i}>
                  <td className="lgr-cca-service-name">{t.service || 'Unknown'}</td>
                  <td className="lgr-cca-col-amount">{formatCurrency(t.amount, true)}</td>
                  <td className="lgr-cca-description">{t.description || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Transfer bar chart */}
      {chartData.length > 0 && (
        <div className="lgr-cca-chart-card">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="service" tick={AXIS_TICK_STYLE} />
              <YAxis tick={AXIS_TICK_STYLE} tickFormatter={v => `£${v}M`} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v) => [`£${v.toFixed(1)}M`, 'Transferred']}
              />
              <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={TRANSFER_COLORS[i % TRANSFER_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Totals */}
      <div className="lgr-cca-totals">
        <div className="lgr-cca-total-card">
          <span className="lgr-cca-total-label">Total Already at CCA Level</span>
          <span className="lgr-cca-total-value">{formatCurrency(totalTransferred, true)}</span>
        </div>
        {deduction > 0 && (
          <div className="lgr-cca-total-card lgr-cca-deduction">
            <ArrowDownRight size={16} />
            <div>
              <span className="lgr-cca-total-label">Required Deduction from LGR Savings</span>
              <span className="lgr-cca-total-value lgr-cca-deduction-value">
                -{formatCurrency(deduction, true)}
              </span>
            </div>
          </div>
        )}
      </div>

      <p className="lgr-cca-footnote">
        LGR savings estimates must subtract CCA-transferred services to avoid overstating
        benefits. The true net saving is lower than headline figures suggest.
      </p>
    </section>
  )
}

export default LGRCCAImpact
