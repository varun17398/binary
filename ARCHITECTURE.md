# Binary — Architecture Documentation

## Overview

Binary is a **fullstack LLM inference logging and observability platform**. It enables users to chat with multiple LLM providers (Claude, OpenAI) while automatically capturing, validating, and analyzing inference logs. The system provides real-time chat, historical conversation management, and a dashboard for observability.

### Core Philosophy
- **Provider-agnostic**: Normalize provider-specific APIs into a unified interface
- **Event-driven**: Decouple chat from logging via an event bus (easily swappable to Kafka/Redis)
- **Privacy-first**: Redact PII before database writes
- **Observable**: Capture latency, token usage, errors, and full payloads for analysis

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React + Vite)                  │
│  ┌──────────────────┐      ┌──────────────────┐                │
│  │  Chat Window     │      │  Dashboard       │                │
│  │ (streaming SSE)  │      │ (Recharts stats) │                │
│  └────────┬─────────┘      └────────┬─────────┘                │
└───────────┼──────────────────────────┼────────────────────────┘
            │                          │
     /api/chat (SSE)          /api/dashboard/stats
            │                          │
┌───────────▼──────────────────────────▼────────────────────────┐
│                    Backend (Express.js)                        │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  Routes                                                 │  │
│  │  • POST /api/chat → Provider selection + streaming     │  │
│  │  • GET /api/conversations → CRUD operations            │  │
│  │  • POST /api/ingest → HTTP fallback for external SDKs  │  │
│  │  • GET /api/dashboard/stats → Aggregated metrics       │  │
│  └────────────┬──────────────────────────────────────────┘  │
│               │                                               │
│  ┌────────────▼──────────────────────────────────────────┐  │
│  │  SDK & Logging Layer                                  │  │
│  │  • inferenceLogger.loggedSend()                       │  │
│  │    - Wraps LLM provider calls                         │  │
│  │    - Tracks timing, tokens, errors                   │  │
│  │    - Emits to EventBus                               │  │
│  └────────────┬──────────────────────────────────────────┘  │
│               │                                               │
│  ┌────────────▼──────────────────────────────────────────┐  │
│  │  Event Bus (Node EventEmitter)                        │  │
│  │  • Decouples chat from persistence                   │  │
│  │  • Emits 'inference_logged' events                   │  │
│  │  • Designed for Kafka/Redis migration                │  │
│  └────────────┬──────────────────────────────────────────┘  │
│               │                                               │
│  ┌────────────▼──────────────────────────────────────────┐  │
│  │  Event Handlers                                       │  │
│  │  • ingestHandler: PII redaction → DB write           │  │
│  │  (More handlers easily added)                         │  │
│  └────────────┬──────────────────────────────────────────┘  │
│               │                                               │
│  ┌────────────▼──────────────────────────────────────────┐  │
│  │  LLM Services                                         │  │
│  │  • Claude (Anthropic SDK)                            │  │
│  │  • OpenAI (OpenAI SDK)                               │  │
│  │  • Both normalized to unified stream format          │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
             │
             └──────────────┐
                            │
