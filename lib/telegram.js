// Minimal Telegram Bot API client (no dependencies, uses built-in fetch).

const TELEGRAM_MAX_LENGTH = 4096;

async function callTelegram(method, payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!data.ok) {
    throw new Error(`Telegram ${method} failed: ${data.description || response.status}`);
  }
  return data.result;
}

// Sends plain text (no Markdown parsing, so the draft arrives exactly as written).
// Long drafts are split into several messages to respect Telegram's length limit.
async function sendMessage(chatId, text, replyToMessageId) {
  const chunks = splitText(text, TELEGRAM_MAX_LENGTH);
  for (let i = 0; i < chunks.length; i++) {
    const payload = {
      chat_id: chatId,
      text: chunks[i],
      link_preview_options: { is_disabled: true }, // keep source links from adding big previews
    };
    if (i === 0 && replyToMessageId) {
      payload.reply_parameters = {
        message_id: replyToMessageId,
        allow_sending_without_reply: true,
      };
    }
    await callTelegram('sendMessage', payload);
  }
}

async function sendChatAction(chatId, action) {
  try {
    await callTelegram('sendChatAction', { chat_id: chatId, action });
  } catch (err) {
    // The "typing..." indicator is cosmetic; never fail the request over it.
    console.warn('sendChatAction failed:', err.message);
  }
}

// Split on paragraph/line/word boundaries where possible.
function splitText(text, maxLength) {
  const chunks = [];
  let remaining = text;
  while (remaining.length > maxLength) {
    const window = remaining.slice(0, maxLength);
    let cut = window.lastIndexOf('\n\n');
    if (cut < maxLength / 2) cut = window.lastIndexOf('\n');
    if (cut < maxLength / 2) cut = window.lastIndexOf(' ');
    if (cut < maxLength / 2) cut = maxLength;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

module.exports = { sendMessage, sendChatAction, callTelegram };
