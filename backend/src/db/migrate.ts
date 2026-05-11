import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './client.js';
import { config } from '../config.js';
import { redis } from '../redis/client.js';
import { REDIS_KEYS } from '../redis/keys.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  await pool.query(schema);
}

export async function seed() {
  // Check if product already exists
  const existing = await pool.query('SELECT id FROM products LIMIT 1');
  if (existing.rows.length > 0) {
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const productResult = await client.query(
      'INSERT INTO products (name, stock) VALUES ($1, $2) RETURNING id',
      [config.sale.productName, config.sale.stock]
    );
    const productId = productResult.rows[0].id;

    await client.query(
      'INSERT INTO sale_config (product_id, start_time, end_time) VALUES ($1, $2, $3)',
      [productId, config.sale.startTime, config.sale.endTime]
    );

    await client.query('COMMIT');

    // Sync to Redis cache (best-effort, DB is source of truth)
    try {
      await redis.set(REDIS_KEYS.STOCK, config.sale.stock.toString());
      await redis.set(REDIS_KEYS.START_TIME, config.sale.startTime);
      await redis.set(REDIS_KEYS.END_TIME, config.sale.endTime);
      await redis.del(REDIS_KEYS.PURCHASED_USERS);
    } catch {
      console.warn('Redis unavailable during seed sync, continuing in DB-only mode');
    }

    console.log(
      `Seeded product "${config.sale.productName}" with ${config.sale.stock} stock`
    );
    console.log(
      `Sale window: ${config.sale.startTime} to ${config.sale.endTime}`
    );
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function syncRedisFromDb() {
  const stockResult = await pool.query(
    'SELECT stock FROM products LIMIT 1'
  );

  const saleResult = await pool.query(
    'SELECT start_time, end_time FROM sale_config LIMIT 1'
  );

  const orders = await pool.query('SELECT user_id FROM orders');

  try {
    if (stockResult.rows.length > 0) {
      await redis.set(REDIS_KEYS.STOCK, stockResult.rows[0].stock.toString());
    }

    if (saleResult.rows.length > 0) {
      await redis.set(REDIS_KEYS.START_TIME, new Date(saleResult.rows[0].start_time).toISOString());
      await redis.set(REDIS_KEYS.END_TIME, new Date(saleResult.rows[0].end_time).toISOString());
    }

    // Always clear purchased users set first to avoid stale entries.
    await redis.del(REDIS_KEYS.PURCHASED_USERS);
    if (orders.rows.length > 0) {
      const userIds = orders.rows.map((r: { user_id: string }) => r.user_id);
      await redis.sadd(REDIS_KEYS.PURCHASED_USERS, ...userIds);
    }
  } catch {
    console.warn('Redis unavailable during startup cache sync, continuing in DB-only mode');
  }
}
