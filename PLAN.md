# NPTEL Mock Exam Portal — Full Analysis & Implementation Plan

> **How to use this file**
> 1. Create an empty folder. Put this file in it as `PLAN.md`.
> 2. Open the folder in Claude Code / OpenCode / Antigravity.
> 3. Paste this one prompt:
>    **"Read PLAN.md fully. You are the LEAD agent. Execute Phase 0 yourself, then spawn all sub-agents in Phase 1 in parallel using git worktrees, then run Phase 2 integration. Follow the plan exactly. Do not ask me questions unless something is blocked."**
> 4. Everything needed (requirements, schema, API contract, algorithms, agent tasks, tests, deployment) is inside this file.

---

## 0. Table of Contents

1. Project summary
2. Requirements analysis
3. Decisions & assumptions
4. Architecture
5. Tech stack
6. Repository structure
7. Database schema
8. API contract
9. Core algorithms (shuffle, timer, scoring, topic analysis)
10. Excel question format
11. UI screens
12. Email & PDF report
13. Execution model: Lead + sub-agents
14. Phase 0 — Lead bootstrap
15. Phase 1 — Parallel sub-agents (A–J)
16. Phase 2 — Integration
17. Testing & load test
18. Deployment (college lab LAN + free cloud backup)
19. Exam-day runbook
20. Risks & mitigations
21. Definition of done

---

## 1. Project summary

A web app to run **NPTEL-style mock exams** for about **300 students at the same time**, in a college lab (LAN) or on a free cloud host.

- **Admin** creates exams, uploads questions via Excel, controls start/stop/time, sees live monitoring and results, and sends result mails with PDF reports.
- **Student** logs in with roll number + password, sees nothing but the home screen until an exam is live, then enters, answers 50 shuffled questions with **no page reloads**, submits, and returns to home.
- **Evaluation** gives per-student and per-class topic analysis (strong/weak), an NPTEL-style score (25% assignment + 75% exam, configurable), and a personalised PDF by email.

This is a **mock test tool**, not the real NPTEL system.

---

## 2. Requirements analysis

### 2.1 Student side

| # | Requirement | Notes |
|---|---|---|
| S1 | Login with roll number + password (default password = roll number) | Optional force-change on first login |
| S2 | Home screen shows "No exam right now" when nothing is live | Nothing else visible. No hidden features |
| S3 | When admin starts an exam, an **Enter** button appears automatically | Polling every 5 s, no refresh needed |
| S4 | Exam has 50 questions (configurable), **shuffled per student** | Questions AND options shuffled |
| S5 | Each answer click saves to server **without page reload** | SPA + `fetch`, optimistic UI, retry queue |
| S6 | Questions can be long (10–15 lines) with code blocks | Markdown + syntax-highlighted code |
| S7 | NPTEL-like layout: question (and code) on one side, 4 options on the other | Responsive: stacked on small screens |
| S8 | Question palette (numbers 1–50) with answered / unanswered / marked state | |
| S9 | Submit with confirmation → return to home | Wait for next exam |
| S10 | Refresh / relogin / network drop must **not** lose answers, order or time | Server is source of truth |

### 2.2 Admin side

| # | Requirement | Notes |
|---|---|---|
| A1 | Create exam: title, subject, schedule, duration, question count | |
| A2 | **Join policy** option (see §9.2): late joiner ends at fixed end time OR gets full duration | Asked at exam creation |
| A3 | Start now / stop / extend time / force-submit / reset a student's attempt | |
| A4 | Live monitor: joined, in progress, submitted, progress per student | |
| A5 | Upload questions through **Excel template** (download template → fill → upload) | Validation + preview before save |
| A6 | Question bank per subject; exam can draw N random questions from the pool | e.g. 50 out of 200 |
| A7 | Import students (CSV/Excel): roll, name, email, batch | |
| A8 | Set **assignment marks** per exam (e.g. 23/25 for all) for mock NPTEL scoring | |
| A9 | Results sheet: marks, pass/fail, topic strengths/weaknesses, class-level weak topics | Export to Excel |
| A10 | Publish results: send one email per student with PDF report | Queue, retry, status visible |

### 2.3 Non-functional

| # | Requirement |
|---|---|
| N1 | 300 concurrent students, stable. Target: answer-save p95 < 500 ms, error rate < 0.5% |
| N2 | Works offline-from-internet on college LAN (no external calls except optional SMTP) |
| N3 | Server never sends correct answers to the browser |
| N4 | Server-authoritative timer. Client clock is not trusted |
| N5 | One active session per student |
| N6 | Free to run. One `docker compose up` deploy |
| N7 | Timezone: store UTC, display `Asia/Kolkata` |

---

## 3. Decisions & assumptions

1. **Option shuffle method:** server sends options in shuffled order, each with its original key (`a|b|c|d`). Client labels them A–D by position. Client submits the original key. Correct answer stored as original key → scoring is trivial and nothing leaks.
2. **Shuffle persistence:** order is generated at first join, stored in `attempts.question_order` (JSON). Reload gives the same order.
3. **Question pool:** exam has a pool; each student gets a random N from the pool (seeded). If pool size = N, everyone gets all questions in different order.
4. **Sessions:** DB-backed session table, httpOnly cookie. New login revokes the old session.
5. **Realtime:** polling (5 s student home, 3–5 s admin monitor). Simple and enough for 300 users.
6. **Background jobs:** separate `worker` process (scheduler, auto-submit, mail queue). API stays stateless so it can run as multiple processes.
7. **NPTEL scoring rule (configurable, VERIFY against current NPTEL rules — written from memory):**
   - Final = Assignment (max 25) + Exam scaled to max 75.
   - Pass: total ≥ 40 AND assignment ≥ 10 AND exam-scaled ≥ 30.
   - Default tiers (editable per exam): ≥90 Elite+Gold, 75–89 Elite+Silver, 60–74 Elite, 40–59 Successfully Completed, <40 / failed-criteria = Not Passed.
8. **Topic levels (configurable):** Strong ≥ 70%, Average 50–69%, Weak < 50%.
9. **Anti-cheat:** light only (tab-switch counter visible to admin, optional fullscreen prompt). It is a mock test; no blocking.
10. **Passwords:** bcrypt cost 8 (mock use; default password = roll no). API runs with multiple processes so 300 simultaneous logins do not block.

