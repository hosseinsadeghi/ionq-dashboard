"""IonQ Dashboard — backend proxy.

The browser never talks to IonQ directly: every request is forwarded through
this FastAPI app, with the IonQ API key supplied per-request in the
``X-IonQ-Key`` header. Nothing is ever persisted server-side — the proxy
is stateless, so it is safe to deploy this repo publicly.

Exposed endpoints (all under /api):

* GET  /api/health                         — sanity check (no key)
* GET  /api/whoami                         — validates the key by hitting /backends
* GET  /api/backends                       — list of all backends + status
* GET  /api/backends/{name}                — single backend
* GET  /api/characterizations/{backend}    — current characterization
* GET  /api/characterizations/{backend}/history?limit=
* GET  /api/jobs?status=&limit=&next=      — paginated job list
* GET  /api/jobs/{id}                      — job detail
* GET  /api/jobs/{id}/results              — job results (raw)
* GET  /api/jobs/{id}/cost                 — cost record (when present)
* GET  /api/summary                        — aggregated jobs/spend/queue overview
"""

from __future__ import annotations

import os
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

IONQ_API_BASE = "https://api.ionq.co/v0.4"
HTTP_TIMEOUT = 20.0
SUMMARY_PAGE_LIMIT = 250
SUMMARY_MAX_PAGES = 8

app = FastAPI(title="IonQ Dashboard Proxy", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Low-level IonQ helper
# ---------------------------------------------------------------------------


async def ionq_get(
    path: str,
    api_key: str,
    *,
    params: dict[str, Any] | None = None,
    allow_404: bool = False,
) -> Any:
    if not api_key:
        raise HTTPException(status_code=401, detail="missing IonQ API key")
    headers = {"Authorization": f"apiKey {api_key}"}
    url = f"{IONQ_API_BASE}{path}"
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        try:
            resp = await client.get(url, headers=headers, params=params)
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"IonQ unreachable: {exc}") from exc
    if resp.status_code == 401 or resp.status_code == 403:
        raise HTTPException(status_code=401, detail="IonQ rejected API key")
    if resp.status_code == 404 and allow_404:
        return None
    if resp.status_code >= 400:
        # Try to surface IonQ's error body — useful when debugging.
        try:
            body = resp.json()
        except Exception:  # noqa: BLE001
            body = resp.text
        raise HTTPException(
            status_code=resp.status_code,
            detail={"upstream": body, "path": path},
        )
    if not resp.content:
        return None
    try:
        return resp.json()
    except ValueError:
        return resp.text


def require_key(x_ionq_key: str | None) -> str:
    key = x_ionq_key or os.environ.get("IONQ_API_KEY") or ""
    if not key:
        raise HTTPException(status_code=401, detail="missing IonQ API key")
    return key


# ---------------------------------------------------------------------------
# Public endpoints
# ---------------------------------------------------------------------------


@app.get("/api/health")
async def health() -> dict[str, Any]:
    return {"ok": True, "service": "ionq-dashboard-proxy", "ionq_base": IONQ_API_BASE}


@app.get("/api/whoami")
async def whoami(x_ionq_key: str | None = Header(default=None)) -> dict[str, Any]:
    """Validate the key by hitting /backends — cheapest authenticated endpoint."""
    key = require_key(x_ionq_key)
    data = await ionq_get("/backends", key)
    backends = _normalize_backends(data)
    return {
        "valid": True,
        "key_fingerprint": _fingerprint(key),
        "backends_visible": len(backends),
        "qpus_visible": sum(1 for b in backends if b["name"].startswith("qpu.")),
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/backends")
async def backends(x_ionq_key: str | None = Header(default=None)) -> Any:
    key = require_key(x_ionq_key)
    data = await ionq_get("/backends", key)
    return {"backends": _normalize_backends(data)}


@app.get("/api/backends/{name}")
async def backend_detail(name: str, x_ionq_key: str | None = Header(default=None)) -> Any:
    key = require_key(x_ionq_key)
    return await ionq_get(f"/backends/{name}", key)


@app.get("/api/characterizations/{backend}")
async def characterization(
    backend: str, x_ionq_key: str | None = Header(default=None)
) -> Any:
    key = require_key(x_ionq_key)
    return await ionq_get(f"/characterizations/backends/{backend}/current", key)


@app.get("/api/characterizations/{backend}/history")
async def characterization_history(
    backend: str,
    limit: int = Query(default=20, ge=1, le=100),
    x_ionq_key: str | None = Header(default=None),
) -> Any:
    key = require_key(x_ionq_key)
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
) -> Any:
    key = require_key(x_ionq_key)
    params: dict[str, Any] = {"limit": limit}
    if status:
        params["status"] = status
    if next:
        params["next"] = next
    return await ionq_get("/jobs", key, params=params)


@app.get("/api/jobs/{job_id}")
async def job_detail(job_id: str, x_ionq_key: str | None = Header(default=None)) -> Any:
    key = require_key(x_ionq_key)
    return await ionq_get(f"/jobs/{job_id}", key)


