"use client";

import { useState } from "react";
import NProgress from "nprogress";
import { updateExperimentAction } from "@/app/experiments/actions";
import { PeptideSelect } from "@/components/PeptideSelect";

const DEFAULT_PEPTIDES = [
  "ACDEFGHIK",
  "LMNPQRST",
  "VWXY",
  "GAVILM",
  "FYWH",
  "KRDE",
  "STNQ",
  "CGP",
];

interface EditablePeptidesProps {
  experimentId: string;
  initialPeptides: string[] | null;
  editMode?: boolean;
}

export function EditablePeptides({
  experimentId,
  initialPeptides,
  editMode = false,
}: EditablePeptidesProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedPeptides, setSelectedPeptides] = useState<string[]>(
    initialPeptides || []
  );
  const [availablePeptides, setAvailablePeptides] = useState<string[]>(() => {
    const existing = initialPeptides || [];
    const combined = new Set([...DEFAULT_PEPTIDES, ...existing]);
    return Array.from(combined).sort();
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    NProgress.start();
    try {
      await updateExperimentAction(experimentId, {
        peptides: selectedPeptides.length > 0 ? selectedPeptides : null,
      });
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to save peptides:", error);
    } finally {
      setSaving(false);
      NProgress.done();
    }
  };

  const handleCancel = () => {
    setSelectedPeptides(initialPeptides || []);
    setIsEditing(false);
  };

  const hasPeptides = selectedPeptides.length > 0;

  return (
    <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Peptides</h2>
        {editMode && !isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 cursor-pointer rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
            title="Edit peptides"
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

      {isEditing ? (
        <div className="space-y-3">
          <PeptideSelect
            value={selectedPeptides}
            onChange={setSelectedPeptides}
            availablePeptides={availablePeptides}
            onAddPeptide={(peptide) => {
              setAvailablePeptides((prev) => [...prev, peptide].sort());
            }}
          />
          <div className="flex gap-2 justify-end pt-2">
            <button
              onClick={handleCancel}
              disabled={saving}
              className="px-3 py-1.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 text-sm rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      ) : hasPeptides ? (
        <div className="flex flex-wrap gap-2">
          {selectedPeptides.map((peptide, index) => (
            <span
              key={index}
              className="px-3 py-1 text-sm font-mono bg-zinc-100 dark:bg-zinc-800 rounded"
            >
              {peptide}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-zinc-500 italic">No peptides</p>
      )}
    </section>
  );
}
