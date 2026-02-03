"use client";

import { useRouter } from "next/navigation";
import NProgress from "nprogress";
import { formatDate, type Experiment } from "@/lib/api";

export function ExperimentRow({ experiment }: { experiment: Experiment }) {
  const router = useRouter();
  const isCompleted = experiment.experiment_end !== null;

  const statusStyles = {
    running: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  };

  return (
    <tr
      onClick={() => {
        NProgress.start();
        router.push(`/experiments/${experiment.id}`);
      }}
      className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 cursor-pointer"
    >
      <td className="px-6 py-4 whitespace-nowrap">
        <span className="font-medium">{experiment.name}</span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500">
        {experiment.organism_type || "—"}
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span
          className={`px-2 py-1 text-xs font-medium rounded-full ${
            statusStyles[isCompleted ? "completed" : "running"]
          }`}
        >
          {isCompleted ? "completed" : "running"}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500">
        {formatDate(experiment.row_created_at)}
      </td>
    </tr>
  );
}
