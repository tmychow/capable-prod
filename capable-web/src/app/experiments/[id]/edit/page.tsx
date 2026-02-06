import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/session";
import { getExperiment, AuthError } from "@/lib/api";
import ExperimentForm from "@/components/ExperimentForm";
import { updateExperimentAction } from "../../actions";
import type { ExperimentInput } from "@/lib/api";

export default async function EditExperimentPage({
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
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
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

  async function handleUpdate(data: ExperimentInput) {
    "use server";
    await updateExperimentAction(id, data);
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-6">
        <Link
          href={`/experiments/${id}`}
          className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          &larr; Back to Experiment
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Edit Experiment</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Update experiment details
        </p>
      </div>

      <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
        <ExperimentForm
          experiment={experiment}
          onSubmit={handleUpdate}
          submitLabel="Save Changes"
        />
      </div>
    </div>
  );
}
