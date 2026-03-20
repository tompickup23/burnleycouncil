import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LGRHiddenCosts from './LGRHiddenCosts'

const mockDistraction = {
  productivityCost: 94500000,
  turnoverCost: 43200000,
  knowledgeLossCost: 21600000,
  seniorFTECost: 1800000,
  decisionParalysis: 16200000,
  additionalLeavers: 5400,
  keyPersonLosses: 1080,
  totalDistractionCost: 177300000,
  factors: ['Productivity loss: £95M', 'Evidence: Grant Thornton 2024'],
}

const mockOpportunity = {
  financialOpportunityCost: 8400000,
  ctForeGone: 74800000,
  capitalDelay: 12000000,
  totalOpportunityCost: 95200000,
  factors: ['Financial opportunity cost: £8.4M'],
}

const mockServiceFailure = {
  risks: [
    { service: "Children's safeguarding", probability: 0.15, costIfFails: 30000000, expectedCost: 4500000, evidence: 'Bradford intervention' },
    { service: 'Adult social care', probability: 0.10, costIfFails: 20000000, expectedCost: 2000000, evidence: 'NAO 2023' },
    { service: 'SEND system', probability: 0.20, costIfFails: 15000000, expectedCost: 3000000, evidence: 'Kirklees' },
    { service: 'Financial (S114)', probability: 0.08, costIfFails: 50000000, expectedCost: 4000000, evidence: 'Northamptonshire' },
  ],
  correlationPenalty: 2025000,
  totalExpectedCost: 15525000,
  factors: [],
}

describe('LGRHiddenCosts', () => {
  it('returns null when all props produce zero total', () => {
    const { container } = render(<LGRHiddenCosts distractionLoss={null} opportunityCost={null} serviceFailureRisk={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders total hidden costs banner', () => {
    render(<LGRHiddenCosts distractionLoss={mockDistraction} opportunityCost={mockOpportunity} serviceFailureRisk={mockServiceFailure} />)
    expect(screen.getByText('Total Hidden Costs')).toBeInTheDocument()
  })

  it('renders distraction section with stat cards', () => {
    render(<LGRHiddenCosts distractionLoss={mockDistraction} opportunityCost={mockOpportunity} serviceFailureRisk={mockServiceFailure} />)
    expect(screen.getByText('Productivity Loss')).toBeInTheDocument()
    expect(screen.getByText('Staff Turnover')).toBeInTheDocument()
    expect(screen.getByText('Knowledge Drain')).toBeInTheDocument()
    expect(screen.getByText('Decision Paralysis')).toBeInTheDocument()
  })

  it('renders opportunity cost section', () => {
    render(<LGRHiddenCosts distractionLoss={mockDistraction} opportunityCost={mockOpportunity} serviceFailureRisk={mockServiceFailure} />)
    expect(screen.getByText('Financial Cost')).toBeInTheDocument()
    expect(screen.getByText('CT Rise Foregone')).toBeInTheDocument()
    expect(screen.getByText('Capital Delay')).toBeInTheDocument()
  })

  it('renders service failure risk matrix table', () => {
    render(<LGRHiddenCosts distractionLoss={mockDistraction} opportunityCost={mockOpportunity} serviceFailureRisk={mockServiceFailure} />)
    expect(screen.getByText("Children's safeguarding")).toBeInTheDocument()
    expect(screen.getByText('Adult social care')).toBeInTheDocument()
    expect(screen.getByText('SEND system')).toBeInTheDocument()
    expect(screen.getByText('Financial (S114)')).toBeInTheDocument()
  })

  it('renders correlation penalty row', () => {
    render(<LGRHiddenCosts distractionLoss={mockDistraction} opportunityCost={mockOpportunity} serviceFailureRisk={mockServiceFailure} />)
    expect(screen.getByText(/Correlation Penalty/)).toBeInTheDocument()
  })

  it('renders total expected cost', () => {
    render(<LGRHiddenCosts distractionLoss={mockDistraction} opportunityCost={mockOpportunity} serviceFailureRisk={mockServiceFailure} />)
    expect(screen.getByText('Total Expected Cost')).toBeInTheDocument()
  })

  it('shows additional leavers count', () => {
    render(<LGRHiddenCosts distractionLoss={mockDistraction} opportunityCost={null} serviceFailureRisk={null} />)
    expect(screen.getByText('5,400 additional leavers')).toBeInTheDocument()
  })

  it('shows key person losses count', () => {
    render(<LGRHiddenCosts distractionLoss={mockDistraction} opportunityCost={null} serviceFailureRisk={null} />)
    expect(screen.getByText('1,080 key person losses')).toBeInTheDocument()
  })
})
