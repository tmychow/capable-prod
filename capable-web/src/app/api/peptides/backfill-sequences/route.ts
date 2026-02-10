import { NextResponse } from "next/server";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const CRON_SECRET = process.env.CRON_SECRET || "";
export const maxDuration = 800;

export async function POST() {
  const headers: HeadersInit = {};
  if (CRON_SECRET) {
    headers.Authorization = `Bearer ${CRON_SECRET}`;
  }

  const res = await fetch(`${API_BASE_URL}/cron/backfill-peptide-sequences`, {
    method: "POST",
    headers,
  });
  const raw = await res.text();
  let data: Record<string, unknown> | null = null;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = null;
  }

  if (!res.ok) {
    return NextResponse.json(
      {
        error:
          (data?.detail as string | undefined) ||
          (data?.error as string | undefined) ||
          raw ||
          "Sequence backfill failed",
      },
      { status: res.status }
    );
  }

  if (!data) {
    return NextResponse.json(
      {
        error: raw || "Invalid non-JSON response from sequence backfill API",
      },
      { status: 502 }
    );
  }

  return NextResponse.json(data);
}
