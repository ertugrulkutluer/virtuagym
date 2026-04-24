"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearSession, useSession } from "@/lib/session";

export function Nav() {
  const { user, ready } = useSession();
  const router = useRouter();

  const logout = () => {
    clearSession();
    router.push("/");
  };

  return (
    <header className="sticky top-0 z-20 border-b border-ink-100 bg-ink-50/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="group flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent-500 to-accent-700 text-[11px] font-bold text-white shadow-lift">
            g
          </span>
          <span className="font-display text-base font-semibold tracking-tight">
            Gymflow
          </span>
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <Link
            href="/features"
            className="text-ink-500 transition hover:text-ink-900"
          >
            Features
          </Link>
          <Link
            href="/book"
            className="text-ink-500 transition hover:text-ink-900"
          >
            Classes
          </Link>
          {user && (
            <Link
              href="/my"
              className="text-ink-500 transition hover:text-ink-900"
            >
              My bookings
            </Link>
          )}
          {user && user.role !== "ADMIN" && (
            <Link
              href="/health"
              className="text-ink-500 transition hover:text-ink-900"
            >
              Health
            </Link>
          )}
          {user?.role === "ADMIN" && (
            <Link
              href="/admin"
              className="text-ink-500 transition hover:text-ink-900"
            >
              Admin
            </Link>
          )}
          {ready && !user && (
            <Link
              href="/"
              className="rounded-md bg-ink-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-ink-800"
            >
              Sign in
            </Link>
          )}
          {user && (
            <button
              onClick={logout}
              className="text-ink-400 transition hover:text-ink-900"
              aria-label="log out"
            >
              {user.email.split("@")[0]} · log out
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
