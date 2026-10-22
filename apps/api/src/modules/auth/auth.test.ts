import { describe, it, expect, beforeAll } from 'vitest';
import { buildApp } from '../../app.js';
import { db, schema } from '../../db/client.js';
import { migrate } from '../../db/migrate.js';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { FastifyInstance } from 'fastify';

describe('Auth Module (Agent A)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.USE_PGLITE = 'true';
    await migrate();
    app = await buildApp();

    // Create test student
    const studentPass = await bcrypt.hash('stud123', 8);
    await db.delete(schema.students).where(eq(schema.students.rollNo, 'TEST_ROLL_1'));
    await db.insert(schema.students).values({
      rollNo: 'TEST_ROLL_1',
      name: 'Test Student',
      passwordHash: studentPass,
      active: true
    });

    // Create test admin
    const adminPass = await bcrypt.hash('adminpass', 8);
    await db.delete(schema.admins).where(eq(schema.admins.username, 'testadmin'));
    await db.insert(schema.admins).values({
      username: 'testadmin',
      name: 'Admin Tester',
      passwordHash: adminPass
    });
  });

  it('rejects invalid password with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/student/login',
      payload: {
        rollNo: 'TEST_ROLL_1',
        password: 'wrongpassword'
      }
    });

    expect(res.statusCode).toBe(401);
  });

  it('successful student login sets sid cookie and returns user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/student/login',
      payload: {
        rollNo: 'TEST_ROLL_1',
        password: 'stud123'
      }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.rollNo).toBe('TEST_ROLL_1');
    expect(res.cookies.some(c => c.name === 'sid')).toBe(true);
  });

  it('second login revokes the earlier session for that student', async () => {
    // 1st login
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/auth/student/login',
      payload: { rollNo: 'TEST_ROLL_1', password: 'stud123' }
    });
    const sid1 = res1.cookies.find(c => c.name === 'sid')?.value;

    // Verify 1st session works on /auth/me
    const me1 = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { sid: sid1! }
    });
    expect(me1.statusCode).toBe(200);

    // 2nd login
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/auth/student/login',
      payload: { rollNo: 'TEST_ROLL_1', password: 'stud123' }
    });
    const sid2 = res2.cookies.find(c => c.name === 'sid')?.value;
    expect(sid2).not.toBe(sid1);

    // Now 1st session must be revoked (401)
    const meOld = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { sid: sid1! }
    });
    expect(meOld.statusCode).toBe(401);

    // 2nd session is valid
    const meNew = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { sid: sid2! }
    });
    expect(meNew.statusCode).toBe(200);
  });

  it('admin login succeeds and audit log is written', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/admin/login',
      payload: { username: 'testadmin', password: 'adminpass' }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.username).toBe('testadmin');

    const logs = await db.select().from(schema.auditLog).where(eq(schema.auditLog.actor, 'testadmin'));
    expect(logs.length).toBeGreaterThan(0);
  });
});
