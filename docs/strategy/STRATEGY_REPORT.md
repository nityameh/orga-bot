# Orga — Strategy Report

**A chat-first notebook for writers**
Version 1.0 · 12 November 2026 · Prepared for prospective investors and co-founders
Status: draft for review · All monetary figures exclude taxes unless stated · FX assumption ₹88 = US$1

> **How to read the numbers.** Every figure is either **sourced** (tagged `[S#]`, see
> §8.3 Sources, all accessed 10–12 Nov 2026) or an **estimate** (tagged `[A#]`, see
> §8.1 Assumption register). Published market sizes for this space disagree by more
> than 10×, so this report sizes the opportunity **bottom-up** and uses top-down
> reports only as a cross-check.

---

## 1. Executive summary

**Problem.** Writers (content writers, copywriters, poets, lyricists and
scriptwriters) get ideas everywhere: on a walk, mid-conversation, at 2 a.m. In
India those ideas end up scattered across WhatsApp "notes to self", voice notes,
phone notes and screenshots. Turning fragments into work means hunting through
apps, then switching to a browser to research and to a chatbot to brainstorm.
Existing tools make writers organise first and write later. Writers don't want
to organise; they want their ideas to be there, together, when they sit down to write.

**Product.** Orga is a notebook you **text**. Send a line, a voice note, or a
whole exported WhatsApp chat; Orga **files each idea into the right project
automatically**, lets you **ask a project** ("what have I written about home in
*Monsoon EP*?"), **brainstorms with your own notes plus the web**, and runs
**watches** that message you when something you care about changes. A web
workspace holds each project's brief, ideas and drafts. Calendar and email
are available in chat as conveniences.

**Why now.**
1. LLM inference for a given quality level is getting about **10× cheaper every year** [S20]. Our measured cost is about 3,000 tokens per conversational turn on a free-tier open model (§5.2).
2. India's creator base grew from **0.96 M (2020) to 4.12 M (2025)**, 66 % of it outside metros [S1].
3. Indians have started to pay for apps: annual in-app spend passed **US$1 B in 2025** [S17].
4. Incumbents are generic. Assistants (ChatGPT, Gemini, Meta AI) don't organise a writer's body of work, and notebooks (Notion, Obsidian) don't capture from chat.

**Market (bottom-up, §3).**
- **TAM ≈ US$1.6 B/yr**: ~4.2 M writers in India × ₹299/month, plus ~15 M writing-centric creators globally × US$8/month.
- **SAM ≈ US$170 M/yr**: India English/Hinglish writers reachable through WhatsApp, Telegram and web, plus English-speaking writers globally from year 2.
- **SOM ≈ US$0.05–1.0 M ARR at the end of year 3** (downside to upside; base ≈ US$0.23 M).

**Business model.** Freemium with a tight free tier. **Pro ₹299/month (US$8 global)**;
**Studio ₹599 (US$16)** for imports, more watches and voice. Estimated contribution
margin per paying user is **~59 % in India and ~82 % globally**, after carrying free
users (§5.3). Web search is the cost to manage.

**Channel strategy and the biggest platform risk.** Indian writers live in
WhatsApp, so Orga keeps **WhatsApp, Telegram and web** as its chat channels, with
WhatsApp **chat import** as the onboarding hook. However, since **15 January 2026**
Meta's WhatsApp Business terms bar third-party **general-purpose AI chatbots**
whose chatbot is the primary functionality [S22]. Orga is positioned as a
**notebook for writers**, not a general assistant, and must clear that policy
before a public WhatsApp launch. Telegram and web carry the product if
it doesn't (§7.5).

> **Scope of this exercise.** Orga is run as a simulated startup: the product
> is built and used by a small invited group, not launched publicly. WhatsApp
> runs on Meta's Cloud API in development mode, so the policy above is treated
> as a **launch-gate risk**, not a build blocker.

**Recommendation.**
1. Beachhead: **English/Hinglish content writers, copywriters and lyricists in India.**
2. Ship an MVP of *capture → auto-file → ask-the-project → WhatsApp import* within ~12 weeks.
3. Prove retention (D30 ≥ 25 %) and auto-filing accuracy (≥ 80 % accepted without edits) before scaling.
4. Validate pricing with a ₹299 vs ₹199 test.

**Milestones (12 months).**
- 1,000 weekly active writers by Q3.
- ~5,000 MAU and ~200 paying writers by Q4 (4 % paid conversion).
- 3 community partnerships (writing collectives, open mics, a writing school).
- Global (English) beta in month 9.

---

## 2. Industry overview

### 2.1 Four overlapping markets
| Market | What it covers | Published 2025 size (spread) | Read-across for Orga |
|---|---|---|---|
| **Note-taking / PKM apps** | Notion, Evernote, Obsidian, Apple Notes, Keep, Mem | ~US$1.0 B [S5] to ~US$11 B [S4]; CAGR 8–20 %+ by definition [S4][S5][S6] | Large and growing, but mostly free usage; enterprise skews the totals |
| **AI writing assistants** | Jasper, Copy.ai, Sudowrite, Grammarly-style tools | <US$1 B [S8] to ~US$89 B [S7]; CAGR 9–37 % [S7][S8][S9] | Definitions vary wildly; consumer spend is real but crowded |
| **Creator economy** | Monetised and aspiring creators and the tools they buy | ~US$250 B base → ~US$480 B by 2027 (Goldman Sachs) [S11] | Writers are a sub-segment; tools are a small share of spend |
| **Conversational AI in messaging** | Assistants inside WhatsApp, Telegram, RCS | No reliable sizing; India has ~536 M WhatsApp users [S13] | Distribution where users already are, constrained by platform policy [S22] |

**Takeaway:** none of these reports measures "writers who want an AI notebook".
We size that directly in §3.

### 2.2 Trends that matter
1. **AI cost collapse.** a16z estimates inference cost at constant capability falls ~10× per year [S20]; Epoch AI measures 9–900× per year depending on task [S20]. A product that was uneconomic at ₹299 in 2023 is now viable.
2. **India is starting to pay.** Annual in-app purchase revenue crossed US$1 B in 2025 and is projected at ~US$1.25 B for 2026 [S17]. Willingness to pay is still price-sensitive.
3. **Big Tech is subsidising AI in India.**
   - ChatGPT Go was **free for 12 months** from 4 Nov 2025 (normally ₹399/month) [S15].
   - Google AI Plus is ₹399/month (₹199 intro) and includes NotebookLM; AI Pro is ₹1,950/month [S16].
   - Meta AI is built into WhatsApp [S21].

   General AI is effectively free to Indian users. Orga must sell a **specific job** that general assistants don't do: organising a writer's body of work.
4. **Creators are going non-metro and multilingual.** 66 % of India's 4.12 M creators are outside metros [S1]. Pratilipi reports ~1.6 M writers (≈7.2 lakh active creators) writing in Indian languages [S2]. Hinglish and Indic support are table stakes.
5. **Platform policy risk is now explicit.** WhatsApp's ban on general-purpose AI chatbots via the Business API (effective 15 Jan 2026) removed ChatGPT, Copilot and Perplexity from WhatsApp; Meta AI is the remaining general assistant there [S22].
6. **Regulation.** India's DPDP Rules were notified on 13–14 Nov 2025 with an **~18-month phased rollout** to May 2027 (consent, breach and children's-data duties last) [S23]. Products that import chats containing other people's messages need consent-aware design from day one.

