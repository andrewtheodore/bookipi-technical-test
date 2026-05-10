import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { pool } from '../../src/db/client.js';
import { redis } from '../../src/redis/client.js';
import { saleRoutes } from '../../src/routes/sale.js';
import { purchaseRoutes } from '../../src/routes/purchase.js';
import { orderRoutes } from '../../src/routes/order.js';
import { REDIS_KEYS } from '../../src/redis/keys.js';

const app = Fastify();

beforeAll(async () => {
  await app.register(cors);
  await app.register(saleRoutes);
  await app.register(purchaseRoutes);
  await app.register(orderRoutes);
  await app.ready();

  // Create tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      stock INTEGER NOT NULL CHECK (stock >= 0)
    );
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      product_id INTEGER NOT NULL REFERENCES products(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, product_id)
    );
    CREATE TABLE IF NOT EXISTS sale_config (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id),
      start_time TIMESTAMPTZ NOT NULL,
      end_time TIMESTAMPTZ NOT NULL
    );
  `);
});

beforeEach(async () => {
  // Clean and re-seed
  await pool.query('DELETE FROM orders');
  await pool.query('DELETE FROM sale_config');
  await pool.query('DELETE FROM products');

  const result = await pool.query(
    "INSERT INTO products (name, stock) VALUES ('Test Product', 10) RETURNING id"
  );
  const productId = result.rows[0].id;

  // Sale active now for 1 hour
  const start = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const end = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  await pool.query(
    'INSERT INTO sale_config (product_id, start_time, end_time) VALUES ($1, $2, $3)',
    [productId, start, end]
  );

  // Sync Redis
  await redis.set(REDIS_KEYS.STOCK, '10');
  await redis.set(REDIS_KEYS.START_TIME, start);
  await redis.set(REDIS_KEYS.END_TIME, end);
  await redis.del(REDIS_KEYS.PURCHASED_USERS);
});

afterAll(async () => {
  await pool.query('DROP TABLE IF EXISTS orders CASCADE');
  await pool.query('DROP TABLE IF EXISTS sale_config CASCADE');
  await pool.query('DROP TABLE IF EXISTS products CASCADE');
  await pool.end();
  await redis.quit();
  await app.close();
});

describe('GET /api/sale/status', () => {
  it('returns active sale status', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/sale/status' });
    const body = JSON.parse(res.body);
    expect(res.statusCode).toBe(200);
    expect(body.status).toBe('active');
    expect(body.stockRemaining).toBe(10);
  });
});

describe('POST /api/purchase', () => {
  it('successfully purchases an item', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/purchase',
      payload: { userId: 'user1' },
    });
    const body = JSON.parse(res.body);
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.orderId).toBeDefined();
  });

  it('rejects duplicate purchase by same user', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/purchase',
      payload: { userId: 'user2' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/purchase',
      payload: { userId: 'user2' },
    });
    const body = JSON.parse(res.body);
    expect(res.statusCode).toBe(409);
    expect(body.success).toBe(false);
    expect(body.reason).toBe('already_purchased');
  });

  it('rejects purchase when stock is exhausted', async () => {
    // Set stock to 1
    await pool.query('UPDATE products SET stock = 1');
    await redis.set(REDIS_KEYS.STOCK, '1');

    // First purchase succeeds
    await app.inject({
      method: 'POST',
      url: '/api/purchase',
      payload: { userId: 'buyer1' },
    });

    // Second purchase fails (sold out)
    const res = await app.inject({
      method: 'POST',
      url: '/api/purchase',
      payload: { userId: 'buyer2' },
    });
    const body = JSON.parse(res.body);
    expect(res.statusCode).toBe(409);
    expect(body.success).toBe(false);
    expect(body.reason).toBe('sold_out');
  });

  it('rejects purchase when sale is not active', async () => {
    // Move sale to the future
    await pool.query(
      "UPDATE sale_config SET start_time = NOW() + INTERVAL '1 hour', end_time = NOW() + INTERVAL '2 hours'"
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/purchase',
      payload: { userId: 'user3' },
    });
    const body = JSON.parse(res.body);
    expect(res.statusCode).toBe(409);
    expect(body.success).toBe(false);
    expect(body.reason).toBe('sale_not_active');
  });

  it('rejects request with missing userId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/purchase',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/order/:userId', () => {
  it('returns order for user who purchased', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/purchase',
      payload: { userId: 'ordercheck1' },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/order/ordercheck1',
    });
    const body = JSON.parse(res.body);
    expect(body.hasPurchased).toBe(true);
    expect(body.order).toBeDefined();
    expect(body.order.id).toBeDefined();
  });

  it('returns no order for user who has not purchased', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/order/nonexistent',
    });
    const body = JSON.parse(res.body);
    expect(body.hasPurchased).toBe(false);
    expect(body.order).toBeNull();
  });
});
