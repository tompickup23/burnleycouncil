import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Calendar, ArrowLeft, Tag, Share2, Link2, ChevronRight, FileText } from 'lucide-react'
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
  const [copiedLink, setCopiedLink] = useState(false)
  const copyTimerRef = useRef(null)

  const article = index?.find(a => a.id === articleId)

  const shareUrl = typeof window !== 'undefined' ? window.location.href : ''

  // Auto-generate table of contents from h2 headings
  const headings = useMemo(() => {
    if (!content) return []
    const matches = [...content.matchAll(/<h2[^>]*>(.*?)<\/h2>/gi)]
    return matches.map((m, i) => ({
      id: `section-${i}`,
      text: m[1].replace(/<[^>]*>/g, '') // strip any inner HTML tags
    }))
  }, [content])

  // Inject IDs into h2 headings for ToC anchor links
  const contentWithIds = useMemo(() => {
    if (!content || headings.length === 0) return content
    let result = content
    let idx = 0
    result = result.replace(/<h2([^>]*)>/gi, (match, attrs) => {
      return `<h2${attrs} id="section-${idx++}">`
    })
    return result
  }, [content, headings])

  // Related articles: same category, excluding current, max 3
  const relatedArticles = useMemo(() => {
    if (!index || !article) return []
    return index
      .filter(a => a.id !== articleId && a.category === article.category)
      .slice(0, 3)
  }, [index, article, articleId])

  // Copy share link to clipboard
  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopiedLink(true)
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => setCopiedLink(false), 2000)
    })
  }

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    }
  }, [])

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

  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(article.title)}&url=${encodeURIComponent(shareUrl)}`
  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(article.title + ' ' + shareUrl)}`

  return (
    <div className="news-page animate-fade-in">
      <Link to="/news" className="back-button">
        <ArrowLeft size={18} /> Back to News
      </Link>

      <article className="article-full" aria-label="Article content" itemScope itemType="https://schema.org/NewsArticle">
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

        <div className="article-sharing">
          <span className="share-label"><Share2 size={16} /> Share</span>
          <div className="share-buttons">
            <a href={twitterUrl} target="_blank" rel="noopener noreferrer" className="share-btn twitter" aria-label="Share on X">{'\uD835\uDD4F'}</a>
            <a href={facebookUrl} target="_blank" rel="noopener noreferrer" className="share-btn facebook" aria-label="Share on Facebook">f</a>
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="share-btn whatsapp" aria-label="Share on WhatsApp">w</a>
            <button onClick={copyLink} className="share-btn link" aria-label="Copy link">
              <Link2 size={16} /> {copiedLink ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        {article.image && (
          <div className="article-image">
            <img
              src={article.image}
              alt={article.title}
              loading="lazy"
              itemProp="image"
              onError={(e) => { e.target.parentElement.style.display = 'none' }}
            />
          </div>
        )}

        {headings.length >= 3 && (
          <nav className="article-toc" aria-label="Table of contents">
            <h3>In this article</h3>
            <ol>
              {headings.map(h => (
                <li key={h.id}>
                  <a href={`#${h.id}`}>{h.text}</a>
                </li>
              ))}
            </ol>
          </nav>
        )}

        {(contentWithIds || content) && (
          <div
            className="article-body"
            itemProp="articleBody"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(contentWithIds || content) }}
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

      {relatedArticles.length > 0 && (
        <section className="related-articles" aria-label="Related articles">
          <h2>Related Articles</h2>
          <div className="related-articles-grid">
            {relatedArticles.map(ra => (
              <Link key={ra.id} to={`/news/${ra.id}`} className="related-card">
                <div className="related-card-image">
                  {ra.image ? (
                    <img src={ra.image} alt={ra.title} loading="lazy" onError={(e) => { e.target.style.display = 'none' }} />
                  ) : (
                    <div className="article-image-placeholder"><FileText size={24} /></div>
                  )}
                </div>
                <div className="related-card-body">
                  <span className="article-date"><Calendar size={12} /> {formatDate(ra.date)}</span>
                  <h4>{ra.title}</h4>
                  <span className="read-more">Read more <ChevronRight size={12} /></span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

export default ArticleView
