import Link from "next/link";
import { redirect } from "next/navigation";
import { getExperiments, formatDate, type Experiment } from "@/lib/api";
import { getServerSession } from "@/lib/session";
import { Markdown } from "@/components/Markdown";

export default async function ExperimentsPage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  let experiments: Experiment[] = [];
  let error: string | null = null;

  try {
    experiments = await getExperiments(session.accessToken);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load experiments";
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Experiments</h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Manage and track your experiments
          </p>
        </div>
        <Link
          href="/experiments/new"
          className="px-4 py-2 text-sm font-medium rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 cursor-pointer"
        >
          New Experiment
        </Link>
      </div>

      {error ? (
        <div className="border border-red-200 dark:border-red-800 rounded-lg p-6 bg-red-50 dark:bg-red-900/20">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      ) : experiments.length === 0 ? (
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-12 text-center">
          <p className="text-zinc-500">No experiments yet</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {experiments.map((experiment) => (
            <ExperimentCard key={experiment.id} experiment={experiment} />
          ))}
        </div>
      )}
    </div>
  );
}

function ExperimentCard({ experiment }: { experiment: Experiment }) {
  const hasEndTime = experiment.experiment_end !== null;

  return (
    <Link
      href={`/experiments/${experiment.id}`}
      className="block border border-zinc-200 dark:border-zinc-800 rounded-lg p-6 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
    >
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-lg font-semibold">{experiment.name}</h3>
        <span
          className={`px-2 py-1 text-xs font-medium rounded-full ${
            hasEndTime
              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
              : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
          }`}
        >
          {hasEndTime ? "completed" : "running"}
        </span>
      </div>
      <div className="text-zinc-600 dark:text-zinc-400 mb-2 line-clamp-2">
        {experiment.description ? (
          <Markdown>{experiment.description}</Markdown>
        ) : (
          <span className="italic text-zinc-500">No description</span>
        )}
      </div>
      {experiment.organism_type && (
        <p className="text-sm text-zinc-500 mb-2">
          Organism: {experiment.organism_type}
        </p>
      )}
      <p className="text-sm text-zinc-500">
        Created {formatDate(experiment.row_created_at)}
      </p>
    </Link>
  );
}