### 2.3 The writer's workflow (where value is lost)
```
idea strikes ──► captured somewhere random ──► forgotten / scattered
   (chat, voice, screenshot)        │
                                    ▼
sitting down to write ──► search across apps ──► switch to browser/chatbot for research
                                    │
                                    ▼
                          context lost; momentum lost
```
Orga collapses this into one loop: **capture in chat → filed automatically →
recalled with context → brainstorm in place**.

---

## 3. Market sizing: TAM / SAM / SOM

### 3.1 Method
1. **Bottom-up primary:** count writers by segment × reachable share × price.
2. **Top-down cross-check** against §2.1 reports (wide spread; used only for sanity).
3. All non-sourced inputs are assumptions `[A#]` with rationale, so investors can change them.

### 3.2 Who counts as a writer (India)
| Segment | Evidence | Estimate |
|---|---|---|
| **Professional writers**: content, copy, script, lyrics, journalism | SWA (screenwriters) 23k–66k members [S3a]; IPRS (authors, composers, publishers) 9k–20k [S3b]; article writing is ~38 % of Indian freelance content projects on one marketplace [S3c]. No official headcount | **1.0 M** [A1] |
| **Writing-centric creators**: script/caption writers for video, newsletter, blog, Insta-poetry | 4.12 M creators in 2025 [S1]; assume 40 % write substantially | **1.65 M** [A2] |
| **Aspiring and hobby writers** on writing platforms | Pratilipi ~1.6 M writers, ~0.72 M active creators [S2]; YourQuote ~0.6 M users (2018) [S12]; overlap removed | **1.5 M** [A3] |
| **Total India writers** | | **≈ 4.2 M** |

### 3.3 Global writers (expansion)
- **50 M+ creators worldwide** (SignalFire via Brandwatch) [S10]. Goldman notes only ~4 % are professional (>US$100k/yr) [S11].
- Assume **30 % are writing-centric**, giving **≈ 15 M** [A4].
- For calibration, the US alone has ~140k "writers and authors" jobs (BLS, 2025) [S14]. That's the narrow professional core, not the market.

