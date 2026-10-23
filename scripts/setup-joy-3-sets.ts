import ExcelJS from 'exceljs';
import { db, schema, sql } from '../apps/api/src/db/client.js';
import { eq, inArray } from 'drizzle-orm';

async function setupJoy3Sets() {
  const filePath = '/home/candy/Downloads/nptel_joy_of_computing_180_questions.xlsx';
  console.log(`Loading Excel from: ${filePath}`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.getWorksheet('questions') || wb.worksheets[0];

  // 1. Subject
  const subjectName = 'The Joy of Computing using Python';
  let [subject] = await db.select().from(schema.subjects).where(eq(schema.subjects.name, subjectName)).limit(1);
  if (!subject) {
    [subject] = await db.insert(schema.subjects).values({ name: subjectName }).returning();
    console.log(`Created subject: ${subject.name}`);
  }

  // 2. Clear old combined exam if it exists
  console.log('Finding old exams...');
  const oldExams = await db.select().from(schema.exams).where(eq(schema.exams.title, 'NPTEL - The Joy of Computing using Python - Mock Exam'));
  console.log(`Found ${oldExams.length} old exams.`);
  for (const oldEx of oldExams) {
    console.log(`Cleaning child tables for exam ${oldEx.id}...`);
    await sql`DELETE FROM mail_queue WHERE exam_id = ${oldEx.id}`;
    await sql`DELETE FROM results WHERE exam_id = ${oldEx.id}`;
    await sql`DELETE FROM topic_scores WHERE attempt_id IN (SELECT id FROM attempts WHERE exam_id = ${oldEx.id})`;
    await sql`DELETE FROM answers WHERE attempt_id IN (SELECT id FROM attempts WHERE exam_id = ${oldEx.id})`;
    await sql`DELETE FROM attempts WHERE exam_id = ${oldEx.id}`;
    await sql`DELETE FROM exam_questions WHERE exam_id = ${oldEx.id}`;
    await sql`DELETE FROM exams WHERE id = ${oldEx.id}`;
    console.log(`Deleted old combined exam: ${oldEx.title} (${oldEx.id})`);
  }

  // 3. Clear existing questions for this subject to ensure fresh clean rows with exact group and set
  console.log('Cleaning existing questions for subject...');
  await sql`DELETE FROM exam_questions WHERE question_id IN (SELECT id FROM questions WHERE subject_id = ${subject.id})`;
  await sql`DELETE FROM answers WHERE question_id IN (SELECT id FROM questions WHERE subject_id = ${subject.id})`;
  await sql`DELETE FROM questions WHERE subject_id = ${subject.id}`;
  console.log('Cleared existing questions for fresh 3-set setup.');

  // 4. Parse all 180 questions with explicit set and group tracking
  const headerRow = ws.getRow(1);
  const colMap: Record<string, number> = {};
  headerRow.eachCell((cell, colNumber) => {
    const val = String(cell.value || '').trim().toLowerCase();
    colMap[val] = colNumber;
  });

  interface ParsedQ {
    setNum: number;
    groupId: string;
    data: typeof schema.questions.$inferInsert;
  }

  const setQuestions: Record<number, Array<typeof schema.questions.$inferInsert>> = {
    1: [],
    2: [],
    3: []
  };

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const questionText = String(row.getCell(colMap['question'] || 7).value || '').trim();
    if (!questionText) continue;

    const setRaw = String(row.getCell(colMap['set'] || 4).value || '1').trim();
    const setNum = parseInt(setRaw, 10) || 1;

    const topic = String(row.getCell(colMap['topic'] || 1).value || 'General').trim();
    const subtopic = String(row.getCell(colMap['subtopic'] || 2).value || '').trim() || null;
    const concept = String(row.getCell(colMap['concept'] || 3).value || '').trim() || null;
    const groupId = String(row.getCell(colMap['group'] || 5).value || '').trim() || null;
    const paragraph = String(row.getCell(colMap['paragraph'] || 6).value || '').trim() || null;
    const code = String(row.getCell(colMap['code'] || 8).value || '').trim() || null;
    const codeLang = String(row.getCell(colMap['code_lang'] || 9).value || '').trim() || 'python';

    const optionA = String(row.getCell(colMap['option_a'] || 10).value || '').trim();
    const optionB = String(row.getCell(colMap['option_b'] || 11).value || '').trim();
    const optionC = String(row.getCell(colMap['option_c'] || 12).value || '').trim();
    const optionD = String(row.getCell(colMap['option_d'] || 13).value || '').trim();

    let correct = String(row.getCell(colMap['correct'] || 14).value || 'A').trim().toLowerCase();
    if (!['a', 'b', 'c', 'd'].includes(correct)) correct = 'a';

    const marksVal = row.getCell(colMap['marks'] || 15).value;
    const marks = marksVal != null ? String(marksVal).trim() : '1';

    const negativeVal = row.getCell(colMap['negative'] || 16).value;
    const negative = negativeVal != null ? String(negativeVal).trim() : '0';

    const explanation = String(row.getCell(colMap['explanation'] || 17).value || '').trim() || null;

    if (!setQuestions[setNum]) setQuestions[setNum] = [];

    setQuestions[setNum].push({
      subjectId: subject.id,
      topic,
      subtopic,
      concept,
      setName: `Set ${setNum}`,
      groupId,
      paragraph,
      bodyMd: questionText,
      codeSnippet: code,
      codeLang,
      optionA: optionA || 'Option A',
      optionB: optionB || 'Option B',
      optionC: optionC || 'Option C',
      optionD: optionD || 'Option D',
      correct,
      marks,
      negative,
      explanationMd: explanation,
      active: true
    });
  }

  console.log(`Parsed questions by set:`);
  console.log(`- Set 1: ${setQuestions[1].length} questions`);
  console.log(`- Set 2: ${setQuestions[2].length} questions`);
  console.log(`- Set 3: ${setQuestions[3].length} questions`);

  // 5. Create 3 Exams and insert their questions
  for (const setNum of [1, 2, 3]) {
    const qList = setQuestions[setNum];
    if (!qList || qList.length === 0) continue;

    // Insert questions for this set
    const insertedIds: string[] = [];
    for (let i = 0; i < qList.length; i += 50) {
      const chunk = qList.slice(i, i + 50);
      const inserted = await db.insert(schema.questions).values(chunk).returning({ id: schema.questions.id });
      insertedIds.push(...inserted.map(q => q.id));
    }

    const examTitle = `NPTEL Joy of Computing - Set ${setNum} (Fixed Test)`;
    
    // Check if exam already exists
    let [exam] = await db.select().from(schema.exams).where(eq(schema.exams.title, examTitle)).limit(1);
    if (!exam) {
      [exam] = await db.insert(schema.exams).values({
        title: examTitle,
        subjectId: subject.id,
        status: 'draft',
        durationMinutes: 60,
        questionsPerStudent: 60, // Fixed test: all 60 questions in the set
        joinPolicy: 'FIXED_END',
        shuffleQuestions: true, // Shuffles groups as cluster units: questions within each group stay together!
        shuffleOptions: true,
        requireSafeBrowser: true,
        assignmentMarks: '20',
        assignmentMax: '25',
        examMax: '75',
        passTotal: '40',
        passAssignmentMin: '10',
        passExamMin: '30',
        instanceNumber: 1
      }).returning();
      console.log(`Created Exam: "${exam.title}" (ID: ${exam.id})`);
    } else {
      // Clear old pool for this exam
      await db.delete(schema.examQuestions).where(eq(schema.examQuestions.examId, exam.id));
      console.log(`Reusing Exam: "${exam.title}" (ID: ${exam.id})`);
    }

    // Link all 60 questions to this exam
    const poolLinks = insertedIds.map(qid => ({
      examId: exam.id,
      questionId: qid
    }));
    for (let i = 0; i < poolLinks.length; i += 50) {
      await db.insert(schema.examQuestions).values(poolLinks.slice(i, i + 50));
    }

    console.log(`Linked all ${insertedIds.length} questions to "${exam.title}" (60 questions in pool).`);
  }

  console.log('============================================================');
  console.log('3 FIXED TEST EXAMS SUCCESSFULLY CREATED & CONFIGURED:');
  console.log('1. NPTEL Joy of Computing - Set 1 (Fixed Test) -> 60 Questions (12 Groups)');
  console.log('2. NPTEL Joy of Computing - Set 2 (Fixed Test) -> 60 Questions (12 Groups)');
  console.log('3. NPTEL Joy of Computing - Set 3 (Fixed Test) -> 60 Questions (12 Groups)');
  console.log('Group integrity: Questions in each scenario group (5 questions each) stay together at a time even when exam is jumbled.');
  console.log('============================================================');
}

setupJoy3Sets()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Failed to setup 3 sets:', err);
    process.exit(1);
  });
