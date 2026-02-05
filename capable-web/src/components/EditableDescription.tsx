"use client";

import { useState, useEffect } from "react";
import NProgress from "nprogress";
import { Markdown } from "@/components/Markdown";
import { updateExperimentAction } from "@/app/experiments/actions";

interface EditableDescriptionProps {
  experimentId: string;
  initialDescription: string | null;
  editMode?: boolean;
}

export function EditableDescription({
  experimentId,
  initialDescription,
  editMode = false,
}: EditableDescriptionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [description, setDescription] = useState(initialDescription || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editMode) {
      setIsEditing(false);
      setDescription(initialDescription || "");
    }
  }, [editMode, initialDescription]);

  const handleSave = async () => {
    setSaving(true);
    NProgress.start();
    try {
      await updateExperimentAction(experimentId, {
        description: description || null,
      });
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to save description:", error);
    } finally {
      setSaving(false);
      NProgress.done();
    }
  };

  const handleCancel = () => {
    setDescription(initialDescription || "");
    setIsEditing(false);
  };

  return (
    <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Description</h2>
        {editMode && !isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 cursor-pointer rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
            title="Edit description"
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
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            placeholder="Enter description (supports markdown)..."
          />
          <p className="text-xs text-zinc-500">Supports markdown formatting</p>
          <div className="flex gap-2 justify-end">
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
      ) : description ? (
        <Markdown className="text-zinc-600 dark:text-zinc-400">
          {description}
        </Markdown>
      ) : (
        <p className="text-zinc-500 italic">No description provided</p>
      )}
    </section>
  );
}
