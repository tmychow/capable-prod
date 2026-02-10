"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import NProgress from "nprogress";
import type { Peptide } from "@/lib/api";
import { SearchInput } from "@/components/SearchInput";
import { Highlight } from "@/components/Highlight";

interface PeptidesListProps {
  peptides: Peptide[];
}

const PAGE_SIZE = 20;

export function PeptidesList({ peptides }: PeptidesListProps) {
  const router = useRouter();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [syncing, setSyncing] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [sequenceBackfilling, setSequenceBackfilling] = useState(false);
  const [notesBackfilling, setNotesBackfilling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = [...peptides];

    if (q) {
      result = result.filter((p) => {
        if (p.name.toLowerCase().includes(q)) return true;
        if (p.sequence && p.sequence.toLowerCase().includes(q)) return true;
        for (const entry of p.experiments || []) {
          for (const expName of Object.keys(entry)) {
            if (expName.toLowerCase().includes(q)) return true;
          }
        }
        return false;
      });
    }

    // When searching, rank by name match first, then the rest.
    // Within the same rank, sort alphabetically.
    return result.sort((a, b) => {
      if (q) {
        const aName = a.name.toLowerCase().includes(q) ? 0 : 1;
        const bName = b.name.toLowerCase().includes(q) ? 0 : 1;
        if (aName !== bName) return aName - bName;
      }
      return a.name.localeCompare(b.name);
    });
  }, [peptides, search]);

  async function handleSync(all: boolean = false) {
    setSyncing(true);
    setError(null);
    setSyncResult(null);
    NProgress.start();

    try {
      const url = all
        ? "/api/peptides/sync"
        : "/api/peptides/sync?limit=10";
      const res = await fetch(url, { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Sync failed");
      }

      const created = data.created ?? 0;
      const updated = data.updated ?? 0;
      setSyncResult(
        created > 0
          ? `Synced ${created} new peptide${created === 1 ? "" : "s"}, updated ${updated}`
          : `Updated ${updated} peptide${updated === 1 ? "" : "s"}`
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
      NProgress.done();
    }
  }

  async function handleBackfill() {
    setBackfilling(true);
    setError(null);
    setSyncResult(null);
    NProgress.start();

    try {
      const res = await fetch("/api/peptides/backfill", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Backfill failed");
      }

      const updated = data.updated_experiments ?? 0;
      const unchanged = data.unchanged_experiments ?? 0;
      const unresolved = data.unresolved_links ?? 0;
      const unresolvedText = unresolved > 0 ? `, unresolved links ${unresolved}` : "";
      setSyncResult(
        `Backfilled experiments: updated ${updated}, unchanged ${unchanged}${unresolvedText}`
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backfill failed");
    } finally {
      setBackfilling(false);
      NProgress.done();
    }
  }

  async function handleSequenceBackfill() {
    setSequenceBackfilling(true);
    setError(null);
    setSyncResult(null);
    NProgress.start();

    try {
      const res = await fetch("/api/peptides/backfill-sequences", {
        method: "POST",
      });
      const raw = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(raw || "Sequence backfill failed");
      }

      if (!res.ok) {
        throw new Error(
          (data.error as string | undefined) || "Sequence backfill failed"
        );
      }
      if (data.success === false) {
        throw new Error(
          (data.error as string | undefined) || "Sequence backfill failed"
        );
      }

      const started = Boolean(data.started);
      const message =
        (data.message as string | undefined) ||
        (started
          ? "Sequence backfill started"
          : "Sequence backfill already running");
      setSyncResult(message);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Sequence backfill failed"
      );
    } finally {
      setSequenceBackfilling(false);
      NProgress.done();
    }
  }

  async function handleNotesBackfill() {
    setNotesBackfilling(true);
    setError(null);
    setSyncResult(null);
    NProgress.start();

    try {
      const res = await fetch("/api/peptides/backfill-notes", {
        method: "POST",
      });
      const raw = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(raw || "Notes backfill failed");
      }

      if (!res.ok) {
        throw new Error(
          (data.error as string | undefined) || "Notes backfill failed"
        );
      }
      if (data.success === false) {
        throw new Error(
          (data.error as string | undefined) || "Notes backfill failed"
        );
      }

      const started = Boolean(data.started);
      const message =
        (data.message as string | undefined) ||
        (started
          ? "Notes backfill started"
          : "Notes backfill already running");
      setSyncResult(message);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Notes backfill failed"
      );
    } finally {
      setNotesBackfilling(false);
      NProgress.done();
    }
  }

  const syncIcon = (
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
  );

  return (
    <div>
      {/* Action buttons */}
      <div className="mb-6 space-y-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => handleSync(false)}
            disabled={syncing || backfilling || sequenceBackfilling || notesBackfilling}
            className="px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {syncIcon}
            {syncing ? "Syncing..." : "Sync Most Recent"}
          </button>
          <span className="w-px h-6 bg-zinc-200 dark:bg-zinc-700" />
          <button
            type="button"
            onClick={() => handleSync(true)}
            disabled={syncing || backfilling || sequenceBackfilling || notesBackfilling}
            className="px-3 py-2 rounded-lg text-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            {syncing ? "Syncing..." : "Sync All"}
          </button>
          <span className="w-px h-6 bg-zinc-200 dark:bg-zinc-700" />
          <button
            type="button"
            onClick={handleBackfill}
            disabled={syncing || backfilling || sequenceBackfilling || notesBackfilling}
            className="px-3 py-2 rounded-lg text-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            {backfilling ? "Backfilling..." : "Backfill Experiments"}
          </button>
          <span className="w-px h-6 bg-zinc-200 dark:bg-zinc-700" />
          <button
            type="button"
            onClick={handleSequenceBackfill}
            disabled={syncing || backfilling || sequenceBackfilling || notesBackfilling}
            className="px-3 py-2 rounded-lg text-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            {sequenceBackfilling ? "Backfilling..." : "Backfill Sequences"}
          </button>
          <span className="w-px h-6 bg-zinc-200 dark:bg-zinc-700" />
          <button
            type="button"
            onClick={handleNotesBackfill}
            disabled={syncing || backfilling || sequenceBackfilling || notesBackfilling}
            className="px-3 py-2 rounded-lg text-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            {notesBackfilling ? "Backfilling..." : "Backfill Notes"}
          </button>
          <span className="w-px h-6 bg-zinc-200 dark:bg-zinc-700" />
          <button
            type="button"
            onClick={() => setShowCreate(!showCreate)}
            className="px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm font-medium cursor-pointer flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
            Create Peptide
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
      </div>

      {/* Create peptide form */}
      {showCreate && (
        <PeptideForm
          mode="create"
          onDone={() => {
            setShowCreate(false);
            router.refresh();
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Search */}
      <div className="mb-4">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setVisibleCount(PAGE_SIZE);
          }}
          placeholder="Search by peptide name, sequence, or experiment..."
        />
      </div>

      {/* Peptide cards */}
      {filtered.length === 0 ? (
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-12 text-center">
          <p className="text-zinc-500">
            {search ? "No peptides match your search" : "No peptides yet"}
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4">
            {filtered.slice(0, visibleCount).map((peptide) => (
              <PeptideCard
                key={peptide.id}
                peptide={peptide}
                query={search}
                onUpdated={() => router.refresh()}
              />
            ))}
          </div>
          {visibleCount < filtered.length && (
            <div className="mt-4 text-center">
              <button
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer"
              >
                Next {Math.min(PAGE_SIZE, filtered.length - visibleCount)}
              </button>
              <p className="mt-2 text-xs text-zinc-500">
                Showing {visibleCount} of {filtered.length}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared form for Create / Edit                                       */
/* ------------------------------------------------------------------ */

function PeptideForm({
  mode,
  peptide,
  onDone,
  onCancel,
}: {
  mode: "create" | "edit";
  peptide?: Peptide;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(peptide?.name ?? "");
  const [sequence, setSequence] = useState(peptide?.sequence ?? "");
  const [experimentIds, setExperimentIds] = useState<string[]>(() => {
    if (peptide?.experiments?.length) {
      return peptide.experiments.flatMap((e) => Object.values(e));
    }
    return [""];
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addExperimentField() {
    setExperimentIds([...experimentIds, ""]);
  }

  function removeExperimentField(index: number) {
    setExperimentIds(experimentIds.filter((_, i) => i !== index));
  }

  function updateExperimentId(index: number, value: string) {
    const updated = [...experimentIds];
    updated[index] = value;
    setExperimentIds(updated);
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const ids = experimentIds.map((id) => id.trim()).filter(Boolean);
    if (!name.trim()) {
      setError("Peptide name is required");
      return;
    }
    if (ids.length === 0) {
      setError("At least one experiment ID is required");
      return;
    }

    setSaving(true);
    NProgress.start();

    try {
      const url =
        mode === "create"
          ? "/api/peptides/create"
          : `/api/peptides/${peptide!.id}`;
      const method = mode === "create" ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          sequence: sequence.trim(),
          experiment_ids: ids,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Failed to ${mode} peptide`);
      }

      onDone();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : `Failed to ${mode} peptide`
      );
    } finally {
      setSaving(false);
      NProgress.done();
    }
  }

  return (
    <div className="mb-6 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
      <h3 className="text-sm font-semibold mb-4">
        {mode === "create" ? "Create Peptide" : "Edit Peptide"}
      </h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">
              Peptide Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. NPSv2"
              className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">
              Sequence (optional)
            </label>
            <input
              type="text"
              value={sequence}
              onChange={(e) => setSequence(e.target.value)}
              placeholder="e.g. MKTFAALL..."
              className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1">
            Experiment IDs
          </label>
          <div className="space-y-2">
            {experimentIds.map((id, index) => (
              <div key={index} className="flex gap-2">
                <input
                  type="text"
                  value={id}
                  onChange={(e) => updateExperimentId(index, e.target.value)}
                  placeholder="Experiment UUID"
                  className="flex-1 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                />
                {experimentIds.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeExperimentField(index)}
                    className="px-2 py-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addExperimentField}
            className="mt-2 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 cursor-pointer flex items-center gap-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
            Add another experiment
          </button>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 text-sm font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving
              ? mode === "create"
                ? "Creating..."
                : "Saving..."
              : mode === "create"
                ? "Create"
                : "Save"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm font-medium cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Peptide Card with 3-dot menu                                        */
/* ------------------------------------------------------------------ */

function PeptideCard({
  peptide,
  query,
  onUpdated,
}: {
  peptide: Peptide;
  query: string;
  onUpdated: () => void;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const experimentEntries = (peptide.experiments || []).flatMap((entry) =>
    Object.entries(entry)
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setConfirmDelete(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [menuOpen]);

  async function handleDelete() {
    setDeleting(true);
    NProgress.start();
    try {
      const res = await fetch(`/api/peptides/${peptide.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete peptide");
      }
      onUpdated();
    } catch {
      // silently fail — user will see the card is still there
    } finally {
      setDeleting(false);
      setMenuOpen(false);
      setConfirmDelete(false);
      NProgress.done();
    }
  }

  if (editing) {
    return (
      <PeptideForm
        mode="edit"
        peptide={peptide}
        onDone={() => {
          setEditing(false);
          onUpdated();
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("a, button, input, textarea, select")) {
          return;
        }
        NProgress.start();
        router.push(`/peptides/${peptide.id}`);
      }}
      onKeyDown={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("a, button, input, textarea, select")) {
          return;
        }
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          NProgress.start();
          router.push(`/peptides/${peptide.id}`);
        }
      }}
      className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors cursor-pointer"
      aria-label={`Open peptide ${peptide.name}`}
    >
      <div className="flex justify-between items-start mb-3">
        <Highlight
          text={peptide.name}
          query={query}
          className="font-mono text-lg font-semibold"
        />
        <div className="flex items-center gap-2">
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
            {experimentEntries.length} experiment{experimentEntries.length === 1 ? "" : "s"}
          </span>
          {/* 3-dot menu */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(!menuOpen);
                setConfirmDelete(false);
              }}
              className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="5" r="1" />
                <circle cx="12" cy="12" r="1" />
                <circle cx="12" cy="19" r="1" />
              </svg>
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-36 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg z-10 py-1">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setEditing(true);
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                    <path d="m15 5 4 4" />
                  </svg>
                  Edit
                </button>
                {!confirmDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer flex items-center gap-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                    Delete
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 font-medium cursor-pointer disabled:opacity-50 flex items-center gap-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                    {deleting ? "Deleting..." : "Confirm"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {peptide.sequence && (
        <Highlight
          text={peptide.sequence}
          query={query}
          className="block text-sm text-zinc-500 mb-3 font-mono"
        />
      )}

      <div className="flex flex-wrap gap-2">
        {experimentEntries.map(([expName, expId]) => (
          <Link
            key={expId}
            href={`/experiments/${expId}`}
            className="text-sm px-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
          >
            <Highlight text={expName} query={query} />
          </Link>
        ))}
      </div>
    </div>
  );
}
