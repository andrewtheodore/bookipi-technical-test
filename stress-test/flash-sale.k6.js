import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom metrics
const purchaseSuccess = new Counter('purchase_success');
const purchaseFailed = new Counter('purchase_failed');
const purchaseRate = new Rate('purchase_success_rate');
const purchaseDuration = new Trend('purchase_duration');

// Test configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const VIRTUAL_USERS = parseInt(__ENV.VUS || '500');
const PRODUCT_STOCK = parseInt(__ENV.STOCK || '100');

export const options = {
  scenarios: {
    flash_sale: {
      executor: 'shared-iterations',
      vus: VIRTUAL_USERS,
      iterations: VIRTUAL_USERS,
      maxDuration: '60s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests under 2s
    purchase_success_rate: [`rate>=${PRODUCT_STOCK / VIRTUAL_USERS - 0.1}`],
  },
};

export default function () {
  const userId = `stress-user-${__VU}-${__ITER}`;

  // Attempt purchase
  const startTime = Date.now();
  const res = http.post(
    `${BASE_URL}/api/purchase`,
    JSON.stringify({ userId }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  const duration = Date.now() - startTime;

  purchaseDuration.add(duration);

  const body = JSON.parse(res.body);

  if (res.status === 200 && body.success) {
    purchaseSuccess.add(1);
    purchaseRate.add(true);
  } else {
    purchaseFailed.add(1);
    purchaseRate.add(false);
  }

  check(res, {
    'status is 200 or 409': (r) => r.status === 200 || r.status === 409,
    'response has success field': () => body.success !== undefined,
    'response has message': () => body.message !== undefined,
  });
}

export function handleSummary(data) {
  const successCount = data.metrics.purchase_success
    ? data.metrics.purchase_success.values.count
    : 0;
  const failedCount = data.metrics.purchase_failed
    ? data.metrics.purchase_failed.values.count
    : 0;

  const dur = data.metrics.http_req_duration ? data.metrics.http_req_duration.values : {};
  const p50 = (dur['p(50)'] || dur.med || 0).toFixed(2);
  const p95 = (dur['p(95)'] || 0).toFixed(2);
  const p99 = (dur['p(99)'] || 0).toFixed(2);
  const max = (dur.max || 0).toFixed(2);

  const summary = `
=== Flash Sale Stress Test Results ===
Virtual Users:     ${VIRTUAL_USERS}
Product Stock:     ${PRODUCT_STOCK}
Successful Buys:   ${successCount}
Failed Attempts:   ${failedCount}
Total Requests:    ${successCount + failedCount}

Expected: exactly ${PRODUCT_STOCK} successful purchases
Result:   ${successCount === PRODUCT_STOCK ? 'PASS - No overselling!' : 'INVESTIGATE - Count mismatch'}

Response Times:
  p50: ${p50}ms
  p95: ${p95}ms
  p99: ${p99}ms
  max: ${max}ms
==========================================
`;

  console.log(summary);

  return {
    stdout: summary,
  };
}
