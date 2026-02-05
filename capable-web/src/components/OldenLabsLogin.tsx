"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import NProgress from "nprogress";

export function OldenLabsLogin() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch("/api/oldenlabs/auth");
        const data = await res.json();
        setAuthenticated(data.authenticated);
      } catch {
        setAuthenticated(false);
      }
    }
    checkAuth();
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/oldenlabs/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Login failed");
      }

      setAuthenticated(true);
      setEmail("");
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch("/api/oldenlabs/auth", { method: "DELETE" });
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }

  async function handleSyncAll() {
    setSyncing(true);
    setError(null);
    setSyncResult(null);
    NProgress.start();

    try {
      const res = await fetch("/api/oldenlabs/sync-all", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Sync failed");
      }

      setSyncResult(data.message);
      if (data.created > 0) {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
      NProgress.done();
    }
  }

  if (authenticated === null) {
    return (
      <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
        <div className="animate-pulse h-6 w-48 bg-zinc-100 dark:bg-zinc-800 rounded" />
      </div>
    );
  }

  if (authenticated) {
    return (
      <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm font-medium">Olden Labs connected</span>
          </div>
          <button
            onClick={handleLogout}
            disabled={loading || syncing}
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 cursor-pointer disabled:opacity-50"
          >
            Disconnect
          </button>
        </div>

        {error && (
          <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {syncResult && (
          <div className="p-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
            <p className="text-sm text-green-600 dark:text-green-400">{syncResult}</p>
          </div>
        )}

        <button
          type="button"
          onClick={handleSyncAll}
          disabled={syncing}
          className="px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={syncing ? "animate-spin" : ""}
          >
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
            <path d="M16 16h5v5" />
          </svg>
          {syncing ? "Syncing..." : "Sync from Olden Labs"}
        </button>
      </div>
    );
  }

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
      <div className="flex items-center gap-3 mb-3">
        <span className="inline-block w-2 h-2 rounded-full bg-zinc-400" />
        <span className="text-sm font-medium">Olden Labs</span>
      </div>

      <form onSubmit={handleLogin} className="flex flex-wrap items-end gap-3">
        {error && (
          <div className="w-full p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <div className="flex-1 min-w-[160px]">
          <label htmlFor="oldenLoginEmail" className="block text-xs text-zinc-500 mb-1">
            Email
          </label>
          <input
            id="oldenLoginEmail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            placeholder="your@email.com"
          />
        </div>

        <div className="flex-1 min-w-[160px]">
          <label htmlFor="oldenLoginPassword" className="block text-xs text-zinc-500 mb-1">
            Password
          </label>
          <input
            id="oldenLoginPassword"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !email || !password}
          className="px-4 py-1.5 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 text-sm font-medium disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
        >
          {loading ? "Connecting..." : "Connect"}
        </button>
      </form>
    </div>
  );
}
