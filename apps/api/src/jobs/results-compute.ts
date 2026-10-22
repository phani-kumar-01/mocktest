import { eq } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { computeExamResults } from '../modules/results/index.js';

export interface JobDefinition {
  name: string;
  intervalMs: number;
  run: () => Promise<void>;
}

export const job: JobDefinition = {
  name: 'results-compute',
  intervalMs: 10000,
  run: async () => {
    // Find ended exams that need results computed
    const endedExams = await db.select({ id: schema.exams.id })
      .from(schema.exams)
      .where(eq(schema.exams.status, 'ended'));

    for (const exam of endedExams) {
      try {
        await computeExamResults(exam.id);
      } catch (err) {
        // Log and continue
      }
    }
  }
};

export default job;
