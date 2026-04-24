"use client";

import { useEffect, useState } from "react";
import type { Role } from "@gymflow/shared";

const TOKEN_KEY = "gymflow.token";
const USER_KEY = "gymflow.user";

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): SessionUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as SessionUser) : null;
}

export function setSession(token: string, user: SessionUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new CustomEvent("gymflow:session-changed"));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new CustomEvent("gymflow:session-changed"));
}

export function useSession() {
  const [state, setState] = useState<{
    token: string | null;
    user: SessionUser | null;
    ready: boolean;
  }>({ token: null, user: null, ready: false });

  useEffect(() => {
    const sync = () =>
      setState({ token: getToken(), user: getUser(), ready: true });
    sync();
    window.addEventListener("gymflow:session-changed", sync);
    return () => window.removeEventListener("gymflow:session-changed", sync);
  }, []);

  return state;
}
