import { FastifyInstance, FastifyPluginAsync } from 'fastify';

const adminExamsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.all('/admin/exams*', async (request, reply) => {
    return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED', message: 'Admin exams module stub' } });
  });
};

export const autoPrefix = '/api';
export default adminExamsRoutes;
