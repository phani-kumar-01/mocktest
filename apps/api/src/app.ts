import fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import autoLoad from '@fastify/autoload';
import path from 'path';
import { fileURLToPath } from 'url';
import { errorHandler } from './lib/errors.js';
import { db, schema } from './db/client.js';
import { isStorageAvailable, STORAGE_BUCKET, listObjects } from './lib/storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function buildApp(): Promise<FastifyInstance> {
  const app = fastify({
    logger: process.env.NODE_ENV !== 'test'
  });

  // Global Error Handler
  app.setErrorHandler(errorHandler);

  // Plugins
  await app.register(cors, {
    origin: true,
    credentials: true
  });

  await app.register(cookie, {
    secret: process.env.SESSION_SECRET || 'nptel-mock-exam-secret-key-at-least-32-chars-long'
  });

  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024 // 10MB
    }
  });

  await app.register(rateLimit, {
    max: parseInt(process.env.RATE_LIMIT_LOGIN_PER_MIN || '600', 10),
    timeWindow: '1 minute'
  });

  // Health check with Neon service diagnostics
  app.get('/api/health', async () => {
    let dbStatus = 'connected';
    let adminCount = 0;
    try {
      const rows = await db.select().from(schema.admins).limit(5);
      adminCount = rows.length;
    } catch (e: any) {
      dbStatus = 'error: ' + (e.message || String(e));
    }

    let storageStatus = isStorageAvailable ? 'available' : 'not_configured';
    let storageObjectCount = 0;
    if (isStorageAvailable) {
      try {
        const objs = await listObjects();
        storageStatus = 'connected';
        storageObjectCount = objs.length;
      } catch (e: any) {
        storageStatus = 'error: ' + (e.message || String(e));
      }
    }

    return {
      status: 'ok',
      time: new Date().toISOString(),
      services: {
        postgres: {
          provider: 'Neon Postgres',
          status: dbStatus,
          verifiedRecords: adminCount
        },
        objectStorage: {
          provider: 'Neon Object Storage',
          bucket: STORAGE_BUCKET,
          status: storageStatus,
          objectCount: storageObjectCount
        }
      }
    };
  });

  // Autoload all modules
  await app.register(autoLoad, {
    dir: path.join(__dirname, 'modules'),
    ignoreFilter: (p) => p.includes('.test.') || p.includes('.spec.') || p.endsWith('.d.ts')
  });

  return app;
}
