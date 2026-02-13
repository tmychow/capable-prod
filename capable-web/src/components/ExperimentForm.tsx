"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NProgress from "nprogress";
import type { Experiment, ExperimentInput, ExperimentGroup } from "@/lib/api";
import { toDateTimeLocal } from "@/lib/api";
import { PeptideSelect } from "@/components/PeptideSelect";
import { OrganismSelect } from "@/components/OrganismSelect";
import { CageIdCell } from "@/components/CageIdCell";
import { findCageCloseTime } from "@/components/OldenLabsChart";
import type { OldenLabsChartData } from "@/components/OldenLabsChart";

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
    toDateTimeLocal(experiment?.experiment_start || null)
  );
  const [experimentEnd, setExperimentEnd] = useState(
    toDateTimeLocal(experiment?.experiment_end || null)
  );
  const [oldenLabsStudyId, setOldenLabsStudyId] = useState(
    experiment?.olden_labs_study_id?.toString() ?? ""
  );
  const [oldenLabsAuth, setOldenLabsAuth] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [studyIdConflict, setStudyIdConflict] = useState<string | null>(null);

  useEffect(() => {
    async function checkOldenLabsAuth() {
      try {
        const res = await fetch("/api/oldenlabs/auth");
        const data = await res.json();
        setOldenLabsAuth(data.authenticated);
      } catch {
        setOldenLabsAuth(false);
      }
    }
    checkOldenLabsAuth();
  }, []);

  // Check for duplicate study ID when it changes
  useEffect(() => {
    if (!oldenLabsStudyId) {
      setStudyIdConflict(null);
      return;
    }
    const controller = new AbortController();
    async function checkDuplicate() {
      try {
        const params = new URLSearchParams({ study_id: oldenLabsStudyId });
        if (experiment?.id) params.set("exclude_experiment_id", experiment.id);
        const res = await fetch(`/api/oldenlabs/sync?${params}`, {
          signal: controller.signal,
        });
        if (res.status === 409) {
          const data = await res.json();
          setStudyIdConflict(data.error);
        } else {
          setStudyIdConflict(null);
        }
      } catch {
        // Aborted or network error — ignore
      }
    }
    const timeout = setTimeout(checkDuplicate, 500);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [oldenLabsStudyId, experiment?.id]);

  const handleSync = async () => {
    if (!oldenLabsStudyId) return;
    setSyncing(true);
    setError(null);
    NProgress.start();
    try {
      const params = new URLSearchParams({ study_id: oldenLabsStudyId });
      if (experiment?.id) params.set("exclude_experiment_id", experiment.id);
      const res = await fetch(`/api/oldenlabs/sync?${params}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to sync from Olden Labs");
      }
      const data = await res.json();
      if (data.name) setName(data.name);
      if (data.description) setDescription(data.description);
      if (data.organism_type) setOrganismType(data.organism_type);
      if (data.groups && data.groups.length > 0) setGroups(data.groups);

      // Detect cage close time from chart data
      let cageCloseLocal: string | null = null;
      try {
        const pad = (n: number) => String(n).padStart(2, "0");
        const toLocal = (d: Date) =>
          `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        const rawStart = data.experiment_start || toLocal(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
        const startDate = new Date(rawStart);
        if (!isNaN(startDate.getTime())) startDate.setDate(startDate.getDate() - 1);
        const chartParams = new URLSearchParams({
          study_id: oldenLabsStudyId!,
          start_time: toLocal(startDate),
          end_time: toLocal(new Date()),
          group_by: "hour1",
          chart_type: "LineChart",
          error_bar_type: "SEM",
        });
        const chartRes = await fetch(`/api/oldenlabs/chart?${chartParams}`);
        if (chartRes.ok) {
          const chartData = await chartRes.json();
          const charts: OldenLabsChartData[] = Array.isArray(chartData) ? chartData : [chartData];
          const closeTime = findCageCloseTime(charts);
          if (closeTime) {
            cageCloseLocal = closeTime.slice(0, 16).replace(" ", "T");
          }
        }
      } catch {
        // Cage close detection failed, continue without it
      }
      setExperimentStart(cageCloseLocal || data.experiment_start || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
      NProgress.done();
    }
  };

  // Groups
  const [groups, setGroups] = useState<ExperimentGroup[]>(experiment?.groups || []);

  const EMPTY_GROUP: ExperimentGroup = {
    name: "", group_id: "", group_name: "", num_cages: null, num_animals: null, cage_ids: [],
    treatment: "", species: "", strain: "", dob: "", sex: "",
  };

  const GROUP_COLUMNS: { key: keyof ExperimentGroup; label: string; type: string }[] = [
    { key: "name", label: "Name", type: "text" },
    { key: "group_id", label: "Group ID", type: "text" },
    { key: "group_name", label: "Group Name", type: "text" },
    { key: "num_cages", label: "No. of Cages", type: "number" },
    { key: "num_animals", label: "No. of Animals", type: "number" },
    { key: "cage_ids", label: "Cage IDs", type: "cage_ids" },
    { key: "treatment", label: "Treatment", type: "text" },
    { key: "species", label: "Species", type: "text" },
    { key: "strain", label: "Strain", type: "text" },
    { key: "dob", label: "DOB", type: "date" },
    { key: "sex", label: "Sex", type: "select" },
  ];

  const addGroup = () => setGroups([...groups, { ...EMPTY_GROUP }]);
  const removeGroup = (index: number) => setGroups(groups.filter((_, i) => i !== index));
  const updateGroup = (index: number, key: keyof ExperimentGroup, value: string) => {
    const updated = [...groups];
    if (key === "num_cages" || key === "num_animals") {
      updated[index] = { ...updated[index], [key]: value === "" ? null : Number(value) };
    } else {
      updated[index] = { ...updated[index], [key]: value };
    }
    setGroups(updated);
  };

  // Parameters as array of key-value pairs (easier to edit than JSON)
  const [parameters, setParameters] = useState<Parameter[]>(
    objectToParameters(experiment?.additional_parameters || null)
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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (studyIdConflict) {
      setError(studyIdConflict);
      return;
    }
    setError(null);
    setLoading(true);
    NProgress.start();

    try {
      const data: ExperimentInput = {
        name,
        description: description || null,
        organism_type: organismType || null,
        groups: groups.length > 0 ? groups : null,
        peptides: selectedPeptides.length > 0 ? selectedPeptides : null,
        experiment_start: experimentStart || null,
        experiment_end: experimentEnd || null,
        additional_parameters: parametersToObject(parameters),
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

      <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 space-y-3">
        <div>
          <label htmlFor="oldenLabsStudyId" className="block text-sm font-medium mb-2">
            Olden Labs Study ID
          </label>
          {oldenLabsAuth ? (
            <>
              <input
                id="oldenLabsStudyId"
                type="text"
                value={oldenLabsStudyId}
                onChange={(e) => setOldenLabsStudyId(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., 1945"
              />
              {studyIdConflict ? (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {studyIdConflict}
                </p>
              ) : (
                <p className="mt-1 text-xs text-zinc-500">
                  Link this experiment to an Olden Labs study to sync data
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-zinc-500">
              <Link href="/experiments" className="text-blue-600 dark:text-blue-400 hover:underline">
                Sign in to Olden Labs
              </Link>
              {" "}on the experiments page to enter a Study ID.
            </p>
          )}
        </div>
        {oldenLabsAuth && (
          <button
            type="button"
            onClick={handleSync}
            disabled={!oldenLabsStudyId || syncing || !!studyIdConflict}
            className="px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm font-medium disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed flex items-center gap-2"
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
              className={syncing ? "animate-spin" : ""}
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 16h5v5" />
            </svg>
            {syncing ? "Syncing..." : "Sync from Olden Labs"}
          </button>
        )}
      </div>

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
          <label className="block text-sm font-medium mb-2">
            Organism Type
          </label>
          <OrganismSelect
            value={organismType}
            onChange={setOrganismType}
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
            Start Date
          </label>
          <input
            id="experimentStart"
            type="datetime-local"
            value={experimentStart}
            onChange={(e) => setExperimentStart(e.target.value)}
            className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="experimentEnd" className="block text-sm font-medium mb-2">
            End Date
          </label>
          <input
            id="experimentEnd"
            type="datetime-local"
            value={experimentEnd}
            onChange={(e) => setExperimentEnd(e.target.value)}
            className="w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Groups */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="block text-sm font-medium">Groups</label>
          <button
            type="button"
            onClick={addGroup}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            + Add Group
          </button>
        </div>

        {groups.length === 0 ? (
          <p className="text-sm text-zinc-500 italic">
            No groups. Click &quot;Add Group&quot; to add one.
          </p>
        ) : (
          <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700">
                  {GROUP_COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className="px-2 py-2 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider whitespace-nowrap"
                    >
                      {col.label}
                    </th>
                  ))}
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {groups.map((group, index) => (
                  <tr key={index}>
                    {GROUP_COLUMNS.map((col) => (
                      <td key={col.key} className="px-2 py-1.5">
                        {col.type === "cage_ids" ? (
                          <CageIdCell
                            value={(group.cage_ids as string[]) || []}
                            onChange={(cageIds) => {
                              const updated = [...groups];
                              updated[index] = { ...updated[index], cage_ids: cageIds };
                              setGroups(updated);
                            }}
                          />
                        ) : col.type === "select" ? (
                          <select
                            value={group[col.key]?.toString() ?? ""}
                            onChange={(e) => updateGroup(index, col.key, e.target.value)}
                            className="w-full px-2 py-1.5 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm min-w-[80px]"
                          >
                            <option value="">--</option>
                            <option value="M">M</option>
                            <option value="F">F</option>
                            <option value="Other">Other</option>
                          </select>
                        ) : (
                          <input
                            type={col.type}
                            value={group[col.key]?.toString() ?? ""}
                            onChange={(e) => updateGroup(index, col.key, e.target.value)}
                            className="w-full px-2 py-1.5 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm min-w-[80px]"
                          />
                        )}
                      </td>
                    ))}
                    <td className="px-1 py-1.5">
                      <button
                        type="button"
                        onClick={() => removeGroup(index)}
                        className="p-2 text-zinc-400 hover:text-red-500 transition-colors"
                        title="Remove group"
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Parameters as key-value pairs */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="block text-sm font-medium">Additional Parameters</label>
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
            No additional parameters. Click &quot;Add Parameter&quot; to add one.
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
          disabled={loading || !!studyIdConflict}
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
