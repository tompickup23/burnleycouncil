import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Press from './Press'

vi.mock('../context/CouncilConfig', () => ({
  useCouncilConfig: vi.fn(),
}))

import { useCouncilConfig } from '../context/CouncilConfig'

const fullConfig = {
  council_id: 'burnley',
  council_name: 'Burnley',
  council_full_name: 'Burnley Borough Council',
  official_website: 'https://burnley.gov.uk',
  publisher: 'Tom Pickup',
  publisher_social: [
    { platform: 'x', url: 'https://x.com/test', label: '@test' },
  ],
}

function renderComponent(config = fullConfig) {
  useCouncilConfig.mockReturnValue(config)
  return render(
    <MemoryRouter>
      <Press />
    </MemoryRouter>
  )
}

describe('Press', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn(() => Promise.resolve()) },
    })
  })

  it('renders the page heading', () => {
    renderComponent()
    expect(screen.getByText(/Press & Media Kit/)).toBeInTheDocument()
  })

  it('renders the subtitle with council name', () => {
    renderComponent()
    expect(screen.getByText(/Burnley Borough Council spending/)).toBeInTheDocument()
  })

  it('renders What is AI DOGE section', () => {
    renderComponent()
    expect(screen.getByText(/What is AI DOGE/)).toBeInTheDocument()
    expect(screen.getByText(/Department of Government Efficiency/)).toBeInTheDocument()
  })

  it('renders platform stats', () => {
    renderComponent()
    expect(screen.getByText('15')).toBeInTheDocument()
    expect(screen.getByText('£12 billion+')).toBeInTheDocument()
    expect(screen.getByText('2,286,000+')).toBeInTheDocument()
  })

  it('renders coverage section with council names', () => {
    renderComponent()
    expect(screen.getByText(/East Lancashire/)).toBeInTheDocument()
    expect(screen.getByText(/Central & South Lancashire/)).toBeInTheDocument()
    // Multiple mentions of Burnley Borough Council — just check at least one exists
    expect(screen.getAllByText(/Burnley Borough Council/).length).toBeGreaterThan(0)
  })

  it('renders citation examples', () => {
    renderComponent()
    expect(screen.getByText('How to Cite')).toBeInTheDocument()
    expect(screen.getByText('News article')).toBeInTheDocument()
    expect(screen.getByText('Academic')).toBeInTheDocument()
    expect(screen.getByText('Social media')).toBeInTheDocument()
  })

  it('renders copy buttons for citations', () => {
    renderComponent()
    const copyBtns = screen.getAllByText('Copy')
    expect(copyBtns.length).toBe(3)
  })

  it('copies citation text on button click', async () => {
    renderComponent()
    const copyBtns = screen.getAllByText('Copy')
    fireEvent.click(copyBtns[0])
    expect(navigator.clipboard.writeText).toHaveBeenCalled()
  })

  it('renders methodology section', () => {
    renderComponent()
    expect(screen.getByText(/Data & Methodology/)).toBeInTheDocument()
    expect(screen.getByText(/Duplicate detection/)).toBeInTheDocument()
    // Benford's Law appears in both the method list and caveats context
    expect(screen.getAllByText(/Benford's Law/).length).toBeGreaterThan(0)
  })

  it('renders the important caveats', () => {
    renderComponent()
    expect(screen.getByText(/not accusations of wrongdoing/)).toBeInTheDocument()
  })

  it('renders contact section with publisher name', () => {
    renderComponent()
    expect(screen.getByText('Tom Pickup')).toBeInTheDocument()
  })

  it('renders press email', () => {
    renderComponent()
    const link = screen.getByText('press@aidoge.co.uk')
    expect(link.closest('a')).toHaveAttribute('href', 'mailto:press@aidoge.co.uk')
  })

  it('renders website link', () => {
    renderComponent()
    // Multiple elements contain aidoge.co.uk — find the one in the contact section
    const links = screen.getAllByText(/aidoge\.co\.uk/)
    const anchorLink = links.find(el => el.closest('a')?.getAttribute('href') === 'https://aidoge.co.uk')
    expect(anchorLink).toBeTruthy()
  })

  it('renders social links from config', () => {
    renderComponent()
    const link = screen.getByText('@test')
    expect(link.closest('a')).toHaveAttribute('href', 'https://x.com/test')
  })

  it('renders data licence section', () => {
    renderComponent()
    expect(screen.getByText('Data Licence')).toBeInTheDocument()
    expect(screen.getByText(/Open Government Licence/)).toBeInTheDocument()
  })

  it('handles missing publisher gracefully', () => {
    renderComponent({ ...fullConfig, publisher: undefined })
    // Should fall back to 'AI DOGE' or 'Council' for names
    expect(screen.getByText(/Press & Media Kit/)).toBeInTheDocument()
  })

  it('handles missing social links gracefully', () => {
    renderComponent({ ...fullConfig, publisher_social: undefined })
    expect(screen.getByText(/Press & Media Kit/)).toBeInTheDocument()
    expect(screen.queryByText('@test')).not.toBeInTheDocument()
  })
})
