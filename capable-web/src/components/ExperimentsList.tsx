"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { formatDate, formatDateTime, type Experiment } from "@/lib/api";
import { Markdown } from "@/components/Markdown";

interface ExperimentsListProps {
  experiments: Experiment[];
}

const ALL_TAB = "All";
const OTHER_TAB = "Other";
const PAGE_SIZE = 10;

export function ExperimentsList({ experiments }: ExperimentsListProps) {
  const [activeTab, setActiveTab] = useState(ALL_TAB);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

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

  // Filter and sort experiments based on active tab
  const filteredExperiments = useMemo(() => {
    let filtered = experiments;
    if (activeTab === OTHER_TAB) {
      filtered = experiments.filter((exp) => !exp.organism_type);
    } else if (activeTab !== ALL_TAB) {
      filtered = experiments.filter((exp) => exp.organism_type === activeTab);
    }
    // Sort by experiment_start date (most recent first), experiments without start date go last
    return [...filtered].sort((a, b) => {
      if (!a.experiment_start && !b.experiment_start) return 0;
      if (!a.experiment_start) return 1;
      if (!b.experiment_start) return -1;
      return new Date(b.experiment_start).getTime() - new Date(a.experiment_start).getTime();
    });
  }, [experiments, activeTab]);

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
          <p className="text-zinc-500">No experiments for {activeTab}</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4">
            {filteredExperiments.slice(0, visibleCount).map((experiment) => (
              <ExperimentCard key={experiment.id} experiment={experiment} />
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

function ExperimentCard({ experiment }: { experiment: Experiment }) {
  const hasEndTime = experiment.experiment_end !== null;

  return (
    <Link
      href={`/experiments/${experiment.id}`}
      className="block border border-zinc-200 dark:border-zinc-800 rounded-lg p-6 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
    >
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-lg font-semibold">{experiment.name}</h3>
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
          <Markdown>{experiment.description}</Markdown>
        ) : (
          <span className="italic text-zinc-500">No description</span>
        )}
      </div>
      {experiment.organism_type && (
        <p className="text-sm text-zinc-500 mb-2">
          Organism: {experiment.organism_type}
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
  );
}
