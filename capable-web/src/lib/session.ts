import { cookies } from "next/headers";
import { decrypt } from "./encryption";

export interface Session {
  accessToken: string;
  userId: string;
  email: string;
}

export async function getServerSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get("auth_session");

  if (!cookie) {
    return null;
  }

  const session = await decrypt(cookie.value);
  if (!session) {
    return null;
  }

  return {
    accessToken: session.accessToken as string,
    userId: session.userId as string,
    email: session.email as string,
  };
}
