import { cookies } from "next/headers";

const COOKIE_NAME = "auth_session";

export interface Session {
  accessToken: string;
  userId: string;
  email: string;
}

export async function getServerSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(COOKIE_NAME);

  if (!cookie) {
    return null;
  }

  try {
    const session = JSON.parse(cookie.value);
    if (!session.accessToken || !session.userId || !session.email) {
      return null;
    }
    return {
      accessToken: session.accessToken,
      userId: session.userId,
      email: session.email,
    };
  } catch {
    return null;
  }
}

export async function clearServerSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
