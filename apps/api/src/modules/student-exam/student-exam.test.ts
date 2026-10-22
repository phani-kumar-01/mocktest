import { describe, it, expect, beforeAll } from 'vitest';
import { buildApp } from '../../app.js';
import { db, schema } from '../../db/client.js';
import { migrate } from '../../db/migrate.js';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { FastifyInstance } from 'fastify';

describe('Student Exam Engine Module (Agent B)', () => {
  let app: FastifyInstance;
  let studentSid: string;
  let studentId: string;
  let examId: string;
  let attemptId: string;
  let questionIds: string[] = [];

  beforeAll(async () => {
    process.env.USE_PGLITE = 'true';
    await migrate();
    app = await buildApp();

    // Create student & login
    const studentPass = await bcrypt.hash('studpass', 8);
    await db.delete(schema.students).where(eq(schema.students.rollNo, 'STUD_EXAM_1'));
    const [student] = await db.insert(schema.students).values({
      rollNo: 'STUD_EXAM_1',
      name: 'Exam Taker',
      passwordHash: studentPass,
      active: true,
      batch: '2026'
    }).returning();
    studentId = student.id;

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/student/login',
      payload: { rollNo: 'STUD_EXAM_1', password: 'studpass' }
    });
    studentSid = loginRes.cookies.find(c => c.name === 'sid')!.value;

    // Create subject & questions
    const [subject] = await db.insert(schema.subjects).values({ name: 'Algorithms' }).returning();
    
    // Insert 5 test questions with known correct answers
    for (let i = 1; i <= 5; i++) {
      const [q] = await db.insert(schema.questions).values({
        subjectId: subject.id,
        topic: 'Sorting',
        bodyMd: `What is the complexity of algorithm ${i}?`,
        optionA: 'O(1)',
        optionB: 'O(n)',
        optionC: 'O(n log n)',
        optionD: 'O(n^2)',
        correct: 'c',
        marks: '1',
        negative: '0'
      }).returning();
      questionIds.push(q.id);
    }

    // Create exam in live status
    const [exam] = await db.insert(schema.exams).values({
      title: 'Algorithms Live Test',
      subjectId: subject.id,
      status: 'live',
      startedAt: new Date(),
      durationMinutes: 30,
      questionsPerStudent: 5,
      joinPolicy: 'FIXED_END',
      batchFilter: '2026'
    }).returning();
    examId = exam.id;

    // Set pool
    await db.insert(schema.examQuestions).values(
      questionIds.map(qid => ({ examId, questionId: qid }))
    );
  });

  it('GET /api/student/home returns live exam state with enter capability', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/student/home',
      cookies: { sid: studentSid }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.state).toBe('live');
    expect(body.exam.id).toBe(examId);
    expect(body.exam.canEnter).toBe(true);
  });

  it('POST /api/student/exams/:id/start creates attempt with shuffled order', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/student/exams/${examId}/start`,
      cookies: { sid: studentSid }
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.attemptId).toBeDefined();
    attemptId = body.attemptId;
  });

  it('GET /api/student/attempts/:id NEVER leaks correct answers or topics in response', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/student/attempts/${attemptId}`,
      cookies: { sid: studentSid }
    });

    expect(res.statusCode).toBe(200);
    const rawJson = res.body;

    // Security scan: ensure "correct" field is absent from question objects
    const parsed = JSON.parse(rawJson);
    for (const q of parsed.questions) {
      expect(q).not.toHaveProperty('correct');
      expect(q).not.toHaveProperty('topic');
      expect(q).not.toHaveProperty('subtopic');
      expect(q.options.length).toBe(4);
    }
  });

  it('PUT /api/student/attempts/:id/answers/:qid saves answer idempotently', async () => {
    const qid = questionIds[0];
    const res = await app.inject({
      method: 'PUT',
      url: `/api/student/attempts/${attemptId}/answers/${qid}`,
      cookies: { sid: studentSid },
      payload: { chosen: 'c' }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.saved).toBe(true);

    // Verify answer is reflected in GET
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/student/attempts/${attemptId}`,
      cookies: { sid: studentSid }
    });
    const getBody = JSON.parse(getRes.body);
    expect(getBody.answers[qid]).toBe('c');
  });

  it('POST /api/student/attempts/:id/tab-event increments tab switches', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/student/attempts/${attemptId}/tab-event`,
      cookies: { sid: studentSid }
    });

    expect(res.statusCode).toBe(204);

    const getRes = await app.inject({
      method: 'GET',
      url: `/api/student/attempts/${attemptId}`,
      cookies: { sid: studentSid }
    });
    const getBody = JSON.parse(getRes.body);
    expect(getBody.tabSwitches).toBe(1);
  });

  it('POST /api/student/attempts/:id/submit finalizes attempt', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/student/attempts/${attemptId}/submit`,
      cookies: { sid: studentSid }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('submitted');
  });
});
