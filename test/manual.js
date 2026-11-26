// test/manual.js
// Interactive tester — type any message, see Orga's reply in server terminal.
// Sends requests with valid HMAC signature.
// Run with: node test/manual.js

require('dotenv').config();
const readline = require('readline');
const http     = require('http');
const crypto   = require('crypto');

const SERVER   = 'http://localhost:3000';
const FROM     = process.env.TEST_PHONE || '919876543210'; // set TEST_PHONE in .env to test with your own number
let   msgCount = 0;

const rl = readline.createInterface({
  input:  process.stdin,
  output: process.stdout,
});

console.log('\n─────────────────────────────────────────');
console.log('  Orga Manual Tester');
console.log('  Check the SERVER terminal for [DEV] replies.');
console.log('');
console.log('  Try:');
console.log('    met rahul today, logo budget 50k');
console.log('    tasks: call bank, send invoice');
console.log('    remind me tomorrow 9am to call ravi');
console.log('    done 1');
console.log('    /today  /notes  /search rahul');
console.log('    /client rahul  /help  /export');
console.log('    delete rahul   edit rahul');
console.log('');
console.log('  Type "exit" to quit.');
console.log('─────────────────────────────────────────\n');

function sendToServer(text) {
  return new Promise((resolve, reject) => {
    msgCount++;
    const payload = JSON.stringify({
      entry: [{
        changes: [{
          value: {
            messages: [{
              from:      FROM,
              id:        `manual_${Date.now()}_${msgCount}`,
              type:      'text',
              text:      { body: text },
              timestamp: String(Math.floor(Date.now() / 1000)),
            }],
            contacts: [{ profile: { name: 'Nitya' }, wa_id: FROM }],
          },
        }],
      }],
    });

    // Generate valid HMAC signature
    const sig = 'sha256=' + crypto
      .createHmac('sha256', process.env.APP_SECRET)
      .update(payload)
      .digest('hex');

    const options = {
      hostname: 'localhost',
      port:     3000,
      path:     '/webhook',
      method:   'POST',
      headers:  {
        'Content-Type':        'application/json',
        'Content-Length':      Buffer.byteLength(payload),
        'X-Hub-Signature-256': sig,
      },
    };

    const req = http.request(options, res => {
      resolve(res.statusCode);
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function ask() {
  rl.question('You: ', async (input) => {
    input = input.trim();
    if (!input) return ask();

    if (input.toLowerCase() === 'exit') {
      console.log('\nBye!\n');
      rl.close();
      return;
    }

    try {
      const status = await sendToServer(input);
      if (status === 200) {
        console.log('→ Check server terminal for reply.\n');
      } else {
        console.log(`→ Server returned ${status}\n`);
      }
    } catch (err) {
      if (err.code === 'ECONNREFUSED') {
        console.log('✗ Server not running. Start with: npm run dev\n');
      } else {
        console.log('✗ Error:', err.message, '\n');
      }
    }

    ask();
  });
}

// Check server is up first
http.get(`${SERVER}/`, res => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      if (json.status === 'ok') {
        console.log('✓ Server is running\n');
        ask();
      }
    } catch {
      console.log('✗ Server not responding correctly');
      rl.close();
    }
  });
}).on('error', () => {
  console.log('✗ Server not running. Open a new terminal and run: npm run dev\n');
  rl.close();
});
