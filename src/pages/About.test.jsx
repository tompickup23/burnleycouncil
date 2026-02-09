import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import About from './About'

vi.mock('../context/CouncilConfig', () => ({
  useCouncilConfig: vi.fn(),
}))

import { useCouncilConfig } from '../context/CouncilConfig'

const fullConfig = {
  council_id: 'burnley',
  council_name: 'Burnley',
  council_full_name: 'Burnley Borough Council',
  official_website: 'https://burnley.gov.uk',
  spending_threshold: 500,
  spending_data_period: 'April 2021 – present',
  publisher: 'Tom Pickup',
  publisher_bio: 'Test bio paragraph.',
  publisher_titles: ['Councillor for Padiham'],
  publisher_photo: '/images/tom-pickup.jpg',
  publisher_quote: 'It is your money.',
  publisher_social: [
    { platform: 'x', url: 'https://x.com/test', label: '@test' },
    { platform: 'email', url: 'mailto:test@example.com', label: 'Email' },
  ],
}

function renderComponent(config = fullConfig) {
  useCouncilConfig.mockReturnValue(config)
  return render(
    <MemoryRouter>
      <About />
    </MemoryRouter>
  )
}

describe('About', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the page heading', () => {
    renderComponent()
    expect(screen.getByText('About This Tool')).toBeInTheDocument()
  })

  it('uses council full name in intro text', () => {
    renderComponent()
    expect(screen.getByText(/Burnley Borough Council spends tens of millions/)).toBeInTheDocument()
  })

  it('renders publisher bio from config', () => {
    renderComponent()
    expect(screen.getByText('Test bio paragraph.')).toBeInTheDocument()
  })

  it('renders creator section with publisher name', () => {
    renderComponent()
    expect(screen.getByText('Created by Tom Pickup')).toBeInTheDocument()
  })

  it('renders publisher titles as badges', () => {
    renderComponent()
    expect(screen.getByText('Councillor for Padiham')).toBeInTheDocument()
  })

  it('renders publisher photo from config', () => {
    renderComponent()
    const img = screen.getByAltText('Tom Pickup')
    expect(img).toHaveAttribute('src', '/images/tom-pickup.jpg')
  })

  it('renders publisher quote from config', () => {
    renderComponent()
    expect(screen.getByText(/It is your money/)).toBeInTheDocument()
  })

  it('renders social links from config', () => {
    renderComponent()
    const xLink = screen.getByText('@test')
    expect(xLink.closest('a')).toHaveAttribute('href', 'https://x.com/test')
    const emailLink = screen.getByText('Email')
    expect(emailLink.closest('a')).toHaveAttribute('href', 'mailto:test@example.com')
  })

  it('does not render creator section when no publisher', () => {
    renderComponent({ ...fullConfig, publisher: undefined })
    expect(screen.queryByText(/Created by/)).not.toBeInTheDocument()
  })

  it('does not render social links when none in config', () => {
    renderComponent({ ...fullConfig, publisher_social: undefined })
    expect(screen.queryByText('@test')).not.toBeInTheDocument()
  })

  it('does not render photo when not in config', () => {
    renderComponent({ ...fullConfig, publisher_photo: undefined })
    expect(screen.queryByAltText('Tom Pickup')).not.toBeInTheDocument()
  })

  it('does not render quote when not in config', () => {
    renderComponent({ ...fullConfig, publisher_quote: undefined })
    expect(screen.queryByText(/It is your money/)).not.toBeInTheDocument()
  })

  it('renders spending threshold in data section', () => {
    renderComponent()
    expect(screen.getByText(/£500/)).toBeInTheDocument()
  })

  it('renders official website link in disclaimer', () => {
    renderComponent()
    const link = screen.getByText('burnley.gov.uk')
    expect(link.closest('a')).toHaveAttribute('href', 'https://burnley.gov.uk')
  })

  it('renders CTA buttons', () => {
    renderComponent()
    expect(screen.getByText('View Spending Data')).toBeInTheDocument()
    expect(screen.getByText('View Budgets')).toBeInTheDocument()
  })
})
