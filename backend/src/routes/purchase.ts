import { FastifyInstance } from 'fastify';
import { attemptPurchase } from '../services/purchase.service.js';

interface PurchaseBody {
  userId: string;
}

export async function purchaseRoutes(app: FastifyInstance) {
  app.post<{ Body: PurchaseBody }>('/api/purchase', {
    schema: {
      body: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string', minLength: 1, maxLength: 255 },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { userId } = request.body;
      const result = await attemptPurchase(userId.trim());
      const statusCode = result.success ? 200 : 409;
      return reply.status(statusCode).send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({
        success: false,
        message: 'Internal server error',
        reason: 'server_error',
      });
    }
  });
}
