// Telegram webhook endpoint: POST https://<your-app>.vercel.app/api/telegram
//
// Flow: Meera texts a note to the bot -> Telegram POSTs the update here ->
// we send the note + voice instructions to Gemini -> reply with the draft.

const { sendMessage, sendChatAction } = require('../lib/telegram');
const { buildNewsQuery, draftPost } = require('../lib/gemini');
const { searchNews, keywordQuery } = require('../lib/news');

const HELP_TEXT =
  'Send me a note as a text message and I will turn it into a draft post in your voice.';

module.exports = async function handler(req, res) {
  // Simple health check so you can open the URL in a browser.
  if (req.method !== 'POST') {
    return res.status(200).send('Drafts bot is running.');
  }

  // Only accept requests that come from Telegram (secret set via scripts/set-webhook.js).
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    console.error('TELEGRAM_WEBHOOK_SECRET is not set');
    return res.status(500).send('Server not configured');
  }
  if (req.headers['x-telegram-bot-api-secret-token'] !== secret) {
    return res.status(401).send('Unauthorized');
  }

  const message = req.body && req.body.message;
  if (!message || !message.chat) {
    return res.status(200).json({ ok: true }); // Not a message update; ignore.
  }

  try {
    await handleMessage(message);
  } catch (err) {
    console.error('Failed to handle message:', err);
    try {
      await sendMessage(
        message.chat.id,
        `Sorry, something went wrong while writing that draft.\n\nError: ${err.message}`,
        message.message_id
      );
    } catch (notifyErr) {
      console.error('Also failed to send the error message:', notifyErr);
    }
  }

  // Always return 200 so Telegram doesn't keep re-sending the same update.
  return res.status(200).json({ ok: true });
};

async function handleMessage(message) {
  const chatId = message.chat.id;
  const text = (message.text || message.caption || '').trim();

  if (!isAllowedChat(chatId)) {
    await sendMessage(
      chatId,
      `This bot is private. (Your chat ID is ${chatId}. Add it to ALLOWED_CHAT_IDS if this is you.)`
    );
    return;
  }

  if (!text) {
    await sendMessage(chatId, 'I can only read text right now. ' + HELP_TEXT, message.message_id);
    return;
  }

  if (text.startsWith('/start') || text.startsWith('/help')) {
    await sendMessage(chatId, HELP_TEXT);
    return;
  }

  await sendChatAction(chatId, 'typing');
  const news = await findNews(text);
  const draft = await draftPost(text, news.items);
  await sendMessage(chatId, addSources(draft, news), message.message_id);
}

// A failed news lookup never blocks the draft; the reply says what happened instead.
async function findNews(note) {
  let query = null;
  try {
    query = await buildNewsQuery(note);
  } catch (err) {
    console.warn('News query from Gemini failed, using keywords from the note:', err.message);
  }
  query = query || keywordQuery(note);
  if (!query) return { query, items: [] };

  try {
    return { query, items: await searchNews(query) };
  } catch (err) {
    console.warn('Google News lookup failed:', err.message);
    return { query, items: [], error: err.message };
  }
}

// Every reply ends with a sources section. Cited headlines come first; if the
// draft cites none, the top headlines are listed as related news; if the
// lookup found nothing, the reply says so. All links come straight from
// Google News, and [n] markers that don't match a headline are removed.
function addSources(draft, { query, items, error }) {
  const cited = new Set();
  const body = draft.replace(/\s?\[(\d+)\]/g, (marker, n) => {
    const index = Number(n);
    if (index < 1 || index > items.length) return '';
    cited.add(index);
    return marker;
  });

  if (cited.size) {
    const sources = [...cited].sort((a, b) => a - b).map((index) => formatSource(items[index - 1], index));
    return `${body}\n\nSources\n${sources.join('\n\n')}`;
  }
  if (items.length) {
    const related = items.slice(0, 3).map((item, i) => formatSource(item, i + 1));
    return `${body}\n\nRelated news (not cited in the draft)\n${related.join('\n\n')}`;
  }
  const reason = error
    ? `the Google News lookup failed (${error})`
    : `Google News had no results for "${query}"`;
  return `${body}\n\nSources: none, because ${reason}.`;
}

function formatSource(item, number) {
  const meta = [item.publisher, item.date].filter(Boolean).join(', ');
  return `[${number}] ${item.title}${meta ? ` (${meta})` : ''}\n${item.link}`;
}

function isAllowedChat(chatId) {
  const allowed = (process.env.ALLOWED_CHAT_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return allowed.includes(String(chatId));
}
