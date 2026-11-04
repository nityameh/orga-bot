// src/api/query.js — RAG query endpoint for dashboard

const express = require('express');
const router = express.Router();
const { classify } = require('../classifier');
const { handleQuery, retrieveContext } = require('../handlers/query');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const ANSWER_PROMPT = `
You are an assistant answering questions for a freelancer based on their saved notes, tasks, and reminders.

RULES:
1. ONLY use information from the PROVIDED CONTEXT. Never make up facts.
2. If the answer is NOT in the context, say: "I don't have notes about that."
3. Always mention which note or item the information comes from (title + date).
4. Keep answers concise — 2-4 sentences max.
5. Use natural, conversational language.
6. If multiple notes are relevant, synthesize them into one coherent answer.
`.trim();

// POST /api/v1/query
router.post('/', async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: 'question is required' });

    // Classify the question to extract entities
    const intent = await classify(question);

    // Retrieve relevant context
    const context = await retrieveContext(req.user.id, intent);
    const totalDocs = context.notes.length + context.tasks.length + context.reminders.length;

    if (totalDocs === 0) {
      return res.json({ answer: "I don't have any notes about that.", sources: [], docsUsed: 0 });
    }

    // Format context
    const contextText = formatContextForApi(context);

    // Generate answer
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 300,
      temperature: 0.3,
      messages: [
        { role: 'system', content: ANSWER_PROMPT + '\n\nCONTEXT:\n' + contextText },
        { role: 'user',   content: question },
      ],
    });

    const answer = response.choices[0]?.message?.content?.trim() || "Couldn't generate an answer.";

    const sources = [
      ...context.notes.slice(0, 3).map(n => ({ title: n.title, date: n.createdAt, type: 'note' })),
      ...context.tasks.slice(0, 2).map(t => ({ title: t.title, date: t.createdAt, type: 'task' })),
    ];

    res.json({ answer, sources, docsUsed: totalDocs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function formatContextForApi(context) {
  const parts = [];
  for (const note of context.notes) {
    const date = new Date(note.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
    parts.push(`[NOTE] ${note.title} (${date})\n${note.body || note.title}`);
  }
  for (const task of context.tasks) {
    const items = task.items.map(i => `${i.done ? '✓' : '○'} ${i.text}`).join(', ');
    parts.push(`[TASK] ${task.title}\nItems: ${items}`);
  }
  for (const rem of context.reminders) {
    parts.push(`[REMINDER] ${rem.title} (${rem.status})`);
  }
  return parts.join('\n\n');
}

module.exports = router;
