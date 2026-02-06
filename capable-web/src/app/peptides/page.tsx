import { redirect } from "next/navigation";
import { getPeptides, AuthError, type Peptide } from "@/lib/api";
import { getServerSession } from "@/lib/session";
import { PeptidesList } from "@/components/PeptidesList";

export default async function PeptidesPage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  let peptides: Peptide[] = [];
  let error: string | null = null;

  try {
    peptides = await getPeptides(session.accessToken);
  } catch (e) {
    if (e instanceof AuthError) {
      redirect("/api/auth/logout");
    }
    error = e instanceof Error ? e.message : "Failed to load peptides";
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Peptides</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          View peptides across experiments
        </p>
      </div>

      {error ? (
        <div className="border border-red-200 dark:border-red-800 rounded-lg p-6 bg-red-50 dark:bg-red-900/20">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      ) : (
        <PeptidesList peptides={peptides} />
      )}
    </div>
  );
}
