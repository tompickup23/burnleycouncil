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
    fetch(`${import.meta.env.BASE_URL}data/articles/${articleId}.json`)
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

  // Update document title and meta tags for SEO / Google News
  useEffect(() => {
    if (article) {
      document.title = `${article.title} | Burnley Council Transparency`

      // Update meta description
      let metaDesc = document.querySelector('meta[name="description"]')
      if (!metaDesc) {
        metaDesc = document.createElement('meta')
        metaDesc.setAttribute('name', 'description')
        document.head.appendChild(metaDesc)
      }
      metaDesc.setAttribute('content', article.summary || '')

      // OpenGraph tags for social sharing
      const ogTags = {
        'og:title': article.title,
        'og:description': article.summary || '',
        'og:type': 'article',
        'og:url': `https://burnleycouncil.co.uk/news/${article.id}`,
        'og:image': article.image ? `https://burnleycouncil.co.uk${article.image}` : '',
        'article:published_time': article.date,
        'article:author': article.author || 'Burnley Council Transparency',
        'article:section': article.category || 'News',
      }

      Object.entries(ogTags).forEach(([property, ogContent]) => {
        let tag = document.querySelector(`meta[property="${property}"]`)
        if (!tag) {
          tag = document.createElement('meta')
          tag.setAttribute('property', property)
          document.head.appendChild(tag)
        }
        tag.setAttribute('content', ogContent)
      })

      // Add article tags as keywords
      if (article.tags?.length) {
        let keywords = document.querySelector('meta[name="keywords"]')
        if (!keywords) {
          keywords = document.createElement('meta')
          keywords.setAttribute('name', 'keywords')
          document.head.appendChild(keywords)
        }
        keywords.setAttribute('content', article.tags.join(', '))
      }

      // JSON-LD structured data for Google News
      let ldScript = document.getElementById('article-jsonld')
      if (!ldScript) {
        ldScript = document.createElement('script')
        ldScript.id = 'article-jsonld'
        ldScript.type = 'application/ld+json'
        document.head.appendChild(ldScript)
      }
      ldScript.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'NewsArticle',
        headline: article.title,
        description: article.summary || '',
        image: article.image ? [`https://burnleycouncil.co.uk${article.image}`] : [],
        datePublished: article.date,
        dateModified: article.date,
        author: {
          '@type': 'Organization',
          name: article.author || 'Burnley Council Transparency',
          url: 'https://burnleycouncil.co.uk'
        },
        publisher: {
          '@type': 'Organization',
          name: 'Burnley Council Transparency',
          url: 'https://burnleycouncil.co.uk'
        },
        mainEntityOfPage: {
          '@type': 'WebPage',
          '@id': `https://burnleycouncil.co.uk/news/${article.id}`
        },
        articleSection: article.category || 'News',
        keywords: article.tags?.join(', ') || ''
      })
    }

    return () => {
      document.title = 'Burnley Council Transparency | Where Your Money Goes'
      // Clean up JSON-LD
      const ldScript = document.getElementById('article-jsonld')
      if (ldScript) ldScript.remove()
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
