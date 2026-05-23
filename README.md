# Binary — LLM Inference Logging & Observability Platform

A full-stack system for running multi-provider LLM conversations with real-time inference logging, a metrics dashboard, PII redaction, and an event-driven ingestion pipeline.

---

## Table of Contents

- [Setup Instructions](#setup-instructions)
- [Architecture Overview](#architecture-overview)
- [Schema Design Decisions](#schema-design-decisions)
- [Tradeoffs Made](#tradeoffs-made)
- [What I Would Improve With More Time](#what-i-would-improve-with-more-time)

---

## Setup Instructions

### Prerequisites

- Node.js 20+
- PostgreSQL 16+ **or** Docker + Docker Compose

### Option A — Local Development

**1. Clone and install dependencies**

```bash
git clone <repo-url>
cd binary

npm install            # from backend/
cd frontend && npm install
```

**2. Configure environment variables**

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

```env
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here      # optional — enables GPT-4o mini
PORT=3001

DB_HOST=localhost
DB_PORT=5432
DB_NAME=binary_db
DB_USER=binary
DB_PASSWORD=binary_pass
```

**3. Create the database**

```bash
psql -U postgres -c "CREATE USER binary WITH PASSWORD 'binary_pass';"
psql -U postgres -c "CREATE DATABASE binary_db OWNER binary;"
```

> Migrations run automatically on backend startup — no separate step needed.

**4. Start both servers**

```bash
# Terminal 1
cd backend && npm run dev     # http://localhost:3001

# Terminal 2
cd frontend && npm run dev    # http://localhost:5173
```

Open **http://localhost:5173** in your browser.

---

### Option B — Docker Compose (one command)

**1. Create a root `.env` file**

```bash
cp .env.example .env
# Fill in ANTHROPIC_API_KEY and optionally OPENAI_API_KEY
```

**2. Start everything**

```bash
docker compose up --build
```

This brings up PostgreSQL, the backend (with auto-migrations), and the frontend served via nginx — all wired together. App is available at **http://localhost**.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
│   React + Vite   ─── Chat UI ─── Dashboard (Recharts)       │
└────────────────────────┬────────────────────────────────────┘
                         │  SSE / REST
┌────────────────────────▼────────────────────────────────────┐
│                     Express Backend                         │
│                                                             │
│  POST /api/chat                                             │
│    │                                                        │
│    ├── conversationStore (PostgreSQL)                       │
│    │     load history → build context → persist messages    │
│    │                                                        │
│    └── loggedSend()  ← inferenceLogger SDK                  │
│          │                                                  │
│          ├── provider.send()  ← normalized stream           │
│          │     ├── claude.js  (Anthropic SDK)               │
│          │     └── openai.js  (OpenAI SDK)                  │
│          │                                                  │
│          └── InferenceBus.publish('inference.log')          │
│                │                                            │
│                └── ingestHandler.subscribe()                │
│                      │                                      │
│                      ├── piiRedactor  (regex scrub)         │
│                      └── INSERT INTO inference_logs         │
│                                                             │
│  GET /api/dashboard/stats  ──► aggregation queries          │
│  GET /api/ingest           ──► filterable log query         │
└─────────────────────────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                    PostgreSQL 16                             │
│   conversations │ messages │ inference_logs                 │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

**Inference Logger SDK (`src/sdk/inferenceLogger.js`)**
A transparent wrapper around any LLM provider call. It wraps the streaming response in an async generator that intercepts token counts and content on the side, then publishes a structured log to the event bus after the stream ends. Zero impact on response latency.

**Event Bus (`src/events/bus.js`)**
A thin `EventEmitter` wrapper with a `publish` / `subscribe` interface. The SDK publishes `inference.log` events; the ingest handler subscribes and writes to the database. The abstraction is designed to be swapped for Redis Pub/Sub or Kafka by replacing one file.

**Normalized Provider Streams**
Both Claude and OpenAI providers normalize their raw SDK events into a common format:
- `{ type: 'text', text }` — a chunk of output text
- `{ type: 'usage', inputTokens, outputTokens }` — token counts at stream end

This makes `chat.js` and `inferenceLogger.js` fully provider-agnostic.

**PII Redaction (`src/middleware/piiRedactor.js`)**
Applied inside the ingest handler before any DB write. Regex patterns scrub `input_preview` and `output_preview` for emails, phone numbers, SSNs, credit card numbers, and IP addresses. The raw conversation content in the `messages` table is intentionally not redacted — only the log previews are.

**Dashboard**
`GET /api/dashboard/stats` runs four parallel PostgreSQL queries and returns overview metrics, hourly time-series (last 24h), per-provider breakdown, and recent errors in a single response. The frontend renders these with Recharts bar, line, and pie charts.

---

## Schema Design Decisions

### Three-table design

```sql
conversations
  id            UUID PRIMARY KEY
  title         TEXT                      -- set from first user message
  created_at    TIMESTAMPTZ
  updated_at    TIMESTAMPTZ
  message_count INTEGER

messages
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE
  role            VARCHAR(20) CHECK (role IN ('user','assistant','system'))
  content         TEXT
  created_at      TIMESTAMPTZ

inference_logs
  id              UUID PRIMARY KEY          -- logId from SDK
  conversation_id UUID                      -- nullable (external SDK clients)
  provider        VARCHAR(50)
  model           VARCHAR(100)
  status          VARCHAR(20) CHECK (status IN ('success','error','pending'))
  latency_ms      INTEGER
  input_tokens    INTEGER
  output_tokens   INTEGER
  input_messages  INTEGER
  input_preview   TEXT                      -- PII-redacted
  output_preview  TEXT                      -- PII-redacted
  error_message   TEXT
  started_at      TIMESTAMPTZ
  finished_at     TIMESTAMPTZ
  received_at     TIMESTAMPTZ DEFAULT NOW()
  raw_payload     JSONB                     -- full log for future replay
```

**Why separate `conversations` and `messages` instead of storing messages as JSONB?**
Individual rows make it cheap to query a single message, paginate history, count turns, and join selectively. A JSONB column would load the entire history for every read.

**Why store `raw_payload JSONB` on inference logs?**
Schema will evolve — new providers emit new fields. Storing the full payload means nothing is lost, and future migrations can extract new columns from existing data without re-ingestion.

**Why `ON DELETE CASCADE` on messages?**
Conversations and their messages are a single logical unit. Orphaned messages have no value and waste space.

**Why UUID primary keys instead of serial integers?**
The log ID is generated in the SDK before the DB write. Using UUIDs means the SDK is the source of truth for IDs, enabling `ON CONFLICT DO NOTHING` for idempotent ingestion — safe to retry without creating duplicates.

**Indexes**

```sql
idx_logs_conversation_id   -- join from conversation detail view
idx_logs_provider          -- filter by provider in dashboard
idx_logs_status            -- filter errors
idx_logs_started_at DESC   -- time-ordered queries and time-series aggregation
idx_messages_conversation_id
```

---

## Tradeoffs Made

**In-process event bus vs. external message broker**
Using Node's `EventEmitter` keeps the stack simple — no Redis or Kafka dependency for a single-node deployment. The tradeoff is that events are lost if the process crashes between emit and DB write. An external broker would give durability and fan-out to multiple consumers. The `InferenceBus` abstraction is designed so this swap is one file change.

**SSE over WebSockets for streaming**
SSE is unidirectional (server → client), which is all we need for streaming LLM responses. It works over plain HTTP/1.1, requires no upgrade handshake, and reconnects automatically in browsers. The tradeoff is that it cannot push unsolicited server events (e.g. push notifications). WebSockets would be needed if we wanted the server to proactively push new conversation activity across tabs.

**PII redaction on previews only, not full message content**
The `messages` table stores raw content so conversation context is preserved for multi-turn LLM calls. Redacting it would break the chatbot. Only the `input_preview` and `output_preview` fields in `inference_logs` are redacted, since those are the fields analysts query. The tradeoff is that PII exists in the messages table — a stricter posture would encrypt that column at rest.

**Migrations on startup instead of a separate CLI**
Running `runMigrations()` in `start()` means the app is always self-migrating. It's convenient for Docker and k8s deployments where you can't easily run a pre-job. The tradeoff is that it's dangerous in a multi-replica deployment if migrations are not idempotent — all `CREATE TABLE IF NOT EXISTS` statements here are, so it's safe.

**In-memory conversation store replaced, not kept**
The old `store/conversations.js` was deleted in favour of the DB-backed store. A fallback/in-memory mode would have made the app runnable without a database, but it would have added branching logic and hidden bugs where the two stores behaved differently.

**Context window capped at 20 messages**
Keeps token costs predictable and responses fast. The tradeoff is that very long conversations lose early context. A smarter approach would use a sliding window with a summary of older turns.

---

## What I Would Improve With More Time

**1. Streaming token budget and cost tracking**
Track estimated cost per request based on provider pricing tables. Surface cost-per-conversation in the dashboard. Alert when a conversation exceeds a threshold.

**2. Replace EventEmitter with Redis Streams**
For production multi-replica deployments, the in-process bus doesn't work — each replica has its own bus. Redis Streams would give a durable, ordered, replayable log with consumer groups. The `InferenceBus` interface is already designed for this swap.

**3. Full-text search on conversation history**
Add a `tsvector` column on `messages.content` with a GIN index. This would power a search bar that lets users find past conversations by keyword — a table-stakes feature for any chat product.

**4. Auth and multi-tenancy**
Currently there's no authentication. Adding JWT-based auth and scoping conversations and logs per user/org would make this production-ready. All queries would gain a `user_id` filter.

**5. Smarter PII detection**
The regex approach has false positives (e.g. version numbers matching phone patterns) and misses unstructured PII like names. A proper solution would use a dedicated library (Presidio, AWS Comprehend) or a small local NLP model fine-tuned for PII detection.

**6. Log replay and backfill**
Because the full `raw_payload` is stored as JSONB, it's possible to replay historical logs through a new parser if the schema changes. Building a CLI tool to run backfill migrations on existing logs would make schema evolution much safer.

**7. Alerting**
Wire the ingest handler to emit alerts (Slack, PagerDuty) when error rate or p95 latency exceeds a threshold over a rolling window. The event bus already makes it trivial to add a second subscriber for this.

**8. Automated tests**
Unit tests for `piiRedactor.js` and `inferenceLogger.js`, integration tests for the ingest pipeline against a test database, and end-to-end tests for the chat flow using a mocked LLM provider.
