'use client';

import { useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState('');
  const [redacted, setRedacted] = useState('');
  const [metrics, setMetrics] = useState<{ total_requests: number; flagged_count: number; flag_rate: number } | null>(null);
  const [logs, setLogs] = useState<any[]>([]);

  // helper: fetch with timeout
  async function fetchWithTimeout(input: RequestInfo, init: RequestInit = {}, ms = 10000) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(input, { ...init, signal: ctrl.signal });
      return res;
    } finally {
      clearTimeout(id);
    }
  }

  // On mount: verify env + ping + load metrics/logs
  useEffect(() => {
    console.log('API_BASE =', API_BASE);
    if (!API_BASE) {
      setError('Frontend missing NEXT_PUBLIC_API_BASE. Put it in guardrail-admin/.env.local and restart `npm run dev`.');
      return;
    }

    (async () => {
      try {
        // ping health
        const ping = await fetchWithTimeout(`${API_BASE}/`, {}, 4000);
        if (!ping.ok) throw new Error(`Health check failed: ${ping.status}`);

        // load metrics
        const m = await fetchWithTimeout(`${API_BASE}/metrics`, {}, 6000);
        if (m.ok) setMetrics(await m.json());

        // load logs
        const lg = await fetchWithTimeout(`${API_BASE}/logs?limit=25`, {}, 6000);
        if (lg.ok) setLogs(await lg.json());
      } catch (e: any) {
        setError(`Startup error: ${e.message || e}`);
      }
    })();
  }, []);

  async function onScan() {
    setError(null);
    setScanning(true);
    setRaw('');
    setRedacted('');

    try {
      const res = await fetchWithTimeout(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      }, 15000);

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`POST /chat failed: ${res.status} ${text}`);
      }

      const data = await res.json();
      setRaw(data.raw_output || '');
      setRedacted(data.output_message || '');

      // refresh KPIs + logs after a successful scan
      const [m, lg] = await Promise.all([
        fetchWithTimeout(`${API_BASE}/metrics`, {}, 6000),
        fetchWithTimeout(`${API_BASE}/logs?limit=25`, {}, 6000),
      ]);

      if (m.ok) setMetrics(await m.json());
      if (lg.ok) setLogs(await lg.json());
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setScanning(false);
    }
  }

  function reset() {
    setPrompt('');
    setRaw('');
    setRedacted('');
    setError(null);
  }

  return (
    <main style={{ maxWidth: 980, margin: '40px auto', padding: 16 }}>
      <h1>GuardRail Wrapper — Showcase</h1>
      <p>Middleware that intercepts LLM outputs, redacts PII, logs incidents, and exposes KPIs.</p>

      <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
        <Kpi title="Total Requests" value={metrics?.total_requests ?? 0} />
        <Kpi title="Flagged Outputs" value={metrics?.flagged_count ?? 0} />
        <Kpi title="Flag Rate" value={`${((metrics?.flag_rate ?? 0) * 100).toFixed(1)}%`} />
      </div>

      <section style={{ marginTop: 24, padding: 16, border: '1px solid #eee', borderRadius: 8 }}>
        <h3>Prompt Tester</h3>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Paste text with emails/phones/SSNs…"
          rows={6}
          style={{ width: '100%', fontFamily: 'monospace', padding: 8 }}
        />

        <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
          <button onClick={onScan} disabled={scanning} style={{ padding: '8px 14px' }}>
            {scanning ? 'Scanning…' : 'Scan with Guardrails'}
          </button>
          <button onClick={reset} style={{ padding: '8px 14px' }}>Reset</button>
        </div>

        {error && <p style={{ color: 'crimson', marginTop: 12 }}>{error}</p>}

        {(raw || redacted) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
            <div>
              <h4>Raw Output</h4>
              <pre style={{ background: '#fafafa', padding: 8 }}>{raw || '—'}</pre>
            </div>
            <div>
              <h4>Redacted Output</h4>
              <pre style={{ background: '#fafafa', padding: 8 }}>{redacted || '—'}</pre>
            </div>
          </div>
        )}
      </section>

      <section style={{ marginTop: 24, padding: 16, border: '1px solid #eee', borderRadius: 8 }}>
        <h3>Recent Incidents</h3>
        {logs.length === 0 ? (
          <p>No incidents yet. Run a few scans.</p>
        ) : (
          <table width="100%" cellPadding={6} style={{ fontSize: 14 }}>
            <thead>
              <tr><th align="left">ID</th><th align="left">Time</th><th align="left">Provider</th><th align="left">Flagged</th><th align="left">Redactions</th></tr>
            </thead>
            <tbody>
              {logs.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{r.timestamp}</td>
                  <td>{r.provider}</td>
                  <td>{r.flagged ? 'Yes' : 'No'}</td>
                  <td>{Array.isArray(r.redactions) && r.redactions.length
                    ? r.redactions.map((x: any) => x.type).join(', ')
                    : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p style={{ marginTop: 24, color: '#777' }}>API: {API_BASE || '(missing NEXT_PUBLIC_API_BASE)'}</p>
    </main>
  );
}

function Kpi({ title, value }: { title: string; value: any }) {
  return (
    <div style={{ flex: 1, border: '1px solid #eee', borderRadius: 8, padding: 16 }}>
      <div style={{ color: '#666', fontSize: 12 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 600 }}>{value}</div>
    </div>
  );
}
