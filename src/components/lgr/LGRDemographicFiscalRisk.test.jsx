import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import LGRDemographicFiscalRisk from './LGRDemographicFiscalRisk'

vi.mock('recharts', () => ({
  BarChart: ({ children }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  LineChart: ({ children }) => <div>{children}</div>,
  Line: () => null,
  Cell: () => null,
  Legend: () => null,
}))

const mockFiscalProfile = {
  three_unitary: {
    'Pennine Lancashire': {
      population: 560000,
      fiscal_sustainability_score: 32,
      service_demand_pressure_score: 74,
      risk_category: 'At Risk',
      risk_factors: ['High deprivation', 'Low collection rate', 'SEND demand above average'],
      white_british_pct: 73.7,
      pakistani_bangladeshi_pct: 14.6,
      muslim_pct: 19.4,
      grt_count: 194,
      roma_count: 202,
      eu8_eu2_born_pct: 1.9,
      black_african_caribbean_pct: 1.8,
      mixed_heritage_pct: 1.2,
      arab_count: 50,
      employment_rate_pct: 53.0,
      economically_inactive_pct: 42.3,
      no_qualifications_pct: 22.2,
      social_rented_pct: 14.6,
      collection_rate_weighted: 94.5,
      band_d_weighted: 350,
      estimated_send_rate_pct: 15.1,
      estimated_send_pupils: 6930,
      eal_estimate_pct: 8.5,
    },
    'Central Lancashire': {
      population: 480000,
      fiscal_sustainability_score: 45,
      service_demand_pressure_score: 60,
      risk_category: 'At Risk',
      risk_factors: ['Moderate deprivation'],
      white_british_pct: 85.0,
      pakistani_bangladeshi_pct: 3.2,
      muslim_pct: 5.5,
      grt_count: 80,
      roma_count: 100,
      eu8_eu2_born_pct: 2.1,
      black_african_caribbean_pct: 1.0,
      mixed_heritage_pct: 0.8,
      arab_count: 20,
      employment_rate_pct: 58.0,
      economically_inactive_pct: 37.0,
      no_qualifications_pct: 17.4,
      social_rented_pct: 11.0,
      collection_rate_weighted: 96.0,
      band_d_weighted: 400,
      estimated_send_rate_pct: 14.8,
      estimated_send_pupils: 4800,
      eal_estimate_pct: 5.0,
    },
  },
}

const mockSendExposure = {
  three_unitary: {
    'Pennine Lancashire': {
      school_age_pop: 45000,
      estimated_send_rate_pct: 15.1,
      estimated_send_pupils: 6930,
      estimated_eal_pupils: 3200,
      dsg_deficit_share: 180000000,
      dsg_deficit_per_capita: 660,
      education_cost_share: 500000000,
      send_risk_rating: 'HIGH',
      cost_premium_vs_average: 12.5,
    },
    'Central Lancashire': {
      school_age_pop: 38000,
      estimated_send_rate_pct: 14.8,
      estimated_send_pupils: 4800,
      estimated_eal_pupils: 1500,
      dsg_deficit_share: 140000000,
      dsg_deficit_per_capita: 480,
      education_cost_share: 400000000,
      send_risk_rating: 'MEDIUM',
      cost_premium_vs_average: 3.0,
    },
  },
}

const mockAsylumImpact = {
  three_unitary: {
    'Pennine Lancashire': {
      asylum_seekers_current: 500,
      per_1000_pop: 0.89,
      projected_2028: { low: 578, central: 703, high: 864 },
      projected_2032: { low: 651, central: 855, high: 1266 },
      estimated_annual_cost: 5000000,
    },
    'Central Lancashire': {
      asylum_seekers_current: 50,
      per_1000_pop: 0.1,
      projected_2028: { low: 58, central: 70, high: 86 },
      projected_2032: { low: 65, central: 85, high: 126 },
      estimated_annual_cost: 500000,
    },
  },
}

const mockMultipliers = {
  send_prevalence_by_group: {
    grt: { rate_pct: 35.0, source: 'DfE SEND Statistics 2023' },
    roma: { rate_pct: 32.0, source: 'DfE SEND Statistics 2023' },
    white_british: { rate_pct: 14.8, source: 'DfE SEND Statistics 2023' },
  },
  academic_sources: [
    { title: 'Casey Review', year: 2016, author: 'Dame Louise Casey', key_finding: 'Social segregation evidence' },
    { title: 'Cantle Report', year: 2001, author: 'Ted Cantle', key_finding: 'Parallel lives' },
  ],
}

const mockBradford = {
  bradford: { muslim_pct: 30.5, under_16_pct: 23.8, collection_rate_pct: 93.2, employment_rate_pct: 51.0 },
  oldham: { muslim_pct: 24.3, under_16_pct: 22.1, collection_rate_pct: 94.1, employment_rate_pct: 53.0 },
  east_lancs_comparison: { trajectory_narrative: 'East Lancashire mirrors Bradford circa 2010.' },
}

describe('LGRDemographicFiscalRisk', () => {
  it('returns null when no fiscal profile data', () => {
    const { container } = render(<LGRDemographicFiscalRisk fiscalProfile={null} selectedModel="three_unitary" />)
    expect(container.firstChild).toBeNull()
  })

  it('returns null for missing model', () => {
    const { container } = render(<LGRDemographicFiscalRisk fiscalProfile={mockFiscalProfile} selectedModel="nonexistent" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders scorecard for each authority', () => {
    render(<LGRDemographicFiscalRisk fiscalProfile={mockFiscalProfile} selectedModel="three_unitary" />)
    expect(screen.getByText('Pennine Lancashire')).toBeInTheDocument()
    expect(screen.getByText('Central Lancashire')).toBeInTheDocument()
  })

  it('shows risk categories', () => {
    render(<LGRDemographicFiscalRisk fiscalProfile={mockFiscalProfile} selectedModel="three_unitary" />)
    expect(screen.getAllByText('At Risk')).toHaveLength(2)
  })

  it('shows risk factors', () => {
    render(<LGRDemographicFiscalRisk fiscalProfile={mockFiscalProfile} selectedModel="three_unitary" />)
    expect(screen.getByText('High deprivation')).toBeInTheDocument()
  })

  it('renders ethnic composition chart', () => {
    render(<LGRDemographicFiscalRisk fiscalProfile={mockFiscalProfile} selectedModel="three_unitary" />)
    expect(screen.getByText('Ethnic Composition by Authority')).toBeInTheDocument()
  })

  it('renders SEND exposure section', () => {
    render(<LGRDemographicFiscalRisk
      fiscalProfile={mockFiscalProfile}
      sendExposure={mockSendExposure}
      multipliers={mockMultipliers}
      selectedModel="three_unitary"
    />)
    expect(screen.getByText('SEND Exposure by Authority')).toBeInTheDocument()
  })

  it('shows SEND multiplier table when multipliers provided', () => {
    render(<LGRDemographicFiscalRisk
      fiscalProfile={mockFiscalProfile}
      sendExposure={mockSendExposure}
      multipliers={mockMultipliers}
      selectedModel="three_unitary"
    />)
    expect(screen.getByText('SEND Prevalence by Ethnic Group (DfE 2023)')).toBeInTheDocument()
    expect(screen.getByText('35%')).toBeInTheDocument()
  })

  it('renders employment and council tax section', () => {
    render(<LGRDemographicFiscalRisk fiscalProfile={mockFiscalProfile} selectedModel="three_unitary" />)
    expect(screen.getByText('Employment & Council Tax by Authority')).toBeInTheDocument()
  })

  it('renders asylum section when data available', () => {
    render(<LGRDemographicFiscalRisk
      fiscalProfile={mockFiscalProfile}
      asylumImpact={mockAsylumImpact}
      selectedModel="three_unitary"
    />)
    expect(screen.getByText('Asylum Dispersal Impact')).toBeInTheDocument()
  })

  it('renders Bradford/Oldham comparison when data available', () => {
    render(<LGRDemographicFiscalRisk
      fiscalProfile={mockFiscalProfile}
      bradfordComparison={mockBradford}
      selectedModel="three_unitary"
    />)
    expect(screen.getByText('Bradford & Oldham Precedent Comparison')).toBeInTheDocument()
    expect(screen.getByText('Bradford')).toBeInTheDocument()
    expect(screen.getByText('Oldham')).toBeInTheDocument()
  })

  it('shows trajectory narrative', () => {
    render(<LGRDemographicFiscalRisk
      fiscalProfile={mockFiscalProfile}
      bradfordComparison={mockBradford}
      selectedModel="three_unitary"
    />)
    expect(screen.getByText('East Lancashire mirrors Bradford circa 2010.')).toBeInTheDocument()
  })

  it('toggles academic research panel', () => {
    render(<LGRDemographicFiscalRisk
      fiscalProfile={mockFiscalProfile}
      multipliers={mockMultipliers}
      selectedModel="three_unitary"
    />)
    expect(screen.queryByText('Casey Review')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Academic Research & Sources'))
    expect(screen.getByText('Casey Review')).toBeInTheDocument()
    expect(screen.getByText('Cantle Report')).toBeInTheDocument()
  })

  it('shows fiscal gauge scores via aria-label', () => {
    render(<LGRDemographicFiscalRisk fiscalProfile={mockFiscalProfile} selectedModel="three_unitary" />)
    expect(screen.getByLabelText('Fiscal: 32 out of 100')).toBeInTheDocument()
    expect(screen.getByLabelText('Demand: 74 out of 100')).toBeInTheDocument()
  })
})
