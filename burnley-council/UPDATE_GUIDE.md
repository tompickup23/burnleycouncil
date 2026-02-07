# Burnley Council Transparency - Update Guide

This guide explains how to update the website data and content.

## Quick Reference

| What to update | File location | How to update |
|---------------|---------------|---------------|
| Spending data | `/public/data/spending.json` | Re-run Python script |
| Budget data | `/public/data/budgets.json` | Re-run Python script |
| Councillors | `/public/data/councillors.json` | Re-run Python script |
| News articles | `/src/pages/News.jsx` | Edit directly in React |
| Insights | `/public/data/insights.json` | Re-run Python script |

---

## 1. Updating Spending Data

### Adding New Quarterly Data

1. **Get new CSV files** from [Burnley Council Transparency](https://www.burnley.gov.uk/council-and-democracy/transparency/spending-over-500)

2. **Place files** in the appropriate folder:
   - Spending (>£500): `/Documents/BBC/Spend/`
   - Contracts (>£5000): `/Documents/BBC/Contracts/`
   - Purchase Cards: `/Documents/BBC/P Cards/`

3. **Name files consistently**:
   - `Q1.24.25.Spend.csv` (Quarter 1, 2024/25)
   - `Q2.24.25.Contracts.csv`
   - `Q1.24.25.Purchase.Cards.csv`

4. **Run the processing script**:
   ```bash
   cd /Users/tompickup/clawd/burnley-council/scripts
   python3 process_spending_v2.py
   ```

5. **Copy updated JSON to app**:
   ```bash
   cp ../public/data/*.json ../burnley-app/public/data/
   ```

6. **Rebuild and deploy**:
   ```bash
   cd ../burnley-app
   npm run build
   git add . && git commit -m "Update spending data" && git push
   ```

---

## 2. Updating Budget Data

### Adding New Budget Book

1. **Get budget PDF** from [Burnley Council Budget Books](https://www.burnley.gov.uk/council-and-democracy/budgets-accounts-and-audits)

2. **Place in** `/Documents/BBC/Budgets/` with naming: `Budget-Book-2026-27.pdf`

3. **Update headline figures** in `scripts/process_budgets_v2.py`:
   ```python
   HEADLINE_FIGURES = {
       # ... existing years ...
       "2026/27": {
           "net_revenue_budget": 19_500_000,  # Update from PDF intro
           "council_tax_band_d": 2550.00,
           "burnley_element": 351.50,
           "burnley_increase_pct": 2.0,
       },
   }
   ```

4. **Run processing**:
   ```bash
   python3 process_budgets_v2.py
   ```

5. **Copy and deploy** as above.

---

## 3. Updating News Articles

News articles are stored directly in the React code for simplicity.

### Adding a New Article

1. **Edit** `/src/pages/News.jsx`

2. **Add to the `newsArticles` array** at the top:
   ```javascript
   const newsArticles = [
     {
       id: 'unique-article-id',
       date: '2025-02-15',
       category: 'DOGE Finding',  // or 'Democracy', 'Investigation'
       title: 'Your Article Title',
       summary: 'A brief one-sentence summary for the list view.',
       content: `
         <p>First paragraph of the article.</p>
         <p>Second paragraph with more detail.</p>
         <ul>
           <li>Bullet point one</li>
           <li>Bullet point two</li>
         </ul>
       `,
       tags: ['tag1', 'tag2', 'tag3'],
     },
     // ... existing articles
   ]
   ```

3. **Categories available**:
   - `DOGE Finding` - Efficiency/waste findings (orange highlight)
   - `Democracy` - Political/democratic issues (blue highlight)
   - `Investigation` - Deep dives (default)

4. **Commit and push** to deploy automatically.

---

## 4. Updating Councillor Data

### After an Election or Resignation

1. **Edit the raw data** in `scripts/process_councillors.py`:
   - Find the `RAW_COUNCILLORS` string
   - Update councillor details as needed
   - Format: `Name|Address|Phone|Email|Roles|Party|Group|Ward`

2. **Run processing**:
   ```bash
   python3 process_councillors.py
   ```

3. **Copy and deploy**.

---

## 5. Data File Formats

### spending.json
```json
[
  {
    "supplier": "COMPANY NAME",
    "amount": 12345.67,
    "date": "2024-04-15",
    "financial_year": "2024/25",
    "data_type": "spend",  // or "contract", "pcard"
    "category": "Agency & Contracted Services",
    "description": "Description text",
    "is_covid": false
  }
]
```

### insights.json
Auto-generated from spending data with:
- `total_spend`: Total amount
- `unique_suppliers`: Count
- `top_suppliers`: Array of top spenders
- `political_angles`: Scrutiny metrics

### councillors.json
```json
[
  {
    "id": "email_prefix",
    "name": "Full Name",
    "party": "Independent",
    "group": "Burnley Independent Group",
    "ward": "Bank Hall",
    "email": "name@burnley.gov.uk",
    "phone": "01onal82...",
    "roles": ["Leader of the Council"],
    "party_color": "#800080"
  }
]
```

---

## 6. Deployment

### Automatic (Recommended)
Push to main branch triggers GitHub Actions deployment.

### Manual
```bash
cd burnley-app
npm run build
npm run deploy
```

---

## 7. Troubleshooting

### CSV Encoding Issues
If you get UTF-8 errors, the script handles this automatically with fallback encodings.

### Build Fails
```bash
npm run lint  # Check for errors
```

### Data Not Updating
1. Check JSON was copied to `burnley-app/public/data/`
2. Clear browser cache
3. Check GitHub Actions completed

---

## 8. File Structure

```
burnley-council/
├── scripts/                    # Data processing
│   ├── process_spending_v2.py
│   ├── process_budgets_v2.py
│   └── process_councillors.py
├── public/data/               # Generated JSON (source)
└── burnley-app/               # React app
    ├── public/data/           # JSON for website
    ├── src/
    │   ├── pages/
    │   │   ├── Home.jsx
    │   │   ├── News.jsx       # Edit for news articles
    │   │   ├── Spending.jsx
    │   │   ├── Budgets.jsx
    │   │   ├── Politics.jsx
    │   │   └── MyArea.jsx
    │   └── components/
    └── .github/workflows/     # Auto-deploy config
```

---

## 9. Contact

For technical issues with the website, the code is at:
`/Users/tompickup/clawd/burnley-council/`
