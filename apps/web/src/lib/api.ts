const API_BASE =
  typeof window === "undefined"
    ? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"
    : "";

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: { message?: string | string[]; [k: string]: unknown } | null,
    message?: string,
  ) {
    super(message ?? `api ${status}`);
  }
}

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function request<T>(
  method: string,
  path: string,
  opts: {
    body?: unknown;
    formData?: FormData;
    token?: string | null;
    idempotencyKey?: string;
  } = {},
): Promise<T> {
  const url = API_BASE ? `${API_BASE}${path}` : path;
  const writeMethod = method !== "GET" && method !== "HEAD";
  const idemKey = writeMethod
    ? opts.idempotencyKey ?? newIdempotencyKey()
    : undefined;
  const isForm = opts.formData !== undefined;
  const res = await fetch(url, {
    method,
    headers: {
      ...(isForm ? {} : { "content-type": "application/json" }),
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(idemKey ? { "idempotency-key": idemKey } : {}),
    },
    body: isForm
      ? opts.formData
      : opts.body
        ? JSON.stringify(opts.body)
        : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401 && opts.token && typeof window !== "undefined") {
      handleUnauthorized();
    }
    throw new ApiError(res.status, data, data?.message ?? `${method} ${path} failed`);
  }
  return data as T;
}

function handleUnauthorized() {
  try {
    localStorage.removeItem("gymflow.token");
    localStorage.removeItem("gymflow.user");
    window.dispatchEvent(new CustomEvent("gymflow:session-changed"));
  } catch {
    /* no-op */
  }
  const here = window.location.pathname + window.location.search;
  if (window.location.pathname !== "/") {
    const next = encodeURIComponent(here);
    window.location.replace(`/?next=${next}&reason=expired`);
  }
}

export const api = {
  get: <T>(path: string, token?: string | null) =>
    request<T>("GET", path, { token }),
  post: <T>(path: string, body?: unknown, token?: string | null) =>
    request<T>("POST", path, { body, token }),
  postForm: <T>(path: string, formData: FormData, token?: string | null) =>
    request<T>("POST", path, { formData, token }),
  patch: <T>(path: string, body?: unknown, token?: string | null) =>
    request<T>("PATCH", path, { body, token }),
  del: <T>(path: string, token?: string | null) =>
    request<T>("DELETE", path, { token }),
};

export const apiBase = () => API_BASE;
