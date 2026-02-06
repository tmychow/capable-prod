"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import NProgress from "nprogress";
import { useAuth } from "@/context/AuthContext";

export default function Header() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    NProgress.start();
    logout();
    router.push("/login");
  };

  // Don't render header if not logged in
  if (!loading && !user) {
    return null;
  }

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center gap-8">
            <Link href="/" className="text-xl font-bold">
              Capable
            </Link>
            <div className="hidden sm:flex gap-6">
              <Link
                href="/"
                className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Dashboard
              </Link>
              <Link
                href="/experiments"
                className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Experiments
              </Link>
              <Link
                href="/peptides"
                className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Peptides
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {loading ? (
              <div className="w-20 h-9 bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
            ) : (
              <>
                <span className="text-sm text-zinc-600 dark:text-zinc-400 hidden sm:block">
                  {user?.email}
                </span>
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer"
                >
                  Sign Out
                </button>
              </>
            )}
          </div>
        </div>
      </nav>
    </header>
  );
}
