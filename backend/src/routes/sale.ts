import { FastifyInstance } from 'fastify';
import { getSaleStatus } from '../services/sale.service.js';

export async function saleRoutes(app: FastifyInstance) {
  app.get('/api/sale/status', async (_request, reply) => {
    try {
      const status = await getSaleStatus();
      return reply.send(status);
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to get sale status' });
    }
  });
}
