import { useEffect, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';

const COLORS = ['#7c6af7', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];

function StatCard({ label, value, sub }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function fmt(n) { return n == null ? '—' : Number(n).toLocaleString(); }
function fmtMs(n) { return n == null ? '—' : `${fmt(n)} ms`; }
function fmtHour(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, '0')}:00`;
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/dashboard/stats');
      if (!res.ok) throw new Error('Failed to load stats');
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="dash-loading">Loading dashboard...</div>;
  if (error)   return <div className="dash-error">{error}</div>;
  if (!data)   return null;

  const { overview, timeSeries, providers, recentErrors } = data;

  const errorRate = overview.total_requests > 0
    ? ((overview.total_errors / overview.total_requests) * 100).toFixed(1)
    : '0.0';

  const pieData = providers.map(p => ({
    name: `${p.provider}/${p.model}`,
    value: Number(p.total_requests),
  }));

  return (
    <div className="dashboard">
      <div className="dash-header">
        <h1>Dashboard</h1>
        <button className="refresh-btn" onClick={load}>Refresh</button>
      </div>

      {/* Overview cards */}
      <div className="stat-grid">
        <StatCard label="Total Requests"   value={fmt(overview.total_requests)} />
        <StatCard label="Success Rate"     value={`${(100 - Number(errorRate)).toFixed(1)}%`} sub={`${fmt(overview.total_successes)} successes`} />
        <StatCard label="Error Rate"       value={`${errorRate}%`} sub={`${fmt(overview.total_errors)} errors`} />
        <StatCard label="Avg Latency"      value={fmtMs(overview.avg_latency_ms)} sub={`p95: ${fmtMs(overview.p95_latency_ms)}`} />
        <StatCard label="Input Tokens"     value={fmt(overview.total_input_tokens)} />
        <StatCard label="Output Tokens"    value={fmt(overview.total_output_tokens)} />
      </div>

      <div className="chart-row">
        {/* Requests over time */}
        <div className="chart-card wide">
          <h2>Requests (last 24h)</h2>
          {timeSeries.length === 0 ? (
            <p className="no-data">No data yet — send some messages first.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={timeSeries.map(r => ({ ...r, hour: fmtHour(r.hour) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="requests" name="Requests" fill="#7c6af7" radius={[3,3,0,0]} />
                <Bar dataKey="errors"   name="Errors"   fill="#ef4444" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Provider share */}
        <div className="chart-card">
          <h2>Provider Share</h2>
          {pieData.length === 0 ? (
            <p className="no-data">No data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                     outerRadius={80} label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="chart-row">
        {/* Latency over time */}
        <div className="chart-card wide">
          <h2>Avg Latency (last 24h)</h2>
          {timeSeries.length === 0 ? (
            <p className="no-data">No data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={timeSeries.map(r => ({ ...r, hour: fmtHour(r.hour) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit="ms" />
                <Tooltip formatter={v => [`${v} ms`, 'Avg Latency']} />
                <Line type="monotone" dataKey="avg_latency_ms" name="Avg Latency"
                      stroke="#7c6af7" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Token usage over time */}
        <div className="chart-card wide">
          <h2>Token Usage (last 24h)</h2>
          {timeSeries.length === 0 ? (
            <p className="no-data">No data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={timeSeries.map(r => ({ ...r, hour: fmtHour(r.hour) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="total_tokens" name="Tokens" fill="#06b6d4" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Provider breakdown table */}
      <div className="table-card">
        <h2>Provider Breakdown</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Provider</th><th>Model</th><th>Requests</th>
              <th>Errors</th><th>Avg Latency</th><th>p95 Latency</th>
              <th>Input Tokens</th><th>Output Tokens</th>
            </tr>
          </thead>
          <tbody>
            {providers.map((p, i) => (
              <tr key={i}>
                <td>{p.provider}</td>
                <td><code>{p.model}</code></td>
                <td>{fmt(p.total_requests)}</td>
                <td className={Number(p.errors) > 0 ? 'error-cell' : ''}>{fmt(p.errors)}</td>
                <td>{fmtMs(p.avg_latency_ms)}</td>
                <td>{fmtMs(p.p95_latency_ms)}</td>
                <td>{fmt(p.total_input_tokens)}</td>
                <td>{fmt(p.total_output_tokens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Recent errors */}
      {recentErrors.length > 0 && (
        <div className="table-card">
          <h2>Recent Errors</h2>
          <table className="data-table">
            <thead>
              <tr><th>Time</th><th>Provider</th><th>Model</th><th>Latency</th><th>Message</th></tr>
            </thead>
            <tbody>
              {recentErrors.map((e, i) => (
                <tr key={i}>
                  <td>{new Date(e.started_at).toLocaleTimeString()}</td>
                  <td>{e.provider}</td>
                  <td><code>{e.model}</code></td>
                  <td>{fmtMs(e.latency_ms)}</td>
                  <td className="error-cell">{e.error_message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
