// @ts-check
// src/agent/approvals.js
// Human-in-the-loop approval for tools with external effects (ADR-010, ADR-015).
// When the agent calls an `external` tool, the LangGraph turn pauses with
// interrupt() and its state is checkpointed. This module remembers WHICH paused
// turn belongs to the user (thread id + human-readable summaries) and routes the
// user's Approve / Cancel tap back to it. The agent can never approve itself.
// Docs: docs/modules/integrations.md → Approvals

const prisma = require('../db');
const { emit, KINDS } = require('../interactions');

const APPROVAL_TYPE = 'approval';
const TTL_MINUTES = 30;

const APPROVAL_BUTTONS = Object.freeze([
  { id: 'approval_yes', title: 'Approve' },
  { id: 'approval_no', title: 'Cancel' },
]);

/**
 * @typedef {import('./agent').ApprovalRequest} ApprovalRequest
 * @typedef {{ threadId: string, requests: ApprovalRequest[] }} PendingApproval
 */

/**
 * Remember the paused turn for this user (replaces any older pending approval).
 * @param {string} userId
 * @param {PendingApproval} pending
 */
async function savePendingApprovals(userId, pending) {
  await prisma.pendingAction.deleteMany({ where: { userId, type: APPROVAL_TYPE } });
  await prisma.pendingAction.create({
    data: {
      userId,
      type: APPROVAL_TYPE,
      items: /** @type {any} */ (pending),
      expiresAt: new Date(Date.now() + TTL_MINUTES * 60 * 1000),
    },
  });
  for (const r of pending.requests) await emit({ kind: KINDS.APPROVAL_REQUESTED, userId, summary: r.summary, payload: { tool: r.toolName } });
}

/**
 * Take (and remove) the pending approval, if still valid. Delete-then-use is
 * atomic, so a double tap can't resume the turn twice.
 * @param {string} userId
 * @returns {Promise<PendingApproval | null>}
 */
async function takePendingApprovals(userId) {
  const row = await prisma.pendingAction.findFirst({
    where: { userId, type: APPROVAL_TYPE, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!row) return null;
  const { count } = await prisma.pendingAction.deleteMany({ where: { id: row.id } });
  if (count !== 1) return null; // another request consumed it first
  return /** @type {any} */ (row.items);
}

/**
 * Handle the user's APPROVE / REJECT reply by resuming the paused turn.
 * @param {{ id: string }} user
 * @param {'APPROVE' | 'REJECT'} decision
 * @param {(threadId: string) => Promise<string>} resume  resumes the graph, returns the agent's reply
 * @returns {Promise<string | null>} reply text, or null if nothing was pending
 */
async function resolveApproval(user, decision, resume) {
  const pending = await takePendingApprovals(user.id);
  if (!pending) return null;

  const kind = decision === 'APPROVE' ? KINDS.APPROVAL_GRANTED : KINDS.APPROVAL_REJECTED;
  for (const r of pending.requests) await emit({ kind, userId: user.id, summary: r.summary, payload: { tool: r.toolName } });
  return resume(pending.threadId);
}

module.exports = { savePendingApprovals, takePendingApprovals, resolveApproval, APPROVAL_BUTTONS, APPROVAL_TYPE };
