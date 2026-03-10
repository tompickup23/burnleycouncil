import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Demographics from './Demographics'

vi.mock('../hooks/useData', () => ({
  useData: vi.fn(),
}))

vi.mock('../context/CouncilConfig', () => ({
  useCouncilConfig: vi.fn(),
}))

import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'

const mockConfig = {
  council_id: 'burnley',
  council_name: 'Burnley',
  council_full_name: 'Burnley Borough Council',
  official_website: 'https://burnley.gov.uk',
  spending_threshold: 500,
}

const mockDemographics = {
  meta: { generated: '2026-02-14' },
  summary: {
    population: 94649,
    female_pct: 51.2,
    male_pct: 48.8,
    born_uk_pct: 88.5,
    born_outside_uk_pct: 11.5,
    employment_rate_pct: 52.1,
    unemployment_rate_pct: 5.3,
    ethnicity: {
      'White': { count: 80700, pct: 85.3 },
      'Asian': { count: 9654, pct: 10.2 },
    },
    religion: {
      'Christian': { count: 42700, pct: 45.1 },
      'Muslim': { count: 7761, pct: 8.2 },
      'No religion': { count: 36440, pct: 38.5 },
    },
    // Phase E new stats
    no_car_pct: 29.3,
    wfh_pct: 16.8,
    car_commute_pct: 56.0,
    lone_parent_households_pct: 13.2,
    single_person_households_pct: 32.9,
    highly_deprived_pct: 6.5,
    no_car: 11667,
    english_main_language_pct: 91.0,
    cannot_speak_english: 486,
    cannot_speak_english_pct: 0.5,
    higher_managerial_pct: 7.2,
    routine_occupations_pct: 17.5,
    married_pct: 42.1,
    single_never_married_pct: 38.3,
    recent_arrivals_pct: 6.5,
    no_central_heating_pct: 1.7,
    gas_heating_pct: 81.8,
    communal_residents: 897,
    total_households: 39868,
  },
  council_totals: {
    age: {
      'Aged 4 years and under': 5200,
      'Aged 5 to 9 years': 5600,
      'Aged 65 to 74 years': 10500,
    },
    car_availability: {
      'Total: All households': 39872,
      'No cars or vans in household': 11667,
      '1 car or van in household': 16992,
      '2 cars or vans in household': 8730,
      '3 or more cars or vans in household': 2483,
    },
    travel_to_work: {
      'Total: All usual residents aged 16 years and over in employment': 40032,
      'Work mainly at or from home': 6738,
      'Driving a car or van': 22418,
      'Train': 193,
      'Bus, minibus or coach': 1631,
      'On foot': 4434,
      'Bicycle': 403,
    },
    household_composition: {
      'Total: All households': 39868,
      'One-person household': 13125,
      'Single family household': 24408,
      'Other household types': 2335,
    },
    household_deprivation: {
      'Total: All households': 39872,
      'Household is not deprived in any dimension': 16305,
      'Household is deprived in one dimension': 13669,
      'Household is deprived in two dimensions': 7316,
      'Household is deprived in three dimensions': 2440,
      'Household is deprived in four dimensions': 142,
    },
    central_heating: {
      'Total: All households': 39872,
      'No central heating': 686,
      'Mains gas only': 32630,
      'Electric only': 1746,
    },
    english_proficiency: {
      'Total: All usual residents aged 3 years and over': 91239,
      'Main language is English (English or Welsh in Wales)': 83069,
      'Main language is not English (English or Welsh in Wales)': 8170,
    },
    ns_sec: {
      'Total: All usual residents aged 16 years and over': 75199,
      'L1, L2 and L3 Higher managerial, administrative and professional occupations': 5388,
      'L13 Routine occupations': 13157,
    },
    partnership_status: {
      'Total: All usual residents aged 16 and over': 75200,
      'Never married and never registered a civil partnership': 28778,
      'Married or in a registered civil partnership': 31625,
      'Divorced or civil partnership dissolved': 7700,
      'Widowed or surviving civil partnership partner': 5032,
    },
    year_of_arrival: {
      'Total: All usual residents': 94646,
      'Born in the UK': 82579,
      'Arrived 2001 to 2010': 2468,
      'Arrived 2011 to 2013': 978,
      'Arrived 2017 to 2019': 2541,
      'Arrived 2020 to 2021': 1239,
    },
  },
  wards: {
    'E05001450': {
      name: 'Burnley Wood',
      ethnicity: { 'White': 5214, 'Total': 7234 },
      age: { 'Total': 7234 },
      car_availability: { 'Total: All households': 2800, 'No cars or vans in household': 1100 },
      english_proficiency: { 'Total: All usual residents aged 3 years and over': 6800, 'Main language is English (English or Welsh in Wales)': 5100 },
    },
  },
}

