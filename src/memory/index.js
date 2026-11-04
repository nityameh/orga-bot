// @ts-check
// src/memory/index.js
// Composition root: local embedder (unless disabled), memory service, and an
// event-bus subscriber that keeps embeddings in sync with notes and tasks —
// producers (handlers, agent tools) don't know indexing exists (Observer).
// Docs: docs/modules/memory.md

const prisma = require('../db');
const { getConfig } = require('../config');
const { createLocalEmbedder } = require('./embedder');
const { createMemoryService } = require('./service');
const { subscribe, KINDS } = require('../interactions');
const { log, warn } = require('../logger');

const config = getConfig();
const mode = config.EMBEDDINGS ?? (config.NODE_ENV === 'test' ? 'off' : 'local');
const embedder = mode === 'local'
  ? createLocalEmbedder({ model: config.EMBEDDING_MODEL, cacheDir: config.MODEL_CACHE_DIR })
  : null;

const memory = createMemoryService({ prisma, embedder });
log('memory.configured', { embeddings: mode, model: embedder?.model });

if (embedder) {
  subscribe(async (event) => {
    const p = /** @type {any} */ (event.payload) ?? {};
    try {
      if (event.kind === KINDS.NOTE_CREATED && p.noteId) await memory.index('note', p.noteId);
      if (event.kind === KINDS.NOTE_DELETED && p.noteId) await memory.index('note', p.noteId); // removes it
      if ((event.kind === KINDS.TASK_CREATED || event.kind === KINDS.TASK_ITEM_COMPLETED) && p.taskId) await memory.index('task', p.taskId);
    } catch (err) {
      // Indexing is best-effort: search falls back to keywords for this item.
      warn('memory.index_failed', { kind: event.kind, err: /** @type {Error} */ (err).message });
    }
  });
}

module.exports = { memory };
