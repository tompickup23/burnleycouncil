import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Calendar, ArrowLeft, Tag } from 'lucide-react'
import DOMPurify from 'dompurify'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { LoadingState } from '../components/ui'
import { formatDate } from '../utils/format'
import './News.css'

function ArticleView() {
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'
  const siteName = `${councilName} Council Transparency`
  const { articleId } = useParams()
  const { data: index, loading: indexLoading, error: indexError } = useData('/data/articles-index.json')
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
      document.title = `${article.title} | ${siteName}`

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
        'og:url': `${window.location.origin}/news/${article.id}`,
        'og:image': article.image ? `${window.location.origin}${article.image}` : '',
        'article:published_time': article.date,
        'article:author': article.author || siteName,
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
        image: article.image ? [`${window.location.origin}${article.image}`] : [],
        datePublished: article.date,
        dateModified: article.date,
        author: {
          '@type': 'Organization',
          name: article.author || siteName,
          url: window.location.origin
        },
        publisher: {
          '@type': 'Organization',
          name: siteName,
          url: window.location.origin
        },
        mainEntityOfPage: {
          '@type': 'WebPage',
          '@id': `${window.location.origin}/news/${article.id}`
        },
        articleSection: article.category || 'News',
        keywords: article.tags?.join(', ') || ''
      })

      // Breadcrumb JSON-LD structured data
      const siteUrl = config.site_url || window.location.origin
      let breadcrumbScript = document.getElementById('breadcrumb-jsonld')
      if (!breadcrumbScript) {
        breadcrumbScript = document.createElement('script')
        breadcrumbScript.id = 'breadcrumb-jsonld'
        breadcrumbScript.type = 'application/ld+json'
        document.head.appendChild(breadcrumbScript)
      }
      breadcrumbScript.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: siteUrl
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'News',
            item: `${siteUrl}/news`
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: article.title
          }
        ]
      })
    }

    return () => {
      document.title = `${siteName} | Where Your Money Goes`
      // Clean up JSON-LD
      const ldScript = document.getElementById('article-jsonld')
      if (ldScript) ldScript.remove()
      const breadcrumbScript = document.getElementById('breadcrumb-jsonld')
      if (breadcrumbScript) breadcrumbScript.remove()
    }
  }, [article])

  if (indexLoading || contentLoading) {
    return <LoadingState message="Loading article..." />
  }

  if (indexError) {
    return (
      <div className="page-error">
        <h2>Unable to load data</h2>
        <p>Please try refreshing the page.</p>
      </div>
    )
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
        <meta itemProp="author" content={article.author || siteName} />
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
              {article.author || siteName}
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
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }}
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