@app.get("/api/jobs/{job_id}/results")
async def job_results(job_id: str, x_ionq_key: str | None = Header(default=None)) -> Any:
    key = require_key(x_ionq_key)
    return await ionq_get(f"/jobs/{job_id}/results", key, allow_404=True)


@app.get("/api/jobs/{job_id}/cost")
async def job_cost(job_id: str, x_ionq_key: str | None = Header(default=None)) -> Any:
    key = require_key(x_ionq_key)
    return await ionq_get(f"/jobs/{job_id}/cost", key, allow_404=True)


@app.get("/api/summary")
async def summary(x_ionq_key: str | None = Header(default=None)) -> dict[str, Any]:
    """Aggregate jobs across pages to compute spend totals, status counts, etc."""
    key = require_key(x_ionq_key)

    # Fetch backends in parallel-ish (single call, cheap).
    backends_payload = await ionq_get("/backends", key)
    backends_norm = _normalize_backends(backends_payload)

    # Page through jobs (bounded so a heavy account doesn't hang the dashboard).
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
        all_jobs.extend(jobs_page)
        next_token = page.get("next")
        if not next_token or not jobs_page:
            break

    return _aggregate_summary(all_jobs, backends_norm, truncated=next_token is not None)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _normalize_backends(payload: Any) -> list[dict[str, Any]]:
    """IonQ returns a bare list for /backends; wrap consistently."""
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
                "raw": item,
            }
        )
    return out


def _aggregate_summary(
    jobs_list: list[dict[str, Any]],
    backends_norm: list[dict[str, Any]],
    *,
    truncated: bool,
) -> dict[str, Any]:
    status_counts: dict[str, int] = defaultdict(int)
    backend_counts: dict[str, int] = defaultdict(int)
    backend_spend: dict[str, float] = defaultdict(float)
    daily_spend: dict[str, float] = defaultdict(float)
    daily_jobs: dict[str, int] = defaultdict(int)
    total_spend = 0.0
    total_shots = 0
    completed = 0
    failed = 0

    recent: list[dict[str, Any]] = []

    for job in jobs_list:
        if not isinstance(job, dict):
            continue
        status = job.get("status") or "unknown"
        backend = job.get("backend") or job.get("target") or "unknown"
        status_counts[status] += 1
        backend_counts[backend] += 1

        cost = _coerce_cost(job)
        if cost is not None:
            total_spend += cost
            backend_spend[backend] += cost

        shots = job.get("shots")
        if isinstance(shots, (int, float)):
            total_shots += int(shots)

        if status == "completed":
            completed += 1
        elif status in {"failed", "canceled", "cancelled"}:
            failed += 1

        created = job.get("request") or job.get("created_at") or job.get("requested_at")
        day = _iso_day(created)
        if day:
            daily_jobs[day] += 1
            if cost is not None:
                daily_spend[day] += cost

        recent.append(
            {
                "id": job.get("id"),
                "name": job.get("name"),
                "status": status,
                "backend": backend,
                "shots": shots,
                "qubits": job.get("qubits"),
                "gate_counts": job.get("gate_counts"),
                "created": created,
                "completed": job.get("response") or job.get("completed_at"),
                "execution_time": job.get("execution_time"),
                "predicted_execution_time": job.get("predicted_execution_time"),
                "cost": cost,
                "error_mitigation": job.get("error_mitigation"),
                "noise_model": job.get("noise"),
            }
        )

    # Sort recent by created desc
    recent.sort(key=lambda j: j.get("created") or "", reverse=True)

    daily_series = [
        {"day": d, "spend": round(daily_spend.get(d, 0.0), 4), "jobs": daily_jobs[d]}
        for d in sorted(daily_jobs.keys())
    ]

    return {
        "totals": {
            "jobs_seen": len(jobs_list),
            "total_spend_usd": round(total_spend, 4),
            "total_shots": total_shots,
            "completed": completed,
            "failed_or_canceled": failed,
            "truncated": truncated,
        },
        "status_counts": dict(status_counts),
        "backend_counts": dict(backend_counts),
        "backend_spend_usd": {k: round(v, 4) for k, v in backend_spend.items()},
        "daily": daily_series,
        "recent_jobs": recent[:50],
        "backends": backends_norm,
    }


def _coerce_cost(job: dict[str, Any]) -> float | None:
    """IonQ exposes cost in a couple of shapes — coerce to USD float."""
    for key in ("cost", "actual_cost", "predicted_cost"):
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


def _iso_day(value: Any) -> str | None:
    if value is None:
        return None
    # IonQ uses ISO-8601 strings; also tolerate epoch seconds/ms.
    if isinstance(value, (int, float)):
        ts = float(value)
        if ts > 1e12:  # ms
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


def _fingerprint(key: str) -> str:
    if len(key) <= 8:
        return "•" * len(key)
    return f"{key[:4]}…{key[-4:]}"
