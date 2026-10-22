import { FastifyReply, FastifyRequest } from 'fastify';
import { db, schema } from '../db/client.js';
import { eq, and, gt } from 'drizzle-orm';
import { AppError } from './errors.js';

export interface SessionData {
  id: string;
  userType: 'student' | 'admin';
  userId: string;
  expiresAt: Date;
}

declare module 'fastify' {
  interface FastifyRequest {
    sessionUser?: {
      id: string;
      role: 'student' | 'admin';
      name: string;
      rollNo?: string;
      username?: string;
      mustChangePassword?: boolean;
    };
    session?: SessionData;
  }
}

export async function createSession(reply: FastifyReply, userType: 'student' | 'admin', userId: string) {
  // 12 hours expiry
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
  
  const [newSession] = await db.insert(schema.sessions).values({
    userType,
    userId,
    expiresAt,
    revoked: false
  }).returning();

  reply.setCookie('sid', newSession.id, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 12 * 60 * 60
  });

  return newSession;
}

export async function revokeStudentSessions(studentId: string) {
  await db.update(schema.sessions)
    .set({ revoked: true })
    .where(and(eq(schema.sessions.userType, 'student'), eq(schema.sessions.userId, studentId)));
}

export async function getSessionFromRequest(request: FastifyRequest): Promise<SessionData | null> {
  const sid = request.cookies.sid;
  if (!sid) return null;

  const [session] = await db.select()
    .from(schema.sessions)
    .where(and(
      eq(schema.sessions.id, sid),
      eq(schema.sessions.revoked, false),
      gt(schema.sessions.expiresAt, new Date())
    ))
    .limit(1);

  if (!session) return null;
  return {
    id: session.id,
    userType: session.userType as 'student' | 'admin',
    userId: session.userId,
    expiresAt: session.expiresAt
  };
}

export function requireRole(role: 'student' | 'admin') {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await getSessionFromRequest(request);
    if (!session) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    }

    if (session.userType !== role) {
      throw new AppError(403, 'FORBIDDEN', `Access forbidden: requires ${role} role`);
    }

    if (role === 'admin') {
      const [admin] = await db.select()
        .from(schema.admins)
        .where(eq(schema.admins.id, session.userId))
        .limit(1);

      if (!admin) {
        throw new AppError(401, 'UNAUTHORIZED', 'Admin account not found');
      }

      request.sessionUser = {
        id: admin.id,
        role: 'admin',
        name: admin.name,
        username: admin.username
      };
    } else {
      const [student] = await db.select()
        .from(schema.students)
        .where(eq(schema.students.id, session.userId))
        .limit(1);

      if (!student || !student.active) {
        throw new AppError(401, 'UNAUTHORIZED', 'Student account not found or inactive');
      }

      request.sessionUser = {
        id: student.id,
        role: 'student',
        name: student.name,
        rollNo: student.rollNo,
        mustChangePassword: student.mustChangePassword || false
      };
    }

    request.session = session;
  };
}
