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

async function draftPost(note) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  const systemInstruction = [
    loadVoiceInstructions(),
    '',
    'You will receive a rough note from the author. Turn it into a ready-to-post draft written in her voice, following the instructions above.',
    'Reply with the draft post only: no preamble, no explanations, no surrounding quotes.',
  ].join('\n');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: 'user', parts: [{ text: note }] }],
        generationConfig: { temperature: 0.8 },
      }),
      signal: AbortSignal.timeout(50_000), // stay under the function's 60s limit
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
  const draft = ((candidate && candidate.content && candidate.content.parts) || [])
    .filter((part) => !part.thought)
    .map((part) => part.text || '')
    .join('')
    .trim();

  if (!draft) {
    const reason = (candidate && candidate.finishReason) || 'unknown';
    throw new Error(`Gemini returned an empty draft (finishReason: ${reason})`);
  }
  return draft;
}

module.exports = { draftPost };