---

## 4. Architecture

```
                 ┌────────────────────────── Browser (React SPA) ───────────────────────────┐
                 │ Student UI                         Admin UI                              │
                 └───────────────┬──────────────────────────────┬──────────────────────────┘
                                 │ HTTP /api/*                  │
                        ┌────────▼──────────────────────────────▼────────┐
                        │ Nginx (static web + reverse proxy :80)         │
                        └────────┬───────────────────────────────────────┘
                                 │
                   ┌─────────────▼─────────────┐        ┌──────────────────────────┐
                   │ API (Fastify, 2 replicas) │        │ Worker (1 process)       │
                   │ stateless, DB sessions    │        │ - exam scheduler (5 s)   │
                   └─────────────┬─────────────┘        │ - auto-submit expired    │
                                 │                      │ - mail queue + PDF       │
                        ┌────────▼──────────────────────▼───────┐
                        │ PostgreSQL 16                         │
                        └───────────────────────────────────────┘
```

Key rule: **all state lives in PostgreSQL**. No in-memory state in API processes (so replicas are safe).

---

## 5. Tech stack

| Layer | Choice |
|---|---|
| Language | TypeScript everywhere |
| Package manager | pnpm workspaces |
| Frontend | React 18, Vite, Tailwind CSS, React Router, TanStack Query, Zustand (exam local state) |
| Markdown/code render | `react-markdown`, `remark-gfm`, `shiki` (or `highlight.js`) |
| Backend | Node 20, Fastify, `@fastify/cookie`, `@fastify/multipart`, `@fastify/autoload`, `@fastify/rate-limit` |
| Validation | Zod (shared between web and api) |
| DB | PostgreSQL 16, Drizzle ORM + drizzle-kit migrations |
| Excel | `exceljs` (generate template, parse upload, export results) |
| PDF | `pdfkit` |
| Mail | `nodemailer` (SMTP) |
| Password | `bcryptjs` |
| Tests | Vitest (unit/integration), Playwright (e2e), k6 (load) |
| Deploy | Docker Compose, Nginx |

---

## 6. Repository structure

```
/
├─ PLAN.md
├─ package.json                 # pnpm workspace root
├─ pnpm-workspace.yaml
├─ docker-compose.yml
├─ .env.example
├─ docs/
│  ├─ api.md                    # API contract (Lead writes from §8)
│  ├─ agents.md                 # copy of §15 for reference
│  └─ runbook.md
├─ packages/
│  └─ shared/                   # zod schemas + TS types (Lead owns)
│     └─ src/{auth,exam,question,result,admin}.ts
├─ apps/
│  ├─ api/
│  │  ├─ drizzle/               # migrations
│  │  └─ src/
│  │     ├─ app.ts              # autoloads modules/*  (Lead owns)
│  │     ├─ server.ts           # API entry
│  │     ├─ worker.ts           # worker entry (loads jobs/*)
│  │     ├─ db/{schema.ts,client.ts}     # Lead owns
│  │     ├─ lib/{session.ts,time.ts,shuffle.ts,errors.ts}   # Lead owns
│  │     ├─ modules/
│  │     │  ├─ auth/            # Agent A
│  │     │  ├─ student-exam/    # Agent B
│  │     │  ├─ admin-exams/     # Agent C
│  │     │  ├─ questions/       # Agent D
│  │     │  ├─ results/         # Agent H
│  │     │  └─ mail/            # Agent I
│  │     └─ jobs/
│  │        ├─ scheduler.ts     # Agent C
│  │        ├─ autosubmit.ts    # Agent B
│  │        └─ mailqueue.ts     # Agent I
│  └─ web/
│     └─ src/
│        ├─ main.tsx, router.tsx, lib/api.ts, lib/time.ts   # Lead owns
│        ├─ student/            # Agent E
│        └─ admin/
│           ├─ shell/, students/, questions/, exams/         # Agent F
│           └─ monitor/, results/, dashboard/                # Agent G
├─ scripts/
│  ├─ seed.ts                   # Agent J
│  └─ backup.sh                 # Agent J
├─ tests/
│  ├─ e2e/                      # Agent J
│  └─ load/exam.k6.js           # Agent J
└─ deploy/
   ├─ nginx.conf                # Agent J
   └─ Dockerfile.*              # Agent J
```

**Conflict rule:** each agent edits **only** the paths it owns. Shared files (schema, shared types, contract, router, app.ts) are Lead-owned. If an agent needs a change there, it writes the request in `docs/change-requests.md` and continues with a mock; Lead applies it.

---

## 7. Database schema

Lead implements this in `apps/api/src/db/schema.ts` (Drizzle) and generates the migration. SQL shown for clarity.

