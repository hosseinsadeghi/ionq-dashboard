# IonQ Dashboard

A self-hosted, open-source dashboard for any IonQ API key. Paste in a key
and immediately see every backend, every job, every calibration, and a
rolled-up view of your spend — without ever needing access to the underlying
cloud account.

> Built for Qollab contestants who were issued shared IonQ API keys but
> have no direct console access. Works for any IonQ key.

![stack](https://img.shields.io/badge/stack-FastAPI%20%2B%20Vite%20%2B%20React-8b5cf6)
![license](https://img.shields.io/badge/license-MIT-22d3ee)

## What it shows

- **Overview** — billed / pending / voided spend, jobs, shots, status mix,
  daily activity, recent-job list, spend per backend.
- **Backends** — every QPU and simulator visible to the key, with live
  status and average queue time.
- **Calibration** — current device characterization for each QPU: T1/T2,
  1Q/2Q/SPAM fidelities, gate timings.
- **Jobs** — filterable, searchable browser of every job the key can see.
- **Job inspector** — full payload, decoded result-distribution histogram,
  cost record, predicted vs. actual execution time, error-mitigation flags.

## How the key is handled

The API key is held only in browser `localStorage` (or read from your
`.env` server-side, see below). Every request goes:

```
browser ── X-IonQ-Key header ──▶ local FastAPI proxy ── Authorization: apiKey ──▶ api.ionq.co
```

The proxy is **stateless** — no logging, no on-disk storage. Safe to run on
a shared machine; safe to publish the repo (no key ever appears in it).

If you'd rather not paste the key into the browser, drop it into a `.env`
file (see [Auto-discovered keys](#auto-discovered-keys)) and pick it from
the top-bar dropdown — in that mode the value never leaves the server.

---

## Prerequisites

| Tool      | Version       | Why                              |
| --------- | ------------- | -------------------------------- |
| Python    | 3.10+         | FastAPI backend                  |
| Node.js   | 18+ (20 LTS)  | Vite dev server                  |
| npm       | bundled w/ Node | Frontend deps                  |
| git       | any           | Clone                            |

### Installing the prerequisites

<details>
<summary><b>macOS</b></summary>

Easiest path is [Homebrew](https://brew.sh):

```bash
brew install python node git
```

Verify:
```bash
python3 --version    # 3.10+
node --version       # 18+
```
</details>

<details>
<summary><b>Windows</b></summary>

Two clean options:

**Option A — winget (Windows 10/11, recommended):**
```powershell
winget install --id Python.Python.3.12 -e
winget install --id OpenJS.NodeJS.LTS -e
winget install --id Git.Git -e
```
Close and re-open PowerShell after installing so the new tools land on `PATH`.

**Option B — installers:**
- Python 3.12 from <https://python.org/downloads/windows> (check "Add Python to PATH" during install)
- Node 20 LTS from <https://nodejs.org/en/download>
- Git from <https://git-scm.com/download/win>

Verify in PowerShell:
```powershell
python --version
node --version
```

> **Tip:** PowerShell may block scripts the first time you run an activated
> venv. If you hit `… cannot be loaded because running scripts is disabled`,
> run once per machine:
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
> ```
</details>

<details>
<summary><b>Linux (Debian/Ubuntu)</b></summary>

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip nodejs npm git
```

Most distros ship an older `nodejs`. If you hit Vite warnings, install Node
20 LTS from <https://nodejs.org> or via `nvm`:
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
nvm install --lts
```
</details>

---

## Quick start

Clone first:

```bash
git clone https://github.com/hosseinsadeghi/ionq-dashboard.git
cd ionq-dashboard
```

### macOS / Linux

```bash
# 1. Backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt

# 2. Frontend
cd frontend && npm install && cd ..

# 3. Run both
./run.sh
```

### Windows (PowerShell)

```powershell
# 1. Backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt

# 2. Frontend
cd frontend ; npm install ; cd ..

# 3. Run both
.\run.ps1
```

> If `Activate.ps1` is blocked, see the PowerShell tip in the Windows
> prerequisites section above.

### Two-terminal alternative (any OS)

If `run.sh` / `run.ps1` misbehave, just run the two pieces in separate
terminals:

```bash
# Terminal A — backend
python -m uvicorn backend.main:app --reload --port 5181

# Terminal B — frontend
cd frontend
npm run dev
```

Then open <http://localhost:5180>. The first time, the top-bar key picker
will be empty — click it, paste your IonQ API key, and the dashboard fills
in immediately.

---

## Auto-discovered keys

At startup the backend scans these paths for any environment variable
matching `IONQ_*KEY*` (e.g. `IONQ_API_KEY`, `IONQ_API_KEY_QAL`, …) and
exposes the **names + fingerprints only** in the top-bar dropdown — the
value itself never leaves the server.

- The shell environment (`os.environ`)
- `./.env` in the directory you launched from
- `./.env` in the dashboard repo root
- `~/.env`
- `~/.config/qollab/.env`
- `~/projects/quantum_applications/quantum_advantage_lab/.env`
  *(legacy path for the original Qollab QAL project — harmless if absent)*

To add your own location, edit `ENV_SEARCH_PATHS` near the top of
`backend/main.py`.

A `.env` file looks like:
```env
IONQ_API_KEY=qcaz3yEe...
# A second labelled key:
IONQ_API_KEY_TEAM=ttt9j7P3...
```

`.env` is gitignored — don't worry about committing it accidentally.

---

## What endpoints does it use?

Everything the proxy hits on IonQ:

| Backend route                                              | Purpose                       |
| ---------------------------------------------------------- | ----------------------------- |
| `GET /backends`                                            | List backends + status        |
| `GET /backends/{name}`                                     | Single backend detail         |
| `GET /characterizations/backends/{name}/current`           | Latest calibration            |
| `GET /characterizations/backends/{name}` (with `?limit=`)  | Calibration history           |
| `GET /jobs?status=&limit=&next=`                           | Paginated job list            |
| `GET /jobs/{id}`                                           | One job's metadata            |
| `GET /jobs/{id}/results`                                   | Result distribution           |
| `GET /jobs/{id}/cost`                                      | Settled cost (v0.4 keys only) |

The proxy tries `https://api.ionq.co/v0.4` first and silently falls back to
`/v0.3` if your key only authorizes the older endpoint (common on
Forte-tier keys).

What it deliberately does **not** show: anything that needs console-level
auth — org-wide budget, billing invoices, team membership, key issuance.
Those endpoints aren't exposed to API keys.

---

## Ports

| Port | Service             |
| ---- | ------------------- |
| 5180 | Vite dev server     |
| 5181 | FastAPI proxy       |

Both bind on `0.0.0.0` so you can run the dashboard on one machine and
view it from another on the same LAN (handy on a workshop wifi).

---

## License

MIT — fork it, ship it, share it.
