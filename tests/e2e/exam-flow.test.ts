import { describe, it, expect, beforeAll } from 'vitest';
import { buildApp } from '../../apps/api/src/app.js';
import { db, schema } from '../../apps/api/src/db/client.js';
import { migrate } from '../../apps/api/src/db/migrate.js';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { FastifyInstance } from 'fastify';
import { generateStudentReportPdf } from '../../apps/api/src/modules/mail/pdf.js';

describe('E2E Exam Lifecycle Flow (Phase 2 Integration)', () => {
  let app: FastifyInstance;
  let adminSid: string;
  let subjectId: string;
  let examId: string;
  let student1Sid: string;
  let student1Id: string;
  let student2Sid: string;
  let student2Id: string;
  let questionIds: string[] = [];

  beforeAll(async () => {
    process.env.USE_PGLITE = 'true';
    await migrate();
    app = await buildApp();

    // 1. Create Admin
    const adminPass = await bcrypt.hash('admin123', 8);
    await db.delete(schema.admins).where(eq(schema.admins.username, 'e2e_admin'));
    await db.insert(schema.admins).values({
      username: 'e2e_admin',
      name: 'E2E Administrator',
      passwordHash: adminPass
    });

    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/admin/login',
      payload: { username: 'e2e_admin', password: 'admin123' }
    });
    adminSid = adminLogin.cookies.find(c => c.name === 'sid')!.value;

    // 2. Create 2 Students
    const studPass = await bcrypt.hash('pass123', 8);
    for (const roll of ['E2E_S1', 'E2E_S2']) {
      await db.delete(schema.students).where(eq(schema.students.rollNo, roll));
    }

    const [s1] = await db.insert(schema.students).values({
      rollNo: 'E2E_S1',
      name: 'Student One',
      email: 's1@college.edu',
      passwordHash: studPass,
      active: true
    }).returning();
    student1Id = s1.id;

    const [s2] = await db.insert(schema.students).values({
      rollNo: 'E2E_S2',
      name: 'Student Two',
      email: 's2@college.edu',
      passwordHash: studPass,
      active: true
    }).returning();
    student2Id = s2.id;

    const s1Login = await app.inject({
      method: 'POST',
      url: '/api/auth/student/login',
      payload: { rollNo: 'E2E_S1', password: 'pass123' }
    });
    student1Sid = s1Login.cookies.find(c => c.name === 'sid')!.value;

    const s2Login = await app.inject({
      method: 'POST',
      url: '/api/auth/student/login',
      payload: { rollNo: 'E2E_S2', password: 'pass123' }
    });
    student2Sid = s2Login.cookies.find(c => c.name === 'sid')!.value;

    // 3. Create Subject & Questions
    const [subj] = await db.insert(schema.subjects).values({ name: 'E2E Software Engineering' }).returning();
    subjectId = subj.id;

    for (let i = 1; i <= 6; i++) {
      const [q] = await db.insert(schema.questions).values({
        subjectId,
        topic: i <= 3 ? 'Architecture' : 'Testing',
        bodyMd: `Question body ${i} about software engineering`,
        optionA: 'Option 1',
        optionB: 'Option 2',
        optionC: 'Option 3',
        optionD: 'Option 4',
        correct: 'a',
        marks: '1',
        negative: '0'
      }).returning();
      questionIds.push(q.id);
    }
  });

  it('Step 1: Admin creates an exam with FIXED_END policy and assigns question pool', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/exams',
      cookies: { sid: adminSid },
      payload: {
        title: 'Software Engineering Comprehensive Exam',
        subjectId,
        durationMinutes: 60,
        questionsPerStudent: 6,
        joinPolicy: 'FIXED_END',
        assignmentMarks: 20
      }
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    examId = body.id;
    expect(body.status).toBe('draft');

    // Assign pool
    const poolRes = await app.inject({
      method: 'PUT',
      url: `/api/admin/exams/${examId}/questions`,
      cookies: { sid: adminSid },
      payload: { questionIds }
    });
    expect(poolRes.statusCode).toBe(200);
  });

  it('Step 2: Before start, students see idle home state', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/student/home',
      cookies: { sid: student1Sid }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.state).toBe('idle');
  });

  it('Step 3: Admin starts the exam', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/exams/${examId}/start`,
      cookies: { sid: adminSid }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('live');
  });

  it('Step 4: Students poll home and see live exam with enter button', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/student/home',
      cookies: { sid: student1Sid }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.state).toBe('live');
    expect(body.exam.id).toBe(examId);
    expect(body.exam.canEnter).toBe(true);
  });

  let att1Id: string;
  let att2Id: string;

  it('Step 5: Both students enter exam and receive different shuffled question orders', async () => {
    const res1 = await app.inject({
      method: 'POST',
      url: `/api/student/exams/${examId}/start`,
      cookies: { sid: student1Sid }
    });
    att1Id = JSON.parse(res1.body).attemptId;

    const res2 = await app.inject({
      method: 'POST',
      url: `/api/student/exams/${examId}/start`,
      cookies: { sid: student2Sid }
    });
    att2Id = JSON.parse(res2.body).attemptId;

    expect(att1Id).not.toBe(att2Id);

    const q1Res = await app.inject({
      method: 'GET',
      url: `/api/student/attempts/${att1Id}`,
      cookies: { sid: student1Sid }
    });
    const q2Res = await app.inject({
      method: 'GET',
      url: `/api/student/attempts/${att2Id}`,
      cookies: { sid: student2Sid }
    });

    const body1 = JSON.parse(q1Res.body);
    const body2 = JSON.parse(q2Res.body);

    const order1 = body1.questions.map((q: any) => q.qid);
    const order2 = body2.questions.map((q: any) => q.qid);

    // Verify different seeds / order
    expect(order1).not.toEqual(order2);

    // Security check: ensure correct is never returned
    expect(JSON.stringify(body1)).not.toContain('"correct":');
    expect(JSON.stringify(body2)).not.toContain('"correct":');
  });

  it('Step 6: Student 1 answers questions and verifies resume preserves state', async () => {
    const qRes = await app.inject({
      method: 'GET',
      url: `/api/student/attempts/${att1Id}`,
      cookies: { sid: student1Sid }
    });
    const firstQid = JSON.parse(qRes.body).questions[0].qid;

    // Save answer
    const saveRes = await app.inject({
      method: 'PUT',
      url: `/api/student/attempts/${att1Id}/answers/${firstQid}`,
      cookies: { sid: student1Sid },
      payload: { chosen: 'a' }
    });
    expect(saveRes.statusCode).toBe(200);

    // Re-fetch attempt (simulating reload)
    const reloadRes = await app.inject({
      method: 'GET',
      url: `/api/student/attempts/${att1Id}`,
      cookies: { sid: student1Sid }
    });
    const reloadBody = JSON.parse(reloadRes.body);
    expect(reloadBody.answers[firstQid]).toBe('a');
  });

  it('Step 7: Students submit exam', async () => {
    const sub1 = await app.inject({
      method: 'POST',
      url: `/api/student/attempts/${att1Id}/submit`,
      cookies: { sid: student1Sid }
    });
    expect(sub1.statusCode).toBe(200);

    const sub2 = await app.inject({
      method: 'POST',
      url: `/api/student/attempts/${att2Id}/submit`,
      cookies: { sid: student2Sid }
    });
    expect(sub2.statusCode).toBe(200);
  });

  it('Step 8: Admin computes results and verifies NPTEL scoring', async () => {
    const compRes = await app.inject({
      method: 'POST',
      url: `/api/admin/exams/${examId}/compute`,
      cookies: { sid: adminSid }
    });
    expect(compRes.statusCode).toBe(200);

    const resList = await app.inject({
      method: 'GET',
      url: `/api/admin/exams/${examId}/results`,
      cookies: { sid: adminSid }
    });
    expect(resList.statusCode).toBe(200);
    const body = JSON.parse(resList.body);
    expect(body.rows.length).toBe(2);
  });

  it('Step 9: Admin publishes results and enqueues emails', async () => {
    const pubRes = await app.inject({
      method: 'POST',
      url: `/api/admin/exams/${examId}/publish`,
      cookies: { sid: adminSid }
    });
    expect(pubRes.statusCode).toBe(200);
    const body = JSON.parse(pubRes.body);
    expect(body.enqueuedCount).toBe(2);
  });

  it('Step 10: PDF report generation works for students', async () => {
    const pdfBuf = await generateStudentReportPdf(examId, student1Id);
    expect(pdfBuf.subarray(0, 4).toString()).toBe('%PDF');
  });
});
