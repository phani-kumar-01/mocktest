import bcrypt from 'bcryptjs';
import { db, schema } from '../apps/api/src/db/client.js';
import { migrate } from '../apps/api/src/db/migrate.js';
import { eq } from 'drizzle-orm';

async function seed() {
  console.log('Seeding NPTEL Mock Exam Portal database...');
  await migrate();

  // 1. Admin
  const adminUsername = 'admin';
  const existingAdmin = await db.select().from(schema.admins).where(eq(schema.admins.username, adminUsername)).limit(1);

  if (existingAdmin.length === 0) {
    const passwordHash = bcrypt.hashSync('admin123', 8);
    await db.insert(schema.admins).values({
      username: adminUsername,
      name: 'System Administrator',
      passwordHash
    });
    console.log('Created default admin: admin / admin123');
  }

  // 3. Subject: Python Programming
  let [subject] = await db.select().from(schema.subjects).where(eq(schema.subjects.name, 'Python Programming')).limit(1);
  if (!subject) {
    [subject] = await db.insert(schema.subjects).values({ name: 'Python Programming' }).returning();
    console.log('Created subject: Python Programming');
  }

  // 4. 200 Questions over 10 Topics
  console.log('Seeding 200 question bank questions...');
  const existingQuestions = await db.select({ count: schema.questions.id })
    .from(schema.questions)
    .where(eq(schema.questions.subjectId, subject.id));

  const questionIds: string[] = [];

  if (existingQuestions.length < 200) {
    const topics = [
      { name: 'Lists', subtopic: 'Slicing & Mutation' },
      { name: 'Tuples', subtopic: 'Immutability & Unpacking' },
      { name: 'Dictionaries', subtopic: 'Keys & Hashing' },
      { name: 'Strings', subtopic: 'Formatting & Methods' },
      { name: 'Functions', subtopic: 'Recursion & *args' },
      { name: 'Loops', subtopic: 'Iterators & Generators' },
      { name: 'OOP', subtopic: 'Classes & Inheritance' },
      { name: 'Files', subtopic: 'I/O & Context Managers' },
      { name: 'Exceptions', subtopic: 'Try-Except Blocks' },
      { name: 'Comprehensions', subtopic: 'List & Dict Comprehensions' }
    ];

    const questionsToInsert = [];
    const correctOptions = ['a', 'b', 'c', 'd'];

    for (let t = 0; t < topics.length; t++) {
      const topicObj = topics[t];

      for (let q = 1; q <= 20; q++) {
        const correct = correctOptions[(t + q) % 4];
        const isCodeQuestion = q % 2 === 0;

        let codeSnippet = null;
        let bodyMd = `In Python, regarding ${topicObj.name.toLowerCase()} and ${topicObj.subtopic.toLowerCase()}: What will be the behavior of expression #${q} under standard CPython 3.11 execution rules?`;

        if (isCodeQuestion) {
          codeSnippet = `# Demonstration of ${topicObj.name} behavior
def process_data(items):
    result = []
    for idx, val in enumerate(items):
        if idx % 2 == 0:
            result.append(val * 2)
        else:
            result.append(val + 10)
    return result

sample = [1, 2, 3, 4, 5]
output = process_data(sample)
print(output)`;
          bodyMd = `Analyze the following Python implementation carefully. What is printed to stdout when this script runs?`;
        }

        questionsToInsert.push({
          subjectId: subject.id,
          topic: topicObj.name,
          subtopic: topicObj.subtopic,
          bodyMd,
          codeSnippet,
          codeLang: 'python',
          optionA: `Calculates primary transformation producing [2, 12, 6, 14, 10]`,
          optionB: `Raises TypeError due to unmatched types during enumeration`,
          optionC: `Returns modified copy with original list unchanged`,
          optionD: `Produces empty list resulting from early termination`,
          correct,
          marks: '1',
          negative: '0.25',
          explanationMd: `According to standard Python semantics, iteration evaluates each branch sequentially.`
        });
      }
    }

    for (let k = 0; k < questionsToInsert.length; k += 50) {
      const chunk = questionsToInsert.slice(k, k + 50);
      const inserted = await db.insert(schema.questions).values(chunk).returning({ id: schema.questions.id });
      questionIds.push(...inserted.map(i => i.id));
    }
    console.log(`200 questions seeded successfully.`);
  } else {
    const rows = await db.select({ id: schema.questions.id }).from(schema.questions).where(eq(schema.questions.subjectId, subject.id));
    questionIds.push(...rows.map(r => r.id));
  }

  // 5. Ready-to-use Mock Exam
  console.log('Seeding ready exam...');
  const examTitle = 'NPTEL Python Comprehensive Mock Exam';
  let [exam] = await db.select().from(schema.exams).where(eq(schema.exams.title, examTitle)).limit(1);

  if (!exam) {
    [exam] = await db.insert(schema.exams).values({
      title: examTitle,
      subjectId: subject.id,
      status: 'draft',
      durationMinutes: 60,
      questionsPerStudent: 50,
      joinPolicy: 'FIXED_END',
      assignmentMarks: '20',
      assignmentMax: '25',
      examMax: '75',
      passTotal: '40',
      passAssignmentMin: '10',
      passExamMin: '30'
    }).returning();

    // Assign all questions to pool
    if (questionIds.length > 0) {
      await db.insert(schema.examQuestions).values(
        questionIds.map(qid => ({ examId: exam.id, questionId: qid }))
      );
    }
    console.log(`Created ready exam: ${exam.title} (ID: ${exam.id})`);
  }

  console.log('------------------------------------------------------------');
  console.log('SEED COMPLETE!');
  console.log('Admin Login: admin / admin123');
  console.log('------------------------------------------------------------');
}

seed().then(() => process.exit(0)).catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
