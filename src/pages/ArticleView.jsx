import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Calendar, ArrowLeft, Tag } from 'lucide-react'
import { useData } from '../hooks/useData'
import { LoadingState } from '../components/ui'
import { formatDate } from '../utils/format'
import './News.css'

function ArticleView() {
  const { articleId } = useParams()
  const { data: index, loading: indexLoading } = useData('/data/articles-index.json')
  const [content, setContent] = useState(null)
  const [contentLoading, setContentLoading] = useState(true)

  const article = index?.find(a => a.id === articleId)

  // Load article content on demand
  useEffect(() => {
    if (!articleId) return
    let cancelled = false
    setContentLoading(true) // eslint-disable-line react-hooks/set-state-in-effect
    fetch(`/data/articles/${articleId}.json`)
      .then(r => {
        if (!r.ok) throw new Error('Article not found')
        return r.json()
      })
      .then(data => {
        if (!cancelled) {
          setContent(data.content)
          setContentLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setContent(null)
          setContentLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [articleId])

  // Update document title
  useEffect(() => {
    if (article) {
      document.title = `${article.title} | Burnley Council Transparency`
    }
    return () => {
      document.title = 'Burnley Council Transparency | Where Your Money Goes'
    }
  }, [article])

  if (indexLoading || contentLoading) {
    return <LoadingState message="Loading article..." />
  }

  if (!article) {
    return (
      <div className="news-page animate-fade-in">
        <Link to="/news" className="back-button">
          <ArrowLeft size={18} /> Back to News
        </Link>
        <div className="article-not-found">
          <h2>Article not found</h2>
          <p>The article you're looking for doesn't exist or has been removed.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="news-page animate-fade-in">
      <Link to="/news" className="back-button">
        <ArrowLeft size={18} /> Back to News
      </Link>

      <article className="article-full" itemScope itemType="https://schema.org/NewsArticle">
        <meta itemProp="author" content={article.author || 'Burnley Council Transparency'} />
        <meta itemProp="datePublished" content={article.date} />

        <header className="article-header">
          <span className={`category-badge ${article.category?.toLowerCase()}`}>
            {article.category}
          </span>
          <h1 itemProp="headline">{article.title}</h1>
          <div className="article-meta">
            <span className="meta-item">
              <Calendar size={16} />
              {formatDate(article.date, 'long')}
            </span>
            <span className="meta-item">
              {article.author || 'Burnley Council Transparency'}
            </span>
          </div>
        </header>

        {article.image && (
          <div className="article-image">
            <img
              src={article.image}
              alt={article.title}
              loading="lazy"
              itemProp="image"
            />
          </div>
        )}

        {content && (
          <div
            className="article-body"
            itemProp="articleBody"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        )}

        {article.tags?.length > 0 && (
          <div className="article-tags">
            <Tag size={16} />
            {article.tags.map(tag => (
              <span key={tag} className="tag">{tag}</span>
            ))}
          </div>
        )}
      </article>
    </div>
  )
}

export default ArticleView
