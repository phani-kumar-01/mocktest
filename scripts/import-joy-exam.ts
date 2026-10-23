import ExcelJS from 'exceljs';
import { db, schema } from '../apps/api/src/db/client.js';
import { eq } from 'drizzle-orm';

async function importJoyExam() {
  const filePath = '/home/candy/Downloads/nptel_joy_of_computing_180_questions.xlsx';
  console.log(`Reading Excel file from: ${filePath}`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const ws = wb.getWorksheet('questions') || wb.worksheets[0];
  console.log(`Found worksheet "${ws.name}" with ${ws.rowCount} rows`);

  // 1. Ensure Subject exists
  const subjectName = 'The Joy of Computing using Python';
  let [subject] = await db.select().from(schema.subjects).where(eq(schema.subjects.name, subjectName)).limit(1);

  if (!subject) {
    [subject] = await db.insert(schema.subjects).values({ name: subjectName }).returning();
    console.log(`Created new subject: "${subject.name}" (ID: ${subject.id})`);
  } else {
    console.log(`Using existing subject: "${subject.name}" (ID: ${subject.id})`);
  }

  // 2. Parse questions
  // Row 1 is header
  const headerRow = ws.getRow(1);
  const colMap: Record<string, number> = {};
  headerRow.eachCell((cell, colNumber) => {
    const val = String(cell.value || '').trim().toLowerCase();
    colMap[val] = colNumber;
  });

  console.log('Header mapping:', colMap);

  const parsedQuestions: Array<typeof schema.questions.$inferInsert> = [];

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    
    // Check if row has content
    const questionText = String(row.getCell(colMap['question'] || 8).value || '').trim();
    if (!questionText) continue;

    const topic = String(row.getCell(colMap['topic'] || 2).value || 'General').trim();
    const subtopic = String(row.getCell(colMap['subtopic'] || 3).value || '').trim() || null;
    const concept = String(row.getCell(colMap['concept'] || 4).value || '').trim() || null;
    const setName = String(row.getCell(colMap['set'] || 5).value || '').trim() || null;
    const groupId = String(row.getCell(colMap['group'] || 6).value || '').trim() || null;
    const paragraph = String(row.getCell(colMap['paragraph'] || 7).value || '').trim() || null;
    const code = String(row.getCell(colMap['code'] || 9).value || '').trim() || null;
    const codeLang = String(row.getCell(colMap['code_lang'] || 10).value || '').trim() || 'python';
    
    const optionA = String(row.getCell(colMap['option_a'] || 11).value || '').trim();
    const optionB = String(row.getCell(colMap['option_b'] || 12).value || '').trim();
    const optionC = String(row.getCell(colMap['option_c'] || 13).value || '').trim();
    const optionD = String(row.getCell(colMap['option_d'] || 14).value || '').trim();
    
    let correct = String(row.getCell(colMap['correct'] || 15).value || 'A').trim().toLowerCase();
    if (!['a', 'b', 'c', 'd'].includes(correct)) {
      console.warn(`Row ${r}: unexpected correct value "${correct}", defaulting to "a"`);
      correct = 'a';
    }

    const marksVal = row.getCell(colMap['marks'] || 16).value;
    const marks = marksVal != null ? String(marksVal).trim() : '1';

    const negativeVal = row.getCell(colMap['negative'] || 17).value;
    const negative = negativeVal != null ? String(negativeVal).trim() : '0';

    const explanation = String(row.getCell(colMap['explanation'] || 18).value || '').trim() || null;

    parsedQuestions.push({
      subjectId: subject.id,
      topic,
      subtopic,
      concept,
      setName,
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
      marks: marks || '1',
      negative: negative || '0',
      explanationMd: explanation,
      active: true
    });
  }

  console.log(`Parsed ${parsedQuestions.length} questions from Excel file.`);

  // 3. Insert questions in chunks of 50
  const insertedQuestionIds: string[] = [];
  for (let i = 0; i < parsedQuestions.length; i += 50) {
    const chunk = parsedQuestions.slice(i, i + 50);
    const result = await db.insert(schema.questions).values(chunk).returning({ id: schema.questions.id });
    insertedQuestionIds.push(...result.map(r => r.id));
    console.log(`Inserted questions ${i + 1} - ${i + chunk.length} / ${parsedQuestions.length}`);
  }

  // 4. Create the Exam
  const examTitle = 'NPTEL - The Joy of Computing using Python - Mock Exam';
  console.log(`Creating exam: "${examTitle}"...`);

  const [exam] = await db.insert(schema.exams).values({
    title: examTitle,
    subjectId: subject.id,
    status: 'draft',
    durationMinutes: 60,
    questionsPerStudent: 50,
    joinPolicy: 'FIXED_END',
    requireSafeBrowser: true,
    assignmentMarks: '20',
    assignmentMax: '25',
    examMax: '75',
    passTotal: '40',
    passAssignmentMin: '10',
    passExamMin: '30',
    instanceNumber: 1
  }).returning();

  console.log(`Created exam (ID: ${exam.id})`);

  // 5. Link questions to exam
  const examQuestionsEntries = insertedQuestionIds.map(qid => ({
    examId: exam.id,
    questionId: qid
  }));

  for (let i = 0; i < examQuestionsEntries.length; i += 50) {
    const chunk = examQuestionsEntries.slice(i, i + 50);
    await db.insert(schema.examQuestions).values(chunk);
  }

  console.log(`Linked ${insertedQuestionIds.length} questions to exam "${exam.title}"!`);

  console.log('============================================================');
  console.log('IMPORT SUCCESSFUL:');
  console.log(`- Subject:   ${subject.name}`);
  console.log(`- Questions: ${insertedQuestionIds.length} questions imported`);
  console.log(`- Exam:      ${exam.title}`);
  console.log(`- Exam ID:   ${exam.id}`);
  console.log(`- Status:    draft (Ready to Start in Admin Portal)`);
  console.log('============================================================');
}

importJoyExam()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Import failed:', err);
    process.exit(1);
  });
