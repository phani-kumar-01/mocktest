import { describe, it, expect, beforeAll } from 'vitest';
import { buildApp } from '../../app.js';
import { db, schema } from '../../db/client.js';
import { migrate } from '../../db/migrate.js';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { FastifyInstance } from 'fastify';

describe('Results & Scoring Module (Agent H)', () => {
  let app: FastifyInstance;
  let adminSid: string;
  let examId: string;
  let studentId: string;
  let attemptId: string;

  beforeAll(async () => {
    process.env.USE_PGLITE = 'true';
    await migrate();
    app = await buildApp();

    // Create admin & login
    const adminPass = await bcrypt.hash('adminpass', 8);
    await db.delete(schema.admins).where(eq(schema.admins.username, 'res_admin'));
    await db.insert(schema.admins).values({
      username: 'res_admin',
      name: 'Results Admin',
      passwordHash: adminPass
    });

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/admin/login',
      payload: { username: 'res_admin', password: 'adminpass' }
    });
    adminSid = loginRes.cookies.find(c => c.name === 'sid')!.value;

    // Create student
    const studentPass = await bcrypt.hash('studpass', 8);
    const [student] = await db.insert(schema.students).values({
      rollNo: 'RES_STUD_1',
      name: 'Scored Student',
      passwordHash: studentPass
    }).returning();
    studentId = student.id;

    // Create subject & questions
    const [subject] = await db.insert(schema.subjects).values({ name: 'Data Mining' }).returning();
    
    // 4 questions in topic "Clustering" (1 mark each)
    const qids: string[] = [];
    for (let i = 1; i <= 4; i++) {
      const [q] = await db.insert(schema.questions).values({
        subjectId: subject.id,
        topic: 'Clustering',
        subtopic: 'K-Means',
        bodyMd: `Clustering question ${i}`,
        optionA: 'Opt A',
        optionB: 'Opt B',
        optionC: 'Opt C',
        optionD: 'Opt D',
        correct: 'a',
        marks: '1',
        negative: '0'
      }).returning();
      qids.push(q.id);
    }

    // Exam with 20 assignment marks (out of 25)
    const [exam] = await db.insert(schema.exams).values({
      title: 'Data Mining Exam',
      subjectId: subject.id,
      status: 'ended',
      durationMinutes: 60,
      questionsPerStudent: 4,
      assignmentMarks: '20',
      assignmentMax: '25',
      examMax: '75',
      passTotal: '40',
      passAssignmentMin: '10',
      passExamMin: '30'
    }).returning();
    examId = exam.id;

    await db.insert(schema.examQuestions).values(
      qids.map(qid => ({ examId, questionId: qid }))
    );

    // Create attempt for student where student answered 3 correct and 1 wrong
    // Raw score = 3, maxRaw = 4 -> examScaled = (3/4)*75 = 56.25
    // Total = 20 + 56.25 = 76.25 -> Passed, Tier: Elite + Silver
    const [attempt] = await db.insert(schema.attempts).values({
      examId,
      studentId,
      status: 'submitted',
      deadlineAt: new Date(),
      seed: 12345,
      questionOrder: qids.map(qid => ({ qid, options: ['a', 'b', 'c', 'd'] }))
    }).returning();
    attemptId = attempt.id;

    // Answers: 3 'a' (correct), 1 'b' (wrong)
    await db.insert(schema.answers).values([
      { attemptId, questionId: qids[0], chosen: 'a' },
      { attemptId, questionId: qids[1], chosen: 'a' },
      { attemptId, questionId: qids[2], chosen: 'a' },
      { attemptId, questionId: qids[3], chosen: 'b' }
    ]);
  });

  it('computes results and matches NPTEL formula', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/exams/${examId}/compute`,
      cookies: { sid: adminSid }
    });

    expect(res.statusCode).toBe(200);

    // Fetch results
    const resultsRes = await app.inject({
      method: 'GET',
      url: `/api/admin/exams/${examId}/results`,
      cookies: { sid: adminSid }
    });

    expect(resultsRes.statusCode).toBe(200);
    const body = JSON.parse(resultsRes.body);
    expect(body.rows.length).toBe(1);

    const studentResult = body.rows[0];
    expect(studentResult.correctCount).toBe(3);
    expect(studentResult.wrongCount).toBe(1);
    expect(studentResult.rawScore).toBe(3);
    expect(studentResult.examScaled).toBe(56.25);
    expect(studentResult.assignmentMarks).toBe(20);
    expect(studentResult.total).toBe(76.25);
    expect(studentResult.passed).toBe(true);
    expect(studentResult.gradeLabel).toBe('Elite + Silver');
  });

  it('topic scores are computed correctly (3/4 = 75% -> strong)', async () => {
    const matrixRes = await app.inject({
      method: 'GET',
      url: `/api/admin/exams/${examId}/topic-matrix`,
      cookies: { sid: adminSid }
    });

    expect(matrixRes.statusCode).toBe(200);
    const body = JSON.parse(matrixRes.body);
    expect(body.topics).toContain('Clustering');
    expect(body.rows[0].scores['Clustering'].pct).toBe(75);
    expect(body.rows[0].scores['Clustering'].level).toBe('strong');
  });
});
