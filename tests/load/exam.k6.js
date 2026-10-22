import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const saveDuration = new Trend('save_duration');
const failureRate = new Rate('failure_rate');

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '1m', target: 150 },
    { duration: '2m', target: 300 },
    { duration: '1m', target: 300 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    'http_req_duration{name:save}': ['p(95)<500'],
    'failure_rate': ['rate<0.005'],
    'http_req_failed': ['rate<0.005']
  }
};

const BASE_URL = __ENV.TARGET_URL || 'http://localhost:3000';
const EXAM_ID = __ENV.EXAM_ID || 'exam-placeholder-id';

export default function () {
  const vuId = (__VU % 300) + 1;
  const rollNo = `CS21${vuId.toString().padStart(3, '0')}`;
  const password = rollNo;

  // 1. Student Login
  const loginRes = http.post(
    `${BASE_URL}/api/auth/student/login`,
    JSON.stringify({ rollNo, password }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'login' } }
  );

  const loginSuccess = check(loginRes, {
    'login status is 200': (r) => r.status === 200,
  });
  failureRate.add(!loginSuccess);
  if (!loginSuccess) return;

  sleep(1);

  // 2. Poll Student Home
  const homeRes = http.get(`${BASE_URL}/api/student/home`, { tags: { name: 'home' } });
  check(homeRes, { 'home status is 200': (r) => r.status === 200 });

  sleep(1);

  // 3. Start Exam Attempt
  const startRes = http.post(`${BASE_URL}/api/student/exams/${EXAM_ID}/start`, null, { tags: { name: 'start' } });
  const startOk = check(startRes, { 'start status is 200 or 201': (r) => r.status === 200 || r.status === 201 });
  failureRate.add(!startOk);
  if (!startOk) return;

  const attemptId = startRes.json('attemptId');
  if (!attemptId) return;

  // 4. Fetch Attempt Questions
  const attemptRes = http.get(`${BASE_URL}/api/student/attempts/${attemptId}`, { tags: { name: 'attempt' } });
  const questions = attemptRes.json('questions') || [];
  check(attemptRes, { 'attempt loaded': (r) => r.status === 200 && questions.length > 0 });

  // 5. Answer 50 questions
  const optionsKeys = ['a', 'b', 'c', 'd'];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const chosen = optionsKeys[i % 4];

    const saveStart = Date.now();
    const saveRes = http.put(
      `${BASE_URL}/api/student/attempts/${attemptId}/answers/${q.qid}`,
      JSON.stringify({ chosen }),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: 'save' }
      }
    );
    const saveLatency = Date.now() - saveStart;
    saveDuration.add(saveLatency);

    const savedOk = check(saveRes, { 'answer saved': (r) => r.status === 200 });
    failureRate.add(!savedOk);

    // Realistic think time between answers (1-2s scaled for load test)
    sleep(1.5);
  }

  // 6. Final Submit
  const submitRes = http.post(`${BASE_URL}/api/student/attempts/${attemptId}/submit`, null, { tags: { name: 'submit' } });
  check(submitRes, { 'exam submitted': (r) => r.status === 200 });

  sleep(2);
}
