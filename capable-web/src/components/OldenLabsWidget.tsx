"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import NProgress from "nprogress";
import { updateExperimentAction } from "@/app/experiments/actions";
import { findCageCloseTime } from "@/components/OldenLabsChart";
import type { OldenLabsChartData } from "@/components/OldenLabsChart";

interface OldenLabsWidgetProps {
  experimentId: string;
  studyId: number | null;
  editMode?: boolean;
  onAuthChange?: (authenticated: boolean) => void;
}

const BIN_OPTIONS = [
  { value: "min15", label: "15 Minutes" },
  { value: "min30", label: "30 Minutes" },
  { value: "hour1", label: "1 Hour" },
  { value: "hour2", label: "2 Hours" },
  { value: "hour4", label: "4 Hours" },
  { value: "hour6", label: "6 Hours" },
  { value: "hour12", label: "12 Hours" },
  { value: "day1", label: "1 Day" },
];

export function OldenLabsWidget({ experimentId, studyId, editMode = false, onAuthChange }: OldenLabsWidgetProps) {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [groupBy, setGroupBy] = useState("hour1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isEditingStudyId, setIsEditingStudyId] = useState(false);
  const [newStudyId, setNewStudyId] = useState(studyId?.toString() || "");
  const [currentStudyId, setCurrentStudyId] = useState(studyId);

  // Check auth status on mount
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

  // Set default dates (last 7 days)
  useEffect(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    setDateTo(formatDateForInput(now));
    setDateFrom(formatDateForInput(weekAgo));
  }, []);

  function formatDateForInput(date: Date): string {
    return date.toISOString().slice(0, 16);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    NProgress.start();

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
      onAuthChange?.(true);
      setEmail("");
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
      NProgress.done();
    }
  }

  async function handleLogout() {
    setLoading(true);
    NProgress.start();

    try {
      await fetch("/api/oldenlabs/auth", { method: "DELETE" });
      setAuthenticated(false);
      onAuthChange?.(false);
    } finally {
      setLoading(false);
      NProgress.done();
    }
  }

  async function handleSaveStudyId() {
    if (!newStudyId.trim()) return;

    setLoading(true);
    setError(null);
    NProgress.start();
    try {
      // First check for duplicates and fetch data from Olden Labs
      const params = new URLSearchParams({
        study_id: newStudyId.trim(),
        exclude_experiment_id: experimentId,
      });
      const syncRes = await fetch(`/api/oldenlabs/sync?${params}`);

      if (syncRes.status === 409) {
        // Duplicate study ID - don't save
        const data = await syncRes.json();
        setError(data.error);
        return;
      }

      // No duplicate - save the study ID and sync data
      const syncData = syncRes.ok ? await syncRes.json() : null;

      // Detect cage close time from chart data
      let cageCloseUtc: string | null = null;
      if (syncData) {
        try {
          const pad = (n: number) => String(n).padStart(2, "0");
          const toLocal = (d: Date) =>
            `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
          const rawStart = syncData.experiment_start || toLocal(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
          const startDate = new Date(rawStart);
          if (!isNaN(startDate.getTime())) {
            startDate.setDate(startDate.getDate() - 1);
          }
          const startTime = toLocal(startDate);
          const chartParams = new URLSearchParams({
            study_id: newStudyId.trim(),
            start_time: startTime,
            end_time: toLocal(new Date()),
            group_by: "hour1",
            chart_type: "LineChart",
            error_bar_type: "SEM",
          });
          const chartRes = await fetch(`/api/oldenlabs/chart?${chartParams}`);
          if (chartRes.ok) {
            const chartData = await chartRes.json();
            const charts: OldenLabsChartData[] = Array.isArray(chartData) ? chartData : [chartData];
            const closeTime = findCageCloseTime(charts);
            if (closeTime) {
              const formatted = closeTime.slice(0, 16).replace(" ", "T");
              cageCloseUtc = new Date(formatted).toISOString();
            }
          }
        } catch {
          // Cage close detection failed, continue without it
        }
      }

      await updateExperimentAction(experimentId, {
        olden_labs_study_id: newStudyId.trim(),
        ...(syncData && {
          name: syncData.name || undefined,
          description: syncData.description || undefined,
          groups: syncData.groups?.length > 0 ? syncData.groups : undefined,
          experiment_start: cageCloseUtc || syncData.experiment_start || undefined,
          organism_type: syncData.organism_type || undefined,
        }),
      });

      setCurrentStudyId(parseInt(newStudyId.trim()));
      setIsEditingStudyId(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save Study ID");
    } finally {
      setLoading(false);
      NProgress.done();
    }
  }

  async function handleExtract() {
    if (!currentStudyId) {
      setError("No Olden Labs Study ID configured for this experiment");
      return;
    }

    setError(null);
    setSuccess(null);
    setLoading(true);
    NProgress.start();

    try {
      const params = new URLSearchParams({
        study_id: String(currentStudyId),
        date_from: dateFrom,
        date_to: dateTo,
        group_by: groupBy,
      });

      const res = await fetch(`/api/oldenlabs/download?${params}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Extraction failed");
      }

      setSuccess("File extraction started successfully");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setLoading(false);
      NProgress.done();
    }
  }

  if (authenticated === null) {
    return (
      <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Olden Labs Data Extraction</h2>
        <div className="animate-pulse h-20 bg-zinc-100 dark:bg-zinc-800 rounded" />
      </section>
    );
  }

  if (!authenticated) {
    return (
      <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Olden Labs Data Extraction</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
          Connect your Olden Labs account to download experiment data.
        </p>

        <form onSubmit={handleLogin} className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <div>
            <label htmlFor="oldenEmail" className="block text-sm font-medium mb-2">
              Email
            </label>
            <input
              id="oldenEmail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label htmlFor="oldenPassword" className="block text-sm font-medium mb-2">
              Password
            </label>
            <input
              id="oldenPassword"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full px-4 py-2 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 text-sm font-medium disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            {loading ? "Signing in..." : "Sign in to Olden Labs"}
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Olden Labs Data Extraction</h2>
        <button
          onClick={handleLogout}
          disabled={loading}
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 cursor-pointer"
        >
          Disconnect
        </button>
      </div>

      {!currentStudyId ? (
        <div className="p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
          {isEditingStudyId ? (
            <div className="space-y-3">
              {error && (
                <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-1">
                  Olden Labs Study ID
                </label>
                <input
                  type="text"
                  value={newStudyId}
                  onChange={(e) => {
                    setNewStudyId(e.target.value);
                    setError(null);
                  }}
                  placeholder="e.g., 1945"
                  className="w-full px-3 py-2 rounded-lg border border-yellow-300 dark:border-yellow-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-yellow-500 text-sm"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setIsEditingStudyId(false);
                    setNewStudyId("");
                    setError(null);
                  }}
                  disabled={loading}
                  className="px-3 py-1.5 text-sm rounded-lg border border-yellow-300 dark:border-yellow-700 hover:bg-yellow-100 dark:hover:bg-yellow-900/40 cursor-pointer text-yellow-800 dark:text-yellow-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveStudyId}
                  disabled={loading || !newStudyId.trim()}
                  className="px-3 py-1.5 text-sm rounded-lg bg-yellow-600 text-white hover:bg-yellow-700 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                >
                  {loading ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex justify-between items-center">
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                No Olden Labs Study ID configured.
              </p>
              {editMode && (
                <button
                  onClick={() => setIsEditingStudyId(true)}
                  className="p-1.5 text-yellow-600 hover:text-yellow-800 dark:text-yellow-400 dark:hover:text-yellow-200 cursor-pointer rounded hover:bg-yellow-100 dark:hover:bg-yellow-900/40"
                  title="Add Study ID"
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
                  >
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                    <path d="m15 5 4 4" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {success && (
            <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <p className="text-sm text-green-600 dark:text-green-400">{success}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="dateFrom" className="block text-sm font-medium mb-2">
                Start Date
              </label>
              <input
                id="dateFrom"
                type="datetime-local"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            <div>
              <label htmlFor="dateTo" className="block text-sm font-medium mb-2">
                End Date
              </label>
              <input
                id="dateTo"
                type="datetime-local"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="groupBy" className="block text-sm font-medium mb-2">
              Bin Time
            </label>
            <select
              id="groupBy"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              {BIN_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleExtract}
            disabled={loading || !dateFrom || !dateTo}
            className="w-full px-4 py-2 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 text-sm font-medium disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              "Extracting..."
            ) : (
              <>
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
                >
                  <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                  <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                  <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
                </svg>
                Extract Data
              </>
            )}
          </button>

          <p className="text-xs text-zinc-500 text-center">
            Study ID: {currentStudyId}
          </p>
        </div>
      )}
    </section>
  );
}
