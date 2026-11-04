// @ts-check
// src/agent/approvals.js
// Human-in-the-loop approval for tools with external effects (ADR-010).
// When the agent calls an `external` tool, the validated call is parked as a
// pending approval and the user gets Approve / Cancel buttons. Only the user's
// tap executes it; the agent can never approve its own request.
// Docs: docs/modules/agent.md → Approvals

const prisma = require('../db');
const { emit, KINDS } = require('../interactions');

const APPROVAL_TYPE = 'approval';
const TTL_MINUTES = 30;

const APPROVAL_BUTTONS = Object.freeze([
  { id: 'approval_yes', title: 'Approve' },
  { id: 'approval_no', title: 'Cancel' },
]);

/**
 * @typedef {Object} ApprovalRequest
 * @property {string} toolName
 * @property {unknown} input     Already validated against the tool's schema
 * @property {string} summary    Human-readable description of the action
 */

/**
 * Park requests for this user (replaces any older pending approval).
 * @param {string} userId
 * @param {ApprovalRequest[]} requests
 */
async function savePendingApprovals(userId, requests) {
  await prisma.pendingAction.deleteMany({ where: { userId, type: APPROVAL_TYPE } });
  await prisma.pendingAction.create({
    data: {
      userId,
      type: APPROVAL_TYPE,
      items: /** @type {any} */ (requests),
      expiresAt: new Date(Date.now() + TTL_MINUTES * 60 * 1000),
    },
  });
  for (const r of requests) await emit({ kind: KINDS.APPROVAL_REQUESTED, userId, summary: r.summary, payload: { tool: r.toolName } });
}

/**
 * Take (and remove) the pending approvals, if any are still valid.
 * Atomic delete-then-use means a double tap can't execute twice.
 * @param {string} userId
 * @returns {Promise<ApprovalRequest[] | null>}
 */
async function takePendingApprovals(userId) {
  const pending = await prisma.pendingAction.findFirst({
    where: { userId, type: APPROVAL_TYPE, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!pending) return null;
  const { count } = await prisma.pendingAction.deleteMany({ where: { id: pending.id } });
  if (count !== 1) return null; // another request consumed it first
  return /** @type {any} */ (pending.items);
}

/**
 * Handle the user's APPROVE / REJECT reply.
 * @param {{ id: string }} user
 * @param {'APPROVE' | 'REJECT'} decision
 * @param {(name: string, input: unknown) => Promise<{ ok: boolean, result?: any, error?: string }>} executeApproved
 * @returns {Promise<string | null>} reply text, or null if nothing was pending
 */
async function resolveApproval(user, decision, executeApproved) {
  const requests = await takePendingApprovals(user.id);
  if (!requests) return null;

  if (decision === 'REJECT') {
    for (const r of requests) await emit({ kind: KINDS.APPROVAL_REJECTED, userId: user.id, summary: r.summary, payload: { tool: r.toolName } });
    return `Cancelled — nothing was done.`;
  }

  const lines = [];
  for (const r of requests) {
    const outcome = await executeApproved(r.toolName, r.input);
    await emit({ kind: KINDS.APPROVAL_GRANTED, userId: user.id, summary: r.summary, payload: { tool: r.toolName, ok: outcome.ok } });
    lines.push(outcome.ok ? `✓ ${r.summary}` : `✗ ${r.summary}: ${outcome.error}`);
  }
  return lines.join('\n');
}

module.exports = { savePendingApprovals, takePendingApprovals, resolveApproval, APPROVAL_BUTTONS, APPROVAL_TYPE };
