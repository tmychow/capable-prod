"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import NProgress from "nprogress";
import { LogsTimeline } from "@/components/LogsTimeline";
import { OldenLabsWidget } from "@/components/OldenLabsWidget";
import { EditableDescription } from "@/components/EditableDescription";
import { EditableGroups } from "@/components/EditableGroups";
import { EditableParameters } from "@/components/EditableParameters";
import { EditablePeptides } from "@/components/EditablePeptides";
import { EditableDetails } from "@/components/EditableDetails";
import { DeleteExperimentButton } from "@/components/DeleteExperimentButton";
import { OldenLabsChart } from "@/components/OldenLabsChart";
import { updateExperimentAction } from "@/app/experiments/actions";
import type { Experiment } from "@/lib/api";

interface ExperimentContentProps {
  experiment: Experiment;
}

export function ExperimentContent({ experiment }: ExperimentContentProps) {
  const router = useRouter();
  const [editMode, setEditMode] = useState(false);
  const [name, setName] = useState(experiment.name);
  const [savingName, setSavingName] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  const [downloadToast, setDownloadToast] = useState<{ label: string; hiding: boolean } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCompleted = experiment.experiment_end !== null;

  const handleSyncFiles = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/oldenlabs/sync-files", { method: "POST" });
      if (!res.ok) throw new Error("Sync failed");
      router.refresh();
    } catch {
      // silently fail – user can retry
    } finally {
      setSyncing(false);
    }
  }, [router]);

  useEffect(() => {
    setName(experiment.name);
  }, [experiment.name]);

  // Increment dataVersion when experiment data changes to force editable components to remount
  useEffect(() => {
    setDataVersion((v) => v + 1);
  }, [
    experiment.name,
    experiment.description,
    experiment.groups,
    experiment.experiment_start,
    experiment.experiment_end,
    experiment.organism_type,
  ]);

  const handleSaveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === experiment.name) {
      setName(experiment.name);
      return;
    }
    setSavingName(true);
    NProgress.start();
    try {
      await updateExperimentAction(experiment.id, { name: trimmed });
    } catch {
      setName(experiment.name);
    } finally {
      setSavingName(false);
      NProgress.done();
    }
  };

  return (
    <>
      <div className="flex justify-between items-start mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            {editMode ? (
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={handleSaveName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.blur();
                  }
                }}
                disabled={savingName}
                className="text-3xl font-bold bg-transparent border-b-2 border-blue-500 focus:outline-none px-0 py-0 w-full min-w-0"
              />
            ) : (
              <h1 className="text-3xl font-bold">{name}</h1>
            )}
            <span
              className={`px-2 py-1 text-xs font-medium rounded-full whitespace-nowrap ${isCompleted
                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                }`}
            >
              {isCompleted ? "completed" : "running"}
            </span>
          </div>
          <p className="text-zinc-600 dark:text-zinc-400">
            Experiment ID: {experiment.id}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setEditMode(!editMode)}
            className={`px-4 py-2 text-sm font-medium rounded-lg border cursor-pointer ${editMode
              ? "border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-500"
              : "border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              }`}
          >
            {editMode ? "Done" : "Edit"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <EditableDescription
            key={`desc-${dataVersion}`}
            experimentId={experiment.id}
            initialDescription={experiment.description}
            editMode={editMode}
          />

          <EditableGroups
            key={`groups-${dataVersion}`}
            experimentId={experiment.id}
            initialGroups={experiment.groups}
            editMode={editMode}
          />

          <EditablePeptides
            key={`peptides-${dataVersion}`}
            experimentId={experiment.id}
            initialPeptides={experiment.peptides}
            editMode={editMode}
          />

          <EditableParameters
            key={`params-${dataVersion}`}
            experimentId={experiment.id}
            initialParameters={experiment.additional_parameters}
            editMode={editMode}
          />

          <LogsTimeline experimentId={experiment.id} initialLogs={experiment.logs} />

          {experiment.links && Object.keys(experiment.links).length > 0 && (
            <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4">Links</h2>
              <div className="space-y-2">
                {Object.entries(experiment.links).map(([key, value]) => (
                  <div key={key} className="flex gap-2">
                    <span className="text-zinc-500 capitalize">{key}:</span>
                    <span className="text-blue-600 dark:text-blue-400">
                      {String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

        </div>

        <div className="space-y-6">
          <EditableDetails
            key={`details-${dataVersion}`}
            experimentId={experiment.id}
            rowCreatedAt={experiment.row_created_at}
            initialOrganismType={experiment.organism_type}
            initialExperimentStart={experiment.experiment_start}
            initialExperimentEnd={experiment.experiment_end}
            editMode={editMode}
          />

          <OldenLabsWidget
            experimentId={experiment.id}
            studyId={experiment.olden_labs_study_id}
            editMode={editMode}
          />

          <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Generated Files</h2>
                <button
                  onClick={handleSyncFiles}
                  disabled={syncing}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={syncing ? "animate-spin" : ""}
                  >
                    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                    <path d="M21 3v5h-5" />
                  </svg>
                  {syncing ? "Syncing…" : "Sync Files"}
                </button>
              </div>
              {experiment.generated_links && experiment.generated_links.length > 0 ? (
                <div className="space-y-2">
                  {experiment.generated_links.map((link, index) => {
                    const [label, url] = Object.entries(link)[0];
                    return (
                      <button
                        key={index}
                        onClick={async () => {
                          if (toastTimeout.current) clearTimeout(toastTimeout.current);
                          setDownloadToast({ label, hiding: false });
                          toastTimeout.current = setTimeout(() => {
                            setDownloadToast((prev) => prev ? { ...prev, hiding: true } : null);
                            setTimeout(() => setDownloadToast(null), 400);
                          }, 4500);
                          const res = await fetch(url);
                          const blob = await res.blob();
                          const blobUrl = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = blobUrl;
                          const path = new URL(url, window.location.origin).searchParams.get("path");
                          a.download = path?.split("/").pop() || label;
                          document.body.appendChild(a);
                          a.click();
                          a.remove();
                          URL.revokeObjectURL(blobUrl);
                        }}
                        title={label}
                        className="flex items-center gap-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors group w-full text-left cursor-pointer"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-green-600 dark:text-green-400 flex-shrink-0"
                        >
                          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                          <polyline points="14 2 14 8 20 8" />
                          <path d="M12 18v-6" />
                          <path d="m9 15 3 3 3-3" />
                        </svg>
                        <span className="text-xs font-medium group-hover:text-blue-600 dark:group-hover:text-blue-400">
                          {label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">No files yet. Click Sync Files to check for new data.</p>
              )}
            </section>
        </div>
      </div>

      <div className="flex justify-end mt-4">
        <DeleteExperimentButton
          experimentId={experiment.id}
          experimentName={experiment.name}
        />
      </div>

      {experiment.olden_labs_study_id && (
        <div className="mt-8 pt-8 border-t border-zinc-200 dark:border-zinc-800">
          <OldenLabsChart studyId={experiment.olden_labs_study_id} />
        </div>
      )}

      {downloadToast && (
        <div
          className="fixed top-6 left-0 right-0 flex justify-center z-50 pointer-events-none"
        >
          <div
            className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-6 py-3.5 rounded-lg shadow-lg text-sm font-medium pointer-events-auto"
            style={{
              animation: downloadToast.hiding
                ? "toastOut 0.4s ease-in forwards"
                : "toastIn 0.4s ease-out forwards",
            }}
          >
            Download {downloadToast.label} started
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes toastIn {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes toastOut {
          from {
            opacity: 1;
            transform: translateY(0);
          }
          to {
            opacity: 0;
            transform: translateY(-20px);
          }
        }
      `}</style>
    </>
  );
}
