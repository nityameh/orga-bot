// test/classifier.test.js
// Run with: node test/classifier.test.js
// No Jest needed — plain Node. No WhatsApp needed.
// Tests the Groq classifier in isolation.

require('dotenv').config();
const { classify } = require('../src/classifier');

const tests = [
  // REMINDER
  { input: 'remind me tomorrow at 9am to call Ravi',
    expect: { type: 'REMINDER', hasDatetime: true, client: 'ravi' } },

  { input: 'in 2 hours remind me to send the invoice',
    expect: { type: 'REMINDER', hasDatetime: true } },

  { input: 'tonight at 8pm follow up with priya',
    expect: { type: 'REMINDER', hasDatetime: true, client: 'priya' } },

  { input: 'next friday 3pm meeting with acme team',
    expect: { type: 'REMINDER', hasDatetime: true, client: 'acme' } },

  // NOTE
  { input: 'note: logo concepts for acme — minimal, serif, dark bg',
    expect: { type: 'NOTE', client: 'acme' } },

  { input: 'meeting with rahul was good, he wants proposal by friday',
    expect: { type: 'NOTE', client: 'rahul' } },

  { input: 'idea: add voice note support to the app',
    expect: { type: 'NOTE' } },

  { input: 'password for acme staging server is abc123',
    expect: { type: 'NOTE', client: 'acme' } },

  // TASK
  { input: 'tasks: send invoice, review brief, follow up priya',
    expect: { type: 'TASK' } },

  { input: 'todo: buy groceries, call bank, submit assignment',
    expect: { type: 'TASK' } },

  { input: 'task list for today: 1) finish design 2) send email 3) update sheet',
    expect: { type: 'TASK' } },

  // SEARCH
  { input: 'what did I save about the acme project?',
    expect: { type: 'SEARCH', client: 'acme' } },

  { input: 'find my notes on logo design',
    expect: { type: 'SEARCH' } },

  { input: '/search rahul',
    expect: { type: 'SEARCH' } },

  // COMMANDS
  { input: '/today',
    expect: { type: 'TODAY' } },

  { input: 'what do I have today',
    expect: { type: 'TODAY' } },

  { input: '/notes',
    expect: { type: 'LIST' } },

  { input: '/notes #acme',
    expect: { type: 'LIST' } },

  { input: '/schedule',
    expect: { type: 'SCHEDULE' } },

  // HINGLISH edge case
  { input: 'kal subah 9 baje remind karna rahul ko call karne ke liye',
    expect: { type: 'REMINDER' } },

  { input: 'hello',
    expect: { type: 'UNKNOWN' } },
];

async function runTests() {
  console.log(`\nRunning ${tests.length} classifier tests (using Groq)...\n`);

  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const test of tests) {
    try {
      const result = await classify(test.input);
      const errors = [];

      if (result.type !== test.expect.type) {
        errors.push(`type: expected "${test.expect.type}" got "${result.type}"`);
      }
      if (test.expect.hasDatetime && !result.datetime) {
        errors.push(`datetime: expected a datetime but got null`);
      }
      if (test.expect.client && result.client !== test.expect.client) {
        errors.push(`client: expected "${test.expect.client}" got "${result.client}"`);
      }

      if (errors.length === 0) {
        console.log(`  ✅  "${test.input.substring(0, 55)}"`);
        passed++;
      } else {
        console.log(`  ❌  "${test.input.substring(0, 55)}"`);
        errors.forEach(e => console.log(`       → ${e}`));
        failed++;
        failures.push({ input: test.input, errors });
      }

      // Small delay to stay within Groq free tier rate limits
      await new Promise(r => setTimeout(r, 200));

    } catch (err) {
      console.log(`  💥  "${test.input.substring(0, 55)}" — ERROR: ${err.message}`);
      failed++;
    }
  }

  console.log('\n─────────────────────────────────────');
  console.log(`Results: ${passed}/${tests.length} passed`);
  const pct = Math.round((passed / tests.length) * 100);
  console.log(`Accuracy: ${pct}%`);

  if (pct >= 90) {
    console.log('✅ PASS — classifier ready for Phase 3');
  } else {
    console.log('❌ FAIL — tune system prompt until accuracy >= 90%');
    if (failures.length) {
      console.log('\nFailing cases:');
      failures.forEach(f => {
        console.log(`  "${f.input}"`);
        f.errors.forEach(e => console.log(`    → ${e}`));
      });
    }
  }
  console.log('─────────────────────────────────────\n');
}

runTests().catch(console.error);
