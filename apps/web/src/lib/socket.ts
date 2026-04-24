"use client";

import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";

const API_BASE =
  typeof window === "undefined"
    ? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"
    : "";

/**
 * One persistent Socket.IO connection per signed-in user. Lives at the app
 * root so page navigation doesn't reconnect. The server auth handshake
 * uses the same JWT as HTTP; on token change we tear down and rebuild.
 */
export function useSocket(token: string | null) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) return;
    const url = API_BASE || window.location.origin;
    const s = io(url, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      auth: { token },
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });
    s.on("connect", () => setConnected(true));
    s.on("disconnect", () => setConnected(false));
    setSocket(s);
    return () => {
      s.removeAllListeners();
      s.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [token]);

  return { socket, connected };
}

/**
 * Best-effort browser notification helper. Silent when permission is
 * denied or the tab is focused — always pair with an in-app toast.
 */
export async function maybeNotify(
  title: string,
  opts?: { body?: string; tag?: string; onClick?: () => void },
) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (document.visibilityState === "visible") return;
  if (Notification.permission === "denied") return;
  if (Notification.permission === "default") {
    const perm = await Notification.requestPermission().catch(() => "denied");
    if (perm !== "granted") return;
  }
  const n = new Notification(title, {
    body: opts?.body,
    tag: opts?.tag,
    icon: "/favicon.ico",
  });
  if (opts?.onClick) {
    n.onclick = () => {
      window.focus();
      opts.onClick!();
      n.close();
    };
  }
}

export async function requestNotificationPermissionIfPossible() {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "default") {
    await Notification.requestPermission().catch(() => undefined);
  }
}
