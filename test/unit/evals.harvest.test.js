// test/unit/evals.harvest.test.js
// Anonymisation and the harvest → review → promote workflow (ADR-017).

import { describe, it, expect } from 'vitest';
const { anonymize } = require('../../src/evals/anonymize');
const { buildCandidates, promote } = require('../../src/evals/harvest');

describe('anonymize', () => {
  it('masks emails, links, Indian phone numbers, long numbers, PAN and Aadhaar-like ids', () => {
    const { text, replacements } = anonymize(
      'mail ravi@acme.com, see https://acme.com/x?y=1, call +91 98765 43210 or 9876543210, order 4400123, PAN ABCDE1234F, aadhaar 1234 5678 9012',
    );
    expect(text).toBe('mail user@example.com, see https://example.com call 9XXXXXXXXX or 9XXXXXXXXX, order 000000, PAN XXXXX0000X, aadhaar 0000 0000 0000');
    expect(replacements).toBe(7);
  });

  it('replaces known people consistently, longest name first, case-insensitively', () => {
    const { text } = anonymize('Ravi Kumar said Ravi will pay. RAVI KUMAR confirmed with Priya.', { people: ['ravi', 'ravi kumar', 'priya'] });
    expect(text).toBe('Person1 said Person3 will pay. Person1 confirmed with Person2.'); // numbered longest-first; consistent per name
  });

  it('keeps Hinglish and times intact', () => {
    expect(anonymize('kal shaam 5 baje dentist ka reminder laga do').text).toBe('kal shaam 5 baje dentist ka reminder laga do');
  });

  it('does not match names inside other words', () => {
    expect(anonymize('Ravindra and Ravi', { people: ['ravi'] }).text).toBe('Ravindra and Person1');
  });
});

describe('buildCandidates', () => {
  const at = new Date('2026-11-06T10:00:00Z');
  const rows = [
    { userId: 'u1', text: 'remind Ravi tomorrow 9am, his number is 9876543210', createdAt: at, turn: { tools: [{ name: 'create_reminder', ok: true }], outcome: 'answered' } },
    { userId: 'u1', text: 'hi', createdAt: at, turn: { tools: [], outcome: 'answered' } },
    { userId: 'u1', text: 'no turn recorded', createdAt: at, turn: null },
    { userId: 'u2', text: 'remind Ravi tomorrow 9am, his number is 9876543210', createdAt: at, turn: { tools: [{ name: 'create_reminder', ok: true }] } },
  ];

  it('anonymises, drafts expectations from observed tools, and marks every case unreviewed', () => {
    const c = buildCandidates(rows, { u1: ['ravi'] });
    expect(c[0]).toMatchObject({
      suite: 'real',
      input: 'remind Person1 tomorrow 9am, his number is 9XXXXXXXXX',
      expect: { tools: [{ name: 'create_reminder' }] },
      review: { approved: false, piiReplacements: 2, harvestedAt: '2026-11-06' },
    });
    expect(c[1].expect).toEqual({ noTools: true });
    expect(c.every((x) => x.id.startsWith('real-'))).toBe(true);
  });

  it('skips rows without an agent turn and de-duplicates identical anonymised messages', () => {
    const c = buildCandidates(rows, { u1: ['ravi'], u2: ['ravi'] });
    expect(c).toHaveLength(2); // u2's message anonymises to the same text as u1's
  });

  it('never re-harvests ids already in the eval set', () => {
    const first = buildCandidates(rows.slice(0, 1), { u1: ['ravi'] });
    expect(buildCandidates(rows.slice(0, 1), { u1: ['ravi'] }, new Set([first[0].id]))).toEqual([]);
  });
});

describe('promote', () => {
  it('moves only approved candidates into the spec, stripping review metadata', () => {
    const spec = { description: 'x', cases: [{ id: 'old', suite: 'core', input: 'a', expect: {} }] };
    const candidates = [
      { id: 'real-1', suite: 'real', input: 'b', observed: {}, expect: { tools: [{ name: 'save_note' }] }, review: { approved: true } },
      { id: 'real-2', suite: 'real', input: 'c', observed: {}, expect: {}, review: { approved: false } },
    ];
    const r = promote(spec, candidates);
    expect(r.promoted).toBe(1);
    expect(r.spec.cases.at(-1)).toEqual({ id: 'real-1', suite: 'real', input: 'b', expect: { tools: [{ name: 'save_note' }] } });
    expect(r.remaining.map((c) => c.id)).toEqual(['real-2']);
    expect(r.spec.description).toBe('x');
  });
});