### 3.4 Price points used
India Pro **₹299/month** (₹3,588/yr list) [A5]; global Pro **US$8/month** (US$96/yr) [A6].
Both sit below or at peer pricing:
- Notion Plus US$10 [S18a] · Mem Plus US$9 [S18b] · Sudowrite from US$10 [S18c] · Obsidian Sync US$4–5 [S18d]
- ChatGPT Go ₹399 [S15] · Google AI Plus ₹399 [S16]

### 3.5 Results
| | People | Price/yr | Value/yr |
|---|---|---|---|
| **TAM: India** | 4.2 M | ₹3,588 | ₹1,507 Cr ≈ **US$171 M** |
| **TAM: Global writing creators** | 15 M | US$96 | **US$1.44 B** |
| **TAM total** | | | **≈ US$1.6 B** |
| **SAM: India** (English/Hinglish, smartphone, WhatsApp/Telegram/web, AI-curious: 40 % [A7]) | 1.7 M | ₹3,588 | ₹610 Cr ≈ **US$69 M** |
| **SAM: Global from year 2** (English, reachable via web and Telegram: 7 % [A8]) | 1.05 M | US$96 | **US$101 M** |
| **SAM total** | | | **≈ US$170 M** |

> TAM uses list prices. With a typical annual-plan mix [A9] the effective value
> is ~7.5 % lower (≈ US$1.5 B); the conclusions don't change.

**SOM: what we can actually win by the end of year 3.**
| Scenario | India MAU | Global MAU | Paid conversion | Paying users | ARR |
|---|---|---|---|---|---|
| **Base** | 60k (3.5 % of India SAM) | 40k | 4 % [A10] | 4,000 | **≈ US$0.23 M** |
| **Upside** | 150k | 120k | 6 % | 16,200 | **≈ US$1.0 M** |
| **Downside** | 25k | 10k | 2.5 % | 875 | **≈ US$0.05 M** |

*ARR = paying users × list price per year × (1 − 7.5 % annual-plan effect [A9]).
India uses ₹3,588/yr ≈ US$40.8; global uses US$96/yr. Worked example (base):
2,400 × US$40.8 + 1,600 × US$96 = US$251k; × 0.925 ≈ US$233k.*

**Conversion benchmarks:** freemium mobile apps have a median 2.18 % conversion,
and productivity apps a median 3.5 % download-to-paid rate (Adapty) [S19]. Self-serve
SaaS commonly converts 3–5 % [S19]. Our 4 % base assumes the hook (import + auto-filing)
lifts conversion slightly above median.

### 3.6 Cross-check
- **Top-down:** if Orga reached base-case SOM, it would be ~0.02 % of even the *lowest* note-taking market estimate (~US$1 B) [S5]. The SOM doesn't depend on optimistic market reports.
- **Bottom-up sanity:** the base case needs ~1,700 new MAU a month for 36 months. That's achievable through communities and referrals (§6) without paid acquisition.

---

## 4. Competitor benchmarking

### 4.1 Who they are and what they cost
| Product | Category | Price (Nov 2026) |
|------------------|------------------------------------|-----------------------------------------------|
| **Orga (v2 target)** | Chat-first notebook for writers | Free · Pro ₹299 / US$8 · Studio ₹599 / US$16 |
| Notion (+ AI) | Workspace and docs | Free · Plus US$10 · Business US$20 incl. AI agent [S18a] |
| Mem | AI notes | Free (25 notes/mo) · Plus US$9 · Pro US$29 [S18b] |
| Obsidian | Local-first notes | Free; Sync US$4–5 [S18d] |
| Reflect | AI notes | ~US$10/mo (third-party) [S18e] |
| Google NotebookLM | Source-grounded research notebook | In Google AI Plus ₹399 / AI Pro ₹1,950 [S16] |
| ChatGPT / Gemini / Claude | General assistants with projects and memory | ChatGPT Go ₹399, free for 12 months in India [S15] |
| Meta AI | General assistant inside WhatsApp | Free [S21] |
| Sudowrite | Fiction-writing AI | US$10 / 22 / 44 [S18c] |
| Indian WhatsApp assistants (Kara, Hello Aria, AskGogo) | Productivity bots | Varies [S24] |

### 4.2 Capability matrix
● yes · ◐ partial · ○ no

