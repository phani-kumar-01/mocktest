import { eq, and, lt, sql } from 'drizzle-orm';
import { db, schema } from '../db/client.js';

export interface JobDefinition {
  name: string;
  intervalMs: number;
  run: () => Promise<void>;
}

export const job: JobDefinition = {
  name: 'autosubmit',
  intervalMs: 5000,
  run: async () => {
    const now = new Date();

    const expiredAttempts = await db.update(schema.attempts)
      .set({
        status: 'auto_submitted',
        submittedAt: sql`${schema.attempts.deadlineAt}`
      })
      .where(and(
        eq(schema.attempts.status, 'in_progress'),
        lt(schema.attempts.deadlineAt, now)
      ))
      .returning({ id: schema.attempts.id });

    if (expiredAttempts.length > 0) {
      console.log(`[AutoSubmit] Automatically submitted ${expiredAttempts.length} expired attempt(s)`);
    }
  }
};

export default job;
