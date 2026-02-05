import Link from "next/link";
import { redirect } from "next/navigation";
import { getExperiments, AuthError, type Experiment } from "@/lib/api";
import { getServerSession, clearServerSession } from "@/lib/session";
import { OldenLabsLogin } from "@/components/OldenLabsLogin";
import { ExperimentsList } from "@/components/ExperimentsList";

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
    if (e instanceof AuthError) {
      await clearServerSession();
      redirect("/login");
    }
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

      <OldenLabsLogin />

      <div className="mt-6" />

      {error ? (
        <div className="border border-red-200 dark:border-red-800 rounded-lg p-6 bg-red-50 dark:bg-red-900/20">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      ) : (
        <ExperimentsList experiments={experiments} />
      )}
    </div>
  );
}
