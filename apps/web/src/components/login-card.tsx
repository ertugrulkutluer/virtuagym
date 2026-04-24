"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { setSession, type SessionUser } from "@/lib/session";

interface LoginResponse {
  user: SessionUser;
  accessToken: string;
  refreshToken: string;
}

export function LoginCard() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const expired = params.get("reason") === "expired";

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const body =
        mode === "login"
          ? { email, password }
          : { email, password, firstName, lastName };
      const res = await api.post<LoginResponse>(`/api/auth/${mode}`, body);
      setSession(res.accessToken, res.user);
      const fallback = res.user.role === "ADMIN" ? "/admin" : "/book";
      const dest = next && next.startsWith("/") ? next : fallback;
      router.push(dest);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? String(err.body?.message ?? err.message)
          : String(err),
      );
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (who: "admin" | "member") => {
    setMode("login");
    if (who === "admin") {
      setEmail("admin@gym.test");
      setPassword("admin12345");
    } else {
      setEmail("regular0@gym.test");
      setPassword("member12345");
    }
  };

  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-lift sm:p-7">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          {mode === "login" ? "Sign in" : "Create account"}
        </h2>
        <button
          onClick={() => setMode(mode === "login" ? "register" : "login")}
          className="text-xs text-ink-500 transition hover:text-ink-900"
        >
          {mode === "login" ? "Register →" : "Sign in →"}
        </button>
      </div>

      {expired && mode === "login" && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Your session expired. Please sign in again.
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-5 space-y-3">
        {mode === "register" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" value={firstName} setValue={setFirstName} />
            <Field label="Last name" value={lastName} setValue={setLastName} />
          </div>
        )}
        <Field label="Email" type="email" value={email} setValue={setEmail} />
        <Field
          label="Password"
          type="password"
          value={password}
          setValue={setPassword}
        />

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-ink-900 py-2.5 text-sm font-medium text-white shadow-lift transition hover:bg-ink-800 disabled:opacity-50"
        >
          {loading ? "…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>

      {mode === "login" && (
        <div className="mt-5 border-t border-ink-100 pt-4">
          <div className="text-[11px] uppercase tracking-[0.2em] text-ink-400">
            Demo accounts
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fillDemo("admin")}
              className="rounded-md border border-ink-200 bg-ink-50 px-2.5 py-1 text-xs text-ink-700 transition hover:border-ink-300"
            >
              admin@gym.test
            </button>
            <button
              type="button"
              onClick={() => fillDemo("member")}
              className="rounded-md border border-ink-200 bg-ink-50 px-2.5 py-1 text-xs text-ink-700 transition hover:border-ink-300"
            >
              regular0@gym.test
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  type = "text",
  value,
  setValue,
}: {
  label: string;
  type?: string;
  value: string;
  setValue: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs text-ink-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="mt-1 w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-ink-900 focus:ring-2 focus:ring-ink-900/10"
        required
      />
    </label>
  );
}
