import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import EvidenceTimeline from './EvidenceTimeline'

vi.mock('./EvidenceTimeline.css', () => ({}))

const mockTrail = [
  { field: 'name', value: 'County Hall', source: 'codex_csv', source_label: 'Codex Property Register', date: '2025-01-15', confidence: 'high' },
  { field: 'epc_rating', value: 'C', source: 'epc_register', source_label: 'EPC Register', date: '2025-06-20', confidence: 'high', source_url: 'https://epc.example.com' },
  { field: 'address', value: 'PO Box 78, Preston', source: 'codex_csv', source_label: 'Codex Property Register', date: '2025-01-15', confidence: 'high' },
  { field: 'service_status', value: 'community_managed', source: 'lcc_website', source_label: 'LCC Website', date: '2026-03-04', confidence: 'high', source_url: 'https://lancashire.gov.uk/libraries' },
  { field: 'flood_zone', value: 'Zone 2', source: 'environment_agency_api', source_label: 'Environment Agency', date: '2026-03-04', confidence: 'medium' },
]

describe('EvidenceTimeline', () => {
  it('renders empty state when trail is empty', () => {
    render(<EvidenceTimeline trail={[]} />)
    expect(screen.getByText(/no evidence trail available/i)).toBeInTheDocument()
  })

  it('renders empty state when trail prop is undefined', () => {
    render(<EvidenceTimeline />)
    expect(screen.getByText(/no evidence trail available/i)).toBeInTheDocument()
  })

  it('renders entries grouped by source', () => {
    render(<EvidenceTimeline trail={mockTrail} />)
    // 4 distinct sources in the mock data
    const groups = document.querySelectorAll('.evidence-timeline-group')
    expect(groups).toHaveLength(4)
  })

  it('shows source icons and labels', () => {
    render(<EvidenceTimeline trail={mockTrail} />)
    // Known source labels from SOURCE_CONFIG
    expect(screen.getByText('Codex Property Register')).toBeInTheDocument()
    expect(screen.getByText('EPC Register')).toBeInTheDocument()
    expect(screen.getByText('Environment Agency')).toBeInTheDocument()
  })

  it('shows source icons in the DOM', () => {
    render(<EvidenceTimeline trail={mockTrail} />)
    const icons = document.querySelectorAll('.evidence-timeline-source-icon')
    expect(icons.length).toBeGreaterThanOrEqual(4)
  })

  it('shows field labels and values', () => {
    render(<EvidenceTimeline trail={mockTrail} />)
    // FIELD_LABELS maps 'name' -> 'Property Name', 'epc_rating' -> 'EPC Rating', etc.
    expect(screen.getByText('Property Name')).toBeInTheDocument()
    expect(screen.getByText('County Hall')).toBeInTheDocument()
    expect(screen.getByText('EPC Rating')).toBeInTheDocument()
    expect(screen.getByText('C')).toBeInTheDocument()
    expect(screen.getByText('Address')).toBeInTheDocument()
    expect(screen.getByText('PO Box 78, Preston')).toBeInTheDocument()
    expect(screen.getByText('Service Status')).toBeInTheDocument()
    expect(screen.getByText('community_managed')).toBeInTheDocument()
    expect(screen.getByText('Flood Zone')).toBeInTheDocument()
    expect(screen.getByText('Zone 2')).toBeInTheDocument()
  })

  it('shows confidence dots with correct colors', () => {
    render(<EvidenceTimeline trail={mockTrail} />)
    const dots = document.querySelectorAll('.evidence-timeline-confidence')
    expect(dots).toHaveLength(5)

    // First 4 entries have high confidence -> green (#22c55e)
    // Last entry has medium confidence -> amber (#f59e0b)
    const highDots = Array.from(dots).filter(d => d.style.backgroundColor === 'rgb(34, 197, 94)')
    const medDots = Array.from(dots).filter(d => d.style.backgroundColor === 'rgb(245, 158, 11)')
    expect(highDots).toHaveLength(4)
    expect(medDots).toHaveLength(1)
  })

  it('shows confidence dot titles', () => {
    render(<EvidenceTimeline trail={mockTrail} />)
    const highDots = document.querySelectorAll('[title="High confidence"]')
    const medDots = document.querySelectorAll('[title="Medium confidence"]')
    expect(highDots).toHaveLength(4)
    expect(medDots).toHaveLength(1)
  })

  it('shows source dates', () => {
    render(<EvidenceTimeline trail={mockTrail} />)
    const dates = document.querySelectorAll('.evidence-timeline-source-date')
    const dateTexts = Array.from(dates).map(d => d.textContent)
    expect(dateTexts).toContain('2025-01-15')
    expect(dateTexts).toContain('2025-06-20')
    expect(dateTexts).toContain('2026-03-04')
  })

  it('links source URLs when available', () => {
    render(<EvidenceTimeline trail={mockTrail} />)
    // EPC Register and LCC Website entries have source_url
    const epcLink = screen.getByRole('link', { name: 'EPC Register' })
    expect(epcLink).toHaveAttribute('href', 'https://epc.example.com')
    expect(epcLink).toHaveAttribute('target', '_blank')
    expect(epcLink).toHaveAttribute('rel', 'noopener noreferrer')

    const lccLink = screen.getByRole('link', { name: 'LCC Website' })
    expect(lccLink).toHaveAttribute('href', 'https://lancashire.gov.uk/libraries')
  })

  it('handles entries without source_url (no link, just text label)', () => {
    render(<EvidenceTimeline trail={mockTrail} />)
    // Codex Property Register has no source_url, should be plain text not a link
    const codexLabel = screen.getByText('Codex Property Register')
    expect(codexLabel.tagName).not.toBe('A')
    expect(codexLabel.closest('a')).toBeNull()

    // Environment Agency also has no source_url
    const envLabel = screen.getByText('Environment Agency')
    expect(envLabel.tagName).not.toBe('A')
    expect(envLabel.closest('a')).toBeNull()
  })

  it('groups multiple entries under same source', () => {
    render(<EvidenceTimeline trail={mockTrail} />)
    // codex_csv has 2 entries: name and address
    const groups = document.querySelectorAll('.evidence-timeline-group')
    // Find the codex group by checking it has the Codex label
    let codexGroup = null
    for (const g of groups) {
      if (g.textContent.includes('Codex Property Register')) {
        codexGroup = g
        break
      }
    }
    expect(codexGroup).not.toBeNull()
    const entries = codexGroup.querySelectorAll('.evidence-timeline-entry')
    expect(entries).toHaveLength(2)
    expect(codexGroup.textContent).toContain('Property Name')
    expect(codexGroup.textContent).toContain('Address')
  })

  it('sorts groups by date (newest first)', () => {
    render(<EvidenceTimeline trail={mockTrail} />)
    const sourceLabels = document.querySelectorAll('.evidence-timeline-source-label')
    const labelTexts = Array.from(sourceLabels).map(el => el.textContent)
    // Dates: lcc_website 2026-03-04, environment_agency 2026-03-04, epc_register 2025-06-20, codex_csv 2025-01-15
    // Both 2026-03-04 sources come first, then 2025-06-20, then 2025-01-15
    // lcc_website and environment_agency are both 2026-03-04 — order between them is stable (insertion order)
    expect(labelTexts.indexOf('Codex Property Register')).toBeGreaterThan(labelTexts.indexOf('EPC Register'))
    expect(labelTexts.indexOf('EPC Register')).toBeGreaterThan(labelTexts.indexOf('LCC Website'))
  })

  it('falls back for unknown source', () => {
    const trail = [
      { field: 'custom_field', value: 'test', source: 'unknown_source', source_label: 'Mystery', date: '2026-01-01', confidence: 'low' },
    ]
    render(<EvidenceTimeline trail={trail} />)
    // Unknown source uses the source key as label
    expect(screen.getByText('unknown_source')).toBeInTheDocument()
  })

  it('falls back for unknown field label', () => {
    const trail = [
      { field: 'weird_custom_thing', value: 'abc', source: 'codex_csv', source_label: 'Codex', date: '2026-01-01', confidence: 'high' },
    ]
    render(<EvidenceTimeline trail={trail} />)
    // Unknown field gets underscores replaced with spaces
    expect(screen.getByText('weird custom thing')).toBeInTheDocument()
  })

  it('shows low confidence dots in red', () => {
    const trail = [
      { field: 'name', value: 'Test', source: 'codex_csv', source_label: 'Codex', date: '2026-01-01', confidence: 'low' },
    ]
    render(<EvidenceTimeline trail={trail} />)
    const dot = document.querySelector('[title="Low confidence"]')
    expect(dot).not.toBeNull()
    expect(dot.style.backgroundColor).toBe('rgb(239, 68, 68)')
  })

  it('falls back to medium confidence for unknown confidence value', () => {
    const trail = [
      { field: 'name', value: 'Test', source: 'codex_csv', source_label: 'Codex', date: '2026-01-01', confidence: 'unknown' },
    ]
    render(<EvidenceTimeline trail={trail} />)
    const dot = document.querySelector('[title="Medium confidence"]')
    expect(dot).not.toBeNull()
  })
})
