# Scanning and Storage Guide

This guide explains how the application finds companies and stores them in the database.

## 1. The Scanning Process
**File:** `convex/scan.ts`
**Function:** `run` action

The scanning process is triggered by the user from the frontend. It performs the following steps:

1.  **Fetch Gallery:** Fetches the `startups.gallery` homepage to find company links.
2.  **Extract Links:** Uses `cheerio` to parse the HTML and extract links to individual company pages.
3.  **Process Companies (Loop):** Iterates through the found links (limited by the `limit` argument, default 5).

### Per-Company Logic
For each company, the code:
1.  **Fetches Details:** Visits the company's detail page on `startups.gallery`.
2.  **Extracts Metadata:** Finds the company name, website URL, and description.
    *   *Fallback:* If description is missing, it tries to find a substantial paragraph on the page.
3.  **Finds Website:** Looks for a "Visit Website" link or other external links.
4.  **Deduplication:** Checks `api.companies.getByDomain` to see if the company exists.
    - Skips if status is 'Contacted' or 'Blacklisted'.
    - Skips if `lastScannedAt` is within the last 30 days (smart skipping).
5.  **Role Detection:** Visits the company's actual website and searches for keywords (e.g., "product engineer", "react") to see if they are hiring for relevant roles.

### Rate Limiting
To avoid hitting Gemini API quotas (15 req/min), a 5-second delay is added after processing each company:
```typescript
// Rate limiting: Wait 5 seconds between companies
if (processedCount < limit) {
    await sleep(5000);
}
```

## 2. Database Storage
**File:** `convex/companies.ts`
**Schema:** Defined in `convex/schema.ts` (implied)

Data is stored in the `companies` table in Convex.

### Saving Data
**Function:** `save` mutation
- **Upsert Logic:** Checks if a company with the same `domain` already exists.
    - **If exists:** Updates the record (unless status is 'Contacted').
    - **If new:** Inserts a new record with status 'New'.
- **Fields Stored:**
    - `companyName`
    - `websiteUrl`
    - `domain`
    - `rolesFound` (boolean)
    - `founders` (array of strings)
    - `emails` (array of strings)
    - `emailDraft` (generated text)
    - `status` ('New', 'Contacted', 'Blacklisted')
    - `lastScannedAt` (timestamp)

### Querying Data
**Function:** `list` query
- Returns companies sorted by `lastScannedAt` (descending).
- Filters out 'Blacklisted' companies.
- Implements simple pagination (limit 10 per page).
