import { lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import './App.css'

// Lazy-load non-homepage routes for smaller initial bundle
const News = lazy(() => import('./pages/News'))
const Spending = lazy(() => import('./pages/Spending'))
const Budgets = lazy(() => import('./pages/Budgets'))
const Politics = lazy(() => import('./pages/Politics'))
const MyArea = lazy(() => import('./pages/MyArea'))
const Legal = lazy(() => import('./pages/Legal'))
const About = lazy(() => import('./pages/About'))
const FOI = lazy(() => import('./pages/FOI'))

function PageLoader() {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '40vh',
      color: 'var(--text-secondary)',
      fontSize: '1rem',
    }}>
      Loading...
    </div>
  )
}

function App() {
  return (
    <Router>
      <Layout>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/news" element={<News />} />
            <Route path="/spending" element={<Spending />} />
            <Route path="/budgets" element={<Budgets />} />
            <Route path="/politics" element={<Politics />} />
            <Route path="/my-area" element={<MyArea />} />
            <Route path="/legal" element={<Legal />} />
            <Route path="/about" element={<About />} />
            <Route path="/foi" element={<FOI />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Layout>
    </Router>
  )
}

export default App
