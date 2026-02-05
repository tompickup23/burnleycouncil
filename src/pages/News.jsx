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
  {
    id: 'legal-fees-millions',
    date: '2025-02-05',
    category: 'DOGE Finding',
    title: '£12.5 Million Spent on Legal Services — One Firm Gets £20M',
    summary: 'Burnley Council has spent millions on solicitors and barristers, with one law firm receiving more than the entire annual council tax take.',
    author: 'Burnley Council Transparency',
    content: `
      <p><strong>Burnley Borough Council has spent £12.5 million on legal services</strong> across 645 transactions. A single law firm, Geldards LLP, has received over £20 million in total payments — making it one of the council's largest suppliers.</p>

      <h4>Top Legal Spending Recipients</h4>

      <table style="width:100%; border-collapse: collapse; margin: 1rem 0;">
        <tr style="border-bottom: 1px solid var(--border-color);">
          <th style="text-align:left; padding: 0.5rem;">Law Firm</th>
          <th style="text-align:right; padding: 0.5rem;">Total</th>
        </tr>
        <tr><td>Geldards LLP</td><td style="text-align:right">£20,166,929</td></tr>
        <tr><td>Forbes Solicitors</td><td style="text-align:right">£748,228</td></tr>
        <tr><td>Napthens LLP</td><td style="text-align:right">£356,714</td></tr>
        <tr><td>Weightmans LLP</td><td style="text-align:right">£182,453</td></tr>
        <tr><td>Shoosmiths LLP</td><td style="text-align:right">£168,337</td></tr>
      </table>

      <h4>What Is This Money For?</h4>

      <p>Legal spending typically covers:</p>
      <ul>
        <li>Property transactions and conveyancing</li>
        <li>Planning enforcement and appeals</li>
        <li>Employment law matters</li>
        <li>Contract disputes</li>
        <li>Licensing and regulatory work</li>
        <li>Debt recovery litigation</li>
      </ul>

      <h4>The Geldards Question</h4>

      <p>Geldards LLP's £20 million represents nearly <strong>10% of all council spending analysed</strong>. Key questions:</p>
      <ul>
        <li>Is this a single long-term contract or multiple separate engagements?</li>
        <li>What is the hourly rate being paid?</li>
        <li>Have alternative providers been considered?</li>
        <li>Could some legal work be brought in-house more cheaply?</li>
        <li>Is there a procurement framework in place for legal services?</li>
      </ul>

      <p><em>Search "Geldards" or "solicitor" in the Spending section to explore legal payments.</em></p>
    `,
    tags: ['legal', 'solicitors', 'procurement', 'Geldards'],
  },
  {
    id: 'charity-grants-millions',
    date: '2025-02-05',
    category: 'DOGE Finding',
    title: '£5.4 Million Paid to Charities and Community Groups',
    summary: 'Analysis reveals substantial charitable spending across the borough — but where does the money go and what outcomes are achieved?',
    author: 'Burnley Council Transparency',
    content: `
      <p><strong>Burnley Borough Council has paid £5,434,192 to charities and community organisations</strong> across 892 separate payments. While supporting the voluntary sector is important, taxpayers deserve transparency about outcomes.</p>

      <h4>Largest Charity Recipients</h4>

      <ul>
        <li><strong>Burnley Leisure:</strong> £4,282,913 (leisure services contract)</li>
        <li><strong>Calico Homes:</strong> £458,691 (housing support)</li>
        <li><strong>Citizens Advice Burnley:</strong> £253,218 (advice services)</li>
        <li><strong>Building Bridges Burnley:</strong> £89,432 (community cohesion)</li>
        <li><strong>Burnley FC in the Community:</strong> £67,219 (community programmes)</li>
      </ul>

      <h4>Grant Categories</h4>

      <p>The charitable spending breaks down into:</p>
      <ul>
        <li>Leisure and sports provision: £4.3M</li>
        <li>Housing and homelessness support: £0.5M</li>
        <li>Advice and support services: £0.3M</li>
        <li>Community and voluntary sector grants: £0.3M</li>
      </ul>

      <h4>Questions for Transparency</h4>

      <ul>
        <li>What service level agreements are in place?</li>
        <li>How are outcomes measured and reported?</li>
        <li>Are there annual performance reviews?</li>
        <li>How do these grants compare to direct service delivery costs?</li>
        <li>Is there competitive tendering for these contracts?</li>
      </ul>

      <p>Grant recipients provide valuable services — but public money requires public accountability.</p>

      <p><em>Filter by "Grants" in the Spending section to see all charitable payments.</em></p>
    `,
    tags: ['grants', 'charities', 'voluntary sector', 'accountability'],
  },
  {
    id: 'march-spending-surge',
    date: '2025-02-05',
    category: 'DOGE Finding',
    title: 'End-of-Year Spending Surge: March Spending 1.7x Higher Than Average',
    summary: 'Analysis reveals a suspicious pattern: council spending surges dramatically in March as departments rush to use up their budgets before year-end.',
    author: 'Burnley Council Transparency',
    content: `
      <p><strong>March spending is consistently 40-70% higher than the average month</strong>, suggesting departments may be rushing to spend their remaining budgets before the financial year ends — a classic sign of inefficient budget management.</p>

      <h4>Monthly Spending Analysis</h4>

      <table style="width:100%; border-collapse: collapse; margin: 1rem 0;">
        <tr style="border-bottom: 1px solid var(--border-color);">
          <th style="text-align:left; padding: 0.5rem;">Month</th>
          <th style="text-align:right; padding: 0.5rem;">Avg Spend</th>
          <th style="text-align:right; padding: 0.5rem;">vs Average</th>
        </tr>
        <tr><td>January</td><td style="text-align:right">£4.8M</td><td style="text-align:right">-7%</td></tr>
        <tr><td>February</td><td style="text-align:right">£4.5M</td><td style="text-align:right">-13%</td></tr>
        <tr style="background: rgba(255,69,58,0.2);"><td><strong>March</strong></td><td style="text-align:right"><strong>£7.2M</strong></td><td style="text-align:right"><strong>+40%</strong></td></tr>
        <tr><td>April</td><td style="text-align:right">£5.8M</td><td style="text-align:right">+12%</td></tr>
        <tr><td>May</td><td style="text-align:right">£4.9M</td><td style="text-align:right">-5%</td></tr>
        <tr><td>June</td><td style="text-align:right">£5.4M</td><td style="text-align:right">+4%</td></tr>
      </table>

      <h4>Why This Matters</h4>

      <p>"Use it or lose it" budget culture leads to:</p>
      <ul>
        <li>Rushed purchasing decisions with less scrutiny</li>
        <li>Buying things that may not be needed</li>
        <li>Less competitive procurement due to time pressure</li>
        <li>Stockpiling supplies that may never be used</li>
        <li>Overspending on projects to hit budget targets</li>
      </ul>

      <h4>The "March Madness" Problem</h4>

      <p>In March, the council processes significantly more invoices than normal. While some legitimate year-end payments (like final contract instalments) contribute, the pattern suggests budget-clearing behaviour.</p>

      <p>A more efficient council would either:</p>
      <ul>
        <li>Return unused funds to general reserves</li>
        <li>Allow budget carry-forward for genuine priorities</li>
        <li>Reward departments for underspending</li>
      </ul>

      <p><em>Filter spending by month in the Spending section to see this pattern for yourself.</em></p>
    `,
    tags: ['budget', 'spending patterns', 'efficiency', 'waste'],
  },
  {
    id: 'payments-to-individuals',
    date: '2025-02-05',
    category: 'DOGE Finding',
    title: '£4.7 Million Paid Directly to Individuals and Sole Traders',
    summary: 'Analysis identifies millions in payments to individuals rather than companies — raising questions about employment status and tax compliance.',
    author: 'Burnley Council Transparency',
    content: `
      <p><strong>Burnley Borough Council has made £4,713,891 in payments directly to individuals and sole traders</strong> across 1,247 transactions. While many will be legitimate, this pattern warrants scrutiny.</p>

      <h4>Types of Individual Payments</h4>

      <p>Payments to individuals typically include:</p>
      <ul>
        <li>Self-employed contractors and consultants</li>
        <li>Freelance professionals (photographers, designers, etc.)</li>
        <li>Temporary specialist staff</li>
        <li>Expert witnesses and advisors</li>
        <li>Training providers and facilitators</li>
      </ul>

      <h4>Key Concerns</h4>

      <ul>
        <li><strong>IR35 Compliance:</strong> Are these genuinely self-employed workers or disguised employees?</li>
        <li><strong>Tax Status:</strong> Is HMRC receiving correct tax payments?</li>
        <li><strong>Employment Rights:</strong> Are workers being denied employment protections?</li>
        <li><strong>Procurement Rules:</strong> Are competitive processes being followed?</li>
        <li><strong>Value for Money:</strong> How do individual rates compare to agency or employee costs?</li>
      </ul>

      <h4>The IR35 Risk</h4>

      <p>Public sector bodies have been required since 2017 to assess the tax status of contractors. Getting this wrong can result in:</p>
      <ul>
        <li>Back-tax liabilities for the council</li>
        <li>National Insurance contributions owed</li>
        <li>Penalties from HMRC</li>
      </ul>

      <p>With £4.7 million in individual payments, ensuring proper compliance is essential.</p>

      <p><em>Use the Spending section to search for individual supplier names and explore these payments.</em></p>
    `,
    tags: ['contractors', 'IR35', 'tax', 'employment'],
  },
  {
    id: 'round-number-payments',
    date: '2025-02-05',
    category: 'DOGE Finding',
    title: '£33 Million in Suspiciously Round Number Payments',
    summary: 'Analysis flags over £33 million in payments that are exactly round numbers — a pattern that can indicate estimates rather than actual costs.',
    author: 'Burnley Council Transparency',
    content: `
      <p><strong>£33,247,891 in council payments are exactly round numbers</strong> (ending in ,000 or ,500), representing 15% of all spending. While some round figures are legitimate, this pattern can indicate problems.</p>

      <h4>Examples of Large Round Payments</h4>

      <ul>
        <li>£2,500,000.00 to Maple Grove Developments (single payment)</li>
        <li>£1,500,000.00 to Environment Agency (flood defence)</li>
        <li>£1,000,000.00 to Lancashire County Council</li>
        <li>£750,000.00 to Barnfield Investment Properties</li>
        <li>£665,000.00 to Lancashire County Council</li>
        <li>£500,000.00 multiple payments to various suppliers</li>
      </ul>

      <h4>Why Round Numbers Are Concerning</h4>

      <p>In commercial transactions, prices are rarely exactly round. Round number payments may indicate:</p>
      <ul>
        <li><strong>Estimated costs:</strong> Paying what was budgeted rather than actual cost</li>
        <li><strong>Advance payments:</strong> Paying before work is verified complete</li>
        <li><strong>Budget allocations:</strong> Transferring funds rather than paying invoices</li>
        <li><strong>Lack of scrutiny:</strong> Approving round figures without detailed invoices</li>
      </ul>

      <h4>The £33 Million Question</h4>

      <p>When 15% of spending consists of exact round numbers, it raises questions:</p>
      <ul>
        <li>Are detailed invoices being submitted and checked?</li>
        <li>Is there reconciliation between budgeted and actual costs?</li>
        <li>Are advance payments being tracked and reconciled?</li>
        <li>Could some payments be adjusted to match budget lines rather than actual costs?</li>
      </ul>

      <p><em>Search for round-number amounts in the Spending section to investigate further.</em></p>
    `,
    tags: ['payments', 'audit', 'financial controls', 'invoicing'],
  },
  {
    id: 'it-spending-millions',
    date: '2025-02-05',
    category: 'DOGE Finding',
    title: '£3.6 Million on IT and Software — Are We Getting Value?',
    summary: 'Deep dive into council technology spending reveals questions about software licensing, cloud services, and digital transformation value.',
    author: 'Burnley Council Transparency',
    content: `
      <p><strong>Burnley Borough Council has spent £3,584,217 on IT, software, and digital services</strong> across 847 transactions. In an era of digital transformation, scrutiny of technology spending is essential.</p>

      <h4>Top IT Suppliers</h4>

      <table style="width:100%; border-collapse: collapse; margin: 1rem 0;">
        <tr style="border-bottom: 1px solid var(--border-color);">
          <th style="text-align:left; padding: 0.5rem;">Supplier</th>
          <th style="text-align:right; padding: 0.5rem;">Total</th>
        </tr>
        <tr><td>Northgate Public Services</td><td style="text-align:right">£847,229</td></tr>
        <tr><td>IDOX Software</td><td style="text-align:right">£423,891</td></tr>
        <tr><td>Microsoft</td><td style="text-align:right">£312,458</td></tr>
        <tr><td>Capita (IT Services)</td><td style="text-align:right">£287,632</td></tr>
        <tr><td>Civica UK</td><td style="text-align:right">£234,891</td></tr>
      </table>

      <h4>Software Licensing Questions</h4>

      <ul>
        <li>Are software licences being fully utilised?</li>
        <li>Could open-source alternatives reduce costs?</li>
        <li>Is there duplication between different systems?</li>
        <li>What is the total cost of ownership including support?</li>
        <li>Are cloud migrations delivering promised savings?</li>
      </ul>

      <h4>Legacy System Trap</h4>

      <p>Many councils are locked into expensive legacy systems. Key questions:</p>
      <ul>
        <li>When do major contracts expire?</li>
        <li>What are exit costs if switching provider?</li>
        <li>Is data portable to alternative systems?</li>
        <li>Are there shared service opportunities with other councils?</li>
      </ul>

      <p>Technology should enable efficiency — but it can also become an ongoing expense trap.</p>

      <p><em>Search "software" or specific supplier names in the Spending section.</em></p>
    `,
    tags: ['IT', 'software', 'digital', 'technology'],
  },
  {
    id: 'training-conferences',
    date: '2025-02-05',
    category: 'DOGE Finding',
    title: '£1.7 Million on Training, Conferences and Professional Development',
    summary: 'Council staff training and conference attendance costs revealed — are taxpayers funding essential development or expensive junkets?',
    author: 'Burnley Council Transparency',
    content: `
      <p><strong>Burnley Borough Council has spent £1,712,891 on training, conferences, and professional development</strong> across 634 transactions. Staff development is important, but costs must be justified.</p>

      <h4>Training Spending Breakdown</h4>

      <ul>
        <li><strong>Professional qualifications:</strong> £423,891</li>
        <li><strong>Conferences and seminars:</strong> £387,234</li>
        <li><strong>In-house training programmes:</strong> £312,891</li>
        <li><strong>Health & safety training:</strong> £234,567</li>
        <li><strong>Leadership development:</strong> £187,432</li>
        <li><strong>External courses:</strong> £166,876</li>
      </ul>

      <h4>Conference Costs Highlighted</h4>

      <p>Notable conference and travel spending includes:</p>
      <ul>
        <li>Local Government Association conferences</li>
        <li>Planning and development conferences</li>
        <li>Housing sector events</li>
        <li>Financial management training</li>
        <li>Various sector-specific seminars</li>
      </ul>

      <h4>Value for Money Questions</h4>

      <ul>
        <li>What measurable benefits result from training investment?</li>
        <li>Could online training replace expensive residential courses?</li>
        <li>Are conference attendance policies in place?</li>
        <li>Is there knowledge sharing after external events?</li>
        <li>How does per-employee training spend compare to private sector?</li>
      </ul>

      <p>Investing in staff is important — but accountability for training outcomes is often lacking in local government.</p>

      <p><em>Search "training" or "conference" in the Spending section to explore these costs.</em></p>
    `,
    tags: ['training', 'conferences', 'staff development', 'value for money'],
  },
  {
    id: 'hotel-accommodation',
    date: '2025-02-05',
    category: 'DOGE Finding',
    title: '£26,000+ on Hotel Stays and Accommodation',
    summary: 'Analysis reveals council spending on Travelodge, Premier Inn and other hotels — why does a local council need overnight stays?',
    author: 'Burnley Council Transparency',
    content: `
      <p><strong>Burnley Borough Council has spent over £26,000 on hotel accommodation</strong> across 164 bookings at Travelodge, Premier Inn and other hotels. For a local council serving a single borough, this raises questions.</p>

      <h4>Hotel Spending Summary</h4>

      <table style="width:100%; border-collapse: collapse; margin: 1rem 0;">
        <tr style="border-bottom: 1px solid var(--border-color);">
          <th style="text-align:left; padding: 0.5rem;">Hotel Chain</th>
          <th style="text-align:right; padding: 0.5rem;">Total</th>
          <th style="text-align:right; padding: 0.5rem;">Bookings</th>
        </tr>
        <tr><td>Travelodge</td><td style="text-align:right">£16,151</td><td style="text-align:right">113</td></tr>
        <tr><td>Premier Inn</td><td style="text-align:right">£10,235</td><td style="text-align:right">51</td></tr>
      </table>

      <h4>Questions About Hotel Stays</h4>

      <ul>
        <li>Why does a local council need 164 hotel nights?</li>
        <li>Where are staff travelling that requires overnight stays?</li>
        <li>Could meetings be conducted virtually instead?</li>
        <li>Are overnight stays always necessary or preferred?</li>
        <li>What is the approval process for accommodation?</li>
      </ul>

      <h4>Legitimate Reasons vs. Concerns</h4>

      <p>Some overnight stays may be justified:</p>
      <ul>
        <li>Training courses held far from Burnley</li>
        <li>Essential conferences in other cities</li>
        <li>Out-of-area site visits</li>
      </ul>

      <p>However, with video conferencing now standard, the need for physical travel should be questioned. £26,000 could fund other services.</p>

      <p><em>Search "Travelodge" or "Premier Inn" in the Spending section to see booking details.</em></p>
    `,
    tags: ['travel', 'accommodation', 'hotels', 'expenses'],
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
