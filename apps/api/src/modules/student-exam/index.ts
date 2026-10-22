import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import { db, schema } from '../../db/client.js';
import { requireRole } from '../../lib/session.js';
import { AppError } from '../../lib/errors.js';
import {
  checkCanEnterExam,
  calculateAttemptDeadline,
  calculateRemainingSeconds,
  ExamTimeConfig
} from '../../lib/time.js';
import { generateQuestionOrder } from '../../lib/shuffle.js';
import {
  SaveAnswerSchema,
  StudentHomeResponse,
  StudentAttemptResponse,
  StudentQuestionItem
} from '@nptel/shared';

const studentExamRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // All student routes require 'student' role
  fastify.addHook('preHandler', requireRole('student'));

  // 1. GET /api/student/home
  fastify.get('/home', async (request, reply) => {
    const student = request.sessionUser!;
    const now = new Date();

    // Check student details for batch
    const [studentRow] = await db.select().from(schema.students).where(eq(schema.students.id, student.id)).limit(1);
    if (!studentRow || !studentRow.active) {
      throw new AppError(401, 'UNAUTHORIZED', 'Student account is inactive');
    }

    // Find latest live exam, or latest ended/scheduled exam
    const liveExams = await db.select().from(schema.exams).where(eq(schema.exams.status, 'live')).orderBy(desc(schema.exams.startedAt));
    
    // Find eligible live exam
    let activeExam = liveExams.find(e => !e.batchFilter || e.batchFilter === studentRow.batch);

    if (!activeExam) {
      // Check if student recently submitted an exam
      const [lastAttempt] = await db.select({
        attemptId: schema.attempts.id,
        examId: schema.attempts.examId,
        status: schema.attempts.status
      })
        .from(schema.attempts)
        .where(eq(schema.attempts.studentId, student.id))
        .orderBy(desc(schema.attempts.startedAt))
        .limit(1);

      if (lastAttempt && (lastAttempt.status === 'submitted' || lastAttempt.status === 'auto_submitted')) {
        const resp: StudentHomeResponse = {
          state: 'submitted',
          attemptId: lastAttempt.attemptId,
          alreadySubmitted: true
        };
        return reply.send(resp);
      }

      const resp: StudentHomeResponse = {
        state: 'idle'
      };
      return reply.send(resp);
    }

    // There is an active live exam
    const [existingAttempt] = await db.select().from(schema.attempts)
      .where(and(eq(schema.attempts.examId, activeExam.id), eq(schema.attempts.studentId, student.id)))
      .limit(1);

    if (existingAttempt && existingAttempt.status !== 'in_progress') {
      const resp: StudentHomeResponse = {
        state: 'submitted',
        attemptId: existingAttempt.id,
        alreadySubmitted: true
      };
      return reply.send(resp);
    }

    const timeConfig: ExamTimeConfig = {
      status: activeExam.status,
      startedAt: activeExam.startedAt,
      durationMinutes: activeExam.durationMinutes,
      extraMinutes: activeExam.extraMinutes || 0,
      joinPolicy: activeExam.joinPolicy as any,
      lateJoinCutoffMinutes: activeExam.lateJoinCutoffMinutes,
      hardCloseAt: activeExam.hardCloseAt
    };

    let canEnterResult = checkCanEnterExam(timeConfig, now);
    // If student already has in_progress attempt, they can resume even if late cutoff has passed
    if (existingAttempt && existingAttempt.status === 'in_progress') {
      if (now.getTime() < existingAttempt.deadlineAt.getTime()) {
        canEnterResult = { canEnter: true };
      } else {
        canEnterResult = { canEnter: false, reason: 'Attempt deadline has expired' };
      }
    }

    const remainingSecs = existingAttempt
      ? calculateRemainingSeconds(existingAttempt.deadlineAt, now)
      : activeExam.durationMinutes * 60;

    const resp: StudentHomeResponse = {
      state: 'live',
      exam: {
        id: activeExam.id,
        title: activeExam.title,
        durationMinutes: activeExam.durationMinutes,
        canEnter: canEnterResult.canEnter,
        reason: canEnterResult.reason,
        remainingSeconds: remainingSecs
      },
      attemptId: existingAttempt?.id
    };

    return reply.send(resp);
  });

  // 2. POST /api/student/exams/:examId/start
  fastify.post('/exams/:examId/start', async (request, reply) => {
    const { examId } = request.params as { examId: string };
    const student = request.sessionUser!;
    const now = new Date();

    const [studentRow] = await db.select().from(schema.students).where(eq(schema.students.id, student.id)).limit(1);
    if (!studentRow || !studentRow.active) {
      throw new AppError(401, 'UNAUTHORIZED', 'Student account is inactive');
    }

    const [exam] = await db.select().from(schema.exams).where(eq(schema.exams.id, examId)).limit(1);
    if (!exam) throw new AppError(404, 'NOT_FOUND', 'Exam not found');

    if (exam.batchFilter && exam.batchFilter !== studentRow.batch) {
      throw new AppError(403, 'FORBIDDEN', 'You are not eligible for this exam');
    }

    // Check if attempt already exists (idempotent resume)
    const [existing] = await db.select().from(schema.attempts)
      .where(and(eq(schema.attempts.examId, examId), eq(schema.attempts.studentId, student.id)))
      .limit(1);

    if (existing) {
      return reply.send({ attemptId: existing.id });
    }

    // Check entry permission
    const timeConfig: ExamTimeConfig = {
      status: exam.status,
      startedAt: exam.startedAt,
      durationMinutes: exam.durationMinutes,
      extraMinutes: exam.extraMinutes || 0,
      joinPolicy: exam.joinPolicy as any,
      lateJoinCutoffMinutes: exam.lateJoinCutoffMinutes,
      hardCloseAt: exam.hardCloseAt
    };

    const entry = checkCanEnterExam(timeConfig, now);
    if (!entry.canEnter) {
      throw new AppError(403, 'ENTRY_DENIED', entry.reason || 'Cannot enter exam at this time');
    }

    // Fetch exam pool
    const poolRows = await db.select({ questionId: schema.examQuestions.questionId })
      .from(schema.examQuestions)
      .where(eq(schema.examQuestions.examId, examId));

    if (poolRows.length === 0) {
      throw new AppError(400, 'NO_QUESTIONS', 'Exam question pool is empty');
    }

    const poolQuestionIds = poolRows.map(p => p.questionId);

    // Seeded shuffle for question & option order
    const { seed, questionOrder } = generateQuestionOrder({
      examId,
      studentId: student.id,
      poolQuestionIds,
      questionsPerStudent: exam.questionsPerStudent,
      shuffleQuestions: exam.shuffleQuestions !== false,
      shuffleOptions: exam.shuffleOptions !== false
    });

    // Deadline calculation
    const deadlineAt = calculateAttemptDeadline(timeConfig, now);

    const [attempt] = await db.insert(schema.attempts).values({
      examId,
      studentId: student.id,
      status: 'in_progress',
      startedAt: now,
      deadlineAt,
      seed,
      questionOrder,
      tabSwitches: 0
    }).returning();

    return reply.status(201).send({ attemptId: attempt.id });
  });

  // 3. GET /api/student/attempts/:id
  fastify.get('/attempts/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const student = request.sessionUser!;
    const now = new Date();

    const [attempt] = await db.select().from(schema.attempts)
      .where(and(eq(schema.attempts.id, id), eq(schema.attempts.studentId, student.id)))
      .limit(1);

    if (!attempt) {
      throw new AppError(404, 'NOT_FOUND', 'Attempt not found or access denied');
    }

    // Lazy auto-submit check if deadline passed
    if (attempt.status === 'in_progress' && now.getTime() > attempt.deadlineAt.getTime()) {
      await db.update(schema.attempts)
        .set({ status: 'auto_submitted', submittedAt: attempt.deadlineAt })
        .where(eq(schema.attempts.id, attempt.id));
      attempt.status = 'auto_submitted';
    }

    const remainingSeconds = calculateRemainingSeconds(attempt.deadlineAt, now);

    // Fetch question bodies
    const qOrder = attempt.questionOrder as { qid: string; options: string[] }[];
    const qids = qOrder.map(q => q.qid);

    const qRows = await db.select({
      id: schema.questions.id,
      bodyMd: schema.questions.bodyMd,
      codeSnippet: schema.questions.codeSnippet,
      codeLang: schema.questions.codeLang,
      optionA: schema.questions.optionA,
      optionB: schema.questions.optionB,
      optionC: schema.questions.optionC,
      optionD: schema.questions.optionD
    })
      .from(schema.questions)
      .where(inArray(schema.questions.id, qids));

    const qMap = new Map(qRows.map(q => [q.id, q]));

    // Build stripped question items
    const questions: StudentQuestionItem[] = qOrder.map((item, index) => {
      const q = qMap.get(item.qid);
      const optionTexts: Record<string, string> = {
        a: q?.optionA || '',
        b: q?.optionB || '',
        c: q?.optionC || '',
        d: q?.optionD || ''
      };

      // item.options has shuffled original keys, e.g. ['c', 'a', 'd', 'b']
      const options = item.options.map(key => ({
        key,
        text: optionTexts[key] || ''
      }));

      return {
        index: index + 1,
        qid: item.qid,
        bodyMd: q?.bodyMd || '',
        codeSnippet: q?.codeSnippet,
        codeLang: q?.codeLang,
        options
      };
    });

    // Fetch existing answers
    const userAnswers = await db.select().from(schema.answers).where(eq(schema.answers.attemptId, id));
    const answersMap: Record<string, string | null> = {};
    for (const ans of userAnswers) {
      answersMap[ans.questionId] = ans.chosen;
    }

    const response: StudentAttemptResponse = {
      serverTime: now.toISOString(),
      deadlineAt: attempt.deadlineAt.toISOString(),
      remainingSeconds,
      status: attempt.status as any,
      questions,
      answers: answersMap,
      tabSwitches: attempt.tabSwitches || 0
    };

    return reply.send(response);
  });

  // 4. PUT /api/student/attempts/:id/answers/:qid
  fastify.put('/attempts/:id/answers/:qid', async (request, reply) => {
    const { id, qid } = request.params as { id: string; qid: string };
    const student = request.sessionUser!;
    const now = new Date();

    const [attempt] = await db.select().from(schema.attempts)
      .where(and(eq(schema.attempts.id, id), eq(schema.attempts.studentId, student.id)))
      .limit(1);

    if (!attempt) throw new AppError(404, 'NOT_FOUND', 'Attempt not found');

    if (attempt.status !== 'in_progress') {
      throw new AppError(400, 'ATTEMPT_NOT_IN_PROGRESS', 'Exam attempt is already submitted');
    }

    // Check deadline + 3 seconds grace period
    const graceMs = 3000;
    if (now.getTime() > attempt.deadlineAt.getTime() + graceMs) {
      throw new AppError(403, 'DEADLINE_EXPIRED', 'Deadline has expired; answer cannot be saved');
    }

    const body = SaveAnswerSchema.parse(request.body);

    // Upsert answer
    await db.insert(schema.answers)
      .values({
        attemptId: id,
        questionId: qid,
        chosen: body.chosen,
        savedAt: now
      })
      .onConflictDoUpdate({
        target: [schema.answers.attemptId, schema.answers.questionId],
        set: {
          chosen: body.chosen,
          savedAt: now
        }
      });

    const remainingSeconds = calculateRemainingSeconds(attempt.deadlineAt, now);
    return reply.send({ saved: true, remainingSeconds });
  });

  // 5. POST /api/student/attempts/:id/submit
  fastify.post('/attempts/:id/submit', async (request, reply) => {
    const { id } = request.params as { id: string };
    const student = request.sessionUser!;

    const [attempt] = await db.select().from(schema.attempts)
      .where(and(eq(schema.attempts.id, id), eq(schema.attempts.studentId, student.id)))
      .limit(1);

    if (!attempt) throw new AppError(404, 'NOT_FOUND', 'Attempt not found');

    if (attempt.status === 'in_progress') {
      await db.update(schema.attempts)
        .set({
          status: 'submitted',
          submittedAt: new Date()
        })
        .where(eq(schema.attempts.id, id));
    }

    return reply.send({ status: 'submitted' });
  });

  // 6. POST /api/student/attempts/:id/tab-event
  fastify.post('/attempts/:id/tab-event', async (request, reply) => {
    const { id } = request.params as { id: string };
    const student = request.sessionUser!;

    await db.update(schema.attempts)
      .set({
        tabSwitches: sql`${schema.attempts.tabSwitches} + 1`
      })
      .where(and(eq(schema.attempts.id, id), eq(schema.attempts.studentId, student.id)));

    return reply.status(204).send();
  });
};

export const autoPrefix = '/api/student';
export default studentExamRoutes;
