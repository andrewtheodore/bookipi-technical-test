import { FastifyInstance } from 'fastify';
import { getOrder } from '../services/purchase.service.js';

interface OrderParams {
  userId: string;
}

export async function orderRoutes(app: FastifyInstance) {
  app.get<{ Params: OrderParams }>('/api/order/:userId', async (request, reply) => {
    try {
      const { userId } = request.params;
      const result = await getOrder(userId);
      return reply.send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'Failed to check order' });
    }
  });
}
