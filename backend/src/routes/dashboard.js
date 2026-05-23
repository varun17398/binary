const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/dashboard/stats — all metrics in one call
router.get('/stats', async (req, res) => {
  try {
    const [overview, timeSeries, providers, errorLog] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*)                                          AS total_requests,
          COUNT(*) FILTER (WHERE status = 'success')       AS total_successes,
          COUNT(*) FILTER (WHERE status = 'error')         AS total_errors,
          ROUND(AVG(latency_ms))                           AS avg_latency_ms,
          ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms)) AS p95_latency_ms,
          COALESCE(SUM(input_tokens), 0)                   AS total_input_tokens,
          COALESCE(SUM(output_tokens), 0)                  AS total_output_tokens
        FROM inference_logs
      `),
      db.query(`
        SELECT
          date_trunc('hour', started_at)                          AS hour,
          COUNT(*)                                                AS requests,
          COUNT(*) FILTER (WHERE status = 'error')                AS errors,
          ROUND(AVG(latency_ms))                                  AS avg_latency_ms,
          COALESCE(SUM(input_tokens + output_tokens), 0)          AS total_tokens
        FROM inference_logs
        WHERE started_at > NOW() - INTERVAL '24 hours'
        GROUP BY hour
        ORDER BY hour
      `),
      db.query(`
        SELECT
          provider,
          model,
          COUNT(*)                                                   AS total_requests,
          COUNT(*) FILTER (WHERE status = 'success')                 AS successes,
          COUNT(*) FILTER (WHERE status = 'error')                   AS errors,
          ROUND(AVG(latency_ms))                                     AS avg_latency_ms,
          ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms)) AS p95_latency_ms,
          COALESCE(SUM(input_tokens), 0)                             AS total_input_tokens,
          COALESCE(SUM(output_tokens), 0)                            AS total_output_tokens
        FROM inference_logs
        GROUP BY provider, model
        ORDER BY total_requests DESC
      `),
      db.query(`
        SELECT id, provider, model, error_message, started_at, latency_ms
        FROM inference_logs
        WHERE status = 'error'
        ORDER BY started_at DESC
        LIMIT 10
      `),
    ]);

    res.json({
      overview: overview.rows[0],
      timeSeries: timeSeries.rows,
      providers: providers.rows,
      recentErrors: errorLog.rows,
    });
  } catch (err) {
    console.error('[DASHBOARD] Stats query failed:', err.message);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

module.exports = router;
