// Thin wrapper around the FastAPI proxy.
//
// Two key-passing modes:
//   - "manual": user pasted a raw key into the UI → forwarded via X-IonQ-Key.
//   - "named":  user picked an env-loaded key → forwarded via X-IonQ-Key-Name.
//               The actual value never leaves the server in this mode.

const KEY_STORAGE = "ionq_api_key";
const NAME_STORAGE = "ionq_api_key_name";

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

export function getKeyName() {
  try {
    return localStorage.getItem(NAME_STORAGE) || "";
  } catch {
    return "";
  }
}

export function setKeyName(name) {
  try {
    if (name) localStorage.setItem(NAME_STORAGE, name);
    else localStorage.removeItem(NAME_STORAGE);
  } catch {
    /* ignore */
  }
}

export function clearAuth() {
  setKey("");
  setKeyName("");
}

export function hasAnyKey() {
  return Boolean(getKey() || getKeyName());
}

export function fingerprint(key) {
  if (!key) return "";
  if (key.length <= 8) return "•".repeat(key.length);
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

function authHeaders() {
  const name = getKeyName();
  if (name) return { "X-IonQ-Key-Name": name };
  const key = getKey();
  if (key) return { "X-IonQ-Key": key };
  return {};
}

async function call(path, { signal } = {}) {
  const res = await fetch(path, { headers: authHeaders(), signal });
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
  keySources: () => call("/api/key-sources"),
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
