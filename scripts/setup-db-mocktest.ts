import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../apps/api/src/db/schema.js';
import { SCHEMA_SQL } from '../apps/api/src/db/migrate.js';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import ExcelJS from 'exceljs';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('ERROR: DATABASE_URL not found in .env');
  process.exit(1);
}

const directConnectionString = process.env.DATABASE_URL_UNPOOLED || connectionString;

async function setupDatabase() {
  console.log('============================================================');
  console.log('SETTING UP NEON DATABASE (PROJECT: mocktest)');
  console.log('============================================================');

  // 1. Direct connection for schema migrations
  console.log('Step 1: Running schema migrations on Neon Postgres...');
  const migrator = postgres(directConnectionString, { max: 2, idle_timeout: 10 });
  await migrator.unsafe(SCHEMA_SQL);
  console.log('Migrations completed successfully.');

  // 2. Clear all questions, exams, attempts, results, and student data
  console.log('Step 2: Clearing all questions, exams, attempts, results, and old students...');
  const sql = postgres(connectionString, { max: 10, idle_timeout: 20 });
  const db = drizzle(sql, { schema });

  await sql`TRUNCATE TABLE topic_scores, results, mail_queue, answers, attempts, exam_questions, exams, questions, import_batches, subjects, sessions, students CASCADE`;
  console.log('All questions, exams, attempts, and old student data cleared.');

  // 3. Ensure admin account exists
  console.log('Step 3: Ensuring admin account exists...');
  const adminPassHash = await bcrypt.hash('admin123', 10);
  const existingAdmin = await sql`SELECT id FROM admins WHERE username = 'admin' LIMIT 1`;
  if (existingAdmin.length === 0) {
    await sql`INSERT INTO admins (username, name, password_hash) VALUES ('admin', 'System Administrator', ${adminPassHash})`;
    console.log('Created admin account: admin / admin123');
  } else {
    await sql`UPDATE admins SET password_hash = ${adminPassHash} WHERE username = 'admin'`;
    console.log('Updated admin account password to admin123');
  }

  // 4. Read Students_Master_List.xlsx and import all 404 students
  console.log('Step 4: Reading Students_Master_List.xlsx...');
  const excelPath = path.resolve(__dirname, '../Students_Master_List.xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(excelPath);
  const sheet = wb.worksheets[0];

  console.log(`Excel sheet "${sheet.name}" has ${sheet.rowCount} rows.`);

  const studentRows: {
    rollNo: string;
    name: string;
    email: string | null;
    batch: string;
    passwordHash: string;
    mustChangePassword: boolean;
    active: boolean;
  }[] = [];

  // Hash once per distinct password to speed up bcrypt, or per rollNo
  // Since password defaults to rollNo, precompute password hashes
  console.log('Hashing student passwords (default: Roll Number)...');
  const passwordHashMap = new Map<string, string>();

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const email = String(row.getCell(1).text || '').trim();
    const rollNo = String(row.getCell(2).text || '').trim();
    const name = String(row.getCell(3).text || '').trim();
    const year = String(row.getCell(4).text || '').trim();
    const section = String(row.getCell(5).text || '').trim();
    const branch = String(row.getCell(6).text || '').trim();

    if (!rollNo || !name) continue;

    let hash = passwordHashMap.get(rollNo);
    if (!hash) {
      hash = await bcrypt.hash(rollNo, 8); // Salt rounds 8 for fast bulk import
      passwordHashMap.set(rollNo, hash);
    }

    const batch = `${branch}-${section}`;

    studentRows.push({
      rollNo,
      name,
      email: email || null,
      batch,
      passwordHash: hash,
      mustChangePassword: false,
      active: true
    });
  }

  console.log(`Inserting ${studentRows.length} students from Excel into Neon Postgres...`);

  // Insert in batches of 50
  const BATCH_SIZE = 50;
  for (let i = 0; i < studentRows.length; i += BATCH_SIZE) {
    const chunk = studentRows.slice(i, i + BATCH_SIZE);
    await db.insert(schema.students).values(chunk);
    process.stdout.write(`  Inserted ${Math.min(i + BATCH_SIZE, studentRows.length)} / ${studentRows.length} students\r`);
  }
  console.log('\nAll students inserted successfully.');

  // 5. Clean up old question files in Neon Object Storage
  if (process.env.AWS_ENDPOINT_URL_S3 && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    console.log('Step 5: Cleaning up test question files from Neon Object Storage bucket "assets"...');
    try {
      const s3 = new S3Client({
        endpoint: process.env.AWS_ENDPOINT_URL_S3,
        region: process.env.AWS_REGION || 'us-east-2',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        },
        forcePathStyle: true
      });

      const list = await s3.send(new ListObjectsV2Command({
        Bucket: 'assets',
        Prefix: 'questions/'
      }));

      if (list.Contents && list.Contents.length > 0) {
        const objectsToDelete = list.Contents.map(c => ({ Key: c.Key! }));
        await s3.send(new DeleteObjectsCommand({
          Bucket: 'assets',
          Delete: { Objects: objectsToDelete }
        }));
        console.log(`Deleted ${objectsToDelete.length} question files from storage bucket.`);
      } else {
        console.log('No leftover question files in bucket.');
      }
    } catch (err: any) {
      console.warn('Storage cleanup warning:', err.message);
    }
  }

  // 6. Verification
  console.log('============================================================');
  console.log('DATABASE VERIFICATION SUMMARY:');
  const [studentCount] = await sql`SELECT count(*)::int as count FROM students`;
  const [questionCount] = await sql`SELECT count(*)::int as count FROM questions`;
  const [examCount] = await sql`SELECT count(*)::int as count FROM exams`;
  const [adminCount] = await sql`SELECT count(*)::int as count FROM admins`;
  const batches = await sql`SELECT batch, count(*)::int as count FROM students GROUP BY batch ORDER BY batch`;

  console.log(`- Students in DB:    ${studentCount.count} (Expected: 404)`);
  console.log(`- Questions in DB:   ${questionCount.count} (Expected: 0 - completely cleared)`);
  console.log(`- Exams in DB:       ${examCount.count} (Expected: 0 - completely cleared)`);
  console.log(`- Admins in DB:      ${adminCount.count} (admin / admin123)`);
  console.log('- Batch Breakdown:');
  for (const b of batches) {
    console.log(`    * ${b.batch}: ${b.count} students`);
  }
  console.log('============================================================');

  await sql.end();
  await migrator.end();
  console.log('Database setup complete!');
}

setupDatabase().catch(err => {
  console.error('Database setup failed:', err);
  process.exit(1);
});