| Product | Chat capture | Auto-files into projects | Ask / brainstorm | Web search | Proactive | WhatsApp import | Hinglish |
|------------------------|--------|--------|--------|--------|--------|--------|--------|
| **Orga (v2)** | ● | ● | ● | ● | ● | ● | ● |
| Notion | ○ | ◐ | ● | ◐ | ◐ | ○ | ○ |
| Mem | ◐ | ● | ● | ◐ | ● | ○ | ○ |
| Obsidian | ○ | ○ | ◐ | ◐ | ○ | ○ | ○ |
| Reflect | ○ | ◐ | ● | ○ | ○ | ○ | ○ |
| NotebookLM | ○ | ○ | ● | ◐ | ◐ | ○ | ◐ |
| ChatGPT / Gemini / Claude | ◐ | ◐ | ● | ● | ◐ | ◐ | ● |
| Meta AI (WhatsApp) | ● | ○ | ◐ | ● | ○ | ○ | ◐ |
| Sudowrite | ○ | ◐ | ● | ○ | ○ | ○ | ○ |
| Indian WhatsApp bots | ● | ○ | ○ | ◐ | ◐ | ○ | ◐ |

Notes on the matrix:
- **Orga:** capture on Telegram, web and voice; filing goes explicit → context → semantic → Inbox; web results are cited; user-defined watches.
- **Notion:** AI autofill; ask and brainstorm on Business; research mode in beta; automations are manual [S18a].
- **Mem:** voice mode; auto-detected projects; scheduled **Custom Routines** and Gmail **Connections** [S18b].
- **ChatGPT, Gemini and Claude:** in apps only, **barred from the WhatsApp Business API** [S22]; projects are manual; ChatGPT has scheduled tasks.
- **Meta AI:** native to WhatsApp, with Hindi [S21].
- **Indian WhatsApp bots:** native capture, but exposed to the same policy [S22]; Kara offers briefings in Hinglish [S24].

*Based on official pages or reputable coverage as of Nov 2026; third-party prices
are marked. Feature sets change fast, so re-verify before external use.*

### 4.3 Positioning map
```
                 Organises a body of work (projects, retrieval)
                                   ▲
              Notion · Obsidian    │    Mem ·  ★ Orga v2
              NotebookLM           │
   app-first ◄─────────────────────┼─────────────────► capture in chat
   (open an app, then write)       │   (text/voice/forward)
              Sudowrite · Jasper   │    Meta AI · ChatGPT · WhatsApp bots
                                   │
                                   ▼
                 Answers one-off questions (no lasting structure)
```

### 4.4 What this means
1. **Mem is the closest competitor.** It has auto-detected projects, scheduled "Custom Routines" and Gmail "Connections" [S18b]. Orga's differentiation must be **writer-specific** and **India-specific**:
   - Chat capture on WhatsApp and Telegram, plus WhatsApp chat import.
   - Hinglish.
   - ₹ pricing well below Mem's US$29 Pro.
   - Writing-native features: drafts, project briefs, rhyme and phrasing help with project context.
2. **General assistants are free and everywhere**, but they don't keep a structured, writer-owned library. Orga should **complement** them: an export button and MCP access (ADR-014) let writers bring their Orga context into any assistant.
3. **Indian WhatsApp bots compete on convenience, not organisation**, and face the same Meta policy exposure [S22].
4. **The moat isn't the model.** It's:
   - the user's filed corpus (switching cost),
   - per-user filing accuracy that improves with corrections,
   - community distribution among writers.

---

## 5. Business model analysis

### 5.1 Packaging (proposed, to be tested)
| | **Free** | **Pro** ₹299/mo · ₹2,499/yr · US$8 | **Studio** ₹599/mo · ₹4,999/yr · US$16 |
|---|---|---|---|
| Capture (text) and projects | Unlimited notes, 3 projects | Unlimited | Unlimited |
| AI actions (filing suggestions, ask, brainstorm) | 15/day, small model | 150/day, best model | 400/day |
| Voice notes | 10 min/mo | 3 h/mo | 10 h/mo |
| Web search in chat | 10/mo | 100/mo | 400/mo |
| WhatsApp chat import | 1 chat (≤1,000 msgs) | 10 chats/mo | Unlimited (fair use) |
| Watches | 1 | 5 | 20 |
| Workspace, drafts, version history | 7-day history | Full | Full + export bundles |
| Calendar and email in chat | Read | Read + create with approval | + send with approval |

Rationale: free users must cost almost nothing (§5.3). The **paid-cost features**
(web search, voice minutes, big model, imports) are where the tiers differ.

### 5.2 Cost inputs (measured and listed)
- **LLM:** Groq `openai/gpt-oss-120b` at US$0.15 / US$0.60 per M input/output tokens [S25]. Groq's free tier allows ~200k tokens/day per model, measured in production (ADR-022).
- **Typical turn:** ~2.5k input + 0.5k output tokens, measured in Orga v1 telemetry [A11].
- **Speech-to-text:** Whisper large-v3-turbo at US$0.04 per audio hour [S25].
- **Embeddings:** hosted small model, ≈ US$0.01/user/month [A12].
- **Web search:** ≈ US$0.004/query via an agent-search API [A13]. This is the main variable cost.
- **Payments:**
  - India: Razorpay 2 % gateway + 0.99 % subscriptions + GST on fees [S26].
  - Consumer digital services carry 18 % GST, included in the ₹ price [A14].
