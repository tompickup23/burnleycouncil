import { lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import ScrollToTop from './components/ScrollToTop'
import { ErrorBoundary, LoadingState } from './components/ui'
import { preloadData } from './hooks/useData'
import Home from './pages/Home'
import './App.css'

// Lazy-load non-homepage routes for smaller initial bundle
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

// Preload commonly needed data
preloadData(['/data/insights.json', '/data/politics_summary.json'])

function App() {
  return (
    <Router basename={import.meta.env.BASE_URL}>
      <ScrollToTop />
      <Layout>
        <ErrorBoundary>
          <Suspense fallback={<LoadingState />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/news" element={<News />} />
              <Route path="/news/:articleId" element={<ArticleView />} />
              <Route path="/spending" element={<Spending />} />
              <Route path="/budgets" element={<Budgets />} />
              <Route path="/politics" element={<Politics />} />
              <Route path="/my-area" element={<MyArea />} />
              <Route path="/legal" element={<Legal />} />
              <Route path="/about" element={<About />} />
              <Route path="/meetings" element={<Meetings />} />
              <Route path="/foi" element={<FOI />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </Layout>
    </Router>
  )
}

export default App
