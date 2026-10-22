import { describe, it, expect, beforeAll } from 'vitest';
import { buildApp } from '../../app.js';
import { db, schema } from '../../db/client.js';
import { migrate } from '../../db/migrate.js';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { FastifyInstance } from 'fastify';

describe('Question Bank & Excel Module (Agent D)', () => {
  let app: FastifyInstance;
  let adminSid: string;
  let testSubjectId: string;

  beforeAll(async () => {
    process.env.USE_PGLITE = 'true';
    await migrate();
    app = await buildApp();

    // Create admin & login
    const adminPass = await bcrypt.hash('adminpass', 8);
    await db.delete(schema.admins).where(eq(schema.admins.username, 'q_admin'));
    const [admin] = await db.insert(schema.admins).values({
      username: 'q_admin',
      name: 'Question Admin',
      passwordHash: adminPass
    }).returning();

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/admin/login',
      payload: { username: 'q_admin', password: 'adminpass' }
    });
    adminSid = loginRes.cookies.find(c => c.name === 'sid')!.value;
  });

  it('admin can create subject', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/subjects',
      cookies: { sid: adminSid },
      payload: { name: 'Python Programming Test' }
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.name).toBe('Python Programming Test');
    testSubjectId = body.id;
  });

  it('generates Excel template with proper headers and content-type', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/questions/template.xlsx',
      cookies: { sid: adminSid }
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
  });

  it('rejects unauthenticated request with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/subjects'
    });

    expect(res.statusCode).toBe(401);
  });
});
