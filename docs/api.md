# NPTEL Mock Exam Portal — API Contract

Base path `/api`. JSON everywhere. Errors: `{ "error": { "code": "STRING", "message": "text" } }` with proper HTTP status. Auth via httpOnly cookie `sid`. Roles: `student`, `admin`.

## 1. Auth (/api/auth)
- `POST /auth/student/login` - `{rollNo, password}` -> `{user: {id, rollNo, name, mustChangePassword}}` + sets httpOnly `sid` cookie. Revokes older student sessions.
- `POST /auth/admin/login` - `{username, password}` -> `{user}` + sets httpOnly `sid` cookie.
- `POST /auth/logout` -> `204`
- `GET /auth/me` -> `{role, user}` or `401`
- `POST /auth/change-password` -> `{oldPassword, newPassword}` -> `204`

## 2. Student Engine (/api/student)
- `GET /student/home` -> `{ state: "idle" | "live" | "submitted", exam?: {id, title, durationMinutes, canEnter, reason?, remainingSeconds?}, attemptId?, alreadySubmitted?: boolean }`
- `POST /student/exams/:examId/start` -> `{attemptId}`
- `GET /student/attempts/:id` -> `{ serverTime, deadlineAt, remainingSeconds, status, questions: [{index, qid, bodyMd, code, codeLang, options: [{key, text}]}], answers: {[qid]: key} }` (Never includes correct answers or topics)
- `PUT /student/attempts/:id/answers/:qid` -> `{chosen: "a"|"b"|"c"|"d"|null}` -> `{saved: true, remainingSeconds}`
- `POST /student/attempts/:id/submit` -> `{status: "submitted"}` (idempotent)
- `POST /student/attempts/:id/tab-event` -> `204`

## 3. Admin Exams & Control (/api/admin)
- `GET /admin/exams` -> list
- `POST /admin/exams` -> create
- `GET /admin/exams/:id` -> details
- `PUT /admin/exams/:id` -> update
- `DELETE /admin/exams/:id` -> delete (draft only)
- `PUT /admin/exams/:id/questions` -> `{questionIds: []}` or `{subjectId, topics: []}`
- `POST /admin/exams/:id/start` -> live
- `POST /admin/exams/:id/stop` -> ended + force-submit all in-progress
- `POST /admin/exams/:id/extend` -> `{minutes}` -> add extra_minutes + extend deadlines
- `GET /admin/exams/:id/monitor` -> counts + student progress list
- `POST /admin/attempts/:id/force-submit` -> submit
- `POST /admin/attempts/:id/reset` -> delete attempt and answers
- `GET /admin/students` -> list
- `POST /admin/students` -> create
- `POST /admin/students/import` -> multipart CSV/XLSX
- `POST /admin/students/:id/reset-password` -> reset to default roll_no

## 4. Question Bank (/api/admin)
- `GET /admin/subjects` -> list
- `POST /admin/subjects` -> create
- `GET /admin/questions/template.xlsx` -> download template
- `POST /admin/questions/import?dryRun=true` -> parse & validate -> `{validCount, errors: [], preview: [], token}`
- `POST /admin/questions/import/confirm` -> `{token}` -> `{imported}`
- `GET /admin/questions` -> list with filters & pagination
- `PUT /admin/questions/:id` -> update
- `DELETE /admin/questions/:id` -> delete / soft-delete
- `GET /admin/questions/topics?subjectId=` -> topic/subtopic summary

## 5. Results & Analytics (/api/admin)
- `POST /admin/exams/:id/compute` -> (re)computes results + topic scores
- `GET /admin/exams/:id/results` -> rows + summary
- `GET /admin/exams/:id/topic-matrix` -> `{topics, rows, classWeak}`
- `GET /admin/exams/:id/students/:studentId/analysis` -> student analysis + wrong questions
- `GET /admin/exams/:id/export.xlsx` -> Excel export
- `PUT /admin/exams/:id/scoring` -> update thresholds/assignment marks -> recompute

## 6. Mail & PDF (/api/admin)
- `POST /admin/exams/:id/publish` -> sets results_published & enqueues mails
- `GET /admin/exams/:id/mail-status` -> status summary
- `POST /admin/exams/:id/mail/retry-failed` -> retry failed jobs
- `GET /admin/exams/:id/students/:studentId/report.pdf` -> generate preview PDF
- `POST /admin/mail/test` -> `{to}` send test email
