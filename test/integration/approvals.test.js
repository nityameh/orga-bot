// test/integration/approvals.test.js
// Approval lifecycle on a real database: park → approve (once) / reject / expire.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
const prisma = require('../../src/db');
const { savePendingApprovals, resolveApproval } = require('../../src/agent/approvals');

let user;
const request = { toolName: 'create_calendar_event', input: { title: 'Acme review' }, summary: 'Add "Acme review" to your calendar' };

beforeAll(async () => {
  user = await prisma.user.upsert({ where: { phone: '910000000040' }, update: {}, create: { phone: '910000000040' } });
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.$disconnect();
});

describe('approvals', () => {
  it('executes on APPROVE, exactly once even on a double tap', async () => {
    await savePendingApprovals(user.id, [request]);
    const execute = vi.fn().mockResolvedValue({ ok: true, result: {} });

    const [first, second] = await Promise.all([
      resolveApproval(user, 'APPROVE', execute),
      resolveApproval(user, 'APPROVE', execute),
    ]);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith('create_calendar_event', { title: 'Acme review' });
    expect([first, second].filter(Boolean)).toEqual(['✓ Add "Acme review" to your calendar']);
  });

  it('does nothing on REJECT and records the decision', async () => {
    await savePendingApprovals(user.id, [request]);
    const execute = vi.fn();
    expect(await resolveApproval(user, 'REJECT', execute)).toMatch(/Cancelled/);
    expect(execute).not.toHaveBeenCalled();
    expect(await prisma.interaction.count({ where: { userId: user.id, kind: 'approval.rejected' } })).toBe(1);
  });

  it('ignores expired approvals', async () => {
    await savePendingApprovals(user.id, [request]);
    await prisma.pendingAction.updateMany({ where: { userId: user.id, type: 'approval' }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const execute = vi.fn();
    expect(await resolveApproval(user, 'APPROVE', execute)).toBeNull();
    expect(execute).not.toHaveBeenCalled();
  });

  it('reports a failed execution to the user', async () => {
    await savePendingApprovals(user.id, [request]);
    const reply = await resolveApproval(user, 'APPROVE', async () => ({ ok: false, error: 'Start time is in the past.' }));
    expect(reply).toBe('✗ Add "Acme review" to your calendar: Start time is in the past.');
  });
});
