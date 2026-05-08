import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

// Test: Simulate realistic mixed traffic during a flash sale
// - 70% of users check sale status (polling)
// - 20% of users attempt purchase
// - 10% of users check their order status

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

const statusChecks = new Counter('mixed_status_checks');
const purchaseAttempts = new Counter('mixed_purchase_attempts');
const orderChecks = new Counter('mixed_order_checks');
const serverErrors = new Counter('mixed_server_errors');

export const options = {
  scenarios: {
    mixed_traffic: {
      executor: 'constant-vus',
      vus: 300,
      duration: '30s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    mixed_server_errors: ['count<10'],
  },
};

export default function () {
  const rand = Math.random();
  const userId = `mixed-user-${__VU}`;

  if (rand < 0.7) {
    // 70% — Check sale status
    const res = http.get(`${BASE_URL}/api/sale/status`);
    statusChecks.add(1);

    check(res, {
      'status check: 200': (r) => r.status === 200,
    });

    if (res.status >= 500) serverErrors.add(1);
  } else if (rand < 0.9) {
    // 20% — Attempt purchase
    const res = http.post(
      `${BASE_URL}/api/purchase`,
      JSON.stringify({ userId }),
      { headers: { 'Content-Type': 'application/json' } }
    );
    purchaseAttempts.add(1);

    check(res, {
      'purchase: valid response': (r) => r.status === 200 || r.status === 409,
    });

    if (res.status >= 500) serverErrors.add(1);
  } else {
    // 10% — Check order status
    const res = http.get(`${BASE_URL}/api/order/${userId}`);
    orderChecks.add(1);

    check(res, {
      'order check: 200': (r) => r.status === 200,
    });

    if (res.status >= 500) serverErrors.add(1);
  }

  sleep(0.05);
}

export function handleSummary(data) {
  const status = data.metrics.mixed_status_checks
    ? data.metrics.mixed_status_checks.values.count
    : 0;
  const purchases = data.metrics.mixed_purchase_attempts
    ? data.metrics.mixed_purchase_attempts.values.count
    : 0;
  const orders = data.metrics.mixed_order_checks
    ? data.metrics.mixed_order_checks.values.count
    : 0;
  const errors = data.metrics.mixed_server_errors
    ? data.metrics.mixed_server_errors.values.count
    : 0;

  const dur = data.metrics.http_req_duration ? data.metrics.http_req_duration.values : {};

  const summary = `
=== Mixed Traffic Stress Test Results ===
Duration:           30s
Virtual Users:      300

Request Breakdown:
  Sale status checks:  ${status} (~70%)
  Purchase attempts:   ${purchases} (~20%)
  Order checks:        ${orders} (~10%)
  Total requests:      ${status + purchases + orders}
  Server errors:       ${errors}

Response Times (all endpoints combined):
  p50: ${(dur['p(50)'] || dur.med || 0).toFixed(2)}ms
  p95: ${(dur['p(95)'] || 0).toFixed(2)}ms
  p99: ${(dur['p(99)'] || 0).toFixed(2)}ms
  max: ${(dur.max || 0).toFixed(2)}ms

Result: ${errors < 10 ? 'PASS - System handles mixed traffic well!' : 'FAIL - Too many server errors!'}
==========================================
`;

  console.log(summary);
  return { stdout: summary };
}
