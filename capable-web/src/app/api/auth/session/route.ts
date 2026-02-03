import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { encrypt, decrypt } from "@/lib/encryption";

const COOKIE_NAME = "auth_session";

// GET - retrieve session
export async function GET() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(COOKIE_NAME);

  if (!cookie) {
    return NextResponse.json({ session: null });
  }

  const session = await decrypt(cookie.value);
  if (!session) {
    return NextResponse.json({ session: null });
  }

  return NextResponse.json({ session });
}

// POST - create session
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { accessToken, userId, email } = body;

  if (!accessToken || !userId || !email) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const encrypted = await encrypt({
    accessToken,
    userId,
    email,
  });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, encrypted, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  });

  return NextResponse.json({ success: true });
}

// DELETE - clear session
export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);

  return NextResponse.json({ success: true });
}
