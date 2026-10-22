import { FastifyInstance, FastifyPluginAsync } from 'fastify';

const questionsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.all('/admin/questions*', async (request, reply) => {
    return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED', message: 'Questions module stub' } });
  });
};

export const autoPrefix = '/api';
export default questionsRoutes;
