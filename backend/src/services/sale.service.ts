import { pool } from '../db/client.js';
import { redis } from '../redis/client.js';
import { REDIS_KEYS } from '../redis/keys.js';

export type SaleStatus = 'upcoming' | 'active' | 'ended';

interface SaleInfo {
  status: SaleStatus;
  startsAt: string;
  endsAt: string;
  stockRemaining: number;
}

export function determineSaleStatus(
  now: Date,
  startTime: Date,
  endTime: Date,
  stock: number
): SaleStatus {
  if (now < startTime) return 'upcoming';
  if (now >= startTime && now <= endTime && stock > 0) return 'active';
  return 'ended';
}

export async function getSaleStatus(): Promise<SaleInfo> {
  const result = await pool.query(
    `SELECT sc.start_time, sc.end_time, p.stock
     FROM sale_config sc
     JOIN products p ON p.id = sc.product_id
     LIMIT 1`
  );

  if (result.rows.length === 0) {
    throw new Error('No sale configured');
  }

  const { start_time, end_time, stock } = result.rows[0];
  const now = new Date();
  const startTime = new Date(start_time);
  const endTime = new Date(end_time);

  const status = determineSaleStatus(now, startTime, endTime, stock);

  try {
    await redis.set(REDIS_KEYS.STOCK, stock.toString());
  } catch {
    // Redis is a cache layer; DB remains the source of truth.
  }

  return {
    status,
    startsAt: startTime.toISOString(),
    endsAt: endTime.toISOString(),
    stockRemaining: stock,
  };
}
