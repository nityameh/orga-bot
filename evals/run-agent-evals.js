// evals/run-agent-evals.js
// Runs the agent eval suite (ADR-013) against the configured LLM provider with
// FAKE tools: the real tool names, descriptions and schemas, but execute()
// records the call and returns a fixture. This isolates the model's decisions
// (which tools, which arguments, what reply) from the database.
//
//   npm run evals                      all cases
//   npm run evals -- --suite time      one suite
//   npm run evals -- --case greeting   one case
//   npm run evals -- --update-baseline write the pass rate to evals/baseline.json
//
// Exit code 1 if the pass rate drops more than 2 points below the baseline for
// this provider/model. Costs real API tokens: the summary prints the total.
// Docs: docs/modules/agent.md → Evals

require('dotenv').config();
process.env.DATABASE_URL ||= 'postgresql://unused:unused@localhost:5432/unused'; // tools are faked

const fs = require('fs');
const path = require('path');
const { getConfig } = require('../src/config');
const { selectProvider } = require('../src/agent');
const { createAnthropicProvider } = require('../src/llm/anthropicProvider');
const { createGroqProvider } = require('../src/llm/groqProvider');
const { createToolRegistry, ToolInputError } = require('../src/agent/toolRegistry');
const { runAgentTurn } = require('../src/agent/agent');
const { loadPrompt, buildDynamicContext, PROMPT_VERSION } = require('../src/agent/prompt');
const allTools = [
  ...Object.values(require('../src/agent/tools/notes')),
  ...Object.values(require('../src/agent/tools/tasks')),
  ...Object.values(require('../src/agent/tools/reminders')),
];

const ALLOWED_DROP = 0.02;
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

// Generic fixtures so tools return plausible data when a case doesn't specify one.
const DEFAULT_RESULTS = {
  save_note: (a) => ({ noteId: 'n_new', title: a.title, tags: a.tags ?? [] }),
  search_notes: () => ({ matches: [] }),
  create_task_list: (a) => ({ taskId: 't_new', title: a.title, items: a.items.map((text, i) => ({ itemId: i + 1, text })) }),
  list_tasks: () => ({ lists: [] }),
  complete_task_item: () => ({ done: 'item', remaining: 0 }),
  create_reminder: (a) => ({ reminderId: 'r_new', title: a.title, when: a.fireAt }),
  list_reminders: () => ({ reminders: [] }),
  cancel_reminder: () => ({ cancelled: 'reminder' }),
  get_today: () => ({ now: 'Thu, 5 Nov 2026, 10:00 am', remindersToday: [], openTaskItems: [], openTaskCount: 0 }),
};

function fakeRegistry(fixtures, calls) {
  return createToolRegistry(allTools.map((tool) => ({
    ...tool,
    async execute(input) {
      calls.push({ name: tool.name, args: input });
      const fixture = fixtures?.[tool.name];
      if (fixture?.__error) throw new ToolInputError(fixture.__error);
      return fixture ?? DEFAULT_RESULTS[tool.name](input);
    },
  })));
}

// ─── Grading ───────────────────────────────────────────────────────────────

function toRegex(pattern) {
  const ci = pattern.startsWith('(?i)');
  return new RegExp(ci ? pattern.slice(4) : pattern, ci ? 'i' : '');
}

function matches(actual, expected) {
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if ('startsWith' in expected) return typeof actual === 'string' && actual.startsWith(expected.startsWith);
    if ('contains' in expected) return typeof actual === 'string' && actual.toLowerCase().includes(expected.contains.toLowerCase());
    if ('regex' in expected) return typeof actual === 'string' && toRegex(expected.regex).test(actual);
    if ('length' in expected) return Array.isArray(actual) && actual.length === expected.length;
    if ('includesAll' in expected) return Array.isArray(actual) && expected.includesAll.every((v) => actual.map((a) => String(a).toLowerCase()).includes(v.toLowerCase()));
  }
  if (typeof expected === 'string') return String(actual ?? '').toLowerCase() === expected.toLowerCase();
  return actual === expected;
}

/** @returns {string[]} failure reasons (empty = pass) */
function grade(expect, calls, reply) {
  const failures = [];
  const called = calls.map((c) => c.name);

  for (const want of expect.tools ?? []) {
    const candidates = calls.filter((c) => c.name === want.name);
    if (!candidates.length) { failures.push(`expected call to ${want.name}`); continue; }
    if (want.args) {
      const ok = candidates.some((c) => Object.entries(want.args).every(([k, v]) => matches(c.args?.[k], v)));
      if (!ok) failures.push(`${want.name} args ${JSON.stringify(candidates.map((c) => c.args))} don't match ${JSON.stringify(want.args)}`);
    }
  }
  for (const banned of expect.forbiddenTools ?? []) {
    if (called.includes(banned)) failures.push(`must not call ${banned}`);
  }
  if (expect.noTools && calls.length) failures.push(`expected no tools, got ${called.join(', ')}`);
  if (expect.replyMatches && !toRegex(expect.replyMatches).test(reply)) failures.push(`reply should match /${expect.replyMatches}/`);
  if (expect.replyMatchesRegexAny && !expect.replyMatchesRegexAny.some((p) => toRegex(p).test(reply))) failures.push(`reply should match one of ${expect.replyMatchesRegexAny.join(' | ')}`);
  if (expect.replyExcludesRegex && toRegex(expect.replyExcludesRegex).test(reply)) failures.push(`reply must not match /${expect.replyExcludesRegex}/`);
  return failures;
}

