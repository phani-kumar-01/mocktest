import postgres from 'postgres';
import * as dotenv from 'dotenv';
dotenv.config();

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const sql = postgres(process.env.DATABASE_URL!);

interface RequestStat {
  endpoint: string;
  durationMs: number;
  status: number;
  success: boolean;
  error?: string;
}

const stats: RequestStat[] = [];

function recordStat(stat: RequestStat) {
  stats.push(stat);
}

// Custom HTTP Client supporting Cookies & X-Forwarded-For
async function request(
  method: string,
  path: string,
  body?: any,
  cookies?: string,
  simulatedIp?: string
): Promise<{ status: number; data: any; cookies?: string; durationMs: number }> {
  const headers: Record<string, string> = {};
  if (cookies) headers['Cookie'] = cookies;
  if (simulatedIp) headers['X-Forwarded-For'] = simulatedIp;
  if (body) headers['Content-Type'] = 'application/json';

  const start = Date.now();
  let status = 0;
  let data: any = null;
  let resCookies: string | undefined = cookies;

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    status = res.status;
    const durationMs = Date.now() - start;

    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const match = setCookie.match(/sid=([^;]+)/);
      if (match) resCookies = `sid=${match[1]}`;
    }

    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    const isSuccess = status >= 200 && status < 400;
    recordStat({
      endpoint: `${method} ${path.replace(/\/[a-f0-9-]{36}/g, '/:id')}`,
      durationMs,
      status,
      success: isSuccess,
      error: !isSuccess ? (data?.error?.message || `HTTP ${status}`) : undefined
    });

    return { status, data, cookies: resCookies, durationMs };
  } catch (err: any) {
    const durationMs = Date.now() - start;
    recordStat({
      endpoint: `${method} ${path.replace(/\/[a-f0-9-]{36}/g, '/:id')}`,
      durationMs,
      status: 0,
      success: false,
      error: err.message
    });
    return { status: 0, data: null, cookies: resCookies, durationMs };
  }
}

