const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface Experiment {
  id: string;
  row_created_at: string;
  name: string;
  description: string | null;
  organism_type: string | null;
  parameters: Record<string, unknown> | null;
  logs: Record<string, unknown>[] | null;
  peptides: string[] | null;
  experiment_start: string | null;
  experiment_end: string | null;
  links: Record<string, unknown> | null;
  olden_labs_study_id: number | null;
}

export async function getExperiments(token?: string): Promise<Experiment[]> {
  const headers: HeadersInit = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}/experiments`, {
    cache: "no-store",
    headers,
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error("Please log in to view experiments");
    }
    throw new Error("Failed to fetch experiments");
  }
  return res.json();
}

export async function getExperiment(id: string, token?: string): Promise<Experiment> {
  const headers: HeadersInit = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}/experiments/${id}`, {
    cache: "no-store",
    headers,
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error("Please log in to view this experiment");
    }
    throw new Error("Failed to fetch experiment");
  }
  return res.json();
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatTime(timeString: string | null): string {
  if (!timeString) return "—";
  return timeString;
}

export interface ExperimentInput {
  name: string;
  description?: string | null;
  organism_type?: string | null;
  parameters?: Record<string, unknown> | null;
  logs?: Record<string, unknown>[] | null;
  peptides?: string[] | null;
  experiment_start?: string | null;
  experiment_end?: string | null;
  links?: Record<string, unknown> | null;
  olden_labs_study_id?: string | null;
}

async function parseErrorResponse(res: Response, fallback: string): Promise<string> {
  try {
    const text = await res.text();
    const json = JSON.parse(text);
    return json.detail || fallback;
  } catch {
    return fallback;
  }
}

export async function createExperiment(
  data: ExperimentInput,
  token: string
): Promise<Experiment> {
  const res = await fetch(`${API_BASE_URL}/experiments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const message = await parseErrorResponse(res, "Failed to create experiment");
    throw new Error(message);
  }
  return res.json();
}

export async function updateExperiment(
  id: string,
  data: Partial<ExperimentInput>,
  token: string
): Promise<Experiment> {
  const res = await fetch(`${API_BASE_URL}/experiments/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const message = await parseErrorResponse(res, "Failed to update experiment");
    throw new Error(message);
  }
  return res.json();
}

export async function deleteExperiment(id: string, token: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/experiments/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const message = await parseErrorResponse(res, "Failed to delete experiment");
    throw new Error(message);
  }
}
