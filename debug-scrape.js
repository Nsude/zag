const cheerio = require('cheerio');

async function testScrape() {
  console.log("Fetching startups.gallery...");
  try {
    const res = await fetch('https://startups.gallery/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    const html = await res.text();
    console.log(`Fetched ${html.length} bytes`);

    const $ = cheerio.load(html);
    const links = [];
    $('a[href^="./companies/"]').each((_, el) => {
      links.push($(el).attr('href'));
    });

    console.log(`Found ${links.length} links`);

    if (links.length > 0) {
      // Test one detail page
      const detailUrl = 'https://startups.gallery' + links[0].substring(1);
      console.log(`Checking detail: ${detailUrl}`);

      const detailRes = await fetch(detailUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const detailHtml = await detailRes.text();
      const $detail = cheerio.load(detailHtml);

      let description = '';

      // Strategy: Find the "Raised" link and get the text immediately following it in its parent
      $detail('a').each((_, el) => {
        if ($detail(el).text().includes('Raised')) {
          const parent = $detail(el).parent();
          // Get text of parent, remove the link text
          let text = parent.text();
          // Remove the "Raised..." part
          text = text.replace($detail(el).text(), '').trim();
          // Also remove any other links text if they are at the start?
          // Actually, the description is usually the rest of the text.
          // Let's just take the first 200 chars of the cleaned text
          description = text;
        }
      });

      if (!description) {
        // Fallback: look for long text block
        $detail('div, p').each((_, el) => {
          const text = $detail(el).text().trim();
          if (text.length > 50 && !text.includes('Visit Website') && !description) {
            if ($detail(el).children().length === 0) {
              description = text;
            }
          }
        });
      }

      console.log(`Description: ${description.substring(0, 150)}...`);

    }

  } catch (error) {
    console.error("Error:", error);
  }
}

testScrape();