async function runStressTest() {
  console.log('========================================================================');
  console.log('🚀 NPTEL MOCK EXAM PORTAL — 500 CONCURRENT STUDENTS STRESS TEST');
  console.log(`Target: ${BASE_URL} (Render Free Tier Simulation: 512MB RAM, Shared CPU)`);
  console.log('========================================================================\n');

  // 1. Fetch 500 Students
  console.log('Step 1: Fetching 500 student credentials from DB...');
  const students = await sql`SELECT roll_no, name, batch FROM students ORDER BY roll_no LIMIT 500`;
  console.log(`Fetched ${students.length} students from database.`);

  if (students.length < 500) {
    console.error(`Error: Found only ${students.length} students in DB, expected 500.`);
    process.exit(1);
  }

  // 2. Ensure Live Exam
  console.log('\nStep 2: Checking live exam...');
  const [exam] = await sql`SELECT id, title, status FROM exams WHERE status = 'live' LIMIT 1`;
  if (!exam) {
    console.error('Error: No LIVE exam found in DB! Please start an exam first.');
    process.exit(1);
  }
  console.log(`Found live exam: "${exam.title}" (ID: ${exam.id})`);

  // Clear previous attempts for clean test
  console.log('Clearing old attempts for clean benchmark run...');
  await sql`TRUNCATE TABLE topic_scores, results, answers, attempts CASCADE`;

  // Start Background Admin Monitor Polling
  let adminStop = false;
  const adminMonitorTask = (async () => {
    // Admin login
    const adminLogin = await request('POST', '/api/auth/admin/login', { username: 'admin', password: 'admin123' }, undefined, '10.255.0.1');
    const adminCookies = adminLogin.cookies;
    while (!adminStop) {
      if (adminCookies) {
        await request('GET', `/api/admin/exams/${exam.id}/monitor`, undefined, adminCookies, '10.255.0.1');
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  })();

  console.log('\nStep 3: Launching 500 concurrent student workflows...');
  console.log('Each student executes:');
  console.log('  1. Login (POST /api/auth/student/login)');
  console.log('  2. Poll Dashboard (GET /api/student/home)');
  console.log('  3. Start/Enter Exam (POST /api/student/exams/:id/start) [Shuffles pool]');
  console.log('  4. Load Questions (GET /api/student/attempts/:id)');
  console.log('  5. Answer 5 Questions (PUT /api/student/attempts/:id/answers/:qid)');
  console.log('  6. Modify 1 Answer (PUT /api/student/attempts/:id/answers/:qid)');
  console.log('  7. Tab Switch Proctor Event (POST /api/student/attempts/:id/tab-event)');
  console.log('  8. Submit Exam (POST /api/student/attempts/:id/submit)');
  console.log('  9. Verify Submission (GET /api/student/home)\n');

  const testStartTime = Date.now();
  let completedStudents = 0;
  let successfulWorkflows = 0;

  // Concurrency limiter to simulate realistic staggered entry over a 15-20s window
  const CONCURRENCY = 50; // 50 students simultaneously in flight at any given millisecond
  let currentIndex = 0;

  async function studentWorker(student: any, studentIndex: number) {
    const ip = `10.${Math.floor(studentIndex / 250)}.${(studentIndex % 250) + 1}.${(studentIndex % 100) + 10}`;
    const password = student.roll_no.startsWith('BENCH') ? 'bench123' : student.roll_no;

    try {
      // Small randomized stagger (0-3000ms) to simulate real human arrival
      await new Promise(r => setTimeout(r, Math.random() * 3000));

      // 1. Login
      const loginRes = await request('POST', '/api/auth/student/login', {
        rollNo: student.roll_no,
        password
      }, undefined, ip);

      if (!loginRes.cookies) {
        throw new Error(`Login failed for ${student.roll_no}: HTTP ${loginRes.status}`);
      }
      const cookies = loginRes.cookies;

      // 2. Poll Home
      const homeRes = await request('GET', '/api/student/home', undefined, cookies, ip);
      if (homeRes.status !== 200) throw new Error(`Home failed for ${student.roll_no}`);

      // 3. Start Exam
      const startRes = await request('POST', `/api/student/exams/${exam.id}/start`, undefined, cookies, ip);
      const attemptId = startRes.data?.attemptId;
      if (!attemptId) throw new Error(`Start exam failed for ${student.roll_no}: ${JSON.stringify(startRes.data)}`);

      // 4. Load Questions
      const attemptRes = await request('GET', `/api/student/attempts/${attemptId}`, undefined, cookies, ip);
      const questions = attemptRes.data?.questions || [];
      if (questions.length === 0) throw new Error(`No questions loaded for ${student.roll_no}`);

      // 5. Answer 5 Questions
      const options = ['a', 'b', 'c', 'd'];
      for (let qIdx = 0; qIdx < Math.min(5, questions.length); qIdx++) {
        const qid = questions[qIdx].qid;
        const chosen = options[(studentIndex + qIdx) % 4];
        await request('PUT', `/api/student/attempts/${attemptId}/answers/${qid}`, { chosen }, cookies, ip);
      }

      // 6. Modify 1 Answer
      if (questions.length > 0) {
        const qid = questions[0].qid;
        const newChosen = 'c';
        await request('PUT', `/api/student/attempts/${attemptId}/answers/${qid}`, { chosen: newChosen }, cookies, ip);
      }

      // 7. Tab Event (for 30% of students)
      if (studentIndex % 3 === 0) {
        await request('POST', `/api/student/attempts/${attemptId}/tab-event`, undefined, cookies, ip);
      }

      // 8. Submit Exam
      const submitRes = await request('POST', `/api/student/attempts/${attemptId}/submit`, undefined, cookies, ip);
      if (submitRes.status !== 200) throw new Error(`Submit failed for ${student.roll_no}`);

      // 9. Verify Submission
      const postSubmitHome = await request('GET', '/api/student/home', undefined, cookies, ip);
      if (postSubmitHome.data?.state !== 'submitted') {
        throw new Error(`State not submitted for ${student.roll_no}`);
      }

      successfulWorkflows++;
    } catch (e: any) {
      // Handled in stats
    } finally {
      completedStudents++;
      if (completedStudents % 50 === 0 || completedStudents === 500) {
        process.stdout.write(`  Progress: ${completedStudents}/500 students completed (${successfulWorkflows} 100% successful)\r`);
      }
    }
  }

  // Pool executor
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (currentIndex < students.length) {
      const idx = currentIndex++;
      await studentWorker(students[idx], idx);
    }
  });

  await Promise.all(workers);
  const totalDurationSeconds = (Date.now() - testStartTime) / 1000;
  adminStop = true;
  await adminMonitorTask;

  console.log('\n\n========================================================================');
  console.log('📊 STRESS TEST RESULTS & BENCHMARKS');
  console.log('========================================================================\n');

  const totalRequests = stats.length;
  const successfulRequests = stats.filter(s => s.success).length;
  const failedRequests = stats.filter(s => !s.success).length;
  const overallSuccessRate = ((successfulRequests / totalRequests) * 100).toFixed(2);
  const throughputRps = (totalRequests / totalDurationSeconds).toFixed(2);

  console.log(`Total Time Elapsed:     ${totalDurationSeconds.toFixed(2)} seconds`);
  console.log(`Total Students Tested:  500`);
  console.log(`Successful Workflows:   ${successfulWorkflows} / 500 (${((successfulWorkflows / 500) * 100).toFixed(1)}%)`);
  console.log(`Total HTTP Requests:    ${totalRequests}`);
  console.log(`Successful Requests:    ${successfulRequests}`);
  console.log(`Failed Requests:        ${failedRequests}`);
  console.log(`Overall Success Rate:   ${overallSuccessRate}%`);
  console.log(`Throughput:             ${throughputRps} requests/sec\n`);

  // Group by Endpoint
  const endpointMap = new Map<string, number[]>();
  const errorMap = new Map<string, number>();

  for (const s of stats) {
    if (!endpointMap.has(s.endpoint)) {
      endpointMap.set(s.endpoint, []);
    }
    endpointMap.get(s.endpoint)!.push(s.durationMs);

    if (!s.success && s.error) {
      errorMap.set(s.error, (errorMap.get(s.error) || 0) + 1);
    }
  }

  console.log('-----------------------------------------------------------------------------------------------------');
  console.log('| Endpoint                                      | Requests | Avg Latency | P50 (Med) | P95    | P99    | Max Latency |');
  console.log('-----------------------------------------------------------------------------------------------------');

  for (const [ep, times] of endpointMap.entries()) {
    times.sort((a, b) => a - b);
    const count = times.length;
    const avg = (times.reduce((a, b) => a + b, 0) / count).toFixed(1);
    const p50 = times[Math.floor(count * 0.5)];
    const p95 = times[Math.floor(count * 0.95)] || times[count - 1];
    const p99 = times[Math.floor(count * 0.99)] || times[count - 1];
    const max = times[count - 1];

    const paddedEp = ep.padEnd(45, ' ');
    const paddedCount = String(count).padStart(8, ' ');
    const paddedAvg = `${avg}ms`.padStart(11, ' ');
    const paddedP50 = `${p50}ms`.padStart(9, ' ');
    const paddedP95 = `${p95}ms`.padStart(6, ' ');
    const paddedP99 = `${p99}ms`.padStart(6, ' ');
    const paddedMax = `${max}ms`.padStart(11, ' ');

    console.log(`| ${paddedEp} | ${paddedCount} | ${paddedAvg} | ${paddedP50} | ${paddedP95} | ${paddedP99} | ${paddedMax} |`);
  }
  console.log('-----------------------------------------------------------------------------------------------------\n');

  if (errorMap.size > 0) {
    console.log('Errors Encountered:');
    for (const [err, count] of errorMap.entries()) {
      console.log(`  - ${err}: ${count}`);
    }
    console.log('');
  }

  // Database verification
  const [attemptCount] = await sql`SELECT count(*)::int as c FROM attempts WHERE exam_id = ${exam.id}`;
  const [submittedCount] = await sql`SELECT count(*)::int as c FROM attempts WHERE exam_id = ${exam.id} AND status = 'submitted'`;
  const [answersCount] = await sql`SELECT count(*)::int as c FROM answers`;

  console.log('Database Consistency Verification:');
  console.log(`  - Exam attempts created in DB:    ${attemptCount.c} / 500`);
  console.log(`  - Exam attempts submitted in DB:  ${submittedCount.c} / 500`);
  console.log(`  - Total answers persisted in DB:  ${answersCount.c}`);
  console.log('========================================================================\n');

  await sql.end();
}

runStressTest().catch(e => {
  console.error('Stress test fatal error:', e);
  process.exit(1);
});
