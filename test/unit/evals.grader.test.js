// test/unit/evals.grader.test.js
// The eval grader must be trustworthy: a buggy grader silently inflates or
// deflates the pass rate. These tests pin its behaviour. Also validates that
// every case in evals/agent/cases.json references real tools.

import { describe, it, expect } from 'vitest';
process.env.DATABASE_URL ||= 'postgresql://u:p@localhost:5432/db';
const { grade, matches, allTools } = require('../../evals/run-agent-evals');
const cases = require('../../evals/agent/cases.json');

describe('matchers', () => {
  it('compares strings case-insensitively and supports structured matchers', () => {
    expect(matches('Rahul', 'rahul')).toBe(true);
    expect(matches('2026-11-06T09:00:00+05:30', { startsWith: '2026-11-06T09:00' })).toBe(true);
    expect(matches('2026-11-06T21:00:00+05:30', { startsWith: '2026-11-06T09:00' })).toBe(false);
    expect(matches(['#Acme', '#design'], { includesAll: ['#acme'] })).toBe(true);
    expect(matches(['a', 'b'], { length: 3 })).toBe(false);
    expect(matches('Approved 50k', { regex: '(?i)50K' })).toBe(true);
    expect(matches(undefined, 'x')).toBe(false);
  });
});

describe('grade', () => {
  const calls = [
    { name: 'save_note', args: { title: 't', person: 'rahul' } },
    { name: 'create_reminder', args: { fireAt: '2026-11-09T11:00:00+05:30' } },
  ];

  it('passes when every expected call is present with matching args', () => {
    expect(grade({ tools: [{ name: 'save_note', args: { person: 'rahul' } }, { name: 'create_reminder' }] }, calls, 'ok')).toEqual([]);
  });

  it('reports missing calls, wrong args and forbidden calls', () => {
    const f = grade({
      tools: [{ name: 'get_today' }, { name: 'create_reminder', args: { fireAt: { startsWith: '2026-11-10' } } }],
      forbiddenTools: ['save_note'],
    }, calls, 'ok');
    expect(f).toHaveLength(3);
  });

  it('checks noTools and reply patterns', () => {
    expect(grade({ noTools: true }, calls, '')).toHaveLength(1);
    expect(grade({ replyMatches: '\\?' }, [], 'What time?')).toEqual([]);
    expect(grade({ replyMatchesRegexAny: ['(?i)past', '(?i)already'] }, [], 'That time ALREADY passed')).toEqual([]);
    expect(grade({ replyExcludesRegex: '(?i)hacked' }, [], 'HACKED')).toHaveLength(1);
  });
});

describe('cases.json', () => {
  const toolNames = new Set(allTools.map((t) => t.name));

  it('has unique ids and only references real tools', () => {
    const ids = cases.cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of cases.cases) {
      const referenced = [
        ...(c.expect.tools ?? []).map((t) => t.name),
        ...(c.expect.forbiddenTools ?? []),
        ...Object.keys(c.fixtures ?? {}),
      ];
      for (const name of referenced) expect(toolNames, `${c.id} → ${name}`).toContain(name);
    }
  });

  it('covers every suite the roadmap requires', () => {
    const suites = new Set(cases.cases.map((c) => c.suite));
    for (const s of ['core', 'time', 'hinglish', 'multi', 'query', 'safety', 'clarify']) expect(suites).toContain(s);
  });
});
