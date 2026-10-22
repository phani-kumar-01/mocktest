import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import ExcelJS from 'exceljs';
import { eq, and, sql, inArray, desc } from 'drizzle-orm';
import { db, schema } from '../../db/client.js';
import { requireRole } from '../../lib/session.js';
import { AppError } from '../../lib/errors.js';
import {
  UpdateScoringSchema,
  StudentAnalysisResponse,
  ExamResultsSummary,
  ExamResultRow,
  StudentWrongQuestion
} from '@nptel/shared';

/**
 * Shared service function to compute results for an exam
 */
export async function computeExamResults(examId: string): Promise<{ computedCount: number }> {
  const [exam] = await db.select().from(schema.exams).where(eq(schema.exams.id, examId)).limit(1);
  if (!exam) throw new AppError(404, 'NOT_FOUND', 'Exam not found');

  const attempts = await db.select().from(schema.attempts).where(eq(schema.attempts.examId, examId));
  if (attempts.length === 0) {
    return { computedCount: 0 };
  }

  // Pre-fetch all questions for the exam
  const poolQuestions = await db.select().from(schema.questions)
    .innerJoin(schema.examQuestions, eq(schema.questions.id, schema.examQuestions.questionId))
    .where(eq(schema.examQuestions.examId, examId));

  const questionMap = new Map(poolQuestions.map(p => [p.questions.id, p.questions]));

  // Thresholds
  const passTotal = Number(exam.passTotal || 40);
  const passAssignmentMin = Number(exam.passAssignmentMin || 10);
  const passExamMin = Number(exam.passExamMin || 30);
  const strongThreshold = Number(exam.strongThreshold || 70);
  const weakThreshold = Number(exam.weakThreshold || 50);
  const assignmentMarks = Number(exam.assignmentMarks || 0);
  const examMax = Number(exam.examMax || 75);
  const gradeTiers = (exam.gradeTiers as any[]) || [
    { min: 90, label: 'Elite + Gold' },
    { min: 75, label: 'Elite + Silver' },
    { min: 60, label: 'Elite' },
    { min: 40, label: 'Successfully Completed' }
  ];

  for (const attempt of attempts) {
    const qOrder = attempt.questionOrder as { qid: string; options: string[] }[];
    const userAnswers = await db.select().from(schema.answers).where(eq(schema.answers.attemptId, attempt.id));
    const ansMap = new Map(userAnswers.map(a => [a.questionId, a.chosen]));

    let correctCount = 0;
    let wrongCount = 0;
    let unansweredCount = 0;
    let rawScore = 0;
    let maxRaw = 0;

    // Topic counters: topicKey -> { topic, subtopic, correct, total }
    const topicMap = new Map<string, { topic: string; subtopic: string; correct: number; total: number }>();

    for (const item of qOrder) {
      const q = questionMap.get(item.qid);
      if (!q) continue;

      const marks = Number(q.marks || 1);
      const negative = exam.negativeMarking ? Number(q.negative || 0) : 0;
      maxRaw += marks;

      const topicKey = `${q.topic}:::${q.subtopic || ''}`;
      if (!topicMap.has(topicKey)) {
        topicMap.set(topicKey, { topic: q.topic, subtopic: q.subtopic || '', correct: 0, total: 0 });
      }
      const tStat = topicMap.get(topicKey)!;
      tStat.total += 1;

      const chosen = ansMap.get(q.id);
      if (!chosen) {
        unansweredCount++;
      } else if (chosen.toLowerCase() === q.correct.toLowerCase()) {
        correctCount++;
        rawScore += marks;
        tStat.correct += 1;
      } else {
        wrongCount++;
        rawScore -= negative;
      }
    }

    rawScore = Math.max(0, rawScore);
    const examScaled = maxRaw > 0 ? (rawScore / maxRaw) * examMax : 0;
    const total = assignmentMarks + examScaled;

    const passed = total >= passTotal && assignmentMarks >= passAssignmentMin && examScaled >= passExamMin;

    let gradeLabel = 'Not Passed';
    if (passed) {
      const sortedTiers = [...gradeTiers].sort((a, b) => b.min - a.min);
      for (const tier of sortedTiers) {
        if (total >= tier.min) {
          gradeLabel = tier.label;
          break;
        }
      }
    }

    // Upsert Result
    await db.insert(schema.results)
      .values({
        attemptId: attempt.id,
        examId,
        studentId: attempt.studentId,
        correctCount,
        wrongCount,
        unansweredCount,
        rawScore: String(rawScore),
        maxRaw: String(maxRaw),
        examScaled: String(examScaled),
        assignmentMarks: String(assignmentMarks),
        total: String(total),
        passed,
        gradeLabel,
        computedAt: new Date()
      })
      .onConflictDoUpdate({
        target: schema.results.attemptId,
        set: {
          correctCount,
          wrongCount,
          unansweredCount,
          rawScore: String(rawScore),
          maxRaw: String(maxRaw),
          examScaled: String(examScaled),
          assignmentMarks: String(assignmentMarks),
          total: String(total),
          passed,
          gradeLabel,
          computedAt: new Date()
        }
      });

    // Replace topic scores
    await db.delete(schema.topicScores).where(eq(schema.topicScores.attemptId, attempt.id));

    const topicInserts = Array.from(topicMap.values()).map(t => {
      const pct = t.total > 0 ? (t.correct / t.total) * 100 : 0;
      let level: 'strong' | 'average' | 'weak' = 'average';
      if (pct >= strongThreshold) level = 'strong';
      else if (pct < weakThreshold) level = 'weak';

      return {
        attemptId: attempt.id,
        topic: t.topic,
        subtopic: t.subtopic,
        correct: t.correct,
        total: t.total,
        pct: String(pct),
        level
      };
    });

    if (topicInserts.length > 0) {
      await db.insert(schema.topicScores).values(topicInserts);
    }
  }

  return { computedCount: attempts.length };
}

