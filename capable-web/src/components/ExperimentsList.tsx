"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import NProgress from "nprogress";
import { formatDate, formatDateTime, type Experiment } from "@/lib/api";
import { Markdown } from "@/components/Markdown";
import { deleteExperimentAction } from "@/app/experiments/actions";
import { SearchInput } from "@/components/SearchInput";
import { Highlight } from "@/components/Highlight";

interface ExperimentsListProps {
  experiments: Experiment[];
}

const ALL_TAB = "All";
const OTHER_TAB = "Other";
const PAGE_SIZE = 10;

export function ExperimentsList({ experiments }: ExperimentsListProps) {
  const [activeTab, setActiveTab] = useState(ALL_TAB);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [search, setSearch] = useState("");

  // Check if there are experiments without organism type
  const hasOther = useMemo(() => {
    return experiments.some((exp) => !exp.organism_type);
  }, [experiments]);

  // Extract unique organism types from experiments, with Mice first
  const organismTypes = useMemo(() => {
    const types = new Set<string>();
    for (const exp of experiments) {
      if (exp.organism_type) {
        types.add(exp.organism_type);
      }
    }
    const sorted = Array.from(types).sort();
    // Move "Mice" to the front if it exists
    const miceIndex = sorted.indexOf("Mice");
    if (miceIndex > 0) {
      sorted.splice(miceIndex, 1);
      sorted.unshift("Mice");
    }
    return sorted;
  }, [experiments]);

  // Filter and sort experiments based on active tab + search
  const filteredExperiments = useMemo(() => {
    let filtered = experiments;
    if (activeTab === OTHER_TAB) {
      filtered = experiments.filter((exp) => !exp.organism_type);
    } else if (activeTab !== ALL_TAB) {
      filtered = experiments.filter((exp) => exp.organism_type === activeTab);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter((exp) => {
        if (exp.name.toLowerCase().includes(q)) return true;
        if (exp.description && exp.description.toLowerCase().includes(q)) return true;
        if (exp.organism_type && exp.organism_type.toLowerCase().includes(q)) return true;
        if (exp.peptides) {
          for (const p of exp.peptides) {
            if (p.toLowerCase().includes(q)) return true;
          }
        }
        if (exp.olden_labs_study_id != null && String(exp.olden_labs_study_id).includes(q)) return true;
        return false;
      });
    }

    // When searching, rank by name match first, then description, then the rest.
    // Within the same rank, sort by experiment_start date (most recent first).
    return [...filtered].sort((a, b) => {
      if (q) {
        const aName = a.name.toLowerCase().includes(q) ? 0 : 1;
        const bName = b.name.toLowerCase().includes(q) ? 0 : 1;
        if (aName !== bName) return aName - bName;

        const aDesc = a.description?.toLowerCase().includes(q) ? 0 : 1;
        const bDesc = b.description?.toLowerCase().includes(q) ? 0 : 1;
        if (aDesc !== bDesc) return aDesc - bDesc;
      }

      if (!a.experiment_start && !b.experiment_start) return 0;
      if (!a.experiment_start) return 1;
      if (!b.experiment_start) return -1;
      return new Date(b.experiment_start).getTime() - new Date(a.experiment_start).getTime();
    });
  }, [experiments, activeTab, search]);

  // Count experiments per tab
  const countByOrganism = useMemo(() => {
    const counts: Record<string, number> = { [ALL_TAB]: experiments.length };
    for (const type of organismTypes) {
      counts[type] = experiments.filter((exp) => exp.organism_type === type).length;
    }
    if (hasOther) {
      counts[OTHER_TAB] = experiments.filter((exp) => !exp.organism_type).length;
    }
    return counts;
  }, [experiments, organismTypes, hasOther]);

  if (experiments.length === 0) {
    return (
      <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-12 text-center">
        <p className="text-zinc-500">No experiments yet</p>
      </div>
    );
  }

  const tabs = [ALL_TAB, ...organismTypes, ...(hasOther ? [OTHER_TAB] : [])];

  return (
    <div>
      {/* Search */}
      <div className="mb-4">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setVisibleCount(PAGE_SIZE);
          }}
          placeholder="Search by name, description, organism..."
        />
      </div>

      {/* Tabs */}
      {organismTypes.length > 0 && (
        <div className="border-b border-zinc-200 dark:border-zinc-800 mb-4">
          <nav className="flex gap-1 -mb-px" aria-label="Organism type tabs">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  setVisibleCount(PAGE_SIZE);
                }}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer ${activeTab === tab
                  ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                  : "border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300 dark:hover:text-zinc-300 dark:hover:border-zinc-600"
                  }`}
              >
                {tab}
                <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                  {countByOrganism[tab]}
                </span>
              </button>
            ))}
          </nav>
        </div>
      )}

      {/* Experiment cards */}
      {filteredExperiments.length === 0 ? (
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-12 text-center">
          <p className="text-zinc-500">
            {search ? "No experiments match your search" : `No experiments for ${activeTab}`}
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4">
            {filteredExperiments.slice(0, visibleCount).map((experiment) => (
              <ExperimentCard key={experiment.id} experiment={experiment} query={search} />
            ))}
          </div>
          {visibleCount < filteredExperiments.length && (
            <div className="mt-4 text-center">
              <button
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer"
              >
                Next {Math.min(PAGE_SIZE, filteredExperiments.length - visibleCount)}
              </button>
              <p className="mt-2 text-xs text-zinc-500">
                Showing {visibleCount} of {filteredExperiments.length}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ExperimentCard({ experiment, query }: { experiment: Experiment; query: string }) {
  const router = useRouter();
  const hasEndTime = experiment.experiment_end !== null;
  const [menuOpen, setMenuOpen] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [menuOpen]);

  const handleDelete = async () => {
    setDeleting(true);
    NProgress.start();
    try {
      await deleteExperimentAction(experiment.id);
      router.refresh();
    } catch (error) {
      console.error("Failed to delete experiment:", error);
    } finally {
      setDeleting(false);
      NProgress.done();
      setShowConfirm(false);
    }
  };

  return (
    <>
      <div className="relative border border-zinc-200 dark:border-zinc-800 rounded-lg p-6 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
        <Link href={`/experiments/${experiment.id}`} className="block">
          <div className="flex justify-between items-start mb-2 pr-8">
            <h3 className="text-lg font-semibold">
              <Highlight text={experiment.name} query={query} />
            </h3>
            <span
              className={`px-2 py-1 text-xs font-medium rounded-full ${hasEndTime
                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                }`}
            >
              {hasEndTime ? "completed" : "running"}
            </span>
          </div>
          <div className="text-zinc-600 dark:text-zinc-400 mb-2 line-clamp-2">
            {experiment.description ? (
              query.trim() ? (
                <Highlight text={experiment.description} query={query} />
              ) : (
                <Markdown>{experiment.description}</Markdown>
              )
            ) : (
              <span className="italic text-zinc-500">No description</span>
            )}
          </div>
          {experiment.organism_type && (
            <p className="text-sm text-zinc-500 mb-2">
              Organism: <Highlight text={experiment.organism_type} query={query} />
            </p>
          )}
          {experiment.experiment_start && (
            <p className="text-sm text-zinc-500 mb-2">
              Started: {formatDateTime(experiment.experiment_start)}
            </p>
          )}
          <p className="text-sm text-zinc-500">
            Created {formatDate(experiment.row_created_at)}
          </p>
        </Link>

        {/* Triple-dot menu */}
        <div ref={menuRef} className="absolute top-4 right-4">
          <button
            onClick={(e) => {
              e.preventDefault();
              setMenuOpen(!menuOpen);
            }}
            className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg z-10 py-1">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  NProgress.start();
                  router.push(`/experiments/${experiment.id}`);
                }}
                className="w-full px-4 py-2 text-sm text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                View Experiment
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setShowConfirm(true);
                }}
                className="w-full px-4 py-2 text-sm text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !deleting && setShowConfirm(false)}
          />
          <div className="relative bg-white dark:bg-zinc-900 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl border border-zinc-200 dark:border-zinc-800">
            <h3 className="text-lg font-semibold mb-2">Delete Experiment</h3>
            <p className="text-zinc-600 dark:text-zinc-400 mb-4">
              Are you sure you want to delete{" "}
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {experiment.name}
              </span>
              ? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
