# NPTEL Mock Exam Portal

A robust, full-stack mock examination portal designed to run NPTEL-style exams for **300 concurrent students** on a local college LAN server or cloud host with zero cost.

---

## Key Features

- **Student Portal**:
  - Roll number authentication with single-active-session enforcement.
  - Automatic transition from idle state to live exam via 5-second polling (no page reloads).
  - Seeded per-student question and option shuffling (server-authoritative).
  - Optimistic UI with offline `localStorage` retry queue for resilience against lab Wi-Fi drops.
  - NPTEL-style layout: Markdown question text + code snippet on left, 4 option cards on right.
  - Question palette (answered, unanswered, marked for review) and keyboard shortcuts (`←`/`→`, `1`–`4`).
  - Strict security: Correct answers and topics are completely stripped from all student responses.

- **Admin Console**:
  - Live Exam Monitor with real-time answer progress bars, tab-switch audit counters, and emergency controls.
  - Live controls: Start now, Stop, and Extend Time (+5m, +10m) with instant deadline shifts.
  - Question Bank with Excel upload, dry-run validation with row/field errors, and preview before confirmation.
  - Student directory with bulk CSV/XLSX import and one-click password resets.
  - Join policies: `FIXED_END` (synchronized end) vs. `FULL_DURATION` (rolling 60 minutes).

- **NPTEL Evaluation & Analytics**:
  - Automated NPTEL composite scoring: `25% assignment + 75% scaled exam`.
  - Pass/fail determination and NPTEL certification tiers (`Elite + Gold`, `Elite + Silver`, `Elite`, `Successfully Completed`).
  - Topic mastery analysis (Strong ≥ 70%, Average 50–69%, Weak < 50%) and student topic heatmaps.
  - Class weak topics bar chart identifying curriculum areas needing revision.
  - Excel results export with Results, Topic Matrix, and Class Weak Topics sheets.
  - Automated email dispatch with personalized 2-page PDF scorecards and review questions.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Language** | TypeScript (full-stack) |
| **Monorepo** | pnpm workspaces |
| **Frontend** | React 18, Vite, Tailwind CSS, TanStack Query, Zustand, Recharts |
| **Backend** | Node 20, Fastify, `@fastify/cookie`, `@fastify/autoload` |
| **Database** | PostgreSQL 16 + Drizzle ORM |
| **Excel & PDF** | `exceljs`, `pdfkit` |
| **DevOps & QA** | Docker Compose, Nginx, Vitest, Playwright, k6 |

---

## Quick Start (Docker Compose)

### 1. Clone & Configure
```bash
git clone <repo-url> nptel-mock-portal
cd nptel-mock-portal
cp .env.example .env
```

### 2. Start Services
```bash
docker compose up -d --build
```
This launches:
- `db`: PostgreSQL 16 tuned for 200 concurrent connections
- `api`: 2 stateless Fastify replicas
- `worker`: Background scheduler, auto-submit, and mail processor
- `web`: Nginx serving the static React build and reverse proxying `/api`

### 3. Seed Demo Data
```bash
docker compose exec api pnpm seed
```
Creates:
- Admin account: `admin` / `admin123`
- 300 Students: `CS21001` .. `CS21300` (Default password = roll number)
- 200 Questions across 10 Python topics with code snippets
- Ready-to-run mock exam

Access URLs:
- **Student Portal**: `http://localhost/`
- **Admin Console**: `http://localhost/admin`

---

## Local Development (Without Docker)

The project includes built-in standalone database support via embedded PostgreSQL 16:

```bash
# 1. Install dependencies
pnpm install

# 2. Seed database
pnpm seed

# 3. Start development servers
pnpm dev:api    # Fastify API (:3000)
pnpm dev:web    # Vite Dev Server (:5173)
pnpm dev:worker # Worker process
```

---

## Testing & Quality Assurance

Run the comprehensive test suite:

```bash
# Unit & integration tests
pnpm test

# Type checking across all workspaces
pnpm typecheck

# Production build test
pnpm build
```

---

## Operational Documentation

Refer to [`docs/runbook.md`](docs/runbook.md) for the complete exam-day checklist, proctor procedures, and troubleshooting guidelines.
