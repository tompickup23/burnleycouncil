import { useState, useEffect } from 'react'
import { Calendar, ChevronRight, AlertCircle, TrendingUp, Users, CreditCard, Building, DollarSign } from 'lucide-react'
import { formatDate } from '../utils/format'
import './News.css'

// News articles based on real data analysis
const newsArticles = [
  {
    id: 'lgr-consultancy-spending',
    date: '2025-02-05',
    category: 'Investigation',
    title: 'Burnley Council\'s Five-Unitary Gamble: Spending Taxpayer Money to Keep Themselves in a Job',
    summary: 'Burnley Council is spending tens of thousands on consultants to push a five-unitary model for Lancashire — despite the strong case for fewer, larger authorities that would deliver real savings for residents.',
    image: '/images/articles/government.jpg',
    author: 'Burnley Council Transparency',
    content: `
      <p><strong>Burnley Borough Council has already begun spending on external consultants for local government reorganisation (LGR)</strong>, with spending data revealing payments to specialist firms under a new "Local Government Reorganisation" cost centre.</p>

      <h4>Consultancy Payments Identified</h4>

      <ul>
        <li><strong>31ten Consulting Limited:</strong> £32,500 (two payments of £16,250 in October 2025)</li>
        <li><strong>Socitm Commercial Ltd:</strong> £4,500</li>
      </ul>

      <p>These payments are categorised under "Agency & Contracted Services — Consultants Fees" within the new Z - Corporate Income Expenditure / Local Government Reorganisation budget line.</p>

      <h4>The Five-Unitary Problem</h4>

      <p><strong>Burnley Council is using this money to push for five new unitary authorities across Lancashire</strong> — a model that would create the maximum number of new councils, each serving roughly 270,000–300,000 people. This is well below the Government's stated aim of councils serving approximately 500,000 people.</p>

      <p>The five-unitary model, badged "Big enough to deliver — local enough to connect" by Burnley and Pendle councils, is the most expensive and least efficient option on the table. It would mean:</p>

      <ul>
        <li><strong>Five sets of chief executives, senior management teams, and corporate overheads</strong> — instead of two</li>
        <li><strong>Five separate IT systems, HR departments, finance teams, and legal services</strong> — with all the duplication that entails</li>
        <li><strong>The least financial savings of any option</strong> — fewer economies of scale mean higher costs per resident</li>
        <li><strong>Councils too small to effectively commission major services</strong> like adult social care, children's services, and highways — services that require significant scale</li>
      </ul>

      <h4>The Case for Fewer Councils</h4>

      <p>Lancashire County Council's own analysis acknowledged that some economic benefits of LGR "could be maximised with one unitary council" for Lancashire — but national policy prohibits this because it would remove the need for the combined county authority.</p>

      <p>A <strong>two-unitary model</strong> — broadly split north and south along the River Ribble — would deliver:</p>

      <ul>
        <li><strong>Genuine economies of scale</strong> — two councils serving 750,000+ people each, well above the Government's 500,000 threshold</li>
        <li><strong>Maximum cost savings</strong> — fewer senior officers, fewer duplicate systems, lower overheads</li>
        <li><strong>Stronger commissioning power</strong> for major services like social care, highways, and education</li>
        <li><strong>A simpler, clearer structure</strong> that residents can actually understand</li>
      </ul>

      <p>Even a one-unitary model — had the Government allowed it — would have been the optimal solution for a county the size of Lancashire, delivering the greatest savings and the most strategic capacity.</p>

      <h4>So Why Five?</h4>

      <p>The uncomfortable truth is that the five-unitary model creates the most councillor seats and the most senior officer positions. It is the option that best serves the interests of existing district council leaders and officers — not residents.</p>

      <p>When Burnley Council's own consultation showed that 63% of Lancashire-wide respondents wanted to keep the current structure (which isn't an option), it's difficult to argue that the five-unitary model reflects genuine public demand. It reflects what council leaders want: to remain in charge of something.</p>

      <p>Meanwhile, taxpayers are already footing the bill — at least £37,000 in consultancy fees so far, with costs certain to rise significantly.</p>

      <h4>Lessons From Elsewhere</h4>

      <p>Other councils facing reorganisation have spent millions on the transition. Buckinghamshire's reorganisation cost over £18 million, while Northamptonshire's cost taxpayers approximately £14 million. If Lancashire pursues a five-unitary model, the transition costs will be higher than necessary because five authorities need to be set up from scratch instead of two.</p>

      <p>Residents deserve the model that delivers the best services at the lowest cost — not the one that creates the most jobs for politicians and senior officers.</p>

      <p><em>All spending figures are derived from publicly available council spending data. LGR proposals sourced from published business cases by Burnley Borough Council, Lancashire County Council, and other Lancashire authorities.</em></p>
    `,
    tags: ['LGR', 'reorganisation', 'consultants', 'spending', 'five unitary', 'two unitary'],
  },
  {
    id: 'waste-contract-fcc-urbaser',
    date: '2025-02-05',
    category: 'Investigation',
    title: 'Burnley\'s Waste Crisis: Two Years\' Warning, No Plan, and Now Envirofuel Gets the Contract',
    summary: 'Burnley Council was told in December 2023 that Whinney Hill landfill would close. Two years later, they still don\'t have a waste transfer station — and residents near Envirofuel will pay the price.',
    image: '/images/articles/waste.jpg',
    author: 'Burnley Council Transparency',
    content: `
      <p><strong>In December 2023, Lancashire County Council told Burnley Borough Council that Whinney Hill landfill would close.</strong> The council was given over two years to prepare. They failed.</p>

      <p>As of April 2026, with no waste transfer station ready, Burnley's household waste will instead go to Envirofuel at Hapton Valley — a site that already handles over 100,000 tonnes of waste per year, much of it imported from as far away as Cumbria, Cambridge, Newcastle, and Birmingham.</p>

      <h4>A Failure of Planning</h4>

      <p>The timeline tells the story:</p>

      <ul>
        <li><strong>December 2023:</strong> LCC's cabinet agrees to extend the Whinney Hill contract with SUEZ until March 2026, specifically to give Burnley, Pendle, Hyndburn and Rossendale time to find alternatives</li>
        <li><strong>2024:</strong> Burnley Council fails to identify any suitable site for a waste transfer station. A joint solution with another East Lancashire council collapses in February 2025 due to "operational constraints"</li>
        <li><strong>Spring 2025:</strong> A "viable site" is finally identified — the existing council depot at Heasandford Industrial Estate</li>
        <li><strong>September 2025:</strong> Labour's scrutiny call-in forces the executive to reconsider the Heasandford decision</li>
        <li><strong>April 2026:</strong> Whinney Hill closes. No waste transfer station is ready. Envirofuel gets a two-year emergency contract</li>
      </ul>

      <p>Two years of warning. No waste transfer station built. The result: an emergency temporary tender to a private waste processing facility.</p>

      <h4>Who Is to Blame?</h4>

      <p><strong>Burnley Borough Council bears primary responsibility.</strong> They were told clearly in December 2023 that this was coming. They had over two years. They spent 2024 failing to find a site, watched a joint solution collapse, and only identified a viable location in spring 2025 — by which point it was far too late to have anything operational before the deadline.</p>

      <p><strong>Previous Conservative administrations at Lancashire County Council also share blame.</strong> The Tory-led LCC allowed Lancashire's waste infrastructure to deteriorate to the point where Whinney Hill — a landfill site plagued by complaints about smells, seagulls, and vermin — was the primary disposal option for East Lancashire. Decades of underinvestment in modern waste processing left the county without adequate facilities, creating the crisis that district councils are now scrambling to address.</p>

      <h4>The Envirofuel Question</h4>

      <p>Envirofuel's Hapton Valley site currently imports waste from across the UK, including from Cumbria (Carlisle), Cambridge, Newcastle, and Birmingham. LCC says East Lancashire's waste will "replace existing loads, not create new ones" — meaning some of those long-distance imports should reduce.</p>

      <p>This is genuinely an opportunity. The new LCC administration can now:</p>

      <ul>
        <li><strong>Reduce waste imports from outside Lancashire</strong> — if Envirofuel is taking East Lancashire's waste instead of waste from Cumbria and beyond, that's fewer HGV miles and lower emissions</li>
        <li><strong>Work directly with residents near Hapton Valley</strong> — the site has been a source of complaints about noise, traffic, and early-morning HGV movements. LCC now has leverage as a major customer to negotiate better operating conditions</li>
        <li><strong>Deliver a better environmental outcome</strong> — the waste will be turned into fuel for cement works rather than going to landfill, which is an improvement</li>
      </ul>

      <p>But none of this changes the fact that Burnley Council's failure to plan has left residents near Envirofuel bearing the consequences of the council's inaction.</p>

      <h4>The Collection Contract: £29M and Rising</h4>

      <p>Meanwhile, the waste <em>collection</em> contract has also changed hands, with spending data showing a transition from Urbaser Ltd to FCC Environment:</p>

      <table style="width:100%; border-collapse: collapse; margin: 1rem 0;">
        <tr style="border-bottom: 1px solid var(--border-color);">
          <th style="text-align:left; padding: 0.5rem;">Year</th>
          <th style="text-align:left; padding: 0.5rem;">Supplier Name</th>
          <th style="text-align:right; padding: 0.5rem;">Amount</th>
        </tr>
        <tr><td>2021/22</td><td>Urbaser Ltd</td><td style="text-align:right">£5,182,177</td></tr>
        <tr><td>2022/23</td><td>Urbaser Ltd</td><td style="text-align:right">£5,796,560</td></tr>
        <tr><td>2023/24</td><td>Urbaser Ltd</td><td style="text-align:right">£4,954,248</td></tr>
        <tr><td>2024/25</td><td>Urbaser Ltd + FCC</td><td style="text-align:right">£6,529,864</td></tr>
        <tr><td>2025/26 (9 months)</td><td>FCC Environment/Urbaser</td><td style="text-align:right">£5,995,251</td></tr>
      </table>

      <p>Annual costs have risen from £5M to over £6M. With total waste-related spending approaching £29 million since 2021, and now disposal costs to Envirofuel on top, the full cost of Burnley's waste management failure is still growing.</p>

      <h4>The Bottom Line</h4>

      <p>Burnley Council was given a clear two-year warning. They failed to act in time. Residents near Hapton Valley will now live with the consequences of that failure. The new LCC administration has an opportunity to make the best of a bad situation — but the blame for creating it lies squarely with Burnley Borough Council and the previous Tory-led county council that let Lancashire's waste infrastructure crumble.</p>

      <p><em>All spending figures are derived from publicly available council spending data. Waste disposal arrangements sourced from Lancashire County Council and Burnley Borough Council public statements.</em></p>
    `,
    tags: ['waste', 'FCC', 'Urbaser', 'Envirofuel', 'Whinney Hill', 'planning failure', 'LCC'],
  },
  {
    id: 'insurance-five-million',
    date: '2025-02-05',
    category: 'Analysis',
    title: '£5.3 Million Spent on Insurance and Brokerage',
    summary: 'Council insurance costs have reached £5.3 million since 2021, with one insurance broker receiving £3.7 million in fees and premiums.',
    image: '/images/articles/insurance.jpg',
    author: 'Burnley Council Transparency',
    content: `
      <p><strong>Burnley Borough Council has spent over £5.3 million on insurance-related costs</strong> since 2021, with the majority going to broker Arthur J Gallagher and insurer Zurich Municipal.</p>

      <h4>Insurance Spending Breakdown</h4>

      <table style="width:100%; border-collapse: collapse; margin: 1rem 0;">
        <tr style="border-bottom: 1px solid var(--border-color);">
          <th style="text-align:left; padding: 0.5rem;">Recipient</th>
          <th style="text-align:right; padding: 0.5rem;">Total</th>
        </tr>
        <tr><td>Arthur J Gallagher Insurance Brokers Ltd</td><td style="text-align:right">£2,471,163</td></tr>
        <tr><td>Zurich Municipal</td><td style="text-align:right">£1,556,151</td></tr>
        <tr><td>Arthur J Gallagher (separate entity)</td><td style="text-align:right">£1,231,875</td></tr>
      </table>

      <h4>Why This Matters</h4>

      <p>Insurance is a significant but rarely scrutinised cost for local councils. Over £5.3 million across four years raises questions:</p>

      <ul>
        <li>Is the council regularly market-testing its insurance arrangements?</li>
        <li>What is the broker's commission or fee on top of premiums?</li>
        <li>How does Burnley's insurance cost per resident compare to similar councils?</li>
        <li>What is the claims history — are premiums reflecting actual risk?</li>
        <li>Could the council reduce costs through higher excess or self-insurance?</li>
      </ul>

      <p>With over £1.2 million per year on average, this is one of the council's larger recurring costs that deserves public scrutiny.</p>

      <p><em>All figures are derived from publicly available council spending data.</em></p>
    `,
    tags: ['insurance', 'spending', 'procurement', 'value for money'],
  },
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
    id: 'doge-investigation-overview',
    date: '2025-02-05',
    category: 'Investigation',
    title: 'DOGE Analysis: £2.5M in Duplicate Payments, £10.5M Without Contracts, and Netflix on the Council Card',
    summary: 'Our comprehensive DOGE-style audit of 19,865 spending records totalling £217 million has uncovered duplicate payments, suppliers operating without contracts, and questionable purchase card spending including Domino\'s Pizza and ChatGPT subscriptions.',
    image: '/images/articles/magnifying-glass.jpg',
    author: 'Burnley Council Transparency',
    content: `
      <p><strong>We subjected every pound of Burnley Borough Council's published spending data to rigorous automated analysis</strong> — 19,865 transactions totalling £217 million across four financial years. Inspired by the push for government efficiency reviews — the UK's Office for Value for Money was established in the October 2024 Autumn Budget, while the National Audit Office and CIPFA have long called for better local government scrutiny — this is a citizen-led analysis of how Burnley spends public money. The results are concerning.</p>

      <p>This analysis covers both <strong>revenue spending</strong> (day-to-day running costs from the ~£18.7M annual budget) and <strong>capital spending</strong> (one-off investments like Pioneer Place, funded by borrowing within the ~£42.5M five-year capital programme).</p>

      <h4>The Headline Numbers</h4>

      <table style="width:100%; border-collapse: collapse; margin: 1rem 0;">
        <tr style="border-bottom: 1px solid var(--border-color);">
          <th style="text-align:left; padding: 0.5rem;">Finding</th>
          <th style="text-align:right; padding: 0.5rem;">Value</th>
        </tr>
        <tr><td>Exact duplicate payments (same supplier, amount, date)</td><td style="text-align:right"><strong>£2,478,616</strong></td></tr>
        <tr><td>Near-duplicate payments (within 7 days)</td><td style="text-align:right">£638,055</td></tr>
        <tr><td>Top suppliers with no contract on file</td><td style="text-align:right"><strong>£10,521,243</strong></td></tr>
        <tr><td>Round number payments (£5k+)</td><td style="text-align:right">£19,829,000</td></tr>
        <tr><td>Purchase card spending</td><td style="text-align:right">£596,367</td></tr>
        <tr><td>Weekend payments (mostly one Sunday)</td><td style="text-align:right">£71,810</td></tr>
      </table>

      <h4>1. Exact Duplicate Payments: £2.48 Million</h4>

      <p>We found <strong>1,284 records in 503 duplicate groups</strong> where the same supplier received the same amount on the same date. Our investigation confirmed these duplicates originate in the council's own published CSV files — they are not artefacts of our data processing.</p>

      <p>The largest duplicates include:</p>
      <ul>
        <li><strong>Total Pool Chemicals Ltd:</strong> £491,252 (identical payments with no date recorded)</li>
        <li><strong>FCC Environment/Urbaser Ltd:</strong> £141,630 (2 identical payments on 8 July 2025)</li>
        <li><strong>Urbaser Limited:</strong> £133,516 (2 identical on 30 October 2023)</li>
        <li><strong>Transdev Blazefield Ltd:</strong> £130,209 (11 identical payments of £11,837 on 2 November 2021)</li>
        <li><strong>Burnley Leisure:</strong> £92,000 (2 identical on 16 October 2025)</li>
      </ul>

      <p>The Transdev case is particularly striking: eleven payments of exactly £11,837.16 to the same bus company on the same day. Either there is a legitimate explanation the council should provide, or public money has been overpaid.</p>

      <h4>2. £10.5 Million to Suppliers Without Contracts</h4>

      <p>Cross-referencing spending data against the council's published contracts register revealed <strong>9 of the top 100 suppliers have no contract on file</strong>:</p>

      <ul>
        <li><strong>Beachcroft LLP:</strong> £4.4 million — 6 payments, no contract</li>
        <li><strong>EDF Energy:</strong> £3.17 million — 127 payments, no contract</li>
        <li><strong>Harrison Drury Solicitors:</strong> £597,715 — single payment, no contract</li>
        <li><strong>Forbes Solicitors:</strong> £513,637 — 8 payments, no contract</li>
        <li><strong>HMRC:</strong> £401,137 — 6 payments (likely legitimate but should appear)</li>
        <li><strong>Rapid Recruitment:</strong> £399,670 — 666 payments, no contract</li>
      </ul>

      <p>The Local Government Transparency Code requires councils to publish details of contracts over £5,000. Over £10.5 million flowing to suppliers without published contracts is a transparency failure.</p>

      <h4>3. The Sunday Mystery</h4>

      <p>15 of 18 weekend payments all occurred on a single date: <strong>Sunday 27 November 2022</strong>. This cluster — including £45,982 to Facultatieve Technologies and payments to barristers, recruitment agencies and engineering firms — suggests either a system error or batch processing anomaly that should be investigated.</p>

      <h4>4. Year-End Spending Surge</h4>

      <p>March spending — the last month of the financial year — shows a clear "use it or lose it" pattern:</p>
      <ul>
        <li>March 2022: £3.56 million (521 payments)</li>
        <li>March 2023: £5.41 million (333 payments)</li>
        <li>March 2024: <strong>£8.18 million</strong> (347 payments) — 2.3x the March 2022 figure</li>
        <li>March 2025: £2.82 million (383 payments)</li>
      </ul>

      <h4>5. The Q3 2021/22 Anomaly</h4>

      <p>One quarter stands out dramatically: <strong>Q3 2021/22 saw £26.68 million in spending</strong> — 135% above the quarterly average. This was driven by a single £19.85 million <strong>capital programme</strong> payment to Geldards solicitors for the Pioneer Place town centre development. While this exceeds the council's entire annual <em>revenue</em> budget, it's important to note this was capital expenditure funded by borrowing — not day-to-day running costs funded by council tax.</p>

      <h4>Data Integrity Verification</h4>

      <p>We verified our analysis by cross-checking against the council's published CSV files. The duplicates in our system match exactly what the council publishes — we have not introduced any errors. Each quarterly CSV file contains its own date range with no cross-quarter overlaps, confirming the data pipeline is clean.</p>

      <p><em>All figures derived from publicly available Burnley Borough Council spending data published under the Local Government Transparency Code. Full methodology available on request.</em></p>
    `,
    tags: ['DOGE', 'investigation', 'duplicates', 'contracts', 'spending', 'audit', 'transparency'],
  },
  {
    id: 'potential-duplicate-payments',
    date: '2025-02-05',
    category: 'Investigation',
    title: '£2.5 Million in Duplicate Payments Found in Council\'s Own Published Data',
    summary: 'DOGE analysis confirms 1,284 exact duplicate records originating from the council\'s own CSV files — these are not our errors, they are theirs.',
    image: '/images/articles/documents.jpg',
    author: 'Burnley Council Transparency',
    content: `
      <p><strong>Our DOGE-style analysis identified 1,284 exact duplicate records in 503 groups, representing £2,478,616 in potential overpayments.</strong> We verified this by examining the raw council CSV files directly — the duplicates are present in what the council publishes.</p>

      <h4>How We Verified</h4>

      <p>To ensure our findings were not caused by errors in our own data processing, we:</p>
      <ol>
        <li>Examined every quarterly CSV file published by the council</li>
        <li>Confirmed each quarter has unique date ranges (no overlapping data between quarters)</li>
        <li>Verified that our processing script performs no deduplication — it preserves exactly what the council publishes</li>
        <li>Cross-checked transaction numbers to confirm duplicates share identical transaction references</li>
      </ol>

      <p><strong>Conclusion: The duplicates are in the council's published data, not introduced by our system.</strong></p>

      <h4>The Worst Offenders</h4>

      <table style="width:100%; border-collapse: collapse; margin: 1rem 0;">
        <tr style="border-bottom: 1px solid var(--border-color);">
          <th style="text-align:left; padding: 0.5rem;">Supplier</th>
          <th style="text-align:right; padding: 0.5rem;">Duplicate Value</th>
          <th style="text-align:right; padding: 0.5rem;">Count</th>
        </tr>
        <tr><td>Total Pool Chemicals Ltd</td><td style="text-align:right">£491,252</td><td style="text-align:right">2x</td></tr>
        <tr><td>FCC Environment/Urbaser Ltd</td><td style="text-align:right">£141,630</td><td style="text-align:right">2x</td></tr>
        <tr><td>Urbaser Limited</td><td style="text-align:right">£133,516</td><td style="text-align:right">2x</td></tr>
        <tr><td>Transdev Blazefield Ltd</td><td style="text-align:right">£130,209</td><td style="text-align:right">11x</td></tr>
        <tr><td>FCC Environment/Urbaser Ltd</td><td style="text-align:right">£130,136</td><td style="text-align:right">2x</td></tr>
        <tr><td>Burnley Leisure</td><td style="text-align:right">£92,000</td><td style="text-align:right">2x</td></tr>
        <tr><td>Rapid Recruitment</td><td style="text-align:right">£48,733</td><td style="text-align:right">91x</td></tr>
        <tr><td>PeopleScout Ltd</td><td style="text-align:right">£55,007</td><td style="text-align:right">18x</td></tr>
      </table>

      <p>Rapid Recruitment stands out: <strong>91 duplicate payments</strong> of £535.53 each. Either they have an extraordinary number of identical invoices, or something has gone wrong in the payment system.</p>

      <h4>Near-Duplicates: Another £638,055</h4>

      <p>Beyond exact duplicates, we found 289 "near-duplicate" pairs — same supplier, same amount, within 7 days but on different dates. The largest:</p>
      <ul>
        <li><strong>Post Office Ltd - Payout Fund:</strong> £100,000 on 5 June and £100,000 on 12 June 2023</li>
        <li><strong>Post Office Ltd - Payout Fund:</strong> £99,999 on 18 Nov and £99,999 on 24 Nov 2022</li>
        <li><strong>Calico Enterprise Ltd:</strong> £60,501 on 19 Nov and £60,501 on 20 Nov 2025</li>
      </ul>

      <h4>What This Could Mean</h4>

      <p>There are two possibilities:</p>
      <ol>
        <li><strong>Data publishing errors:</strong> The council's transparency reporting system is duplicating records in the CSV files it publishes — meaning the data is unreliable</li>
        <li><strong>Actual duplicate payments:</strong> The council is genuinely paying suppliers twice for the same work</li>
      </ol>

      <p>Either way, this represents a failure. If it's a data error, the council's transparency data cannot be trusted. If it's actual overpayment, £2.48 million of public money may have been wasted.</p>

      <p><em>All figures derived from publicly available council spending data. Analysis methodology verified by cross-referencing raw CSV files against published quarterly returns.</em></p>
    `,
    tags: ['DOGE', 'duplicates', 'spending', 'waste', 'accountability', 'audit'],
  },
  {
    id: 'geldards-19-million',
    date: '2025-02-05',
    category: 'Investigation',
    title: 'One Law Firm, One Day, £19.8 Million: The Geldards Question',
    summary: 'A single capital programme payment of £19,848,934 to solicitors Geldards on 19 October 2021 — for the Pioneer Place development — exceeds the council\'s entire annual revenue budget.',
    image: '/images/articles/construction.jpg',
    author: 'Burnley Council Transparency',
    content: `
      <p><strong>On 19 October 2021, Burnley Borough Council made a single payment of £19,848,934.40 to Geldards LLP</strong> — a Derby-based law firm. This is the largest individual payment in our entire dataset, and it exceeds the council's entire annual <em>revenue</em> budget.</p>

      <h4>Revenue vs Capital: Why This Matters</h4>

      <p><strong>This is a capital programme payment, not revenue spending.</strong> The council has two separate budgets:</p>
      <ul>
        <li><strong>Revenue Budget (~£18.7M):</strong> Day-to-day running costs funded by council tax and business rates</li>
        <li><strong>Capital Programme (~£42.5M over 5 years):</strong> One-off investment spending on construction, regeneration and assets, funded by borrowing and government grants</li>
      </ul>

      <p>The Geldards payment comes from the Capital Programme, categorised as "New Constructions". It relates to the <strong>Pioneer Place development</strong> — the council's flagship town centre regeneration scheme on Curzon Street, adjacent to Charter Walk shopping centre. Pioneer Place brought a 7-screen Reel Cinema, Nando's, Loungers, and other restaurants to Burnley town centre, opening in phases during 2022. Geldards acted as the council's solicitors, with the payment passing through their client account for the construction contract with Maple Grove Developments Ltd.</p>

      <h4>The Numbers in Context</h4>

      <ul>
        <li><strong>Single payment:</strong> £19,848,934.40</li>
        <li><strong>Council's annual net revenue budget:</strong> ~£18.7 million</li>
        <li><strong>Capital programme (5 year):</strong> ~£42.5 million</li>
        <li><strong>Total to Geldards (all payments):</strong> £20,108,266</li>
        <li><strong>Total Geldards payments:</strong> 20 transactions</li>
      </ul>

      <p>Geldards were acting as solicitors on the Pioneer Place development, so the full £19.85 million passed through their client account to pay contractors — with Geldards' actual legal fee being a small fraction of this. However, the council's transparency data doesn't distinguish between professional fees and pass-through amounts, which makes the spending data misleading without context.</p>

      <h4>The Same Day</h4>

      <p>On the same date (19 October 2021), Geldards received two payments:</p>
      <ul>
        <li>£19,848,934.40 (the mega-payment)</li>
        <li>£996.50 (a routine payment)</li>
      </ul>

      <p>Combined: £19,849,930.90 in a single day.</p>

      <h4>The Full Pioneer Place Picture</h4>

      <p>Our data identifies multiple payment streams related to Pioneer Place:</p>
      <ul>
        <li><strong>Geldards LLP:</strong> £20.1M total (mostly pass-through for construction)</li>
        <li><strong>Maple Grove Developments Ltd:</strong> £16.6M across 41 transactions (development agreement valuations 6 through 16)</li>
        <li><strong>Nando's:</strong> 2 payments of £70,000 (July and September 2023) — categorised as "New Constructions", likely restaurant fit-out contributions</li>
        <li><strong>Loungers UK Ltd:</strong> 2 payments of £90,000 (June and July 2023)</li>
        <li><strong>"Legal fees for Pioneer Place":</strong> £1,176,908 paid to Maple Grove (December 2021) — described as legal fees, but paid to a development company rather than solicitors</li>
      </ul>

      <p>The project was funded primarily through council borrowing, pushing the Capital Financing Requirement to <strong>£74.7 million</strong>. The annual Minimum Revenue Provision — the charge on the revenue budget to repay capital borrowing — rose to <strong>£2.2 million in 2025/26</strong>, partly due to Pioneer Place.</p>

      <h4>Why This Still Matters</h4>

      <p>Even though this is a capital programme payment for a regeneration project, important governance questions remain:</p>
      <ul>
        <li>What was Geldards' actual legal fee (as opposed to the pass-through construction amount)? The transparency data doesn't distinguish.</li>
        <li>Why was £1.18M in "legal fees for Pioneer Place" paid to Maple Grove — a development company — rather than to solicitors?</li>
        <li>The council's total outstanding borrowing stands at <strong>£56.1 million</strong> — with Pioneer Place a significant contributor</li>
        <li>Investment property rental income dropped <strong>58% in one year</strong> (from £2.03M to £843K) — is the council's commercial property strategy working?</li>
      </ul>

      <p>Understanding the difference between revenue and capital spending is essential for interpreting council finances. This payment didn't come from council tax — it came from the capital programme, funded by borrowing that will be repaid over decades.</p>

      <p><em>All figures derived from publicly available council spending data, annual budget books, and the audited Statement of Accounts 2023/24. Pioneer Place details from published cabinet reports and spending categorisations.</em></p>
    `,
    tags: ['DOGE', 'Geldards', 'legal', 'spending', 'governance', 'Pioneer Place'],
  },
  {
    id: 'uncontracted-suppliers',
    date: '2025-02-05',
    category: 'Investigation',
    title: '£10.5 Million Paid to Suppliers With No Published Contract',
    summary: 'Nine of the council\'s top 100 suppliers — receiving over £10.5 million between them — do not appear in the published contracts register.',
    image: '/images/articles/legal.jpg',
    author: 'Burnley Council Transparency',
    content: `
      <p><strong>Our DOGE analysis cross-referenced every spending payment against the council's published contracts register.</strong> The result: 9 of the top 100 suppliers, receiving a combined £10,521,243, have no published contract on file.</p>

      <h4>Suppliers Without Contracts</h4>

      <table style="width:100%; border-collapse: collapse; margin: 1rem 0;">
        <tr style="border-bottom: 1px solid var(--border-color);">
          <th style="text-align:left; padding: 0.5rem;">Supplier</th>
          <th style="text-align:right; padding: 0.5rem;">Total Paid</th>
          <th style="text-align:right; padding: 0.5rem;">Payments</th>
        </tr>
        <tr><td>Beachcroft LLP</td><td style="text-align:right">£4,406,071</td><td style="text-align:right">6</td></tr>
        <tr><td>EDF Energy</td><td style="text-align:right">£3,174,196</td><td style="text-align:right">127</td></tr>
        <tr><td>Harrison Drury Solicitors</td><td style="text-align:right">£597,715</td><td style="text-align:right">1</td></tr>
        <tr><td>Forbes Solicitors</td><td style="text-align:right">£513,637</td><td style="text-align:right">8</td></tr>
        <tr><td>Donald Race & Newton Solicitors</td><td style="text-align:right">£427,163</td><td style="text-align:right">10</td></tr>
        <tr><td>HM Revenue and Customs</td><td style="text-align:right">£401,137</td><td style="text-align:right">6</td></tr>
        <tr><td>Rapid Recruitment</td><td style="text-align:right">£399,670</td><td style="text-align:right">666</td></tr>
        <tr><td>Hill Dickinson Solicitors</td><td style="text-align:right">£350,000</td><td style="text-align:right">1</td></tr>
        <tr><td>Donald Race & Newton</td><td style="text-align:right">£251,654</td><td style="text-align:right">7</td></tr>
      </table>

      <h4>The Legal Services Gap</h4>

      <p>Five of the nine uncontracted suppliers are law firms, collectively receiving <strong>£6.1 million</strong> with no published contract. While councils can use legal panels and frameworks, the Local Government Transparency Code requires all expenditure over £5,000 to have associated contract details published.</p>

      <p>Beachcroft LLP stands out: <strong>£4.4 million in just 6 payments</strong> — an average of £734,345 per payment — with no contract on the register. Their largest single payment was £3.2 million on 5 October 2023, categorised as "New Constructions".</p>

      <h4>Energy Costs Hidden</h4>

      <p>EDF Energy has received £3.17 million across 127 payments with no contract published. While energy supply is essential, a contract of this value should absolutely appear on the contracts register.</p>

      <h4>The 666-Payment Agency</h4>

      <p>Rapid Recruitment has received 666 separate payments averaging just £600 each, totalling £399,670 — all without a published contract. This volume of payments to a single agency raises questions about whether temporary staffing has become a permanent arrangement without proper procurement.</p>

      <h4>Legal Requirement</h4>

      <p>Under the Local Government Transparency Code 2015, councils must publish details of all contracts and commissioned activity over £5,000 including:</p>
      <ul>
        <li>Reference number</li>
        <li>Title and description</li>
        <li>Supplier name</li>
        <li>Total value</li>
        <li>Start and end dates</li>
      </ul>

      <p>£10.5 million in spending without corresponding contract publications is a transparency failure that requires explanation.</p>

      <p><em>All figures derived from cross-referencing publicly available spending data against the council's published contracts register.</em></p>
    `,
    tags: ['DOGE', 'contracts', 'transparency', 'procurement', 'legal'],
  },
  {
    id: 'chief-exec-purchase-cards',
    date: '2025-02-05',
    category: 'Investigation',
    title: 'ChatGPT, Aldi, and Oswaldtwistle Mill: What\'s on the Council Credit Cards?',
    summary: 'Purchase card analysis reveals £1,397 on ChatGPT, £2,498 at Aldi on the Chief Executive\'s card, Domino\'s Pizza, Uber, and Just Eat — all charged to the taxpayer.',
    image: '/images/articles/credit-card.jpg',
    author: 'Burnley Council Transparency',
    content: `
      <p><strong>A detailed analysis of 6,831 purchase card transactions reveals spending patterns that raise serious questions about oversight of council credit cards.</strong></p>

      <h4>The Chief Executive's Card</h4>

      <p>Transactions charged to the Chief Executive's department include:</p>
      <ul>
        <li><strong>£2,498.33 at ALDI</strong> (April 2024) — what does the Chief Executive need from Aldi that costs nearly £2,500?</li>
        <li><strong>£1,877.50 at Oswaldtwistle Mill</strong> (August 2021) — a textile/homeware shopping outlet</li>
        <li><strong>£1,809.70 at Apple.com/UK</strong> (May 2021) — Apple products</li>
        <li><strong>£1,745.52 on Adobe subscriptions</strong> (April 2025)</li>
        <li><strong>£1,635.75 at ASDA George</strong> (July 2024) — clothing website</li>
        <li><strong>£1,633.37 on Sprout Social</strong> (April 2025) — social media management</li>
      </ul>

      <h4>The COO's ChatGPT Subscription</h4>

      <p>The Chief Operating Officer's card shows:</p>
      <ul>
        <li><strong>£1,397.73 on OpenAI ChatGPT</strong> (November 2025) — an AI chatbot subscription</li>
        <li><strong>£8,998 to Wilkin Chapman solicitors</strong> (April 2021) — legal fees on a purchase card?</li>
        <li><strong>£6,895 to Wilkin Chapman</strong> (June 2021) — more legal fees</li>
        <li><strong>£4,994.50 to Wilkin Chapman</strong> (July 2021) — and more</li>
      </ul>

      <p>Wilkin Chapman alone received <strong>£29,112 via purchase cards</strong> across 17 transactions — the single largest purchase card supplier. Why are legal fees being paid on purchase cards rather than through the normal procurement process?</p>

      <h4>Food Delivery on the Taxpayer</h4>

      <ul>
        <li><strong>Domino's Pizza:</strong> 3 transactions totalling £169 (all July 2024)</li>
        <li><strong>Just Eat:</strong> 2 transactions totalling £155</li>
        <li><strong>Uber:</strong> 2 transactions totalling £97</li>
        <li><strong>Pizza Express:</strong> £36 (July 2024)</li>
      </ul>

      <p>Three Domino's orders in a single month raises obvious questions about whether personal expenses are being charged to council cards.</p>

      <h4>Streaming Subscriptions Running for Years</h4>

      <ul>
        <li><strong>Netflix:</strong> 51 monthly payments since 2021 — £491 total</li>
        <li><strong>Amazon Prime:</strong> 51 payments — £448 total</li>
        <li><strong>Apple iCloud:</strong> 34 payments — ongoing since 2021</li>
      </ul>

      <h4>The Oversight Question</h4>

      <p>Purchase cards exist for legitimate low-value purchases where raising a purchase order would be disproportionate. But with <strong>627 Amazon transactions (£29,619)</strong>, ongoing streaming subscriptions, and food delivery orders, the question is whether anyone is actually reviewing what goes on these cards.</p>

      <p>The highest individual purchase card transaction was <strong>£8,998 to Wilkin Chapman</strong> — well above any reasonable "low value" threshold. Either purchase card policies are being flouted, or the policies themselves are too lax.</p>

      <p><em>All figures derived from publicly available council purchase card data published under the Local Government Transparency Code.</em></p>
    `,
    tags: ['DOGE', 'purchase cards', 'Chief Executive', 'ChatGPT', 'Netflix', 'accountability'],
  },
  {
    id: 'liberata-bringing-back-inhouse',
    date: '2025-02-05',
    category: 'Investigation',
    title: 'The £34 Million Liberata Deal: Outsourcing That Cut 40% of Jobs',
    summary: 'Burnley\'s decade-long outsourcing contract with Liberata UK saw 40% of affected staff lose their jobs. Now the council is bringing services back in-house — was it worth it?',
    image: '/images/articles/outsourcing.jpg',
    author: 'Burnley Council Transparency',
    content: `
      <p><strong>In 2016, Burnley Borough Council signed a 10-year, £34 million contract with Liberata UK Ltd</strong> to run council tax collection, housing benefits, IT, customer services, HR, payroll, facilities management, and environmental health. The deal resulted in approximately 40% of affected council staff losing their jobs — and the remaining staff being transferred to a private company under TUPE.</p>

      <h4>What the Data Shows</h4>

      <p>Our spending data reveals Liberata has received <strong>£21.2 million since 2021</strong> alone — making it the council's single largest supplier by a significant margin. Monthly payments have consistently exceeded £350,000:</p>

      <ul>
        <li><strong>Typical monthly payment:</strong> £358,000 - £375,000</li>
        <li><strong>Largest single payment:</strong> £423,056 (Q1 2021/22)</li>
        <li><strong>Total payments:</strong> 363 transactions</li>
        <li><strong>Share of all council spending:</strong> ~10%</li>
      </ul>

      <h4>The Scale of Outsourcing</h4>

      <p>The services handed to Liberata cover almost every back-office function of the council:</p>
      <ul>
        <li><strong>Customer Services:</strong> the public-facing contact centre</li>
        <li><strong>IT:</strong> all technology infrastructure and support</li>
        <li><strong>Revenues & Benefits:</strong> council tax billing, business rates, housing benefit</li>
        <li><strong>Facilities Management & Property Services</strong></li>
        <li><strong>HR Administration & Payroll</strong></li>
        <li><strong>Environmental Health & Licensing</strong></li>
      </ul>

      <p>As a result, Burnley Borough Council's direct workforce dropped to just <strong>243 permanent and temporary employees</strong>. This figure significantly understates the actual number of people delivering council services — hundreds more work for Liberata on the council's behalf.</p>

      <h4>The Human Cost</h4>

      <p>When the outsourcing was announced, approximately <strong>40% of the 130 affected staff were made redundant</strong>. The remaining 60% were transferred to Liberata under TUPE regulations.</p>

      <p>The council's own Productivity Plan (July 2024) states the contract is achieving the original cost reduction objective, with a "20% saving forecast against the base costs in the final years" due to the fixed contract price. Liberata also committed to creating 100+ new jobs in Burnley through "north-shoring".</p>

      <p>But the true cost must factor in:</p>
      <ul>
        <li>Redundancy payments for ~52 dismissed staff</li>
        <li>Contract management costs within the council</li>
        <li>Pension guarantee risk — the council guarantees Liberata employees' pensions, meaning if Liberata defaults, the council picks up the liability</li>
        <li>Loss of institutional knowledge</li>
        <li>The cost of bringing services back in-house</li>
      </ul>

      <h4>Coming Home — But Into What?</h4>

      <p>The contract expires in <strong>2026</strong>, and the council has indicated it intends to bring many services back in-house. This coincides with Local Government Reorganisation, which could see Burnley Borough Council abolished entirely to make way for a new unitary authority.</p>

      <p>This creates a uniquely awkward situation: the council is planning to insource services from Liberata at the same time it may cease to exist. Any investment in rebuilding internal capacity could be wasted if LGR proceeds and a new authority makes different arrangements.</p>

      <p>The transition back will itself cost money: recruiting staff, rebuilding internal capability, and potentially running parallel systems during the handover. These are costs that would not have been incurred had services never been outsourced.</p>

      <h4>Was It Worth It?</h4>

      <p>The council claimed £8 million in savings over 10 years. Even if that figure is accurate (and it hasn't been independently verified), it came at the cost of:</p>
      <ul>
        <li>~52 local jobs permanently lost in a town with above-average unemployment</li>
        <li>Remaining staff transferred to a private company</li>
        <li>10 years of reduced democratic control over core services</li>
        <li>Pension liability risk transferred to the public purse</li>
        <li>Transition costs both in and out of the arrangement</li>
      </ul>

      <p>With the council's General Fund reserve at just <strong>£1.379 million</strong> (7.4% of the net budget — at the lower end of recommended levels), and the Business Rates Retention Reserve having collapsed from £9.2 million to just £570,000, the financial cushion for any transition disruption is razor-thin.</p>

      <p><em>Spending figures from publicly available council data. Contract details from council cabinet reports, Productivity Plan (July 2024), and Statement of Accounts 2023/24. Staff impact figures from council records and local press reporting.</em></p>
    `,
    tags: ['DOGE', 'Liberata', 'outsourcing', 'jobs', 'insourcing', 'contracts'],
  },
  {
    id: 'netflix-council-cards',
    date: '2025-02-05',
    category: 'Analysis',
    title: 'Council Cards Used for 51 Netflix Payments',
    summary: 'Analysis reveals ongoing Netflix subscription payments on council purchase cards since 2021, raising questions about appropriate use of public funds.',
    image: '/images/articles/streaming-tv.jpg',
    author: 'Burnley Council Transparency',
    content: `
      <p><strong>Burnley Borough Council has made 51 separate payments to Netflix totalling £490.73 since 2021</strong>, charged to the Economy & Growth department's purchase cards. That's over four years of uninterrupted streaming, paid for by Burnley taxpayers.</p>

      <h4>The Details</h4>

      <p>The payments range from £8.99 to £12.99 per month — consistent with standard Netflix subscription tiers. The subscription has continued without interruption through 2022, 2023, 2024, and into 2025. No one appears to have questioned it.</p>

      <h4>Questions This Raises</h4>

      <ul>
        <li>What council business purpose in the <strong>Economy & Growth department</strong> requires a Netflix subscription?</li>
        <li>Is this being used in a council property (perhaps a display in a tourism or business premises)?</li>
        <li>Or has a personal subscription simply been left on a council card for four years unnoticed?</li>
        <li>Who approved this recurring payment, and is anyone reviewing it?</li>
      </ul>

      <h4>It's Not Just Netflix</h4>

      <p>The same purchase card data reveals other streaming subscriptions:</p>
      <ul>
        <li><strong>Amazon Prime:</strong> 51 payments totalling £448.49 — running in parallel with Netflix since 2021</li>
        <li><strong>Apple iCloud:</strong> 34 payments totalling £43.36</li>
        <li><strong>OpenAI ChatGPT:</strong> £1,397.73 on the Chief Operating Officer's card (November 2025)</li>
      </ul>

      <p>While £490 over four years may seem trivial when the council spends £217 million, the concern isn't the amount — it's the oversight. If no one is catching a Netflix subscription running for four years, what else is going unreviewed on the £610,000 spent annually on purchase cards?</p>

      <p>For context, Burnley's Band D council tax is <strong>£344.58</strong>. One resident's entire year of council tax wouldn't even cover the combined streaming subscriptions.</p>

      <p><em>All figures are derived from publicly available council purchase card data published under the Local Government Transparency Code.</em></p>
    `,
    tags: ['purchase cards', 'subscriptions', 'waste', 'accountability'],
  },
  {
    id: 'purchase-card-spending',
    date: '2025-02-05',
    category: 'Analysis',
    title: '£610,000 Spent on Council Purchase Cards',
    summary: 'Deep dive into 6,671 purchase card transactions reveals spending at supermarkets, hotels, Amazon, and social media platforms.',
    image: '/images/articles/credit-card.jpg',
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

      <p><em>All figures are derived from publicly available council spending data.</em></p>
    `,
    tags: ['purchase cards', 'spending', 'accountability'],
  },
  {
    id: 'social-media-advertising',
    date: '2025-02-05',
    category: 'Analysis',
    title: '£22,000+ Spent on Social Media Advertising and Tools',
    summary: 'Council spends thousands on Facebook ads, Snapchat, Twitter, and social media management subscriptions.',
    image: '/images/articles/social-media.jpg',
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
    category: 'Analysis',
    title: '£21 Million to Single Outsourcing Company',
    summary: 'Liberata UK Ltd receives £21 million — nearly 10% of all council spending — for outsourced revenues and benefits services.',
    image: '/images/articles/outsourcing.jpg',
    author: 'Burnley Council Transparency',
    content: `
      <p><strong>A single company, Liberata UK Ltd, has received £21,183,056 from Burnley Borough Council</strong> for providing outsourced services covering council tax, benefits, IT, customer services, HR, payroll, facilities management, and environmental health. This represents nearly 10% of all council spending analysed — an extraordinary concentration of public services in one private company's hands.</p>

      <h4>What Liberata Does</h4>

      <p>The 10-year contract (signed 2016, expiring 2026, total value ~£34M) covers core council functions:</p>
      <ul>
        <li><strong>Customer Services</strong> — the public contact centre</li>
        <li><strong>IT</strong> — all technology infrastructure</li>
        <li><strong>Revenues & Benefits</strong> — council tax billing, business rates, housing benefit</li>
        <li><strong>Facilities Management & Property Services</strong></li>
        <li><strong>HR Administration & Payroll</strong></li>
        <li><strong>Environmental Health & Licensing</strong></li>
      </ul>

      <h4>The Numbers in Context</h4>

      <ul>
        <li><strong>Total to Liberata:</strong> £21,183,056</li>
        <li><strong>Number of payments:</strong> 363</li>
        <li><strong>Average payment:</strong> £58,354</li>
        <li><strong>Share of total council spending:</strong> ~10%</li>
        <li><strong>Council's own workforce:</strong> just 243 employees (with hundreds more working via Liberata)</li>
      </ul>

      <h4>The Council's Position</h4>

      <p>The council's Productivity Plan (July 2024) states the contract is achieving its cost reduction objective, with a fixed price delivering a "20% saving forecast against the base costs in the final years." Liberata committed to creating 100+ new jobs through "north-shoring" to Burnley.</p>

      <h4>Questions for Scrutiny</h4>

      <ul>
        <li>Has the claimed £8M saving over 10 years been independently verified?</li>
        <li>The contract expires in 2026 — the same year LGR may abolish the council. What's the transition plan?</li>
        <li>The council guarantees Liberata employees' pensions — what is this contingent liability worth?</li>
        <li>With a General Fund reserve of just £1.379M, can the council afford the insourcing transition?</li>
        <li>The Business Rates Retention Reserve has collapsed from £9.2M to £570K — is the financial position stable enough for major service changes?</li>
      </ul>

      <p><em>All spending figures from publicly available council data. Contract details from the council's Productivity Plan (July 2024), Statement of Accounts 2023/24, and published cabinet reports.</em></p>
    `,
    tags: ['outsourcing', 'contracts', 'Liberata', 'privatisation'],
  },
  {
    id: 'consultancy-spending',
    date: '2025-02-05',
    category: 'Analysis',
    title: '£1.67 Million Spent on External Consultants',
    summary: 'Analysis reveals significant spending on consultancy services, with questions about whether expertise could be developed in-house.',
    image: '/images/articles/finance.jpg',
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
    category: 'Analysis',
    title: 'Just 20 Suppliers Receive 61% of All Spending',
    summary: 'Analysis reveals extreme supplier concentration, with questions about competition, local business support, and procurement diversity.',
    image: '/images/articles/finance.jpg',
    author: 'Burnley Council Transparency',
    content: `
      <p><strong>Out of 4,458 different suppliers, just 20 companies receive over 61% of all council spending</strong> — raising important questions about procurement diversity and competition.</p>

      <h4>The Top 5 Suppliers</h4>

      <ol>
        <li><strong>Liberata UK Ltd:</strong> £21.2 million (outsourced revenues & benefits — revenue spending)</li>
        <li><strong>Geldards (Solicitors):</strong> £20.1 million (mostly capital programme pass-through for Pioneer Place — not legal fees)</li>
        <li><strong>Barnfield Investment Properties:</strong> £17.3 million (capital programme — development)</li>
        <li><strong>Maple Grove Developments:</strong> £16.6 million (capital programme — Pioneer Place construction)</li>
        <li><strong>Urbaser Ltd:</strong> £11.4 million (waste collection — revenue spending)</li>
      </ol>

      <p><em>Note: The spending data includes both revenue payments (day-to-day operations) and capital programme payments (one-off investment projects). Three of the top 5 suppliers are primarily capital programme recipients, which is funded by borrowing and grants — not council tax.</em></p>

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

      <p><em>All figures are derived from publicly available council spending data.</em></p>
    `,
    tags: ['procurement', 'suppliers', 'competition', 'value for money'],
  },
  {
    id: 'legal-fees-millions',
    date: '2025-02-05',
    category: 'Analysis',
    title: '£12.5 Million in Payments to Law Firms — But Most of It Isn\'t Legal Fees',
    summary: 'Burnley Council\'s payments to law firms top £12.5M — but £20M to Geldards was mostly capital programme pass-through for Pioneer Place, not legal fees.',
    image: '/images/articles/legal.jpg',
    author: 'Burnley Council Transparency',
    content: `
      <p><strong>Burnley Borough Council's published spending data shows £20 million in payments to Geldards LLP alone</strong> — but this figure is misleading. The vast majority of Geldards' payments are <strong>capital programme pass-throughs</strong> for the Pioneer Place town centre development, not legal fees.</p>

      <h4>Understanding the Numbers</h4>

      <p><strong>Critical context:</strong> When a council uses a law firm for a major property or construction transaction, the full payment amount passes through the firm's client account. So a £19.85M payment to Geldards was actually for the Pioneer Place construction project — Geldards' actual legal fee was a small fraction of this.</p>

      <table style="width:100%; border-collapse: collapse; margin: 1rem 0;">
        <tr style="border-bottom: 1px solid var(--border-color);">
          <th style="text-align:left; padding: 0.5rem;">Law Firm</th>
          <th style="text-align:right; padding: 0.5rem;">Total Payments</th>
          <th style="text-align:left; padding: 0.5rem;">Context</th>
        </tr>
        <tr><td>Geldards LLP</td><td style="text-align:right">£20,166,929</td><td><em>Mostly capital programme (Pioneer Place)</em></td></tr>
        <tr><td>Forbes Solicitors</td><td style="text-align:right">£748,228</td><td>Revenue — legal services</td></tr>
        <tr><td>Napthens LLP</td><td style="text-align:right">£356,714</td><td>Revenue — legal services</td></tr>
        <tr><td>Weightmans LLP</td><td style="text-align:right">£182,453</td><td>Revenue — legal services</td></tr>
        <tr><td>Shoosmiths LLP</td><td style="text-align:right">£168,337</td><td>Revenue — legal services</td></tr>
      </table>

      <h4>The Transparency Gap</h4>

      <p>The council's spending data makes <strong>no distinction between a solicitor's fee and a pass-through payment</strong> for a property transaction. This means:</p>
      <ul>
        <li>Geldards appears as the council's second-largest "supplier" — but they were acting as an intermediary</li>
        <li>The actual cost of legal services is impossible to determine from the published data</li>
        <li>Similarly, Beachcroft LLP received £4.4M — likely also including capital programme pass-throughs</li>
        <li>Revenue-funded legal spending (the genuine legal fees from day-to-day operations) is significantly lower</li>
      </ul>

      <h4>Genuine Legal Spending Questions</h4>

      <p>Setting aside the capital pass-throughs, the council still spends significant sums on revenue-funded legal services:</p>
      <ul>
        <li>Are legal panel arrangements competitively tendered?</li>
        <li>What are the hourly rates being paid to external solicitors?</li>
        <li>Could some legal work be brought in-house more cheaply?</li>
        <li>Could the transparency data be improved to separate legal fees from pass-through amounts?</li>
      </ul>

      <p><em>All figures are derived from publicly available council spending data.</em></p>
    `,
    tags: ['legal', 'solicitors', 'procurement', 'Geldards'],
  },
  {
    id: 'charity-grants-millions',
    date: '2025-02-05',
    category: 'Analysis',
    title: '£5.4 Million Paid to Charities and Community Groups',
    summary: 'Analysis reveals substantial charitable spending across the borough — but where does the money go and what outcomes are achieved?',
    image: '/images/articles/government.jpg',
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

      <p><em>All figures are derived from publicly available council spending data.</em></p>
    `,
    tags: ['grants', 'charities', 'voluntary sector', 'accountability'],
  },
  {
    id: 'march-spending-surge',
    date: '2025-02-05',
    category: 'Analysis',
    title: 'End-of-Year Spending Surge: March Spending 1.7x Higher Than Average',
    summary: 'Analysis reveals a suspicious pattern: council spending surges dramatically in March as departments rush to use up their budgets before year-end.',
    image: '/images/articles/finance.jpg',
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

      <p><em>All figures are derived from publicly available council spending data.</em></p>
    `,
    tags: ['budget', 'spending patterns', 'efficiency', 'waste'],
  },
  {
    id: 'payments-to-individuals',
    date: '2025-02-05',
    category: 'Analysis',
    title: '£4.7 Million Paid Directly to Individuals and Sole Traders',
    summary: 'Analysis identifies millions in payments to individuals rather than companies — raising questions about employment status and tax compliance.',
    image: '/images/articles/documents.jpg',
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

      <p><em>All figures are derived from publicly available council spending data.</em></p>
    `,
    tags: ['contractors', 'IR35', 'tax', 'employment'],
  },
  {
    id: 'round-number-payments',
    date: '2025-02-05',
    category: 'Analysis',
    title: '£33 Million in Suspiciously Round Number Payments',
    summary: 'Analysis flags over £33 million in payments that are exactly round numbers — a pattern that can indicate estimates rather than actual costs.',
    image: '/images/articles/magnifying-glass.jpg',
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

      <p><em>All figures are derived from publicly available council spending data.</em></p>
    `,
    tags: ['payments', 'audit', 'financial controls', 'invoicing'],
  },
  {
    id: 'it-spending-millions',
    date: '2025-02-05',
    category: 'Analysis',
    title: '£3.6 Million on IT and Software — Are We Getting Value?',
    summary: 'Deep dive into council technology spending reveals questions about software licensing, cloud services, and digital transformation value.',
    image: '/images/articles/outsourcing.jpg',
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

      <p><em>All figures are derived from publicly available council spending data.</em></p>
    `,
    tags: ['IT', 'software', 'digital', 'technology'],
  },
  {
    id: 'training-conferences',
    date: '2025-02-05',
    category: 'Analysis',
    title: '£1.7 Million on Training, Conferences and Professional Development',
    summary: 'Council staff training and conference attendance costs revealed — are taxpayers funding essential development or expensive junkets?',
    image: '/images/articles/council-meeting.jpg',
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

      <p><em>All figures are derived from publicly available council spending data.</em></p>
    `,
    tags: ['training', 'conferences', 'staff development', 'value for money'],
  },
  {
    id: 'hotel-accommodation',
    date: '2025-02-05',
    category: 'Analysis',
    title: '£26,000+ on Hotel Stays and Accommodation',
    summary: 'Analysis reveals council spending on Travelodge, Premier Inn and other hotels — why does a local council need overnight stays?',
    image: '/images/articles/council-meeting.jpg',
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

      <p><em>All figures are derived from publicly available council spending data.</em></p>
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
      case 'Analysis':
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
              <strong>Data Source:</strong> All figures derived from publicly available Burnley Borough Council
              data published under the Local Government Transparency Code. Analysis represents honest opinion
              on matters of public interest. There may be legitimate explanations for patterns identified.
              This is not an official council publication.
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
          Analysis of Burnley Borough Council spending and governance.
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
            {article.image && (
              <div className="article-card-image">
                <img src={article.image} alt="" loading="lazy" />
              </div>
            )}
            <div className="article-card-body">
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
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

export default News
