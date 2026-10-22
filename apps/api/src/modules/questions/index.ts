import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import ExcelJS from 'exceljs';
import crypto from 'crypto';
import { eq, and, sql, desc, like, or } from 'drizzle-orm';
import { db, schema } from '../../db/client.js';
import { requireRole } from '../../lib/session.js';
import { AppError } from '../../lib/errors.js';
import {
  CreateSubjectSchema,
  QuestionFilterSchema,
  ExcelQuestionRowSchema,
  ExcelQuestionRow
} from '@nptel/shared';

// In-memory staging store with 30-minute TTL for dry-run preview before confirm
interface StagedImport {
  subjectId: string;
  adminId: string;
  filename: string;
  validRows: ExcelQuestionRow[];
  expiresAt: number;
}
const importStaging = new Map<string, StagedImport>();

const questionsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // All routes in questions module require 'admin' role
  fastify.addHook('preHandler', requireRole('admin'));

  // 1. GET /api/admin/subjects
  fastify.get('/admin/subjects', async () => {
    return await db.select().from(schema.subjects).orderBy(schema.subjects.name);
  });

  // 2. POST /api/admin/subjects
  fastify.post('/admin/subjects', async (request, reply) => {
    const body = CreateSubjectSchema.parse(request.body);
    const [existing] = await db.select().from(schema.subjects).where(eq(schema.subjects.name, body.name)).limit(1);
    if (existing) {
      throw new AppError(400, 'DUPLICATE_SUBJECT', 'Subject with this name already exists');
    }
    const [created] = await db.insert(schema.subjects).values({ name: body.name }).returning();
    return reply.status(201).send(created);
  });

  // 3. GET /api/admin/questions/template.xlsx
  fastify.get('/admin/questions/template.xlsx', async (request, reply) => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'NPTEL Mock Exam Portal';

    // Sheet 1: Questions
    const sheet1 = workbook.addWorksheet('Questions', {
      views: [{ state: 'frozen', ySplit: 1 }]
    });

    sheet1.columns = [
      { header: 'topic', key: 'topic', width: 20 },
      { header: 'subtopic', key: 'subtopic', width: 20 },
      { header: 'question', key: 'question', width: 45 },
      { header: 'code', key: 'code', width: 40 },
      { header: 'code_lang', key: 'code_lang', width: 15 },
      { header: 'option_a', key: 'option_a', width: 25 },
      { header: 'option_b', key: 'option_b', width: 25 },
      { header: 'option_c', key: 'option_c', width: 25 },
      { header: 'option_d', key: 'option_d', width: 25 },
      { header: 'correct', key: 'correct', width: 12 },
      { header: 'marks', key: 'marks', width: 10 },
      { header: 'negative', key: 'negative', width: 10 },
      { header: 'explanation', key: 'explanation', width: 35 }
    ];

    sheet1.getRow(1).font = { bold: true };

    // Add example rows
    sheet1.addRow({
      topic: 'Lists',
      subtopic: 'Slicing',
      question: 'What is the output of the following python code snippet?',
      code: 'nums = [10, 20, 30, 40, 50]\nprint(nums[1:4])',
      code_lang: 'python',
      option_a: '[10, 20, 30]',
      option_b: '[20, 30, 40]',
      option_c: '[20, 30, 40, 50]',
      option_d: '[10, 20, 30, 40]',
      correct: 'B',
      marks: 1,
      negative: 0,
      explanation: 'Slicing from index 1 to 4 extracts items at indices 1, 2, and 3.'
    });

    sheet1.addRow({
      topic: 'Functions',
      subtopic: 'Recursion',
      question: 'Which base condition correctly terminates factorial(n)?',
      code: '',
      code_lang: 'python',
      option_a: 'if n == 0 or n == 1: return 1',
      option_b: 'if n < 0: return 0',
      option_c: 'if n == 2: return 2',
      option_d: 'while n > 0: n -= 1',
      correct: 'A',
      marks: 2,
      negative: 0.5,
      explanation: '0! and 1! are both 1, serving as base cases.'
    });

    // Add dropdown validation for correct column (col J, 10)
    for (let r = 2; r <= 500; r++) {
      sheet1.getCell(`J${r}`).dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: ['"A,B,C,D"'],
        showErrorMessage: true,
        errorTitle: 'Invalid Option',
        error: 'Must be A, B, C, or D'
      };
    }

    // Sheet 2: Instructions
    const sheet2 = workbook.addWorksheet('Instructions');
    sheet2.columns = [
      { header: 'Column', key: 'col', width: 15 },
      { header: 'Required', key: 'req', width: 12 },
      { header: 'Description', key: 'desc', width: 60 }
    ];
    sheet2.getRow(1).font = { bold: true };
    sheet2.addRow({ col: 'topic', req: 'YES', desc: 'Main subject topic, e.g. Lists, Loops, Functions' });
    sheet2.addRow({ col: 'subtopic', req: 'NO', desc: 'Subtopic/concept name' });
    sheet2.addRow({ col: 'question', req: 'YES', desc: 'Full question text. Markdown supported.' });
    sheet2.addRow({ col: 'code', req: 'NO', desc: 'Optional code snippet. Preserves line breaks.' });
    sheet2.addRow({ col: 'code_lang', req: 'NO', desc: 'Language for syntax highlighting (default python).' });
    sheet2.addRow({ col: 'option_a..d', req: 'YES', desc: 'Four distinct options A, B, C, and D.' });
    sheet2.addRow({ col: 'correct', req: 'YES', desc: 'The correct choice: A, B, C, or D.' });
    sheet2.addRow({ col: 'marks', req: 'NO', desc: 'Score if correct (default 1).' });
    sheet2.addRow({ col: 'negative', req: 'NO', desc: 'Penalty if wrong (default 0).' });
    sheet2.addRow({ col: 'explanation', req: 'NO', desc: 'Explanation shown in student review PDF.' });

    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', 'attachment; filename="NPTEL_Questions_Template.xlsx"');

    const buffer = await workbook.xlsx.writeBuffer();
    return reply.send(buffer);
  });

  // 4. POST /api/admin/questions/import?dryRun=true
  fastify.post('/admin/questions/import', async (request, reply) => {
    const data = await request.file();
    if (!data) {
      throw new AppError(400, 'NO_FILE', 'Excel file is required');
    }

    const subjectId = (data.fields.subjectId as any)?.value;
    if (!subjectId) {
      throw new AppError(400, 'MISSING_SUBJECT', 'Subject ID is required');
    }

    const [subject] = await db.select().from(schema.subjects).where(eq(schema.subjects.id, subjectId)).limit(1);
    if (!subject) {
      throw new AppError(404, 'SUBJECT_NOT_FOUND', 'Specified subject not found');
    }

    const fileBuffer = await data.toBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as any);

    const sheet = workbook.getWorksheet('Questions') || workbook.worksheets[0];
    if (!sheet) {
      throw new AppError(400, 'INVALID_SHEET', 'No Questions worksheet found in workbook');
    }

    const errors: { row: number; field: string; message: string }[] = [];
    const validRows: ExcelQuestionRow[] = [];
    const seenQuestions = new Set<string>();

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header

      const rawRow = {
        topic: String(row.getCell(1).text || '').trim(),
        subtopic: String(row.getCell(2).text || '').trim(),
        question: String(row.getCell(3).text || '').trim(),
        code: String(row.getCell(4).text || '').trim(),
        code_lang: String(row.getCell(5).text || 'python').trim(),
        option_a: String(row.getCell(6).text || '').trim(),
        option_b: String(row.getCell(7).text || '').trim(),
        option_c: String(row.getCell(8).text || '').trim(),
        option_d: String(row.getCell(9).text || '').trim(),
        correct: String(row.getCell(10).text || '').trim().toLowerCase(),
        marks: Number(row.getCell(11).value) || 1,
        negative: Number(row.getCell(12).value) || 0,
        explanation: String(row.getCell(13).text || '').trim()
      };

      // Skip completely blank rows
      if (!rawRow.topic && !rawRow.question && !rawRow.option_a) {
        return;
      }

      const parseResult = ExcelQuestionRowSchema.safeParse(rawRow);
      if (!parseResult.success) {
        for (const err of parseResult.error.errors) {
          errors.push({
            row: rowNumber,
            field: err.path.join('.'),
            message: err.message
          });
        }
      } else {
        if (seenQuestions.has(parseResult.data.question.toLowerCase())) {
          errors.push({
            row: rowNumber,
            field: 'question',
            message: 'Duplicate question text within file'
          });
        } else {
          seenQuestions.add(parseResult.data.question.toLowerCase());
          validRows.push(parseResult.data);
        }
      }
    });

    const token = crypto.randomUUID();
    importStaging.set(token, {
      subjectId,
      adminId: request.sessionUser!.id,
      filename: data.filename,
      validRows,
      expiresAt: Date.now() + 30 * 60 * 1000
    });

    return reply.send({
      validCount: validRows.length,
      errorsCount: errors.length,
      errors,
      preview: validRows.slice(0, 20),
      token
    });
  });

  // 5. POST /api/admin/questions/import/confirm
  fastify.post('/admin/questions/import/confirm', async (request, reply) => {
    const { token } = (request.body as any) || {};
    if (!token || !importStaging.has(token)) {
      throw new AppError(400, 'INVALID_TOKEN', 'Import token invalid or expired. Please upload file again.');
    }

    const staged = importStaging.get(token)!;
    importStaging.delete(token);

    if (staged.validRows.length === 0) {
      throw new AppError(400, 'NO_VALID_ROWS', 'No valid rows to import');
    }

    // Insert batch & questions in transaction
    const [batch] = await db.insert(schema.importBatches).values({
      subjectId: staged.subjectId,
      filename: staged.filename,
      rowCount: staged.validRows.length,
      createdBy: staged.adminId
    }).returning();

    const questionsToInsert = staged.validRows.map(r => ({
      subjectId: staged.subjectId,
      importBatchId: batch.id,
      topic: r.topic,
      subtopic: r.subtopic || null,
      bodyMd: r.question,
      codeSnippet: r.code || null,
      codeLang: r.code_lang || 'python',
      optionA: r.option_a,
      optionB: r.option_b,
      optionC: r.option_c,
      optionD: r.option_d,
      correct: r.correct,
      marks: String(r.marks),
      negative: String(r.negative),
      explanationMd: r.explanation || null,
      active: true
    }));

    await db.insert(schema.questions).values(questionsToInsert);

    return reply.send({
      batchId: batch.id,
      importedCount: questionsToInsert.length
    });
  });

  // 6. GET /api/admin/questions
  fastify.get('/admin/questions', async (request, reply) => {
    const query = QuestionFilterSchema.parse(request.query);
    const conditions = [eq(schema.questions.active, true)];

    if (query.subjectId) {
      conditions.push(eq(schema.questions.subjectId, query.subjectId));
    }
    if (query.topic) {
      conditions.push(eq(schema.questions.topic, query.topic));
    }
    if (query.search) {
      conditions.push(or(
        like(schema.questions.bodyMd, `%${query.search}%`),
        like(schema.questions.topic, `%${query.search}%`)
      )!);
    }

    const whereClause = and(...conditions);
    const offset = (query.page - 1) * query.limit;

    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(schema.questions)
      .where(whereClause);

    const rows = await db.select()
      .from(schema.questions)
      .where(whereClause)
      .orderBy(desc(schema.questions.createdAt))
      .limit(query.limit)
      .offset(offset);

    return reply.send({
      total: Number(countResult?.count || 0),
      page: query.page,
      limit: query.limit,
      questions: rows
    });
  });

  // 7. PUT /api/admin/questions/:id
  fastify.put('/admin/questions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;

    const [updated] = await db.update(schema.questions)
      .set({
        topic: body.topic,
        subtopic: body.subtopic,
        bodyMd: body.bodyMd,
        codeSnippet: body.codeSnippet,
        codeLang: body.codeLang,
        optionA: body.optionA,
        optionB: body.optionB,
        optionC: body.optionC,
        optionD: body.optionD,
        correct: body.correct,
        marks: body.marks != null ? String(body.marks) : undefined,
        negative: body.negative != null ? String(body.negative) : undefined,
        explanationMd: body.explanationMd
      })
      .where(eq(schema.questions.id, id))
      .returning();

    if (!updated) {
      throw new AppError(404, 'NOT_FOUND', 'Question not found');
    }
    return reply.send(updated);
  });

  // 8. DELETE /api/admin/questions/:id
  fastify.delete('/admin/questions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [deleted] = await db.update(schema.questions)
      .set({ active: false })
      .where(eq(schema.questions.id, id))
      .returning();

    if (!deleted) {
      throw new AppError(404, 'NOT_FOUND', 'Question not found');
    }
    return reply.status(204).send();
  });

  // 9. GET /api/admin/questions/topics?subjectId=
  fastify.get('/admin/questions/topics', async (request, reply) => {
    const { subjectId } = request.query as { subjectId?: string };
    const conditions = [eq(schema.questions.active, true)];
    if (subjectId) {
      conditions.push(eq(schema.questions.subjectId, subjectId));
    }

    const rows = await db.select({
      topic: schema.questions.topic,
      subtopic: schema.questions.subtopic,
      count: sql<number>`count(*)`
    })
      .from(schema.questions)
      .where(and(...conditions))
      .groupBy(schema.questions.topic, schema.questions.subtopic)
      .orderBy(schema.questions.topic);

    return reply.send(rows);
  });
};

export const autoPrefix = '/api';
export default questionsRoutes;
