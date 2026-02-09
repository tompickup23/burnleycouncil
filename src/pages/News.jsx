import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, ChevronRight, AlertCircle, TrendingUp, Users } from 'lucide-react'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { LoadingState } from '../components/ui'
import { formatDate } from '../utils/format'
import './News.css'

function News() {
  const { council_name: councilName = 'Council' } = useCouncilConfig()
  const { data: articles, loading, error } = useData('/data/articles-index.json')
  const [categoryFilter, setCategoryFilter] = useState('all')

  useEffect(() => {
    document.title = `News & Findings | ${councilName} Council Transparency`
    return () => {
      document.title = `${councilName} Council Transparency | Where Your Money Goes`
    }
  }, [councilName])

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

  const categories = ['all', ...new Set(articles.map(a => a.category))]

  const filteredArticles = categoryFilter === 'all'
    ? articles
    : articles.filter(a => a.category === categoryFilter)

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

      {/* Category Filter */}
      <div className="category-filters">
        {categories.map(cat => (
          <button
            key={cat}
            className={`category-btn ${categoryFilter === cat ? 'active' : ''}`}
            onClick={() => setCategoryFilter(cat)}
          >
            {cat === 'all' ? 'All' : cat}
          </button>
        ))}
      </div>

      {/* Article List */}
      <div className="articles-list">
        {filteredArticles.map((article, i) => (
          <Link
            key={article.id}
            to={`/news/${article.id}`}
            className={`article-card ${i === 0 ? 'featured' : ''}`}
            style={{ animationDelay: `${i * 0.05}s` }}
          >
            {article.image && (
              <div className="article-card-image">
                <img src={article.image} alt={article.title || 'Article image'} loading="lazy" />
              </div>
            )}
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
        <p className="no-results">No articles found in this category.</p>
      )}
    </div>
  )
}

export default News
