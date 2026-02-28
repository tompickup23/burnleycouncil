/**
 * EvidenceChain — Visual thread connecting findings through the data.
 *
 * Renders a chain: Finding → Supplier → Payment → Councillor
 * Each node is clickable. Used in DOGE, Integrity, CouncillorDossier.
 *
 * Props:
 *   finding {string} - The DOGE/integrity finding
 *   supplier {object} - { name, chNumber, riskLevel }
 *   payments {array} - [{ date, amount }]
 *   councillor {object} - { name, councillorId, integrityScore, riskLevel }
 *   totalSpend {number} - Total spend amount
 *   expandable {boolean} - Whether to show collapsed initially
 */
import { useState } from 'react'
import CouncillorLink from './CouncillorLink'
import SupplierLink from './SupplierLink'

const NODE_STYLE = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '8px',
  padding: '8px 12px',
  borderRadius: '8px',
  fontSize: '0.8rem',
  lineHeight: 1.4,
}

const CONNECTOR = {
  width: '2px',
  height: '16px',
  backgroundColor: 'var(--text-secondary, #475569)',
  marginLeft: '16px',
  opacity: 0.4,
}

export default function EvidenceChain({
  finding,
  supplier,
  payments = [],
  councillor,
  totalSpend,
  expandable = true,
}) {
  const [expanded, setExpanded] = useState(!expandable)

  if (expandable && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="evidence-chain-toggle"
        style={{
          background: 'none',
          border: '1px solid var(--border-color, #334155)',
          borderRadius: '6px',
          padding: '4px 10px',
          color: 'var(--accent, #0a84ff)',
          fontSize: '0.7rem',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        <span>🔗</span> View evidence chain
      </button>
    )
  }

  return (
    <div
      className="evidence-chain glass-card"
      style={{
        padding: '12px',
        borderRadius: '10px',
        border: '1px solid var(--border-color, #334155)',
        background: 'var(--card-bg, rgba(15, 23, 42, 0.6))',
        fontSize: '0.8rem',
      }}
    >
      {/* Finding Node */}
      {finding && (
        <>
          <div style={{ ...NODE_STYLE, backgroundColor: 'rgba(59, 130, 246, 0.1)' }}>
            <span style={{ fontSize: '1rem' }}>🔍</span>
            <div>
              <div style={{ fontWeight: 600, color: '#3b82f6', marginBottom: '2px' }}>Finding</div>
              <div style={{ color: 'var(--text-primary, #e2e8f0)' }}>{finding}</div>
            </div>
          </div>
          <div style={CONNECTOR} />
        </>
      )}

      {/* Supplier Node */}
      {supplier && (
        <>
          <div style={{ ...NODE_STYLE, backgroundColor: 'rgba(168, 85, 247, 0.1)' }}>
            <span style={{ fontSize: '1rem' }}>💼</span>
            <div>
              <div style={{ fontWeight: 600, color: '#a855f7', marginBottom: '2px' }}>Supplier</div>
              <SupplierLink
                name={supplier.name}
                chNumber={supplier.chNumber}
                riskLevel={supplier.riskLevel}
              />
            </div>
          </div>
          <div style={CONNECTOR} />
        </>
      )}

      {/* Payments Node */}
      {(payments.length > 0 || totalSpend) && (
        <>
          <div style={{ ...NODE_STYLE, backgroundColor: 'rgba(34, 197, 94, 0.1)' }}>
            <span style={{ fontSize: '1rem' }}>💰</span>
            <div>
              <div style={{ fontWeight: 600, color: '#22c55e', marginBottom: '2px' }}>Payments</div>
              {totalSpend != null && (
                <div style={{ fontVariantNumeric: 'tabular-nums' }}>
                  £{totalSpend.toLocaleString('en-GB')}
                  {payments.length > 0 && ` across ${payments.length} transaction${payments.length > 1 ? 's' : ''}`}
                </div>
              )}
              {payments.length > 0 && payments.length <= 5 && (
                <div style={{ marginTop: '4px', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                  {payments.map((p, i) => (
                    <div key={i}>
                      {p.date} — £{(p.amount || 0).toLocaleString('en-GB')}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div style={CONNECTOR} />
        </>
      )}

      {/* Councillor Node */}
      {councillor && (
        <div style={{ ...NODE_STYLE, backgroundColor: 'rgba(249, 115, 22, 0.1)' }}>
          <span style={{ fontSize: '1rem' }}>👤</span>
          <div>
            <div style={{ fontWeight: 600, color: '#f97316', marginBottom: '2px' }}>Director / Councillor</div>
            <CouncillorLink
              name={councillor.name}
              councillorId={councillor.councillorId}
              integrityScore={councillor.integrityScore}
              riskLevel={councillor.riskLevel}
            />
          </div>
        </div>
      )}

      {expandable && (
        <button
          onClick={() => setExpanded(false)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            fontSize: '0.65rem',
            cursor: 'pointer',
            marginTop: '8px',
            padding: 0,
          }}
        >
          ▲ Collapse
        </button>
      )}
    </div>
  )
}
