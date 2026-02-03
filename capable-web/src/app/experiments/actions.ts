"use server";

import { createExperiment, updateExperiment, deleteExperiment, type ExperimentInput } from "@/lib/api";
import { getServerSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createExperimentAction(data: ExperimentInput) {
  const session = await getServerSession();
  if (!session) {
    throw new Error("Not authenticated");
  }

  await createExperiment(data, session.accessToken);
  revalidatePath("/experiments");
}

export async function updateExperimentAction(id: string, data: Partial<ExperimentInput>) {
  const session = await getServerSession();
  if (!session) {
    throw new Error("Not authenticated");
  }

  await updateExperiment(id, data, session.accessToken);
  revalidatePath("/experiments");
  revalidatePath(`/experiments/${id}`);
}

export async function deleteExperimentAction(id: string) {
  const session = await getServerSession();
  if (!session) {
    throw new Error("Not authenticated");
  }

  await deleteExperiment(id, session.accessToken);
  revalidatePath("/experiments");
  redirect("/experiments");
}

export async function updateLogsAction(id: string, logs: Record<string, unknown>[]) {
  const session = await getServerSession();
  if (!session) {
    throw new Error("Not authenticated");
  }

  await updateExperiment(id, { logs }, session.accessToken);
  revalidatePath(`/experiments/${id}`);
}