┌───────────────────────────▼────────────────────┐
│         Database (PostgreSQL 16)               │
│                                                │
│  • conversations (metadata + message count)   │
│  • messages (chat history)                    │
│  • inference_logs (provenance, metrics)       │
│                                                │
│  Features:                                     │
│  • Idempotent ingest (ON CONFLICT)            │
│  • JSONB for flexible payload storage         │
│  • Indexed on provider, status, timestamp     │
└────────────────────────────────────────────────┘
```

---

## Data Flow

### Chat Flow (Real-time)
1. **Frontend** → User selects provider, types message
2. **POST /api/chat** → Backend routes to selected provider
3. **inferenceLogger.loggedSend()** wraps the LLM call
4. **LLM Service** (Claude/OpenAI) streams response chunks
5. **Inference logged event** emitted to EventBus with metadata
6. **ingestHandler** subscribes, redacts PII, writes to DB
7. **Frontend** receives SSE stream, displays in real-time

### Conversation Management Flow
1. Frontend displays list of past conversations (GET /api/conversations)
2. User can resume a conversation (GET /api/conversations/:id)
3. New messages added to conversation
4. Messages and inference logs linked via conversation_id

### Dashboard Flow
1. **GET /api/dashboard/stats** aggregates inference_logs table
2. Returns: overview (total calls, avg latency, error rate), time series (calls/hour), provider breakdown, recent errors
3. Frontend renders with Recharts (bar, line, pie charts)

---

## Key Components

### Backend Structure

#### `src/app.js`
- Express app initialization
- Auto-run database migrations on startup
- Register event bus handlers
- Define routes

#### `src/routes/chat.js`
- **POST /api/chat**: Main chat endpoint (SSE)
  - Accept: `{ provider, messages }`
  - Response: Server-Sent Events stream
  - Calls `inferenceLogger.loggedSend()` internally
- **GET /api/chat/providers**: List available providers

#### `src/routes/conversations.js`
- **GET /api/conversations**: List all conversations
- **GET /api/conversations/:id**: Get conversation with full message history
- **DELETE /api/conversations/:id**: Delete conversation and related messages/logs

#### `src/routes/ingest.js`
- **POST /api/ingest**: HTTP endpoint for external SDK clients
  - Accept raw inference log objects
  - Validate and emit to event bus
- **GET /api/ingest**: Query inference logs with filters
  - Filters: provider, status, conversationId, timestamp range

#### `src/routes/dashboard.js`
- **GET /api/dashboard/stats**: Aggregated metrics
  - Overview: total calls, avg latency, error rate, token totals
  - Time series: calls per hour (last 24h)
  - Provider breakdown: calls by provider
  - Recent errors: last 10 failed inferences

#### `src/sdk/inferenceLogger.js`
- Core logging SDK
- **loggedSend(provider, messages)**: Wraps LLM call
  - Measures latency and token usage
  - Captures input/output previews
  - Emits 'inference_logged' event to bus
  - Returns provider's response to caller

#### `src/events/bus.js`
- **InferenceBus**: Wraps Node EventEmitter
- Provides `subscribe(eventName, handler)` and `emit(event, data)` methods
- Designed to be swappable for Kafka/Redis without changing subscribers

#### `src/events/handlers/ingestHandler.js`
- Subscribes to 'inference_logged' events
- **PII Redaction**: Removes email, phone, SSN, card, IP addresses before DB write
- **Idempotent insert**: Uses `ON CONFLICT DO NOTHING` to prevent duplicate logs

#### `src/services/llm/`
- **index.js**: getProvider(), listProviders()
- **claude.js**: Anthropic SDK integration
  - Normalizes response to `{ type: 'text', data }` and `{ type: 'usage', tokens }`
- **openai.js**: OpenAI SDK integration
  - Same normalized format for unified handling

#### `src/db/`
- **index.js**: pg Pool configuration and pooling
- **migrations.js**: Auto-create tables if missing
  - Runs synchronously on app startup
- **conversationStore.js**: Conversation CRUD operations

#### `src/middleware/piiRedactor.js`
- Redaction patterns: email, phone, SSN, credit card, IPv4
- Used by ingestHandler before DB write

### Frontend Structure

#### `src/App.jsx`
- Main component with two tabs: Chat and Dashboard
- State management: active conversation, messages
- API client wrapper calls

#### `src/components/ChatWindow.jsx`
- Provider selector dropdown
- Message input with send button
- Real-time streaming display
- Handles SSE ReadableStream parsing

#### `src/components/ConversationList.jsx`
- Lists all past conversations
- Resume conversation button
- Delete conversation with confirmation

#### `src/components/Dashboard.jsx`
- Recharts visualizations: bar, line, pie charts
- Tables for recent errors and provider stats
- Fetches from /api/dashboard/stats

#### `src/api.js`
- Fetch wrapper for backend endpoints
- Handles SSE stream parsing for /api/chat

---

## Database Schema

### conversations
```sql
id          SERIAL PRIMARY KEY
title       TEXT                    -- Auto-derived from first user message
created_at  TIMESTAMP DEFAULT NOW()
updated_at  TIMESTAMP DEFAULT NOW()
message_count INT DEFAULT 0         -- Denormalized for dashboard queries
```

### messages
```sql
id              SERIAL PRIMARY KEY
conversation_id INT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE
role            TEXT                -- 'user' or 'assistant'
content         TEXT
created_at      TIMESTAMP DEFAULT NOW()
```

### inference_logs
```sql
id               SERIAL PRIMARY KEY
conversation_id  INT REFERENCES conversations(id) ON DELETE CASCADE
provider         TEXT                -- 'claude' or 'openai'
model            TEXT                -- Specific model name
status           TEXT                -- 'success' or 'error'
latency_ms       INT
input_tokens     INT
output_tokens    INT
input_preview    TEXT                -- First 200 chars of input
output_preview   TEXT                -- First 200 chars of output
error_message    TEXT
started_at       TIMESTAMP
finished_at      TIMESTAMP
raw_payload      JSONB               -- Full API response for debugging
created_at       TIMESTAMP DEFAULT NOW()

