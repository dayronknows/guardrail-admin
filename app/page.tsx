/* eslint-disable @typescript-eslint/no-explicit-any */

// app/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type RedactionType = "email" | "phone" | "ssn" | "credit_card" | "name" | "other";

interface Incident {
  id: number;
  time: string;            // ISO string from API
  provider: string;        // "mock" | "openai" | etc.
  flagged: boolean;
  redactions: RedactionType[]; // e.g. ["email","phone"]
}

interface Metrics {
  total_requests: number;
  flagged_outputs: number;
  flag_rate: number; // 0..1 from API
}

interface ScanRequest {
  prompt: string;
}

interface ScanResponse {
  raw_output: string;
  redacted_output: string;
  flagged: boolean;
  incidents: Incident[];
}

interface LogEntry {
  id: number;
  time: string;  // ISO string
  level: "info" | "warn" | "error";
  message: string;
}

interface ChatRequest {
  user: string;
  message: string;
}

interface ChatReply {
  answer: string;
  flagged: boolean;
  redactions: RedactionType[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? ""; // set on Vercel

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return (await res.json()) as T;
}

function formatRate(rate: number): string {
  if (Number.isNaN(rate)) return "0%";
  return `${(rate * 100).toFixed(1)}%`;
}

export default function Page() {
  // Prompt tester
  const [prompt, setPrompt] = useState<string>("");
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [loadingScan, setLoadingScan] = useState<boolean>(false);

  // Metrics + incidents + logs
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loadingDash, setLoadingDash] = useState<boolean>(true);
  const apiHealthy = useMemo(() => Boolean(API_URL), []);

  useEffect(() => {
    // Pull dashboard data
    const run = async () => {
      if (!API_URL) return;
      setLoadingDash(true);
      try {
        const [m, recent, l] = await Promise.all([
          fetchJSON<Metrics>(`${API_URL}/metrics`),
          fetchJSON<Incident[]>(`${API_URL}/incidents?limit=10`),
          fetchJSON<LogEntry[]>(`${API_URL}/logs?limit=10`)
        ]);
        setMetrics(m);
        setIncidents(recent);
        setLogs(l);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingDash(false);
      }
    };
    run();
  }, []);

  const onSubmitPrompt = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!prompt.trim() || !API_URL) return;
    setLoadingScan(true);
    setScan(null);
    try {
      const body: ScanRequest = { prompt };
      const result = await fetchJSON<ScanResponse>(`${API_URL}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      setScan(result);
    } catch (err) {
      console.error(err);
      setScan({
        raw_output: "—",
        redacted_output: "Request failed. See console for details.",
        flagged: false,
        incidents: []
      });
    } finally {
      setLoadingScan(false);
    }
  };

  const sendChat = async (message: string): Promise<ChatReply | null> => {
    if (!API_URL) return null;
    const body: ChatRequest = { user: "tester", message };
    return fetchJSON<ChatReply>(`${API_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  };

  return (
    <main className="mx-auto max-w-5xl p-6 space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">GuardRail Wrapper — Showcase</h1>
        <p className="text-sm text-neutral-600">
          Middleware that intercepts LLM outputs, redacts PII, logs incidents, and exposes KPIs.
        </p>
        {!apiHealthy && (
          <p className="text-sm text-amber-600">
            Set <code>NEXT_PUBLIC_API_URL</code> in Vercel env to your Render URL.
          </p>
        )}
      </header>

      {/* KPI cards */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border p-4">
          <div className="text-sm text-neutral-600">Total Requests</div>
          <div className="text-2xl font-semibold">
            {loadingDash ? "—" : metrics?.total_requests ?? 0}
          </div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-sm text-neutral-600">Flagged Outputs</div>
          <div className="text-2xl font-semibold">
            {loadingDash ? "—" : metrics?.flagged_outputs ?? 0}
          </div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-sm text-neutral-600">Flag Rate</div>
          <div className="text-2xl font-semibold">
            {loadingDash ? "—" : formatRate(metrics?.flag_rate ?? 0)}
          </div>
        </div>
      </section>

      {/* Prompt Tester */}
      <section className="rounded-2xl border p-5 space-y-4">
        <h2 className="text-lg font-semibold">Prompt Tester</h2>
        <form onSubmit={onSubmitPrompt} className="space-y-3">
          <textarea
            value={prompt}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPrompt(e.target.value)}
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
            <button
              type="button"
              onClick={() => setPrompt("")}
              className="rounded-lg border px-3 py-2"
            >
              Reset
            </button>
          </div>
        </form>

        {scan && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
      <section className="rounded-2xl border p-5 space-y-3">
        <h2 className="text-lg font-semibold">Recent Incidents</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-neutral-600">
              <tr>
                <th className="py-2 pr-3">ID</th>
                <th className="py-2 pr-3">Time</th>
                <th className="py-2 pr-3">Provider</th>
                <th className="py-2 pr-3">Flagged</th>
                <th className="py-2 pr-3">Redactions</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((it) => (
                <tr key={it.id} className="border-t">
                  <td className="py-2 pr-3">{it.id}</td>
                  <td className="py-2 pr-3">{new Date(it.time).toLocaleString()}</td>
                  <td className="py-2 pr-3">{it.provider}</td>
                  <td className="py-2 pr-3">{it.flagged ? "Yes" : "No"}</td>
                  <td className="py-2 pr-3">{it.redactions.join(", ") || "—"}</td>
                </tr>
              ))}
              {!incidents.length && (
                <tr>
                  <td className="py-3 text-neutral-500" colSpan={5}>
                    {loadingDash ? "Loading…" : "No incidents yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Quick Chat (optional) */}
      <section className="rounded-2xl border p-5 space-y-3">
        <h2 className="text-lg font-semibold">Quick Chat</h2>
        <ChatBox onSend={sendChat} />
      </section>
    </main>
  );
}

/** Minimal chat box with strict types */
function ChatBox({
  onSend
}: {
  onSend: (message: string) => Promise<ChatReply | null>;
}) {
  const [msg, setMsg] = useState<string>("");
  const [response, setResponse] = useState<ChatReply | null>(null);
  const [busy, setBusy] = useState<boolean>(false);

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
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMsg(e.target.value)}
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
