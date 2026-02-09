import { NextResponse } from "next/server";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const CRON_SECRET = process.env.CRON_SECRET || "";

export async function POST() {
  const headers: HeadersInit = {};
  if (CRON_SECRET) {
    headers.Authorization = `Bearer ${CRON_SECRET}`;
  }

  const res = await fetch(`${API_BASE_URL}/cron/backfill-experiment-peptides`, {
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { error: text || "Backfill failed" },
      { status: res.status }
    );
  }

  const data = await res.json();
  return NextResponse.json(data);
}
