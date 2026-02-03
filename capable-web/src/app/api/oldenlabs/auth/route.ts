import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const OLDEN_LABS_BASE_URL = "https://oldenlabs.com:8000";
const OLDEN_LABS_COOKIE = "olden_labs_token";

// GET: Check if user has Olden Labs token stored
export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(OLDEN_LABS_COOKIE);

  return NextResponse.json({
    authenticated: !!token,
  });
}

// POST: Login to Olden Labs with email/password
export async function POST(request: NextRequest) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 }
    );
  }

  try {
    // Call Olden Labs login endpoint
    const loginRes = await fetch(`${OLDEN_LABS_BASE_URL}/user/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    if (!loginRes.ok) {
      const errorText = await loginRes.text();
      let errorMessage = "Invalid email or password";
      try {
        const errorJson = JSON.parse(errorText);
        // Handle various error response formats
        if (typeof errorJson === "string") {
          errorMessage = errorJson;
        } else if (errorJson.detail) {
          errorMessage = typeof errorJson.detail === "string"
            ? errorJson.detail
            : JSON.stringify(errorJson.detail);
        } else if (errorJson.message) {
          errorMessage = typeof errorJson.message === "string"
            ? errorJson.message
            : JSON.stringify(errorJson.message);
        } else if (errorJson.error) {
          errorMessage = typeof errorJson.error === "string"
            ? errorJson.error
            : JSON.stringify(errorJson.error);
        }
      } catch {
        // Use default error message
      }
      return NextResponse.json({ error: errorMessage }, { status: loginRes.status });
    }

    const data = await loginRes.json();

    // Extract access_token from response
    const accessToken = data.data.accessToken;

    if (!accessToken) {
      return NextResponse.json(
        { error: "Could not extract access token from response" },
        { status: 500 }
      );
    }

    // Store token in cookie
    const cookieStore = await cookies();
    cookieStore.set(OLDEN_LABS_COOKIE, accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Olden Labs login error:", error);
    return NextResponse.json(
      { error: "Failed to connect to Olden Labs" },
      { status: 500 }
    );
  }
}

// DELETE: Clear Olden Labs token
export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(OLDEN_LABS_COOKIE);

  return NextResponse.json({ success: true });
}
