// Thin wrapper around the FastAPI proxy. The IonQ key is held in localStorage
// and forwarded on every call via the X-IonQ-Key header so it never appears
// in the URL/query string and is never persisted server-side.

const KEY_STORAGE = "ionq_api_key";

export function getKey() {
  try {
    return localStorage.getItem(KEY_STORAGE) || "";
  } catch {
    return "";
  }
}

export function setKey(value) {
  try {
    if (value) localStorage.setItem(KEY_STORAGE, value);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* ignore */
  }
}

export function fingerprint(key) {
  if (!key) return "";
  if (key.length <= 8) return "•".repeat(key.length);
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

async function call(path, { signal } = {}) {
  const key = getKey();
  const res = await fetch(path, {
    headers: key ? { "X-IonQ-Key": key } : {},
    signal,
  });
  let body = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    const detail =
      (body && (body.detail || body.error)) || body || res.statusText;
    const err = new Error(
      typeof detail === "string" ? detail : JSON.stringify(detail)
    );
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export const api = {
  health: () => call("/api/health"),
  whoami: () => call("/api/whoami"),
  backends: () => call("/api/backends"),
  backend: (name) => call(`/api/backends/${encodeURIComponent(name)}`),
  characterization: (name) =>
    call(`/api/characterizations/${encodeURIComponent(name)}`),
  characterizationHistory: (name, limit = 20) =>
    call(`/api/characterizations/${encodeURIComponent(name)}/history?limit=${limit}`),
  jobs: ({ status, limit = 50, next } = {}) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (limit) params.set("limit", String(limit));
    if (next) params.set("next", next);
    const qs = params.toString();
    return call(`/api/jobs${qs ? `?${qs}` : ""}`);
  },
  job: (id) => call(`/api/jobs/${encodeURIComponent(id)}`),
  jobResults: (id) => call(`/api/jobs/${encodeURIComponent(id)}/results`),
  jobCost: (id) => call(`/api/jobs/${encodeURIComponent(id)}/cost`),
  summary: () => call("/api/summary"),
};
