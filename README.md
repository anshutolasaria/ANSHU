# Meera Drafts Bot

Meera sends a note to a Telegram bot. The bot sends it to Gemini with her voice
instructions and replies in the same chat with a draft post.

```
Telegram ──webhook──▶ Vercel /api/telegram ──▶ Gemini ──▶ draft sent back to Telegram
```

No npm dependencies: it uses Node's built-in `fetch`.

## Files

| Path | Purpose |
| --- | --- |
| `api/telegram.js` | Webhook endpoint (the Vercel function) |
| `lib/gemini.js` | Builds the prompt and calls Gemini |
| `lib/telegram.js` | Sends replies to Telegram |
| `lib/news.js` | Looks up recent headlines on Google News RSS |
| `prompts/voice-instructions.md` | **Paste Meera's voice instructions here** |
| `scripts/set-webhook.js` | One-time script that connects the bot to your deployment |
| `.env.example` | List of environment variables |

## Setup

1. **Create the bot.** In Telegram, message [@BotFather](https://t.me/BotFather), send `/newbot`, and copy the token.
2. **Get a Gemini key** at <https://aistudio.google.com/apikey>.
3. **Add the voice instructions** to `prompts/voice-instructions.md`. You can also put them in the `VOICE_INSTRUCTIONS` env var instead.
4. **Deploy to Vercel.** Push this folder to GitHub and import it in Vercel, or run `npx vercel --prod`.
5. **Set environment variables** in Vercel under Project → Settings → Environment Variables:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_WEBHOOK_SECRET`: any long random string (A–Z, a–z, 0–9, `_`, `-`)
   - `GEMINI_API_KEY`
   - `ALLOWED_CHAT_IDS`: leave empty for now, you fill it in at step 7
   - `GEMINI_MODEL` (optional, default `gemini-3.8-flash`)

   Redeploy after adding them, because env var changes only apply to new deployments.
6. **Connect the webhook.** Copy `.env.example` to `.env`, fill in `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` (use the same values as in Vercel), then run:
   ```bash
   node --env-file=.env scripts/set-webhook.js https://your-app.vercel.app
   ```
   **No Node installed?** Open this URL in your browser instead, with your own values filled in. It does the same thing:
   ```
   https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://your-app.vercel.app/api/telegram&secret_token=<TELEGRAM_WEBHOOK_SECRET>&allowed_updates=["message"]
   ```
   You should see `"ok":true`.
7. **Authorize Meera.** Meera messages the bot, and it replies with her chat ID. Put that ID in `ALLOWED_CHAT_IDS` in Vercel and redeploy. Separate multiple IDs with commas, for example to add your own for testing.
8. Meera sends a note and gets a draft back.

## News and citations

For every note, Gemini first writes a short search query. The bot then pulls up to 6 headlines from the last 30 days from Google News RSS (Indian English edition by default; change it with `NEWS_REGION` and `NEWS_LANGUAGE`). Gemini sees the numbered headlines and cites any it uses as `[1]`, `[2]`, and the bot adds a **Sources** list with the headline, publisher, date and link.

- The Sources list is built by the code, not by Gemini, so every link is a real Google News result. Numbers Gemini makes up are removed.
- Gemini only sees headlines, not the full articles, so it is told to claim no more than the headline says. Check a source before posting.
- Links go through `news.google.com` and open the publisher's article.
- If the lookup fails or nothing relevant turns up, the draft is written without news.

## Troubleshooting

- **No reply at all:** run the set-webhook script again and check `last_error_message` in its output. Also check the function logs in the Vercel dashboard.
- **"Sorry, something went wrong":** the exact error is in the Vercel logs. Usually a key is missing or `voice-instructions.md` is still empty.
- **Changing the voice:** edit `prompts/voice-instructions.md` and redeploy.
