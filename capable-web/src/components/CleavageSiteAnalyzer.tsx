"use client";

import { useState } from "react";
import NProgress from "nprogress";

const VALID_AAS = new Set("ACDEFGHIKLMNPQRSTVWY");

const MMPS = [
  "MMP1", "MMP10", "MMP11", "MMP12", "MMP13", "MMP14", "MMP15", "MMP16",
  "MMP17", "MMP19", "MMP2", "MMP20", "MMP24", "MMP25", "MMP3", "MMP7",
  "MMP8", "MMP9",
];

interface WindowResult {
  header: string;
  sequence: string;
  scores: Record<string, number>;
  uncertainties: Record<string, number>;
}

interface PredictionResponse {
  sequence: string;
  windows: WindowResult[];
}

// The cleavage bond is between positions 5 and 6 of each 10-mer window (P1-P1').
// For window starting at index i in the full sequence, the cleavage site is between
// residues i+4 and i+5 (0-indexed).
const CLEAVAGE_OFFSET = 5;

function getScoreColor(score: number): string {
  if (score >= 2.0) return "bg-red-500 text-white";
  if (score >= 1.0) return "bg-orange-400 text-white";
  if (score >= 0.5) return "bg-yellow-300 text-zinc-900";
  if (score >= 0) return "bg-green-100 text-zinc-700 dark:bg-green-900/30 dark:text-green-300";
  return "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400";
}

function getResidueColor(maxScore: number): string {
  if (maxScore >= 2.0) return "bg-red-500 text-white";
  if (maxScore >= 1.0) return "bg-orange-400 text-white";
  if (maxScore >= 0.5) return "bg-yellow-300 text-zinc-900";
  return "";
}