- **Hosting:** Vercel + Supabase free tiers today. Paid tiers (~US$45/month) from ~2k MAU, ≈ US$0.10 per paying user per month [A15].

### 5.3 Unit economics (per month)
| Per user per month | Free | Pro (India) | Pro (global) |
|---|---|---|---|
| Price (net of 18 % GST in India) | — | ₹253 ≈ **US$2.88** | **US$8.00** |
| LLM (Free 30 turns, small model; Pro 300 turns, 120b) | US$0.01 | US$0.20 | US$0.20 |
| Voice (Free 10 min; Pro 2 h used) | US$0.01 | US$0.08 | US$0.08 |
| Web search (Free 5; Pro 50 used) | US$0.02 | US$0.20 | US$0.20 |
| Embeddings + hosting share | US$0.01 | US$0.12 | US$0.12 |
| Payment fees | — | US$0.10 | US$0.35 [A16] |
| **Direct cost** | **≈ US$0.05** | **US$0.70** | **US$0.95** |
| Free-user burden per payer (24 free users per payer at 4 % conversion) | — | US$1.20 → **US$0.48** at a tightened US$0.02/free user [A17] | US$0.48 |
| **Contribution per payer** | | **≈ US$1.70 (≈ 59 %)** | **≈ US$6.57 (≈ 82 %)** |

**Implications:**
1. **India margin depends on discipline in the free tier.** At US$0.05 per free user, the India contribution falls to ~US$1.0 (35 %). The free tier must use the small model and only a token amount of web search and voice.
2. **₹199 is risky.** At ₹199 the India contribution is ~US$0.75 (≈ 39 %). Test ₹299 against ₹199 and pick based on conversion × margin.
3. **The global plan subsidises learning in India.** A blended mix with 30 % global payers gets above 70 % contribution margin.
4. **Costs keep falling** (~10× per year at constant quality [S20]), so margins widen over time without price changes.

### 5.4 Customer acquisition
| Channel | Mechanism | Expected CAC |
|---|---|---|
| **Communities** (open mics, writing collectives, Insta-poetry pages, screenwriting workshops) | Live demo: "send your WhatsApp notes-to-self, see them filed" | Low (time, not cash) |
| **Referral** (built in: single-use invite links, ADR-018/021) | Give 1 month Pro per converted invite | ≈ 1 month of Pro |
| **Content-led** (templates per writer type, "idea to draft" teardown posts) | SEO and social | Low |
| **Partnerships** (writing schools, content agencies) | Bulk Studio seats, B2B2C | Sales time |
| **Paid social** | Only after D30 retention ≥ 25 % | Not before PMF |

### 5.5 Other revenue options (later)
- **Team/agency plan:** shared projects for content teams (seat-based).
- **Education:** writing courses license Orga for students (cohort pricing).
- **Marketplace for templates/prompts** by known writers (revenue share). Low priority.

---

## 6. Growth opportunities

1. **Import as the onboarding hook.** A new user uploads their WhatsApp "notes to self" export and sees **dozens of ideas already filed into suggested projects in minutes**. That's the moment of value, before they've captured anything new.
2. **WhatsApp where writers are, Telegram and web as the safety net.** WhatsApp is where Indian writers already keep "notes to self" (~536 M users [S13]), so it's the main capture channel. Telegram bots face no comparable general-purpose-AI restriction [S22], and the web workspace is the home for drafts. Because all three share one channel interface, losing any one channel costs a config change, not a rewrite.
3. **Vernacular and Hinglish.** 66 % of creators are non-metro [S1]. Writing platforms prove demand in Indian languages [S2][S12]. Stage it:
   - Hinglish now.
   - Hindi script support next.
   - Then Tamil, Bengali and Marathi, prioritised by user demand.
4. **Templates per writer type:** a lyricist pack (hook bank, rhyme scheme notes), a copywriter pack (brand voice briefs, swipe file), a scriptwriter pack (character bible, scene cards).
5. **Proactive watches** as a retention engine:
   - Weekly idea digests.
   - "Nudge me if I haven't written in Poetry Book in 5 days".
   - Topic watches on the web.
   - "The editor replied" email watches.
6. **Ecosystem integrations:**
   - An MCP server (ADR-014) so writers can use their Orga corpus from Claude, ChatGPT or IDE tools.
   - Export to Google Docs and Markdown.
   - Calendar events for deadlines.
7. **Global English expansion in month 9+:** the same product with US$ pricing. Positioning: *"the notebook you text"*.

---

## 7. Strategic recommendations

