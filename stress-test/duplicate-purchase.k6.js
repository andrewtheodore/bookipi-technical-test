import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

// Test: Same user tries to buy multiple times concurrently
// Verifies the one-item-per-user rule holds under race conditions

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const CONCURRENT_ATTEMPTS = parseInt(__ENV.VUS || '50');

const duplicateSuccess = new Counter('duplicate_success');
const duplicateRejected = new Counter('duplicate_rejected');

export const options = {
  scenarios: {
    duplicate_purchase: {
      executor: 'shared-iterations',
      vus: CONCURRENT_ATTEMPTS,
      iterations: CONCURRENT_ATTEMPTS,
      maxDuration: '30s',
    },
  },
};

export default function () {
  // All VUs use the SAME user ID to simulate double-click / retry spam
  const res = http.post(
    `${BASE_URL}/api/purchase`,
    JSON.stringify({ userId: 'duplicate-test-user' }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  const body = JSON.parse(res.body);

  if (res.status === 200 && body.success) {
    duplicateSuccess.add(1);
  } else {
    duplicateRejected.add(1);
  }

  check(res, {
    'status is 200 or 409': (r) => r.status === 200 || r.status === 409,
    'no server errors': (r) => r.status !== 500,
  });
}

export function handleSummary(data) {
  const successCount = data.metrics.duplicate_success
    ? data.metrics.duplicate_success.values.count
    : 0;
  const rejectedCount = data.metrics.duplicate_rejected
    ? data.metrics.duplicate_rejected.values.count
    : 0;

  const passed = successCount <= 1;

  const summary = `
=== Duplicate Purchase Test Results ===
Concurrent Attempts (same user): ${CONCURRENT_ATTEMPTS}
Successful Purchases:            ${successCount}
Rejected (already purchased):    ${rejectedCount}

Expected: at most 1 successful purchase
Result:   ${passed ? 'PASS - One-per-user enforced!' : 'FAIL - User purchased more than once!'}
==========================================
`;

  console.log(summary);
  return { stdout: summary };
}
