"use client";

import { useState } from "react";
import NProgress from "nprogress";
import { updateLogsAction } from "@/app/experiments/actions";
import { Markdown } from "@/components/Markdown";

interface Log {
  id: string;
  timestamp: string;
  message: string;
  type?: "info" | "warning" | "error" | "success";
}

interface LogsTimelineProps {
  experimentId: string;
  initialLogs: Record<string, unknown>[] | null;
}

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

function parseLogs(logs: Record<string, unknown>[] | null): Log[] {
  if (!logs) return [];
  return logs.map((log) => ({
    id: (log.id as string) || generateId(),
    timestamp: (log.timestamp as string) || new Date().toISOString(),
    message: (log.message as string) || "",
    type: (log.type as Log["type"]) || "info",
  }));
}

function logsToRecords(logs: Log[]): Record<string, unknown>[] {
  return logs.map((log) => ({
    id: log.id,
    timestamp: log.timestamp,
    message: log.message,
    type: log.type,
  }));
}

const typeStyles = {
  info: "bg-blue-500",
  warning: "bg-yellow-500",
  error: "bg-red-500",
  success: "bg-green-500",
};

const typeBorderStyles = {
  info: "border-blue-200 dark:border-blue-800",
  warning: "border-yellow-200 dark:border-yellow-800",
  error: "border-red-200 dark:border-red-800",
  success: "border-green-200 dark:border-green-800",
};

export function LogsTimeline({ experimentId, initialLogs }: LogsTimelineProps) {
  const [logs, setLogs] = useState<Log[]>(() =>
    parseLogs(initialLogs).sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMessage, setEditMessage] = useState("");
  const [editType, setEditType] = useState<Log["type"]>("info");
  const [newMessage, setNewMessage] = useState("");
  const [newType, setNewType] = useState<Log["type"]>("info");
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const saveLogs = async (updatedLogs: Log[]) => {
    setSaving(true);
    NProgress.start();
    try {
      await updateLogsAction(experimentId, logsToRecords(updatedLogs));
      setLogs(updatedLogs);
    } catch (error) {
      console.error("Failed to save logs:", error);
    } finally {
      setSaving(false);
      NProgress.done();
    }
  };

  const handleAddLog = async () => {
    if (!newMessage.trim()) return;

    const newLog: Log = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      message: newMessage.trim(),
      type: newType,
    };

    const updatedLogs = [newLog, ...logs];
    await saveLogs(updatedLogs);
    setNewMessage("");
    setNewType("info");
    setShowAddForm(false);
  };

  const handleEditLog = (log: Log) => {
    setEditingId(log.id);
    setEditMessage(log.message);
    setEditType(log.type || "info");
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editMessage.trim()) return;

    const updatedLogs = logs.map((log) =>
      log.id === editingId
        ? { ...log, message: editMessage.trim(), type: editType }
        : log
    );

    await saveLogs(updatedLogs);
    setEditingId(null);
    setEditMessage("");
    setEditType("info");
  };

  const handleDeleteLog = async (id: string) => {
    const updatedLogs = logs.filter((log) => log.id !== id);
    await saveLogs(updatedLogs);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditMessage("");
    setEditType("info");
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  return (
    <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-semibold">Logs</h2>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          disabled={saving}
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline cursor-pointer disabled:opacity-50"
        >
          {showAddForm ? "Cancel" : "+ Add Log"}
        </button>
      </div>

      {showAddForm && (
        <div className="mb-6 p-4 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Message</label>
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Enter log message..."
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1">Type</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as Log["type"])}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="info">Info</option>
                  <option value="success">Success</option>
                  <option value="warning">Warning</option>
                  <option value="error">Error</option>
                </select>
              </div>
              <button
                onClick={handleAddLog}
                disabled={saving || !newMessage.trim()}
                className="px-4 py-2 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 text-sm font-medium disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : "Add Log"}
              </button>
            </div>
          </div>
        </div>
      )}

      {logs.length === 0 ? (
        <p className="text-sm text-zinc-500 italic">
          No logs yet. Click &quot;+ Add Log&quot; to add one.
        </p>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[7px] top-3 bottom-3 w-0.5 bg-zinc-200 dark:bg-zinc-700" />

          <div className="space-y-4">
            {logs.map((log, index) => (
              <div key={log.id} className="relative pl-8">
                {/* Timeline dot */}
                <div
                  className={`absolute left-0 top-2 w-4 h-4 rounded-full border-2 border-white dark:border-zinc-900 ${
                    typeStyles[log.type || "info"]
                  }`}
                />

                <div
                  className={`border rounded-lg p-4 ${
                    typeBorderStyles[log.type || "info"]
                  } bg-white dark:bg-zinc-800/50`}
                >
                  {editingId === log.id ? (
                    <div className="space-y-3">
                      <textarea
                        value={editMessage}
                        onChange={(e) => setEditMessage(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                      <div className="flex gap-2 items-center">
                        <select
                          value={editType}
                          onChange={(e) => setEditType(e.target.value as Log["type"])}
                          className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        >
                          <option value="info">Info</option>
                          <option value="success">Success</option>
                          <option value="warning">Warning</option>
                          <option value="error">Error</option>
                        </select>
                        <div className="flex-1" />
                        <button
                          onClick={handleCancelEdit}
                          disabled={saving}
                          className="px-3 py-1.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveEdit}
                          disabled={saving || !editMessage.trim()}
                          className="px-3 py-1.5 text-sm rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                        >
                          {saving ? "Saving..." : "Save"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between items-start gap-4 mb-2">
                        <div className="flex-1 text-sm text-zinc-600 dark:text-zinc-400">
                          <Markdown>{log.message}</Markdown>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => handleEditLog(log)}
                            disabled={saving}
                            className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 cursor-pointer disabled:opacity-50"
                            title="Edit"
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
                            >
                              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                              <path d="m15 5 4 4" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteLog(log.id)}
                            disabled={saving}
                            className="p-1 text-zinc-400 hover:text-red-500 cursor-pointer disabled:opacity-50"
                            title="Delete"
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
                            >
                              <path d="M3 6h18" />
                              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 text-xs font-medium rounded capitalize ${
                            log.type === "error"
                              ? "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300"
                              : log.type === "warning"
                              ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300"
                              : log.type === "success"
                              ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
                              : "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                          }`}
                        >
                          {log.type || "info"}
                        </span>
                        <span className="text-xs text-zinc-400">
                          {formatTimestamp(log.timestamp)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Timeline end marker */}
          <div className="relative pl-8 pt-2">
            <div className="absolute left-[5px] top-2 w-2 h-2 rounded-full bg-zinc-300 dark:bg-zinc-600" />
            <p className="text-xs text-zinc-400 italic">Oldest</p>
          </div>
        </div>
      )}
    </section>
  );
}
