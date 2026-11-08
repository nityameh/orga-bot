// test/unit/analytics.test.js
// Pure analytics aggregations (src/analytics/insights.js), including IST edges.

import { describe, it, expect } from 'vitest';
const { dailySeries, activityHeatmap, peopleInsights, reminderFollowThrough } = require('../../src/analytics/insights');

const now = new Date('2026-11-06T06:30:00Z'); // Fri 6 Nov 2026, 12:00 IST

describe('dailySeries', () => {
  it('buckets by IST day, includes empty days, separates messages from actions', () => {
    const rows = [
      { kind: 'message.received', createdAt: new Date('2026-11-05T19:00:00Z') }, // 6 Nov 00:30 IST
      { kind: 'note.created', createdAt: new Date('2026-11-06T05:00:00Z') },
      { kind: 'approval.granted', createdAt: new Date('2026-11-06T05:00:00Z') },
      { kind: 'message.sent', createdAt: new Date('2026-11-06T05:00:00Z') },        // neither
      { kind: 'message.received', createdAt: new Date('2026-11-04T10:00:00Z') },    // 4 Nov
      { kind: 'message.received', createdAt: new Date('2026-10-01T10:00:00Z') },    // outside range
    ];
    expect(dailySeries(rows, 3, now)).toEqual([
      { date: '2026-11-04', messages: 1, actions: 0 },
      { date: '2026-11-05', messages: 0, actions: 0 },
      { date: '2026-11-06', messages: 1, actions: 2 },
    ]);
  });
});

describe('activityHeatmap', () => {
  it('maps to IST weekday (Monday first) and hour', () => {
    const grid = activityHeatmap([
      { kind: 'message.received', createdAt: new Date('2026-11-05T19:00:00Z') }, // Fri 00:30 IST
      { kind: 'message.received', createdAt: new Date('2026-11-09T03:30:00Z') }, // Mon 09:00 IST
      { kind: 'note.created', createdAt: new Date('2026-11-09T03:30:00Z') },     // ignored
    ]);
    expect(grid).toHaveLength(7);
    expect(grid[4][0]).toBe(1); // Friday, 00:xx
    expect(grid[0][9]).toBe(1); // Monday, 09:xx
    expect(grid.flat().reduce((a, b) => a + b, 0)).toBe(2);
  });
});

describe('peopleInsights', () => {
  it('flags people gone quiet and sorts them first, then by open tasks', () => {
    const day = 86400_000;
    const people = peopleInsights([
      { person: 'acme', count: 10, last: new Date(now.getTime() - 2 * day) },
      { person: 'ravi', count: 3, last: new Date(now.getTime() - 20 * day) },
      { person: 'priya', count: 5, last: new Date(now.getTime() - 1 * day) },
    ], { priya: 4 }, now);
    expect(people.map((p) => p.person)).toEqual(['ravi', 'priya', 'acme']);
    expect(people[0]).toMatchObject({ goneQuiet: true, daysSinceLast: 20, openTasks: 0 });
    expect(people[1]).toMatchObject({ goneQuiet: false, openTasks: 4 });
  });
});

describe('reminderFollowThrough', () => {
  it('counts done, missed after a grace period, upcoming, and the completion rate', () => {
    const h = 3600_000;
    const result = reminderFollowThrough([
      { status: 'done', fireAt: new Date(now.getTime() - 50 * h) },
      { status: 'done', fireAt: new Date(now.getTime() - 30 * h) },
      { status: 'fired', fireAt: new Date(now.getTime() - 30 * h) }, // missed
      { status: 'fired', fireAt: new Date(now.getTime() - 2 * h) },  // still within grace
      { status: 'pending', fireAt: new Date(now.getTime() + 2 * h) },
    ], now);
    expect(result).toEqual({ done: 2, missed: 1, upcoming: 1, completionRate: 0.667 });
  });

  it('returns null rate when nothing has been decided yet', () => {
    expect(reminderFollowThrough([], now).completionRate).toBeNull();
  });
});
