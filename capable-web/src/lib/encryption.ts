import { SignJWT, jwtVerify } from "jose";

const SECRET_KEY = process.env.COOKIE_SECRET || "your-secret-key-min-32-chars!!";
const key = new TextEncoder().encode(SECRET_KEY);

export async function encrypt(payload: Record<string, unknown>): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key);
}

export async function decrypt(token: string): Promise<Record<string, unknown> | null> {
  try {
    const { payload } = await jwtVerify(token, key);
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}
