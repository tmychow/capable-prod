"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import NProgress from "nprogress";
import type { Experiment, ExperimentInput } from "@/lib/api";
import { PeptideSelect } from "@/components/PeptideSelect";

// Default peptides that are commonly used
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

interface ExperimentFormProps {
  experiment?: Experiment;
  onSubmit: (data: ExperimentInput) => Promise<void>;
  submitLabel: string;
}

// Parameter as key-value pair for easier editing
interface Parameter {
  key: string;
  value: string;
}

// Convert object to array of key-value pairs for the form
function objectToParameters(obj: Record<string, unknown> | null): Parameter[] {
  if (!obj || Object.keys(obj).length === 0) {
    return [];
  }
  return Object.entries(obj).map(([key, value]) => ({
    key,
    value: String(value),
  }));
}

// Convert array of key-value pairs back to object for the API
function parametersToObject(params: Parameter[]): Record<string, unknown> | null {
  const filtered = params.filter((p) => p.key.trim() !== "");
  if (filtered.length === 0) {
    return null;
  }
  const obj: Record<string, unknown> = {};
  for (const param of filtered) {
    // Try to parse as number or boolean, otherwise keep as string
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

export default function ExperimentForm({
  experiment,
  onSubmit,
  submitLabel,
}: ExperimentFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Basic fields
  const [name, setName] = useState(experiment?.name || "");
  const [description, setDescription] = useState(experiment?.description || "");
  const [organismType, setOrganismType] = useState(experiment?.organism_type || "");
  const [selectedPeptides, setSelectedPeptides] = useState<string[]>(
    experiment?.peptides || []
  );
  const [availablePeptides, setAvailablePeptides] = useState<string[]>(() => {
    // Combine default peptides with any existing ones from the experiment
    const existing = experiment?.peptides || [];
    const combined = new Set([...DEFAULT_PEPTIDES, ...existing]);
    return Array.from(combined).sort();
  });
  const [experimentStart, setExperimentStart] = useState(
    experiment?.experiment_start || ""
  );
  const [experimentEnd, setExperimentEnd] = useState(
    experiment?.experiment_end || ""
  );
  const [oldenLabsStudyId, setOldenLabsStudyId] = useState(
    experiment?.olden_labs_study_id || ""
  );

  // Parameters as array of key-value pairs (easier to edit than JSON)
  const [parameters, setParameters] = useState<Parameter[]>(
    objectToParameters(experiment?.parameters || null)
  );

  // Add a new empty parameter row
  const addParameter = () => {
    setParameters([...parameters, { key: "", value: "" }]);
  };

  // Remove a parameter by index
  const removeParameter = (index: number) => {
    setParameters(parameters.filter((_, i) => i !== index));
  };

  // Update a parameter's key or value
  const updateParameter = (index: number, field: "key" | "value", newValue: string) => {
    const updated = [...parameters];
    updated[index] = { ...updated[index], [field]: newValue };
    setParameters(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    NProgress.start();

    try {
      const data: ExperimentInput = {
        name,
        description: description || null,
        organism_type: organismType || null,
        peptides: selectedPeptides.length > 0 ? selectedPeptides : null,
        experiment_start: experimentStart || null,
        experiment_end: experimentEnd || null,
        parameters: parametersToObject(parameters),
        olden_labs_study_id: oldenLabsStudyId || null,
      };

      await onSubmit(data);
      router.push("/experiments");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      NProgress.done();
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      <div>
        <label htmlFor="name" className="block text-sm font-medium mb-2">
          Name *
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Experiment name"
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium mb-2">
          Description
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Describe the experiment..."
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="organismType" className="block text-sm font-medium mb-2">
            Organism Type
          </label>
          <input
            id="organismType"
            type="text"
            value={organismType}
            onChange={(e) => setOrganismType(e.target.value)}
            className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g., E. coli"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Peptides
          </label>
          <PeptideSelect
            value={selectedPeptides}
            onChange={setSelectedPeptides}
            availablePeptides={availablePeptides}
            onAddPeptide={(peptide) => {
              setAvailablePeptides((prev) => [...prev, peptide].sort());
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="experimentStart" className="block text-sm font-medium mb-2">
            Start Time
          </label>
          <input
            id="experimentStart"
            type="time"
            step="1"
            value={experimentStart}
            onChange={(e) => setExperimentStart(e.target.value)}
            className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="experimentEnd" className="block text-sm font-medium mb-2">
            End Time
          </label>
          <input
            id="experimentEnd"
            type="time"
            step="1"
            value={experimentEnd}
            onChange={(e) => setExperimentEnd(e.target.value)}
            className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label htmlFor="oldenLabsStudyId" className="block text-sm font-medium mb-2">
          Olden Labs Study ID
        </label>
        <input
          id="oldenLabsStudyId"
          type="text"
          value={oldenLabsStudyId}
          onChange={(e) => setOldenLabsStudyId(e.target.value)}
          className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="e.g., 1945"
        />
        <p className="mt-1 text-xs text-zinc-500">
          Link this experiment to an Olden Labs study for data downloads
        </p>
      </div>

      {/* Parameters as key-value pairs */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="block text-sm font-medium">Parameters</label>
          <button
            type="button"
            onClick={addParameter}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            + Add Parameter
          </button>
        </div>

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
                  placeholder="Key (e.g., temperature)"
                  className="flex-1 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
                <input
                  type="text"
                  value={param.value}
                  onChange={(e) => updateParameter(index, "value", e.target.value)}
                  placeholder="Value (e.g., 37)"
                  className="flex-1 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
                <button
                  type="button"
                  onClick={() => removeParameter(index)}
                  className="p-2 text-zinc-400 hover:text-red-500 transition-colors"
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
      </div>

      <div className="flex gap-4 pt-4">
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 font-medium disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
        >
          {loading ? "Saving..." : submitLabel}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-6 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 font-medium cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
