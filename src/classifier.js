// src/classifier.js
// Takes raw message text → returns structured intent JSON.
// Uses Groq (llama-3.3-70b-versatile) — free tier, fast, accurate.
// Falls back to keyword matching if Groq API is unavailable.

const Groq = require('groq-sdk');
const { log, warn, error } = require('./logger');

const client = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// ─── System prompt ────────────────────────────────────────────────────────
function buildSystemPrompt(currentTimeIST) {
  return `
You classify WhatsApp messages for a productivity bot used by Indian freelancers.

Current time (IST): ${currentTimeIST}

Return ONLY valid JSON. No explanation. No markdown. No backticks. Just the JSON object.

{
  "type": "NOTE | TASK | REMINDER | SEARCH | QUERY | TODAY | LIST | SCHEDULE | UNKNOWN",
  "title": "clean 1-line summary, max 60 chars",
  "body": "original message text, or null",
  "datetime": "ISO 8601 with +05:30 offset, or null",
  "tags": ["#tag1", "#tag2"],
  "client": "client name lowercase or null",
  "project": "project name lowercase or null",
  "priority": "high | normal | low",
  "append": "true if user wants to add items to an EXISTING task list, false otherwise",
  "targetList": "name of existing task list to append to, or null"
}

TYPE RULES:
- NOTE     → any idea, observation, meeting notes, something to remember
- TASK     → contains a to-do list, or starts with "task"/"todo"/"tasks:"
  - If message says "add to [name] tasks:" → type TASK, append: true, targetList: "[name]"
  - "add to acme tasks: review brief" → type: TASK, append: true, targetList: "acme"
- REMINDER → has a time reference: "tomorrow", "at 3pm", "in 2 hours", "next Friday", "tonight"
- SEARCH   → wants a LIST of matching items: "find", "/search", "show me notes about"
- QUERY    → asks a QUESTION that needs a natural language ANSWER (not a list):
             "what did rahul say about...", "when was the last...", "how much was...",
             "tell me about...", "summarize my notes on...", "what's the status of..."
           → QUERY returns an answer. SEARCH returns a list. They are different.
- TODAY    → /today, "what's today", "what do I have today", "my day"
- LIST     → /notes, /list, "show my notes", "show tasks", optionally filtered by tag/client
- SCHEDULE → /schedule, "what's coming up", "upcoming", "this week"
- UNKNOWN  → greetings, "help", anything that doesn't fit above

TAG RULES:
- Extract client/company names → "#clientname" (e.g. "acme corp" → "#acme")
- Extract person names mentioned → "#personname" (e.g. "call Ravi" → "#ravi")
- Topic tags: work-related → "#work", personal → "#personal", ideas → "#ideas", money → "#finance"
- Project names → "#projectname"
- Maximum 4 tags. Only include tags that are clearly present.

CLIENT RULES (critical):
- If a person's name appears in the message (e.g. "call Ravi", "follow up with priya", "meeting with rahul"), set "client" to their name in lowercase.
- "call Ravi" → client: "ravi"
- "follow up with priya" → client: "priya"
- "meeting with rahul" → client: "rahul"
- If multiple people are mentioned, use the primary/first person as client.
- Only set client to null if NO person or company name is mentioned.

DATETIME RULES:
- "tomorrow 9am"   → next calendar day at 09:00:00+05:30
- "in 2 hours"     → current time + 2 hours
- "next Friday"    → nearest upcoming Friday at 09:00:00+05:30
- "tonight"        → today at 20:00:00+05:30
- "this evening"   → today at 18:00:00+05:30
- "morning"        → 09:00:00+05:30 (default if no time given with a day)
- Only set datetime for REMINDER and SCHEDULE types. null for everything else.

PRIORITY RULES:
- "urgent", "asap", "critical", "important" → high
- Everything else → normal
- "low priority", "whenever", "someday" → low

EXAMPLES:
Input:  "remind me tomorrow at 9am to call Ravi about the proposal"
Output: {"type":"REMINDER","title":"Call Ravi about the proposal","body":"remind me tomorrow at 9am to call Ravi about the proposal","datetime":"2026-03-22T09:00:00+05:30","tags":["#ravi"],"client":"ravi","project":null,"priority":"normal"}

Input:  "note: logo concepts for acme — minimal design, dark background, serif font"
Output: {"type":"NOTE","title":"Logo concepts for Acme","body":"note: logo concepts for acme — minimal design, dark background, serif font","datetime":null,"tags":["#acme","#design"],"client":"acme","project":null,"priority":"normal"}

Input:  "tasks: send invoice to rahul, review brand brief, follow up with priya"
Output: {"type":"TASK","title":"Task list","body":"tasks: send invoice to rahul, review brand brief, follow up with priya","datetime":null,"tags":["#rahul","#priya","#work"],"client":null,"project":null,"priority":"normal"}

Input:  "/search acme"
Output: {"type":"SEARCH","title":"Search: acme","body":"/search acme","datetime":null,"tags":["#acme"],"client":"acme","project":null,"priority":"normal"}

Input:  "what did rahul say about the budget?"
Output: {"type":"QUERY","title":"What did Rahul say about budget","body":"what did rahul say about the budget?","datetime":null,"tags":["#rahul","#finance"],"client":"rahul","project":null,"priority":"normal"}

Input:  "summarize my notes on the logo project"
Output: {"type":"QUERY","title":"Summary of logo project","body":"summarize my notes on the logo project","datetime":null,"tags":["#logo"],"client":null,"project":"logo","priority":"normal"}

Input:  "when was my last meeting with acme?"
Output: {"type":"QUERY","title":"Last meeting with Acme","body":"when was my last meeting with acme?","datetime":null,"tags":["#acme"],"client":"acme","project":null,"priority":"normal"}

Input:  "/today"
Output: {"type":"TODAY","title":"Today overview","body":"/today","datetime":null,"tags":[],"client":null,"project":null,"priority":"normal"}
`.trim();
}

