import { eq, and, lte } from 'drizzle-orm';
import { db, schema } from '../db/client.js';

export interface JobDefinition {
  name: string;
  intervalMs: number;
  run: () => Promise<void>;
}

export const job: JobDefinition = {
  name: 'scheduler',
  intervalMs: 5000,
  run: async () => {
    const now = new Date();

    // Find and atomically start any scheduled exams that are due
    const dueExams = await db.update(schema.exams)
      .set({
        status: 'live',
        startedAt: now
      })
      .where(and(
        eq(schema.exams.status, 'scheduled'),
        eq(schema.exams.autoStart, true),
        lte(schema.exams.scheduledStart, now)
      ))
      .returning();

    if (dueExams.length > 0) {
      console.log(`[Scheduler] Automatically started ${dueExams.length} scheduled exam(s): ${dueExams.map(e => e.title).join(', ')}`);
    }
  }
};

export default job;
