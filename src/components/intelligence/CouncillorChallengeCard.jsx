/**
 * CouncillorChallengeCard — Per-councillor attack/response card for meeting mode.
 *
 * Shows a specific opposition member's predicted challenges and tailored counter-arguments
 * in an "If they say X, respond Y" format. Designed for rapid access during live meetings.
 */
import { useState } from 'react'
import { ChevronDown, ChevronRight, Copy, Check, AlertTriangle } from 'lucide-react'
import CouncillorLink from '../CouncillorLink'
import { slugify } from '../../utils/format'
import { PARTY_COLORS } from '../../utils/constants'

const SEVERITY_COLORS = { high: '#ff453a', medium: '#ff9f0a', low: '#8e8e93' }
const TYPE_ICONS = {
  hypocrisy: '🔄',
  rebel: '⚡',
  party_record: '📋',
  integrity: '🚩',
  conflict: '⚠️',
  interest: '💼',
  ward_contradiction: '📊',
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = (e) => {
    e.stopPropagation()
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button className="challenge-copy-btn" onClick={handleCopy} title="Copy response">
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  )
}

export default function CouncillorChallengeCard({ attacker, integrityData }) {
  const [showPartyLines, setShowPartyLines] = useState(false)
  if (!attacker) return null

  const { specificCounters = [], attackLines = [], predictedArguments = [] } = attacker
  const partyColor = PARTY_COLORS[attacker.party] || '#888'

  return (
    <div className="challenge-card">
      {/* Header */}
      <div className="challenge-card-header">
        <div className="challenge-name-row">
          <CouncillorLink name={attacker.name} councillorId={slugify(attacker.name)} integrityData={integrityData} compact />
          <span className="challenge-party-badge" style={{ background: partyColor }}>
            {attacker.party}
          </span>
        </div>
        <div className="challenge-meta">
          {attacker.role && <span className="challenge-role">{attacker.role}</span>}
          {attacker.ward && <span className="challenge-ward">{attacker.ward}</span>}
          {attacker.likelyToSpeak && <span className="challenge-speaker-badge">Likely Speaker</span>}
        </div>
      </div>

      {/* Per-councillor specific counters — the main event */}
      {specificCounters.length > 0 && (
        <div className="challenge-counters">
          {specificCounters.map((c, i) => (
            <div key={i} className={`challenge-counter-pair type-${c.type}`}>
              <div className="challenge-if-they-say">
                <span className="challenge-label">
                  {TYPE_ICONS[c.type] || '💬'} IF THEY SAY:
                </span>
                <span className="challenge-attack-text">{c.attack}</span>
              </div>
              <div className="challenge-respond-with">
                <span className="challenge-label">RESPOND WITH:</span>
                <span className="challenge-response-text">{c.counter}</span>
                <CopyButton text={c.counter} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Predicted arguments chips */}
      {predictedArguments.length > 0 && (
        <div className="challenge-predicted-args">
          <span className="challenge-args-label">Predicted angles:</span>
          {predictedArguments.map((arg, i) => (
            <span key={i} className="challenge-arg-chip">{arg}</span>
          ))}
        </div>
      )}

      {/* Party attack lines — collapsible */}
      {attackLines.length > 0 && (
        <div className="challenge-party-lines">
          <button
            className="challenge-party-toggle"
            onClick={() => setShowPartyLines(!showPartyLines)}
          >
            {showPartyLines ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            General attack lines ({attackLines.length})
          </button>
          {showPartyLines && (
            <div className="challenge-party-lines-list">
              {attackLines.map((al, i) => (
                <div key={i} className="challenge-attack-line" style={{ borderLeftColor: SEVERITY_COLORS[al.severity] || '#888' }}>
                  {al.text}
                  <CopyButton text={al.text} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {specificCounters.length === 0 && attackLines.length === 0 && predictedArguments.length === 0 && (
        <p className="challenge-empty">No specific counter-arguments generated for this councillor on this topic.</p>
      )}
    </div>
  )
}
