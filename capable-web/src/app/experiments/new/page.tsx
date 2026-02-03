import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/session";
import ExperimentForm from "@/components/ExperimentForm";
import { createExperimentAction } from "../actions";
import type { ExperimentInput } from "@/lib/api";

export default async function NewExperimentPage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  async function handleCreate(data: ExperimentInput) {
    "use server";
    await createExperimentAction(data);
  }

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

      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">New Experiment</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Create a new experiment
        </p>
      </div>

      <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
        <ExperimentForm onSubmit={handleCreate} submitLabel="Create Experiment" />
      </div>
    </div>
  );
}
