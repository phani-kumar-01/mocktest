# NPTEL Mock Exam Portal — Exam-Day Runbook

Operational guide for college LAN exam administrators and proctors.

---

## 1. Day Before the Exam

- [ ] **Upload Question Bank**:
  - Download template from `Admin -> Question Bank -> Download Template`.
  - Fill questions, options, code snippets, and correct answers.
  - Upload Excel file, verify zero errors in preview, and click **Confirm & Save**.
  - Ensure at least 3 questions per topic for statistically sound topic analysis.
- [ ] **Import Student Roster**:
  - Go to `Admin -> Students -> Import CSV / XLSX`.
  - Ensure student email addresses are filled accurately so reports can be emailed.
  - Note: Default student password is their Roll Number.
- [ ] **Create & Configure Exam**:
  - Title, Subject, Duration (e.g. 60 min), Questions per student (e.g. 50).
  - Select Join Policy:
    - `FIXED_END`: Everyone ends at the same time (best for lab synchrony).
    - `FULL_DURATION`: Late joiners get full 60 minutes from join time.
  - Set Assignment Score (e.g. 20/25) for NPTEL scoring scaling.
- [ ] **Verify SMTP Email**:
  - Go to `Admin -> Results` or trigger test email (`POST /api/admin/mail/test`).
- [ ] **Run Rehearsal & Database Backup**:
  - Have 3–5 lab PCs log in and take a short test.
  - Run `./scripts/backup.sh` to produce a clean snapshot.

---

## 2. 1 Hour Before Exam

- [ ] Ensure Server PC has static IP (e.g. `192.168.1.10`), sleep mode disabled, wired LAN connection.
- [ ] Verify Docker services: `docker compose ps` (all healthy: db, api, worker, web).
- [ ] Open `http://<SERVER_IP>/admin` on Proctor/Admin PC.
- [ ] Instruct students to sit at PCs and log in to `http://<SERVER_IP>`.
- [ ] Students will see **"No Exam Live Right Now"** idle screen. Logging in early spreads authentication load.

---

## 3. Exam Start

- [ ] Admin clicks **"Start Now ▶"** on `Admin -> Exams`.
- [ ] Within 5 seconds, all student screens automatically show the **"Enter Exam"** button (polling every 5s, no page refresh required).
- [ ] Open `Admin -> Live Monitor`:
  - Watch `Not Joined` count drop as students enter.
  - Watch real-time answer progress bars.
  - Monitor `Tab Switches` badge for anti-cheat audit.

---

## 4. During the Exam

- [ ] **Network Glitch on Student PC**:
  - Student PC can refresh or reconnect at any time without losing answers.
  - Local retry queue automatically flushes any unsent answers upon reconnection.
  - Exam deadline is server-authoritative.
- [ ] **Hardware Failure on Student PC**:
  - Move student to a spare PC.
  - Student logs in with their roll number (invalidates old session automatically).
  - Student clicks "Resume Exam" — identical question order and saved answers restore.
- [ ] **Extending Exam Time**:
  - If a lab-wide issue occurred, click **"+ Extend Time"** on the Exam card (+5m, +10m).
  - All active student timers will immediately extend synchronously.
- [ ] **Resetting an Attempt**:
  - Only for confirmed hardware or corrupt attempt issues. Click **"Reset"** in Live Monitor.

---

## 5. Exam End & Results Publishing

- [ ] When duration finishes or when Admin clicks **"Stop Exam ⏹"**:
  - Any remaining in-progress attempts are auto-submitted immediately.
  - Results and topic scores auto-compute in the background.
- [ ] Go to `Admin -> Results & Analytics`:
  - Verify Pass Rate, Average Score, and Score Distribution.
  - Check Class Weak Topics to guide post-exam review sessions.
  - Click **"Export Excel"** for departmental grading records.
- [ ] **Publish & Send Emails**:
  - Click **"✉ Publish & Send Mails"**.
  - Background worker generates personalized 2-page PDF scorecards and dispatches them via SMTP.
  - Monitor live progress in the **Email Queue Tracker** tab.
  - If any emails fail due to SMTP throttling, click **"↺ Retry Failed Sends"**.
- [ ] Run post-exam backup: `./scripts/backup.sh`.
