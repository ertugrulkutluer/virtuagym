"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Wrench } from "lucide-react";
import { clearSession, useSession } from "@/lib/session";

export function Nav() {
  const { user, ready } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  const logout = () => {
    clearSession();
    router.push("/");
  };

  const inAdminScope =
    pathname === "/admin" || pathname.startsWith("/admin/");

  return (
    <header className="sticky top-0 z-20 border-b border-ink-100 bg-ink-50/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="group flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent-500 to-accent-700 text-[11px] font-bold text-white shadow-lift">
            g
          </span>
          <span className="font-display text-base font-semibold tracking-tight">
            Gymflow
          </span>
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          {!user && (
            <>
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
            </>
          )}
          {user?.role === "ADMIN" && (
            <Link
              href={inAdminScope ? "/book" : "/admin"}
              className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 transition hover:border-ink-300"
            >
              <Wrench className="h-3.5 w-3.5 text-ink-500" />
              {inAdminScope ? "Member view" : "Admin view"}
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
