// Fetches recent headlines from the Google News RSS search feed (no API key needed).
//
// Each item only carries a headline, publisher, date and link, not the article
// text, so the drafting prompt tells Gemini to cite only what a headline says.

const FEED_URL = 'https://news.google.com/rss/search';

async function searchNews(query, { limit = 6, timeoutMs = 5_000 } = {}) {
  const language = process.env.NEWS_LANGUAGE || 'en';
  const region = process.env.NEWS_REGION || 'IN';
  const params = new URLSearchParams({
    q: `${query} when:30d`, // only the last 30 days
    hl: `${language}-${region}`,
    gl: region,
    ceid: `${region}:${language}`,
  });

  const response = await fetch(`${FEED_URL}?${params}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DraftsBot/1.0)' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Google News RSS error ${response.status}`);
  const xml = await response.text();

  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map((match) => parseItem(match[1]))
    .filter((item) => item.title && item.link)
    .slice(0, limit);
}

function parseItem(block) {
  const tag = (name) => {
    const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
    return match ? decodeXml(match[1]) : '';
  };
  const source = block.match(/<source\s+url="([^"]*)"[^>]*>([\s\S]*?)<\/source>/);
  const publisher = source ? decodeXml(source[2]) : '';

  // Google appends " - Publisher" to every headline; drop it since we show it separately.
  let title = tag('title');
  if (publisher && title.endsWith(` - ${publisher}`)) {
    title = title.slice(0, -(publisher.length + 3));
  }

  return {
    title,
    publisher,
    link: tag('link'),
    date: formatDate(tag('pubDate')),
  };
}

function decodeXml(text) {
  return text
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

function formatDate(pubDate) {
  const date = new Date(pubDate);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

module.exports = { searchNews };