export function CleavageSiteAnalyzer() {
  const [sequence, setSequence] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PredictionResponse | null>(null);
  const [selectedMmp, setSelectedMmp] = useState<string>("MMP1");

  const cleaned = sequence.replace(/\s/g, "").toUpperCase();
  const invalidChars = [...new Set([...cleaned].filter((ch) => !VALID_AAS.has(ch)))];
  const isValid = cleaned.length >= 10 && invalidChars.length === 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;

    setLoading(true);
    setError(null);
    setResults(null);
    NProgress.start();

    try {
      const res = await fetch("/api/cleavenet/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sequence: cleaned }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Prediction failed");
      }

      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Prediction failed");
    } finally {
      setLoading(false);
      NProgress.done();
    }
  }

  // Compute per-residue max scores for the sequence view
  // Each window i gives cleavage info for the bond between residues i+4 and i+5.
  // We assign that score to residue i+4 (the P1 residue before the cut).
  const residueScores: number[] = results
    ? (() => {
        const scores = new Array(results.sequence.length).fill(-Infinity);
        results.windows.forEach((w, i) => {
          const residueIdx = i + CLEAVAGE_OFFSET - 1; // P1 residue
          const maxScore = Math.max(...MMPS.map((m) => w.scores[m]));
          scores[residueIdx] = Math.max(scores[residueIdx], maxScore);
        });
        return scores;
      })()
    : [];

  // Top cleavage sites
  const topSites = results
    ? results.windows
        .map((w, i) => {
          const maxMmp = MMPS.reduce((best, m) =>
            w.scores[m] > w.scores[best] ? m : best
          );
          return {
            position: i + CLEAVAGE_OFFSET,
            bond: `${results.sequence[i + CLEAVAGE_OFFSET - 1]}${i + CLEAVAGE_OFFSET}-${results.sequence[i + CLEAVAGE_OFFSET]}${i + CLEAVAGE_OFFSET + 1}`,
            maxScore: w.scores[maxMmp],
            maxMmp,
            window: w,
          };
        })
        .sort((a, b) => b.maxScore - a.maxScore)
        .slice(0, 10)
    : [];

  return (
    <div className="space-y-8">
      {/* Input form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            Peptide Sequence
          </label>
          <textarea
            value={sequence}
            onChange={(e) => setSequence(e.target.value)}
            placeholder="Enter amino acid sequence (e.g., GPAGLAGQRGIVGLPGQRGER)..."
            rows={4}
            className="w-full px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
          />
          <div className="mt-2 flex items-center gap-4 text-sm">
            <span className="text-zinc-500">
              {cleaned.length} residues
            </span>
            {invalidChars.length > 0 && (
              <span className="text-red-500">
                Invalid characters: {invalidChars.join(", ")}
              </span>
            )}
            {cleaned.length > 0 && cleaned.length < 10 && invalidChars.length === 0 && (
              <span className="text-amber-500">
                Minimum 10 residues required
              </span>
            )}
            {isValid && (
              <span className="text-green-600 dark:text-green-400">
                {cleaned.length - 9} window{cleaned.length - 9 !== 1 ? "s" : ""} will be analyzed
              </span>
            )}
          </div>
        </div>

        <button
          type="submit"
          disabled={!isValid || loading}
          className="px-6 py-2.5 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 text-sm font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Analyzing..." : "Analyze Cleavage Sites"}
        </button>
      </form>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {results && (
        <>
          {/* Sequence view with colored residues */}
          <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-1">Sequence Overview</h2>
            <p className="text-sm text-zinc-500 mb-4">
              Residues colored by max cleavage z-score across all MMPs at that position.
              Color indicates the P1 residue (before the scissile bond).
            </p>
            <div className="flex flex-wrap gap-0.5 font-mono text-sm">
              {[...results.sequence].map((aa, i) => (
                <div key={i} className="flex flex-col items-center">
                  <span className="text-[10px] text-zinc-400 mb-0.5">
                    {i + 1}
                  </span>
                  <span
                    className={`w-6 h-6 flex items-center justify-center rounded text-xs font-medium ${
                      residueScores[i] > -Infinity
                        ? getResidueColor(residueScores[i])
                        : ""
                    }`}
                  >
                    {aa}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-4 text-xs text-zinc-500">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-red-500 inline-block" /> z &ge; 2.0
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-orange-400 inline-block" /> z &ge; 1.0
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-yellow-300 inline-block" /> z &ge; 0.5
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-zinc-100 dark:bg-zinc-800 inline-block border border-zinc-200 dark:border-zinc-700" /> z &lt; 0.5
              </span>
            </div>
          </section>

          {/* Top cleavage sites */}
          <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Top Cleavage Sites</h2>
            {topSites.length === 0 ? (
              <p className="text-sm text-zinc-500">No cleavage sites found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-700">
                      <th className="text-left py-2 pr-4 font-medium text-zinc-500">Bond</th>
                      <th className="text-left py-2 pr-4 font-medium text-zinc-500">Position</th>
                      <th className="text-left py-2 pr-4 font-medium text-zinc-500">Window</th>
                      <th className="text-left py-2 pr-4 font-medium text-zinc-500">Top MMP</th>
                      <th className="text-right py-2 font-medium text-zinc-500">Z-Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topSites.map((site, i) => (
                      <tr
                        key={i}
                        className="border-b border-zinc-100 dark:border-zinc-800"
                      >
                        <td className="py-2 pr-4 font-mono font-medium">
                          {site.bond}
                        </td>
                        <td className="py-2 pr-4 text-zinc-500">
                          {site.position}&#8211;{site.position + 1}
                        </td>
                        <td className="py-2 pr-4 font-mono text-zinc-500">
                          {site.window.sequence}
                        </td>
                        <td className="py-2 pr-4">{site.maxMmp}</td>
                        <td className="py-2 text-right">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getScoreColor(
                              site.maxScore
                            )}`}
                          >
                            {site.maxScore.toFixed(2)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Heatmap by MMP */}
          <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Scores by MMP</h2>
              <select
                value={selectedMmp}
                onChange={(e) => setSelectedMmp(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {MMPS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-700">
                    <th className="text-left py-2 pr-4 font-medium text-zinc-500">Position</th>
                    <th className="text-left py-2 pr-4 font-medium text-zinc-500">Window</th>
                    <th className="text-right py-2 pr-4 font-medium text-zinc-500">Z-Score</th>
                    <th className="text-right py-2 font-medium text-zinc-500">Uncertainty</th>
                  </tr>
                </thead>
                <tbody>
                  {results.windows.map((w, i) => {
                    const score = w.scores[selectedMmp];
                    const unc = w.uncertainties[selectedMmp];
                    return (
                      <tr
                        key={i}
                        className="border-b border-zinc-100 dark:border-zinc-800"
                      >
                        <td className="py-2 pr-4 text-zinc-500">
                          {i + CLEAVAGE_OFFSET}&#8211;{i + CLEAVAGE_OFFSET + 1}
                        </td>
                        <td className="py-2 pr-4 font-mono text-zinc-500">
                          {w.sequence.slice(0, CLEAVAGE_OFFSET - 1)}
                          <span className="font-bold text-zinc-900 dark:text-zinc-100 border-b-2 border-red-400">
                            {w.sequence[CLEAVAGE_OFFSET - 1]}
                            {w.sequence[CLEAVAGE_OFFSET]}
                          </span>
                          {w.sequence.slice(CLEAVAGE_OFFSET + 1)}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getScoreColor(
                              score
                            )}`}
                          >
                            {score.toFixed(2)}
                          </span>
                        </td>
                        <td className="py-2 text-right text-zinc-400">
                          &plusmn;{unc.toFixed(3)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
