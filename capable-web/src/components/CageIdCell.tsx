"use client";

import { useState } from "react";

interface CageIdCellProps {
  value: string[];
  onChange: (cageIds: string[]) => void;
  readOnly?: boolean;
}

export function CageIdCell({ value, onChange, readOnly = false }: CageIdCellProps) {
  const [input, setInput] = useState("");

  const addCageId = () => {
    const trimmed = input.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInput("");
  };

  const removeCageId = (id: string) => {
    onChange(value.filter((v) => v !== id));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addCageId();
    }
  };

  if (readOnly) {
    return (
      <div className="flex flex-wrap gap-1">
        {value.length === 0 ? (
          <span className="text-zinc-400">—</span>
        ) : (
          value.map((id) => (
            <span
              key={id}
              className="inline-block px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded-full"
            >
              {id}
            </span>
          ))
        )}
      </div>
    );
  }

  return (
    <div className="min-w-[180px]">
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-1.5">
        {value.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {value.map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded-full"
              >
                {id}
                <button
                  type="button"
                  onClick={() => removeCageId(id)}
                  className="text-blue-400 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-200 transition-colors cursor-pointer"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={value.length === 0 ? "Add cage ID..." : "Add another..."}
            className="flex-1 px-1.5 py-1 text-xs bg-transparent focus:outline-none min-w-[70px] placeholder:text-zinc-400"
          />
          <button
            type="button"
            onClick={addCageId}
            disabled={!input.trim()}
            className="p-1 rounded-md text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-900/30 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-400 transition-colors cursor-pointer disabled:cursor-default"
            title="Add cage ID"
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
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
