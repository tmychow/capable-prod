"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import {
  login as apiLogin,
  getSession,
  createSession,
  clearSession,
  type User,
} from "@/lib/auth";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSession()
      .then((session) => {
        if (session) {
          setUser({ id: session.userId, email: session.email });
        }
      })
      .catch(() => {
        // Session invalid or expired
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const response = await apiLogin(email, password);
    await createSession(response.access_token, response.user_id, response.email);
    setUser({ id: response.user_id, email: response.email });
  };

  const logout = async () => {
    await clearSession();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
