import { useState, useEffect } from 'react'
import { Calendar, ChevronRight, AlertCircle, TrendingUp, Users } from 'lucide-react'
import { formatDate, formatCurrency } from '../utils/format'
import './News.css'

// News articles - these could be loaded from a JSON file
const newsArticles = [
  {
    id: 'councillor-resignations-2025',
    date: '2025-02-05',
    category: 'Democracy',
    title: 'County Councillor Calls for Mass Resignations Over Cancelled Elections',
    summary: 'A County Councillor for Padiham and Burnley West called on all Borough Councillors who were due for re-election to resign for democratic reasons.',
    image: '/images/tom-pickup.jpg',
    content: `
      <p>In a bold move that highlighted growing concerns about local democracy, County Councillor Tom Pickup, who represents Padiham and Burnley West, called on all Burnley Borough Councillors who should have faced re-election to resign from their positions.</p>

      <p>The call came after it was announced that local council elections in Burnley would be cancelled indefinitely due to planned local government reorganisation in Lancashire. Under normal circumstances, one-third of the council's 45 seats would have been contested in May 2025.</p>

      <p>Councillor Pickup argued that with elections cancelled indefinitely, the democratic mandate of those councillors had effectively expired. He stated that for democratic accountability reasons, those councillors should step down rather than continue to serve without having faced the electorate as scheduled.</p>

      <p>Despite the public call, no councillors ultimately chose to resign their positions. All affected councillors have remained in their seats and will continue to serve until local government reorganisation takes effect.</p>

      <p>The situation raises important questions about democratic accountability when scheduled elections are postponed or cancelled. Critics argue that councillors continuing to serve beyond their expected term undermines the democratic process, while supporters say practical continuity of local governance is necessary during transition periods.</p>
    `,
    tags: ['democracy', 'elections', 'accountability'],
  },
  {
    id: 'doge-analysis-top-suppliers',
    date: '2025-02-05',
    category: 'DOGE Finding',
    title: 'Top 20 Suppliers Receive Over 60% of Council Spending',
    summary: 'Analysis reveals significant supplier concentration with the top 20 suppliers accounting for the majority of council expenditure.',
    content: `
      <p>An analysis of Burnley Borough Council's spending data reveals that just 20 suppliers receive over 60% of all council spending, raising questions about procurement diversity and value for money.</p>

      <p>The largest single supplier is Barnfield Investment Properties Ltd, which has received millions in payments related to property and development projects. Other major suppliers include Liberata UK Ltd, which provides outsourced revenues and benefits services under a long-term contract.</p>

      <p>This level of supplier concentration is common among local authorities but raises important questions:</p>
      <ul>
        <li>Are taxpayers getting best value from these arrangements?</li>
        <li>Is there sufficient competition in council procurement?</li>
        <li>Should more contracts go to local SME businesses?</li>
      </ul>

      <p>The council maintains that all contracts follow proper procurement procedures and deliver value for money. However, transparency advocates argue that such concentration warrants closer public scrutiny.</p>
    `,
    tags: ['spending', 'procurement', 'accountability'],
  },
  {
    id: 'outsourcing-liberata',
    date: '2025-02-05',
    category: 'DOGE Finding',
    title: 'Council Outsourcing: £21M to Liberata UK',
    summary: 'Burnley Council pays over £21 million to Liberata UK Ltd for outsourced revenues and benefits services.',
    content: `
      <p>Analysis of council spending data reveals that Liberata UK Ltd has received over £21 million from Burnley Borough Council for providing outsourced revenues and benefits administration services.</p>

      <p>The contract covers key council functions including:</p>
      <ul>
        <li>Council Tax collection and administration</li>
        <li>Business Rates collection</li>
        <li>Housing Benefit and Council Tax Support processing</li>
        <li>Debt recovery services</li>
      </ul>

      <p>Liberata is a major provider of such services to local authorities across the UK. While outsourcing can deliver cost savings and expertise, critics argue it removes democratic control over essential public services.</p>

      <p>Questions that warrant public scrutiny include:</p>
      <ul>
        <li>How does the cost compare to in-house delivery?</li>
        <li>What are the performance metrics and are they being met?</li>
        <li>How much profit does Liberata make from this contract?</li>
        <li>What happens to local jobs when services are outsourced?</li>
      </ul>
    `,
    tags: ['outsourcing', 'contracts', 'liberata'],
  },
  {
    id: 'grants-voluntary-sector',
    date: '2025-02-05',
    category: 'DOGE Finding',
    title: '£11 Million in Grants to Voluntary Organisations',
    summary: 'Council distributed over £11 million in grants to voluntary and community organisations over the analysis period.',
    content: `
      <p>Burnley Borough Council has distributed over £11 million in grants to voluntary sector and community organisations, according to spending data analysis.</p>

      <p>While grants to community organisations can deliver vital local services, taxpayers have a right to know:</p>
      <ul>
        <li>Which organisations receive public money</li>
        <li>What outcomes are being delivered</li>
        <li>How grant decisions are made</li>
        <li>Whether there is proper accountability for the spending</li>
      </ul>

      <p>The grants cover a range of activities from community support to cultural activities. The full list of recipients and amounts can be explored in the Spending section of this website.</p>

      <p>Note: Some grant spending during 2021/22 related to COVID-19 pandemic support programmes, which were exceptional circumstances.</p>
    `,
    tags: ['grants', 'voluntary sector', 'community'],
  },
]

