import Link from "next/link";
import { redirect } from "next/navigation";
import { getExperiment, AuthError } from "@/lib/api";
import { getServerSession } from "@/lib/session";
import { ExperimentContent } from "@/components/ExperimentContent";

export default async function ExperimentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  let experiment;
  let error: string | null = null;

  try {
    experiment = await getExperiment(id, session.accessToken);
  } catch (e) {
    if (e instanceof AuthError) {
      redirect("/api/auth/logout");
    }
    error = e instanceof Error ? e.message : "Failed to load experiment";
  }

  if (error || !experiment) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-6">
          <Link
            href="/experiments"
            className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            &larr; Back to Experiments
          </Link>
        </div>
        <div className="border border-red-200 dark:border-red-800 rounded-lg p-6 bg-red-50 dark:bg-red-900/20">
          <p className="text-red-600 dark:text-red-400">
            {error || "Experiment not found"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-6">
        <Link
          href="/experiments"
          className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          &larr; Back to Experiments
        </Link>
      </div>

      <ExperimentContent experiment={experiment} />
    </div>
  );
}
