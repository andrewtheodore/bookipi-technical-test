import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { pool } from './db/client.js';
import { redis } from './redis/client.js';
import { migrate, seed, syncRedisFromDb } from './db/migrate.js';
import { saleRoutes } from './routes/sale.js';
import { purchaseRoutes } from './routes/purchase.js';
import { orderRoutes } from './routes/order.js';

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

// Register routes
await app.register(saleRoutes);
await app.register(purchaseRoutes);
await app.register(orderRoutes);

// Health check
app.get('/api/health', async () => ({ status: 'ok' }));

// Graceful shutdown: drain connections before exiting
async function shutdown(signal: string) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  try {
    // Stop accepting new requests
    await app.close();
    // Close database pool (waits for active queries to finish)
    await pool.end();
    // Disconnect Redis
    redis.disconnect();
    console.log('Shutdown complete.');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

async function start() {
  try {
    // Run migrations and seed
    await migrate();
    await seed();
    await syncRedisFromDb();

    await app.listen({ port: config.port, host: config.host });
    console.log(`Server running on http://localhost:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();

export { app };
