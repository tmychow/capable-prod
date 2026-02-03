"use client";

import { useState } from "react";
import NProgress from "nprogress";
import { deleteExperimentAction } from "@/app/experiments/actions";

interface DeleteExperimentButtonProps {
  experimentId: string;
  experimentName: string;
}

export function DeleteExperimentButton({
  experimentId,
  experimentName,
}: DeleteExperimentButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    NProgress.start();
    try {
      await deleteExperimentAction(experimentId);
    } catch (error) {
      console.error("Failed to delete experiment:", error);
      setDeleting(false);
      NProgress.done();
    }
  };

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        className="px-4 py-2 text-sm font-medium rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer"
      >
        Delete
      </button>

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
                {experimentName}
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