// ─── Main classify function ────────────────────────────────────────────────
async function classify(text) {
  const nowIST = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });

  try {
    const response = await client.chat.completions.create({
      model:      'llama-3.3-70b-versatile',
      max_tokens: 300,
      messages: [
        { role: 'system',  content: buildSystemPrompt(nowIST) },
        { role: 'user',    content: text },
      ],
      temperature: 0,  // deterministic — we want consistent JSON
    });

    const raw = response.choices[0]?.message?.content?.trim();
    if (!raw) throw new Error('Empty response from Groq');

    const intent = JSON.parse(raw);
    if (!intent.type) throw new Error('Missing type in intent');

    log('classifier.success', { preview: text.substring(0, 40), type: intent.type });
    return intent;

  } catch (err) {
    error('classifier.error', { err: err.message });
    warn('classifier.fallback');
    return keywordFallback(text);
  }
}

// ─── Keyword fallback ──────────────────────────────────────────────────────
// Used when Groq API is unavailable or returns invalid JSON.
// Always defaults to NOTE if unsure — better to save than lose.
function keywordFallback(text) {
  const t = text.toLowerCase().trim();

  const base = {
    body:     text,
    datetime: null,
    tags:     [],
    client:   null,
    project:  null,
    priority: 'normal',
  };

  if (t === '/today' || (t.startsWith('what') && t.includes('today'))) {
    return { ...base, type: 'TODAY', title: 'Today overview' };
  }

  if (t.startsWith('/notes') || t.startsWith('/list')) {
    return { ...base, type: 'LIST', title: 'List notes' };
  }

  if (t.startsWith('/schedule') || t.includes('coming up') || t.includes('upcoming')) {
    return { ...base, type: 'SCHEDULE', title: 'Upcoming schedule' };
  }

  if (t.startsWith('/search') || t.startsWith('find ')) {
    return { ...base, type: 'SEARCH', title: `Search: ${text.substring(0, 40)}` };
  }

  // Natural language questions → QUERY (RAG)
  if (/^(what|when|where|how much|how many|who|tell me|summarize|summary)\b/.test(t) ||
      t.includes('what did') || t.includes('what\'s the status')) {
    return { ...base, type: 'QUERY', title: text.substring(0, 60) };
  }

  if (
    t.startsWith('/remind') ||
    t.includes('remind me') ||
    t.includes('tomorrow') ||
    t.includes('tonight') ||
    /\bat \d/.test(t) ||
    /in \d+ (hour|min)/.test(t)
  ) {
    return { ...base, type: 'REMINDER', title: text.substring(0, 60) };
  }

  // "add to X tasks: ..." → append mode
  const addToMatch = t.match(/^add to (.+?) tasks?:\s*(.+)/i);
  if (addToMatch) {
    return { ...base, type: 'TASK', title: 'Task list', append: true, targetList: addToMatch[1].trim() };
  }

  if (
    t.startsWith('/task') ||
    t.startsWith('task:') ||
    t.startsWith('tasks:') ||
    t.startsWith('todo:') ||
    t.startsWith('to do:')
  ) {
    return { ...base, type: 'TASK', title: 'Task list' };
  }

  // Default → NOTE. Never return UNKNOWN from fallback.
  return { ...base, type: 'NOTE', title: text.substring(0, 60) };
}

module.exports = { classify };
