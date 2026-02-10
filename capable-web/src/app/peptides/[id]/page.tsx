import Link from "next/link";
import { redirect } from "next/navigation";
import { Markdown } from "@/components/Markdown";
import { AuthError, formatDateTime, getPeptide } from "@/lib/api";
import { getServerSession } from "@/lib/session";

export default async function PeptideDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  let peptide;
  let error: string | null = null;

  try {
    peptide = await getPeptide(id, session.accessToken);
  } catch (e) {
    if (e instanceof AuthError) {
      redirect("/api/auth/logout");
    }
    error = e instanceof Error ? e.message : "Failed to load peptide";
  }

  if (error || !peptide) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-6">
          <Link
            href="/peptides"
            className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            &larr; Back to Peptides
          </Link>
        </div>
        <div className="border border-red-200 dark:border-red-800 rounded-lg p-6 bg-red-50 dark:bg-red-900/20">
          <p className="text-red-600 dark:text-red-400">
            {error || "Peptide not found"}
          </p>
        </div>
      </div>
    );
  }

  const experiments = (peptide.experiments || []).flatMap((entry) =>
    Object.entries(entry)
  );
  const notes = typeof peptide.notes === "string" ? peptide.notes.trim() : "";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-6">
        <Link
          href="/peptides"
          className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          &larr; Back to Peptides
        </Link>
      </div>

      <div className="space-y-6">
        <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
          <h1 className="text-3xl font-bold font-mono">{peptide.name}</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Peptide ID: {peptide.id}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Created: {formatDateTime(peptide.created_at)}
          </p>
          <div className="mt-4">
            <h2 className="text-sm font-semibold mb-2">Sequence</h2>
            {peptide.sequence ? (
              <p className="text-sm font-mono break-all">{peptide.sequence}</p>
            ) : (
              <p className="text-sm text-zinc-500 italic">No sequence</p>
            )}
          </div>
        </section>

        <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">
            Linked Experiments ({experiments.length})
          </h2>
          {experiments.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {experiments.map(([expName, expId]) => (
                <Link
                  key={`${expId}-${expName}`}
                  href={`/experiments/${expId}`}
                  className="text-sm px-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                >
                  {expName}
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-500 italic">No linked experiments</p>
          )}
        </section>

        <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Notes</h2>
          {notes ? (
            <Markdown>{notes}</Markdown>
          ) : (
            <p className="text-sm text-zinc-500 italic">No notes</p>
          )}
        </section>
      </div>
    </div>
  );
}
