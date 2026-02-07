"use client";

import { useState, useEffect, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface OldenLabsChartProps {
  studyId: number;
  groupIds?: string[];
}

const BIN_OPTIONS = [
  { value: "minutes10", label: "10 Min" },
  { value: "hour1", label: "1 Hour" },
  { value: "week1", label: "1 Week" },
  { value: "month1", label: "1 Month" },
];

// Softer, more muted palette
const COLORS = [
  "#6b8ceb", "#e87272", "#5db87a", "#d4a94e", "#a876d4",
  "#4bb8c4", "#d4658a", "#8fbf5a", "#c47ad4", "#d4885a",
];

interface OldenLabsDataset {
  label: string;
  data: (number | null)[];
}

interface OldenLabsChartData {
  chart_number: number;
  name: string;
  typeName: string;
  labels: string[];
  datasets: OldenLabsDataset[];
  yAxis: string;
  description: string;
  subtitle: string;
}

interface ChartDataPoint {
  time: string;
  [key: string]: string | number | null;
}

function transformChart(chart: OldenLabsChartData): { data: ChartDataPoint[]; seriesKeys: string[] } {
  const seriesKeys = chart.datasets.map((ds) => ds.label);

  const data: ChartDataPoint[] = chart.labels.map((time, i) => {
    const point: ChartDataPoint = { time };
    for (const ds of chart.datasets) {
      point[ds.label] = ds.data[i] ?? null;
    }
    return point;
  });

  return { data, seriesKeys };
}

function formatTime(time: string): string {
  try {
    const d = new Date(time);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return time;
  }
}

/* ── ANOVA helpers ────────────────────────────────────────────────── */

function lnGamma(z: number): number {
  if (z <= 0) return Infinity;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  }
  z -= 1;
  let x = c[0];
  for (let i = 1; i < 9; i++) x += c[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function betaCf(a: number, b: number, x: number): number {
  const MAXIT = 200, EPS = 3e-14, FPMIN = 1e-30;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = -((a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function regIncBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  if (x < (a + 1) / (a + b + 2)) return (bt * betaCf(a, b, x)) / a;
  return 1 - (bt * betaCf(b, a, 1 - x)) / b;
}

function fDistCdf(x: number, d1: number, d2: number): number {
  if (x <= 0) return 0;
  return regIncBeta((d1 * x) / (d1 * x + d2), d1 / 2, d2 / 2);
}

/**
 * One-way ANOVA across groups for a single chart.
 * `groupData` is an array (one per group) of number arrays (all valid observations for that group).
 */
function computeAnova(groupData: number[][]): { pValue: number; fStat: number } | null {
  const groups = groupData.filter((g) => g.length > 0);
  const k = groups.length;
  if (k < 2) return null;

  const N = groups.reduce((s, g) => s + g.length, 0);
  if (N <= k) return null;

  const grandMean = groups.reduce((s, g) => s + g.reduce((a, v) => a + v, 0), 0) / N;

  let ssBetween = 0;
  let ssWithin = 0;
  for (const g of groups) {
    const gMean = g.reduce((a, v) => a + v, 0) / g.length;
    ssBetween += g.length * (gMean - grandMean) ** 2;
    for (const v of g) ssWithin += (v - gMean) ** 2;
  }

  const dfBetween = k - 1;
  const dfWithin = N - k;
  if (dfWithin <= 0 || ssWithin === 0) return null;

  const fStat = (ssBetween / dfBetween) / (ssWithin / dfWithin);
  const pValue = 1 - fDistCdf(fStat, dfBetween, dfWithin);

  return { fStat, pValue };
}

function formatPValue(p: number): string {
  if (p < 0.001) return "p < 0.001 (***)";
  if (p < 0.01) return `p = ${p.toFixed(4)} (**)`;
  if (p < 0.05) return `p = ${p.toFixed(3)} (*)`;
  return `p = ${p.toFixed(3)}`;
}

/* ── end ANOVA helpers ───────────────────────────────────────────── */

const INITIAL_VISIBLE = 5;

// Sort so "Cage in rack" goes to the bottom
function sortCharts(charts: OldenLabsChartData[]): OldenLabsChartData[] {
  return [...charts].sort((a, b) => {
    const aBottom = a.name.toLowerCase().includes("cage in rack") ? 1 : 0;
    const bBottom = b.name.toLowerCase().includes("cage in rack") ? 1 : 0;
    return aBottom - bBottom;
  });
}

export function OldenLabsChart({ studyId, groupIds = [] }: OldenLabsChartProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [charts, setCharts] = useState<OldenLabsChartData[] | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  // Map from chart_number -> ANOVA result
  const [anovaResults, setAnovaResults] = useState<Record<number, { pValue: number; fStat: number } | null>>({});
  const [anovaLoading, setAnovaLoading] = useState(false);

  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const [startTime, setStartTime] = useState(twoDaysAgo.toISOString().slice(0, 16));
  const [endTime, setEndTime] = useState(now.toISOString().slice(0, 16));
  const [groupBy, setGroupBy] = useState("hour1");

  const loadCharts = useCallback(async (start: string, end: string, bin: string) => {
    setError(null);
    setLoading(true);
    setAnovaResults({});

    try {
      const params = new URLSearchParams({
        study_id: String(studyId),
        start_time: start,
        end_time: end,
        group_by: bin,
        chart_type: "LineChart",
        error_bar_type: "SEM",
      });

      const res = await fetch(`/api/oldenlabs/chart?${params}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch chart data");
      }

      const chartArray: OldenLabsChartData[] = Array.isArray(data) ? data : [data];
      if (chartArray.length === 0) {
        setError("No chart data available for the selected time range.");
        return;
      }

      const sorted = sortCharts(chartArray);
      setCharts(sorted);
      setVisibleCount(INITIAL_VISIBLE);

      // Fetch per-group data for ANOVA if we have group IDs
      if (groupIds.length >= 2) {
        setAnovaLoading(true);
        try {
          const groupChartResponses = await Promise.all(
            groupIds.map(async (gid) => {
              const gParams = new URLSearchParams({
                study_id: String(studyId),
                group_id: gid,
                start_time: start,
                end_time: end,
                group_by: bin,
                chart_type: "LineChart",
                error_bar_type: "SEM",
              });
              const gRes = await fetch(`/api/oldenlabs/chart-group?${gParams}`);
              if (!gRes.ok) return null;
              const gData = await gRes.json();
              return Array.isArray(gData) ? gData as OldenLabsChartData[] : [gData] as OldenLabsChartData[];
            })
          );

          // Build: chart_number -> array of number[] (one per group)
          // Each group's data is all non-null values across all datasets and time points
          const chartNumbers = new Set(sorted.map((c) => c.chart_number));
          const results: Record<number, { pValue: number; fStat: number } | null> = {};

          for (const cn of chartNumbers) {
            const groupDataArrays: number[][] = [];

            for (const groupCharts of groupChartResponses) {
              if (!groupCharts) {
                groupDataArrays.push([]);
                continue;
              }
              const chart = groupCharts.find((c) => c.chart_number === cn);
              if (!chart) {
                groupDataArrays.push([]);
                continue;
              }
              // Pool all non-null data points across all datasets (cages) in this group
              const values: number[] = [];
              for (const ds of chart.datasets) {
                for (const v of ds.data) {
                  if (v !== null && !isNaN(v)) values.push(v);
                }
              }
              groupDataArrays.push(values);
            }

            results[cn] = computeAnova(groupDataArrays);
          }

          setAnovaResults(results);
        } catch (e) {
          console.error("ANOVA computation failed:", e);
        } finally {
          setAnovaLoading(false);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load chart");
    } finally {
      setLoading(false);
    }
  }, [studyId, groupIds]);

  // Auto-load on mount
  useEffect(() => {
    loadCharts(startTime, endTime, groupBy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
      <h2 className="text-lg font-semibold mb-4">Olden Labs Charts</h2>

      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="chartStart" className="block text-xs font-medium mb-1 text-zinc-400">
              Start
            </label>
            <input
              id="chartStart"
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          <div>
            <label htmlFor="chartEnd" className="block text-xs font-medium mb-1 text-zinc-400">
              End
            </label>
            <input
              id="chartEnd"
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          <div>
            <label htmlFor="chartBin" className="block text-xs font-medium mb-1 text-zinc-400">
              Bin Time
            </label>
            <select
              id="chartBin"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              {BIN_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={() => loadCharts(startTime, endTime, groupBy)}
          disabled={loading || !startTime || !endTime}
          className="w-full px-4 py-2 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 text-sm font-medium disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading...
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3v18h18" />
                <path d="m19 9-5 5-4-4-3 3" />
              </svg>
              Load Charts
            </>
          )}
        </button>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {charts && (() => {
          const visible = charts.slice(0, visibleCount);
          const remaining = charts.length - visibleCount;
          return (
            <>
              {visible.map((chart) => {
                const { data, seriesKeys } = transformChart(chart);
                const anova = anovaResults[chart.chart_number];
                return (
                  <div key={chart.chart_number} className="mt-8 pt-6 border-t border-zinc-100 dark:border-zinc-800/60">
                    <div className="mb-4">
                      <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{chart.name}</h3>
                      {chart.subtitle && (
                        <p className="text-xs text-zinc-400 mt-0.5">{chart.subtitle}</p>
                      )}
                    </div>
                    <ResponsiveContainer width="100%" height={320}>
                      <LineChart data={data} margin={{ top: 8, right: 24, left: 12, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" strokeOpacity={0.4} />
                        <XAxis
                          dataKey="time"
                          tickFormatter={formatTime}
                          tick={{ fontSize: 10, fill: "#a1a1aa", fontFamily: "system-ui, sans-serif" }}
                          tickLine={{ stroke: "#d4d4d8", strokeOpacity: 0.4 }}
                          axisLine={{ stroke: "#d4d4d8", strokeOpacity: 0.4 }}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: "#a1a1aa", fontFamily: "system-ui, sans-serif" }}
                          tickLine={{ stroke: "#d4d4d8", strokeOpacity: 0.4 }}
                          axisLine={{ stroke: "#d4d4d8", strokeOpacity: 0.4 }}
                          label={chart.yAxis ? { value: chart.yAxis, angle: -90, position: "insideLeft", style: { fontSize: 10, fill: "#a1a1aa", fontFamily: "system-ui, sans-serif" }, offset: 4 } : undefined}
                        />
                        <Tooltip
                          labelFormatter={(label) => formatTime(String(label))}
                          contentStyle={{
                            backgroundColor: "rgba(255, 255, 255, 0.96)",
                            border: "1px solid #e4e4e7",
                            borderRadius: "8px",
                            fontSize: "11px",
                            fontFamily: "system-ui, sans-serif",
                            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                            padding: "8px 12px",
                          }}
                          labelStyle={{ color: "#71717a", fontSize: "10px", marginBottom: "4px" }}
                          formatter={(value) => typeof value === "number" ? value.toFixed(2) : "N/A"}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: "11px", fontFamily: "system-ui, sans-serif", color: "#71717a" }}
                        />
                        {seriesKeys.map((key, i) => (
                          <Line
                            key={key}
                            type="monotone"
                            dataKey={key}
                            name={key}
                            stroke={COLORS[i % COLORS.length]}
                            strokeWidth={1.5}
                            strokeOpacity={0.75}
                            dot={false}
                            connectNulls={false}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                    <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                      {anovaLoading ? (
                        <span className="italic">Computing ANOVA...</span>
                      ) : anova ? (
                        <span>
                          Chart ANOVA p-value:{" "}
                          <span className={anova.pValue < 0.05 ? "font-semibold text-zinc-700 dark:text-zinc-200" : ""}>
                            {formatPValue(anova.pValue)}
                          </span>
                          <span className="ml-2 text-zinc-400">F = {anova.fStat.toFixed(2)}</span>
                        </span>
                      ) : groupIds.length < 2 ? (
                        <span className="italic">ANOVA requires at least 2 groups</span>
                      ) : (
                        <span className="italic">ANOVA: insufficient data</span>
                      )}
                    </div>
                  </div>
                );
              })}
              {remaining > 0 && (
                <button
                  onClick={() => setVisibleCount((c) => c + INITIAL_VISIBLE)}
                  className="w-full mt-4 px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm font-medium text-zinc-600 dark:text-zinc-400 cursor-pointer"
                >
                  Show {Math.min(remaining, INITIAL_VISIBLE)} more chart{Math.min(remaining, INITIAL_VISIBLE) > 1 ? "s" : ""}
                </button>
              )}
            </>
          );
        })()}
      </div>
    </section>
  );
}
