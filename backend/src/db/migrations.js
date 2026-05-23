const { query } = require('./index');

const migrations = [
  {
    name: 'create_inference_logs',
    sql: `
      CREATE TABLE IF NOT EXISTS inference_logs (
        id            UUID PRIMARY KEY,
        conversation_id UUID,
        provider      VARCHAR(50)  NOT NULL,
        model         VARCHAR(100) NOT NULL,
        status        VARCHAR(20)  NOT NULL CHECK (status IN ('success', 'error', 'pending')),
        latency_ms    INTEGER,
        input_tokens  INTEGER,
        output_tokens INTEGER,
        input_messages INTEGER,
        input_preview TEXT,
        output_preview TEXT,
        error_message TEXT,
        started_at    TIMESTAMPTZ NOT NULL,
        finished_at   TIMESTAMPTZ,
        received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        raw_payload   JSONB
      )
    `,
  },
  {
    name: 'create_inference_logs_indexes',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_logs_conversation_id ON inference_logs(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_logs_provider        ON inference_logs(provider);
      CREATE INDEX IF NOT EXISTS idx_logs_status          ON inference_logs(status);
      CREATE INDEX IF NOT EXISTS idx_logs_started_at      ON inference_logs(started_at DESC);
    `,
  },
  {
    name: 'create_conversations',
    sql: `
      CREATE TABLE IF NOT EXISTS conversations (
        id           UUID PRIMARY KEY,
        title        TEXT,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        message_count INTEGER NOT NULL DEFAULT 0
      )
    `,
  },
  {
    name: 'create_messages',
    sql: `
      CREATE TABLE IF NOT EXISTS messages (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role            VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        content         TEXT NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
    `,
  },
];

async function runMigrations() {
  console.log('[DB] Running migrations...');
  for (const { name, sql } of migrations) {
    await query(sql);
    console.log(`[DB] ✓ ${name}`);
  }
  console.log('[DB] All migrations applied.');
}

module.exports = { runMigrations };
