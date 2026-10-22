# Phase 1 Sub-Agents Task Ownership

- Agent A: Auth & Sessions (`apps/api/src/modules/auth/**`)
- Agent B: Student Exam Engine (`apps/api/src/modules/student-exam/**`, `apps/api/src/jobs/autosubmit.ts`)
- Agent C: Admin Exams, Control & Students (`apps/api/src/modules/admin-exams/**`, `apps/api/src/jobs/scheduler.ts`)
- Agent D: Question Bank & Excel (`apps/api/src/modules/questions/**`)
- Agent E: Student UI (`apps/web/src/student/**`)
- Agent F: Admin UI Part 1 (`apps/web/src/admin/shell/**`, `admin/students/**`, `admin/questions/**`, `admin/exams/**`, `admin/index.tsx`)
- Agent G: Admin UI Part 2 (`apps/web/src/admin/monitor/**`, `admin/results/**`, `admin/dashboard/**`)
- Agent H: Scoring & Analytics (`apps/api/src/modules/results/**`, `apps/api/src/jobs/results-compute.ts`)
- Agent I: Mail & PDF (`apps/api/src/modules/mail/**`, `apps/api/src/jobs/mailqueue.ts`)
- Agent J: DevOps, Seed & QA (`docker-compose.yml`, `deploy/**`, `scripts/**`, `tests/**`, `docs/runbook.md`)
