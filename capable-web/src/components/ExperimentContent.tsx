"use client";

import { useState } from "react";
import { LogsTimeline } from "@/components/LogsTimeline";
import { OldenLabsWidget } from "@/components/OldenLabsWidget";
import { EditableDescription } from "@/components/EditableDescription";
import { EditableParameters } from "@/components/EditableParameters";
import { EditablePeptides } from "@/components/EditablePeptides";
import { EditableDetails } from "@/components/EditableDetails";
import { DeleteExperimentButton } from "@/components/DeleteExperimentButton";
import type { Experiment } from "@/lib/api";

interface ExperimentContentProps {
  experiment: Experiment;
}

export function ExperimentContent({ experiment }: ExperimentContentProps) {
  const [editMode, setEditMode] = useState(false);
  const isCompleted = experiment.experiment_end !== null;

  return (
    <>
      <div className="flex justify-between items-start mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">{experiment.name}</h1>
            <span
              className={`px-2 py-1 text-xs font-medium rounded-full ${
                isCompleted
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
            className={`px-4 py-2 text-sm font-medium rounded-lg border cursor-pointer ${
              editMode
                ? "border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-500"
                : "border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            }`}
          >
            {editMode ? "Done" : "Edit"}
          </button>
          <DeleteExperimentButton
            experimentId={experiment.id}
            experimentName={experiment.name}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <EditableDescription
            experimentId={experiment.id}
            initialDescription={experiment.description}
            editMode={editMode}
          />

          <EditableParameters
            experimentId={experiment.id}
            initialParameters={experiment.parameters}
            editMode={editMode}
          />

          <EditablePeptides
            experimentId={experiment.id}
            initialPeptides={experiment.peptides}
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
        </div>
      </div>
    </>
  );
}
