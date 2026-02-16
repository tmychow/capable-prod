"use client";

import { useState } from "react";
import NProgress from "nprogress";

const VALID_AAS = new Set("ACDEFGHIKLMNPQRSTVWY");

interface BondResult {
  position: number;
  p1: string;
  p1_prime: string;
  scores: Record<string, number>;
}

interface PredictionResponse {
  sequence: string;
  proteases: string[];
  bonds: BondResult[];
}

function getProbColor(prob: number): string {
  if (prob >= 0.8) return "bg-red-500 text-white";
  if (prob >= 0.5) return "bg-orange-400 text-white";
  if (prob >= 0.3) return "bg-yellow-300 text-zinc-900";
  if (prob >= 0.1) return "bg-green-100 text-zinc-700 dark:bg-green-900/30 dark:text-green-300";
  return "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400";
}

function getResidueColor(maxProb: number): string {
  if (maxProb >= 0.8) return "bg-red-500 text-white";
  if (maxProb >= 0.5) return "bg-orange-400 text-white";
  if (maxProb >= 0.3) return "bg-yellow-300 text-zinc-900";
  return "";
}

export function CleavageSiteAnalyzer() {
  const [sequence, setSequence] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PredictionResponse | null>(null);
  const [selectedProtease, setSelectedProtease] = useState<string>("");

  const cleaned = sequence.replace(/\s/g, "").toUpperCase();
  const invalidChars = [...new Set([...cleaned].filter((ch) => !VALID_AAS.has(ch)))];
  const isValid = cleaned.length >= 2 && cleaned.length <= 200 && invalidChars.length === 0;

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
      if (data.proteases?.length > 0 && !selectedProtease) {
        setSelectedProtease(data.proteases[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Prediction failed");
    } finally {
      setLoading(false);
      NProgress.done();
    }
  }

  const proteases = results?.proteases ?? [];

  // Per-residue max probability across all proteases (assigned to P1 residue)
  const residueScores: number[] = results
    ? (() => {
        const scores = new Array(results.sequence.length).fill(0);
        results.bonds.forEach((bond) => {
          const idx = bond.position - 1; // 0-indexed P1 residue
          const maxProb = Math.max(...Object.values(bond.scores));
          scores[idx] = Math.max(scores[idx], maxProb);
        });
        return scores;
      })()
    : [];

  // Top cleavage sites ranked by max probability
  const topSites = results
    ? results.bonds
        .map((bond) => {
          const maxProtease = proteases.reduce((best, p) =>
            bond.scores[p] > bond.scores[best] ? p : best
          );
          return {
            position: bond.position,
            bondLabel: `${bond.p1}${bond.position}-${bond.p1_prime}${bond.position + 1}`,
            maxProb: bond.scores[maxProtease],
            maxProtease,
            bond,
          };
        })
        .sort((a, b) => b.maxProb - a.maxProb)
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
            placeholder="Enter amino acid sequence (e.g., KGLDVDSLVIEHIQVNKAPK)..."
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
            {cleaned.length > 0 && cleaned.length < 2 && invalidChars.length === 0 && (
              <span className="text-amber-500">
                Minimum 2 residues required
              </span>
            )}
            {cleaned.length > 200 && (
              <span className="text-amber-500">
                Maximum 200 residues
              </span>
            )}
            {isValid && (
              <span className="text-green-600 dark:text-green-400">
                {cleaned.length - 1} bond{cleaned.length - 1 !== 1 ? "s" : ""} will be analyzed
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
              Residues colored by max cleavage probability across all proteases.
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
                      getResidueColor(residueScores[i])
                    }`}
                  >
                    {aa}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-4 text-xs text-zinc-500">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-red-500 inline-block" /> p &ge; 0.8
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-orange-400 inline-block" /> p &ge; 0.5
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-yellow-300 inline-block" /> p &ge; 0.3
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-zinc-100 dark:bg-zinc-800 inline-block border border-zinc-200 dark:border-zinc-700" /> p &lt; 0.3
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
                      <th className="text-left py-2 pr-4 font-medium text-zinc-500">Top Protease</th>
                      <th className="text-right py-2 font-medium text-zinc-500">Probability</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topSites.map((site, i) => (
                      <tr
                        key={i}
                        className="border-b border-zinc-100 dark:border-zinc-800"
                      >
                        <td className="py-2 pr-4 font-mono font-medium">
                          {site.bondLabel}
                        </td>
                        <td className="py-2 pr-4 text-zinc-500">
                          {site.position}&#8211;{site.position + 1}
                        </td>
                        <td className="py-2 pr-4">{site.maxProtease}</td>
                        <td className="py-2 text-right">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getProbColor(
                              site.maxProb
                            )}`}
                          >
                            {site.maxProb.toFixed(3)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Per-protease detail */}
          <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Scores by Protease</h2>
              <select
                value={selectedProtease}
                onChange={(e) => setSelectedProtease(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {proteases.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-700">
                    <th className="text-left py-2 pr-4 font-medium text-zinc-500">Position</th>
                    <th className="text-left py-2 pr-4 font-medium text-zinc-500">Bond</th>
                    <th className="text-right py-2 font-medium text-zinc-500">Probability</th>
                  </tr>
                </thead>
                <tbody>
                  {results.bonds.map((bond, i) => {
                    const prob = bond.scores[selectedProtease] ?? 0;
                    return (
                      <tr
                        key={i}
                        className="border-b border-zinc-100 dark:border-zinc-800"
                      >
                        <td className="py-2 pr-4 text-zinc-500">
                          {bond.position}&#8211;{bond.position + 1}
                        </td>
                        <td className="py-2 pr-4 font-mono">
                          {bond.p1}
                          <span className="font-bold text-zinc-900 dark:text-zinc-100 border-b-2 border-red-400">
                            |
                          </span>
                          {bond.p1_prime}
                        </td>
                        <td className="py-2 text-right">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getProbColor(
                              prob
                            )}`}
                          >
                            {prob.toFixed(3)}
                          </span>
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
