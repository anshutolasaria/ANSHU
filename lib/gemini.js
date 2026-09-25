// Calls the Gemini API with Meera's note plus her voice instructions.

const fs = require('fs');
const path = require('path');

const VOICE_FILE = path.join(__dirname, '..', 'prompts', 'voice-instructions.md');
const DEFAULT_MODEL = 'gemini-3.8-flash';

// Voice instructions come from the VOICE_INSTRUCTIONS env var if set,
// otherwise from prompts/voice-instructions.md. HTML comments are stripped
// so the placeholder guidance in that file never reaches the model.
function loadVoiceInstructions() {
  let text = process.env.VOICE_INSTRUCTIONS;
  if (!text) {
    text = fs.readFileSync(VOICE_FILE, 'utf8');
  }
  text = text.replace(/<!--[\s\S]*?-->/g, '').trim();
  if (!text) {
    throw new Error(
      'Voice instructions are empty. Add them to prompts/voice-instructions.md or the VOICE_INSTRUCTIONS env var.'
    );
  }
  return text;
}

async function generate({ system, user, temperature, timeoutMs }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = (data.error && data.error.message) || response.statusText;
    throw new Error(`Gemini API error ${response.status}: ${detail}`);
  }

  if (data.promptFeedback && data.promptFeedback.blockReason) {
    throw new Error(`Gemini blocked the note: ${data.promptFeedback.blockReason}`);
  }

  const candidate = data.candidates && data.candidates[0];
  const text = ((candidate && candidate.content && candidate.content.parts) || [])
    .filter((part) => !part.thought)
    .map((part) => part.text || '')
    .join('')
    .trim();

  if (!text) {
    const reason = (candidate && candidate.finishReason) || 'unknown';
    throw new Error(`Gemini returned an empty response (finishReason: ${reason})`);
  }
  return text;
}

// Turns a rough note into a short Google News search query, or null if the
// note isn't about anything that recent news could inform.
async function buildNewsQuery(note) {
  const query = await generate({
    system: [
      'You write Google News search queries.',
      'The author is a skincare founder in India writing a LinkedIn post or newsletter from the note you are given.',
      'Reply with one search query of 2-6 plain keywords that would find recent news relevant to the note. No quotes, no operators, no explanation.',
      'If recent news would not be relevant to the note, reply with exactly: NONE',
    ].join('\n'),
    user: note,
    temperature: 0,
    timeoutMs: 10_000,
  });
  const cleaned = query.split('\n')[0].replace(/["']/g, '').trim();
  return !cleaned || cleaned.toUpperCase() === 'NONE' ? null : cleaned;
}

// Writes the draft. newsItems is a list from lib/news.js; the draft may cite
// them as [1], [2], ... and the caller turns those into a Sources list.
async function draftPost(note, newsItems = []) {
  const system = [
    loadVoiceInstructions(),
    '',
    'You will receive a rough note from the author. Turn it into a ready-to-post draft written in her voice, following the instructions above.',
    'Reply with the draft post only: no preamble, no explanations, no surrounding quotes.',
    '',
    'You may also receive a numbered list of recent news headlines. Rules for using them:',
    '- Only reference a headline if it is genuinely relevant to the note. It is fine to use none.',
    '- You have only seen the headline, not the article. Attribute claims to the publication (for example, "Hindustan Times reported this month that...") and never state more than the headline itself says.',
    '- Every time you use a headline, put its number in square brackets right after the sentence, like [1]. Only use numbers from the list.',
    '- Do not write a sources list or any URLs yourself; they are added automatically.',
  ].join('\n');

  let user = `Note from the author:\n${note}`;
  if (newsItems.length) {
    const list = newsItems
      .map((item, i) => `[${i + 1}] ${item.title} (${[item.publisher, item.date].filter(Boolean).join(', ')})`)
      .join('\n');
    user += `\n\nRecent news headlines:\n${list}`;
  }

  return generate({ system, user, temperature: 0.8, timeoutMs: 38_000 });
}

module.exports = { buildNewsQuery, draftPost };
