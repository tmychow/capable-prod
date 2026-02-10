import { CleavageSiteAnalyzer } from "@/components/CleavageSiteAnalyzer";

export default function PeptideEngineeringPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Peptide Engineering</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Analyze peptide sequences for potential MMP cleavage sites using
          CleavNet.
        </p>
      </div>
      <CleavageSiteAnalyzer />
    </div>
  );
}