// ─── Run ───────────────────────────────────────────────────────────────────

async function main() {
  const config = getConfig();
  const choice = selectProvider(config);
  if (!choice) {
    console.error('No LLM provider configured (set ANTHROPIC_API_KEY or GROQ_API_KEY).');
    process.exit(2);
  }
  const provider = choice.name === 'anthropic'
    ? createAnthropicProvider({ apiKey: choice.apiKey, model: choice.model, effort: config.AGENT_EFFORT })
    : createGroqProvider({ apiKey: choice.apiKey, model: choice.model });

  const spec = JSON.parse(fs.readFileSync(path.join(__dirname, 'agent', 'cases.json'), 'utf8'));
  const now = new Date(spec.now);
  const systemPrompt = loadPrompt();
  const cases = spec.cases
    .filter((c) => !flag('--suite') || c.suite === flag('--suite'))
    .filter((c) => !flag('--case') || c.id === flag('--case'));

  console.log(`Running ${cases.length} cases on ${provider.name}/${provider.model} (prompt ${PROMPT_VERSION})\n`);
  const results = [];
  let costMicros = 0;

  for (const c of cases) {
    const calls = [];
    const started = Date.now();
    let reply = '';
    let failures;
    try {
      const turn = await runAgentTurn(
        { provider, tools: fakeRegistry(c.fixtures, calls), systemPrompt, maxSteps: 6 },
        { ctx: { user: { id: 'eval' }, now }, history: [], text: c.input, dynamicSystem: buildDynamicContext({ now, channel: 'whatsapp' }) },
      );
      reply = turn.text;
      costMicros += turn.costMicros;
      failures = grade(c.expect, calls, reply);
    } catch (err) {
      failures = [`error: ${err.message}`];
    }
    const pass = failures.length === 0;
    results.push({ id: c.id, suite: c.suite, pass, failures, calls, reply, ms: Date.now() - started });
    console.log(`${pass ? '✓' : '✗'} ${c.id.padEnd(28)} ${pass ? '' : failures.join('; ')}`);
    if (provider.name === 'groq') await new Promise((r) => setTimeout(r, 1500)); // free-tier rate limits
  }

  const passed = results.filter((r) => r.pass).length;
  const passRate = passed / results.length;
  const bySuite = {};
  for (const r of results) {
    bySuite[r.suite] ??= { passed: 0, total: 0 };
    bySuite[r.suite].total++;
    if (r.pass) bySuite[r.suite].passed++;
  }

  console.log(`\nPass rate: ${(passRate * 100).toFixed(1)}% (${passed}/${results.length})`);
  for (const [suite, s] of Object.entries(bySuite)) console.log(`  ${suite.padEnd(10)} ${s.passed}/${s.total}`);
  console.log(`Cost: $${(costMicros / 1e6).toFixed(4)}`);

  const key = `${provider.name}/${provider.model}`;
  const reportDir = path.join(__dirname, 'reports');
  fs.mkdirSync(reportDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const report = { key, prompt: PROMPT_VERSION, passRate, passed, total: results.length, bySuite, costUSD: costMicros / 1e6, results };
  fs.writeFileSync(path.join(reportDir, `${stamp}-${provider.name}.json`), JSON.stringify(report, null, 2));

  // Baseline comparison only for full-suite runs.
  const isFullRun = !flag('--suite') && !flag('--case');
  const baselinePath = path.join(__dirname, 'baseline.json');
  const baseline = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')) : {};

  if (isFullRun && args.includes('--update-baseline')) {
    baseline[key] = { passRate: Number(passRate.toFixed(3)), total: results.length, prompt: PROMPT_VERSION, date: new Date().toISOString().slice(0, 10) };
    fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + '\n');
    console.log(`Baseline updated for ${key}`);
  } else if (isFullRun && baseline[key] && passRate < baseline[key].passRate - ALLOWED_DROP) {
    console.error(`\n✗ Regression: ${(passRate * 100).toFixed(1)}% < baseline ${(baseline[key].passRate * 100).toFixed(1)}% − ${ALLOWED_DROP * 100}pts`);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { grade, matches };
