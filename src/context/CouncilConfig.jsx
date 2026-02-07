import { createContext, useContext } from 'react'
import { useData } from '../hooks/useData'
import { LoadingState } from '../components/ui'

const CouncilConfigContext = createContext(null)

export function CouncilConfigProvider({ children }) {
  const { data: config, loading, error } = useData('/data/config.json')

  if (loading) {
    return <LoadingState message="Loading council data..." />
  }

  if (error || !config) {
    // Fallback defaults so the app still renders
    const fallback = {
      council_id: 'unknown',
      council_name: 'Council',
      council_full_name: 'Borough Council',
      official_website: '#',
      publisher: 'AI DOGE',
      disclaimer_entity: 'the council',
      spending_data_period: '',
      theme_accent: '#0a84ff',
      data_sources: {},
      doge_context: {},
    }
    return (
      <CouncilConfigContext.Provider value={fallback}>
        {children}
      </CouncilConfigContext.Provider>
    )
  }

  return (
    <CouncilConfigContext.Provider value={config}>
      {children}
    </CouncilConfigContext.Provider>
  )
}

export function useCouncilConfig() {
  const config = useContext(CouncilConfigContext)
  if (!config) {
    throw new Error('useCouncilConfig must be used within a CouncilConfigProvider')
  }
  return config
}