const mockProjections = {
  meta: { source: 'ONS 2022-based Sub-National Population Projections', council_id: 'burnley' },
  population_projections: { '2022': 95655, '2027': 98520, '2032': 100138, '2037': 101200, '2042': 101900, '2047': 102300 },
  age_projections: {
    '2022': { '0-15': 19577, '16-64': 58845, '65+': 17233 },
    '2032': { '0-15': 18200, '16-64': 59300, '65+': 22638 },
  },
  dependency_ratio_projection: { '2022': 62.6, '2027': 61.4, '2032': 64.3, '2037': 65.8 },
  working_age_pct_projection: { '2022': 61.5, '2032': 59.2 },
  growth_rate_pct: 6.9,
  asylum: {
    seekers_supported: 464,
    by_accommodation: { 'Dispersal Accommodation': 440, 'Contingency Accommodation - Hotel': 24 },
    trend: [
      { date: '31 Mar 2022', people: 85 },
      { date: '31 Mar 2023', people: 150 },
      { date: '31 Mar 2024', people: 320 },
      { date: '31 Mar 2025', people: 464 },
    ],
    latest_date: '31 Mar 2025',
  },
  resettlement: { total: 0 },
}

function setupMocks({ demographics = mockDemographics, projections = null } = {}) {
  useData.mockImplementation((url) => {
    if (url === '/data/demographics.json') return { data: demographics, loading: !demographics, error: null }
    if (url === '/data/demographic_projections.json') return { data: projections, loading: false, error: null }
    return { data: null, loading: false, error: null }
  })
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <Demographics />
    </MemoryRouter>
  )
}

