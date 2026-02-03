"use client";

import { useState, useRef, useEffect } from "react";

interface PeptideSelectProps {
  value: string[];
  onChange: (peptides: string[]) => void;
  availablePeptides: string[];
  onAddPeptide: (peptide: string) => void;
}

export function PeptideSelect({
  value,
  onChange,
  availablePeptides,
  onAddPeptide,
}: PeptideSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [newPeptide, setNewPeptide] = useState("");
  const [showAddInput, setShowAddInput] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowAddInput(false);
        setNewPeptide("");
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const togglePeptide = (peptide: string) => {
    if (value.includes(peptide)) {
      onChange(value.filter((p) => p !== peptide));
    } else {
      onChange([...value, peptide]);
    }
  };

  const handleAddPeptide = () => {
    const trimmed = newPeptide.trim().toUpperCase();
    if (trimmed && !availablePeptides.includes(trimmed)) {
      onAddPeptide(trimmed);
      onChange([...value, trimmed]);
    } else if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setNewPeptide("");
    setShowAddInput(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddPeptide();
    } else if (e.key === "Escape") {
      setShowAddInput(false);
      setNewPeptide("");
    }
  };

  const removePeptide = (peptide: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(value.filter((p) => p !== peptide));
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="w-full min-h-[42px] px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer flex flex-wrap gap-1.5 items-center"
      >
        {value.length === 0 ? (
          <span className="text-zinc-400">Select peptides...</span>
        ) : (
          value.map((peptide) => (
            <span
              key={peptide}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-sm font-mono bg-zinc-100 dark:bg-zinc-700 rounded"
            >
              {peptide}
              <button
                type="button"
                onClick={(e) => removePeptide(peptide, e)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
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
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </span>
          ))
        )}
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
          className={`ml-auto text-zinc-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg max-h-60 overflow-auto">
          {availablePeptides.length === 0 && !showAddInput ? (
            <div className="p-3 text-sm text-zinc-500 text-center">
              No peptides available. Add one below.
            </div>
          ) : (
            <div className="py-1">
              {availablePeptides.map((peptide) => (
                <label
                  key={peptide}
                  className="flex items-center gap-3 px-4 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-700 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={value.includes(peptide)}
                    onChange={() => togglePeptide(peptide)}
                    className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-600 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <span className="font-mono text-sm">{peptide}</span>
                </label>
              ))}
            </div>
          )}

          <div className="border-t border-zinc-200 dark:border-zinc-700">
            {showAddInput ? (
              <div className="p-2 flex gap-2">
                <input
                  type="text"
                  value={newPeptide}
                  onChange={(e) => setNewPeptide(e.target.value.toUpperCase())}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter peptide sequence"
                  autoFocus
                  className="flex-1 px-3 py-1.5 text-sm font-mono rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={handleAddPeptide}
                  disabled={!newPeptide.trim()}
                  className="px-3 py-1.5 text-sm rounded bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                >
                  Add
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddInput(true)}
                className="w-full px-4 py-2 text-sm text-left text-blue-600 dark:text-blue-400 hover:bg-zinc-50 dark:hover:bg-zinc-700 flex items-center gap-2 cursor-pointer"
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
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add new peptide
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
