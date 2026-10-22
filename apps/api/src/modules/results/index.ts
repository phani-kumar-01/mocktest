import { FastifyInstance, FastifyPluginAsync } from 'fastify';

const resultsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.all('/admin/exams/:id/results*', async (request, reply) => {
    return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED', message: 'Results module stub' } });
  });
};

export const autoPrefix = '/api';
export default resultsRoutes;