### 7.1 Positioning statement
> **For** writers who get ideas on the go, **Orga is** the notebook you text:
> it **files every idea into the right project automatically** and lets you
> **think with your own notes and the web** without switching apps. **Unlike**
> Notion or general chatbots, Orga organises your body of work for you, in
> the chat app you already use, and in Hinglish.

### 7.2 Beachhead
**English/Hinglish content writers, copywriters and lyricists in India**, starting
with metros and the top tier-2 cities. They write daily (high capture frequency),
use many projects (clients, songs), and earn from writing (willingness to pay).
Poets and scriptwriters follow, once workspace drafts are mature.

### 7.3 MVP scope (≈ 12 weeks) and what to defer
| MVP (must) | Defer |
|---|---|
| Projects (many-to-many), Inbox, auto-filing with one-tap corrections | Team/shared projects |
| WhatsApp + Telegram + web capture, voice notes (Whisper) | Indic scripts beyond Hinglish |
| Ask-a-project and brainstorm with project context | Email send, people-from-email |
| Web search with citations (capped) | Advanced watch types (email-triggered) |
| WhatsApp chat import with review screen (own messages by default, DPDP) | Public WhatsApp launch (needs policy clearance, §7.5) |
| Project workspace: brief, ideas, Markdown drafts | Template marketplace |
| 1–3 simple watches (weekly digest, inactivity nudge, web topic) | |

Reuse is high: channels, onboarding, agent and tool registry, provider fallback,
scheduler tick, Google integration and analytics from v1 carry over (the gap
analysis will be a separate document).

### 7.4 12-month milestones and metrics
| Quarter | Milestone | North-star and guardrails |
|---|---|---|
| Q1 | MVP live; 100 design-partner writers | Activation: ≥ 60 % file ≥ 10 ideas in week 1 |
| Q2 | Import and watches; pricing test (₹199 vs ₹299) | Auto-filing accepted without edit ≥ 80 %; D30 retention ≥ 25 % |
| Q3 | 1,000 WAU; 3 community partners; Studio tier | Paid conversion ≥ 3 %; contribution margin ≥ 50 % (India) |
| Q4 | Global English beta; MCP server | ~5,000 MAU; 4 % conversion ≈ 200 paying writers; ~US$10k ARR run-rate |

**North-star metric:** *weekly active writers who retrieved or reused a filed idea*.
It measures the core value (ideas coming back when needed), not just capture.