```sql
-- Users
CREATE TABLE admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  name text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roll_no text UNIQUE NOT NULL,
  name text NOT NULL,
  email text,
  batch text,
  password_hash text NOT NULL,
  must_change_password boolean DEFAULT false,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_type text NOT NULL CHECK (user_type IN ('student','admin')),
  user_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked boolean DEFAULT false
);
CREATE INDEX ON sessions (user_type, user_id);

-- Question bank
CREATE TABLE subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL
);

CREATE TABLE import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid REFERENCES subjects(id),
  filename text,
  row_count int,
  created_by uuid REFERENCES admins(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES subjects(id),
  import_batch_id uuid REFERENCES import_batches(id),
  topic text NOT NULL,
  subtopic text,
  body_md text NOT NULL,          -- long question text, Markdown
  code_snippet text,              -- optional code block
  code_lang text DEFAULT 'python',
  option_a text NOT NULL,
  option_b text NOT NULL,
  option_c text NOT NULL,
  option_d text NOT NULL,
  correct char(1) NOT NULL CHECK (correct IN ('a','b','c','d')),
  marks numeric DEFAULT 1,
  negative numeric DEFAULT 0,
  explanation_md text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX ON questions (subject_id, topic);

-- Exams
CREATE TABLE exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subject_id uuid NOT NULL REFERENCES subjects(id),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','scheduled','live','ended')),
  scheduled_start timestamptz,
  auto_start boolean DEFAULT false,
  started_at timestamptz,
  ended_at timestamptz,
  duration_minutes int NOT NULL DEFAULT 60,
  extra_minutes int NOT NULL DEFAULT 0,         -- admin extensions
  join_policy text NOT NULL DEFAULT 'FIXED_END'
    CHECK (join_policy IN ('FIXED_END','FULL_DURATION')),
  late_join_cutoff_minutes int,                 -- null = no cutoff
  hard_close_at timestamptz,                    -- optional absolute limit (FULL_DURATION)
  questions_per_student int NOT NULL DEFAULT 50,
  shuffle_questions boolean DEFAULT true,
  shuffle_options boolean DEFAULT true,
  negative_marking boolean DEFAULT false,
  batch_filter text,                            -- null = all students
  -- NPTEL-style scoring config
  assignment_marks numeric DEFAULT 0,
  assignment_max numeric DEFAULT 25,
  exam_max numeric DEFAULT 75,
  pass_total numeric DEFAULT 40,
  pass_assignment_min numeric DEFAULT 10,
  pass_exam_min numeric DEFAULT 30,
  strong_threshold numeric DEFAULT 70,
  weak_threshold numeric DEFAULT 50,
  grade_tiers jsonb DEFAULT '[{"min":90,"label":"Elite + Gold"},{"min":75,"label":"Elite + Silver"},{"min":60,"label":"Elite"},{"min":40,"label":"Successfully Completed"}]',
  results_published boolean DEFAULT false,
  created_by uuid REFERENCES admins(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE exam_questions (          -- the pool
  exam_id uuid REFERENCES exams(id) ON DELETE CASCADE,
  question_id uuid REFERENCES questions(id),
  PRIMARY KEY (exam_id, question_id)
);

-- Attempts
CREATE TABLE attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES exams(id),
  student_id uuid NOT NULL REFERENCES students(id),
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress','submitted','auto_submitted')),
  started_at timestamptz NOT NULL DEFAULT now(),
  deadline_at timestamptz NOT NULL,
  submitted_at timestamptz,
  seed bigint NOT NULL,
  -- [{ "qid": "...", "options": ["c","a","d","b"] }, ...] in display order
  question_order jsonb NOT NULL,
  tab_switches int DEFAULT 0,
  UNIQUE (exam_id, student_id)
);
CREATE INDEX ON attempts (exam_id, status);

CREATE TABLE answers (
  attempt_id uuid REFERENCES attempts(id) ON DELETE CASCADE,
  question_id uuid REFERENCES questions(id),
  chosen char(1) CHECK (chosen IN ('a','b','c','d')),   -- original key; null = cleared
  saved_at timestamptz DEFAULT now(),
  PRIMARY KEY (attempt_id, question_id)
);

-- Results
CREATE TABLE results (
  attempt_id uuid PRIMARY KEY REFERENCES attempts(id) ON DELETE CASCADE,
  exam_id uuid NOT NULL REFERENCES exams(id),
  student_id uuid NOT NULL REFERENCES students(id),
  correct_count int, wrong_count int, unanswered_count int,
  raw_score numeric, max_raw numeric,
  exam_scaled numeric, assignment_marks numeric, total numeric,
  passed boolean, grade_label text,
  computed_at timestamptz DEFAULT now()
);

CREATE TABLE topic_scores (
  attempt_id uuid REFERENCES attempts(id) ON DELETE CASCADE,
  topic text NOT NULL,
  subtopic text NOT NULL DEFAULT '',
  correct int, total int, pct numeric,
  level text CHECK (level IN ('strong','average','weak')),
  PRIMARY KEY (attempt_id, topic, subtopic)
);

-- Mail
CREATE TABLE mail_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES exams(id),
  student_id uuid NOT NULL REFERENCES students(id),
  to_email text NOT NULL,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed')),
  tries int DEFAULT 0,
  last_error text,
  created_at timestamptz DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (exam_id, student_id)
);

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  actor text, action text, details jsonb, at timestamptz DEFAULT now()
);
```

---

## 8. API contract

Base path `/api`. JSON everywhere. Errors: `{ "error": { "code": "STRING", "message": "text" } }` with proper HTTP status. Auth via httpOnly cookie `sid`. Roles: `student`, `admin`. Zod schemas live in `packages/shared` and are the single source of truth.

### 8.1 Auth (Agent A)

| Method | Path | Body / Response |
|---|---|---|
| POST | `/auth/student/login` | `{rollNo, password}` → `{user:{id,rollNo,name,mustChangePassword}}` + sets cookie. Revokes older sessions |
| POST | `/auth/admin/login` | `{username, password}` → `{user}` |
| POST | `/auth/logout` | → `204` |
| GET | `/auth/me` | → `{role, user}` or `401` |
| POST | `/auth/change-password` | `{oldPassword,newPassword}` → `204` |

Rate limit: 20 login attempts/min per IP (but allow burst; lab shares few IPs — set generously, e.g. 600/min/IP on LAN, configurable via env).

### 8.2 Student exam engine (Agent B) — role `student`

| Method | Path | Notes |
|---|---|---|
| GET | `/student/home` | → `{ state: "idle" \| "live", exam?: {id,title,durationMinutes,canEnter,reason?,remainingSeconds?}, attemptId?, alreadySubmitted?: boolean }` |
| POST | `/student/exams/:examId/start` | Creates attempt (or resumes). Applies join policy. → `{attemptId}` |
| GET | `/student/attempts/:id` | → `{ serverTime, deadlineAt, remainingSeconds, status, questions:[{index,qid,topicHidden:true,bodyMd,code,codeLang,options:[{key,text}]}], answers:{[qid]:key} }`. **No correct answers, no topics** |
| PUT | `/student/attempts/:id/answers/:qid` | `{chosen:"a"\|"b"\|"c"\|"d"\|null}` → `{saved:true, remainingSeconds}`. Rejects if not in progress or past deadline (+3 s grace) |
| POST | `/student/attempts/:id/submit` | Idempotent. → `{status:"submitted"}` |
| POST | `/student/attempts/:id/tab-event` | Increments `tab_switches`. → `204` |

