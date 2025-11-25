import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import * as cheerio from "cheerio";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { generateEmailPermutations, extractDomain } from "./utils";

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
  
  $('div.g').each((_, el) => {
    const text = $(el).text();
    if (text.includes('Founder') || text.includes('Co-founder')) {
        const parts = $(el).find('h3').text().split(/[-|–]/);
        if (parts.length > 0) {
            const name = parts[0].trim();
            if (name.split(' ').length >= 2 && name.split(' ').length <= 3 && !/\d/.test(name)) {
                if (!founders.includes(name)) founders.push(name);
            }
        }
    }
  });

  return founders.slice(0, 2);
}

async function generatePOV(companyName: string, description: string, apiKey: string): Promise<string> {
    if (!apiKey) {
        console.warn("GEMINI_API_KEY is not set. Using original description.");
        return description;
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const prompt = `
          I am writing a cold email to the founder of ${companyName}.
          Their company description is: "${description}".
          
          I need a single sentence that demonstrates I understand their value proposition and the specific problem they solve. 
          It should be a "point of view" (POV) statement, not just a summary.
          
          Example input description: "At Sierra, we’re creating a platform to help businesses build better, more human customer experiences with AI."
          Example output: "Integrating AI into the customer service industry, so companies can actually provide 24/7 support is ingenious."
          
          Target output format: A single sentence. No quotes.
          Context: The sentence will follow "You've built something incredible with ${companyName}. "
          IMPORTANT: Do NOT include the phrase "You've built something incredible with ${companyName}" in your output. Start directly with your POV sentence.
        `;
    
        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text().trim();

        const escapedCompanyName = companyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const repetitionRegex = new RegExp(`^You['’]ve built something incredible with ${escapedCompanyName}[.!]*\\s*`, 'i');
        text = text.replace(repetitionRegex, '');
        text = text.replace(/^["']|["']$/g, '');
        return text;
    } catch (error) {
        console.error("Error generating POV:", error);
        return description;
    }
}

export const run = action({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit || 5;
    const apiKey = process.env.GEMINI_API_KEY || '';

    console.log("Fetching startups.gallery...");
    const galleryHtml = await fetchHtml('https://startups.gallery/');
    if (!galleryHtml) throw new Error("Failed to fetch gallery");

    const $ = cheerio.load(galleryHtml);
    const companyLinks: string[] = [];
    $('a[href^="./companies/"]').each((_, el) => {
        const href = $(el).attr('href');
        if (href) companyLinks.push(`https://startups.gallery${href.substring(1)}`);
    });
    console.log(`Found ${companyLinks.length} company links`);

    let processedCount = 0;
    for (const link of companyLinks) {
        if (processedCount >= limit) break;

        const detailHtml = await fetchHtml(link);
        if (!detailHtml) continue;
        const $detail = cheerio.load(detailHtml);
        
        const companyName = $detail('h1').text().trim() || link.split('/').pop() || 'Unknown';
        
        let websiteUrl = '';
        let description = '';

        $detail('a').each((_, el) => {
            const text = $detail(el).text();
            const href = $detail(el).attr('href');
            if (text.includes('Visit Website') && href) websiteUrl = href;
            if (text.includes('Raised')) {
                const parent = $detail(el).parent();
                let descText = parent.text();
                descText = descText.replace($detail(el).text(), '').trim();
                description = descText;
            }
        });

        if (!description) {
             $detail('div, p').each((_, el) => {
                const text = $detail(el).text().trim();
                if (text.length > 50 && !text.includes('Visit Website') && !description) {
                     if ($detail(el).children().length === 0) description = text;
                }
             });
        }
        
        if (!websiteUrl) {
            $detail('a').each((_, el) => {
                const href = $detail(el).attr('href');
                if (href && href.startsWith('http') && !href.includes('startups.gallery') && !href.includes('twitter') && !href.includes('linkedin') && !href.includes('facebook')) {
                    websiteUrl = href;
                    return false;
                }
            });
        }

        if (!websiteUrl) continue;

        const domain = extractDomain(websiteUrl);
        
        const isContacted = await ctx.runQuery(api.companies.isContacted, { domain });
        if (isContacted) {
            console.log(`Skipping ${companyName} (already contacted)`);
            continue;
        }

        const siteHtml = await fetchHtml(websiteUrl);
        let rolesFound = false;
        let founders: string[] = [];

        if (siteHtml) {
            const $site = cheerio.load(siteHtml);
            const text = $site('body').text().toLowerCase();
            const keywords = ['product engineer', 'frontend', 'design engineer', 'software engineer', 'developer', 'full stack', 'web', 'react', 'typescript'];
            if (keywords.some(k => text.includes(k))) {
                rolesFound = true;
                console.log(`[${companyName}] Roles found!`);
            } else {
                console.log(`[${companyName}] No roles found.`);
            }
        }

        if (rolesFound) {
            founders = await googleSearchFounders(companyName);
            const founderName = founders[0] || 'Founder';
            const [firstName, lastName] = founderName.split(' ');
            const emails = founders.length > 0 && lastName 
                ? generateEmailPermutations(firstName, lastName, domain) 
                : [`hello@${domain}`, `founders@${domain}`];

            const pov = await generatePOV(companyName, description, apiKey);

            const emailDraft = `Hi ${firstName || 'there'},

I’m Meshach, I’m a Product Engineer and designer. I’ve worked with start-ups across Europe, taking products from raw idea to launch in weeks.

You’ve built something incredible with ${companyName}. ${pov}

From what I can tell, the next challenge is scale: turning that great product into something even non-technical people can pick up and instantly get.

That's what I do best. Taking complex systems and building interfaces that feel intuitive, the kind where users don't need to think about how things work.

There's a version of ${companyName} that becomes the default for most teams, not just the technical ones. 

I'd love to show you what that could look like.

Best,
Meshach

GitHub: github.com/Nsude
LinkedIn: linkedin.com/in/nsude-meshach`;

            await ctx.runMutation(api.companies.save, {
                companyName,
                websiteUrl,
                domain,
                rolesFound,
                founders,
                emails,
                emailDraft,
            });
            processedCount++;
        }
    }
  },
});
