/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import styles from "./page.module.css";
import { useEffect, useMemo, useState } from "react";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "https://guardrail-wrapper.onrender.com";

type RedactionType = "email" | "phone" | "ssn" | "credit_card" | "name" | "other";

interface Incident {
  id: number;
  time: string;
  provider: string;
  flagged: boolean;
  redactions: RedactionType[];
}
interface Metrics { total_requests: number; flagged_count: number; flag_rate: number; }
interface ScanRequest { prompt: string; }
interface ScanResponse { raw_output: string; redacted_output: string; flagged: boolean; incidents: Incident[]; }
interface LogEntry { id: number; time: string; level: "info" | "warn" | "error"; message: string; }
interface ChatRequest { user: string; message: string; }
interface ChatReply { answer: string; flagged: boolean; redactions: RedactionType[]; }

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
  return (await res.json()) as T;
}
function formatRate(n: number) { return `${((n || 0) * 100).toFixed(1)}%`; }

export default function Page() {
  const [prompt, setPrompt] = useState("");
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [loadingScan, setLoadingScan] = useState(false);

  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loadingDash, setLoadingDash] = useState(true);
  const apiHealthy = useMemo(() => Boolean(API_URL), []);

  useEffect(() => {
    (async () => {
      if (!API_URL) return;
      setLoadingDash(true);
      try {
        const [m, recent, l] = await Promise.all([
          fetchJSON<Metrics>(`${API_URL}/metrics`),
          fetchJSON<Incident[]>(`${API_URL}/incidents?limit=10`),
          fetchJSON<LogEntry[]>(`${API_URL}/logs?limit=10`),
        ]);
        setMetrics(m); setIncidents(recent); setLogs(l);
      } catch (e) { console.error(e); } finally { setLoadingDash(false); }
    })();
  }, []);

  const onSubmitPrompt = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!prompt.trim() || !API_URL) return;
    setLoadingScan(true); setScan(null);
    try {
      const body: ScanRequest = { prompt };
      const result = await fetchJSON<ScanResponse>(`${API_URL}/scan`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
      });
      setScan(result);
    } catch (err) {
      console.error(err);
      setScan({ raw_output: "—", redacted_output: "Request failed. See console for details.", flagged: false, incidents: [] });
    } finally { setLoadingScan(false); }
  };

  const sendChat = async (message: string): Promise<ChatReply | null> => {
    if (!API_URL) return null;
    const body: ChatRequest = { user: "tester", message };
    return fetchJSON<ChatReply>(`${API_URL}/chat`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
  };

  return (
    <div className={styles.wrapper}>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Showcase</h1>
        <p className={styles.lede}>
          Middleware that intercepts LLM outputs, redacts PII, logs incidents, and exposes KPIs.
        </p>
        {!apiHealthy && (
          <p className="text-sm text-amber-600">
            Set <code>NEXT_PUBLIC_API_URL</code> in Vercel env to your Render URL.
          </p>
        )}
      </header>

      {/* KPIs */}
      <section className={styles.kpis}>
        <div className={styles.card}>
          <div className={styles.kpiLabel}>Total Requests</div>
          <div className={styles.kpiValue}>{loadingDash ? "—" : metrics?.total_requests ?? 0}</div>
        </div>
        <div className={styles.card}>
          <div className={styles.kpiLabel}>Flagged Outputs</div>
          <div className={styles.kpiValue}>{loadingDash ? "—" : metrics?.flagged_count ?? 0}</div>
        </div>
        <div className={styles.card}>
          <div className={styles.kpiLabel}>Flag Rate</div>
          <div className={styles.kpiValue}>{loadingDash ? "—" : formatRate(metrics?.flag_rate ?? 0)}</div>
        </div>
      </section>

      {/* Prompt Tester */}
      <section className={styles.card}>
        <h2 className="text-lg font-semibold mb-3">Prompt Tester</h2>
        <form onSubmit={onSubmitPrompt} className="space-y-3">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Try: Send the file to j.smith(at)company(dot)com"
            className="w-full min-h-[96px] rounded-lg border p-3 outline-none"
          />
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={loadingScan || !prompt.trim()}
              className="rounded-lg bg-black text-white px-4 py-2 disabled:opacity-50"
            >
              {loadingScan ? "Scanning…" : "Scan with Guardrails"}
            </button>
            <button type="button" onClick={() => setPrompt("")} className="rounded-lg border px-3 py-2">
              Reset
            </button>
          </div>
        </form>

        {scan && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="rounded-lg border p-3">
              <div className="text-sm font-medium mb-2">Raw Output</div>
              <pre className="whitespace-pre-wrap text-sm">{scan.raw_output}</pre>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-sm font-medium mb-2">
                Redacted Output {scan.flagged ? "• Flagged" : ""}
              </div>
              <pre className="whitespace-pre-wrap text-sm">{scan.redacted_output}</pre>
            </div>
          </div>
        )}
      </section>

      {/* Recent Incidents */}
      <section className={styles.card}>
        <h2 className="text-lg font-semibold mb-3">Recent Incidents</h2>
        <div className="overflow-x-auto">
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>ID</th>
                <th className={styles.th}>Time</th>
                <th className={styles.th}>Provider</th>
                <th className={styles.th}>Flagged</th>
                <th className={styles.th}>Redactions</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((it) => (
                <tr key={it.id}>
                  <td className={styles.td}>{it.id}</td>
                  <td className={styles.td}>{new Date(it.time).toLocaleString()}</td>
                  <td className={styles.td}>{it.provider}</td>
                  <td className={styles.td}>
                    <span className={styles.badge}>{it.flagged ? "Yes" : "No"}</span>
                  </td>
                  <td className={styles.td}>{it.redactions.join(", ") || "—"}</td>
                </tr>
              ))}
              {!incidents.length && (
                <tr>
                  <td className={styles.td} colSpan={5}>
                    {loadingDash ? "Loading…" : "No incidents yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Quick Chat */}
      <section className={styles.card}>
        <h2 className="text-lg font-semibold mb-3">Quick Chat</h2>
        <ChatBox onSend={sendChat} />
      </section>
    </div>
  );
}

function ChatBox({ onSend }: { onSend: (message: string) => Promise<ChatReply | null> }) {
  const [msg, setMsg] = useState("");
  const [response, setResponse] = useState<ChatReply | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!msg.trim()) return;
    setBusy(true);
    try {
      const r = await onSend(msg);
      setResponse(r ?? null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          className="flex-1 rounded-lg border px-3 py-2"
          placeholder="Say hi to the wrapper…"
        />
        <button
          type="submit"
          disabled={busy || !msg.trim()}
          className="rounded-lg bg-black text-white px-4 py-2 disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send"}
        </button>
      </form>
      {response && (
        <div className="rounded-lg border p-3 text-sm">
          <div className="font-medium mb-1">Answer</div>
          <div className="whitespace-pre-wrap">{response.answer}</div>
          <div className="text-xs text-neutral-600 mt-2">
            {response.flagged ? "Flagged" : "Not flagged"} •{" "}
            {response.redactions.length ? response.redactions.join(", ") : "no redactions"}
          </div>
        </div>
      )}
    </div>
  );
}