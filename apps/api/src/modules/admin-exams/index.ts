import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';
import { db, schema } from '../../db/client.js';
import { requireRole } from '../../lib/session.js';
import { AppError } from '../../lib/errors.js';
import {
  CreateExamSchema,
  UpdateExamSchema,
  ExtendExamSchema,
  CreateStudentSchema,
  UpdateStudentSchema,
  MonitorResponse,
  MonitorStudentRow
} from '@nptel/shared';

const adminExamsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.addHook('preHandler', requireRole('admin'));

  // 1. GET /api/admin/exams
  fastify.get('/admin/exams', async () => {
    return await db.select().from(schema.exams).orderBy(desc(schema.exams.createdAt));
  });

  // 2. POST /api/admin/exams
  fastify.post('/admin/exams', async (request, reply) => {
    const body = CreateExamSchema.parse(request.body);

    const [exam] = await db.insert(schema.exams).values({
      title: body.title,
      subjectId: body.subjectId,
      status: body.scheduledStart && body.autoStart ? 'scheduled' : 'draft',
      scheduledStart: body.scheduledStart ? new Date(body.scheduledStart) : null,
      autoStart: body.autoStart,
      durationMinutes: body.durationMinutes,
      joinPolicy: body.joinPolicy,
      lateJoinCutoffMinutes: body.lateJoinCutoffMinutes,
      hardCloseAt: body.hardCloseAt ? new Date(body.hardCloseAt) : null,
      questionsPerStudent: body.questionsPerStudent,
      shuffleQuestions: body.shuffleQuestions,
      shuffleOptions: body.shuffleOptions,
      negativeMarking: body.negativeMarking,
      batchFilter: body.batchFilter,
      assignmentMarks: String(body.assignmentMarks),
      assignmentMax: String(body.assignmentMax),
      examMax: String(body.examMax),
      passTotal: String(body.passTotal),
      passAssignmentMin: String(body.passAssignmentMin),
      passExamMin: String(body.passExamMin),
      strongThreshold: String(body.strongThreshold),
      weakThreshold: String(body.weakThreshold),
      gradeTiers: body.gradeTiers || undefined,
      createdBy: request.sessionUser!.id
    }).returning();

    return reply.status(201).send(exam);
  });

  // 3. GET /api/admin/exams/:id
  fastify.get('/admin/exams/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [exam] = await db.select().from(schema.exams).where(eq(schema.exams.id, id)).limit(1);
    if (!exam) {
      throw new AppError(404, 'NOT_FOUND', 'Exam not found');
    }

    const pool = await db.select({ questionId: schema.examQuestions.questionId })
      .from(schema.examQuestions)
      .where(eq(schema.examQuestions.examId, id));

    return reply.send({
      ...exam,
      poolCount: pool.length,
      questionIds: pool.map(p => p.questionId)
    });
  });

  // 4. PUT /api/admin/exams/:id
  fastify.put('/admin/exams/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = UpdateExamSchema.parse(request.body);

    const [current] = await db.select().from(schema.exams).where(eq(schema.exams.id, id)).limit(1);
    if (!current) {
      throw new AppError(404, 'NOT_FOUND', 'Exam not found');
    }

    if (current.status === 'live' && body.durationMinutes != null && body.durationMinutes !== current.durationMinutes) {
      throw new AppError(400, 'CANNOT_MODIFY_LIVE', 'Cannot modify duration directly while exam is live. Use extend endpoint instead.');
    }

    const [updated] = await db.update(schema.exams)
      .set({
        title: body.title,
        scheduledStart: body.scheduledStart !== undefined ? (body.scheduledStart ? new Date(body.scheduledStart) : null) : undefined,
        autoStart: body.autoStart,
        durationMinutes: body.durationMinutes,
        joinPolicy: body.joinPolicy,
        lateJoinCutoffMinutes: body.lateJoinCutoffMinutes,
        hardCloseAt: body.hardCloseAt !== undefined ? (body.hardCloseAt ? new Date(body.hardCloseAt) : null) : undefined,
        questionsPerStudent: body.questionsPerStudent,
        shuffleQuestions: body.shuffleQuestions,
        shuffleOptions: body.shuffleOptions,
        negativeMarking: body.negativeMarking,
        batchFilter: body.batchFilter,
        assignmentMarks: body.assignmentMarks != null ? String(body.assignmentMarks) : undefined,
        assignmentMax: body.assignmentMax != null ? String(body.assignmentMax) : undefined,
        examMax: body.examMax != null ? String(body.examMax) : undefined,
        passTotal: body.passTotal != null ? String(body.passTotal) : undefined,
        passAssignmentMin: body.passAssignmentMin != null ? String(body.passAssignmentMin) : undefined,
        passExamMin: body.passExamMin != null ? String(body.passExamMin) : undefined,
        strongThreshold: body.strongThreshold != null ? String(body.strongThreshold) : undefined,
        weakThreshold: body.weakThreshold != null ? String(body.weakThreshold) : undefined,
        gradeTiers: body.gradeTiers
      })
      .where(eq(schema.exams.id, id))
      .returning();

    return reply.send(updated);
  });

  // 5. DELETE /api/admin/exams/:id
  fastify.delete('/admin/exams/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [current] = await db.select().from(schema.exams).where(eq(schema.exams.id, id)).limit(1);
    if (!current) throw new AppError(404, 'NOT_FOUND', 'Exam not found');
    if (current.status !== 'draft') {
      throw new AppError(400, 'CANNOT_DELETE', 'Only draft exams can be deleted');
    }

    await db.delete(schema.exams).where(eq(schema.exams.id, id));
    return reply.status(204).send();
  });

  // 6. PUT /api/admin/exams/:id/questions (Set Pool)
  fastify.put('/admin/exams/:id/questions', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { questionIds?: string[]; subjectId?: string; topics?: string[] };

    const [exam] = await db.select().from(schema.exams).where(eq(schema.exams.id, id)).limit(1);
    if (!exam) throw new AppError(404, 'NOT_FOUND', 'Exam not found');
    if (exam.status !== 'draft') {
      throw new AppError(400, 'CANNOT_MODIFY_POOL', 'Cannot modify question pool after exam has started');
    }

    let targetIds: string[] = [];

    if (body.questionIds && Array.isArray(body.questionIds)) {
      targetIds = body.questionIds;
    } else if (body.subjectId) {
      const conditions = [eq(schema.questions.subjectId, body.subjectId), eq(schema.questions.active, true)];
      if (body.topics && body.topics.length > 0) {
        conditions.push(inArray(schema.questions.topic, body.topics));
      }
      const fetched = await db.select({ id: schema.questions.id })
        .from(schema.questions)
        .where(and(...conditions));
      targetIds = fetched.map(q => q.id);
    }

    if (targetIds.length < exam.questionsPerStudent) {
      throw new AppError(400, 'INSUFFICIENT_POOL', `Question pool size (${targetIds.length}) cannot be less than questions per student (${exam.questionsPerStudent})`);
    }

    // Replace pool
    await db.delete(schema.examQuestions).where(eq(schema.examQuestions.examId, id));
    if (targetIds.length > 0) {
      await db.insert(schema.examQuestions).values(
        targetIds.map(qid => ({ examId: id, questionId: qid }))
      );
    }

    return reply.send({ success: true, poolCount: targetIds.length });
  });

  // 7. POST /api/admin/exams/:id/start
  fastify.post('/admin/exams/:id/start', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [exam] = await db.select().from(schema.exams).where(eq(schema.exams.id, id)).limit(1);
    if (!exam) throw new AppError(404, 'NOT_FOUND', 'Exam not found');
    if (exam.status === 'live') {
      return reply.send(exam);
    }
    if (exam.status === 'ended') {
      throw new AppError(400, 'EXAM_ALREADY_ENDED', 'Cannot restart an ended exam');
    }

    const [updated] = await db.update(schema.exams)
      .set({
        status: 'live',
        startedAt: new Date()
      })
      .where(eq(schema.exams.id, id))
      .returning();

    await db.insert(schema.auditLog).values({
      actor: request.sessionUser!.username || request.sessionUser!.name,
      action: 'EXAM_START',
      details: { examId: id }
    });

    return reply.send(updated);
  });

  // 8. POST /api/admin/exams/:id/stop
  fastify.post('/admin/exams/:id/stop', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [exam] = await db.select().from(schema.exams).where(eq(schema.exams.id, id)).limit(1);
    if (!exam) throw new AppError(404, 'NOT_FOUND', 'Exam not found');

    const now = new Date();

    const [updated] = await db.update(schema.exams)
      .set({
        status: 'ended',
        endedAt: now
      })
      .where(eq(schema.exams.id, id))
      .returning();

    // Auto-submit all in-progress attempts
    await db.update(schema.attempts)
      .set({
        status: 'auto_submitted',
        submittedAt: now
      })
      .where(and(
        eq(schema.attempts.examId, id),
        eq(schema.attempts.status, 'in_progress')
      ));

    await db.insert(schema.auditLog).values({
      actor: request.sessionUser!.username || request.sessionUser!.name,
      action: 'EXAM_STOP',
      details: { examId: id }
    });

    return reply.send(updated);
  });

  // 9. POST /api/admin/exams/:id/extend
  fastify.post('/admin/exams/:id/extend', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = ExtendExamSchema.parse(request.body);

    const [exam] = await db.select().from(schema.exams).where(eq(schema.exams.id, id)).limit(1);
    if (!exam) throw new AppError(404, 'NOT_FOUND', 'Exam not found');
    if (exam.status !== 'live') {
      throw new AppError(400, 'EXAM_NOT_LIVE', 'Can only extend time on an active live exam');
    }

    const newExtra = (exam.extraMinutes || 0) + body.minutes;
    await db.update(schema.exams)
      .set({ extraMinutes: newExtra })
      .where(eq(schema.exams.id, id));

    // Shift deadline_at for all in-progress attempts by body.minutes
    const deltaMs = body.minutes * 60 * 1000;
    const inProgress = await db.select({ id: schema.attempts.id, deadlineAt: schema.attempts.deadlineAt })
      .from(schema.attempts)
      .where(and(eq(schema.attempts.examId, id), eq(schema.attempts.status, 'in_progress')));

    for (const att of inProgress) {
      const newDeadline = new Date(att.deadlineAt.getTime() + deltaMs);
      await db.update(schema.attempts)
        .set({ deadlineAt: newDeadline })
        .where(eq(schema.attempts.id, att.id));
    }

    await db.insert(schema.auditLog).values({
      actor: request.sessionUser!.username || request.sessionUser!.name,
      action: 'EXAM_EXTEND',
      details: { examId: id, addedMinutes: body.minutes, totalExtraMinutes: newExtra }
    });

    return reply.send({ success: true, extraMinutes: newExtra });
  });

  // 10. GET /api/admin/exams/:id/monitor
  fastify.get('/admin/exams/:id/monitor', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [exam] = await db.select().from(schema.exams).where(eq(schema.exams.id, id)).limit(1);
    if (!exam) throw new AppError(404, 'NOT_FOUND', 'Exam not found');

    // Eligible students
    const studentConditions = [eq(schema.students.active, true)];
    if (exam.batchFilter) {
      studentConditions.push(eq(schema.students.batch, exam.batchFilter));
    }
    const eligibleStudents = await db.select().from(schema.students).where(and(...studentConditions));

    // Attempts for this exam
    const examAttempts = await db.select().from(schema.attempts).where(eq(schema.attempts.examId, id));
    const attemptMap = new Map(examAttempts.map(a => [a.studentId, a]));

    // Answer counts per attempt
    const answerCounts = await db.select({
      attemptId: schema.answers.attemptId,
      answeredCount: sql<number>`count(case when chosen is not null then 1 end)`,
      lastSavedAt: sql<Date>`max(saved_at)`
    })
      .from(schema.answers)
      .groupBy(schema.answers.attemptId);

    const answerMap = new Map(answerCounts.map(a => [a.attemptId, a]));

    let notJoinedCount = 0;
    let inProgressCount = 0;
    let submittedCount = 0;

    const studentRows: MonitorStudentRow[] = eligibleStudents.map(student => {
      const attempt = attemptMap.get(student.id);
      if (!attempt) {
        notJoinedCount++;
        return {
          studentId: student.id,
          rollNo: student.rollNo,
          name: student.name,
          status: 'not_joined',
          answeredCount: 0,
          totalQuestions: exam.questionsPerStudent,
          tabSwitches: 0
        };
      }

      if (attempt.status === 'in_progress') {
        inProgressCount++;
      } else {
        submittedCount++;
      }

      const ansInfo = answerMap.get(attempt.id);

      return {
        studentId: student.id,
        rollNo: student.rollNo,
        name: student.name,
        status: attempt.status as any,
        answeredCount: Number(ansInfo?.answeredCount || 0),
        totalQuestions: exam.questionsPerStudent,
        lastSavedAt: ansInfo?.lastSavedAt ? ansInfo.lastSavedAt.toISOString() : undefined,
        tabSwitches: attempt.tabSwitches || 0,
        deadlineAt: attempt.deadlineAt.toISOString(),
        attemptId: attempt.id
      };
    });

    const response: MonitorResponse = {
      examId: exam.id,
      examTitle: exam.title,
      examStatus: exam.status,
      counts: {
        eligible: eligibleStudents.length,
        notJoined: notJoinedCount,
        inProgress: inProgressCount,
        submitted: submittedCount
      },
      students: studentRows
    };

    return reply.send(response);
  });

  // 11. POST /api/admin/attempts/:id/force-submit
  fastify.post('/admin/attempts/:id/force-submit', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [updated] = await db.update(schema.attempts)
      .set({
        status: 'auto_submitted',
        submittedAt: new Date()
      })
      .where(eq(schema.attempts.id, id))
      .returning();

    if (!updated) throw new AppError(404, 'NOT_FOUND', 'Attempt not found');
    return reply.send({ success: true, status: updated.status });
  });

  // 12. POST /api/admin/attempts/:id/reset
  fastify.post('/admin/attempts/:id/reset', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [attempt] = await db.select().from(schema.attempts).where(eq(schema.attempts.id, id)).limit(1);
    if (!attempt) throw new AppError(404, 'NOT_FOUND', 'Attempt not found');

    await db.delete(schema.attempts).where(eq(schema.attempts.id, id));

    await db.insert(schema.auditLog).values({
      actor: request.sessionUser!.username || request.sessionUser!.name,
      action: 'ATTEMPT_RESET',
      details: { attemptId: id, studentId: attempt.studentId, examId: attempt.examId }
    });

    return reply.send({ success: true, message: 'Attempt reset successfully' });
  });

  // 13. Student Management: GET /api/admin/students
  fastify.get('/admin/students', async (request, reply) => {
    const { batch, search } = request.query as { batch?: string; search?: string };
    const conditions = [eq(schema.students.active, true)];
    if (batch) conditions.push(eq(schema.students.batch, batch));
    if (search) {
      conditions.push(sql`(lower(roll_no) like lower(${`%${search}%`}) or lower(name) like lower(${`%${search}%`}))`);
    }

    const rows = await db.select({
      id: schema.students.id,
      rollNo: schema.students.rollNo,
      name: schema.students.name,
      email: schema.students.email,
      batch: schema.students.batch,
      mustChangePassword: schema.students.mustChangePassword,
      createdAt: schema.students.createdAt
    })
      .from(schema.students)
      .where(and(...conditions))
      .orderBy(schema.students.rollNo);

    return reply.send(rows);
  });

  // POST /api/admin/students
  fastify.post('/admin/students', async (request, reply) => {
    const body = CreateStudentSchema.parse(request.body);
    const existing = await db.select().from(schema.students).where(eq(schema.students.rollNo, body.rollNo)).limit(1);
    if (existing.length > 0) {
      throw new AppError(400, 'DUPLICATE_ROLL', 'Student with this roll number already exists');
    }

    // Default password = rollNo
    const passwordHash = await bcrypt.hash(body.rollNo, 8);
    const [student] = await db.insert(schema.students).values({
      rollNo: body.rollNo,
      name: body.name,
      email: body.email || null,
      batch: body.batch || 'default',
      passwordHash,
      mustChangePassword: false,
      active: true
    }).returning();

    return reply.status(201).send({
      id: student.id,
      rollNo: student.rollNo,
      name: student.name,
      email: student.email,
      batch: student.batch
    });
  });

  // POST /api/admin/students/import (CSV/XLSX)
  fastify.post('/admin/students/import', async (request, reply) => {
    const data = await request.file();
    if (!data) throw new AppError(400, 'NO_FILE', 'CSV or XLSX file is required');

    const fileBuffer = await data.toBuffer();
    const workbook = new ExcelJS.Workbook();
    
    if (data.filename.endsWith('.csv')) {
      await workbook.csv.read(data.file);
    } else {
      await workbook.xlsx.load(fileBuffer as any);
    }

    const sheet = workbook.worksheets[0];
    if (!sheet) throw new AppError(400, 'INVALID_FILE', 'No sheet found in file');

    let createdCount = 0;
    let updatedCount = 0;
    const errors: { row: number; message: string }[] = [];

    // Rows start at 2
    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const rollNo = String(row.getCell(1).text || '').trim();
      const name = String(row.getCell(2).text || '').trim();
      const email = String(row.getCell(3).text || '').trim();
      const batch = String(row.getCell(4).text || 'default').trim();

      if (!rollNo || !name) {
        if (rollNo || name) {
          errors.push({ row: r, message: 'Roll number and name are required' });
        }
        continue;
      }

      const [existing] = await db.select().from(schema.students).where(eq(schema.students.rollNo, rollNo)).limit(1);
      if (existing) {
        await db.update(schema.students)
          .set({ name, email: email || existing.email, batch })
          .where(eq(schema.students.id, existing.id));
        updatedCount++;
      } else {
        const passwordHash = await bcrypt.hash(rollNo, 8);
        await db.insert(schema.students).values({
          rollNo,
          name,
          email: email || null,
          batch,
          passwordHash,
          active: true
        });
        createdCount++;
      }
    }

    return reply.send({
      created: createdCount,
      updated: updatedCount,
      errors
    });
  });

  // 14. POST /api/admin/students/:id/reset-password
  fastify.post('/admin/students/:id/reset-password', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [student] = await db.select().from(schema.students).where(eq(schema.students.id, id)).limit(1);
    if (!student) throw new AppError(404, 'NOT_FOUND', 'Student not found');

    const defaultPassHash = await bcrypt.hash(student.rollNo, 8);
    await db.update(schema.students)
      .set({ passwordHash: defaultPassHash, mustChangePassword: false })
      .where(eq(schema.students.id, id));

    return reply.send({ success: true, message: `Password reset to default roll number (${student.rollNo})` });
  });

  // 15. DELETE /api/admin/students/:id (soft delete)
  fastify.delete('/admin/students/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [student] = await db.select().from(schema.students).where(eq(schema.students.id, id)).limit(1);
    if (!student) throw new AppError(404, 'NOT_FOUND', 'Student not found');

    await db.update(schema.students)
      .set({ active: false })
      .where(eq(schema.students.id, id));

    await db.insert(schema.auditLog).values({
      actor: request.sessionUser!.username || request.sessionUser!.name,
      action: 'STUDENT_DEACTIVATE',
      details: { studentId: id, rollNo: student.rollNo }
    });

    return reply.status(204).send();
  });
};

export const autoPrefix = '/api';
export default adminExamsRoutes;
