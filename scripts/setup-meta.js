// scripts/setup-meta.js
// Opens Meta Developer Portal to help set up WhatsApp Business API

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();

  console.log('Opening Meta Developer Portal...');
  await page.goto('https://developers.facebook.com/apps/');

  console.log('\n─────────────────────────────────────────────');
  console.log('STEP 1: Log in with your Facebook account');
  console.log('─────────────────────────────────────────────');
  console.log('Once logged in, tell me and I will guide next steps.');
  console.log('\nPress Ctrl+C when fully done with all steps.');

  await new Promise(() => {});
})();
