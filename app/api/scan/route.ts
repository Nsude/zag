import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { generateEmailPermutations, extractDomain } from '@/app/lib/email-utils';
import { isCompanyContacted } from '@/app/lib/db';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

async function fetchHtml(url: string) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) throw new Error(`Failed to fetch ${url}`);
    return await res.text();
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    return null;
  }
}

async function googleSearchFounders(companyName: string): Promise<string[]> {
  const query = `${companyName} founders linkedin`;
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  const html = await fetchHtml(url);
  if (!html) return [];

  const $ = cheerio.load(html);
  const founders: string[] = [];
  
  // Simple heuristic: look for "Title - Name - LinkedIn" patterns or just extract names from snippets
  // This is brittle and depends on Google's DOM.
  // A better approach without API is hard. We'll try to find text that looks like a name followed by "Founder" or "Co-founder".
  
  $('div.g').each((_, el) => {
    const text = $(el).text();
    if (text.includes('Founder') || text.includes('Co-founder')) {
        // Try to extract the name. Usually "Name - Title - Company"
        const parts = $(el).find('h3').text().split(/[-|–]/);
        if (parts.length > 0) {
            const name = parts[0].trim();
            // Basic validation: 2-3 words, no numbers
            if (name.split(' ').length >= 2 && name.split(' ').length <= 3 && !/\d/.test(name)) {
                if (!founders.includes(name)) founders.push(name);
            }
        }
    }
  });

  return founders.slice(0, 2); // Return top 2
}

export async function POST(request: Request) {
  const { limit = 5 } = await request.json();
  
  // 1. Scrape Startups Gallery
  console.log("Fetching startups.gallery...");
  const galleryHtml = await fetchHtml('https://startups.gallery/');
  if (!galleryHtml) {
      console.error("Failed to fetch gallery");
      return NextResponse.json({ error: 'Failed to fetch gallery' }, { status: 500 });
  }

  const $ = cheerio.load(galleryHtml);
  const companyLinks: string[] = [];
  
  $('a[href^="./companies/"]').each((_, el) => {
    const href = $(el).attr('href');
    if (href) companyLinks.push(`https://startups.gallery${href.substring(1)}`);
  });
  console.log(`Found ${companyLinks.length} company links`);

  const results = [];
  let processedCount = 0;

  for (const link of companyLinks) {
    if (processedCount >= limit) break;

    // 2. Scrape Detail Page
    const detailHtml = await fetchHtml(link);
    if (!detailHtml) continue;
    const $detail = cheerio.load(detailHtml);
    
    const companyName = $detail('h1').text().trim() || link.split('/').pop() || 'Unknown';
    
    // Find website link. Look for "Visit Website" or external links
    let websiteUrl = '';
    let description = '';

    $detail('a').each((_, el) => {
        const text = $detail(el).text();
        const href = $detail(el).attr('href');
        if (text.includes('Visit Website') && href) {
            websiteUrl = href;
        }
        // Extract description from text after "Raised" link
        if (text.includes('Raised')) {
            const parent = $detail(el).parent();
            let descText = parent.text();
            descText = descText.replace($detail(el).text(), '').trim();
            // Clean up: take until the next link or just the first paragraph-like chunk
            // For now, just take the whole text as it seems to be the description block
            description = descText;
        }
    });
    
    // Fallback description if not found via "Raised"
    if (!description) {
         $detail('div, p').each((_, el) => {
            const text = $detail(el).text().trim();
            if (text.length > 50 && !text.includes('Visit Website') && !description) {
                 if ($detail(el).children().length === 0) {
                     description = text;
                 }
            }
         });
    }
    
    // Fallback: find first external link that's not social media
    
    // Fallback: find first external link that's not social media
    if (!websiteUrl) {
        $detail('a').each((_, el) => {
            const href = $detail(el).attr('href');
            if (href && href.startsWith('http') && !href.includes('startups.gallery') && !href.includes('twitter') && !href.includes('linkedin') && !href.includes('facebook')) {
                websiteUrl = href;
                return false; // break
            }
        });
    }

    if (!websiteUrl) continue;

    const domain = extractDomain(websiteUrl);
    if (isCompanyContacted(domain)) continue;

    // 3. Scrape Company Site for Roles and Founders
    const siteHtml = await fetchHtml(websiteUrl);
    let rolesFound = false;
    let founders: string[] = [];

    if (siteHtml) {
        const $site = cheerio.load(siteHtml);
        const text = $site('body').text().toLowerCase();
        
        // Check for roles
        const keywords = ['product engineer', 'frontend', 'design engineer', 'software engineer', 'developer', 'full stack', 'web', 'react', 'typescript'];
        if (keywords.some(k => text.includes(k))) {
            rolesFound = true;
            console.log(`[${companyName}] Roles found!`);
        } else {
            console.log(`[${companyName}] No roles found.`);
        }

        // Check for founders on page
        if (text.includes('founder') || text.includes('co-founder')) {
             // Try to find names near "Founder" (very hard with just text search, but let's try simple extraction)
             // For now, rely on Google Fallback if this is too hard, or maybe check /about page
        }
    }

    // 4. Fallback: Google Search for Founders
    if (founders.length === 0) {
        founders = await googleSearchFounders(companyName);
    }

    if (rolesFound) {
        // Generate Email
        const founderName = founders[0] || 'Founder';
        const [firstName, lastName] = founderName.split(' ');
        const emails = founders.length > 0 && lastName 
            ? generateEmailPermutations(firstName, lastName, domain) 
            : [`hello@${domain}`, `founders@${domain}`];

        const emailDraft = `Hi ${firstName || 'there'},

I’m Meshach, I’m a Product Engineer and designer. I’ve worked with start-ups across Europe, taking products from raw idea to launch in weeks.

You’ve built something incredible with ${companyName}. ${description ? description : ''}

From what I can tell, the next challenge is scale: turning that great product into something even non-technical people can pick up and instantly get.

That's what I do best. Taking complex systems and building interfaces that feel intuitive, the kind where users don't need to think about how things work.

There's a version of ${companyName} that becomes the default for most teams, not just the technical ones. 

I'd love to show you what that could look like.

Best,
Meshach

GitHub: github.com/Nsude
LinkedIn: linkedin.com/in/nsude-meshach`;

        results.push({
            companyName,
            websiteUrl,
            rolesFound,
            founders,
            emails,
            emailDraft,
            domain
        });
        processedCount++;
    }
  }

  return NextResponse.json({ results });
}
