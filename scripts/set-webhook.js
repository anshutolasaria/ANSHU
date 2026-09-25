// Points the Telegram bot at your Vercel deployment. Run once after deploying:
//
//   node --env-file=.env scripts/set-webhook.js https://your-app.vercel.app

const { callTelegram } = require('../lib/telegram');

async function main() {
  const baseUrl = (process.argv[2] || process.env.WEBHOOK_BASE_URL || '').replace(/\/+$/, '');
  if (!baseUrl.startsWith('https://')) {
    console.error('Usage: node --env-file=.env scripts/set-webhook.js https://your-app.vercel.app');
    process.exit(1);
  }
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    console.error('Set TELEGRAM_WEBHOOK_SECRET in .env (same value as in Vercel).');
    process.exit(1);
  }

  const url = `${baseUrl}/api/telegram`;
  await callTelegram('setWebhook', {
    url,
    secret_token: secret,
    allowed_updates: ['message'],
    drop_pending_updates: true,
  });
  console.log(`Webhook set to ${url}`);

  const info = await callTelegram('getWebhookInfo', {});
  console.log(JSON.stringify(info, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
