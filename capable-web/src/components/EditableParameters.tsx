"use client";

import { useState } from "react";
import NProgress from "nprogress";
import { updateExperimentAction } from "@/app/experiments/actions";

interface Parameter {
  key: string;
  value: string;
}

interface EditableParametersProps {
  experimentId: string;
  initialParameters: Record<string, unknown> | null;
  editMode?: boolean;
}

function objectToParameters(obj: Record<string, unknown> | null): Parameter[] {
  if (!obj || Object.keys(obj).length === 0) {
    return [];
  }
  return Object.entries(obj).map(([key, value]) => ({
    key,
    value: String(value),
  }));
}

function parametersToObject(params: Parameter[]): Record<string, unknown> | null {
  const filtered = params.filter((p) => p.key.trim() !== "");
  if (filtered.length === 0) {
    return null;
  }
  const obj: Record<string, unknown> = {};
  for (const param of filtered) {
    const value = param.value.trim();
    if (value === "true") {
      obj[param.key] = true;
    } else if (value === "false") {
      obj[param.key] = false;
    } else if (!isNaN(Number(value)) && value !== "") {
      obj[param.key] = Number(value);
    } else {
      obj[param.key] = value;
    }
  }
  return obj;
}

export function EditableParameters({
  experimentId,
  initialParameters,
  editMode = false,
}: EditableParametersProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [parameters, setParameters] = useState<Parameter[]>(
    objectToParameters(initialParameters)
  );
  const [saving, setSaving] = useState(false);

  const addParameter = () => {
    setParameters([...parameters, { key: "", value: "" }]);
  };

  const removeParameter = (index: number) => {
    setParameters(parameters.filter((_, i) => i !== index));
  };

  const updateParameter = (index: number, field: "key" | "value", newValue: string) => {
    const updated = [...parameters];
    updated[index] = { ...updated[index], [field]: newValue };
    setParameters(updated);
  };

  const handleSave = async () => {
    setSaving(true);
    NProgress.start();
    try {
      await updateExperimentAction(experimentId, {
        parameters: parametersToObject(parameters),
      });
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to save parameters:", error);
    } finally {
      setSaving(false);
      NProgress.done();
    }
  };

  const handleCancel = () => {
    setParameters(objectToParameters(initialParameters));
    setIsEditing(false);
  };

  const displayParams = parametersToObject(parameters);
  const hasParams = displayParams && Object.keys(displayParams).length > 0;

  return (
    <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Parameters</h2>
        {editMode && !isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 cursor-pointer rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
            title="Edit parameters"
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
          {parameters.length === 0 ? (
            <p className="text-sm text-zinc-500 italic">
              No parameters. Click &quot;Add Parameter&quot; to add one.
            </p>
          ) : (
            <div className="space-y-2">
              {parameters.map((param, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={param.key}
                    onChange={(e) => updateParameter(index, "key", e.target.value)}
                    placeholder="Key"
                    className="flex-1 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                  <input
                    type="text"
                    value={param.value}
                    onChange={(e) => updateParameter(index, "value", e.target.value)}
                    placeholder="Value"
                    className="flex-1 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeParameter(index)}
                    className="p-2 text-zinc-400 hover:text-red-500 transition-colors cursor-pointer"
                    title="Remove parameter"
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
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={addParameter}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          >
            + Add Parameter
          </button>
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
      ) : hasParams ? (
        <div className="grid grid-cols-2 gap-4">
          {Object.entries(displayParams).map(([key, value]) => (
            <div key={key}>
              <p className="text-sm text-zinc-500 mb-1 capitalize">
                {key.replace(/_/g, " ")}
              </p>
              <p className="font-medium">{String(value)}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-zinc-500 italic">No parameters</p>
      )}
    </section>
  );
}