### 7.5 Key risks and mitigations
| Risk | Likelihood / impact | Mitigation |
|---|---|---|
| **WhatsApp policy:** general-purpose AI chatbots banned on the Business API since 15 Jan 2026 [S22] | High / High for WhatsApp-as-channel | Position and build as a **writer's notebook** (filing, projects, drafts), never as a general chatbot; get legal review before public launch; keep Telegram + web at feature parity so WhatsApp can be switched off by config; chat **import** (user-uploaded file) is unaffected either way |
| **Big Tech bundling:** free ChatGPT Go year, Google AI Plus ₹399 with NotebookLM, Meta AI in WhatsApp [S15][S16][S21] | High / Medium | Don't compete on general Q&A; compete on organising a writer's corpus; integrate with them (export, MCP) |
| **Mem moves into India or writers** [S18b] | Medium / Medium | Local pricing, Hinglish, chat-native capture, WhatsApp import, writer templates, community distribution |
| **Google restricted scopes:** Gmail read access requires a paid assessment to publish; Testing mode caps at 100 users and re-auth every 7 days | High / Low–Medium (email isn't core) | Keep email optional; calendar first; budget for verification only after PMF |
| **LLM limits and costs:** free tiers cap tokens/day per model | Medium / Medium | Model routing (small model for filing), embeddings for classification, per-user budgets, paid tier from ~500 MAU |
| **Privacy / DPDP:** imports include other people's messages [S23] | Medium / High | Import own messages by default; explicit opt-in to include others; delete raw files after processing; consent records; data export and deletion already exist (v1) |
| **Auto-filing quality** (the core promise) | Medium / High | Inbox fallback when confidence is low; one-tap corrections that train per-user filing; track acceptance as a KPI and through evals |
| **Founder bandwidth** (solo technical founder) | High / Medium | Narrow MVP; reuse v1 platform; recruit a co-founder with community/growth strength (the "ask") |

### 7.6 The ask (for co-founder and investor conversations)
- **Co-founder:** growth and community lead with roots in Indian writing or creator communities.
- **Pre-seed:** enough for 12–18 months of runway: two founders, model and infrastructure costs past the free tiers, community events, and Google/Meta verifications when they become necessary. Size to be set after the pricing test; the base-case unit economics don't need paid acquisition.

---

## 8. Appendix

### 8.1 Assumption register
| ID | Assumption | Value | Rationale / how to validate |
|----|--------------------|----------------|----------------------------------------|
| A1 | Professional writers in India | 1.0 M | Union/society counts are only the formal core (SWA ≤66k, IPRS ≤20k) [S3a][S3b]; content writing is the largest freelance content category [S3c]. Validate via LinkedIn/Naukri title counts |
| A2 | Share of creators who are writing-centric | 40 % | Scripts/captions/newsletters are core to most creator formats; validate via creator surveys |
| A3 | Aspiring/hobby writers after overlap | 1.5 M | Pratilipi 1.6 M writers / 0.72 M active [S2]; YourQuote ~0.6 M users [S12] |
| A4 | Writing-centric share of global creators | 30 % | Conservative versus A2 (global creators skew video) |
| A5 | India Pro price | ₹299/mo | Below ChatGPT Go and Google AI Plus (₹399) [S15][S16]; test vs ₹199 |
| A6 | Global Pro price | US$8/mo | Below Notion Plus US$10, Mem Plus US$9 [S18a][S18b] |
| A7 | India SAM share | 40 % | English/Hinglish + WhatsApp/Telegram/web + AI-curious (the AI-curious filter dominates; channel reach is near-universal) |
| A8 | Global SAM share | 7 % | English-speaking, reachable without paid acquisition in years 2–3 |
| A9 | Annual-plan mix and discount | 25 % of payers on annual at ~30 % off → ~7.5 % blended reduction (applied to ARR) | Typical for prosumer subscriptions; Pro annual ₹2,499 ≈ 30 % off monthly |
| A10 | Paid conversion (base) | 4 % | Benchmarks 2.18 % median freemium, 3.5 % productivity, 3–5 % self-serve SaaS [S19] |
| A11 | Tokens per AI turn | 2.5k in / 0.5k out | Orga v1 production telemetry (Interaction log, agent.turn events) |
| A12 | Embedding cost per user | US$0.01/mo | Small hosted model; to verify with chosen provider |
| A13 | Web search cost per query | US$0.004 | Typical agent-search API list prices; **highest-sensitivity input**; validate before launch |
| A14 | GST on consumer digital subscriptions | 18 %, price-inclusive | Standard rate for online services; confirm with a CA |
| A15 | Hosting per paying user | US$0.10/mo | Vercel Pro + Supabase Pro ≈ US$45/mo shared over ~450 payers |
| A16 | Global payment fees | ~4 % + fixed | Typical international card processing |
| A17 | Cost per free user | US$0.02/mo target | Small model, 15 actions/day cap, minimal search and voice |

### 8.2 Methodology notes
- Market reports in §2.1 are used only to show the spread and as a cross-check; definitions differ (paid vs. free, enterprise vs. consumer, standalone vs. embedded AI).
- Competitor prices are from official pricing pages where retrievable (Notion, Mem, Sudowrite, Obsidian). Others are marked third-party.
- Orga's own figures come from v1 production: eval baseline 82.1 % on 39 cases with `gpt-oss-120b` (ADR-022); API latency 0.25–0.6 s after co-locating functions with the database (ADR-023).

### 8.3 Sources (accessed 10–12 Nov 2026)
- [S1] ISB–Hashfame (SRITNE), *India Creator Economy* report, 2025: creators 0.96 M (2020) → 4.12 M (2025); 66 % non-metro. https://www.isb.edu/news/press-releases/india-s-creator-economy-enters-a-new-phase-as-non-metro-creators-become-the-majority-reveals-isb-hashfame-report
- [S2] Pratilipi user and writer figures (coverage): https://inc42.com/startups/pratilipi-content-ip-stack-profitability · https://theprint.in/feature/pratilipi-gearing-up-for-ipo/2948654/
- [S3a] Screenwriters Association membership (various reports): https://www.business-standard.com/entertainment/screenwriters-discuss-crisis-of-creativity-need-for-original-content-125031400716_1.html · https://www.filmcompanion.in/features/indepth-stories/do-the-write-thing-bollywood-screenwriters-talk-about-rights-exploitation-and-expectations-writers-guild-of-america-screenwriters-association-anjum-rajabali-hussain-dalal-pooja-tolani-smita-singh
- [S3b] IPRS membership: https://www.medianews4u.com/in-recent-years-iprs-has-experienced-significant-and-diverse-membership-growth-rakesh-nigam/ · https://www.musicplus.in/?p=13072
- [S3c] Contra, India writing freelancers: https://contra.com/hire/article-writers-in-india
- [S4] The Business Research Company, Note Taking App Global Market Report (via GII): https://www.gii.tw/report/tbrc1976108-note-taking-app-global-market-report.html
- [S5] Collaborative/note app market estimates (DIResearch, marketresearch.com listings): https://marketresearch.com/Prof-Research-v4036/Collaborative-Note-App-Global-Insights-40634736
- [S6] Technavio, AI Note Taking Market 2025–2029: https://www.technavio.com/report/ai-note-taking-market-industry-analysis
- [S7] Market Research Future, AI Writing Assistant Software Market: https://www.marketresearchfuture.com/fr/reports/ai-writing-assistant-software-market-31158
- [S8] GII Research, AI Writing Assistant Software Market: https://www.giiresearch.com/report/ires1718126-ai-writing-assistant-software-market-by-product.html
- [S9] LP Information, AI Writing Assistance Software Market 2026–2032: https://www.marketresearch.com/LP-Information-Inc-v4134/Global-AI-Writing-Assistance-Software-43293668
- [S10] Brandwatch glossary citing SignalFire (50 M+ creators): https://www.brandwatch.com/social-media-glossary/creator-economy/
- [S11] Goldman Sachs Research, "The creator economy could approach half-a-trillion dollars by 2027": https://www.goldmansachs.com/insights/articles/the-creator-economy-could-approach-half-a-trillion-dollars-by-2027
- [S12] YourQuote coverage: https://www.socialsamosa.com/2018/02/platform-feature-yourquote · https://inc42.com/startups/yourquote-looks-to-ride-indias-micro-content-wave-but-do-short-stories-sell
- [S13] WhatsApp India users (DataReportal-based compilations): https://www.infobip.com/blog/whatsapp-statistics-2025-global-usage-market-overview
- [S14] US BLS, Occupational Outlook: Writers and Authors: https://www.bls.gov/ooh/media-and-communication/writers-and-authors.htm
- [S15] ChatGPT Go free for one year in India (₹399/month list): https://techcrunch.com/2025/10/27/openai-offers-free-chatgpt-go-for-one-year-to-all-users-in-india · https://www.business-standard.com/technology/tech-news/openai-offers-chatgpt-go-free-for-one-year-in-india-125102800612_1.html
- [S16] Google AI subscriptions India (AI Plus ₹399, AI Pro ₹1,950): https://gemini.google/in/subscriptions/?hl=en-IN · https://www.businesstoday.in/technology/news/story/google-ai-plus-plan-everything-you-need-to-know-about-rs-199-subscription-506080-2025-12-10
- [S17] India app spend (Sensor Tower via TechCrunch): https://techcrunch.com/2026/07/31/india-is-starting-to-pay-for-apps-not-just-download-them/
- [S18a] Notion pricing (official): https://www.notion.com/pricing
- [S18b] Mem pricing and features (official): https://get.mem.ai/pricing
- [S18c] Sudowrite pricing (official): https://sudowrite.com/pricing
- [S18d] Obsidian pricing (official): https://obsidian.md/pricing
- [S18e] Reflect pricing (third-party): https://costbench.com/compare/mem-vs-reflect/
- [S19] Adapty, State of Paywalls (freemium 2.18 % median; productivity 3.5 %): https://adapty.io/blog/freemium-to-premium-conversion-techniques · CrazyEgg, free-to-paid conversion: https://www.crazyegg.com/blog/free-to-paid-conversion-rate/
- [S20] a16z, "Welcome to LLMflation": https://a16z.com/llmflation-llm-inference-cost/
- [S21] Meta AI on WhatsApp in India: https://www.storyboard18.com/amp/how-it-works/meta-rolls-out-meta-ai-for-indians-across-whatsapp-instagram-facebook-and-messenger-35169.htm
- [S22] WhatsApp bars general-purpose chatbots from the Business API (effective 15 Jan 2026): https://techcrunch.com/2025/10/18/whatssapp-changes-its-terms-to-bar-general-purpose-chatbots-from-its-platform/ · https://www.business-standard.com/technology/tech-news/meta-bans-ai-chatbots-from-whatsapp-business-api-chatgpt-to-shut-down-jan-2026-125102200335_1.html
- [S23] DPDP Rules 2025 notified, 18-month phased compliance (PIB): https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf · https://www.legal500.com/firms/237811-saga-legal/c-india/news-and-developments/the-privacy-timer-starts-now-analysing-the-dpdp-rules-and-its-18-month-countdown
- [S24] India WhatsApp assistants: https://cxotoday.com/media-coverage/braneum-launches-kara-a-proactive-ai-chief-of-staff-that-works-inside-whatsapp/ · https://www.lokmattimes.com/business/indian-startup-hello-aria-just-made-your-usd-20month-productivity-app-obsolete
- [S25] Groq pricing for gpt-oss-120b and Whisper large-v3-turbo (aggregated listing): https://computeprices.com/providers/groq/models/gpt-oss-120b · https://www.morphllm.com/groq-pricing
- [S26] Razorpay pricing (2 % + 0.99 % subscriptions + GST): https://razorpay.com/blog/cheapest-payment-gateway-for-recurring-billing-e-nach-upi-autopay-and-subscription/
- [S27] WhatsApp Business Platform pricing (Meta): https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
