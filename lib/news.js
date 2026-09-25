// Fetches recent headlines from the Google News RSS search feed (no API key needed).
//
// Each item only carries a headline, publisher, date and link, not the article
// text, so the drafting prompt tells Gemini to cite only what a headline says.

const FEED_URL = 'https://news.google.com/rss/search';

const STOPWORDS = new Set(
  ('a an the and or but if of to in on for with at by from is are was were be been being it its this that ' +
    'these those i we you they our my me us so as not no do does did have has had can could will would ' +
    'should just about into than then there their them also very more most some any all how what why when ' +
    'who which one ones get got keep keeps really thing things like people everyone everybody nobody ' +
    'something someone last next new today year years month week lot lots much many make made ' +
    'customer customers ask asks asking asked say says said saying think want wants need needs whether ' +
    'our ours use using used talk talking write writing post')
    .split(' ')
);

// Fallback query when Gemini can't write one: the first few meaningful words of the note.
function keywordQuery(note, count = 3) {
  const words = [];
  for (const word of note.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || []) {
    if (!STOPWORDS.has(word) && !words.includes(word)) words.push(word);
    if (words.length === count) break;
  }
  return words.join(' ');
}

// Specific queries often return nothing, so try a few broader variants at
// once and use the first (most specific) one that has results.
async function searchNews(query, { limit = 6 } = {}) {
  const shortQuery = query.split(/\s+/).slice(0, 2).join(' ');
  const variants = [...new Set([`${query} when:30d`, `${shortQuery} when:30d`, `${query} when:1y`])];

  const results = await Promise.allSettled(variants.map((q) => fetchFeed(q)));
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.length) return result.value.slice(0, limit);
  }
  const failure = results.find((result) => result.status === 'rejected');
  if (failure && results.every((result) => result.status === 'rejected')) throw failure.reason;
  return [];
}

async function fetchFeed(q) {
  const language = process.env.NEWS_LANGUAGE || 'en';
  const region = process.env.NEWS_REGION || 'IN';
  const params = new URLSearchParams({
    q,
    hl: `${language}-${region}`,
    gl: region,
    ceid: `${region}:${language}`,
  });

  const response = await fetch(`${FEED_URL}?${params}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DraftsBot/1.0)' },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`Google News RSS error ${response.status}`);
  const xml = await response.text();

  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map((match) => parseItem(match[1]))
    .filter((item) => item.title && item.link);
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

module.exports = { searchNews, keywordQuery };
