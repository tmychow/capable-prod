import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const COOKIE_NAME = "auth_session";

export async function GET() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);

  return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"));
}