### 8.3 Admin exams & control (Agent C) — role `admin`

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/admin/exams` | list / create |
| GET/PUT/DELETE | `/admin/exams/:id` | read / update (blocked fields when live) / delete (draft only) |
| PUT | `/admin/exams/:id/questions` | `{questionIds:[]}` or `{subjectId, topics?:[]}` to set pool |
| POST | `/admin/exams/:id/start` | status→live, `started_at=now()` |
| POST | `/admin/exams/:id/stop` | status→ended, force-submit all in progress |
| POST | `/admin/exams/:id/extend` | `{minutes}` adds to `extra_minutes`; recompute deadlines of in-progress attempts |
| GET | `/admin/exams/:id/monitor` | → counts `{eligible,notJoined,inProgress,submitted}` + rows `[{studentId,rollNo,name,status,answered,total,lastSavedAt,tabSwitches,deadlineAt}]` |
| POST | `/admin/attempts/:id/force-submit` | |
| POST | `/admin/attempts/:id/reset` | deletes attempt+answers so student can re-enter (audit logged) |
| GET/POST/PUT | `/admin/students`, `/admin/students/import` | list/create/update; import CSV/XLSX (multipart) → `{created,updated,errors[]}`; `POST /admin/students/:id/reset-password` |

### 8.4 Question bank & Excel (Agent D) — role `admin`

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/admin/subjects` | |
| GET | `/admin/questions/template.xlsx` | Download Excel template (§10) |
| POST | `/admin/questions/import?dryRun=true` | multipart `file`, `subjectId` → `{validCount, errors:[{row,field,message}], preview:[first 20], token}` |
| POST | `/admin/questions/import/confirm` | `{token}` → `{imported}` (single transaction) |
| GET | `/admin/questions` | filters: subject, topic, search; paging |
| PUT/DELETE | `/admin/questions/:id` | edit / soft-delete |
| GET | `/admin/questions/topics?subjectId=` | topic/subtopic list with counts |

### 8.5 Results & analytics (Agent H) — role `admin`

| Method | Path | Notes |
|---|---|---|
| POST | `/admin/exams/:id/compute` | (Re)computes results + topic scores for all attempts. Idempotent. Also auto-run by worker when exam ends |
| GET | `/admin/exams/:id/results` | → rows `[{rollNo,name,correct,wrong,unanswered,examScaled,assignment,total,passed,gradeLabel}]` + summary `{avg,median,passRate,highest,lowest,distribution[]}` |
| GET | `/admin/exams/:id/topic-matrix` | → `{topics:[...], rows:[{studentId, scores:{[topic]:{pct,level}}}], classWeak:[{topic,avgPct}]}` |
| GET | `/admin/exams/:id/students/:studentId/analysis` | detailed: topics, wrong questions with correct answers |
| GET | `/admin/exams/:id/export.xlsx` | Sheets: Results, Topic Matrix, Class Weak Topics |
| PUT | `/admin/exams/:id/scoring` | update assignment marks / thresholds → recompute |

### 8.6 Mail & PDF (Agent I) — role `admin`

| Method | Path | Notes |
|---|---|---|
| POST | `/admin/exams/:id/publish` | Sets `results_published`, enqueues one mail per student with email |
| GET | `/admin/exams/:id/mail-status` | counts + per-student status |
| POST | `/admin/exams/:id/mail/retry-failed` | |
| GET | `/admin/exams/:id/students/:studentId/report.pdf` | on-demand PDF preview/download |
| POST | `/admin/mail/test` | `{to}` sends test mail to verify SMTP |

---

## 9. Core algorithms

### 9.1 Seeded shuffle (`lib/shuffle.ts`, Lead)

- `seed = hash(examId + studentId)` → 64-bit integer, stored in `attempts.seed`.
- PRNG: mulberry32 or xorshift seeded from `seed`. Fisher-Yates.
- Steps at attempt creation:
  1. Load exam pool question IDs.
  2. If pool > `questions_per_student`: shuffle pool, take first N.
  3. If `shuffle_questions`: shuffle chosen list.
  4. For each question: `options = ['a','b','c','d']`; if `shuffle_options` shuffle.
  5. Save as `question_order = [{qid, options:[...]}]`.
- Unit test: same seed → same output; different students → different orders; all questions present once.

### 9.2 Deadline & join policy (`lib/time.ts`, Lead; used by B and C)

Let `E = exam.started_at`, `D = duration_minutes`, `X = extra_minutes`, `now = server time`.

- **Can enter?** exam is `live`, AND (`late_join_cutoff_minutes` is null OR `now ≤ E + cutoff`), AND (for FIXED_END: `now < E + D + X`).
- **FIXED_END** (exam 10:00–11:00; student joins 10:30 → ends 11:00):
  `deadline = E + D + X`
- **FULL_DURATION** (student joins 10:30 → ends 11:30):
  `deadline = now + D + X`, and if `hard_close_at` is set, `deadline = min(deadline, hard_close_at)`
- Deadline is stored at first join. When admin **extends**: for FIXED_END add to all in-progress deadlines; for FULL_DURATION also add (same delta).
- When admin **stops** the exam: all in-progress attempts are submitted immediately (status `auto_submitted`).
- **Auto-submit worker** (every 5 s, `jobs/autosubmit.ts`): `UPDATE attempts SET status='auto_submitted', submitted_at=deadline_at WHERE status='in_progress' AND deadline_at < now()`. Also do a lazy check inside every answer/get request.
- Client countdown: compute `offset = serverTime - clientNow` from each response; show `deadlineAt - (clientNow + offset)`. Resync on every save response.

### 9.3 Answer saving (resilience)

- Server: `INSERT ... ON CONFLICT (attempt_id, question_id) DO UPDATE`, only if attempt `in_progress` and `now ≤ deadline + 3s`.
- Client: optimistic UI + a **retry queue** persisted in `localStorage` (`[{qid, chosen, ts}]`). On failure retry with backoff (1s, 2s, 4s… max 15s). On reconnect flush in order. Show indicator: "Saved ✓ / Saving… / Offline — will retry".
- On exam load, merge server answers with unsent local queue (local newer wins for queued items).
- Submit button: flush queue first, then call submit.

