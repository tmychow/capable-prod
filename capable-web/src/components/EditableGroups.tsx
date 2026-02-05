"use client";

import { useState, useEffect } from "react";
import NProgress from "nprogress";
import { updateExperimentAction } from "@/app/experiments/actions";
import { CageIdCell } from "@/components/CageIdCell";
import type { ExperimentGroup } from "@/lib/api";

interface EditableGroupsProps {
  experimentId: string;
  initialGroups: ExperimentGroup[] | null;
  editMode?: boolean;
}

const EMPTY_GROUP: ExperimentGroup = {
  name: "",
  group_id: "",
  num_cages: null,
  num_animals: null,
  cage_ids: [],
  treatment: "",
  species: "",
  strain: "",
  dob: "",
  sex: "",
};

const COLUMNS: { key: keyof ExperimentGroup; label: string; type: string }[] = [
  { key: "name", label: "Name", type: "text" },
  { key: "group_id", label: "ID", type: "text" },
  { key: "num_cages", label: "No. of Cages", type: "number" },
  { key: "num_animals", label: "No. of Animals", type: "number" },
  { key: "cage_ids", label: "Cage IDs", type: "cage_ids" },
  { key: "treatment", label: "Treatment", type: "text" },
  { key: "species", label: "Species", type: "text" },
  { key: "strain", label: "Strain", type: "text" },
  { key: "dob", label: "DOB", type: "date" },
  { key: "sex", label: "Sex", type: "select" },
];

export function EditableGroups({
  experimentId,
  initialGroups,
  editMode = false,
}: EditableGroupsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [groups, setGroups] = useState<ExperimentGroup[]>(initialGroups || []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editMode) {
      setIsEditing(false);
      setGroups(initialGroups || []);
    }
  }, [editMode, initialGroups]);

  const addGroup = () => {
    setGroups([...groups, { ...EMPTY_GROUP }]);
  };

  const removeGroup = (index: number) => {
    setGroups(groups.filter((_, i) => i !== index));
  };

  const updateGroup = (index: number, key: keyof ExperimentGroup, value: string) => {
    const updated = [...groups];
    if (key === "num_cages" || key === "num_animals") {
      updated[index] = { ...updated[index], [key]: value === "" ? null : Number(value) };
    } else {
      updated[index] = { ...updated[index], [key]: value };
    }
    setGroups(updated);
  };

  const handleSave = async () => {
    setSaving(true);
    NProgress.start();
    try {
      await updateExperimentAction(experimentId, {
        groups: groups.length > 0 ? groups : null,
      });
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to save groups:", error);
    } finally {
      setSaving(false);
      NProgress.done();
    }
  };

  const handleCancel = () => {
    setGroups(initialGroups || []);
    setIsEditing(false);
  };

  return (
    <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Groups</h2>
        {editMode && !isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 cursor-pointer rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
            title="Edit groups"
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
          {groups.length === 0 ? (
            <p className="text-sm text-zinc-500 italic">
              No groups. Click &quot;Add Group&quot; to add one.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-700">
                    {COLUMNS.map((col) => (
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
                      {COLUMNS.map((col) => (
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
                          className="p-1.5 text-zinc-400 hover:text-red-500 transition-colors cursor-pointer"
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
          <button
            type="button"
            onClick={addGroup}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          >
            + Add Group
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
      ) : groups.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700">
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className="px-3 py-2 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider whitespace-nowrap"
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {groups.map((group, index) => (
                <tr key={index}>
                  {COLUMNS.map((col) => (
                    <td key={col.key} className="px-3 py-2 whitespace-nowrap">
                      {col.type === "cage_ids" ? (
                        <CageIdCell
                          value={(group.cage_ids as string[]) || []}
                          onChange={() => {}}
                          readOnly
                        />
                      ) : (
                        group[col.key]?.toString() || <span className="text-zinc-400">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-zinc-500 italic">No groups</p>
      )}
    </section>
  );
}
