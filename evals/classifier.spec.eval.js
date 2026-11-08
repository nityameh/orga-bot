// test/classifier.spec.test.js
// Integration tests for the classifier using live Groq API.
// Run with: npm test

const { classify } = require('../src/classifier');

// Rate limit protection — Groq free tier has TPM limits
const delay = (ms = 500) => new Promise(r => setTimeout(r, ms));

describe('Classifier — Intent Detection', () => {

  describe('NOTE', () => {
    it('plain observation → NOTE', async () => {
      const r = await classify('met rahul today, he wants the logo by friday');
      expect(r.type).toBe('NOTE');
      expect(r.client).toBe('rahul');
      await delay();
    });

    it('prefixed "note:" → NOTE', async () => {
      const r = await classify('note: logo concepts for acme — minimal design');
      expect(r.type).toBe('NOTE');
      expect(r.client).toBe('acme');
      await delay();
    });
  });

  describe('TASK', () => {
    it('comma-separated tasks → TASK', async () => {
      const r = await classify('tasks: send invoice, call bank, review brief');
      expect(r.type).toBe('TASK');
      await delay();
    });

    it('append to existing list → TASK with append', async () => {
      const r = await classify('add to acme tasks: review brand brief');
      expect(r.type).toBe('TASK');
      expect(r.append).toBe(true);
      await delay();
    });
  });

  describe('REMINDER', () => {
    it('tomorrow with time → REMINDER', async () => {
      const r = await classify('remind me tomorrow 9am to call ravi');
      expect(r.type).toBe('REMINDER');
      expect(r.datetime).toBeTruthy();
      expect(r.client).toBe('ravi');
      await delay();
    });

    it('in N hours → REMINDER', async () => {
      const r = await classify('remind me in 2 hours to send proposal');
      expect(r.type).toBe('REMINDER');
      expect(r.datetime).toBeTruthy();
      await delay();
    });
  });

  describe('SEARCH', () => {
    it('/search command → SEARCH', async () => {
      const r = await classify('/search acme');
      expect(r.type).toBe('SEARCH');
      await delay();
    });
  });

  describe('QUERY (RAG)', () => {
    it('what did X say → QUERY', async () => {
      const r = await classify('what did rahul say about the budget?');
      expect(r.type).toBe('QUERY');
      expect(r.client).toBe('rahul');
      await delay();
    });

    it('summarize notes → QUERY', async () => {
      const r = await classify('summarize my notes on the logo project');
      expect(r.type).toBe('QUERY');
      await delay();
    });

    it('when was last → QUERY', async () => {
      const r = await classify('when was my last meeting with acme?');
      expect(r.type).toBe('QUERY');
      await delay();
    });
  });

  describe('Commands', () => {
    it('/today → TODAY', async () => {
      const r = await classify('/today');
      expect(r.type).toBe('TODAY');
      await delay();
    });

    it('/notes → LIST', async () => {
      const r = await classify('/notes');
      expect(r.type).toBe('LIST');
      await delay();
    });

    it('/schedule → SCHEDULE', async () => {
      const r = await classify('/schedule');
      expect(r.type).toBe('SCHEDULE');
      await delay();
    });

    it('hello → UNKNOWN', async () => {
      const r = await classify('hello');
      expect(r.type).toBe('UNKNOWN');
      await delay();
    });
  });

  describe('Client extraction', () => {
    it('person name → client', async () => {
      const r = await classify('follow up with priya about the design');
      expect(r.client).toBe('priya');
      await delay();
    });

    it('no person → null client', async () => {
      const r = await classify('buy groceries and milk');
      expect(r.client).toBeNull();
      await delay();
    });
  });
});
