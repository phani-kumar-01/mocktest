import { FastifyInstance, FastifyPluginAsync } from 'fastify';

const studentExamRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.all('/*', async (request, reply) => {
    return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED', message: 'Student exam module stub' } });
  });
};

export const autoPrefix = '/api/student';
export default studentExamRoutes;
