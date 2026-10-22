import { FastifyInstance, FastifyPluginAsync } from 'fastify';

const authRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.all('/*', async (request, reply) => {
    return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED', message: 'Auth module stub' } });
  });
};

export const autoPrefix = '/api/auth';
export default authRoutes;
