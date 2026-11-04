// src/handlers/query.js
// RAG (Retrieval-Augmented Generation) handler.
// User asks a question → retrieve relevant notes/tasks/reminders → LLM answers.
//
// Architecture:
//   1. Extract search signals from classified intent (client, tags, keywords)
//   2. Query DB for top matching documents (keyword search, not vector)
//   3. Format documents as context for LLM
//   4. Second LLM call: system prompt + context + user question → natural language answer
//   5. Reply with answer + source citations

const Groq = require('groq-sdk');
const prisma = require('../db');
const { reply } = require('../channels');
const { log, warn } = require('../logger');
const { emit, KINDS } = require('../interactions');

// Created lazily so the app can start without GROQ_API_KEY.
let groq;
function getGroq() {
  if (!groq) groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groq;
}

// ─── System prompt for answer generation ──────────────────────────────────

const ANSWER_PROMPT = `
You are an assistant answering questions for a freelancer based on their saved notes, tasks, and reminders.

RULES:
1. ONLY use information from the PROVIDED CONTEXT. Never make up facts.
2. If the answer is NOT in the context, say: "I don't have notes about that."
3. Always mention which note or item the information comes from (title + date).
4. Keep answers concise — 2-4 sentences max.
5. Use natural, conversational language. No bullet lists. No markdown.
6. If multiple notes are relevant, synthesize them into one coherent answer.
7. For time questions ("when"), always include the date.
8. For money questions ("how much"), always include the amount.
9. For status questions ("what's the status"), check both tasks and reminders.
`.trim();

// ─── Main handler ─────────────────────────────────────────────────────────

async function handleQuery(user, intent, message) {
  const question = message.text;

  // Step 1: Retrieve relevant context from DB
  const context = await retrieveContext(user.id, intent);
  const totalDocs = context.notes.length + context.tasks.length + context.reminders.length;

  if (totalDocs === 0) {
    await reply(message,
      `*Answer*\n\nI don't have any notes about that. Save some notes first and then ask me.`
    );
    log('query.no_context', { userId: user.id, question: question.substring(0, 60) });
    return;
  }

  // Step 2: Format context for LLM
  const contextText = formatContext(context);

  // Step 3: Generate answer via second LLM call
  let answer;
  try {
    const response = await getGroq().chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 300,
      temperature: 0.3,
      messages: [
        { role: 'system', content: ANSWER_PROMPT + '\n\nCONTEXT:\n' + contextText },
        { role: 'user',   content: question },
      ],
    });

    answer = response.choices[0]?.message?.content?.trim();
    if (!answer) throw new Error('Empty response');

  } catch (err) {
    warn('query.llm_error', { err: err.message });
    // Fallback: return the raw context as a list instead of an answer
    await reply(message,
      `*Answer*\n\nCouldn't generate an answer right now. Here's what I found:\n\n${fallbackList(context)}`
    );
    return;
  }

  // Step 4: Format reply with sources
  const sources = [
    ...context.notes.slice(0, 3).map(n => ({ title: n.title, date: n.createdAt })),
    ...context.tasks.slice(0, 2).map(t => ({ title: t.title, date: t.createdAt })),
  ];

  const sourceText = sources.map(s => {
    const date = new Date(s.date).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata',
    });
    return `"${s.title}" (${date})`;
  }).join(', ');

  const replyText = [
    `*Answer*`,
    ``,
    answer,
    ``,
    sourceText ? `_Sources: ${sourceText}_` : null,
  ].filter(Boolean).join('\n');

  await reply(message, replyText);
  log('query.answered', { userId: user.id, question: question.substring(0, 60), docsUsed: totalDocs });
  emit({ kind: KINDS.QUERY_ANSWERED, userId: user.id, person: intent.client, payload: { docsUsed: totalDocs } });
}

// ─── Retrieval: search DB for relevant documents ──────────────────────────

async function retrieveContext(userId, intent) {
  const keyword = extractKeyword(intent);
  const client  = intent.client;
  const tags    = intent.tags || [];

  // Build note search conditions from all signals
  const orConditions = [];
  if (keyword) {
    orConditions.push(
      { title: { contains: keyword, mode: 'insensitive' } },
      { body:  { contains: keyword, mode: 'insensitive' } },
    );
  }
  if (client) {
    orConditions.push(
      { client: { equals: client, mode: 'insensitive' } },
      { tags:   { has: `#${client}` } },
    );
  }
  for (const tag of tags) {
    orConditions.push({ tags: { has: tag } });
  }

  const noteWhere = { userId, deletedAt: null };
  if (orConditions.length > 0) noteWhere.OR = orConditions;

  // Run all queries in parallel
  const [notes, tasks, reminders] = await Promise.all([
    prisma.note.findMany({
      where: noteWhere,
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, title: true, body: true, client: true, tags: true, createdAt: true },
    }),
    prisma.task.findMany({
      where: {
        userId,
        ...(client || keyword ? {
          OR: [
            ...(client  ? [{ client: { contains: client, mode: 'insensitive' } }] : []),
            ...(keyword ? [{ title: { contains: keyword, mode: 'insensitive' } }] : []),
          ],
        } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.reminder.findMany({
      where: {
        userId,
        ...(keyword ? { title: { contains: keyword, mode: 'insensitive' } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  return { notes, tasks, reminders };
}

// ─── Extract the main keyword from the classified intent ──────────────────

function extractKeyword(intent) {
  if (intent.client) return intent.client;
  if (intent.project) return intent.project;

  // Strip question words from the title to get core keyword
  const title = (intent.title || '').toLowerCase();
  const cleaned = title
    .replace(/^(what|when|where|how|who|tell me|summarize|summary of|search)\s*/i, '')
    .replace(/\b(did|was|is|are|about|the|my|for|with|on|of|in|say|said|last)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const words = cleaned.split(' ').filter(w => w.length > 2);
  return words.length > 0 ? words[0] : null;
}

// ─── Format retrieved documents into text for LLM context ─────────────────

function formatContext(context) {
  const parts = [];

  for (const note of context.notes) {
    const date = formatDate(note.createdAt);
    const tags = note.tags.length ? ` [${note.tags.join(', ')}]` : '';
    parts.push(`[NOTE] ${note.title} (${date})${tags}\n${note.body || note.title}`);
  }

  for (const task of context.tasks) {
    const date = formatDate(task.createdAt);
    const items = task.items
      .map(i => `${i.done ? '✓' : '○'} ${i.text}`)
      .join(', ');
    parts.push(`[TASK] ${task.title} (${date})\nItems: ${items}`);
  }

  for (const rem of context.reminders) {
    const fireDate = new Date(rem.fireAt).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      timeZone: 'Asia/Kolkata', hour12: true,
    });
    parts.push(`[REMINDER] ${rem.title} — ${fireDate} (${rem.status})`);
  }

  return parts.join('\n\n');
}

// ─── Fallback: return list if LLM fails ───────────────────────────────────

function fallbackList(context) {
  const lines = [];
  context.notes.slice(0, 3).forEach(n => lines.push(`• ${n.title} (${formatDate(n.createdAt)})`));
  context.tasks.slice(0, 2).forEach(t => lines.push(`• ${t.title} — ${t.items.filter(i => !i.done).length} pending`));
  context.reminders.slice(0, 2).forEach(r => lines.push(`• ${r.title} (${r.status})`));
  return lines.join('\n');
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

module.exports = { handleQuery, retrieveContext };
