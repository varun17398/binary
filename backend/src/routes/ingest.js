const express = require('express');
const router = express.Router();
const db = require('../db');
const bus = require('../events/bus');

const REQUIRED_FIELDS = ['logId', 'provider', 'model', 'status', 'startedAt'];

// POST /api/ingest — HTTP fallback for external SDK clients
// (internal SDK uses the event bus directly)
router.post('/', (req, res) => {
  const payload = req.body;

  const missing = REQUIRED_FIELDS.filter(f => !payload[f]);
  if (missing.length) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }

  const valid = ['success', 'error', 'pending'];
  if (!valid.includes(payload.status)) {
    return res.status(400).json({ error: `status must be one of: ${valid.join(', ')}` });
  }

  // Route through the same event bus so PII redaction and DB write are unified
  bus.publish('inference.log', payload);
  res.status(201).json({ logId: payload.logId, status: 'received' });
});

// GET /api/ingest — filterable log query
router.get('/', async (req, res) => {
  const { provider, status, conversationId, limit = 50, offset = 0 } = req.query;

  const conditions = [];
  const params = [];
  let i = 1;

  if (provider) { conditions.push(`provider = $${i++}`); params.push(provider); }
  if (status)   { conditions.push(`status = $${i++}`);   params.push(status); }
  if (conversationId) { conditions.push(`conversation_id = $${i++}`); params.push(conversationId); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(Number(limit), Number(offset));

  try {
    const [data, count] = await Promise.all([
      db.query(
        `SELECT id, conversation_id, provider, model, status,
                latency_ms, input_tokens, output_tokens, input_messages,
                input_preview, output_preview, error_message,
                started_at, finished_at, received_at
         FROM inference_logs ${where}
         ORDER BY started_at DESC LIMIT $${i} OFFSET $${i + 1}`,
        params
      ),
      db.query(`SELECT COUNT(*) FROM inference_logs ${where}`, params.slice(0, -2)),
    ]);
    res.json({ total: Number(count.rows[0].count), count: data.rows.length, logs: data.rows });
  } catch (err) {
    console.error('[INGEST] Query failed:', err.message);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

module.exports = router;
