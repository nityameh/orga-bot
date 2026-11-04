// test/curl-test.js — Automated feature tester
// Sends messages via webhook with valid HMAC signature
// Usage: node test/curl-test.js

require('dotenv').config();
const crypto = require('crypto');
const http = require('http');

const PHONE = '919876543210';
let msgId = 100;

async function send(text) {
  msgId++;
  const id = `test_${msgId}_${Date.now()}`;

  const body = JSON.stringify({
    entry: [{
      changes: [{
        value: {
          messages: [{
            from: PHONE, id, type: 'text',
            text: { body: text },
            timestamp: String(Math.floor(Date.now() / 1000)),
          }],
          contacts: [{ profile: { name: 'Nitya' }, wa_id: PHONE }],
        },
      }],
    }],
  });

  const sig = 'sha256=' + crypto
    .createHmac('sha256', process.env.APP_SECRET)
    .update(body)
    .digest('hex');

  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost', port: 3000, path: '/webhook',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': sig,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      resolve(res.statusCode);
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function test(label, text, delayMs = 2000) {
  process.stdout.write(`\n--- ${label} ---\n> "${text}"\n`);
  const status = await send(text);
  process.stdout.write(`  HTTP ${status}\n`);
  await new Promise(r => setTimeout(r, delayMs));
}

async function run() {
  console.log('=== Orga Feature Test ===');
  console.log('Watch the server terminal for [DEV] replies\n');

  // 1. Note
  await test('SAVE NOTE', 'met rahul today, he wants the logo by friday, budget 50k');

  // 2. Task
  await test('CREATE TASK', 'tasks: send invoice, call bank, review brief');

  // 3. Reminder
  await test('SET REMINDER', 'remind me tomorrow 9am to follow up with rahul on proposal');

  // 4. /today
  await test('TODAY', '/today');

  // 5. /notes
  await test('NOTES LIST', '/notes');

  // 6. /list (tasks)
  await test('TASK LIST', '/list');

  // 7. /schedule
  await test('SCHEDULE', '/schedule');

  // 8. /search keyword
  await test('SEARCH KEYWORD', '/search rahul');

  // 9. /search time
  await test('SEARCH TIME', '/search this week');

  // 10. /client
  await test('CLIENT VIEW', '/client rahul');

  // 11. /help
  await test('HELP', '/help');

  // 12. /export
  await test('EXPORT', '/export');

  // 13. /privacy
  await test('PRIVACY', '/privacy');

  // 14. done 1 (task completion)
  await test('DONE TASK', 'done 1');

  // 15. Natural language completion
  await test('NATURAL DONE', 'completed task 2');

  // 16. Text-based delete (should show confirmation options)
  await test('TEXT DELETE', 'delete rahul');

  // 17. Edit text-based (should show confirmation options)
  await test('TEXT EDIT', 'edit rahul');

  // 18. Unknown / greeting
  await test('GREETING', 'hello');

  console.log('\n=== DONE — Check server terminal for all replies ===');
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
