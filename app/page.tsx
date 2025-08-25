/* eslint-disable @typescript-eslint/no-explicit-any */
// app/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

/** ---- CONFIG ---- */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** ---- TYPES (must match API) ---- */
type RedactionType = "email" | "phone" | "ssn" | "credit_card" | "name" | "other";

interface Incident {
  id: number;
  time: string;                 // your API returns `time`
  provider: string;             // "mock" | "openai"
  flagged: boolean;
  redactions: RedactionType[];  // e.g. ["email"]
}

interface Metrics {
  total_requests: number;
  flagged_outputs: number;
  flag_rate: number;            // 0..1
}

interface ScanResponse {
  raw_output: string;
  redacted_output: string;
  flagged: boolean;
  incidents: Incident[];
}

interface ChatReply {
  answer: string;
  flagged: boolean;
  redactions: RedactionType[];
}

/** ---- SMALL HELPERS ---- */
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

/** ---- PAGE ---- */
export default function Page() {
  // Prompt tester state
  const [prompt, setPrompt] = useState<string>("");
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [loadingScan, setLoadingScan] = useState<boolean>(false);

  // Dashboard state
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loadingDash, setLoadingDash] = useState<boolean>(true);

  // Wake server state
  const [waking, setWaking] = useState<boolean>(false);
  const apiConfigured = useMemo(() => Boolean(API_URL), []);

  /** Load dashboard data */
  async function loadDashboard() {
    if (!API_URL) return;
    setLoadingDash(true);
    try {
      const [m, recents] = await Promise.all([
        fetchJSON<Metrics>(`${API_URL}/metrics`),
        fetchJSON<Incident[]>(`${API_URL}/incidents?limit=10`),
      ]);
      setMetrics(m);
      setIncidents(recents);
    } catch (err) {
      // keep quiet but show zeros
      console.error(err);
    } finally {
      setLoadingDash(false);
    }
  }

  useEffect(() => {
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Wake/initialize server on Render (health ping loop with soft timeout) */
  async function wakeServer() {
    if (!API_URL || waking) return;
    setWaking(true);
    const deadline = Date.now() + 75_000; // ~75s patience

    try {
      while (Date.now() < deadline) {
        try {
          const res = await fetch(`${API_URL}/`, { cache: "no-store" });
          if (res.ok) break;
        } catch {
          // ignore transient errors while waking
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    } finally {
      setWaking(false);
      // refresh KPIs once awake
      loadDashboard();
    }
  }

  /** Submit prompt to /scan */
  const onSubmitPrompt = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!prompt.trim() || !API_URL) return;

    setLoadingScan(true);
    setScan(null);

    try {
      const body = { prompt };
      const result: ScanResponse = await fetch(`${API_URL}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json());

      // Ensure Raw/Redacted fill in:
      // { raw_output, redacted_output, flagged, incidents }
      setScan(result);

      // refresh KPIs after a successful scan
      loadDashboard();
    } catch (err) {
      console.error(err);
      setScan({
        raw_output: "—",
        redacted_output: "Request failed. See console for details.",
        flagged: false,
        incidents: [],
      });
    } finally {
      setLoadingScan(false);
    }
  };

  /** Minimal chat (POST /chat with {message}) */
  async function sendChat(message: string): Promise<ChatReply | null> {
    if (!API_URL) return null;
    const body = { message };
    return fetchJSON<ChatReply>(`${API_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  return (
    <main className="mx-auto max-w-6xl p-6 space-y-8">
      {/* top note */}
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Guardrail Governance Layer Showcase</h1>
        <p className="text-sm text-neutral-600">
          Middleware that intercepts LLM outputs, redacts PII, logs incidents, and exposes KPIs.
        </p>
        <p className="text-sm text-neutral-600">
          Hosted on Render.com with a free plan (may take ~30-60s to wake if idle).{" "}
        </p>
        {!apiConfigured && (
          <p className="text-sm text-amber-600">
            Set <code>NEXT_PUBLIC_API_URL</code> in your env to the Render API URL.
          </p>
        )}
      </header>

      {/* Wake / Initialize */}
      <div className="mb-2">
        <button
          onClick={wakeServer}
          disabled={waking || !apiConfigured}
          className="rounded-lg bg-amber-600 text-white px-4 py-2 disabled:opacity-50"
        >
          {waking ? "Warming up…" : "Initialize / Wake Server"}
        </button>
      </div>

      {/* KPI cards */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border p-4 bg-white">
          <div className="text-sm text-neutral-600">Total Requests</div>
          <div className="text-2xl font-semibold">
            {loadingDash ? "—" : metrics?.total_requests ?? 0}
          </div>
        </div>
        <div className="rounded-xl border p-4 bg-white">
          <div className="text-sm text-neutral-600">Flagged Outputs</div>
          <div className="text-2xl font-semibold">
            {loadingDash ? "—" : metrics?.flagged_outputs ?? 0}
          </div>
        </div>
        <div className="rounded-xl border p-4 bg-white">
          <div className="text-sm text-neutral-600">Flag Rate</div>
          <div className="text-2xl font-semibold">
            {loadingDash ? "—" : pct(metrics?.flag_rate ?? 0)}
          </div>
        </div>
      </section>

      {/* Prompt Tester */}
      <section className="rounded-2xl border p-5 space-y-4 bg-white">
        <h2 className="text-lg font-semibold">Prompt Tester</h2>
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
              disabled={loadingScan || !prompt.trim() || !apiConfigured}
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
            <div className="rounded-lg border p-3 bg-white">
              <div className="text-sm font-medium mb-2">Raw Output</div>
              <pre className="whitespace-pre-wrap text-sm">{scan.raw_output}</pre>
            </div>
            <div className="rounded-lg border p-3 bg-white">
              <div className="text-sm font-medium mb-2">
                Redacted Output {scan.flagged ? "• Flagged" : ""}
              </div>
              <pre className="whitespace-pre-wrap text-sm">{scan.redacted_output}</pre>
            </div>
          </div>
        )}
      </section>

      {/* Recent Incidents */}
      <section className="rounded-2xl border p-5 space-y-3 bg-white">
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

      {/* Quick Chat */}
      <section className="rounded-2xl border p-5 space-y-3 bg-white">
        <h2 className="text-lg font-semibold">Quick Chat</h2>
        <ChatBox onSend={sendChat} disabled={!apiConfigured} />
      </section>
    </main>
  );
}

/** ---- Small Chat Box ---- */
function ChatBox({
  onSend,
  disabled = false,
}: {
  onSend: (message: string) => Promise<ChatReply | null>;
  disabled?: boolean;
}) {
  const [msg, setMsg] = useState<string>("");
  const [resp, setResp] = useState<ChatReply | null>(null);
  const [busy, setBusy] = useState<boolean>(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!msg.trim() || disabled) return;
    setBusy(true);
    try {
      const r = await onSend(msg);
      setResp(r ?? null);
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
          disabled={disabled}
        />
        <button
          type="submit"
          disabled={busy || !msg.trim() || disabled}
          className="rounded-lg bg-black text-white px-4 py-2 disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send"}
        </button>
      </form>
      {resp && (
        <div className="rounded-lg border p-3 text-sm bg-white">
          <div className="font-medium mb-1">Answer</div>
          <div className="whitespace-pre-wrap">{resp.answer}</div>
          <div className="text-xs text-neutral-600 mt-2">
            {resp.flagged ? "Flagged" : "Not flagged"} •{" "}
            {resp.redactions.length ? resp.redactions.join(", ") : "no redactions"}
          </div>
        </div>
      )}
    </div>
  );
}