function News() {
  const [selectedArticle, setSelectedArticle] = useState(null)
  const [categoryFilter, setCategoryFilter] = useState('all')

  const categories = ['all', ...new Set(newsArticles.map(a => a.category))]

  const filteredArticles = categoryFilter === 'all'
    ? newsArticles
    : newsArticles.filter(a => a.category === categoryFilter)

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'DOGE Finding':
        return <TrendingUp size={16} />
      case 'Democracy':
        return <Users size={16} />
      default:
        return <AlertCircle size={16} />
    }
  }

  if (selectedArticle) {
    return (
      <div className="news-page animate-fade-in">
        <button
          className="back-button"
          onClick={() => setSelectedArticle(null)}
        >
          ← Back to News
        </button>

        <article className="article-full">
          <header className="article-header">
            <div className="article-meta">
              <span className={`category-badge ${selectedArticle.category.toLowerCase().replace(' ', '-')}`}>
                {getCategoryIcon(selectedArticle.category)}
                {selectedArticle.category}
              </span>
              <span className="article-date">
                <Calendar size={14} />
                {formatDate(selectedArticle.date, 'long')}
              </span>
            </div>
            <h1>{selectedArticle.title}</h1>
          </header>

          {selectedArticle.image && (
            <div className="article-image">
              <img src={selectedArticle.image} alt="" />
            </div>
          )}

          <div
            className="article-content"
            dangerouslySetInnerHTML={{ __html: selectedArticle.content }}
          />

          <footer className="article-footer">
            <div className="article-tags">
              {selectedArticle.tags.map(tag => (
                <span key={tag} className="tag">{tag}</span>
              ))}
            </div>
          </footer>
        </article>
      </div>
    )
  }

  return (
    <div className="news-page animate-fade-in">
      <header className="page-header">
        <h1>News & Findings</h1>
        <p className="subtitle">
          DOGE-style analysis findings and news about Burnley Borough Council
        </p>
      </header>

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

      <div className="articles-list">
        {filteredArticles.map(article => (
          <article
            key={article.id}
            className="article-card"
            onClick={() => setSelectedArticle(article)}
          >
            <div className="article-meta">
              <span className={`category-badge ${article.category.toLowerCase().replace(' ', '-')}`}>
                {getCategoryIcon(article.category)}
                {article.category}
              </span>
              <span className="article-date">
                <Calendar size={14} />
                {formatDate(article.date)}
              </span>
            </div>

            <h2 className="article-title">{article.title}</h2>
            <p className="article-summary">{article.summary}</p>

            <span className="read-more">
              Read more <ChevronRight size={16} />
            </span>
          </article>
        ))}
      </div>
    </div>
  )
}

export default News
