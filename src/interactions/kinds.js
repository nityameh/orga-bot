// @ts-check
// src/interactions/kinds.js
// The closed list of Interaction kinds. Analytics queries and dashboard
// filters depend on these strings; add new kinds here (and to
// docs/modules/interactions.md), never rename existing ones.
// Docs: docs/modules/interactions.md

const KINDS = Object.freeze({
  MESSAGE_RECEIVED: 'message.received',
  MESSAGE_SENT: 'message.sent',
  USER_CREATED: 'user.created',
  CHANNEL_LINKED: 'channel.linked',
  NOTE_CREATED: 'note.created',
  NOTE_DELETED: 'note.deleted',
  TASK_CREATED: 'task.created',
  TASK_ITEM_COMPLETED: 'task.item_completed',
  REMINDER_CREATED: 'reminder.created',
  REMINDER_FIRED: 'reminder.fired',
  REMINDER_COMPLETED: 'reminder.completed',
  REMINDER_SNOOZED: 'reminder.snoozed',
  REMINDER_CANCELLED: 'reminder.cancelled',
  QUERY_ANSWERED: 'query.answered',
  DIGEST_SENT: 'digest.sent',
  AUTH_LOGIN: 'auth.login',
});

/** @type {Set<string>} */
const KIND_VALUES = new Set(Object.values(KINDS));

module.exports = { KINDS, KIND_VALUES };
