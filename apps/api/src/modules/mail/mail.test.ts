import { describe, it, expect, beforeAll } from 'vitest';
import { buildApp } from '../../app.js';
import { db, schema } from '../../db/client.js';
import { migrate } from '../../db/migrate.js';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { FastifyInstance } from 'fastify';
import { generateStudentReportPdf } from './pdf.js';

describe('Mail & PDF Module (Agent I)', () => {
  let app: FastifyInstance;
  let adminSid: string;
  let examId: string;
  let studentId: string;

  beforeAll(async () => {
    process.env.USE_PGLITE = 'true';
    await migrate();
    app = await buildApp();

    // Create admin & login
    const adminPass = await bcrypt.hash('adminpass', 8);
    await db.delete(schema.admins).where(eq(schema.admins.username, 'mail_admin'));
    await db.insert(schema.admins).values({
      username: 'mail_admin',
      name: 'Mail Admin',
      passwordHash: adminPass
    });

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/admin/login',
      payload: { username: 'mail_admin', password: 'adminpass' }
    });
    adminSid = loginRes.cookies.find(c => c.name === 'sid')!.value;

    // Create student with email
    const studentPass = await bcrypt.hash('studpass', 8);
    const [student] = await db.insert(schema.students).values({
      rollNo: 'MAIL_STUD_1',
      name: 'Bob Mailer',
      email: 'bob@example.com',
      passwordHash: studentPass
    }).returning();
    studentId = student.id;

    // Create subject & questions
    const [subject] = await db.insert(schema.subjects).values({ name: 'Web Dev' }).returning();
    const [q] = await db.insert(schema.questions).values({
      subjectId: subject.id,
      topic: 'CSS',
      bodyMd: 'What does CSS stand for?',
      optionA: 'Cascading Style Sheets',
      optionB: 'Computer Style Sheets',
      optionC: 'Creative Style Sheets',
      optionD: 'Color Style Sheets',
      correct: 'a'
    }).returning();

    // Create exam & attempt
    const [exam] = await db.insert(schema.exams).values({
      title: 'Web Dev Final',
      subjectId: subject.id,
      status: 'ended',
      durationMinutes: 60,
      questionsPerStudent: 1
    }).returning();
    examId = exam.id;

    await db.insert(schema.examQuestions).values({ examId, questionId: q.id });

    const [attempt] = await db.insert(schema.attempts).values({
      examId,
      studentId,
      status: 'submitted',
      deadlineAt: new Date(),
      seed: 999,
      questionOrder: [{ qid: q.id, options: ['a', 'b', 'c', 'd'] }]
    }).returning();

    await db.insert(schema.answers).values({
      attemptId: attempt.id,
      questionId: q.id,
      chosen: 'a'
    });
  });

  it('generates a valid PDF buffer with %PDF magic header', async () => {
    const pdfBuffer = await generateStudentReportPdf(examId, studentId);
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(500);
    // Magic header check
    expect(pdfBuffer.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('POST /api/admin/exams/:id/publish enqueues mail into queue', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/exams/${examId}/publish`,
      cookies: { sid: adminSid }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.enqueuedCount).toBe(1);

    // Verify row in mail_queue
    const queueItems = await db.select().from(schema.mailQueue).where(eq(schema.mailQueue.examId, examId));
    expect(queueItems.length).toBe(1);
    expect(queueItems[0].toEmail).toBe('bob@example.com');
  });

  it('GET /api/admin/exams/:id/students/:studentId/report.pdf streams PDF', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/admin/exams/${examId}/students/${studentId}/report.pdf`,
      cookies: { sid: adminSid }
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.rawPayload.subarray(0, 4).toString()).toBe('%PDF');
  });
});
