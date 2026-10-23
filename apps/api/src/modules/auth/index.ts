import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../db/client.js';
import { createSession, getSessionFromRequest, revokeStudentSessions } from '../../lib/session.js';
import { AppError } from '../../lib/errors.js';
import {
  StudentLoginSchema,
  AdminLoginSchema,
  ChangePasswordSchema
} from '@nptel/shared';

const authRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Student Login
  fastify.post('/student/login', async (request, reply) => {
    const body = StudentLoginSchema.parse(request.body);

    const [student] = await db.select()
      .from(schema.students)
      .where(eq(schema.students.rollNo, body.rollNo))
      .limit(1);

    if (!student || !student.active) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid roll number or password');
    }

    const validPassword = await bcrypt.compare(body.password, student.passwordHash);
    if (!validPassword) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid roll number or password');
    }

    // Revoke previous sessions of this student (Single active session rule)
    await revokeStudentSessions(student.id);

    // Create new session & set cookie
    await createSession(reply, 'student', student.id);

    return reply.send({
      user: {
        id: student.id,
        rollNo: student.rollNo,
        name: student.name,
        mustChangePassword: student.mustChangePassword || false
      }
    });
  });

  // Admin Login
  fastify.post('/admin/login', async (request, reply) => {
    const body = AdminLoginSchema.parse(request.body);

    const [admin] = await db.select()
      .from(schema.admins)
      .where(eq(schema.admins.username, body.username))
      .limit(1);

    if (!admin) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid username or password');
    }

    const validPassword = await bcrypt.compare(body.password, admin.passwordHash);
    if (!validPassword) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid username or password');
    }

    // Audit log
    await db.insert(schema.auditLog).values({
      actor: admin.username,
      action: 'ADMIN_LOGIN',
      details: { ip: request.ip, userAgent: request.headers['user-agent'] }
    });

    // Create session & set cookie
    await createSession(reply, 'admin', admin.id);

    return reply.send({
      user: {
        id: admin.id,
        username: admin.username,
        name: admin.name
      }
    });
  });

  // Logout
  fastify.post('/logout', async (request, reply) => {
    const roleParam = (request.query as any)?.role as 'student' | 'admin' | undefined;

    if (roleParam === 'admin') {
      const sid = request.cookies.admin_sid;
      if (sid) {
        await db.update(schema.sessions)
          .set({ revoked: true })
          .where(eq(schema.sessions.id, sid));
      }
      reply.clearCookie('admin_sid', { path: '/' });
    } else if (roleParam === 'student') {
      const sid = request.cookies.student_sid;
      if (sid) {
        await db.update(schema.sessions)
          .set({ revoked: true })
          .where(eq(schema.sessions.id, sid));
      }
      reply.clearCookie('student_sid', { path: '/' });
    } else {
      const allSids = [request.cookies.sid, request.cookies.admin_sid, request.cookies.student_sid].filter(Boolean) as string[];
      for (const sid of allSids) {
        await db.update(schema.sessions)
          .set({ revoked: true })
          .where(eq(schema.sessions.id, sid));
      }
      reply.clearCookie('sid', { path: '/' });
      reply.clearCookie('admin_sid', { path: '/' });
      reply.clearCookie('student_sid', { path: '/' });
    }

    return reply.status(204).send();
  });

  // Get Current Authenticated User (GET /auth/me)
  fastify.get('/me', async (request, reply) => {
    const roleParam = (request.query as any)?.role as 'student' | 'admin' | undefined;
    const session = await getSessionFromRequest(request, roleParam);
    if (!session) {
      throw new AppError(401, 'UNAUTHORIZED', 'Not authenticated');
    }

    if (session.userType === 'admin') {
      const [admin] = await db.select()
        .from(schema.admins)
        .where(eq(schema.admins.id, session.userId))
        .limit(1);

      if (!admin) {
        throw new AppError(401, 'UNAUTHORIZED', 'Admin account not found');
      }

      return reply.send({
        role: 'admin',
        user: {
          id: admin.id,
          username: admin.username,
          name: admin.name
        }
      });
    } else {
      const [student] = await db.select()
        .from(schema.students)
        .where(eq(schema.students.id, session.userId))
        .limit(1);

      if (!student || !student.active) {
        throw new AppError(401, 'UNAUTHORIZED', 'Student account not found or inactive');
      }

      return reply.send({
        role: 'student',
        user: {
          id: student.id,
          rollNo: student.rollNo,
          name: student.name,
          mustChangePassword: student.mustChangePassword || false
        }
      });
    }
  });

  // Change Password
  fastify.post('/change-password', async (request, reply) => {
    const session = await getSessionFromRequest(request);
    if (!session) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    }

    const body = ChangePasswordSchema.parse(request.body);

    if (session.userType === 'student') {
      const [student] = await db.select()
        .from(schema.students)
        .where(eq(schema.students.id, session.userId))
        .limit(1);

      if (!student) {
        throw new AppError(401, 'UNAUTHORIZED', 'User not found');
      }

      const validOld = await bcrypt.compare(body.oldPassword, student.passwordHash);
      if (!validOld) {
        throw new AppError(400, 'INVALID_PASSWORD', 'Current password incorrect');
      }

      const newHash = await bcrypt.hash(body.newPassword, 8);
      await db.update(schema.students)
        .set({ passwordHash: newHash, mustChangePassword: false })
        .where(eq(schema.students.id, student.id));

    } else {
      const [admin] = await db.select()
        .from(schema.admins)
        .where(eq(schema.admins.id, session.userId))
        .limit(1);

      if (!admin) {
        throw new AppError(401, 'UNAUTHORIZED', 'Admin not found');
      }

      const validOld = await bcrypt.compare(body.oldPassword, admin.passwordHash);
      if (!validOld) {
        throw new AppError(400, 'INVALID_PASSWORD', 'Current password incorrect');
      }

      const newHash = await bcrypt.hash(body.newPassword, 8);
      await db.update(schema.admins)
        .set({ passwordHash: newHash })
        .where(eq(schema.admins.id, admin.id));
    }

    return reply.status(204).send();
  });
};

export const autoPrefix = '/api/auth';
export default authRoutes;
