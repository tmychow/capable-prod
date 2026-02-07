const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Custom error class for authentication failures
export class AuthError extends Error {
  constructor(message: string = "Authentication required") {
    super(message);
    this.name = "AuthError";
  }
}

export type GeneratedLink = Record<string, string>;

export interface Experiment {
  id: string;
  row_created_at: string;
  name: string;
  description: string | null;
  organism_type: string | null;
  groups: ExperimentGroup[] | null;
  additional_parameters: Record<string, unknown> | null;
  logs: Record<string, unknown>[] | null;
  peptides: string[] | null;
  experiment_start: string | null;
  experiment_end: string | null;
  links: Record<string, unknown> | null;
  olden_labs_study_id: number | null;
  generated_links: GeneratedLink[] | null;
}

export interface ExperimentGroup {
  name: string;
  group_id: string;
  group_name: string;
  num_cages: number | null;
  num_animals: number | null;
  cage_ids: string[];
  treatment: string;
  species: string;
  strain: string;
  dob: string;
  sex: string;
}

export interface Peptide {
  id: number;
  created_at: string;
  name: string;
  sequence: string;
  experiments: Record<string, string>[];
}

export async function getPeptides(token?: string): Promise<Peptide[]> {
  const headers: HeadersInit = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}/peptides`, {
    cache: "no-store",
    headers,
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new AuthError();
    }
    throw new Error("Failed to fetch peptides");
  }
  return res.json();
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
      throw new AuthError();
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
      throw new AuthError();
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

export function formatDateTime(dateTimeString: string | null): string {
  if (!dateTimeString) return "—";
  const date = new Date(dateTimeString);
  if (isNaN(date.getTime())) return dateTimeString;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Convert an ISO datetime string to the format expected by datetime-local inputs (YYYY-MM-DDTHH:MM) */
export function toDateTimeLocal(dateTimeString: string | null): string {
  if (!dateTimeString) return "";
  const date = new Date(dateTimeString);
  if (isNaN(date.getTime())) return dateTimeString;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export interface ExperimentInput {
  name: string;
  description?: string | null;
  organism_type?: string | null;
  groups?: ExperimentGroup[] | null;
  additional_parameters?: Record<string, unknown> | null;
  logs?: Record<string, unknown>[] | null;
  peptides?: string[] | null;
  experiment_start?: string | null;
  experiment_end?: string | null;
  links?: Record<string, unknown> | null;
  olden_labs_study_id?: string | null;
  generated_links?: GeneratedLink[] | null;
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