### 9.4 Scoring (`modules/results`, Agent H)

For each submitted attempt:
```
raw = Σ(marks_i if correct) − Σ(negative_i if wrong and exam.negative_marking)   // clamp ≥ 0
max_raw = Σ marks_i over the student's questions
exam_scaled = raw / max_raw × exam_max          // default 75
total = assignment_marks + exam_scaled          // default assignment out of 25
passed = total ≥ pass_total AND assignment_marks ≥ pass_assignment_min AND exam_scaled ≥ pass_exam_min
grade_label = highest tier with total ≥ tier.min if passed, else "Not Passed"
```
Unanswered = 0 marks, no negative. Round display to 2 decimals; store full precision.

### 9.5 Topic analysis

- Group each student's questions by `(topic, subtopic)`. `pct = correct/total×100`.
- `level`: `pct ≥ strong_threshold` → strong; `pct < weak_threshold` → weak; else average.
- If a topic has < 2 questions for a student, mark level but flag low confidence in UI/PDF ("few questions").
- **Class-level weak topics:** average pct per topic across all students, ascending.
- **"What to study" list** for PDF: weak topics first (lowest pct first), then average. Include wrong questions with correct answer + explanation (max 15 questions, shortest first if more).

---

## 10. Excel question format

Template file `NPTEL_Questions_Template.xlsx` generated by the API (Agent D).

**Sheet 1 "Questions"** (header row 1, data from row 2):

| Col | Header | Required | Rules |
|---|---|---|---|
| A | `topic` | yes | e.g. `Lists` |
| B | `subtopic` | no | e.g. `Slicing` |
| C | `question` | yes | Multi-line allowed. Markdown allowed. Max 4000 chars |
| D | `code` | no | Code shown in monospace block under the question. Max 4000 chars |
| E | `code_lang` | no | default `python` |
| F | `option_a` | yes | max 1000 chars |
| G | `option_b` | yes | |
| H | `option_c` | yes | |
| I | `option_d` | yes | |
| J | `correct` | yes | `A`, `B`, `C` or `D` (dropdown validation in template) |
| K | `marks` | no | default 1 |
| L | `negative` | no | default 0 |
| M | `explanation` | no | shown in student PDF |

- Template includes 2 filled example rows (one with code) and frozen header, wrap text, column widths.
- **Sheet 2 "Instructions"**: plain explanation of each column, tips ("keep one question per row", "do not merge cells").

**Validation (dry run):** required fields present; `correct` in A–D; the four options non-empty and not all identical; numeric marks; length limits; duplicate question text within the file (warning). Return all errors with row numbers so admin can fix and re-upload. Nothing is saved on dry run. Confirm step saves all valid rows in one transaction (reject whole file if any error, unless `skipInvalid=true`).

**Student import** (CSV/XLSX) columns: `roll_no, name, email, batch`. Default password = `roll_no`. Existing roll_no → update name/email/batch (do not touch password).

---

## 11. UI screens

### 11.1 Student (Agent E)

1. **Login** — roll number, password.
2. **Home** — three states:
   - *Idle:* "No exam right now. Please wait." (polls every 5 s)
   - *Live:* card with exam title, duration, big **Enter Exam** button (disabled with reason if late-join cutoff passed)
   - *Submitted:* "Your exam was submitted. Wait for the next exam."
3. **Exam screen** (NPTEL-like):
   - Top bar: exam title, countdown timer (turns red under 5 min), save indicator.
   - Left/main: question number, question text (Markdown), code block.
   - Right: 4 options as large radio cards labelled A–D by position. Click = save. Click again on selected = clear (optional).
   - Bottom: Previous / Next / Mark for review (local only) / Submit.
   - Palette panel: 50 numbered buttons — answered (green), unanswered (grey), marked (amber), current (outlined). Keyboard: ← → to navigate, 1–4 to choose.
   - Submit modal: shows answered/unanswered/marked counts. Confirm → home.
   - On expiry: auto-submit message, redirect to home.
4. No results shown to the student in-app (results come by mail).

### 11.2 Admin (Agents F and G)

- **Shell:** sidebar (Dashboard, Students, Question Bank, Exams, Results), topbar, logout.
- **Dashboard (G):** live/next exam card, quick counts.
- **Students (F):** table, search, import dialog (shows created/updated/errors), reset password.
- **Question Bank (F):** subject selector, **Download Template** button, **Upload** with dry-run preview (errors table, first 20 preview, Confirm), question list with topic filter, edit/delete.
- **Exams (F):** list; create/edit form with all fields incl. join policy radio with plain-language hint:
  - FIXED_END: "Everyone ends at the same time. A late student gets less time."
  - FULL_DURATION: "Every student gets the full duration from the time they join."
  Pool selection (subject + optional topics), questions per student, assignment marks, thresholds.
- **Exam Control / Monitor (G):** big Start / Stop / Extend (+5, +10, custom) buttons with confirm dialogs, live counters, searchable table with progress bars, tab-switch badge, force-submit and reset actions. Polls 3–5 s.
- **Results (G):** results table (sortable, filter pass/fail), summary cards, mark distribution chart, **topic heatmap** (students × topics, colour by level), "Class weak topics" bar chart, student drill-down drawer, Export Excel, set assignment marks, **Publish & Send Mails** with progress and failed-retry.

---

## 12. Email & PDF report (Agent I)

**Mail** (HTML + plain text): subject `Mock Result: {exam title} — {roll no}`. Body: greeting, total marks, pass/fail, grade label, one-line focus summary, PDF attached.

**PDF** (`pdfkit`, A4, 2 pages max normally):
1. Header: exam title, date, student name, roll no.
2. Score box: Assignment x/25, Exam y/75, **Total z/100**, Pass/Fail + grade label.
3. Topic table: topic, correct/total, %, level (colour: green/amber/red, drawn bars).
4. **Focus areas:** weak topics (and subtopics) listed first, then average topics, with a one-line instruction ("Revise: Lists → Slicing").
5. **Questions to review:** wrong questions (trimmed text, your answer, correct answer, explanation).
6. Footer: "This is a mock test report."

