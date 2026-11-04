// scripts/setup.js
// Opens the Claude Console and Railway in separate browser windows
// to help you grab the API key and DATABASE_URL for your .env file

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 50 });

  // ── Window 1: Claude API Key ─────────────────────────────────────────────
  const claudePage = await browser.newPage();
  await claudePage.goto('https://console.anthropic.com/settings/keys');
  console.log('✅ Opened Claude Console → API Keys page');
  console.log('   → Log in if prompted');
  console.log('   → Click "Create Key", name it "orga-bot", copy the key');
  console.log('   → Paste it as CLAUDE_API_KEY in your .env file');

  // ── Window 2: Railway ────────────────────────────────────────────────────
  const railwayPage = await browser.newPage();
  await railwayPage.goto('https://railway.app/new');
  console.log('\n✅ Opened Railway → New Project page');
  console.log('   → Log in if prompted');
  console.log('   → Click "Deploy PostgreSQL"');
  console.log('   → Once created: go to Postgres service → Connect tab');
  console.log('   → Copy the DATABASE_URL and paste it in your .env file');

  console.log('\n─────────────────────────────────────────────');
  console.log('Once both values are copied, update your .env file:');
  console.log('  CLAUDE_API_KEY=sk-ant-...');
  console.log('  DATABASE_URL=postgresql://...');
  console.log('─────────────────────────────────────────────');
  console.log('\nPress Ctrl+C here when you are done.');

  // Keep browser open until user is done
  await new Promise(() => {});
})();
