import { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(error: any, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: error.errors
      }
    });
  }

  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message
      }
    });
  }

  request.log.error(error);
  const statusCode = error.statusCode || 500;
  return reply.status(statusCode).send({
    error: {
      code: error.code || 'INTERNAL_SERVER_ERROR',
      message: error.message || 'An unexpected error occurred'
    }
  });
}