-- Indexes for fast queries
CREATE INDEX idx_inference_logs_provider ON inference_logs(provider);
CREATE INDEX idx_inference_logs_status ON inference_logs(status);
CREATE INDEX idx_inference_logs_started_at ON inference_logs(started_at DESC);
CREATE INDEX idx_inference_logs_conversation_id ON inference_logs(conversation_id);
```

---

## Technology Stack

| Layer | Technology | Version/Notes |
|-------|-----------|---------------|
| **Language** | JavaScript (Node.js) | No TypeScript |
| **Backend** | Express.js | Lightweight, minimal middleware |
| **Frontend** | React + Vite | Fast dev server, optimized builds |
| **UI Components** | Recharts | Data visualization library |
| **LLM Providers** | Anthropic SDK, OpenAI SDK | Latest versions |
| **Database** | PostgreSQL | v16 local; Docker in production |
| **Streaming** | Server-Sent Events (SSE) | Via native fetch + ReadableStream |
| **Event Bus** | Node EventEmitter | Designed for Kafka/Redis migration |
| **Containerization** | Docker + Docker Compose | One-command dev setup |
| **Container Orchestration** | Kubernetes | Ingress, StatefulSets, PVC for postgres |
| **Reverse Proxy** | nginx | Handles SSE forwarding, long timeouts |

---

## Key Design Decisions

### 1. Provider Stream Normalization
**Decision**: Normalize Claude and OpenAI streams to `{ type: 'text', data }` and `{ type: 'usage', tokens }` at the service layer.

**Why**: Decouples route handlers from provider-specific APIs. Adding a new provider requires only a new service file; routes unchanged.

### 2. Event-Driven Logging
**Decision**: Emit 'inference_logged' events from inferenceLogger to a bus; handlers subscribe asynchronously.

**Why**: 
- Decouples chat latency from database writes
- Allows multiple handlers (logging, metrics, alerts) without modifying core logic
- Easy to swap EventEmitter for Kafka/Redis for distributed systems

### 3. PII Redaction Before Database Write
**Decision**: Redact sensitive data in ingestHandler before inserting into inference_logs.

**Why**: Reduces risk of data leakage. Redacted data is immutable in DB (not redacted on read).

### 4. Idempotent Ingest
**Decision**: Use `INSERT ... ON CONFLICT DO NOTHING` for inference_logs.

**Why**: If a webhook retries or duplicate events arrive, no duplicate logs are created. Safe for distributed systems.

### 5. Denormalized message_count on conversations
**Decision**: Maintain a count on the conversations table updated on message insert.

**Why**: Faster conversation list queries (no JOIN needed). Dashboard can display conversation sizes without subqueries.

### 6. JSONB for Full Payload
**Decision**: Store raw_payload as JSONB instead of separate columns for every field.

**Why**: 
- Flexible for different provider response structures
- Allows ad-hoc queries (e.g., `WHERE raw_payload->>'model' = 'gpt-4'`)
- Extensible without schema migrations

### 7. nginx proxy_buffering off
**Decision**: Disable nginx buffering for /api/chat route.

**Why**: Required for SSE to stream in real-time. With buffering on, the first chunk may be delayed.

### 8. Frontend Conversation State
**Decision**: Cache conversation list in React state; fetch on mount and after deletion.

**Why**: Minimal re-fetching; UI feels responsive. Conversations are not frequently updated elsewhere.

---

## Deployment

### Local Development
```bash
# Backend
cd backend && npm install && npm run dev  # Port 3001

