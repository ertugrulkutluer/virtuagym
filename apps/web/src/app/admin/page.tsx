"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/session";

export default function AdminHome() {
  const { user, ready } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (ready && (!user || user.role !== "ADMIN")) {
      router.push("/");
    }
  }, [ready, user, router]);

  if (!user || user.role !== "ADMIN") return null;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
      <p className="mt-1 text-sm text-slate-500">Signed in as {user.email}</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <AdminCard href="/admin/classes" title="Classes" hint="Schedule and capacity." />
        <AdminCard href="/admin/members" title="Members" hint="Profiles and credit packs." />
        <AdminCard href="/admin/overbooking" title="Overbooking advisor" hint="Grok overbooking, decision log, toggle." />
      </div>
    </main>
  );
}

function AdminCard({ href, title, hint }: { href: string; title: string; hint: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-slate-200 bg-white p-4 hover:border-brand-500 hover:bg-brand-50 transition"
    >
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-1 text-xs text-slate-500">{hint}</div>
    </Link>
  );
}
