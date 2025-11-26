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

async function getKeyPeople(companyName: string, websiteUrl: string, apiKey: string): Promise<{ name: string; role: string }[]> {
    if (!apiKey) {
        console.warn("GEMINI_API_KEY is not set. Cannot find key people.");
        return [];
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.0-flash",
            tools: [{ googleSearch: {} } as any],
        });
        const prompt = `
          I need to find the key executives at the company "${companyName}" with website "${websiteUrl}".
          Specifically, I am strictly looking for ONLY the following roles:
          1. Founders or Co-founders
          2. CEO
          3. CTO
          4. COO (INCLUDE THIS ONLY IF NO CTO IS FOUND)

          Do NOT return any other roles like VP, Head of Engineering, etc.

          Use your browsing capabilities to find this information on their website or other reliable sources.

          Please extract the names and roles of these people.
          Prioritize accuracy. If a name is not clearly associated with one of these roles, do not include it.

          Return the result as a JSON array of objects with "name" and "role" keys.
          Example: [{"name": "Jane Doe", "role": "CEO & Founder"}, {"name": "John Smith", "role": "CTO"}]
          
          If no one is found, return an empty array [].
          Output ONLY the JSON.
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text().trim();
        // Clean up markdown code blocks if present
        text = text.replace(/^```json\n?|\n?```$/g, '');
        return JSON.parse(text);
    } catch (error) {
        console.error("Error getting key people:", error);
        return [];
    }
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

        let siteText = '';

        if (siteHtml) {
            const $site = cheerio.load(siteHtml);
            siteText = $site('body').text();
            const text = siteText.toLowerCase();
            const keywords = ['product engineer', 'frontend', 'design engineer', 'software engineer', 'developer', 'full stack', 'web', 'react', 'typescript'];
            if (keywords.some(k => text.includes(k))) {
                rolesFound = true;
                console.log(`[${companyName}] Roles found!`);
            } else {
                console.log(`[${companyName}] No roles found.`);
            }
        }

        if (rolesFound) {
            const keyPeople = await getKeyPeople(companyName, websiteUrl, apiKey);
            founders = keyPeople.map(p => `${p.name} (${p.role})`);
            
            let emails: string[] = [];
            let firstName = '';

            if (keyPeople.length > 0) {
                // Use the first person found for the greeting
                const firstPerson = keyPeople[0];
                firstName = firstPerson.name.split(' ')[0];

                for (const person of keyPeople) {
                    const nameParts = person.name.trim().split(' ');
                    if (nameParts.length >= 2) {
                        const first = nameParts[0];
                        const last = nameParts[nameParts.length - 1];
                        emails.push(...generateEmailPermutations(first, last, domain));
                    }
                }
            } else {
                emails = [`hello@${domain}`, `founders@${domain}`];
            }

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
