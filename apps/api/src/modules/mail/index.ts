import { FastifyInstance, FastifyPluginAsync } from 'fastify';

const mailRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.all('/admin/mail*', async (request, reply) => {
    return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED', message: 'Mail module stub' } });
  });
};

export const autoPrefix = '/api';
export default mailRoutes;
