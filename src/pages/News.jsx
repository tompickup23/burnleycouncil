import { useState, useEffect } from 'react'
import { Calendar, ChevronRight, AlertCircle, TrendingUp, Users, CreditCard, Building, DollarSign } from 'lucide-react'
import { formatDate, formatCurrency } from '../utils/format'
import './News.css'

// News articles based on real data analysis
const newsArticles = [
  {
    id: 'councillor-resignations-2025',
    date: '2025-02-05',
    category: 'Democracy',
    title: 'County Councillor Calls for Borough Councillor Resignations to Trigger By-Elections',
    summary: 'County Councillor Tom Pickup called on Borough Councillors whose terms were due for re-election to resign, which would have triggered by-elections and given residents a democratic vote.',
    image: '/images/tom-pickup.jpg',
    author: 'Burnley Council Transparency',
    content: `
      <p>County Councillor Tom Pickup, who represents Padiham and Burnley West at Lancashire County Council, publicly called on all Burnley Borough Councillors whose seats were due for re-election to resign from their positions.</p>

      <p>The call came after it was confirmed that local council elections in Burnley would be cancelled indefinitely due to planned local government reorganisation in Lancashire. Under normal circumstances, one-third of the council's 45 seats would have been contested in May 2025.</p>

      <h4>Why Resignations Would Have Triggered By-Elections</h4>

      <p>Had the affected councillors resigned, the law requires that by-elections must be held to fill any casual vacancies. This means residents would have had the opportunity to vote for their representatives, even though the scheduled elections were cancelled.</p>

      <p>Councillor Pickup stated: "These councillors were elected in 2021 on four-year terms. Their democratic mandate from the electorate has now expired. By resigning, they could give the people of Burnley the democratic voice they deserve through by-elections."</p>

      <h4>No Councillors Chose to Resign</h4>

      <p>Despite the public call, no councillors have resigned their positions. All affected councillors have remained in their seats and will continue to serve until local government reorganisation takes effect, potentially until 2028.</p>

      <p>This means some councillors may serve up to seven years without facing re-election — nearly double their original four-year mandate.</p>

      <h4>Background: Local Government Reorganisation</h4>

      <p>Burnley Borough Council voted to request that the government postpone its May 2025 elections due to Lancashire's local government reorganisation. The council cited the cost and capacity required to run elections when the council itself may be abolished to make way for a new unitary authority.</p>

      <p>Elections for 'shadow' versions of new, larger councils could be held in May 2027, with new councils potentially taking full responsibilities from April 2028.</p>
    `,
    tags: ['democracy', 'elections', 'by-elections', 'local government'],
  },
  {
    id: 'potential-duplicate-payments',
    date: '2025-02-05',
    category: 'DOGE Finding',
    title: '£9.5 Million in Potential Duplicate Payments Identified',
    summary: 'Analysis reveals identical payments to the same suppliers on the same day, totalling £9.5 million that warrant investigation for possible overpayment.',
    author: 'Burnley Council Transparency',
    content: `
      <p><strong>Our automated analysis has identified £9,486,047 in payments that share the same supplier, same date, and same amount</strong> — a pattern that could indicate duplicate payments or requires explanation.</p>

      <h4>Largest Potential Duplicates</h4>

      <p>The analysis flagged several high-value transactions:</p>

      <ul>
        <li><strong>Barnfield Investment Properties Ltd:</strong> £982,507.52 paid twice on 11 June 2024</li>
        <li><strong>Maple Grove Developments Ltd:</strong> £712,428.52 paid twice on 17 May 2022</li>
        <li><strong>Lancashire County Council:</strong> £665,000.00 paid twice on 11 May 2021</li>
        <li><strong>Environment Agency:</strong> £531,030.26 paid twice on 27 July 2021</li>
        <li><strong>Burnley Leisure:</strong> £526,383.00 paid twice on 14 April 2021</li>
      </ul>

      <h4>Liberata Payments Show Recurring Pattern</h4>

      <p>The outsourcing contractor Liberata UK Ltd shows a particularly notable pattern, with identical payments appearing twice on multiple dates throughout 2024:</p>

      <ul>
        <li>£375,922.90 twice on 16 May 2024</li>
        <li>£375,446.92 twice on 16 July 2024</li>
        <li>£375,446.92 twice on 15 August 2024</li>
        <li>£375,446.92 twice on 17 September 2024</li>
        <li>£375,446.92 twice on 16 October 2024</li>
      </ul>

      <h4>Context and Caveats</h4>

      <p>Not all same-day, same-amount payments are necessarily errors. Some may be:</p>
      <ul>
        <li>Legitimate split payments across different cost centres</li>
        <li>Scheduled instalments that happen to fall on the same date</li>
        <li>Data recording issues rather than actual duplicate payments</li>
      </ul>

      <p>However, the scale of these patterns — nearly £9.5 million — warrants proper investigation and public explanation from the council.</p>

      <p><em>You can search for these suppliers in the Spending section to verify these figures yourself.</em></p>
    `,
    tags: ['spending', 'waste', 'accountability', 'audit'],
  },
  {
    id: 'netflix-council-cards',
    date: '2025-02-05',
    category: 'DOGE Finding',
    title: 'Council Cards Used for 51 Netflix Payments',
    summary: 'Analysis reveals ongoing Netflix subscription payments on council purchase cards since 2021, raising questions about appropriate use of public funds.',
    author: 'Burnley Council Transparency',
    content: `
      <p><strong>Burnley Borough Council has made 51 separate payments to Netflix totalling £490.73 since 2021</strong>, charged to the Economy & Growth department's purchase cards.</p>

      <h4>The Details</h4>

      <p>The payments range from £8.99 to £12.99 per month, consistent with standard Netflix subscription tiers. The payments have continued regularly through 2022, 2023, 2024, and into 2025.</p>

      <h4>Questions This Raises</h4>

      <ul>
        <li>What council business purpose requires a Netflix subscription?</li>
        <li>Why is a streaming entertainment service being paid for with public money?</li>
        <li>Is this for a specific project, or has it simply gone unnoticed?</li>
        <li>Are there other personal subscriptions on council cards?</li>
      </ul>

      <h4>Other Streaming Services Found</h4>

      <p>The analysis also found:</p>
      <ul>
        <li><strong>Amazon Prime:</strong> 51 payments totalling £448.49</li>
        <li><strong>Apple iCloud:</strong> 34 payments totalling £43.36</li>
      </ul>

      <p>While £490 over four years may seem trivial in a £217 million spending pot, it represents taxpayer money and raises questions about what other small, recurring payments may be flying under the radar.</p>

      <p><em>Search "Netflix" in the Spending section to see these payments for yourself.</em></p>
    `,
    tags: ['purchase cards', 'subscriptions', 'waste', 'accountability'],
  },
  {
    id: 'purchase-card-spending',
    date: '2025-02-05',
    category: 'DOGE Finding',
    title: '£610,000 Spent on Council Purchase Cards',
    summary: 'Deep dive into 6,671 purchase card transactions reveals spending at supermarkets, hotels, Amazon, and social media platforms.',
    author: 'Burnley Council Transparency',
    content: `
      <p><strong>Council staff have spent £610,168 across 6,671 purchase card transactions</strong> since 2021, with spending patterns that warrant public scrutiny.</p>

      <h4>Top Purchase Card Suppliers</h4>

      <table style="width:100%; border-collapse: collapse; margin: 1rem 0;">
        <tr style="border-bottom: 1px solid var(--border-color);">
          <th style="text-align:left; padding: 0.5rem;">Supplier</th>
          <th style="text-align:right; padding: 0.5rem;">Amount</th>
          <th style="text-align:right; padding: 0.5rem;">Transactions</th>
        </tr>
        <tr><td>Asda Superstore</td><td style="text-align:right">£22,606</td><td style="text-align:right">218</td></tr>
        <tr><td>DVLA Vehicle Tax</td><td style="text-align:right">£19,375</td><td style="text-align:right">67</td></tr>
        <tr><td>Travelodge</td><td style="text-align:right">£16,151</td><td style="text-align:right">113</td></tr>
        <tr><td>Amazon Marketplace</td><td style="text-align:right">£14,031</td><td style="text-align:right">317</td></tr>
        <tr><td>Currys/PC World</td><td style="text-align:right">£11,588</td><td style="text-align:right">49</td></tr>
        <tr><td>Facebook/Meta Advertising</td><td style="text-align:right">£10,773</td><td style="text-align:right">133</td></tr>
        <tr><td>Argos</td><td style="text-align:right">£10,811</td><td style="text-align:right">79</td></tr>
        <tr><td>Premier Inn</td><td style="text-align:right">£10,235</td><td style="text-align:right">51</td></tr>
        <tr><td>Trainline</td><td style="text-align:right">£8,378</td><td style="text-align:right">150</td></tr>
      </table>

      <h4>Year-by-Year Trend</h4>

      <p>Purchase card spending has remained relatively stable:</p>
      <ul>
        <li>2021/22: £137,155</li>
        <li>2022/23: £106,639</li>
        <li>2023/24: £119,141</li>
        <li>2024/25: £123,414</li>
        <li>2025/26: £123,820 (projected)</li>
      </ul>

      <h4>Questions for Scrutiny</h4>

      <ul>
        <li>Why are council staff making 218 separate Asda purchases?</li>
        <li>Are 317 Amazon transactions being properly monitored?</li>
        <li>Is £16,000+ on Travelodge stays necessary for a local council?</li>
        <li>What oversight exists for these decentralised purchases?</li>
      </ul>

      <p><em>Filter by "purchase_cards" in the Spending section to explore this data.</em></p>
    `,
    tags: ['purchase cards', 'spending', 'accountability'],
  },
  {
    id: 'social-media-advertising',
    date: '2025-02-05',
    category: 'DOGE Finding',
    title: '£22,000+ Spent on Social Media Advertising and Tools',
    summary: 'Council spends thousands on Facebook ads, Snapchat, Twitter, and social media management subscriptions.',
    author: 'Burnley Council Transparency',
    content: `
      <p><strong>Burnley Borough Council has spent over £22,000 on social media advertising and management tools</strong>, with Facebook/Meta being the largest recipient.</p>

      <h4>Social Media Spending Breakdown</h4>

      <ul>
        <li><strong>Facebook/Meta Advertising:</strong> £13,243 across 197 payments</li>
        <li><strong>Sprout Social (management tool):</strong> £13,285 across 48 payments</li>
        <li><strong>Mailchimp (email marketing):</strong> £8,679 across 95 payments</li>
        <li><strong>Snapchat Advertising:</strong> £1,110 across 68 payments</li>
        <li><strong>Twitter/X Advertising:</strong> £490 across 20 payments</li>
      </ul>

      <h4>Is This Money Well Spent?</h4>

      <p>While councils need to communicate with residents, questions arise:</p>

      <ul>
        <li>What reach and engagement do these ads achieve?</li>
        <li>Is paid social media more effective than organic content?</li>
        <li>Are there cheaper ways to reach Burnley residents?</li>
        <li>What is the return on investment for £22,000+ in social media spend?</li>
      </ul>

      <p>Transparency in outcomes — not just spending — would help taxpayers understand if this represents value for money.</p>
    `,
    tags: ['social media', 'advertising', 'marketing', 'communications'],
  },
  {
    id: 'outsourcing-liberata',
    date: '2025-02-05',
    category: 'DOGE Finding',
    title: '£21 Million to Single Outsourcing Company',
    summary: 'Liberata UK Ltd receives £21 million — nearly 10% of all council spending — for outsourced revenues and benefits services.',
    author: 'Burnley Council Transparency',
    content: `
      <p><strong>A single company, Liberata UK Ltd, has received £21,183,056 from Burnley Borough Council</strong> for providing outsourced revenues and benefits administration services. This represents nearly 10% of all council spending analysed.</p>

      <h4>What Liberata Does</h4>

      <p>The contract covers core council functions:</p>
      <ul>
        <li>Council Tax collection and billing</li>
        <li>Business Rates administration</li>
        <li>Housing Benefit and Council Tax Support processing</li>
        <li>Debt recovery services</li>
      </ul>

      <h4>The Numbers in Context</h4>

      <ul>
        <li><strong>Total to Liberata:</strong> £21,183,056</li>
        <li><strong>Number of payments:</strong> 363</li>
        <li><strong>Average payment:</strong> £58,354</li>
        <li><strong>Share of total council spending:</strong> ~10%</li>
      </ul>

      <h4>Questions for Scrutiny</h4>

      <ul>
        <li>How does this cost compare to in-house delivery?</li>
        <li>What are the contract performance metrics?</li>
        <li>What profit margin does Liberata make on this contract?</li>
        <li>When does the contract come up for renewal?</li>
        <li>Has the council considered bringing services back in-house?</li>
      </ul>

      <p>Liberata is a major provider to local authorities across the UK. Whether outsourcing delivers better value than in-house provision remains a subject of ongoing debate.</p>

      <p><em>Search "Liberata" in the Spending section to see all 363 payments.</em></p>
    `,
    tags: ['outsourcing', 'contracts', 'Liberata', 'privatisation'],
  },
  {
    id: 'consultancy-spending',
    date: '2025-02-05',
    category: 'DOGE Finding',
    title: '£1.67 Million Spent on External Consultants',
    summary: 'Analysis reveals significant spending on consultancy services, with questions about whether expertise could be developed in-house.',
    author: 'Burnley Council Transparency',
    content: `
      <p><strong>Burnley Borough Council has spent £1,667,802 on external consultants</strong> across 210 transactions, raising questions about the council's internal capability and value for money.</p>

      <h4>Top Consultancy Firms</h4>

      <ul>
        <li><strong>Mace Cost Consultancy:</strong> £362,496 (largest single payment)</li>
        <li><strong>IS Consultancy UK (IS Group):</strong> £179,430</li>
        <li><strong>Black Cat Building Consultancy:</strong> £428,001</li>
        <li><strong>FHP Property Consultants:</strong> £78,235</li>
        <li><strong>Knox McConnell Architects:</strong> £42,300</li>
      </ul>

      <h4>What Are Consultants Being Used For?</h4>

      <p>The consultancy spending covers various projects including:</p>
      <ul>
        <li>Cost management for capital projects</li>
        <li>Property and planning advice</li>
        <li>Digital transformation projects</li>
        <li>Levelling Up Fund projects</li>
        <li>Building surveys and technical assessments</li>
      </ul>

      <h4>Questions Worth Asking</h4>

      <ul>
        <li>Could this expertise be hired permanently at lower long-term cost?</li>
        <li>What is the day rate being paid to consultants?</li>
        <li>Are outcomes being measured against consultancy costs?</li>
        <li>Is there a strategic approach to reducing consultancy dependency?</li>
      </ul>
    `,
    tags: ['consultants', 'procurement', 'value for money'],
  },
  {
    id: 'supplier-concentration',
    date: '2025-02-05',
    category: 'DOGE Finding',
    title: 'Just 20 Suppliers Receive 61% of All Spending',
    summary: 'Analysis reveals extreme supplier concentration, with questions about competition, local business support, and procurement diversity.',
    author: 'Burnley Council Transparency',
    content: `
      <p><strong>Out of 4,458 different suppliers, just 20 companies receive over 61% of all council spending</strong> — raising important questions about procurement diversity and competition.</p>

      <h4>The Top 5 Suppliers</h4>

      <ol>
        <li><strong>Liberata UK Ltd:</strong> £21.2 million (revenues & benefits)</li>
        <li><strong>Geldards (Solicitors):</strong> £20.1 million (legal services)</li>
        <li><strong>Barnfield Investment Properties:</strong> £17.3 million (development)</li>
        <li><strong>Maple Grove Developments:</strong> £16.6 million (Pioneer Place)</li>
        <li><strong>Urbaser Ltd:</strong> £11.4 million (waste collection)</li>
      </ol>

      <h4>Supplier Statistics</h4>

      <ul>
        <li><strong>Total unique suppliers:</strong> 4,458</li>
        <li><strong>Single-transaction suppliers:</strong> 2,690 (60%)</li>
        <li><strong>SME ratio:</strong> 73% of suppliers are SMEs</li>
        <li><strong>Top 20 concentration:</strong> 61.3% of total spend</li>
      </ul>

      <h4>Why This Matters</h4>

      <ul>
        <li>High concentration may indicate limited competition</li>
        <li>Long-term contracts can lock in arrangements that may not represent best value</li>
        <li>Local businesses may struggle to access council contracts</li>
        <li>Dependency on few suppliers creates risk if they fail</li>
      </ul>

      <p><em>Explore the full supplier breakdown in the Spending section.</em></p>
    `,
    tags: ['procurement', 'suppliers', 'competition', 'value for money'],
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

  // Update document title for SEO
  useEffect(() => {
    if (selectedArticle) {
      document.title = `${selectedArticle.title} | Burnley Council Transparency`
    } else {
      document.title = 'News & Findings | Burnley Council Transparency'
    }
    return () => {
      document.title = 'Burnley Council Transparency - Independent Public Scrutiny Tool'
    }
  }, [selectedArticle])

  if (selectedArticle) {
    return (
      <div className="news-page animate-fade-in">
        <button
          className="back-button"
          onClick={() => setSelectedArticle(null)}
        >
          ← Back to News
        </button>

        <article className="article-full" itemScope itemType="https://schema.org/NewsArticle">
          <meta itemProp="author" content={selectedArticle.author || 'Burnley Council Transparency'} />
          <meta itemProp="datePublished" content={selectedArticle.date} />
          <meta itemProp="publisher" content="Burnley Council Transparency" />

          <header className="article-header">
            <div className="article-meta">
              <span className={`category-badge ${selectedArticle.category.toLowerCase().replace(' ', '-')}`}>
                {getCategoryIcon(selectedArticle.category)}
                {selectedArticle.category}
              </span>
              <span className="article-date">
                <Calendar size={14} />
                <time itemProp="datePublished" dateTime={selectedArticle.date}>
                  {formatDate(selectedArticle.date, 'long')}
                </time>
              </span>
            </div>
            <h1 itemProp="headline">{selectedArticle.title}</h1>
            <p className="article-byline">By {selectedArticle.author || 'Burnley Council Transparency'}</p>
          </header>

          {selectedArticle.image && (
            <div className="article-image">
              <img src={selectedArticle.image} alt="" itemProp="image" />
            </div>
          )}

          <div
            className="article-content"
            itemProp="articleBody"
            dangerouslySetInnerHTML={{ __html: selectedArticle.content }}
          />

          <footer className="article-footer">
            <div className="article-tags">
              {selectedArticle.tags.map(tag => (
                <span key={tag} className="tag">{tag}</span>
              ))}
            </div>
            <p className="article-disclaimer">
              <strong>Data Source:</strong> All figures derived from official Burnley Borough Council spending data,
              budget documents, and public records. Verify any finding using the Spending explorer.
            </p>
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
          DOGE-style analysis of Burnley Borough Council spending and governance.
          Every finding is backed by verifiable public data.
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
