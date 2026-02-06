import Link from "next/link";
import { redirect } from "next/navigation";
import { getExperiments, AuthError, type Experiment } from "@/lib/api";
import { getServerSession } from "@/lib/session";
import { ExperimentRow } from "@/components/ExperimentRow";

export default async function Home() {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  let experiments: Experiment[] = [];
  let error: string | null = null;

  try {
    experiments = await getExperiments(session.accessToken);
  } catch (e) {
    if (e instanceof AuthError) {
      redirect("/api/auth/logout");
    }
    error = e instanceof Error ? e.message : "Failed to load experiments";
  }

  const totalExperiments = experiments.length;
  const runningExperiments = experiments.filter(
    (e) => e.experiment_end === null
  ).length;
  const completedExperiments = experiments.filter(
    (e) => e.experiment_end !== null
  ).length;

  const recentExperiments = experiments.slice(0, 5);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Overview of your experiments and recent activity
        </p>
      </div>

      {error ? (
        <div className="border border-red-200 dark:border-red-800 rounded-lg p-6 bg-red-50 dark:bg-red-900/20 mb-8">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <StatCard title="Total Experiments" value={String(totalExperiments)} />
            <StatCard title="Running" value={String(runningExperiments)} />
            <StatCard title="Completed" value={String(completedExperiments)} />
          </div>

          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Recent Experiments</h2>
              <Link
                href="/experiments"
                className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                View all
              </Link>
            </div>

            {recentExperiments.length === 0 ? (
              <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-12 text-center">
                <p className="text-zinc-500">No experiments yet</p>
              </div>
            ) : (
              <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-zinc-50 dark:bg-zinc-900">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                        Organism
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                        Created
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {recentExperiments.map((experiment) => (
                      <ExperimentRow key={experiment.id} experiment={experiment} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
      <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">{title}</p>
      <p className="text-3xl font-bold">{value}</p>
    </div>
  );
}