**Queue behaviour:** worker takes `pending` rows, generates PDF in memory, sends at `MAIL_RATE_PER_MINUTE` (default 30), retries failed up to 3 times with backoff, records `last_error`. Students without email are listed as "skipped" in status.

Free SMTP options: Gmail app password (~500/day), Brevo free (300/day), or college mail server. Configure via env.

---

## 13. Execution model: Lead + sub-agents

- **Lead agent** = the main session. It does Phase 0 alone (needed so agents don't collide), then spawns **10 sub-agents in parallel** (Phase 1), then does Phase 2.
- Each sub-agent works in its **own git worktree + branch** so parallel edits never conflict:
  ```bash
  git worktree add ../wt-A-auth -b agent/A-auth
  ```
- Tool hints:
  - **Claude Code:** launch sub-agents with the Task tool, several in a single message so they run concurrently; give each the prompt template in §15.
  - **OpenCode:** define each agent as a subagent (`.opencode/agent/*.md`) using the prompt in §15, then invoke them in parallel.
  - **Antigravity:** use the Manager view and start one agent per task in parallel, each pointed at its worktree.
- **Sub-agent prompt template** (Lead fills `{X}` and `{NAME}`):
  > You are Agent {X} ({NAME}) on the NPTEL Mock Exam Portal. Work only inside worktree `../wt-{X}-{name}` on branch `agent/{X}-{name}`. Read `PLAN.md` sections 1–12 and **only your own section (15.{X})**. Edit only the paths you own. Follow the API contract and shared types exactly; they are frozen. Code against the contract using mocks if another agent's module is not ready. Write the tests listed in your section. Finish by running lint, typecheck and your tests, then commit with clear messages and report: what is done, how to run it, anything blocked. Do not touch other agents' paths.
- **Dependency principle:** because Phase 0 freezes the DB schema, shared types and API contract, no agent needs another agent's code to start.
- **Merge order (Phase 2):** A → D → C → B → H → I → E → F → G → J (backend first, then UI, then ops).

---

## 14. Phase 0 — Lead bootstrap (sequential, do this first)

Checklist (all must be done and committed to `main` before spawning agents):

- [ ] `git init`; pnpm workspace root with `apps/api`, `apps/web`, `packages/shared`.
- [ ] TypeScript configs, ESLint, Prettier, Vitest set up.
- [ ] `packages/shared`: Zod schemas + inferred types for every request/response in §8.
- [ ] `apps/api`: Fastify app, `@fastify/autoload` loading `modules/*` (each module exports a Fastify plugin and a prefix), error handler (`lib/errors.ts`), session middleware with `requireRole('student'|'admin')` decorator (`lib/session.ts`).
- [ ] `db/schema.ts` per §7, `db/client.ts` (pool size 10 per process), first migration, `pnpm db:migrate`.
- [ ] `lib/shuffle.ts` and `lib/time.ts` implemented **with unit tests** (these are shared by several agents).
- [ ] Create **stub plugins** in each `modules/*` and `jobs/*` returning `501 NOT_IMPLEMENTED` so autoload works with no edits to `app.ts` later.
- [ ] `worker.ts` that loads every file in `jobs/` and runs each exported `{name, intervalMs, run}`.
- [ ] `apps/web`: Vite + React + Tailwind + Router + TanStack Query; typed `lib/api.ts` client from shared types; router with lazy routes `/` → `student/index.tsx`, `/admin/*` → `admin/index.tsx` (stubs).
- [ ] `docs/api.md` (copy §8), `docs/agents.md` (copy §15), `.env.example`:
  ```
  DATABASE_URL=postgres://exam:exam@db:5432/exam
  SESSION_SECRET=change-me
  APP_URL=http://192.168.1.10
  TZ=Asia/Kolkata
  SMTP_HOST= SMTP_PORT=587 SMTP_USER= SMTP_PASS= MAIL_FROM=
  MAIL_RATE_PER_MINUTE=30
  RATE_LIMIT_LOGIN_PER_MIN=600
  ```
- [ ] Seed one admin (`admin` / `admin123`, print warning to change it).
- [ ] Commit, tag `phase0`, then create the 10 worktrees and launch agents.

---

## 15. Phase 1 — Parallel sub-agents

Each section = one agent's complete brief. Paths are exclusive ownership.

### 15.A — Agent A: Auth & sessions
- **Owns:** `apps/api/src/modules/auth/**`, `apps/web/src/lib/auth*` helpers only if Lead stubbed them.
- **Build:** §8.1 endpoints; bcryptjs cost 8; create session row, set httpOnly `sid` cookie (SameSite=Lax, 12 h); on student login revoke all previous sessions of that student; `/auth/me`; change password; per-IP rate limit from env; audit log for admin logins.
- **Acceptance:** wrong password → 401; second login invalidates first session (old cookie → 401); admin routes reject student sessions; 300 sequential logins finish in a few seconds on a dev laptop.
- **Tests:** login success/fail, revocation, role guard, password change.

### 15.B — Agent B: Student exam engine
- **Owns:** `apps/api/src/modules/student-exam/**`, `apps/api/src/jobs/autosubmit.ts`.
- **Build:** §8.2 endpoints using `lib/shuffle.ts` and `lib/time.ts` (§9.1–9.3). `/student/home` logic (idle/live/submitted, `canEnter`, reasons). `start` is idempotent (resume if attempt exists; enforce join policy and cutoff; check student is eligible via `batch_filter` and `active`). `GET attempt` strips correct answers and topics. Answer PUT with deadline + grace check; submit idempotent; tab-event. Auto-submit job every 5 s.
- **Acceptance:** same student gets the same order after reload; two students get different orders; answers saved after deadline+3 s are rejected; correct answers never present in any response (add a test that deep-scans JSON for `correct`); FIXED_END vs FULL_DURATION deadlines match §9.2 examples (10:00 exam, join 10:30 → 11:00 vs 11:30).
- **Tests:** shuffle persistence, policy matrix, deadline edges, idempotent submit, concurrent PUTs.

### 15.C — Agent C: Admin exams, control, students
- **Owns:** `apps/api/src/modules/admin-exams/**`, `apps/api/src/jobs/scheduler.ts`.
- **Build:** §8.3 — exam CRUD with validation (join policy, positive duration, pool size ≥ questions_per_student); pool assignment; start/stop/extend with the semantics in §9.2; monitor endpoint (single efficient query: attempts LEFT JOIN answer counts; eligible = active students matching batch_filter); force-submit; reset (audit log); student CRUD + CSV/XLSX import + reset password (default = roll no). Scheduler job: when `status='scheduled' AND auto_start AND scheduled_start ≤ now()` → go live (idempotent, safe with multiple workers via `UPDATE ... WHERE status='scheduled' RETURNING`).
- **Acceptance:** stop submits all in-progress attempts; extend moves deadlines; monitor for 300 students responds < 200 ms; import reports row-level errors.
- **Tests:** state transitions (illegal ones rejected), extend/stop effects, import edge cases.

### 15.D — Agent D: Question bank & Excel
- **Owns:** `apps/api/src/modules/questions/**`.
- **Build:** §8.4 and §10 completely: template generation with `exceljs` (data validation on `correct`, wrap text, example rows, instructions sheet), dry-run parse + validation, token-based confirm (store parsed rows in a temp table or memory-with-TTL keyed by token — use DB temp table `import_staging` created via migration request to Lead, or store JSON on `import_batches` with a `status` column if Lead adds it), transactional insert, list/filter/edit/delete, topic summary.
- **Acceptance:** a 500-row file validates in < 3 s; errors give exact row/column; multi-line question and code cells preserved exactly; re-upload creates a new import batch (duplicates warned, not silently merged).
- **Tests:** valid file, each error type, large file, unicode, line breaks.

### 15.E — Agent E: Student UI
- **Owns:** `apps/web/src/student/**`.
- **Build:** §11.1 fully. Zustand store for exam state; TanStack Query for home polling (5 s); answer saving with retry queue in localStorage (§9.3); timer using server offset; palette; keyboard shortcuts; Markdown + code rendering; submit modal; auto-submit handling; handle 401 → login; mobile-friendly. **No full page reloads anywhere.**
- **Acceptance:** answering never triggers navigation or reload; killing network for 30 s and restoring flushes answers; refresh restores same question order, answers and timer; Lighthouse accessibility ≥ 90; 15-line code question renders without layout break.
- **Tests:** component tests for palette and retry queue; Playwright happy path (with Agent J's e2e harness, or a local mock server until then).

### 15.F — Agent F: Admin UI part 1 (shell, students, question bank, exams)
- **Owns:** `apps/web/src/admin/shell/**`, `admin/students/**`, `admin/questions/**`, `admin/exams/**`, and `admin/index.tsx`.
- **Build:** §11.2 for those areas: login, layout, guarded routes, student table + import dialog, question bank + template download + dry-run preview + confirm, question list/edit, exam list + create/edit form with join-policy radio and hints, pool selection, scoring settings. Export route entries so Agent G's pages mount under `/admin/monitor`, `/admin/results`, `/admin/dashboard` (Lead pre-creates these route placeholders).
- **Acceptance:** whole flow "template → upload → preview errors → confirm → create exam → assign pool" works against the real API; form validation mirrors Zod schemas.

### 15.G — Agent G: Admin UI part 2 (dashboard, monitor, results)
- **Owns:** `apps/web/src/admin/monitor/**`, `admin/results/**`, `admin/dashboard/**`.
- **Build:** live monitor (§11.2) with Start/Stop/Extend, confirmations, counters, searchable table, progress bars, force-submit/reset; results table, summary cards, distribution chart, topic heatmap, class weak topics chart, student drill-down drawer, assignment-marks setting, Export, Publish & mail progress with retry-failed. Use a light chart lib (`recharts`).
- **Acceptance:** monitor table stays smooth with 300 rows (virtualise or memoise); heatmap readable with 15 topics × 300 students (sticky headers, filter); mail progress updates live.

### 15.H — Agent H: Scoring & analytics
- **Owns:** `apps/api/src/modules/results/**`.
- **Build:** §8.5 with algorithms §9.4–9.5; compute is idempotent and transactional; worker hook: when an exam becomes `ended` and all attempts are submitted, auto-compute (implement as `jobs/results-compute.ts`, which Agent H also owns); results summary stats; topic matrix; per-student analysis incl. wrong questions; Excel export with `exceljs`; scoring settings update → recompute.
- **Acceptance:** scores match hand-calculated fixtures (include test fixtures for negative marking, unanswered, multi-mark questions, boundary pass/fail: total 40 but exam-scaled 29 → fail); 300 attempts × 50 questions computes in < 5 s.

### 15.I — Agent I: Mail & PDF
- **Owns:** `apps/api/src/modules/mail/**`, `apps/api/src/jobs/mailqueue.ts`.
- **Build:** §12 — PDF generator (reuse Agent H's analysis function via the shared service interface `getStudentAnalysis(examId, studentId)` defined in `packages/shared`; code against it, with a fixture mock until H is merged), HTML/text mail template, queue worker with rate limiting and retries, publish/status/retry/test endpoints, on-demand PDF endpoint.
- **Acceptance:** a test SMTP (MailHog/Mailpit container in compose profile `dev`) receives mails with PDF attachment; failed sends are retried then marked `failed` with reason; publishing twice does not duplicate mails (unique constraint).

### 15.J — Agent J: DevOps, seed, QA
- **Owns:** `docker-compose.yml`, `deploy/**`, `scripts/**`, `tests/**`, `docs/runbook.md`.
- **Build:**
  - Dockerfiles (api, worker, web+nginx), `docker-compose.yml` services: `db` (postgres 16, tuned `max_connections=200`, volume), `api` (replicas 2), `worker` (1), `web` (nginx serving build + proxy `/api`), `mailpit` (profile dev). Healthchecks. Auto-run migrations on api start.
  - `scripts/seed.ts`: admin, **300 fake students** (`CS21001`…, password = roll no), subject "Python" with **200 synthetic questions** over ~10 topics (lists, tuples, dicts, strings, functions, loops, OOP, files, exceptions, comprehensions) incl. some 10–15 line code questions, and a ready exam.
  - `scripts/backup.sh`: `pg_dump` to timestamped file.
  - **Playwright e2e:** admin creates exam → starts; 3 students enter, answer, one refreshes mid-exam, all submit; admin computes results and publishes; mail lands in Mailpit.
  - **k6 load test** `tests/load/exam.k6.js`: 300 VUs: login → home → start → GET attempt → 50 answers with 15–40 s think time (scaled-down time for CI: 1–3 s) → submit. Thresholds: `http_req_duration{name:save}` p95 < 500 ms, `http_req_failed` < 0.5%.
  - `docs/runbook.md` from §19.
- **Acceptance:** fresh machine: `docker compose up -d && pnpm seed` gives a working system; k6 thresholds met on a 4-core / 8 GB box.

---

## 16. Phase 2 — Integration (Lead, sequential)

1. Merge branches in the order from §13; run typecheck + all tests after each merge.
2. Fix contract mismatches (adjust code, not contract, unless a real bug is found; then update contract + shared types + all callers).
3. Run e2e suite (Agent J).
4. Run k6 with 300 VUs; profile slow queries with `EXPLAIN ANALYZE`; add indexes if needed. Common hotspots: monitor query, `/student/home` polling, answer upsert.
5. Run a manual dress rehearsal with 5 browsers + both join policies (§19 checklist).
6. Tag `v1.0`. Write final `README.md` (how to run, how to use, screenshots optional).

---

## 17. Testing & load test summary

| Level | Tool | What |
|---|---|---|
| Unit | Vitest | shuffle, deadline policies, scoring, topic levels, Excel validation |
| API integration | Vitest + test DB | every endpoint, auth guards, state transitions |
| Security checks | Vitest | no `correct` leak in student responses; student cannot call admin APIs; student cannot read another's attempt (403) |
| E2E | Playwright | full exam lifecycle |
| Load | k6 | 300 concurrent students, thresholds in §15.J |
| Failure drills | manual | restart API mid-exam, drop student network, DB restart; no data loss, timers correct |

---

## 18. Deployment

### 18.1 Primary: college lab LAN (free)

- One lab PC/server: 4 cores, 8 GB RAM, wired network, Docker installed, set to **never sleep**, on UPS if possible.
- Give it a **static IP** (e.g. `192.168.1.10`). Open port 80 in OS firewall. Students open `http://192.168.1.10`.
- Setup:
  ```bash
  cp .env.example .env     # edit SESSION_SECRET, APP_URL, SMTP_*
  docker compose up -d --build
  docker compose exec api pnpm seed     # only for demo data
  ```
- Change default admin password immediately.
- Use a wired/switched network; 300 students on weak Wi-Fi is the biggest risk.

### 18.2 Free cloud backup
- **Oracle Cloud Always Free** (ARM Ampere VM up to 4 OCPU / 24 GB) — run the same compose file; add HTTPS via Caddy if using a domain.
- Avoid free tiers that sleep (Render/Railway/Fly free, Vercel serverless) for exam day.
- Free DB-only options (Neon, Supabase) work but add latency; prefer DB on the same VM.

### 18.3 Sizing check
300 students × 1 save / 30 s ≈ 10 req/s average; peaks of 100+ req/s at start (login + start) are fine for 2 API processes + Postgres. Home polling: 300 / 5 s = 60 req/s while idle — keep `/student/home` a cheap indexed query (cache exam status in memory for 2 s per process if needed).

### 18.4 Postgres/Node settings
`max_connections=200`, `shared_buffers=1GB`; each API process pool = 10, worker pool = 5. Node `--max-old-space-size=1024`.

---

## 19. Exam-day runbook

**Day before**
- [ ] Upload questions via Excel; check topic counts per topic (≥ 3 questions per topic recommended for meaningful analysis).
- [ ] Import students; verify email column filled.
- [ ] Create exam; set join policy, duration, assignment marks, pool; send test mail (`/admin/mail/test`).
- [ ] Run a 5-student rehearsal; run `scripts/backup.sh`.

**1 hour before**
- [ ] Server on power, IP reachable from a student PC, `docker compose ps` all healthy.
- [ ] Open admin monitor; students log in and see the idle home screen (login early to spread load).

**Start**
- [ ] Admin presses **Start** → Enter buttons appear within 5 s.
- [ ] Watch monitor: joined count, errors, tab switches.

**During**
- [ ] Use **Extend** if network problems happened; **Reset** attempt only for confirmed technical failures.

**End**
- [ ] Wait for all submitted (or press **Stop**).
- [ ] Results auto-compute; check summary; adjust assignment marks if needed.
- [ ] **Publish & Send Mails**; watch queue; retry failed.
- [ ] Export Excel; run backup.

---

## 20. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Correct answer leak | Server strips; automated test scans responses |
| 300 logins at once | bcrypt cost 8, 2 API processes, students log in early, Enter button staggers load |
| Network drops mid-exam | Retry queue, server timer, same order on resume |
| Clock tampering | Server-only deadline |
| Lost data on crash | Postgres volume, answer saved on every click, backups |
| Mail limits | Rate-limited queue; Gmail 500/day; Brevo 300/day; resume next day |
| Two agents edit same file | Exclusive path ownership + worktrees + Lead-owned shared files |
| Contract drift | Zod shared types; contract frozen after Phase 0 |
| Late joiners confusion | Join policy explained in UI; cutoff option |
| NPTEL rules differ | All thresholds/tiers configurable per exam; verify against current NPTEL scheme |

---

## 21. Definition of done

- [ ] Fresh clone: `docker compose up -d` works; admin can log in.
- [ ] Excel template downloads; filled file uploads with preview and clear errors; questions appear in bank.
- [ ] Admin can create an exam with either join policy and run start/stop/extend.
- [ ] Student sees idle home, Enter appears on start, 50 shuffled questions (different per student), answering never reloads the page, refresh resumes, submit returns home.
- [ ] Late-join behaviour matches the chosen policy (10:30 join → ends 11:00 or 11:30).
- [ ] Results: raw → scaled 75 + assignment 25 → pass/fail + tier; topic strong/weak per student and per class; Excel export.
- [ ] Publish sends one mail per student with correct PDF; failures retried and visible.
- [ ] k6: 300 VUs meet thresholds. E2E suite green. Security tests green.
- [ ] `README.md` and `docs/runbook.md` complete.
