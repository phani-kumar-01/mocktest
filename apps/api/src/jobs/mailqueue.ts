import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { sendEmail } from '../modules/mail/index.js';
import { generateStudentReportPdf } from '../modules/mail/pdf.js';

export interface JobDefinition {
  name: string;
  intervalMs: number;
  run: () => Promise<void>;
}

export const job: JobDefinition = {
  name: 'mailqueue',
  intervalMs: 5000,
  run: async () => {
    // Process up to 5 pending emails per tick
    const pendingItems = await db.select()
      .from(schema.mailQueue)
      .where(eq(schema.mailQueue.status, 'pending'))
      .limit(5);

    if (pendingItems.length === 0) return;

    for (const item of pendingItems) {
      // Mark sending
      await db.update(schema.mailQueue)
        .set({ status: 'sending' })
        .where(eq(schema.mailQueue.id, item.id));

      try {
        // Generate PDF
        const pdfBuffer = await generateStudentReportPdf(item.examId, item.studentId);

        await sendEmail({
          to: item.toEmail,
          subject: item.subject,
          text: `Dear Student,\n\nPlease find attached your mock exam score and topic performance report.\n\nBest regards,\nNPTEL Mock Exam Team`,
          html: `<p>Dear Student,</p><p>Please find attached your mock exam score and topic performance report.</p><p>Best regards,<br>NPTEL Mock Exam Team</p>`,
          attachments: [
            {
              filename: 'Exam_Performance_Report.pdf',
              content: pdfBuffer,
              contentType: 'application/pdf'
            }
          ]
        });

        // Mark sent
        await db.update(schema.mailQueue)
          .set({
            status: 'sent',
            sentAt: new Date()
          })
          .where(eq(schema.mailQueue.id, item.id));

      } catch (err: any) {
        const nextTries = (item.tries || 0) + 1;
        const nextStatus = nextTries >= 3 ? 'failed' : 'pending';

        await db.update(schema.mailQueue)
          .set({
            status: nextStatus,
            tries: nextTries,
            lastError: err.message || String(err)
          })
          .where(eq(schema.mailQueue.id, item.id));
      }
    }
  }
};

export default job;
