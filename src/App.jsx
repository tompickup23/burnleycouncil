import { lazy, Suspense, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import ScrollToTop from './components/ScrollToTop'
import PasswordGate from './components/PasswordGate'
import { ErrorBoundary, LoadingState } from './components/ui'
import { CouncilConfigProvider } from './context/CouncilConfig'
import { AuthProvider, useAuth } from './context/AuthContext'
import { isFirebaseEnabled } from './firebase'
import { preloadData } from './hooks/useData'
import './App.css'

// Lazy-load all page routes for smaller initial bundle
const Home = lazy(() => import('./pages/Home'))
const News = lazy(() => import('./pages/News'))
const ArticleView = lazy(() => import('./pages/ArticleView'))
const Spending = lazy(() => import('./pages/Spending'))
const Budgets = lazy(() => import('./pages/Budgets'))
const Politics = lazy(() => import('./pages/Politics'))
const MyArea = lazy(() => import('./pages/MyArea'))
const Legal = lazy(() => import('./pages/Legal'))
const About = lazy(() => import('./pages/About'))
const FOI = lazy(() => import('./pages/FOI'))
const Meetings = lazy(() => import('./pages/Meetings'))
const PayComparison = lazy(() => import('./pages/PayComparison'))
const CrossCouncil = lazy(() => import('./pages/CrossCouncil'))
const DogeInvestigation = lazy(() => import('./pages/DogeInvestigation'))
const Suppliers = lazy(() => import('./pages/Suppliers'))
const SupplierView = lazy(() => import('./pages/SupplierView'))
const Procurement = lazy(() => import('./pages/Procurement'))
const Press = lazy(() => import('./pages/Press'))
const Demographics = lazy(() => import('./pages/Demographics'))
const LGRTracker = lazy(() => import('./pages/LGRTracker'))
const LGRCostCalculator = lazy(() => import('./pages/LGRCostCalculator'))
const Integrity = lazy(() => import('./pages/Integrity'))
const Elections = lazy(() => import('./pages/Elections'))
const Constituencies = lazy(() => import('./pages/Constituencies'))
const ConstituencyView = lazy(() => import('./pages/ConstituencyView'))
const Strategy = lazy(() => import('./pages/Strategy'))
const AdminPanel = lazy(() => import('./components/AdminPanel'))

// Preload commonly needed data
preloadData(['/data/config.json', '/data/insights.json'])

/** Wrap a route element in its own ErrorBoundary so crashes are isolated */
function Guarded({ children }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingState />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  )
}

/**
 * Firebase auth gate — shown when Firebase is enabled and user is
 * either not logged in or has unassigned role.
 */
function FirebaseAuthGate({ children }) {
  const { user, role, loading } = useAuth()

  // Import AuthGate lazily since it's only needed in Firebase mode
  const AuthGate = lazy(() => import('./components/AuthGate'))

  if (loading) {
    return <LoadingState message="Authenticating..." />
  }

  // Not logged in or unassigned → show AuthGate
  if (!user || role === 'unassigned') {
    return (
      <Suspense fallback={<LoadingState />}>
        <AuthGate />
      </Suspense>
    )
  }

  return children
}

function App() {
  const [authenticated, setAuthenticated] = useState(
    () => sessionStorage.getItem('aidoge_auth') === 'true'
  )

  // Firebase mode — use Firebase auth
  if (isFirebaseEnabled) {
    return (
      <AuthProvider>
        <FirebaseAuthGate>
          <AppRoutes />
        </FirebaseAuthGate>
      </AuthProvider>
    )
  }

  // Dev mode — use simple password gate
  if (!authenticated) {
    return <PasswordGate onUnlock={() => setAuthenticated(true)} />
  }

  return <AppRoutes />
}

/** Shared route definitions used by both auth modes */
function AppRoutes() {
  return (
    <Router basename={import.meta.env.BASE_URL}>
      <ScrollToTop />
      <CouncilConfigProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Guarded><Home /></Guarded>} />
          <Route path="/news" element={<Guarded><News /></Guarded>} />
          <Route path="/news/:articleId" element={<Guarded><ArticleView /></Guarded>} />
          <Route path="/doge" element={<Guarded><DogeInvestigation /></Guarded>} />
          <Route path="/spending" element={<Guarded><Spending /></Guarded>} />
          <Route path="/budgets" element={<Guarded><Budgets /></Guarded>} />
          <Route path="/politics" element={<Guarded><Politics /></Guarded>} />
          <Route path="/my-area" element={<Guarded><MyArea /></Guarded>} />
          <Route path="/legal" element={<Guarded><Legal /></Guarded>} />
          <Route path="/about" element={<Guarded><About /></Guarded>} />
          <Route path="/meetings" element={<Guarded><Meetings /></Guarded>} />
          <Route path="/pay" element={<Guarded><PayComparison /></Guarded>} />
          <Route path="/compare" element={<Guarded><CrossCouncil /></Guarded>} />
          <Route path="/foi" element={<Guarded><FOI /></Guarded>} />
          <Route path="/suppliers" element={<Guarded><Suppliers /></Guarded>} />
          <Route path="/supplier/:supplierId" element={<Guarded><SupplierView /></Guarded>} />
          <Route path="/procurement" element={<Guarded><Procurement /></Guarded>} />
          <Route path="/press" element={<Guarded><Press /></Guarded>} />
          <Route path="/demographics" element={<Guarded><Demographics /></Guarded>} />
          <Route path="/lgr" element={<Guarded><LGRTracker /></Guarded>} />
          <Route path="/lgr-calculator" element={<Guarded><LGRCostCalculator /></Guarded>} />
          <Route path="/integrity" element={<Guarded><Integrity /></Guarded>} />
          <Route path="/elections" element={<Guarded><Elections /></Guarded>} />
          <Route path="/constituencies" element={<Guarded><Constituencies /></Guarded>} />
          <Route path="/constituency/:constituencyId" element={<Guarded><ConstituencyView /></Guarded>} />
          <Route path="/strategy" element={<Guarded><Strategy /></Guarded>} />
          <Route path="/admin" element={<Guarded><AdminPanel /></Guarded>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
      </CouncilConfigProvider>
    </Router>
  )
}

export default App
