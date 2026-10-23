import { describe, it, expect, beforeAll } from 'vitest';
import { buildApp } from '../../app.js';
import { db, schema } from '../../db/client.js';
import { migrate } from '../../db/migrate.js';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { FastifyInstance } from 'fastify';

describe('Admin Exams & Control Module (Agent C)', () => {
  let app: FastifyInstance;
  let adminSid: string;
  let subjectId: string;
  let examId: string;

  beforeAll(async () => {
    process.env.USE_PGLITE = 'true';
    await migrate();
    app = await buildApp();

    // Create admin & login
    const adminPass = await bcrypt.hash('adminpass', 8);
    const existingAdmin = await db.select().from(schema.admins).where(eq(schema.admins.username, 'exam_admin'));
    if (existingAdmin.length === 0) {
      await db.insert(schema.admins).values({
        username: 'exam_admin',
        name: 'Exam Admin',
        passwordHash: adminPass
      });
    }

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/admin/login',
      payload: { username: 'exam_admin', password: 'adminpass' }
    });
    adminSid = loginRes.cookies.find(c => c.name === 'sid')!.value;

    // Create subject
    const [subj] = await db.insert(schema.subjects).values({ name: 'Data Structures' }).returning();
    subjectId = subj.id;
  });

  it('admin can create exam in draft status', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/exams',
      cookies: { sid: adminSid },
      payload: {
        title: 'Midterm DS Exam',
        subjectId,
        durationMinutes: 45,
        questionsPerStudent: 10,
        joinPolicy: 'FIXED_END'
      }
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.title).toBe('Midterm DS Exam');
    expect(body.status).toBe('draft');
    examId = body.id;
  });

  it('admin can start, extend, and stop exam', async () => {
    // Start
    const startRes = await app.inject({
      method: 'POST',
      url: `/api/admin/exams/${examId}/start`,
      cookies: { sid: adminSid }
    });
    expect(startRes.statusCode).toBe(200);
    const startBody = JSON.parse(startRes.body);
    expect(startBody.status).toBe('live');

    // Extend
    const extendRes = await app.inject({
      method: 'POST',
      url: `/api/admin/exams/${examId}/extend`,
      cookies: { sid: adminSid },
      payload: { minutes: 10 }
    });
    expect(extendRes.statusCode).toBe(200);
    const extendBody = JSON.parse(extendRes.body);
    expect(extendBody.extraMinutes).toBe(10);

    // Stop
    const stopRes = await app.inject({
      method: 'POST',
      url: `/api/admin/exams/${examId}/stop`,
      cookies: { sid: adminSid }
    });
    expect(stopRes.statusCode).toBe(200);
    const stopBody = JSON.parse(stopRes.body);
    expect(stopBody.status).toBe('ended');
  });

  it('admin can create student and reset password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/students',
      cookies: { sid: adminSid },
      payload: {
        rollNo: 'CS_TEST_99',
        name: 'Alice Wonder',
        email: 'alice@test.edu',
        batch: '2026'
      }
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.rollNo).toBe('CS_TEST_99');

    // Reset password
    const resetRes = await app.inject({
      method: 'POST',
      url: `/api/admin/students/${body.id}/reset-password`,
      cookies: { sid: adminSid }
    });
    expect(resetRes.statusCode).toBe(200);
  });

  it('admin can restart exam with separate instance mode (Run 2 isolation)', async () => {
    const restartRes = await app.inject({
      method: 'POST',
      url: `/api/admin/exams/${examId}/restart`,
      cookies: { sid: adminSid },
      payload: { mode: 'separate' }
    });

    expect(restartRes.statusCode).toBe(201);
    const body = JSON.parse(restartRes.body);
    expect(body.instanceNumber).toBe(2);
    expect(body.title).toContain('Run 2');
    expect(body.status).toBe('live');
    expect(body.parentExamId).toBe(examId);
  });

  it('admin can restart exam with merge mode (reopening instance)', async () => {
    // Reopen original exam in merge mode
    const mergeRes = await app.inject({
      method: 'POST',
      url: `/api/admin/exams/${examId}/restart`,
      cookies: { sid: adminSid },
      payload: { mode: 'merge' }
    });

    expect(mergeRes.statusCode).toBe(200);
    const body = JSON.parse(mergeRes.body);
    expect(body.id).toBe(examId);
    expect(body.status).toBe('live');
  });
});
