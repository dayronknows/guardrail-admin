import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GuardRail Wrapper — Showcase",
  description:
    "Middleware that intercepts LLM outputs, redacts PII, logs incidents, and exposes KPIs.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-screen">
        {/* Top bar */}
        <div className="border-b bg-white/70 backdrop-blur">
          <div className="mx-auto max-w-6xl px-6 py-4">
            <div className="text-xl font-semibold tracking-tight">
              GuardRail Wrapper
              <span className="ml-2 text-sm font-normal text-neutral-500">— Showcase</span>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>

        {/* Footer */}
        <footer className="mt-12 border-t bg-white">
          <div className="mx-auto max-w-6xl px-6 py-6 text-sm text-neutral-500">
            Built with FastAPI + Next.js + Tailwind
          </div>
        </footer>
      </body>
    </html>
  );
}