# Frontend
cd frontend && npm install && npm run dev # Port 5173 (proxies /api to :3001)
```

### Docker Compose (Single Command)
```bash
ANTHROPIC_API_KEY=sk-ant-... docker compose up
```

Runs:
- PostgreSQL 16 (port 5432)
- Express backend (port 3001)
- React frontend (port 5173)

### Kubernetes
```bash
kubectl apply -f k8s/
```

Includes:
- Postgres StatefulSet with PVC
- Backend Deployment (2 replicas, HPA ready)
- Frontend Deployment (2 replicas)
- NGINX Ingress (handles SSE headers)
- Secrets for API keys

---

## Extending the System

### Adding a New LLM Provider
1. Create `src/services/llm/newprovider.js`
2. Implement normalized stream: `{ type: 'text', data }` and `{ type: 'usage', tokens }`
3. Update `src/services/llm/index.js` to register the provider
4. No route changes needed

### Adding a New Event Handler
1. Create handler in `src/events/handlers/`
2. Subscribe in `app.js`: `bus.subscribe('inference_logged', handler)`
3. Handler receives event data with full inference log

### Adding Metrics/Monitoring
1. Add handler to subscribe to 'inference_logged'
2. Push metrics to Prometheus, Datadog, etc.
3. No core logic changes

### Swapping EventEmitter for Kafka
1. Update `src/events/bus.js` to use Kafka client
2. Keep `subscribe()` and `emit()` interface the same
3. All subscribers and emitters work unchanged

---

## Environment Variables

```bash
# API Keys (required)
ANTHROPIC_API_KEY=sk-ant-...

# API Keys (optional)
OPENAI_API_KEY=sk-...  # If provided, OpenAI provider is enabled

# Server
PORT=3001              # Backend port

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=binary
DB_USER=postgres
DB_PASSWORD=postgres
```

---

## Observability

### Logging
- Console logs at route entry/exit
- Event bus logs on emission
- Ingest handler logs redaction and DB write status

### Metrics
- Latency per provider (stored in inference_logs.latency_ms)
- Token usage per provider (input_tokens, output_tokens)
- Error rate per provider (count WHERE status = 'error')
- Dashboard aggregates and visualizes

### Error Tracking
- inference_logs.error_message captures API errors
- Dashboard shows recent 10 errors
- GET /api/ingest filters by status='error' for debugging

---

## Future Roadmap

1. **Authentication**: Add user accounts and conversation ownership
2. **Caching**: Add Redis cache layer for dashboard queries
3. **Cost Attribution**: Track cost per provider and charge-back to users
4. **Alerts**: Email alerts on error spike or latency anomaly
5. **Custom Redaction Rules**: User-configurable PII patterns
6. **API Rate Limiting**: Token-bucket or sliding-window on /api/ingest
7. **Batch Ingest**: Support bulk log uploads for external SDKs
