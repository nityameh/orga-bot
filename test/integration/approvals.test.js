// test/integration/approvals.test.js
// Approval bookkeeping on a real database: the paused LangGraph turn (thread id)
// is resumed exactly once on APPROVE/REJECT, and expired approvals are ignored.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
const prisma = require('../../src/db');
const { savePendingApprovals, resolveApproval } = require('../../src/agent/approvals');

let user;
const pending = {
  threadId: 'turn:test-1',
  requests: [{ toolName: 'create_calendar_event', input: { title: 'Acme review' }, summary: 'Add "Acme review" to your calendar' }],
};

beforeAll(async () => {
  user = await prisma.user.upsert({ where: { phone: '910000000040' }, update: {}, create: { phone: '910000000040' } });
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.$disconnect();
});

describe('approvals', () => {
  it('resumes the paused turn exactly once, even on a double tap', async () => {
    await savePendingApprovals(user.id, pending);
    const resume = vi.fn().mockResolvedValue('Done — added to your calendar.');

    const [first, second] = await Promise.all([
      resolveApproval(user, 'APPROVE', resume),
      resolveApproval(user, 'APPROVE', resume),
    ]);

    expect(resume).toHaveBeenCalledTimes(1);
    expect(resume).toHaveBeenCalledWith('turn:test-1');
    expect([first, second].filter(Boolean)).toEqual(['Done — added to your calendar.']);
    expect(await prisma.interaction.count({ where: { userId: user.id, kind: 'approval.granted' } })).toBe(1);
  });

  it('records a rejection and still resumes so the agent can acknowledge it', async () => {
    await savePendingApprovals(user.id, pending);
    const resume = vi.fn().mockResolvedValue('Okay, I won’t add it.');
    expect(await resolveApproval(user, 'REJECT', resume)).toBe('Okay, I won’t add it.');
    expect(await prisma.interaction.count({ where: { userId: user.id, kind: 'approval.rejected' } })).toBe(1);
  });

  it('ignores expired approvals', async () => {
    await savePendingApprovals(user.id, pending);
    await prisma.pendingAction.updateMany({ where: { userId: user.id, type: 'approval' }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const resume = vi.fn();
    expect(await resolveApproval(user, 'APPROVE', resume)).toBeNull();
    expect(resume).not.toHaveBeenCalled();
  });
});