/**
 * Shared service function to retrieve detailed student analysis (used by results & PDF generator)
 */
export async function getStudentAnalysis(examId: string, studentId: string): Promise<StudentAnalysisResponse> {
  const [exam] = await db.select().from(schema.exams).where(eq(schema.exams.id, examId)).limit(1);
  if (!exam) throw new AppError(404, 'NOT_FOUND', 'Exam not found');

  const [student] = await db.select().from(schema.students).where(eq(schema.students.id, studentId)).limit(1);
  if (!student) throw new AppError(404, 'NOT_FOUND', 'Student not found');

  const [attempt] = await db.select().from(schema.attempts)
    .where(and(eq(schema.attempts.examId, examId), eq(schema.attempts.studentId, studentId)))
    .limit(1);

  if (!attempt) throw new AppError(404, 'NOT_FOUND', 'No attempt found for this student');

  let [result] = await db.select().from(schema.results).where(eq(schema.results.attemptId, attempt.id)).limit(1);
  if (!result) {
    await computeExamResults(examId);
    [result] = await db.select().from(schema.results).where(eq(schema.results.attemptId, attempt.id)).limit(1);
  }

  // Topic scores
  const tScores = await db.select().from(schema.topicScores).where(eq(schema.topicScores.attemptId, attempt.id));
  const topicScores = tScores.map(t => ({
    topic: t.topic,
    subtopic: t.subtopic || '',
    correct: t.correct || 0,
    total: t.total || 0,
    pct: Number(t.pct || 0),
    level: t.level as any,
    fewQuestions: (t.total || 0) < 2
  }));

  // Focus areas sorted: weak first (lowest pct first), then average
  const focusAreas = [...topicScores]
    .filter(t => t.level === 'weak' || t.level === 'average')
    .sort((a, b) => a.pct - b.pct)
    .map(t => ({
      topic: t.topic,
      subtopic: t.subtopic,
      level: t.level,
      pct: t.pct,
      recommendation: `Revise ${t.topic}${t.subtopic ? ` → ${t.subtopic}` : ''}`
    }));

  // Wrong questions
  const qOrder = attempt.questionOrder as { qid: string; options: string[] }[];
  const userAnswers = await db.select().from(schema.answers).where(eq(schema.answers.attemptId, attempt.id));
  const ansMap = new Map(userAnswers.map(a => [a.questionId, a.chosen]));

  const qIds = qOrder.map(q => q.qid);
  const questions = await db.select().from(schema.questions).where(inArray(schema.questions.id, qIds));
  const qMap = new Map(questions.map(q => [q.id, q]));

  const wrongQuestions: StudentWrongQuestion[] = [];
  for (const item of qOrder) {
    const q = qMap.get(item.qid);
    if (!q) continue;

    const chosen = ansMap.get(q.id) || null;
    if (chosen !== q.correct) {
      wrongQuestions.push({
        questionId: q.id,
        topic: q.topic,
        subtopic: q.subtopic || undefined,
        bodyMd: q.bodyMd,
        codeSnippet: q.codeSnippet,
        codeLang: q.codeLang,
        studentAnswer: chosen,
        correctAnswer: q.correct,
        explanationMd: q.explanationMd
      });
    }
  }

  return {
    examId: exam.id,
    examTitle: exam.title,
    studentId: student.id,
    rollNo: student.rollNo,
    studentName: student.name,
    assignmentMarks: Number(result?.assignmentMarks || 0),
    assignmentMax: Number(exam.assignmentMax || 25),
    examScaled: Number(result?.examScaled || 0),
    examMax: Number(exam.examMax || 75),
    total: Number(result?.total || 0),
    passed: Boolean(result?.passed),
    gradeLabel: result?.gradeLabel || 'Not Passed',
    topicScores,
    focusAreas,
    wrongQuestions
  };
}

const resultsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.addHook('preHandler', requireRole('admin'));

  // 1. POST /api/admin/exams/:id/compute
  fastify.post('/admin/exams/:id/compute', async (request, reply) => {
    const { id } = request.params as { id: string };
    const res = await computeExamResults(id);
    return reply.send(res);
  });

  // 2. GET /api/admin/exams/:id/results
  fastify.get('/admin/exams/:id/results', async (request, reply) => {
    const { id } = request.params as { id: string };

    const rows = await db.select({
      studentId: schema.students.id,
      rollNo: schema.students.rollNo,
      name: schema.students.name,
      correctCount: schema.results.correctCount,
      wrongCount: schema.results.wrongCount,
      unansweredCount: schema.results.unansweredCount,
      rawScore: schema.results.rawScore,
      maxRaw: schema.results.maxRaw,
      examScaled: schema.results.examScaled,
      assignmentMarks: schema.results.assignmentMarks,
      total: schema.results.total,
      passed: schema.results.passed,
      gradeLabel: schema.results.gradeLabel
    })
      .from(schema.results)
      .innerJoin(schema.students, eq(schema.results.studentId, schema.students.id))
      .where(eq(schema.results.examId, id))
      .orderBy(desc(schema.results.total));

    const totalAttempts = rows.length;
    let passedCount = 0;
    const totals: number[] = [];

    const formattedRows: ExamResultRow[] = rows.map(r => {
      const tot = Number(r.total || 0);
      totals.push(tot);
      if (r.passed) passedCount++;

      return {
        studentId: r.studentId,
        rollNo: r.rollNo,
        name: r.name,
        correctCount: r.correctCount || 0,
        wrongCount: r.wrongCount || 0,
        unansweredCount: r.unansweredCount || 0,
        rawScore: Number(r.rawScore || 0),
        maxRaw: Number(r.maxRaw || 0),
        examScaled: Number(r.examScaled || 0),
        assignmentMarks: Number(r.assignmentMarks || 0),
        total: tot,
        passed: Boolean(r.passed),
        gradeLabel: r.gradeLabel || 'Not Passed'
      };
    });

    totals.sort((a, b) => a - b);
    const sum = totals.reduce((acc, v) => acc + v, 0);
    const avg = totalAttempts > 0 ? sum / totalAttempts : 0;
    const median = totalAttempts > 0 ? (totals[Math.floor(totalAttempts / 2)] || 0) : 0;

    // 10-point distribution bins
    const bins = ['0-39', '40-59', '60-74', '75-89', '90-100'];
    const binCounts: Record<string, number> = { '0-39': 0, '40-59': 0, '60-74': 0, '75-89': 0, '90-100': 0 };

    for (const score of totals) {
      if (score < 40) binCounts['0-39']++;
      else if (score < 60) binCounts['40-59']++;
      else if (score < 75) binCounts['60-74']++;
      else if (score < 90) binCounts['75-89']++;
      else binCounts['90-100']++;
    }

    const summary: ExamResultsSummary = {
      totalAttempts,
      passedCount,
      passRate: totalAttempts > 0 ? Math.round((passedCount / totalAttempts) * 100 * 10) / 10 : 0,
      avgTotal: Math.round(avg * 100) / 100,
      medianTotal: Math.round(median * 100) / 100,
      highestTotal: totals.length > 0 ? totals[totals.length - 1] : 0,
      lowestTotal: totals.length > 0 ? totals[0] : 0,
      distribution: bins.map(b => ({ bin: b, count: binCounts[b] }))
    };

    return reply.send({ rows: formattedRows, summary });
  });

  // 3. GET /api/admin/exams/:id/topic-matrix
  fastify.get('/admin/exams/:id/topic-matrix', async (request, reply) => {
    const { id } = request.params as { id: string };

    const tScores = await db.select({
      studentId: schema.attempts.studentId,
      rollNo: schema.students.rollNo,
      name: schema.students.name,
      topic: schema.topicScores.topic,
      pct: schema.topicScores.pct,
      level: schema.topicScores.level
    })
      .from(schema.topicScores)
      .innerJoin(schema.attempts, eq(schema.topicScores.attemptId, schema.attempts.id))
      .innerJoin(schema.students, eq(schema.attempts.studentId, schema.students.id))
      .where(eq(schema.attempts.examId, id));

    const topicSet = new Set<string>();
    const studentMap = new Map<string, { studentId: string; rollNo: string; name: string; scores: Record<string, { pct: number; level: string }> }>();
    const topicSums = new Map<string, { totalPct: number; count: number }>();

    for (const row of tScores) {
      topicSet.add(row.topic);

      if (!studentMap.has(row.studentId)) {
        studentMap.set(row.studentId, {
          studentId: row.studentId,
          rollNo: row.rollNo,
          name: row.name,
          scores: {}
        });
      }

      const pctNum = Number(row.pct || 0);
      studentMap.get(row.studentId)!.scores[row.topic] = {
        pct: pctNum,
        level: row.level || 'average'
      };

      if (!topicSums.has(row.topic)) {
        topicSums.set(row.topic, { totalPct: 0, count: 0 });
      }
      const sum = topicSums.get(row.topic)!;
      sum.totalPct += pctNum;
      sum.count += 1;
    }

    const topics = Array.from(topicSet).sort();
    const classWeak = Array.from(topicSums.entries()).map(([topic, data]) => ({
      topic,
      avgPct: Math.round((data.totalPct / data.count) * 10) / 10
    })).sort((a, b) => a.avgPct - b.avgPct);

    return reply.send({
      topics,
      rows: Array.from(studentMap.values()),
      classWeak
    });
  });

  // 4. GET /api/admin/exams/:id/students/:studentId/analysis
  fastify.get('/admin/exams/:id/students/:studentId/analysis', async (request, reply) => {
    const { id, studentId } = request.params as { id: string; studentId: string };
    const analysis = await getStudentAnalysis(id, studentId);
    return reply.send(analysis);
  });

  // 5. GET /api/admin/exams/:id/export.xlsx
  fastify.get('/admin/exams/:id/export.xlsx', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [exam] = await db.select().from(schema.exams).where(eq(schema.exams.id, id)).limit(1);
    if (!exam) throw new AppError(404, 'NOT_FOUND', 'Exam not found');

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'NPTEL Mock Exam Portal';

    // Sheet 1: Results
    const resSheet = workbook.addWorksheet('Results');
    resSheet.columns = [
      { header: 'Roll No', key: 'rollNo', width: 15 },
      { header: 'Student Name', key: 'name', width: 25 },
      { header: 'Correct', key: 'correct', width: 10 },
      { header: 'Wrong', key: 'wrong', width: 10 },
      { header: 'Unanswered', key: 'unanswered', width: 12 },
      { header: 'Raw Score', key: 'raw', width: 12 },
      { header: 'Exam Scaled (75)', key: 'examScaled', width: 15 },
      { header: 'Assignment (25)', key: 'assignment', width: 15 },
      { header: 'Total (100)', key: 'total', width: 15 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Grade Tier', key: 'grade', width: 25 }
    ];
    resSheet.getRow(1).font = { bold: true };

    const resultsRows = await db.select({
      rollNo: schema.students.rollNo,
      name: schema.students.name,
      correct: schema.results.correctCount,
      wrong: schema.results.wrongCount,
      unanswered: schema.results.unansweredCount,
      raw: schema.results.rawScore,
      examScaled: schema.results.examScaled,
      assignment: schema.results.assignmentMarks,
      total: schema.results.total,
      passed: schema.results.passed,
      grade: schema.results.gradeLabel
    })
      .from(schema.results)
      .innerJoin(schema.students, eq(schema.results.studentId, schema.students.id))
      .where(eq(schema.results.examId, id))
      .orderBy(desc(schema.results.total));

    for (const r of resultsRows) {
      resSheet.addRow({
        rollNo: r.rollNo,
        name: r.name,
        correct: r.correct,
        wrong: r.wrong,
        unanswered: r.unanswered,
        raw: Number(r.raw).toFixed(2),
        examScaled: Number(r.examScaled).toFixed(2),
        assignment: Number(r.assignment).toFixed(2),
        total: Number(r.total).toFixed(2),
        status: r.passed ? 'PASSED' : 'FAILED',
        grade: r.grade
      });
    }

    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', `attachment; filename="Results_${exam.title.replace(/\s+/g, '_')}.xlsx"`);

    const buffer = await workbook.xlsx.writeBuffer();
    return reply.send(buffer);
  });

  // 6. PUT /api/admin/exams/:id/scoring
  fastify.put('/admin/exams/:id/scoring', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = UpdateScoringSchema.parse(request.body);

    await db.update(schema.exams)
      .set({
        assignmentMarks: body.assignmentMarks != null ? String(body.assignmentMarks) : undefined,
        passTotal: body.passTotal != null ? String(body.passTotal) : undefined,
        passAssignmentMin: body.passAssignmentMin != null ? String(body.passAssignmentMin) : undefined,
        passExamMin: body.passExamMin != null ? String(body.passExamMin) : undefined,
        strongThreshold: body.strongThreshold != null ? String(body.strongThreshold) : undefined,
        weakThreshold: body.weakThreshold != null ? String(body.weakThreshold) : undefined
      })
      .where(eq(schema.exams.id, id));

    // Recompute results immediately
    await computeExamResults(id);

    return reply.send({ success: true, message: 'Scoring settings updated and results recomputed' });
  });
};

export const autoPrefix = '/api';
export default resultsRoutes;
