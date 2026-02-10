import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, Clock, ChevronRight, ChevronLeft, AlertCircle, TrendingUp, Users, Search, X, FileText } from 'lucide-react'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { LoadingState } from '../components/ui'
import { formatDate, estimateReadingTime } from '../utils/format'
import './News.css'

const ARTICLES_PER_PAGE = 12

function News() {
  const { council_name: councilName = 'Council' } = useCouncilConfig()
  const { data: articles, loading, error } = useData('/data/articles-index.json')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    document.title = `News & Findings | ${councilName} Council Transparency`
    return () => {
      document.title = `${councilName} Council Transparency | Where Your Money Goes`
    }
  }, [councilName])

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1)
  }, [categoryFilter, searchQuery])

  const filteredArticles = useMemo(() => {
    if (!articles) return []
    let result = articles
    if (categoryFilter !== 'all') {
      result = result.filter(a => a.category === categoryFilter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter(a =>
        (a.title || '').toLowerCase().includes(q) ||
        (a.summary || '').toLowerCase().includes(q)
      )
    }
    return result
  }, [articles, categoryFilter, searchQuery])

  const totalPages = Math.max(1, Math.ceil(filteredArticles.length / ARTICLES_PER_PAGE))
  const pagedArticles = filteredArticles.slice((page - 1) * ARTICLES_PER_PAGE, page * ARTICLES_PER_PAGE)

  const categories = useMemo(() => {
    if (!articles) return ['all']
    return ['all', ...new Set(articles.map(a => a.category).filter(Boolean))]
  }, [articles])

  if (loading) {
    return <LoadingState message="Loading articles..." />
  }

  if (error || !articles) {
    return (
      <div className="news-page animate-fade-in">
        <h1>News & Findings</h1>
        <p>Failed to load articles. Please try refreshing the page.</p>
      </div>
    )
  }

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'Analysis':
        return <TrendingUp size={16} />
      case 'Democracy':
        return <Users size={16} />
      default:
        return <AlertCircle size={16} />
    }
  }

  return (
    <div className="news-page animate-fade-in">
      <header className="page-header" aria-label="News and findings">
        <h1>News & Findings</h1>
        <p className="subtitle">
          Analysis and investigations based on council spending data
        </p>
      </header>

      {/* Search Bar */}
      <div className="news-search-bar">
        <Search size={18} className="news-search-icon" />
        <input
          type="text"
          placeholder="Search articles..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="news-search-input"
          aria-label="Search articles"
        />
        {searchQuery && (
          <button className="news-search-clear" onClick={() => setSearchQuery('')} aria-label="Clear search">
            <X size={16} />
          </button>
        )}
      </div>

      {/* Category Filter */}
      <div className="category-filter">
        {categories.map(cat => (
          <button
            key={cat}
            className={`filter-btn ${categoryFilter === cat ? 'active' : ''}`}
            onClick={() => setCategoryFilter(cat)}
          >
            {cat === 'all' ? 'All' : cat}
          </button>
        ))}
      </div>

      {/* Results count */}
      <div className="news-results-count">
        {filteredArticles.length} article{filteredArticles.length !== 1 ? 's' : ''}
        {searchQuery && ` matching "${searchQuery}"`}
        {categoryFilter !== 'all' && ` in ${categoryFilter}`}
      </div>

      {/* Article List */}
      <div className="articles-list">
        {pagedArticles.map((article, i) => (
          <Link
            key={article.id}
            to={`/news/${article.id}`}
            className={`article-card ${i === 0 && page === 1 ? 'featured' : ''}`}
            style={{ animationDelay: `${i * 0.05}s` }}
          >
            <div className="article-card-image">
              {article.image ? (
                <img
                  src={article.image}
                  alt={article.title || 'Article image'}
                  loading="lazy"
                  onError={(e) => { e.target.closest('.article-card-image').classList.add('placeholder'); e.target.style.display = 'none' }}
                />
              ) : (
                <div className="article-image-placeholder">
                  <FileText size={32} />
                </div>
              )}
            </div>
            <div className="article-card-content">
              <div className="article-card-meta">
                <span className={`category-badge ${article.category?.toLowerCase()}`}>
                  {getCategoryIcon(article.category)}
                  {article.category}
                </span>
                <span className="article-date">
                  <Calendar size={14} />
                  {formatDate(article.date)}
                </span>
                <span className="article-reading-time">
                  <Clock size={14} />
                  {estimateReadingTime(article.summary)}
                </span>
              </div>
              <h3>{article.title}</h3>
              <p className="article-summary">{article.summary}</p>
              <span className="read-more">
                Read more <ChevronRight size={14} />
              </span>
            </div>
          </Link>
        ))}
      </div>

      {filteredArticles.length === 0 && (
        <p className="no-results">No articles found{searchQuery ? ` for "${searchQuery}"` : ' in this category'}.</p>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <nav className="news-pagination" aria-label="Article pagination">
          <button
            className="pagination-btn"
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft size={16} /> Prev
          </button>
          <span className="pagination-info">
            Page {page} of {totalPages}
          </span>
          <button
            className="pagination-btn"
            disabled={page >= totalPages}
            onClick={() => { setPage(p => p + 1); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
            aria-label="Next page"
          >
            Next <ChevronRight size={16} />
          </button>
        </nav>
      )}
    </div>
  )
}

export default News
