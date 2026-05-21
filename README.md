# IonQ Dashboard

A self-hosted, open-source dashboard for any IonQ API key. Paste in a key
and immediately see every backend, every job, every calibration, and a
rolled-up view of your spend — without ever needing access to the underlying
cloud account.

> Built for Qollab contestants who were issued shared IonQ API keys but
> have no direct console access. The same dashboard works for any IonQ
> key.

![architecture](https://img.shields.io/badge/stack-FastAPI%20%2B%20Vite%20%2B%20React-8b5cf6)

## Features

- **Overview** — total spend, jobs run, shots executed, status mix, daily
  activity, recent-job list, spend per backend.
- **Backends** — every QPU and simulator visible to the key, with live
  status and average queue time.
- **Calibration** — current device characterization for each QPU: T1/T2,
  1Q/2Q/SPAM fidelities, gate timings.
- **Jobs** — filterable, searchable browser of every job the key can see.
- **Job inspector** — full payload, decoded result distribution histogram,
  cost record, predicted vs. actual execution time, error-mitigation flags.

## How the key is handled

The API key is held only in browser `localStorage`. Every request goes:

```
browser ── X-IonQ-Key header ──▶ local FastAPI proxy ── Authorization: apiKey ──▶ api.ionq.co
```

The proxy is **stateless** — no logging, no on-disk storage. Safe to run on a
shared machine; safe to publish the repo (no key ever appears in it).

## Quick start

```bash
# 1. install
cd backend && pip install -r requirements.txt
cd ../frontend && npm install

# 2. run
# terminal A
uvicorn backend.main:app --reload --port 5181
# terminal B
cd frontend && npm run dev
```

Open <http://localhost:5180>, paste your IonQ API key, done.

Or use the bundled launcher:

```bash
./run.sh
```

## What endpoints does it use?

All routes on `https://api.ionq.co/v0.4` that an ordinary API key can hit:

| Backend route                                              | Purpose                       |
| ---------------------------------------------------------- | ----------------------------- |
| `GET /backends`                                            | List backends + status        |
| `GET /backends/{name}`                                     | Single backend detail         |
| `GET /characterizations/backends/{name}/current`           | Latest calibration            |
| `GET /characterizations/backends/{name}` (with `?limit=`)  | Calibration history           |
| `GET /jobs?status=&limit=&next=`                           | Paginated job list            |
| `GET /jobs/{id}`                                           | One job's metadata            |
| `GET /jobs/{id}/results`                                   | Result distribution           |
| `GET /jobs/{id}/cost`                                      | Cost record (when present)    |

What it deliberately does **not** show: anything that needs console-level
auth — org-wide budget, billing invoices, team membership, key issuance. Those
endpoints aren't exposed to API keys.

## Stack

- **Backend**: FastAPI + httpx (Python 3.10+).
- **Frontend**: Vite + React 18 + Tailwind CSS + Recharts + lucide-react.

## License

MIT — fork it, ship it, share it.
