"""IonQ Dashboard — backend proxy.

The browser never talks to IonQ directly: every request is forwarded through
this FastAPI app. The IonQ API key arrives one of two ways:

* ``X-IonQ-Key`` header — raw key, supplied by the browser (held only in
  localStorage on the client).
* ``X-IonQ-Key-Name`` header — name of an env var the *server* already knows
  about. The actual key value never leaves the server in this mode.

At startup, the proxy scans a small set of well-known ``.env`` paths and
exposes any ``IONQ_*`` entries it finds via ``/api/key-sources`` (returning
only the variable name + fingerprint, never the value).

We default to IonQ's ``/v0.4`` API, but many keys are only authorized on
``/v0.3``. If the upstream returns 401/403 on ``/v0.4`` we automatically
retry against ``/v0.3`` and pin that version for the rest of the session.
"""

from __future__ import annotations

import os
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

IONQ_HOST = "https://api.ionq.co"
API_VERSIONS = ["v0.4", "v0.3"]
HTTP_TIMEOUT = 20.0
SUMMARY_PAGE_LIMIT = 250
SUMMARY_MAX_PAGES = 8

# Per-key sticky version cache so we don't re-probe on every call.
_VERSION_CACHE: dict[str, str] = {}

app = FastAPI(title="IonQ Dashboard Proxy", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Key-source discovery
# ---------------------------------------------------------------------------

# .env files searched at startup. Add more if you have a custom layout —
# anything that isn't readable is silently skipped.
ENV_SEARCH_PATHS: list[Path] = [
    Path.cwd() / ".env",
    Path(__file__).resolve().parent.parent / ".env",  # repo root
    Path.home() / ".env",
    Path.home() / ".config" / "qollab" / ".env",
]

_KEY_NAME_RE = re.compile(r"^IONQ[A-Z0-9_]*KEY[A-Z0-9_]*$", re.IGNORECASE)

# name → {"value": str, "source": str}
_KEY_SOURCES: dict[str, dict[str, str]] = {}


def _parse_env_file(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return out
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[len("export "):]
        name, _, value = line.partition("=")
        name = name.strip()
        if not name or not _KEY_NAME_RE.match(name):
            continue
        value = value.strip()
        if value and value[0] == value[-1] and value[0] in ('"', "'"):
            value = value[1:-1]
        if value:
            out[name] = value
    return out


def _load_key_sources() -> None:
    _KEY_SOURCES.clear()
    # Process env first so a .env value can override only if env is empty.
    for name, val in os.environ.items():
        if _KEY_NAME_RE.match(name) and val:
            _KEY_SOURCES[name] = {"value": val, "source": "environment"}
    for path in ENV_SEARCH_PATHS:
        if not path.is_file():
            continue
        for name, val in _parse_env_file(path).items():
            # First .env wins to keep ordering stable.
            if name not in _KEY_SOURCES:
                _KEY_SOURCES[name] = {"value": val, "source": str(path)}


_load_key_sources()


# ---------------------------------------------------------------------------
# Low-level IonQ helper
# ---------------------------------------------------------------------------


def _fingerprint(key: str) -> str:
    if not key:
        return ""
    if len(key) <= 8:
        return "•" * len(key)
    return f"{key[:4]}…{key[-4:]}"


def _normalize_key(value: str) -> str:
    key = (value or "").strip()
    for prefix in ("apiKey ", "Bearer ", "apikey ", "ApiKey ", "Token "):
        if key.startswith(prefix):
            key = key[len(prefix):].strip()
    return key


def require_key(
    x_ionq_key: str | None,
    x_ionq_key_name: str | None,
) -> str:
    if x_ionq_key_name:
        entry = _KEY_SOURCES.get(x_ionq_key_name)
        if not entry:
            raise HTTPException(
                status_code=400,
                detail=f"no key named {x_ionq_key_name!r} on the server",
            )
        return _normalize_key(entry["value"])
    if x_ionq_key:
        key = _normalize_key(x_ionq_key)
        if key:
            return key
    # Last resort: process env.
    env_key = _normalize_key(os.environ.get("IONQ_API_KEY") or "")
    if env_key:
        return env_key
    raise HTTPException(status_code=401, detail="missing IonQ API key")


async def ionq_get(
    path: str,
    api_key: str,
    *,
    params: dict[str, Any] | None = None,
    allow_404: bool = False,
) -> Any:
    """GET <api_base><path>. Auto-falls back from v0.4 → v0.3 on auth failure."""
    headers = {"Authorization": f"apiKey {api_key}"}
    cached = _VERSION_CACHE.get(api_key)
    versions = [cached] if cached else list(API_VERSIONS)

    last_resp: httpx.Response | None = None
    last_version = versions[0]
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        for version in versions:
            url = f"{IONQ_HOST}/{version}{path}"
            try:
                resp = await client.get(url, headers=headers, params=params)
            except httpx.RequestError as exc:
                raise HTTPException(status_code=502, detail=f"IonQ unreachable: {exc}") from exc
            last_resp = resp
            last_version = version
            if resp.status_code in (401, 403) and not cached and len(versions) > 1:
                # Try the next version.
                continue
            # Successful or non-auth failure → pin this version.
            if resp.status_code < 400:
                _VERSION_CACHE[api_key] = version
            break

    assert last_resp is not None
    resp = last_resp
    if resp.status_code == 404 and allow_404:
        return None
    if resp.status_code >= 400:
        try:
            body = resp.json()
        except Exception:  # noqa: BLE001
            body = resp.text or None
        raise HTTPException(
            status_code=resp.status_code,
            detail={
                "upstream_status": resp.status_code,
                "upstream_body": body,
                "path": path,
                "api_version": last_version,
                "hint": (
                    "IonQ rejected the key on both v0.4 and v0.3. "
                    "Confirm the key at cloud.ionq.com/settings/keys."
                )
                if resp.status_code in (401, 403)
                else None,
            },
        )
    if not resp.content:
        return None
    try:
        return resp.json()
    except ValueError:
        return resp.text


# ---------------------------------------------------------------------------
# Public endpoints
# ---------------------------------------------------------------------------


@app.get("/api/health")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "ionq-dashboard-proxy",
        "ionq_host": IONQ_HOST,
        "api_versions": API_VERSIONS,
        "known_keys": len(_KEY_SOURCES),
    }


@app.get("/api/key-sources")
async def key_sources() -> dict[str, Any]:
    """List discoverable IonQ keys WITHOUT exposing values."""
    _load_key_sources()  # cheap; lets users edit .env without restart
    items = [
        {
            "name": name,
            "fingerprint": _fingerprint(entry["value"]),
            "source": entry["source"],
        }
        for name, entry in _KEY_SOURCES.items()
    ]
    # Stable order: IONQ_API_KEY first (the conventional default), then alpha.
    items.sort(key=lambda x: (x["name"] != "IONQ_API_KEY", x["name"]))
    return {"sources": items}


@app.get("/api/whoami")
async def whoami(
    x_ionq_key: str | None = Header(default=None),
    x_ionq_key_name: str | None = Header(default=None),
) -> dict[str, Any]:
    key = require_key(x_ionq_key, x_ionq_key_name)
    data = await ionq_get("/backends", key)
    backends = _normalize_backends(data)
    return {
        "valid": True,
        "key_fingerprint": _fingerprint(key),
        "key_name": x_ionq_key_name,
        "api_version": _VERSION_CACHE.get(key),
        "backends_visible": len(backends),
        "qpus_visible": sum(1 for b in backends if b["name"].startswith("qpu.")),
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/backends")
async def backends(
    x_ionq_key: str | None = Header(default=None),
    x_ionq_key_name: str | None = Header(default=None),
) -> Any:
    key = require_key(x_ionq_key, x_ionq_key_name)
    data = await ionq_get("/backends", key)
    return {"backends": _normalize_backends(data)}


@app.get("/api/backends/{name}")
async def backend_detail(
    name: str,
    x_ionq_key: str | None = Header(default=None),
    x_ionq_key_name: str | None = Header(default=None),
) -> Any:
    key = require_key(x_ionq_key, x_ionq_key_name)
    return await ionq_get(f"/backends/{name}", key)


@app.get("/api/characterizations/{backend}")
async def characterization(
    backend: str,
    x_ionq_key: str | None = Header(default=None),
    x_ionq_key_name: str | None = Header(default=None),
) -> Any:
    key = require_key(x_ionq_key, x_ionq_key_name)
    return await ionq_get(f"/characterizations/backends/{backend}/current", key)


@app.get("/api/characterizations/{backend}/history")
async def characterization_history(
    backend: str,
    limit: int = Query(default=20, ge=1, le=100),
    x_ionq_key: str | None = Header(default=None),
    x_ionq_key_name: str | None = Header(default=None),
) -> Any:
    key = require_key(x_ionq_key, x_ionq_key_name)
    return await ionq_get(
        f"/characterizations/backends/{backend}",
        key,
        params={"limit": limit},
    )


@app.get("/api/jobs")
async def jobs(
    status: str | None = None,
    limit: int = Query(default=50, ge=1, le=250),
    next: str | None = None,
    x_ionq_key: str | None = Header(default=None),
    x_ionq_key_name: str | None = Header(default=None),
) -> Any:
    key = require_key(x_ionq_key, x_ionq_key_name)
    params: dict[str, Any] = {"limit": limit}
    if status:
        params["status"] = status
    if next:
        params["next"] = next
    payload = await ionq_get("/jobs", key, params=params)
    # Normalize every job so the frontend has a consistent shape.
    if isinstance(payload, dict):
        payload["jobs"] = [_normalize_job(j) for j in payload.get("jobs") or []]
    return payload


@app.get("/api/jobs/{job_id}")
async def job_detail(
    job_id: str,
    x_ionq_key: str | None = Header(default=None),
    x_ionq_key_name: str | None = Header(default=None),
) -> Any:
    key = require_key(x_ionq_key, x_ionq_key_name)
    raw = await ionq_get(f"/jobs/{job_id}", key)
    return _normalize_job(raw, include_raw=True) if isinstance(raw, dict) else raw


@app.get("/api/jobs/{job_id}/results")
async def job_results(
    job_id: str,
    x_ionq_key: str | None = Header(default=None),
    x_ionq_key_name: str | None = Header(default=None),
) -> Any:
    key = require_key(x_ionq_key, x_ionq_key_name)
    return await ionq_get(f"/jobs/{job_id}/results", key, allow_404=True)


@app.get("/api/jobs/{job_id}/cost")
async def job_cost(
    job_id: str,
    x_ionq_key: str | None = Header(default=None),
    x_ionq_key_name: str | None = Header(default=None),
) -> Any:
    """Settled-invoice line for a job. Only exposed on /v0.4 — gracefully
    degrades for v0.3-only keys so the UI doesn't have to special-case it."""
    key = require_key(x_ionq_key, x_ionq_key_name)
    version = _VERSION_CACHE.get(key)
    if version == "v0.3":
        return {
            "available": False,
            "reason": "IonQ's per-job cost endpoint is v0.4-only; this key authorizes v0.3.",
            "api_version": version,
        }
    return await ionq_get(f"/jobs/{job_id}/cost", key, allow_404=True)


@app.get("/api/summary")
async def summary(
    x_ionq_key: str | None = Header(default=None),
    x_ionq_key_name: str | None = Header(default=None),
) -> dict[str, Any]:
    key = require_key(x_ionq_key, x_ionq_key_name)

    backends_payload = await ionq_get("/backends", key)
    backends_norm = _normalize_backends(backends_payload)

    all_jobs: list[dict[str, Any]] = []
    next_token: str | None = None
    for _ in range(SUMMARY_MAX_PAGES):
        params: dict[str, Any] = {"limit": SUMMARY_PAGE_LIMIT}
        if next_token:
            params["next"] = next_token
        page = await ionq_get("/jobs", key, params=params)
        if not isinstance(page, dict):
            break
        jobs_page = page.get("jobs") or []
        all_jobs.extend(_normalize_job(j) for j in jobs_page if isinstance(j, dict))
        next_token = page.get("next")
        if not next_token or not jobs_page:
            break

    return _aggregate_summary(all_jobs, backends_norm, truncated=bool(next_token))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _normalize_backends(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        items = payload
    elif isinstance(payload, dict):
        items = payload.get("backends") or payload.get("data") or []
    else:
        items = []
    out: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        out.append(
            {
                "name": item.get("backend") or item.get("name") or "?",
                "status": item.get("status"),
                "qubits": item.get("qubits") or item.get("num_qubits"),
                "average_queue_time": item.get("average_queue_time"),
                "last_updated": item.get("last_updated"),
                "has_access": item.get("has_access"),
                "characterization_url": item.get("characterization_url"),
                "degraded": item.get("degraded"),
                "location": item.get("location"),
                "supported_gates": item.get("supported_gates"),
                "supported_native_gates": item.get("supported_native_gates"),
                "supported_error_mitigations": item.get("supported_error_mitigations"),
                "raw": item,
            }
        )
    return out


def _normalize_job(job: dict[str, Any], *, include_raw: bool = False) -> dict[str, Any]:
    """Smooth over v0.3 / v0.4 differences so the frontend has one shape."""
    if not isinstance(job, dict):
        return job

    backend = job.get("backend") or job.get("target") or "unknown"
    shots = job.get("shots")
    metadata = job.get("metadata") if isinstance(job.get("metadata"), dict) else {}
    if shots is None and metadata:
        ms = metadata.get("shots")
        if ms is not None:
            try:
                shots = int(ms)
            except (TypeError, ValueError):
                shots = None

    cost = _coerce_cost(job)

    created = job.get("request") or job.get("created_at") or job.get("requested_at")
    completed = job.get("response") or job.get("completed_at")

    out = {
        "id": job.get("id"),
        "name": job.get("name"),
        "status": job.get("status") or "unknown",
        "backend": backend,
        "target": job.get("target"),
        "type": job.get("type"),
        "shots": shots,
        "qubits": job.get("qubits"),
        "circuits": job.get("circuits"),
        "gate_counts": job.get("gate_counts"),
        "cost_model": job.get("cost_model"),
        "cost_usd": job.get("cost_usd"),
        "cost": cost,
        "predicted_cost": job.get("predicted_cost"),
        "execution_time": job.get("execution_time"),
        "predicted_execution_time": job.get("predicted_execution_time"),
        "cost_billable_time_us": job.get("cost_billable_time_us"),
        "project_id": job.get("project_id"),
        "submitted_by": job.get("submitted_by"),
        "error_mitigation": job.get("error_mitigation"),
        "noise": job.get("noise"),
        "dry_run": job.get("dry_run"),
        "request": _to_iso(created),
        "response": _to_iso(completed),
        "request_epoch": created,
        "response_epoch": completed,
        "children": job.get("children"),
        # IonQ populates cost_usd at submission as a deterministic quote under
        # the quantum_compute_time model. We classify the cost into three
        # buckets so the UI can tell "going to be charged" from "won't be
        # charged" from "already charged":
        #   billed     - status=completed; the cost_usd reflects what was
        #                actually billed (or $0 for the free simulator).
        #   pending    - job is in flight (submitted/ready/running/queued).
        #                The quote will become a real charge if it executes.
        #   canceled   - canceled or failed; the quote is almost certainly
        #                not actually charged (IonQ only bills on Forte if
        #                cancel lands after slot reservation).
        "cost_status": _classify_cost(job.get("status")),
        # Back-compat alias: True for anything other than billed.
        "cost_is_quote": _classify_cost(job.get("status")) != "billed",
    }
    if include_raw:
        out["raw"] = job
    return out


_PENDING_STATUSES = {"submitted", "ready", "running", "queued"}
_CANCELED_STATUSES = {"canceled", "cancelled", "failed"}


def _classify_cost(status: str | None) -> str:
    s = (status or "").lower()
    if s == "completed":
        return "billed"
    if s in _PENDING_STATUSES:
        return "pending"
    if s in _CANCELED_STATUSES:
        return "canceled"
    return "pending"  # safest default for unknown statuses


def _aggregate_summary(
    jobs_list: list[dict[str, Any]],
    backends_norm: list[dict[str, Any]],
    *,
    truncated: bool,
) -> dict[str, Any]:
    BUCKETS = ("billed", "pending", "canceled")
    status_counts: dict[str, int] = defaultdict(int)
    backend_counts: dict[str, int] = defaultdict(int)
    bucket_totals = {b: 0.0 for b in BUCKETS}
    backend_by_bucket: dict[str, dict[str, float]] = {
        b: defaultdict(float) for b in BUCKETS
    }
    daily_by_bucket: dict[str, dict[str, float]] = {
        b: defaultdict(float) for b in BUCKETS
    }
    daily_jobs: dict[str, int] = defaultdict(int)
    total_shots = 0
    completed = 0
    failed = 0

    recent: list[dict[str, Any]] = []
    for job in jobs_list:
        if not isinstance(job, dict):
            continue
        status = job.get("status") or "unknown"
        backend = job.get("backend") or "unknown"
        bucket = job.get("cost_status") or _classify_cost(status)
        status_counts[status] += 1
        backend_counts[backend] += 1

        cost = job.get("cost")
        if cost is not None:
            bucket_totals[bucket] += cost
            backend_by_bucket[bucket][backend] += cost

        shots = job.get("shots")
        if isinstance(shots, (int, float)):
            total_shots += int(shots)
        if status == "completed":
            completed += 1
        elif status in _CANCELED_STATUSES:
            failed += 1

        day = _iso_day(job.get("request_epoch") or job.get("request"))
        if day:
            daily_jobs[day] += 1
            if cost is not None:
                daily_by_bucket[bucket][day] += cost
        recent.append(job)

    recent.sort(key=lambda j: (j.get("request_epoch") or 0), reverse=True)

    daily_series = [
        {
            "day": d,
            "jobs": daily_jobs[d],
            **{b: round(daily_by_bucket[b].get(d, 0.0), 4) for b in BUCKETS},
        }
        for d in sorted(daily_jobs.keys())
    ]

    all_backend_names = set().union(*(set(m) for m in backend_by_bucket.values()))
    backend_by_bucket_out = {
        b: {k: round(backend_by_bucket[b].get(k, 0.0), 4) for k in all_backend_names}
        for b in BUCKETS
    }

    return {
        "totals": {
            "jobs_seen": len(jobs_list),
            "billed_spend_usd": round(bucket_totals["billed"], 4),
            "pending_spend_usd": round(bucket_totals["pending"], 4),
            "canceled_spend_usd": round(bucket_totals["canceled"], 4),
            # legacy: sum of all three (was previously billed+everything-else)
            "total_spend_usd": round(sum(bucket_totals.values()), 4),
            # legacy alias for the old field
            "quoted_spend_usd": round(
                bucket_totals["pending"] + bucket_totals["canceled"], 4
            ),
            "total_shots": total_shots,
            "completed": completed,
            "failed_or_canceled": failed,
            "truncated": truncated,
        },
        "status_counts": dict(status_counts),
        "backend_counts": dict(backend_counts),
        "backend_billed_usd": backend_by_bucket_out["billed"],
        "backend_pending_usd": backend_by_bucket_out["pending"],
        "backend_canceled_usd": backend_by_bucket_out["canceled"],
        # legacy aggregate (billed + pending + canceled)
        "backend_spend_usd": {
            k: round(
                sum(backend_by_bucket[b].get(k, 0.0) for b in BUCKETS), 4
            )
            for k in all_backend_names
        },
        "daily": daily_series,
        "recent_jobs": recent[:50],
        "backends": backends_norm,
    }


def _coerce_cost(job: dict[str, Any]) -> float | None:
    for key in ("cost_usd", "cost", "actual_cost", "predicted_cost"):
        val = job.get(key)
        if val is None:
            continue
        if isinstance(val, (int, float)):
            return float(val)
        if isinstance(val, dict):
            amount = val.get("amount") or val.get("usd") or val.get("value")
            if isinstance(amount, (int, float)):
                return float(amount)
            if isinstance(amount, str):
                try:
                    return float(amount)
                except ValueError:
                    continue
        if isinstance(val, str):
            try:
                return float(val)
            except ValueError:
                continue
    return None


def _to_iso(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        ts = float(value)
        if ts > 1e12:
            ts /= 1000.0
        try:
            return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
        except (OverflowError, OSError, ValueError):
            return None
    if isinstance(value, str):
        return value
    return None


def _iso_day(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        ts = float(value)
        if ts > 1e12:
            ts /= 1000.0
        try:
            return datetime.fromtimestamp(ts, tz=timezone.utc).date().isoformat()
        except (OverflowError, OSError, ValueError):
            return None
    if isinstance(value, str):
        s = value.replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(s).date().isoformat()
        except ValueError:
            return value[:10] if len(value) >= 10 else None
    return None
