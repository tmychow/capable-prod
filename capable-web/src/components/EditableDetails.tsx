"use client";

import { useState, useEffect } from "react";
import NProgress from "nprogress";
import { updateExperimentAction } from "@/app/experiments/actions";
import { formatDate, formatDateTime, toDateTimeLocal } from "@/lib/api";

interface EditableDetailsProps {
  experimentId: string;
  rowCreatedAt: string;
  initialOrganismType: string | null;
  initialExperimentStart: string | null;
  initialExperimentEnd: string | null;
  editMode?: boolean;
}

export function EditableDetails({
  experimentId,
  rowCreatedAt,
  initialOrganismType,
  initialExperimentStart,
  initialExperimentEnd,
  editMode = false,
}: EditableDetailsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [organismType, setOrganismType] = useState(initialOrganismType || "");
  const [experimentStart, setExperimentStart] = useState(toDateTimeLocal(initialExperimentStart));
  const [experimentEnd, setExperimentEnd] = useState(toDateTimeLocal(initialExperimentEnd));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editMode) {
      setIsEditing(false);
      setOrganismType(initialOrganismType || "");
      setExperimentStart(toDateTimeLocal(initialExperimentStart));
      setExperimentEnd(toDateTimeLocal(initialExperimentEnd));
    }
  }, [editMode, initialOrganismType, initialExperimentStart, initialExperimentEnd]);

  const handleSave = async () => {
    setSaving(true);
    NProgress.start();
    try {
      await updateExperimentAction(experimentId, {
        organism_type: organismType || null,
        experiment_start: experimentStart || null,
        experiment_end: experimentEnd || null,
      });
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to save details:", error);
    } finally {
      setSaving(false);
      NProgress.done();
    }
  };

  const handleCancel = () => {
    setOrganismType(initialOrganismType || "");
    setExperimentStart(toDateTimeLocal(initialExperimentStart));
    setExperimentEnd(toDateTimeLocal(initialExperimentEnd));
    setIsEditing(false);
  };

  return (
    <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Details</h2>
        {editMode && !isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 cursor-pointer rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
            title="Edit details"
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
        <div className="space-y-4">
          <div>
            <dt className="text-sm text-zinc-500 mb-1">Created</dt>
            <dd className="font-medium">{formatDate(rowCreatedAt)}</dd>
          </div>
          <div>
            <label className="text-sm text-zinc-500 block mb-1">Organism Type</label>
            <input
              type="text"
              value={organismType}
              onChange={(e) => setOrganismType(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="e.g., E. coli"
            />
          </div>
          <div>
            <label className="text-sm text-zinc-500 block mb-1">Start Date</label>
            <input
              type="datetime-local"
              value={experimentStart}
              onChange={(e) => setExperimentStart(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          <div>
            <label className="text-sm text-zinc-500 block mb-1">End Date</label>
            <input
              type="datetime-local"
              value={experimentEnd}
              onChange={(e) => setExperimentEnd(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
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
      ) : (
        <dl className="space-y-3">
          <div>
            <dt className="text-sm text-zinc-500">Created</dt>
            <dd className="font-medium">{formatDate(rowCreatedAt)}</dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500">Organism Type</dt>
            <dd className="font-medium">{organismType || "—"}</dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500">Start Date</dt>
            <dd className="font-medium">{formatDateTime(experimentStart || null)}</dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500">End Date</dt>
            <dd className="font-medium">{formatDateTime(experimentEnd || null)}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
