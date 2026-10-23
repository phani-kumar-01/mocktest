import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { eq, and, sql, desc } from 'drizzle-orm';
import { db, schema } from '../../db/client.js';
import { requireRole } from '../../lib/session.js';
import { AppError } from '../../lib/errors.js';
import { generateStudentReportPdf } from './pdf.js';
import { MailStatusResponse } from '@nptel/shared';

export function createMailerTransport() {
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD.replace(/\s+/g, '')
      }
    });
  }

  const host = process.env.SMTP_HOST || 'smtp-relay.brevo.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS ? process.env.SMTP_PASS.replace(/\s+/g, '') : undefined;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined
  });
}

export async function sendEmail(options: {
  to: string;
  subject: string;
  text?: string;
  html: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}): Promise<{ id?: string }> {
  // 1. If Gmail App credentials provided, prioritize Gmail
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    const transporter = createMailerTransport();
    const from = process.env.MAIL_FROM || process.env.GMAIL_USER;
    const info = await transporter.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      attachments: options.attachments?.map(a => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType
      }))
    });
    return { id: info.messageId };
  }

  // 2. If Brevo / Custom SMTP credentials provided, prioritize SMTP
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    const transporter = createMailerTransport();
    const from = process.env.MAIL_FROM || 'elite@sasi.ac.in';
    const info = await transporter.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      attachments: options.attachments?.map(a => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType
      }))
    });
    return { id: info.messageId };
  }

  // 3. If Resend is configured, use Resend
  if (process.env.RESEND_API_KEY) {
    const from = process.env.RESEND_FROM || process.env.MAIL_FROM || 'onboarding@resend.dev';
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      attachments: options.attachments?.map(a => ({
        filename: a.filename,
        content: a.content
      }))
    });

    if (error) {
      throw new Error(`Resend Error: ${error.message} (${error.name})`);
    }

    return { id: data?.id };
  }

  // 4. Fallback to default localhost SMTP
  const transporter = createMailerTransport();
  const from = process.env.MAIL_FROM || 'no-reply@nptel-mock.edu';
  const info = await transporter.sendMail({
    from,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
    attachments: options.attachments?.map(a => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType
    }))
  });

  return { id: info.messageId };
}

const mailRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.addHook('preHandler', requireRole('admin'));

  // 1. POST /api/admin/exams/:id/publish
  fastify.post('/admin/exams/:id/publish', async (request, reply) => {
    const { id } = request.params as { id: string };

    const [exam] = await db.select().from(schema.exams).where(eq(schema.exams.id, id)).limit(1);
    if (!exam) throw new AppError(404, 'NOT_FOUND', 'Exam not found');

    // Mark results published
    await db.update(schema.exams)
      .set({ resultsPublished: true })
      .where(eq(schema.exams.id, id));

    // Fetch all submitted attempts for this exam with student info
    const submittedAttempts = await db.select({
      attemptId: schema.attempts.id,
      studentId: schema.students.id,
      rollNo: schema.students.rollNo,
      name: schema.students.name,
      email: schema.students.email
    })
      .from(schema.attempts)
      .innerJoin(schema.students, eq(schema.attempts.studentId, schema.students.id))
      .where(and(
        eq(schema.attempts.examId, id),
        sql`attempts.status in ('submitted', 'auto_submitted')`
      ));

    let enqueued = 0;
    let skipped = 0;

    for (const item of submittedAttempts) {
      if (!item.email || !item.email.includes('@')) {
        skipped++;
        continue;
      }

      const subject = `Mock Result: ${exam.title} — ${item.rollNo}`;

      // Insert into mail_queue (unique per examId, studentId)
      await db.insert(schema.mailQueue)
        .values({
          examId: id,
          studentId: item.studentId,
          toEmail: item.email,
          subject,
          status: 'pending',
          tries: 0
        })
        .onConflictDoNothing();

      enqueued++;
    }

    return reply.send({
      success: true,
      enqueuedCount: enqueued,
      skippedNoEmailCount: skipped
    });
  });

  // 2. GET /api/admin/exams/:id/mail-status
  fastify.get('/admin/exams/:id/mail-status', async (request, reply) => {
    const { id } = request.params as { id: string };

    const studentsInExam = await db.select({
      studentId: schema.students.id,
      rollNo: schema.students.rollNo,
      name: schema.students.name,
      email: schema.students.email,
      status: schema.mailQueue.status,
      lastError: schema.mailQueue.lastError
    })
      .from(schema.attempts)
      .innerJoin(schema.students, eq(schema.attempts.studentId, schema.students.id))
      .leftJoin(schema.mailQueue, and(eq(schema.mailQueue.examId, id), eq(schema.mailQueue.studentId, schema.students.id)))
      .where(eq(schema.attempts.examId, id));

    let pending = 0;
    let sending = 0;
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    const studentList = studentsInExam.map(s => {
      let st: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped' = 'skipped';
      if (!s.email) {
        skipped++;
      } else if (s.status === 'sent') {
        sent++;
        st = 'sent';
      } else if (s.status === 'failed') {
        failed++;
        st = 'failed';
      } else if (s.status === 'sending') {
        sending++;
        st = 'sending';
      } else if (s.status === 'pending') {
        pending++;
        st = 'pending';
      } else {
        skipped++;
      }

      return {
        studentId: s.studentId,
        rollNo: s.rollNo,
        name: s.name,
        email: s.email,
        status: st,
        lastError: s.lastError
      };
    });

    const resp: MailStatusResponse = {
      examId: id,
      total: studentsInExam.length,
      pending,
      sending,
      sent,
      failed,
      skipped,
      students: studentList
    };

    return reply.send(resp);
  });

  // 3. POST /api/admin/exams/:id/mail/retry-failed
  fastify.post('/admin/exams/:id/mail/retry-failed', async (request, reply) => {
    const { id } = request.params as { id: string };

    const updated = await db.update(schema.mailQueue)
      .set({
        status: 'pending',
        tries: 0,
        lastError: null
      })
      .where(and(
        eq(schema.mailQueue.examId, id),
        eq(schema.mailQueue.status, 'failed')
      ))
      .returning({ id: schema.mailQueue.id });

    return reply.send({ retriedCount: updated.length });
  });

  // 4. GET /api/admin/exams/:id/students/:studentId/report.pdf
  fastify.get('/admin/exams/:id/students/:studentId/report.pdf', async (request, reply) => {
    const { id, studentId } = request.params as { id: string; studentId: string };

    const pdfBuffer = await generateStudentReportPdf(id, studentId);

    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `inline; filename="report_${studentId}.pdf"`);
    return reply.send(pdfBuffer);
  });

  // 5. POST /api/admin/mail/test
  fastify.post('/admin/mail/test', async (request, reply) => {
    const { to } = (request.body as any) || {};
    if (!to || !to.includes('@')) {
      throw new AppError(400, 'INVALID_EMAIL', 'Valid recipient email required');
    }

    try {
      const result = await sendEmail({
        to,
        subject: 'Test Email - NPTEL Mock Exam Portal',
        text: 'This is a test email confirming that email sending is working properly.',
        html: '<p>This is a test email confirming that email sending is working properly.</p>'
      });

      return reply.send({ success: true, message: `Test mail successfully sent to ${to}`, id: result.id });
    } catch (err: any) {
      throw new AppError(500, 'MAIL_ERROR', `Failed to send test email: ${err.message}`);
    }
  });
};

export const autoPrefix = '/api';
export default mailRoutes;
