import { pool } from '../db/client.js';
import { redis, redisAvailable } from '../redis/client.js';
import { REDIS_KEYS } from '../redis/keys.js';

export interface PurchaseResult {
  success: boolean;
  message: string;
  reason?: string;
  orderId?: number;
}

export async function attemptPurchase(userId: string): Promise<PurchaseResult> {
  // --- Redis pre-checks (fast path, no DB hit) ---
  if (redisAvailable) {
    try {
      // 1. Check if sale is active (cached time window)
      const [startStr, endStr] = await Promise.all([
        redis.get(REDIS_KEYS.START_TIME),
        redis.get(REDIS_KEYS.END_TIME),
      ]);

      if (startStr && endStr) {
        const now = new Date();
        if (now < new Date(startStr) || now > new Date(endStr)) {
          return { success: false, message: 'Sale is not currently active', reason: 'sale_not_active' };
        }
      }

      // 2. Check if user already purchased
      const alreadyPurchased = await redis.sismember(REDIS_KEYS.PURCHASED_USERS, userId);
      if (alreadyPurchased) {
        const existing = await pool.query(
          'SELECT id FROM orders WHERE user_id = $1 LIMIT 1',
          [userId]
        );
        return { success: false, message: 'You have already purchased this item', reason: 'already_purchased', orderId: existing.rows[0]?.id };
      }

      // 3. Check stock
      const cachedStock = await redis.get(REDIS_KEYS.STOCK);
      if (cachedStock !== null && parseInt(cachedStock) <= 0) {
        return { success: false, message: 'Sorry, this item is sold out', reason: 'sold_out' };
      }
    } catch {
      // Redis failed — fall through to Postgres (source of truth)
    }
  }

  // --- DB fallback for sale time check (if Redis missed it) ---
  const saleConfig = await pool.query(
    `SELECT start_time, end_time FROM sale_config LIMIT 1`
  );
  if (saleConfig.rows.length === 0) {
    return { success: false, message: 'No sale configured', reason: 'sale_not_active' };
  }

  const now = new Date();
  const startTime = new Date(saleConfig.rows[0].start_time);
  const endTime = new Date(saleConfig.rows[0].end_time);

  if (now < startTime || now > endTime) {
    return { success: false, message: 'Sale is not currently active', reason: 'sale_not_active' };
  }

  // --- Postgres transaction (source of truth) ---
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Row-level lock on product stock
    const stockResult = await client.query(
      'SELECT id, stock FROM products LIMIT 1 FOR UPDATE'
    );

    if (stockResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Product not found', reason: 'sold_out' };
    }

    const product = stockResult.rows[0];

    if (product.stock <= 0) {
      await client.query('ROLLBACK');
      try { await redis.set(REDIS_KEYS.STOCK, '0'); } catch { /* Redis down */ }
      return { success: false, message: 'Sorry, this item is sold out', reason: 'sold_out' };
    }

    // Check for existing order (DB-level safety net)
    const existingOrder = await client.query(
      'SELECT id FROM orders WHERE user_id = $1 AND product_id = $2',
      [userId, product.id]
    );

    if (existingOrder.rows.length > 0) {
      await client.query('ROLLBACK');
      try { await redis.sadd(REDIS_KEYS.PURCHASED_USERS, userId); } catch { /* Redis down */ }
      return { success: false, message: 'You have already purchased this item', reason: 'already_purchased', orderId: existingOrder.rows[0].id };
    }

    // Insert order
    const orderResult = await client.query(
      'INSERT INTO orders (user_id, product_id) VALUES ($1, $2) RETURNING id',
      [userId, product.id]
    );

    // Decrement stock
    await client.query(
      'UPDATE products SET stock = stock - 1 WHERE id = $1',
      [product.id]
    );

    await client.query('COMMIT');

    // Update Redis cache (best-effort, DB is source of truth)
    try {
      await redis.sadd(REDIS_KEYS.PURCHASED_USERS, userId);
      await redis.decr(REDIS_KEYS.STOCK);
    } catch { /* Redis down, will resync on reconnect */ }

    return {
      success: true,
      message: 'Purchase successful!',
      orderId: orderResult.rows[0].id,
    };
  } catch (err: unknown) {
    await client.query('ROLLBACK');

    // Handle unique constraint violation (race condition safety net)
    const pgCode = (err as { code?: string }).code;
    if (pgCode === '23505') {
      try { await redis.sadd(REDIS_KEYS.PURCHASED_USERS, userId); } catch { /* Redis down */ }
      const existing = await pool.query(
        'SELECT id FROM orders WHERE user_id = $1 LIMIT 1',
        [userId]
      );
      return { success: false, message: 'You have already purchased this item', reason: 'already_purchased', orderId: existing.rows[0]?.id };
    }

    throw err;
  } finally {
    client.release();
  }
}

export async function getOrder(userId: string) {
  const result = await pool.query(
    `SELECT o.id, o.product_id, o.created_at, p.name as product_name
     FROM orders o
     JOIN products p ON p.id = o.product_id
     WHERE o.user_id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    return { hasPurchased: false, order: null };
  }

  const order = result.rows[0];
  return {
    hasPurchased: true,
    order: {
      id: order.id,
      productId: order.product_id,
      productName: order.product_name,
      createdAt: new Date(order.created_at).toISOString(),
    },
  };
}
