const bus = require('../bus');
const db = require('../../db');
const { redactPayload } = require('../../middleware/piiRedactor');

const REQUIRED = ['logId', 'provider', 'model', 'status', 'startedAt'];

async function persist(raw) {
  const missing = REQUIRED.filter(f => !raw[f]);
  if (missing.length) {
    console.warn('[INGEST] Dropping malformed log — missing:', missing.join(', '));
    return;
  }

  const payload = redactPayload(raw);

  try {
    await db.query(
      `INSERT INTO inference_logs (
        id, conversation_id, provider, model, status,
        latency_ms, input_tokens, output_tokens, input_messages,
        input_preview, output_preview, error_message,
        started_at, finished_at, raw_payload
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT (id) DO NOTHING`,
      [
        payload.logId,
        payload.conversationId || null,
        payload.provider,
        payload.model,
        payload.status,
        payload.latencyMs ?? null,
        payload.inputTokens ?? null,
        payload.outputTokens ?? null,
        payload.inputMessages ?? null,
        payload.inputPreview || null,
        payload.outputPreview || null,
        payload.errorMessage || null,
        payload.startedAt,
        payload.finishedAt || null,
        payload,
      ]
    );
    console.log(
      `[INGEST] ${payload.provider}/${payload.model} | ${payload.status} | ${payload.latencyMs}ms | in=${payload.inputTokens} out=${payload.outputTokens}`
    );
  } catch (err) {
    console.error('[INGEST] DB write failed:', err.message);
  }
}

function register() {
  bus.subscribe('inference.log', persist);
  console.log('[INGEST] Handler subscribed to inference.log');
}

module.exports = { register };