describe('Demographics', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useCouncilConfig.mockReturnValue(mockConfig)
  })

  it('shows loading state while data loads', () => {
    useData.mockImplementation((url) => {
      if (url === '/data/demographics.json') return { data: null, loading: true, error: null }
      return { data: null, loading: false, error: null }
    })
    renderComponent()
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('shows error state when data fails to load', () => {
    useData.mockImplementation((url) => {
      if (url === '/data/demographics.json') return { data: null, loading: false, error: new Error('fail') }
      return { data: null, loading: false, error: null }
    })
    renderComponent()
    expect(screen.getByText(/error loading demographics/i)).toBeInTheDocument()
  })

  it('shows no-data message when demographics is null', () => {
    useData.mockImplementation(() => ({ data: null, loading: false, error: null }))
    renderComponent()
    expect(screen.getByText(/no demographics data available/i)).toBeInTheDocument()
  })

  it('renders the page heading with data', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Demographics')).toBeInTheDocument()
  })

  it('shows Census 2021 tab by default', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByRole('tab', { name: 'Census 2021' })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows Projections tab when projection data available', () => {
    setupMocks({ projections: mockProjections })
    renderComponent()
    expect(screen.getByRole('tab', { name: 'Population' })).toBeInTheDocument()
  })

  it('shows Asylum tab when asylum data available', () => {
    setupMocks({ projections: mockProjections })
    renderComponent()
    expect(screen.getByRole('tab', { name: 'Asylum & Migration' })).toBeInTheDocument()
  })

  it('does not show Projections tab without projection data', () => {
    setupMocks()
    renderComponent()
    expect(screen.queryByRole('tab', { name: 'Population' })).not.toBeInTheDocument()
  })

  it('switches to Projections tab on click', () => {
    setupMocks({ projections: mockProjections })
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Population' }))
    expect(screen.getByText('Population Trajectory')).toBeInTheDocument()
    expect(screen.getByText('Age Structure Shift')).toBeInTheDocument()
  })

  it('shows growth rate stat on Projections tab', () => {
    setupMocks({ projections: mockProjections })
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Population' }))
    expect(screen.getByText('+6.9%')).toBeInTheDocument()
  })

  it('switches to Asylum tab on click', () => {
    setupMocks({ projections: mockProjections })
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Asylum & Migration' }))
    expect(screen.getByText('Asylum Seekers Supported')).toBeInTheDocument()
    expect(screen.getByText('464')).toBeInTheDocument()
  })

  // Phase E: Households & Transport tab
  describe('Households & Transport tab', () => {
    it('shows tab when car_availability data exists', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByRole('tab', { name: 'Households & Transport' })).toBeInTheDocument()
    })

    it('does not show tab without car_availability data', () => {
      const noCarData = {
        ...mockDemographics,
        wards: {
          'E05001450': {
            name: 'Burnley Wood',
            ethnicity: { 'White': 5214, 'Total': 7234 },
            age: { 'Total': 7234 },
          },
        },
      }
      setupMocks({ demographics: noCarData })
      renderComponent()
      expect(screen.queryByRole('tab', { name: 'Households & Transport' })).not.toBeInTheDocument()
    })

    it('shows car availability chart on tab click', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByRole('tab', { name: 'Households & Transport' }))
      expect(screen.getByText('Car/Van Availability')).toBeInTheDocument()
    })

    it('shows travel to work chart on tab click', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByRole('tab', { name: 'Households & Transport' }))
      expect(screen.getByText('Travel to Work')).toBeInTheDocument()
    })

    it('shows household composition chart on tab click', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByRole('tab', { name: 'Households & Transport' }))
      expect(screen.getByText('Household Composition')).toBeInTheDocument()
    })

    it('shows household deprivation chart on tab click', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByRole('tab', { name: 'Households & Transport' }))
      expect(screen.getByText('Household Deprivation')).toBeInTheDocument()
    })

    it('shows central heating chart on tab click', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByRole('tab', { name: 'Households & Transport' }))
      expect(screen.getByText('Central Heating Type')).toBeInTheDocument()
    })

    it('shows no car hero card with correct value', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByRole('tab', { name: 'Households & Transport' }))
      expect(screen.getByText('29.3%')).toBeInTheDocument()
      expect(screen.getByText('No Car/Van')).toBeInTheDocument()
    })

    it('shows WFH hero card value', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByRole('tab', { name: 'Households & Transport' }))
      expect(screen.getByText('16.8%')).toBeInTheDocument()
      expect(screen.getByText('Work From Home')).toBeInTheDocument()
    })

    it('shows highly deprived hero card', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByRole('tab', { name: 'Households & Transport' }))
      expect(screen.getByText('6.5%')).toBeInTheDocument()
      expect(screen.getByText('Highly Deprived')).toBeInTheDocument()
    })
  })

  // Phase E: Language & Society tab
  describe('Language & Society tab', () => {
    it('shows tab when english_proficiency data exists', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByRole('tab', { name: 'Language & Society' })).toBeInTheDocument()
    })

    it('does not show tab without english_proficiency data', () => {
      const noLangData = {
        ...mockDemographics,
        wards: {
          'E05001450': {
            name: 'Burnley Wood',
            ethnicity: { 'White': 5214, 'Total': 7234 },
            age: { 'Total': 7234 },
            car_availability: { 'Total': 2800 },
          },
        },
      }
      setupMocks({ demographics: noLangData })
      renderComponent()
      expect(screen.queryByRole('tab', { name: 'Language & Society' })).not.toBeInTheDocument()
    })

    it('shows English proficiency chart on tab click', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByRole('tab', { name: 'Language & Society' }))
      expect(screen.getByText('English Proficiency')).toBeInTheDocument()
    })

    it('shows NS-SeC chart on tab click', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByRole('tab', { name: 'Language & Society' }))
      expect(screen.getByText(/Socioeconomic Classification/)).toBeInTheDocument()
    })

    it('shows partnership status chart on tab click', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByRole('tab', { name: 'Language & Society' }))
      expect(screen.getByText('Partnership Status')).toBeInTheDocument()
    })

    it('shows year of arrival chart on tab click', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByRole('tab', { name: 'Language & Society' }))
      expect(screen.getByText('Year of Arrival in UK')).toBeInTheDocument()
    })

    it('shows English main language hero card', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByRole('tab', { name: 'Language & Society' }))
      expect(screen.getByText('91%')).toBeInTheDocument()
      expect(screen.getByText('English Main Language')).toBeInTheDocument()
    })

    it('shows higher managerial hero card', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByRole('tab', { name: 'Language & Society' }))
      expect(screen.getByText('7.2%')).toBeInTheDocument()
      expect(screen.getByText('Higher Managerial')).toBeInTheDocument()
    })

    it('shows married pct hero card', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByRole('tab', { name: 'Language & Society' }))
      expect(screen.getByText('42.1%')).toBeInTheDocument()
    })

    it('shows recent arrivals hero card', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByRole('tab', { name: 'Language & Society' }))
      expect(screen.getByText('Arrived 2011-2021')).toBeInTheDocument()
    })
  })

  // Phase E: Census tab hero cards for new stats
  describe('Census tab new hero cards', () => {
    it('shows no car hero card on census tab', () => {
      setupMocks()
      renderComponent()
      // Census tab is default
      expect(screen.getAllByText('No Car/Van').length).toBeGreaterThanOrEqual(1)
    })

    it('shows lone parent hero card on census tab', () => {
      setupMocks()
      renderComponent()
      expect(screen.getAllByText('Lone Parent').length).toBeGreaterThanOrEqual(1)
    })
  })
})
