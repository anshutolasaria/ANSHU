// Telegram webhook endpoint: POST https://<your-app>.vercel.app/api/telegram
//
// Flow: Meera texts a note to the bot -> Telegram POSTs the update here ->
// we send the note + voice instructions to Gemini -> reply with the draft.

const { sendMessage, sendChatAction } = require('../lib/telegram');
const { draftPost } = require('../lib/gemini');

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
        'Sorry, something went wrong while writing that draft. Please try sending the note again.',
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
  const draft = await draftPost(text);
  await sendMessage(chatId, draft, message.message_id);
}

function isAllowedChat(chatId) {
  const allowed = (process.env.ALLOWED_CHAT_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return allowed.includes(String(chatId));
}
