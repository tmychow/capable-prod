import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("auth_session")?.value;
  let token: string | undefined;
  try {
    token = sessionCookie ? JSON.parse(sessionCookie).accessToken : undefined;
  } catch {}

  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();

  const res = await fetch(`${API_BASE_URL}/peptides`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: "Request failed" }));
    return NextResponse.json(
      { error: data.detail || "Failed to create peptide" },
      { status: res.status }
    );
  }

  const data = await res.json();
  return NextResponse.json(data);
}
