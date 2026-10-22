import fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import autoLoad from '@fastify/autoload';
import path from 'path';
import { fileURLToPath } from 'url';
import { errorHandler } from './lib/errors.js';

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

  // Health check
  app.get('/api/health', async () => ({ status: 'ok', time: new Date().toISOString() }));

  // Autoload all modules
  await app.register(autoLoad, {
    dir: path.join(__dirname, 'modules'),
    ignoreFilter: (p) => p.includes('.test.') || p.includes('.spec.') || p.endsWith('.d.ts')
  });

  return app;
}
